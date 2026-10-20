//! File helpers that are impractical in the webview: hashing large files
//! without sending their bytes over IPC, reading image headers, and the
//! Windows recycle bin. No business logic lives here.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    path: String,
    hash: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    error: Option<String>,
}

fn hash_file(path: &str) -> std::io::Result<String> {
    let mut reader = BufReader::with_capacity(1 << 16, File::open(path)?);
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 16];
    loop {
        let n = reader.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

fn inspect(path: String) -> FileInfo {
    match hash_file(&path) {
        Ok(hash) => {
            let size = imagesize::size(&path).ok();
            FileInfo {
                hash: Some(hash),
                width: size.map(|s| s.width as u32),
                height: size.map(|s| s.height as u32),
                error: None,
                path,
            }
        }
        Err(e) => FileInfo {
            hash: None,
            width: None,
            height: None,
            error: Some(e.to_string()),
            path,
        },
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedFile {
    rel_path: String,
    size: u64,
    /// Milliseconds since the Unix epoch.
    mtime: u64,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LibraryScan {
    files: Vec<ScannedFile>,
    /// Relative paths of folders up to two levels deep (systems and groups), including empty ones.
    folders: Vec<String>,
    /// Folders that could not be read.
    errors: Vec<String>,
}

fn is_service(name: &str) -> bool {
    name.starts_with('_') || name.starts_with('.')
}

fn walk(dir: &Path, rel: &str, depth: usize, extensions: &[String], out: &mut LibraryScan) {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) => {
            out.errors.push(format!("{}: {e}", dir.display()));
            return;
        }
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        // file_type() does not follow symlinks, so link loops are never entered.
        let Ok(file_type) = entry.file_type() else { continue };
        let child_rel = if rel.is_empty() { name.clone() } else { format!("{rel}/{name}") };
        if file_type.is_dir() {
            if is_service(&name) {
                continue;
            }
            if depth < 2 {
                out.folders.push(child_rel.clone());
            }
            walk(&entry.path(), &child_rel, depth + 1, extensions, out);
        } else if file_type.is_file() {
            let ext = Path::new(&name)
                .extension()
                .map(|e| format!(".{}", e.to_string_lossy().to_lowercase()));
            if !ext.is_some_and(|e| extensions.contains(&e)) {
                continue;
            }
            let Ok(meta) = entry.metadata() else { continue };
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map_or(0, |d| d.as_millis() as u64);
            out.files.push(ScannedFile { rel_path: child_rel, size: meta.len(), mtime });
        }
    }
}

/// Lists image files (by lowercase extension, e.g. ".png") under the library root,
/// skipping service folders that start with "_" or ".".
#[tauri::command]
pub async fn scan_library(root: String, extensions: Vec<String>) -> Result<LibraryScan, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = PathBuf::from(root);
        if !root.is_dir() {
            return Err(format!("{} is not a folder", root.display()));
        }
        let mut out = LibraryScan::default();
        walk(&root, "", 0, &extensions, &mut out);
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// SHA-256 and pixel size for each file. Per-file failures are reported, not thrown.
#[tauri::command]
pub async fn inspect_files(paths: Vec<String>) -> Result<Vec<FileInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || paths.into_iter().map(inspect).collect())
        .await
        .map_err(|e| e.to_string())
}

/// Moves files or folders to the recycle bin.
#[tauri::command]
pub async fn move_to_trash(paths: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || trash::delete_all(&paths))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

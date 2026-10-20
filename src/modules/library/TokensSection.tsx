import { useState } from "react";
import { Copy, FolderOpen, Pencil, Plus, Trash } from "lucide-react";
import { copyPngToClipboard, revealInExplorer } from "../../shared/fs";
import { ru } from "../../shared/i18n/ru";
import { Button, ConfirmDialog, Modal } from "../../shared/ui";
import { artName, toAbsolute } from "./domain/paths";
import { tokenPixelSize } from "./domain/tokenCrop";
import type { Art, Token } from "./domain/types";
import { useArtTokens, useLibraryStore } from "./store";
import { TokenEditor } from "./TokenEditor";
import { tokenUrl } from "./tokenUrl";
import { deleteToken } from "./tokenService";

function tokenFileName(token: Token): string {
  return token.relPath.slice(token.relPath.lastIndexOf("/") + 1);
}

export function TokenImage({ root, token }: { root: string; token: Token }) {
  const url = tokenUrl(root, token);
  const [failed, setFailed] = useState<string | null>(null);
  if (failed === url) return <span className="warning">{ru.library.token.fileMissing}</span>;
  return <img src={url} alt="" draggable={false} onError={() => setFailed(url)} />;
}

/** Token list in the art panel (spec §2.5). */
export function TokensSection({ root, art }: { root: string; art: Art }) {
  const tokens = useArtTokens(art.id);
  const putTokens = useLibraryStore((s) => s.putTokens);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = tokens.find((t) => t.id === openId) ?? null;

  return (
    <section className="tokens-section">
      <div className="tokens-heading">
        <h3 className="subheading">{ru.library.token.section}</h3>
        {!art.missing && (
          <Button size="sm" icon={Plus} onClick={() => setCreating(true)}>
            {ru.library.token.create}
          </Button>
        )}
      </div>
      {tokens.length === 0 ? (
        <p className="muted">{ru.library.token.none}</p>
      ) : (
        <div className="token-list">
          {tokens.map((token) => (
            <div key={token.id} className="token-thumb-wrap">
              <button
                type="button"
                className="token-thumb"
                title={ru.library.token.open(tokenFileName(token))}
                onClick={() => setOpenId(token.id)}
              >
                <TokenImage root={root} token={token} />
              </button>
              {token.cells > 1 && (
                <span className="token-cells">{ru.library.token.cellsBadge(token.cells)}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {creating && (
        <TokenEditor
          root={root}
          art={art}
          title={ru.library.token.createTitle}
          onSaved={(t) => {
            putTokens([t]);
            setOpenId(t.id);
          }}
          onClose={() => setCreating(false)}
        />
      )}
      {open && <TokenCard root={root} art={art} token={open} onClose={() => setOpenId(null)} />}
    </section>
  );
}

type CardDialog = "edit" | "delete" | null;

function TokenCard({
  root,
  art,
  token,
  onClose,
}: {
  root: string;
  art: Art;
  token: Token;
  onClose: () => void;
}) {
  const putTokens = useLibraryStore((s) => s.putTokens);
  const removeToken = useLibraryStore((s) => s.removeToken);
  const revealArt = useLibraryStore((s) => s.revealArt);
  const [dialog, setDialog] = useState<CardDialog>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const path = toAbsolute(root, token.relPath);
  const name = tokenFileName(token);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (e) {
      setError(String(e));
    }
  }

  if (dialog === "edit") {
    return (
      <TokenEditor
        root={root}
        art={art}
        token={token}
        title={ru.library.token.editTitle(name)}
        onSaved={(t) => putTokens([t])}
        onClose={() => setDialog(null)}
      />
    );
  }

  if (dialog === "delete") {
    return (
      <ConfirmDialog
        title={ru.library.token.deleteTitle}
        text={ru.library.token.deleteText(name)}
        confirmLabel={ru.library.token.delete}
        danger
        onConfirm={async () => {
          await deleteToken(root, token);
          removeToken(token.id);
        }}
        onClose={() => setDialog(null)}
      />
    );
  }

  return (
    <Modal title={name} onClose={onClose}>
      <div className="token-card">
        <div className="token-card-image">
          <TokenImage root={root} token={token} />
        </div>
        <dl className="art-info">
          <dt>{ru.library.token.sourceArt}</dt>
          <dd>
            <button
              type="button"
              className="link"
              onClick={() => {
                revealArt(art.id);
                onClose();
              }}
            >
              {artName(art)}
            </button>
          </dd>
          <dt>{ru.library.token.file}</dt>
          <dd>{token.relPath}</dd>
          <dt>{ru.library.token.creature}</dt>
          <dd>{ru.library.token.creatureOption(token.cells)}</dd>
          <dt>{ru.library.token.size}</dt>
          <dd>{ru.library.token.sizeOption(tokenPixelSize(token.size, token.cells))}</dd>
          <dt>{ru.library.token.frame}</dt>
          <dd>
            {token.frame.width > 0 ? (
              <span className="token-frame-info">
                <span className="frame-swatch" style={{ background: token.frame.color }} />
                {ru.library.token.frameWidthValue(token.frame.width)}
              </span>
            ) : (
              ru.library.token.frameNone
            )}
          </dd>
        </dl>
        {notice && <p className="muted">{notice}</p>}
        {error && <p className="error">{error}</p>}
        <div className="art-actions">
          {!art.missing && (
            <Button icon={Pencil} onClick={() => setDialog("edit")}>
              {ru.library.token.edit}
            </Button>
          )}
          <Button
            icon={Copy}
            onClick={() =>
              void run(async () => {
                await copyPngToClipboard(path);
                setNotice(ru.library.token.copied);
              })
            }
          >
            {ru.library.token.copy}
          </Button>
          <Button icon={FolderOpen} onClick={() => void run(() => revealInExplorer(path))}>
            {ru.library.token.reveal}
          </Button>
          <Button variant="danger" icon={Trash} onClick={() => setDialog("delete")}>
            {ru.library.token.delete}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

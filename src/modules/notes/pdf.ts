// pdf.js is loaded only when a PDF note is opened; its worker ships with the build (no network).
import type { PDFDocumentProxy } from "pdfjs-dist";
import { fileUrl } from "../../shared/fs";

type PdfJs = typeof import("pdfjs-dist");

let pdfjs: Promise<PdfJs> | null = null;

export function loadPdfJs(): Promise<PdfJs> {
  pdfjs ??= Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  });
  return pdfjs;
}

export async function openPdf(path: string): Promise<PDFDocumentProxy> {
  const lib = await loadPdfJs();
  const response = await fetch(fileUrl(path), { cache: "no-store" });
  if (!response.ok) throw new Error(`Cannot read ${path}: ${response.status}`);
  const data = new Uint8Array(await response.arrayBuffer());
  return lib.getDocument({ data }).promise;
}

/** Text for searching inside a PDF: lowercase, ё→е, whitespace collapsed. */
export function normalizePdfText(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
}

/** Normalized text of every page, read once per document. */
export async function pageTexts(doc: PDFDocumentProxy): Promise<string[]> {
  const texts: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    texts.push(
      normalizePdfText(content.items.map((item) => ("str" in item ? item.str : "")).join(" ")),
    );
  }
  return texts;
}

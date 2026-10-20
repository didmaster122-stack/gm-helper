import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { PDFDocumentProxy, RenderTask, TextLayer } from "pdfjs-dist";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  FileX,
  MoveHorizontal,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { pathExists } from "../../shared/fs";
import { ru } from "../../shared/i18n/ru";
import { EmptyState, IconButton, SearchInput } from "../../shared/ui";
import { loadPdfJs, normalizePdfText, openPdf, pageTexts } from "./pdf";

interface PdfViewerProps {
  /** Absolute path of the PDF file. */
  path: string;
}

type Load =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error" }
  | { kind: "ready"; doc: PDFDocumentProxy };

/** "fit" follows the width of the panel; a number is a fixed scale. */
type Zoom = "fit" | number;

const ZOOM_STEP = 1.25;
const MIN_SCALE = 0.25;
const MAX_SCALE = 5;
const PAGE_PADDING = 48;

/**
 * One page at a time with page switching, zoom and search in the document's text.
 * Mount it once per file (keyed by the note), so the state starts fresh.
 */
export function PdfViewer({ path }: PdfViewerProps) {
  const t = ru.notes.pdf;
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [page, setPage] = useState(1);
  /** What is typed in the page field while it has focus. */
  const [pageDraft, setPageDraft] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [scale, setScale] = useState(1);
  const [width, setWidth] = useState(0);
  const [query, setQuery] = useState("");
  const [texts, setTexts] = useState<string[] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let opened: PDFDocumentProxy | null = null;
    void (async () => {
      try {
        if (!(await pathExists(path))) {
          if (!cancelled) setLoad({ kind: "missing" });
          return;
        }
        opened = await openPdf(path);
        if (cancelled) void opened.loadingTask.destroy();
        else setLoad({ kind: "ready", doc: opened });
      } catch (e) {
        console.error(e);
        if (!cancelled) setLoad({ kind: "error" });
      }
    })();
    return () => {
      cancelled = true;
      void opened?.loadingTask.destroy();
    };
  }, [path]);

  const doc = load.kind === "ready" ? load.doc : null;
  const pageCount = doc?.numPages ?? 0;

  // Width of the panel, for "fit to width".
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, [doc]);

  const needle = normalizePdfText(query).trim();

  // The text of all pages is read on the first search.
  useEffect(() => {
    if (!doc || needle === "" || texts) return;
    let cancelled = false;
    void pageTexts(doc)
      .then((all) => {
        if (!cancelled) setTexts(all);
      })
      .catch((e: unknown) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, [doc, needle, texts]);

  const hits = useMemo(
    () =>
      needle === "" || !texts
        ? []
        : texts.flatMap((text, i) => (text.includes(needle) ? [i + 1] : [])),
    [texts, needle],
  );

  // A new search result moves to the next page with a match; paging afterwards does not.
  const [seenHits, setSeenHits] = useState(hits);
  if (seenHits !== hits) {
    setSeenHits(hits);
    if (hits.length > 0 && !hits.includes(page)) {
      setPage(hits.find((p) => p >= page) ?? hits[0] ?? page);
    }
  }

  // Render the page and its (invisible, selectable) text layer.
  useEffect(() => {
    if (!doc || width === 0) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    let textLayer: TextLayer | null = null;
    void (async () => {
      try {
        const lib = await loadPdfJs();
        const pdfPage = await doc.getPage(page);
        if (cancelled) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const effective =
          zoom === "fit"
            ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, (width - PAGE_PADDING) / base.width))
            : zoom;
        setScale(effective);
        const viewport = pdfPage.getViewport({ scale: effective });
        const canvas = canvasRef.current;
        const wrapper = pageRef.current;
        const textBox = textRef.current;
        if (!canvas || !wrapper || !textBox) return;
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        wrapper.style.width = `${Math.floor(viewport.width)}px`;
        wrapper.style.height = `${Math.floor(viewport.height)}px`;
        wrapper.style.setProperty("--total-scale-factor", String(effective));
        task = pdfPage.render({
          canvas,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        });
        await task.promise;
        if (cancelled) return;
        textBox.replaceChildren();
        textLayer = new lib.TextLayer({
          textContentSource: pdfPage.streamTextContent(),
          container: textBox,
          viewport,
        });
        await textLayer.render();
        if (cancelled) return;
        if (needle !== "") {
          for (const span of textBox.querySelectorAll("span")) {
            if (normalizePdfText(span.textContent ?? "").includes(needle)) {
              span.classList.add("pdf-hit");
            }
          }
        }
      } catch (e) {
        if (!cancelled && !(e instanceof Error && e.name === "RenderingCancelledException")) {
          console.error(e);
        }
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
      textLayer?.cancel();
    };
  }, [doc, page, zoom, width, needle]);

  if (load.kind === "loading") {
    return (
      <div className="center">
        <div className="spinner" role="status" aria-label={ru.common.loading} />
      </div>
    );
  }
  if (load.kind === "missing") {
    return <EmptyState icon={FileX} tone="error" title={t.missing} />;
  }
  if (load.kind === "error") {
    return <EmptyState icon={CircleAlert} tone="error" title={t.failed} />;
  }

  const go = (n: number) => {
    setPage(Math.min(pageCount, Math.max(1, n)));
    scrollRef.current?.scrollTo({ top: 0 });
  };
  const zoomBy = (factor: number) =>
    setZoom(Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(scale * factor * 100) / 100)));
  const hitIndex = hits.indexOf(page);
  const nextHit = (step: 1 | -1) => {
    if (hits.length === 0) return;
    const after =
      step === 1
        ? (hits.find((p) => p > page) ?? hits[0])
        : ([...hits].reverse().find((p) => p < page) ?? hits.at(-1));
    if (after !== undefined) go(after);
  };

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === "PageDown" || e.key === "ArrowRight") {
      e.preventDefault();
      go(page + 1);
    } else if (e.key === "PageUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      go(page - 1);
    }
  }

  return (
    <div className="pdf-viewer" onKeyDown={onKeyDown}>
      <div className="toolbar pdf-toolbar">
        <div className="toolbar-group">
          <IconButton
            icon={ChevronLeft}
            label={t.prev}
            shortcut="PageUp"
            disabled={page <= 1}
            onClick={() => go(page - 1)}
          />
          <input
            className="pdf-page-input"
            aria-label={t.pageLabel}
            inputMode="numeric"
            value={pageDraft ?? String(page)}
            onFocus={(e) => {
              setPageDraft(String(page));
              e.target.select();
            }}
            onChange={(e) => setPageDraft(e.target.value)}
            onBlur={() => setPageDraft(null)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const n = Number.parseInt(pageDraft ?? "", 10);
              if (Number.isFinite(n)) go(n);
              e.currentTarget.blur();
            }}
          />
          <span className="muted">{t.pageOf(pageCount)}</span>
          <IconButton
            icon={ChevronRight}
            label={t.next}
            shortcut="PageDown"
            disabled={page >= pageCount}
            onClick={() => go(page + 1)}
          />
        </div>
        <span className="toolbar-sep" />
        <div className="toolbar-group">
          <IconButton icon={ZoomOut} label={t.zoomOut} onClick={() => zoomBy(1 / ZOOM_STEP)} />
          <span className="zoom-value muted">{Math.round(scale * 100)}%</span>
          <IconButton icon={ZoomIn} label={t.zoomIn} onClick={() => zoomBy(ZOOM_STEP)} />
          <IconButton
            icon={MoveHorizontal}
            label={t.fitWidth}
            active={zoom === "fit"}
            onClick={() => setZoom("fit")}
          />
        </div>
        <span className="spacer" />
        <SearchInput
          placeholder={t.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") nextHit(e.shiftKey ? -1 : 1);
          }}
        />
        {needle !== "" && (
          <>
            <span className="muted pdf-hits">
              {!texts
                ? t.searching
                : hits.length === 0
                  ? t.noMatches
                  : t.matches(hitIndex >= 0 ? page : (hits[0] ?? page), hits.length)}
            </span>
            <IconButton
              icon={ChevronUp}
              label={t.prevMatch}
              shortcut="Shift+Enter"
              disabled={hits.length === 0}
              onClick={() => nextHit(-1)}
            />
            <IconButton
              icon={ChevronDown}
              label={t.nextMatch}
              shortcut="Enter"
              disabled={hits.length === 0}
              onClick={() => nextHit(1)}
            />
          </>
        )}
      </div>
      <div className="pdf-scroll" ref={scrollRef} tabIndex={0}>
        <div className="pdf-page" ref={pageRef}>
          <canvas ref={canvasRef} />
          <div className="textLayer" ref={textRef} />
        </div>
      </div>
    </div>
  );
}

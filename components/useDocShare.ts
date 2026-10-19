"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LocalVideoTrack, Track, type LocalParticipant, type Room } from "livekit-client";
import { clearAnnotations } from "@/components/AnnotationCanvas";

/**
 * "Document share" — for phones/tablets (whose browsers cannot share the screen) and as an
 * extra option on desktop. The teacher picks a PDF, some photos, or a blank board; the page is
 * painted onto a hidden <canvas> and that canvas is published as the room's SCREEN-SHARE track.
 * To the students (and to the pen / highlighter / spotlight tools) it behaves exactly like a
 * normal screen share, and the teacher turns pages with ◀ ▶.
 */

type PageSource = {
  total: number;
  render: (index: number, canvas: HTMLCanvasElement) => Promise<void>;
  destroy: () => void;
};

const LONG_EDGE = 1600;

function paintWhite(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return ctx;
}

async function pdfSource(file: File): Promise<PageSource> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  return {
    total: pdf.numPages,
    async render(i, canvas) {
      const page = await pdf.getPage(i + 1);
      const base = page.getViewport({ scale: 1 });
      const scale = LONG_EDGE / Math.max(base.width, base.height);
      const vp = page.getViewport({ scale });
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = paintWhite(canvas);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
    },
    destroy() {
      void pdf.destroy();
    },
  };
}

function imageSource(files: File[]): PageSource {
  return {
    total: files.length,
    async render(i, canvas) {
      const bmp = await createImageBitmap(files[i]);
      const scale = LONG_EDGE / Math.max(bmp.width, bmp.height);
      canvas.width = Math.max(1, Math.round(bmp.width * scale));
      canvas.height = Math.max(1, Math.round(bmp.height * scale));
      const ctx = paintWhite(canvas);
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      bmp.close();
    },
    destroy() {},
  };
}

function boardSource(): PageSource {
  return {
    total: 1,
    async render(_i, canvas) {
      canvas.width = 1280;
      canvas.height = 720;
      paintWhite(canvas);
    },
    destroy() {},
  };
}

export type DocShareInfo = { kind: "pdf" | "images" | "board"; name: string; total: number; page: number };

export function useDocShare(localParticipant: LocalParticipant, room: Room) {
  const [info, setInfo] = useState<DocShareInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const live = useRef<{
    /** the finished page (only ever replaced as a whole, so students never see half-drawn pages) */
    page: HTMLCanvasElement;
    track: LocalVideoTrack;
    src: PageSource;
    timer: number;
    seq: number;
  } | null>(null);

  /** stop timers / free memory (does not touch the published track) */
  const release = useCallback(() => {
    const l = live.current;
    if (!l) return;
    live.current = null;
    window.clearInterval(l.timer);
    l.src.destroy();
  }, []);

  const stop = useCallback(async () => {
    const l = live.current;
    release();
    setInfo(null);
    if (l) {
      try {
        await localParticipant.unpublishTrack(l.track, true);
      } catch {
        /* already gone */
      }
    }
  }, [localParticipant, release]);

  const begin = useCallback(
    async (src: PageSource, kind: DocShareInfo["kind"], name: string) => {
      setBusy(true);
      try {
        await stop();
        const page = document.createElement("canvas");
        await src.render(0, page);
        // the published canvas is repainted from `page` several times a second: browsers only
        // send frames for canvases that keep changing, and late joiners need a steady picture
        const out = document.createElement("canvas");
        out.width = page.width;
        out.height = page.height;
        const octx = out.getContext("2d")!;
        const paint = () => {
          const l = live.current;
          const from = l ? l.page : page;
          if (out.width !== from.width || out.height !== from.height) {
            out.width = from.width;
            out.height = from.height;
          }
          octx.drawImage(from, 0, 0);
        };
        paint();
        const stream = out.captureStream(5);
        const mst = stream.getVideoTracks()[0];
        mst.contentHint = "detail";
        const track = new LocalVideoTrack(mst, undefined, false);
        await localParticipant.publishTrack(track, {
          source: Track.Source.ScreenShare,
          name: "screen_share",
          simulcast: false,
          videoEncoding: { maxBitrate: 2_500_000, maxFramerate: 5 },
          degradationPreference: "maintain-resolution",
        });
        const timer = window.setInterval(paint, 200);
        live.current = { page, track, src, timer, seq: 0 };
        setInfo({ kind, name, total: src.total, page: 0 });
        clearAnnotations(room);
      } finally {
        setBusy(false);
      }
    },
    [localParticipant, room, stop]
  );

  const startFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
      if (isPdf(files[0])) await begin(await pdfSource(files[0]), "pdf", files[0].name);
      else {
        const imgs = files.filter((f) => f.type.startsWith("image/"));
        if (!imgs.length) throw new Error("PDF বা ছবি বেছে নিন");
        await begin(imageSource(imgs), "images", `${imgs.length}টি ছবি`);
      }
    },
    [begin]
  );

  const startBoard = useCallback(() => begin(boardSource(), "board", "সাদা বোর্ড"), [begin]);

  const goto = useCallback(
    async (page: number) => {
      const l = live.current;
      if (!l) return;
      const p = Math.min(l.src.total - 1, Math.max(0, page));
      const seq = ++l.seq;
      setInfo((cur) => (cur ? { ...cur, page: p } : cur));
      clearAnnotations(room);
      const scratch = document.createElement("canvas");
      await l.src.render(p, scratch);
      if (seq !== l.seq || live.current !== l) return; // a newer page was requested meanwhile
      l.page.width = scratch.width;
      l.page.height = scratch.height;
      l.page.getContext("2d")!.drawImage(scratch, 0, 0);
    },
    [room]
  );

  useEffect(() => release, [release]);

  return { info, busy, startFiles, startBoard, goto, stop, release };
}

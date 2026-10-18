"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VideoTrack, useIsMuted, type TrackReference } from "@livekit/components-react";
import { LockIcon } from "@/components/icons";
import AnnotationCanvas, { type ContentRect } from "@/components/AnnotationCanvas";

/**
 * Renders the shared-screen track full-size (object-fit: contain) inside a
 * wrapper, and keeps track of exactly where the video's real pixel content
 * sits inside that wrapper (accounting for letterboxing when the shared
 * screen's aspect ratio doesn't match the wrapper's). That "content rect" is
 * what the annotation canvas is aligned to, so drawings stay pinned to the
 * document instead of drifting on different screen sizes.
 */
export default function ScreenShareStage({
  trackRef,
  isHost,
  isLocalShare,
  annotateMode,
  onAnnotateModeChange,
  onStopShare,
  presenterName,
  locked,
  onToggleLock,
  captureController,
}: {
  captureController?: unknown;
  locked: boolean;
  onToggleLock: () => void;
  trackRef: TrackReference;
  isHost: boolean;
  isLocalShare: boolean;
  annotateMode: boolean;
  onAnnotateModeChange: (v: boolean) => void;
  onStopShare: () => void;
  presenterName: string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const [resizeSignal, setResizeSignal] = useState(0);
  const paused = useIsMuted(trackRef);

  // Viewer-side zoom & pan of the shared screen (does not affect other people).
  // The video lives in `innerRef`, which is scaled/translated; the annotation
  // canvas stays outside it and follows the video's real on-screen box.
  const innerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ d: number; s: number; mx: number; my: number; x: number; y: number } | null>(null);
  const lastTap = useRef(0);

  const bump = useCallback(() => setResizeSignal((v) => v + 1), []);

  const clampView = useCallback((v: { s: number; x: number; y: number }) => {
    const w = wrapperRef.current;
    const W = w?.clientWidth ?? 0;
    const H = w?.clientHeight ?? 0;
    const sc = Math.min(5, Math.max(1, v.s));
    return {
      s: sc,
      x: Math.min(0, Math.max(W * (1 - sc), v.x)),
      y: Math.min(0, Math.max(H * (1 - sc), v.y)),
    };
  }, []);

  const applyView = useCallback(
    (v: { s: number; x: number; y: number }) => {
      setView(clampView(v));
      requestAnimationFrame(bump);
    },
    [clampView, bump]
  );

  /** Zoom to scale `ns`, keeping the point (mx,my) (wrapper coords) still. */
  const zoomAt = useCallback(
    (ns: number, mx: number, my: number, from = view) => {
      const sc = Math.min(5, Math.max(1, ns));
      const k = sc / from.s;
      applyView({ s: sc, x: mx - (mx - from.x) * k, y: my - (my - from.y) * k });
    },
    [view, applyView]
  );

  const getContentRect = useCallback((): ContentRect | null => {
    const wrapper = innerRef.current;
    const video = videoElRef.current;
    if (!wrapper || !video || !video.videoWidth || !video.videoHeight) return null;

    // The canvas is positioned relative to the wrapper (position:absolute), so
    // the rect is wrapper-relative for layout but viewport-based for pointer maths.
    const wrapperRect = wrapper.getBoundingClientRect();
    const videoAspect = video.videoWidth / video.videoHeight;
    const wrapperAspect = wrapperRect.width / wrapperRect.height;

    let width: number;
    let height: number;
    if (videoAspect > wrapperAspect) {
      width = wrapperRect.width;
      height = width / videoAspect;
    } else {
      height = wrapperRect.height;
      width = height * videoAspect;
    }
    const left = wrapperRect.left + (wrapperRect.width - width) / 2;
    const top = wrapperRect.top + (wrapperRect.height - height) / 2;

    return { left, top, width, height };
  }, []);

  // The presenter resizing the shared window changes the video's aspect ratio —
  // the browser fires "resize" on the <video>; re-measure so drawings stay aligned.
  useEffect(() => {
    const v = videoElRef.current;
    if (!v) return;
    v.addEventListener("resize", bump);
    return () => v.removeEventListener("resize", bump);
  }, [bump]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    let raf = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => bump());
    });
    observer.observe(wrapper);
    if (videoElRef.current) observer.observe(videoElRef.current);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [bump]);

  // Sharing the ENTIRE screen from the same browser shows the class page inside
  // itself (a mirror tunnel) — the lagging copies are what looked like a wrong
  // pointer/spotlight position. In that case show a clear status card instead.
  const surface = isLocalShare
    ? (trackRef.publication?.track?.mediaStreamTrack?.getSettings() as { displaySurface?: string } | undefined)
        ?.displaySurface
    : undefined;
  const mirrorRisk = isLocalShare && surface === "monitor";

  // Scroll the SHARED TAB from this preview (Chrome 136+, only for tab shares).
  const [scrollOn, setScrollOn] = useState(false);
  const [scrollMsg, setScrollMsg] = useState<string | null>(null);
  type CC = {
    forwardWheel?: (el: HTMLElement) => Promise<void>;
    sendWheel?: (a: { x: number; y: number; wheelDeltaX: number; wheelDeltaY: number }) => Promise<void>;
  };
  const cc = captureController as CC | undefined;
  const canForward = isLocalShare && surface === "browser" && typeof cc?.forwardWheel === "function";
  const canSend = isLocalShare && surface === "browser" && typeof cc?.sendWheel === "function";

  async function enableScroll() {
    // attach to the whole stage (not just the <video>) so overlays never swallow the wheel
    const el = wrapperRef.current;
    if (!cc?.forwardWheel || !el) return;
    try {
      await cc.forwardWheel(el);
      setScrollOn(true);
      setScrollMsg(null);
    } catch {
      setScrollMsg("অনুমতি পাওয়া যায়নি — আবার চেষ্টা করে \"অনুমতি দিন\" চাপুন");
    }
  }

  /** Scroll the shared TAB by `dy` (positive = down). Used by the ▲▼ buttons and the keyboard. */
  const scrollShared = useCallback(
    async (dy: number) => {
      const c = captureController as CC | undefined;
      const v = videoElRef.current;
      if (!c?.sendWheel) return;
      try {
        await c.sendWheel({
          x: Math.round((v?.videoWidth || 800) / 2),
          y: Math.round((v?.videoHeight || 600) / 2),
          wheelDeltaX: 0,
          wheelDeltaY: -dy,
        });
        setScrollMsg(null);
      } catch {
        setScrollMsg("স্ক্রল করা যায়নি — ব্রাউজারের অনুমতি দিন (শেয়ার করা ট্যাব খোলা আছে কিনা দেখুন)");
      }
    },
    [captureController]
  );

  // Keyboard paging while the class page is focused: PageUp/PageDown, arrows, Space.
  useEffect(() => {
    if (!canSend) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const map: Record<string, number> = {
        PageDown: 800,
        PageUp: -800,
        ArrowDown: 120,
        ArrowUp: -120,
        " ": e.shiftKey ? -800 : 800,
      };
      const dy = map[e.key];
      if (dy === undefined) return;
      e.preventDefault();
      void scrollShared(dy);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canSend, scrollShared]);

  const canMove = !locked && !annotateMode && !scrollOn;

  function onWheel(e: React.WheelEvent) {
    if (!canMove || scrollOn) return;
    const r = wrapperRef.current?.getBoundingClientRect();
    if (!r) return;
    if (e.ctrlKey || e.metaKey) {
      zoomAt(view.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX - r.left, e.clientY - r.top);
    } else if (view.s > 1) {
      applyView({ ...view, x: view.x - e.deltaX, y: view.y - e.deltaY });
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!canMove) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      const r = wrapperRef.current!.getBoundingClientRect();
      gesture.current = {
        d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        s: view.s,
        mx: (pts[0].x + pts[1].x) / 2 - r.left,
        my: (pts[0].y + pts[1].y) / 2 - r.top,
        x: view.x,
        y: view.y,
      };
    } else if (pts.length === 1) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        const r = wrapperRef.current!.getBoundingClientRect();
        if (view.s > 1) applyView({ s: 1, x: 0, y: 0 });
        else zoomAt(2.5, e.clientX - r.left, e.clientY - r.top);
      }
      lastTap.current = now;
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !canMove) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2 && gesture.current) {
      const g = gesture.current;
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const sc = Math.min(5, Math.max(1, (g.s * d) / g.d));
      const k = sc / g.s;
      applyView({ s: sc, x: g.mx - (g.mx - g.x) * k, y: g.my - (g.my - g.y) * k });
    } else if (pts.length === 1 && view.s > 1) {
      applyView({ ...view, x: view.x + (e.clientX - prev.x), y: view.y + (e.clientY - prev.y) });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    gesture.current = null;
  }

  return (
    <div
      ref={wrapperRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black"
      style={{ touchAction: canMove ? "none" : undefined }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        ref={innerRef}
        className="absolute left-0 top-0 h-full w-full"
        style={{ transformOrigin: "0 0", transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}
      >
        <VideoTrack
          ref={videoElRef}
          trackRef={trackRef}
          onSubscriptionStatusChanged={() => bump()}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
          onLoadedMetadata={bump}
        />
      </div>

      {/* how to scroll the shared document */}
      {isLocalShare && !mirrorRisk && !annotateMode && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute bottom-2 left-1/2 z-[37] max-w-[92%] -translate-x-1/2 rounded-lg bg-zinc-900/95 px-3 py-2 text-center text-xs text-zinc-200 shadow-lg"
        >
          {canForward ? (
            scrollOn ? (
              <span className="text-emerald-400">✓ মাউস-হুইল, ডান পাশের ⇈ ▲ ▼ ⇊ বোতাম অথবা PageUp/PageDown দিয়ে ট্যাব স্ক্রল হবে</span>
            ) : (
              <button type="button" onClick={enableScroll} className="font-medium text-emerald-400 underline">
                ↕ মাউস-হুইল স্ক্রল চালু করুন (ডান পাশের ⇈ ▲ ▼ ⇊ বোতাম এমনিতেই কাজ করে)
              </button>
            )
          ) : surface === "window" || surface === "monitor" ? (
            <span>
              উইন্ডো/পুরো স্ক্রিন শেয়ারে ব্রাউজার অন্য অ্যাপ স্ক্রল করতে পারে না। ক্লাস থেকেই পেজ বদলাতে PDF/ডকুমেন্টটা <b>Chrome ট্যাবে</b> খুলে শেয়ার করার সময় <b>“Chrome ট্যাব”</b> বেছে নিন — তখন এখানে পেজ-বোতাম আসবে।
            </span>
          ) : null}
          {scrollMsg && <div className="mt-1 text-amber-300">{scrollMsg}</div>}
        </div>
      )}

      {mirrorRisk && (
        <div className="absolute inset-0 z-[24] flex items-center justify-center bg-zinc-950 p-6 text-center">
          <div className="max-w-md space-y-2 text-sm text-zinc-200">
            <div className="text-base font-semibold text-emerald-400">আপনার পুরো স্ক্রিন শেয়ার হচ্ছে</div>
            <p>স্টুডেন্টরা আপনার স্ক্রিনই দেখছে। এই পেজ নিজের ভেতরে নিজেকে দেখালে ভুল জায়গায় দেখা যায়, তাই এখানে প্রিভিউ বন্ধ রাখা হয়েছে।</p>
            <p className="text-zinc-400">
              আঁকা ও স্পটলাইট ব্যবহার করতে শেয়ার বন্ধ করে শুধু একটি উইন্ডো (Word / PDF) শেয়ার করুন।
            </p>
          </div>
        </div>
      )}

      {/* page / scroll buttons for the shared TAB (teacher only) */}
      {canSend && !mirrorRisk && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute right-2 top-1/2 z-[37] flex -translate-y-1/2 flex-col gap-1 rounded-lg bg-zinc-900/90 p-1 text-sm text-zinc-100 shadow-lg"
        >
          <button type="button" onClick={() => scrollShared(-800)} className="h-9 w-12 rounded hover:bg-zinc-700" title="আগের পেজ (PageUp)">⇈</button>
          <button type="button" onClick={() => scrollShared(-120)} className="h-9 w-12 rounded hover:bg-zinc-700" title="একটু ওপরে (↑)">▲</button>
          <button type="button" onClick={() => scrollShared(120)} className="h-9 w-12 rounded hover:bg-zinc-700" title="একটু নিচে (↓)">▼</button>
          <button type="button" onClick={() => scrollShared(800)} className="h-9 w-12 rounded hover:bg-zinc-700" title="পরের পেজ (PageDown)">⇊</button>
        </div>
      )}

      {/* zoom controls for the viewer */}
      {!annotateMode && !mirrorRisk && (
        <div className="absolute bottom-2 left-2 z-[37] flex items-center gap-1 rounded-lg bg-zinc-900/90 p-1 text-sm text-zinc-100 shadow-lg">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              const r = wrapperRef.current!.getBoundingClientRect();
              zoomAt(view.s / 1.4, r.width / 2, r.height / 2);
            }}
            className="h-8 w-8 rounded hover:bg-zinc-700"
            title="ছোট করুন"
          >
            −
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => applyView({ s: 1, x: 0, y: 0 })}
            className="min-w-10 rounded px-1 text-xs hover:bg-zinc-700"
            title="রিসেট"
          >
            {Math.round(view.s * 100)}%
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              const r = wrapperRef.current!.getBoundingClientRect();
              zoomAt(view.s * 1.4, r.width / 2, r.height / 2);
            }}
            className="h-8 w-8 rounded hover:bg-zinc-700"
            title="বড় করুন"
          >
            +
          </button>
        </div>
      )}

      <AnnotationCanvas
        isHost={isHost}
        getContentRect={getContentRect}
        resizeSignal={resizeSignal}
        annotateMode={annotateMode}
        onAnnotateModeChange={onAnnotateModeChange}
        locked={locked}
      />

      {/* While locked, swallow every touch on the stage so nothing changes by accident. */}
      {locked && <div className="absolute inset-0 z-[26]" onPointerDown={(e) => e.stopPropagation()} />}

      {/* Zoom-style status pill */}
      <div className="pointer-events-none absolute left-1/2 top-2 z-[36] flex -translate-x-1/2 items-center gap-2">
        <div onPointerDown={(e) => e.stopPropagation()} className="pointer-events-auto flex items-center gap-2 rounded-full bg-emerald-600/95 px-3 py-1 text-xs font-medium text-white shadow-lg">
          <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
          {isLocalShare ? "আপনি স্ক্রিন শেয়ার করছেন" : `${presenterName} স্ক্রিন শেয়ার করছেন`}
          <button
            type="button"
            onClick={onToggleLock}
            className="ml-1 flex items-center gap-1 rounded-full bg-black/30 px-2.5 py-0.5 text-[11px] font-semibold hover:bg-black/50"
            title={locked ? "স্ক্রিন আনলক করুন" : "স্ক্রিন লক করুন (ভুলে ছোঁয়া বন্ধ)"}
          >
            <LockIcon open={!locked} />
            {locked ? "আনলক" : "লক"}
          </button>
          {isLocalShare && (
            <button
              type="button"
              onClick={onStopShare}
              className="ml-1 rounded-full bg-red-600 px-2.5 py-0.5 text-[11px] font-semibold hover:bg-red-500"
            >
              শেয়ার বন্ধ
            </button>
          )}
        </div>
      </div>

      {paused && (
        <div className="absolute inset-0 z-[25] flex items-center justify-center bg-black/60 text-center text-sm text-zinc-100">
          <div className="rounded-lg bg-zinc-900/90 px-4 py-3">⏸ শেয়ার পজ করা আছে</div>
        </div>
      )}
    </div>
  );
}

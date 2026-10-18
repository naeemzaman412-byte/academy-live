"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ParticipantTile,
  isTrackReference,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";

type Corner = "tl" | "tr" | "bl" | "br";
const MARGIN = 8;

function sortTracks(tracks: TrackReferenceOrPlaceholder[]) {
  // cameras that are actually ON first, camera-off placeholders after
  return [...tracks].sort((a, b) => Number(isTrackReference(b)) - Number(isTrackReference(a)));
}

/**
 * Video thumbnails shown while a screen is being shared (Zoom's "video
 * panel").
 *  - "floating": a small panel that docks in a corner of the stage (top-right
 *    by default). Drag it anywhere — on release it snaps to the nearest
 *    corner so it never ends up covering the middle of the document, and it
 *    always stays inside the stage. Works with touch (phones) too.
 *  - "strip": a thin row of thumbnails above the shared screen.
 */
export default function FloatingCameraStrip({
  tracks,
  mode,
}: {
  tracks: TrackReferenceOrPlaceholder[];
  mode: "floating" | "strip";
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [corner, setCorner] = useState<Corner>("tr");
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [stageW, setStageW] = useState(1024);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  // Track the stage width so thumbnails shrink on phones.
  useLayoutEffect(() => {
    const parent = rootRef.current?.parentElement;
    if (!parent) return;
    const update = () => setStageW(parent.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [mode]);

  useEffect(() => {
    // stop dragging if the component re-renders in another mode
    if (mode !== "floating") drag.current = null;
  }, [mode]);

  const sorted = sortTracks(tracks);
  if (sorted.length === 0) return null;

  const compact = stageW < 640;
  const tileW = compact ? 96 : 176;
  const maxTiles = compact ? 3 : 4;
  const shown = sorted.slice(0, maxTiles);
  const extra = sorted.length - shown.length;

  function tile(t: TrackReferenceOrPlaceholder, w: number) {
    return (
      <div
        key={`${t.participant.identity}-${t.source}`}
        className="shrink-0 overflow-hidden rounded-md bg-black"
        style={{ width: w, aspectRatio: "16 / 9" }}
      >
        <ParticipantTile trackRef={t} />
      </div>
    );
  }

  if (mode === "strip") {
    return (
      <div ref={rootRef} className="flex w-full shrink-0 gap-1 overflow-x-auto bg-zinc-950 p-1">
        {sorted.map((t) => tile(t, compact ? 96 : 150))}
      </div>
    );
  }

  function onDown(e: React.PointerEvent) {
    const root = rootRef.current;
    const parent = root?.parentElement;
    if (!root || !parent) return;
    const r = root.getBoundingClientRect();
    const p = parent.getBoundingClientRect();
    drag.current = { sx: e.clientX, sy: e.clientY, ox: r.left - p.left, oy: r.top - p.top };
    setDragPos({ x: r.left - p.left, y: r.top - p.top });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    const root = rootRef.current;
    const parent = root?.parentElement;
    if (!d || !root || !parent) return;
    const maxX = parent.clientWidth - root.offsetWidth;
    const maxY = parent.clientHeight - root.offsetHeight;
    setDragPos({
      x: Math.min(Math.max(0, d.ox + e.clientX - d.sx), Math.max(0, maxX)),
      y: Math.min(Math.max(0, d.oy + e.clientY - d.sy), Math.max(0, maxY)),
    });
  }

  function onUp() {
    const d = drag.current;
    const root = rootRef.current;
    const parent = root?.parentElement;
    drag.current = null;
    if (d && root && parent && dragPos) {
      const cx = dragPos.x + root.offsetWidth / 2;
      const cy = dragPos.y + root.offsetHeight / 2;
      const horiz = cx < parent.clientWidth / 2 ? "l" : "r";
      const vert = cy < parent.clientHeight / 2 ? "t" : "b";
      setCorner((vert + horiz) as Corner);
    }
    setDragPos(null);
  }

  const place: React.CSSProperties = dragPos
    ? { left: dragPos.x, top: dragPos.y }
    : {
        ...(corner[0] === "t" ? { top: MARGIN } : { bottom: MARGIN }),
        ...(corner[1] === "l" ? { left: MARGIN } : { right: MARGIN }),
      };

  if (minimized) {
    return (
      <div ref={rootRef} className="absolute z-40" style={{ ...place, transition: dragPos ? "none" : "all .18s" }}>
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="flex h-10 items-center gap-1.5 rounded-full border border-zinc-600 bg-zinc-900/95 px-3 text-xs text-zinc-100 shadow-xl"
          title="ভিডিও প্যানেল খুলুন"
        >
          📹 {sorted.length}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="absolute z-40 select-none rounded-lg border border-zinc-700 bg-zinc-900/90 shadow-xl backdrop-blur"
      style={{ ...place, width: tileW + 8, maxHeight: "calc(100% - 16px)", transition: dragPos ? "none" : "all .18s" }}
    >
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{ touchAction: "none" }}
        className="flex cursor-grab items-center justify-between rounded-t-lg bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300 active:cursor-grabbing"
      >
        <span>⠿ {compact ? "" : "ভিডিও"}</span>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setMinimized(true)}
          className="rounded px-1.5 text-zinc-400 hover:text-zinc-100"
          title="ছোট করুন"
        >
          —
        </button>
      </div>
      <div className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto p-1">
        {shown.map((t) => tile(t, tileW))}
        {extra > 0 && <div className="py-0.5 text-center text-[11px] text-zinc-400">+{extra} জন</div>}
      </div>
    </div>
  );
}

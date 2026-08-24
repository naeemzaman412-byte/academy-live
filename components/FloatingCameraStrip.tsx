"use client";

import { useRef, useState } from "react";
import { ParticipantTile, type TrackReferenceOrPlaceholder } from "@livekit/components-react";

/**
 * A draggable, minimizable panel that holds everyone's camera tiles while a
 * screen share is active — so the shared document stays front and center
 * but people are still visible, and can be moved out of the way.
 */
export default function FloatingCameraStrip({ tracks }: { tracks: TrackReferenceOrPlaceholder[] }) {
  const [pos, setPos] = useState({ x: 16, y: 16 });
  const [minimized, setMinimized] = useState(false);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null
  );

  function onDragStart(e: React.PointerEvent) {
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onDragMove(e: React.PointerEvent) {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setPos({
      x: Math.max(0, dragState.current.origX + dx),
      y: Math.max(0, dragState.current.origY + dy),
    });
  }

  function onDragEnd() {
    dragState.current = null;
  }

  if (tracks.length === 0) return null;

  return (
    <div
      className="absolute z-40 select-none rounded-lg border border-zinc-700 bg-zinc-900/90 shadow-xl"
      style={{ left: pos.x, top: pos.y, width: minimized ? "auto" : 200 }}
    >
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        className="flex cursor-grab items-center justify-between rounded-t-lg bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300 active:cursor-grabbing"
      >
        <span>⠿ ক্যামেরা</span>
        <button
          onClick={() => setMinimized((v) => !v)}
          className="rounded px-1 text-zinc-400 hover:text-zinc-100"
        >
          {minimized ? "▢" : "—"}
        </button>
      </div>
      {!minimized && (
        <div className="flex max-h-72 flex-col gap-1 overflow-y-auto p-1">
          {tracks.map((t) => (
            <div
              key={`${t.participant.identity}-${t.source}`}
              className="aspect-video overflow-hidden rounded-md bg-black"
            >
              <ParticipantTile trackRef={t} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";
import { CloseIcon, HighlightIcon, PenIcon, SpotlightIcon, TrashIcon, UndoIcon } from "@/components/icons";

export type ContentRect = { left: number; top: number; width: number; height: number };

type Stroke = {
  color: string;
  width: number;
  hl?: boolean;
  points: { x: number; y: number }[];
};

type WireMessage =
  | { t: "start"; id: string; x: number; y: number; color: string; width: number; hl?: boolean }
  | { t: "undo" }
  | { t: "spot"; x: number; y: number }
  | { t: "spotoff" }
  | { t: "move"; id: string; x: number; y: number }
  | { t: "end"; id: string }
  | { t: "clear" };

const ANNOTATION_TOPIC = "annotation";
const COLORS = ["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#ffffff"];

/**
 * Draws over a video element using coordinates NORMALIZED to the video's
 * actual visible content box (0..1 range) rather than raw pixels — this is
 * what keeps a teacher's strokes lined up with the document on every
 * viewer's screen regardless of window size or aspect ratio (the bug this
 * fixes: strokes drifting below/outside the shared document on mobile).
 *
 * Only the host can draw. Only the host sees the toolbox. Everyone sees the
 * resulting strokes rendered in the correct place.
 */
export default function AnnotationCanvas({
  isHost,
  getContentRect,
  resizeSignal,
  annotateMode,
  onAnnotateModeChange,
  locked,
}: {
  locked: boolean;
  annotateMode: boolean;
  onAnnotateModeChange: (v: boolean) => void;
  isHost: boolean;
  getContentRect: () => ContentRect | null;
  resizeSignal: number;
}) {
  const room = useRoomContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Map<string, Stroke>>(new Map());
  const drawingIdRef = useRef<string | null>(null);

  const [tool, setTool] = useState<"pen" | "highlighter" | "spotlight">("pen");
  const highlighter = tool === "highlighter";
  const spotRef = useRef<{ x: number; y: number } | null>(null);
  const lastRectRef = useRef("");
  const [color, setColor] = useState(COLORS[0]);
  const [lineWidth, setLineWidth] = useState(4);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const rect = getContentRect();
    if (!canvas || !rect || rect.width === 0 || rect.height === 0) return;

    // rect is in viewport coordinates; the canvas is absolutely positioned
    // inside its (relative) parent, so convert to parent-relative offsets.
    const parentRect = canvas.parentElement?.getBoundingClientRect();
    canvas.style.left = `${rect.left - (parentRect?.left ?? 0)}px`;
    canvas.style.top = `${rect.top - (parentRect?.top ?? 0)}px`;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    canvas.width = Math.round(rect.width);
    canvas.height = Math.round(rect.height);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const stroke of strokesRef.current.values()) {
      if (stroke.points.length < 1) continue;
      ctx.globalAlpha = stroke.hl ? 0.35 : 1;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      stroke.points.forEach((p, i) => {
        const px = p.x * canvas.width;
        const py = p.y * canvas.height;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Spotlight: a glowing red dot where the teacher is touching / pointing.
    const spot = spotRef.current;
    if (spot) {
      const cx = spot.x * canvas.width;
      const cy = spot.y * canvas.height;
      // Small, soft red dot (like Zoom's spotlight) — never hides the text under it.
      const r = 15;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, "rgba(255,40,40,0.85)");
      g.addColorStop(0.45, "rgba(239,68,68,0.55)");
      g.addColorStop(1, "rgba(239,68,68,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [getContentRect]);

  // Safety net: the shared window can be resized by the presenter at any time
  // (which changes the video's aspect ratio). Re-sync the canvas if the video's
  // visible area changed, so drawings never drift from the real pointer.
  useEffect(() => {
    const id = window.setInterval(() => {
      const r = getContentRect();
      const sig = r ? [r.left, r.top, r.width, r.height].map(Math.round).join(",") : "";
      if (sig !== lastRectRef.current) {
        lastRectRef.current = sig;
        redraw();
      }
    }, 300);
    return () => window.clearInterval(id);
  }, [getContentRect, redraw]);

  // Leaving the spotlight tool (or closing drawing mode) switches the dot off for everyone.
  useEffect(() => {
    if (spotRef.current && (!annotateMode || tool !== "spotlight") && isHost) {
      spotRef.current = null;
      redraw();
      room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ t: "spotoff" })), {
        reliable: true,
        topic: ANNOTATION_TOPIC,
      });
    }
  }, [annotateMode, tool, isHost, redraw, room]);

  // Redraw whenever the parent tells us the underlying video's layout changed.
  useEffect(() => {
    redraw();
  }, [redraw, resizeSignal]);

  useEffect(() => {
    function onResize() {
      redraw();
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [redraw]);

  // Listen for annotation events from the host (or, for the host, this also
  // harmlessly no-ops on its own re-render path since drawing state is
  // updated locally + optimistically in the pointer handlers below).
  useEffect(() => {
    function handleData(payload: Uint8Array, _participant: unknown, _kind: unknown, topic?: string) {
      if (topic !== ANNOTATION_TOPIC) return;
      try {
        const msg = JSON.parse(new TextDecoder().decode(payload)) as WireMessage;
        applyMessage(msg);
      } catch {
        // ignore malformed packets
      }
    }
    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  function applyMessage(msg: WireMessage) {
    if (msg.t === "clear") {
      strokesRef.current.clear();
      spotRef.current = null;
      redraw();
      return;
    }
    if (msg.t === "spot") {
      // The spotlight STAYS where it was put (until the teacher changes tool,
      // closes drawing mode or presses clear) and can be dragged anywhere.
      spotRef.current = { x: msg.x, y: msg.y };
      redraw();
      return;
    }
    if (msg.t === "spotoff") {
      spotRef.current = null;
      redraw();
      return;
    }
    if (msg.t === "undo") {
      const last = Array.from(strokesRef.current.keys()).pop();
      if (last) strokesRef.current.delete(last);
      redraw();
      return;
    }
    if (msg.t === "start") {
      strokesRef.current.set(msg.id, {
        color: msg.color,
        width: msg.width,
        hl: msg.hl,
        points: [{ x: msg.x, y: msg.y }],
      });
      redraw();
      return;
    }
    if (msg.t === "move") {
      const stroke = strokesRef.current.get(msg.id);
      if (stroke) {
        stroke.points.push({ x: msg.x, y: msg.y });
        redraw();
      }
      return;
    }
    if (msg.t === "end") {
      // nothing to clean up — the stroke stays visible
    }
  }

  function publish(msg: WireMessage, forceReliable = false) {
    room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(msg)), {
      reliable: forceReliable || msg.t !== "spot",
      topic: ANNOTATION_TOPIC,
    });
  }

  function toNormalized(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null {
    // Map the pointer using the canvas's OWN on-screen box, so what is drawn is
    // always exactly under the finger / mouse, even if layout just changed.
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    return { x, y };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isHost || !annotateMode || locked) return;
    const p = toNormalized(e);
    if (!p) return;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    if (tool === "spotlight") {
      drawingIdRef.current = "spot";
      applyMessage({ t: "spot", x: p.x, y: p.y });
      publish({ t: "spot", x: p.x, y: p.y });
      return;
    }
    const id = crypto.randomUUID();
    drawingIdRef.current = id;
    const w = highlighter ? lineWidth * 4 : lineWidth;
    applyMessage({ t: "start", id, x: p.x, y: p.y, color, width: w, hl: highlighter });
    publish({ t: "start", id, x: p.x, y: p.y, color, width: w, hl: highlighter });
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const id = drawingIdRef.current;
    if (!id) return;
    const p = toNormalized(e);
    if (!p) return;
    if (id === "spot") {
      applyMessage({ t: "spot", x: p.x, y: p.y });
      publish({ t: "spot", x: p.x, y: p.y });
      return;
    }
    applyMessage({ t: "move", id, x: p.x, y: p.y });
    publish({ t: "move", id, x: p.x, y: p.y });
  }

  function handlePointerUp() {
    const id = drawingIdRef.current;
    if (!id) return;
    drawingIdRef.current = null;
    if (id === "spot") {
      // finger/mouse released: keep the dot visible, just make sure everyone has its final position
      const last = spotRef.current;
      if (last) publish({ t: "spot", x: last.x, y: last.y }, true);
      return;
    }
    applyMessage({ t: "end", id });
    publish({ t: "end", id });
  }

  function handleUndo() {
    applyMessage({ t: "undo" });
    publish({ t: "undo" });
  }

  function handleClear() {
    applyMessage({ t: "clear" });
    publish({ t: "clear" });
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        data-annotation-canvas="true"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          position: "absolute",
          pointerEvents: isHost && annotateMode && !locked ? "auto" : "none",
          touchAction: "none",
          zIndex: 20,
        }}
      />
      {isHost && annotateMode && !locked && (
        <div className="absolute left-2 top-1/2 z-30 flex max-h-[90%] -translate-y-1/2 flex-col items-center gap-1.5 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900/95 p-1.5 text-xs shadow-xl">
          <button
            onClick={() => setTool("spotlight")}
            className={`rounded-lg p-2 ${tool === "spotlight" ? "bg-indigo-600 text-white" : "text-zinc-300 hover:bg-zinc-700"}`}
            title="স্পটলাইট — যেখানে ছোঁবেন সেখানে লাল আলো দেখাবে"
          >
            <SpotlightIcon />
          </button>
          <button
            onClick={() => setTool("pen")}
            className={`rounded-lg p-2 ${tool === "pen" ? "bg-indigo-600 text-white" : "text-zinc-300 hover:bg-zinc-700"}`}
            title="কলম"
          >
            <PenIcon />
          </button>
          <button
            onClick={() => setTool("highlighter")}
            className={`rounded-lg p-2 ${highlighter ? "bg-indigo-600 text-white" : "text-zinc-300 hover:bg-zinc-700"}`}
            title="হাইলাইটার"
          >
            <HighlightIcon />
          </button>
          <div className="my-0.5 h-px w-6 bg-zinc-700" />
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className="h-5 w-5 rounded-full border-2"
              style={{ backgroundColor: c, borderColor: color === c ? "#818cf8" : "#52525b" }}
              title="রং"
            />
          ))}
          <input
            type="range"
            min={2}
            max={12}
            value={lineWidth}
            onChange={(e) => setLineWidth(Number(e.target.value))}
            className="h-16 w-4"
            style={{ writingMode: "vertical-lr", direction: "rtl" }}
            title="মোটা/চিকন"
          />
          <div className="my-0.5 h-px w-6 bg-zinc-700" />
          <button onClick={handleUndo} className="rounded-lg p-2 text-zinc-300 hover:bg-zinc-700" title="আনডু">
            <UndoIcon />
          </button>
          <button onClick={handleClear} className="rounded-lg p-2 text-red-400 hover:bg-red-900/40" title="সব মুছুন">
            <TrashIcon />
          </button>
          <button
            onClick={() => onAnnotateModeChange(false)}
            className="rounded-lg p-2 text-zinc-300 hover:bg-zinc-700"
            title="আঁকা বন্ধ করুন"
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";

export type ContentRect = { left: number; top: number; width: number; height: number };

type Stroke = {
  color: string;
  width: number;
  points: { x: number; y: number }[];
};

type WireMessage =
  | { t: "start"; id: string; x: number; y: number; color: string; width: number }
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
}: {
  isHost: boolean;
  getContentRect: () => ContentRect | null;
  resizeSignal: number;
}) {
  const room = useRoomContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Map<string, Stroke>>(new Map());
  const drawingIdRef = useRef<string | null>(null);

  const [annotateMode, setAnnotateMode] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [lineWidth, setLineWidth] = useState(4);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const rect = getContentRect();
    if (!canvas || !rect || rect.width === 0 || rect.height === 0) return;

    canvas.style.left = `${rect.left}px`;
    canvas.style.top = `${rect.top}px`;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    canvas.width = Math.round(rect.width);
    canvas.height = Math.round(rect.height);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const stroke of strokesRef.current.values()) {
      if (stroke.points.length < 1) continue;
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
  }, [getContentRect]);

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
      redraw();
      return;
    }
    if (msg.t === "start") {
      strokesRef.current.set(msg.id, {
        color: msg.color,
        width: msg.width,
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

  function publish(msg: WireMessage) {
    room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(msg)), {
      reliable: true,
      topic: ANNOTATION_TOPIC,
    });
  }

  function toNormalized(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null {
    const rect = getContentRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    return { x, y };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isHost || !annotateMode) return;
    const p = toNormalized(e);
    if (!p) return;
    const id = crypto.randomUUID();
    drawingIdRef.current = id;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    applyMessage({ t: "start", id, x: p.x, y: p.y, color, width: lineWidth });
    publish({ t: "start", id, x: p.x, y: p.y, color, width: lineWidth });
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const id = drawingIdRef.current;
    if (!id) return;
    const p = toNormalized(e);
    if (!p) return;
    applyMessage({ t: "move", id, x: p.x, y: p.y });
    publish({ t: "move", id, x: p.x, y: p.y });
  }

  function handlePointerUp() {
    const id = drawingIdRef.current;
    if (!id) return;
    drawingIdRef.current = null;
    applyMessage({ t: "end", id });
    publish({ t: "end", id });
  }

  function handleClear() {
    applyMessage({ t: "clear" });
    publish({ t: "clear" });
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{
          position: "absolute",
          pointerEvents: isHost && annotateMode ? "auto" : "none",
          touchAction: "none",
          zIndex: 20,
        }}
      />
      {isHost && (
        <div className="absolute right-2 top-2 z-30 flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/90 px-2 py-1.5 text-xs shadow-lg">
          <button
            onClick={() => setAnnotateMode((v) => !v)}
            className={`rounded px-2 py-1 font-medium ${
              annotateMode ? "bg-indigo-600 text-white" : "border border-zinc-700 text-zinc-300"
            }`}
            title="আঁকা মোড চালু/বন্ধ করুন"
          >
            {annotateMode ? "✏️ আঁকা চালু" : "🖱 স্ক্রল/ইন্টারঅ্যাকশন"}
          </button>
          {annotateMode && (
            <>
              <div className="flex items-center gap-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className="h-5 w-5 rounded-full border-2"
                    style={{
                      backgroundColor: c,
                      borderColor: color === c ? "#818cf8" : "transparent",
                    }}
                  />
                ))}
              </div>
              <input
                type="range"
                min={2}
                max={12}
                value={lineWidth}
                onChange={(e) => setLineWidth(Number(e.target.value))}
                className="w-16"
              />
              <button
                onClick={handleClear}
                className="rounded border border-red-800 px-2 py-1 text-red-400 hover:bg-red-900/40"
              >
                মুছুন
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

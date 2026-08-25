"use client";

import { useEffect, useRef, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import { Track } from "livekit-client";

/**
 * Client-side, permission-prompt-free recording.
 *
 * Earlier version used getDisplayMedia(), which forces the browser to show
 * a "choose a tab/window/screen" picker every single time recording starts
 * — that's a hard browser security control and can't be skipped. To record
 * "in the background" instead, this composites the class UI onto an
 * off-screen <canvas> (drawing every visible <video> tile each frame) and
 * captures that canvas as a MediaStream via canvas.captureStream(). No
 * screen-picker dialog is ever shown.
 *
 * Audio is mixed from two sources that are already available without any
 * new permission prompt: the host's own microphone track (already
 * published to the room the moment they joined the call) and the <audio>
 * elements LiveKit's RoomAudioRenderer renders for every remote
 * participant.
 *
 * Note: canvas.captureStream() is not available in Safari on iOS — on that
 * platform this button is hidden with a short explanation.
 */
export default function RecordingControl() {
  const room = useRoomContext();
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof MediaRecorder !== "undefined" &&
      typeof HTMLCanvasElement !== "undefined" &&
      !!HTMLCanvasElement.prototype.captureStream
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const wiredAudioElsRef = useRef<WeakSet<HTMLMediaElement>>(new WeakSet());
  const scanIntervalRef = useRef<number | null>(null);

  function drawFrame() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const root = document.querySelector<HTMLElement>("[data-lk-theme]");
    const videos = root
      ? Array.from(root.querySelectorAll("video")).filter(
          (v) => v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0
        )
      : [];

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (videos.length) {
      const cols = Math.ceil(Math.sqrt(videos.length));
      const rows = Math.ceil(videos.length / cols);
      const cellW = canvas.width / cols;
      const cellH = canvas.height / rows;
      videos.forEach((v, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const scale = Math.min(cellW / v.videoWidth, cellH / v.videoHeight);
        const w = v.videoWidth * scale;
        const h = v.videoHeight * scale;
        const x = col * cellW + (cellW - w) / 2;
        const y = row * cellH + (cellH - h) / 2;
        try {
          ctx.drawImage(v, x, y, w, h);
        } catch {
          // Transient decode error on a mid-frame track change — skip this frame for this tile.
        }
      });
    } else {
      ctx.fillStyle = "#71717a";
      ctx.font = "20px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("রেকর্ডিং চলছে...", canvas.width / 2, canvas.height / 2);
    }

    rafRef.current = requestAnimationFrame(drawFrame);
  }

  // Pick up any <audio> element LiveKit has (re)rendered for a remote
  // participant and route its output into the recording's audio mix, while
  // still letting it play normally for the host.
  function wireAudioElements() {
    const audioCtx = audioCtxRef.current;
    const dest = audioDestRef.current;
    if (!audioCtx || !dest) return;
    const root = document.querySelector<HTMLElement>("[data-lk-theme]");
    if (!root) return;
    root.querySelectorAll("audio").forEach((el) => {
      const audioEl = el as HTMLAudioElement;
      if (wiredAudioElsRef.current.has(audioEl)) return;
      try {
        const src = audioCtx.createMediaElementSource(audioEl);
        src.connect(dest);
        src.connect(audioCtx.destination);
        wiredAudioElsRef.current.add(audioEl);
      } catch {
        // Already wired (or not a media element we can wrap) — ignore.
      }
    });
  }

  function cleanup() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (scanIntervalRef.current !== null) window.clearInterval(scanIntervalRef.current);
    scanIntervalRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    audioDestRef.current = null;
    canvasRef.current = null;
  }

  async function startRecording() {
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      canvasRef.current = canvas;

      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioCtxRef.current = audioCtx;
      const dest = audioCtx.createMediaStreamDestination();
      audioDestRef.current = dest;

      // Host's own mic — reuse the track already published to the class, so
      // no second microphone permission prompt is needed.
      const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      const micTrack = micPub?.track?.mediaStreamTrack;
      if (micTrack) {
        const micSrc = audioCtx.createMediaStreamSource(new MediaStream([micTrack]));
        micSrc.connect(dest);
      }

      // Remote participants' audio, plus anyone who joins after recording starts.
      wireAudioElements();
      scanIntervalRef.current = window.setInterval(wireAudioElements, 2000);

      drawFrame();

      const canvasStream = canvas.captureStream(30);
      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";

      const recorder = new MediaRecorder(combinedStream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `class-recording-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.webm`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        cleanup();
      };

      recorder.start(1000);
      recorderRef.current = recorder;
      setRecording(true);
    } catch (err) {
      cleanup();
      setError(err instanceof Error ? err.message : "রেকর্ডিং শুরু করা যায়নি");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  useEffect(() => {
    // Best-effort: if the teacher navigates away while still recording, stop
    // so the download at least attempts to fire.
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      cleanup();
    };
  }, []);

  if (!supported) {
    return (
      <span className="text-xs text-zinc-500" title="এই ব্রাউজারে (যেমন iOS Safari) রেকর্ডিং সমর্থিত নয়">
        রেকর্ডিং সমর্থিত নয়
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-400">{error}</span>}
      {recording ? (
        <button
          onClick={stopRecording}
          className="flex items-center gap-1.5 rounded-md bg-red-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
          রেকর্ডিং বন্ধ করুন
        </button>
      ) : (
        <button
          onClick={startRecording}
          className="flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
          title="কোনো পপ-আপ ছাড়াই ব্যাকগ্রাউন্ডে ক্লাস রেকর্ড শুরু হবে"
        >
          ● রেকর্ডিং শুরু করুন
        </button>
      )}
    </div>
  );
}

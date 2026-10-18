"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Track, type Participant, type Room } from "livekit-client";

/**
 * Class recorder (host only) — works while screen sharing, while the tab is
 * in the background, and on mobile browsers that support canvas.captureStream.
 *
 * How it stays alive while the teacher is working in another window (Word,
 * PDF, ...): the old version drew frames with requestAnimationFrame, which
 * browsers PAUSE for background tabs — so the recording froze the moment the
 * teacher left the class tab. This version:
 *   1. Drives drawing from a Web Worker timer (workers are not throttled).
 *   2. Builds its own hidden <video> elements straight from the LiveKit
 *      MediaStreamTracks, instead of scraping whatever <video> tags happen to
 *      be on screen — so layout, hidden panels and tab visibility don't matter.
 *   3. Takes audio straight from the tracks (host mic, every student's mic,
 *      shared-screen sound) with createMediaStreamSource — it never touches
 *      the <audio> elements LiveKit plays through, so the teacher's speakers
 *      keep working after recording stops.
 *
 * Layout in the file: when somebody shares a screen, the shared screen fills
 * the frame and the cameras that are ON stack in a column on the right; with
 * no share it is a gallery grid of everyone. The teacher's drawn annotations
 * are composited on top of the shared screen.
 */

const W = 1600;
const H = 900;
const FPS = 24;

type Src = { id: string; name: string; video: HTMLVideoElement | null };

const WORKER_SRC = `
let id = 0;
onmessage = (e) => {
  if (e.data && e.data.start) { clearInterval(id); id = setInterval(() => postMessage(0), e.data.ms); }
  else { clearInterval(id); }
};`;

function isMobile() {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function pickMime(): string {
  // H.264 .mp4 plays everywhere (Windows Media Player, phone galleries, WhatsApp).
  // VP9 .webm often shows as an empty, unplayable file on Windows without extra codecs,
  // so mp4 is tried first and webm is only the fallback.
  const mp4 = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1,opus", "video/mp4"];
  const candidates = [
    ...mp4,
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return "";
}

function disposeVideo(el: HTMLVideoElement) {
  el.srcObject = null;
  el.remove();
}

export function isRecordingSupported() {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function"
  );
}

export type SavedRecording = { url: string; name: string; sizeMB: number; mime: string };

export type ClassRecorder = {
  supported: boolean;
  /** Finished file waiting in memory (download / gallery buttons). */
  lastFile: SavedRecording | null;
  saveLast: () => void;
  shareLast: () => void;
  dismissLast: () => void;
  /** true when the file is being written straight to a folder the user picked */
  savingToDisk: boolean;
  recording: boolean;
  paused: boolean;
  seconds: number;
  error: string | null;
  start: () => void;
  stop: () => void;
  togglePause: () => void;
};

export function useClassRecorder(room: Room): ClassRecorder {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [supported] = useState(isRecordingSupported);
  const [lastFile, setLastFile] = useState<SavedRecording | null>(null);
  const [savingToDisk, setSavingToDisk] = useState(false);
  const writerRef = useRef<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> } | null>(null);
  const writeChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const fileNameRef = useRef("class-recording");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const mimeRef = useRef("video/webm");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const audioNodesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());
  const videoElsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const holderRef = useRef<HTMLDivElement | null>(null);
  const screensRef = useRef<Src[]>([]);
  const camsRef = useRef<Src[]>([]);
  const lastSyncRef = useRef(0);
  const pausedRef = useRef(false);
  // elapsed-time bookkeeping that survives background-tab timer throttling
  const accumRef = useRef(0);
  const runStartRef = useRef<number | null>(null);

  const getHolder = () => {
    if (!holderRef.current) {
      const d = document.createElement("div");
      d.setAttribute("aria-hidden", "true");
      d.style.cssText =
        "position:fixed;left:0;bottom:0;width:2px;height:2px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1";
      document.body.appendChild(d);
      holderRef.current = d;
    }
    return holderRef.current;
  };

  const videoFor = useCallback((track: MediaStreamTrack) => {
    let el = videoElsRef.current.get(track.id);
    if (!el) {
      el = document.createElement("video");
      el.muted = true;
      el.autoplay = true;
      el.playsInline = true;
      el.srcObject = new MediaStream([track]);
      getHolder().appendChild(el);
      el.play().catch(() => {});
      videoElsRef.current.set(track.id, el);
    }
    return el;
  }, []);

  /** Re-scan the room: which videos to draw, which audio tracks to mix. */
  const sync = useCallback(() => {
    const all: Participant[] = [room.localParticipant, ...Array.from(room.remoteParticipants.values())];
    const screens: Src[] = [];
    const cams: Src[] = [];
    const liveVideoIds = new Set<string>();
    const liveAudioIds = new Set<string>();

    for (const p of all) {
      const name = p.name || p.identity || "";
      let camVideo: HTMLVideoElement | null = null;
      for (const pub of p.trackPublications.values()) {
        const mst = pub.track?.mediaStreamTrack;
        if (!mst) continue;
        if (pub.kind === Track.Kind.Video) {
          if (pub.isMuted) continue;
          liveVideoIds.add(mst.id);
          if (pub.source === Track.Source.ScreenShare) {
            screens.push({ id: mst.id, name, video: videoFor(mst) });
          } else if (pub.source === Track.Source.Camera) {
            camVideo = videoFor(mst);
          }
        } else if (pub.kind === Track.Kind.Audio) {
          liveAudioIds.add(mst.id);
          const ctx = audioCtxRef.current;
          const dest = audioDestRef.current;
          if (ctx && dest && !audioNodesRef.current.has(mst.id)) {
            try {
              const node = ctx.createMediaStreamSource(new MediaStream([mst]));
              node.connect(dest);
              audioNodesRef.current.set(mst.id, node);
            } catch {
              /* track ended between listing and wiring */
            }
          }
        }
      }
      cams.push({ id: p.identity, name, video: camVideo });
    }

    // drop videos / audio nodes whose track is gone
    for (const [id, el] of videoElsRef.current) {
      if (!liveVideoIds.has(id)) {
        disposeVideo(el);
        videoElsRef.current.delete(id);
      }
    }
    for (const [id, node] of audioNodesRef.current) {
      if (!liveAudioIds.has(id)) {
        try {
          node.disconnect();
        } catch {
          /* ignore */
        }
        audioNodesRef.current.delete(id);
      }
    }

    screensRef.current = screens;
    camsRef.current = cams;
  }, [room, videoFor]);

  const drawContain = (
    ctx: CanvasRenderingContext2D,
    v: HTMLVideoElement,
    x: number,
    y: number,
    w: number,
    h: number
  ) => {
    const scale = Math.min(w / v.videoWidth, h / v.videoHeight);
    const dw = v.videoWidth * scale;
    const dh = v.videoHeight * scale;
    const dx = x + (w - dw) / 2;
    const dy = y + (h - dh) / 2;
    try {
      ctx.drawImage(v, dx, dy, dw, dh);
    } catch {
      /* transient decode error — skip this frame */
    }
    return { dx, dy, dw, dh };
  };

  const drawTile = (ctx: CanvasRenderingContext2D, s: Src, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = "#18181b";
    ctx.fillRect(x, y, w, h);
    const v = s.video;
    if (v && v.readyState >= 2 && v.videoWidth > 0) {
      // "cover" fit for camera tiles
      const scale = Math.max(w / v.videoWidth, h / v.videoHeight);
      const sw = w / scale;
      const sh = h / scale;
      try {
        ctx.drawImage(v, (v.videoWidth - sw) / 2, (v.videoHeight - sh) / 2, sw, sh, x, y, w, h);
      } catch {
        /* skip */
      }
    } else {
      const r = Math.min(w, h) * 0.22;
      ctx.fillStyle = "#3f3f46";
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e4e4e7";
      ctx.font = `600 ${Math.round(r)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((s.name || "?").trim().charAt(0).toUpperCase() || "?", x + w / 2, y + h / 2);
    }
    if (s.name) {
      const fs = Math.max(12, Math.round(h * 0.075));
      ctx.font = `500 ${fs}px sans-serif`;
      const tw = Math.min(w - 8, ctx.measureText(s.name).width + 14);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(x + 4, y + h - fs - 12, tw, fs + 8);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(s.name, x + 11, y + h - fs / 2 - 8, w - 20);
    }
  };

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || pausedRef.current) return;

    const now = performance.now();
    if (now - lastSyncRef.current > 700) {
      lastSyncRef.current = now;
      sync();
    }

    ctx.fillStyle = "#09090b";
    ctx.fillRect(0, 0, W, H);

    const screen = screensRef.current.find(
      (s) => s.video && s.video.readyState >= 2 && s.video.videoWidth > 0
    );
    const cams = camsRef.current;

    if (screen && screen.video) {
      const camsOn = cams.filter((c) => c.video).slice(0, 4);
      const stripW = camsOn.length ? Math.round(W * 0.2) : 0;
      const r = drawContain(ctx, screen.video, 0, 0, W - stripW, H);
      // teacher's annotations, pinned to the shared content
      const ann = document.querySelector<HTMLCanvasElement>("canvas[data-annotation-canvas]");
      if (ann && ann.width > 0 && ann.height > 0) {
        try {
          ctx.drawImage(ann, r.dx, r.dy, r.dw, r.dh);
        } catch {
          /* skip */
        }
      }
      if (stripW) {
        const tw = stripW - 16;
        const th = Math.round((tw * 9) / 16);
        camsOn.forEach((c, i) => drawTile(ctx, c, W - stripW + 8, 8 + i * (th + 8), tw, th));
      }
    } else if (cams.length) {
      const cols = Math.ceil(Math.sqrt(cams.length));
      const rows = Math.ceil(cams.length / cols);
      const gap = 8;
      const cw = (W - gap * (cols + 1)) / cols;
      const ch = (H - gap * (rows + 1)) / rows;
      cams.forEach((c, i) => {
        drawTile(ctx, c, gap + (i % cols) * (cw + gap), gap + Math.floor(i / cols) * (ch + gap), cw, ch);
      });
    }

    // tiny red dot so the viewer of the file knows it's a class recording
    ctx.fillStyle = "rgba(239,68,68,0.9)";
    ctx.beginPath();
    ctx.arc(24, 24, 7, 0, Math.PI * 2);
    ctx.fill();
  }, [sync]);

  const teardown = useCallback(() => {
    workerRef.current?.postMessage({ stop: true });
    workerRef.current?.terminate();
    workerRef.current = null;
    if (fallbackTimerRef.current !== null) window.clearInterval(fallbackTimerRef.current);
    fallbackTimerRef.current = null;
    for (const node of audioNodesRef.current.values()) {
      try {
        node.disconnect();
      } catch {
        /* ignore */
      }
    }
    audioNodesRef.current.clear();
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    audioDestRef.current = null;
    for (const el of videoElsRef.current.values()) disposeVideo(el);
    videoElsRef.current.clear();
    holderRef.current?.remove();
    holderRef.current = null;
    canvasRef.current = null;
    screensRef.current = [];
    camsRef.current = [];
  }, []);

  const start = useCallback(async () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") return;
    setError(null);
    setLastFile(null);
    try {
      const mimeType = pickMime();
      mimeRef.current = mimeType || "video/webm";
      const ext = mimeRef.current.includes("mp4") ? "mp4" : "webm";
      fileNameRef.current = `class-recording-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;

      // Desktop Chrome/Edge: let the teacher pick where to save and stream the
      // video straight into that file while recording — nothing is lost even if
      // the tab crashes, and long classes do not fill the browser's memory.
      writerRef.current = null;
      const w = window as unknown as {
        showSaveFilePicker?: (o: unknown) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }>;
      };
      if (w.showSaveFilePicker && !isMobile()) {
        try {
          const handle = await w.showSaveFilePicker({
            suggestedName: `${fileNameRef.current}.${ext}`,
            types: [{ description: "ক্লাস রেকর্ডিং", accept: { [`video/${ext}`]: [`.${ext}`] } }],
          });
          writerRef.current = await handle.createWritable();
          writeChainRef.current = Promise.resolve();
        } catch {
          // cancelled or not allowed here — fall back to saving in memory + download
          writerRef.current = null;
        }
      }
      setSavingToDisk(!!writerRef.current);

      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      canvasRef.current = canvas;

      // Created inside the click handler so the browser lets it run.
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioCtx.resume().catch(() => {});
      audioCtxRef.current = audioCtx;
      audioDestRef.current = audioCtx.createMediaStreamDestination();

      lastSyncRef.current = 0;
      pausedRef.current = false;
      sync();
      drawFrame();

      // Worker timer = not throttled when the class tab is in the background.
      try {
        const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
        const worker = new Worker(url);
        URL.revokeObjectURL(url);
        worker.onmessage = () => drawFrame();
        worker.postMessage({ start: true, ms: Math.round(1000 / FPS) });
        workerRef.current = worker;
      } catch {
        fallbackTimerRef.current = window.setInterval(drawFrame, Math.round(1000 / FPS));
      }

      const stream = new MediaStream([
        ...canvas.captureStream(FPS).getVideoTracks(),
        ...(audioDestRef.current?.stream.getAudioTracks() ?? []),
      ]);

      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 3_000_000,
        audioBitsPerSecond: 128_000,
      });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size === 0) return;
        const wr = writerRef.current;
        if (wr) {
          writeChainRef.current = writeChainRef.current.then(() => wr.write(e.data)).catch(() => {});
        } else {
          chunksRef.current.push(e.data);
        }
      };
      recorder.onstop = () => {
        const type = mimeRef.current.split(";")[0];
        const fext = type.includes("mp4") ? "mp4" : "webm";
        const wr = writerRef.current;
        writerRef.current = null;
        setSavingToDisk(false);
        if (wr) {
          // file is already on disk — just finish writing it
          writeChainRef.current.then(() => wr.close()).catch(() => {});
          chunksRef.current = [];
          teardown();
          return;
        }
        const blob = new Blob(chunksRef.current, { type });
        const url = URL.createObjectURL(blob);
        const name = `${fileNameRef.current}.${fext}`;
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // keep the file around so the "save again / share to gallery" buttons work
        setLastFile({ url, name, sizeMB: Math.round((blob.size / 1048576) * 10) / 10, mime: type });
        chunksRef.current = [];
        teardown();
      };
      recorder.onerror = () => setError("রেকর্ডিং-এ সমস্যা হয়েছে");

      recorder.start(1000);
      recorderRef.current = recorder;
      accumRef.current = 0;
      runStartRef.current = Date.now();
      setSeconds(0);
      setPaused(false);
      setRecording(true);
    } catch (err) {
      teardown();
      setError(err instanceof Error ? err.message : "রেকর্ডিং শুরু করা যায়নি");
    }
  }, [drawFrame, sync, teardown]);

  const stop = useCallback(() => {
    const r = recorderRef.current;
    if (r && r.state !== "inactive") r.stop();
    recorderRef.current = null;
    runStartRef.current = null;
    pausedRef.current = false;
    setPaused(false);
    setRecording(false);
  }, []);

  const togglePause = useCallback(() => {
    const r = recorderRef.current;
    if (!r) return;
    if (r.state === "recording") {
      r.pause();
      pausedRef.current = true;
      if (runStartRef.current) accumRef.current += Date.now() - runStartRef.current;
      runStartRef.current = null;
      setPaused(true);
    } else if (r.state === "paused") {
      r.resume();
      pausedRef.current = false;
      runStartRef.current = Date.now();
      setPaused(false);
    }
  }, []);

  // Elapsed seconds (computed from timestamps so it stays right even if the
  // tab's timers are throttled).
  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => {
      const running = runStartRef.current ? Date.now() - runStartRef.current : 0;
      setSeconds(Math.floor((accumRef.current + running) / 1000));
    }, 500);
    return () => window.clearInterval(id);
  }, [recording]);

  // Never lose a recording: save when the class ends / the page closes.
  useEffect(() => {
    const onDisc = () => stop();
    room.on("disconnected", onDisc);
    return () => {
      room.off("disconnected", onDisc);
    };
  }, [room, stop]);

  useEffect(() => {
    if (!recording) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [recording]);

  useEffect(() => {
    return () => {
      const r = recorderRef.current;
      if (r && r.state !== "inactive") r.stop();
      else teardown();
    };
  }, [teardown]);

  const saveLast = useCallback(() => {
    if (!lastFile) return;
    const a = document.createElement("a");
    a.href = lastFile.url;
    a.download = lastFile.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [lastFile]);

  /** Phones: opens the share sheet so the video can be saved to Gallery / Google Photos. */
  const shareLast = useCallback(async () => {
    if (!lastFile) return;
    try {
      const blob = await fetch(lastFile.url).then((r) => r.blob());
      const file = new File([blob], lastFile.name, { type: lastFile.mime });
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: "ক্লাস রেকর্ডিং" });
      } else {
        saveLast();
      }
    } catch {
      /* share sheet dismissed */
    }
  }, [lastFile, saveLast]);

  const dismissLast = useCallback(() => {
    if (lastFile) URL.revokeObjectURL(lastFile.url);
    setLastFile(null);
  }, [lastFile]);

  return {
    supported,
    lastFile,
    saveLast,
    shareLast: () => void shareLast(),
    dismissLast,
    savingToDisk,
    recording,
    paused,
    seconds,
    error,
    start: () => void start(),
    stop,
    togglePause,
  };
}

export function formatClock(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

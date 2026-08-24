"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Client-side, server-free recording. No S3 / cloud storage needed — the
 * teacher's own browser records the class tab (via getDisplayMedia, which
 * captures whatever is on screen including everyone's video, chat and
 * annotations) mixed with the teacher's microphone, and the finished file
 * downloads straight to their device when they stop.
 *
 * Note: getDisplayMedia-based tab recording is not available in Safari on
 * iOS — on that platform this button is hidden with a short explanation.
 */
export default function RecordingControl() {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported] = useState(
    () =>
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getDisplayMedia &&
      typeof MediaRecorder !== "undefined"
  );

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamsRef = useRef<MediaStream[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);

  function cleanupStreams() {
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streamsRef.current = [];
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }

  async function startRecording() {
    setError(null);
    try {
      // Ask the teacher to pick the tab/window to record — this is what
      // captures the whole class UI (video tiles, screen share, chat).
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      let micStream: MediaStream | null = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        // Mic permission declined — recording continues with just tab/system audio.
      }

      streamsRef.current = [displayStream, ...(micStream ? [micStream] : [])];

      // Mix tab audio + mic audio into one audio track so both are captured.
      let combinedStream: MediaStream;
      const audioTracks = [...displayStream.getAudioTracks(), ...(micStream?.getAudioTracks() ?? [])];
      if (audioTracks.length > 1) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const audioCtx = new AudioCtx();
        audioCtxRef.current = audioCtx;
        const dest = audioCtx.createMediaStreamDestination();
        audioTracks.forEach((track) => {
          const src = audioCtx.createMediaStreamSource(new MediaStream([track]));
          src.connect(dest);
        });
        combinedStream = new MediaStream([...displayStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
      } else {
        combinedStream = new MediaStream([...displayStream.getVideoTracks(), ...audioTracks]);
      }

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
        cleanupStreams();
      };

      // If the teacher stops sharing from the browser's own UI, end the recording too.
      displayStream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
        setRecording(false);
      });

      recorder.start(1000);
      recorderRef.current = recorder;
      setRecording(true);
    } catch (err) {
      cleanupStreams();
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
    };
  }, []);

  if (!supported) {
    return (
      <span className="text-xs text-zinc-500" title="এই ব্রাউজারে (যেমন iOS Safari) স্ক্রিন রেকর্ডিং সমর্থিত নয়">
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
          title="একটি ট্যাব/উইন্ডো বেছে নিতে বলা হবে — এই ক্লাসের ট্যাবটি বেছে নিন"
        >
          ● রেকর্ডিং শুরু করুন
        </button>
      )}
    </div>
  );
}

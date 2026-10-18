"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VideoTrack, type TrackReference } from "@livekit/components-react";
import AnnotationCanvas, { type ContentRect } from "@/components/AnnotationCanvas";

/**
 * Drawing board that lives inside the always-on-top floating window.
 * While the teacher is in Word / PDF, this shows the shared screen with the
 * same pen / highlighter / spotlight toolbox as the class page. Everything
 * drawn here is sent to the students and also shows on the class page.
 */
export default function PipDrawBoard({
  trackRef,
  onClose,
  onScroll,
}: {
  trackRef: TrackReference;
  onClose: () => void;
  /** scrolls the shared browser TAB (only works when a Chrome tab is being shared) */
  onScroll?: (dy: number) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const [resizeSignal, setResizeSignal] = useState(0);
  const bump = useCallback(() => setResizeSignal((v) => v + 1), []);

  const surface = (
    trackRef.publication?.track?.mediaStreamTrack?.getSettings() as { displaySurface?: string } | undefined
  )?.displaySurface;
  const mirrorRisk = surface === "monitor";
  const canScroll = !!onScroll && surface === "browser";

  const getContentRect = useCallback((): ContentRect | null => {
    const wrapper = wrapperRef.current;
    const video = videoElRef.current;
    if (!wrapper || !video || !video.videoWidth || !video.videoHeight) return null;
    const r = wrapper.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const va = video.videoWidth / video.videoHeight;
    const wa = r.width / r.height;
    let width: number;
    let height: number;
    if (va > wa) {
      width = r.width;
      height = width / va;
    } else {
      height = r.height;
      width = height * va;
    }
    return { left: r.left + (r.width - width) / 2, top: r.top + (r.height - height) / 2, width, height };
  }, []);

  useEffect(() => {
    const win = wrapperRef.current?.ownerDocument.defaultView;
    const v = videoElRef.current;
    win?.addEventListener("resize", bump);
    v?.addEventListener("resize", bump);
    return () => {
      win?.removeEventListener("resize", bump);
      v?.removeEventListener("resize", bump);
    };
  }, [bump]);

  return (
    <div ref={wrapperRef} className="relative h-screen w-screen overflow-hidden bg-black">
      <VideoTrack
        ref={videoElRef}
        trackRef={trackRef}
        onLoadedMetadata={bump}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
      {mirrorRisk ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-zinc-950 p-4 text-center text-sm text-zinc-200">
          পুরো স্ক্রিন শেয়ার হচ্ছে — এই অবস্থায় এখানে আঁকা যায় না। শেয়ার বন্ধ করে শুধু Word/PDF উইন্ডোটা শেয়ার করুন।
        </div>
      ) : (
        <AnnotationCanvas
          isHost
          passive
          locked={false}
          annotateMode
          onAnnotateModeChange={(v) => {
            if (!v) onClose();
          }}
          getContentRect={getContentRect}
          resizeSignal={resizeSignal}
        />
      )}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-2 top-2 z-40 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-emerald-500"
      >
        ✕ বন্ধ
      </button>
      {canScroll ? (
        <div className="absolute bottom-2 right-2 z-40 flex flex-col gap-1 rounded-lg bg-zinc-900/90 p-1 text-sm text-zinc-100 shadow-lg">
          <button type="button" onClick={() => onScroll?.(-800)} className="h-8 w-10 rounded hover:bg-zinc-700" title="আগের পেজ">⇈</button>
          <button type="button" onClick={() => onScroll?.(-120)} className="h-8 w-10 rounded hover:bg-zinc-700" title="একটু ওপরে">▲</button>
          <button type="button" onClick={() => onScroll?.(120)} className="h-8 w-10 rounded hover:bg-zinc-700" title="একটু নিচে">▼</button>
          <button type="button" onClick={() => onScroll?.(800)} className="h-8 w-10 rounded hover:bg-zinc-700" title="পরের পেজ">⇊</button>
        </div>
      ) : (
        <div className="pointer-events-none absolute bottom-1 left-1/2 z-40 -translate-x-1/2 rounded bg-black/70 px-2 py-0.5 text-[10px] text-zinc-300">
          পেজ বদলাতে Word/PDF-এ মাউস-হুইল ঘোরান — এই বোর্ড ডানে-নিচে আলাদা থাকে
        </div>
      )}
    </div>
  );
}

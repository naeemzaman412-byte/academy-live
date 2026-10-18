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
}: {
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

  const bump = useCallback(() => setResizeSignal((v) => v + 1), []);

  const getContentRect = useCallback((): ContentRect | null => {
    const wrapper = wrapperRef.current;
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

  return (
    <div
      ref={wrapperRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black"
    >
      <VideoTrack
        ref={videoElRef}
        trackRef={trackRef}
        onSubscriptionStatusChanged={() => bump()}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
        onLoadedMetadata={bump}
      />

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
        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-emerald-600/95 px-3 py-1 text-xs font-medium text-white shadow-lg">
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

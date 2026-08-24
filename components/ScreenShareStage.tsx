"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VideoTrack, type TrackReference } from "@livekit/components-react";
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
}: {
  trackRef: TrackReference;
  isHost: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const [resizeSignal, setResizeSignal] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const bump = useCallback(() => setResizeSignal((v) => v + 1), []);

  const getContentRect = useCallback((): ContentRect | null => {
    const wrapper = wrapperRef.current;
    const video = videoElRef.current;
    if (!wrapper || !video || !video.videoWidth || !video.videoHeight) return null;

    const wrapperRect = wrapper.getBoundingClientRect();
    const videoAspect = video.videoWidth / video.videoHeight;
    const wrapperAspect = wrapperRect.width / wrapperRect.height;

    let width: number;
    let height: number;
    if (videoAspect > wrapperAspect) {
      // Letterboxed top/bottom
      width = wrapperRect.width;
      height = width / videoAspect;
    } else {
      // Letterboxed left/right
      height = wrapperRect.height;
      width = height * videoAspect;
    }
    const left = wrapperRect.left + (wrapperRect.width - width) / 2;
    const top = wrapperRect.top + (wrapperRect.height - height) / 2;

    return { left, top, width, height };
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    let raf = 0;
    const observer = new ResizeObserver(() => {
      // Coalesce bursts of resize callbacks (ResizeObserver fires once
      // immediately on observe()) into a single state update per frame.
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

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(document.fullscreenElement === wrapperRef.current);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  function toggleFullscreen() {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      wrapper.requestFullscreen?.();
    }
  }

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

      <AnnotationCanvas isHost={isHost} getContentRect={getContentRect} resizeSignal={resizeSignal} />

      <button
        onClick={toggleFullscreen}
        className="absolute bottom-3 right-3 z-30 rounded-md border border-zinc-700 bg-zinc-900/90 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
      >
        {isFullscreen ? "⤡ ফুলস্ক্রিন বন্ধ করুন" : "⤢ ফুলস্ক্রিন"}
      </button>
    </div>
  );
}

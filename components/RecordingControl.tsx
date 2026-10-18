"use client";

import { formatClock, type ClassRecorder } from "@/components/useClassRecorder";

/**
 * Header badge: red REC timer while recording, and — after stopping — a
 * "your recording is ready" strip with Download / Share-to-Gallery buttons so
 * the file can never get lost.
 */
export default function RecordingControl({ recorder }: { recorder: ClassRecorder }) {
  if (recorder.recording) {
    return (
      <button
        type="button"
        onClick={recorder.togglePause}
        className="flex items-center gap-1.5 rounded-md bg-red-600/90 px-2.5 py-1 text-xs font-medium text-white"
        title={recorder.paused ? "রেকর্ডিং চালু করুন" : "রেকর্ডিং পজ করুন"}
      >
        <span className={`h-2 w-2 rounded-full bg-white ${recorder.paused ? "" : "animate-pulse"}`} />
        {recorder.paused ? "পজ" : "REC"} {formatClock(recorder.seconds)}
        {recorder.savingToDisk && <span className="hidden sm:inline"> · সেভ হচ্ছে</span>}
      </button>
    );
  }
  if (recorder.error) return <span className="text-xs text-red-400">{recorder.error}</span>;
  return null;
}

export function RecordingReadyBar({ recorder }: { recorder: ClassRecorder }) {
  const f = recorder.lastFile;
  if (!f) return null;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-700 bg-emerald-600/15 px-3 py-2 text-xs text-emerald-200">
      <span>
        ✓ রেকর্ডিং তৈরি হয়েছে ({f.sizeMB} MB)। ডাউনলোড না হলে নিচের বাটন চাপুন।
      </span>
      <span className="flex items-center gap-2">
        <button type="button" onClick={recorder.saveLast} className="rounded bg-emerald-600 px-3 py-1 font-medium text-white">
          ডাউনলোড
        </button>
        {canShare && (
          <button type="button" onClick={recorder.shareLast} className="rounded bg-indigo-600 px-3 py-1 font-medium text-white">
            গ্যালারিতে সেভ / শেয়ার
          </button>
        )}
        <button type="button" onClick={recorder.dismissLast} className="px-1 text-emerald-300" aria-label="বন্ধ">
          ✕
        </button>
      </span>
    </div>
  );
}

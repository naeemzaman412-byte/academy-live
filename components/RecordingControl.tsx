"use client";

import { formatClock, type ClassRecorder } from "@/components/useClassRecorder";

/**
 * Small red "REC" badge for the header. Recording itself is controlled from the
 * meeting toolbar / floating share bar (see useClassRecorder).
 */
export default function RecordingControl({ recorder }: { recorder: ClassRecorder }) {
  if (!recorder.recording && !recorder.error) return null;
  if (recorder.error && !recorder.recording) {
    return <span className="text-xs text-red-400">{recorder.error}</span>;
  }
  return (
    <button
      type="button"
      onClick={recorder.togglePause}
      className="flex items-center gap-1.5 rounded-md bg-red-600/90 px-2.5 py-1 text-xs font-medium text-white"
      title={recorder.paused ? "রেকর্ডিং চালু করুন" : "রেকর্ডিং পজ করুন"}
    >
      <span className={`h-2 w-2 rounded-full bg-white ${recorder.paused ? "" : "animate-pulse"}`} />
      {recorder.paused ? "পজ" : "REC"} {formatClock(recorder.seconds)}
    </button>
  );
}

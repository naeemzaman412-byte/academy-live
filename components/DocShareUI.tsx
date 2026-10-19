"use client";

import type { DocShareInfo } from "@/components/useDocShare";

/** Pick what to share when the browser cannot share the screen (phones) or on request. */
export function DocShareMenu({
  busy,
  onFiles,
  onBoard,
  onClose,
}: {
  busy: boolean;
  onFiles: (files: File[]) => void;
  onBoard: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-sm space-y-2 rounded-2xl bg-zinc-900 p-4 text-sm text-zinc-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-base font-semibold">ক্লাসে কী শেয়ার করবেন?</div>
        <p className="text-xs text-zinc-400">
          Word (.docx), PDF, ছবি বা সাদা বোর্ড শেয়ার করুন — ◀ ▶ দিয়ে পেজ বদলানো এবং আঁকা দুটোই চলবে।
        </p>
        <label className="block cursor-pointer rounded-xl bg-emerald-600 px-4 py-3 text-center font-medium hover:bg-emerald-500">
          📄 Word / PDF / ছবি বেছে নিন
          <input
            type="file"
            accept="application/pdf,image/*,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            multiple
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length) onFiles(files);
            }}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={onBoard}
          className="w-full rounded-xl bg-zinc-700 px-4 py-3 font-medium hover:bg-zinc-600"
        >
          ⬜ সাদা বোর্ড
        </button>
        <button type="button" onClick={onClose} className="w-full rounded-xl px-4 py-2 text-zinc-400 hover:text-zinc-200">
          বাতিল
        </button>
        {busy && <div className="text-center text-xs text-amber-300">লোড হচ্ছে…</div>}
      </div>
    </div>
  );
}

/** Page controls shown to the teacher while a document is being shared. */
export function DocShareBar({
  info,
  onGoto,
  onStop,
}: {
  info: DocShareInfo;
  onGoto: (page: number) => void;
  onStop: () => void;
}) {
  const multi = info.total > 1;
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute bottom-2 left-1/2 z-[38] flex max-w-[96%] -translate-x-1/2 items-center gap-1 rounded-full bg-zinc-900/95 px-2 py-1 text-sm text-zinc-100 shadow-lg"
    >
      {multi && (
        <>
          <button
            type="button"
            disabled={info.page <= 0}
            onClick={() => onGoto(info.page - 1)}
            className="h-9 w-10 rounded-full text-lg hover:bg-zinc-700 disabled:opacity-30"
            title="আগের পেজ"
          >
            ◀
          </button>
          <span className="min-w-14 text-center text-xs tabular-nums">
            {info.page + 1} / {info.total}
          </span>
          <button
            type="button"
            disabled={info.page >= info.total - 1}
            onClick={() => onGoto(info.page + 1)}
            className="h-9 w-10 rounded-full text-lg hover:bg-zinc-700 disabled:opacity-30"
            title="পরের পেজ"
          >
            ▶
          </button>
        </>
      )}
      {!multi && <span className="px-2 text-xs">{info.name}</span>}
      <button type="button" onClick={onStop} className="ml-1 rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold hover:bg-red-500">
        বন্ধ
      </button>
    </div>
  );
}

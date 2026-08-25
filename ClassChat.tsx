"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@livekit/components-react";

/**
 * Custom chat panel (replaces the library's <Chat /> prefab).
 *
 * Why a custom component: the message form must NEVER be allowed to submit
 * as a real HTML form navigation. Every submit path here explicitly calls
 * both preventDefault() and stopPropagation() so a stray Enter press or
 * Send click can't bubble into a page-level form, trigger a reload, or tear
 * down the LiveKitRoom connection (which would boot the sender from the
 * call). Message state is local to this component and never touches the
 * room connection lifecycle.
 */
export default function ClassChat() {
  const { chatMessages, send, isSending } = useChat();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages]);

  async function sendDraft(e?: React.SyntheticEvent) {
    // Stop this from ever behaving like a real form submission — no reload,
    // no bubbling to any ancestor form/handler, no room disconnect.
    e?.preventDefault();
    e?.stopPropagation();

    const text = draft.trim();
    if (!text || isSending) return;

    setDraft("");
    try {
      await send(text);
    } catch {
      // Keep the draft so the teacher/student can retry instead of losing the message.
      setDraft(text);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        ref={listRef}
        style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px" }}
        className="flex flex-col gap-2 text-sm"
      >
        {chatMessages.length === 0 && (
          <p className="text-xs text-zinc-500">এখনো কোনো মেসেজ নেই। প্রথম মেসেজ লিখুন।</p>
        )}
        {chatMessages.map((msg) => (
          <div key={msg.id ?? msg.timestamp} className="rounded-lg bg-zinc-800/70 px-3 py-2">
            <div className="mb-0.5 text-xs font-medium text-indigo-300">
              {msg.from?.name || msg.from?.identity || "অজানা"}
            </div>
            <div className="whitespace-pre-wrap break-words text-zinc-100">{msg.message}</div>
          </div>
        ))}
      </div>

      {/*
        noValidate + explicit preventDefault/stopPropagation on both the form
        and the button guarantee this never falls back to a native
        full-page submit, even if JS briefly fails to attach in time.
      */}
      <form
        noValidate
        onSubmit={sendDraft}
        className="flex gap-2 border-t border-zinc-800 p-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.stopPropagation();
              sendDraft();
            }
          }}
          placeholder="মেসেজ লিখুন..."
          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={isSending || !draft.trim()}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          পাঠান
        </button>
      </form>
    </div>
  );
}

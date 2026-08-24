"use client";

import { useState } from "react";
import { useRoomContext, useRemoteParticipants } from "@livekit/components-react";

export default function HostParticipantPanel({ roomName }: { roomName: string }) {
  const room = useRoomContext();
  const remoteParticipants = useRemoteParticipants();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function callModeration(action: "mute" | "remove", identity: string) {
    setBusyId(identity);
    try {
      await fetch("/api/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, roomName, participantIdentity: identity }),
      });
    } finally {
      setBusyId(null);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
      >
        পার্টিসিপ্যান্ট ({remoteParticipants.length + 1})
      </button>
    );
  }

  return (
    <div className="absolute right-3 top-12 z-50 w-72 rounded-lg border border-zinc-800 bg-zinc-900 p-3 shadow-xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">পার্টিসিপ্যান্ট তালিকা</span>
        <button onClick={() => setOpen(false)} className="text-zinc-500 hover:text-zinc-300">
          ✕
        </button>
      </div>
      <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
        <div className="flex items-center justify-between rounded-md bg-zinc-800/60 px-2 py-1.5 text-sm">
          <span>{room.localParticipant.name ?? room.localParticipant.identity} (আপনি)</span>
        </div>
        {remoteParticipants.map((p) => (
          <div
            key={p.identity}
            className="flex items-center justify-between rounded-md bg-zinc-800/60 px-2 py-1.5 text-sm"
          >
            <span className="truncate">{p.name ?? p.identity}</span>
            <div className="flex gap-1">
              <button
                disabled={busyId === p.identity}
                onClick={() => callModeration("mute", p.identity)}
                className="rounded border border-zinc-700 px-1.5 py-0.5 text-xs hover:bg-zinc-700 disabled:opacity-50"
              >
                মিউট
              </button>
              <button
                disabled={busyId === p.identity}
                onClick={() => callModeration("remove", p.identity)}
                className="rounded border border-red-800 px-1.5 py-0.5 text-xs text-red-400 hover:bg-red-900/40 disabled:opacity-50"
              >
                বের করুন
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

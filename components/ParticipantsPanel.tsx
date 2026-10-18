"use client";

import { useState } from "react";
import { useParticipants, useIsMuted } from "@livekit/components-react";
import { Track, type Participant } from "livekit-client";
import { CamIcon, MicIcon } from "@/components/icons";

function Row({
  p,
  isSelf,
  isHost,
  busy,
  onAction,
}: {
  p: Participant;
  isSelf: boolean;
  isHost: boolean;
  busy: boolean;
  onAction: (a: "mute" | "remove", id: string) => void;
}) {
  const micMuted = useIsMuted({ participant: p, source: Track.Source.Microphone });
  const camMuted = useIsMuted({ participant: p, source: Track.Source.Camera });
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-zinc-800/60 px-2 py-1.5 text-sm">
      <span className="min-w-0 flex-1 truncate">
        {p.name || p.identity}
        {isSelf && " (আপনি)"}
      </span>
      <span className="flex items-center gap-1 text-zinc-400">
        <span className="scale-75">
          <MicIcon off={micMuted} />
        </span>
        <span className="scale-75">
          <CamIcon off={camMuted} />
        </span>
      </span>
      {isHost && !isSelf && (
        <div className="flex gap-1">
          <button
            disabled={busy}
            onClick={() => onAction("mute", p.identity)}
            className="rounded border border-zinc-700 px-1.5 py-0.5 text-xs hover:bg-zinc-700 disabled:opacity-50"
          >
            মিউট
          </button>
          <button
            disabled={busy}
            onClick={() => onAction("remove", p.identity)}
            className="rounded border border-red-800 px-1.5 py-0.5 text-xs text-red-400 hover:bg-red-900/40 disabled:opacity-50"
          >
            বের করুন
          </button>
        </div>
      )}
    </div>
  );
}

/** Participant list for everyone; the teacher also gets mute / remove buttons. */
export default function ParticipantsPanel({ roomName, isHost }: { roomName: string; isHost: boolean }) {
  const participants = useParticipants();
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

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-3">
      {participants.map((p) => (
        <Row
          key={p.identity}
          p={p}
          isSelf={p.isLocal}
          isHost={isHost}
          busy={busyId === p.identity}
          onAction={callModeration}
        />
      ))}
    </div>
  );
}

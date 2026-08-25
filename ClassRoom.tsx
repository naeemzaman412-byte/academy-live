"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  ControlBar,
  useRoomContext,
  useTracks,
  isTrackReference,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import RecordingControl from "@/components/RecordingControl";
import ClassTimer from "@/components/ClassTimer";
import HostParticipantPanel from "@/components/HostParticipantPanel";
import ParticipantGrid from "@/components/ParticipantGrid";
import ScreenShareStage from "@/components/ScreenShareStage";
import FloatingCameraStrip from "@/components/FloatingCameraStrip";
import ClassChat from "@/components/ClassChat";

// Always share the production URL — never window.location.origin, which on a
// Vercel preview deployment resolves to the auto-generated preview
// subdomain. A student opening that link lands on Vercel's dashboard login
// instead of the class.
const PRODUCTION_ORIGIN = "https://academy-liveclass.vercel.app";

type StoredJoinInfo = {
  name: string;
  role: "host" | "student";
  token?: string; // pre-fetched for hosts (created via /api/room/create or /api/room/host-rejoin)
};

export default function ClassRoom({ roomName }: { roomName: string }) {
  const router = useRouter();

  const [joinInfo] = useState<StoredJoinInfo | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem(`academy-live:${roomName}`);
    return raw ? (JSON.parse(raw) as StoredJoinInfo) : null;
  });
  const [token, setToken] = useState<string | null>(() => joinInfo?.token ?? null);
  const [error, setError] = useState<string | null>(null);

  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  useEffect(() => {
    // No name entered for this room in this browser tab — send back to the join screen.
    if (!joinInfo) {
      router.replace("/");
    }
  }, [joinInfo, router]);

  useEffect(() => {
    if (!joinInfo || joinInfo.token) return;

    let cancelled = false;
    async function fetchStudentToken(info: StoredJoinInfo) {
      try {
        const res = await fetch("/api/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomName, participantName: info.name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Token request failed");
        if (!cancelled) setToken(data.token);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      }
    }

    fetchStudentToken(joinInfo);
    return () => {
      cancelled = true;
    };
  }, [joinInfo, roomName]);

  const isHost = joinInfo?.role === "host";

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-red-400">সংযোগ করা যায়নি: {error}</p>
        <button
          onClick={() => router.replace("/")}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm"
        >
          হোমে ফিরে যান
        </button>
      </div>
    );
  }

  if (!livekitUrl) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-amber-300">
        NEXT_PUBLIC_LIVEKIT_URL সেট করা নেই। .env.local ফাইলে এটি বসান (README দেখুন)।
      </div>
    );
  }

  if (!token || !joinInfo) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-zinc-400">
        ক্লাসে যুক্ত হওয়া হচ্ছে...
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={livekitUrl}
      connect
      data-lk-theme="default"
      style={{ height: "100dvh", display: "flex", flexDirection: "column" }}
      onDisconnected={() => router.replace("/")}
    >
      <RoomAudioRenderer />
      <RoomInner roomName={roomName} isHost={isHost} />
    </LiveKitRoom>
  );
}

function RoomInner({ roomName, isHost }: { roomName: string; isHost: boolean }) {
  const [chatOpen, setChatOpen] = useState(false);

  const screenShareTracks = useTracks([{ source: Track.Source.ScreenShare, withPlaceholder: false }], {
    onlySubscribed: false,
  });
  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], {
    onlySubscribed: false,
  });

  const firstScreenShare = screenShareTracks[0];
  const activeScreenShare = firstScreenShare && isTrackReference(firstScreenShare) ? firstScreenShare : null;

  return (
    <>
      <RoomHeader
        roomName={roomName}
        isHost={isHost}
        chatOpen={chatOpen}
        onToggleChat={() => setChatOpen((v) => !v)}
      />
      <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex" }}>
        <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
          {activeScreenShare ? (
            <>
              <ScreenShareStage trackRef={activeScreenShare} isHost={isHost} />
              <FloatingCameraStrip tracks={cameraTracks} />
            </>
          ) : (
            <ParticipantGrid />
          )}
        </div>
        {chatOpen && (
          <div style={{ width: 320, flexShrink: 0, borderLeft: "1px solid #27272a" }}>
            <ClassChat />
          </div>
        )}
      </div>
      <ControlBar controls={{ microphone: true, camera: true, screenShare: true, chat: false, leave: true }} />
    </>
  );
}

function RoomHeader({
  roomName,
  isHost,
  chatOpen,
  onToggleChat,
}: {
  roomName: string;
  isHost: boolean;
  chatOpen: boolean;
  onToggleChat: () => void;
}) {
  const room = useRoomContext();
  const [participantCount, setParticipantCount] = useState(1);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    function updateCount() {
      setParticipantCount(room.numParticipants);
    }
    updateCount();
    room.on("participantConnected", updateCount);
    room.on("participantDisconnected", updateCount);
    return () => {
      room.off("participantConnected", updateCount);
      room.off("participantDisconnected", updateCount);
    };
  }, [room]);

  function copyStudentLink() {
    const url = `${PRODUCTION_ORIGIN}/?room=${encodeURIComponent(roomName)}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-2 text-sm">
      <div className="flex items-center gap-3 truncate">
        <span className="font-medium truncate">{roomName}</span>
        <span className="text-zinc-500">{participantCount} জন যুক্ত আছেন</span>
        <ClassTimer />
      </div>
      <div className="flex items-center gap-2">
        {isHost && (
          <button
            onClick={copyStudentLink}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
          >
            {linkCopied ? "✓ লিংক কপি হয়েছে" : "🔗 স্টুডেন্ট লিংক শেয়ার করুন"}
          </button>
        )}
        <button
          onClick={onToggleChat}
          className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
            chatOpen ? "border-indigo-500 bg-indigo-500/10 text-indigo-300" : "border-zinc-700 text-zinc-200 hover:bg-zinc-800"
          }`}
        >
          💬 চ্যাট
        </button>
        {isHost && <HostParticipantPanel roomName={roomName} />}
        {isHost && <RecordingControl />}
      </div>
    </div>
  );
}

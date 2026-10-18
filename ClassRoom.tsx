"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
  useTracks,
  isTrackReference,
} from "@livekit/components-react";
import { ScreenSharePresets, Track } from "livekit-client";
import RecordingControl from "@/components/RecordingControl";
import ClassTimer from "@/components/ClassTimer";
import ParticipantGrid from "@/components/ParticipantGrid";
import ParticipantsPanel from "@/components/ParticipantsPanel";
import ClassChat from "@/components/ClassChat";
import ScreenShareStage from "@/components/ScreenShareStage";
import FloatingCameraStrip from "@/components/FloatingCameraStrip";
import MeetingToolbar, { FloatingShareBar, type VideoPanelMode } from "@/components/MeetingToolbar";
import { CloseIcon } from "@/components/icons";
import { useClassRecorder } from "@/components/useClassRecorder";
import { usePip } from "@/components/usePip";

// Student links must never point at a Vercel *preview* deployment (those land
// on Vercel's login page). On the normal production URL we just use the
// current origin; on a preview URL we fall back to the production address.
const PRODUCTION_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL || "https://academy-live-blond.vercel.app";

function shareOrigin() {
  const { hostname, origin } = window.location;
  const isPreview = /-git-/.test(hostname) || /-[a-z0-9]{8,}-[a-z0-9-]+\.vercel\.app$/.test(hostname);
  return isPreview ? PRODUCTION_ORIGIN : origin;
}

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
  const room = useRoomContext();
  const router = useRouter();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } =
    useLocalParticipant();
  const participants = useParticipants();
  const recorder = useClassRecorder(room);
  const pip = usePip();

  const [panel, setPanel] = useState<"chat" | "participants" | null>(null);
  const [unreadChat, setUnreadChat] = useState(0);
  const [videoMode, setVideoMode] = useState<VideoPanelMode>("floating");
  const [annotating, setAnnotating] = useState(false);
  const [sharePaused, setSharePaused] = useState(false);
  const [shareSound, setShareSound] = useState(true);
  const [optimizeVideo, setOptimizeVideo] = useState(false);
  const [floatHidden, setFloatHidden] = useState(false);
  const [pipBlocked, setPipBlocked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [canShareScreen] = useState(
    () => typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function"
  );

  const screenShareTracks = useTracks([{ source: Track.Source.ScreenShare, withPlaceholder: false }], {
    onlySubscribed: false,
  });
  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], {
    onlySubscribed: false,
  });

  const firstScreenShare = screenShareTracks[0];
  const activeScreenShare = firstScreenShare && isTrackReference(firstScreenShare) ? firstScreenShare : null;
  const isLocalShare = !!activeScreenShare?.participant.isLocal;
  // derived, so they reset by themselves when the share ends
  const annotatingOn = annotating && !!activeScreenShare;
  const pausedOn = sharePaused && isScreenShareEnabled;

  function flash(msg: string) {
    setNotice(msg);
    window.setTimeout(() => setNotice((n) => (n === msg ? null : n)), 4500);
  }

  async function toggleMic() {
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch {
      flash("মাইক চালু করা যায়নি — ব্রাউজারের মাইক পারমিশন দিন");
    }
  }

  async function toggleCam() {
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } catch {
      flash("ক্যামেরা চালু করা যায়নি — ব্রাউজারের ক্যামেরা পারমিশন দিন");
    }
  }

  async function toggleShare() {
    try {
      if (isScreenShareEnabled) {
        await localParticipant.setScreenShareEnabled(false);
        setSharePaused(false);
      } else {
        setSharePaused(false);
        await localParticipant.setScreenShareEnabled(true, {
          audio: shareSound,
          contentHint: optimizeVideo ? "motion" : "detail",
          resolution: (optimizeVideo ? ScreenSharePresets.h1080fps30 : ScreenSharePresets.h1080fps15).resolution,
        });
        setFloatHidden(false);
      }
    } catch (err) {
      // user cancelled the browser's picker — nothing to report
      if (err instanceof Error && err.name !== "NotAllowedError") flash("স্ক্রিন শেয়ার শুরু করা যায়নি");
    }
  }

  async function togglePauseShare() {
    const pub = localParticipant.getTrackPublication(Track.Source.ScreenShare);
    if (!pub) return;
    try {
      if (pausedOn) await pub.unmute();
      else await pub.mute();
      setSharePaused(!pausedOn);
    } catch {
      flash("শেয়ার পজ করা যায়নি");
    }
  }

  function togglePanel(p: "chat" | "participants") {
    setPanel((cur) => (cur === p ? null : p));
  }

  function fullscreen() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.();
    } catch {
      /* not supported (e.g. iPhone Safari) */
    }
  }

  function copyStudentLink() {
    const url = `${shareOrigin()}/?room=${encodeURIComponent(roomName)}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  function leave() {
    if (recorder.recording && !window.confirm("রেকর্ডিং চলছে। ক্লাস ছাড়লে রেকর্ডিং সেভ হয়ে যাবে। ছাড়বেন?")) return;
    room.disconnect();
    router.replace("/");
  }

  // Floating (always-on-top) Zoom-style controls while this user shares.
  const { open: openPip, close: closePip, supported: pipSupported, pipWindow } = pip;
  useEffect(() => {
    if (isScreenShareEnabled && pipSupported && !floatHidden) {
      openPip().then((ok) => setPipBlocked(!ok));
    } else {
      closePip();
    }
  }, [isScreenShareEnabled, pipSupported, floatHidden, openPip, closePip]);

  // Ctrl+Alt+Shift+H toggles the floating controls (same as Zoom).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.altKey && e.shiftKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setFloatHidden((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showStrip = !!activeScreenShare && videoMode === "strip";
  const showFloating = !!activeScreenShare && videoMode === "floating";

  return (
    <>
      <RoomHeader
        roomName={roomName}
        isHost={isHost}
        count={participants.length}
        recorder={recorder}
        linkCopied={linkCopied}
        onCopyLink={copyStudentLink}
      />

      {notice && (
        <div className="pointer-events-none absolute left-1/2 top-14 z-[70] -translate-x-1/2 rounded-lg bg-zinc-800 px-4 py-2 text-xs text-zinc-100 shadow-xl">
          {notice}
        </div>
      )}

      {isScreenShareEnabled && pipSupported && !pipWindow && !floatHidden && pipBlocked && (
        <button
          type="button"
          onClick={() => openPip().then((ok) => setPipBlocked(!ok))}
          className="border-b border-emerald-700 bg-emerald-600/20 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-600/30"
        >
          ▣ ভাসমান কন্ট্রোল বার খুলুন — অন্য উইন্ডোতে গেলেও মাইক, ভিডিও, রেকর্ড ও শেয়ার বন্ধের বাটন সামনে থাকবে
        </button>
      )}

      <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex" }}>
        <div className="relative flex min-w-0 flex-1 flex-col">
          {showStrip && <FloatingCameraStrip tracks={cameraTracks} mode="strip" />}
          <div className="relative min-h-0 flex-1">
            {activeScreenShare ? (
              <>
                <ScreenShareStage
                  trackRef={activeScreenShare}
                  isHost={isHost}
                  isLocalShare={isLocalShare}
                  annotateMode={annotatingOn}
                  onAnnotateModeChange={setAnnotating}
                  onStopShare={toggleShare}
                  presenterName={activeScreenShare.participant.name || activeScreenShare.participant.identity}
                />
                {showFloating && <FloatingCameraStrip tracks={cameraTracks} mode="floating" />}
              </>
            ) : (
              <ParticipantGrid />
            )}
          </div>
        </div>

        {/* Side panel on desktop, full-screen sheet on phones. Chat stays mounted so no message is lost. */}
        <aside
          className={
            panel
              ? "absolute inset-0 z-50 flex flex-col bg-zinc-950 md:static md:inset-auto md:w-80 md:shrink-0 md:border-l md:border-zinc-800"
              : "hidden"
          }
        >
          <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2 text-sm font-medium">
            <span>{panel === "chat" ? "চ্যাট" : `অংশগ্রহণকারী (${participants.length})`}</span>
            <button
              type="button"
              onClick={() => setPanel(null)}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              aria-label="বন্ধ করুন"
            >
              <CloseIcon />
            </button>
          </div>
          <div className={panel === "chat" ? "min-h-0 flex-1" : "hidden"}>
            <ClassChat open={panel === "chat"} onUnreadChange={setUnreadChat} />
          </div>
          {panel === "participants" && (
            <div className="min-h-0 flex-1">
              <ParticipantsPanel roomName={roomName} isHost={isHost} />
            </div>
          )}
        </aside>
      </div>

      <MeetingToolbar
        isHost={isHost}
        micOn={isMicrophoneEnabled}
        camOn={isCameraEnabled}
        sharing={isScreenShareEnabled}
        sharePaused={pausedOn}
        canShareScreen={canShareScreen}
        annotating={annotatingOn}
        participantCount={participants.length}
        unreadChat={unreadChat}
        panel={panel}
        videoMode={videoMode}
        hasShareOnStage={!!activeScreenShare}
        recorder={recorder}
        shareSound={shareSound}
        optimizeVideo={optimizeVideo}
        floatingControlsSupported={pipSupported}
        floatingControlsHidden={floatHidden}
        onToggleMic={toggleMic}
        onToggleCam={toggleCam}
        onToggleShare={toggleShare}
        onTogglePauseShare={togglePauseShare}
        onToggleAnnotate={() => setAnnotating(!annotatingOn)}
        onTogglePanel={togglePanel}
        onVideoMode={setVideoMode}
        onToggleShareSound={() => setShareSound((v) => !v)}
        onToggleOptimize={() => setOptimizeVideo((v) => !v)}
        onToggleFloatingControls={() => setFloatHidden((v) => !v)}
        onFullscreen={fullscreen}
        onCopyLink={isHost ? copyStudentLink : undefined}
        linkCopied={linkCopied}
        onLeave={leave}
      />

      {pipWindow &&
        createPortal(
          <FloatingShareBar
            micOn={isMicrophoneEnabled}
            camOn={isCameraEnabled}
            sharePaused={pausedOn}
            recorder={recorder}
            isHost={isHost}
            participantCount={participants.length}
            onToggleMic={toggleMic}
            onToggleCam={toggleCam}
            onTogglePauseShare={togglePauseShare}
            onStopShare={toggleShare}
            onShowMeeting={() => window.focus()}
            onHide={() => setFloatHidden(true)}
          />,
          pipWindow.document.body
        )}
    </>
  );
}

function RoomHeader({
  roomName,
  isHost,
  count,
  recorder,
  linkCopied,
  onCopyLink,
}: {
  roomName: string;
  isHost: boolean;
  count: number;
  recorder: ReturnType<typeof useClassRecorder>;
  linkCopied: boolean;
  onCopyLink: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-950 px-3 py-2 text-sm">
      <div className="flex min-w-0 items-center gap-3">
        <span className="truncate font-medium">{roomName}</span>
        <span className="shrink-0 text-zinc-500">{count} জন</span>
        <ClassTimer />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isHost && <RecordingControl recorder={recorder} />}
        {isHost && (
          <button
            onClick={onCopyLink}
            className="hidden rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 sm:block"
          >
            {linkCopied ? "✓ লিংক কপি হয়েছে" : "🔗 স্টুডেন্ট লিংক"}
          </button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CamIcon,
  ChatIcon,
  CloseIcon,
  EyeIcon,
  FullscreenIcon,
  LayoutIcon,
  LeaveIcon,
  MicIcon,
  MoreIcon,
  PauseIcon,
  PenIcon,
  PeopleIcon,
  PlayIcon,
  RecIcon,
  ShareIcon,
  StopIcon,
} from "@/components/icons";
import { formatClock, type ClassRecorder } from "@/components/useClassRecorder";

export type VideoPanelMode = "floating" | "strip" | "hidden";

/** One Zoom-style toolbar button: icon on top, small label under it. */
export function TBtn({
  icon,
  label,
  onClick,
  active,
  danger,
  success,
  badge,
  disabled,
  title,
  hideLabelOnMobile = true,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
  success?: boolean;
  badge?: number | string;
  disabled?: boolean;
  title?: string;
  hideLabelOnMobile?: boolean;
}) {
  const tone = danger
    ? "bg-red-600 text-white hover:bg-red-500"
    : success
      ? "text-emerald-400 hover:bg-zinc-700/70"
      : active
        ? "bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30"
        : "text-zinc-100 hover:bg-zinc-700/70";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={label}
      className={`relative flex min-w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 transition disabled:opacity-40 sm:min-w-14 sm:px-2.5 ${tone}`}
    >
      {icon}
      <span className={`text-[10px] leading-tight sm:text-[11px] ${hideLabelOnMobile ? "hidden min-[420px]:block" : ""}`}>
        {label}
      </span>
      {badge !== undefined && badge !== 0 && badge !== "" && (
        <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

export type ToolbarProps = {
  isHost: boolean;
  micOn: boolean;
  camOn: boolean;
  sharing: boolean;
  sharePaused: boolean;
  canShareScreen: boolean;
  annotating: boolean;
  participantCount: number;
  unreadChat: number;
  panel: "chat" | "participants" | null;
  videoMode: VideoPanelMode;
  hasShareOnStage: boolean;
  recorder: ClassRecorder;
  shareSound: boolean;
  optimizeVideo: boolean;
  floatingControlsSupported: boolean;
  floatingControlsHidden: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleShare: () => void;
  onTogglePauseShare: () => void;
  onToggleAnnotate: () => void;
  onTogglePanel: (p: "chat" | "participants") => void;
  onVideoMode: (m: VideoPanelMode) => void;
  onToggleShareSound: () => void;
  onToggleOptimize: () => void;
  onToggleFloatingControls: () => void;
  onFullscreen: () => void;
  onCopyLink?: () => void;
  linkCopied?: boolean;
  onLeave: () => void;
};

function MenuItem({
  children,
  onClick,
  checked,
  danger,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  checked?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] hover:bg-zinc-700/80 disabled:opacity-40 ${
        danger ? "text-red-400" : "text-zinc-100"
      }`}
    >
      <span className="w-4 shrink-0 text-center text-emerald-400">{checked ? "✓" : ""}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

function Popover({
  open,
  onClose,
  children,
  align = "right",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: "left" | "right" | "center";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open, onClose]);
  if (!open) return null;
  const pos = align === "right" ? "right-0" : align === "left" ? "left-0" : "left-1/2 -translate-x-1/2";
  return (
    <div
      ref={ref}
      className={`absolute bottom-full z-[60] mb-2 w-64 max-w-[calc(100vw-1rem)] rounded-xl border border-zinc-700 bg-zinc-900 p-1.5 shadow-2xl ${pos}`}
    >
      {children}
    </div>
  );
}

/** Bottom meeting bar — same on desktop and mobile (labels collapse on narrow screens). */
export default function MeetingToolbar(p: ToolbarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const rec = p.recorder;

  return (
    <div className="relative z-40 border-t border-zinc-800 bg-zinc-900 px-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-1.5 sm:px-3">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-1">
        {/* left group */}
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          <TBtn
            icon={<MicIcon off={!p.micOn} />}
            label={p.micOn ? "মিউট" : "আনমিউট"}
            onClick={p.onToggleMic}
            hideLabelOnMobile
          />
          <TBtn
            icon={<CamIcon off={!p.camOn} />}
            label={p.camOn ? "ভিডিও বন্ধ" : "ভিডিও চালু"}
            onClick={p.onToggleCam}
          />
          <TBtn
            icon={<PeopleIcon />}
            label="অংশগ্রহণকারী"
            badge={p.participantCount}
            active={p.panel === "participants"}
            onClick={() => p.onTogglePanel("participants")}
          />
          <TBtn
            icon={<ChatIcon />}
            label="চ্যাট"
            badge={p.panel === "chat" ? 0 : p.unreadChat}
            active={p.panel === "chat"}
            onClick={() => p.onTogglePanel("chat")}
          />
        </div>

        {/* centre group — sharing */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          {p.canShareScreen &&
            (p.sharing ? (
              <>
                <TBtn
                  icon={p.sharePaused ? <PlayIcon /> : <PauseIcon />}
                  label={p.sharePaused ? "চালু করুন" : "পজ"}
                  onClick={p.onTogglePauseShare}
                  active={p.sharePaused}
                  title="শেয়ার পজ / চালু"
                />
                <TBtn icon={<StopIcon />} label="শেয়ার বন্ধ" danger onClick={p.onToggleShare} />
              </>
            ) : (
              <TBtn icon={<ShareIcon />} label="শেয়ার" success onClick={p.onToggleShare} title="স্ক্রিন শেয়ার করুন" />
            ))}

          {p.isHost && p.hasShareOnStage && (
            <div className="hidden sm:block">
              <TBtn
                icon={<PenIcon />}
                label="আঁকুন"
                active={p.annotating}
                onClick={p.onToggleAnnotate}
                title="শেয়ার করা স্ক্রিনের ওপর আঁকুন"
              />
            </div>
          )}

          <div className="relative hidden sm:block">
            <TBtn
              icon={<LayoutIcon />}
              label="লেআউট"
              active={layoutOpen}
              onClick={() => {
                setMoreOpen(false);
                setLayoutOpen((v) => !v);
              }}
            />
            <Popover open={layoutOpen} onClose={() => setLayoutOpen(false)} align="center">
              <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-zinc-500">ভিডিও প্যানেল</div>
              <MenuItem checked={p.videoMode === "floating"} onClick={() => { p.onVideoMode("floating"); setLayoutOpen(false); }}>
                ভাসমান (কোনায় সরানো যায়)
              </MenuItem>
              <MenuItem checked={p.videoMode === "strip"} onClick={() => { p.onVideoMode("strip"); setLayoutOpen(false); }}>
                ওপরে সারিবদ্ধ
              </MenuItem>
              <MenuItem checked={p.videoMode === "hidden"} onClick={() => { p.onVideoMode("hidden"); setLayoutOpen(false); }}>
                ভিডিও প্যানেল লুকান
              </MenuItem>
            </Popover>
          </div>

          {p.isHost && rec.supported && (
            <TBtn
              icon={<RecIcon active={rec.recording} />}
              label={rec.recording ? formatClock(rec.seconds) : "রেকর্ড"}
              active={rec.recording}
              onClick={rec.recording ? rec.stop : rec.start}
              title={rec.recording ? "রেকর্ডিং বন্ধ করে সেভ করুন" : "রেকর্ডিং শুরু করুন"}
              hideLabelOnMobile={false}
            />
          )}

          <div className="relative">
            <TBtn
              icon={<MoreIcon />}
              label="আরও"
              active={moreOpen}
              onClick={() => {
                setLayoutOpen(false);
                setMoreOpen((v) => !v);
              }}
            />
            <Popover open={moreOpen} onClose={() => setMoreOpen(false)}>
              {p.isHost && (
                rec.supported ? (
                  <>
                    <MenuItem onClick={() => { (rec.recording ? rec.stop : rec.start)(); setMoreOpen(false); }}>
                      {rec.recording ? "রেকর্ডিং বন্ধ ও সেভ করুন" : "রেকর্ডিং শুরু করুন"}
                    </MenuItem>
                    {rec.recording && (
                      <MenuItem onClick={() => { rec.togglePause(); setMoreOpen(false); }}>
                        {rec.paused ? "রেকর্ডিং চালু করুন" : "রেকর্ডিং পজ করুন"}
                      </MenuItem>
                    )}
                  </>
                ) : (
                  <div className="px-3 py-2 text-xs text-zinc-500">এই ব্রাউজারে রেকর্ডিং সমর্থিত নয়</div>
                )
              )}
              <div className="my-1 border-t border-zinc-800" />
              {/* these two live in the bar on bigger screens; on phones they are here */}
              <div className="sm:hidden">
                {p.isHost && p.hasShareOnStage && (
                  <MenuItem checked={p.annotating} onClick={() => { p.onToggleAnnotate(); setMoreOpen(false); }}>
                    শেয়ার করা স্ক্রিনে আঁকুন
                  </MenuItem>
                )}
                <MenuItem checked={p.videoMode === "strip"} onClick={() => { p.onVideoMode(p.videoMode === "strip" ? "floating" : "strip"); setMoreOpen(false); }}>
                  ভিডিও ওপরে সারিতে দেখান
                </MenuItem>
              </div>
              {p.canShareScreen && (
                <>
                  <MenuItem checked={p.shareSound} onClick={p.onToggleShareSound}>
                    কম্পিউটারের সাউন্ড শেয়ার করুন
                  </MenuItem>
                  <MenuItem checked={p.optimizeVideo} onClick={p.onToggleOptimize}>
                    ভিডিও শেয়ারের জন্য অপ্টিমাইজ করুন
                  </MenuItem>
                  {p.sharing && <div className="px-3 pb-1 text-[11px] text-zinc-500">পরের শেয়ার থেকে প্রযোজ্য হবে</div>}
                  <div className="my-1 border-t border-zinc-800" />
                </>
              )}
              <MenuItem checked={p.videoMode === "hidden"} onClick={() => { p.onVideoMode(p.videoMode === "hidden" ? "floating" : "hidden"); setMoreOpen(false); }}>
                ভিডিও প্যানেল লুকান
              </MenuItem>
              {p.floatingControlsSupported && p.sharing && (
                <MenuItem checked={p.floatingControlsHidden} onClick={() => { p.onToggleFloatingControls(); setMoreOpen(false); }}>
                  <span className="flex items-center justify-between gap-2">
                    ভাসমান কন্ট্রোল লুকান
                    <span className="text-[10px] text-zinc-500">Ctrl+Alt+Shift+H</span>
                  </span>
                </MenuItem>
              )}
              <MenuItem onClick={() => { p.onFullscreen(); setMoreOpen(false); }}>
                <span className="flex items-center gap-2">
                  <FullscreenIcon /> ফুলস্ক্রিন
                </span>
              </MenuItem>
              {p.isHost && p.onCopyLink && (
                <MenuItem onClick={() => { p.onCopyLink?.(); }}>
                  {p.linkCopied ? "✓ লিংক কপি হয়েছে" : "স্টুডেন্ট লিংক কপি করুন"}
                </MenuItem>
              )}
            </Popover>
          </div>
        </div>

        {/* right group */}
        <div className="flex items-center">
          <TBtn icon={<LeaveIcon />} label="ছাড়ুন" danger onClick={p.onLeave} title="ক্লাস থেকে বের হন" hideLabelOnMobile />
        </div>
      </div>
    </div>
  );
}

/**
 * The small Zoom-style bar that floats above other apps (Document
 * Picture-in-Picture) while sharing: Audio, Video, Pause, Record, Stop share.
 */
export function FloatingShareBar({
  micOn,
  camOn,
  sharePaused,
  recorder,
  isHost,
  participantCount,
  onToggleMic,
  onToggleCam,
  onTogglePauseShare,
  onStopShare,
  onShowMeeting,
  onHide,
}: {
  micOn: boolean;
  camOn: boolean;
  sharePaused: boolean;
  recorder: ClassRecorder;
  isHost: boolean;
  participantCount: number;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onTogglePauseShare: () => void;
  onStopShare: () => void;
  onShowMeeting: () => void;
  onHide: () => void;
}) {
  return (
    <div className="flex h-screen w-screen flex-col justify-between bg-zinc-900 text-white">
      <div className="flex items-center justify-between gap-2 bg-emerald-600 px-2 py-0.5 text-[11px] font-medium">
        <span>
          ● {sharePaused ? "শেয়ার পজ করা আছে" : "আপনি স্ক্রিন শেয়ার করছেন"}
          {recorder.recording && (
            <span className="ml-2 rounded bg-red-600 px-1.5">
              ● REC {formatClock(recorder.seconds)}
              {recorder.paused ? " (পজ)" : ""}
            </span>
          )}
        </span>
        <button type="button" onClick={onHide} className="rounded px-1 hover:bg-emerald-700" title="লুকান">
          <CloseIcon size={14} />
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center gap-1 px-1">
        <TBtn icon={<MicIcon off={!micOn} />} label={micOn ? "মিউট" : "আনমিউট"} onClick={onToggleMic} hideLabelOnMobile={false} />
        <TBtn icon={<CamIcon off={!camOn} />} label={camOn ? "ভিডিও বন্ধ" : "ভিডিও চালু"} onClick={onToggleCam} hideLabelOnMobile={false} />
        <TBtn icon={<PeopleIcon />} label="অংশগ্রহণকারী" badge={participantCount} onClick={onShowMeeting} hideLabelOnMobile={false} />
        <TBtn
          icon={sharePaused ? <PlayIcon /> : <PauseIcon />}
          label={sharePaused ? "চালু" : "পজ"}
          active={sharePaused}
          onClick={onTogglePauseShare}
          hideLabelOnMobile={false}
        />
        {isHost && recorder.supported && (
          <TBtn
            icon={<RecIcon active={recorder.recording} />}
            label={recorder.recording ? "রেকর্ড বন্ধ" : "রেকর্ড"}
            active={recorder.recording}
            onClick={recorder.recording ? recorder.stop : recorder.start}
            hideLabelOnMobile={false}
          />
        )}
        <TBtn icon={<EyeIcon />} label="ক্লাস দেখুন" onClick={onShowMeeting} hideLabelOnMobile={false} />
        <TBtn icon={<StopIcon />} label="শেয়ার বন্ধ" danger onClick={onStopShare} hideLabelOnMobile={false} />
      </div>
    </div>
  );
}

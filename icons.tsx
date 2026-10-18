"use client";

import type { ReactNode } from "react";

/** Small inline SVG icon set (no extra dependency). All icons are 24x24 stroke icons. */
function Svg({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const MicIcon = ({ off }: { off?: boolean }) => (
  <Svg>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    {off && <path d="M4 4l16 16" stroke="#ef4444" />}
  </Svg>
);
export const CamIcon = ({ off }: { off?: boolean }) => (
  <Svg>
    <rect x="3" y="6" width="12" height="12" rx="2.5" />
    <path d="M15 10.5l6-3v9l-6-3" />
    {off && <path d="M3 3l18 18" stroke="#ef4444" />}
  </Svg>
);
export const PeopleIcon = () => (
  <Svg>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
    <path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.8c1.8.7 3 2.4 3 5.2" />
  </Svg>
);
export const ChatIcon = () => (
  <Svg>
    <path d="M4 5h16v11H9l-5 4z" />
  </Svg>
);
export const ShareIcon = () => (
  <Svg>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M12 13V8M9.5 10.5L12 8l2.5 2.5M8 20h8" />
  </Svg>
);
export const PauseIcon = () => (
  <Svg>
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </Svg>
);
export const PlayIcon = () => (
  <Svg>
    <path d="M7 4.5v15l12-7.5z" />
  </Svg>
);
export const LayoutIcon = () => (
  <Svg>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <rect x="13" y="6.5" width="5.5" height="4" rx="1" />
  </Svg>
);
export const PenIcon = () => (
  <Svg>
    <path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z" />
    <path d="M14.5 6.5l3 3" />
  </Svg>
);
export const RecIcon = ({ active }: { active?: boolean }) => (
  <Svg>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3.6" fill={active ? "#ef4444" : "currentColor"} stroke="none" />
  </Svg>
);
export const MoreIcon = () => (
  <Svg>
    <circle cx="5" cy="12" r="1.6" fill="currentColor" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    <circle cx="19" cy="12" r="1.6" fill="currentColor" />
  </Svg>
);
export const StopIcon = () => (
  <Svg>
    <rect x="5.5" y="5.5" width="13" height="13" rx="2" fill="currentColor" />
  </Svg>
);
export const LeaveIcon = () => (
  <Svg>
    <path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" />
  </Svg>
);
export const EyeIcon = () => (
  <Svg>
    <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </Svg>
);
export const UndoIcon = () => (
  <Svg size={18}>
    <path d="M9 7L4 12l5 5M4 12h10a6 6 0 0 1 0 12" transform="translate(0 -3)" />
  </Svg>
);
export const TrashIcon = () => (
  <Svg size={18}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </Svg>
);
export const CloseIcon = ({ size = 18 }: { size?: number }) => (
  <Svg size={size}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const HighlightIcon = () => (
  <Svg size={18}>
    <path d="M5 19h5l9-9-5-5-9 9zM14 5l5 5M3 21h18" />
  </Svg>
);
export const FullscreenIcon = () => (
  <Svg>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Svg>
);

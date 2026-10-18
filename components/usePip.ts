"use client";

import { useCallback, useEffect, useState } from "react";

type DocPipApi = {
  requestWindow(opts?: { width?: number; height?: number }): Promise<Window>;
  window: Window | null;
};

function api(): DocPipApi | undefined {
  return (window as unknown as { documentPictureInPicture?: DocPipApi }).documentPictureInPicture;
}

/**
 * Document Picture-in-Picture: a small always-on-top window that stays
 * visible above OTHER apps (Word, PDF viewer ...). This is how the Zoom-style
 * floating meeting controls work while the teacher is sharing another window.
 * Only available in desktop Chrome / Edge (116+).
 */
export function usePip() {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [supported] = useState(() => typeof window !== "undefined" && !!api());

  const open = useCallback(async (width = 680, height = 84) => {
    const pip = api();
    if (!pip) return false;
    if (pip.window) {
      setPipWindow(pip.window);
      return true;
    }
    try {
      const w = await pip.requestWindow({ width, height });
      // copy the app's styles so Tailwind classes work in the little window
      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          const css = Array.from(sheet.cssRules)
            .map((r) => r.cssText)
            .join("\n");
          const style = w.document.createElement("style");
          style.textContent = css;
          w.document.head.appendChild(style);
        } catch {
          if (sheet.href) {
            const link = w.document.createElement("link");
            link.rel = "stylesheet";
            link.href = sheet.href;
            w.document.head.appendChild(link);
          }
        }
      });
      w.document.body.style.cssText =
        "margin:0;background:#18181b;color:#fff;font-family:Arial,Helvetica,sans-serif;overflow:hidden";
      w.addEventListener("pagehide", () => setPipWindow(null));
      setPipWindow(w);
      return true;
    } catch {
      // needs a fresh click/tap — caller shows a button instead
      return false;
    }
  }, []);

  const close = useCallback(() => {
    const pip = api();
    pip?.window?.close();
    setPipWindow(null);
  }, []);

  useEffect(() => {
    return () => {
      api()?.window?.close();
    };
  }, []);

  return { supported, pipWindow, open, close };
}

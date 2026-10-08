import { useEffect, useRef } from "react";
import { Terminal as XTerm, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { api, openUrl } from "../lib/ipc";
import { jobBuffer, jobs, settings, subscribeOutput } from "../lib/state";

/** ANSI colours in the HyperNix palette: Rich's red is the brand red. */
const THEME: ITheme = {
  background: "#08080a",
  foreground: "#e8e8e6",
  cursor: "#ff5b6c",
  cursorAccent: "#08080a",
  selectionBackground: "rgba(200, 25, 46, 0.38)",
  black: "#1d1d21",
  red: "#ff4d61",
  green: "#4cd471",
  yellow: "#ffb340",
  blue: "#6aa9ff",
  magenta: "#d38cff",
  cyan: "#5fd7e6",
  white: "#d6d6d4",
  brightBlack: "#6e6e74",
  brightRed: "#ff7a88",
  brightGreen: "#74e693",
  brightYellow: "#ffcc73",
  brightBlue: "#94c2ff",
  brightMagenta: "#e3b0ff",
  brightCyan: "#8ce8f2",
  brightWhite: "#f5f5f4",
};

function isLive(id: string) {
  const j = jobs.get().find((x) => x.id === id);
  return !!j && (j.status === "running" || j.status === "starting");
}

export function Terminal({ jobId }: { jobId: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const term = new XTerm({
      fontFamily: '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, monospace',
      fontSize: settings.get().consoleFontSize,
      lineHeight: 1.25,
      cursorBlink: true,
      cursorStyle: "bar",
      scrollback: 20000,
      allowTransparency: false,
      convertEol: false,
      theme: THEME,
      macOptionIsMeta: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon((_e, uri) => void openUrl(uri)));
    term.open(el);

    const doFit = () => {
      try {
        fit.fit();
        if (isLive(jobId)) void api.jobResize(jobId, term.cols, term.rows);
      } catch {
        /* element hidden or detached: try again on the next resize */
      }
    };
    requestAnimationFrame(doFit);

    term.write(jobBuffer(jobId));
    const unsub = subscribeOutput(jobId, (data) => term.write(data));
    const input = term.onData((data) => {
      if (isLive(jobId)) void api.jobWrite(jobId, data);
    });
    const ro = new ResizeObserver(() => doFit());
    ro.observe(el);
    if (isLive(jobId)) term.focus();

    return () => {
      ro.disconnect();
      input.dispose();
      unsub();
      term.dispose();
    };
  }, [jobId]);

  return <div className="term-host" ref={host} />;
}

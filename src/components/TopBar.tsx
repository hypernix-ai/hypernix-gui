import { sectionById, findCommand } from "../catalog";
import { go, jobs, route, settings, t1 } from "../lib/state";
import { useStore } from "../lib/store";
import { Icon } from "./Icon";

const TITLES: Record<string, string> = {
  overview: "Overview",
  t1: "T1 server",
  library: "Model library",
  jobs: "Jobs",
  settings: "Settings",
};

export function TopBar() {
  const r = useStore(route);
  const t = useStore(t1);
  const s = useStore(settings);
  const running = useStore(jobs).filter((j) => j.status === "running" || j.status === "starting").length;

  let crumbs: string[] = [TITLES[r.view] ?? ""];
  if (r.view === "section") {
    const sec = sectionById(r.section);
    const cmd = r.command ? findCommand(r.command)?.command : undefined;
    crumbs = [sec?.title ?? "", ...(cmd ? [cmd.title] : [])];
  }

  const online = t.probe?.online;
  const cycleTheme = () => {
    const order = ["system", "dark", "light"] as const;
    settings.set({ ...s, theme: order[(order.indexOf(s.theme) + 1) % order.length] });
  };

  return (
    <header className="topbar" data-tauri-drag-region>
      <div className="crumbs" data-tauri-drag-region>
        {crumbs.map((c, i) => (
          <span key={i} className={`row ${i < crumbs.length - 1 ? "muted" : ""}`} style={{ gap: 8 }}>
            {i > 0 && <Icon name="chevronRight" size={14} />}
            <span className="ellipsis">{c}</span>
          </span>
        ))}
      </div>
      <div className="spacer" data-tauri-drag-region />
      <button className="chip" onClick={() => go({ view: "t1" })} title={t.url || "No T1 server configured"}>
        <span className={`dot ${online ? "ok" : t.probe ? "bad" : ""}`} />
        T1 {online ? `online · ${t.probe?.latencyMs ?? "?"} ms` : t.probe ? "offline" : "—"}
      </button>
      <button className="chip" onClick={() => go({ view: "jobs" })}>
        {running > 0 ? <Icon name="spinner" size={13} className="spin" /> : <Icon name="terminal" size={13} />}
        {running > 0 ? `${running} running` : "Jobs"}
      </button>
      <button className="icon-btn" onClick={cycleTheme} title={`Theme: ${s.theme}`}>
        <Icon name={s.theme === "light" ? "sun" : s.theme === "dark" ? "moon" : "monitor"} size={16} />
      </button>
    </header>
  );
}

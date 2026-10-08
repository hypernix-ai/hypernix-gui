import { SECTIONS } from "../catalog";
import { env, go, jobs, paletteOpen, route } from "../lib/state";
import { useStore } from "../lib/store";
import { Icon, type IconName } from "./Icon";

const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || navigator.userAgent);
export const MOD = isMac ? "⌘" : "Ctrl";

function NavItem({ icon, label, active, onClick, count }: { icon: IconName; label: string; active: boolean; onClick: () => void; count?: number }) {
  return (
    <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}>
      <Icon name={icon} size={16} />
      <span className="ellipsis">{label}</span>
      {!!count && <span className="count">{count}</span>}
    </button>
  );
}

export function Sidebar() {
  const r = useStore(route);
  const e = useStore(env);
  const running = useStore(jobs).filter((j) => j.status === "running" || j.status === "starting").length;
  const py = e.value?.python;

  return (
    <aside className="sidebar" data-tauri-drag-region>
      <div className="brand" data-tauri-drag-region>
        <img className="logo-ondark" src="/hypernix-icon-ondark.svg" alt="" />
        <img className="logo-onlight" src="/hypernix-icon.svg" alt="" />
        <div>
          <div className="brand-name">HyperNix</div>
          <div className="brand-sub">Control</div>
        </div>
      </div>

      <button className="search-trigger" onClick={() => paletteOpen.set(true)}>
        <Icon name="search" size={14} />
        <span>Search commands</span>
        <span className="kbd">{MOD} K</span>
      </button>

      <nav className="nav">
        <NavItem icon="dashboard" label="Overview" active={r.view === "overview"} onClick={() => go({ view: "overview" })} />
        <NavItem icon="server" label="T1 server" active={r.view === "t1"} onClick={() => go({ view: "t1" })} />
        <NavItem icon="library" label="Model library" active={r.view === "library"} onClick={() => go({ view: "library" })} />
        <NavItem icon="terminal" label="Jobs" active={r.view === "jobs"} onClick={() => go({ view: "jobs" })} count={running} />

        <div className="nav-label">Controls</div>
        {SECTIONS.map((s) => (
          <NavItem
            key={s.id}
            icon={s.icon}
            label={s.title}
            active={r.view === "section" && r.section === s.id}
            onClick={() => go({ view: "section", section: s.id })}
          />
        ))}
      </nav>

      <NavItem icon="settings" label="Settings" active={r.view === "settings"} onClick={() => go({ view: "settings" })} />
      <button className="env-card" onClick={() => go({ view: "settings" })} title={py?.executable}>
        <span className={`dot ${e.loading ? "warn pulse" : py?.hypernix ? "ok" : "bad"}`} />
        <div>
          <div className="t">{e.loading ? "Detecting HyperNix…" : py?.hypernix ? `hypernix ${py.hypernix}` : "HyperNix not found"}</div>
          <div className="s">{e.loading ? "reading your shell's PATH" : py ? `Python ${py.version}${e.value?.sandboxed ? " · host" : ""}` : "Open Settings to install"}</div>
        </div>
      </button>
    </aside>
  );
}

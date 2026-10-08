import { useEffect, useMemo, useRef, useState } from "react";
import { ALL_COMMANDS } from "../catalog";
import { go, openCommand, paletteOpen, type Route } from "../lib/state";
import { useStore } from "../lib/store";
import { Icon, type IconName } from "./Icon";

interface Item {
  key: string;
  title: string;
  sub: string;
  icon: IconName;
  hay: string;
  run: () => void;
}

const PAGES: { title: string; icon: IconName; route: Route }[] = [
  { title: "Overview", icon: "dashboard", route: { view: "overview" } },
  { title: "T1 server", icon: "server", route: { view: "t1" } },
  { title: "Model library", icon: "library", route: { view: "library" } },
  { title: "Jobs", icon: "terminal", route: { view: "jobs" } },
  { title: "Settings", icon: "settings", route: { view: "settings" } },
];

/** Subsequence match with a bonus for word starts; 0 means no match. */
function score(hay: string, q: string) {
  if (!q) return 1;
  let s = 0;
  let i = 0;
  let prev = -2;
  for (const ch of q) {
    const j = hay.indexOf(ch, i);
    if (j < 0) return 0;
    s += j === prev + 1 ? 3 : 1;
    if (j === 0 || /[\s\-·/.]/.test(hay[j - 1])) s += 2;
    prev = j;
    i = j + 1;
  }
  return s + (hay.includes(q) ? 10 : 0);
}

export function CommandPalette() {
  const open = useStore(paletteOpen);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items: Item[] = useMemo(
    () => [
      ...PAGES.map((p) => ({
        key: `page:${p.title}`,
        title: p.title,
        sub: "Go to page",
        icon: p.icon,
        hay: p.title.toLowerCase(),
        run: () => go(p.route),
      })),
      ...ALL_COMMANDS.map(({ section, command }) => ({
        key: command.id,
        title: command.title,
        sub: `${section.title} · ${command.program} ${command.base.join(" ")}`.trim(),
        icon: command.icon,
        hay: `${command.title} ${command.program} ${command.base.join(" ")} ${command.keywords ?? ""} ${section.title}`.toLowerCase(),
        run: () => openCommand(section.id, command.id),
      })),
    ],
    [],
  );

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items
      .map((it) => ({ it, s: score(it.hay, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((x) => x.it);
  }, [items, q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        paletteOpen.set(!paletteOpen.get());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(".sel")?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!open) return null;
  const close = () => paletteOpen.set(false);
  const choose = (it?: Item) => {
    if (!it) return;
    close();
    it.run();
  };

  return (
    <div className="overlay" onMouseDown={close}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <div className="palette-input">
          <Icon name="search" size={18} className="faint" />
          <input
            ref={input}
            value={q}
            placeholder="Run a HyperNix command, open a page…"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(results.length - 1, s + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === "Enter") {
                choose(results[sel]);
              } else if (e.key === "Escape") {
                close();
              }
            }}
          />
          <span className="kbd">esc</span>
        </div>
        <div className="palette-list" ref={listRef}>
          {results.length === 0 && <div className="empty">Nothing matches “{q}”.</div>}
          {results.map((it, i) => (
            <button key={it.key} className={`palette-item ${i === sel ? "sel" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => choose(it)}>
              <span className="ic">
                <Icon name={it.icon} size={15} />
              </span>
              <span className="grow">
                <div className="t">{it.title}</div>
                <div className="s mono ellipsis">{it.sub}</div>
              </span>
              {i === sel && <Icon name="arrowUpRight" size={15} className="faint" />}
            </button>
          ))}
        </div>
        <div className="palette-foot">
          <span>
            <span className="kbd">↑↓</span> move
          </span>
          <span>
            <span className="kbd">↵</span> open
          </span>
          <span className="grow" />
          <span>{ALL_COMMANDS.length} commands</span>
        </div>
      </div>
    </div>
  );
}

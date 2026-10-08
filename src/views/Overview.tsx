import { useEffect, useRef, useState } from "react";
import { Gauge, Sparkline } from "../components/Gauge";
import { Icon, type IconName } from "../components/Icon";
import { StatusPill, elapsed, useNow } from "../components/Console";
import { api, type SysSnapshot } from "../lib/ipc";
import { env, go, jobs, openCommand, t1 } from "../lib/state";
import { useStore } from "../lib/store";
import { formatBytes, formatUptime } from "../lib/format";

interface Device {
  name: string;
  kind: string;
  label: string;
  usable: boolean;
  reason: string;
  total_memory: number;
  remedy: string;
}

const QUICK: { icon: IconName; title: string; sub: string; section: string; command: string }[] = [
  { icon: "workflow", title: "Download → GGUF", sub: "The full pipeline, one run", section: "models", command: "all" },
  { icon: "gem", title: "Quantise with hyprslug", sub: "Any tier, no llama.cpp", section: "quant", command: "hyprslug" },
  { icon: "flame", title: "Train a model", sub: "Abbicus, STML, fused steps", section: "training", command: "train-run" },
  { icon: "chat", title: "Chat", sub: "Any HyperNix-family model", section: "inference", command: "chat" },
  { icon: "dashboard", title: "tvtop-max", sub: "Watch the run, in the app", section: "monitor", command: "tvtop-max" },
  { icon: "cable", title: "Connect waiter", sub: "Set up a T1 connection", section: "waiter", command: "waiter-serv" },
  { icon: "key", title: "Mint a key", sub: "gkey create, v2.1 daily keys", section: "keys", command: "gkey-create" },
  { icon: "terminal", title: "hyped-pro", sub: "The OpenTUI client", section: "inference", command: "hyped-pro" },
];

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function Overview() {
  const e = useStore(env);
  const t = useStore(t1);
  const allJobs = useStore(jobs);
  const [snap, setSnap] = useState<SysSnapshot | null>(null);
  const history = useRef<{ cpu: number[]; mem: number[] }>({ cpu: [], mem: [] });
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [devErr, setDevErr] = useState<string | null>(null);
  const [devLoading, setDevLoading] = useState(false);
  const live = allJobs.some((j) => j.status === "running");
  const now = useNow(live);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await api.sysSnapshot();
        if (!alive) return;
        const h = history.current;
        h.cpu = [...h.cpu, s.cpu].slice(-60);
        h.mem = [...h.mem, (s.memUsed / Math.max(1, s.memTotal)) * 100].slice(-60);
        setSnap(s);
      } catch {
        /* sampling is decoration; never surface an error for it */
      }
    };
    void tick();
    const id = window.setInterval(tick, 1500);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const loadDevices = async () => {
    setDevLoading(true);
    setDevErr(null);
    try {
      const out = await api.runCapture("hypernix", ["devices", "--json"], 90);
      const parsed = JSON.parse(out.stdout.slice(out.stdout.indexOf("{")));
      setDevices(parsed.devices ?? []);
    } catch (err) {
      setDevErr(String(err).includes("JSON") ? "hypernix devices did not return JSON (is torch installed?)" : String(err));
    } finally {
      setDevLoading(false);
    }
  };

  useEffect(() => {
    if (e.value?.python?.hypernix) void loadDevices();
  }, [e.value?.python?.hypernix]);

  const py = e.value?.python;
  const memPct = snap ? (snap.memUsed / Math.max(1, snap.memTotal)) * 100 : 0;
  const running = allJobs.filter((j) => j.status === "running" || j.status === "starting").length;

  return (
    <div className="page">
      <section className="hero">
        <img className="hero-mark logo-ondark" src="/hypernix-icon-ondark.svg" alt="" />
        <img className="hero-mark logo-onlight" src="/hypernix-icon.svg" alt="" />
        <div className="eyebrow" style={{ position: "relative", zIndex: 1 }}>
          {greeting()}
          {snap?.host ? ` · ${snap.host}` : ""}
        </div>
        <h1 style={{ marginTop: 8 }}>
          Every HyperNix control,
          <br />
          one window.
        </h1>
        <p>
          Download, convert and quantise models; train them; run the T1 server and its waiter client; mint keys; and watch it all
          in the dashboards — each control runs the real <span className="mono">hypernix-pip</span> command, live in the app.
        </p>
        <div className="actions">
          <button className="btn primary lg" onClick={() => openCommand("system", "doctor")}>
            <Icon name="stethoscope" size={16} /> Run doctor
          </button>
          <button className="btn lg" onClick={() => go({ view: "t1" })}>
            <Icon name="server" size={16} /> T1 server
          </button>
          <button className="btn lg ghost" onClick={() => go({ view: "library" })}>
            <Icon name="library" size={16} /> Model library
          </button>
        </div>
      </section>

      {!e.loading && !py?.hypernix && (
        <div className="banner red" style={{ marginTop: 18 }}>
          <Icon name="alert" size={20} className="ic" />
          <div className="grow">
            <div style={{ fontWeight: 650 }}>HyperNix isn't installed in any Python this app can see.</div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {py ? `Found Python ${py.version} at ${py.executable}.` : "No Python 3.12+ was found on your PATH."} Install it from Settings, or point
              Settings at the interpreter that has it.
            </div>
          </div>
          <button className="btn primary" onClick={() => go({ view: "settings" })}>
            Install HyperNix
          </button>
        </div>
      )}

      <div className="stats" style={{ marginTop: 18 }}>
        <div className="card stat">
          <Gauge value={snap?.cpu ?? 0} />
          <div className="grow">
            <div className="l">CPU</div>
            <div className="v tabular">{snap ? `${snap.cpu.toFixed(0)}%` : "—"}</div>
            <Sparkline data={history.current.cpu} height={26} />
          </div>
        </div>
        <div className="card stat">
          <Gauge value={memPct} color="#6aa9ff" />
          <div className="grow">
            <div className="l">Memory</div>
            <div className="v tabular">{snap ? formatBytes(snap.memUsed) : "—"}</div>
            <Sparkline data={history.current.mem} height={26} color="#6aa9ff" />
          </div>
        </div>
        <button className="card stat" style={{ textAlign: "left" }} onClick={() => go({ view: "t1" })}>
          <div className={`orb ${t.probe?.online ? "online" : t.probe ? "offline" : ""}`} style={{ width: 56, height: 56 }}>
            <Icon name="server" size={20} />
          </div>
          <div className="grow">
            <div className="l">T1 server</div>
            <div className="v">{t.probe?.online ? "Online" : t.probe ? "Offline" : "Not checked"}</div>
            <div className="faint mono" style={{ fontSize: 11 }}>
              {t.probe?.online ? `${t.probe.latencyMs} ms · ${String((t.probe.version as Record<string, unknown>)?.t1_api_version ?? "")}` : t.url || "no URL yet"}
            </div>
          </div>
        </button>
        <button className="card stat" style={{ textAlign: "left" }} onClick={() => go({ view: "jobs" })}>
          <div className="gauge-wrap" style={{ display: "grid", placeItems: "center", borderRadius: 18, background: "var(--surface-3)" }}>
            <Icon name="terminal" size={24} />
          </div>
          <div className="grow">
            <div className="l">Jobs</div>
            <div className="v tabular">{running} running</div>
            <div className="faint" style={{ fontSize: 11.5 }}>
              {allJobs.length} this session
            </div>
          </div>
        </button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)", marginTop: 18, alignItems: "start" }}>
        <div className="grid">
          <div>
            <div className="eyebrow" style={{ margin: "4px 4px 10px" }}>
              Quick actions
            </div>
            <div className="quick">
              {QUICK.map((q) => (
                <button key={q.command} className="quick-tile" onClick={() => openCommand(q.section, q.command)}>
                  <span className="ic">
                    <Icon name={q.icon} size={17} />
                  </span>
                  <span>
                    <div className="t">{q.title}</div>
                    <div className="s">{q.sub}</div>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <Icon name="terminal" size={16} />
              <span className="card-title grow">Recent jobs</span>
              <button className="btn sm ghost" onClick={() => go({ view: "jobs" })}>
                All jobs
              </button>
            </div>
            {allJobs.length === 0 ? (
              <div className="empty">
                <div className="ic">
                  <Icon name="play" size={22} />
                </div>
                <div>Nothing has run yet. Pick a quick action or press the search key.</div>
              </div>
            ) : (
              allJobs.slice(0, 6).map((j) => (
                <button key={j.id} className="list-row" onClick={() => go({ view: "jobs", job: j.id })}>
                  <StatusPill job={j} />
                  <span className="grow">
                    <div style={{ fontWeight: 600 }}>{j.title}</div>
                    <div className="mono faint ellipsis" style={{ fontSize: 11 }}>
                      {[j.program, ...j.args].join(" ")}
                    </div>
                  </span>
                  <span className="faint tabular" style={{ fontSize: 12 }}>
                    {elapsed(j, now)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="grid">
          <div className="card">
            <div className="card-head">
              <Icon name="cpu" size={16} />
              <span className="card-title grow">This machine</span>
              {snap && <span className="badge mono">{snap.cores.length} threads</span>}
            </div>
            <div className="card-pad">
              {snap ? (
                <>
                  <div className="cores" title="Per-core load">
                    {snap.cores.map((c, i) => (
                      <i key={i} style={{ height: `${Math.max(4, c)}%` }} />
                    ))}
                  </div>
                  <dl className="kv" style={{ marginTop: 14 }}>
                    <dt>CPU</dt>
                    <dd title={snap.cpuBrand}>{snap.cpuBrand || "—"}</dd>
                    <dt>OS</dt>
                    <dd>
                      {snap.os} · {e.value?.arch ?? ""}
                    </dd>
                    <dt>Memory</dt>
                    <dd>
                      {formatBytes(snap.memUsed)} / {formatBytes(snap.memTotal)}
                    </dd>
                    <dt>Load</dt>
                    <dd>{snap.load.map((l) => l.toFixed(2)).join("  ")}</dd>
                    <dt>Uptime</dt>
                    <dd>{formatUptime(snap.uptime)}</dd>
                    <dt>Python</dt>
                    <dd title={py?.executable}>{py ? `${py.version} · ${py.executable}` : "—"}</dd>
                  </dl>
                </>
              ) : (
                <div className="skeleton" style={{ height: 140 }} />
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <Icon name="zap" size={16} />
              <span className="card-title grow">Accelerators</span>
              <button className="icon-btn sm" onClick={loadDevices} title="Re-check" disabled={devLoading || !py?.hypernix}>
                <Icon name="refresh" size={14} className={devLoading ? "spin" : ""} />
              </button>
            </div>
            <div className="card-pad grid" style={{ gap: 8 }}>
              {devErr && <div className="faint" style={{ fontSize: 12.5 }}>{devErr}</div>}
              {!devices && !devErr && (
                <div className="faint" style={{ fontSize: 12.5 }}>
                  {devLoading ? "Asking hypernix devices…" : "Reported by hypernix devices once HyperNix is found."}
                </div>
              )}
              {devices?.map((d) => (
                <div key={d.name} className={`device ${d.usable ? "usable" : ""}`}>
                  <span className="ic">
                    <Icon name={d.kind === "cpu" ? "cpu" : d.kind === "mps" ? "sparkles" : "zap"} size={16} />
                  </span>
                  <div className="grow">
                    <div className="row" style={{ gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>{d.label}</span>
                      <span className={`badge ${d.usable ? "ok" : ""}`}>{d.usable ? "usable" : "unavailable"}</span>
                    </div>
                    <div className="faint" style={{ fontSize: 11.5 }}>
                      {d.usable ? (d.total_memory ? `${formatBytes(d.total_memory)} memory` : d.name) : d.reason}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


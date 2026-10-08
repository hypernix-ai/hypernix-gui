import { useEffect, useMemo, useState } from "react";
import { T1_LIFECYCLE, t1Section } from "../catalog/t1";
import { CommandRunner } from "../components/CommandRunner";
import { Console } from "../components/Console";
import { confirm } from "../components/Dialogs";
import { Icon } from "../components/Icon";
import { api, type T1LocalConfig } from "../lib/ipc";
import { jobs, probeT1, settings, startJob, t1, toast } from "../lib/state";
import { useStore } from "../lib/store";
import { formatUptime } from "../lib/format";

type Obj = Record<string, unknown>;

function show(v: unknown) {
  if (v === true) return "on";
  if (v === false) return "off";
  if (v == null || v === "") return "—";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

const TABS = t1Section.groups.filter((g) => g.title !== "Lifecycle");

export function T1View() {
  const t = useStore(t1);
  const s = useStore(settings);
  const allJobs = useStore(jobs);
  const [local, setLocal] = useState<T1LocalConfig | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState(TABS[0].title);
  const [cmd, setCmd] = useState<string>(TABS[0].commands[0].id);
  const [models, setModels] = useState<Obj[] | null>(null);
  const [modelsErr, setModelsErr] = useState<string | null>(null);

  const url = s.t1Url || local?.baseUrl || "http://127.0.0.1:8000";

  useEffect(() => {
    api.t1LocalConfig().then(setLocal).catch(() => setLocal(null));
  }, []);

  useEffect(() => {
    setUrlDraft(s.t1Url || "");
  }, [s.t1Url]);

  const refresh = async () => {
    setBusy(true);
    await probeT1(url);
    api.t1LocalConfig().then(setLocal).catch(() => {});
    setBusy(false);
  };

  useEffect(() => {
    void refresh();
    if (!s.pollT1) return;
    const id = window.setInterval(() => void probeT1(url), 5000);
    return () => window.clearInterval(id);
  }, [url, s.pollT1]);

  const loadModels = async () => {
    setModelsErr(null);
    try {
      const key = (await api.secretGet("t1_key")) ?? undefined;
      const res = (await api.t1Get(url, "/models", key)) as Obj | Obj[];
      const list = Array.isArray(res) ? res : ((res.models ?? res.data ?? res.items ?? []) as Obj[]);
      setModels(list);
    } catch (e) {
      setModels(null);
      setModelsErr(String(e));
    }
  };

  const lifecycleJob = useMemo(() => allJobs.find((j) => j.commandId?.startsWith("t1-") && T1_LIFECYCLE.some((c) => c.id === j.commandId)), [allJobs]);

  const runLifecycle = async (id: string) => {
    const spec = T1_LIFECYCLE.find((c) => c.id === id)!;
    if (spec.confirm && !(await confirm(spec.title, spec.confirm, spec.title))) return;
    await startJob({ title: `T1 ${spec.title.toLowerCase()}`, program: spec.program, args: spec.base, commandId: spec.id });
    // Starting and stopping take a moment to show up on the wire.
    [1500, 4000, 8000].forEach((ms) => window.setTimeout(() => void probeT1(url), ms));
  };

  const probe = t.url === url ? t.probe : null;
  const online = probe?.online;
  const version = (probe?.version ?? {}) as Obj;
  const status = (probe?.status ?? {}) as Obj;
  const warnings = (status.warnings as string[] | undefined) ?? [];
  const group = TABS.find((g) => g.title === tab) ?? TABS[0];
  const spec = group.commands.find((c) => c.id === cmd) ?? group.commands[0];

  return (
    <div className="page">
      <div className="card t1-hero">
        <div className={`orb ${online ? "online" : probe ? "offline" : ""}`}>
          <Icon name={online ? "wifi" : "wifiOff"} size={30} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <span className="t1-title">{show(status.server_name) !== "—" ? String(status.server_name) : "T1 API server"}</span>
            <span className={`badge ${online ? "ok" : probe ? "red" : ""}`}>{online ? "online" : probe ? "offline" : "checking"}</span>
            {online && <span className="badge mono">{probe?.latencyMs} ms</span>}
            {version.stale === true && <span className="badge warn">restart to finish upgrade</span>}
          </div>
          <div className="t1-url selectable" style={{ marginTop: 4 }}>
            {url}
          </div>
          <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
            {online ? (
              <>
                <span className="badge mono">T1 v{show(version.t1_api_version ?? status.t1_api_version)}</span>
                <span className="badge mono">hypernix {show(version.hypernix ?? status.hypernix_version)}</span>
                <span className="badge mono">Python {show(version.python)}</span>
                {typeof version.uptime_seconds === "number" && <span className="badge mono">up {formatUptime(version.uptime_seconds)}</span>}
                <span className="badge mono">{show(status.model_count)} models</span>
              </>
            ) : (
              <span className="faint" style={{ fontSize: 12.5 }}>
                {probe?.error ? `Not answering: ${probe.error}` : "Checking…"} {local && !local.exists && "· No server is set up on this machine yet: use Create server below."}
              </span>
            )}
          </div>
        </div>
        <div className="grid" style={{ gap: 8, justifyItems: "end" }}>
          <div className="input-group" style={{ width: 300 }}>
            <input className="input mono" value={urlDraft} placeholder={local?.baseUrl ?? "http://127.0.0.1:8000"} onChange={(e) => setUrlDraft(e.target.value)} spellCheck={false} />
            <button
              className="btn"
              onClick={() => {
                settings.set({ ...s, t1Url: urlDraft.trim() });
                toast(urlDraft.trim() ? "Server URL saved" : "Using the local server's .env", "ok");
              }}
            >
              Use
            </button>
          </div>
          <button className="btn sm ghost" onClick={refresh} disabled={busy}>
            <Icon name="refresh" size={14} className={busy ? "spin" : ""} /> Re-check
          </button>
        </div>
      </div>

      <div className="lifecycle" style={{ marginTop: 16 }}>
        {T1_LIFECYCLE.map((c) => (
          <button key={c.id} className={`life-btn ${c.id === "t1-start" ? "go" : c.id === "t1-stop" ? "stop" : c.id === "t1-kill" ? "kill" : ""}`} onClick={() => runLifecycle(c.id)} title={c.summary}>
            <span className="ic">
              <Icon name={c.icon} size={18} />
            </span>
            {c.title}
          </button>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)", marginTop: 16, alignItems: "start" }}>
        <Console jobId={lifecycleJob?.id} height={330} emptyText="Start, stop, test or check the server — its output appears here." />
        <div className="grid">
          <div className="card">
            <div className="card-head">
              <Icon name="shield" size={16} />
              <span className="card-title grow">Protections</span>
              <span className="badge mono">{show(status.environment)}</span>
            </div>
            <div className="card-pad">
              {online ? (
                <>
                  <dl className="kv">
                    <dt>Storage</dt>
                    <dd>{show(status.storage_backend)}</dd>
                    <dt>TLS</dt>
                    <dd>{show(status.tls_enabled)}</dd>
                    <dt>mTLS</dt>
                    <dd>{show(status.mtls_mode)}</dd>
                    <dt>Rate limits</dt>
                    <dd>{show(status.rate_limit_enabled)}</dd>
                    <dt>Host id</dt>
                    <dd>{show(status.host_id)}</dd>
                  </dl>
                  {warnings.length > 0 && (
                    <div className="warnings" style={{ marginTop: 14 }}>
                      {warnings.map((w) => (
                        <div className="warning" key={w}>
                          <Icon name="alert" size={14} style={{ flex: "none", marginTop: 2 }} />
                          <span className="selectable">{w}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="faint" style={{ fontSize: 12.5 }}>
                  Shown when the server answers <span className="mono">/status</span>.
                </div>
              )}
            </div>
          </div>
          <div className="card">
            <div className="card-head">
              <Icon name="fileCog" size={16} />
              <span className="card-title grow">Local configuration</span>
              {local?.pid && <span className="badge mono">pid {local.pid}</span>}
            </div>
            <div className="card-pad">
              {local?.exists ? (
                <dl className="kv">
                  {local.entries.slice(0, 12).map(([k, v]) => (
                    <FragmentKV key={k} k={k} v={v} />
                  ))}
                </dl>
              ) : (
                <div className="faint" style={{ fontSize: 12.5 }}>
                  No <span className="mono">{local?.envFile ?? "~/.hypernix/t1api/.env"}</span> yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <Icon name="boxes" size={16} />
          <span className="card-title grow">Served models</span>
          <span className="card-sub">uses the T1 key from Settings</span>
          <button className="btn sm" onClick={loadModels} disabled={!online}>
            <Icon name="refresh" size={14} /> Load
          </button>
        </div>
        {modelsErr && <div className="card-pad faint">{modelsErr}</div>}
        {models && models.length === 0 && <div className="card-pad faint">The registry is empty. Index or sync models below.</div>}
        {models && models.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Backend</th>
                <th>Status</th>
                <th>Context</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m, i) => (
                <tr key={String(m.model_id ?? m.id ?? i)}>
                  <td className="mono selectable">{show(m.model_id ?? m.id ?? m.name)}</td>
                  <td>{show(m.backend ?? m.provider)}</td>
                  <td>
                    <span className={`badge ${m.available === false ? "" : "ok"}`}>{m.available === false ? "unavailable" : show(m.status ?? "available")}</span>
                  </td>
                  <td className="mono">{show(m.context_length ?? m.context)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!models && !modelsErr && <div className="card-pad faint">Load the registry to see what this server serves.</div>}
      </div>

      <div style={{ marginTop: 24 }}>
        <div className="row wrap" style={{ marginBottom: 14, gap: 14 }}>
          <div className="tabs">
            {TABS.map((g) => (
              <button
                key={g.title}
                className={g.title === tab ? "active" : ""}
                onClick={() => {
                  setTab(g.title);
                  setCmd(g.commands[0].id);
                }}
              >
                {g.title}
              </button>
            ))}
          </div>
          <div className="tabs">
            {group.commands.map((c) => (
              <button key={c.id} className={c.id === spec.id ? "active" : ""} onClick={() => setCmd(c.id)}>
                <Icon name={c.icon} size={14} />
                {c.title}
              </button>
            ))}
          </div>
        </div>
        <CommandRunner key={spec.id} spec={spec} />
      </div>
    </div>
  );
}

function FragmentKV({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="mono" style={{ fontSize: 11.5 }}>
        {k}
      </dt>
      <dd>{v}</dd>
    </>
  );
}

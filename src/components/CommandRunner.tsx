import { useEffect, useMemo, useState } from "react";
import type { CommandSpec, Value, Values } from "../catalog/types";
import { docUrl } from "../catalog";
import { buildArgs, fieldVisible, missingRequired, shellJoin } from "../lib/argv";
import { api, openUrl } from "../lib/ipc";
import { jobs, settings, startJob, toast } from "../lib/state";
import { useStore } from "../lib/store";
import { Console } from "./Console";
import { confirm } from "./Dialogs";
import { FieldControl } from "./FieldControl";
import { Icon } from "./Icon";

/** Form values survive switching between commands for the session. */
const remembered = new Map<string, { values: Values; extra: string; cwd: string }>();

export function CommandRunner({
  spec,
  prefill,
  compact = false,
  consoleHeight,
}: {
  spec: CommandSpec;
  prefill?: Values;
  compact?: boolean;
  consoleHeight?: number;
}) {
  const saved = remembered.get(spec.id);
  const [values, setValues] = useState<Values>(() => ({ ...(saved?.values ?? {}), ...(prefill ?? {}) }));
  const [extra, setExtra] = useState(saved?.extra ?? "");
  const [cwd, setCwd] = useState(saved?.cwd ?? "");
  const [showMore, setShowMore] = useState(false);
  const allJobs = useStore(jobs);
  const s = useStore(settings);

  useEffect(() => {
    remembered.set(spec.id, { values, extra, cwd });
  }, [spec.id, values, extra, cwd]);

  const args = useMemo(() => buildArgs(spec, values, extra), [spec, values, extra]);
  const missing = missingRequired(spec, values);
  const latest = allJobs.find((j) => j.commandId === spec.id);
  const running = allJobs.filter((j) => j.commandId === spec.id && (j.status === "running" || j.status === "starting")).length;

  const visible = spec.fields.filter((f) => fieldVisible(f, values));
  const basic = visible.filter((f) => !f.advanced);
  const advanced = visible.filter((f) => f.advanced);

  const set = (key: string) => (v: Value) => setValues((prev) => ({ ...prev, [key]: v }));

  const preflight = async () => {
    if (missing.length) {
      toast(`Fill in: ${missing.map((f) => f.label).join(", ")}`, "error");
      return false;
    }
    if (spec.confirm && !(await confirm(spec.title, spec.confirm, "Run it"))) return false;
    return true;
  };

  const run = async () => {
    if (!(await preflight())) return;
    await startJob({ title: spec.title, program: spec.program, args, commandId: spec.id, tui: spec.tui, cwd: cwd || undefined });
  };

  const popOut = async () => {
    if (!(await preflight())) return;
    try {
      const term = await api.openInTerminal({
        program: spec.program,
        args,
        cwd: cwd || s.workDir || undefined,
        template: s.terminalTemplate || undefined,
      });
      toast(`Opened in ${term}`, "ok");
    } catch (e) {
      toast(String(e), "error");
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(shellJoin([spec.program, ...args]));
    toast("Command copied", "ok");
  };

  return (
    <div className="runner">
      {!compact && (
        <div className="runner-head">
          <div className="big-ic">
            <Icon name={spec.icon} size={22} />
          </div>
          <div className="grow">
            <div className="row wrap" style={{ gap: 8 }}>
              <h2>{spec.title}</h2>
              <span className="badge mono">{spec.program}</span>
              {spec.tui && <span className="badge info">interactive</span>}
              {running > 0 && <span className="badge ok">{running} running</span>}
            </div>
            <p>{spec.summary}</p>
          </div>
          {spec.doc && (
            <button className="btn sm ghost" onClick={() => openUrl(docUrl(spec.doc!))}>
              <Icon name="book" size={14} /> Docs
            </button>
          )}
        </div>
      )}

      <div className="card">
        {basic.length > 0 ? (
          <div className="form">
            {basic.map((f) => (
              <FieldControl key={f.key} field={f} value={values[f.key] ?? f.default} onChange={set(f.key)} />
            ))}
          </div>
        ) : (
          <div className="card-pad muted" style={{ fontSize: 12.5 }}>
            {spec.tui
              ? "An interactive program: it runs in the console below, which takes your keyboard input. Pop it out to use your own terminal."
              : "No options needed. Add arguments under More options if you want them."}
          </div>
        )}

        <button className={`more-toggle ${showMore ? "open" : ""}`} onClick={() => setShowMore((v) => !v)}>
          <Icon name="chevronRight" size={14} />
          More options
          {advanced.length > 0 && <span className="badge">{advanced.length}</span>}
        </button>
        {showMore && (
          <div className="form" style={{ paddingTop: 4 }}>
            {advanced.map((f) => (
              <FieldControl key={f.key} field={f} value={values[f.key] ?? f.default} onChange={set(f.key)} />
            ))}
            <div className="field">
              <label className="field-label">Working folder</label>
              <input className="input mono" value={cwd} placeholder={s.workDir || "home folder"} onChange={(e) => setCwd(e.target.value)} spellCheck={false} />
            </div>
            <div className="field wide">
              <label className="field-label">
                Extra arguments <span className="flag">appended as typed</span>
              </label>
              <input className="input mono" value={extra} placeholder="--any --flag 'quoted value'" onChange={(e) => setExtra(e.target.value)} spellCheck={false} />
            </div>
          </div>
        )}

        <div className="cmdline">
          <span className="prompt">$</span>
          <code className="mono" title={shellJoin([spec.program, ...args])}>
            <span className="prog">{spec.program}</span> {shellJoin(args)}
          </code>
          <button className="icon-btn sm" title="Copy command" onClick={copy}>
            <Icon name="copy" size={14} />
          </button>
          <button className="icon-btn sm" title="Reset form" onClick={() => { setValues({}); setExtra(""); setCwd(""); }}>
            <Icon name="eraser" size={14} />
          </button>
          <button className="btn sm" onClick={popOut} title="Run in your terminal app">
            <Icon name="external" size={14} /> Terminal
          </button>
          <button className="btn sm primary" onClick={run} disabled={missing.length > 0} title={missing.length ? `Needs: ${missing.map((f) => f.label).join(", ")}` : "Run"}>
            <Icon name="play" size={14} /> Run
          </button>
        </div>
      </div>

      <Console jobId={latest?.id} height={consoleHeight ?? (spec.tui ? 560 : 400)} />
    </div>
  );
}

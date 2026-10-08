import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Terminal } from "./Terminal";
import { go, jobBuffer, jobs, stopJob, toast, type Job } from "../lib/state";
import { useStore } from "../lib/store";
import { shellJoin } from "../lib/argv";

export function elapsed(job: Job, now = Date.now()) {
  const s = Math.max(0, Math.round(((job.endedAt ?? now) - job.startedAt) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

export function StatusPill({ job }: { job: Job }) {
  const label = {
    starting: "Starting",
    running: "Running",
    done: "Finished",
    failed: job.code != null ? `Exit ${job.code}` : "Failed",
    stopped: "Stopped",
  }[job.status];
  return (
    <span className={`status-pill ${job.status === "starting" ? "running" : job.status}`}>
      {job.status === "running" || job.status === "starting" ? (
        <Icon name="spinner" size={12} className="spin" />
      ) : job.status === "done" ? (
        <Icon name="check" size={12} />
      ) : (
        <Icon name="x" size={12} />
      )}
      {label}
    </span>
  );
}

/** Ticks once a second while anything is running, for elapsed times. */
export function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

export function Console({
  jobId,
  height = 380,
  emptyText = "Run the command to see its output here.",
  showOpen = true,
}: {
  jobId?: string;
  height?: number | string;
  emptyText?: string;
  showOpen?: boolean;
}) {
  const all = useStore(jobs);
  const job = jobId ? all.find((j) => j.id === jobId) : undefined;
  const live = !!job && (job.status === "running" || job.status === "starting");
  const now = useNow(live);

  const copy = async () => {
    // Strip escape sequences so what lands on the clipboard is the text.
    const text = jobBuffer(job!.id)
      .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
      .replace(/\x1b\][^\x07]*\x07/g, "")
      .replace(/\r(?!\n)/g, "\n");
    await navigator.clipboard.writeText(text);
    toast("Output copied", "ok");
  };

  return (
    <div className="console" style={{ height }}>
      <div className="console-bar">
        <div className="lights">
          <i />
          <i />
          <i />
        </div>
        {job ? (
          <>
            <StatusPill job={job} />
            <span className="title grow" title={shellJoin(job.argv)}>
              {shellJoin([job.program, ...job.args])}
            </span>
            <span className="tabular" style={{ fontSize: 11.5, color: "#6e6e74" }}>
              {elapsed(job, now)}
            </span>
            <button className="icon-btn sm" title="Send Ctrl-C" disabled={!live} onClick={() => stopJob(job.id, "int")}>
              <Icon name="pause" size={14} />
            </button>
            <button className="icon-btn sm" title="Stop (SIGTERM)" disabled={!live} onClick={() => stopJob(job.id, "term")}>
              <Icon name="stop" size={14} />
            </button>
            <button className="icon-btn sm" title="Kill (SIGKILL)" disabled={!live} onClick={() => stopJob(job.id, "kill")}>
              <Icon name="stopHard" size={14} />
            </button>
            <button className="icon-btn sm" title="Copy output" onClick={copy}>
              <Icon name="copy" size={14} />
            </button>
            {showOpen && (
              <button className="icon-btn sm" title="Open in Jobs" onClick={() => go({ view: "jobs", job: job.id })}>
                <Icon name="maximize" size={14} />
              </button>
            )}
          </>
        ) : (
          <span className="title grow">console</span>
        )}
      </div>
      {job ? (
        <Terminal key={job.id} jobId={job.id} />
      ) : (
        <div className="console-empty">
          <div>
            <Icon name="terminal" size={26} style={{ marginBottom: 8, opacity: 0.6 }} />
            <div>{emptyText}</div>
          </div>
        </div>
      )}
    </div>
  );
}

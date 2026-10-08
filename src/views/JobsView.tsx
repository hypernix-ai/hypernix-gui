import { Console, StatusPill, elapsed, useNow } from "../components/Console";
import { Icon } from "../components/Icon";
import { clearFinishedJobs, go, jobs } from "../lib/state";
import { useStore } from "../lib/store";

export function JobsView({ jobId }: { jobId?: string }) {
  const all = useStore(jobs);
  const live = all.some((j) => j.status === "running" || j.status === "starting");
  const now = useNow(live);
  const selected = all.find((j) => j.id === jobId) ?? all[0];

  return (
    <div className="page" style={{ maxWidth: "none" }}>
      <div className="jobs-layout">
        <div className="card" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div className="card-head">
            <Icon name="terminal" size={16} />
            <span className="card-title grow">Jobs</span>
            <button className="btn sm ghost" onClick={clearFinishedJobs} disabled={!all.some((j) => j.status !== "running" && j.status !== "starting")}>
              <Icon name="trash" size={13} /> Clear finished
            </button>
          </div>
          <div style={{ overflowY: "auto", padding: 6, flex: 1 }}>
            {all.length === 0 && <div className="empty">No jobs yet.</div>}
            {all.map((j) => (
              <button key={j.id} className={`job-row ${selected?.id === j.id ? "active" : ""}`} onClick={() => go({ view: "jobs", job: j.id })}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="t grow ellipsis">{j.title}</span>
                  <StatusPill job={j} />
                </div>
                <div className="c">{[j.program, ...j.args].join(" ")}</div>
                <div className="faint tabular" style={{ fontSize: 11 }}>
                  {new Date(j.startedAt).toLocaleTimeString()} · {elapsed(j, now)}
                </div>
              </button>
            ))}
          </div>
        </div>
        <Console jobId={selected?.id} height="100%" showOpen={false} emptyText="Jobs you run appear here, each with its own live console." />
      </div>
    </div>
  );
}

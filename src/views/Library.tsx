import { useEffect, useMemo, useState } from "react";
import { Segmented } from "../components/FieldControl";
import { Icon } from "../components/Icon";
import { api, revealPath, type ModelEntry } from "../lib/ipc";
import { formatAgo, formatBytes } from "../lib/format";
import { go, openCommand, settings, toast } from "../lib/state";
import { useStore } from "../lib/store";

type Kind = "all" | ModelEntry["kind"];

export function Library() {
  const s = useStore(settings);
  const [models, setModels] = useState<ModelEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind>("all");

  const scan = async () => {
    setLoading(true);
    try {
      setModels(await api.scanModels(s.modelDirs));
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void scan();
    // Rescan when the folder list changes in Settings.
  }, [s.modelDirs.join("|")]);

  const shown = useMemo(
    () =>
      (models ?? [])
        .filter((m) => kind === "all" || m.kind === kind)
        .filter((m) => !q || `${m.name} ${m.path}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.modified - a.modified),
    [models, kind, q],
  );
  const total = shown.reduce((a, m) => a + m.size, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-icon">
          <Icon name="library" size={22} />
        </div>
        <div className="grow">
          <h1>Model library</h1>
          <p>
            GGUF files, Hugging Face snapshots and Brewer checkpoints in your model folders. Every action opens the matching command
            with the path filled in.
          </p>
        </div>
        <button className="btn" onClick={() => go({ view: "settings" })}>
          <Icon name="folder" size={14} /> Folders
        </button>
        <button className="btn primary" onClick={scan} disabled={loading}>
          <Icon name="refresh" size={14} className={loading ? "spin" : ""} /> Rescan
        </button>
      </div>

      <div className="row wrap" style={{ marginBottom: 14, gap: 12 }}>
        <div className="input-group" style={{ width: 320 }}>
          <input className="input" placeholder="Filter by name or path" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Segmented<Kind>
          value={kind}
          onChange={setKind}
          options={[
            { value: "all", label: "All" },
            { value: "gguf", label: "GGUF" },
            { value: "snapshot", label: "Snapshots" },
            { value: "checkpoint", label: "Checkpoints" },
          ]}
        />
        <span className="grow" />
        <span className="faint tabular" style={{ fontSize: 12.5 }}>
          {shown.length} models · {formatBytes(total)}
        </span>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        {models === null ? (
          <div className="card-pad grid" style={{ gap: 10 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 34 }} />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="empty">
            <div className="ic">
              <Icon name="boxes" size={24} />
            </div>
            <div style={{ fontWeight: 600, color: "var(--text-dim)" }}>No models here yet</div>
            <div>Download one, or add the folders you keep models in.</div>
            <div className="actions" style={{ justifyContent: "center", marginTop: 6 }}>
              <button className="btn primary" onClick={() => openCommand("models", "download")}>
                <Icon name="download" size={14} /> Download a model
              </button>
            </div>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Size</th>
                <th>Modified</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.path}>
                  <td>
                    <div className="row" style={{ gap: 12 }}>
                      <span className={`kind ${m.kind}`}>
                        <Icon name={m.kind === "gguf" ? "gem" : m.kind === "snapshot" ? "boxes" : "cooker"} size={16} />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }} className="ellipsis">
                          {m.name}
                        </div>
                        <div className="mono faint ellipsis selectable" style={{ fontSize: 11, maxWidth: 520 }} title={m.path}>
                          {m.path}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="tabular mono" style={{ fontSize: 12 }}>
                    {formatBytes(m.size)}
                  </td>
                  <td className="faint" style={{ fontSize: 12 }}>
                    {formatAgo(m.modified)}
                  </td>
                  <td>
                    <div className="row-actions">
                      {m.kind === "gguf" ? (
                        <>
                          <button className="btn sm ghost" title="Chat with it" onClick={() => openCommand("inference", "chat", { modelDir: m.path })}>
                            <Icon name="chat" size={14} />
                          </button>
                          <button className="btn sm ghost" title="Quantise with hyprslug" onClick={() => openCommand("quant", "hyprslug", { source: m.path })}>
                            <Icon name="gem" size={14} />
                          </button>
                          <button className="btn sm ghost" title="Verify" onClick={() => openCommand("models", "verify", { gguf: m.path })}>
                            <Icon name="badge" size={14} />
                          </button>
                          <button className="btn sm ghost" title="Serve to other apps" onClick={() => openCommand("models", "runtime", { action: "serve", model: m.path })}>
                            <Icon name="plug" size={14} />
                          </button>
                        </>
                      ) : m.kind === "snapshot" ? (
                        <>
                          <button className="btn sm ghost" title="Chat with it" onClick={() => openCommand("inference", "chat", { modelDir: m.path })}>
                            <Icon name="chat" size={14} />
                          </button>
                          <button className="btn sm ghost" title="Convert to GGUF" onClick={() => openCommand("models", "convert", { source: m.path })}>
                            <Icon name="shuffle" size={14} />
                          </button>
                          <button className="btn sm ghost" title="Train from it" onClick={() => openCommand("training", "train-run", { modelDir: m.path })}>
                            <Icon name="flame" size={14} />
                          </button>
                        </>
                      ) : (
                        <button className="btn sm ghost" title="Convert to GGUF (Brewer)" onClick={() => openCommand("training", "brew", { action: "gguf", source: m.path })}>
                          <Icon name="shuffle" size={14} />
                        </button>
                      )}
                      <button
                        className="btn sm ghost"
                        title="Copy path"
                        onClick={async () => {
                          await navigator.clipboard.writeText(m.path);
                          toast("Path copied", "ok");
                        }}
                      >
                        <Icon name="copy" size={14} />
                      </button>
                      <button className="btn sm ghost" title="Show in folder" onClick={() => revealPath(m.path)}>
                        <Icon name="folder" size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

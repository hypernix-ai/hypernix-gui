import { useEffect, useState } from "react";
import { REPO_URL } from "../catalog";
import { Segmented, Switch } from "../components/FieldControl";
import { Icon } from "../components/Icon";
import { Console } from "../components/Console";
import { api, inTauri, openUrl, pickPath } from "../lib/ipc";
import { detectEnv, env, jobs, settings, startJob, toast, type Settings } from "../lib/state";
import { useStore } from "../lib/store";

const EXTRAS = [
  { id: "t1api", label: "T1 server", hint: "run hypernix-t1" },
  { id: "train", label: "Training", hint: "transformers, accelerate" },
  { id: "llama-cpp", label: "llama-cpp-python", hint: "in-process GGUF" },
  { id: "security", label: "Security", hint: "cryptography for -E" },
  { id: "elements", label: "Elements", hint: "psutil" },
  { id: "gui", label: "hyped-pro GUI", hint: "PySide6" },
];

function Row({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <>
      <div className="label">
        <div className="t">{title}</div>
        {sub && <div className="s">{sub}</div>}
      </div>
      <div>{children}</div>
    </>
  );
}

function SecretInput({ name, placeholder }: { name: string; placeholder: string }) {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api.secretGet(name).then((v) => {
      setSaved(!!v);
      setValue(v ? "••••••••••••" : "");
    });
  }, [name]);
  return (
    <div className="input-group">
      <input
        className="input mono"
        type="password"
        value={value}
        placeholder={placeholder}
        onFocus={() => saved && setValue("")}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
      />
      <button
        className="btn"
        onClick={async () => {
          await api.secretSet(name, value.trim() || null);
          setSaved(!!value.trim());
          setValue(value.trim() ? "••••••••••••" : "");
          toast(value.trim() ? "Saved" : "Removed", "ok");
        }}
      >
        Save
      </button>
      {saved && (
        <button
          className="btn ghost"
          onClick={async () => {
            await api.secretSet(name, null);
            setSaved(false);
            setValue("");
            toast("Removed", "ok");
          }}
        >
          Remove
        </button>
      )}
    </div>
  );
}

export function SettingsView() {
  const s = useStore(settings);
  const e = useStore(env);
  const allJobs = useStore(jobs);
  const [extras, setExtras] = useState<string[]>(["t1api"]);
  const [spec, setSpec] = useState("");
  const [dirsDraft, setDirsDraft] = useState(s.modelDirs.join("\n"));
  const patch = (p: Partial<Settings>) => settings.set({ ...s, ...p });
  const installJob = allJobs.find((j) => j.commandId === "pip-install");

  const install = async (target: string) => {
    if (!e.value?.python) {
      toast("No Python 3.12+ found. Set an interpreter first.", "error");
      return;
    }
    await startJob({ title: "Install HyperNix", program: "python", args: ["-m", "pip", "install", "--upgrade", target], commandId: "pip-install" });
  };
  const pkg = `hypernix${extras.length ? `[${extras.join(",")}]` : ""}`;

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="page-head">
        <div className="page-icon">
          <Icon name="settings" size={22} />
        </div>
        <div>
          <h1>Settings</h1>
          <p>Where HyperNix lives on this machine, the secrets commands use, and how the app looks.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <Icon name="terminal" size={16} />
          <span className="card-title grow">HyperNix installation</span>
          <button className="btn sm" onClick={() => detectEnv()} disabled={e.loading}>
            <Icon name="refresh" size={14} className={e.loading ? "spin" : ""} /> Detect again
          </button>
        </div>
        <div className="settings-grid">
          <Row title="Detected" sub={e.value?.sandboxed ? "Commands run on the host via flatpak-spawn" : "Read from your login shell's PATH"}>
            {e.loading ? (
              <div className="skeleton" style={{ height: 60 }} />
            ) : (
              <div className="grid" style={{ gap: 6 }}>
                {(e.value?.pythons ?? []).map((p) => (
                  <div key={p.executable} className="row" style={{ gap: 8 }}>
                    <span className={`dot ${p.hypernix ? "ok" : ""}`} />
                    <span className="mono ellipsis grow selectable" style={{ fontSize: 12 }}>
                      {p.executable}
                    </span>
                    <span className="badge mono">Python {p.version}</span>
                    <span className={`badge ${p.hypernix ? "ok" : ""}`}>{p.hypernix ? `hypernix ${p.hypernix}` : "no hypernix"}</span>
                    {e.value?.python?.executable === p.executable ? (
                      <span className="badge red">in use</span>
                    ) : (
                      <button
                        className="btn sm ghost"
                        onClick={() => {
                          patch({ python: p.executable });
                          void detectEnv();
                        }}
                      >
                        Use
                      </button>
                    )}
                  </div>
                ))}
                {!e.value?.pythons.length && <div className="faint">No Python interpreter found.</div>}
                <div className="faint" style={{ fontSize: 12 }}>
                  {Object.keys(e.value?.bins ?? {}).length} HyperNix scripts on PATH
                  {e.value?.t1Script ? " · hypernix-t1 found" : ""}
                  {e.value?.terminals.length ? ` · terminal: ${e.value.terminals[0]}` : ""}
                </div>
              </div>
            )}
          </Row>
          <hr />
          <Row title="Python interpreter" sub="Leave empty to detect. Commands then run with this interpreter's HyperNix.">
            <div className="input-group">
              <input className="input mono" value={s.python} placeholder="auto" onChange={(ev) => patch({ python: ev.target.value })} spellCheck={false} />
              <button className="btn" onClick={async () => { const p = await pickPath("file"); if (p) patch({ python: p }); }}>
                <Icon name="file" size={15} />
              </button>
              <button className="btn primary" onClick={() => detectEnv()}>
                Apply
              </button>
            </div>
          </Row>
          <Row title="Scripts folder" sub="Where hypernix, waiter, hypernix-t1… are, if not on PATH.">
            <div className="input-group">
              <input className="input mono" value={s.binDir} placeholder="auto" onChange={(ev) => patch({ binDir: ev.target.value })} spellCheck={false} />
              <button className="btn" onClick={async () => { const p = await pickPath("dir"); if (p) patch({ binDir: p }); }}>
                <Icon name="folder" size={15} />
              </button>
            </div>
          </Row>
          <Row title="Extra PATH" sub="Colon-separated, searched before the defaults.">
            <input className="input mono" value={s.extraPath} placeholder="/opt/cuda/bin:/usr/local/llama.cpp/bin" onChange={(ev) => patch({ extraPath: ev.target.value })} spellCheck={false} />
          </Row>
          <hr />
          <Row title="Install or upgrade" sub="Runs pip in the interpreter above.">
            <div className="grid" style={{ gap: 10 }}>
              <div className="chips">
                {EXTRAS.map((x) => (
                  <button
                    key={x.id}
                    className={`chip-toggle ${extras.includes(x.id) ? "on" : ""}`}
                    title={x.hint}
                    onClick={() => setExtras((cur) => (cur.includes(x.id) ? cur.filter((c) => c !== x.id) : [...cur, x.id]))}
                  >
                    {x.label}
                  </button>
                ))}
              </div>
              <div className="actions">
                <button className="btn primary" onClick={() => install(spec.trim() ? `${pkg}==${spec.trim()}` : pkg)}>
                  <Icon name="download" size={14} /> pip install -U {pkg}
                  {spec.trim() ? `==${spec.trim()}` : ""}
                </button>
                <input className="input mono" style={{ width: 160 }} placeholder="version (latest)" value={spec} onChange={(ev) => setSpec(ev.target.value)} />
                <button className="btn" onClick={() => install(`${pkg} @ git+${REPO_URL}.git`)} title="Newest code from the main branch">
                  From main
                </button>
              </div>
              {installJob && <Console jobId={installJob.id} height={260} />}
            </div>
          </Row>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <Icon name="lock" size={16} />
          <span className="card-title grow">Connections & secrets</span>
          <span className="card-sub">stored in a file only you can read</span>
        </div>
        <div className="settings-grid">
          <Row title="Hugging Face token" sub="Passed to every job as HF_TOKEN.">
            <SecretInput name="hf_token" placeholder="hf_…" />
          </Row>
          <Row title="T1 key" sub="Used by the T1 page to list served models.">
            <SecretInput name="t1_key" placeholder="T1_… / T2_…" />
          </Row>
          <Row title="T1 server URL" sub="Empty: read T1_HOST / T1_PORT from ~/.hypernix/t1api/.env.">
            <input className="input mono" value={s.t1Url} placeholder="http://127.0.0.1:8000" onChange={(ev) => patch({ t1Url: ev.target.value })} spellCheck={false} />
          </Row>
          <Row title="Watch the T1 server" sub="Check its health every 5 seconds while the T1 page is open.">
            <div style={{ width: 280 }}>
              <Switch on={s.pollT1} onChange={(v) => patch({ pollT1: v })} label={s.pollT1 ? "On" : "Off"} />
            </div>
          </Row>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <Icon name="folder" size={16} />
          <span className="card-title grow">Folders & terminal</span>
        </div>
        <div className="settings-grid">
          <Row title="Working folder" sub="Where commands run unless a form says otherwise. Empty: home.">
            <div className="input-group">
              <input className="input mono" value={s.workDir} placeholder="~" onChange={(ev) => patch({ workDir: ev.target.value })} spellCheck={false} />
              <button className="btn" onClick={async () => { const p = await pickPath("dir"); if (p) patch({ workDir: p }); }}>
                <Icon name="folder" size={15} />
              </button>
            </div>
          </Row>
          <Row title="Model folders" sub="Scanned by the model library, one per line.">
            <div className="grid" style={{ gap: 8 }}>
              <textarea className="textarea mono" style={{ fontSize: 12 }} value={dirsDraft} onChange={(ev) => setDirsDraft(ev.target.value)} rows={5} />
              <div>
                <button className="btn sm" onClick={() => { patch({ modelDirs: dirsDraft.split("\n").map((d) => d.trim()).filter(Boolean) }); toast("Folders saved", "ok"); }}>
                  Save folders
                </button>
              </div>
            </div>
          </Row>
          <Row title="Terminal command" sub="For “Terminal”. {cmd} is the command. Empty: detect.">
            <input className="input mono" value={s.terminalTemplate} placeholder="kitty sh -c {cmd}" onChange={(ev) => patch({ terminalTemplate: ev.target.value })} spellCheck={false} />
          </Row>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <Icon name="sparkles" size={16} />
          <span className="card-title grow">Appearance</span>
        </div>
        <div className="settings-grid">
          <Row title="Theme">
            <Segmented
              value={s.theme}
              onChange={(theme) => patch({ theme })}
              options={[
                { value: "system", label: "System" },
                { value: "dark", label: "Dark" },
                { value: "light", label: "Light" },
              ]}
            />
          </Row>
          <Row title="Console text size">
            <Segmented
              value={String(s.consoleFontSize)}
              onChange={(v) => patch({ consoleFontSize: Number(v) })}
              options={["12", "13", "14", "15"].map((v) => ({ value: v, label: `${v}px` }))}
            />
          </Row>
          <Row title="Reduce motion">
            <div style={{ width: 280 }}>
              <Switch on={s.reduceMotion} onChange={(v) => patch({ reduceMotion: v })} label={s.reduceMotion ? "On" : "Off"} />
            </div>
          </Row>
        </div>
      </div>

      <div className="card card-pad row wrap" style={{ marginTop: 16, gap: 14 }}>
        <img src="/hypernix-icon-ondark.svg" className="logo-ondark" alt="" style={{ width: 34 }} />
        <img src="/hypernix-icon.svg" className="logo-onlight" alt="" style={{ width: 34 }} />
        <div className="grow">
          <div style={{ fontWeight: 700 }}>HyperNix Control 0.1.0</div>
          <div className="faint" style={{ fontSize: 12 }}>
            A desktop front end for hypernix-pip by Hyprnyx (hypernix-ai). {inTauri ? "" : "Running in a browser: commands are simulated."}
          </div>
        </div>
        <button className="btn sm" onClick={() => openUrl(REPO_URL)}>
          <Icon name="external" size={14} /> hypernix-pip
        </button>
        <button className="btn sm" onClick={() => openUrl("https://huggingface.co/hypernix-ai")}>
          <Icon name="external" size={14} /> Hugging Face
        </button>
      </div>
    </div>
  );
}

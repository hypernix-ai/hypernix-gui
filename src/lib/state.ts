/**
 * Application state: settings, the detected environment, navigation and
 * jobs. Kept outside React so the job event listeners (registered once)
 * and every view read and write the same objects.
 */
import { api, onJobExit, onJobOutput, type HostEnv, type T1Probe } from "./ipc";
import { createStore, persistedStore } from "./store";
import type { Values } from "../catalog/types";

export interface Settings {
  theme: "system" | "dark" | "light";
  python: string;
  binDir: string;
  extraPath: string;
  workDir: string;
  t1Url: string;
  terminalTemplate: string;
  modelDirs: string[];
  consoleFontSize: number;
  reduceMotion: boolean;
  pollT1: boolean;
}

export const settings = persistedStore<Settings>("hnx.settings", {
  theme: "system",
  python: "",
  binDir: "",
  extraPath: "",
  workDir: "",
  t1Url: "",
  terminalTemplate: "",
  modelDirs: ["~/.hypernix/models", "~/.hypernix/t1api/models", "~/.cache/hypernix/models", "~/hypernix-gguf", "~/brewer_models"],
  consoleFontSize: 13,
  reduceMotion: false,
  pollT1: true,
});

// ---------------------------------------------------------------------------
// Environment

export const env = createStore<{ loading: boolean; value: HostEnv | null; error: string | null }>({
  loading: true,
  value: null,
  error: null,
});

export async function detectEnv() {
  env.set((s) => ({ ...s, loading: true }));
  const s = settings.get();
  try {
    const value = await api.envDetect({
      python: s.python || undefined,
      binDir: s.binDir || undefined,
      extraPath: s.extraPath || undefined,
    });
    env.set({ loading: false, value, error: null });
  } catch (e) {
    env.set({ loading: false, value: null, error: String(e) });
  }
}

// ---------------------------------------------------------------------------
// Navigation

export type Route =
  | { view: "overview" }
  | { view: "section"; section: string; command?: string; prefill?: Values; nonce?: number }
  | { view: "t1" }
  | { view: "library" }
  | { view: "jobs"; job?: string }
  | { view: "settings" };

export const route = createStore<Route>({ view: "overview" });
export const paletteOpen = createStore(false);

export function go(r: Route) {
  route.set(r);
}

export function openCommand(section: string, command: string, prefill?: Values) {
  route.set({ view: "section", section, command, prefill, nonce: Date.now() });
}

// ---------------------------------------------------------------------------
// T1 server status, shared by the top bar and the T1 view

export const t1 = createStore<{ url: string; probe: T1Probe | null; checkedAt: number }>({
  url: "",
  probe: null,
  checkedAt: 0,
});

export async function probeT1(url?: string) {
  const target = url || t1.get().url;
  if (!target) return;
  try {
    const probe = await api.t1Probe(target);
    t1.set({ url: target, probe, checkedAt: Date.now() });
  } catch (e) {
    t1.set({
      url: target,
      probe: { online: false, latencyMs: null, version: null, status: null, error: String(e) },
      checkedAt: Date.now(),
    });
  }
}

// ---------------------------------------------------------------------------
// Toasts

export interface Toast {
  id: number;
  kind: "ok" | "error" | "info";
  text: string;
}
export const toasts = createStore<Toast[]>([]);
export function toast(text: string, kind: Toast["kind"] = "info") {
  const id = Date.now() + Math.random();
  toasts.set((t) => [...t, { id, kind, text }]);
  window.setTimeout(() => toasts.set((t) => t.filter((x) => x.id !== id)), kind === "error" ? 7000 : 3800);
}

// ---------------------------------------------------------------------------
// Jobs

export type JobStatus = "starting" | "running" | "done" | "failed" | "stopped";

export interface Job {
  id: string;
  title: string;
  commandId?: string;
  program: string;
  args: string[];
  argv: string[];
  status: JobStatus;
  code: number | null;
  startedAt: number;
  endedAt?: number;
  tui?: boolean;
}

/** Output kept per job. xterm keeps its own scrollback; this is for replay. */
const MAX_BUFFER = 2_000_000;
const buffers = new Map<string, string>();
const outputSubs = new Map<string, Set<(data: string) => void>>();

export const jobs = createStore<Job[]>([]);

function patchJob(id: string, patch: Partial<Job>) {
  jobs.set((list) => list.map((j) => (j.id === id ? { ...j, ...patch } : j)));
}

export function jobBuffer(id: string) {
  return buffers.get(id) ?? "";
}

export function subscribeOutput(id: string, fn: (data: string) => void) {
  let set = outputSubs.get(id);
  if (!set) outputSubs.set(id, (set = new Set()));
  set.add(fn);
  return () => {
    set!.delete(fn);
  };
}

function appendOutput(id: string, data: string) {
  let buf = (buffers.get(id) ?? "") + data;
  if (buf.length > MAX_BUFFER) buf = buf.slice(buf.length - MAX_BUFFER);
  buffers.set(id, buf);
  outputSubs.get(id)?.forEach((fn) => fn(data));
}

let listening = false;
export async function listenForJobs() {
  if (listening) return;
  listening = true;
  await onJobOutput((id, data) => {
    const job = jobs.get().find((j) => j.id === id);
    if (job && job.status === "starting") patchJob(id, { status: "running" });
    appendOutput(id, data);
  });
  await onJobExit((id, code, success) => {
    const job = jobs.get().find((j) => j.id === id);
    const stopped = job?.status === "stopped";
    patchJob(id, {
      status: stopped ? "stopped" : success ? "done" : "failed",
      code,
      endedAt: Date.now(),
    });
    const label = job?.title ?? "Job";
    if (!stopped) toast(success ? `${label} finished` : `${label} exited with ${code ?? "an error"}`, success ? "ok" : "error");
  });
}

export async function startJob(opts: {
  title: string;
  program: string;
  args: string[];
  commandId?: string;
  tui?: boolean;
  cwd?: string;
  env?: [string, string][];
}): Promise<string> {
  const id = `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const job: Job = {
    id,
    title: opts.title,
    commandId: opts.commandId,
    program: opts.program,
    args: opts.args,
    argv: [opts.program, ...opts.args],
    status: "starting",
    code: null,
    startedAt: Date.now(),
    tui: opts.tui,
  };
  jobs.set((list) => [job, ...list].slice(0, 60));
  const hfToken = await api.secretGet("hf_token").catch(() => null);
  const env: [string, string][] = [...(opts.env ?? [])];
  if (hfToken) env.push(["HF_TOKEN", hfToken]);
  try {
    const started = await api.jobStart({
      id,
      program: opts.program,
      args: opts.args,
      cwd: opts.cwd || settings.get().workDir || undefined,
      env,
      cols: 110,
      rows: opts.tui ? 34 : 28,
    });
    patchJob(id, { argv: started.argv, status: "running" });
  } catch (e) {
    appendOutput(id, `\x1b[31m✗ ${String(e)}\x1b[0m\r\n`);
    patchJob(id, { status: "failed", endedAt: Date.now() });
    toast(String(e), "error");
  }
  return id;
}

export async function stopJob(id: string, signal: "int" | "term" | "kill" = "int") {
  if (signal !== "int") patchJob(id, { status: "stopped" });
  try {
    await api.jobSignal(id, signal);
  } catch (e) {
    toast(String(e), "error");
  }
}

export function clearFinishedJobs() {
  const keep = jobs.get().filter((j) => j.status === "running" || j.status === "starting");
  jobs.get()
    .filter((j) => !keep.includes(j))
    .forEach((j) => {
      buffers.delete(j.id);
      outputSubs.delete(j.id);
    });
  jobs.set(keep);
}

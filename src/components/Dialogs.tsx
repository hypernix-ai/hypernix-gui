import { useEffect } from "react";
import { createStore, useStore } from "../lib/store";
import { toasts } from "../lib/state";
import { Icon } from "./Icon";

interface ConfirmState {
  title: string;
  body: string;
  action: string;
  resolve: (ok: boolean) => void;
}
const confirmState = createStore<ConfirmState | null>(null);

/** Ask before something that cannot be taken back. */
export function confirm(title: string, body: string, action = "Continue"): Promise<boolean> {
  return new Promise((resolve) => confirmState.set({ title, body, action, resolve }));
}

export function ConfirmHost() {
  const s = useStore(confirmState);
  useEffect(() => {
    if (!s) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (!s) return null;
  const close = (ok: boolean) => {
    s.resolve(ok);
    confirmState.set(null);
  };
  return (
    <div className="overlay" style={{ alignItems: "center", paddingTop: 0 }} onMouseDown={() => close(false)}>
      <div className="dialog" role="alertdialog" aria-modal onMouseDown={(e) => e.stopPropagation()}>
        <div className="row" style={{ marginBottom: 10 }}>
          <div className="page-icon" style={{ width: 38, height: 38, borderRadius: 11 }}>
            <Icon name="alert" size={18} />
          </div>
          <h3 style={{ margin: 0 }}>{s.title}</h3>
        </div>
        <p>{s.body}</p>
        <div className="actions" style={{ justifyContent: "flex-end", marginTop: 20 }}>
          <button className="btn ghost" onClick={() => close(false)}>
            Cancel
          </button>
          <button className="btn primary" autoFocus onClick={() => close(true)}>
            {s.action}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Toasts() {
  const list = useStore(toasts);
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <Icon name={t.kind === "ok" ? "checkCircle" : t.kind === "error" ? "xCircle" : "info"} size={17} />
          <span className="selectable">{t.text}</span>
        </div>
      ))}
    </div>
  );
}

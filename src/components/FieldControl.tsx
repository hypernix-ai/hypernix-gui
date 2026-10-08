import { useId, useState, type KeyboardEvent } from "react";
import type { Field, Value } from "../catalog/types";
import { pickPath, pickPaths } from "../lib/ipc";
import { Icon } from "./Icon";

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" className={`switch-row ${on ? "on" : ""}`} onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <span className="lbl">{label}</span>
      <span className="switch" />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button type="button" key={o.value} className={value === o.value ? "active" : ""} onClick={() => onChange(o.value)} role="radio" aria-checked={value === o.value}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function asArray(v: Value): string[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim()) return v.split(/[\s,]+/).filter(Boolean);
  return [];
}

function TagInput({ value, onChange, placeholder, pathMode }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; pathMode?: "file" | "dir" }) {
  const [draft, setDraft] = useState("");
  const add = (items: string[]) => {
    const next = [...value, ...items.map((s) => s.trim()).filter(Boolean)];
    onChange(next);
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && draft.trim()) {
      e.preventDefault();
      add([draft]);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  return (
    <div className="input-group">
      <div className="tag-input grow">
        {value.map((t, i) => (
          <span className="tag" key={`${t}-${i}`}>
            <span title={t}>{t}</span>
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remove ${t}`}>
              <Icon name="x" size={12} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          placeholder={value.length ? "" : placeholder ?? "Type and press Enter"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => draft.trim() && add([draft])}
        />
      </div>
      {pathMode && (
        <button
          type="button"
          className="btn"
          title="Browse"
          onClick={async () => {
            if (pathMode === "file") add(await pickPaths());
            else {
              const p = await pickPath("dir");
              if (p) add([p]);
            }
          }}
        >
          <Icon name="folder" size={15} />
        </button>
      )}
    </div>
  );
}

export function FieldControl({ field, value, onChange }: { field: Field; value: Value; onChange: (v: Value) => void }) {
  const id = useId();
  const str = typeof value === "string" ? value : "";
  const flagLabel = field.positional ? "" : field.kind === "tristate" ? `${field.on}` : field.flag ?? "";

  let control: React.ReactNode;
  switch (field.kind) {
    case "toggle":
      return (
        <div className={`field ${field.wide ? "wide" : ""}`} title={field.help ? `${field.flag} — ${field.help}` : field.flag}>
          <div className="field-label">
            <span>&nbsp;</span>
            <span className="flag">{field.flag}</span>
          </div>
          <Switch on={value === true} onChange={onChange} label={field.label} />
          {field.help && <div className="field-help">{field.help}</div>}
        </div>
      );
    case "tristate":
      control = (
        <Segmented
          value={(str || "default") as "default" | "on" | "off"}
          options={[
            { value: "default", label: "Default" },
            { value: "on", label: "Include" },
            { value: "off", label: "Exclude" },
          ]}
          onChange={onChange}
        />
      );
      break;
    case "select":
      control = (
        <select id={id} className="select" value={str} onChange={(e) => onChange(e.target.value)}>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label ?? (o.value === "" ? "Tool default" : o.value)}
            </option>
          ))}
        </select>
      );
      break;
    case "combo":
      control = (
        <>
          <input id={id} className="input mono" list={`${id}-list`} value={str} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
          <datalist id={`${id}-list`}>
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </datalist>
        </>
      );
      break;
    case "number":
      control = (
        <input
          id={id}
          className="input mono"
          type="number"
          inputMode="decimal"
          value={str}
          min={field.min}
          max={field.max}
          step={field.step ?? "any"}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case "textarea":
      control = <textarea id={id} className="textarea" value={str} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "secret":
      control = <input id={id} className="input mono" type="password" autoComplete="off" value={str} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "path":
      control = (
        <div className="input-group">
          <input id={id} className="input mono" value={str} placeholder={field.placeholder ?? (field.mode === "dir" ? "Folder…" : "File…")} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
          <button
            type="button"
            className="btn"
            title="Browse"
            onClick={async () => {
              const p = await pickPath(field.mode, field.extensions);
              if (p) onChange(p);
            }}
          >
            <Icon name={field.mode === "dir" ? "folder" : "file"} size={15} />
          </button>
        </div>
      );
      break;
    case "list":
      if (field.options?.length) {
        const set = new Set(asArray(value));
        control = (
          <div className="chips">
            {field.options.map((o) => (
              <button
                type="button"
                key={o.value}
                className={`chip-toggle ${set.has(o.value) ? "on" : ""}`}
                onClick={() => {
                  const next = new Set(set);
                  if (next.has(o.value)) next.delete(o.value);
                  else next.add(o.value);
                  onChange(field.options!.map((x) => x.value).filter((x) => next.has(x)));
                }}
              >
                {o.label ?? o.value}
              </button>
            ))}
          </div>
        );
      } else {
        control = <TagInput value={asArray(value)} onChange={onChange} placeholder={field.placeholder} pathMode={field.pathMode} />;
      }
      break;
    default:
      control = <input id={id} className="input" value={str} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} spellCheck={false} />;
  }

  return (
    <div className={`field ${field.wide || field.kind === "list" ? "wide" : ""}`}>
      <label className="field-label" htmlFor={id}>
        {field.label}
        {field.required && <span className="req">*</span>}
        {flagLabel && <span className="flag">{flagLabel}</span>}
      </label>
      {control}
      {field.help && <div className="field-help">{field.help}</div>}
    </div>
  );
}

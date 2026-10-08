import { sectionById } from "../catalog";
import type { Values } from "../catalog/types";
import { CommandRunner } from "../components/CommandRunner";
import { Icon } from "../components/Icon";
import { jobs, openCommand } from "../lib/state";
import { useStore } from "../lib/store";

export function SectionView({ sectionId, commandId, prefill, nonce }: { sectionId: string; commandId?: string; prefill?: Values; nonce?: number }) {
  const section = sectionById(sectionId);
  const allJobs = useStore(jobs);
  if (!section) return null;
  const commands = section.groups.flatMap((g) => g.commands);
  const spec = commands.find((c) => c.id === commandId) ?? commands[0];
  const isRunning = (id: string) => allJobs.some((j) => j.commandId === id && (j.status === "running" || j.status === "starting"));

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-icon">
          <Icon name={section.icon} size={22} />
        </div>
        <div>
          <h1>{section.title}</h1>
          <p>{section.blurb}</p>
        </div>
      </div>

      <div className="section-layout">
        <div className="cmd-list">
          {section.groups.map((g) => (
            <div key={g.title}>
              <div className="eyebrow cmd-group-title">{g.title}</div>
              {g.commands.map((c) => (
                <button key={c.id} className={`cmd-item ${c.id === spec.id ? "active" : ""}`} onClick={() => openCommand(section.id, c.id)}>
                  <span className="ic">
                    <Icon name={c.icon} size={15} />
                  </span>
                  <span className="grow">
                    <div className="t">{c.title}</div>
                    <div className="s">{c.summary}</div>
                  </span>
                  {isRunning(c.id) && <span className="running-dot" title="Running" />}
                </button>
              ))}
            </div>
          ))}
        </div>
        <CommandRunner key={`${spec.id}:${nonce ?? 0}`} spec={spec} prefill={spec.id === commandId ? prefill : undefined} />
      </div>
    </div>
  );
}

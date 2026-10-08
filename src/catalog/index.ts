import type { CommandSpec, Section } from "./types";
import { modelsSection } from "./models";
import { quantSection } from "./quant";
import { trainingSection } from "./training";
import { inferenceSection } from "./inference";
import { t1Section } from "./t1";
import { waiterSection } from "./waiter";
import { keysSection } from "./keys";
import { monitorSection, systemSection } from "./system";

export const SECTIONS: Section[] = [
  modelsSection,
  quantSection,
  trainingSection,
  inferenceSection,
  t1Section,
  waiterSection,
  keysSection,
  monitorSection,
  systemSection,
];

export interface IndexedCommand {
  section: Section;
  command: CommandSpec;
}

export const ALL_COMMANDS: IndexedCommand[] = SECTIONS.flatMap((section) =>
  section.groups.flatMap((g) => g.commands.map((command) => ({ section, command }))),
);

export function findCommand(id: string): IndexedCommand | undefined {
  return ALL_COMMANDS.find((c) => c.command.id === id);
}

export function sectionById(id: string): Section | undefined {
  return SECTIONS.find((s) => s.id === id);
}

export const REPO_URL = "https://github.com/trail-b1az3r/HyperNix-pip";
export function docUrl(doc: string) {
  return `${REPO_URL}/blob/main/${doc}`;
}

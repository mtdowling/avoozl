export type WorkbenchController = {
  renderTasks(input: Record<string, unknown>): void;
  renderNow(input: Record<string, unknown>): void;
  select(id: string): void;
  suspend(): void;
};

export function createWorkbench(options: {
  tasksElement: HTMLElement;
  nowElement: HTMLElement;
  nowScrollElement?: HTMLElement;
  nowChanged?(snapshot: unknown): void;
  badge(id: string): string;
  epicName(id: string): string;
  trackName(id: string): string;
  refresh(): void;
  setCount(text: string, note?: string): void;
  canLinkSession?: boolean;
  rowHeights?: { group: number; task: number; taskWithBlockers: number };
}): WorkbenchController;

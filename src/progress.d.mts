export type EpicProgressController = {
  render(input: Record<string, unknown>): void;
  suspend(): void;
  setSelection(id: string): void;
};

export function createEpicProgress(
  root: HTMLElement,
  callbacks: {
    select(id: string): void;
    changeZoom(value: number): void;
  },
): EpicProgressController;

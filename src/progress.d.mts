export type EpicProgressController = {
  render(input: Record<string, unknown>): void;
  suspend(): void;
  setLabelWidth(width: number): void;
  setSelection(id: string): void;
};

export function createEpicProgress(
  root: HTMLElement,
  callbacks: {
    controlsRoot?: HTMLElement;
    select(id: string): void;
    changeZoom(value: number): void;
  },
): EpicProgressController;

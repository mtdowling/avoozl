export type SingleStripController = {
  render(input: Record<string, unknown>): void;
  suspend(): void;
  setSelection(id: string): void;
  updateActivity?(snapshot: unknown): void;
};

export function createSingleStrip(
  root: HTMLElement,
  callbacks: {
    select(id: string): void;
    changeCamera(camera: { scale: number; center: number }): void;
    interact?(): void;
    changeOrder?(order: string): void;
  },
): SingleStripController;

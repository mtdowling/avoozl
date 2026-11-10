export const NODE_W: number;
export const NODE_H: number;

export function dependencyLayout<T extends { id: string }>(
  nodes: T[],
  links: Array<{ from: string; to: string; kind: string }>,
  group?: (node: T) => string,
): Record<string, { x: number; y: number }>;

export function dependencyPath(
  edge: { from: string; to: string; kind: string },
  positions: Record<string, { x: number; y: number }>,
  links: Array<{ from: string; to: string; kind: string }>,
): string;

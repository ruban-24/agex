export function calculatePort(taskIndex: number, base: number, step: number): number {
  return base + step * (taskIndex + 1);
}

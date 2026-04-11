export function calculatePort(taskIndex: number, base: number, step: number): number {
  return base + step * (taskIndex + 1);
}

export function nextAvailablePort(existingPorts: number[], base: number, step: number): number {
  if (existingPorts.length === 0) {
    return base + step;
  }
  const sorted = [...existingPorts].sort((a, b) => a - b);
  for (let slot = base + step; ; slot += step) {
    if (!sorted.includes(slot)) {
      return slot;
    }
  }
}

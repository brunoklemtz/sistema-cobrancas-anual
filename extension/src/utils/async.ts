export function sleep(ms: number, signal?: { abort: boolean }) {
  return new Promise<void>((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      if (signal?.abort) {
        reject(new Error("Varredura interrompida."));
        return;
      }
      if (Date.now() - t0 >= ms) {
        resolve();
        return;
      }
      setTimeout(tick, Math.min(80, ms));
    };
    setTimeout(tick, Math.min(80, ms));
  });
}

export async function waitUntil(
  fn: () => boolean,
  timeoutMs: number,
  signal?: { abort: boolean }
): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (signal?.abort) throw new Error("Varredura interrompida.");
    if (fn()) return true;
    await sleep(120, signal);
  }
  return false;
}

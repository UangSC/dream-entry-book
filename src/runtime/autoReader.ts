export type AutoPace = 'slow' | 'normal' | 'fast';
export function autoReadDuration(text: string, pace: AutoPace) {
  const length = [...text.replace(/\s/g, '')].length;
  return Math.max(2400, Math.min(20000, 900 + length * 1000 / { slow: 5, normal: 8, fast: 12 }[pace]));
}

/** 暂停时返回已走过的时间；恢复后接着走，单次时钟至多翻一句。 */
export function scheduleAutoRead(duration: number, elapsed: number, progress: (value: number) => void, advance: () => void) {
  const started = performance.now();
  let passed = elapsed, done = false;
  const timer = setInterval(() => {
    if (done) return;
    passed = Math.min(duration, elapsed + performance.now() - started);
    progress(passed / duration);
    if (passed >= duration) { done = true; clearInterval(timer); advance(); }
  }, 40);
  return () => { clearInterval(timer); return Math.min(duration, elapsed + performance.now() - started); };
}

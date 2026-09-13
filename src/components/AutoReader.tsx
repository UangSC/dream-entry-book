import { useEffect, useRef, useState } from 'react';
import { scheduleAutoRead } from '../runtime/autoReader';

export function useAutoReader(key: string, duration: number, enabled: boolean, running: boolean, advance: () => void) {
  const elapsed = useRef(0), callback = useRef(advance);
  callback.current = advance;
  const [progress, setProgress] = useState(0);
  useEffect(() => { elapsed.current = 0; setProgress(0); }, [key, duration, enabled]);
  useEffect(() => {
    if (!enabled || !running) return;
    const stop = scheduleAutoRead(duration, elapsed.current, setProgress, () => callback.current());
    return () => { elapsed.current = stop(); };
  }, [key, duration, enabled, running]);
  return progress;
}

export function AutoReadRing({ progress }: { progress: number }) {
  return <svg className="auto-read-ring" width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
    <circle className="auto-ring-track" cx="16" cy="16" r="12" />
    <circle className="auto-ring-progress" cx="16" cy="16" r="12" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - progress * 100} transform="rotate(-90 16 16)" />
    <path d="m14 12 6 4-6 4z" fill="currentColor" stroke="none" />
  </svg>;
}

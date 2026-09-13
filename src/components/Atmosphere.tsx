import { useMemo } from 'react';
import type { CSSProperties } from 'react';

export function Atmosphere({ scene, kind, enabled }: { scene: string; kind: 'fireflies' | 'leaves' | 'none'; enabled: boolean }) {
  const particles = useMemo(() => {
    let seed = [...scene].reduce((sum, char) => sum * 31 + char.charCodeAt(0) >>> 0, 19);
    const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
    return Array.from({ length: kind === 'leaves' ? 8 : 16 }, () => ({ '--left': `${random() * 100}%`, '--top': `${12 + random() * 65}%`, '--duration': `${kind === 'leaves' ? 16 + random() * 15 : 5 + random() * 6}s`, '--delay': `${-random() * 30}s`, '--drift': `${(random() - .5) * 180}px`, '--size': `${kind === 'leaves' ? 5 + random() * 5 : 2 + random() * 2}px`, '--turn': `${random() * 360}deg` } as CSSProperties));
  }, [scene, kind]);
  if (!enabled || kind === 'none') return null;
  return <div className={`atmosphere atmosphere-${kind}`} data-atmosphere={kind} aria-hidden="true">{particles.map((style, index) => <i key={`${scene}-${index}`} style={style} />)}</div>;
}

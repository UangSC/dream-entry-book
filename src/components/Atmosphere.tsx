import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { ParticleKind } from '../books/schema';

export function Atmosphere({ scene, kind, enabled }: { scene: string; kind: ParticleKind; enabled: boolean }) {
  const particles = useMemo(() => {
    let seed = [...scene].reduce((sum, char) => sum * 31 + char.charCodeAt(0) >>> 0, 19);
    const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
    if (kind === 'rain') return Array.from({ length: 56 }, () => ({
      '--left': `${random() * 112}%`, '--duration': `${.65 + random() * .7}s`, '--delay': `${-random() * 4}s`,
      '--drift': `${-35 - random() * 80}px`, '--size': `${.8 + random() * .8}px`,
      '--length': `${18 + random() * 25}px`, '--rain-opacity': .18 + random() * .32,
    } as CSSProperties));
    return Array.from({ length: kind === 'leaves' ? 8 : 16 }, () => ({ '--left': `${random() * 100}%`, '--top': `${12 + random() * 65}%`, '--duration': `${kind === 'leaves' ? 16 + random() * 15 : 5 + random() * 6}s`, '--delay': `${-random() * 30}s`, '--drift': `${(random() - .5) * 180}px`, '--size': `${kind === 'leaves' ? 5 + random() * 5 : 2 + random() * 2}px`, '--turn': `${random() * 360}deg` } as CSSProperties));
  }, [scene, kind]);
  if (!enabled || kind === 'none') return null;
  return <div className={`atmosphere atmosphere-${kind}`} data-atmosphere={kind} aria-hidden="true">{particles.map((style, index) => <i key={`${scene}-${index}`} style={style} />)}</div>;
}

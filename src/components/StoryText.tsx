import { useEffect } from 'react';
import type { Beat } from '../game/schema';
import type { CSSProperties } from 'react';

export type TextAnimation = 'authored' | 'typewriter' | 'instant';
export function StoryText({ beat, motion, instant, onComplete, speed, mode = 'authored' }: { beat: Beat; motion: boolean; instant: boolean; onComplete: () => void; speed: number; mode?: TextAnimation }) {
  const interval = speed / (beat.textSpeedScale ?? 1);
  const effect = motion && !instant && mode !== 'instant' ? mode === 'typewriter' ? 'typewriter' : beat.effect?.type ?? beat.anim ?? 'fade' : 'none';
  const duration = effect === 'typewriter' ? Math.max(320, ([...beat.text].length - 1) * interval + 320) : beat.effect?.durationMs ?? (beat.effect ? 850 : 450);
  useEffect(() => {
    if (effect === 'none') { onComplete(); return; }
    const timer = window.setTimeout(onComplete, duration);
    return () => clearTimeout(timer);
  }, [beat.id, effect, duration, onComplete]);
  const split = ['scramble', 'shatter', 'inkBloom', 'particleGather', 'particleScatter', 'typewriter'].includes(effect);
  return <p className={`story-text effect-${effect} ${beat.kind === 'thought' ? 'thought-text' : ''}`} style={{ '--effect-duration': `${duration}ms` } as CSSProperties}>
    {split ? <><span className="sr-only">{beat.text}</span><span aria-hidden="true">{[...beat.text].map((char, index) => <span className="letter" key={index} style={{ '--letter-index': index, '--letter-delay': `${index * (effect === 'typewriter' ? interval : 8)}ms`, '--scatter-x': `${((index * 7) % 13 - 6) * 8}px`, '--scatter-y': `${((index * 11) % 9 - 4) * 9}px` } as CSSProperties}>{char}</span>)}</span></> : beat.text}
  </p>;
}

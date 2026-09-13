import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import type { Presentation } from '../books/schema';
import { CHOICE_SETTLE_MS, evasiveOffset } from '../runtime/choiceMotion';
import { Icon } from './Icon';
import './StoryChoices.css';

type Mood = NonNullable<Presentation['choiceMoods']>[string];
export function StoryChoices({ options, moods, motion, onChoose }: {
  options: readonly { id: string; text: string }[]; moods?: Presentation['choiceMoods']; motion: boolean; onChoose: (id: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [offset, setOffset] = useState({ id: '', x: 0, y: 0 });
  const attempts = useRef<Record<string, number>>({});
  const locked = useRef(false);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const returnTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { clearTimeout(commitTimer.current); clearTimeout(returnTimer.current); }, []);
  function approach(event: PointerEvent<HTMLButtonElement>, id: string, mood: Mood) {
    if (!motion || locked.current || mood !== 'hesitant' || event.pointerType !== 'mouse' || (attempts.current[id] ?? 0) >= 2 || event.currentTarget.matches(':focus-visible')) return;
    attempts.current[id] = (attempts.current[id] ?? 0) + 1;
    const rect = event.currentTarget.getBoundingClientRect();
    setOffset({ id, ...evasiveOffset(event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2) });
    clearTimeout(returnTimer.current);
    returnTimer.current = setTimeout(() => setOffset({ id: '', x: 0, y: 0 }), 850);
  }
  function select(id: string, mood: Mood) {
    if (locked.current) return;
    locked.current = true;
    setOffset({ id: '', x: 0, y: 0 });
    setSelected(id);
    if (!motion) { onChoose(id); return; }
    commitTimer.current = setTimeout(() => onChoose(id), CHOICE_SETTLE_MS[mood]);
  }
  return <div className="story-choice-stage" data-motion={motion} data-selected={selected !== null}>
    <div className="story-choice-scrim" aria-hidden="true" />
    <div className="story-choice-list" role="group" aria-label="此刻的选择">
      {options.map((option, index) => {
        const mood = moods?.[option.id] ?? 'warm';
        return <button key={option.id} className={`story-choice mood-${mood}`} disabled={selected !== null}
          data-chosen={selected === option.id} onPointerEnter={event => approach(event, option.id, mood)}
          onFocus={() => setOffset({ id: '', x: 0, y: 0 })} onClick={() => select(option.id, mood)}
          style={{ '--choice-index': index, '--settle': `${CHOICE_SETTLE_MS[mood]}ms`, '--evade-x': `${offset.id === option.id ? offset.x : 0}px`, '--evade-y': `${offset.id === option.id ? offset.y : 0}px` } as CSSProperties}>
          <span className="choice-surface"><span className="choice-emblem" aria-hidden="true">{['warm', 'bashful'].includes(mood) ? '✧' : mood === 'resolute' ? '◇' : mood === 'guarded' ? '⌁' : mood === 'hesitant' ? '⋯' : '～'}</span><span className="choice-copy">{option.text}</span><Icon name="arrow" size={18} /><span className="choice-trace" aria-hidden="true" /></span>
        </button>;
      })}
    </div>
  </div>;
}

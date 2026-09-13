import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { base } from '../runtime/library';
import { KEEPER_ACTIONS, KEEPER_QUOTES, KEEPER_SMOKE, startKeeperSchedule } from '../runtime/keeper';
import './HomeCompanions.css';

export function HomeCompanions({ motion, active }: { motion: boolean; active: boolean }) {
  const [action, setAction] = useState(0), [quote, setQuote] = useState(0);
  const [veiled, setVeiled] = useState(false);
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  const current = useRef({ action: 0, quote: 0 });
  const running = motion && active && visible;
  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  useEffect(() => {
    if (!motion) return;
    // 提前解码下一组动作，换图时烟幕下面不出现空白。
    const images = KEEPER_ACTIONS.map(({ id }) => {
      const image = new Image(); image.src = `${base}mascot/${id}.webp`;
      void image.decode().catch(() => {});
      return image;
    });
    return () => { images.forEach(image => image.removeAttribute('src')); };
  }, [motion]);
  useEffect(() => {
    if (!running) { setVeiled(false); return; }
    return startKeeperSchedule({
      action: index => { current.current.action = index; setAction(index); },
      quote: index => { current.current.quote = index; setQuote(index); },
      veil: setVeiled,
    }, current.current);
  }, [running]);
  const saying = KEEPER_QUOTES[quote]!;
  const pose = KEEPER_ACTIONS[action]!;
  return <aside className="home-companions" aria-label="梦斋的陪伴" data-paused={!running}
    style={{ '--keeper-smoke-duration': `${KEEPER_SMOKE.durationMs}ms` } as CSSProperties}>
    <div className="keeper-actor" data-action={motion ? pose.id : 'still'} data-veiled={veiled && running}>
      <div className="keeper-sprite">
      <img key={pose.id} className="keeper-image" src={`${base}mascot/${motion && visible ? pose.id : 'still'}.webp`} width={320} height={320}
        alt={`守梦人刘看山${motion ? `，${pose.label}` : ''}`} onError={event => {
          const image = event.currentTarget;
          if (image.dataset.fallback) return;
          image.dataset.fallback = 'true'; image.src = `${base}mascot/still.webp`;
        }} />
      </div>
      {veiled && running && <div className="keeper-smoke" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <i key={index} style={{ '--puff': index } as CSSProperties} />)}</div>}
    </div>
    <div className="keeper-quote" data-quote={quote}>
      <span className="keeper-name">守梦人 · 刘看山</span>
      <p className="keeper-saying" aria-live="off">
        <span className="sr-only">{saying.text}</span>
        <span key={quote} className={motion ? 'keeper-typewriter' : ''} aria-hidden="true">{Array.from(saying.text).map((character, index) => <span className="keeper-letter" key={index} style={{ '--letter-index': index } as CSSProperties}>{character}</span>)}</span>
      </p>
    </div>
  </aside>;
}

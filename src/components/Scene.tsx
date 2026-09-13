import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ArtAsset } from '../runtime/library';
import { planTransition, TransitionController } from '../runtime/transition';

export function Scene({ asset, motion }: { asset: ArtAsset | undefined; motion: boolean }) {
  const shown = useRef<ArtAsset>();
  const [layers, setLayers] = useState<{ previous?: ArtAsset; current?: ArtAsset }>({});
  const [failed, setFailed] = useState(false);
  const previousRef = useRef<HTMLImageElement>(null), currentRef = useRef<HTMLImageElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const transitionKey = useRef('');
  useLayoutEffect(() => {
    if (!asset || shown.current?.src === asset.src) return;
    setLayers({ previous: shown.current, current: asset }); shown.current = asset;
  }, [asset]);
  useEffect(() => {
    if (!asset) return;
    let cancelled = false;
    const img = new Image(); img.src = asset.src;
    const timeout = window.setTimeout(() => { if (!cancelled) setFailed(true); }, 8000);
    img.decode().then(() => {
      if (cancelled) return;
      clearTimeout(timeout); setFailed(false);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [asset]);
  useLayoutEffect(() => {
    const incoming = currentRef.current, outgoing = previousRef.current;
    if (!incoming || !outgoing) return;
    const key = `${layers.previous?.src ?? ''}|${layers.current?.src ?? ''}`;
    if (transitionKey.current === key) {
      incoming.style.opacity = '1'; outgoing.style.opacity = '0'; incoming.style.filter = 'none'; outgoing.style.filter = 'none'; incoming.style.maskImage = 'none';
      if (root.current) root.current.dataset.transitioning = 'false';
      return;
    }
    transitionKey.current = key;
    const controller = new TransitionController();
    const plan = planTransition(layers.previous?.luminance ?? null, layers.current?.luminance ?? null, { animationsOff: !motion || !layers.previous });
    controller.start(plan, performance.now());
    let frame = 0;
    const render = (now: number) => {
      const state = controller.frame(now);
      if (root.current) root.current.dataset.transitioning = String(!state.done);
      incoming.style.opacity = String(state.inOpacity); outgoing.style.opacity = String(state.outOpacity);
      incoming.style.filter = `blur(${state.inBlurPx}px)`; outgoing.style.filter = `blur(${state.outBlurPx}px)`;
      const diagonal = Math.hypot(window.innerWidth, window.innerHeight);
      const radius = state.rippleRadius * diagonal;
      incoming.style.maskImage = plan.mode === 'ripple' && !state.done ? `radial-gradient(circle at 50% 42%, black ${Math.max(0, radius - state.rippleFeather * diagonal)}px, transparent ${radius}px)` : 'none';
      if (!state.done) frame = requestAnimationFrame(render);
    };
    render(performance.now());
    return () => cancelAnimationFrame(frame);
  }, [layers, motion]);
  return <div ref={root} className={`scene ${failed ? 'scene-failed' : ''}`} data-scene={asset?.id ?? 'fallback'} aria-hidden="true">
    {layers.current && <><img ref={previousRef} className="scene-image" src={(layers.previous ?? layers.current).src} alt="" /><img ref={currentRef} className="scene-image" src={layers.current.src} alt="" /></>}
  </div>;
}

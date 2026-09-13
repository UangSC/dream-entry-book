import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

interface ViewTransition { finished: Promise<void>; ready: Promise<void>; updateCallbackDone: Promise<void>; skipTransition: () => void }
export function usePortal(motion: boolean) {
  const [busy, setBusy] = useState(false), [direction, setDirection] = useState('enter');
  const running = useRef(false), transition = useRef<ViewTransition | null>(null), fallback = useRef<ReturnType<typeof setTimeout>>(), active = useRef(true);
  const skip = useCallback(() => { transition.current?.skipTransition(); if (fallback.current) clearTimeout(fallback.current); running.current = false; if (active.current) { setBusy(false); delete document.documentElement.dataset.portal; } }, []);
  useEffect(() => { active.current = true; return () => { active.current = false; transition.current?.skipTransition(); clearTimeout(fallback.current); delete document.documentElement.dataset.portal; }; }, []);
  useEffect(() => { if (!motion) skip(); }, [motion, skip]);
  const cross = (update: () => void, nextDirection: 'enter' | 'exit') => {
    if (running.current) return;
    if (!motion) { update(); return; }
    running.current = true; flushSync(() => { setDirection(nextDirection); setBusy(true); });
    document.documentElement.dataset.portal = nextDirection;
    const doc = document as unknown as { startViewTransition?: (callback: () => void) => ViewTransition };
    if (doc.startViewTransition) {
      // 更新回调期间浏览器暂停绘制；不能在里面等待 requestAnimationFrame。
      const result = doc.startViewTransition.call(document, () => { flushSync(update); });
      void result.ready.catch(() => {}); void result.updateCallbackDone.catch(() => {});
      transition.current = result; void result.finished.catch(() => {}).finally(() => { if (transition.current === result) skip(); });
    } else {
      // 渐变水幕覆盖全页面；旧浏览器同样有入梦仪式，页面动作只执行一次。
      flushSync(update); fallback.current = setTimeout(skip, 2100);
    }
  };
  return { busy, cross, layer: busy ? <div className={`portal-water portal-${direction}`} aria-hidden="true"><i /><i /><i /></div> : null };
}

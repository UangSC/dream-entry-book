import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

export function Dialog({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => { ref.current?.close(); prior?.focus(); };
  }, []);
  return <dialog ref={ref} className={`dialog ${wide ? 'dialog-wide' : ''}`} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === ref.current) { const box = ref.current.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose(); } }}>
    <header className="dialog-header"><div><span className="eyebrow">入梦书 · 梦斋手记</span><h2 id={titleId}>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭面板"><Icon name="close" /></button></header>
    <div className="dialog-body">{children}</div>
  </dialog>;
}

import { useEffect, useState } from 'react';
import type { ArtAsset } from '../runtime/library';

export function DialoguePortrait({ portrait, name, label, motion = true, narrator = false, direct = false }: { portrait?: ArtAsset; name: string; label: string; motion?: boolean; narrator?: boolean; direct?: boolean }) {
  const [shown, setShown] = useState(portrait), [previous, setPrevious] = useState<ArtAsset>();
  const [failed, setFailed] = useState<string>();
  useEffect(() => {
    if (portrait?.src === shown?.src) return;
    let cancelled = false;
    const image = portrait ? new Image() : null;
    if (image && portrait) image.src = portrait.src;
    const swap = () => {
      if (cancelled) return;
      setPrevious(motion ? shown : undefined); setShown(portrait); setFailed(undefined);
    };
    // 新图解码后再交叠切换，避免透明空帧。
    if (image) void image.decode().then(swap).catch(() => { if (!cancelled) { setShown(portrait); setPrevious(undefined); setFailed(portrait?.src); } });
    else swap();
    return () => { cancelled = true; };
  }, [portrait, shown, motion]);
  useEffect(() => {
    if (!previous) return;
    const timer = setTimeout(() => setPrevious(undefined), 520);
    return () => clearTimeout(timer);
  }, [previous]);
  const hasImage = shown && failed !== shown.src;
  return <figure className={`dialogue-portrait ${hasImage ? '' : 'portrait-name-only'} ${narrator ? 'portrait-narrator' : ''} ${direct ? 'portrait-direct' : ''}`}>
    {previous && motion && <img className="portrait-outgoing" src={previous.src} alt="" aria-hidden="true" />}
    {hasImage && <img key={shown.src} className={motion && previous ? 'portrait-incoming' : ''} src={shown.src} alt={label} onError={() => setFailed(shown.src)} />}
    <figcaption>{name}</figcaption>
  </figure>;
}

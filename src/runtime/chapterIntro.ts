export type ChapterPhase = 'visible' | 'ash' | 'hidden';

/** 标题先消散，灰化到一半后品牌再退场；翻页不重启时钟。 */
export function scheduleChapterIntro(onPhase: (phase: ChapterPhase) => void, onBrand: (phase: ChapterPhase) => void = () => {}) {
  const ash = setTimeout(() => onPhase('ash'), 3000);
  const brandAsh = setTimeout(() => onBrand('ash'), 5500);
  const hidden = setTimeout(() => onPhase('hidden'), 8000);
  const brandHidden = setTimeout(() => onBrand('hidden'), 10500);
  return () => { [ash, brandAsh, hidden, brandHidden].forEach(clearTimeout); };
}

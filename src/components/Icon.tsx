export type IconName = 'book' | 'arrow' | 'sound' | 'mute' | 'settings' | 'close' | 'bookmark' | 'history' | 'home' | 'download' | 'spark' | 'check' | 'moon' | 'play' | 'pause';
const paths: Record<IconName, string> = {
  play: 'm8 4 12 8-12 8V4',
  pause: 'M8 4v16M16 4v16',
  book: 'M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1m0-15c3-2 6-2 9-1v15c-3-1-6-1-9 1V5',
  arrow: 'M4 12h15m-6-6 6 6-6 6',
  sound: 'M11 4 5 9H2v6h3l6 5V4m4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  mute: 'M11 4 5 9H2v6h3l6 5V4m5 5 6 6m0-6-6 6',
  settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
  close: 'm6 6 12 12M6 18 18 6',
  bookmark: 'M6 3h12v18l-6-4-6 4V3',
  history: 'M4 6a9 9 0 1 1-1 10M3 2v5h5m4 0v6l4 2',
  home: 'm3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  spark: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7',
  check: 'm5 12 4 4L19 6',
  moon: 'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11',
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export const KEEPER_ACTIONS = [
  { id: 'idle', label: '静静守候' },
  { id: 'wave', label: '挥手问好' },
  { id: 'sway', label: '轻轻晃悠' },
  { id: 'doze', label: '打个小盹' },
  { id: 'computer', label: '电脑前小坐' },
  { id: 'dribble', label: '玩一会儿球' },
] as const;

/** 为入梦书主题拟写的守梦短句，不是名人引言或原作台词。 */
export const KEEPER_QUOTES = [
  { text: '如果身在书中，我会怎样选择？' },
  { text: '这一页，能不能换个结局？' },
  { text: '梦醒以后，我会记得谁？' },
  { text: '有些答案，要走进故事才知道。' },
  { text: '心有柔软，也能护住一盏灯。' },
  { text: '故事还没结束，我也一样。' },
  { text: '想成为神仙，先学会珍惜吗？' },
  { text: '我是小妖怪，也能守护谁？' },
  { text: '如果善意没有回报，还要继续吗？' },
  { text: '换作是我，会为谁留下？' },
  { text: '渺小也没关系，真心自有回响。' },
  { text: '这一场梦，让我更懂自己的心。' },
] as const;

export const KEEPER_SMOKE = { durationMs: 3600, swapMs: 1800 } as const;

type Random = () => number;
export const randomKeeperDelay = (random: Random = Math.random) => 5000 + Math.min(25000, Math.floor(random() * 25001));
const anotherIndex = (current: number, count: number, random: Random) => {
  const index = Math.min(count - 2, Math.floor(random() * (count - 1)));
  return index >= current ? index + 1 : index;
};

/** 两条独立时钟；换动作先遮住，再换图，所有计时器可一次取消。 */
export function startKeeperSchedule(callbacks: {
  action: (index: number) => void;
  quote: (index: number) => void;
  veil: (visible: boolean) => void;
}, current: { action: number; quote: number }, random: Random = Math.random): () => void {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let stopped = false, action = current.action, quote = current.quote;
  const later = (callback: () => void, delay: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!stopped) callback();
    }, delay);
    timers.add(timer);
  };
  const animate = () => {
    const next = anotherIndex(action, KEEPER_ACTIONS.length, random);
    callbacks.veil(true);
    later(() => { action = next; callbacks.action(next); }, KEEPER_SMOKE.swapMs);
    later(() => callbacks.veil(false), KEEPER_SMOKE.durationMs);
    later(animate, randomKeeperDelay(random));
  };
  const speak = () => {
    quote = anotherIndex(quote, KEEPER_QUOTES.length, random);
    callbacks.quote(quote);
    later(speak, randomKeeperDelay(random));
  };
  // 初次换图也在 5–30 秒范围内；以后从烟幕开始计算下一次时间。
  later(animate, randomKeeperDelay(random) - KEEPER_SMOKE.swapMs);
  later(speak, randomKeeperDelay(random));
  return () => { stopped = true; timers.forEach(clearTimeout); timers.clear(); };
}

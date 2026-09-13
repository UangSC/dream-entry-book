import type { DreamPackage } from '../src/game/schema';
import type { Presentation } from '../src/books/schema';

const moods: Record<string, string> = {
  threshold: 'idle', fireside: 'panic', ember: 'soft', price: 'smug', 'first-breath': 'calm', doorstep: 'fierce',
  'zhang-gate': 'fierce', 'night-theft': 'smug', 'chicken-leg': 'hungry', 'zhang-chaos': 'smug', 'grove-echo': 'calm', 'promise-day': 'panic',
  'red-jacket': 'soft', 'years-call': 'panic', 'pit-rescue': 'fierce', fame: 'smug', 'street-kids': 'fierce', 'zhang-return': 'smug',
  taoist: 'panic', search: 'soft', 'farewell-ask': 'calm', 'bitter-heart': 'panic', 'empty-house': 'calm', funeral: 'calm',
  'crack-money': 'soft', guarding: 'calm', 'taoist-danger': 'panic', 'burn-mountain': 'fierce',
  'blood-words': 'fierce', 'patient-trap': 'calm', 'heart-taste': 'calm', 'fork-c8': 'panic', 'demon-road': 'calm',
  'master-comes': 'fierce', 'ten-thousand-shield': 'panic', 'ending-willing': 'soft', 'ending-aftertaste': 'soft',
  'ending-bitter': 'calm', 'ending-bitter-echo': 'soft', 'ending-demon-king': 'calm', 'ending-deferred': 'smug', 'ending-ascend': 'soft',
};
// 定稿行号为稳定演出锚点；情绪持续到下一条指定提示，不随旁白复位。
const cues: Record<string, string> = {
  'threshold-020': 'hungry', 'fireside-048': 'hungry', 'doorstep-151': 'soft', 'doorstep-166': 'smug',
  'chicken-leg-259': 'hungry', 'chicken-leg-267': 'soft', 'promise-day-362': 'soft',
  'red-jacket-031': 'calm', 'fame-138': 'soft', 'street-kids-163': 'smug',
  'guarding-143': 'soft', 'guarding-153': 'calm', 'ending-willing-316': 'calm',
};
const labels: Record<string, string> = { idle: '出神', calm: '平静', fierce: '逞强', hungry: '惦念人心', panic: '慌张', smug: '得意', soft: '温柔' };
const bareNodes = new Set(['threshold', 'fireside', 'ember', 'price', 'first-breath', 'doorstep', 'zhang-gate', 'night-theft', 'chicken-leg', 'zhang-chaos', 'grove-echo', 'promise-day', 'bitter-heart', 'empty-house', 'funeral', 'crack-money', 'guarding', 'taoist-danger', 'burn-mountain', 'ending-bitter', 'ending-bitter-echo', 'ending-aftertaste']);
const childNodes = new Set([...bareNodes].filter(id => !['guarding', 'taoist-danger', 'burn-mountain', 'ending-bitter', 'ending-bitter-echo', 'ending-aftertaste'].includes(id)).concat(['red-jacket', 'years-call', 'pit-rescue']));

export function createPerformances(pkg: DreamPackage): NonNullable<Presentation['performances']> {
  const result: NonNullable<Presentation['performances']> = {};
  for (const node of pkg.nodes) {
    const id = node.id.replace(/-after$/, '');
    let costume = bareNodes.has(id) ? 'BARE' : 'COAT';
    let held = moods[id] ?? 'calm';
    let injured = ['search', 'farewell-ask', 'master-comes', 'ten-thousand-shield'].includes(id);
    for (const [index, beat] of node.beats.entries()) {
      if (cues[beat.id]) held = cues[beat.id]!;
      if (id === 'ending-aftertaste' && beat.text.includes('披')) costume = 'COAT';
      if (id === 'taoist' && beat.effect?.type === 'shatter') injured = true;
      // 师祖只有声音；未提供立绘的人用艺术姓名承接。
      const offscreen = beat.speaker === 'narrator' ? beat.text.match(/^([^：]{1,18}?)(?:（[^）]*）)?：/)?.[1] : undefined;
      if (offscreen) { result[beat.id] = { label: offscreen }; continue; }
      if (beat.speaker === 'immortal') { result[beat.id] = { label: '老神仙' }; continue; }
      const other = { 'yu-niang': ['YU_NIANG_FULL', '毓娘'], 'nian-nian': [childNodes.has(id) ? 'CHILD_FULL' : 'ADULT_FULL', '念念'], zhang: ['ZHANG_FULL', '张老爷'], taoist: ['TAOIST_FULL', '老道士'] }[beat.speaker];
      if (other) { result[beat.id] = { portrait: `BG_PORTRAIT_${other[0]}`, label: `${other[1]} · 全身` }; continue; }
      // 红袄缺 hungry/smug/soft，按契约用无袄同表情顶替，明确登记。
      const outfit = costume === 'COAT' && ['hungry', 'smug', 'soft'].includes(held) ? 'BARE' : costume;
      const portrait = injured ? 'DEMON_INJURED_FULL' : id === 'threshold' && index < 3 ? 'DEMON_BARE_FULL' : id === 'red-jacket' && index < 9 ? 'DEMON_COAT_FULL' : `DEMON_${outfit}_${held.toUpperCase()}`;
      result[beat.id] = { portrait: `BG_PORTRAIT_${portrait}`, label: `小妖怪 · ${injured ? '受伤' : labels[held]}` };
    }
  }
  return result;
}

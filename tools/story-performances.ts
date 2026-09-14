import type { DreamPackage } from '../src/game/schema';
import type { Presentation } from '../src/books/schema';
import { readFileSync } from 'node:fs';
import type { SourceEntry } from './story-source';

const moods: Record<string, string> = {
  threshold: 'idle', fireside: 'panic', ember: 'soft', price: 'smug', 'first-breath': 'calm', doorstep: 'fierce',
  'zhang-gate': 'fierce', 'night-theft': 'smug', 'chicken-leg': 'hungry', 'zhang-chaos': 'smug', 'grove-echo': 'calm', 'promise-day': 'panic',
  'red-jacket': 'soft', 'years-call': 'panic', 'pit-rescue': 'fierce', fame: 'smug', 'street-kids': 'fierce', 'zhang-return': 'smug',
  taoist: 'panic', search: 'soft', 'farewell-ask': 'calm', 'bitter-heart': 'panic', 'empty-house': 'calm', funeral: 'calm',
  'crack-money': 'soft', 'jacket-fit': 'soft', 'night-fever': 'panic', guarding: 'calm', 'beyond-mountains': 'soft',
  'doorstep-answers': 'soft', 'village-altar': 'calm', 'raised-claw': 'fierce', 'taoist-danger': 'panic', 'burn-mountain': 'fierce',
  'blood-words': 'fierce', 'patient-trap': 'calm', 'heart-taste': 'calm', 'fork-c8': 'panic', 'demon-road': 'calm',
  'borrowed-blade': 'fierce', 'years-of-the-king': 'calm', 'master-comes': 'fierce', 'ten-thousand-shield': 'panic',
  'ending-willing': 'soft', 'ending-aftertaste': 'soft', 'ending-bitter': 'calm', 'ending-bitter-echo': 'soft',
  'ending-bitter-mountains': 'calm', 'ending-demon-king': 'calm', 'ending-deferred': 'smug', 'ending-ascend': 'soft',
};
const labels: Record<string, string> = { idle: '出神', calm: '平静', fierce: '逞强', hungry: '惦念人心', panic: '慌张', smug: '得意', soft: '温柔' };
const sharedBare = ['threshold', 'fireside', 'ember', 'price', 'first-breath', 'doorstep', 'zhang-gate', 'night-theft', 'chicken-leg', 'zhang-chaos', 'grove-echo', 'promise-day'];
const bareNodes = new Set([...sharedBare, 'bitter-heart', 'empty-house', 'funeral', 'crack-money', 'jacket-fit', 'night-fever', 'guarding', 'beyond-mountains', 'doorstep-answers', 'village-altar', 'raised-claw', 'taoist-danger', 'burn-mountain', 'ending-bitter', 'ending-bitter-echo', 'ending-bitter-mountains', 'ending-aftertaste']);
const childNodes = new Set([...sharedBare, 'bitter-heart', 'empty-house', 'funeral', 'crack-money', 'red-jacket', 'years-call', 'pit-rescue']);

export function createPerformances(pkg: DreamPackage): NonNullable<Presentation['performances']> {
  const result: NonNullable<Presentation['performances']> = {};
  const entries = JSON.parse(readFileSync('.work/story/import-audit.json', 'utf8')) as SourceEntry[];
  const sources = new Map(entries.filter(entry => entry.kind === 'beat').map(entry => [entry.id, entry]));
  for (const node of pkg.nodes) {
    const id = node.id;
    if (!moods[id]) throw new Error(`新节点缺少立绘映射：${id}`);
    let costume = bareNodes.has(id) || id === 'red-jacket' ? 'BARE' : 'COAT';
    let held = moods[id]!;
    let injured = ['search', 'farewell-ask', 'ten-thousand-shield', 'ending-willing'].includes(id);
    for (const [index, beat] of node.beats.entries()) {
      if (id === 'chicken-leg' && beat.text.includes('她叫我孩子啊。')) held = 'soft';
      if (id === 'red-jacket' && beat.text.startsWith('毓娘愣了半晌。')) { costume = 'COAT'; held = 'calm'; }
      if (id === 'red-jacket' && beat.text.startsWith('下半辈子……')) held = 'soft';
      if (id === 'ending-aftertaste' && beat.text.startsWith('念念把那件朱红的小袄子抖开')) { costume = 'COAT'; held = 'calm'; injured = true; }
      if (id === 'taoist' && beat.effect?.type === 'shatter') injured = true;
      if (id === 'taoist-danger' && beat.text.startsWith('你在坑底躺了两天。')) injured = true;
      if (id === 'master-comes' && beat.text.startsWith('你被钉在崖壁上')) injured = true;
      const source = sources.get(beat.id);
      // 师祖、阿枝、更夫等画外角色只有姓名，不沿用上一个人的脸。
      if (source?.speaker && (beat.speaker === 'narrator' || source.raw.includes('画外'))) { result[beat.id] = { label: source.speaker }; continue; }
      if (beat.speaker === 'immortal') { result[beat.id] = { label: '老神仙' }; continue; }
      const other = { 'yu-niang': ['YU_NIANG_FULL', '毓娘'], 'nian-nian': [childNodes.has(id) ? 'CHILD_FULL' : 'ADULT_FULL', '念念'], zhang: ['ZHANG_FULL', '张老爷'], taoist: ['TAOIST_FULL', '老道士'] }[beat.speaker];
      if (other) { result[beat.id] = { portrait: `BG_PORTRAIT_${other[0]}`, label: `${other[1]} · 全身` }; continue; }
      // 素材清单缺少有袄的三个表情，沿用已签收的无袄同表情替代。
      const outfit = costume === 'COAT' && ['hungry', 'smug', 'soft'].includes(held) ? 'BARE' : costume;
      const portrait = injured ? 'DEMON_INJURED_FULL' : id === 'threshold' && index < 3 ? 'DEMON_BARE_FULL'
        : id === 'red-jacket' && costume === 'COAT' && index < 12 ? 'DEMON_COAT_FULL' : `DEMON_${outfit}_${held.toUpperCase()}`;
      result[beat.id] = { portrait: `BG_PORTRAIT_${portrait}`, label: `小妖怪 · ${injured ? '受伤' : labels[held]}` };
    }
  }
  return result;
}

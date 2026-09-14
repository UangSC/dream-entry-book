import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { validateDreamPackage } from '../src/game/validate';
import { TIMED_EFFECTS, type Beat, type Choice, type Condition, type DreamNode, type DreamPackage } from '../src/game/schema';

// 仅编译发布清单内的正文，本地计划和审读笔记不参与构建。
const sourceDir = 'content/final';
const { buildId, files: sources } = JSON.parse(readFileSync(`${sourceDir}/sources.json`, 'utf8')) as { buildId: string; files: { file: string; sha256: string }[] };
for (const source of sources) {
  if (createHash('sha256').update(readFileSync(`${sourceDir}/${source.file}`)).digest('hex') !== source.sha256) throw new Error(`定稿快照被修改：${source.file}`);
}
const legacy = JSON.parse(readFileSync('content/drafts/little-demon-legacy.json', 'utf8')) as DreamPackage;
const nodes: DreamNode[] = [], chapters: Record<string, string> = {};
const audit: { file: string; line: number; raw: string; kind: string; id?: string; text?: string }[] = [];
const condition = (flag: string): Condition => ({ all: [{ kind: 'flag', id: flag, equals: true }] });
const characters = { 小妖怪: 'little-demon', 毓娘: 'yu-niang', 念念: 'nian-nian', 张老爷: 'zhang', 老道士: 'taoist', 老神仙: 'immortal' };
const next: Record<string, string> = {
  threshold: 'fireside', ember: 'first-breath', price: 'first-breath', 'first-breath': 'doorstep',
  'zhang-gate': 'chicken-leg', 'night-theft': 'chicken-leg', 'chicken-leg': 'zhang-chaos', 'zhang-chaos': 'grove-echo', 'grove-echo': 'promise-day',
  'red-jacket': 'years-call', 'pit-rescue': 'fame', fame: 'street-kids', 'street-kids': 'zhang-return', search: 'farewell-ask',
  'bitter-heart': 'empty-house', funeral: 'crack-money', 'crack-money': 'guarding', guarding: 'taoist-danger',
  'blood-words': 'patient-trap', 'patient-trap': 'heart-taste', 'heart-taste': 'fork-c8', 'demon-road': 'ending-demon-king',
  'master-comes': 'ten-thousand-shield',
};
const sides: Record<string, string> = { 真话: 'said-truth', 谎话: 'lied', 吓账: 'scared-him', 讨账: 'just-debt', 受盾: 'shielded-by-all', 独战: 'fought-alone' };
const continuations = new Set(['empty-house', 'zhang-return', 'taoist-danger']);
for (const { file } of sources) {
  let node: DreamNode | undefined, originalId = '', mode = 'outside', side: string | undefined, afterChoice = false;
  const lines = readFileSync(`${sourceDir}/${file}`, 'utf8').split(/\r?\n/);
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    const entry = { file, line: index + 1, raw, kind: 'structure' } as typeof audit[number];
    audit.push(entry);
    const heading = line.match(/^## 节点\s+(.+?)\s*｜\s*`([^`]+)`\s*｜\s*(.+)$/);
    if (heading) {
      originalId = heading[2]!;
      const base = { id: originalId, scene: '', origin: 'original' as const, sourceRefs: [] as string[], beats: [] as Beat[] };
      node = originalId.startsWith('ending-') ? { ...base, kind: 'ending', ending: { id: originalId, title: '', summary: '', reflections: [], outcomes: [] } } : { ...base, kind: 'scene', next: next[originalId] };
      chapters[originalId] = `${heading[1]} · ${originalId === 'fork-c8' ? '第二颗心' : heading[3]!.replace(/·选择点.*|（.*?）/g, '')}`;
      nodes.push(node); mode = 'body'; side = undefined; afterChoice = false; continue;
    }
    if (/^## /.test(line)) { node = undefined; mode = 'outside'; }
    if (!node || !line || /^(---|※|>|#)/.test(line)) continue;
    if (line.startsWith('**场景**')) { node.scene = line.match(/BG_[A-Z_]+/)![0]; continue; }
    if (line.startsWith('**达成**')) continue;
    if (line === '**终幕登记**') { mode = 'register'; continue; }
    if (mode === 'register') {
      if (node.kind !== 'ending') throw new Error('终幕登记出现在普通节点');
      const title = line.match(/`title`:\s*(.+)/), summary = line.match(/`summary`:\s*(.+)/);
      const reflection = line.match(/^\d+\.\s*「(.*)」(?:（`when`:\s*([^）]+)）)?/);
      if (title) node.ending.title = title[1]!.replace(/（与 E2.*$/, '');
      if (summary) node.ending.summary = summary[1]!;
      if (reflection) node.ending.reflections!.push({ text: reflection[1]!, ...(reflection[2] && reflection[2] !== '任意' ? { when: condition(reflection[2].trim()) } : {}) });
      continue;
    }
    if (line.startsWith('▸')) { afterChoice = true; continue; }
    const option = line.match(/^- (.+?)\s*→\s*(.+)$/);
    if (option) {
      if (node.kind !== 'scene') throw new Error('终幕不得有选择');
      delete node.next;
      const flag = option[2]!.match(/旗标\s+([a-z-]+)/)?.[1] ?? (originalId === 'farewell-ask' ? (node.choices?.length ? 'deferred' : 'ascended') : (node.choices?.length ? 'unseen' : 'shielded'));
      let target = option[2]!.match(/^([a-z][a-z-]+)/)?.[1] ?? (flag === 'fought-back' ? 'blood-words' : 'ending-aftertaste');
      if (continuations.has(originalId)) target = `${originalId}-after`;
      const choice: Choice = { id: flag, text: option[1]!, target, effects: { setFlags: [flag], resourceDeltas: {}, relationshipDeltas: {} } };
      node.choices ??= [];
      if (flag === 'shielded') node.choices.push({ ...choice, id: 'shielded-truth', when: condition('said-truth') }, { ...choice, id: 'shielded-lie', target: 'ending-bitter-echo', when: condition('lied') });
      else node.choices.push(choice);
      entry.kind = 'choice'; entry.id = choice.id; entry.text = choice.text; continue;
    }
    const sideMatch = line.match(/^（(.+?)\s*侧）：$/);
    if (sideMatch || line === '（合流）：') {
      side = sideMatch ? sides[sideMatch[1]!.trim()] ?? sideMatch[1]!.trim() : undefined;
      if (afterChoice && continuations.has(originalId) && node.id === originalId) {
        node = { id: `${originalId}-after`, kind: 'scene', origin: 'original', sourceRefs: [], scene: node.scene, beats: [], next: { 'empty-house': 'funeral', 'zhang-return': 'taoist', 'taoist-danger': 'burn-mountain' }[originalId]! };
        chapters[node.id] = chapters[originalId]!; nodes.push(node);
      }
      continue;
    }
    if (/^（终幕(?:前)?）$/.test(line)) continue;
    const effectMatch = line.match(/\[特效：([^\]]+)\]/), flag = line.match(/〈条件：([^〉]+)〉/)?.[1];
    let text = line.replace(/\[特效：[^\]]+\]/g, '').replace(/〈条件：[^〉]+〉/g, '').trim();
    if (!text && effectMatch) {
      const target = effectMatch[1]!.match(/BG_[A-Z_]+/);
      if (target && node.beats.length) node.beats.at(-1)!.sceneShift = target[0];
      else throw new Error(`无法解析独立演出 ${file}:${index + 1}`);
      continue;
    }
    let speaker = 'narrator', kind: Beat['kind'] = 'narration';
    const speech = text.match(/^\*\*([^*]+)\*\*([^：]*?)：([\s\S]*)$/);
    if (speech) {
      const name = speech[1]!.replace(/（.*）/, '');
      if (name in characters) {
        speaker = characters[name as keyof typeof characters]; kind = speech[1]!.includes('心声') ? 'thought' : 'dialogue'; text = `${speech[2]}${speech[3]}`;
      }
    }
    text = text.replaceAll('**', '');
    const beat: Beat = { id: `${originalId}-${String(index + 1).padStart(3, '0')}`, kind, speaker, text, anim: 'typewriter' };
    const flags = [side, flag].filter((value): value is string => !!value);
    if (flags.length) beat.when = { all: [...new Set(flags)].map(id => ({ kind: 'flag', id, equals: true })) };
    // 只补足相邻拍的舞台条件，不动正文；见交付歧义清单。
    const inferred = originalId === 'zhang-return' && text.startsWith('他说要回家取钱') ? 'scared-him'
      : originalId === 'funeral' && (text.startsWith('念念藏不住') || text.startsWith('村里一下子炸了')) ? 'said-truth'
      : originalId === 'crack-money' && text === '……我知道是你。' ? 'faced-zhang'
      : originalId === 'guarding' && text.startsWith('你蹲在墙头看她晾') ? 'lied' : undefined;
    if (inferred) beat.when = condition(inferred);
    if (effectMatch) {
      const effect = effectMatch[1]!.trim();
      if ((TIMED_EFFECTS as readonly string[]).includes(effect)) { delete beat.anim; beat.effect = { type: effect as typeof TIMED_EFFECTS[number] }; }
      else if (effect.includes('sceneShift')) beat.sceneShift = effect.match(/BG_[A-Z_]+/)![0];
      else throw new Error(`未知演出 ${effect}`);
    }
    node.beats.push(beat); entry.kind = 'beat'; entry.id = beat.id; entry.text = text;
  }
}

const tracks: Record<string, string[]> = {
  BGM_CARE: ['threshold', 'fireside', 'ember', 'price', 'first-breath', 'doorstep', 'zhang-gate', 'chicken-leg', 'grove-echo', 'promise-day', 'years-call', 'fame', 'street-kids'],
  BGM_MARKET: ['night-theft', 'zhang-chaos', 'pit-rescue', 'zhang-return'],
  BGM_COLD_DANGER: ['taoist', 'taoist-danger', 'burn-mountain', 'blood-words', 'patient-trap', 'master-comes'],
  BGM_ACID: ['bitter-heart', 'empty-house', 'funeral', 'crack-money', 'guarding', 'ending-bitter', 'ending-bitter-echo', 'heart-taste', 'fork-c8', 'demon-road', 'ending-demon-king'],
  BGM_SEEK_HER: ['search', 'ten-thousand-shield'],
  BGM_FAREWELL: ['red-jacket', 'farewell-ask', 'ending-ascend', 'ending-deferred', 'ending-aftertaste', 'ending-willing'],
};
const shifts: Record<string, [string, string][]> = {
  doorstep: [['她步履很急，', 'BG_ZHANG_GATE'], ['回到家，', 'BG_COTTAGE_N'], ['第二天晌午', 'BG_COTTAGE_D'], ['夜里，她把枕头', 'BG_COTTAGE_N']],
  fame: [['你捡着树上最好的', 'BG_SHRINE_D']], guarding: [['冬天最冷', 'BG_COTTAGE_RAIN']],
  'demon-road': [['师祖是那年冬天来的', 'BG_FOREST_RAIN'], ['土庙塌了半边', 'BG_SHRINE_N']],
};
shifts['ending-aftertaste'] = [['吃人心的小妖怪死了。', 'BG_SHRINE_N']];
shifts['ending-bitter-echo'] = [['妖力再没能养回来。', 'BG_SHRINE_N']];
shifts['ending-deferred'] = [['后来的事', 'BG_TREE_D']];
const sfx: Record<string, string> = { fireside: 'FIRE', ember: 'FIRE', price: 'FIRE', 'first-breath': 'SPIRIT', 'zhang-gate': 'GATE', 'chicken-leg': 'OFFER', 'pit-rescue': 'ROPE', taoist: 'COMPASS', 'patient-trap': 'COMPASS', 'master-comes': 'COMPASS', 'ten-thousand-shield': 'CALL' };
for (const node of nodes) {
  for (const [prefix] of shifts[node.id] ?? []) {
    if (!node.beats.some(beat => beat.text.startsWith(prefix))) throw new Error(`换景未命中原文：${node.id} / ${prefix}`);
  }
  const track = Object.entries(tracks).find(([, ids]) => ids.includes(node.id))?.[0];
  if (track) for (const beat of node.beats) { beat.musicCue = { action: 'play', track }; if (!beat.when) break; }
  if (node.id === 'taoist') node.beats.at(-1)!.sceneShift = 'BG_FOREST_RAIN';
  if (sfx[node.id]) node.beats[0]!.sfx = `SFX_${sfx[node.id]}`;
  for (const beat of node.beats) {
    if (node.id === 'promise-day' && beat.text.startsWith('风把院门吹得')) beat.sfx = 'SFX_DOOR';
    if (beat.id === 'search-251') beat.sfx = 'SFX_CALL';
    if (beat.id === 'burn-mountain-222') beat.sfx = 'SFX_FIRE';
    if (beat.id === 'burn-mountain-225') { beat.sfx = 'SFX_CALL'; beat.musicCue = { action: 'play', track: 'BGM_SEEK_HER' }; }
    for (const [prefix, scene] of shifts[node.id] ?? []) if (beat.text.startsWith(prefix)) beat.sceneShift = scene;
    if (beat.effect?.type === 'shatter') beat.sfx = 'SFX_SHATTER';
    if (node.kind === 'ending' && beat.text.includes('供桌')) beat.sfx = 'SFX_OFFER';
  }
}
const flags = [...new Set(nodes.flatMap(node => node.kind === 'scene' ? node.choices?.flatMap(choice => choice.effects.setFlags) ?? [] : []))];
const pkg: DreamPackage = { ...legacy, edition: 'longform', buildId, nodes,
  characters: Object.entries(characters).map(([name, id]) => ({ id, name })),
  flags: flags.map(id => ({ id, label: id, kind: 'commitment' })),
};
const art = JSON.parse(readFileSync('public/art/manifest.json', 'utf8'));
const audio = JSON.parse(readFileSync('public/audio/manifest.json', 'utf8'));
const result = validateDreamPackage(pkg, { assetIds: [...art.assets, ...audio.assets].map((a: { id: string }) => a.id) });
mkdirSync('.work/story', { recursive: true });
writeFileSync('.work/story/import-audit.json', JSON.stringify(audit, null, 2) + '\n');
writeFileSync('.work/story/chapters.json', JSON.stringify(chapters, null, 2) + '\n');
if (!result.ok) { console.error(result.findings); process.exit(1); }
const json = JSON.stringify(pkg, null, 2) + '\n';
writeFileSync('public/dreams/little-demon.json', json);
console.log(`定稿已接入：${nodes.length} 节点 / ${nodes.reduce((sum, node) => sum + node.beats.length, 0)} 拍 / ${flags.length} 旗标 / 7 终幕。`);

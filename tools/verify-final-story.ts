import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { advance, chooseOption, evaluateCondition, nodeVisitOrdinal, replayView, resolveNext, startPackage, visibleChoices, type SaveState, type EngineResult } from '../src/game/engine';
import { reconstruct, validateSave } from '../src/game/replay';
import { dreamPackageSchema } from '../src/game/schema';
import { readSave, writeSave, type KV } from '../src/game/storage';
import { ENDINGS, FLAGS, FLAG_GROUPS, VOCAL_ANCHORS } from './story-contract';
import { CHARACTERS, displayText, type SourceEntry } from './story-source';

const pkg = dreamPackageSchema.parse(JSON.parse(readFileSync('public/dreams/little-demon.json', 'utf8')));
const entries = JSON.parse(readFileSync('.work/story/import-audit.json', 'utf8')) as SourceEntry[];
const nodeMap = new Map(pkg.nodes.map(node => [node.id, node]));
const beatMap = new Map(pkg.nodes.flatMap(node => node.beats.map(beat => [beat.id, beat] as const)));
const time = '2026-09-14T04:00:00Z';
const unwrap = (result: EngineResult) => { if (!result.ok) throw new Error(result.error.message); return result.state; };

// 对构建结果做第二次逐行对照，包括标点、说话人、全部选项和登记元数据。
for (const entry of entries) {
  const node = entry.node ? nodeMap.get(entry.node) : undefined;
  if (entry.kind === 'beat') {
    const beat = beatMap.get(entry.id!); assert.ok(beat, entry.id);
    const speech = entry.raw.trim().match(/^\*\*([^*]+)\*\*/);
    const character = speech?.[1]?.replace(/（.*）/, '');
    const known = character ? CHARACTERS[character as keyof typeof CHARACTERS] : undefined;
    const plain = displayText(entry.raw.trim());
    const expected = known ? plain.slice(speech![1]!.length).replace('：', '') : plain;
    assert.equal(beat.text, expected, `${entry.file}:${entry.line}`);
    assert.equal(beat.speaker, known ?? 'narrator', entry.id);
  }
  if (entry.kind === 'choice') {
    assert.ok(node?.kind === 'scene');
    assert.equal(node.choices?.find(choice => `${node.id}:${choice.id}` === entry.id)?.text, entry.raw.trim().match(/^- (.+?)\s*→/)?.[1]);
  }
  if (entry.kind === 'register' && entry.text !== undefined) {
    assert.ok(node?.kind === 'ending');
    const [, kind, index] = entry.id!.split(':');
    const value = kind === 'title' ? node.ending.title : kind === 'summary' ? node.ending.summary : node.ending.reflections![Number(index)]!.text;
    assert.equal(value, entry.text, entry.id);
  }
}
assert.equal(entries.filter(entry => entry.kind === 'beat').length, beatMap.size);
assert.equal(pkg.nodes.length, 51);
assert.equal(pkg.nodes.filter(node => node.kind === 'scene' && node.choices).length, 14);
assert.deepEqual(pkg.flags.map(flag => flag.id).sort(), [...FLAGS].sort());
assert.deepEqual(pkg.nodes.filter(node => node.kind === 'ending').map(node => [node.id, node.ending.title]).sort(), Object.entries(ENDINGS).sort());

const routes: { ending: string; choices: string[]; characters: number; han: number; beats: number }[] = [];
const coverage = new Map<string, Set<boolean>>(), seenBeats = new Set<string>(), seenReflections = new Set<string>();
const persistedEndings = new Set<string>();
const flagsSeen = new Map<string, Set<boolean>>(FLAGS.map(flag => [flag, new Set()]));
const routeAssertions = (state: SaveState, visited: Set<string>, texts: Map<string, string>) => {
  const f = state.flags;
  for (const flags of Object.values(FLAG_GROUPS)) assert.ok(flags.filter(flag => f[flag]).length <= 1, `互斥旗标冲突：${flags}`);
  if (f.ate) {
    assert.equal(visited.has('jacket-fit'), f['said-truth']); assert.equal(visited.has('night-fever'), f['said-truth']);
    assert.equal(visited.has('beyond-mountains'), f.lied); assert.equal(visited.has('doorstep-answers'), f.lied);
    assert.ok(visited.has('village-altar') && visited.has('raised-claw'));
    const expected = f.shielded ? (f['said-truth'] ? 'ending-aftertaste' : 'ending-bitter-echo') : f['guarded-all'] ? 'ending-bitter-mountains' : 'ending-bitter';
    assert.equal(state.nodeId, expected);
  }
  if (f['marched-on']) {
    assert.ok(visited.has('borrowed-blade') && visited.has('years-of-the-king'));
    assert.equal(state.nodeId, 'ending-demon-king');
    assert.ok(texts.get('ending-demon-king')!.includes('妖王不答这种问题。'));
    assert.ok(texts.get('ending-demon-king')!.includes('你数不下去的那笔账，整面墙，都替你记着。'));
  }
  for (const [node, text] of texts) if (text.includes('阿枝')) assert.ok(f['marched-on'] && ['years-of-the-king', 'ending-demon-king'].includes(node));
  assert.equal(texts.get('chicken-leg')?.includes('后半夜，那只肥鸡'), f['took-chicken']);
  if (visited.has('pit-rescue')) {
    assert.equal(texts.get('pit-rescue')!.includes('神仙公公，您倒是给个话呀'), f['asked-first']);
    assert.equal(texts.get('pit-rescue')!.includes('这一回，我能做点什么了'), f['went-now']);
  }
  if (visited.has('zhang-return')) {
    const text = texts.get('zhang-return')!;
    assert.equal(text.includes('我还欠着三年'), f['scared-him'] && f['took-chicken']);
    assert.equal(text.includes('工钱那笔，勾了'), f['scared-him'] && f['faced-zhang']);
    assert.equal(text.includes('本银九两'), f['just-debt'] && f['took-chicken']);
    assert.equal(text.includes('他说要回家取钱'), f['scared-him']);
  }
  if (visited.has('village-altar')) assert.ok(texts.get('village-altar')!.includes('清明前，老道说：坛期将满，当除根。'));
  if (visited.has('borrowed-blade')) {
    assert.equal(texts.get('borrowed-blade')!.includes('你没吃村正。'), f['judge-rule']);
    assert.equal(texts.get('borrowed-blade')!.includes('你收了村正的账。'), f['killed-informant']);
  }
  if (state.nodeId === 'ending-willing') assert.ok(texts.get(state.nodeId)!.includes('这山里，都是暖的。'));
};

const walk = (initial: SaveState) => {
  let state = initial;
  for (let step = 0; step <= beatMap.size + pkg.nodes.length; step++) {
    const node = nodeMap.get(state.nodeId)!;
    if (state.phase === 'finished') {
      assert.equal(validateSave(pkg, state), null);
      if (!persistedEndings.has(state.nodeId)) {
        const values = new Map<string, string>();
        const kv: KV = { get: key => values.get(key) ?? null, set: (key, value) => { values.set(key, value); }, remove: key => { values.delete(key); }, keys: () => [...values.keys()] };
        assert.equal(writeSave(kv, state).ok, true);
        const restored = readSave(kv, pkg, time); assert.equal(restored.status, 'ok');
        if (restored.status === 'ok') assert.deepEqual(restored.state.choiceHistory, state.choiceHistory);
        persistedEndings.add(state.nodeId);
      }
      const replay = reconstruct(pkg, state); if (!replay.ok) throw new Error(replay.message);
      const view = replayView(pkg, state); assert.ok(view.ok); assert.equal(view.view.scene, replay.scene); assert.equal(view.view.track, replay.silenced ? null : replay.track);
      const text = replay.lines.map(line => line.beat.text).join('');
      const visited = new Set(replay.lines.map(line => line.nodeId));
      const visible = new Set(replay.lines.map(line => line.beat.id));
      const texts = new Map([...visited].map(id => [id, replay.lines.filter(line => line.nodeId === id).map(line => line.beat.text).join('\n')]));
      for (const id of visible) seenBeats.add(id);
      for (const id of visited) for (const beat of nodeMap.get(id)!.beats) {
        const expected = evaluateCondition(beat.when, state);
        assert.equal(visible.has(beat.id), expected, beat.id);
        if (beat.when) { const seen = coverage.get(beat.id) ?? new Set<boolean>(); seen.add(expected); coverage.set(beat.id, seen); }
      }
      if (node.kind === 'ending') for (const [index, reflection] of (node.ending.reflections ?? []).entries()) {
        if (evaluateCondition(reflection.when, state)) seenReflections.add(`${node.id}:${index}`);
      }
      for (const flag of FLAGS) flagsSeen.get(flag)!.add(state.flags[flag]!);
      routeAssertions(state, visited, texts);
      routes.push({ ending: state.nodeId, choices: state.choiceHistory.map(choice => choice.choiceId), characters: [...text.replace(/\s/g, '')].length, han: text.replace(/[^\p{Script=Han}]/gu, '').length, beats: replay.lines.length });
      return;
    }
    if (state.phase === 'choosing' && node.kind === 'scene') {
      assert.equal(validateSave(pkg, state), null);
      const options = visibleChoices(node, state); assert.equal(options.length, FLAG_GROUPS[node.id as keyof typeof FLAG_GROUPS].length);
      for (const choice of options) walk(unwrap(chooseOption(pkg, state, { nodeId: node.id, choiceId: choice.id, revision: state.revision, nodeVisit: nodeVisitOrdinal(state.choiceHistory, node.id) }, time)));
      return;
    }
    state = unwrap(advance(pkg, state, time));
  }
  throw new Error('路线超出步数限制');
};
walk(unwrap(startPackage(pkg, time)));
assert.equal(new Set(routes.map(route => route.ending)).size, 8);
assert.deepEqual([...beatMap.keys()].filter(id => !seenBeats.has(id)), [], '存在永远不会显示的正文');
for (const [flag, values] of flagsSeen) assert.equal(values.size, 2, `旗标两侧缺少见证：${flag}`);
const flagMatrix = FLAGS.map(flag => ({ flag, selected: routes.filter(route => route.choices.includes(flag)).length, unselected: routes.filter(route => !route.choices.includes(flag)).length }));
for (const row of flagMatrix) assert.ok(row.selected >= 2 && row.unselected >= 2, `旗标两侧不足两条周目：${row.flag}`);
for (const node of pkg.nodes) if (node.kind === 'ending') for (const [index] of (node.ending.reflections ?? []).entries()) assert.ok(seenReflections.has(`${node.id}:${index}`), `回望不可达：${node.id}:${index}`);

const fire = nodeMap.get('burn-mountain')!; assert.ok(fire.kind === 'scene');
assert.equal(resolveNext(fire, { resources: {}, relationships: {}, flags: {} }).ok, false);
assert.equal(resolveNext(fire, { resources: {}, relationships: {}, flags: { shielded: true, 'said-truth': true, lied: true } }).ok, false);
for (const cue of VOCAL_ANCHORS) {
  const matches = nodeMap.get(cue.node)!.beats.filter(beat => beat.text.includes(cue.text));
  assert.equal(matches.length, 1); assert.equal(matches[0]!.musicCue?.track, cue.track); assert.equal(matches[0]!.textSpeedScale, 0.8);
}
for (const id of ['ten-thousand-shield', 'ending-aftertaste', 'ending-bitter', 'ending-bitter-echo', 'ending-bitter-mountains', 'ending-willing']) assert.equal(nodeMap.get(id)!.beats[0]!.musicCue, undefined, `${id} 不应在节点边界提前切歌`);

const summary = ['A', 'B', 'C'].map(line => {
  const endings = line === 'A' ? ['ending-ascend', 'ending-deferred'] : line === 'B' ? ['ending-aftertaste', 'ending-bitter', 'ending-bitter-echo', 'ending-bitter-mountains'] : ['ending-willing', 'ending-demon-king'];
  const paths = routes.filter(route => endings.includes(route.ending));
  return { line, paths: paths.length, min: Math.min(...paths.map(route => route.characters)), max: Math.max(...paths.map(route => route.characters)), minHan: Math.min(...paths.map(route => route.han)), choices: [...new Set(paths.map(route => route.choices.length))] };
});
mkdirSync('.work/story', { recursive: true });
writeFileSync('.work/story/route-audit.json', JSON.stringify({ buildId: pkg.buildId, summary, routes, flagMatrix, persistedEndings: [...persistedEndings], visibleBeats: seenBeats.size, reflections: seenReflections.size, conditionalBeats: coverage.size, conditionalBoth: [...coverage.values()].filter(set => set.size === 2).length }, null, 2) + '\n');
console.table(summary);
for (const line of summary) assert.ok(line.min >= 7000, `${line.line} 最短路线 ${line.min} 字，不足 7000`);
console.log(`${routes.length} 条路径、8 终幕、${seenBeats.size} 拍正文与 ${seenReflections.size} 条回望全部可达；29 旗标两侧、四路终局与 9 个音乐锚点通过。`);

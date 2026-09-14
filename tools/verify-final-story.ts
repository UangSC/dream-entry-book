import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { advance, chooseOption, nodeVisitOrdinal, startPackage, visibleChoices, type SaveState, type EngineResult } from '../src/game/engine';
import { reconstruct, validateSave } from '../src/game/replay';
import { dreamPackageSchema } from '../src/game/schema';

const pkg = dreamPackageSchema.parse(JSON.parse(readFileSync('public/dreams/little-demon.json', 'utf8')));
const time = '2026-09-14T04:00:00Z';
const unwrap = (result: EngineResult) => { if (!result.ok) throw new Error(result.error.message); return result.state; };
const routes: { ending: string; choices: string[]; characters: number; han: number; beats: number }[] = [];
const coverage = new Map<string, Set<boolean>>();
const walk = (initial: SaveState) => {
  let state = initial;
  for (let step = 0; step < 1600; step++) {
    const node = pkg.nodes.find(node => node.id === state.nodeId)!;
    if (state.phase === 'finished') {
      assert.equal(validateSave(pkg, state), null);
      const replay = reconstruct(pkg, state); if (!replay.ok) throw new Error(replay.message);
      const text = replay.lines.map(line => line.beat.text).join('');
      const visited = new Set(replay.lines.map(line => line.nodeId));
      const visible = new Set(replay.lines.map(line => line.beat.id));
      for (const node of pkg.nodes.filter(node => visited.has(node.id))) for (const beat of node.beats.filter(beat => beat.when)) {
        const expected = beat.when!.all.every(flag => flag.kind === 'flag' && state.flags[flag.id] === flag.equals);
        assert.equal(visible.has(beat.id), expected, beat.id);
        const seen = coverage.get(beat.id) ?? new Set<boolean>(); seen.add(expected); coverage.set(beat.id, seen);
      }
      routes.push({ ending: state.nodeId, choices: state.choiceHistory.map(choice => choice.choiceId), characters: [...text.replace(/\s/g, '')].length, han: text.replace(/[^\p{Script=Han}]/gu, '').length, beats: replay.lines.length });
      return;
    }
    if (state.phase === 'choosing' && node.kind === 'scene') {
      assert.equal(validateSave(pkg, state), null);
      const options = visibleChoices(node, state); assert.ok(options.length >= 2);
      for (const choice of options) walk(unwrap(chooseOption(pkg, state, { nodeId: node.id, choiceId: choice.id, revision: state.revision, nodeVisit: nodeVisitOrdinal(state.choiceHistory, node.id) }, time)));
      return;
    }
    state = unwrap(advance(pkg, state, time));
  }
  throw new Error('路线超出步数限制');
};
walk(unwrap(startPackage(pkg, time)));
assert.equal(new Set(routes.map(route => route.ending)).size, 7);
const summary = ['A', 'B', 'C'].map(line => {
  const endings = line === 'A' ? ['ending-ascend', 'ending-deferred'] : line === 'B' ? ['ending-aftertaste', 'ending-bitter', 'ending-bitter-echo'] : ['ending-willing', 'ending-demon-king'];
  const paths = routes.filter(route => endings.includes(route.ending));
  return { line, paths: paths.length, min: Math.min(...paths.map(route => route.characters)), max: Math.max(...paths.map(route => route.characters)), minHan: Math.min(...paths.map(route => route.han)), choices: [...new Set(paths.map(route => route.choices.length))] };
});
const report = { buildId: pkg.buildId, summary, routes, conditionalBeats: coverage.size, conditionalBoth: [...coverage.values()].filter(set => set.size === 2).length };
mkdirSync('.work/story', { recursive: true });
writeFileSync('.work/story/route-audit.json', JSON.stringify(report, null, 2) + '\n');
console.table(summary);
for (const line of summary) assert.ok(line.min >= 7000, `${line.line} 最短路线 ${line.min} 字，不足 7000`);
console.log(`${routes.length} 条路径、7 终幕、${coverage.size} 个条件拍已验证。`);

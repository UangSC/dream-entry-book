import { describe, expect, it } from 'vitest';
import { dreamPackageSchema, type Condition } from './schema';
import { advance, chooseOption, evaluateCondition, nodeVisitOrdinal, replayView, restoreCheckpoint, startPackage, type EngineResult, type SaveState } from './engine';
import { reconstruct, validateSave } from './replay';
import { validateDreamPackage } from './validate';

const when = (id: string): Condition => ({ all: [{ kind: 'flag', id, equals: true }] });
const beat = (id: string, text: string, condition?: Condition) => ({ id, text, kind: 'narration', speaker: 'narrator', ...(condition ? { when: condition } : {}) });
const now = '2026-09-14T04:00:00Z';
const fixture = () => dreamPackageSchema.parse({
  schemaVersion: 1, packageId: 'inline-test', buildId: 'inline-v1', title: '节点内选择测试',
  source: { kind: 'original_demo', title: '测试夹具', author: null, workId: null, completeness: 'complete', trailingFragment: false, sourceHash: '0'.repeat(64), paragraphIds: [], sourceUrl: null, linkStatus: 'missing', rightsRef: '测试文本' },
  review: { status: 'draft', reviewedBuildId: null, reviewedAt: null, reviewer: null }, theme: 'calm', characters: [], resources: [], relationships: [],
  flags: ['truth', 'lie'].map(id => ({ id, label: id, kind: 'commitment' })), entryNodeId: 'decision',
  nodes: [
    { id: 'decision', kind: 'scene', origin: 'original', sourceRefs: [], scene: 'BG_ROOM',
      beats: [beat('before', '先听完。'), beat('hidden-boundary', '未选择时不可见。', when('truth')),
        beat('after', '选择后再说。'), beat('truth-text', '说了实话。', when('truth')), beat('lie-text', '隐瞒了。', when('lie')),
        beat('merged', '两条路的共同收尾。', { all: [], any: [...when('truth').all, ...when('lie').all] })],
      choiceAfter: 'hidden-boundary',
      choices: ['truth', 'lie'].map(id => ({ id, text: id, target: 'decision', effects: { setFlags: [id], resourceDeltas: {}, relationshipDeltas: {} } })),
      nextWhen: ['truth', 'lie'].map(id => ({ target: `end-${id}`, when: when(id) })),
    },
    ...['truth', 'lie'].map(id => ({ id: `end-${id}`, kind: 'ending', origin: 'original', sourceRefs: [], scene: 'BG_ROOM', beats: [beat(`last-${id}`, '结束。')], ending: { id: `end-${id}`, title: id, summary: id } })),
  ],
});
const must = (result: EngineResult): SaveState => { if (!result.ok) throw new Error(result.error.message); return result.state; };
const token = (state: SaveState, choiceId: string) => ({ nodeId: state.nodeId, nodeVisit: nodeVisitOrdinal(state.choiceHistory, state.nodeId), choiceId, revision: state.revision });

describe('节点中途选择与条件后继', () => {
  it('停在隐藏边界之前，选择后只显示本侧和共同收尾，不重播节点', () => {
    const pkg = fixture(); expect(validateDreamPackage(pkg).ok).toBe(true);
    const start = must(startPackage(pkg, now)); expect(start.phase).toBe('choosing');
    expect(advance(pkg, start, now).ok).toBe(false);
    const click = token(start, 'truth'), result = chooseOption(pkg, start, click, now);
    let state = must(result); expect(state.nodeId).toBe('decision'); expect(state.beatIndex).toBe(2);
    expect(result.ok && result.events.some(event => event.type === 'scene')).toBe(false);
    expect(chooseOption(pkg, state, click, now)).toMatchObject({ ok: true, stale: true, state });
    expect(validateSave(pkg, state)).toBeNull();
    const replay = reconstruct(pkg, state); expect(replay.ok && replay.lines.map(line => line.beat.id)).toEqual(['before', 'after']);
    while (state.phase !== 'finished') state = must(advance(pkg, state, now));
    expect(state.nodeId).toBe('end-truth'); expect(validateSave(pkg, state)).toBeNull(); expect(replayView(pkg, state).ok).toBe(true);
    const final = reconstruct(pkg, state); expect(final.ok && final.lines.map(line => line.beat.id)).toEqual(['before', 'after', 'truth-text', 'merged', 'last-truth']);
  });
  it('检查点重选恢复选择前的旗标，另一侧文本不会泄漏进存档', () => {
    const pkg = fixture(), start = must(startPackage(pkg, now));
    let state = must(chooseOption(pkg, start, token(start, 'truth'), now));
    state = must(restoreCheckpoint(pkg, state, 0, now));
    expect(state.phase).toBe('choosing'); expect(state.flags.truth).toBe(false); expect(validateSave(pkg, state)).toBeNull();
    state = must(chooseOption(pkg, state, token(state, 'lie'), now));
    while (state.phase !== 'finished') state = must(advance(pkg, state, now));
    expect(state.nodeId).toBe('end-lie'); expect(validateSave(pkg, state)).toBeNull();
    expect(validateSave(pkg, { ...state, flags: { truth: true, lie: false } })).not.toBeNull();
  });
  it('条件后继无匹配或多重匹配都作为制作错误拒绝', () => {
    for (const targets of [['truth', 'truth'], ['lie', 'lie']]) {
      const pkg = fixture(), node = pkg.nodes[0]!;
      if (node.kind !== 'scene') throw new Error('夹具异常');
      node.nextWhen = targets.map((id, index) => ({ target: index ? 'end-lie' : 'end-truth', when: when(id) }));
      expect(validateDreamPackage(pkg).findings.some(finding => finding.code === 'invalid-route')).toBe(true);
    }
  });
  it('OR 与外层 AND 同时成立，不把斜线表达式注册成旗标', () => {
    const condition = { all: [{ kind: 'flag' as const, id: 'access', equals: true }], any: [...when('truth').all, ...when('lie').all] };
    const vars = (flags: Record<string, boolean>) => ({ flags, resources: {}, relationships: {} });
    expect(evaluateCondition(condition, vars({ access: true, truth: true }))).toBe(true);
    expect(evaluateCondition(condition, vars({ access: true, lie: true }))).toBe(true);
    expect(evaluateCondition(condition, vars({ truth: true }))).toBe(false);
    expect(evaluateCondition(condition, vars({ access: true }))).toBe(false);
  });
});

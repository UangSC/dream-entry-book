import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dreamPackageSchema, type DreamPackage } from './schema';
import { advance, chooseOption, nodeVisitOrdinal, startPackage, type EngineResult, type SaveState } from './engine';
import { validateSave } from './replay';
import { beginJournal, beforeChoice, moveJournal, readingPosition, recordPosition, restorePosition, HISTORY_LIMIT } from './reader';
import { exportAll, importAll, memoryKV, readSave, readSlot, writeSave, writeSlot } from './storage';

const base = dreamPackageSchema.parse(JSON.parse(readFileSync('public/dreams/little-demon.json', 'utf8')));
const pkg: DreamPackage = { ...base, packageId: 'reader-fixture', entryNodeId: 'intro', resources: [{ id: 'trust', label: '信任', min: 0, max: 10, initial: 0 }], relationships: [], flags: [{ id: 'known', label: '知情', kind: 'knowledge' }], nodes: [
  { id: 'intro', kind: 'scene', scene: 'BG_GATE', origin: 'original', sourceRefs: [], beats: Array.from({ length: 40 }, (_, i) => ({ id: `beat-${i}`, kind: 'narration' as const, speaker: 'narrator', text: `第 ${i} 句` })), choices: [
    { id: 'yes', text: '答应', target: 'end', effects: { resourceDeltas: { trust: 3 }, relationshipDeltas: {}, setFlags: ['known'] } },
    { id: 'no', text: '拒绝', target: 'end', effects: { resourceDeltas: {}, relationshipDeltas: {}, setFlags: [] } },
  ] },
  { id: 'end', kind: 'ending', scene: 'BG_GATE', origin: 'original', sourceRefs: [], beats: [{ id: 'end-beat', kind: 'narration', speaker: 'narrator', text: '终幕' }], ending: { id: 'end', title: '结局', summary: '结束' } },
] };
const at = '2026-09-14T12:00:00Z';
function stateOf(result: EngineResult): SaveState { if (!result.ok) throw new Error(result.error.message); return result.state; }
function path() {
  let state = stateOf(startPackage(pkg, at)), journal = beginJournal(readingPosition(state));
  while (state.phase !== 'choosing') { state = stateOf(advance(pkg, state, at)); journal = recordPosition(journal, readingPosition(state)); }
  return { state, journal };
}
function choose(state: SaveState, choiceId: string) { return stateOf(chooseOption(pkg, state, { nodeId: state.nodeId, nodeVisit: nodeVisitOrdinal(state.choiceHistory, state.nodeId), choiceId, revision: state.revision }, at)); }

describe('对话队列与双存档', () => {
  it('最多回退和前进 30 条，恢复真实可见位置', () => {
    const { state, journal } = path();
    expect(journal.past).toHaveLength(HISTORY_LIMIT);
    let moved = journal;
    for (let i = 0; i < 50; i++) moved = moveJournal(moved, -1);
    expect(moved.present.beatIndex).toBe(9);
    expect(moved.future).toHaveLength(30);
    for (let i = 0; i < 50; i++) moved = moveJournal(moved, 1);
    expect(moved.present).toEqual(journal.present);
    expect(validateSave(pkg, restorePosition(pkg, moved.present, state.revision, at)!)).toBeNull();
  });
  it('回退选择恢复资源和知识标记，重选清除旧前进路线且拒绝过期点击', () => {
    const { state, journal } = path();
    const accepted = choose(state, 'yes');
    expect(accepted.resources.trust).toBe(3);
    const back = moveJournal(recordPosition(journal, readingPosition(accepted)), -1);
    const restored = restorePosition(pkg, back.present, accepted.revision, at)!;
    expect(restored.resources.trust).toBe(0);
    expect(restored.flags.known).toBe(false);
    expect(restored.revision).toBeGreaterThan(accepted.revision);
    expect(chooseOption(pkg, restored, { nodeId: state.nodeId, nodeVisit: 0, choiceId: 'yes', revision: state.revision }, at)).toMatchObject({ stale: true });
    const rejected = choose(restored, 'no');
    const fork = recordPosition(back, readingPosition(rejected));
    expect(fork.future).toHaveLength(0);
    expect(rejected.resources.trust).toBe(0);
    expect(validateSave(pkg, rejected)).toBeNull();
  });
  it('自动档保留选择前最后一句及队列，手动档独立，刷新和备份往返不丢队列', () => {
    const { state, journal } = path(), kv = memoryKV();
    expect(writeSlot(kv, state, beforeChoice(journal), 'auto').ok).toBe(true);
    const accepted = choose(state, 'yes'), after = recordPosition(journal, readingPosition(accepted));
    writeSlot(kv, accepted, after, 'manual'); writeSave(kv, accepted, after);
    expect(readSlot(kv, pkg, 'auto', at)).toMatchObject({ status: 'ok', state: { beatIndex: 39 }, reader: { present: { holdChoice: true }, future: [] } });
    const copy = memoryKV();
    expect(importAll(copy, exportAll(kv), [pkg])).toMatchObject({ ok: true, imported: 3 });
    expect(readSlot(copy, pkg, 'manual', at)).toMatchObject({ status: 'ok', reader: after });
    expect(readSave(copy, pkg, at)).toMatchObject({ status: 'ok', reader: after });
    const earlier = restorePosition(pkg, moveJournal(journal, -1).present, state.revision, at)!;
    writeSlot(copy, earlier, beforeChoice(moveJournal(journal, -1)), 'auto');
    expect(readSlot(copy, pkg, 'manual', at)).toMatchObject({ status: 'ok', state: { nodeId: 'end' } });
  });
  it('闲话的选择和回复游标随存档与前后翻阅恢复', () => {
    const { state, journal } = path(), kv = memoryKV();
    const first = recordPosition(journal, readingPosition(state, { key: 'unused', phase: 'reply', option: 'chat', index: 0 }));
    const second = recordPosition(first, readingPosition(state, { key: 'unused', phase: 'reply', option: 'chat', index: 1 }));
    const back = moveJournal(second, -1);
    writeSlot(kv, state, back, 'manual');
    expect(readSlot(kv, pkg, 'manual', at)).toMatchObject({ status: 'ok', reader: { present: { aside: { index: 0 } }, future: [{ aside: { index: 1 } }] } });
  });
  it('非法队列拒绝读取或导入，不改写原有存档', () => {
    const { state, journal } = path(), kv = memoryKV();
    writeSave(kv, state, journal);
    const exported = JSON.parse(exportAll(kv));
    const key = `rumengshu:save:${pkg.packageId}`, payload = JSON.parse(exported.data[key]);
    payload.reader.future = [{ ...journal.present, nodeId: 'missing' }];
    exported.data[key] = JSON.stringify(payload);
    expect(importAll(kv, JSON.stringify(exported), [pkg])).toMatchObject({ ok: false });
    expect(readSave(kv, pkg, at).status).toBe('ok');
    kv.set(key, JSON.stringify(payload));
    expect(readSave(kv, pkg, at)).toMatchObject({ status: 'corrupt', backedUp: true });
  });
  it('写入失败如实报告并保留旧存档', () => {
    const { state, journal } = path(), kv = memoryKV();
    writeSlot(kv, state, journal, 'manual');
    const full = { ...kv, set: () => { throw new Error('quota exceeded'); } };
    expect(writeSlot(full, state, beforeChoice(journal), 'manual')).toMatchObject({ ok: false, reason: 'quota' });
    expect(readSlot(kv, pkg, 'manual', at)).toMatchObject({ status: 'ok', reader: { present: { holdChoice: false } } });
  });
});

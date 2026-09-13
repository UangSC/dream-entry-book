import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { advance, chooseOption, nodeVisitOrdinal, replayView, restoreCheckpoint, startPackage } from './engine';
import type { EngineResult, SaveState } from './engine';
import { dreamPackageSchema } from './schema';
import { reconstruct, validateSave } from './replay';
import { collectEnding, exportAll, importAll, memoryKV, readAlbum, readSave, writeSave } from './storage';
import { validateDreamPackage } from './validate';

const pkg = dreamPackageSchema.parse(JSON.parse(readFileSync('public/dreams/little-demon.json', 'utf8')));
const assetIds = ['art', 'audio'].flatMap(folder => JSON.parse(readFileSync(`public/${folder}/manifest.json`, 'utf8')).assets.map((a: { id: string }) => a.id));
const time = '2026-09-13T05:00:00Z';
const unwrap = (result: EngineResult) => { if (!result.ok) throw new Error(result.error.message); return result.state; };

function play(choices: string[]) {
  let state = unwrap(startPackage(pkg, time));
  let index = 0;
  for (let step = 0; step < 1600; step++) {
    if (state.phase !== 'reading') expect(validateSave(pkg, state), `节点 ${state.nodeId} 拍 ${state.beatIndex}`).toBeNull();
    if (state.phase !== 'reading') expect(replayView(pkg, state).ok).toBe(true);
    if (state.phase === 'finished') return state;
    state = state.phase === 'choosing' ? unwrap(chooseOption(pkg, state, { nodeId: state.nodeId, nodeVisit: nodeVisitOrdinal(state.choiceHistory, state.nodeId), choiceId: choices[index++]!, revision: state.revision }, time)) : unwrap(advance(pkg, state, time));
  }
  throw new Error('路线未能在规定步数内结束');
}

describe('首篇完整路线', () => {
  for (const { choices, ending: target } of JSON.parse(readFileSync('content/final/route-audit.json', 'utf8')).routes as { choices: string[]; ending: string }[]) {
    it(`${choices.join(" → ")} 可通关并恢复`, () => {
      const state = play(choices);
      expect(state.choiceHistory).toHaveLength(choices.length);
      expect(state.nodeId).toBe(target);
      const replay = reconstruct(pkg, state);
      if (!replay.ok) throw new Error(replay.message);
      expect(new Set(replay.lines.map(item => item.nodeId)).size).toBeGreaterThan(15);
      const length = replay.lines.map(item => item.beat.text).join('').replace(/[^\p{Script=Han}]/gu, '').length;
      // 完整版路线预算；旧 Demo 的 1600–2400 汉字上限已不适用。
      expect(length).toBeGreaterThanOrEqual(7000);
      const kv = memoryKV(); writeSave(kv, state); expect(readSave(kv, pkg, time)).toEqual({ status: 'ok', state });
    });
  }
  it('完整故事与资源引用通过校验；实际新编稿没有伪造人工签字', () => {
    expect(validateDreamPackage(pkg, { assetIds }).ok).toBe(true);
    expect(validateDreamPackage(pkg, { assetIds, forPublish: true }).ok).toBe(false);
  });
  it('记录的来源哈希对应归档原文', () => {
    const source = JSON.parse(readFileSync('assets/source/stories/2025954672918163637.json', 'utf8'));
    expect(createHash('sha256').update(source.content.replace(/\r\n?/g, '\n')).digest('hex')).toBe(pkg.source.sourceHash);
  });
});

describe('回滚与存档保护', () => {
  it('回滚恢复此前事实，梦册保留，旧选择令牌不可重用', () => {
    const state = play(['warmed', 'faced-zhang', 'kept-hands', 'went-now', 'scared-him', 'hid', 'ascended']);
    const kv = memoryKV(); collectEnding(kv, { packageId: pkg.packageId, buildId: pkg.buildId, endingId: 'a-lamp-kept', title: '留一盏灯', collectedAt: time });
    let restored = unwrap(restoreCheckpoint(pkg, state, 0, time));
    expect(restored.flags.warmed).toBe(false); expect(restored.flags['kept-hands']).toBe(false);
    expect(validateSave(pkg, restored)).toBeNull(); expect(readAlbum(kv)).toHaveLength(1);
    while (restored.phase !== 'choosing') restored = unwrap(advance(pkg, restored, time));
    const token = { nodeId: restored.nodeId, choiceId: 'bargained', nodeVisit: 1, revision: restored.revision };
    const chosen = unwrap(chooseOption(pkg, restored, token, time));
    const repeated = chooseOption(pkg, chosen, token, time);
    expect(repeated.ok && 'stale' in repeated).toBe(true); expect(chosen.choiceHistory).toHaveLength(1);
    expect(validateSave(pkg, chosen)).toBeNull();
  });
  it('篡改事实和检查点都不能伪装成可续读存档', () => {
    const good = play(['warmed', 'faced-zhang', 'kept-hands', 'went-now', 'scared-him', 'hid', 'deferred']);
    const changed = structuredClone(good) as SaveState;
    changed.flags = { ...changed.flags, bargained: true };
    expect(validateSave(pkg, changed)).not.toBeNull();
    const damaged = structuredClone(good);
    damaged.checkpoints[0]!.vars = { ...damaged.checkpoints[0]!.vars, flags: { ...damaged.flags } };
    expect(validateSave(pkg, damaged)).not.toBeNull();
  });
  it('导入先验证整个文件，失败不覆盖现有进度', () => {
    const kv = memoryKV(), good = unwrap(startPackage(pkg, time)); writeSave(kv, good);
    const dump = JSON.parse(exportAll(kv));
    dump.data[`rumengshu:save:${pkg.packageId}`] = JSON.stringify({ ...good, flags: { injected: true } });
    expect(importAll(kv, JSON.stringify(dump), [pkg]).ok).toBe(false);
    expect(readSave(kv, pkg, time)).toEqual({ status: 'ok', state: good });
    expect(importAll(kv, exportAll(kv), [pkg]).ok).toBe(true);
  });
});

describe('制作期拦截无法通关的故事', () => {
  it('拒绝普通 next 形成的循环', () => {
    const broken = structuredClone(pkg); const node = broken.nodes.find(n => n.id === 'first-breath')!;
    if (node.kind === 'scene') node.next = 'threshold';
    expect(validateDreamPackage(broken, { assetIds }).findings.some(f => f.code === 'cycle')).toBe(true);
  });
  it('拒绝所有选择都隐藏的可达状态', () => {
    const broken = structuredClone(pkg); const node = broken.nodes.find(n => n.id === 'fireside')!;
    if (node.kind === 'scene') for (const choice of node.choices!) choice.when = { all: [{ kind: 'flag', id: 'warmed', equals: true }] };
    expect(validateDreamPackage(broken, { assetIds }).findings.some(f => f.code === 'dead-end')).toBe(true);
  });
  it('拒绝有连线但永远无法执行到的终幕', () => {
    const broken = structuredClone(pkg); const node = broken.nodes.find(n => n.id === 'farewell-ask')!;
    if (node.kind === 'scene') node.choices![0]!.when = { all: [{ kind: 'flag', id: 'ascended', equals: true }] };
    expect(validateDreamPackage(broken, { assetIds }).findings.some(f => f.code === 'ending-unreachable')).toBe(true);
  });
});

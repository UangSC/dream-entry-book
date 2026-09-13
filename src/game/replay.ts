import { advance, chooseOption, isBeatVisible, nodeVisitOrdinal, readBeatKey, startPackage } from './engine';
import type { EngineResult, SaveState } from './engine';
import type { Beat, DreamPackage } from './schema';

export interface ReadingLine { nodeId: string; beat: Beat }

/** 通过同一引擎重走 next 与选择分支；回放没有 IO，不播放一次性音效。 */
export function reconstruct(pkg: DreamPackage, saved: SaveState):
  | { ok: true; canonical: SaveState; lines: ReadingLine[]; scene: string; track: string; silenced: boolean }
  | { ok: false; message: string } {
  const fail = (message: string) => ({ ok: false as const, message });
  if (saved.packageId !== pkg.packageId || saved.buildId !== pkg.buildId) return fail('存档版本与故事不一致');
  let result = startPackage(pkg, saved.updatedAt);
  let scene = '', track = 'BGM_DREAM', silenced = false;
  const lines: ReadingLine[] = [];
  const consume = (value: EngineResult) => {
    if (!value.ok) return;
    for (const event of value.events) {
      if (event.type === 'beat') lines.push({ nodeId: event.nodeId, beat: event.beat });
      if (event.type === 'scene') scene = event.assetId;
      if (event.type === 'music') {
        if (event.action === 'play' && event.track) { track = event.track; silenced = false; }
        if (event.action === 'silence') silenced = true;
        if (event.action === 'resume') silenced = false;
      }
    }
  };
  consume(result);
  for (let steps = 0; steps < 1000; steps++) {
    if (!result.ok) return fail(result.error.message);
    const state = result.state;
    if (state.nodeId === saved.nodeId && state.beatIndex === saved.beatIndex && state.choiceHistory.length === saved.choiceHistory.length) {
      return { ok: true, canonical: state, lines, scene, track, silenced };
    }
    if (state.phase === 'finished') return fail('存档位置不在所选路线中');
    if (state.phase === 'choosing') {
      const record = saved.choiceHistory[state.choiceHistory.length];
      if (!record || record.nodeId !== state.nodeId) return fail('选择记录与故事路线不一致');
      result = chooseOption(pkg, state, {
        nodeId: state.nodeId, choiceId: record.choiceId, revision: state.revision,
        nodeVisit: nodeVisitOrdinal(state.choiceHistory, state.nodeId),
      }, saved.updatedAt);
    } else result = advance(pkg, state, saved.updatedAt);
    consume(result);
  }
  return fail('存档路径过长或包含循环');
}

const sameMap = (a: object, b: object) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
const sameHistory = (a: SaveState['choiceHistory'], b: SaveState['choiceHistory']) => JSON.stringify(a) === JSON.stringify(b);

export function validateSave(pkg: DreamPackage, saved: SaveState): string | null {
  const replay = reconstruct(pkg, saved);
  if (!replay.ok) return replay.message;
  const expected = replay.canonical;
  if (saved.phase !== expected.phase || !Number.isSafeInteger(saved.revision) || saved.revision < expected.revision) return '存档阶段或行动版本异常';
  if (!sameMap(saved.resources, expected.resources) || !sameMap(saved.relationships, expected.relationships) || !sameMap(saved.flags, expected.flags)) return '存档状态与实际选择结果不一致';
  if (saved.checkpoints.length !== expected.checkpoints.length) return '存档分歧点数量不一致';
  for (const [index, checkpoint] of saved.checkpoints.entries()) {
    const canonical = expected.checkpoints[index]!;
    if (checkpoint.nodeId !== canonical.nodeId || !sameHistory(checkpoint.choiceHistory, canonical.choiceHistory) ||
        !sameMap(checkpoint.vars.resources, canonical.vars.resources) || !sameMap(checkpoint.vars.relationships, canonical.vars.relationships) ||
        !sameMap(checkpoint.vars.flags, canonical.vars.flags) ||
        JSON.stringify([...checkpoint.readBeatKeys].sort()) !== JSON.stringify([...canonical.readBeatKeys].sort())) return '存档分歧点内容异常';
  }
  // 重选会从选择节点开头重读，因此当前节点的后续拍可以已经读过。
  const allowed = new Set(expected.readBeatKeys);
  const node = pkg.nodes.find(n => n.id === saved.nodeId)!;
  for (const beat of node.beats) if (isBeatVisible(beat, saved)) allowed.add(readBeatKey(pkg.buildId, saved.choiceHistory, node.id, beat.id));
  if (saved.readBeatKeys.some(key => !allowed.has(key)) || expected.readBeatKeys.some(key => !saved.readBeatKeys.includes(key))) return '已读记录与当前路线不一致';
  return null;
}

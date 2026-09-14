import { isBeatVisible, readBeatKey, replayToState } from './engine';
import type { SaveState } from './engine';
import type { Beat, DreamPackage } from './schema';

export interface ReadingLine { nodeId: string; beat: Beat }

/** 通过同一引擎重走 next 与选择分支；回放没有 IO，不播放一次性音效。 */
export function reconstruct(pkg: DreamPackage, saved: SaveState):
  | { ok: true; canonical: SaveState; lines: ReadingLine[]; scene: string; track: string; silenced: boolean }
  | { ok: false; message: string } {
  let scene = '', track = 'BGM_DREAM', silenced = false;
  const lines: ReadingLine[] = [];
  const result = replayToState(pkg, saved, events => {
    for (const event of events) {
      if (event.type === 'beat') lines.push({ nodeId: event.nodeId, beat: event.beat });
      if (event.type === 'scene') scene = event.assetId;
      if (event.type === 'music') {
        if (event.action === 'play' && event.track) { track = event.track; silenced = false; }
        if (event.action === 'silence') silenced = true;
        if (event.action === 'resume') silenced = false;
      }
    }
  });
  return result.ok ? { ok: true, canonical: result.state, lines, scene, track, silenced }
    : { ok: false, message: result.error.message };
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

import type { ParticleKind, Presentation } from '../books/schema';
import type { ReadingLine } from '../game/replay';

/** 天气提示延续至当前节点内的下一次换景；重选和存档恢复使用实际可见的阅读记录。 */
export function resolveAtmosphere(presentation: Presentation, scene: string, lines: readonly ReadingLine[]): ParticleKind {
  const nodeId = lines.at(-1)?.nodeId;
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index]!;
    if (line.nodeId !== nodeId) break;
    const cue = presentation.atmosphereCues?.[line.beat.id];
    if (cue !== undefined) return cue;
    if (line.beat.sceneShift !== undefined) break;
  }
  return presentation.scenes[scene]?.particles ?? 'none';
}

/** 停雨只收掉对应的环境雨声，独立的剧情配乐不受影响。 */
export function resolveAmbience(presentation: Presentation, scene: string, kind: ParticleKind): string | undefined {
  const profile = presentation.scenes[scene];
  if (profile?.particles === 'rain' && kind === 'none' &&
      ['BGM_RAIN_AMBIENCE', 'BGM_FOREST_RAIN'].includes(profile.ambience ?? '')) return undefined;
  return profile?.ambience;
}

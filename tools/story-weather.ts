import type { DreamPackage } from '../src/game/schema';
import type { ParticleKind, Presentation } from '../src/books/schema';
import { findBeat } from './story-staging';

/** 只给演出添加天气，原稿中的每一句正文保持原样。 */
export function createAtmosphereCues(pkg: DreamPackage): NonNullable<Presentation['atmosphereCues']> {
  const cues: NonNullable<Presentation['atmosphereCues']> = {};
  for (const nodeId of ['burn-mountain', 'ending-aftertaste', 'ending-bitter-echo', 'ending-bitter-mountains', 'years-of-the-king']) {
    const node = pkg.nodes.find(node => node.id === nodeId)!;
    if (node.beats[0]!.when) throw new Error(`天气起点需要无条件拍：${nodeId}`);
    cues[node.beats[0]!.id] = 'none';
  }
  cues[pkg.nodes.find(node => node.id === 'ending-bitter')!.beats[0]!.id] = 'rain';
  const changes: [string, string, ParticleKind][] = [
    ['ending-aftertaste', '不是你灭的。是雨，大了。', 'rain'],
    ['ending-aftertaste', '雨停了。天边裂开一线亮。', 'none'],
    ['ending-bitter', '后来，雨季过了。', 'none'],
    ['ending-bitter-echo', '他下山去了。雨把一切浇透。', 'rain'],
    ['ending-bitter-mountains', '雨把火浇透。天亮了。', 'rain'],
    ['master-comes', '念念来的那天，是个雨天。', 'rain'],
    ['doorstep-answers', '又一年，雪下了半尺深。', 'none'],
    ['years-of-the-king', '第五年冬天，你回去了。', 'none'],
    ['years-of-the-king', '雨落进深坑。很深。很深。', 'rain'],
  ];
  for (const [node, anchor, kind] of changes) cues[findBeat(pkg.nodes, node, anchor).id] = kind;
  return cues;
}

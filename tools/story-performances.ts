import type { DreamPackage } from '../src/game/schema';
import type { Presentation } from '../src/books/schema';

// 按台词 ID 编排情绪，不在播放器里用关键词猜表情。缺少的红袄表情使用同服装 calm。
const expressions: Record<string, string> = {
  'line-002': 'hungry', 'line-004': 'smug', 'line-007': 'panic',
  'line-012': 'panic', 'line-014': 'soft', 'line-017': 'fierce', 'line-019': 'calm', 'line-021': 'panic',
  'line-022': 'fierce', 'line-025': 'hungry', 'line-026': 'soft',
  'line-030': 'smug', 'line-031': 'soft', 'line-033': 'smug',
  'line-041': 'fierce', 'line-044': 'panic', 'line-053': 'calm', 'line-055': 'calm',
  'line-056': 'calm', 'line-061': 'calm', 'line-067': 'calm',
  'line-005': 'calm', 'line-071': 'calm', 'line-075': 'soft',
  'line-009': 'hungry', 'line-011': 'panic', 'line-101': 'soft',
  'line-028': 'calm', 'line-034': 'soft', 'line-035': 'calm',
  'line-036': 'calm', 'line-038': 'calm', 'line-039': 'calm', 'line-042': 'calm',
  'line-043': 'calm', 'line-045': 'calm', 'line-046': 'calm',
  'line-093': 'fierce', 'line-094': 'panic', 'line-095': 'calm',
};
const labels: Record<string, string> = { idle: '出神', calm: '平静', fierce: '逞强', hungry: '惦念人心', panic: '慌张', smug: '得意', soft: '温柔' };

export function createPerformances(pkg: DreamPackage): NonNullable<Presentation['performances']> {
  const result: NonNullable<Presentation['performances']> = {};
  for (const node of pkg.nodes) {
    const costume = ['doorstep', 'grove', 'last-light', 'ending-lantern', 'ending-path'].includes(node.id) ? 'COAT' : 'BARE';
    // 每个场景有独立情绪起点；旁白和他人接话不把主角的情绪重置为出神。
    let heldExpression = ['warmth', 'promise', 'small-miracle', 'ending-lantern'].includes(node.id) ? 'soft' : 'idle';
    for (const beat of node.beats) {
      if (expressions[beat.id]) heldExpression = expressions[beat.id]!;
      if (beat.speaker === 'yu-niang' || beat.speaker === 'nian-nian') {
        result[beat.id] = { portrait: `BG_PORTRAIT_${beat.speaker.toUpperCase().replaceAll('-', '_')}`, label: `${beat.speaker === 'yu-niang' ? '毓娘' : '念念'} · 半身立绘` };
      } else {
        const desired = heldExpression;
        const expression = costume === 'COAT' && ['hungry', 'smug', 'soft'].includes(desired) ? 'calm' : desired;
        result[beat.id] = { portrait: `BG_PORTRAIT_DEMON_${costume}_${expression.toUpperCase()}`, label: `小妖怪 · ${costume === 'COAT' ? '红袄' : '无袄'} · ${labels[expression]}` };
      }
    }
  }
  return result;
}

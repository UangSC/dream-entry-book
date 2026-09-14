import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dreamPackageSchema } from './schema';

const pkg = dreamPackageSchema.parse(JSON.parse(readFileSync('public/dreams/little-demon.json', 'utf8')));
const { files: sources } = JSON.parse(readFileSync('content/final/sources.json', 'utf8')) as { files: { file: string; sha256: string }[] };
const audit = JSON.parse(readFileSync('.work/story/import-audit.json', 'utf8')) as { file: string; line: number; raw: string; kind: string; id?: string; text?: string }[];

describe('正式定稿溯源', () => {
  it('二十处定稿台词与收束锚点逐字保留', () => {
    const text = pkg.nodes.flatMap(node => node.beats.map(beat => beat.text)).join('\n');
    for (const anchor of [
      '都说了我是小妖怪！吃人心的小妖怪！不是小神仙！', '一命换一命嘛，这很公平。', '她叫我孩子啊。',
      '有空了，回来吃饭。', '那只不过是个名字罢了', '只要有耐心，就一定能等到',
      '好难看啊，是吧。', '怎么样，还疼吗？', '傻孩子。你就是那大事啊。', '心之所向……？',
      '这山里的鸡腿，我还没吃够。仙，先欠着！', '这股力，是她的。她的心，不杀人。',
      '雨停了。天边裂开一线亮。', '满山的人，没有散。', '不。就差你自己的那一颗。',
      '报案先过心。心，我亲自尝。', '账，翻篇了。', '翻篇，不算赢。',
      '人，我不碰。山，我看着。道长的账，我一个人领。', '娘——这山里，都是暖的。',
    ]) expect(text, anchor).toContain(anchor);
  });
  it('四份剧情快照及审计行与锁定来源一致', () => {
    expect(sources).toHaveLength(4);
    const lines = new Map(sources.map(source => {
      const bytes = readFileSync(`content/final/${source.file}`);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(source.sha256);
      return [source.file, bytes.toString('utf8').split(/\r?\n/)];
    }));
    for (const row of audit) expect(lines.get(row.file)?.[row.line - 1], `${row.file}:${row.line}`).toBe(row.raw);
  });

  it('全部可见正文和锁定按钮均可逐字回溯，不混入临时版文字', () => {
    const beats = pkg.nodes.flatMap(node => node.beats);
    const choices = pkg.nodes.flatMap(node => node.kind === 'scene' ? node.choices ?? [] : []);
    expect(pkg.nodes).toHaveLength(51);
    expect(pkg.nodes.filter(node => node.kind === 'scene' && node.choices?.length)).toHaveLength(14);
    for (const [kind, items] of [['beat', beats], ['choice', choices]] as const) {
      const rows = audit.filter(row => row.kind === kind);
      expect(rows).toHaveLength(items.length);
      for (const item of items) {
        const row = rows.find(row => kind === 'choice' ? row.id?.endsWith(`:${item.id}`) : row.id === item.id);
        expect(row, item.id).toBeDefined();
        expect(item.text, item.id).toBe(row!.text);
        if (kind === 'choice') expect(row!.raw.split('→')[0]!.replace(/^-\s*/, '').trim()).toBe(item.text);
      }
    }
  });
});

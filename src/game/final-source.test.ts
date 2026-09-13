import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dreamPackageSchema } from './schema';

const pkg = dreamPackageSchema.parse(JSON.parse(readFileSync('public/dreams/little-demon.json', 'utf8')));
const sources = JSON.parse(readFileSync('content/final/sources.json', 'utf8')) as { file: string; sha256: string }[];
const audit = JSON.parse(readFileSync('content/final/import-audit.json', 'utf8')) as { file: string; line: number; raw: string; kind: string; id?: string; text?: string }[];

describe('正式定稿溯源', () => {
  it('七份只读快照及审计行与锁定来源一致', () => {
    expect(sources).toHaveLength(7);
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
    expect(beats).toHaveLength(951);
    expect(pkg.nodes.filter(node => node.kind === 'scene' && node.choices?.length)).toHaveLength(12);
    for (const [kind, items] of [['beat', beats], ['choice', choices]] as const) {
      const rows = audit.filter(row => row.kind === kind);
      expect(rows).toHaveLength(kind === 'choice' ? items.length - 1 : items.length);
      for (const item of items) {
        // 同一个“挡火”文案按已有真话/谎话旗标拆为两个互斥目标。
        const sourceId = ['shielded-truth', 'shielded-lie'].includes(item.id) ? 'shielded' : item.id;
        const row = rows.find(row => row.id === sourceId);
        expect(row, item.id).toBeDefined();
        expect(item.text, item.id).toBe(row!.text);
        if (kind === 'choice') expect(row!.raw.split('→')[0]!.replace(/^-\s*/, '').trim()).toBe(item.text);
      }
    }
  });
});

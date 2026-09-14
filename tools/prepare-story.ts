import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { validateDreamPackage } from '../src/game/validate';
import type { DreamNode, DreamPackage } from '../src/game/schema';
import { applyInferredConditions, ENDINGS, FLAGS, FLAG_GROUPS } from './story-contract';
import { CHARACTERS, digest, parseStoryFile, verifySource, type SourceRegistry, type SourceEntry } from './story-source';
import { stageStory } from './story-staging';

// 构建只读取登记的四份定稿与来源元数据，不依赖旧稿或本地交接报告。
const sourceDir = 'content/final';
const registry = JSON.parse(readFileSync(`${sourceDir}/sources.json`, 'utf8')) as SourceRegistry;
const nodes: DreamNode[] = [], audit: SourceEntry[] = [], chapters: Record<string, string> = {};
const integrity: ReturnType<typeof verifySource>[] = [];
assert.equal(registry.baselineConvention, 'han-lines-v1-includes-numbered-reflections');
assert.equal(registry.buildId, `final-${digest(registry.files.map(file => file.sha256).join('\n')).slice(0, 12)}`);
for (const source of registry.files) {
  assert.match(source.file, /^0[2-5]_[^/\\]+\.md$/);
  const bytes = readFileSync(`${sourceDir}/${source.file}`);
  const verification = verifySource(source, bytes);
  const parsed = parseStoryFile(source.file, bytes.toString('utf8'));
  assert.deepEqual(parsed.nodes.map(node => node.id), Object.keys(source.baseline));
  nodes.push(...parsed.nodes); audit.push(...parsed.audit); Object.assign(chapters, parsed.chapters);
  integrity.push(verification);
  const total = Object.values(verification.nodes).reduce((sum, node) => sum + node.historical, 0);
  console.log(`${source.file}：${parsed.nodes.length} 节点，历史口径 ${total}，逐节点字数偏差 0，修订之外逐字偏差 0。`);
}
assert.equal(nodes.length, 51);
assert.equal(nodes.filter(node => node.kind === 'scene' && node.choices).length, 14);
assert.equal(FLAGS.length, 29);
assert.deepEqual(nodes.filter(node => node.kind === 'ending').map(node => node.id).sort(), Object.keys(ENDINGS).sort());
for (const node of nodes) if (node.kind === 'ending') assert.equal(node.ending.title, ENDINGS[node.id as keyof typeof ENDINGS]);
const inferredConditions = applyInferredConditions(nodes);
stageStory(nodes);
const pkg: DreamPackage = {
  schemaVersion: 1, edition: 'longform', packageId: 'little-demon', buildId: registry.buildId,
  title: '吃人心的小妖怪', source: registry.source,
  review: { status: 'draft', reviewedBuildId: null, reviewedAt: null, reviewer: null },
  theme: 'warm', characters: Object.entries(CHARACTERS).map(([name, id]) => ({ id, name })),
  resources: [], relationships: [], flags: FLAGS.map(id => ({ id, label: id, kind: 'commitment' })),
  entryNodeId: 'threshold', nodes,
};
const art = JSON.parse(readFileSync('public/art/manifest.json', 'utf8'));
const audio = JSON.parse(readFileSync('public/audio/manifest.json', 'utf8'));
const result = validateDreamPackage(pkg, { assetIds: [...art.assets, ...audio.assets].map((asset: { id: string }) => asset.id) });
if (!result.ok) throw new Error(JSON.stringify(result.findings, null, 2));
const totals = registry.files.flatMap(file => Object.values(file.baseline)).reduce((sum, node) => ({
  historical: sum.historical + node.historical, body: sum.body + node.body,
  originalHistorical: sum.originalHistorical + node.originalHistorical, originalBody: sum.originalBody + node.originalBody,
}), { historical: 0, body: 0, originalHistorical: 0, originalBody: 0 });
assert.equal(totals.originalHistorical, registry.originalHistoricalTotal);
assert.equal(totals.originalBody, registry.originalBodyTotal);
mkdirSync('.work/story', { recursive: true });
writeFileSync('.work/story/import-audit.json', JSON.stringify(audit, null, 2) + '\n');
writeFileSync('.work/story/chapters.json', JSON.stringify(chapters, null, 2) + '\n');
writeFileSync('.work/story/integrity-audit.json', JSON.stringify({ buildId: registry.buildId, totals, files: integrity, inferredConditions, choices: FLAG_GROUPS }, null, 2) + '\n');
writeFileSync('public/dreams/little-demon.json', JSON.stringify(pkg, null, 2) + '\n');
console.log(`定稿已接入：51 节点 / ${nodes.reduce((sum, node) => sum + node.beats.length, 0)} 拍 / 14 选择点 / 29 旗标 / 8 终幕。`);

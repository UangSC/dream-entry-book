import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateDreamPackage } from '../src/game/validate';

const publicMode = process.argv.includes('--public');
const lists = ['art', 'audio', 'mascot'].map(folder => ({ folder, manifest: JSON.parse(readFileSync(`public/${folder}/manifest.json`, 'utf8')) }));
let failed = false;
for (const { folder, manifest } of lists) for (const asset of manifest.assets) {
  if (!/^(?:[a-z0-9-]+\/)*[a-z0-9-]+\.(webp|svg|mp3|wav)$/.test(asset.file)) throw new Error(`非法资源路径：${asset.id}`);
  const bytes = readFileSync(`public/${folder}/${asset.file}`);
  if (bytes.byteLength !== asset.bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error(`资源哈希或体积不符：${asset.id}`);
  if (publicMode && asset.rights?.status !== 'approved') { console.error(`公开发布前需记录素材使用依据：${asset.id}`); failed = true; }
}
const pkg = JSON.parse(readFileSync('public/dreams/little-demon.json', 'utf8'));
const result = validateDreamPackage(pkg, { assetIds: lists.flatMap(list => list.manifest.assets.map((a: { id: string }) => a.id)), forPublish: publicMode });
for (const finding of result.findings) console.log(`${finding.severity}：${finding.message}`);
if (!result.ok) failed = true;
if (publicMode) {
  try {
    const record = JSON.parse(readFileSync(`content/reviews/${pkg.buildId}.json`, 'utf8'));
    const hash = createHash('sha256').update(JSON.stringify({ ...pkg, review: undefined })).digest('hex');
    if (record.contentHash !== hash || !record.reviewer || !record.reviewedAt) throw new Error('审读记录不对应当前正文');
  } catch { console.error('当前改编稿的构建与内容哈希尚未绑定最终审读记录。'); failed = true; }
}
if (failed) process.exitCode = 1;
else console.log(`通过${publicMode ? '公开发布' : '本地试玩'}检查：${pkg.nodes.length} 个节点；全部资源哈希有效。`);

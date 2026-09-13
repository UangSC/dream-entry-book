import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { bookManifestSchema } from '../src/books/schema';
import { packDreamBook, readDreamBook, sha256 } from '../src/books/archive';

const args = process.argv.slice(2);
const value = (name: string) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
if (args.includes('--help') || !value('--input') || !value('--output')) {
  console.log('用法：npm run book:pack -- --input <解压后的目录> --output <新文件.dreambook>\n读取 book.json、story.json 与媒体，更新哈希并校验全部剧情后打包。输出文件必须尚不存在；编辑内容后请先修改 story.json 的 buildId。');
  if (!args.includes('--help')) process.exitCode = 1;
} else {
  const directory = resolve(value('--input')!), output = resolve(value('--output')!);
  if (!output.endsWith('.dreambook')) throw new Error('输出文件请使用 .dreambook 扩展名');
  const manifest = bookManifestSchema.parse(JSON.parse(await readFile(join(directory, 'book.json'), 'utf8')));
  const pkg = JSON.parse(await readFile(join(directory, 'story.json'), 'utf8'));
  const files: Record<string, Uint8Array> = {};
  for (const asset of manifest.assets) { const bytes = new Uint8Array(await readFile(join(directory, asset.path))); asset.bytes = bytes.length; asset.sha256 = await sha256(bytes); files[asset.path] = bytes; }
  manifest.storySha256 = await sha256(new TextEncoder().encode(JSON.stringify(pkg, null, 2)));
  const archive = packDreamBook(manifest, pkg, files);
  await readDreamBook(archive);
  await writeFile(output, archive, { flag: 'wx' });
  console.log(`已打包并验证：${output}（${(archive.length / 1024 / 1024).toFixed(1)} MiB）`);
}

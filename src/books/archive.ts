import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { bookManifestSchema, BOOK_LIMITS, safePath } from './schema';
import type { BookManifest, BookAsset } from './schema';
import { validateDreamPackage } from '../game/validate';
import type { DreamPackage } from '../game/schema';

export interface LoadedBook { manifest: BookManifest; pkg: DreamPackage; files: Record<string, Uint8Array>; archive: Uint8Array; fingerprint: string }
export const bookKey = (pkg: Pick<DreamPackage, 'packageId' | 'buildId'>) => `${pkg.packageId}@${pkg.buildId}`;
export async function sha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer);
  return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('');
}
function assertMedia(bytes: Uint8Array, asset: BookAsset) {
  const head = String.fromCharCode(...bytes.slice(0, 16));
  const valid = asset.mime === 'image/webp' ? head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP'
    : asset.mime === 'image/png' ? bytes[0] === 137 && head.slice(1, 4) === 'PNG'
    : asset.mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : asset.mime === 'audio/wav' ? head.startsWith('RIFF') && head.slice(8, 12) === 'WAVE'
    : asset.mime === 'audio/ogg' ? head.startsWith('OggS')
    : head.startsWith('ID3') || bytes[0] === 255 && (bytes[1]! & 0xe0) === 0xe0;
  if (!valid) throw new Error(`素材类型与内容不符：${asset.path}`);
}
export async function readDreamBook(archive: Uint8Array): Promise<LoadedBook> {
  try { return await parseDreamBook(archive); }
  catch (error) { if (error instanceof Error && /[\u4e00-\u9fff]/.test(error.message)) throw error; throw new Error('无法读取入梦书：文件不是有效的 ZIP，或 JSON 内容已损坏'); }
}
async function parseDreamBook(archive: Uint8Array): Promise<LoadedBook> {
  if (archive.length > BOOK_LIMITS.archive) throw new Error('入梦书不得超过 80 MiB');
  let size = 0; const names = new Set<string>();
  // 第一遍只读目录，先检查数量、展开体积与重复条目，避免解压炸弹和路径覆盖。
  unzipSync(archive, { filter(info) {
    const directory = info.name.endsWith('/'); const name = directory ? info.name.slice(0, -1) : info.name;
    if (!safePath(name) || names.has(info.name)) throw new Error('素材包含不安全路径或重复文件');
    names.add(info.name); size += info.originalSize;
    if (names.size > BOOK_LIMITS.files || !Number.isSafeInteger(info.originalSize) || info.originalSize < 0 || info.originalSize > BOOK_LIMITS.file || size > BOOK_LIMITS.unpacked) throw new Error('素材包展开体积或文件数量超限');
    if (!directory && !/\.(json|webp|png|jpe?g|mp3|wav|ogg)$/.test(name)) throw new Error('入梦书仅接受 JSON、图片和音频，不接受脚本');
    return false;
  } });
  if (!names.has('book.json') || !names.has('story.json')) throw new Error('未找到 book.json 或 story.json，请导入规范的入梦书');
  const files = unzipSync(archive, { filter: info => !info.name.endsWith('/') });
  for (const [name, bytes] of Object.entries(files)) if (name.endsWith('.json') && bytes.length > BOOK_LIMITS.json) throw new Error('单个 JSON 不得超过 1 MiB');
  const parsed = bookManifestSchema.safeParse(JSON.parse(strFromU8(files['book.json']!)));
  if (!parsed.success) throw new Error(`入梦书清单不符合 v1 规范：${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`);
  const manifest = parsed.data;
  if (await sha256(files['story.json']!) !== manifest.storySha256) throw new Error('剧情哈希不一致，文件可能已损坏');
  const ids = new Set<string>(), paths = new Set(['book.json', 'story.json']);
  for (const asset of manifest.assets) {
    if (ids.has(asset.id) || paths.has(asset.path)) throw new Error('素材 ID 或路径重复');
    ids.add(asset.id); paths.add(asset.path);
    const bytes = files[asset.path];
    if (!bytes || bytes.length !== asset.bytes || await sha256(bytes) !== asset.sha256) throw new Error(`素材缺失或哈希不一致：${asset.id}`);
    if ((asset.kind === 'image') !== asset.mime.startsWith('image/')) throw new Error('素材类别与 MIME 不匹配');
    if (asset.kind !== 'image' && !asset.durationSeconds) throw new Error(`音频缺少时长：${asset.id}`);
    if (asset.loop && (asset.kind !== 'music' || asset.loop.endSeconds > asset.durationSeconds! || asset.loop.startSeconds >= asset.loop.endSeconds || asset.loop.overlapMs / 1000 > (asset.loop.endSeconds - asset.loop.startSeconds) / 2)) throw new Error(`循环区间无效：${asset.id}`);
    assertMedia(bytes, asset);
  }
  if (Object.keys(files).some(name => !paths.has(name))) throw new Error('包内存在未在清单声明的文件');
  const result = validateDreamPackage(JSON.parse(strFromU8(files['story.json']!)), { assetIds: [...ids], byteLength: files['story.json']!.length });
  if (!result.ok || !result.data) throw new Error(`剧情校验失败：${result.findings.filter(f => f.severity === 'error').slice(0, 2).map(f => f.message).join('；')}`);
  const byId = new Map(manifest.assets.map(a => [a.id, a]));
  const assertKind = (id: string | undefined, kind: 'image' | 'music' | 'sfx') => { if (id && byId.get(id)?.kind !== kind) throw new Error(`素材引用类别错误：${id}`); };
  assertKind(manifest.presentation.cover, 'image'); assertKind(manifest.presentation.endingScene, 'image');
  assertKind(manifest.presentation.dreamMusic, 'music'); assertKind(manifest.presentation.endingMusic, 'music');
    for (const [id, scene] of Object.entries(manifest.presentation.scenes)) { assertKind(id, 'image'); assertKind(scene.ambience, 'music'); }
    const beatIds = new Set(result.data.nodes.flatMap(node => node.beats.map(beat => beat.id)));
    for (const [id, performance] of Object.entries(manifest.presentation.performances ?? {})) {
      if (!beatIds.has(id)) throw new Error(`立绘演出引用不存在的拍：${id}`);
      assertKind(performance.portrait, 'image');
    }
    for (const [id, aside] of Object.entries(manifest.presentation.asides ?? {})) {
      if (!beatIds.has(id)) throw new Error(`闲话引用不存在的拍：${id}`);
      if (new Set(aside.options.map(option => option.id)).size !== aside.options.length) throw new Error('闲话选项 ID 重复');
      for (const option of aside.options) for (const reply of option.replies) {
        if (reply.speaker !== 'narrator' && !result.data.characters.some(character => character.id === reply.speaker)) throw new Error(`闲话引用不存在的人物：${reply.speaker}`);
        assertKind(reply.portrait, 'image');
      }
    }
  for (const node of result.data.nodes) { assertKind(node.scene, 'image'); for (const beat of node.beats) { if (beat.musicCue?.action === 'play') assertKind(beat.musicCue.track, 'music'); if (beat.sfx) assertKind(beat.sfx, 'sfx'); } }
  for (const id of Object.keys(manifest.presentation.chapters)) if (!result.data.nodes.some(node => node.id === id)) throw new Error(`章节名称引用不存在的节点：${id}`);
  const choiceIds = new Set(result.data.nodes.flatMap(node => node.kind === 'scene' ? node.choices?.map(choice => choice.id) ?? [] : []));
  for (const id of Object.keys(manifest.presentation.choiceMoods ?? {})) if (!choiceIds.has(id)) throw new Error(`选择演出引用不存在的选项：${id}`);
  return { manifest, pkg: result.data, files, archive, fingerprint: await sha256(new TextEncoder().encode(JSON.stringify(manifest))) };
}
export function packDreamBook(manifest: BookManifest, pkg: DreamPackage, assets: Record<string, Uint8Array>): Uint8Array {
  return zipSync({ 'book.json': strToU8(JSON.stringify(manifest, null, 2)), 'story.json': strToU8(JSON.stringify(pkg, null, 2)), ...assets }, { level: 0, mtime: new Date(2000, 0, 1) });
}

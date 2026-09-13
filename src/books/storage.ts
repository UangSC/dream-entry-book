import { openDB } from 'idb';
import type { LoadedBook } from './archive';
import { bookKey } from './archive';
import type { KV } from '../game/storage';
import type { DreamPackage } from '../game/schema';

export interface BookRecord { id: string; packageId: string; buildId: string; title: string; author: string; fingerprint: string; archive: Blob; cover: Blob; addedAt: string; simulation: boolean }
const database = () => openDB('rumengshu-books', 1, { upgrade(db) { db.createObjectStore('books', { keyPath: 'id' }); } });
export async function listBooks(): Promise<BookRecord[]> { const db = await database(); try { return await db.getAll('books'); } finally { db.close(); } }
export async function storeBook(book: LoadedBook): Promise<BookRecord> {
  const asset = book.manifest.assets.find(a => a.id === book.manifest.presentation.cover)!;
  const record: BookRecord = { id: bookKey(book.pkg), packageId: book.pkg.packageId, buildId: book.pkg.buildId, title: book.pkg.title, author: book.pkg.source.author ?? '作者信息待核对', fingerprint: book.fingerprint, archive: new Blob([book.archive.slice().buffer as ArrayBuffer]), cover: new Blob([book.files[asset.path]!.slice().buffer as ArrayBuffer], { type: asset.mime }), addedAt: new Date().toISOString(), simulation: book.manifest.simulation };
  const db = await database();
  try {
    const tx = db.transaction('books', 'readwrite');
    const existing = await tx.store.get(record.id) as BookRecord | undefined;
    if (existing && existing.fingerprint !== record.fingerprint) { tx.abort(); await tx.done.catch(() => {}); throw new Error('此版本已存在且内容不同，请制作方更换 buildId 后重新导入'); }
    if (!existing) await tx.store.add(record);
    await tx.done; return existing ?? record;
  } finally { db.close(); }
}
/** 每个包版本拥有独立进度；旧的单篇存档只在 buildId 相符时复制，原件保留。 */
export function bookKV(storage: KV, pkg: DreamPackage): KV {
  const scope = `rumengshu:book-state:${bookKey(pkg)}:`;
  const key = `rumengshu:save:${pkg.packageId}`;
  try {
    if (!storage.get(scope + 'initialized')) {
      const legacy = storage.get(key);
      if (legacy && JSON.parse(legacy).buildId === pkg.buildId && !storage.get(scope + key)) storage.set(scope + key, legacy);
      storage.set(scope + 'initialized', '1');
    }
  } catch { /* 具体写入失败由正常存档流程向玩家报告 */ }
  const mapped = (key: string) => key === 'rumengshu:album' || key.startsWith('rumengshu:album:') ? key : scope + key;
  return { get: key => storage.get(mapped(key)), set: (key, value) => storage.set(mapped(key), value), remove: key => storage.remove(mapped(key)), keys: () => [...storage.keys().filter(k => k.startsWith(scope) && !k.endsWith(':initialized')).map(k => k.slice(scope.length)), 'rumengshu:album'] };
}

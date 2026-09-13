import { describe, expect, it } from 'vitest';
import { dreamPackageSchema, type DreamPackage } from './schema';
import { startPackage, type SaveState } from './engine';
import {
  clearSave,
  collectEnding,
  exportAll,
  importAll,
  memoryKV,
  readAlbum,
  readSave,
  writeSave,
  type KV,
} from './storage';

const T0 = '2026-09-12T10:00:00+08:00';

const RAW: unknown = {
  schemaVersion: 1,
  packageId: 'store-fixture',
  buildId: 'build-001',
  title: '存档夹具',
  source: {
    kind: 'original_demo',
    title: '原创示例',
    author: null,
    workId: null,
    completeness: 'complete',
    trailingFragment: false,
    sourceHash: 'c'.repeat(64),
    paragraphIds: ['p-0001'],
    sourceUrl: null,
    linkStatus: 'missing',
    rightsRef: '项目自有设定',
  },
  review: {
    status: 'approved',
    reviewedBuildId: 'build-001',
    reviewedAt: T0,
    reviewer: '人工审读',
  },
  theme: 'calm',
  characters: [],
  resources: [{ id: 'calm', label: '心绪', min: 0, max: 5, initial: 3 }],
  relationships: [],
  flags: [],
  entryNodeId: 'gate',
  nodes: [
    {
      id: 'gate',
      kind: 'scene',
      origin: 'original',
      sourceRefs: ['p-0001'],
      scene: 'BG_GATE',
      beats: [{ id: 'b-1', kind: 'narration', speaker: 'narrator', text: '一。' }],
      next: 'end',
    },
    {
      id: 'end',
      kind: 'ending',
      origin: 'original',
      sourceRefs: ['p-0001'],
      scene: 'BG_END',
      beats: [{ id: 'b-2', kind: 'narration', speaker: 'narrator', text: '二。' }],
      ending: { id: 'e-1', title: '晨光', summary: '醒来。' },
    },
  ],
};

const PKG: DreamPackage = dreamPackageSchema.parse(RAW);

const freshState = (): SaveState => {
  const r = startPackage(PKG, T0);
  if (!r.ok) throw new Error('夹具开局失败');
  return r.state;
};

/** set 永远抛指定错误的 KV，用来测写失败必须如实报告。 */
const throwingKV = (error: unknown): KV => ({
  get: () => null,
  set: () => {
    throw error;
  },
  remove: () => undefined,
  keys: () => [],
});

describe('进度存档往返', () => {
  it('写入后能读回同一状态', () => {
    const kv = memoryKV();
    const state = freshState();
    expect(writeSave(kv, state)).toEqual({ ok: true });
    const r = readSave(kv, PKG, T0);
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.state).toEqual(state);
  });

  it('没有存档时返回 none', () => {
    expect(readSave(memoryKV(), PKG, T0).status).toBe('none');
  });

  it('清档后回到 none', () => {
    const kv = memoryKV();
    writeSave(kv, freshState());
    clearSave(kv, PKG.packageId);
    expect(readSave(kv, PKG, T0).status).toBe('none');
  });
});

describe('写失败必须如实报告', () => {
  it('配额不足报 quota，绝不谎称已保存', () => {
    const kv = throwingKV(new Error('QuotaExceededError: quota reached'));
    const r = writeSave(kv, freshState());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('quota');
      expect(r.message).toContain('尚未保存');
    }
  });

  it('存储不可用报 unavailable', () => {
    const r = writeSave(throwingKV(new Error('localStorage is disabled')), freshState());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unavailable');
  });

  it('DOMException 形式的配额错误也能识别', () => {
    const err = new DOMException('over quota', 'QuotaExceededError');
    const r = writeSave(throwingKV(err), freshState());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('quota');
  });
});

describe('损坏与不符：备份，不编造', () => {
  it('非法 JSON 判为 corrupt 且已备份', () => {
    const kv = memoryKV({ 'rumengshu:save:store-fixture': '{ not json' });
    const r = readSave(kv, PKG, T0);
    expect(r.status).toBe('corrupt');
    if (r.status === 'corrupt') expect(r.backedUp).toBe(true);
    expect(kv.keys().some((k) => k.startsWith('rumengshu:backup:'))).toBe(true);
  });

  it('结构不符判为 corrupt', () => {
    const kv = memoryKV({ 'rumengshu:save:store-fixture': JSON.stringify({ saveVersion: 1 }) });
    expect(readSave(kv, PKG, T0).status).toBe('corrupt');
  });

  it('本包键位下放着别的梦包的存档时判为 corrupt', () => {
    // writeSave 按 state.packageId 选键，正常路径下不会串包。
    // 这里直接把内容塞进本包键位，模拟手改存储或导入了错文件——
    // 这道检查是防这种情况的，不能因为"正常写不出来"就不查。
    const kv = memoryKV({
      'rumengshu:save:store-fixture': JSON.stringify({ ...freshState(), packageId: 'other-pkg' }),
    });
    const r = readSave(kv, PKG, T0);
    expect(r.status).toBe('corrupt');
    if (r.status === 'corrupt') {
      expect(r.message).toContain('other-pkg');
      expect(r.backedUp).toBe(true);
    }
  });

  it('指向不存在的节点判为 corrupt', () => {
    const kv = memoryKV();
    writeSave(kv, { ...freshState(), nodeId: 'ghost-node' });
    const r = readSave(kv, PKG, T0);
    expect(r.status).toBe('corrupt');
    if (r.status === 'corrupt') expect(r.message).toContain('ghost-node');
  });

  it('beatIndex 越出该节点拍数判为 corrupt', () => {
    const kv = memoryKV();
    writeSave(kv, { ...freshState(), beatIndex: 99 });
    const r = readSave(kv, PKG, T0);
    expect(r.status).toBe('corrupt');
    if (r.status === 'corrupt') expect(r.message).toContain('99');
  });
});

describe('构建变化', () => {
  it('构建号不同时报 build-mismatch，备份旧档且不清空', () => {
    const kv = memoryKV();
    const old = { ...freshState(), buildId: 'build-000' };
    writeSave(kv, old);
    const r = readSave(kv, PKG, T0);
    expect(r.status).toBe('build-mismatch');
    if (r.status === 'build-mismatch') {
      expect(r.savedBuildId).toBe('build-000');
      expect(r.currentBuildId).toBe('build-001');
      expect(r.backedUp).toBe(true);
    }
    // 原存档仍在，等玩家决定；不静默迁移也不清空
    expect(kv.get('rumengshu:save:store-fixture')).not.toBeNull();
    expect(kv.keys().some((k) => k.includes(':backup:'))).toBe(true);
  });
});

describe('梦册', () => {
  const entry = {
    packageId: 'store-fixture',
    buildId: 'build-001',
    endingId: 'e-1',
    title: '晨光',
    collectedAt: T0,
  };

  it('收藏后能读回', () => {
    const kv = memoryKV();
    expect(collectEnding(kv, entry)).toEqual({ ok: true });
    expect(readAlbum(kv)).toEqual([entry]);
  });

  it('重复收藏不产生第二条，且保留首次时间', () => {
    const kv = memoryKV();
    collectEnding(kv, entry);
    collectEnding(kv, { ...entry, collectedAt: '2026-09-13T10:00:00+08:00' });
    const album = readAlbum(kv);
    expect(album).toHaveLength(1);
    expect(album[0]?.collectedAt).toBe(T0);
  });

  it('不同终幕各占一条', () => {
    const kv = memoryKV();
    collectEnding(kv, entry);
    collectEnding(kv, { ...entry, endingId: 'e-2', title: '雨夜' });
    expect(readAlbum(kv)).toHaveLength(2);
  });

  it('梦册损坏时返回空而不抛，不拦住玩游戏', () => {
    const kv = memoryKV({ 'rumengshu:album': '{ broken' });
    expect(readAlbum(kv)).toEqual([]);
  });

  it('收藏失败如实报告', () => {
    const r = collectEnding(throwingKV(new Error('quota exceeded')), entry);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('尚未保存');
  });

  it('进度存档与梦册互不影响', () => {
    const kv = memoryKV();
    collectEnding(kv, entry);
    writeSave(kv, freshState());
    clearSave(kv, PKG.packageId);
    // 清掉进度不该抹掉已收藏的终幕
    expect(readAlbum(kv)).toHaveLength(1);
  });
});

describe('导出与导入', () => {
  it('往返后进度与梦册都在', () => {
    const from = memoryKV();
    writeSave(from, freshState());
    collectEnding(from, {
      packageId: 'store-fixture',
      buildId: 'build-001',
      endingId: 'e-1',
      title: '晨光',
      collectedAt: T0,
    });
    const dump = exportAll(from);

    const to = memoryKV();
    const r = importAll(to, dump, [PKG]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.imported).toBeGreaterThanOrEqual(2);
    expect(readSave(to, PKG, T0).status).toBe('ok');
    expect(readAlbum(to)).toHaveLength(1);
  });

  it('只导出本命名空间的键', () => {
    const kv = memoryKV({ 'unrelated:key': 'x' });
    writeSave(kv, freshState());
    const dump = JSON.parse(exportAll(kv)) as { data: Record<string, string> };
    expect(Object.keys(dump.data).every((k) => k.startsWith('rumengshu:'))).toBe(true);
  });

  it('导入文件里的外部键被跳过，不让它往别处写', () => {
    const kv = memoryKV();
    const payload = JSON.stringify({
      exportVersion: 1,
      exportedAt: T0,
      data: { 'evil:key': 'x', 'rumengshu:album': '{"albumVersion":1,"entries":[]}' },
    });
    const r = importAll(kv, payload);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.imported).toBe(1);
      expect(r.skipped).toBe(1);
    }
    expect(kv.get('evil:key')).toBeNull();
  });

  it('非法导入文件不写入任何内容', () => {
    const kv = memoryKV();
    expect(importAll(kv, '{ broken').ok).toBe(false);
    expect(importAll(kv, JSON.stringify({ exportVersion: 9 })).ok).toBe(false);
    expect(kv.keys()).toEqual([]);
  });
});

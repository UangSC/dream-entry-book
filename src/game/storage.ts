import { z } from 'zod';
import type { DreamPackage } from './schema';
import type { SaveState } from './engine';
import { validateSave } from './replay';
import { validateJournal, type ReaderJournal } from './reader';

/**
 * 存档层。三条来自契约的规则：
 *
 * 1. 写失败必须如实报告。界面显示"进度尚未保存"，
 *    绝不能在写失败后显示"书签已收好"。
 * 2. 构建变化保留旧存档，不静默清空、不未经核验迁移。
 * 3. 梦签收藏与进度存档分开存放：重选新路线不该抹掉已收藏的终幕。
 *
 * 用 KV 接口而不直接调 localStorage：便于在 node 里用内存实现测试，
 * 也便于将来换 IndexedDB 而不动上层。
 */

export interface KV {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(): readonly string[];
}

const NS = 'rumengshu';
const saveKey = (packageId: string) => `${NS}:save:${packageId}`;
const backupKey = (packageId: string, buildId: string, at: string) =>
  `${NS}:backup:${packageId}:${buildId}:${at}`;
const ALBUM_KEY = `${NS}:album`;

// ---------- 存档形状校验 ----------

const varsRecord = z.record(z.string(), z.number());

const checkpointSchema = z.object({
  nodeId: z.string(),
  revision: z.number().int(),
  vars: z.object({
    resources: varsRecord,
    relationships: varsRecord,
    flags: z.record(z.string(), z.boolean()),
  }),
  choiceHistory: z.array(z.object({ nodeId: z.string(), choiceId: z.string() })),
  readBeatKeys: z.array(z.string()),
});

export const saveStateSchema = z.object({
  saveVersion: z.literal(1),
  packageId: z.string(),
  buildId: z.string(),
  nodeId: z.string(),
  beatIndex: z.number().int().min(0),
  phase: z.enum(['reading', 'choosing', 'finished']),
  revision: z.number().int().min(1),
  resources: varsRecord,
  relationships: varsRecord,
  flags: z.record(z.string(), z.boolean()),
  choiceHistory: z.array(z.object({ nodeId: z.string(), choiceId: z.string() })),
  readBeatKeys: z.array(z.string()),
  checkpoints: z.array(checkpointSchema),
  updatedAt: z.string(),
});

// ---------- 写入 ----------

export type WriteOutcome =
  | { ok: true }
  /** 如实报告失败原因，界面据此显示"进度尚未保存"并提供重试/导出。 */
  | { ok: false; reason: 'quota' | 'unavailable' | 'serialize'; message: string };

const isQuotaError = (e: unknown): boolean => {
  if (typeof DOMException !== 'undefined' && e instanceof DOMException) {
    return e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED';
  }
  return e instanceof Error && /quota|exceeded/i.test(e.message);
};

export const writeSave = (kv: KV, state: SaveState, reader?: ReaderJournal): WriteOutcome => {
  let payload: string;
  try {
    payload = JSON.stringify({ ...state, ...(reader ? { reader } : {}) });
  } catch (e) {
    return { ok: false, reason: 'serialize', message: `存档序列化失败：${String(e)}` };
  }
  try {
    kv.set(saveKey(state.packageId), payload);
    return { ok: true };
  } catch (e) {
    return isQuotaError(e)
      ? { ok: false, reason: 'quota', message: '浏览器存储空间不足，进度尚未保存' }
      : { ok: false, reason: 'unavailable', message: `存储不可用，进度尚未保存：${String(e)}` };
  }
};

// ---------- 读取 ----------

export type ReadOutcome =
  | { status: 'none' }
  | { status: 'ok'; state: SaveState; reader?: ReaderJournal }
  /** 构建号变了：旧档已备份，等玩家决定，不自动迁移。 */
  | { status: 'build-mismatch'; savedBuildId: string; currentBuildId: string; backedUp: boolean }
  /** 结构损坏或与梦包不符：已备份，不编造状态。 */
  | { status: 'corrupt'; message: string; backedUp: boolean };

export const readSave = (kv: KV, pkg: DreamPackage, now: string): ReadOutcome => {
  let raw: string | null;
  try {
    raw = kv.get(saveKey(pkg.packageId));
  } catch (e) {
    return { status: 'corrupt', message: `读取存档失败：${String(e)}`, backedUp: false };
  }
  if (raw === null) return { status: 'none' };

  const backup = (): boolean => {
    try {
      kv.set(backupKey(pkg.packageId, 'unknown', now), raw as string);
      return true;
    } catch {
      return false;
    }
  };

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (e) {
    return { status: 'corrupt', message: `存档不是合法 JSON：${String(e)}`, backedUp: backup() };
  }

  const parsed = saveStateSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return {
      status: 'corrupt',
      message: `存档结构不符：${parsed.error.issues[0]?.message ?? '未知'}`,
      backedUp: backup(),
    };
  }
  const state = parsed.data as SaveState;

  if (state.packageId !== pkg.packageId) {
    return {
      status: 'corrupt',
      message: `存档属于 ${state.packageId}，当前梦包是 ${pkg.packageId}`,
      backedUp: backup(),
    };
  }

  if (state.buildId !== pkg.buildId) {
    // 构建变化：备份后交给玩家决定，不静默迁移也不清空
    let backedUp = false;
    try {
      kv.set(backupKey(pkg.packageId, state.buildId, now), raw);
      backedUp = true;
    } catch {
      backedUp = false;
    }
    return {
      status: 'build-mismatch',
      savedBuildId: state.buildId,
      currentBuildId: pkg.buildId,
      backedUp,
    };
  }

  // 引用完整性：节点必须存在，beatIndex 必须在范围内
  const node = pkg.nodes.find((n) => n.id === state.nodeId);
  if (node === undefined) {
    return {
      status: 'corrupt',
      message: `存档指向不存在的节点 ${state.nodeId}`,
      backedUp: backup(),
    };
  }
  if (state.beatIndex >= node.beats.length) {
    return {
      status: 'corrupt',
      message: `存档 beatIndex ${state.beatIndex} 超出节点 ${state.nodeId} 的 ${node.beats.length} 拍`,
      backedUp: backup(),
    };
  }

  const issue = validateSave(pkg, state);
  if (issue) return { status: 'corrupt', message: issue, backedUp: backup() };
  const rawReader = (parsedJson as { reader?: unknown }).reader;
  const reader = rawReader === undefined ? undefined : validateJournal(pkg, state, rawReader);
  if (reader === null) return { status: 'corrupt', message: '对话队列与存档路线不一致', backedUp: backup() };
  return { status: 'ok', state, reader };
};

export type SaveSlot = 'auto' | 'manual';
const slotKey = (packageId: string, slot: SaveSlot) => `${NS}:slot:${slot}:${packageId}`;
const slotKV = (kv: KV, packageId: string, slot: SaveSlot): KV => ({ ...kv,
  get: key => kv.get(key === saveKey(packageId) ? slotKey(packageId, slot) : key),
  set: (key, value) => kv.set(key === saveKey(packageId) ? slotKey(packageId, slot) : key, value),
});
export const readSlot = (kv: KV, pkg: DreamPackage, slot: SaveSlot, at: string) => readSave(slotKV(kv, pkg.packageId, slot), pkg, at);
export const writeSlot = (kv: KV, state: SaveState, reader: ReaderJournal, slot: SaveSlot) => writeSave(slotKV(kv, state.packageId, slot), state, reader);

export const clearSave = (kv: KV, packageId: string): WriteOutcome => {
  try {
    kv.remove(saveKey(packageId));
    return { ok: true };
  } catch {
    return { ok: false, reason: 'unavailable', message: '删除进度失败，请重试或导出备份' };
  }
};

// ---------- 梦册 ----------

export interface AlbumEntry {
  packageId: string;
  buildId: string;
  endingId: string;
  title: string;
  collectedAt: string;
}

const albumSchema = z.object({
  albumVersion: z.literal(1),
  entries: z.array(
    z.object({
      packageId: z.string(),
      buildId: z.string().default('legacy'),
      endingId: z.string(),
      title: z.string(),
      collectedAt: z.string(),
    }),
  ),
});

export const readAlbum = (kv: KV): readonly AlbumEntry[] => {
  let raw: string | null;
  try {
    raw = kv.get(ALBUM_KEY);
  } catch {
    return [];
  }
  if (raw === null) return [];
  try {
    const parsed = albumSchema.safeParse(JSON.parse(raw));
    // 梦册损坏时返回空而不抛：它是收藏，不该拦住玩游戏
    return parsed.success ? parsed.data.entries : [];
  } catch {
    return [];
  }
};

/** 收藏梦签。同一终幕重复收藏不产生第二条，保留首次时间。 */
export const collectEnding = (kv: KV, entry: AlbumEntry): WriteOutcome => {
  // 损坏的旧梦册不能在下一次收藏时被静默覆盖。
  try {
    const raw = kv.get(ALBUM_KEY);
    if (raw) {
      let valid = false;
      try { valid = albumSchema.safeParse(JSON.parse(raw)).success; } catch { /* 备份后才可替换 */ }
      if (!valid) kv.set(`${NS}:backup:album:${Date.now()}`, raw);
    }
  } catch { return { ok: false, reason: 'unavailable', message: '旧梦册备份失败，新梦签尚未保存' }; }
  const current = readAlbum(kv);
  if (current.some((e) => e.packageId === entry.packageId && e.buildId === entry.buildId && e.endingId === entry.endingId)) {
    return { ok: true };
  }
  const next = { albumVersion: 1 as const, entries: [...current, entry] };
  try {
    kv.set(ALBUM_KEY, JSON.stringify(next));
    return { ok: true };
  } catch (e) {
    return isQuotaError(e)
      ? { ok: false, reason: 'quota', message: '存储空间不足，梦签尚未保存' }
      : { ok: false, reason: 'unavailable', message: `存储不可用，梦签尚未保存：${String(e)}` };
  }
};

// ---------- 导出与导入 ----------

/**
 * 换端口或换域名会换掉同源存储，浏览器不会自动继承旧存档，
 * 所以提供显式导出/导入，而不宣称会自动迁移。
 */
export const exportAll = (kv: KV): string => {
  const out: Record<string, string> = {};
  for (const key of kv.keys()) {
    if (!key.startsWith(`${NS}:`)) continue;
    const value = kv.get(key);
    if (value !== null) out[key] = value;
  }
  return JSON.stringify({ exportVersion: 1, exportedAt: new Date().toISOString(), data: out });
};

const exportSchema = z.object({
  exportVersion: z.literal(1),
  exportedAt: z.string(),
  data: z.record(z.string(), z.string()),
});

export type ImportOutcome =
  | { ok: true; imported: number; skipped: number }
  | { ok: false; message: string };

export const importAll = (kv: KV, json: string, packages: readonly DreamPackage[] = []): ImportOutcome => {
  if (new TextEncoder().encode(json).length > 2 * 1024 * 1024) return { ok: false, message: '备份不得超过 2 MiB' };
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(json);
  } catch (e) {
    return { ok: false, message: `导入文件不是合法 JSON：${String(e)}` };
  }
  const parsed = exportSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return { ok: false, message: '导入文件结构不符，未写入任何内容' };
  }
  // 先完整校验后写入；导入数据不能绕开存档路线验证。
  const writes: [string, string][] = [];
  let imported = 0;
  let skipped = 0;
  for (const [key, value] of Object.entries(parsed.data.data)) {
    // 只接受本命名空间的键，不让导入文件往别处写
    if (!key.startsWith(`${NS}:save:`) && !key.startsWith(`${NS}:slot:`) && key !== ALBUM_KEY) {
      skipped += 1;
      continue;
    }
    let data: unknown;
    try { data = JSON.parse(value); } catch { return { ok: false, message: '备份包含损坏的数据，未导入' }; }
    if (key === ALBUM_KEY) {
      const album = albumSchema.safeParse(data);
      if (!album.success || album.data.entries.some(e => !packages.some(p => p.packageId === e.packageId && p.buildId === e.buildId && p.nodes.some(n => n.kind === 'ending' && n.ending.id === e.endingId && n.ending.title === e.title)))) return { ok: false, message: '备份梦签与当前故事版本不符' };
      const merged = [...readAlbum(kv)];
      for (const entry of album.data.entries) if (!merged.some(e => e.packageId === entry.packageId && e.buildId === entry.buildId && e.endingId === entry.endingId)) merged.push(entry);
      writes.push([key, JSON.stringify({ albumVersion: 1, entries: merged })]);
    } else {
      const saved = saveStateSchema.safeParse(data);
      const pkg = packages.find(p => key === saveKey(p.packageId) || key === slotKey(p.packageId, 'auto') || key === slotKey(p.packageId, 'manual'));
      if (!saved.success || !pkg || validateSave(pkg, saved.data)) return { ok: false, message: '备份进度与当前故事路线或版本不符' };
      const rawReader = (data as { reader?: unknown }).reader;
      const reader = rawReader === undefined ? undefined : validateJournal(pkg, saved.data, rawReader);
      if (reader === null) return { ok: false, message: '备份对话队列与故事路线不符' };
      writes.push([key, JSON.stringify({ ...saved.data, ...(reader ? { reader } : {}) })]);
    }
  }
  const previous = new Map<string, string | null>();
  try {
    for (const [key] of writes) previous.set(key, kv.get(key));
    for (const [key, value] of writes) { kv.set(key, value); imported++; }
  } catch {
    let restored = true;
    for (const [key, value] of previous) try { if (value === null) kv.remove(key); else kv.set(key, value); } catch { restored = false; }
    return { ok: false, message: restored ? '写入失败，已恢复导入前的进度' : '写入及恢复失败，请保留备份文件并重试' };
  }
  return { ok: true, imported, skipped };
};

// ---------- 浏览器实现 ----------

export const localStorageKV = (): KV | null => {
  try { if (typeof localStorage === 'undefined') return null; } catch { return null; }
  return {
    get: (k) => localStorage.getItem(k),
    set: (k, v) => localStorage.setItem(k, v),
    remove: (k) => localStorage.removeItem(k),
    keys: () => Object.keys(localStorage),
  };
};

/** 测试与降级用：存储不可用时至少让本次会话能玩完，但不谎称已保存。 */
export const memoryKV = (initial: Record<string, string> = {}): KV => {
  const map = new Map(Object.entries(initial));
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
    keys: () => [...map.keys()],
  };
};

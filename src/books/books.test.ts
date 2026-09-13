import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { readDreamBook, sha256 } from './archive';
import { bookKV } from './storage';
import { GENERATION_DURATION_MS, snapshotJob, simulatedWeaver, type GenerationJob } from './generation';
import type { KV } from '../game/storage';
import { sourceSchema } from '../game/schema';

const archive = new Uint8Array(readFileSync('public/books/little-demon.dreambook'));
const files = unzipSync(archive);
const manifest = JSON.parse(new TextDecoder().decode(files['book.json']));
const pkg = JSON.parse(new TextDecoder().decode(files['story.json']));
const memory = (): KV => { const map = new Map<string, string>(); return { get: key => map.get(key) ?? null, set: (key, value) => { map.set(key, value); }, remove: key => { map.delete(key); }, keys: () => [...map.keys()] }; };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('入梦书 v1 的真实示例和不可信文件', () => {
  it('日常闲话随梦包携带，拒绝缺失人物、立绘和重复选项', async () => {
    const book = await readDreamBook(archive);
    expect(Object.keys(book.manifest.presentation.asides ?? {})).toEqual(['line-004', 'line-036']);
    for (const kind of ['character', 'portrait', 'duplicate', 'beat']) {
      const invalid = structuredClone(manifest);
      const aside = invalid.presentation.asides['line-004'];
      if (kind === 'character') aside.options[0].replies[0].speaker = 'missing-person';
      if (kind === 'portrait') aside.options[0].replies[0].portrait = 'BG_MISSING';
      if (kind === 'duplicate') aside.options[1].id = aside.options[0].id;
      if (kind === 'beat') invalid.presentation.asides['missing-beat'] = aside;
      await expect(readDreamBook(zipSync({ ...files, 'book.json': strToU8(JSON.stringify(invalid)) }))).rejects.toThrow();
    }
  });
  it('六种情绪演出跟随梦包，并拒绝无效选择引用', async () => {
    const book = await readDreamBook(archive);
    expect(new Set(Object.values(book.manifest.presentation.choiceMoods ?? {})).size).toBe(6);
    const invalid = structuredClone(manifest);
    invalid.presentation.choiceMoods = { 'missing-choice': 'hesitant' };
    await expect(readDreamBook(zipSync({ ...files, 'book.json': strToU8(JSON.stringify(invalid)) }))).rejects.toThrow('选择演出引用不存在的选项');
  });
  it('每拍立绘随梦包携带，主角的七种表情可用，旧 Demo 仍可读取', async () => {
    const book = await readDreamBook(archive);
    const performances = book.manifest.presentation.performances!;
    for (const beat of book.pkg.nodes.flatMap(node => node.beats)) {
      const asset = book.manifest.assets.find(asset => asset.id === performances[beat.id]?.portrait);
      expect(asset?.kind).toBe('image');
      expect(book.files[asset!.path]?.length).toBeGreaterThan(0);
    }
    expect(new Set(Object.values(performances).filter(item => item.portrait.includes('DEMON_BARE')).map(item => item.portrait)).size).toBe(7);
    const demo = await readDreamBook(new Uint8Array(readFileSync('public/books/little-demon-demo.dreambook')));
    expect(demo.pkg.title).toBe(book.pkg.title);
  });
  it('拒绝丢失的立绘和不存在的演出台词引用', async () => {
    const missing = structuredClone(manifest);
    missing.presentation.performances['line-002'].portrait = 'BG_MISSING_PORTRAIT';
    await expect(readDreamBook(zipSync({ ...files, 'book.json': strToU8(JSON.stringify(missing)) }))).rejects.toThrow('素材引用类别错误');
    const invalid = structuredClone(manifest);
    invalid.presentation.performances['missing-beat'] = invalid.presentation.performances['line-002'];
    await expect(readDreamBook(zipSync({ ...files, 'book.json': strToU8(JSON.stringify(invalid)) }))).rejects.toThrow('立绘演出引用不存在的拍');
  });
  it('作者主页与发布日期可省略；提供时拒绝危险链接、伪造知乎域名和无效日期', () => {
    const { authorUrl, publishedAt, ...legacy } = pkg.source;
    expect(sourceSchema.safeParse(legacy).success).toBe(true);
    const source = { ...legacy, authorUrl: 'https://www.zhihu.com/people/author', publishedAt: '2026-04-10' };
    expect(sourceSchema.safeParse(source).success).toBe(true);
    for (const invalid of ['javascript:alert(1)', 'http://www.zhihu.com/people/author', 'https://user:password@www.zhihu.com/people/author', 'https://www.zhihu.com.example.org/people/author']) {
      expect(sourceSchema.safeParse({ ...source, authorUrl: invalid }).success).toBe(false);
    }
    expect(sourceSchema.safeParse({ ...source, publishedAt: '2026-02-30' }).success).toBe(false);
  });
  it('支持创作者原创和外部节选来源，不允许脚本链接或内嵌凭证', () => {
    const original = { ...pkg.source, kind: 'original_work', workId: null, completeness: 'complete', sourceUrl: 'https://example.com/story', linkStatus: 'verified' };
    expect(sourceSchema.safeParse(original).success).toBe(true);
    expect(sourceSchema.safeParse({ ...original, sourceUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...original, sourceUrl: 'https://user:password@example.com/' }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...original, kind: 'external_excerpt', completeness: 'complete' }).success).toBe(false);
  });
  it('完整示例可回读，包含作者、两种结局、夜间声音与白昼粒子', async () => {
    const book = await readDreamBook(archive);
    expect(book.pkg.source.author).toBe('女巫'); expect(book.pkg.nodes.filter(n => n.kind === 'ending')).toHaveLength(2);
    expect(book.pkg.source.authorUrl).toBe('https://www.zhihu.com/people/cc09d82355e21162462ba02ac9717dba');
    expect(book.pkg.source.sourceUrl).toBe('https://www.zhihu.com/market/paid_column/2025960728138401447/section/2025954672918163637');
    expect(book.pkg.source.publishedAt).toBe('2026-04-10');
    expect(book.manifest.presentation.scenes.BG_SHRINE_N?.ambience).toBe('BGM_NIGHT_AMBIENCE');
    expect(book.manifest.presentation.scenes.BG_COTTAGE_D?.particles).toBe('leaves');
  });
  it('重新压缩不改变包内容身份', async () => {
    const one = await readDreamBook(archive), two = await readDreamBook(zipSync(files, { level: 1, mtime: new Date('2025-01-01') }));
    expect(one.fingerprint).toBe(two.fingerprint);
  });
  it('拒绝被篡改的剧情', async () => { await expect(readDreamBook(zipSync({ ...files, 'story.json': strToU8('{}') }))).rejects.toThrow('剧情哈希不一致'); });
  it('拒绝路径越界、脚本和未声明的资源', async () => {
    await expect(readDreamBook(zipSync({ ...files, '../outside.json': strToU8('{}') }))).rejects.toThrow('不安全路径');
    await expect(readDreamBook(zipSync({ ...files, 'payload.js': strToU8('alert(1)') }))).rejects.toThrow('不接受脚本');
    await expect(readDreamBook(zipSync({ ...files, 'extra.json': strToU8('{}') }))).rejects.toThrow('未在清单声明');
  });
  it('拒绝缺失素材和错误的文件类型', async () => {
    const asset = manifest.assets[0], missing = { ...files }; delete missing[asset.path];
    await expect(readDreamBook(zipSync(missing))).rejects.toThrow('素材缺失');
    const bad = strToU8('<svg onload="alert(1)"></svg>'), changed = structuredClone(manifest);
    changed.assets[0].bytes = bad.length; changed.assets[0].sha256 = await sha256(bad);
    await expect(readDreamBook(zipSync({ ...files, [asset.path]: bad, 'book.json': strToU8(JSON.stringify(changed)) }))).rejects.toThrow('素材类型与内容不符');
  });
  it('拒绝循环区间越界和无法到达的剧情', async () => {
    const badManifest = structuredClone(manifest); badManifest.assets.find((a: { loop?: unknown }) => a.loop).loop.endSeconds = 10000;
    await expect(readDreamBook(zipSync({ ...files, 'book.json': strToU8(JSON.stringify(badManifest)) }))).rejects.toThrow('循环区间无效');
    const badStory = structuredClone(pkg); badStory.nodes[0].next = 'missing-node';
    const raw = strToU8(JSON.stringify(badStory)); const updated = { ...manifest, storySha256: await sha256(raw) };
    await expect(readDreamBook(zipSync({ ...files, 'book.json': strToU8(JSON.stringify(updated)), 'story.json': raw }))).rejects.toThrow('剧情校验失败');
  });
});

describe('每本入梦书、每个版本独立保存', () => {
  it('不同版本不会覆盖，梦册仍共享', () => {
    const storage = memory(), first = bookKV(storage, pkg), second = bookKV(storage, { ...pkg, buildId: 'another-build' });
    const key = `rumengshu:save:${pkg.packageId}`; first.set(key, 'first'); second.set(key, 'second');
    expect(first.get(key)).toBe('first'); expect(second.get(key)).toBe('second');
    first.set('rumengshu:album', 'album'); expect(second.get('rumengshu:album')).toBe('album');
  });
  it('复制匹配的历史单篇书签，删除新书签后不反复复活', () => {
    const storage = memory(), key = `rumengshu:save:${pkg.packageId}`, original = JSON.stringify({ buildId: pkg.buildId }); storage.set(key, original);
    const scoped = bookKV(storage, pkg); expect(scoped.get(key)).toBe(original); expect(storage.get(key)).toBe(original);
    scoped.remove(key); expect(bookKV(storage, pkg).get(key)).toBeNull();
  });
  it('旧版本记录不会被用来恢复新版本', () => {
    const storage = memory(), key = `rumengshu:save:${pkg.packageId}`; storage.set(key, JSON.stringify({ buildId: 'old-build' }));
    expect(bookKV(storage, pkg).get(key)).toBeNull(); expect(storage.get(key)).not.toBeNull();
  });
  it('导出键只包含当前版本的进度及共享梦册', () => {
    const storage = memory(), first = bookKV(storage, pkg), second = bookKV(storage, { ...pkg, buildId: 'second-build' });
    first.set('rumengshu:save:first', '1'); second.set('rumengshu:save:second', '2');
    expect(first.keys()).toEqual(['rumengshu:save:first', 'rumengshu:album']);
  });
});

describe('可恢复的异步生成模拟', () => {
  const job: GenerationJob = { id: 'test-job', mode: 'simulation', startedAt: 10000, durationMs: GENERATION_DURATION_MS, status: 'running', input: { title: '测试书', text: '一个故事', url: '', attachments: [] } };
  it('持续 1–2 分钟，经过六阶段后完成，重开窗口按时间继续', () => {
    expect(GENERATION_DURATION_MS).toBeGreaterThanOrEqual(60000); expect(GENERATION_DURATION_MS).toBeLessThanOrEqual(120000);
    expect(snapshotJob(job, 10000).progress).toBe(0); expect(snapshotJob(job, 60000).stage).toBe(3);
    expect(snapshotJob(job, 106000).ready).toBe(true); expect(snapshotJob(job, 200000).progress).toBe(1);
  });
  it('取消任务不会提供已完成状态', () => { expect(snapshotJob({ ...job, status: 'cancelled' }, 200000).ready).toBe(false); });
  it('完成产物明确标记模拟，保留原作者，且不调用网络', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); vi.useFakeTimers(); vi.setSystemTime(200000);
    const book = await simulatedWeaver.result(job, await readDreamBook(archive));
    expect(book.pkg.packageId).not.toBe(pkg.packageId); expect(book.manifest.simulation).toBe(true); expect(book.pkg.source.author).toBe('女巫'); expect(fetch).not.toHaveBeenCalled();
  });
  it('输入和任务保存在本地，刷新可恢复；不完整任务不导出', async () => {
    const storage = memory(); vi.stubGlobal('localStorage', { getItem: storage.get, setItem: storage.set });
    const started = await simulatedWeaver.start(job.input); expect(simulatedWeaver.restore()?.id).toBe(started.id);
    await expect(simulatedWeaver.result(started, await readDreamBook(archive))).rejects.toThrow('尚未完成');
    await simulatedWeaver.cancel(started); expect(simulatedWeaver.restore()?.status).toBe('cancelled');
  });
});

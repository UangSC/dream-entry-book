import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { packDreamBook, readDreamBook, sha256 } from '../src/books/archive';
import type { BookManifest, BookAsset } from '../src/books/schema';
import { createPerformances } from './story-performances';
import { finalPresentation } from './final-presentation';
import { createAtmosphereCues } from './story-weather';

// 可重复生成的轻声环境层：蟋蟀短鸣、低频蛙声，首尾留白，避免循环接缝。
const rate = 22050, seconds = 20, pcm = new Float32Array(rate * seconds);
let seed = 3107;
const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
const tone = (start: number, duration: number, frequency: number, gain: number, frog = false) => {
  for (let index = 0; index < duration * rate; index++) {
    const t = index / rate, p = t / duration, target = Math.floor(start * rate) + index;
    if (target >= pcm.length) break;
    const envelope = Math.sin(Math.PI * p) ** 2;
    const modulation = frog ? (0.55 + 0.45 * Math.sin(2 * Math.PI * 22 * t)) : 1;
    const wave = Math.sin(2 * Math.PI * frequency * t + (frog ? 3 : .2) * Math.sin(2 * Math.PI * 7 * t));
    pcm[target]! += envelope * modulation * wave * gain;
  }
};
for (let start = .8; start < 18; start += 1.05 + random() * .9) for (let chirp = 0; chirp < 4; chirp++) tone(start + chirp * .12, .07, 3200 + random() * 700, .07 + random() * .025);
for (const start of [3.8, 9.6, 15.1]) { tone(start, .42, 330, .09, true); tone(start + .72, .34, 295, .055, true); }
const wav = Buffer.alloc(44 + pcm.length * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(pcm.length * 2, 40);
pcm.forEach((sample, i) => wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + i * 2));
writeFileSync('public/audio/ambience-night.wav', wav);
const audio = JSON.parse(readFileSync('public/audio/manifest.json', 'utf8'));
audio.assets = audio.assets.filter((a: { id: string }) => a.id !== 'BGM_NIGHT_AMBIENCE');
audio.assets.push({ id: 'BGM_NIGHT_AMBIENCE', kind: 'music', file: 'ambience-night.wav', bytes: wav.length, sha256: await sha256(wav), durationSeconds: seconds, loop: { mode: 'fadeLoop', startSeconds: 0, endSeconds: seconds, overlapMs: 600, verified: false }, source: { type: 'procedural', name: '本地合成蟋蟀与蛙声', author: '入梦书制作组' }, rights: { status: 'approved', reference: '项目本地合成，无外部采样' }, modifications: ['PCM16 单声道 22050Hz；轻声混音；首尾留白'] });
writeFileSync('public/audio/manifest.json', JSON.stringify(audio, null, 2) + '\n');
const art = JSON.parse(readFileSync('public/art/manifest.json', 'utf8'));
const pkg = JSON.parse(readFileSync('public/dreams/little-demon.json', 'utf8'));
const files: Record<string, Uint8Array> = {}, assets: BookAsset[] = [];
for (const [folder, source] of [['art', art], ['audio', audio]] as const) for (const a of source.assets) {
  const path = `${folder}/${a.file}`, bytes = readFileSync(`public/${path}`); files[path] = bytes;
  assets.push({ id: a.id, kind: folder === 'art' ? 'image' : a.kind, path, mime: folder === 'art' ? 'image/webp' : a.file.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg', bytes: bytes.length, sha256: await sha256(bytes), ...(folder === 'art' ? { luminance: a.luminance } : { durationSeconds: a.durationSeconds, ...(a.kind === 'music' && a.loop ? { loop: a.loop } : {}), ...(a.vocal ? { vocal: a.vocal } : {}) }), credit: a.source?.name ?? '用户提供素材', rights: `${a.rights?.status ?? 'pending'} · ${a.rights?.reference ?? '使用依据待核对'}` });
}
const manifest: BookManifest = {
  format: 'rumengshu.dreambook', formatVersion: 1, story: 'story.json', storySha256: await sha256(new TextEncoder().encode(JSON.stringify(pkg, null, 2))),
  creator: '入梦书制作组', description: '第一本入梦书：女巫《吃人心的小妖怪》，取材于知乎节选；含完整分支剧情、背景、音乐与音效。', simulation: false,
  presentation: {
    ...finalPresentation,
    performances: createPerformances(pkg),
    atmosphereCues: createAtmosphereCues(pkg),
  }, assets,
};
const archive = packDreamBook(manifest, pkg, files);
await readDreamBook(archive);
mkdirSync('public/books', { recursive: true });
writeFileSync('public/books/little-demon.dreambook.tmp', archive);
renameSync('public/books/little-demon.dreambook.tmp', 'public/books/little-demon.dreambook');
writeFileSync('public/books/example-manifest.json.tmp', JSON.stringify(manifest, null, 2));
renameSync('public/books/example-manifest.json.tmp', 'public/books/example-manifest.json');
console.log(`首本入梦书已打包并回读验证：${assets.length} 个素材，${(archive.length / 1024 / 1024).toFixed(1)} MiB。`);

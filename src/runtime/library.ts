import type { DreamPackage } from '../game/schema';
import type { AudioManifest } from './audio';
import type { BeatMap } from './pulse';
import type { Presentation } from '../books/schema';
import { readDreamBook, type LoadedBook } from '../books/archive';

export const base = import.meta.env.BASE_URL;
export interface ArtAsset { id: string; file: string; src: string; luminance?: number }
export interface GameData { pkg: DreamPackage; art: Record<string, ArtAsset>; audio: AudioManifest; audioUrls: Record<string, string>; beats: BeatMap | null; notices: string[]; presentation: Presentation; book: LoadedBook; release: () => void }

export function mountBook(book: LoadedBook, shell?: GameData): GameData {
  const art = { ...shell?.art }, audioUrls = { ...shell?.audioUrls };
  const audioAssets = new Map(shell?.audio.assets.map(a => [a.id, a]) ?? []);
  const urls: string[] = [];
  for (const asset of book.manifest.assets) {
    const src = URL.createObjectURL(new Blob([book.files[asset.path]!.slice().buffer as ArrayBuffer], { type: asset.mime })); urls.push(src);
    if (asset.kind === 'image') art[asset.id] = { id: asset.id, file: asset.path, src, luminance: asset.luminance };
    else { audioUrls[asset.id] = src; audioAssets.set(asset.id, { id: asset.id, file: asset.path, kind: asset.kind, durationSeconds: asset.durationSeconds!, ...(asset.loop ? { loop: asset.loop } : {}), ...(asset.vocal ? { vocal: asset.vocal } : {}) }); }
  }
  if (shell) { art.BG_GATE = shell.art.BG_GATE!; audioUrls.BGM_GATE = shell.audioUrls.BGM_GATE!; const gate = shell.audio.assets.find(a => a.id === 'BGM_GATE'); if (gate) audioAssets.set(gate.id, gate); }
  return { pkg: book.pkg, art, audioUrls, audio: { manifestVersion: 1, status: 'draft', assets: [...audioAssets.values()] }, beats: shell?.beats ?? null, notices: [], presentation: book.manifest.presentation, book, release: () => urls.forEach(url => URL.revokeObjectURL(url)) };
}

export async function loadLibrary(): Promise<GameData> {
  const response = await fetch(base + 'books/little-demon.dreambook', { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('入梦书暂时没有载入，请检查网络或完成一次在线缓存');
  const data = mountBook(await readDreamBook(new Uint8Array(await response.arrayBuffer())));
  try {
    const response = await fetch(base + 'audio/bgm-gate.beats.json', { signal: AbortSignal.timeout(8000) });
    const b = await response.json();
    if (b?.bpm > 20 && b.bpm < 240 && Array.isArray(b.beats) && b.beats.length < 5000 &&
        b.beats.every((n: unknown, i: number) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && (i === 0 || n > b.beats[i - 1])) &&
        Array.isArray(b.downbeats) && b.downbeats.every((n: unknown) => b.beats.includes(n))) data.beats = b;
  } catch { /* 梦斋律动退回自由呼吸 */ }
  return data;
}

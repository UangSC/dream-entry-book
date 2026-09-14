import { z } from 'zod';

export const BOOK_LIMITS = { archive: 80 * 1024 * 1024, unpacked: 120 * 1024 * 1024, file: 24 * 1024 * 1024, json: 1024 * 1024, files: 180 };
const assetId = z.string().regex(/^(BG|BGM|SFX)_[A-Z0-9_]+$/);
const choiceMood = z.enum(['warm', 'resolute', 'hesitant', 'guarded', 'bashful', 'breezy']);
const particleKind = z.enum(['fireflies', 'leaves', 'rain', 'none']);
export const safePath = (path: string) => path.length < 180 && /^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/.test(path) && !path.split('/').some(p => !p || p === '.' || p === '..');
const path = z.string().refine(safePath, '素材路径必须是包内相对路径');
const loop = z.object({ mode: z.enum(['fadeLoop', 'seamless', 'once']), startSeconds: z.number().min(0), endSeconds: z.number().positive(), overlapMs: z.number().min(0).max(8000), verified: z.boolean().optional() }).strict();
const vocal = z.object({ minPlaySeconds: z.number().min(90).max(600), gapSeconds: z.number().min(2).max(30), successor: assetId.refine(id => id.startsWith('BGM_')) }).strict();
export const bookAssetSchema = z.object({
  id: assetId, kind: z.enum(['image', 'music', 'sfx']), path,
  mime: z.enum(['image/webp', 'image/png', 'image/jpeg', 'audio/mpeg', 'audio/wav', 'audio/ogg']),
  bytes: z.number().int().positive().max(BOOK_LIMITS.file), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  luminance: z.number().min(0).max(1).optional(), durationSeconds: z.number().positive().max(600).optional(), loop: loop.optional(),
  vocal: vocal.optional(),
  credit: z.string().max(600), rights: z.string().max(800),
}).strict().superRefine((asset, context) => {
  if (!asset.id.startsWith(asset.kind === 'image' ? 'BG_' : asset.kind === 'music' ? 'BGM_' : 'SFX_')) context.addIssue({ code: z.ZodIssueCode.custom, message: '素材 ID 前缀与类别不一致' });
  if (asset.vocal && (asset.kind !== 'music' || asset.loop?.mode !== 'once' || asset.loop.startSeconds !== 0)) context.addIssue({ code: z.ZodIssueCode.custom, message: '人声音乐必须从头完整播放一次' });
});
export const presentationSchema = z.object({
  cover: assetId, subtitle: z.string().max(100), description: z.string().max(800),
  tags: z.array(z.string().max(24)).max(5), contentNote: z.string().max(400),
  usageNotice: z.string().min(1).max(400).optional(),
  chapters: z.record(z.string().max(80), z.string().max(80)),
  choiceMoods: z.record(z.string().max(80), choiceMood).optional(),
  asides: z.record(z.string().max(80), z.object({ options: z.array(z.object({
    id: z.string().min(1).max(80), text: z.string().min(1).max(100), mood: choiceMood,
    replies: z.array(z.object({ speaker: z.string().max(80), text: z.string().min(1).max(240), portrait: assetId.optional() }).strict()).min(1).max(4),
  }).strict()).min(2).max(3) }).strict()).optional(),
  performances: z.record(z.string().max(80), z.object({ portrait: assetId.optional(), label: z.string().max(80) }).strict()).optional(),
  atmosphereCues: z.record(z.string().max(80), particleKind).optional(),
  scenes: z.record(assetId, z.object({ label: z.string().max(60), time: z.enum(['day', 'night', 'dawn', 'indoor']), particles: particleKind, ambience: assetId.optional() }).strict()),
  dreamMusic: assetId.optional(), endingMusic: assetId.optional(), endingScene: assetId.optional(),
}).strict();
export const bookManifestSchema = z.object({
  format: z.literal('rumengshu.dreambook'), formatVersion: z.literal(1), story: z.literal('story.json'),
  storySha256: z.string().regex(/^[a-f0-9]{64}$/), creator: z.string().min(1).max(100),
  description: z.string().max(800), simulation: z.boolean().default(false),
  presentation: presentationSchema, assets: z.array(bookAssetSchema).min(1).max(160),
}).strict();
export type BookManifest = z.infer<typeof bookManifestSchema>;
export type BookAsset = z.infer<typeof bookAssetSchema>;
export type Presentation = z.infer<typeof presentationSchema>;
export type ParticleKind = z.infer<typeof particleKind>;

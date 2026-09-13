import { z } from 'zod';
import { packDreamBook, readDreamBook, sha256, type LoadedBook } from './archive';

export const GENERATION_DURATION_MS = 96000;
export const GENERATION_STAGES = [
  { until: .14, name: '解析故事与图片', agent: '故事解析 Agent', detail: '梳理人物、时代与已知事件' },
  { until: .34, name: '分析分支，扩展剧情', agent: '叙事设计 Agent', detail: '安排关键选择、条件回响与不同结局' },
  { until: .49, name: '归纳场景与分镜', agent: '场景规划 Agent', detail: '提取地点、昼夜与情绪，整理背景清单' },
  { until: .73, name: '生成背景图片', agent: '图像生成 Agent', detail: '保持角色世界观与场景风格一致' },
  { until: .89, name: '编排音乐与音效', agent: '声音设计 Agent', detail: '匹配剧情情绪与环境层，整理循环区间' },
  { until: 1, name: '校验分支，打包入梦书', agent: '打包验证 Agent', detail: '检查路线与素材引用，准备可导入文件' },
] as const;
export const generationInputSchema = z.object({
  title: z.string().trim().min(1, '请给这本入梦书起个名字').max(60),
  text: z.string().max(20000), url: z.string().max(2000).refine(value => !value || /^https?:\/\//.test(value), '请填写 http 或 https 链接'),
  attachments: z.array(z.object({ name: z.string().max(200), type: z.string().max(80), size: z.number().min(0).max(20 * 1024 * 1024) }).strict()).max(8),
}).strict().refine(input => !!input.text.trim() || !!input.url || input.attachments.length > 0, '请填写剧情、URL，或选择故事图片/文档');
export type GenerationInput = z.infer<typeof generationInputSchema>;
const jobSchema = z.object({ id: z.string().regex(/^[a-z0-9-]+$/).max(50), mode: z.literal('simulation'), startedAt: z.number().finite(), durationMs: z.literal(GENERATION_DURATION_MS), status: z.enum(['running', 'cancelled']), input: generationInputSchema }).strict();
export type GenerationJob = z.infer<typeof jobSchema>;
export function snapshotJob(job: GenerationJob, at: number) {
  const progress = Math.max(0, Math.min(1, (at - job.startedAt) / job.durationMs));
  return { progress, remainingSeconds: Math.max(0, Math.ceil((job.durationMs - (at - job.startedAt)) / 1000)), stage: Math.min(GENERATION_STAGES.length - 1, GENERATION_STAGES.findIndex(stage => progress < stage.until) < 0 ? GENERATION_STAGES.length - 1 : GENERATION_STAGES.findIndex(stage => progress < stage.until)), ready: progress === 1 && job.status === 'running' };
}
/** 后续服务端适配器实现同一接口，负责上传、鉴权、任务轮询和真实产物。客户端不持有模型密钥。 */
export interface DreamWeaverAdapter {
  start(input: GenerationInput): Promise<GenerationJob>;
  restore(): GenerationJob | null;
  cancel(job: GenerationJob): Promise<void>;
  result(job: GenerationJob, template: LoadedBook): Promise<LoadedBook>;
}
const JOB_KEY = 'rumengshu:generation-job:v1';
export const simulatedWeaver: DreamWeaverAdapter = {
  async start(input) { const job: GenerationJob = { id: crypto.randomUUID(), mode: 'simulation', startedAt: Date.now(), durationMs: GENERATION_DURATION_MS, status: 'running', input: generationInputSchema.parse(input) }; localStorage.setItem(JOB_KEY, JSON.stringify(job)); return job; },
  restore() { try { const parsed = jobSchema.safeParse(JSON.parse(localStorage.getItem(JOB_KEY) ?? 'null')); return parsed.success ? parsed.data : null; } catch { return null; } },
  async cancel(job) { localStorage.setItem(JOB_KEY, JSON.stringify({ ...job, status: 'cancelled' })); },
  async result(job, template) {
    if (!snapshotJob(job, Date.now()).ready) throw new Error('模拟任务尚未完成');
    const pkg = structuredClone(template.pkg);
    pkg.packageId = `weave-demo-${job.id}`; pkg.buildId = `weave-demo-${job.id}-v1`;
    pkg.title = `${job.input.title} · 流程演示`;
    pkg.review = { status: 'draft', reviewedBuildId: null, reviewedAt: null, reviewer: null };
    const manifest = structuredClone(template.manifest); manifest.simulation = true;
    manifest.storySha256 = await sha256(new TextEncoder().encode(JSON.stringify(pkg, null, 2)));
    manifest.description = '生成流程演示产物。沿用女巫《吃人心的小妖怪》的既有剧情与素材；没有解析用户输入，也未调用大模型。';
    manifest.presentation.description = manifest.description;
    manifest.presentation.tags = ['流程演示', '示例素材'];
    const files = Object.fromEntries(manifest.assets.map(asset => [asset.path, template.files[asset.path]!]));
    return readDreamBook(packDreamBook(manifest, pkg, files));
  },
};

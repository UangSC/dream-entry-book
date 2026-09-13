import { z } from 'zod';

/** 内容 ID 与资产 ID 规则不同，不可混用。 */
export const CONTENT_ID = /^[a-z][a-z0-9-]{0,63}$/;
export const ASSET_ID = /^(BG|BGM|SFX|MASCOT)_[A-Z0-9_]+$/;

const contentId = z.string().regex(CONTENT_ID, '内容 ID 需匹配 ^[a-z][a-z0-9-]{0,63}$');
const assetId = z.string().regex(ASSET_ID, '资产 ID 需匹配 ^(BG|BGM|SFX|MASCOT)_[A-Z0-9_]+$');

/** 长度按 Unicode 码点计。UTF-16 length 会把 emoji 与部分汉字算成 2。 */
export const codePoints = (s: string): number => [...s].length;

const cpMax = (n: number, label: string) =>
  z.string().refine((s) => codePoints(s) <= n, {
    message: `${label} 不得超过 ${n} 个码点`,
  });

const safeInt = z
  .number()
  .int()
  .refine((n) => Number.isSafeInteger(n), { message: '必须是安全整数' });

const positiveSafeInt = z
  .number()
  .int()
  .positive()
  .refine((n) => Number.isSafeInteger(n), { message: '必须是安全正整数' });

// ---------- 上限（来自 DREAM_PACKAGE_SPEC.md） ----------

export const LIMITS = {
  maxBytes: 1024 * 1024,
  maxNodes: 32,
  maxBeatsPerNode: 20,
  maxFlags: 32,
  maxCharacters: 6,
  maxResources: 2,
  maxRelationships: 1,
  maxStateCombos: 10_000,
  /** 演出配额 */
  maxTimedEffects: 6,
  maxSplitEffects: 3,
  maxEnterKinds: 4,
  maxExitKinds: 2,
  minGapBetweenEffects: 4,
} as const;

/** 正式长篇保持同一状态模型，仅扩展容量；旧包仍执行原配额。 */
export const LONGFORM_LIMITS = { ...LIMITS, maxNodes: 96, maxBeatsPerNode: 160,
  maxTimedEffects: 64, maxSplitEffects: 32, maxEnterKinds: 8, maxExitKinds: 4,
  minGapBetweenEffects: 1 } as const;

// ---------- 条件 ----------

const flagPredicate = z
  .object({ kind: z.literal('flag'), id: contentId, equals: z.boolean() })
  .strict();

const numericPredicate = z
  .object({
    kind: z.enum(['resource', 'relationship']),
    id: contentId,
    op: z.enum(['eq', 'gte', 'lte']),
    value: safeInt,
  })
  .strict();

export const predicateSchema = z.discriminatedUnion('kind', [flagPredicate, numericPredicate]);

/** 首版只有 all，没有 OR；需要择一时增加分支节点。 */
export const conditionSchema = z
  .object({ all: z.array(predicateSchema).min(1).max(8) })
  .strict();

// ---------- 演出 ----------

const animEnum = z.enum(['fade', 'typewriter', 'emphasis', 'none']);
export const ANIMS = animEnum.options;

const timedEffectType = z.enum([
  'emerge',
  'focusIn',
  'inkBloom',
  'particleGather',
  'liquid',
  'dreamRipple',
  'pageTurn',
  'scramble',
  'shatter',
  'dissolve',
  'particleScatter',
  'inkFade',
]);

export const TIMED_EFFECTS = timedEffectType.options;
export const ENTER_EFFECTS = [
  'emerge',
  'focusIn',
  'inkBloom',
  'particleGather',
  'liquid',
  'dreamRipple',
  'pageTurn',
  'scramble',
] as const;
export const EXIT_EFFECTS = ['shatter', 'dissolve', 'particleScatter', 'inkFade'] as const;
/** 持续类只用于标题/终幕名/梦签短句，不作为拍上的 effect。 */
export const AMBIENT_EFFECTS = ['float', 'breathe'] as const;
/** 拆字类配额更紧。 */
export const SPLIT_EFFECTS = ['shatter', 'scramble', 'inkBloom'] as const;

export const EFFECT_BUDGETS: Record<(typeof TIMED_EFFECTS)[number], readonly [number, number]> = {
  emerge: [400, 700],
  focusIn: [500, 800],
  inkBloom: [600, 1000],
  particleGather: [700, 1100],
  liquid: [600, 900],
  dreamRipple: [700, 1000],
  pageTurn: [500, 800],
  scramble: [600, 900],
  shatter: [500, 800],
  dissolve: [600, 1000],
  particleScatter: [700, 1100],
  inkFade: [600, 1000],
};

export const effectSchema = z
  .object({
    type: timedEffectType,
    durationMs: positiveSafeInt.optional(),
    intensity: z.enum(['soft', 'normal']).optional(),
  })
  .strict()
  .superRefine((eff, ctx) => {
    if (eff.durationMs === undefined) return;
    const [lo, hi] = EFFECT_BUDGETS[eff.type];
    if (eff.durationMs < lo || eff.durationMs > hi) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${eff.type} 的 durationMs 应在 ${lo}–${hi}ms，实际 ${eff.durationMs}`,
      });
    }
  });

export const musicCueSchema = z
  .object({ action: z.enum(['play', 'silence', 'resume']), track: assetId.optional() })
  .strict()
  .superRefine((cue, ctx) => {
    if (cue.action === 'play' && cue.track === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'musicCue.action=play 必须给 track' });
    }
    if (cue.action !== 'play' && cue.track !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `musicCue.action=${cue.action} 不应带 track`,
      });
    }
  });

// ---------- 拍 ----------

export const beatSchema = z
  .object({
    id: contentId,
    kind: z.enum(['narration', 'dialogue', 'thought']),
    speaker: z.string().min(1),
    text: cpMax(240, '拍的 text'),
    anim: animEnum.optional(),
    effect: effectSchema.optional(),
    sfx: assetId.optional(),
    sceneShift: assetId.optional(),
    musicCue: musicCueSchema.optional(),
    when: conditionSchema.optional(),
  })
  .strict()
  .superRefine((beat, ctx) => {
    if (beat.anim !== undefined && beat.effect !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `拍 ${beat.id}：anim 与 effect 互斥，同时出现即失败`,
      });
    }
    if (beat.kind === 'narration') {
      if (beat.speaker !== 'narrator') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `拍 ${beat.id}：narration 的 speaker 必须为 narrator`,
        });
      }
    } else if (beat.speaker === 'narrator') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `拍 ${beat.id}：${beat.kind} 不能用保留 speaker narrator`,
      });
    } else if (!CONTENT_ID.test(beat.speaker)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `拍 ${beat.id}：speaker 需是角色 ID`,
      });
    }
    if (beat.sceneShift !== undefined && !beat.sceneShift.startsWith('BG_')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `拍 ${beat.id}：sceneShift 必须是 BG_ 资产`,
      });
    }
    if (beat.sfx !== undefined && !beat.sfx.startsWith('SFX_')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `拍 ${beat.id}：sfx 必须是 SFX_ 资产` });
    }
    if (beat.musicCue?.track !== undefined && !beat.musicCue.track.startsWith('BGM_')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `拍 ${beat.id}：musicCue.track 必须是 BGM_ 资产`,
      });
    }
  });

// ---------- 选项 ----------

export const effectsSchema = z
  .object({
    resourceDeltas: z.record(contentId, safeInt),
    relationshipDeltas: z.record(contentId, safeInt),
    /** 首版标记只允许 false -> true。 */
    setFlags: z.array(contentId),
  })
  .strict();

export const choiceSchema = z
  .object({
    id: contentId,
    text: cpMax(60, '选项 text'),
    target: contentId,
    effects: effectsSchema,
    when: conditionSchema.optional(),
  })
  .strict();

// ---------- 节点 ----------

const nodeBase = {
  id: contentId,
  origin: z.enum(['adapted', 'original']),
  sourceRefs: z.array(z.string().min(1)),
  scene: assetId.refine((s) => s.startsWith('BG_'), 'scene 必须是 BG_ 资产'),
  beats: z.array(beatSchema).min(1).max(LONGFORM_LIMITS.maxBeatsPerNode),
};

export const sceneNodeSchema = z
  .object({
    ...nodeBase,
    kind: z.literal('scene'),
    next: contentId.optional(),
    choices: z.array(choiceSchema).min(2).max(3).optional(),
  })
  .strict();

/** 回响与人物去向：制作者审读的条件条目，梦醒时不重新生成。 */
export const reflectionSchema = z
  .object({ text: cpMax(160, '回响 text'), when: conditionSchema.optional() })
  .strict();

export const outcomeSchema = z
  .object({
    characterId: contentId,
    text: cpMax(160, '去向 text'),
    when: conditionSchema.optional(),
  })
  .strict();

export const endingNodeSchema = z
  .object({
    ...nodeBase,
    kind: z.literal('ending'),
    ending: z
      .object({
        id: contentId,
        title: cpMax(40, '终幕 title'),
        summary: cpMax(160, '终幕 summary'),
        reflections: z.array(reflectionSchema).max(4).optional(),
        outcomes: z.array(outcomeSchema).max(6).optional(),
      })
      .strict(),
  })
  .strict();

/**
 * XOR 检查放在联合层：superRefine 会把对象变成 ZodEffects，
 * discriminatedUnion 只接受 ZodObject，所以不能挂在分支上。
 */
export const nodeSchema = z
  .discriminatedUnion('kind', [sceneNodeSchema, endingNodeSchema])
  .superRefine((node, ctx) => {
    if (node.kind !== 'scene') return;
    if ((node.next !== undefined) === (node.choices !== undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `节点 ${node.id}：scene 必须恰好二选一 next 或 choices`,
      });
    }
  });

// ---------- 来源与审读 ----------

/** 受控知乎主机白名单。拒绝脚本协议与近似域名，宁缺勿滥。 */
export const ZHIHU_HOSTS = ['www.zhihu.com', 'zhuanlan.zhihu.com'] as const;

const PARAGRAPH_ID = /^p-\d{4}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

/** 只接受 HTTPS 且主机在白名单内的精确匹配；子域后缀匹配会被近似域名绕过。 */
export const isAllowedSourceUrl = (raw: string): boolean => {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  return (ZHIHU_HOSTS as readonly string[]).includes(u.hostname);
};

export const sourceSchema = z
  .object({
    kind: z.enum(['hackathon_excerpt', 'original_demo', 'original_work', 'external_excerpt']),
    title: z.string().min(1),
    /** 未知作者用 null，UI 显示“作者信息待核对”；不得填占位字符串。 */
    author: z.string().min(1).nullable(),
    /** 可选来源元数据；省略时兼容已有入梦书。 */
    authorUrl: z.string().max(2048).optional(),
    publishedAt: z.string().date('发布日期需为 YYYY-MM-DD 的有效日期').optional(),
    workId: z.string().min(1).nullable(),
    completeness: z.enum(['excerpt', 'complete']),
    trailingFragment: z.boolean(),
    sourceHash: z.string().regex(SHA256_HEX, 'sourceHash 必须是小写 64 位十六进制 SHA-256'),
    paragraphIds: z.array(z.string().regex(PARAGRAPH_ID, '段落编号形如 p-0001')),
    sourceUrl: z.string().nullable(),
    linkStatus: z.enum(['verified', 'missing']),
    rightsRef: z.string().min(1),
  })
  .strict()
  .superRefine((src, ctx) => {
    const fail = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });

    if (src.kind === 'hackathon_excerpt') {
      if (src.workId === null) fail('hackathon_excerpt 要求 workId 非空');
      // 比赛内容一律按有限节选处理，末尾有句号也不能判定完整
      if (src.completeness !== 'excerpt') fail('hackathon_excerpt 的 completeness 必须为 excerpt');
    } else if ((src.kind === 'original_demo' || src.kind === 'original_work') && src.workId !== null) {
      fail('原创作品的 workId 必须为 null');
    }
    if (src.kind === 'external_excerpt' && src.completeness !== 'excerpt') fail('external_excerpt 必须明确标注为节选');

    if (src.authorUrl !== undefined) {
      try {
        const url = new URL(src.authorUrl);
        if (url.protocol !== 'https:' || url.username || url.password) fail('作者主页必须是无内嵌凭证的 HTTPS 地址');
        if (src.kind === 'hackathon_excerpt' && !isAllowedSourceUrl(src.authorUrl)) fail('知乎来源的作者主页必须位于受控知乎主机内');
      } catch { fail('作者主页链接格式无效'); }
    }

    if (src.linkStatus === 'verified') {
      if (src.sourceUrl === null) {
        fail('linkStatus=verified 要求 sourceUrl 非空');
      } else if (src.kind === 'original_work' || src.kind === 'external_excerpt') {
        try { const url = new URL(src.sourceUrl); if (url.protocol !== 'https:' || url.username || url.password || src.sourceUrl.length > 2048) fail('来源链接必须是无内嵌凭证的 HTTPS 地址'); } catch { fail('来源链接格式无效'); }
      } else if (!isAllowedSourceUrl(src.sourceUrl)) {
        fail('sourceUrl 必须是 HTTPS 且主机在受控知乎白名单内');
      }
    } else if (src.sourceUrl !== null) {
      fail('linkStatus=missing 要求 sourceUrl 为 null');
    }
  });

export const reviewSchema = z
  .object({
    status: z.enum(['draft', 'approved']),
    reviewedBuildId: contentId.nullable(),
    reviewedAt: z.string().datetime({ offset: true }).nullable(),
    reviewer: z.string().min(1).nullable(),
  })
  .strict();

// ---------- 顶层 ----------

const rangedValue = z
  .object({
    id: contentId,
    label: cpMax(20, 'label'),
    min: safeInt,
    max: safeInt,
    initial: safeInt,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.min > v.max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${v.id}：min 不得大于 max` });
    } else if (v.initial < v.min || v.initial > v.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${v.id}：initial 必须落在 ${v.min}..${v.max}`,
      });
    }
  });

const relationshipValue = z
  .object({
    id: contentId,
    characterId: contentId,
    label: cpMax(20, 'label'),
    min: safeInt,
    max: safeInt,
    initial: safeInt,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.min > v.max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${v.id}：min 不得大于 max` });
    } else if (v.initial < v.min || v.initial > v.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${v.id}：initial 必须落在 ${v.min}..${v.max}`,
      });
    }
  });

export const dreamPackageSchema = z
  .object({
    schemaVersion: z.literal(1),
    edition: z.literal('longform').optional(),
    packageId: contentId,
    buildId: contentId,
    title: z.string().min(1, 'title 不能为空').and(cpMax(80, 'title')),
    source: sourceSchema,
    review: reviewSchema,
    theme: z.enum(['calm', 'warm', 'mystery']),
    characters: z
      .array(
        z
          .object({ id: contentId, name: cpMax(20, '人物 name'), bio: cpMax(120, 'bio').optional() })
          .strict(),
      )
      .max(LIMITS.maxCharacters),
    resources: z.array(rangedValue).max(LIMITS.maxResources),
    relationships: z.array(relationshipValue).max(LIMITS.maxRelationships),
    flags: z
      .array(
        z
          .object({
            id: contentId,
            label: cpMax(30, 'flag label'),
            kind: z.enum(['knowledge', 'commitment']),
          })
          .strict(),
      )
      .max(LIMITS.maxFlags),
    entryNodeId: contentId,
    nodes: z.array(nodeSchema).min(1).max(LONGFORM_LIMITS.maxNodes),
  })
  .strict()
  .superRefine((pkg, ctx) => {
    if (pkg.edition === 'longform') return;
    if (pkg.nodes.length > LIMITS.maxNodes) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes'], message: '普通梦包节点超过上限' });
    pkg.nodes.forEach((node, index) => {
      if (node.beats.length > LIMITS.maxBeatsPerNode) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['nodes', index, 'beats'], message: '普通梦包拍数超过上限' });
    });
  });

export type DreamPackage = z.infer<typeof dreamPackageSchema>;
export type DreamNode = z.infer<typeof nodeSchema>;
export type SceneNode = z.infer<typeof sceneNodeSchema>;
export type EndingNode = z.infer<typeof endingNodeSchema>;
export type Beat = z.infer<typeof beatSchema>;
export type Choice = z.infer<typeof choiceSchema>;
export type Condition = z.infer<typeof conditionSchema>;
export type Predicate = z.infer<typeof predicateSchema>;
export type ChoiceEffects = z.infer<typeof effectsSchema>;
export type MusicCue = z.infer<typeof musicCueSchema>;
export type Anim = (typeof ANIMS)[number];
export type TimedEffect = (typeof TIMED_EFFECTS)[number];

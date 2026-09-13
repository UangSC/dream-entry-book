/**
 * 场景转场。
 *
 * 梦斋是奶油白与浅粉的亮调，梦内是雾蓝夜景。这两者之间硬切会炸眼，
 * 也会把"入梦"这件事变成一次页面刷新，沉浸感当场断掉。
 * 所以按两张图的实际亮度差决定转场手法：差得越多，转得越缓、越有过程。
 *
 * 四条约束：
 * 1. 明暗差大时走涟漪＋模糊，让画面"化开"再"聚拢"，不做瞬切。
 * 2. 转场可跳过。玩家连点时立刻落地，不强迫看完。
 * 3. `prefers-reduced-motion` 或玩家关掉动效时直接切换，不留半透明中间态。
 * 4. 本模块只算数值，不碰 DOM。渲染层拿 frame() 的结果去写 style，
 *    这样时序逻辑可以在 node 里测，不必起浏览器。
 */

export type TransitionMode = 'cut' | 'fade' | 'blurFade' | 'ripple';

export interface TransitionPlan {
  mode: TransitionMode;
  durationMs: number;
  outBlurPx: number;
  inBlurPx: number;
  /** 涟漪中心，归一坐标。默认略低于中线：视线通常落在纸卡上方一点。 */
  origin: { x: number; y: number };
  /** 选择理由，便于调试与文档核对，不参与渲染。 */
  reason: string;
}

export interface TransitionFrame {
  progress: number;
  outOpacity: number;
  inOpacity: number;
  outBlurPx: number;
  inBlurPx: number;
  /** 涟漪遮罩半径，按画面对角线归一。超过 1 才能盖满四角。 */
  rippleRadius: number;
  /** 遮罩边缘的柔化宽度，同样按对角线归一。 */
  rippleFeather: number;
  done: boolean;
}

export interface PlanOptions {
  reducedMotion?: boolean;
  /** 玩家在设置里关掉了转场动画。与 reducedMotion 并行，任一为真即直切。 */
  animationsOff?: boolean;
  origin?: { x: number; y: number };
}

/** 亮度差超过这个值就认为是"跨昼夜"，值域 0..1。 */
const BIG_DELTA = 0.26;

/**
 * 涟漪半径的峰值，以及"遮罩已全开"的哨兵值。
 * 哨兵必须不小于峰值：否则最后一帧半径会从 1.548 掉回 1.5，
 * 依赖该值驱动遮罩的渲染层会看到一次收缩抖动。
 */
const RIPPLE_PEAK = 1.55;
const MASK_OPEN = 1.6;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/**
 * 按亮度差挑手法。
 *
 * @param fromLuminance 0..1，当前画面的平均亮度
 * @param toLuminance   0..1，目标画面的平均亮度
 */
export const planTransition = (
  fromLuminance: number | null,
  toLuminance: number | null,
  options: PlanOptions = {},
): TransitionPlan => {
  const origin = options.origin ?? { x: 0.5, y: 0.42 };

  if (options.reducedMotion === true || options.animationsOff === true) {
    return {
      mode: 'cut',
      durationMs: 0,
      outBlurPx: 0,
      inBlurPx: 0,
      origin,
      reason: '玩家或系统要求减少动态效果，直接切换',
    };
  }

  // 亮度未知时不猜：走中等时长的淡入淡出，比错判方向要好
  if (fromLuminance === null || toLuminance === null) {
    return {
      mode: 'fade',
      durationMs: 1100,
      outBlurPx: 0,
      inBlurPx: 0,
      origin,
      reason: '亮度未测，用默认交叉淡入',
    };
  }

  const delta = toLuminance - fromLuminance;
  const mag = Math.abs(delta);

  if (mag < 0.08) {
    return {
      mode: 'fade',
      durationMs: 1000,
      outBlurPx: 0,
      inBlurPx: 0,
      origin,
      reason: `亮度接近（差 ${mag.toFixed(2)}），普通淡入即可`,
    };
  }

  if (mag < BIG_DELTA) {
    return {
      mode: 'blurFade',
      durationMs: 1400,
      outBlurPx: 6,
      inBlurPx: 8,
      origin,
      reason: `亮度中等差异（${mag.toFixed(2)}），淡入加轻模糊`,
    };
  }

  // 跨昼夜。变暗（入梦）比变亮（梦醒）再慢一档：
  // 瞳孔适应暗处本来就更慢，画面陪着慢下来才不刺眼。
  const goingDark = delta < 0;
  return {
    mode: 'ripple',
    durationMs: goingDark ? 1900 : 1700,
    outBlurPx: goingDark ? 14 : 10,
    inBlurPx: goingDark ? 18 : 12,
    origin,
    reason: goingDark
      ? `明转暗（差 ${mag.toFixed(2)}），涟漪化开后聚拢，最缓一档`
      : `暗转明（差 ${mag.toFixed(2)}），涟漪散开，稍快一档`,
  };
};

export class TransitionController {
  private plan: TransitionPlan | null = null;
  private startedAt = 0;
  private skipped = false;

  start(plan: TransitionPlan, now: number): void {
    this.plan = plan;
    this.startedAt = now;
    this.skipped = false;
  }

  /** 连点时立刻落地。已经结束的转场再跳过没有副作用。 */
  skip(): void {
    this.skipped = true;
  }

  get running(): boolean {
    if (this.plan === null || this.skipped) return false;
    return this.plan.durationMs > 0;
  }

  frame(now: number): TransitionFrame {
    const plan = this.plan;
    if (plan === null) return DONE_FRAME;

    const raw =
      plan.durationMs <= 0 ? 1 : clamp01((now - this.startedAt) / plan.durationMs);
    const p = this.skipped ? 1 : raw;
    const done = p >= 1;

    if (plan.mode === 'cut' || done) {
      this.plan = null;
      return { ...DONE_FRAME, progress: 1 };
    }

    const eased = easeInOutCubic(p);

    if (plan.mode === 'fade') {
      return {
        progress: p,
        outOpacity: 1 - eased,
        inOpacity: eased,
        outBlurPx: 0,
        inBlurPx: 0,
        rippleRadius: MASK_OPEN,
        rippleFeather: 0,
        done: false,
      };
    }

    if (plan.mode === 'blurFade') {
      // 模糊在中途最重，两端清楚：像失焦再对上焦
      const bell = Math.sin(Math.PI * p);
      return {
        progress: p,
        outOpacity: 1 - eased,
        inOpacity: eased,
        outBlurPx: plan.outBlurPx * bell,
        inBlurPx: plan.inBlurPx * (1 - eased) * bell,
        rippleRadius: MASK_OPEN,
        rippleFeather: 0,
        done: false,
      };
    }

    // ripple：新画面从中心一圈圈漫开，边缘柔；两层同时带模糊，
    // 到末尾模糊归零，于是"化开—聚拢"。
    //
    // 旧层全程保持不透明：揭示是遮罩做的，不是靠旧层淡出。
    // 一旦让旧层淡出，遮罩之外就会露出页面底色——粉白梦斋转夜蓝梦境时
    // 那是一次可见的闪白，而入梦恰好是最不能闪的一次转场。
    const radius = easeOutCubic(p) * RIPPLE_PEAK;
    const bell = Math.sin(Math.PI * p);
    return {
      progress: p,
      outOpacity: 1,
      // 新层开头略透，让遮罩边缘看起来是"化开"而不是硬边推进
      inOpacity: clamp01(p / 0.15),
      outBlurPx: plan.outBlurPx * bell,
      inBlurPx: plan.inBlurPx * (1 - easeOutCubic(p)),
      rippleRadius: radius,
      rippleFeather: 0.22 * (1 - p) + 0.05,
      done: false,
    };
  }
}

const DONE_FRAME: TransitionFrame = {
  progress: 1,
  outOpacity: 0,
  inOpacity: 1,
  outBlurPx: 0,
  inBlurPx: 0,
  rippleRadius: MASK_OPEN,
  rippleFeather: 0,
  done: true,
};

// ---------- 亮度测量 ----------

export type LuminanceProbe = (url: string) => Promise<number>;

/**
 * 把图缩到极小再平均，够用且便宜。
 * 一张图只测一次，结果缓存；测不出就返回 null 让上层走默认淡入。
 */
export const canvasLuminanceProbe: LuminanceProbe = async (url) => {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  const w = 24;
  const h = 14;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('无法取得 2d 上下文');
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = (data[i] as number) / 255;
    const g = (data[i + 1] as number) / 255;
    const b = (data[i + 2] as number) / 255;
    // Rec.709 亮度权重，比简单平均更接近人眼感受
    sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return sum / (data.length / 4);
};

export class LuminanceCache {
  private cache = new Map<string, number | null>();
  private probe: LuminanceProbe;

  constructor(probe: LuminanceProbe) {
    this.probe = probe;
  }

  peek(url: string): number | null {
    return this.cache.get(url) ?? null;
  }

  async get(url: string): Promise<number | null> {
    const hit = this.cache.get(url);
    if (hit !== undefined) return hit;
    try {
      const v = await this.probe(url);
      const ok = Number.isFinite(v) ? clamp01(v) : null;
      this.cache.set(url, ok);
      return ok;
    } catch {
      // 测不出就记 null：下次不再重试，直接走默认淡入
      this.cache.set(url, null);
      return null;
    }
  }
}

import type { ChoiceEffects, DreamPackage } from './schema';
import type { StoryVars } from './engine';

/**
 * 选项结算的唯一实现。
 *
 * chooseOption（运行时）、replayView（回放）与静态区间分析共用这一份，
 * 否则三处各写一遍增量规则，迟早漂移成三种语义。
 *
 * 越界按契约视为制作错误：这里返回失败，由调用方决定如何呈现，
 * 任何一方都不许偷偷截断。
 */

export type SettleResult =
  | { ok: true; vars: StoryVars }
  | { ok: false; code: 'out-of-range' | 'unknown-decl'; message: string };

export const settleChoice = (
  pkg: DreamPackage,
  vars: StoryVars,
  effects: ChoiceEffects,
  choiceLabel: string,
): SettleResult => {
  const resources: Record<string, number> = { ...vars.resources };
  for (const [id, delta] of Object.entries(effects.resourceDeltas)) {
    const decl = pkg.resources.find((r) => r.id === id);
    if (decl === undefined) {
      return { ok: false, code: 'unknown-decl', message: `${choiceLabel} 引用未声明资源 ${id}` };
    }
    const value = (vars.resources[id] ?? decl.initial) + delta;
    if (value < decl.min || value > decl.max) {
      return {
        ok: false,
        code: 'out-of-range',
        message: `${choiceLabel} 使资源 ${id} 变为 ${value}，越出 ${decl.min}..${decl.max}；这是制作错误，不截断`,
      };
    }
    resources[id] = value;
  }

  const relationships: Record<string, number> = { ...vars.relationships };
  for (const [id, delta] of Object.entries(effects.relationshipDeltas)) {
    const decl = pkg.relationships.find((r) => r.id === id);
    if (decl === undefined) {
      return { ok: false, code: 'unknown-decl', message: `${choiceLabel} 引用未声明关系 ${id}` };
    }
    const value = (vars.relationships[id] ?? decl.initial) + delta;
    if (value < decl.min || value > decl.max) {
      return {
        ok: false,
        code: 'out-of-range',
        message: `${choiceLabel} 使关系 ${id} 变为 ${value}，越出 ${decl.min}..${decl.max}；这是制作错误，不截断`,
      };
    }
    relationships[id] = value;
  }

  const flags: Record<string, boolean> = { ...vars.flags };
  for (const id of effects.setFlags) {
    if (!pkg.flags.some((f) => f.id === id)) {
      return { ok: false, code: 'unknown-decl', message: `${choiceLabel} 引用未声明标记 ${id}` };
    }
    // 首版只允许 false -> true
    flags[id] = true;
  }

  return { ok: true, vars: { resources, relationships, flags } };
};

/** 初始状态：全部取声明初值，标记一律 false。 */
export const initialVars = (pkg: DreamPackage): StoryVars => ({
  resources: Object.fromEntries(pkg.resources.map((r) => [r.id, r.initial])),
  relationships: Object.fromEntries(pkg.relationships.map((r) => [r.id, r.initial])),
  flags: Object.fromEntries(pkg.flags.map((f) => [f.id, false])),
});

/** 状态指纹：用于状态空间去重，键排序后拼接。 */
export const varsKey = (vars: StoryVars): string => {
  const part = (o: Record<string, number | boolean>) =>
    Object.keys(o)
      .sort()
      .map((k) => `${k}=${String(o[k])}`)
      .join(',');
  return `${part(vars.resources)}|${part(vars.relationships)}|${part(vars.flags)}`;
};

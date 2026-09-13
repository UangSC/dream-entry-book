import type {
  Beat,
  Choice,
  Condition,
  DreamNode,
  DreamPackage,
  Predicate,
  SceneNode,
} from './schema';
import { initialVars, settleChoice } from './settle';

/**
 * 剧情引擎：纯函数。
 *
 * 三条来自契约的硬规则，实现时不打折扣：
 * 1. 越界视为制作错误，不偷偷截断。
 * 2. 只有引擎决定是否推进；演出层不得产生剧情副作用。
 * 3. 重复点击只结算一次；旧点击不能作用到新状态。
 *
 * 引擎不播放声音也不写存档，只返回新状态与事件；
 * 由调用方决定是否播放（回放时要抑制音效）。
 */

export type Phase = 'reading' | 'choosing' | 'finished';

export interface ChoiceRecord {
  nodeId: string;
  choiceId: string;
}

export interface StoryVars {
  resources: Readonly<Record<string, number>>;
  relationships: Readonly<Record<string, number>>;
  flags: Readonly<Record<string, boolean>>;
}

/** 检查点保存选择前的完整剧情状态，且不嵌套保存 checkpoints 自身。 */
export interface Checkpoint {
  nodeId: string;
  revision: number;
  vars: StoryVars;
  choiceHistory: readonly ChoiceRecord[];
  readBeatKeys: readonly string[];
}

export interface SaveState {
  saveVersion: 1;
  packageId: string;
  buildId: string;
  nodeId: string;
  /** 指向原始 beats 数组中的实际可见拍。 */
  beatIndex: number;
  phase: Phase;
  /** 单调增加的行动版本。恢复检查点也产生新 revision。 */
  revision: number;
  resources: Readonly<Record<string, number>>;
  relationships: Readonly<Record<string, number>>;
  flags: Readonly<Record<string, boolean>>;
  choiceHistory: readonly ChoiceRecord[];
  readBeatKeys: readonly string[];
  checkpoints: readonly Checkpoint[];
  updatedAt: string;
}

/** 演出层据此更新画面与声音。引擎自己不执行任何一项。 */
export type EngineEvent =
  | { type: 'beat'; nodeId: string; beat: Beat; firstRead: boolean }
  | { type: 'scene'; assetId: string }
  | { type: 'music'; action: 'play' | 'silence' | 'resume'; track?: string }
  | { type: 'sfx'; assetId: string }
  | { type: 'choices'; nodeId: string; choices: readonly Choice[] }
  | { type: 'ending'; nodeId: string; endingId: string; title: string };

export type EngineError =
  | { code: 'unknown-node'; message: string }
  | { code: 'unknown-choice'; message: string }
  | { code: 'choice-hidden'; message: string }
  | { code: 'out-of-range'; message: string }
  | { code: 'flag-reset'; message: string }
  | { code: 'no-visible-beat'; message: string }
  | { code: 'wrong-phase'; message: string }
  | { code: 'save-mismatch'; message: string };

export type EngineResult =
  | { ok: true; state: SaveState; events: readonly EngineEvent[] }
  /** stale：旧点击或重复点击。不是错误，安静忽略，状态原样返回。 */
  | { ok: true; state: SaveState; events: readonly EngineEvent[]; stale: true }
  | { ok: false; error: EngineError };

/** 选择令牌：带节点访问序号与 revision，用于挡住重复点击和过期点击。 */
export interface ChoiceToken {
  nodeId: string;
  nodeVisit: number;
  choiceId: string;
  revision: number;
}

const err = (code: EngineError['code'], message: string): EngineResult => ({
  ok: false,
  error: { code, message } as EngineError,
});

// ---------- 条件求值 ----------

const evaluatePredicate = (p: Predicate, vars: StoryVars): boolean => {
  if (p.kind === 'flag') {
    return (vars.flags[p.id] ?? false) === p.equals;
  }
  const pool = p.kind === 'resource' ? vars.resources : vars.relationships;
  const current = pool[p.id];
  // 未声明的键在校验期已被拒；运行期遇到就判为不成立，不猜默认值。
  if (current === undefined) return false;
  if (p.op === 'eq') return current === p.value;
  if (p.op === 'gte') return current >= p.value;
  return current <= p.value;
};

/** 首版只有 all，没有 OR。 */
export const evaluateCondition = (cond: Condition | undefined, vars: StoryVars): boolean =>
  cond === undefined || cond.all.every((p) => evaluatePredicate(p, vars));

export const isBeatVisible = (beat: Beat, vars: StoryVars): boolean =>
  evaluateCondition(beat.when, vars);

export const visibleChoices = (node: SceneNode, vars: StoryVars): readonly Choice[] =>
  (node.choices ?? []).filter((c) => evaluateCondition(c.when, vars));

// ---------- 拍游标 ----------

/**
 * 节点内的拍不改变状态（只有选项有 effects），
 * 所以同一节点遍历期间可见性是稳定的。这里仍按索引逐个求值，
 * 以免将来 beats 获得副作用时这里悄悄算错。
 */
const findVisibleFrom = (node: DreamNode, from: number, vars: StoryVars): number => {
  for (let i = from; i < node.beats.length; i += 1) {
    const beat = node.beats[i];
    if (beat !== undefined && isBeatVisible(beat, vars)) return i;
  }
  return -1;
};

const varsOf = (s: SaveState): StoryVars => ({
  resources: s.resources,
  relationships: s.relationships,
  flags: s.flags,
});

/** 已读键绑定 buildId、此前完整选择路径、nodeId 与 beatId。 */
export const readBeatKey = (
  buildId: string,
  history: readonly ChoiceRecord[],
  nodeId: string,
  beatId: string,
): string => {
  const path = history.map((h) => `${h.nodeId}:${h.choiceId}`).join('>');
  return `${buildId}|${path}|${nodeId}|${beatId}`;
};

/** 节点访问序号：由 choiceHistory 推导，不额外存字段。 */
export const nodeVisitOrdinal = (history: readonly ChoiceRecord[], nodeId: string): number =>
  history.filter((h) => h.nodeId === nodeId).length + 1;

const nodeMapOf = (pkg: DreamPackage): Map<string, DreamNode> =>
  new Map(pkg.nodes.map((n) => [n.id, n]));

const phaseFor = (node: DreamNode, beatIndex: number, vars: StoryVars): Phase => {
  const later = findVisibleFrom(node, beatIndex + 1, vars);
  if (later !== -1) return 'reading';
  if (node.kind === 'ending') return 'finished';
  // 末拍且有 choices 时进入 choosing；有 next 时仍是 reading，由推进跳转
  return node.choices !== undefined ? 'choosing' : 'reading';
};

/**
 * 进入某节点的首个可见拍，产出该拍的事件。
 * BGM 由 musicCue 决定，不在这里编默认曲。
 *
 * 背景事件在每次进入节点时都发出，不在引擎里比较"是否与上一节点相同"：
 * 拍上的 sceneShift 会让实际显示的背景偏离节点声明的 scene，
 * 于是"目标 scene == 上一节点 scene"并不等于"画面已经是目标背景"。
 * 去重交给知道屏幕上正在显示什么的演出层，它可以据此决定是否交叉淡入。
 */
const enterNode = (base: SaveState, node: DreamNode): EngineResult => {
  const vars = varsOf(base);
  const index = findVisibleFrom(node, 0, vars);
  if (index === -1) {
    return err('no-visible-beat', `节点 ${node.id} 在当前状态下没有可见拍`);
  }
  const beat = node.beats[index] as Beat;
  const key = readBeatKey(base.buildId, base.choiceHistory, node.id, beat.id);
  const firstRead = !base.readBeatKeys.includes(key);

  const events: EngineEvent[] = [{ type: 'scene', assetId: node.scene }];
  events.push(...beatEvents(node.id, beat, firstRead));
  if (node.kind === 'ending') {
    events.push({
      type: 'ending',
      nodeId: node.id,
      endingId: node.ending.id,
      title: node.ending.title,
    });
  }

  const state: SaveState = {
    ...base,
    nodeId: node.id,
    beatIndex: index,
    phase: phaseFor(node, index, vars),
    readBeatKeys: firstRead ? [...base.readBeatKeys, key] : base.readBeatKeys,
  };
  if (state.phase === 'choosing' && node.kind === 'scene') {
    events.push({ type: 'choices', nodeId: node.id, choices: visibleChoices(node, vars) });
  }
  return { ok: true, state, events };
};

const beatEvents = (nodeId: string, beat: Beat, firstRead: boolean): EngineEvent[] => {
  const out: EngineEvent[] = [{ type: 'beat', nodeId, beat, firstRead }];
  if (beat.sceneShift !== undefined) out.push({ type: 'scene', assetId: beat.sceneShift });
  if (beat.musicCue !== undefined) {
    out.push(
      beat.musicCue.track === undefined
        ? { type: 'music', action: beat.musicCue.action }
        : { type: 'music', action: beat.musicCue.action, track: beat.musicCue.track },
    );
  }
  if (beat.sfx !== undefined) out.push({ type: 'sfx', assetId: beat.sfx });
  return out;
};

// ---------- 开局 ----------

export const startPackage = (pkg: DreamPackage, now: string): EngineResult => {
  const nodes = nodeMapOf(pkg);
  const entry = nodes.get(pkg.entryNodeId);
  if (entry === undefined) {
    return err('unknown-node', `entryNodeId 指向不存在的节点 ${pkg.entryNodeId}`);
  }
  const vars = initialVars(pkg);

  const base: SaveState = {
    saveVersion: 1,
    packageId: pkg.packageId,
    buildId: pkg.buildId,
    nodeId: entry.id,
    beatIndex: 0,
    phase: 'reading',
    revision: 1,
    resources: vars.resources,
    relationships: vars.relationships,
    flags: vars.flags,
    choiceHistory: [],
    readBeatKeys: [],
    checkpoints: [],
    updatedAt: now,
  };
  return enterNode(base, entry);
};

// ---------- 推进 ----------

/**
 * 推进到下一拍。末拍遇 choices 不代选，遇 next 跳节点，遇 ending 停在 finished。
 * 演出层调用它，但它自己不判断动画是否播完——那是调用方的门。
 */
export const advance = (pkg: DreamPackage, state: SaveState, now: string): EngineResult => {
  const nodes = nodeMapOf(pkg);
  const node = nodes.get(state.nodeId);
  if (node === undefined) return err('unknown-node', `存档指向不存在的节点 ${state.nodeId}`);

  const vars = varsOf(state);
  // phase 是 (node, beatIndex, vars) 的纯函数，存档里那一份只是给 UI 用的缓存。
  // 这里重新推导而不信存档：手改过、迁移过或被旧版本写坏的 phase
  // 否则能把引擎推进错误分支（例如在还有可见拍时就去结算选择）。
  const phase = phaseFor(node, state.beatIndex, vars);
  if (phase === 'finished') {
    return err('wrong-phase', '已在终幕，不能继续推进');
  }
  if (phase === 'choosing') {
    return err('wrong-phase', '正在等待选择，推进被忽略以免代选');
  }

  const next = findVisibleFrom(node, state.beatIndex + 1, vars);

  if (next !== -1) {
    const beat = node.beats[next] as Beat;
    const key = readBeatKey(state.buildId, state.choiceHistory, node.id, beat.id);
    const firstRead = !state.readBeatKeys.includes(key);
    const events = beatEvents(node.id, beat, firstRead);
    const newState: SaveState = {
      ...state,
      beatIndex: next,
      phase: phaseFor(node, next, vars),
      readBeatKeys: firstRead ? [...state.readBeatKeys, key] : state.readBeatKeys,
      revision: state.revision + 1,
      updatedAt: now,
    };
    if (newState.phase === 'choosing' && node.kind === 'scene') {
      events.push({ type: 'choices', nodeId: node.id, choices: visibleChoices(node, vars) });
    }
    return { ok: true, state: newState, events };
  }

  // 本节点没有更多可见拍
  if (node.kind === 'ending') {
    return { ok: true, state: { ...state, phase: 'finished', updatedAt: now }, events: [] };
  }
  if (node.next === undefined) {
    return err('wrong-phase', `节点 ${node.id} 末拍应展示选项，不应推进`);
  }
  const target = nodes.get(node.next);
  if (target === undefined) {
    return err('unknown-node', `节点 ${node.id} 的 next 指向不存在的 ${node.next}`);
  }
  return enterNode({ ...state, revision: state.revision + 1, updatedAt: now }, target);
};

// ---------- 选择 ----------

/**
 * 选项结算顺序严格按契约：
 * 校验令牌 → 在旧状态评估 when → 计算全部增量 → 检查越界 → 原子应用 → 跳到 target 首个可见拍。
 */
export const chooseOption = (
  pkg: DreamPackage,
  state: SaveState,
  token: ChoiceToken,
  now: string,
): EngineResult => {
  // 令牌检查必须排在最前：重复点击时状态已经跳到下一个节点，
  // 若先查 phase/choices 会把一次普通的双击报成 wrong-phase 错误。
  // 这类点击应当安静忽略，不弹错误给玩家。
  const expectedVisit = nodeVisitOrdinal(state.choiceHistory, state.nodeId);
  if (
    token.revision !== state.revision ||
    token.nodeId !== state.nodeId ||
    token.nodeVisit !== expectedVisit
  ) {
    return { ok: true, state, events: [], stale: true };
  }

  const nodes = nodeMapOf(pkg);
  const node = nodes.get(state.nodeId);
  if (node === undefined) return err('unknown-node', `存档指向不存在的节点 ${state.nodeId}`);
  if (node.kind !== 'scene' || node.choices === undefined) {
    return err('wrong-phase', `节点 ${state.nodeId} 没有选项`);
  }
  const vars = varsOf(state);
  // 同样重新推导，不信存档里的 phase：
  // 若还有可见拍就说明尚未读完本节点，此时结算等于代选。
  const phase = phaseFor(node, state.beatIndex, vars);
  if (phase !== 'choosing') {
    return err('wrong-phase', `当前阶段 ${phase}，尚未读完本节点，不能结算选择`);
  }
  const choice = node.choices.find((c) => c.id === token.choiceId);
  if (choice === undefined) {
    return err('unknown-choice', `节点 ${node.id} 没有选项 ${token.choiceId}`);
  }
  // 在旧状态上评估可见性
  if (!evaluateCondition(choice.when, vars)) {
    return err('choice-hidden', `选项 ${choice.id} 在当前状态不可见，拒绝结算`);
  }

  // 结算走 settle.ts 的唯一实现：运行时、回放与静态区间分析共用同一份规则。
  const settled = settleChoice(pkg, vars, choice.effects, `选项 ${choice.id}`);
  if (!settled.ok) {
    // 未声明的键在校验期已被拒；运行期遇到仍按制作错误处理，不猜默认值。
    return err('out-of-range', settled.message);
  }

  const target = nodes.get(choice.target);
  if (target === undefined) {
    return err('unknown-node', `选项 ${choice.id} 的 target 不存在：${choice.target}`);
  }

  // 检查点保存选择前的状态，不嵌套 checkpoints 自身
  const checkpoint: Checkpoint = {
    nodeId: node.id,
    revision: state.revision,
    vars: { resources: state.resources, relationships: state.relationships, flags: state.flags },
    choiceHistory: state.choiceHistory,
    readBeatKeys: state.readBeatKeys,
  };

  const applied: SaveState = {
    ...state,
    resources: settled.vars.resources,
    relationships: settled.vars.relationships,
    flags: settled.vars.flags,
    choiceHistory: [...state.choiceHistory, { nodeId: node.id, choiceId: choice.id }],
    checkpoints: [...state.checkpoints, checkpoint],
    revision: state.revision + 1,
    updatedAt: now,
  };

  return enterNode(applied, target);
};

// ---------- 从这里重选 ----------

/**
 * 恢复到某个分歧点：恢复完整剧情状态与已读集合，
 * 移除该点之后的活动检查点，并产生新的 revision 让旧点击失效。
 * 梦册收藏由调用方独立保存，这里不碰。
 */
export const restoreCheckpoint = (
  pkg: DreamPackage,
  state: SaveState,
  checkpointIndex: number,
  now: string,
): EngineResult => {
  const cp = state.checkpoints[checkpointIndex];
  if (cp === undefined) {
    return err('save-mismatch', `检查点 ${checkpointIndex} 不存在`);
  }
  const nodes = nodeMapOf(pkg);
  const node = nodes.get(cp.nodeId);
  if (node === undefined) {
    return err('unknown-node', `检查点指向不存在的节点 ${cp.nodeId}`);
  }
  const base: SaveState = {
    ...state,
    resources: cp.vars.resources,
    relationships: cp.vars.relationships,
    flags: cp.vars.flags,
    choiceHistory: cp.choiceHistory,
    readBeatKeys: cp.readBeatKeys,
    checkpoints: state.checkpoints.slice(0, checkpointIndex),
    revision: state.revision + 1,
    updatedAt: now,
  };
  return enterNode(base, node);
};

// ---------- 回放（恢复演出用） ----------

export interface ReplayView {
  scene: string;
  /** 最近一次 musicCue 的结果；null 表示明确静默。 */
  track: string | null;
  /** 是否处于明确静默状态。 */
  silenced: boolean;
}

/**
 * 从入口按 choiceHistory 重放纯状态与实际可见拍，到当前 beatIndex 为止。
 * 只计算背景、最近曲目与静默状态；不播音效、不写存档、不重复收藏。
 * 起始梦内曲默认 BGM_DREAM，musicCue 可覆盖。
 */
export const replayView = (
  pkg: DreamPackage,
  state: SaveState,
  defaultTrack = 'BGM_DREAM',
): { ok: true; view: ReplayView } | { ok: false; error: EngineError } => {
  if (state.packageId !== pkg.packageId || state.buildId !== pkg.buildId) {
    return {
      ok: false,
      error: { code: 'save-mismatch', message: '存档与当前梦包的 packageId/buildId 不一致' },
    };
  }
  const nodes = nodeMapOf(pkg);
  let vars: StoryVars = initialVars(pkg);

  let nodeId = pkg.entryNodeId;
  let scene = nodes.get(nodeId)?.scene ?? '';
  let track: string | null = defaultTrack;
  let silenced = false;

  const applyBeats = (node: DreamNode, upto: number) => {
    for (let i = 0; i <= upto && i < node.beats.length; i += 1) {
      const beat = node.beats[i];
      if (beat === undefined || !isBeatVisible(beat, vars)) continue;
      if (beat.sceneShift !== undefined) scene = beat.sceneShift;
      if (beat.musicCue !== undefined) {
        if (beat.musicCue.action === 'silence') {
          silenced = true;
        } else if (beat.musicCue.action === 'play') {
          silenced = false;
          track = beat.musicCue.track ?? track;
        } else {
          silenced = false;
        }
      }
    }
  };

  // 路径同时含 next 与 choices；选择历史不会记录普通节点。
  let historyIndex = 0;
  const visited = new Set<string>();
  while (nodeId !== state.nodeId || historyIndex < state.choiceHistory.length) {
    const node = nodes.get(nodeId);
    if (node === undefined || visited.has(nodeId)) {
      return { ok: false, error: { code: 'save-mismatch', message: '选择路径与梦包结构不一致' } };
    }
    visited.add(nodeId);
    scene = node.scene;
    applyBeats(node, node.beats.length - 1);
    if (node.kind === 'scene' && node.next) { nodeId = node.next; continue; }
    const step = state.choiceHistory[historyIndex++];
    if (!step || step.nodeId !== node.id) return { ok: false, error: { code: 'save-mismatch', message: '选择历史不完整' } };
    if (node.kind !== 'scene' || node.choices === undefined) {
      return { ok: false, error: { code: 'save-mismatch', message: `节点 ${node.id} 没有选项` } };
    }
    const choice = node.choices.find((c) => c.id === step.choiceId);
    if (choice === undefined || !evaluateCondition(choice.when, vars)) {
      return {
        ok: false,
        error: { code: 'unknown-choice', message: `节点 ${node.id} 没有选项 ${step.choiceId}` },
      };
    }
    // 与运行时同一份结算规则。回放本该跟着历史安全走完，
    // 走不通说明存档与当前梦包不一致——报错，不编造状态。
    const settled = settleChoice(pkg, vars, choice.effects, `回放选项 ${choice.id}`);
    if (!settled.ok) {
      return { ok: false, error: { code: 'save-mismatch', message: settled.message } };
    }
    vars = settled.vars;
    nodeId = choice.target;
  }

  const current = nodes.get(nodeId);
  const equal = (a: object, b: object) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
  if (current === undefined || current.id !== state.nodeId || !current.beats[state.beatIndex] ||
      !isBeatVisible(current.beats[state.beatIndex]!, vars) || !equal(vars.flags, state.flags) ||
      !equal(vars.resources, state.resources) || !equal(vars.relationships, state.relationships)) {
    return {
      ok: false,
      error: { code: 'save-mismatch', message: '存档 nodeId 与重放结果不一致，保留备份不编造状态' },
    };
  }
  scene = current.scene;
  applyBeats(current, state.beatIndex);

  return { ok: true, view: { scene, track: silenced ? null : track, silenced } };
};

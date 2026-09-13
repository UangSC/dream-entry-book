import {
  dreamPackageSchema,
  ENTER_EFFECTS,
  EXIT_EFFECTS,
  SPLIT_EFFECTS,
  LIMITS,
  type Beat,
  type Condition,
  type DreamNode,
  type DreamPackage,
  type SceneNode,
} from './schema';
import { evaluateCondition, type StoryVars } from './engine';
import { initialVars, settleChoice, varsKey } from './settle';

export type Severity = 'error' | 'warning';

export interface Finding {
  severity: Severity;
  code: string;
  message: string;
  /** 定位路径，例如 nodes[2].beats[0]。 */
  at?: string;
}

export interface ValidateOptions {
  /** manifest 里已登记的资产 ID。给了就做白名单校验；不给则跳过并留一条 warning。 */
  assetIds?: readonly string[];
  /** 梦包序列化后的字节数，用于 1 MiB 上限。 */
  byteLength?: number;
  /** 发布模式：要求 review.status=approved 等更严格的条件。 */
  forPublish?: boolean;
}

export interface ValidateResult {
  ok: boolean;
  findings: Finding[];
  /** 校验通过时给出已解析的梦包。 */
  data?: DreamPackage;
}

const isSceneNode = (n: DreamNode): n is SceneNode => n.kind === 'scene';

/** 拍是否可能被跳过：带 when 的拍在某些状态下不展示。 */
const skippable = (b: Beat): boolean => b.when !== undefined;

const enterSet = new Set<string>(ENTER_EFFECTS);
const exitSet = new Set<string>(EXIT_EFFECTS);
const splitSet = new Set<string>(SPLIT_EFFECTS);

export function validateDreamPackage(
  input: unknown,
  options: ValidateOptions = {},
): ValidateResult {
  const findings: Finding[] = [];
  const err = (code: string, message: string, at?: string) =>
    findings.push(at === undefined ? { severity: 'error', code, message } : { severity: 'error', code, message, at });
  const warn = (code: string, message: string, at?: string) =>
    findings.push(at === undefined ? { severity: 'warning', code, message } : { severity: 'warning', code, message, at });

  // ---------- 第一层：schema ----------
  const parsed = dreamPackageSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      err('schema', issue.message, issue.path.join('.') || undefined);
    }
    return { ok: false, findings };
  }
  const pkg = parsed.data;

  // ---------- 体积 ----------
  if (options.byteLength !== undefined && options.byteLength > LIMITS.maxBytes) {
    err(
      'size',
      `梦包 ${options.byteLength} 字节，超过 ${LIMITS.maxBytes} 字节上限`,
    );
  }

  // ---------- 声明表与唯一性 ----------
  const dupe = (label: string, ids: string[], at: string) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) err('duplicate-id', `${label} ID 重复：${id}`, at);
      seen.add(id);
    }
  };

  const characterIds = pkg.characters.map((c) => c.id);
  const resourceIds = pkg.resources.map((r) => r.id);
  const relationshipIds = pkg.relationships.map((r) => r.id);
  const flagIds = pkg.flags.map((f) => f.id);
  const nodeIds = pkg.nodes.map((n) => n.id);

  dupe('人物', characterIds, 'characters');
  dupe('资源', resourceIds, 'resources');
  dupe('关系', relationshipIds, 'relationships');
  dupe('标记', flagIds, 'flags');
  dupe('节点', nodeIds, 'nodes');
  dupe('来源段落', pkg.source.paragraphIds, 'source.paragraphIds');

  const characterSet = new Set(characterIds);
  const resourceSet = new Set(resourceIds);
  const relationshipSet = new Set(relationshipIds);
  const flagSet = new Set(flagIds);
  const nodeMap = new Map(pkg.nodes.map((n) => [n.id, n]));

  for (const [i, rel] of pkg.relationships.entries()) {
    if (!characterSet.has(rel.characterId)) {
      err('unknown-ref', `关系 ${rel.id} 指向未声明的人物 ${rel.characterId}`, `relationships.${i}`);
    }
  }

  // ---------- 资产白名单 ----------
  const assetSet = options.assetIds ? new Set(options.assetIds) : undefined;
  if (assetSet === undefined) {
    warn('assets-unchecked', '未提供 manifest 资产列表，跳过资产白名单校验');
  }
  const checkAsset = (id: string, at: string) => {
    if (assetSet !== undefined && !assetSet.has(id)) {
      err('unknown-asset', `资产 ${id} 不在 manifest 白名单内`, at);
    }
  };

  // ---------- 条件引用 ----------
  const checkCondition = (cond: Condition | undefined, at: string) => {
    if (cond === undefined) return;
    for (const [i, p] of cond.all.entries()) {
      const where = `${at}.when.all.${i}`;
      if (p.kind === 'flag' && !flagSet.has(p.id)) {
        err('unknown-ref', `条件引用未声明的标记 ${p.id}`, where);
      }
      if (p.kind === 'resource' && !resourceSet.has(p.id)) {
        err('unknown-ref', `条件引用未声明的资源 ${p.id}`, where);
      }
      if (p.kind === 'relationship' && !relationshipSet.has(p.id)) {
        err('unknown-ref', `条件引用未声明的关系 ${p.id}`, where);
      }
    }
  };

  // ---------- 逐节点 ----------
  const beatIdsGlobal: string[] = [];
  for (const [ni, node] of pkg.nodes.entries()) {
    const nAt = `nodes.${ni}`;
    if (node.origin === 'adapted' && node.sourceRefs.length === 0) err('source-ref', `改编节点 ${node.id} 缺少原文依据`, nAt);
    for (const ref of node.sourceRefs) if (!pkg.source.paragraphIds.includes(ref)) err('source-ref', `节点 ${node.id} 引用不存在的来源段落 ${ref}`, nAt);
    checkAsset(node.scene, `${nAt}.scene`);

    dupe('拍', node.beats.map((b) => b.id), `${nAt}.beats`);
    beatIdsGlobal.push(...node.beats.map((b) => b.id));

    // 节点至少有一个无条件拍，避免整页为空
    if (!node.beats.some((b) => !skippable(b))) {
      err('all-conditional', `节点 ${node.id} 的所有拍都带 when，可能整页为空`, `${nAt}.beats`);
    }

    for (const [bi, beat] of node.beats.entries()) {
      const bAt = `${nAt}.beats.${bi}`;
      checkCondition(beat.when, bAt);
      if (beat.sfx !== undefined) checkAsset(beat.sfx, `${bAt}.sfx`);
      if (beat.sceneShift !== undefined) checkAsset(beat.sceneShift, `${bAt}.sceneShift`);
      if (beat.musicCue?.track !== undefined) checkAsset(beat.musicCue.track, `${bAt}.musicCue.track`);
      if (beat.kind !== 'narration' && !characterSet.has(beat.speaker)) {
        err('unknown-ref', `拍 ${beat.id} 的 speaker ${beat.speaker} 未在 characters 声明`, bAt);
      }
    }

    if (isSceneNode(node)) {
      if (node.next !== undefined && !nodeMap.has(node.next)) {
        err('unknown-ref', `节点 ${node.id} 的 next 指向不存在的节点 ${node.next}`, `${nAt}.next`);
      }
      for (const [ci, choice] of (node.choices ?? []).entries()) {
        const cAt = `${nAt}.choices.${ci}`;
        checkCondition(choice.when, cAt);
        if (!nodeMap.has(choice.target)) {
          err('unknown-ref', `选项 ${choice.id} 的 target 不存在：${choice.target}`, `${cAt}.target`);
        }
        for (const key of Object.keys(choice.effects.resourceDeltas)) {
          if (!resourceSet.has(key)) {
            err('unknown-ref', `选项 ${choice.id} 的资源增量引用未声明的 ${key}`, `${cAt}.effects`);
          }
        }
        for (const key of Object.keys(choice.effects.relationshipDeltas)) {
          if (!relationshipSet.has(key)) {
            err('unknown-ref', `选项 ${choice.id} 的关系增量引用未声明的 ${key}`, `${cAt}.effects`);
          }
        }
        for (const f of choice.effects.setFlags) {
          if (!flagSet.has(f)) {
            err('unknown-ref', `选项 ${choice.id} 的 setFlags 引用未声明的标记 ${f}`, `${cAt}.effects`);
          }
        }
      }
      dupe('选项', (node.choices ?? []).map((c) => c.id), `${nAt}.choices`);
    } else {
      // 终幕回响与人物去向：条件与人物引用同样要核对，
      // 否则梦醒页会静静漏掉一条本该出现的回响。
      for (const [ri, ref] of (node.ending.reflections ?? []).entries()) {
        checkCondition(ref.when, `${nAt}.ending.reflections.${ri}`);
      }
      for (const [oi, out] of (node.ending.outcomes ?? []).entries()) {
        const oAt = `${nAt}.ending.outcomes.${oi}`;
        checkCondition(out.when, oAt);
        if (!characterSet.has(out.characterId)) {
          err(
            'unknown-ref',
            `终幕 ${node.ending.id} 的去向条目指向未声明的人物 ${out.characterId}`,
            oAt,
          );
        }
      }
    }
  }

  dupe('拍（跨节点）', beatIdsGlobal, 'nodes[].beats');

  // ---------- 入口与可达性 ----------
  if (!nodeMap.has(pkg.entryNodeId)) {
    err('unknown-ref', `entryNodeId 指向不存在的节点 ${pkg.entryNodeId}`, 'entryNodeId');
    return { ok: false, findings };
  }

  const successors = (node: DreamNode): string[] => {
    if (!isSceneNode(node)) return [];
    if (node.next !== undefined) return nodeMap.has(node.next) ? [node.next] : [];
    return (node.choices ?? []).map((c) => c.target).filter((t) => nodeMap.has(t));
  };

  const reached = new Set<string>();
  const stack = [pkg.entryNodeId];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (reached.has(id)) continue;
    reached.add(id);
    const node = nodeMap.get(id);
    if (node !== undefined) stack.push(...successors(node));
  }

  for (const node of pkg.nodes) {
    if (!reached.has(node.id)) {
      err('unreachable', `节点 ${node.id} 从入口不可达`, 'nodes');
    }
  }

  const visiting = new Set<string>(), done = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (done.has(id)) return false;
    visiting.add(id);
    if (successors(nodeMap.get(id)!).some(visit)) return true;
    visiting.delete(id); done.add(id); return false;
  };
  if (visit(pkg.entryNodeId)) err('cycle', '故事包含循环，不能保证所有路线结束');

  const reachableEndings = pkg.nodes.filter((n) => n.kind === 'ending' && reached.has(n.id));
  if (reachableEndings.length === 0) {
    err('no-ending', '没有从入口可达的 ending 节点');
  }

  const endingIds = reachableEndings.map((n) => (n.kind === 'ending' ? n.ending.id : ''));
  dupe('终幕', endingIds, 'nodes[].ending');

  // ---------- 状态组合上限 ----------
  let combos = 2 ** pkg.flags.length;
  for (const r of [...pkg.resources, ...pkg.relationships]) {
    combos *= r.max - r.min + 1;
  }
  if (Number.isFinite(combos) && combos > LIMITS.maxStateCombos) {
    err(
      'state-explosion',
      `状态组合约 ${Math.round(combos)} 种，超过 ${LIMITS.maxStateCombos} 上限`,
    );
  }

  // ---------- 演出配额 ----------
  const effectBeats = pkg.nodes.flatMap((n) =>
    n.beats.filter((b) => b.effect !== undefined).map((b) => ({ node: n.id, beat: b })),
  );
  if (effectBeats.length > LIMITS.maxTimedEffects) {
    err(
      'effect-quota',
      `入场+退场类共 ${effectBeats.length} 拍，超过每包 ${LIMITS.maxTimedEffects} 拍上限`,
    );
  }
  const splitCount = effectBeats.filter((e) => splitSet.has(e.beat.effect?.type ?? '')).length;
  if (splitCount > LIMITS.maxSplitEffects) {
    err('effect-quota', `拆字类共 ${splitCount} 拍，超过 ${LIMITS.maxSplitEffects} 拍上限`);
  }
  const enterKinds = new Set(
    effectBeats.map((e) => e.beat.effect?.type ?? '').filter((t) => enterSet.has(t)),
  );
  if (enterKinds.size > LIMITS.maxEnterKinds) {
    err('effect-quota', `入场类用了 ${enterKinds.size} 种，超过 ${LIMITS.maxEnterKinds} 种上限`);
  }
  const exitKinds = new Set(
    effectBeats.map((e) => e.beat.effect?.type ?? '').filter((t) => exitSet.has(t)),
  );
  if (exitKinds.size > LIMITS.maxExitKinds) {
    err('effect-quota', `退场类用了 ${exitKinds.size} 种，超过 ${LIMITS.maxExitKinds} 种上限`);
  }

  // 连续 N 拍窗口内不得出现 2 次特效：在“拍图”上枚举长度 N 的路径。
  const gapViolation = findEffectGapViolation(pkg, nodeMap, LIMITS.minGapBetweenEffects);
  if (gapViolation !== undefined) {
    err(
      'effect-gap',
      `拍 ${gapViolation[0]} 与 ${gapViolation[1]} 在同一路线的连续 ${LIMITS.minGapBetweenEffects} 拍内都带特效`,
    );
  }

  // ---------- 数值区间 ----------
  // 只有引用完整、图可达都成立时才有意义；前面若已报错，这里的结论会是噪音。
  if (!findings.some((f) => f.severity === 'error')) {
    findings.push(...analyzeValueRanges(pkg, nodeMap));
  }

  // ---------- 发布门槛 ----------
  if (options.forPublish === true) {
    if (pkg.review.status !== 'approved') {
      err('review', `发布要求 review.status=approved，当前为 ${pkg.review.status}`, 'review');
    }
    if (pkg.review.reviewedBuildId !== pkg.buildId) {
      err(
        'review',
        `review.reviewedBuildId(${pkg.review.reviewedBuildId}) 与 buildId(${pkg.buildId}) 不一致，审读结论不适用于本次构建`,
        'review',
      );
    }
    if (!pkg.review.reviewer || !pkg.review.reviewedAt) err('review', '发布需要审读人和审读时间', 'review');
    if (pkg.source.kind === 'hackathon_excerpt' && pkg.source.linkStatus !== 'verified') {
      warn('link', '比赛来源的原文链接未核对，界面需说明“链接待核对”', 'source');
    }
  }

  const ok = !findings.some((f) => f.severity === 'error');
  return ok ? { ok, findings, data: pkg } : { ok, findings };
}

/**
 * 沿可达路径枚举状态，找出会把数值推出声明区间的选择。
 *
 * 越界在运行时是玩家撞上的错误，所以这里在制作期静态发现。
 * 复用 settleChoice：与运行时同一份规则，否则分析会认可引擎拒绝的路径。
 *
 * 按 (nodeId, 状态指纹) 去重。状态组合上限已在别处检查，
 * 这里再设一道遍历上限，遇到就降级为 warning——宁可说"没查完"，
 * 不可假装"查过且没问题"。
 */
function analyzeValueRanges(
  pkg: DreamPackage,
  nodeMap: Map<string, DreamNode>,
  limit = LIMITS.maxStateCombos,
): Finding[] {
  const out: Finding[] = [];
  const seen = new Set<string>();
  const start = initialVars(pkg);
  const queue: Array<{ nodeId: string; vars: StoryVars }> = [
    { nodeId: pkg.entryNodeId, vars: start },
  ];
  seen.add(`${pkg.entryNodeId}@${varsKey(start)}`);

  let steps = 0;
  const endings = new Set<string>();
  while (steps < queue.length) {
    if (steps >= limit) {
      out.push({
        severity: 'error',
        code: 'range-unchecked',
        message: `状态遍历超过 ${limit} 步，区间分析未走完，剩余路径未验证`,
      });
      break;
    }
    const cur = queue[steps++]!;
    const node = nodeMap.get(cur.nodeId);
    if (node === undefined) continue;
    if (node.kind === 'ending') { endings.add(node.id); continue; }

    if (node.next !== undefined) {
      const key = `${node.next}@${varsKey(cur.vars)}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push({ nodeId: node.next, vars: cur.vars });
      }
      continue;
    }

    const choices = (node.choices ?? []).filter(choice => evaluateCondition(choice.when, cur.vars));
    if (choices.length === 0) out.push({ severity: 'error', code: 'dead-end', message: `节点 ${node.id} 存在没有可见选项的可达状态` });
    for (const choice of choices) {
      // 不可见的选项玩家点不到，不计入
      if (!evaluateCondition(choice.when, cur.vars)) continue;
      const settled = settleChoice(pkg, cur.vars, choice.effects, `选项 ${choice.id}`);
      if (!settled.ok) {
        out.push({
          severity: 'error',
          code: settled.code === 'out-of-range' ? 'value-out-of-range' : 'unknown-ref',
          message: `节点 ${node.id} 存在可达路径导致越界：${settled.message}`,
          at: `nodes[${node.id}].choices[${choice.id}]`,
        });
        continue;
      }
      const key = `${choice.target}@${varsKey(settled.vars)}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push({ nodeId: choice.target, vars: settled.vars });
      }
    }
  }
  for (const node of pkg.nodes) if (node.kind === 'ending' && !endings.has(node.id)) out.push({ severity: 'error', code: 'ending-unreachable', message: `终幕 ${node.id} 没有可执行的见证路径` });
  // 同一选项在多条路径上越界只报一次
  const uniq = new Map<string, Finding>();
  for (const f of out) uniq.set(`${f.code}|${f.at ?? ''}|${f.message}`, f);
  return [...uniq.values()];
}

/**
 * 在“拍图”上找长度 window 内出现两个特效拍的路径。
 * 顶点是拍，边是可能的相邻关系（带 when 的拍可能被跳过，因此可以跨过它连边）。
 */
function findEffectGapViolation(
  pkg: DreamPackage,
  nodeMap: Map<string, DreamNode>,
  window: number,
): [string, string] | undefined {
  interface Vertex {
    nodeId: string;
    index: number;
    beat: Beat;
  }
  const key = (v: Vertex) => `${v.nodeId}#${v.index}`;
  const vertices = new Map<string, Vertex>();
  for (const node of pkg.nodes) {
    for (const [index, beat] of node.beats.entries()) {
      const v = { nodeId: node.id, index, beat };
      vertices.set(key(v), v);
    }
  }

  const successorsOf = (v: Vertex): Vertex[] => {
    const node = nodeMap.get(v.nodeId);
    if (node === undefined) return [];
    const out: Vertex[] = [];
    // 同节点内：可以跳过中间所有“可跳过”的拍
    for (let j = v.index + 1; j < node.beats.length; j += 1) {
      const next = vertices.get(`${node.id}#${j}`);
      if (next !== undefined) out.push(next);
      const between = node.beats[j];
      if (between !== undefined && !skippable(between)) break;
    }
    // 跨节点：本拍之后可能没有拍了
    const tailAllSkippable = node.beats
      .slice(v.index + 1)
      .every((b) => skippable(b));
    if (tailAllSkippable && node.kind === 'scene') {
      const targets =
        node.next !== undefined ? [node.next] : (node.choices ?? []).map((c) => c.target);
      for (const t of targets) {
        const nextNode = nodeMap.get(t);
        if (nextNode === undefined) continue;
        for (let j = 0; j < nextNode.beats.length; j += 1) {
          const head = vertices.get(`${t}#${j}`);
          if (head !== undefined) out.push(head);
          const b = nextNode.beats[j];
          if (b !== undefined && !skippable(b)) break;
        }
      }
    }
    return out;
  };

  // 从每个特效拍出发，走 window-1 步，看是否再遇到特效拍
  for (const start of vertices.values()) {
    if (start.beat.effect === undefined) continue;
    let frontier: Vertex[] = [start];
    const seen = new Set<string>([key(start)]);
    for (let step = 1; step < window; step += 1) {
      const nextFrontier: Vertex[] = [];
      for (const v of frontier) {
        for (const w of successorsOf(v)) {
          if (w.beat.effect !== undefined) {
            return [start.beat.id, w.beat.id];
          }
          const k = key(w);
          if (!seen.has(k)) {
            seen.add(k);
            nextFrontier.push(w);
          }
        }
      }
      frontier = nextFrontier;
      if (frontier.length === 0) break;
    }
  }
  return undefined;
}

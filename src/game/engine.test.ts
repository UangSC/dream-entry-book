import { describe, expect, it } from 'vitest';
import { dreamPackageSchema, type DreamPackage } from './schema';
import { validateDreamPackage } from './validate';
import {
  advance,
  chooseOption,
  nodeVisitOrdinal,
  replayView,
  restoreCheckpoint,
  startPackage,
  type ChoiceToken,
  type EngineEvent,
  type SaveState,
} from './engine';

const ASSETS = ['BG_GATE', 'BG_ROOM', 'BG_END', 'BGM_GATE', 'SFX_PAGE'] as const;
const T0 = '2026-09-12T10:00:00+08:00';

/**
 * 测试用梦包。刻意让 mid 与 end-warm 共用 BG_ROOM，
 * 且 mid 末拍 sceneShift 到 BG_END——用来锁住"背景事件必须每次进入节点都发"。
 */
const RAW: unknown = {
  schemaVersion: 1,
  packageId: 'engine-fixture',
  buildId: 'build-001',
  title: '引擎夹具',
  source: {
    kind: 'original_demo',
    title: '原创示例',
    author: null,
    workId: null,
    completeness: 'complete',
    trailingFragment: false,
    sourceHash: 'b'.repeat(64),
    paragraphIds: ['p-0001'],
    sourceUrl: null,
    linkStatus: 'missing',
    rightsRef: '项目自有设定',
  },
  review: {
    status: 'approved',
    reviewedBuildId: 'build-001',
    reviewedAt: T0,
    reviewer: '人工审读',
  },
  theme: 'calm',
  characters: [{ id: 'lin-yue', name: '林月' }],
  resources: [{ id: 'calm', label: '心绪', min: 0, max: 5, initial: 3 }],
  relationships: [
    { id: 'trust', characterId: 'lin-yue', label: '信任', min: -2, max: 2, initial: 0 },
  ],
  flags: [{ id: 'knows-secret', label: '知道秘密', kind: 'knowledge' }],
  entryNodeId: 'gate',
  nodes: [
    {
      id: 'gate',
      kind: 'scene',
      origin: 'original',
      sourceRefs: ['p-0001'],
      scene: 'BG_GATE',
      beats: [
        {
          id: 'b-g1',
          kind: 'narration',
          speaker: 'narrator',
          text: '灯下的书页翻开了。',
          musicCue: { action: 'play', track: 'BGM_GATE' },
        },
        {
          id: 'b-g2',
          kind: 'narration',
          speaker: 'narrator',
          text: '你已经知道了那件事。',
          when: { all: [{ kind: 'flag', id: 'knows-secret', equals: true }] },
        },
      ],
      choices: [
        {
          id: 'c-stay',
          text: '留下听完',
          target: 'mid',
          effects: {
            resourceDeltas: { calm: 1 },
            relationshipDeltas: { trust: 1 },
            setFlags: ['knows-secret'],
          },
        },
        {
          id: 'c-go',
          text: '合上书离开',
          target: 'end-cold',
          effects: { resourceDeltas: {}, relationshipDeltas: {}, setFlags: [] },
        },
        {
          id: 'c-risky',
          text: '追问到底',
          target: 'mid',
          // 心绪足够时才出现，用来测"不可见选项拒绝结算" 
          when: { all: [{ kind: 'resource', id: 'calm', op: 'gte', value: 3 }] },
          effects: { resourceDeltas: { calm: 1 }, relationshipDeltas: {}, setFlags: [] },
        },
      ],
    },
    {
      id: 'mid',
      kind: 'scene',
      origin: 'original',
      sourceRefs: ['p-0001'],
      scene: 'BG_ROOM',
      beats: [
        { id: 'b-m1', kind: 'dialogue', speaker: 'lin-yue', text: '你来了。', sfx: 'SFX_PAGE' },
        {
          id: 'b-m2',
          kind: 'narration',
          speaker: 'narrator',
          text: '窗外的光移了半寸。',
          sceneShift: 'BG_END',
          musicCue: { action: 'silence' },
        },
      ],
      next: 'end-warm',
    },
    {
      id: 'end-warm',
      kind: 'ending',
      origin: 'original',
      sourceRefs: ['p-0001'],
      // 与 mid 相同：用来验证仍然发出背景事件
      scene: 'BG_ROOM',
      beats: [{ id: 'b-w1', kind: 'narration', speaker: 'narrator', text: '你带着暖意醒来。' }],
      ending: {
        id: 'e-warm',
        title: '晨光',
        summary: '你带着暖意醒来。',
        reflections: [
          { text: '你记得灯下那一页。' },
          {
            text: '你记得她说过的那件事。',
            when: { all: [{ kind: 'flag', id: 'knows-secret', equals: true }] },
          },
        ],
        outcomes: [{ characterId: 'lin-yue', text: '她留在了书屋。' }],
      },
    },
    {
      id: 'end-cold',
      kind: 'ending',
      origin: 'original',
      sourceRefs: ['p-0001'],
      scene: 'BG_END',
      beats: [{ id: 'b-c1', kind: 'narration', speaker: 'narrator', text: '灯灭了。' }],
      ending: { id: 'e-cold', title: '雨夜', summary: '你带着凉意醒来。' },
    },
  ],
};

const PKG: DreamPackage = dreamPackageSchema.parse(RAW);

/**
 * 故意含越界路径的梦包：schema 放行，静态分析会拒，运行时也必须拒。
 * 引擎那道检查是纵深防御——跳过校验的包、或被手改的存档，仍然不许静默截断。
 */
const RAW_BAD: unknown = (() => {
  const clone = JSON.parse(JSON.stringify(RAW)) as {
    nodes: Array<{ choices?: Array<{ id: string; effects: { resourceDeltas: Record<string, number> } }> }>;
  };
  const risky = clone.nodes[0]?.choices?.find((c) => c.id === 'c-risky');
  if (risky === undefined) throw new Error('夹具结构变了，找不到 c-risky');
  risky.effects.resourceDeltas['calm'] = 5; // 3 + 5 = 8，越出 0..5
  return clone;
})();
const BAD: DreamPackage = dreamPackageSchema.parse(RAW_BAD);

/** 取成功结果，失败时把错误信息带进断言，便于定位。 */
const must = (r: ReturnType<typeof startPackage>): { state: SaveState; events: readonly EngineEvent[] } => {
  if (!r.ok) throw new Error(`期望成功，实际失败：${r.error.code} ${r.error.message}`);
  return { state: r.state, events: r.events };
};

const tokenFor = (state: SaveState, choiceId: string): ChoiceToken => ({
  nodeId: state.nodeId,
  nodeVisit: nodeVisitOrdinal(state.choiceHistory, state.nodeId),
  choiceId,
  revision: state.revision,
});

const kinds = (events: readonly EngineEvent[]) => events.map((e) => e.type);
const scenes = (events: readonly EngineEvent[]) =>
  events.filter((e) => e.type === 'scene').map((e) => (e as { assetId: string }).assetId);

describe('夹具本身合规', () => {
  it('通过校验器，避免用非法梦包测引擎', () => {
    const res = validateDreamPackage(RAW, { assetIds: ASSETS, forPublish: true });
    expect(res.findings.filter((f) => f.severity === 'error')).toEqual([]);
  });
});

describe('开局', () => {
  it('按声明初始化，并停在首个可见拍', () => {
    const { state, events } = must(startPackage(PKG, T0));
    expect(state.resources).toEqual({ calm: 3 });
    expect(state.relationships).toEqual({ trust: 0 });
    expect(state.flags).toEqual({ 'knows-secret': false });
    expect(state.nodeId).toBe('gate');
    expect(state.beatIndex).toBe(0);
    expect(state.choiceHistory).toEqual([]);
    expect(state.checkpoints).toEqual([]);
    expect(kinds(events)).toEqual(['scene', 'beat', 'music', 'choices']);
  });

  it('条件拍不可见时，末拍带 choices 即进入 choosing', () => {
    const { state } = must(startPackage(PKG, T0));
    // b-g2 需要 knows-secret，此时为 false
    expect(state.phase).toBe('choosing');
  });

  it('条件满足时同一节点变成 reading，不提前给选项', () => {
    const base = must(startPackage(PKG, T0)).state;
    const withFlag: SaveState = { ...base, flags: { 'knows-secret': true } };
    // 从 b-g1 推进应看到 b-g2，而不是直接要求选择
    const { state, events } = must(advance(PKG, withFlag, T0));
    expect(state.beatIndex).toBe(1);
    expect(state.phase).toBe('choosing');
    expect(kinds(events)).toContain('beat');
  });
});

describe('推进', () => {
  it('choosing 阶段拒绝推进，绝不代选', () => {
    const { state } = must(startPackage(PKG, T0));
    const r = advance(PKG, state, T0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('wrong-phase');
  });

  it('终幕后拒绝继续推进', () => {
    let s = must(startPackage(PKG, T0)).state;
    s = must(chooseOption(PKG, s, tokenFor(s, 'c-go'), T0)).state;
    expect(s.phase).toBe('finished');
    const r = advance(PKG, s, T0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('wrong-phase');
  });

  it('拍内推进产出 sceneShift 与 musicCue 事件', () => {
    let s = must(startPackage(PKG, T0)).state;
    s = must(chooseOption(PKG, s, tokenFor(s, 'c-stay'), T0)).state;
    const { state, events } = must(advance(PKG, s, T0));
    expect(state.beatIndex).toBe(1);
    expect(scenes(events)).toEqual(['BG_END']);
    expect(events.some((e) => e.type === 'music' && e.action === 'silence')).toBe(true);
  });

  it('末拍后按 next 跳节点，并且即使 scene 与上一节点相同也重发背景', () => {
    let s = must(startPackage(PKG, T0)).state;
    s = must(chooseOption(PKG, s, tokenFor(s, 'c-stay'), T0)).state;
    s = must(advance(PKG, s, T0)).state; // b-m2，sceneShift 到 BG_END
    const { state, events } = must(advance(PKG, s, T0));
    expect(state.nodeId).toBe('end-warm');
    expect(state.phase).toBe('finished');
    // mid 与 end-warm 都声明 BG_ROOM；若按"与上一节点相同就不发"就会漏掉，
    // 画面会停在 sceneShift 留下的 BG_END
    expect(scenes(events)).toEqual(['BG_ROOM']);
    expect(events.some((e) => e.type === 'ending')).toBe(true);
  });

  it('revision 单调增加', () => {
    const a = must(startPackage(PKG, T0)).state;
    let s = must(chooseOption(PKG, a, tokenFor(a, 'c-stay'), T0)).state;
    const before = s.revision;
    s = must(advance(PKG, s, T0)).state;
    expect(s.revision).toBeGreaterThan(before);
  });
});

describe('选择结算', () => {
  it('应用增量、置标记、记历史，并保存选择前的检查点', () => {
    const s0 = must(startPackage(PKG, T0)).state;
    const { state, events } = must(chooseOption(PKG, s0, tokenFor(s0, 'c-stay'), T0));
    expect(state.resources).toEqual({ calm: 4 });
    expect(state.relationships).toEqual({ trust: 1 });
    expect(state.flags).toEqual({ 'knows-secret': true });
    expect(state.choiceHistory).toEqual([{ nodeId: 'gate', choiceId: 'c-stay' }]);
    expect(state.nodeId).toBe('mid');
    // 检查点保存的是选择前的值
    expect(state.checkpoints).toHaveLength(1);
    expect(state.checkpoints[0]?.vars.resources).toEqual({ calm: 3 });
    expect(state.checkpoints[0]?.vars.flags).toEqual({ 'knows-secret': false });
    expect(state.checkpoints[0]?.choiceHistory).toEqual([]);
    expect(kinds(events)).toEqual(['scene', 'beat', 'sfx']);
  });

  it('重复点击同一令牌只结算一次，安静忽略', () => {
    const s0 = must(startPackage(PKG, T0)).state;
    const token = tokenFor(s0, 'c-stay');
    const first = must(chooseOption(PKG, s0, token, T0));
    const again = chooseOption(PKG, first.state, token, T0);
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect('stale' in again && again.stale).toBe(true);
      expect(again.events).toEqual([]);
      // 资源没有被加第二次
      expect(again.state.resources).toEqual({ calm: 4 });
      expect(again.state).toBe(first.state);
    }
  });

  it('过期 revision 的点击被判为 stale 而不是报错', () => {
    const s0 = must(startPackage(PKG, T0)).state;
    const stale: ChoiceToken = { ...tokenFor(s0, 'c-go'), revision: s0.revision - 1 };
    const r = chooseOption(PKG, s0, stale, T0);
    expect(r.ok).toBe(true);
    if (r.ok) expect('stale' in r && r.stale).toBe(true);
  });

  it('越界视为制作错误，不截断', () => {
    const s0 = must(startPackage(BAD, T0)).state;
    const r = chooseOption(BAD, s0, tokenFor(s0, 'c-risky'), T0);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('out-of-range');
      expect(r.error.message).toContain('不截断');
    }
  });

  it('这样的越界包在制作期就会被静态分析拦下，不必等玩家撞上', () => {
    const res = validateDreamPackage(RAW_BAD, { assetIds: ASSETS });
    expect(res.ok).toBe(false);
    expect(res.findings.map((f) => f.code)).toContain('value-out-of-range');
  });

  it('不可见选项拒绝结算', () => {
    const s0 = must(startPackage(PKG, T0)).state;
    // 心绪降到 2，c-risky 的 when 不再成立
    const low: SaveState = { ...s0, resources: { calm: 2 } };
    const r = chooseOption(PKG, low, tokenFor(low, 'c-risky'), T0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('choice-hidden');
  });

  it('不存在的选项 ID 报错', () => {
    const s0 = must(startPackage(PKG, T0)).state;
    const r = chooseOption(PKG, s0, tokenFor(s0, 'c-nope'), T0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('unknown-choice');
  });

  it('尚未读完本节点时不能结算，且按真实状态推导而不信存档里的 phase', () => {
    const s0 = must(startPackage(PKG, T0)).state;
    // 让 b-g2 变为可见：beatIndex 0 之后仍有可见拍，等于本节点没读完。
    // 同时把存档 phase 写成宽松的 choosing，验证引擎不采信它。
    const notFinished: SaveState = {
      ...s0,
      flags: { 'knows-secret': true },
      beatIndex: 0,
      phase: 'choosing',
    };
    const r = chooseOption(PKG, notFinished, tokenFor(notFinished, 'c-stay'), T0);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('wrong-phase');
      expect(r.error.message).toContain('reading');
    }
  });
});

describe('已读集合', () => {
  it('首次进入的拍算首读，并记入已读集合', () => {
    const s0 = must(startPackage(PKG, T0)).state;
    const first = must(chooseOption(PKG, s0, tokenFor(s0, 'c-stay'), T0));
    expect(first.events.some((e) => e.type === 'beat' && e.firstRead)).toBe(true);
    expect(first.state.readBeatKeys.some((k) => k.endsWith('|mid|b-m1'))).toBe(true);
  });

  it('推进到新拍时逐拍累积，不重复记同一键', () => {
    let s = must(startPackage(PKG, T0)).state;
    s = must(chooseOption(PKG, s, tokenFor(s, 'c-stay'), T0)).state;
    const afterFirst = s.readBeatKeys.length;
    s = must(advance(PKG, s, T0)).state;
    expect(s.readBeatKeys.length).toBe(afterFirst + 1);
    expect(new Set(s.readBeatKeys).size).toBe(s.readBeatKeys.length);
  });

  it('从这里重选按契约恢复已读记录，因此重走同一路线会再次算首读', () => {
    const s0 = must(startPackage(PKG, T0)).state;
    const first = must(chooseOption(PKG, s0, tokenFor(s0, 'c-stay'), T0));
    const back = must(restoreCheckpoint(PKG, first.state, 0, T0)).state;
    // 契约规定"从这里重选"恢复选择前的已读记录，所以那条键被丢弃
    expect(back.readBeatKeys.some((k) => k.endsWith('|mid|b-m1'))).toBe(false);
    const second = must(chooseOption(PKG, back, tokenFor(back, 'c-stay'), T0));
    expect(second.events.some((e) => e.type === 'beat' && e.firstRead)).toBe(true);
  });

  it('不同选择路径的同一拍算作不同已读键', () => {
    const s0 = must(startPackage(PKG, T0)).state;
    const viaStay = must(chooseOption(PKG, s0, tokenFor(s0, 'c-stay'), T0)).state;
    const back = must(restoreCheckpoint(PKG, viaStay, 0, T0)).state;
    // 走另一条路，进入的是 end-cold，其拍从未读过
    const other = must(chooseOption(PKG, back, tokenFor(back, 'c-go'), T0));
    expect(other.events.some((e) => e.type === 'beat' && e.firstRead)).toBe(true);
  });
});

describe('从这里重选', () => {
  it('恢复选择前状态并截断其后的检查点', () => {
    const s0 = must(startPackage(PKG, T0)).state;
    const chosen = must(chooseOption(PKG, s0, tokenFor(s0, 'c-stay'), T0)).state;
    const restored = must(restoreCheckpoint(PKG, chosen, 0, T0)).state;
    expect(restored.nodeId).toBe('gate');
    expect(restored.resources).toEqual({ calm: 3 });
    expect(restored.relationships).toEqual({ trust: 0 });
    expect(restored.flags).toEqual({ 'knows-secret': false });
    expect(restored.choiceHistory).toEqual([]);
    expect(restored.checkpoints).toEqual([]);
  });

  it('恢复产生新 revision，旧令牌随即失效', () => {
    const s0 = must(startPackage(PKG, T0)).state;
    const oldToken = tokenFor(s0, 'c-stay');
    const chosen = must(chooseOption(PKG, s0, oldToken, T0)).state;
    const restored = must(restoreCheckpoint(PKG, chosen, 0, T0)).state;
    expect(restored.revision).toBeGreaterThan(s0.revision);
    const r = chooseOption(PKG, restored, oldToken, T0);
    expect(r.ok).toBe(true);
    if (r.ok) expect('stale' in r && r.stale).toBe(true);
  });

  it('不存在的检查点报 save-mismatch', () => {
    const s0 = must(startPackage(PKG, T0)).state;
    const r = restoreCheckpoint(PKG, s0, 3, T0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('save-mismatch');
  });

  it('新路线不继承旧路线的标记', () => {
    const s0 = must(startPackage(PKG, T0)).state;
    const stay = must(chooseOption(PKG, s0, tokenFor(s0, 'c-stay'), T0)).state;
    expect(stay.flags['knows-secret']).toBe(true);
    const back = must(restoreCheckpoint(PKG, stay, 0, T0)).state;
    const go = must(chooseOption(PKG, back, tokenFor(back, 'c-go'), T0)).state;
    expect(go.flags['knows-secret']).toBe(false);
  });
});

describe('回放', () => {
  it('重放出当前背景与静默状态', () => {
    let s = must(startPackage(PKG, T0)).state;
    s = must(chooseOption(PKG, s, tokenFor(s, 'c-stay'), T0)).state;
    s = must(advance(PKG, s, T0)).state; // b-m2：sceneShift BG_END + silence
    const r = replayView(PKG, s);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.view.scene).toBe('BG_END');
      expect(r.view.silenced).toBe(true);
      expect(r.view.track).toBeNull();
    }
  });

  it('开局重放给出入口背景与开场曲', () => {
    const s = must(startPackage(PKG, T0)).state;
    const r = replayView(PKG, s);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.view.scene).toBe('BG_GATE');
      expect(r.view.track).toBe('BGM_GATE');
      expect(r.view.silenced).toBe(false);
    }
  });

  it('存档与梦包构建号不一致时拒绝重放', () => {
    const s = must(startPackage(PKG, T0)).state;
    const r = replayView(PKG, { ...s, buildId: 'build-999' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('save-mismatch');
  });
});

describe('节点访问序号', () => {
  it('按历史里出现次数推导，不额外存字段', () => {
    expect(nodeVisitOrdinal([], 'gate')).toBe(1);
    expect(nodeVisitOrdinal([{ nodeId: 'gate', choiceId: 'c-stay' }], 'gate')).toBe(2);
    expect(nodeVisitOrdinal([{ nodeId: 'mid', choiceId: 'x' }], 'gate')).toBe(1);
  });
});

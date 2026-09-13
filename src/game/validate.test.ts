import { describe, expect, it } from 'vitest';
import { validateDreamPackage, type Finding } from './validate';

const ASSETS = ['BG_GATE', 'BG_END', 'BGM_GATE', 'BGM_DREAM', 'SFX_PAGE', 'SFX_CHOICE'] as const;

/** 一个通过全部校验的最小梦包，各测试只改动其中一处。 */
function baseline(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    packageId: 'demo-story',
    buildId: 'build-001',
    title: '入梦书示例',
    source: {
      kind: 'original_demo',
      title: '原创示例',
      author: null,
      workId: null,
      completeness: 'complete',
      trailingFragment: false,
      sourceHash: 'a'.repeat(64),
      paragraphIds: ['p-0001'],
      sourceUrl: null,
      linkStatus: 'missing',
      rightsRef: '项目自有设定',
    },
    review: {
      status: 'approved',
      reviewedBuildId: 'build-001',
      reviewedAt: '2026-09-12T10:00:00+08:00',
      reviewer: '人工审读',
    },
    theme: 'calm',
    characters: [{ id: 'lin-yue', name: '林月' }],
    resources: [{ id: 'calm', label: '心绪', min: 0, max: 5, initial: 3 }],
    relationships: [],
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
            id: 'b-gate-1',
            kind: 'narration',
            speaker: 'narrator',
            text: '灯下的书页翻开了。',
            anim: 'fade',
          },
        ],
        choices: [
          {
            id: 'c-left',
            text: '向左走',
            target: 'left',
            effects: { resourceDeltas: { calm: 1 }, relationshipDeltas: {}, setFlags: [] },
          },
          {
            id: 'c-right',
            text: '向右走',
            target: 'right',
            effects: { resourceDeltas: {}, relationshipDeltas: {}, setFlags: ['knows-secret'] },
          },
        ],
      },
      {
        id: 'left',
        kind: 'scene',
        origin: 'original',
        sourceRefs: ['p-0001'],
        scene: 'BG_GATE',
        beats: [
          { id: 'b-left-1', kind: 'dialogue', speaker: 'lin-yue', text: '你来了。' },
        ],
        next: 'ending-warm',
      },
      {
        id: 'right',
        kind: 'scene',
        origin: 'original',
        sourceRefs: ['p-0001'],
        scene: 'BG_GATE',
        beats: [{ id: 'b-right-1', kind: 'thought', speaker: 'lin-yue', text: '还是走了。' }],
        next: 'ending-cold',
      },
      {
        id: 'ending-warm',
        kind: 'ending',
        origin: 'original',
        sourceRefs: ['p-0001'],
        scene: 'BG_END',
        beats: [{ id: 'b-warm-1', kind: 'narration', speaker: 'narrator', text: '窗外亮了。' }],
        ending: { id: 'e-warm', title: '晨光', summary: '你带着暖意醒来。' },
      },
      {
        id: 'ending-cold',
        kind: 'ending',
        origin: 'original',
        sourceRefs: ['p-0001'],
        scene: 'BG_END',
        beats: [{ id: 'b-cold-1', kind: 'narration', speaker: 'narrator', text: '灯灭了。' }],
        ending: { id: 'e-cold', title: '雨夜', summary: '你带着凉意醒来。' },
      },
    ],
  };
}

const run = (pkg: unknown, forPublish = false) =>
  validateDreamPackage(pkg, { assetIds: ASSETS, forPublish });

const codes = (findings: Finding[]) => findings.filter((f) => f.severity === 'error').map((f) => f.code);
const messages = (findings: Finding[]) => findings.map((f) => f.message).join(' || ');

/** 便于在深层对象上定点改写。 */
const nodes = (pkg: Record<string, unknown>) => pkg['nodes'] as Record<string, any>[];

describe('baseline', () => {
  it('通过全部校验', () => {
    const res = run(baseline(), true);
    expect(res.findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(res.ok).toBe(true);
    expect(res.data?.packageId).toBe('demo-story');
  });

  it('未提供资产列表时给出警告但不失败', () => {
    const res = validateDreamPackage(baseline());
    expect(res.ok).toBe(true);
    expect(res.findings.map((f) => f.code)).toContain('assets-unchecked');
  });
});

describe('拍级规则', () => {
  it('anim 与 effect 互斥', () => {
    const pkg = baseline();
    nodes(pkg)[0]!['beats'][0]!['effect'] = { type: 'emerge', durationMs: 500 };
    const res = run(pkg);
    expect(res.ok).toBe(false);
    expect(messages(res.findings)).toContain('互斥');
  });

  it('narration 的 speaker 必须是 narrator', () => {
    const pkg = baseline();
    nodes(pkg)[0]!['beats'][0]!['speaker'] = 'lin-yue';
    expect(run(pkg).ok).toBe(false);
  });

  it('对白不能借用 narrator', () => {
    const pkg = baseline();
    nodes(pkg)[1]!['beats'][0]!['speaker'] = 'narrator';
    expect(run(pkg).ok).toBe(false);
  });

  it('speaker 必须已在 characters 声明', () => {
    const pkg = baseline();
    nodes(pkg)[1]!['beats'][0]!['speaker'] = 'unknown-person';
    expect(codes(run(pkg).findings)).toContain('unknown-ref');
  });

  it('text 上限按码点计，241 码点失败', () => {
    const pkg = baseline();
    nodes(pkg)[0]!['beats'][0]!['text'] = '字'.repeat(241);
    expect(run(pkg).ok).toBe(false);
  });

  it('240 码点的 emoji 文本不因 UTF-16 长度被误判', () => {
    const pkg = baseline();
    // 每个 emoji 的 UTF-16 length 为 2，若用 s.length 判断会在 120 个时就误报
    nodes(pkg)[0]!['beats'][0]!['text'] = '🌙'.repeat(240);
    expect(run(pkg).ok).toBe(true);
  });

  it('musicCue=play 必须带 track', () => {
    const pkg = baseline();
    nodes(pkg)[0]!['beats'][0]!['musicCue'] = { action: 'play' };
    expect(run(pkg).ok).toBe(false);
  });

  it('musicCue=silence 不应带 track', () => {
    const pkg = baseline();
    nodes(pkg)[0]!['beats'][0]!['musicCue'] = { action: 'silence', track: 'BGM_DREAM' };
    expect(run(pkg).ok).toBe(false);
  });

  it('节点所有拍都带 when 时报错', () => {
    const pkg = baseline();
    nodes(pkg)[1]!['beats'][0]!['when'] = {
      all: [{ kind: 'flag', id: 'knows-secret', equals: true }],
    };
    expect(codes(run(pkg).findings)).toContain('all-conditional');
  });
});

describe('节点连接', () => {
  it('scene 同时给 next 和 choices 失败', () => {
    const pkg = baseline();
    nodes(pkg)[0]!['next'] = 'left';
    expect(run(pkg).ok).toBe(false);
  });

  it('scene 既无 next 也无 choices 失败', () => {
    const pkg = baseline();
    delete nodes(pkg)[1]!['next'];
    expect(run(pkg).ok).toBe(false);
  });

  it('next 指向不存在的节点', () => {
    const pkg = baseline();
    nodes(pkg)[1]!['next'] = 'nowhere';
    expect(codes(run(pkg).findings)).toContain('unknown-ref');
  });

  it('不可达节点被发现', () => {
    const pkg = baseline();
    nodes(pkg)[0]!['choices'][1]!['target'] = 'left';
    const res = run(pkg);
    expect(codes(res.findings)).toContain('unreachable');
    expect(messages(res.findings)).toContain('right');
  });

  it('没有可达终幕时失败', () => {
    const pkg = baseline();
    // 让两个分支互相指回，终幕虽存在但不可达
    nodes(pkg)[1]!['next'] = 'right';
    nodes(pkg)[2]!['next'] = 'left';
    expect(codes(run(pkg).findings)).toContain('no-ending');
  });

  it('入口不存在时立即失败', () => {
    const pkg = baseline();
    pkg['entryNodeId'] = 'missing-node';
    expect(run(pkg).ok).toBe(false);
  });
});

describe('引用与资产', () => {
  it('setFlags 引用未声明标记', () => {
    const pkg = baseline();
    nodes(pkg)[0]!['choices'][1]!['effects']['setFlags'] = ['ghost-flag'];
    expect(codes(run(pkg).findings)).toContain('unknown-ref');
  });

  it('资源增量引用未声明资源', () => {
    const pkg = baseline();
    nodes(pkg)[0]!['choices'][0]!['effects']['resourceDeltas'] = { ghost: 1 };
    expect(codes(run(pkg).findings)).toContain('unknown-ref');
  });

  it('未登记的资产被拒', () => {
    const pkg = baseline();
    nodes(pkg)[0]!['scene'] = 'BG_NOT_IN_MANIFEST';
    expect(codes(run(pkg).findings)).toContain('unknown-asset');
  });

  it('sceneShift 必须是 BG_ 前缀', () => {
    const pkg = baseline();
    nodes(pkg)[0]!['beats'][0]!['sceneShift'] = 'SFX_PAGE';
    expect(run(pkg).ok).toBe(false);
  });

  it('重复节点 ID 被发现', () => {
    const pkg = baseline();
    nodes(pkg)[2]!['id'] = 'left';
    expect(codes(run(pkg).findings)).toContain('duplicate-id');
  });

  it('跨节点重复的拍 ID 被发现', () => {
    const pkg = baseline();
    nodes(pkg)[2]!['beats'][0]!['id'] = 'b-left-1';
    expect(codes(run(pkg).findings)).toContain('duplicate-id');
  });
});

describe('演出配额', () => {
  const withEffects = (count: number, type = 'emerge') => {
    const pkg = baseline();
    // 造一条长链，把特效拍分散到不同节点，避免触发间隔规则
    const chain: Record<string, unknown>[] = [];
    for (let i = 0; i < count; i += 1) {
      chain.push({
        id: `filler-${i}`,
        kind: 'scene',
        origin: 'original',
        sourceRefs: ['p-0001'],
        scene: 'BG_GATE',
        beats: [
          {
            id: `b-fx-${i}`,
            kind: 'narration',
            speaker: 'narrator',
            text: '一句。',
            effect: { type },
          },
          { id: `b-pad-${i}-a`, kind: 'narration', speaker: 'narrator', text: '二。' },
          { id: `b-pad-${i}-b`, kind: 'narration', speaker: 'narrator', text: '三。' },
          { id: `b-pad-${i}-c`, kind: 'narration', speaker: 'narrator', text: '四。' },
        ],
        next: i + 1 < count ? `filler-${i + 1}` : 'ending-warm',
      });
    }
    nodes(pkg)[1]!['next'] = 'filler-0';
    (pkg['nodes'] as unknown[]).push(...chain);
    return pkg;
  };

  it('6 个入场特效在配额内', () => {
    const res = run(withEffects(6));
    expect(codes(res.findings)).not.toContain('effect-quota');
  });

  it('7 个特效超配额', () => {
    expect(codes(run(withEffects(7)).findings)).toContain('effect-quota');
  });

  it('4 次拆字类超配额', () => {
    const res = run(withEffects(4, 'shatter'));
    expect(codes(res.findings)).toContain('effect-quota');
    expect(messages(res.findings)).toContain('拆字类');
  });

  it('durationMs 超出该类型预算', () => {
    const pkg = baseline();
    delete nodes(pkg)[0]!['beats'][0]!['anim'];
    nodes(pkg)[0]!['beats'][0]!['effect'] = { type: 'emerge', durationMs: 2000 };
    expect(run(pkg).ok).toBe(false);
  });

  it('同节点内相邻特效拍触发间隔规则', () => {
    const pkg = baseline();
    delete nodes(pkg)[0]!['beats'][0]!['anim'];
    nodes(pkg)[0]!['beats'][0]!['effect'] = { type: 'emerge' };
    nodes(pkg)[0]!['beats'].push({
      id: 'b-gate-2',
      kind: 'narration',
      speaker: 'narrator',
      text: '紧接着一句。',
      effect: { type: 'focusIn' },
    });
    expect(codes(run(pkg).findings)).toContain('effect-gap');
  });

  it('跨节点相邻的特效拍同样触发间隔规则', () => {
    const pkg = baseline();
    delete nodes(pkg)[1]!['beats'][0]!['anim'];
    nodes(pkg)[1]!['beats'][0]!['effect'] = { type: 'emerge' };
    nodes(pkg)[3]!['beats'][0]!['effect'] = { type: 'dissolve' };
    expect(codes(run(pkg).findings)).toContain('effect-gap');
  });

  it('间隔足够时不报错', () => {
    const pkg = baseline();
    delete nodes(pkg)[0]!['beats'][0]!['anim'];
    nodes(pkg)[0]!['beats'][0]!['effect'] = { type: 'emerge' };
    for (const id of ['b-gate-2', 'b-gate-3', 'b-gate-4']) {
      nodes(pkg)[0]!['beats'].push({
        id,
        kind: 'narration',
        speaker: 'narrator',
        text: '过渡。',
      });
    }
    nodes(pkg)[0]!['beats'].push({
      id: 'b-gate-5',
      kind: 'narration',
      speaker: 'narrator',
      text: '远处一句。',
      effect: { type: 'dissolve' },
    });
    expect(codes(run(pkg).findings)).not.toContain('effect-gap');
  });
});

describe('来源与审读', () => {
  it('比赛来源必须是节选', () => {
    const pkg = baseline();
    pkg['source'] = {
      ...(pkg['source'] as object),
      kind: 'hackathon_excerpt',
      workId: 'w-1',
      completeness: 'complete',
    };
    expect(run(pkg).ok).toBe(false);
  });

  it('original_demo 不得带 workId', () => {
    const pkg = baseline();
    (pkg['source'] as Record<string, unknown>)['workId'] = 'w-1';
    expect(run(pkg).ok).toBe(false);
  });

  it('verified 链接必须在受控主机白名单内', () => {
    const pkg = baseline();
    pkg['source'] = {
      ...(pkg['source'] as object),
      sourceUrl: 'https://zhihu.com.evil.example/p/1',
      linkStatus: 'verified',
    };
    const res = run(pkg);
    expect(res.ok).toBe(false);
    expect(messages(res.findings)).toContain('白名单');
  });

  it('接受合规的知乎链接', () => {
    const pkg = baseline();
    pkg['source'] = {
      ...(pkg['source'] as object),
      sourceUrl: 'https://zhuanlan.zhihu.com/p/123456',
      linkStatus: 'verified',
    };
    expect(run(pkg).ok).toBe(true);
  });

  it('拒绝非 HTTPS 链接', () => {
    const pkg = baseline();
    pkg['source'] = {
      ...(pkg['source'] as object),
      sourceUrl: 'http://www.zhihu.com/p/1',
      linkStatus: 'verified',
    };
    expect(run(pkg).ok).toBe(false);
  });

  it('发布模式要求 approved', () => {
    const pkg = baseline();
    (pkg['review'] as Record<string, unknown>)['status'] = 'draft';
    expect(codes(run(pkg, true).findings)).toContain('review');
    expect(run(pkg, false).ok).toBe(true);
  });

  it('审读构建号与当前构建不一致时拒绝发布', () => {
    const pkg = baseline();
    pkg['buildId'] = 'build-002';
    expect(codes(run(pkg, true).findings)).toContain('review');
  });
});

describe('终幕回响与人物去向', () => {
  it('接受合规的 reflections 与 outcomes', () => {
    const pkg = baseline();
    nodes(pkg)[3]!['ending']['reflections'] = [
      { text: '你想起灯下那一页。' },
      { text: '你记得她没有回头。', when: { all: [{ kind: 'flag', id: 'knows-secret', equals: true }] } },
    ];
    nodes(pkg)[3]!['ending']['outcomes'] = [{ characterId: 'lin-yue', text: '她留在了书屋。' }];
    expect(run(pkg, true).findings.filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('outcomes 指向未声明人物时报错', () => {
    const pkg = baseline();
    nodes(pkg)[3]!['ending']['outcomes'] = [{ characterId: 'ghost-person', text: '不知去向。' }];
    const res = run(pkg);
    expect(codes(res.findings)).toContain('unknown-ref');
    expect(messages(res.findings)).toContain('ghost-person');
  });

  it('reflections 的 when 引用未声明标记时报错', () => {
    const pkg = baseline();
    nodes(pkg)[3]!['ending']['reflections'] = [
      { text: '一条回响。', when: { all: [{ kind: 'flag', id: 'ghost-flag', equals: true }] } },
    ];
    expect(codes(run(pkg).findings)).toContain('unknown-ref');
  });

  it('outcomes 的 when 引用未声明资源时报错', () => {
    const pkg = baseline();
    nodes(pkg)[3]!['ending']['outcomes'] = [
      {
        characterId: 'lin-yue',
        text: '她走了。',
        when: { all: [{ kind: 'resource', id: 'ghost-res', op: 'gte', value: 1 }] },
      },
    ];
    expect(codes(run(pkg).findings)).toContain('unknown-ref');
  });

  it('reflections 超过 4 条被拒', () => {
    const pkg = baseline();
    nodes(pkg)[3]!['ending']['reflections'] = Array.from({ length: 5 }, (_, i) => ({
      text: `回响${i}`,
    }));
    expect(run(pkg).ok).toBe(false);
  });

  it('outcomes 超过 6 条被拒', () => {
    const pkg = baseline();
    nodes(pkg)[3]!['ending']['outcomes'] = Array.from({ length: 7 }, () => ({
      characterId: 'lin-yue',
      text: '去向。',
    }));
    expect(run(pkg).ok).toBe(false);
  });
});

describe('上限', () => {
  it('超过 1 MiB 报错', () => {
    const res = validateDreamPackage(baseline(), {
      assetIds: ASSETS,
      byteLength: 1024 * 1024 + 1,
    });
    expect(codes(res.findings)).toContain('size');
  });

  it('状态组合爆炸被拦下', () => {
    const pkg = baseline();
    pkg['flags'] = Array.from({ length: 20 }, (_, i) => ({
      id: `flag-${i}`,
      label: `标记${i}`,
      kind: 'knowledge',
    }));
    expect(codes(run(pkg).findings)).toContain('state-explosion');
  });

  it('未知顶层字段被拒（strict）', () => {
    const pkg = baseline();
    pkg['unexpectedField'] = 1;
    expect(run(pkg).ok).toBe(false);
  });
});

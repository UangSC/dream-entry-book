import type { Condition, DreamNode, SceneNode } from '../src/game/schema';

export const FLAG_GROUPS = {
  fireside: ['warmed', 'bargained'], doorstep: ['faced-zhang', 'took-chicken'],
  'promise-day': ['ate', 'kept-hands', 'changed-price'], 'empty-house': ['said-truth', 'lied'],
  'raised-claw': ['audience-out', 'village-thorn'], 'taoist-danger': ['guarded-all', 'late-by-half'],
  'burn-mountain': ['shielded', 'unseen'], 'years-call': ['went-now', 'asked-first'],
  'zhang-return': ['scared-him', 'just-debt'], taoist: ['hid', 'fought-back'],
  'fork-c8': ['marched-on', 'stopped'], 'borrowed-blade': ['killed-informant', 'judge-rule'],
  'ten-thousand-shield': ['shielded-by-all', 'fought-alone'], 'farewell-ask': ['ascended', 'deferred'],
} as const;
export const FLAGS = Object.values(FLAG_GROUPS).flat();

export const flagCondition = (expression: string): Condition => {
  const flags = expression === 'C8a′' ? ['killed-informant', 'judge-rule'] : expression.split('／').map(flag => flag.trim());
  for (const flag of flags) if (!(FLAGS as readonly string[]).includes(flag)) throw new Error(`未注册旗标：${flag}`);
  const predicates = flags.map(id => ({ kind: 'flag' as const, id, equals: true }));
  return flags.length === 1 ? { all: predicates } : { all: [], any: predicates };
};

export function combineConditions(...conditions: (Condition | undefined)[]): Condition | undefined {
  const present = conditions.filter((condition): condition is Condition => condition !== undefined);
  if (!present.length) return undefined;
  const alternatives = present.flatMap(condition => condition.any ? [condition.any] : []);
  if (alternatives.length > 1 && alternatives.some(any => JSON.stringify(any) !== JSON.stringify(alternatives[0]))) throw new Error('不能丢弃多组 OR 条件');
  const all = [...new Map(present.flatMap(condition => condition.all).map(predicate => [JSON.stringify(predicate), predicate])).values()];
  return { all, ...(alternatives[0] ? { any: alternatives[0] } : {}) };
}

export const NEXT: Record<string, string> = {
  threshold: 'fireside', ember: 'first-breath', price: 'first-breath', 'first-breath': 'doorstep',
  'zhang-gate': 'chicken-leg', 'night-theft': 'chicken-leg', 'chicken-leg': 'zhang-chaos',
  'zhang-chaos': 'grove-echo', 'grove-echo': 'promise-day',
  'red-jacket': 'years-call', 'pit-rescue': 'fame', fame: 'street-kids', 'street-kids': 'zhang-return',
  'zhang-return': 'taoist', search: 'farewell-ask',
  'bitter-heart': 'empty-house', 'empty-house': 'funeral', funeral: 'crack-money',
  'jacket-fit': 'night-fever', 'night-fever': 'guarding', 'beyond-mountains': 'doorstep-answers',
  'doorstep-answers': 'village-altar', 'village-altar': 'raised-claw', 'raised-claw': 'taoist-danger',
  'taoist-danger': 'burn-mountain',
  'blood-words': 'patient-trap', 'patient-trap': 'heart-taste', 'heart-taste': 'fork-c8',
  'demon-road': 'borrowed-blade', 'borrowed-blade': 'years-of-the-king', 'years-of-the-king': 'ending-demon-king',
  'master-comes': 'ten-thousand-shield',
};
const route = (target: string, ...flags: string[]) => ({ target, when: combineConditions(...flags.map(flagCondition))! });
export const NEXT_WHEN: Record<string, NonNullable<SceneNode['nextWhen']>> = {
  'crack-money': [route('jacket-fit', 'said-truth'), route('guarding', 'lied')],
  guarding: [route('beyond-mountains', 'lied'), route('village-altar', 'said-truth')],
  'burn-mountain': [
    route('ending-aftertaste', 'shielded', 'said-truth'), route('ending-bitter-echo', 'shielded', 'lied'),
    route('ending-bitter-mountains', 'unseen', 'guarded-all'), route('ending-bitter', 'unseen', 'late-by-half'),
  ],
};
export const INLINE_CHOICES = new Set(['empty-house', 'zhang-return', 'raised-claw', 'taoist-danger', 'burn-mountain', 'borrowed-blade']);
export const ENDINGS = {
  'ending-ascend': '已得万人心', 'ending-deferred': '先欠着', 'ending-aftertaste': '酸尽回甘',
  'ending-bitter': '不敢应声·空山', 'ending-bitter-echo': '不敢应声·一声', 'ending-bitter-mountains': '不敢应声·满山',
  'ending-demon-king': '妖王不吃鸡腿', 'ending-willing': '心甘情愿',
} as const;

/** 原稿中省略的连续段落门控；锚点唯一匹配，范围变更会让构建失败。 */
const scopes: { node: string; start: string; end?: string; flags: string[]; reason: string }[] = [
  { node: 'chicken-leg', start: '后半夜，那只肥鸡', flags: ['took-chicken'], reason: '肥鸡来自夜取路线' },
  { node: 'pit-rescue', start: '你一步跨出庙门。', end: '这一回，我能做点什么了。', flags: ['went-now'], reason: '立即下山的连续四拍' },
  { node: 'pit-rescue', start: '你在神像前跪了半宿', end: '等来的，是天亮。', flags: ['asked-first'], reason: '问神后等待的连续五拍' },
  { node: 'zhang-return', start: '他说要回家取钱', flags: ['scared-him'], reason: '取钱逃跑只接吓账路线' },
  { node: 'crack-money', start: '吊完米，你顺手', end: '只是你自己那半边', flags: ['said-truth'], reason: '吊米接真话路线钉死门缝之后' },
  { node: 'crack-money', start: '碑立起来那天夜里', end: '是牌位。', flags: ['said-truth'], reason: '无字碑只在真话路线修成' },
  { node: 'crack-money', start: '第二天，念念捧着钱袋', end: '她没喊你出来。', flags: ['faced-zhang'], reason: '谎话路线的钱袋对应讨账来源，与野味互斥' },
  { node: 'guarding', start: '野猪拱村那年', end: '野猪也怕难听。', flags: ['lied'], reason: '赶野猪与山神传说是同一组回忆' },
  { node: 'ending-aftertaste', start: '火苗一舔就没了。', flags: ['bargained'], reason: '烧牌位只发生在立过字据的周目' },
];

export function applyInferredConditions(nodes: DreamNode[]) {
  const log: { node: string; beats: string[]; flags: string[]; reason: string }[] = [];
  for (const scope of scopes) {
    const node = nodes.find(node => node.id === scope.node)!;
    const locate = (anchor: string) => {
      const matches = node.beats.map((beat, index) => beat.text.startsWith(anchor) ? index : -1).filter(index => index >= 0);
      if (matches.length !== 1) throw new Error(`段落门控锚点不唯一：${scope.node} / ${anchor}`);
      return matches[0]!;
    };
    const start = locate(scope.start), end = scope.end ? locate(scope.end) : start;
    if (end < start) throw new Error(`段落门控范围倒置：${scope.node}`);
    const beats = node.beats.slice(start, end + 1);
    for (const beat of beats) beat.when = combineConditions(beat.when, ...scope.flags.map(flagCondition));
    log.push({ node: scope.node, beats: beats.map(beat => beat.id), flags: scope.flags, reason: scope.reason });
  }
  for (const [id, index, flag] of [['ending-bitter', 3, 'lied'], ['ending-bitter-mountains', 0, 'audience-out']] as const) {
    const node = nodes.find(node => node.id === id)!;
    if (node.kind !== 'ending') throw new Error('回望节点缺失');
    const reflection = node.ending.reflections![index]!;
    reflection.when = combineConditions(reflection.when, flagCondition(flag));
    log.push({ node: id, beats: [`reflection-${index + 1}`], flags: [flag], reason: '回望只引用本周目确实发生的动作' });
  }
  return log;
}

export const VOCAL_ANCHORS = [
  { node: 'search', text: '天黑透了，又泛了白，然后又黑了。', track: 'BGM_SEEK_HER' },
  { node: 'farewell-ask', text: '忽然有个声音。可你什么都看不见。', track: 'BGM_FAREWELL' },
  { node: 'burn-mountain', text: '锣，停了。', track: 'BGM_SEEK_HER' },
  { node: 'ending-aftertaste', text: '雨停了。天边裂开一线亮。', track: 'BGM_FAREWELL' },
  { node: 'ending-bitter', text: '后来，雨季过了。', track: 'BGM_ACID' },
  { node: 'ending-bitter-echo', text: '你没死，也没成仙。', track: 'BGM_ACID' },
  { node: 'ending-bitter-mountains', text: '满山的人，没有散。', track: 'BGM_FAREWELL' },
  { node: 'master-comes', text: '你听见山道上，有很多人，在跑。', track: 'BGM_SEEK_HER' },
  { node: 'ending-willing', text: '你快死了。这一次，神仙公公来得很早', track: 'BGM_FAREWELL' },
] as const;

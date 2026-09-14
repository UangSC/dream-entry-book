import type { Beat, DreamNode } from '../src/game/schema';
import { VOCAL_ANCHORS } from './story-contract';

/** 所有演出变化都绑定原文，增减前面的行不会挪走音乐、背景或音效。 */
export function findBeat(nodes: DreamNode[], nodeId: string, anchor: string): Beat {
  const beats = nodes.find(node => node.id === nodeId)?.beats.filter(beat => beat.text.includes(anchor)) ?? [];
  if (beats.length !== 1) throw new Error(`演出锚点需唯一命中：${nodeId} / ${anchor}（${beats.length}）`);
  return beats[0]!;
}

export function stageStory(nodes: DreamNode[]) {
  const tracks: Record<string, string[]> = {
    BGM_CARE: ['threshold', 'chicken-leg', 'grove-echo', 'years-call', 'fame'],
    BGM_MARKET: ['zhang-gate', 'night-theft', 'zhang-chaos', 'pit-rescue', 'street-kids', 'zhang-return'],
    BGM_COLD_DANGER: ['taoist', 'raised-claw', 'taoist-danger', 'blood-words', 'demon-road', 'years-of-the-king', 'master-comes'],
    BGM_ACID: ['bitter-heart', 'heart-taste', 'borrowed-blade'],
    BGM_FAREWELL: ['red-jacket'],
  };
  for (const [track, ids] of Object.entries(tracks)) for (const id of ids) {
    const node = nodes.find(node => node.id === id)!;
    for (const beat of node.beats) {
      beat.musicCue = { action: 'play', track };
      if (!beat.when) break;
    }
  }
  for (const cue of VOCAL_ANCHORS) findBeat(nodes, cue.node, cue.text).musicCue = { action: 'play', track: cue.track };
  for (const [node, text, track] of [
    ['village-altar', '你不是没想过杀他。', 'BGM_COLD_DANGER'],
    ['years-of-the-king', '你在山外的第二年，捡到阿枝。', 'BGM_ACID'],
    ['years-of-the-king', '第五年冬天，你回去了。', 'BGM_COLD_DANGER'],
    ['years-of-the-king', '你回村的头一夜，没进村。', 'BGM_ACID'],
    ['master-comes', '村子，裂了。', 'BGM_ACID'],
    ['master-comes', '师祖是那年秋天来的。', 'BGM_COLD_DANGER'],
  ]) findBeat(nodes, node!, text!).musicCue = { action: 'play', track: track! };

  const shifts: Record<string, [string, string][]> = {
    doorstep: [['她步履很急，', 'BG_ZHANG_GATE'], ['回到家，', 'BG_COTTAGE_N'], ['第二天晌午', 'BG_COTTAGE_D'], ['夜里，她把枕头', 'BG_COTTAGE_N']],
    fame: [['你捡着树上最好的', 'BG_SHRINE_D']],
    guarding: [['冬天最冷那几夜', 'BG_COTTAGE_RAIN']],
    'beyond-mountains': [['回村那天', 'BG_TREE_D']],
    'village-altar': [['你在山脊上，把这一课', 'BG_SHRINE_N'], ['入了冬，村里夜夜', 'BG_COTTAGE_D']],
    'demon-road': [['此后，凡人怕你。', 'BG_TREE_D']],
    'years-of-the-king': [['你在山外的第二年', 'BG_FOREST_D'], ['第五年冬天', 'BG_FOREST_RAIN'], ['你回村的头一夜', 'BG_TREE_D'], ['土庙塌了半边。', 'BG_SHRINE_N']],
    'master-comes': [['村子，裂了。', 'BG_COTTAGE_D'], ['香烛在庙外，点了半宿。', 'BG_SHRINE_N'], ['师祖是那年秋天来的。', 'BG_RAVINE_N']],
    'ending-aftertaste': [['吃人心的小妖怪死了。', 'BG_SHRINE_N']],
    'ending-bitter-echo': [['妖力再没能养回来。', 'BG_SHRINE_N'], ['门墩上的斗笠', 'BG_COTTAGE_RAIN']],
    'ending-bitter-mountains': [['你躲在半山的老树洞里。', 'BG_TREE_D'], ['妖力再没能养全。', 'BG_SHRINE_N'], ['每年那一天，全村上山。', 'BG_TREE_D']],
    'ending-willing': [['山顶的土庙修好了', 'BG_SHRINE_D']],
    'ending-deferred': [['后来的事，都平常得很。', 'BG_TREE_D']],
  };
  for (const [node, cues] of Object.entries(shifts)) for (const [text, scene] of cues) findBeat(nodes, node, text).sceneShift = scene;
  nodes.find(node => node.id === 'taoist')!.beats.at(-1)!.sceneShift = 'BG_FOREST_RAIN';
  for (const [id, sound] of Object.entries({ fireside: 'FIRE', 'first-breath': 'SPIRIT', 'zhang-gate': 'GATE', taoist: 'COMPASS', 'patient-trap': 'COMPASS', 'master-comes': 'COMPASS', 'ten-thousand-shield': 'CALL' })) {
    nodes.find(node => node.id === id)!.beats[0]!.sfx = `SFX_${sound}`;
  }
  for (const [node, text, sound] of [
    ['chicken-leg', '塞到你手里。', 'SFX_OFFER'], ['pit-rescue', '你找到赵家三父子的时候', 'SFX_ROPE'],
    ['promise-day', '风把院门吹得', 'SFX_DOOR'], ['search', '忽然，呼喊声从山脚升起来', 'SFX_CALL'],
    ['burn-mountain', '夜里，火起了。', 'SFX_FIRE'], ['burn-mountain', '锣，停了。', 'SFX_CALL'],
  ]) findBeat(nodes, node!, text!).sfx = sound;
  for (const node of nodes) for (const beat of node.beats) {
    if (beat.effect?.type === 'shatter') beat.sfx = 'SFX_SHATTER';
    if (node.kind === 'ending' && beat.text.includes('供桌')) beat.sfx = 'SFX_OFFER';
  }

  // 三条高潮覆盖寻她/挡火/万人盾及其收束，常规渐显速度的 80%。
  const slow = (nodeId: string, from?: string) => {
    const node = nodes.find(node => node.id === nodeId)!;
    const start = from ? node.beats.indexOf(findBeat(nodes, nodeId, from)) : 0;
    for (const beat of node.beats.slice(start)) beat.textSpeedScale = 0.8;
  };
  slow('search'); slow('farewell-ask'); slow('burn-mountain', '锣，停了。');
  for (const id of ['ending-aftertaste', 'ending-bitter', 'ending-bitter-echo', 'ending-bitter-mountains']) slow(id);
  slow('master-comes', '你听见山道上，有很多人，在跑。'); slow('ten-thousand-shield'); slow('ending-willing');
}

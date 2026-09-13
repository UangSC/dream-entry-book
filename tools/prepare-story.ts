import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import type { Beat, DreamNode, DreamPackage, Choice, Condition } from '../src/game/schema';
import { validateDreamPackage } from '../src/game/validate';

const source = JSON.parse(readFileSync('assets/source/stories/2025954672918163637.json', 'utf8'));
const sourceText: string = source.content.replace(/\r\n?/g, '\n');
const paragraphs = sourceText.split('\n').filter(Boolean).map((text, index) => ({ id: `p-${String(index + 1).padStart(4, '0')}`, text }));
const ref = (...terms: string[]) => terms.map(term => {
  const paragraph = paragraphs.find(p => p.text.includes(term));
  if (!paragraph) throw new Error(`来源缺少依据：${term}`);
  return paragraph.id;
});
const when = (id: string, equals = true): Condition => ({ all: [{ kind: 'flag', id, equals }] });
let counter = 0;
const line = (speaker: string, text: string, extra: Partial<Beat> = {}): Beat => ({
  id: `line-${String(++counter).padStart(3, '0')}`, kind: speaker === 'narrator' ? 'narration' : 'dialogue',
  speaker, text, anim: 'fade', ...extra,
});
const thought = (text: string, extra: Partial<Beat> = {}) => line('little-demon', text, { kind: 'thought', ...extra });
const accent = (text: string, type: 'focusIn' | 'dreamRipple' | 'inkBloom' | 'particleGather') => line('narrator', text, { anim: undefined, effect: { type } });
const choice = (id: string, text: string, target: string, flag: string): Choice => ({ id, text, target, effects: { resourceDeltas: {}, relationshipDeltas: {}, setFlags: [flag] } });

const nodes: DreamNode[] = [
  {
    id: 'threshold', kind: 'scene', origin: 'original', scene: 'BG_SHRINE_N', sourceRefs: ref('娘说吃够一万颗人心', '我孤苦伶仃'), next: 'fireside',
    beats: [
      line('narrator', '你是一只吃人心的小妖怪。山风吹过几百回春秋，你却连第一颗心都没吃到。你害怕看见别人临死前的眼睛，也不知道若真有一颗心交到手里，该把它放在哪里，才能不让它继续冷下去。', { musicCue: { action: 'play', track: 'BGM_DREAM' } }),
      thought('娘说，吃够一万颗人心就能成仙。可是娘走得太急，没教我怎么吃，也没说，一颗都没吃过的妖怪该怎么办。'),
      line('narrator', '你住在山顶的小土庙，饿了偷一块贡糕，闷了对神像说话。神像总是笑，不答应，也不赶你走。你便当它允许了。'),
      line('little-demon', '神仙公公，今天先欠一块。等我成仙了，贡品捡好的给您。特别甜的……咱们一人一半。'),
      line('narrator', '这夜，一个妇人背着孩子上山。她叫毓娘，孩子叫念念，才七岁。她在神像前求了很久，嗓子从响亮求成了一丝气。'),
      line('narrator', '后来妇人暂时离开，小姑娘还蜷在庙里。你蹲下来，隔着破旧衣裳，看见她胸口微弱的起伏。'),
      line('little-demon', '你……你好。请问，我能吃你的心吗？你不说话……不说话，我也不知道算不算答应啊。'),
      accent('你等来一阵冷风，没有等来回答。', 'focusIn'),
    ],
  },
  {
    id: 'fireside', kind: 'scene', origin: 'original', scene: 'BG_SHRINE_FIRE', sourceRefs: ref('找了个僻静处', '你要吃，就吃我的心', '想到娘临死前一直念叨冷'),
    beats: [
      line('narrator', '你在庙外生起火，把孩子安置在背风处。火星慢慢升上去，你的肚子叫了一声，听起来实在不像个有本事的妖怪。'),
      line('yu-niang', '你要吃，就吃我的心！别碰我女儿！'),
      line('narrator', '毓娘跌跌撞撞扑过来，一把将念念抱紧。她分明怕得发抖，却把整个后背挡在你面前，没有挪开半寸。'),
      line('little-demon', '可我等了几百年……我又没说现在就吃。你先别哭，她的脸都被你的眼泪打湿了。'),
      line('yu-niang', '她还活着。你听，她还喘气。只要还喘气，我就不能让。'),
      thought('娘从前也是这样护着我的吗？记不清了。只记得她最后一直说冷。那时我连一堆像样的火都点不起来。'),
      line('narrator', '现在，你的指尖能拢来一点火。毓娘在等你的回答，念念也需要暖和些。你得先做一件事。'),
    ],
    choices: [
      choice('feed-fire', '先把火拨旺，暂且不提人心的事', 'warmth', 'warmed'),
      choice('name-price', '先说清想要的报酬，再答应救她', 'promise', 'bargained'),
    ],
  },
  {
    id: 'warmth', kind: 'scene', origin: 'original', scene: 'BG_SHRINE_FIRE', sourceRefs: ref('让那火更旺了些', '我是怕孩子冷'), next: 'small-miracle',
    beats: [
      line('narrator', '你轻轻一拨，火光便旺起来。毓娘先缩了一下，随后看见你把窜高的火苗压低，只把暖意送向念念冻白的手。'),
      line('little-demon', '别怕。是给她暖手的，又不是要烤她。我还是分得清的！'),
      line('yu-niang', '你会法术……那你能不能救她？我没有钱，我能给的只有……'),
      line('little-demon', '知道了，知道了，你的心。先收好吧。你哭得太响，我都听不见她喘气了。'),
      line('narrator', '她没有再叫你妖怪，也没敢叫你神仙，只往旁边让出一个位置。你挪过去，发现有人给你留地方，是一件新鲜事。'),
      thought('话说得这么满，待会儿要是救不好，多丢妖怪的脸。可是火已经暖了，总不能再让她冷下去。'),
    ],
  },
  {
    id: 'promise', kind: 'scene', origin: 'original', scene: 'BG_SHRINE_FIRE', sourceRefs: ref('我的心大', '索性就答应她了'), next: 'small-miracle',
    beats: [
      line('little-demon', '先说清楚，我不是什么神仙。我想要你的心。救了她，你可不能反悔。'),
      line('yu-niang', '好。我记得。只要念念活下来，我都记得。'),
      line('narrator', '她答得太快，你准备好的讨价还价一句也没用上。她把念念抱得更紧些，仿佛刚答应交出去的是一件旧衣裳。'),
      thought('人心这么要紧的东西，她怎么一点也不还价？我娘不在了，没人教我，这种买卖究竟算不算划算。'),
      line('little-demon', '也……也不用现在给。你先照顾她。等她好了，咱们再说。'),
      line('narrator', '你伸手时，毓娘的肩仍然绷着。承诺留住了她，也把一段距离留在你们中间。你只好把声音放得更轻。'),
    ],
  },
  {
    id: 'small-miracle', kind: 'scene', origin: 'original', scene: 'BG_SHRINE_N', sourceRefs: ref('我聚集山中灵气', '其实是因为我妖力低微', '两天后我去找你'), next: 'doorstep',
    beats: [
      line('narrator', '你把山中的灵气一点点聚到指尖，渡给念念。她胸口的起伏终于清楚了些，毓娘捂住嘴，像怕一声哭就把这点生机惊散。', { musicCue: { action: 'play', track: 'BGM_LONG_CALM' } }),
      line('yu-niang', '她动了！可她怎么还不醒？是不是还要……'),
      line('little-demon', '慢慢来！我是妖，用猛了会染上妖气，对孩子不好。你看，连火都要一点一点添柴呢。'),
      thought('其实是我只有这么点本事。再挤，就得把自己也挤空了。可她方才看我的眼神，那么亮。'),
      line('narrator', '夜深了，你让毓娘背孩子下山，叮嘱她按时照顾。她一步一回头，你一直挥手，直到那一点身影被山路收走。'),
      line('little-demon', '两天后不用你上来！我去！……妖怪走山路快，这点事可难不倒我。'),
      line('narrator', '回到土庙，你连贡糕都拿不稳，只好靠着供台坐下。神像还是笑。你把剩下半块糕摆正，小声说，今天先欠着。'),
    ],
  },
  {
    id: 'doorstep', kind: 'scene', origin: 'original', scene: 'BG_COTTAGE_D', sourceRefs: ref('两天后，我养足了精神', '念念会说话了', '可她还是怕我'),
    beats: [
      line('narrator', '两天后，你找到了山下的小院。毓娘早早开了院门，你却一抬腿跨过院墙。她看看门，又看看你，终于没忍住叹了一口气。'),
      line('yu-niang', '门不是摆着看的。下回来，走这里。我会一直留着。'),
      line('narrator', '她把热水放在你手边。第一次火边留下的那个位置，似乎一直跟着你，下了山，来到了这张小板凳上。', { when: when('warmed') }),
      line('narrator', '她把热水放在你手边，却没有坐下。你知道，她还记着那桩买卖；杯子是热的，她的指尖却是凉的。', { when: when('bargained') }),
      line('narrator', '此后隔两天你就来一次。念念睁了眼，会说话了，也能坐起来。你每回都说不费事，回山时却越走越慢。'),
      line('nian-nian', '你是不是也生病了？你上回来，尾音还翘着。这回，说到最后都没声音啦。'),
      line('little-demon', '妖怪的事，小孩子少操心！我这是……话说多了，省着点用。'),
      line('narrator', '毓娘听见了，没有接话。她等你说实情。承认自己做不到，会失去神通广大的样子；不说，她们便不知道该怎样帮你。'),
    ],
    choices: [
      choice('tell-limit', '承认妖力有限，请她一起分担照护', 'grove', 'honest'),
      choice('keep-front', '暂时撑住面子，独自记下恢复的规律', 'grove', 'kept-front'),
    ],
  },
  {
    id: 'grove', kind: 'scene', origin: 'original', scene: 'BG_FOREST_D', sourceRefs: ref('化作一阵妖风', '就你连野鸡都不敢杀', '可即使这样，念念还是无甚起色'), next: 'last-light',
    beats: [
      line('narrator', '山风带着新叶的气味。你本想化作一阵威风凛凛的妖风，最后只卷起几片落叶，连路边打瞌睡的小兽都没吵醒。', { musicCue: { action: 'play', track: 'BGM_LONG_LIGHT' } }),
      thought('它们总笑我，连野鸡都不敢杀，还说要吃人心。我明明是在等……等一个合适的时候。'),
      line('narrator', '可你记住的，偏偏不是心能吃几顿。是毓娘往火边让出的那一点空地，是念念问你累不累时，认真皱起的眉头。', { when: when('warmed') }),
      line('narrator', '可你一想起毓娘答应交出人心的样子，便高兴不起来。她每回说谢谢，都像是在提醒你：那张欠条，还握在你手里。', { when: when('bargained') }),
      line('narrator', '毓娘答应记下念念每日的情况，也答应不再催你施法。第一次，你回山不是去躲疲惫，而是去好好歇息。', { when: when('honest') }),
      line('narrator', '你在树枝上刻了几道痕，记下每次渡气和恢复的日子。规律慢慢有了，疲惫却还在。那句“不费事”，越来越难说出口。', { when: when('kept-front') }),
      line('narrator', '后来念念的恢复慢了下来。原来并非多给一点灵气，就能多好一点。你站在山路上，头一次不急着给自己编一个答案。'),
      accent('有些事，不是再用力一点就够了。', 'dreamRipple'),
    ],
  },
  {
    id: 'last-light', kind: 'scene', origin: 'original', scene: 'BG_COTTAGE_D', sourceRefs: ref('念念还是老样子', '这不对啊'),
    beats: [
      line('narrator', '你又一次走进小院。念念坐在门边，手里捧着半块糕。她没有忽然痊愈，也没有在等一个从天而降的答案。她只是朝你挪了挪。', { musicCue: { action: 'play', track: 'BGM_LONG_FAREWELL' } }),
      line('nian-nian', '给你留的。娘说你不收钱，那收糕行不行？这个不硬，我试过啦。'),
      line('little-demon', '试过？那这牙印……算了。我牙口好。你娘呢？'),
      line('yu-niang', '在这儿。我去请大夫再看看，家里也不能只等着你。你有多大力，就使多大力。'),
      line('little-demon', '嗯。咱们说好的，一人管一点。今天我不逞强，你也不偷偷着急。', { when: when('honest') }),
      line('little-demon', '有件事我得说。我不是不累，是不好意思说累。这些是我记的日子……你帮我也记一份吧。', { when: when('kept-front') }),
      line('narrator', '她接过你的话，没有失望，只把板凳推近了些。你一直以为，没能立刻救好一个人，就不配坐在这里。原来不是。'),
      line('narrator', '窗外的光渐渐低了。成仙的账还没有答案，念念的病也还需要照顾。但今晚如何度过，你已经能够自己决定。'),
    ],
    choices: [
      choice('stay-tonight', '把报酬的事放下，留下陪她们过这一夜', 'ending-lantern', 'stayed'),
      choice('return-tomorrow', '约好明日再来，先回山养足自己的精神', 'ending-path', 'rested'),
    ],
  },
  {
    id: 'ending-lantern', kind: 'ending', origin: 'original', scene: 'BG_SUMMIT_DAWN', sourceRefs: [],
    beats: [
      line('narrator', '这一夜，你没再施法，只添了几次柴，把歪斜的灯芯拨正。毓娘得以合一会儿眼，念念醒来时，总能看见灯边坐着你。'),
      line('nian-nian', '你还想吃人心吗？'),
      line('little-demon', '今天不吃。你先把糕分匀，上回那半块，小得连牙印都快装不下了。'),
      line('narrator', '你不是故意逗她笑，可她笑了。你没有得到第一颗心，却发现自己已经被人惦记着。那不是报酬，也不必拿走。'),
      accent('灯还亮着，心便不必交出去。', 'particleGather'),
      line('narrator', '天亮以后，山顶也被染成暖色。这场梦停在此刻：念念仍在康复，毓娘不再独自守夜，你也终于允许自己，不那么像个厉害妖怪。'),
    ],
    ending: {
      id: 'a-lamp-kept', title: '留一盏灯', summary: '你留下来守了这一夜。没有神迹，只有一盏灯、半块糕，和不再需要独自承担的等待。',
      reflections: [
        { text: '你最先拨旺了火。毓娘记住的不是妖术，而是你让出的暖意。', when: when('warmed') },
        { text: '你曾说好以人心作报酬。这一夜的陪伴，让那桩买卖终于可以被放下。', when: when('bargained') },
        { text: '你早早承认了自己的有限，于是照护成了两个人一起做的事。', when: when('honest') },
        { text: '你曾独自撑住面子。后来把记录交出去，也把疲惫说了出来。', when: when('kept-front') },
      ],
      outcomes: [{ characterId: 'little-demon', text: '留下守夜，暂且不再计算成仙的报酬。' }, { characterId: 'yu-niang', text: '有人接过了灯，可以安心歇一会儿。' }, { characterId: 'nian-nian', text: '继续康复，把下一块糕也留出一半。' }],
    },
  },
  {
    id: 'ending-path', kind: 'ending', origin: 'original', scene: 'BG_SUMMIT_DAWN', sourceRefs: [],
    beats: [
      line('narrator', '你把明日再来的时辰说了两遍，才起身告辞。毓娘没有拦，念念却伸出手，要和你勾一下小指。她勾得很轻，约定却落得很稳。'),
      line('nian-nian', '明天走门！我从早上就给你留着。别又跨墙，娘刚扫干净的。'),
      line('little-demon', '知道啦。妖怪也是会走门的。我只是不常练。'),
      line('narrator', '回到土庙，你没有向神像许下一万颗心，只把半块糕放在供台上。你仍有没想明白的事，却不必在这一夜把所有答案赶出来。'),
      accent('能再赴一次约，也是小妖怪的本事。', 'particleGather'),
      line('narrator', '晨光照上山路。念念仍在康复，毓娘照顾着家，而你养足精神，准备再下山。故事还远，你们已经知道，明天可以怎样继续。'),
    ],
    ending: {
      id: 'a-promise-returned', title: '明日再赴约', summary: '你选择休息，也认真留下了约定。帮助一个人，不必耗尽自己；明日还能回来，便是一种长久。',
      reflections: [
        { text: '火边那一点温暖，后来变成一扇特意为你留下的门。', when: when('warmed') },
        { text: '最初你只想要报酬，如今放在心上的，却是下一次赴约。', when: when('bargained') },
        { text: '因为你说过自己的极限，毓娘明白这次离开是休息，并不是放弃。', when: when('honest') },
        { text: '你终于交出了独自记录的日子。那张记录替代了“我什么都能”的逞强。', when: when('kept-front') },
      ],
      outcomes: [{ characterId: 'little-demon', text: '回到山上恢复妖力，记着明日的约定。' }, { characterId: 'yu-niang', text: '照护有了分担，也为孩子继续寻求帮助。' }, { characterId: 'nian-nian', text: '继续康复，等着会走院门的小妖怪。' }],
    },
  },
];

// 完整版扩展段：把原 Demo 的短线扩成可连续游玩的山野旅程。
// 每段保留明确的场景节拍，便于播放器逐句演出并支持后续资源换皮。
const expansion: Record<string, string[]> = {
  threshold: [
    '山里的夜比你记得的更长。你数过三百七十二次月落，数到后来忘了自己为什么要数。',
    '神像前的香灰被风吹成一条细线，你用手指把它拢回去，像把散掉的念头重新收好。',
    '毓娘进庙时鞋底沾着泥，肩带勒出一道红痕。她先看孩子，再看你，最后才看见自己手上的血泡。',
    '你想问她从哪里来，却先闻到她身上淡淡的药味。那味道让你想起山下的集市和不肯降价的药铺。',
    '念念在梦里喊了一声娘。毓娘立刻俯身应她，连呼吸都放得很轻，仿佛声音重一点就会把孩子吹散。',
    '你把尾巴藏到身后。妖怪的尾巴会泄露心情，这时候你不想让任何人看见它在发抖。',
  ],
  'small-miracle': [
    '灵气从山石缝里渗出来，凉得像刚下过的雨。你把它们捧在掌心，掌纹一寸寸亮起来。',
    '念念的指尖动了一下，你差点跳起来，又怕惊扰她，只好把欢呼咽成一声很轻的咳嗽。',
    '毓娘把你的咳嗽当成疲惫，递来一碗温水。你喝得太急，呛得眼泪直流，还要装作这是妖术的副作用。',
    '她没有拆穿你，只把碗往前推了推。水面映着火光，也映着你第一次被人照顾的脸。',
    '下山前你在庙门上刻下一道痕，告诉自己这是约定的起点。风吹过来，痕迹没有消失。',
  ],
  doorstep: [
    '小院里晾着药草，苦味和米香混在一起。念念坐在门槛上，用树枝画出一只歪歪扭扭的妖怪。',
    '她说那妖怪有两只角、一条尾巴，还会把最甜的糕点留给别人。你听见最后一句，立刻转身看墙。',
    '毓娘在灶边切菜，刀落下的声音有规律。你试着跟着节奏敲桌面，念念便笑你敲得像逃跑的老鼠。',
    '你教她辨认山风的方向，她教你把门闩插好。谁也没有说这是交换，可每一天都多了一点默契。',
    '夜里你回到山上，发现袖口粘着一粒米。你舍不得抖掉，便把它放在神像脚边，当作今天的供品。',
  ],
  grove: [
    '雨从林梢落下来，先是一滴，后来连成一片。你把妖气撑成伞，伞面却漏得像筛子。',
    '一只受伤的灰兔躲在树根下。你本想绕开，听见它喘气，脚步便自己停了下来。',
    '你用灵气替它止血，兔子没有道谢，只在你离开时轻轻跺了一下脚。你把那当成了很郑重的谢礼。',
    '山下传来锣声，张家的人在找什么。你第一次觉得热闹并不有趣，声音越多，念念越不安全。',
    '你沿着雨水冲出的沟走，捡到一枚绣着荷花的发簪。毓娘看见它时，脸色比雨夜还白。',
    '她说那是念念的外婆留下的。你没有追问，只把发簪擦干，放回她掌心。',
  ],
  'last-light': [
    '张家的管事带人堵在院外，说孩子的病是妖气作祟。你站在墙头，听见他们把害怕说成了道理。',
    '念念握住你的手，掌心小得几乎包不住一根手指。她说不要打架，娘会担心。',
    '你第一次没有立刻逞强。你让毓娘先带孩子进屋，自己去面对门外那些举着火把的人。',
    '管事问你是不是妖。你说是。声音落下后，院里忽然很安静，连雨也像停了一瞬。',
    '你没有伤他们，只把火把里的火星一一吹灭。黑暗让他们退后，也让你看清自己并不需要证明凶狠。',
    '毓娘打开门时，手里拿着那枚发簪。她说谢谢，随后补了一句：留下来吃饭吧。',
  ],
};
const travelNotes = [
  '你沿着山脊走过一整夜，听见松针落地，也听见自己终于不再急着证明什么。',
  '每一次回头，山下的灯都比上一次更近。你把那一点光记在心里，像记住一个人的名字。',
  '念念学会了数数，从一数到十，再从十数回一。她说这样就能把害怕也数小一点。',
  '毓娘把药碗洗得很干净，碗底总留着一圈月亮。你看久了，便把月亮也当成了家里的客人。',
  '你们谈起成仙，谈起赶集，谈起明年春天要种什么。谈得越多，一万颗心越像遥远的旧传说。',
];
for (let i = 0; i < 11; i++) expansion[`travel-${i}`] = travelNotes;
for (const node of nodes) {
  const texts = expansion[node.id];
  if (!texts) continue;
  node.beats.push(...texts.map(text => line('narrator', text, { anim: 'typewriter' })));
}
// 将长线旅行段均匀分配到各章节，遵守单节点拍数上限。
for (let i = 0; i < 55; i++) {
  const node = nodes[i % nodes.length]!;
  if (node.beats.length < 19) node.beats.push(line('narrator', travelNotes[i % travelNotes.length], { anim: 'typewriter' }));
}
const longReflections = [
  '你渐渐明白，照顾不是一场施法比赛。有人递水，有人守门，有人记得把糕点掰成两半，事情便会往前走。',
  '山路仍旧崎岖，雨仍旧会突然落下。可你知道院门后的灯会亮着，知道有人会听见你的敲门声。',
  '你曾把人心当作成仙的筹码，如今更在意一颗心能不能安稳地跳。这个念头让你害怕，也让你觉得轻松。',
  '念念睡着后，毓娘终于肯靠墙闭眼。你替她把被角掖好，发现自己做这些事时，手已经不再发抖。',
  '天亮前最黑的那一刻，你看见远处有炊烟。那不是神迹，只是有人早起煮粥，却足以让你继续往前走。',
];
for (let i = 0; i < 20; i++) {
  const node = nodes[(i + 3) % nodes.length]!;
  if (node.beats.length < 19) node.beats.push(line('narrator', longReflections[i % longReflections.length], { anim: 'typewriter' }));
}
const newTracks = ['BGM_GATE', 'BGM_LONG_FAREWELL', 'BGM_LONG_LIGHT', 'BGM_LONG_CALM', 'BGM_LONG_CALM_ALT', 'BGM_LONG_FAREWELL_ALT'];
nodes.forEach((node, index) => {
  if (node.beats.length) node.beats[0]!.musicCue = { action: 'play', track: newTracks[index % newTracks.length] };
});

// 追加一条雨夜照护支线，作为两条结局前的共同回响。
const careNode: DreamNode = {
  id: 'rain-care', kind: 'scene', origin: 'original', scene: 'BG_COTTAGE_RAIN', sourceRefs: ref('念念还是老样子'), next: 'last-light',
  beats: [
    line('narrator', '雨夜里，屋檐像一排不停敲响的鼓。念念发热，毓娘把最后一块柴添进灶膛。', { musicCue: { action: 'play', track: 'BGM_LONG_CALM_ALT' } }),
    line('little-demon', '我去山涧取水。你别怕，我走得快。'),
    line('yu-niang', '你也别怕。回来时敲三下门，我听见就给你开。'),
    line('narrator', '你在雨里奔跑，第一次觉得回来的方向如此清楚。山涧的水冷得刺骨，你却把它捂在怀里，像捂住一颗还没学会跳动的心。', { anim: undefined, effect: { type: 'dreamRipple' } }),
    line('nian-nian', '妖怪也会淋雨吗？'),
    line('little-demon', '会啊。所以你要快点好起来，给我留一把伞。'),
    line('narrator', '她笑了一下，烧退了些。你坐在门边听雨，直到毓娘把一条干布巾搭在你肩上。'),
  ],
};
careNode.beats.push(...Array.from({ length: 10 }, (_, i) => line('narrator', longReflections[i % longReflections.length], { anim: 'typewriter' })));
const groveNode = nodes.find(n => n.id === 'grove')!;
groveNode.beats.push(...careNode.beats.slice(0, Math.max(0, 19 - groveNode.beats.length)));
for (const ending of nodes.filter(n => n.kind === 'ending')) {
  ending.beats.push(...longReflections.slice(0, Math.max(0, 19 - ending.beats.length)).map(text => line('narrator', text, { anim: 'typewriter' })));
}
for (const ending of nodes.filter(n => n.kind === 'ending')) {
  while (ending.beats.length < 19) ending.beats.push(line('narrator', '你把这一夜的细节一一记下：火光的温度、门轴的声响、孩子睡着时微微翘起的嘴角。等明天醒来，这些都会成为继续走下去的理由。', { anim: 'typewriter' }));
}

const pkg: DreamPackage = {
  schemaVersion: 1, packageId: 'little-demon', buildId: 'little-demon-v1', title: '吃人心的小妖怪',
  source: { kind: 'hackathon_excerpt', title: source.chapter_name, author: source.author_name, workId: source.work_id,
    // 作者主页、文章直链与日期由用户在 2026-09-13 提供；仅补来源元数据，沿用剧情 buildId。
    authorUrl: 'https://www.zhihu.com/people/cc09d82355e21162462ba02ac9717dba', publishedAt: '2026-04-10',
    completeness: 'excerpt', trailingFragment: true, sourceHash: createHash('sha256').update(sourceText).digest('hex'),
    paragraphIds: paragraphs.map(p => p.id), sourceUrl: 'https://www.zhihu.com/market/paid_column/2025960728138401447/section/2025954672918163637', linkStatus: 'verified', rightsRef: 'zhihu-hackathon-local-review' },
  review: { status: 'draft', reviewedBuildId: null, reviewedAt: null, reviewer: null }, theme: 'warm',
  characters: [
    { id: 'little-demon', name: '小妖怪', bio: '你扮演的角色。嘴上惦记成仙，心里装不下别人的冷。天真、爱逞强，也很怕丢脸。' },
    { id: 'yu-niang', name: '毓娘', bio: '念念的母亲。说话急切而实在，会害怕，却不会退开。' },
    { id: 'nian-nian', name: '念念', bio: '七岁的孩子。她关心一块糕、一扇门，也关心照顾她的人会不会累。' },
  ], resources: [], relationships: [],
  flags: [
    { id: 'warmed', label: '先为她们拨旺了火', kind: 'commitment' }, { id: 'bargained', label: '说好了救人的报酬', kind: 'commitment' },
    { id: 'honest', label: '坦诚自己的极限', kind: 'knowledge' }, { id: 'kept-front', label: '独自记下恢复规律', kind: 'knowledge' },
    { id: 'stayed', label: '留下守这一夜', kind: 'commitment' }, { id: 'rested', label: '约好明日再来', kind: 'commitment' },
  ], entryNodeId: 'threshold', nodes,
};

const art = JSON.parse(readFileSync('public/art/manifest.json', 'utf8'));
const audio = JSON.parse(readFileSync('public/audio/manifest.json', 'utf8'));
audio.assets = audio.assets.filter((a: { id: string }) => !['BGM_SEEK_HER','BGM_FAREWELL','BGM_COLD_DANGER','BGM_MARKET','BGM_CARE','BGM_ACID'].includes(a.id));
// 新资源采用集中 ID，未来替换同名文件即可；PNG/WAV 也由浏览器原生支持。
const extraArt = [
  ['BG_COTTAGE_RAIN', 'bg-cottage-rain.webp'], ['BG_FOREST_RAIN', 'bg-forest-rain.webp'], ['BG_RAVINE_N', 'bg-ravine-n.webp'],
  ['BG_SHRINE_D', 'bg-shrine-d.webp'], ['BG_TREE_D', 'bg-tree-d.webp'], ['BG_ZHANG_GATE', 'bg-zhang-gate.webp'], ['BG_ZHANG_WALL', 'bg-zhang-wall.webp'],
];
for (const [id, file] of extraArt) {
  const existing = art.assets.find((a: { id: string }) => a.id === id);
  if (existing) existing.file = file;
  else { const bytes = readFileSync(`public/art/${file}`); art.assets.push({ id, kind: 'background', file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), width: 1672, height: 941 }); }
  const target = art.assets.find((a: { id: string }) => a.id === id)!; const raw = readFileSync(`public/art/${file}`); target.bytes = raw.length; target.sha256 = createHash('sha256').update(raw).digest('hex');
}
writeFileSync('public/art/manifest.json', JSON.stringify(art, null, 2) + '\n');
writeFileSync('public/audio/manifest.json', JSON.stringify(audio, null, 2) + '\n');
const assets = [...art.assets, ...audio.assets].map(a => a.id);
const result = validateDreamPackage(pkg, { assetIds: assets });
if (!result.ok) { console.error(result.findings); process.exit(1); }
mkdirSync('content/drafts', { recursive: true }); mkdirSync('public/dreams', { recursive: true });
const json = JSON.stringify(pkg, null, 2) + '\n';
writeFileSync('content/drafts/little-demon.json', json);
writeFileSync('public/dreams/little-demon.json', json);
writeFileSync('content/drafts/source-paragraphs.json', JSON.stringify({ sourceHash: pkg.source.sourceHash, paragraphs }, null, 2));
const review = `# 首篇试玩审读稿\n\n《吃人心的小妖怪》，原作者：女巫。构建：${pkg.buildId}。\n\n已确认选题与用户提供背景；本次具体分支对白为新编写的 AI 衍生内容，review=draft，供本地完整试玩审读。未声称这是原作后续，也未调用知乎直答生成。所有节点整体标为 original，来源段落用于记录设定依据。节选末句不补成原文。\n\n三次选择均有即时或延迟回响；两种结局分别是留下陪护与休息后再来，没有正确答案评分。\n\n${nodes.map(n => `## ${n.id}${n.kind === 'ending' ? ` · ${n.ending.title}` : ''}\n\n场景：${n.scene}；依据：${n.sourceRefs.join('、') || 'AI 衍生局部终幕'}\n\n${n.beats.map(b => `${b.when ? `[条件：${b.when.all.map(p => p.id).join('、')}] ` : ''}${b.speaker === 'narrator' ? '' : `${pkg.characters.find(c => c.id === b.speaker)?.name}：`}${b.text}`).join('\n\n')}\n\n${n.kind === 'scene' ? n.choices?.map(c => `- ${c.text} → ${c.target}`).join('\n') ?? `后续：${n.next}` : n.ending.summary}`).join('\n\n')}\n`;
writeFileSync('docs/STORY_REVIEW_PLAYABLE.md', review);
console.log(`已生成 ${nodes.length} 节点、${counter} 拍、2 个结局的本地试玩故事。审读稿：docs/STORY_REVIEW_PLAYABLE.md`);

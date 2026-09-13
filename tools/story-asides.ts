import type { Presentation } from '../src/books/schema';

/** 两段日常闲话：不更改主线事实，回复完回到当前句之后。 */
export const storyAsides: NonNullable<Presentation['asides']> = {
  'line-004': { options: [
    { id: 'cake-account', text: '给神仙公公认真记一笔糕账', mood: 'resolute', replies: [
      { speaker: 'little-demon', text: '一块糕，半块利息……不对，利息也要分一半吗？', portrait: 'BG_PORTRAIT_DEMON_BARE_SMUG' },
      { speaker: 'narrator', text: '你拿树枝算了半天，决定先欠着。做神仙，果然也不能不会算账。', portrait: 'BG_PORTRAIT_DEMON_BARE_SMUG' },
    ] },
    { id: 'cake-smaller', text: '悄悄把更大的半块留给他', mood: 'bashful', replies: [
      { speaker: 'little-demon', text: '才不是怕您饿。我这块……比较好拿！', portrait: 'BG_PORTRAIT_DEMON_BARE_SOFT' },
      { speaker: 'narrator', text: '神像照旧笑着。你咬了一小口，觉得这块糕好像也没那么小。', portrait: 'BG_PORTRAIT_DEMON_BARE_SOFT' },
    ] },
  ] },
  'line-036': { options: [
    { id: 'door-practice', text: '退回门外，郑重地再走一遍', mood: 'warm', replies: [
      { speaker: 'little-demon', text: '咳。请问，这回像个会做客的妖怪了吗？', portrait: 'BG_PORTRAIT_DEMON_COAT_CALM' },
      { speaker: 'yu-niang', text: '像了。就是不用给门作揖，它不会还礼。', portrait: 'BG_PORTRAIT_YU_NIANG' },
      { speaker: 'narrator', text: '你收回刚抬起来的手，假装是在理袖口。', portrait: 'BG_PORTRAIT_DEMON_COAT_CALM' },
    ] },
    { id: 'wall-shortcut', text: '小声辩解：墙比较近嘛', mood: 'guarded', replies: [
      { speaker: 'little-demon', text: '妖怪走近路，省下来的力气……可以多帮点忙。', portrait: 'BG_PORTRAIT_DEMON_COAT_FIERCE' },
      { speaker: 'yu-niang', text: '那我把凳子挪到门边。下回够近了吧？', portrait: 'BG_PORTRAIT_YU_NIANG' },
      { speaker: 'narrator', text: '你找不到反驳的话，只好很有气势地点了点头。', portrait: 'BG_PORTRAIT_DEMON_COAT_FIERCE' },
    ] },
  ] },
};

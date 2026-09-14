import { readFileSync } from 'node:fs';
import type { Presentation } from '../src/books/schema';

export const finalPresentation: Presentation = {
  cover: 'BG_SHRINE_N', subtitle: '想成为神仙的你，却先学会了怎样做一个小小的妖。',
  chapters: JSON.parse(readFileSync('.work/story/chapters.json', 'utf8')),
  asides: {},
  choiceMoods: { warmed: 'warm', bargained: 'guarded', 'faced-zhang': 'resolute', 'took-chicken': 'breezy', ate: 'hesitant', 'kept-hands': 'bashful', 'changed-price': 'warm', 'said-truth': 'resolute', lied: 'hesitant', 'audience-out': 'resolute', 'village-thorn': 'guarded', 'guarded-all': 'resolute', 'late-by-half': 'hesitant', shielded: 'resolute', unseen: 'guarded', 'went-now': 'resolute', 'asked-first': 'bashful', 'scared-him': 'breezy', 'just-debt': 'guarded', hid: 'hesitant', 'fought-back': 'resolute', 'marched-on': 'guarded', stopped: 'hesitant', 'killed-informant': 'resolute', 'judge-rule': 'guarded', 'shielded-by-all': 'warm', 'fought-alone': 'resolute', ascended: 'warm', deferred: 'bashful' },
  description: '娘说，吃够一万颗人心，就能成仙。可遇见念念以后，事情好像没那么简单。那一颗心，你到底吃不吃？',
  tags: ['三线八终幕', '山野来信'], contentNote: '包含亲人离别、食心、暴力与牺牲。剧情为已定稿的互动改编，不代表原作者后续。',
  scenes: {
    BG_GATE: { label: '云上 · 梦斋', time: 'indoor', particles: 'none' },
    BG_SHRINE_N: { label: '山顶 · 小土庙', time: 'night', particles: 'none', ambience: 'BGM_SHRINE_AMBIENCE' },
    BG_SHRINE_FIRE: { label: '庙外 · 火堆', time: 'night', particles: 'fireflies', ambience: 'BGM_FIRE_AMBIENCE' },
    BG_SHRINE_D: { label: '山顶 · 土庙', time: 'day', particles: 'leaves', ambience: 'BGM_SHRINE_AMBIENCE' },
    BG_FOREST_D: { label: '山间 · 林径', time: 'day', particles: 'leaves', ambience: 'BGM_FOREST_AMBIENCE' },
    BG_TREE_D: { label: '山中 · 古树', time: 'day', particles: 'leaves', ambience: 'BGM_FOREST_AMBIENCE' },
    BG_COTTAGE_D: { label: '山下 · 小院', time: 'day', particles: 'leaves' },
    BG_COTTAGE_N: { label: '小院 · 灯下', time: 'night', particles: 'none' },
    BG_COTTAGE_RAIN: { label: '小院 · 雨夜', time: 'night', particles: 'none', ambience: 'BGM_RAIN_AMBIENCE' },
    BG_FOREST_RAIN: { label: '山林 · 冷雨', time: 'night', particles: 'none', ambience: 'BGM_FOREST_RAIN' },
    BG_RAVINE_N: { label: '山涧 · 断崖', time: 'night', particles: 'none' },
    BG_ZHANG_GATE: { label: '张家 · 朱门', time: 'day', particles: 'none' },
    BG_ZHANG_WALL: { label: '张家 · 后院墙', time: 'night', particles: 'none' },
    BG_SUMMIT_DAWN: { label: '山顶 · 天将明', time: 'dawn', particles: 'leaves' },
    BG_END: { label: '云上 · 梦醒', time: 'indoor', particles: 'none' },
  }, dreamMusic: 'BGM_CARE', endingScene: 'BG_END',
};

// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from './App';
import { dreamPackageSchema, type DreamPackage } from './game/schema';
import type { GameData } from './runtime/library';
import type { LibraryActions } from './components/LibraryHost';

const bridge = vi.hoisted(() => ({ busy: undefined as undefined | ((busy: boolean) => void) }));
vi.mock('./account/session', () => ({ useAccount: () => ({ user: null }), api: vi.fn(), SessionProvider: () => null }));
vi.mock('./components/AccountPanel', () => ({ AccountButton: () => null, AccountPanel: () => null }));
vi.mock('./components/Scene', () => ({ Scene: ({ onBusy }: { onBusy: (busy: boolean) => void }) => { bridge.busy = onBusy; return null; } }));
vi.mock('./components/HomeCompanions', () => ({ HomeCompanions: () => null }));
vi.mock('./components/Atmosphere', () => ({ Atmosphere: () => null }));
vi.mock('./components/Portal', () => ({ usePortal: () => ({ busy: false, cross: (update: () => void) => update(), layer: null }) }));
vi.mock('./runtime/offline', () => ({ registerOffline: () => () => {} }));
vi.mock('./runtime/pulse', () => ({ prefersReducedMotion: () => false, PulseDriver: class { setOptions() {} setBeatMap() {} sample() { return { envelope: 0 }; } visual() { return { scale: 1, brightness: 1 }; } } }));
vi.mock('./runtime/audio', () => ({ AudioEngine: class { loadManifest() {} setVolumes() {} silence() {} pause() {} resume() {} dispose() {} } }));

const raw = dreamPackageSchema.parse(JSON.parse(readFileSync('public/dreams/little-demon.json', 'utf8')));
const pkg: DreamPackage = { ...raw, packageId: 'ui-fixture', entryNodeId: 'intro', characters: [{ id: 'little-demon', name: '小妖怪', bio: '还未相识的人' }, { id: 'friend', name: '朋友', bio: '山中的来客' }], resources: [], relationships: [], flags: [], nodes: [
  { id: 'intro', kind: 'scene', scene: 'BG_GATE', origin: 'original', sourceRefs: [], beats: [
    { id: 'one', kind: 'dialogue', speaker: 'little-demon', text: '初次相见。' },
    { id: 'two', kind: 'thought', speaker: 'narrator', text: '我心里想。' },
    { id: 'three', kind: 'narration', speaker: 'narrator', text: '选择之前。' },
  ], choices: [{ id: 'enter', text: '走进屋里', target: 'hall', effects: { resourceDeltas: {}, relationshipDeltas: {}, setFlags: [] } }, { id: 'leave', text: '在外等待', target: 'hall', effects: { resourceDeltas: {}, relationshipDeltas: {}, setFlags: [] } }] },
  { id: 'hall', kind: 'scene', scene: 'BG_HALL', origin: 'original', sourceRefs: [], beats: [{ id: 'four', kind: 'dialogue', speaker: 'friend', text: '屋里有人。' }, { id: 'five', kind: 'narration', speaker: 'narrator', text: '又到一个选择。' }], choices: [{ id: 'finish', text: '醒来', target: 'end', effects: { resourceDeltas: {}, relationshipDeltas: {}, setFlags: [] } }] },
  { id: 'end', kind: 'ending', scene: 'BG_HALL', origin: 'original', sourceRefs: [], beats: [{ id: 'six', kind: 'narration', speaker: 'narrator', text: '梦醒。' }], ending: { id: 'end', title: '结局', summary: '结束' } },
] };
const data = { pkg, presentation: { cover: 'BG_GATE', tags: [], subtitle: '测试', description: '一个小故事', contentNote: '', chapters: { intro: '第一章', hall: '第二章' }, scenes: {}, performances: { one: { portrait: 'BG_HERO', label: '小妖怪 · 平静' }, two: { portrait: 'BG_HERO', label: '小妖怪 · 出神' }, three: { portrait: 'BG_HERO', label: '小妖怪 · 出神' } } },
  art: { BG_GATE: { id: 'BG_GATE', src: '/gate.webp', file: 'gate.webp' }, BG_HERO: { id: 'BG_HERO', src: '/hero.webp', file: 'hero.webp' } }, audio: { assets: [] }, audioUrls: {}, beats: null, notices: [], book: { manifest: { creator: '测试', simulation: false } }, release: () => {} } as unknown as GameData;
const library = { openShelf: vi.fn(), addBook: vi.fn(), bookCount: 1, panelOpen: false } as unknown as LibraryActions;
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const currentBeat = () => document.querySelector('.reading-layout')?.getAttribute('data-beat');
function enter(book = data) { render(createElement(Game, { data: book, library })); click('推开梦门'); click(/准备好了，入梦/); }
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('rumengshu:sound-choice', 'muted');
  localStorage.setItem('rumengshu:preferences', JSON.stringify({ motion: false, audioEnabled: false, textAnimation: 'instant' }));
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  HTMLElement.prototype.scrollTo = vi.fn();
  HTMLImageElement.prototype.decode = async () => {};
  let clock = 1000; vi.spyOn(performance, 'now').mockImplementation(() => clock += 200);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('阅读交互', () => {
  it('第一次入梦前模糊人物名与简介，进入后恢复角色身份', () => {
    render(createElement(Game, { data, library })); click('推开梦门');
    expect(document.querySelector('.characters-unseen .character-preview-copy')?.getAttribute('aria-hidden')).toBe('true');
    click(/准备好了，入梦/);
    expect(currentBeat()).toBe('one');
    expect(document.querySelector('.dialogue-portrait figcaption')?.textContent).toBe('小妖怪');
  });
  it('转场期间连续点击与键盘均不翻页，结束后正常继续', () => {
    enter();
    act(() => bridge.busy?.(true));
    fireEvent.click(document.querySelector('.dialogue-card')!); fireEvent.click(document.querySelector('.dialogue-card')!);
    fireEvent.keyDown(window, { code: 'ArrowRight' });
    expect(currentBeat()).toBe('one');
    act(() => bridge.busy?.(false)); click('继续');
    expect(currentBeat()).toBe('two');
  });
  it('自动档停在选择前最后一句，恢复队列可回退；下一选择覆盖自动档', () => {
    enter(); click('继续'); click('继续');
    expect(currentBeat()).toBe('three');
    click('走进屋里');
    expect(currentBeat()).toBe('four');
    click('存档'); click('读取自动档');
    expect(currentBeat()).toBe('three');
    expect(screen.queryByRole('button', { name: '走进屋里' })).toBeNull();
    click('后退一条对话'); expect(currentBeat()).toBe('two');
    click('前进一条对话'); expect(currentBeat()).toBe('three');
    click('继续'); click('在外等待'); click('继续');
    expect(currentBeat()).toBe('five');
    click('存档'); click('读取自动档');
    expect(currentBeat()).toBe('five');
    expect(screen.queryByRole('button', { name: '醒来' })).toBeNull();
  });
  it('手动档和前进队列刷新后恢复，并可从原位置继续', () => {
    enter(); click('继续'); click('后退一条对话');
    click('存档'); click('保存到手动档'); click('关闭面板');
    click('前进一条对话'); expect(currentBeat()).toBe('two');
    cleanup(); render(createElement(Game, { data, library }));
    click('打开设置'); click(/自动存档与手动存档/); click('读取手动档');
    expect(currentBeat()).toBe('one');
    click('前进一条对话'); expect(currentBeat()).toBe('two');
    expect(document.querySelector('.story-text')?.textContent).toBe('（我心里想。）');
  });
  it('文本旁白使用独立旁白名，心声保持主角，设置刷新持久化', () => {
    enter(); click('打开设置');
    fireEvent.change(screen.getByRole('combobox', { name: '旁白显示' }), { target: { value: 'text' } }); click('关闭面板');
    click('继续');
    expect(document.querySelector('.dialogue-portrait img')).not.toBeNull();
    expect(document.querySelector('.story-text')?.textContent).toBe('（我心里想。）');
    click('继续');
    expect(document.querySelector('.dialogue-portrait img')).toBeNull();
    expect(document.querySelector('.dialogue-portrait figcaption')?.textContent).toBe('旁白');
    expect(JSON.parse(localStorage.getItem('rumengshu:preferences')!).narrationMode).toBe('text');
  });
  it('闲话回复和选择可回退，读手动档继续下一句而不重新进入闲话', () => {
    const book: GameData = { ...data, presentation: { ...data.presentation, asides: { one: { options: [
      { id: 'chat', text: '聊一聊', mood: 'warm', replies: [{ speaker: 'little-demon', text: '闲话第一句。' }, { speaker: 'little-demon', text: '闲话第二句。' }] },
      { id: 'quiet', text: '静一静', mood: 'warm', replies: [{ speaker: 'narrator', text: '静静等候。' }] },
    ] } } } };
    enter(book); click('继续'); click('聊一聊'); click('继续');
    expect(currentBeat()).toBe('aside-chat-1');
    click('后退一条对话'); expect(currentBeat()).toBe('aside-chat-0');
    click('存档'); click('保存到手动档'); click('关闭面板');
    click('前进一条对话'); click('继续'); expect(currentBeat()).toBe('two');
    click('存档'); click('读取手动档'); expect(currentBeat()).toBe('aside-chat-0');
    click('前进一条对话'); click('继续'); expect(currentBeat()).toBe('two');
    click('存档'); const dialog = screen.getByRole('dialog', { name: '把这一页收好' });
    expect(within(dialog).getByRole('button', { name: '读取自动档' })).toBeTruthy();
  });
});

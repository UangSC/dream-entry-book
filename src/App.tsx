import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { advance, chooseOption, evaluateCondition, nodeVisitOrdinal, restoreCheckpoint, startPackage, visibleChoices } from './game/engine';
import type { EngineResult, SaveState } from './game/engine';
import { reconstruct } from './game/replay';
import { clearSave, collectEnding, exportAll, importAll, localStorageKV, readAlbum, readSave, writeSave } from './game/storage';
import type { AlbumEntry, KV } from './game/storage';
import { AudioEngine } from './runtime/audio';
import { PulseDriver, prefersReducedMotion } from './runtime/pulse';
import { base } from './runtime/library';
import type { GameData } from './runtime/library';
import { registerOffline } from './runtime/offline';
import { Dialog } from './components/Dialog';
import { Icon } from './components/Icon';
import { Scene } from './components/Scene';
import { StoryText } from './components/StoryText';
import { Atmosphere } from './components/Atmosphere';
import { usePortal } from './components/Portal';
import { LibraryHost, type LibraryActions } from './components/LibraryHost';
import { bookKV } from './books/storage';
import { bookKey } from './books/archive';
import { HomeCompanions } from './components/HomeCompanions';
import { ChapterTitle, useChapterIntro } from './components/ChapterTitle';
import { DialoguePortrait } from './components/DialoguePortrait';
import { StoryChoices } from './components/StoryChoices';
import { AutoReadRing, useAutoReader } from './components/AutoReader';
import { autoReadDuration, type AutoPace } from './runtime/autoReader';
import { useStoryAside } from './components/useStoryAside';
import { SessionProvider, useAccount, api } from './account/session';
import { AccountButton, AccountPanel } from './components/AccountPanel';

type Screen = 'home' | 'reading' | 'ending';
type Panel = 'intro' | 'settings' | 'album' | 'history' | 'chapters' | 'source' | 'restart' | 'save-problem' | 'account' | null;
interface Preferences { motion: boolean; particles: boolean; audioEnabled: boolean; textAnimation: 'authored' | 'typewriter' | 'instant'; autoPace: AutoPace; pulse: 'subtle' | 'normal' | 'strong'; fontSize: number; textSpeed: number; master: number; bgm: number; sfx: number; ambience: number }
const DEFAULTS: Preferences = { motion: true, particles: true, audioEnabled: true, textAnimation: 'authored', autoPace: 'normal', pulse: 'normal', fontSize: 22, textSpeed: 24, master: .8, bgm: .75, sfx: .45, ambience: .18 };
function preferences(): Preferences {
  try {
    const p = JSON.parse(localStorage.getItem('rumengshu:preferences') ?? '{}');
    return { motion: typeof p.motion === 'boolean' ? p.motion : true, particles: typeof p.particles === 'boolean' ? p.particles : true, audioEnabled: typeof p.audioEnabled === 'boolean' ? p.audioEnabled : true, textAnimation: ['authored', 'typewriter', 'instant'].includes(p.textAnimation) ? p.textAnimation : 'authored',
      pulse: ['subtle', 'normal', 'strong'].includes(p.pulse) ? p.pulse : 'normal',
      autoPace: ['slow', 'normal', 'fast'].includes(p.autoPace) ? p.autoPace : 'normal',
      fontSize: Math.max(18, Math.min(30, Number(p.fontSize) || 22)), textSpeed: Math.max(10, Math.min(45, Number(p.textSpeed) || 24)),
      ...Object.fromEntries(['master', 'bgm', 'sfx', 'ambience'].map(key => [key, typeof p[key] === 'number' && Number.isFinite(p[key]) ? Math.max(0, Math.min(1, p[key])) : DEFAULTS[key as keyof Preferences]])),
    } as Preferences;
  } catch { return DEFAULTS; }
}
const unavailableKV: KV = { get: () => null, set: () => { throw new Error('浏览器禁止保存'); }, remove: () => { throw new Error('浏览器禁止保存'); }, keys: () => [] };
const now = () => new Date().toISOString();

export function App() {
  return <SessionProvider><LibraryHost>{(data, library) => <Game key={bookKey(data.pkg)} data={data} library={library} />}</LibraryHost></SessionProvider>;
}

function Game({ data, library }: { data: GameData; library: LibraryActions }) {
  const { user } = useAccount();
  const { pkg, presentation } = data;
  const chapterNames = presentation.chapters;
  const [kv] = useState(() => bookKV(localStorageKV() ?? unavailableKV, pkg));
  const runId = useRef(kv.get('rumengshu:run-id') ?? crypto.randomUUID());
  const [initialSave] = useState(() => readSave(kv, pkg, now()));
  const [state, setState] = useState<SaveState | null>(initialSave.status === 'ok' ? initialSave.state : null);
  const stateRef = useRef(state);
  const [screen, setScreen] = useState<Screen>('home'), [panel, setPanel] = useState<Panel>(null);
  const [settings, setSettings] = useState(preferences), [reduced, setReduced] = useState(prefersReducedMotion);
  const [instant, setInstant] = useState(false), [textReady, setTextReady] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false), [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const [footerQuiet, setFooterQuiet] = useState(false);
  const [notice, setNotice] = useState(data.notices.join('；'));
  const [savedOk, setSavedOk] = useState(true);
  const [album, setAlbum] = useState<readonly AlbumEntry[]>(() => readAlbum(kv));
  const [sound, setSound] = useState(false), [soundState, setSoundState] = useState('声音未开启');
  const [offline, setOffline] = useState('正在准备离线阅读');
  const [availableUpdate, setAvailableUpdate] = useState<(() => void) | null>(null);
  const [audio] = useState(() => new AudioEngine(base + 'audio/', asset => data.audioUrls[asset.id]!));
  const [ambienceAudio] = useState(() => new AudioEngine(base + 'audio/', asset => data.audioUrls[asset.id]!));
  const [pulse] = useState(() => new PulseDriver());
  const sceneRoot = useRef<HTMLDivElement>(null), readerRef = useRef<HTMLElement>(null);
  const alive = useRef(true), musicRequest = useRef(0), clickAt = useRef(0), pageSfx = useRef(0);
  const audioReady = useRef(false);
  const motion = settings.motion && !reduced;
  const portal = usePortal(motion);
  const node = state ? pkg.nodes.find(n => n.id === state.nodeId) : null;
  const mainBeat = state && node ? node.beats[state.beatIndex] : null;
  const aside = useStoryAside(kv, `${node?.id}:${mainBeat?.id}:${state?.revision}:${state?.updatedAt}`, mainBeat ? presentation.asides?.[mainBeat.id] : undefined, () => { setSavedOk(false); setNotice('闲话书签尚未保存，下次将从这句主线重新开始'); });
  const beat = aside.beat ?? mainBeat;
  const replay = useMemo(() => state ? reconstruct(pkg, state) : null, [pkg, state]);
  const view = replay?.ok ? replay : null;
  const activeScene = screen === 'reading' ? view?.scene ?? pkg.nodes[0]!.scene : screen === 'ending' ? presentation.endingScene ?? node?.scene ?? presentation.cover : 'BG_GATE';
  const activeTrack = screen === 'reading' ? (view?.silenced ? null : view?.track === 'BGM_DREAM' ? presentation.dreamMusic ?? null : view?.track ?? presentation.dreamMusic ?? null) : screen === 'ending' ? presentation.endingMusic ?? view?.track ?? null : 'BGM_GATE';
  const sceneProfile = presentation.scenes[activeScene];
  const ambienceTrack = screen === 'reading' ? sceneProfile?.ambience : undefined;
  const endingVariants = pkg.nodes.filter(n => n.kind === 'ending');
  const endings = endingVariants.filter((node, index) => endingVariants.findIndex(other => other.ending.title === node.ending.title) === index);
  const collection = album.filter(e => e.packageId === pkg.packageId && e.buildId === pkg.buildId);
  const collectionCount = new Set(collection.map(entry => entry.title)).size;
  const ending = node?.kind === 'ending' ? node.ending : null;
  const sourceSearch = `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(pkg.source.title + ' ' + (pkg.source.author ?? ''))}`;
  const sourceCredit = <span className="source-credit"><span>原作 · {pkg.source.authorUrl ? <a href={pkg.source.authorUrl} target="_blank" rel="noopener noreferrer" aria-label={`${pkg.source.author ?? '作者'}的${pkg.source.kind === 'hackathon_excerpt' ? '知乎' : ''}主页`}>{pkg.source.author ?? '作者主页'}</a> : pkg.source.author ?? '作者信息待核对'}</span>{pkg.source.kind === 'hackathon_excerpt' ? <a href={pkg.source.sourceUrl ?? sourceSearch} target="_blank" rel="noopener noreferrer">来自知乎 ↗</a> : pkg.source.kind === 'external_excerpt' ? <span>外部作品节选</span> : <span>原创作品</span>}</span>;

  useEffect(() => {
    alive.current = true;
    void audio.loadManifest(data.audio);
    void ambienceAudio.loadManifest(data.audio);
    for (const asset of Object.values(data.art)) { const image = new Image(); image.src = asset.src; void image.decode().catch(() => {}); }
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(query.matches); query.addEventListener('change', change);
    const visibility = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', visibility);
    const unsubscribe = registerOffline(message => { if (alive.current) setOffline(message); }, activate => { if (alive.current) setAvailableUpdate(() => activate); });
    return () => { alive.current = false; query.removeEventListener('change', change); document.removeEventListener('visibilitychange', visibility); unsubscribe(); void audio.dispose(); void ambienceAudio.dispose(); };
  }, [audio, ambienceAudio, data.audio, data.art]);

  useEffect(() => {
    const open = () => setPanel('account'); window.addEventListener('dream-account-open', open);
    return () => window.removeEventListener('dream-account-open', open);
  }, []);
  useEffect(() => {
    if (!pageVisible || panel === 'account' || library.panelOpen) { void audio.pause(); void ambienceAudio.pause(); }
    else { void audio.resume(); void ambienceAudio.resume(); }
  }, [pageVisible, panel, library.panelOpen, audio, ambienceAudio]);
  useEffect(() => {
    if (!user || !state || screen === 'home') return;
    try { kv.set('rumengshu:run-id', runId.current); } catch { /* 当前会话仍可记录 */ }
    void api('/plays', { run_id: runId.current, package_id: pkg.packageId, build_id: pkg.buildId, title: pkg.title,
      node_id: state.nodeId, chapter: chapterNames[state.nodeId] ?? '梦中一页', ending: state.phase === 'finished' ? ending?.title ?? null : null }).catch(() => {});
  }, [user, state?.nodeId, state?.phase, screen, pkg.packageId, pkg.buildId, pkg.title, chapterNames, ending?.title, kv]);

  useEffect(() => {
    try { localStorage.setItem('rumengshu:preferences', JSON.stringify(settings)); } catch { /* 设置不阻止本次阅读 */ }
    audio.setVolumes({ master: sound ? settings.master : 0, bgm: settings.bgm, sfx: settings.sfx });
    ambienceAudio.setVolumes({ master: sound ? settings.master : 0, bgm: settings.ambience, sfx: 0 });
    pulse.setOptions({ enabled: motion && screen === 'home', tier: settings.pulse, reducedMotion: reduced });
  }, [settings, sound, motion, reduced, screen, audio, ambienceAudio, pulse]);

  useEffect(() => {
    let cancelled = false;
    if (!sound || !ambienceTrack) { ambienceAudio.silence(1400); return; }
    void ambienceAudio.preload([ambienceTrack]).then(failures => { if (cancelled) return; if (!failures.length) ambienceAudio.playMusic(ambienceTrack, 2000); else setNotice('环境声暂未载入，剧情可以继续'); });
    return () => { cancelled = true; };
  }, [ambienceTrack, sound, ambienceAudio]);

  useEffect(() => {
    const request = ++musicRequest.current;
    if (!sound || !activeTrack) { audio.silence(350); return; }
    setSoundState('正在载入配乐');
    void audio.preload([activeTrack]).then(failures => {
      if (!alive.current || request !== musicRequest.current) return;
      if (failures.length || audio.getStatus().state !== 'ready') { setSoundState('配乐未能播放，可重试'); return; }
      audio.playMusic(activeTrack); setSoundState('配乐已开启');
    });
  }, [activeTrack, sound, audio]);

  useEffect(() => {
    pulse.setBeatMap(activeTrack === 'BGM_GATE' ? data.beats : null);
    let frame = 0;
    const render = (time: number) => {
      if (!document.hidden && sceneRoot.current) {
        const position = sound && settings.master > 0 && settings.bgm > 0 && activeTrack ? audio.positionOf(activeTrack) : null;
        const sample = pulse.sample(position, time / 1000);
        const visual = pulse.visual(sample);
        sceneRoot.current.style.setProperty('--pulse-scale', String(visual.scale));
        sceneRoot.current.style.setProperty('--pulse-brightness', String(visual.brightness));
        sceneRoot.current.style.setProperty('--pulse', String(sample.envelope));
      }
      if (motion && screen === 'home') frame = requestAnimationFrame(render);
    };
    render(performance.now());
    return () => cancelAnimationFrame(frame);
  }, [pulse, audio, data.beats, activeTrack, sound, motion, screen, settings.master, settings.bgm]);

  const completeText = useCallback(() => setTextReady(true), []);
  const enableSound = async () => {
    if (sound) { setSound(false); setSettings(s => ({ ...s, audioEnabled: false })); setSoundState('已静音'); return; }
    const [status] = await Promise.all([audio.unlock(), ambienceAudio.unlock()]);
    if (status.state !== 'ready') { setSoundState('浏览器暂时阻止声音，请再次开启'); return; }
    audioReady.current = true; setSound(true); setSettings(s => ({ ...s, audioEnabled: true }));
    void audio.preload(data.audio.assets.filter(a => a.kind === 'sfx').map(a => a.id));
  };
  const ensureSound = () => { if (!audioReady.current && settings.audioEnabled) void enableSound(); };
  const save = (next: SaveState) => {
    let outcome = writeSave(kv, next);
    if (outcome.ok) for (const entry of album) {
      const collected = collectEnding(kv, entry);
      if (!collected.ok) { outcome = collected; break; }
    }
    setSavedOk(outcome.ok);
    if (!outcome.ok) setNotice(outcome.message);
    return outcome.ok;
  };
  const apply = (result: EngineResult, restored = false) => {
    if (!result.ok) { setNotice(result.error.message); return; }
    if ('stale' in result) return;
    stateRef.current = result.state; setState(result.state); save(result.state);
    setInstant(restored || !motion); setTextReady(restored || !motion);
    if (!restored && sound) for (const event of result.events) if (event.type === 'sfx') audio.playSfx(event.assetId);
  };
  const start = () => {
    runId.current = crypto.randomUUID();
    setPanel(null); portal.cross(() => { apply(startPackage(pkg, now())); setScreen('reading'); }, 'enter');
    if (sound) audio.playSfx('SFX_DREAM_IN');
    readerRef.current?.focus();
  };
  const continueDream = () => {
    if (!stateRef.current) return;
    const finalNode = pkg.nodes.find(n => n.id === stateRef.current!.nodeId);
    const collected = finalNode?.kind === 'ending' && collection.some(e => e.endingId === finalNode.ending.id);
    ensureSound(); setPanel(null); portal.cross(() => { setScreen(stateRef.current!.phase === 'finished' && collected ? 'ending' : 'reading'); setInstant(true); setTextReady(true); }, 'enter');
  };
  const finish = () => {
    if (!stateRef.current || !ending) return;
    const entry: AlbumEntry = { packageId: pkg.packageId, buildId: pkg.buildId, endingId: ending.id, title: ending.title, collectedAt: now() };
    const result = collectEnding(kv, entry);
    setAlbum(previous => previous.some(e => e.packageId === entry.packageId && e.buildId === entry.buildId && e.endingId === entry.endingId) ? previous : [...previous, entry]);
    if (!result.ok) { setNotice(result.message); setSavedOk(false); }
    if (sound) audio.playSfx('SFX_DREAM_OUT'); portal.cross(() => setScreen('ending'), 'exit');
  };
  const advanceStory = () => {
    if (panel || library.panelOpen || portal.busy || screen !== 'reading' || !stateRef.current) return;
    if (!textReady && motion && !instant) { setInstant(true); setTextReady(true); return; }
    if (performance.now() - clickAt.current < 180) return;
    clickAt.current = performance.now();
    if (stateRef.current.phase === 'choosing') return;
    if (stateRef.current.phase === 'finished') { finish(); return; }
    const asideStep = aside.advance();
    if (asideStep === 'choice') { setAutoPlay(false); return; }
    if (asideStep === 'reply') { setInstant(!motion); setTextReady(!motion); return; }
    if (sound) { const pool = ['SFX_PAGE', 'SFX_PAGE_SOFT', 'SFX_PAGE_DREAM']; audio.playSfx(pool[pageSfx.current++ % pool.length]!); }
    apply(advance(pkg, stateRef.current, now()));
  };
  const choose = (choiceId: string, revision: number) => {
    const current = stateRef.current;
    if (!current || portal.busy || !textReady && motion && !instant || performance.now() - clickAt.current < 180) return;
    clickAt.current = performance.now();
    const result = chooseOption(pkg, current, { nodeId: current.nodeId, choiceId, nodeVisit: nodeVisitOrdinal(current.choiceHistory, current.nodeId), revision }, now());
    if (result.ok && !('stale' in result) && sound) audio.playSfx('SFX_CHOICE');
    apply(result);
  };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || panel || screen !== 'reading') return;
      if ((event.target as HTMLElement).closest('button, input, select, textarea, a, [contenteditable]')) return;
      if (event.code === 'Space' || event.code === 'ArrowRight') { event.preventDefault(); advanceStory(); }
      if (event.code === 'KeyH') setPanel('history');
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });
  useEffect(() => { if (screen === 'reading') readerRef.current?.focus(); }, [screen]);
  useEffect(() => { if (notice) { const timer = window.setTimeout(() => setNotice(''), 6500); return () => clearTimeout(timer); } }, [notice]);
  useEffect(() => {
    if (savedOk) return;
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave);
  }, [savedOk]);

  const exportBackup = () => {
    let entries: Record<string, string> = {};
    try { entries = JSON.parse(exportAll(kv)).data; } catch { /* 未保存的当前进度仍可导出 */ }
    if (stateRef.current) entries[`rumengshu:save:${pkg.packageId}`] = JSON.stringify(stateRef.current);
    entries['rumengshu:album'] = JSON.stringify({ albumVersion: 1, entries: album });
    const blob = new Blob([JSON.stringify({ exportVersion: 1, exportedAt: now(), data: entries }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `rumengshu-save-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importBackup = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setNotice('备份不得超过 2 MiB'); return; }
    try {
      const backup = await file.text();
      // 导入前额外保留当前进度；失败时仍可回溯。
      if (stateRef.current) kv.set(`rumengshu:backup:${pkg.packageId}:${Date.now()}`, JSON.stringify(stateRef.current));
      const result = importAll(kv, backup, [pkg]);
      if (!result.ok) { setNotice(result.message); return; }
      const loaded = readSave(kv, pkg, now());
      if (loaded.status === 'ok') { stateRef.current = loaded.state; setState(loaded.state); }
      setAlbum(readAlbum(kv)); setScreen('home'); setPanel(null); setSavedOk(true); setNotice('备份已导入，原有梦签已保留');
    } catch { setNotice('备份读取或保存失败，当前进度未变'); }
  };
  const restart = () => {
    try {
      if (stateRef.current) kv.set(`rumengshu:backup:${pkg.packageId}:${Date.now()}`, JSON.stringify(stateRef.current));
      else if (initialSave.status === 'build-mismatch' || initialSave.status === 'corrupt') {
        const raw = kv.get(`rumengshu:save:${pkg.packageId}`); if (raw) kv.set(`rumengshu:backup:${pkg.packageId}:${Date.now()}`, raw);
      }
    } catch { setNotice('旧进度备份失败，请先导出存档'); return; }
    start();
  };
  const ready = textReady || instant || !motion || settings.textAnimation === 'instant';
  const chapterKey = node?.id.replace(/-after$/, '') ?? null;
  const { chapterPhase, brandPhase } = useChapterIntro(screen === 'reading' ? chapterKey : null, !portal.busy, node?.id === pkg.entryNodeId);
  const chapterTitle = chapterNames[node?.id ?? ''] ?? '梦中一页';
  const brandSubtitle = screen === 'reading' ? `当前章节 · ${chapterTitle}` : '读过的故事，值得一活';
  const portraitCue = beat ? presentation.performances?.[beat.id] : undefined;
  const portrait = aside.portrait ? data.art[aside.portrait] : portraitCue?.portrait ? data.art[portraitCue.portrait] : undefined;
  const speakerName = beat?.speaker === 'narrator' ? '梦中一页' : pkg.characters.find(c => c.id === beat?.speaker)?.name ?? '梦中人';
  const portraitName = aside.beat ? (beat?.speaker === 'narrator' ? pkg.characters.find(c => c.id === 'little-demon')?.name ?? '梦中人' : speakerName) : portraitCue?.label.split(' · ')[0] ?? speakerName;
  const choices = aside.choosing ? aside.options : node?.kind === 'scene' && state?.phase === 'choosing' ? visibleChoices(node, state) : [];
  const choiceMoods = aside.choosing ? Object.fromEntries(aside.options.map(option => [option.id, option.mood])) : presentation.choiceMoods;
  useEffect(() => {
    if (screen !== 'reading' || choices.length > 0 || state?.phase === 'finished') setAutoPlay(false);
  }, [screen, choices.length, state?.phase]);
  const autoProgress = useAutoReader(`${state?.revision}:${beat?.id}`, autoReadDuration(beat?.text ?? '', settings.autoPace), autoPlay,
    screen === 'reading' && ready && !panel && !library.panelOpen && !portal.busy && pageVisible && !choices.length && state?.phase !== 'finished', advanceStory);
  useEffect(() => {
    setFooterQuiet(false);
    if (screen !== 'reading' || portal.busy) return;
    const timer = setTimeout(() => setFooterQuiet(true), 900);
    return () => clearTimeout(timer);
  }, [screen, portal.busy]);
  const totalBeats = useMemo(() => {
    const lengths = new Map<string, number>();
    const count = (id: string): number => { if (lengths.has(id)) return lengths.get(id)!; const node = pkg.nodes.find(n => n.id === id)!; const targets = node.kind === 'scene' ? node.next ? [node.next] : node.choices?.map(c => c.target) ?? [] : []; const length = node.beats.length + Math.max(0, ...targets.map(count)); lengths.set(id, length); return length; };
    return count(pkg.entryNodeId);
  }, [pkg]);
  const progress = state ? state.phase === 'finished' ? 100 : Math.min(99, Math.round(((view?.lines.length ?? 1) / totalBeats) * 100)) : 0;
  const leaveDream = () => { if (stateRef.current && !save(stateRef.current)) return; setPanel(null); if (screen === 'reading') portal.cross(() => setScreen('home'), 'exit'); else setScreen('home'); };
  const setPreference = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setSettings(s => ({ ...s, [key]: value }));

  return <div className={`game screen-${screen} ${motion ? 'motion-on' : 'motion-off'} ${portal.busy ? 'portal-busy' : ''} ${footerQuiet ? 'footer-quiet' : ''}`} style={{ '--reading-size': `${settings.fontSize}px` } as CSSProperties}>
    <div className="world" ref={sceneRoot}><Scene asset={data.art[activeScene]} motion={motion && !portal.busy} /><div className="world-light" />{screen === 'home' && <div className="world-particles" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}</div>}</div>
    <div className="scene-shade" />
    <Atmosphere scene={activeScene} kind={screen === 'reading' ? sceneProfile?.particles ?? 'none' : 'none'} enabled={motion && settings.particles} />
    {portal.layer}
    <header className="topbar">
      <button className={`brand ${screen === 'reading' ? `brand-${brandPhase}` : ''}`} aria-hidden={screen === 'reading' && brandPhase !== 'visible'} tabIndex={screen === 'reading' && brandPhase !== 'visible' ? -1 : undefined} aria-label="返回梦斋" onClick={leaveDream}><span className="brand-mark"><Icon name="book" size={24} /></span><span>入梦书<small key={brandSubtitle} className="brand-subtitle">{brandSubtitle}</small></span></button>
      <nav aria-label="主要导航"><button className="nav-button library-button" aria-label="打开入梦书架" onClick={() => { if (!stateRef.current || save(stateRef.current)) library.openShelf(); }}><Icon name="book" /><span>入梦书架</span></button><button className="nav-button" aria-label={`我的梦册，已收集 ${collectionCount} 枚梦签`} onClick={() => setPanel('album')}><Icon name="bookmark" /><span>我的梦册</span><em>{collectionCount}</em></button><button className="icon-button sound-button" aria-label={sound ? '关闭声音' : '开启声音'} title={soundState} onClick={() => void enableSound()}><Icon name={sound ? 'sound' : 'mute'} /></button><button className="icon-button" aria-label="打开设置" onClick={() => setPanel('settings')}><Icon name="settings" /></button><AccountButton onOpen={() => setPanel('account')} /></nav>
    </header>

    {screen === 'home' && <main className="home-layout">
      <section className="welcome"><span className="eyebrow"><span className="tiny-star">✧</span> 云上的书屋 · 为你留了一盏灯</span><h1>借一段故事，<br />赴一场<span>有回响的梦。</span></h1><p className="welcome-copy">如果你活在故事里，会做出怎样的选择？<br />推开梦门。这一次，让故事记住你。</p><div className="home-actions"><button className="primary" onClick={() => { ensureSound(); if (state) continueDream(); else if (initialSave.status !== 'none') setPanel('save-problem'); else setPanel('intro'); }}>{state ? state.phase === 'finished' ? '重温这一场梦' : '继续上次的梦' : '推开梦门'}<Icon name="arrow" /></button>{state && <button className="secondary restart-button" onClick={() => setPanel('restart')}><Icon name="history" size={16} />从头入梦</button>}<button className="secondary add-book-button" onClick={library.addBook}><Icon name="spark" size={16} />新增入梦书</button></div><div className="little-facts"><span><Icon name="moon" size={15} />一场梦，慢慢读</span><span><Icon name="bookmark" size={15} />每个选择，都留下痕迹</span></div>
      <HomeCompanions motion={motion} active={!panel && !portal.busy} /></section>
      <section className="featured" aria-label="本期梦境"><div className="featured-caption"><span>今夜，借你一场梦</span><span>01 / {String(library.bookCount).padStart(2, '0')}</span></div><button className="book-cover" onClick={() => { ensureSound(); setPanel('intro'); }} aria-label={`查看${pkg.title}`}><img src={data.art[presentation.cover]?.src} alt={`${pkg.title}封面`} /><div className="book-spine" /><div className="cover-content"><span className="cover-series">入梦书 · {presentation.tags[1] ?? '今夜来信'}</span><span className="cover-rule" /><h2>{pkg.title}</h2><p>{presentation.subtitle}</p><span className="cover-author">原作 / {pkg.source.author ?? '作者信息待核对'}</span></div><div className="cover-bottom"><span>{presentation.tags[0] ?? '故事奇遇'}</span><span>{endings.length} 个梦的去向 <Icon name="arrow" size={17} /></span></div></button><div className="book-meta"><span><i />已为你备好这场梦</span><button className="text-button" onClick={() => setPanel('source')}>原作与改编说明 <span>↗</span></button></div><div className="book-source">{sourceCredit}{data.book.manifest.simulation && <small className="simulation-label">生成流程演示素材</small>}</div></section>
    </main>}

    {screen === 'reading' && state && node && beat && <main ref={readerRef} className="reading-layout" tabIndex={-1} aria-label="故事阅读" data-node={node.id} data-beat={beat.id} data-phase={state.phase}>
      <ChapterTitle key={chapterKey} title={chapterTitle} subtitle={`${presentation.tags[1] ?? "梦中来信"} · ${pkg.title}`} phase={chapterPhase} />
      <section className="reading-dock"><div className="reading-status"><span className="scene-location"><i />{sceneProfile?.label ?? '梦中一隅'}</span><span>{savedOk ? '书签已收好' : '进度尚未保存'} · {String(view?.lines.length ?? 1).padStart(2, '0')}</span></div>
        <div className="dialogue-card" onClick={event => { if (!(event.target as HTMLElement).closest('button, a')) advanceStory(); }}>
          <DialoguePortrait key={portraitName} portrait={portrait} name={portraitName} label={portraitCue?.label ?? portraitName} motion={motion} />
          <span className="sr-only">{speakerName}{beat.kind === 'thought' ? '的心声' : ''}</span>
          <div className="text-area" role="log" aria-live="polite" aria-atomic="true"><span className="portrait-clearance" aria-hidden="true" /><StoryText key={beat.id} beat={beat} motion={motion} instant={instant} speed={settings.textSpeed} mode={settings.textAnimation} onComplete={completeText} /></div>
          {!(choices.length && ready) && <div className="continue-row"><button className="continue-button" aria-label={!ready ? '显示全文' : state.phase === 'finished' ? '收下这场梦' : '继续'} onClick={advanceStory}>{autoPlay ? <AutoReadRing progress={autoProgress} /> : <Icon name="arrow" size={20} />}</button></div>}
        </div><div className="reader-toolbar"><button className={`auto-play-toggle ${autoPlay ? 'active' : ''}`} aria-label={autoPlay ? '暂停自动播放' : '开始自动播放'} aria-pressed={autoPlay} disabled={choices.length > 0 || state.phase === 'finished'} onClick={() => setAutoPlay(value => !value)}><Icon name={autoPlay ? 'pause' : 'play'} size={16} />{autoPlay ? '暂停播放' : '自动播放'}</button><button onClick={() => setPanel('history')}><Icon name="history" size={16} />前情回顾</button><button onClick={() => setPanel('chapters')}><Icon name="bookmark" size={16} />分歧回望</button><button onClick={leaveDream}><Icon name="home" size={16} />保存离梦</button></div>
      </section>
      {choices.length > 0 && ready && !panel && !portal.busy && <StoryChoices key={`${node.id}:${state.revision}:${aside.choosing}`} options={choices} moods={choiceMoods} motion={motion} onChoose={id => { if (aside.choosing) { aside.choose(id); setInstant(!motion); setTextReady(!motion); } else choose(id, state.revision); }} />}
    </main>}

    {screen === 'reading' && <div className="progress-track reading-progress" role="progressbar" aria-label="故事阅读进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{ width: `${progress}%` }} /></div>}

    {screen === 'ending' && ending && state && <main className="ending-layout"><div className="ending-intro"><span className="eyebrow">这一次，你把梦留成了这样</span><div className="ending-emblem"><Icon name={ending.id === 'a-lamp-kept' ? 'spark' : 'moon'} size={40} /></div><h1>{ending.title}</h1><p>{ending.summary}</p><span className="ending-collected"><Icon name="check" size={16} />{savedOk ? '梦签已收入梦册' : '梦签暂存于本次会话，请导出备份'}</span></div><section className="echo-card"><h2>你的选择，故事记得</h2>{ending.reflections?.filter(item => evaluateCondition(item.when, state)).map((item, i) => <p key={i}><span>0{i + 1}</span>{item.text}</p>)}<div className="outcomes">{ending.outcomes?.filter(item => evaluateCondition(item.when, state)).map(item => <div key={item.characterId}><b>{pkg.characters.find(c => c.id === item.characterId)?.name}</b><span>{item.text}</span></div>)}</div></section><div className="ending-actions"><button className="primary" onClick={() => setPanel('chapters')}>回到某个选择 <Icon name="history" /></button><button className="secondary" onClick={() => setScreen('home')}>回梦斋</button></div><p className="ending-note">{sourceCredit}<br />AI 衍生的局部终幕 · 原作的故事仍在书页之外<br /><a href={pkg.source.sourceUrl ?? sourceSearch} target="_blank" rel="noopener noreferrer">去知乎，发现更多好故事 ↗</a></p></main>}

    <footer className="footer"><div className="footer-status"><span><i className={offline === '离线就绪' ? 'status-dot ready' : 'status-dot'} />{offline}</span>{availableUpdate && screen === 'home' && <button onClick={() => { if (stateRef.current) save(stateRef.current); availableUpdate(); }}>新版本已备好，更新书页</button>}</div><a className="zhihu-discover" href="https://www.zhihu.com/" target="_blank" rel="noopener noreferrer">去知乎，发现更多故事 ↗</a><button onClick={() => setPanel('source')}>关于这场梦</button></footer>
    {panel === 'account' && user && <AccountPanel onClose={() => setPanel(null)} library={library} />}
    {!savedOk && <div className="save-warning" role="alert"><span>本次进度尚未保存</span><button onClick={() => { if (stateRef.current) save(stateRef.current); }}>重试保存</button><button onClick={exportBackup}>导出备份</button></div>}
    {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="关闭提示"><Icon name="close" size={16} /></button></div>}

    {panel === 'intro' && <Dialog title={`即将入梦 · ${pkg.title}`} onClose={() => setPanel(null)}><div className="intro-banner"><img src={data.art[presentation.cover]?.src} alt={`${pkg.title}的故事背景`} /><span>{pkg.title}</span></div><div className="intro-source">{sourceCredit}</div><p className="dialog-lead">{presentation.description}</p><div className="character-list">{pkg.characters.map(c => <div key={c.id}><b>{c.name}</b><p>{c.bio}</p></div>)}</div><p className="fine-print">{presentation.contentNote}</p>{data.book.manifest.simulation && <p className="simulation-label">流程演示：沿用内置故事，未解析或生成你的输入内容。</p>}<button className="primary full-width" onClick={() => { ensureSound(); if (state) setPanel('restart'); else if (initialSave.status !== 'none') setPanel('save-problem'); else start(); }}>准备好了，入梦 <Icon name="arrow" /></button></Dialog>}

    {panel === 'settings' && <Dialog title="让梦适合你的节奏" onClose={() => setPanel(null)}><section className="settings-section"><h3>声音与呼吸</h3><label className="setting-row"><span>播放声音<small>{soundState}</small></span><button className={`switch ${sound ? 'on' : ''}`} role="switch" aria-label="播放声音" aria-checked={sound} onClick={() => void enableSound()}><i /></button></label>{(['master', 'bgm', 'sfx', 'ambience'] as const).map((key, i) => <label className="setting-row" key={key}><span>{['总体音量', '背景音乐', '翻页与互动音效', '夜晚环境声'][i]}</span><input aria-label={['总体音量', '背景音乐', '翻页与互动音效', '夜晚环境声'][i]} type="range" min="0" max="1" step="0.01" value={settings[key]} onChange={e => setPreference(key, Number(e.target.value))} /><output>{Math.round(settings[key] * 100)}%</output></label>)}<label className="setting-row"><span>动态效果<small>{reduced ? '系统已要求减少动态效果，当前全部静止' : '转场、字幕与粒子；画面律动仅在梦斋开启'}</small></span><button className={`switch ${settings.motion ? 'on' : ''}`} role="switch" aria-label="动态效果" aria-checked={settings.motion} onClick={() => setPreference('motion', !settings.motion)}><i /></button></label><label className="setting-row"><span>场景粒子<small>夜间萤火虫，白昼偶尔飘落的叶子</small></span><button className={`switch ${settings.particles ? 'on' : ''}`} role="switch" aria-label="场景粒子" aria-checked={settings.particles} onClick={() => setPreference('particles', !settings.particles)}><i /></button></label><label className="setting-row"><span>梦斋律动强度</span><select value={settings.pulse} onChange={e => setPreference('pulse', e.target.value as Preferences['pulse'])} aria-label="梦斋律动强度"><option value="subtle">轻柔</option><option value="normal">明显</option><option value="strong">鲜明</option></select></label></section><section className="settings-section"><h3>阅读</h3><label className="setting-row"><span>自动语速<small>全文显示后计时，遇到选择停下</small></span><select aria-label="自动语速" value={settings.autoPace} onChange={e => setPreference("autoPace", e.target.value as AutoPace)}><option value="slow">舒缓</option><option value="normal">适中</option><option value="fast">轻快</option></select></label><label className="setting-row"><span>字幕动画</span><select aria-label="字幕动画" value={settings.textAnimation} onChange={e => setPreference('textAnimation', e.target.value as Preferences['textAnimation'])}><option value="authored">原有演出动画</option><option value="typewriter">打字机 · 流式渐显</option><option value="instant">直接显示全文</option></select></label>{settings.textAnimation === 'typewriter' && <label className="setting-row"><span>文字出现速度</span><input aria-label="文字出现速度" type="range" min="10" max="45" value={settings.textSpeed} onChange={e => setPreference('textSpeed', Number(e.target.value))} /><output>{Math.round(1000 / settings.textSpeed)} 字/秒</output></label>}<label className="setting-row"><span>正文字号</span><input aria-label="正文字号" type="range" min="18" max="30" step="1" value={settings.fontSize} onChange={e => setPreference('fontSize', Number(e.target.value))} /><output>{settings.fontSize}</output></label><p className="font-preview" style={{ fontSize: settings.fontSize }}>你为这段故事，留出了一点时间。</p></section><section className="settings-section"><h3>书签与离线</h3><p className="muted">{offline}。进度只保存在当前浏览器；更换设备或地址前，可以导出备份。</p><div className="button-row"><button className="secondary" onClick={exportBackup}><Icon name="download" size={16} />导出备份</button><label className="secondary file-button">导入备份<input type="file" accept="application/json,.json" onChange={e => { void importBackup(e.target.files?.[0]); e.target.value = ''; }} /></label></div><button className="text-button danger" onClick={() => { const outcome = clearSave(kv, pkg.packageId); if (outcome.ok) { stateRef.current = null; setState(null); setScreen('home'); setNotice('当前进度已删除，梦册已保留'); } else setNotice(outcome.message); }}>删除当前进度，保留梦册</button></section></Dialog>}

    {panel === 'album' && <Dialog title="你带回来的梦" onClose={() => setPanel(null)}><p className="muted">已收集 {collectionCount} / {endings.length} 枚梦签。重选一段故事，也不会抹去曾经抵达的地方。</p><div className="album-grid">{endings.map((item, index) => { const variants = endingVariants.filter(node => node.ending.title === item.ending.title); const unlocked = variants.filter(node => collection.some(entry => entry.endingId === node.ending.id)); const entry = collection.find(e => variants.some(node => node.ending.id === e.endingId)); return <article key={item.id} className={`album-card ${entry ? 'unlocked' : ''}`}><span className="album-index">梦签 / 0{index + 1}</span><Icon name={entry ? 'spark' : 'bookmark'} size={30} /><h3>{entry ? entry.title : '尚未抵达的梦'}</h3><p>{entry ? unlocked.map(node => node.ending.summary).join(' ／ ') : '留一点未知，给下一次选择。'}</p>{entry && <small>{new Date(entry.collectedAt).toLocaleDateString('zh-CN')}</small>}</article>; })}</div>{!state && <button className="primary full-width" onClick={() => setPanel('intro')}>去遇见第一个结局 <Icon name="arrow" /></button>}</Dialog>}

    {panel === 'history' && <Dialog title="已经走过的书页" onClose={() => setPanel(null)} wide><div className="history-list">{view?.lines.map(item => <div key={item.beat.id}><small>{chapterNames[item.nodeId] ?? '梦中一页'} · {item.beat.speaker === 'narrator' ? '旁白' : pkg.characters.find(c => c.id === item.beat.speaker)?.name}</small><p>{item.beat.text}</p></div>)}</div></Dialog>}

    {panel === 'chapters' && <Dialog title="回到风向改变的地方" onClose={() => setPanel(null)}><p className="muted">从已走过的分歧点重选。之后的剧情进度会回到当时，收藏的梦签依然保留。</p>{state?.checkpoints.length ? <div className="checkpoint-list">{state.checkpoints.map((checkpoint, index) => <button className="checkpoint" key={index} onClick={() => { apply(restoreCheckpoint(pkg, stateRef.current!, index, now()), true); setPanel(null); setScreen('reading'); }}><span>0{index + 1}</span><div><b>{chapterNames[checkpoint.nodeId] ?? '梦中分歧'}</b><small>{pkg.nodes.find(n => n.id === checkpoint.nodeId)?.kind === 'scene' ? '回到这里，重新作出选择' : ''}</small></div><Icon name="history" size={19} /></button>)}</div> : <div className="empty-state"><Icon name="bookmark" size={32} /><p>还没有走到分歧处，先继续读下去吧。</p></div>}</Dialog>}

    {panel === 'source' && <Dialog title="关于这场梦" onClose={() => setPanel(null)}><p className="dialog-lead">读过的故事，值得一活。</p><p>这本入梦书取材于{pkg.source.author ?? '作者信息待核对'}的《{pkg.source.title}》。{pkg.source.kind === 'hackathon_excerpt' ? '原始材料来自知乎提供的有限节选。' : pkg.source.kind === 'external_excerpt' ? '原始材料为外部作品节选。' : '来源为原创作品。'}</p><p>你所经历的对白、取舍与局部终幕含有改编和扩写，不代表原作者的完整结局。</p><div className="source-box"><span>原作</span><strong>{pkg.source.title}</strong>{sourceCredit}{pkg.source.publishedAt && <span>发布日期：<time dateTime={pkg.source.publishedAt}>{pkg.source.publishedAt}</time></span>}{pkg.source.authorUrl && <a href={pkg.source.authorUrl} target="_blank" rel="noopener noreferrer">前往作者主页 ↗</a>}<a className="secondary" href={pkg.source.sourceUrl ?? sourceSearch} target="_blank" rel="noopener noreferrer">{pkg.source.sourceUrl ? pkg.source.kind === 'hackathon_excerpt' ? '前往知乎阅读原作' : '前往来源网站阅读原作' : '去知乎查找故事'} ↗</a>{!pkg.source.sourceUrl && <small>当前为知乎搜索入口，尚未核对原文直链。</small>}</div><p className="muted">在知乎，读更多好故事，也遇见故事背后的人。</p><p className="fine-print">入梦书制作：{data.book.manifest.creator}。素材来源与使用说明随入梦书一同保存。</p>{data.book.manifest.simulation && <p className="simulation-label">本书为流程演示产物，沿用已有剧情和素材，未调用大模型。</p>}</Dialog>}

    {(panel === 'restart' || panel === 'save-problem') && <Dialog title={panel === 'restart' ? '再借一次这段故事' : '旧书签需要先收好'} onClose={() => setPanel(null)}><p>{panel === 'restart' ? '新一轮梦境会从第一页开始。当前进度会另存备份，已经收藏的梦签不受影响。' : '检测到旧版本或异常存档，暂时不能直接续读。你可以导出留存，再开启这版故事；原始书签会另存备份。'}</p><div className="button-row"><button className="secondary" onClick={exportBackup}>导出当前备份</button><button className="primary" onClick={restart}>收好书签，重新入梦 <Icon name="arrow" /></button></div></Dialog>}
  </div>;
}

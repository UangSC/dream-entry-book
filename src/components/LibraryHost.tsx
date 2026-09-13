import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { loadLibrary, mountBook, type GameData } from '../runtime/library';
import { bookKey, readDreamBook, type LoadedBook } from '../books/archive';
import { listBooks, storeBook, type BookRecord } from '../books/storage';
import { GENERATION_STAGES, generationInputSchema, simulatedWeaver, snapshotJob, type GenerationJob } from '../books/generation';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { BookDownload } from './BookDownload';
import { api, useAccount } from '../account/session';

export interface LibraryActions { openShelf: () => void; addBook: () => void; bookCount: number; panelOpen: boolean; importArchive: (book: LoadedBook) => Promise<void> }
function Cover({ blob }: { blob: Blob }) { const [url, setUrl] = useState(''); useEffect(() => { const url = URL.createObjectURL(blob); setUrl(url); return () => URL.revokeObjectURL(url); }, [blob]); return <img src={url || undefined} alt="入梦书封面" />; }
export function LibraryHost({ children }: { children: (data: GameData, actions: LibraryActions) => ReactNode }) {
  const { user } = useAccount();
  const [data, setData] = useState<GameData | null>(null), [builtin, setBuiltin] = useState<GameData | null>(null);
  const [books, setBooks] = useState<BookRecord[]>([]), [panel, setPanel] = useState<'shelf' | 'add' | 'generate' | null>(null);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(''), [attempt, setAttempt] = useState(0);
  const [job, setJob] = useState<GenerationJob | null>(() => simulatedWeaver.restore()), [clock, setClock] = useState(Date.now);
  const [collectedJob, setCollectedJob] = useState(() => { try { return localStorage.getItem('rumengshu:weave-collected'); } catch { return null; } });
  const [title, setTitle] = useState(''), [story, setStory] = useState(''), [url, setUrl] = useState(''), [files, setFiles] = useState<File[]>([]);
  const [preparedBook, setPreparedBook] = useState<LoadedBook | null>(null);
  const mounted = useRef(new Map<string, GameData>()), active = useRef(true), operation = useRef(false);
  useEffect(() => {
    let cancelled = false; active.current = true;
    void (async () => {
      try {
        const initial = await loadLibrary();
        if (cancelled) { initial.release(); return; }
        mounted.current.set(bookKey(initial.pkg), initial); setBuiltin(initial); setData(initial);
        let stored: BookRecord[] = [];
        try { stored = await listBooks(); if (!cancelled) setBooks(stored); } catch { setMessage('书库存储暂不可用，内置故事仍可游玩'); }
        let selection: string | null = null; try { selection = localStorage.getItem('rumengshu:selected-book'); } catch { /* 内置书仍可用 */ }
        const selected = stored.find(book => book.id === selection);
        if (selected && !cancelled) { const selectedData = mountBook(await readDreamBook(new Uint8Array(await selected.archive.arrayBuffer())), initial); if (cancelled) selectedData.release(); else { mounted.current.set(selected.id, selectedData); setData(selectedData); } }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : '书页读取失败'); }
    })();
    return () => { cancelled = true; active.current = false; mounted.current.forEach(book => book.release()); mounted.current.clear(); };
  }, [attempt]);
  const ticking = job?.status === 'running' && clock < job.startedAt + job.durationMs;
  useEffect(() => { if (!ticking) return; const timer = setInterval(() => setClock(Date.now()), 500); return () => clearInterval(timer); }, [ticking]);
  const progress = job ? snapshotJob(job, clock) : null;
  const run = async (label: string, task: () => Promise<void>) => {
    if (operation.current) return; operation.current = true; setBusy(label); setError(''); setMessage('');
    try { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())); await task(); }
    catch (e) { setError(e instanceof Error ? e.message : '操作未完成，请重试'); }
    finally { operation.current = false; if (active.current) setBusy(''); }
  };
  const choose = (key: string) => void run('正在翻开入梦书', async () => {
    if (!builtin) return;
    let next = mounted.current.get(key);
    if (!next) { const record = books.find(b => b.id === key); if (!record) throw new Error('这本入梦书不在书库中'); next = mountBook(await readDreamBook(new Uint8Array(await record.archive.arrayBuffer())), builtin); mounted.current.set(key, next); }
    setData(next); try { localStorage.setItem('rumengshu:selected-book', key); } catch { /* 本次选择有效 */ }
    setPanel(null);
  });
  const addLoaded = async (book: LoadedBook, reveal = true) => {
    if (builtin && bookKey(book.pkg) === bookKey(builtin.pkg)) {
      if (book.manifest.storySha256 !== builtin.book.manifest.storySha256 || JSON.stringify(book.manifest.assets) !== JSON.stringify(builtin.book.manifest.assets)) throw new Error('内置入梦书的同一版本内容不同，请更换 buildId');
      setMessage('这本入梦书已在书库中，已有进度已保留'); setPanel('shelf'); return;
    }
    const record = await storeBook(book); setBooks(previous => [...previous.filter(b => b.id !== record.id), record]); setMessage('入梦书已收进书库，可以打开游玩或再次导出'); if (reveal) setPanel('shelf');
    if (user && reveal) await api('/imports', { package_id: book.pkg.packageId, build_id: book.pkg.buildId, title: book.pkg.title }).catch(() => setMessage('入梦书已收好，账号入架记录暂未同步。'));
    if (book.manifest.simulation && job && book.pkg.packageId === `weave-demo-${job.id}`) { setCollectedJob(job.id); try { localStorage.setItem('rumengshu:weave-collected', job.id); } catch { /* 本次已收取仍有效 */ } }
  };
  const importBook = (file?: File) => { if (file) void run('正在检查剧情与素材', async () => { if (file.size > 80 * 1024 * 1024) throw new Error('入梦书不得超过 80 MiB'); await addLoaded(await readDreamBook(new Uint8Array(await file.arrayBuffer()))); }); };
  const generate = () => void run('正在建立模拟任务', async () => {
    const parsed = generationInputSchema.safeParse({ title, text: story, url, attachments: files.map(file => ({ name: file.name, type: file.type, size: file.size })) });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? '请检查输入');
    if (user) {
      await api('/jobs', { title: parsed.data.title, text: story || (files.length ? '模拟附件：' + files.map(file => file.name).join('、') : ''), url });
      setPanel(null); window.dispatchEvent(new Event('dream-account-open')); return;
    }
    const next = await simulatedWeaver.start(parsed.data); setJob(next); setClock(Date.now()); setPreparedBook(null);
  });
  if (!data || !builtin) return <main className="loading-page"><Icon name="book" size={40} /><h1>入梦书</h1><p>{error || '正在翻开书页……'}</p>{error && <button className="primary" onClick={() => { setError(''); setAttempt(value => value + 1); }}>重新载入</button>}</main>;
  const imported = books.filter(book => book.id !== bookKey(builtin.pkg));
  return <>{children(data, { openShelf: () => { setError(''); setPanel('shelf'); }, addBook: () => { setError(''); setPanel('add'); }, bookCount: imported.length + 1, panelOpen: panel !== null, importArchive: book => addLoaded(book, false) })}
    {job && job.status === 'running' && job.id !== collectedJob && !books.some(book => book.packageId === `weave-demo-${job.id}`) && panel !== 'generate' && <button className={`weave-task ${progress?.ready ? 'complete' : ''}`} onClick={() => setPanel('generate')}><Icon name={progress?.ready ? 'check' : 'spark'} size={16} /><span>{progress?.ready ? '入梦书演示已完成，查看结果' : `织梦中 · ${Math.floor((progress?.progress ?? 0) * 100)}%`}<small>{progress?.ready ? '待收进书库' : GENERATION_STAGES[progress?.stage ?? 0]!.name}</small></span></button>}
    {panel === 'shelf' && <Dialog title="你的入梦书架" onClose={() => setPanel(null)} wide><div className="shelf-heading"><p className="muted">每本入梦书都是一段完整的世界。切换故事，书签会留在原来的地方。</p><button className="secondary" onClick={() => setPanel('add')}><Icon name="spark" size={16} />新增入梦书</button></div><div className="shelf-grid"><article className="shelf-card"><img src={builtin.art[builtin.presentation.cover]?.src} alt="吃人心的小妖怪封面" /><div><small>内置 · 第一册</small><h3>{builtin.pkg.title}</h3><p>{builtin.pkg.source.author} · 来自知乎</p><div className="button-row"><button className="primary" disabled={!!busy} onClick={() => choose(bookKey(builtin.pkg))}>{bookKey(data.pkg) === bookKey(builtin.pkg) ? '返回这本书' : '打开入梦书'}</button><BookDownload archive={builtin.book.archive} name="little-demon.dreambook">导出入梦书</BookDownload></div></div></article>{imported.map(book => <article className="shelf-card" key={book.id}><Cover blob={book.cover} /><div><small>{book.simulation ? '生成流程演示' : '已导入'} · {book.buildId.slice(-10)}</small><h3>{book.title}</h3><p>{book.author}</p><div className="button-row"><button className="primary" disabled={!!busy} onClick={() => choose(book.id)}>{bookKey(data.pkg) === book.id ? '返回这本书' : '打开入梦书'}</button><BookDownload archive={book.archive} name={`${book.packageId}.dreambook`}>导出入梦书</BookDownload></div></div></article>)}</div>{message && <p className="form-success" role="status">{message}</p>}{(busy || error) && <p className={error ? 'form-error' : 'muted'} role="status">{error || busy}</p>}</Dialog>}
    {panel === 'add' && <Dialog title="为书架添一场新梦" onClose={() => setPanel(null)} wide><p className="dialog-lead">一本入梦书，装下一整个故事世界。</p><div className="add-options"><section><Icon name="download" size={28} /><h3>导入入梦书</h3><p>把创作者打包好的剧情、背景、音乐与音效，一起收进书库。</p><label className={`primary file-button ${busy ? 'disabled' : ''}`}>选择入梦书文件<input aria-label="选择入梦书文件" type="file" accept=".dreambook,.zip" disabled={!!busy} onChange={event => { importBook(event.target.files?.[0]); event.target.value = ''; }} /></label><small>支持 .dreambook / .zip · 最大 80 MiB</small></section><section><Icon name="spark" size={28} /><h3>让 Agent 织梦</h3><p>从故事、链接或图片出发，预览多位 Agent 协作制作入梦书的过程。</p><button className="secondary" onClick={() => setPanel('generate')}>体验生成流程 <Icon name="arrow" size={17} /></button><small>流程模拟 · 约 1 分 36 秒</small></section></div><p className="fine-print">素材包包含数据与媒体，不运行其中的脚本。导入后可以离线游玩；存档与原作者署名会分别保留。</p><BookDownload archive={builtin.book.archive} name="little-demon.dreambook">下载首本示例入梦书 ↗</BookDownload>{(busy || error) && <p role="status" className={error ? 'form-error' : 'muted'}>{error || busy}</p>}</Dialog>}
    {panel === 'generate' && <Dialog title="让故事，慢慢织成一场梦" onClose={() => setPanel(null)} wide><div className="simulation-label">流程演示 · 不调用真实大模型</div>{(!job || job.status === 'cancelled') ? <><p className="muted">填写故事或链接，也可以选择故事截图。演示约 1–2 分钟，可关掉面板去阅读，任务进度会保留。</p><div className="weave-form"><label>入梦书名称<input aria-label="入梦书名称" value={title} maxLength={60} onChange={event => setTitle(event.target.value)} placeholder="给这场梦起一个名字" /></label><label>故事正文<textarea aria-label="故事正文" value={story} maxLength={20000} onChange={event => setStory(event.target.value)} rows={5} placeholder="粘贴故事、片段或创作设想……" /></label><label>故事 URL<input aria-label="故事 URL" type="url" value={url} maxLength={2000} onChange={event => setUrl(event.target.value)} placeholder="https://www.zhihu.com/…" /></label><label className="secondary file-button">选择故事图片或文档<input aria-label="选择故事图片或文档" type="file" multiple accept=".txt,.md,.png,.jpg,.jpeg,.webp" onChange={event => { const selected = Array.from(event.target.files ?? []); if (selected.length > 8 || selected.some(file => file.size > 20 * 1024 * 1024)) { setError('最多 8 个文件，单个文件不超过 20 MiB'); return; } setFiles(selected); }} /></label>{files.length > 0 && <div className="attachment-list">{files.map((file, index) => <span key={index}>{file.name}</span>)}</div>}</div><p className="fine-print">本次只模拟处理步骤，不解析正文、链接或图片。完成后会提供使用《吃人心的小妖怪》既有素材的演示入梦书。</p><button className="primary full-width" disabled={!!busy} onClick={generate}>开始织梦演示 <Icon name="spark" size={18} /></button></> : <><div className="weave-overview"><div className={`weave-orbit ${progress?.ready ? 'done' : ''}`}><Icon name={progress?.ready ? 'check' : 'spark'} size={32} /></div><div><h3>{progress?.ready ? '这场织梦演示已完成' : GENERATION_STAGES[progress?.stage ?? 0]!.name}</h3><p>{job.input.title}</p><small>{progress?.ready ? '示例已准备好，等待你收进书库' : `大约还需 ${Math.max(1, Math.ceil((progress?.remainingSeconds ?? 0) / 60))} 分钟 · 可关闭此面板`}</small></div><strong>{Math.floor((progress?.progress ?? 0) * 100)}%</strong></div><progress aria-label="织梦进度" max={100} value={(progress?.progress ?? 0) * 100} /><ol className="agent-steps">{GENERATION_STAGES.map((stage, index) => <li key={stage.agent} className={progress?.ready || index < (progress?.stage ?? 0) ? 'done' : index === progress?.stage ? 'working' : ''}><span className="agent-step-icon">{progress?.ready || index < (progress?.stage ?? 0) ? <Icon name="check" size={15} /> : String(index + 1).padStart(2, '0')}</span><div><b>{stage.agent}</b><p>{stage.detail}</p></div>{index === progress?.stage && !progress.ready && <span className="spinner" aria-label="处理中" />}</li>)}</ol>{progress?.ready ? <div className="generation-result"><p>本次产物沿用《吃人心的小妖怪》的剧情与媒体，仅演示完整制作流程，未生成你提交的故事。</p><div className="button-row"><button className="primary" disabled={!!busy} onClick={() => void run('正在校验并收进入梦书架', async () => addLoaded(await simulatedWeaver.result(job, builtin.book)))}>收进书库</button>{preparedBook ? <BookDownload archive={preparedBook.archive} name={`${preparedBook.pkg.packageId}.dreambook`} className="secondary">下载演示入梦书</BookDownload> : <button className="secondary" disabled={!!busy} onClick={() => void run('正在打包示例', async () => { setPreparedBook(await simulatedWeaver.result(job, builtin.book)); })}>准备导出演示入梦书</button>}</div><button className="text-button" onClick={() => void run('正在开启新的制作页', async () => { await simulatedWeaver.cancel(job); setJob(null); setPreparedBook(null); })}>再制作一本</button></div> : <div className="button-row"><button className="secondary" onClick={() => setPanel(null)}>收起窗口，继续阅读</button><button className="text-button" onClick={() => void run('正在取消模拟任务', async () => { await simulatedWeaver.cancel(job); setJob(null); setPreparedBook(null); })}>取消此次模拟</button></div>}</>}{(busy || error) && <p role="status" className={error ? 'form-error' : 'muted'}>{error || busy}</p>}</Dialog>}
    {!panel && error && <div className="toast" role="alert">{error}<button aria-label="关闭错误" onClick={() => setError('')}><Icon name="close" size={16} /></button></div>}
  </>;
}

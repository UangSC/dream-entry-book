import { useEffect, useState } from 'react';
import { api, useAccount } from '../account/session';
import { apiRequest, apiUrl } from '../account/client';
import { readDreamBook } from '../books/archive';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import type { LibraryActions } from './LibraryHost';
import './AccountPanel.css';

interface Play { run_id: string; package_id: string; build_id: string; title: string; chapter: string; ending: string | null; updated_at: number }
interface Job { result_kind?: 'book' | 'analysis'; id: string; title: string; status: string; progress: number; stage: string; error: string | null; updated_at: number }
interface Import { package_id: string; build_id: string; title: string; job_id: string | null; updated_at: number }
interface Ledger { plays: Play[]; jobs: Job[]; imports: Import[] }
const when = (stamp: number) => new Date(stamp * 1000).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function AccountButton({ onOpen }: { onOpen: () => void }) {
  const { user, login, loginBusy } = useAccount();
  return user ? <button className="account-avatar" aria-label={`${user.name}，打开游玩记录与任务`} onClick={onOpen} title={user.name}><img src={user.avatar} referrerPolicy="no-referrer" alt={user.name} onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = apiUrl('/avatar.svg'); }} /><i /></button>
    : <button className="account-login" onClick={login} disabled={loginBusy} aria-label="知乎登录"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/></svg><span>{loginBusy ? '正在前往知乎…' : '知乎登录'}</span></button>;
}

export function AccountPanel({ onClose, library }: { onClose: () => void; library: LibraryActions }) {
  const { user, logout } = useAccount();
  const [tab, setTab] = useState<'plays' | 'jobs' | 'imports'>('plays');
  const [ledger, setLedger] = useState<Ledger>({ plays: [], jobs: [], imports: [] });
  const [error, setError] = useState(''), [busy, setBusy] = useState(''), [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState(''), [text, setText] = useState('');
  const [mode, setMode] = useState<'simulation' | 'analysis'>('simulation');
  const [reports, setReports] = useState<Record<string, { report: string; provider: string; note: string; author?: string }>>({});
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const result = await api<Ledger>('/account'); if (!cancelled) { setLedger(result); setLoaded(true); } }
      catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : '手记暂未取来'); }
      if (!cancelled) timer = setTimeout(() => { if (document.hidden) timer = setTimeout(poll, 2000); else void poll(); }, 1500);
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);
  const run = async (id: string, task: () => Promise<void>) => {
    if (busy) return;
    setBusy(id); setError('');
    try { await task(); setLedger(await api<Ledger>('/account')); }
    catch (e) { setError(e instanceof Error ? e.message : '这次没能收好，请重试'); }
    finally { setBusy(''); }
  };
  const collect = (job: Job) => void run(job.id, async () => {
    const response = await apiRequest(`/jobs/${job.id}/result`);
    const book = await readDreamBook(new Uint8Array(await response.arrayBuffer()));
    await library.importArchive(book);
    await api('/imports', { package_id: book.pkg.packageId, build_id: book.pkg.buildId, title: book.pkg.title, job_id: job.id });
  });
  return <Dialog title="这一周，梦有回声" onClose={onClose} wide>
    <div className="account-heading"><img src={user?.avatar} alt="" /><div><h3>{user?.name}</h3><p>最近七天的脚印，都收在这里。</p></div><button className="text-button" onClick={() => void run('logout', async () => { await logout(); onClose(); })}>退出登录</button></div>
    <div className="account-tabs" role="tablist" aria-label="我的手记">{(['plays', 'jobs', 'imports'] as const).map((key, index) => <button role="tab" id={`account-${key}`} aria-controls={`account-page-${key}`} aria-selected={tab === key} key={key} onClick={() => setTab(key)}>{['游玩记录', '织梦任务', '入架记录'][index]}<span>{ledger[key].length}</span></button>)}</div>
    <section className="account-content" role="tabpanel" id={`account-page-${tab}`} aria-labelledby={`account-${tab}`}>
      {!loaded && !error && <p className="muted">正在取来手记……</p>}
      {tab === 'plays' && ledger.plays.map(play => <article className="account-entry" key={play.run_id}><Icon name={play.ending ? 'spark' : 'book'} size={26}/><div><h3>{play.title}</h3><p>{play.ending ?? play.chapter}</p><small>{when(play.updated_at)}{play.ending ? ' · 已抵达终幕' : ' · 书签留在这里'}</small></div><button className="text-button" onClick={() => { onClose(); library.openShelf(); }}>去书架 <Icon name="arrow" size={16}/></button></article>)}
      {tab === 'imports' && ledger.imports.map(item => <article className="account-entry" key={`${item.package_id}:${item.build_id}`}><Icon name="check" size={26}/><div><h3>{item.title}</h3><p>{item.job_id ? '织梦演示已收进书库' : '入梦书已校验并收好'}</p><small>{when(item.updated_at)}</small></div><button className="text-button" onClick={() => { onClose(); library.openShelf(); }}>翻翻书架 <Icon name="arrow" size={16}/></button></article>)}
      {tab === 'jobs' && <><div className="account-weave"><span className="eyebrow">先试着织一场梦</span><p>可以用知乎直答梳理故事线索，也可以体验完整装订流程。线索报告和可玩演示书会分别收好。</p><div className="account-job-form"><label>这次想做什么<select aria-label="任务类型" value={mode} onChange={event => setMode(event.target.value as typeof mode)}><option value="simulation">制作流程演示</option><option value="analysis">知乎直答 · 入梦线索分析</option></select></label><input aria-label="任务名称" placeholder="这场梦叫什么" maxLength={60} value={title} onChange={event => setTitle(event.target.value)} /><textarea aria-label="待分析小说" placeholder={mode === 'analysis' ? '放一段故事，最多 12,000 字，将发送给知乎直答分析……' : '放一段故事，或一个知乎链接……'} maxLength={mode === 'analysis' ? 12000 : 20000} rows={2} value={text} onChange={event => setText(event.target.value)}/><button className="primary" disabled={!!busy || !title.trim() || !text.trim()} onClick={() => void run('new-job', async () => { await api('/jobs', { title, text, mode }); setTitle(''); setText(''); })}>{mode === 'analysis' ? '梳理入梦线索' : '开始模拟织梦'} <Icon name="spark" size={17}/></button></div></div>
        {ledger.jobs.map(job => { const collected = ledger.imports.some(item => item.job_id === job.id); return <article className={`account-job job-${job.status}`} key={job.id}><div className="job-heading"><h3>{job.title}</h3><span>{job.progress}%</span></div><p>{job.stage}<small> · {job.result_kind === 'analysis' ? '知乎直答' : '模拟任务'}</small></p><progress aria-label={`${job.title}的进度`} value={job.progress} max={100}/><div className="job-footer"><small>{when(job.updated_at)}</small>{job.status === 'succeeded' && job.result_kind === 'analysis' ? <button className="secondary" disabled={!!busy} onClick={() => void run(job.id, async () => { const report = await api<{ report: string; provider: string; note: string; author?: string }>(`/jobs/${job.id}/result`); setReports(previous => ({ ...previous, [job.id]: report })); })}>查看线索</button> : job.status === 'succeeded' ? <button className="secondary" disabled={!!busy || collected} onClick={() => collect(job)}>{collected ? '已经收好' : '收进书库'}</button> : ['failed', 'cancelled'].includes(job.status) ? <button className="text-button" disabled={!!busy} onClick={() => void run(job.id, async () => { await api(`/jobs/${job.id}/retry`, {}); })}>再试一次</button> : <button className="text-button" disabled={!!busy} onClick={() => void run(job.id, async () => { await api(`/jobs/${job.id}/cancel`, {}); })}>先放一放</button>}</div>{reports[job.id] && <div className="analysis-report"><h4>入梦线索</h4><small>{reports[job.id]!.provider}{reports[job.id]!.author ? ` · 原作作者：${reports[job.id]!.author}` : ''}</small><p>{reports[job.id]!.report}</p><small>{reports[job.id]!.note}</small></div>}{job.error && <p className="form-error">{job.error}</p>}</article>; })}</>}
      {loaded && ledger[tab].length === 0 && <div className="account-empty"><Icon name={tab === 'jobs' ? 'spark' : 'moon'} size={30}/><p>{tab === 'plays' ? '还没留下脚印。去借一场梦吧。' : tab === 'imports' ? '这一周，还没有新书入架。' : '手上没有未织完的梦。'}</p></div>}
    </section>{error && <p role="alert" className="form-error">{error}</p>}<p className="account-footnote">打开手记时，配乐会暂歇。书签仍保存在这台设备上。</p>
  </Dialog>;
}

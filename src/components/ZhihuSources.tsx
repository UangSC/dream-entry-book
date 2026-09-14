import { useEffect, useState } from 'react';
import { api, useAccount } from '../account/session';
import { Icon } from './Icon';
import './ZhihuSources.css';

interface Story { id: string; title: string; description: string; labels: string[] }
interface Source { id: string; title: string; author: string; introduction: string; text: string; url: string; source_url: string; source: string }
interface Result { title: string; author: string; summary: string; url: string; type: string }

export function ZhihuSources({ onPrepare, onAnalysis }: { onPrepare: (source: Source) => void; onAnalysis: () => void }) {
  const { user, login, loginBusy } = useAccount();
  const [tab, setTab] = useState<'catalog' | 'search'>('catalog');
  const [catalog, setCatalog] = useState<Story[]>([]), [selected, setSelected] = useState<Source | null>(null);
  const [query, setQuery] = useState(''), [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(''), [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setBusy('正在取来官方故事目录');
    api<{ items: Story[] }>('/zhihu/stories').then(data => { if (active) setCatalog(data.items); })
      .catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setBusy(''); });
    return () => { active = false; };
  }, []);
  const run = async (label: string, action: () => Promise<void>) => {
    if (busy) return; setBusy(label); setError('');
    try { await action(); } catch (error) { setError(error instanceof Error ? error.message : '这页暂未取来'); }
    finally { setBusy(''); }
  };
  return <section className="zhihu-sources" aria-label="从知乎寻找入梦书">
    <div className="zhihu-source-heading"><div><span className="eyebrow">故事从知乎来</span><h3>下一场梦，去哪里找？</h3></div><a href="https://www.zhihu.com/" target="_blank" rel="noreferrer">去知乎 <Icon name="arrow" size={16}/></a></div>
    <div className="zhihu-source-tabs" role="tablist" aria-label="故事来源">
      <button role="tab" aria-selected={tab === 'catalog'} onClick={() => { setTab('catalog'); setError(''); }}>官方故事</button>
      <button role="tab" aria-selected={tab === 'search'} onClick={() => { setTab('search'); setError(''); }}>在知乎找找</button>
    </div>
    {tab === 'catalog' ? selected ? <article className="zhihu-source-preview">
      <button className="text-button" onClick={() => setSelected(null)}>回到故事目录</button><h4>{selected.title}</h4><p className="muted">{selected.author || '作者信息暂未提供'} · {selected.source}</p>
      <div className="source-excerpt">{selected.text.slice(0, 900)}{selected.text.length > 900 ? '……' : ''}</div>
      <p className="fine-print">{selected.text.length > 12000 ? '线索分析取开头 12,000 字；' : ''}知乎直答会梳理人物、冲突和选择时刻，结果保存在任务列表。制作演示沿用小妖怪书包。</p>
      <div className="button-row"><button className="primary" disabled={!!busy || !user} onClick={() => void run('正在建立知乎直答分析任务', async () => {
        await api('/jobs', { title: selected.title.slice(0, 60), text: selected.text.slice(0, 12000), url: selected.source_url, author: selected.author, mode: 'analysis' }); onAnalysis();
      })}>梳理入梦线索 <Icon name="spark" size={16}/></button><button className="secondary" disabled={!!busy} onClick={() => onPrepare(selected)}>带入制作演示</button>
      {selected.url && <a className="text-button" href={selected.url} target="_blank" rel="noreferrer">在知乎读原文 ↗</a>}</div>
      {!user && <p className="fine-print"><button className="text-button" onClick={login} disabled={loginBusy}>登录后梳理线索</button>，也可以先浏览故事。</p>}
    </article> : <><p className="fine-print">知乎黑客松提供的故事目录。挑一篇读读开头，再决定是否把它带进梦里。</p><div className="zhihu-story-list">{catalog.map(item => <button className="zhihu-story-item" key={item.id} disabled={!!busy} onClick={() => void run('正在翻开这本故事', async () => setSelected(await api<Source>(`/zhihu/stories/${encodeURIComponent(item.id)}`)))}><strong>{item.title}</strong><small>{item.labels.join(' · ')}</small><p>{item.description.slice(0, 100)}</p></button>)}</div>{!catalog.length && !busy && !error && <p className="muted">目录里暂时没有故事，稍后再来看看。</p>}</> : <>
      <p className="fine-print">找原作、找讨论，也找下一场梦。结果是知乎摘要，全文请回知乎阅读。</p>
      <form className="zhihu-search-form" onSubmit={event => { event.preventDefault(); void run('正在知乎寻找', async () => setResults((await api<{ items: Result[] }>(`/zhihu/search?q=${encodeURIComponent(query)}`)).items)); }}>
        <input aria-label="知乎故事搜索" placeholder="故事名称、作者或你想读的题材" minLength={2} maxLength={80} value={query} onChange={event => setQuery(event.target.value)}/><button className="secondary" disabled={!!busy || !user || query.trim().length < 2}>找找看</button>
      </form>{!user && <p className="fine-print"><button className="text-button" onClick={login} disabled={loginBusy}>登录后搜索知乎</button>；官方故事目录可直接浏览。</p>}
      {results?.map((item, index) => <article className="zhihu-search-result" key={`${item.url}:${index}`}><a href={item.url} target="_blank" rel="noreferrer"><h4>{item.title} ↗</h4></a><small>{item.author || '知乎用户'} · 摘要</small><p>{item.summary.slice(0, 360)}</p></article>)}
      {results?.length === 0 && <p className="muted">这次还没找到，换个故事名称试试。</p>}
    </>}
    {busy && <p role="status" className="muted">{busy}……</p>}{error && <p role="alert" className="form-error">{error}</p>}
  </section>;
}

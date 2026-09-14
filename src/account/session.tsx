import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { apiRequest, avatarUrl, clearSession } from './client';
import { beginLogin } from './oauth';
import { Dialog } from '../components/Dialog';
import './session.css';

export interface User { id: string; name: string; avatar: string; simulation: boolean }
export async function api<T>(path: string, body?: unknown, method?: string): Promise<T> {
  const response = await apiRequest(path, body, method);
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
const Session = createContext<{ user: User | null; refresh: () => Promise<void>; logout: () => Promise<void>; login: () => void; loginBusy: boolean; requireLogin: () => boolean }>({ user: null, refresh: async () => {}, logout: async () => {}, login: () => {}, loginBusy: false, requireLogin: () => false });
export const useAccount = () => useContext(Session);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loginBusy, setLoginBusy] = useState(false), [loginError, setLoginError] = useState('');
  const [checking, setChecking] = useState(true), [loginRequired, setLoginRequired] = useState(false);
  const currentUser = useRef<User | null>(null), generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    try {
      const result = await api<{ user: User | null }>('/session');
      if (request !== generation.current) return;
      const next = result.user ? { ...result.user, avatar: avatarUrl(result.user.avatar) } : null;
      if (!next) clearSession();
      currentUser.current = next; setUser(next);
      if (next) setLoginRequired(false);
    } catch {
      if (request === generation.current) { currentUser.current = null; setUser(null); }
    } finally { if (request === generation.current) setChecking(false); }
  }, []);
  useEffect(() => {
    const invalidate = () => { generation.current++; currentUser.current = null; setUser(null); setChecking(false); };
    const recheck = () => { if (!document.hidden) void refresh(); };
    window.addEventListener('dream-session-cleared', invalidate);
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', recheck);
    void refresh();
    const timer = window.setInterval(recheck, 60000);
    return () => { generation.current++; clearInterval(timer); window.removeEventListener('dream-session-cleared', invalidate); window.removeEventListener('focus', recheck); document.removeEventListener('visibilitychange', recheck); };
  }, [refresh]);
  const requireLogin = useCallback(() => {
    if (currentUser.current) return true;
    setLoginRequired(true); return false;
  }, []);
  const logout = async () => { try { await api('/auth/logout', {}, 'POST'); } finally { clearSession(); setUser(null); } };
  const login = () => {
    if (loginBusy) return;
    setLoginBusy(true); setLoginError('');
    void beginLogin().then(url => window.location.assign(url)).catch(error => { setLoginError(error instanceof Error ? error.message : '暂时无法登录，请稍后重试。'); setLoginBusy(false); });
  };
  return <Session.Provider value={{ user, refresh, logout, login, loginBusy, requireLogin }}>{children}
    {loginRequired && !user && <Dialog title="登录知乎后，开启这场梦" onClose={() => setLoginRequired(false)}><p>开始或继续游戏、书架、导入导出、存档与其他功能，需要先完成知乎登录授权。</p><p className="muted">已有书架和存档会保留在当前浏览器。登录成功后，请重新选择要使用的功能。</p><div className="button-row"><button className="primary" disabled={checking || loginBusy} onClick={login}>{checking ? '正在确认登录状态…' : loginBusy ? '正在前往知乎…' : '前往知乎登录授权'}</button><button className="secondary" onClick={() => setLoginRequired(false)}>暂时留在首页</button></div></Dialog>}
    {loginError && <div role="alert" className="login-error"><span>{loginError}</span><button onClick={() => setLoginError('')}>关闭</button></div>}</Session.Provider>;
}

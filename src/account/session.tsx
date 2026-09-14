import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiRequest, avatarUrl, clearSession } from './client';
import { beginLogin } from './oauth';
import './session.css';

export interface User { id: string; name: string; avatar: string; simulation: boolean }
export async function api<T>(path: string, body?: unknown, method?: string): Promise<T> {
  const response = await apiRequest(path, body, method);
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
const Session = createContext<{ user: User | null; refresh: () => Promise<void>; logout: () => Promise<void>; login: () => void; loginBusy: boolean }>({ user: null, refresh: async () => {}, logout: async () => {}, login: () => {}, loginBusy: false });
export const useAccount = () => useContext(Session);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loginBusy, setLoginBusy] = useState(false), [loginError, setLoginError] = useState('');
  const refresh = useCallback(async () => { const result = await api<{ user: User | null }>('/session'); if (!result.user) clearSession(); setUser(result.user ? { ...result.user, avatar: avatarUrl(result.user.avatar) } : null); }, []);
  useEffect(() => { void refresh().catch(() => {}); }, [refresh]);
  const logout = async () => { try { await api('/auth/logout', {}, 'POST'); } finally { clearSession(); setUser(null); } };
  const login = () => {
    if (loginBusy) return;
    setLoginBusy(true); setLoginError('');
    void beginLogin().then(url => window.location.assign(url)).catch(error => { setLoginError(error instanceof Error ? error.message : '暂时无法登录，请稍后重试。'); setLoginBusy(false); });
  };
  return <Session.Provider value={{ user, refresh, logout, login, loginBusy }}>{children}{loginError && <div role="alert" className="login-error"><span>{loginError}</span><button onClick={() => setLoginError('')}>关闭</button></div>}</Session.Provider>;
}

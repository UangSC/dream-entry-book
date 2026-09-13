import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export interface User { id: string; name: string; avatar: string; simulation: boolean }
export async function api<T>(path: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch(`/api${path}`, { method: method ?? (body === undefined ? 'GET' : 'POST'), credentials: 'same-origin',
    ...(body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(typeof payload?.detail === 'string' ? payload.detail : response.status === 401 ? '登录已过期，请重新登录。' : '书屋后端暂时未连接，请稍后重试。');
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
const Session = createContext<{ user: User | null; refresh: () => Promise<void>; logout: () => Promise<void> }>({ user: null, refresh: async () => {}, logout: async () => {} });
export const useAccount = () => useContext(Session);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const refresh = useCallback(async () => { const result = await api<{ user: User | null }>('/session'); setUser(result.user); }, []);
  useEffect(() => { void refresh().catch(() => {}); }, [refresh]);
  const logout = async () => { await api('/auth/logout', {}, 'POST'); setUser(null); };
  return <Session.Provider value={{ user, refresh, logout }}>{children}</Session.Provider>;
}

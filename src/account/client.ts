/// <reference types="vite/client" />

// 这里只允许公开的服务地址；VITE_* 会进入浏览器构建产物。
export function normalizeApiOrigin(value: string): string {
  const base = value.trim().replace(/\/+$/, '');
  if (!base) return '';
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('VITE_API_BASE_URL 必须是服务域名，不能包含密钥、路径或查询参数。');
  }
  return url.origin;
}

const apiOrigin = normalizeApiOrigin(import.meta.env.VITE_API_BASE_URL ?? '');
export const apiUrl = (path: string) => `${apiOrigin}/api${path}`;
export const avatarUrl = (value: string) => value.startsWith('/api/') ? apiUrl(value.slice(4)) : value;
const sessionKey = `rumengshu:session:v1:${apiOrigin}`;
export function sessionToken(): string | null {
  try { return sessionStorage.getItem(sessionKey); } catch { return null; }
}
export function saveSession(token: string): void {
  try { sessionStorage.setItem(sessionKey, token); }
  catch { throw new Error('浏览器未允许保存当前标签页的登录状态，请检查站点存储设置。'); }
}
export function clearSession(): void {
  try { sessionStorage.removeItem(sessionKey); } catch { /* 未允许存储时也可退出。 */ }
}

export async function apiRequest(path: string, body?: unknown, method?: string): Promise<Response> {
  const token = sessionToken();
  const response = await fetch(apiUrl(path), {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    credentials: token ? 'omit' : 'include',
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(path === '/auth/exchange' ? 40000 : 15000),
  });
  if (!response.ok) {
    if (response.status === 401) clearSession();
    const payload = await response.json().catch(() => null);
    throw new Error(typeof payload?.detail === 'string' ? payload.detail : response.status === 401 ? '登录已过期，请重新登录。' : '书屋后端暂时未连接，请稍后重试。');
  }
  return response;
}

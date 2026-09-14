import { apiRequest, apiUrl, saveSession } from './client';

const pendingKey = 'rumengshu:oauth:v1';
interface PendingLogin { state: string; verifier: string; transaction: string; expires: number; api: string }
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const frontendHome = () => new URL(import.meta.env.BASE_URL, window.location.href);

export async function beginLogin(): Promise<string> {
  const state = encode(crypto.getRandomValues(new Uint8Array(32)));
  const verifier = encode(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  // 测试可写性；无法持久化请求绑定时不能继续跳转。
  try { sessionStorage.setItem(pendingKey, ''); sessionStorage.removeItem(pendingKey); }
  catch { throw new Error('浏览器未允许标签页存储，暂时无法完成登录。'); }
  const response = await apiRequest('/auth/start', { state, challenge });
  const result = await response.json() as { mode: string; url: string; transaction?: string };
  const destination = new URL(result.url, window.location.href);
  if (result.mode === 'mock') {
    if (destination.href !== new URL(apiUrl('/auth/start'), window.location.href).href) throw new Error('模拟授权地址不匹配。');
    return destination.href;
  }
  const callback = new URL('oauth-callback.html', frontendHome()).href;
  if (result.mode !== 'zhihu' || destination.origin !== 'https://openapi.zhihu.com' || destination.pathname !== '/authorize'
      || destination.searchParams.get('state') !== state || destination.searchParams.get('redirect_uri') !== callback || !result.transaction) {
    throw new Error('登录地址配置不匹配，请检查后端 FRONTEND_URL。');
  }
  const pending: PendingLogin = { state, verifier, transaction: result.transaction, expires: Date.now() + 600000, api: apiUrl('') };
  sessionStorage.setItem(pendingKey, JSON.stringify(pending));
  return destination.href;
}

export async function finishLogin(url: URL, cleanAddress: () => void): Promise<void> {
  // 先移除地址中的授权码；不记录、不缓存、不向其他页面转发。
  const params = url.searchParams;
  cleanAddress();
  let pending: PendingLogin | null;
  try {
    const raw = sessionStorage.getItem(pendingKey);
    sessionStorage.removeItem(pendingKey);
    pending = raw ? JSON.parse(raw) as PendingLogin : null;
  } catch { throw new Error('无法读取本次登录记录，请回到作品页面重新登录。'); }
  if (params.has('error')) throw new Error('本次知乎授权未完成，请回到作品页面重试。');
  const codes = [...params.getAll('authorization_code'), ...params.getAll('code')];
  const states = params.getAll('state');
  if (!pending || pending.expires <= Date.now() || pending.api !== apiUrl('') || states.length !== 1
      || states[0] !== pending.state || codes.length !== 1 || !codes[0] || codes[0].length > 4096) {
    throw new Error('授权与当前标签页不匹配或已过期，请从作品页面重新登录。');
  }
  const response = await apiRequest('/auth/exchange', { code: codes[0], state: pending.state, verifier: pending.verifier, transaction: pending.transaction });
  const result = await response.json() as { session_token?: string };
  if (!result.session_token) throw new Error('未收到登录状态，请重新登录。');
  saveSession(result.session_token);
}

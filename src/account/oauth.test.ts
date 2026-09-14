import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const entries = new Map<string, string>();
beforeEach(() => {
  entries.clear();
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value), removeItem: (key: string) => entries.delete(key) });
  vi.stubGlobal('window', { location: { href: 'https://reader.test/dream-entry-book/' }, dispatchEvent: vi.fn() });
  vi.stubEnv('BASE_URL', '/dream-entry-book/');
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.test');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

async function startFlow() {
  const fetchMock = vi.fn().mockImplementation(async (_url, request) => {
    const body = JSON.parse(request.body);
    const url = new URL('https://openapi.zhihu.com/authorize');
    url.searchParams.set('state', body.state);
    url.searchParams.set('redirect_uri', 'https://reader.test/dream-entry-book/oauth-callback.html');
    return Response.json({ mode: 'zhihu', url: url.href, transaction: 'test-signed-proof' });
  });
  vi.stubGlobal('fetch', fetchMock);
  const oauth = await import('./oauth');
  const url = new URL(await oauth.beginLogin());
  const callback = new URL(url.searchParams.get('redirect_uri')!);
  callback.searchParams.set('state', url.searchParams.get('state')!);
  callback.searchParams.set('authorization_code', 'single-use-test-code');
  return { oauth, callback, fetchMock };
}

describe('前端知乎授权', () => {
  it('先清除回调地址，再兑换；只保存应用凭据，后续请求无需 Cookie', async () => {
    const { oauth, callback, fetchMock } = await startFlow();
    const cleaned = vi.fn();
    fetchMock.mockImplementationOnce(async (_url, request) => {
      expect(cleaned).toHaveBeenCalledOnce();
      const body = JSON.parse(request.body);
      expect(body.code).toBe('single-use-test-code');
      expect(body.verifier).toHaveLength(43);
      expect(body.transaction).toBe('test-signed-proof');
      return Response.json({ session_token: 'test-app-session' });
    });
    await oauth.finishLogin(callback, cleaned);
    expect([...entries.values()]).toEqual(['test-app-session']);
    const { apiRequest, clearSession } = await import('./client');
    fetchMock.mockResolvedValueOnce(Response.json({ user: {} }));
    await apiRequest('/session');
    expect(fetchMock).toHaveBeenLastCalledWith('https://api.test/api/session', expect.objectContaining({ credentials:'omit',headers:{Authorization:'Bearer test-app-session'} }));
    clearSession();
    expect(entries.size).toBe(0);
    await expect(oauth.finishLogin(callback, vi.fn())).rejects.toThrow('不匹配或已过期');
  });

  it('拒绝其他标签页、不匹配 state 和重复参数，不交换授权码', async () => {
    const { oauth, callback, fetchMock } = await startFlow();
    callback.searchParams.set('state', 'wrong-state');
    await expect(oauth.finishLogin(callback, vi.fn())).rejects.toThrow('不匹配');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(entries.size).toBe(0);
    const next = await startFlow();
    next.callback.searchParams.append('code', 'second-code');
    await expect(next.oauth.finishLogin(next.callback, vi.fn())).rejects.toThrow('不匹配');
    expect(next.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('过期或取消授权时清除请求记录且不交换', async () => {
    const { oauth, callback, fetchMock } = await startFlow();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 601000);
    await expect(oauth.finishLogin(callback, vi.fn())).rejects.toThrow('已过期');
    vi.restoreAllMocks();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const next = await startFlow();
    next.callback.searchParams.set('error', 'access_denied');
    await expect(next.oauth.finishLogin(next.callback, vi.fn())).rejects.toThrow('未完成');
    expect(entries.size).toBe(0);
  });
});

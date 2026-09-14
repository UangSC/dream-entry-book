import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

describe('前端 API 地址', () => {
  it('未配置时沿用本地代理', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    const { apiUrl } = await import('./client');
    expect(apiUrl('/session')).toBe('/api/session');
  });

  it('会话、登录、头像与二进制下载使用同一服务域名', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test/');
    const { apiUrl, apiRequest, avatarUrl } = await import('./client');
    expect(apiUrl('/auth/start')).toBe('https://api.example.test/api/auth/start');
    expect(avatarUrl('/api/avatar.svg')).toBe('https://api.example.test/api/avatar.svg');
    expect(avatarUrl('https://pic.example.test/a.png')).toBe('https://pic.example.test/a.png');
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal('fetch', fetchMock);
    const response = await apiRequest('/jobs/one/result');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/api/jobs/one/result', expect.objectContaining({ credentials: 'include', method: 'GET' }));
  });

  it('拒绝带路径、凭据或查询参数的配置', async () => {
    const { normalizeApiOrigin } = await import('./client');
    for (const url of ['https://example.test/api', 'https://user:pass@example.test', 'https://example.test/?key=x', 'javascript:alert(1)']) {
      expect(() => normalizeApiOrigin(url)).toThrow();
    }
  });

  it('JSON 写操作携带会话，401 给出登录提示', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const { apiRequest } = await import('./client');
    await expect(apiRequest('/auth/logout', {})).rejects.toThrow('登录已过期');
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
  });
});

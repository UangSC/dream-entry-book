// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionProvider, useAccount } from './session';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('./client', () => ({ apiRequest: mocks.request, avatarUrl: (url: string) => url, clearSession: () => window.dispatchEvent(new Event('dream-session-cleared')) }));
vi.mock('./oauth', () => ({ beginLogin: vi.fn() }));
function Probe() {
  const { user, requireLogin, logout, refresh } = useAccount();
  return createElement('div', null,
    createElement('span', null, user?.name ?? '游客'),
    createElement('button', { onClick: requireLogin }, '开始'),
    createElement('button', { onClick: () => void logout() }, '退出'),
    createElement('button', { onClick: () => void refresh() }, '重新确认'));
}
const response = (user: unknown) => new Response(JSON.stringify({ user }));
const reader = { id: 'fixture', name: '测试读者', avatar: '', simulation: false };
beforeEach(() => {
  mocks.request.mockReset();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

it('等待服务端确认期间不能开始，确认授权后解除门槛', async () => {
  let resolve!: (value: Response) => void;
  mocks.request.mockReturnValue(new Promise<Response>(done => { resolve = done; }));
  render(createElement(SessionProvider, null, createElement(Probe)));
  fireEvent.click(screen.getByText('开始'));
  expect((screen.getByRole('button', { name: '正在确认登录状态…' }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => { resolve(response(reader)); });
  expect(screen.getByText('测试读者')).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('401 清除通知使界面立即退出，不能被较早的会话响应恢复', async () => {
  mocks.request.mockResolvedValueOnce(response(reader));
  render(createElement(SessionProvider, null, createElement(Probe)));
  await screen.findByText('测试读者');
  let resolve!: (value: Response) => void;
  mocks.request.mockReturnValueOnce(new Promise<Response>(done => { resolve = done; }));
  fireEvent.click(screen.getByText('重新确认'));
  act(() => { window.dispatchEvent(new Event('dream-session-cleared')); });
  await act(async () => { resolve(response(reader)); });
  expect(screen.getByText('游客')).toBeTruthy();
  fireEvent.click(screen.getByText('开始'));
  expect(screen.getByRole('button', { name: '前往知乎登录授权' })).toBeTruthy();
});

it('重新检查无法连接时关闭授权入口，不删除浏览器存档', async () => {
  localStorage.setItem('fixture-save', 'keep');
  mocks.request.mockResolvedValueOnce(response(reader));
  render(createElement(SessionProvider, null, createElement(Probe)));
  await screen.findByText('测试读者');
  mocks.request.mockRejectedValueOnce(new Error('offline'));
  fireEvent.click(screen.getByText('重新确认'));
  await waitFor(() => expect(screen.getByText('游客')).toBeTruthy());
  fireEvent.click(screen.getByText('开始'));
  expect(screen.getByRole('button', { name: '前往知乎登录授权' })).toBeTruthy();
  expect(localStorage.getItem('fixture-save')).toBe('keep');
  localStorage.removeItem('fixture-save');
});

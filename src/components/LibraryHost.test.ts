// @vitest-environment jsdom
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LibraryHost, type LibraryActions } from './LibraryHost';
import type { LoadedBook } from '../books/archive';

const mocks = vi.hoisted(() => ({ loggedIn: false, store: vi.fn(), read: vi.fn(), gate: vi.fn(), api: vi.fn() }));
const user = { id: 'reader' };
const builtin = { pkg: { packageId: 'builtin', buildId: '1', title: '内置故事', source: { author: '作者' } }, presentation: { cover: 'cover' }, art: { cover: { src: '/cover.webp' } }, book: { manifest: { assets: [], storySha256: 'builtin' }, archive: new Uint8Array() }, release: vi.fn() };
const imported = { pkg: { packageId: 'imported', buildId: '1', title: '新故事' }, manifest: { simulation: false } } as LoadedBook;
vi.mock('../account/session', () => ({ useAccount: () => ({ user: mocks.loggedIn ? user : null, requireLogin: () => { mocks.gate(); return mocks.loggedIn; } }), api: mocks.api }));
vi.mock('../runtime/library', () => ({ loadLibrary: async () => builtin, mountBook: vi.fn() }));
vi.mock('../books/archive', () => ({ bookKey: (pkg: { packageId: string }) => pkg.packageId, readDreamBook: mocks.read }));
vi.mock('../books/storage', () => ({ listBooks: async () => [], storeBook: mocks.store }));
vi.mock('./BookDownload', () => ({ BookDownload: () => null }));
vi.mock('./ZhihuSources', () => ({ ZhihuSources: () => null }));
let actions: LibraryActions;
const child = (_data: unknown, value: LibraryActions) => { actions = value; return createElement('span', null, '书屋就绪'); };
const element = () => createElement(LibraryHost, { children: child });
beforeEach(() => {
  localStorage.clear(); mocks.loggedIn = false; vi.clearAllMocks();
  mocks.store.mockResolvedValue({ id: 'imported', packageId: 'imported', buildId: '1', title: '新故事' });
  mocks.api.mockResolvedValue({});
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

it('直接调用书架与导入接口也要求登录', async () => {
  const page = render(element()); await screen.findByText('书屋就绪');
  await act(async () => { actions.openShelf(); actions.addBook(); await actions.importArchive(imported); });
  expect(screen.queryByRole('dialog')).toBeNull(); expect(mocks.store).not.toHaveBeenCalled();
  mocks.loggedIn = true; page.rerender(element());
  await act(async () => { await actions.importArchive(imported); });
  expect(mocks.store).toHaveBeenCalledWith(imported);
});

it('文件解析期间退出登录，不会把书包导入或重新弹出面板', async () => {
  mocks.loggedIn = true;
  let finish!: (value: LoadedBook) => void;
  mocks.read.mockReturnValueOnce(new Promise<LoadedBook>(resolve => { finish = resolve; }));
  const page = render(element()); await screen.findByText('书屋就绪');
  act(() => actions.addBook());
  fireEvent.change(screen.getByLabelText('选择入梦书文件'), { target: { files: [{ size: 1, arrayBuffer: async () => new ArrayBuffer(1) }] } });
  await waitFor(() => expect(mocks.read).toHaveBeenCalled());
  mocks.loggedIn = false; page.rerender(element());
  await act(async () => { finish(imported); });
  expect(mocks.store).not.toHaveBeenCalled(); expect(screen.queryByRole('dialog')).toBeNull();
});

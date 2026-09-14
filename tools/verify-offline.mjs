import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';

// 执行真正生成的 Service Worker；断网时 fetch 必须失败，所有读取只能来自缓存。
const scope = 'https://offline.test/nested/rumengshu/';
const handlers = new Map(), stores = new Map();
let online = true, networkCalls = 0;
const matchStored = (stored, key, options = {}) => {
  if (!stored) return;
  const headers = new Headers(typeof key === 'string' ? {} : key.headers);
  const vary = stored.response.headers.get('Vary')?.split(',').map(name => name.trim()).filter(Boolean) ?? [];
  if (!options.ignoreVary && vary.some(name => name === '*' || stored.headers.get(name) !== headers.get(name))) return;
  return stored.response.clone();
};
const cacheStorage = {
  async open(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {
      async put(key, response) { store.set(typeof key === 'string' ? key : key.url, { response: response.clone(), headers: new Headers(typeof key === 'string' ? {} : key.headers) }); },
      async match(key, options) { return matchStored(store.get(typeof key === 'string' ? key : key.url), key, options); },
    };
  }, async delete(name) { return stores.delete(name); },
  async match(key, options) {
    const url = typeof key === 'string' ? key : key.url;
    for (const store of stores.values()) {
      const matched = matchStored(store.get(url), key, options);
      if (matched) return matched;
    }
  },
};
const self = { registration: { scope }, location: { origin: new URL(scope).origin }, clients: { claim: async () => {} }, addEventListener: (name, handler) => handlers.set(name, handler) };
runInNewContext(await readFile('dist/sw.js', 'utf8'), {
  self, URL, Uint8Array, crypto: webcrypto, caches: cacheStorage,
  fetch: async request => {
    networkCalls++;
    if (!online) throw new Error('模拟网络断开');
    const url = typeof request === 'string' ? request : request.url;
    const path = decodeURIComponent(new URL(url).pathname.slice(new URL(scope).pathname.length));
    try { return new Response(await readFile('dist/' + path), { headers: { Vary: 'Origin' } }); } catch { return new Response('', { status: 404 }); }
  },
});
const runEvent = async (name, fields = {}) => {
  let promise;
  handlers.get(name)({ ...fields, waitUntil: value => promise = value, respondWith: value => promise = value });
  return promise;
};
await runEvent('install'); await runEvent('activate');
let ready;
const check = async () => { await runEvent('message', { data: { type: 'CHECK_CACHE' }, ports: [{ postMessage: data => { ready = data.ready; } }] }); return ready; };
assert.equal(await check(), true);
online = false; networkCalls = 0;
const request = (url, mode = 'cors', headers = {}) => runEvent('fetch', { request: { url, mode, method: 'GET', headers } });
const home = await request(scope, 'navigate'); assert.match(await home.text(), /入梦书/);
const pkg = await (await request(scope + 'dreams/little-demon.json')).json();
assert.equal(pkg.edition, 'longform');
assert.equal(pkg.nodes.length, 51);
assert.equal(pkg.flags.length, 29);
assert.equal(pkg.nodes.filter(node => node.kind === 'ending').length, 8);
const audio = await (await request(scope + 'audio/manifest.json')).json();
for (const id of ['BGM_SEEK_HER', 'BGM_FAREWELL', 'BGM_ACID']) {
  const asset = audio.assets.find(asset => asset.id === id);
  assert.equal(asset.loop.mode, 'once'); assert.equal(asset.vocal.minPlaySeconds, 90); assert.equal(asset.vocal.gapSeconds, 2);
}
assert.equal(await request(new URL('/api/auth/start', scope).href, 'navigate'), undefined, '授权导航不能被离线首页接管');
const store = [...stores.values()][0];
assert.equal([...store.keys()].some(url => url.includes('sfx-new')), false, '未引用原件不应阻断缓存更新');
assert.ok(store.has(scope + 'art/portraits/demon-bare-panic.webp'), '对白立绘必须支持离线读取');
for (const url of store.keys()) {
  assert.equal((await request(url)).status, 200);
  assert.equal((await request(url, 'cors', { Origin: new URL(scope).origin })).status, 200, '模块脚本的 Origin 请求头不应使离线缓存失配');
}
assert.equal(networkCalls, 0);
const total = store.size;
const previous = await cacheStorage.open('rumengshu-previous');
await previous.put(scope + 'assets/index-previous123.js', new Response('/* previous build */', { headers: { Vary: 'Origin' } }));
assert.equal(await (await request(scope + 'assets/index-previous123.js', 'cors', { Origin: new URL(scope).origin })).text(), '/* previous build */', '更新接管后仍能加载旧页面的带哈希脚本');
assert.equal(networkCalls, 0);
await previous.put(scope + 'dreams/removed-story.json', new Response('{}'));
await assert.rejects(() => request(scope + 'dreams/removed-story.json'), '普通资源不能借用旧版本缓存');
store.delete(scope + 'audio/bgm-gate.mp3');
assert.equal(await check(), false, '部分缓存不能声称离线就绪');
await assert.rejects(() => request(scope + 'audio/bgm-gate.mp3'));
console.log(`通过：${total} 个资源断网后从缓存读取，网络请求 0 次；Origin 请求头、旧页面脚本跨版本缓存、子目录部署、缺失资源与部分缓存状态正确。`);

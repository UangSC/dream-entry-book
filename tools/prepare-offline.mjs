import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]))).flat();
}
// 只缓存发布清单引用的素材。public 中可能保留未使用的原始 WAV、重复图片，
// 其中带 # 的旧文件名在部分静态服务器上不可寻址，不应阻断整本书的更新。
const required = new Set(['index.html', 'favicon.svg', 'audio/bgm-gate.beats.json']);
for (const folder of ['art', 'audio', 'mascot']) {
  const path = `${folder}/manifest.json`;
  required.add(path);
  const manifest = JSON.parse(await readFile(join('dist', path), 'utf8'));
  for (const asset of manifest.assets) required.add(`${folder}/${asset.file}`);
}
for (const file of await walk('dist')) {
  const path = file.slice(5).replaceAll('\\', '/');
  if (/^(assets\/.*\.(js|css)|books\/.*\.(dreambook|json)|dreams\/.*\.json|fonts\/.*\.(woff2|txt))$/.test(path)) required.add(path);
}
const files = [...required].sort().map(path => join('dist', path));
const assets = [];
for (const file of files) {
  const data = await readFile(file);
  assets.push({ path: file.slice(5).replaceAll('\\', '/'), sha256: createHash('sha256').update(data).digest('hex') });
}
// 缓存协议变动也生成新版本，安装失败不能删除仍在使用的旧缓存。
const build = createHash('sha256').update(await readFile(new URL(import.meta.url))).update(JSON.stringify(assets)).digest('hex').slice(0, 14);
const code = `/* 由 prepare-offline.mjs 生成，按实际构建文件与哈希缓存。 */
const CACHE = 'rumengshu-${build}';
const ASSETS = ${JSON.stringify(assets)};
const urlFor = path => new URL(path.split('/').map(encodeURIComponent).join('/'), self.registration.scope).href;
const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  try {
    // 控制并发，避免移动设备同时解码和下载全部声音。
    for (let offset = 0; offset < ASSETS.length; offset += 4) await Promise.all(ASSETS.slice(offset, offset + 4).map(async asset => {
      const response = await fetch(urlFor(asset.path), { cache: 'reload' });
      if (!response.ok || await digest(await response.clone().arrayBuffer()) !== asset.sha256) throw new Error('缓存资源校验失败');
      await cache.put(urlFor(asset.path), response);
    }));
  } catch (error) { await caches.delete(CACHE); throw error; }
})()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  // 授权页面、回调、账号资料与任务结果始终交给后端，不能套用离线首页。
  if (new URL(event.request.url).pathname.startsWith('/api/') || new URL(event.request.url).pathname.endsWith('/oauth-callback.html')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => (await caches.open(CACHE)).match(urlFor('index.html')).then(cached => cached || fetch(event.request)))());
  } else event.respondWith((async () => {
    // 清单资源已按内容哈希校验，不随 Origin 变化；忽略静态服务器的 Vary: Origin。
    // 模块脚本请求会带 Origin，而安装时 cache.put(url, response) 保存的请求没有该头。
    const cached = await (await caches.open(CACHE)).match(event.request, { ignoreVary: true });
    if (cached) return cached;
    // 更新接管时，旧页面仍可能请求旧构建的带哈希脚本；保留其缓存可避免刷新白屏。
    const immutable = new URL(event.request.url).pathname.match(/\\/assets\\/[^/]+-[a-zA-Z0-9_-]+\\.(js|css)$/);
    if (immutable) {
      const previous = await caches.match(event.request, { ignoreVary: true });
      if (previous) return previous;
    }
    return fetch(event.request);
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
  if (event.data?.type === 'CHECK_CACHE') event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const checks = await Promise.all(ASSETS.map(asset => cache.match(urlFor(asset.path))));
    event.ports[0]?.postMessage({ ready: checks.every(Boolean), build: CACHE });
  })());
});
`;
await writeFile('dist/sw.js', code);
console.log(`离线清单：${assets.length} 个文件，构建 ${build}。`);

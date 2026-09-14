import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forbiddenPath, textIssues } from './check-repository.mjs';
import { publicAssets } from './public-assets.mjs';

test('强制暂存的凭据、开发文档和未登记素材仍会被拦截', () => {
  const assets = new Set(['art/scene.webp']);
  for (const file of ['.env', '.env.production', 'backend/.env', 'DELIVERY.md', 'docs/PLAN.md', 'docs/submission/form.md', 'assets/work/clip.wav', 'public/art/raw.png', 'ICNO.png', 'backend/data/test.db']) {
    assert.equal(forbiddenPath(file, assets), true, file);
  }
  for (const file of ['.env.example', 'README.md', 'docs/FC_DEPLOYMENT.md', 'src/App.tsx', 'public/art/scene.webp']) assert.equal(forbiddenPath(file, assets), false, file);
});

test('路径检查识别转义路径，允许部署容器路径和公开地址', () => {
  for (const value of ['C:' + '\\Users\\someone\\project', 'D:' + '/Projects/demo', '/' + 'home/someone/work/', 'codex:' + '//threads/private']) {
    assert.ok(textIssues(value).length);
    assert.ok(textIssues(JSON.stringify(value)).length);
  }
  for (const value of ['/opt/python:/code', '/tmp/rumengshu', 'https://uangsc.github.io/dream-entry-book/']) assert.deepEqual(textIssues(value), []);
  assert.ok(textIssues(JSON.stringify({ originalPath: 'private-source' }), true).length);
});

test('发布清单不遍历本地文件，并拒绝目录穿越', () => {
  const calls = [];
  const assets = publicAssets(path => { calls.push(path); return JSON.stringify({ assets: [{ file: 'ready.webp' }] }); });
  assert.equal(calls.length, 3);
  assert.ok(assets.has('art/ready.webp'));
  assert.ok(!assets.has('art/local.png'));
  assert.throws(() => publicAssets(() => JSON.stringify({ assets: [{ file: '../private.png' }] })));
});

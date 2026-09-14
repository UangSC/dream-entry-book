// Git 和 Pages 共用的发布资源边界；原始素材留在本地，不自动公开。
export function publicAssets(readText) {
  const files = new Set([
    'favicon.svg', 'audio/bgm-gate.beats.json',
    'books/little-demon.dreambook', 'books/little-demon-demo.dreambook',
    'books/little-demon-legacy.dreambook', 'books/example-manifest.json',
    'dreams/little-demon.json', 'fonts/dream-names.woff2', 'fonts/ma-shan-zheng-license.txt',
  ]);
  for (const folder of ['art', 'audio', 'mascot']) {
    files.add(`${folder}/manifest.json`);
    const manifest = JSON.parse(readText(`public/${folder}/manifest.json`));
    for (const asset of manifest.assets) {
      if (!/^(?:[a-z0-9-]+\/)*[a-z0-9-]+\.(webp|svg|mp3|wav)$/.test(asset.file)) {
        throw new Error(`素材路径不符合发布规范：${asset.id}`);
      }
      files.add(`${folder}/${asset.file}`);
    }
  }
  return files;
}

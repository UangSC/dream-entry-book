import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { unzipSync } from 'fflate';
import { publicAssets } from './public-assets.mjs';

export const publicDocs = new Set(['README.md', 'FC_DEPLOYMENT.md', 'API_GUIDE.md', 'DREAMBOOK_FORMAT.md', 'DREAM_PACKAGE_SPEC.md', 'REPOSITORY_POLICY.md']);
const rootFiles = new Set(['.env.example', '.gitignore', '.gitattributes', 'README.md', 'index.html', 'oauth-callback.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'vite.config.ts']);
const sourceExcerpt = 'assets/source/stories/2025954672918163637.json';

export function forbiddenPath(file, assets) {
  if (file === '.env.example') return false;
  if (/(^|\/)(\.env(?:\..*)?|AGENTS\.md|SKILL\.md|DELIVERY\.md)$/i.test(file)) return true;
  if (/\.(?:zip|log|sqlite3?|db|pem|key|pfx|p12|bak)$/i.test(file)) return true;
  if (!file.includes('/')) return !rootFiles.has(file);
  if (file.startsWith('docs/')) return !publicDocs.has(file.slice(5));
  if (file.startsWith('public/')) return !assets.has(file.slice(7));
  if (file.startsWith('assets/')) return file !== sourceExcerpt;
  if (file.startsWith('content/')) return !(
    file === 'content/drafts/little-demon-legacy.json' || file === 'content/final/sources.json'
    || /^content\/final\/0[2-5]_[^/]+\.md$/.test(file)
  );
  return !/^(?:src|backend|tools|\.github|\.githooks)\//.test(file)
    || /(^|\/)(?:data|results|__pycache__|node_modules|\.work|\.venv|\.pytest_cache)(\/|$)/.test(file)
    || /(?:PLAN|DELIVERY|ACCEPTANCE|REVIEW|PROMPTS|STATUS|NOTES)\.md$/i.test(file);
}

export function textIssues(text, published = false) {
  const issues = [];
  // 覆盖 Windows 路径、JSON 转义路径、Unix 用户目录和编辑器私有链接。
  if (/(?<![a-z])[a-z]:[\\/]+|\/(?:Users|home)\/[^/\s]+\/|(?:codex|vscode|file):\/\//i.test(text)) issues.push('个人本地路径或编辑器链接');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{40,}|\bAKIA[A-Z0-9]{16}\b/.test(text)) issues.push('疑似凭据');
  if (published && /"(?:originalPath|originPath|reserves)"\s*:|(?:assets[\\/]+(?:source|work)|zhihu[\\/]+imgs)[\\/]+/.test(text)) issues.push('素材制作目录或备用素材元信息');
  return issues;
}

function scan(file, bytes, issues, published = false) {
  if (/\.dreambook$/.test(file)) {
    for (const [entry, data] of Object.entries(unzipSync(bytes, { filter: entry => /\.json$/.test(entry.name) }))) {
      scan(`${file}:${entry}`, Buffer.from(data), issues, true);
    }
  } else if (/\.(?:md|json|[cm]?[jt]sx?|mts|py|ya?ml|html|css|svg|txt)$/.test(file)) {
    const text = bytes.toString('utf8');
    for (const reason of textIssues(text, published)) issues.push(`${file}：${reason}`);
  }
}

export function checkRepository() {
  const git = args => execFileSync('git', args, { maxBuffer: 100 * 1024 * 1024 });
  const files = git(['ls-files', '-z']).toString('utf8').split('\0').filter(Boolean);
  const readIndex = file => git(['show', `:${file}`]);
  const assets = publicAssets(file => readIndex(file).toString('utf8'));
  const issues = [];
  const tracked = new Set(files);
  for (const asset of assets) if (!tracked.has(`public/${asset}`)) issues.push(`public/${asset}：发布资源未加入 Git`);
  for (const file of files) {
    if (forbiddenPath(file, assets)) { issues.push(`${file}：禁止提交的本地或未登记文件`); continue; }
    // 在读取前排除所有 dotenv 文件；不读取工作区、历史或环境变量中的秘密。
    if (/(^|\/)\.env(?:\.|$)/.test(file)) continue;
    const bytes = readIndex(file);
    scan(file, bytes, issues, file.startsWith('public/'));
    if (/\.md$/.test(file)) {
      for (const match of bytes.toString('utf8').matchAll(/\]\(([^)\s]+)\)/g)) {
        const link = match[1];
        if (/^(?:https?:|#|mailto:)/.test(link)) continue;
        const path = posix.normalize(posix.join(posix.dirname(file), decodeURIComponent(link.split('#')[0])));
        if (!tracked.has(path)) issues.push(`${file}：文档链接未指向仓库文件（${path}）`);
      }
    }
  }
  if (process.argv.includes('--dist')) {
    const expected = new Set([...assets, 'index.html', 'oauth-callback.html', 'sw.js']);
    const visit = (directory, prefix = '') => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = prefix + entry.name;
        if (entry.isDirectory()) { visit(`${directory}/${entry.name}`, `${file}/`); continue; }
        if (!expected.has(file) && !/^assets\/[^/]+\.(?:js|css)$/.test(file)) {
          issues.push(`dist/${file}：不属于 Pages 发布清单`); continue;
        }
        expected.delete(file);
        scan(`dist/${file}`, readFileSync(`${directory}/${entry.name}`), issues, !file.endsWith('/sw.js'));
      }
    };
    visit('dist');
    for (const file of expected) issues.push(`dist/${file}：缺少发布文件`);
  }
  if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1; }
  else console.log(`仓库边界检查通过：${files.length} 个 Git 文件；未读取 dotenv 文件。`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) checkRepository();

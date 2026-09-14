import { finishLogin, frontendHome } from './oauth';
import './callback.css';

const status = document.getElementById('status')!;
const back = document.getElementById('back') as HTMLAnchorElement;
const card = document.getElementById('auth-card')!;
const title = document.getElementById('auth-title')!;
const phase = document.getElementById('phase-label')!;
const hint = document.getElementById('auth-hint')!;
back.href = frontendHome().href;
void finishLogin(new URL(window.location.href), () => history.replaceState(null, '', window.location.pathname))
  .then(() => {
    document.body.dataset.authState = 'success';
    card.setAttribute('aria-busy', 'false');
    phase.textContent = '登录已完成';
    title.textContent = '欢迎回到入梦书';
    status.textContent = '授权已确认，正在为你打开书页。';
    window.location.replace(frontendHome().href);
  })
  .catch(error => {
    document.body.dataset.authState = 'error';
    document.title = '登录暂未完成 · 入梦书';
    card.setAttribute('aria-busy', 'false');
    phase.textContent = '登录暂未完成';
    title.textContent = '梦门还在为你留着';
    status.textContent = error instanceof Error ? error.message : '登录暂未完成，请重新尝试。';
    status.setAttribute('role', 'alert');
    hint.textContent = '回到作品页面，再点一次「知乎登录」即可。';
    back.hidden = false;
  });

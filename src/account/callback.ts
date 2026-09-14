import { finishLogin, frontendHome } from './oauth';

const status = document.getElementById('status')!;
const back = document.getElementById('back') as HTMLAnchorElement;
back.href = frontendHome().href;
void finishLogin(new URL(window.location.href), () => history.replaceState(null, '', window.location.pathname))
  .then(() => window.location.replace(frontendHome().href))
  .catch(error => {
    status.textContent = error instanceof Error ? error.message : '登录暂未完成，请重新尝试。';
    status.setAttribute('role', 'alert');
    back.hidden = false;
  });

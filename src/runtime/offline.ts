/** 只在资源实际完整缓存后显示离线就绪。开发服务器不注册，避免缓存开发模块。 */
export function registerOffline(report: (message: string) => void, onUpdate: (activate: () => void) => void): () => void {
  if (import.meta.env.DEV) { report('开发预览 · 构建后可离线'); return () => {}; }
  if (!('serviceWorker' in navigator)) { report('此浏览器暂不支持离线'); return () => {}; }
  let cancelled = false;
  const update = (message: string) => { if (!cancelled) report(message); };
  const check = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const worker = registration.active;
      if (!worker || cancelled) return;
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); update('离线状态暂未确认'); }, 10000);
      channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); update(event.data.ready ? '离线就绪' : '资源未缓存完整，请联网后重新载入'); };
      worker.postMessage({ type: 'CHECK_CACHE' }, [channel.port2]);
    } catch { update('离线准备失败，可联网继续阅读'); }
  };
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').then(registration => {
    if (cancelled) return;
    void check();
    const offerUpdate = () => {
      if (!registration.waiting || cancelled) return;
      onUpdate(() => {
        navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
        registration.waiting?.postMessage({ type: 'ACTIVATE_UPDATE' });
      });
    };
    offerUpdate();
    registration.addEventListener('updatefound', () => {
      registration.installing?.addEventListener('statechange', () => { void check(); offerUpdate(); });
    });
  }).catch(() => update('离线准备失败，可联网继续阅读'));
  window.addEventListener('online', check);
  return () => { cancelled = true; window.removeEventListener('online', check); };
}

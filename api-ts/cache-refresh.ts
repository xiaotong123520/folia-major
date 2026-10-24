// Refresh only this app's worker/assets. Account storage and imported audio are retained.
export const refreshScript = `
(async () => {
  const status = document.getElementById('status');
  try {
    if ('serviceWorker' in navigator) {
      const scope = new URL('/', location.href).href;
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.filter(item => item.scope === scope).map(item => item.unregister()));
    }
    if ('caches' in window) {
      const names = await caches.keys();
      const scope = new URL('/', location.href).href;
      await Promise.all(names.filter(name => (name.startsWith('workbox-precache-') && name.endsWith('-' + scope))
        || name === 'folia-pages' || name === 'folia-lucide-icons').map(name => caches.delete(name)));
    }
    status.textContent = '缓存已更新，正在打开听屿 FM…';
    location.replace('/');
  } catch {
    status.textContent = '自动更新未完成，请关闭网站后重新打开。登录和本地音乐未被清除。';
  }
})();`;

export default function handler(req: any, res: any) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.method !== 'GET') return res.status(405).end();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>更新听屿 FM</title><style>body{font:16px system-ui;background:#09090b;color:#fff;padding:12vh 24px;line-height:1.7;max-width:520px;margin:auto}a{color:#b5c8ff}</style><h1>更新听屿 FM</h1><p id="status">正在刷新旧版本缓存…</p><p>保留平台登录、本地音乐与个人设置。</p><a href="/">返回听屿 FM</a><script>${refreshScript}</script></html>`);
}

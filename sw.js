/* 古文テスト — Service Worker
   目的: 一度開けば、以後は電波が無くても起動できるようにする。
   方針: アプリ本体は静的ファイル1枚なので、インストール時に全部キャッシュし、
         以後はキャッシュ優先で即座に返す（オフラインでも待たされない）。
         裏でこっそり更新を取りに行き、新版があれば次回起動から反映する。 */

const VERSION = 'v2-20260906';
const CACHE = 'kobun-test-' + VERSION;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', ev => {
  ev.waitUntil((async () => {
    const c = await caches.open(CACHE);
    /* 1つでも失敗すると addAll 全体が落ちるので個別に入れる */
    await Promise.all(ASSETS.map(async u => {
      try { await c.add(new Request(u, {cache: 'reload'})); }
      catch (e) { /* 取れなかったものは後で fetch 時にキャッシュされる */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', ev => {
  ev.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('kobun-test-') && k !== CACHE)
                          .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   /* 外部は素通し */

  ev.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, {ignoreSearch: true});

    /* 裏で更新を取得（成功したら次回から新しいものが出る） */
    const fresh = fetch(req).then(res => {
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    if (hit) return hit;                 /* オフラインでも即返る */
    const res = await fresh;
    if (res) return res;

    if (req.mode === 'navigate') {
      const idx = await cache.match('./index.html');
      if (idx) return idx;
    }
    return new Response('オフラインです（一度オンラインで開くとキャッシュされます）', {
      status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}
    });
  })());
});

self.addEventListener('message', ev => {
  if (ev.data === 'skipWaiting') self.skipWaiting();
});

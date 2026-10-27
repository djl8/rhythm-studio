/* 节奏工坊离线缓存
   安装时只预缓存「页面 + 图标」这类必需的小文件（约 0.5MB），保证首次打开就能秒装成功；
   视频 / 音色 / 音效这些大文件在真正播放或打开时自动落到缓存里，之后断网也能用。 */
const CACHE = 'rhythm-studio-v20261027b';
const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
  "./assets/bell/icon.jpg",
  "./assets/doublereed/icon.jpg",
  "./assets/drum/icon.jpg",
  "./assets/handbell/icon.jpg",
  "./assets/shaker/icon.jpeg",
  "./assets/tambourine/icon.jpg",
  "./assets/triangle/icon.jpg",
  "./assets/tube/icon.jpg"
];

const TIMEOUT = 25000;

function withTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT))
  ]);
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    for (const u of CORE) {
      try { await withTimeout(c.add(new Request(u, { cache: 'reload' }))); } catch (err) {}
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // 云端仓库走网络，不进缓存

  // 页面本身用「缓存优先 + 后台静默更新」：打开秒出，下次打开就是新版
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cached = (await caches.match('./index.html')) || (await caches.match('./'));
      fetch(req).then(async r => {
        if (r && r.ok) {
          const c = await caches.open(CACHE);
          c.put('./index.html', r.clone());
        }
      }).catch(() => {});
      return cached || (await fetch(req).catch(() => Response.error()));
    })());
    return;
  }

  if (url.pathname.endsWith('/assets/index.json')) {
    // 存档清单用「网络优先」：联网时能立刻发现新素材，断网时回退到缓存
    e.respondWith((async () => {
      try {
        const r = await fetch(req, { cache: 'no-store' });
        if (r && r.ok) {
          const c = await caches.open(CACHE);
          c.put(req, r.clone());
        }
        return r;
      } catch (err) {
        return (await caches.match(req)) || Response.error();
      }
    })());
    return;
  }

  // 其余同源资源：缓存优先 + 后台更新，用的越多离线越全
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    const network = fetch(req).then(r => {
      if (r && r.ok) caches.open(CACHE).then(c => c.put(req, r.clone())).catch(() => {});
      return r;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});

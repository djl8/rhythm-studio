/* 节奏工坊离线缓存：首次联网打开后，素材全部落到本地，之后完全离线可用 */
const CACHE = 'rhythm-studio-v20261027a';
const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
  "./assets/bell/effect-blue.m4a",
  "./assets/bell/effect-gray.m4a",
  "./assets/bell/effect-green.m4a",
  "./assets/bell/effect-red.m4a",
  "./assets/bell/effect-yellow.m4a",
  "./assets/bell/icon.jpg",
  "./assets/bell/timbre.m4a",
  "./assets/bell/video.mp4",
  "./assets/doublereed/effect-blue.m4a",
  "./assets/doublereed/effect-gray.m4a",
  "./assets/doublereed/effect-green.m4a",
  "./assets/doublereed/effect-red.m4a",
  "./assets/doublereed/effect-yellow.m4a",
  "./assets/doublereed/icon.jpg",
  "./assets/doublereed/timbre.m4a",
  "./assets/doublereed/video.mp4",
  "./assets/drum/effect-blue.m4a",
  "./assets/drum/effect-gray.m4a",
  "./assets/drum/effect-green.m4a",
  "./assets/drum/effect-red.m4a",
  "./assets/drum/effect-yellow.m4a",
  "./assets/drum/icon.jpg",
  "./assets/drum/timbre.m4a",
  "./assets/drum/video.mp4",
  "./assets/handbell/effect-blue.m4a",
  "./assets/handbell/effect-gray.m4a",
  "./assets/handbell/effect-green.m4a",
  "./assets/handbell/effect-red.m4a",
  "./assets/handbell/effect-yellow.m4a",
  "./assets/handbell/icon.jpg",
  "./assets/handbell/timbre.m4a",
  "./assets/handbell/video.mp4",
  "./assets/shaker/effect-blue.m4a",
  "./assets/shaker/effect-gray.m4a",
  "./assets/shaker/effect-green.m4a",
  "./assets/shaker/effect-red.m4a",
  "./assets/shaker/effect-yellow.m4a",
  "./assets/shaker/icon.jpeg",
  "./assets/shaker/timbre.m4a",
  "./assets/shaker/video.mp4",
  "./assets/tambourine/effect-blue.m4a",
  "./assets/tambourine/effect-gray.m4a",
  "./assets/tambourine/effect-green.m4a",
  "./assets/tambourine/effect-red.m4a",
  "./assets/tambourine/effect-yellow.m4a",
  "./assets/tambourine/icon.jpg",
  "./assets/tambourine/timbre.m4a",
  "./assets/tambourine/video.mp4",
  "./assets/triangle/effect-blue.m4a",
  "./assets/triangle/effect-gray.m4a",
  "./assets/triangle/effect-green.m4a",
  "./assets/triangle/effect-red.m4a",
  "./assets/triangle/effect-yellow.m4a",
  "./assets/triangle/icon.jpg",
  "./assets/triangle/timbre.m4a",
  "./assets/triangle/video.mp4",
  "./assets/tube/effect-blue.m4a",
  "./assets/tube/effect-gray.m4a",
  "./assets/tube/effect-green.m4a",
  "./assets/tube/effect-red.m4a",
  "./assets/tube/effect-yellow.m4a",
  "./assets/tube/icon.jpg",
  "./assets/tube/timbre.m4a",
  "./assets/tube/video.mp4"
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // 逐个加，单个文件失败不影响整体安装
    await Promise.all(CORE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
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

  // 其余同源资源：缓存优先 + 后台更新，打开就是秒开
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    const network = fetch(req).then(r => {
      if (r && r.ok) caches.open(CACHE).then(c => c.put(req, r.clone())).catch(() => {});
      return r;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});

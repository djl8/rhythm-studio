/* 节奏工坊离线缓存
   安装阶段预缓存页面本体和图标这类小文件（约 200KB），弱网几秒装完就能离线打开；
   视频 / 音色 / 音效在真正播放或打开时自动落到缓存，用过一次之后断网也能用。

   版本号每次上线务必递增，浏览器会因为看到 sw.js hash 变化而触发新 SW 安装 */
const CACHE = 'rhythm-studio-v20261028k';
const CORE = [
  "./index.html",
  "./offline.html",
  "./manifest.webmanifest",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png"
];

const TIMEOUT = 25000;

function withTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), TIMEOUT))
  ]);
}

/* 跨所有缓存 key 查找，返回第一个命中的缓存内容。
   浏览器可能同时挂着新旧两个版本的 SW，activate 阶段旧缓存还没删干净之前，
   让我们先去旧缓存里捞——保证"没有网络也能打开" */
async function matchAnyCache(request) {
  const keys = await caches.keys();
  for (const k of keys) {
    const r = await caches.match(request, { cacheName: k, ignoreSearch: true });
    if (r) return r;
  }
  return null;
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    for (const u of CORE) {
      try { await withTimeout(c.add(new Request(u, { cache: 'reload' }))); } catch (err) {
        /* 网络不通时 install 不应该失败，靠 activate 里 matchAnyCache 兜底 */
      }
    }
    /* 立即激活，不等所有 tab 关掉 */
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    /* 先 claim 让新 SW 接管已有页面，再慢慢清理旧缓存；
       这样"没网络的页面"下一次打开也能被新 SW 覆盖到 */
    await self.clients.claim();
    /* 旧缓存里的 index.html / offline.html 已经过时代码，直接清掉；
       但清缓存之前，navigate handler 还会 matchAnyCache 兜底 */
    for (const k of keys) {
      if (k !== CACHE) {
        try { await caches.delete(k); } catch (e) {}
      }
    }
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // 云端仓库走网络，不进缓存

  /* 页面本身：先所有缓存里捞一遍（覆盖到旧 SW 遗留的缓存），
     再后台静默更新当前版本缓存。没网时就直接返回缓存里的东西 */
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      /* 优先捞当前版本缓存，再捞其它历史版本缓存（如果还有） */
      let cached = await caches.match(req, { cacheName: CACHE, ignoreSearch: true });
      if (!cached) cached = await matchAnyCache(req);
      if (!cached) {
        /* 备用：离线版也是完整可用的，断网时把它当首页兜住 */
        cached = await matchAnyCache('./offline.html');
      }

      /* 有网就静默更新当前版本缓存，下次打开就是新版 */
      fetch(req).then(async r => {
        if (r && r.ok) {
          const c = await caches.open(CACHE);
          c.put(req, r.clone());
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
        const r = await caches.match(req, { ignoreSearch: true });
        return r || (await matchAnyCache(req)) || Response.error();
      }
    })());
    return;
  }

  // 其余同源资源：缓存优先 + 后台更新，用的越多离线越全
  e.respondWith((async () => {
    let cached = await caches.match(req, { cacheName: CACHE, ignoreSearch: true });
    if (!cached) cached = await matchAnyCache(req);
    const network = fetch(req).then(r => {
      if (r && r.ok) caches.open(CACHE).then(c => c.put(req, r.clone())).catch(() => {});
      return r;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});

const CACHE_NAME = 'haisha-cache-v1';

// キャッシュするファイル一覧
const STATIC_ASSETS = [
    '/',
    '/static/style.css',
    '/static/script.js',
    '/static/manifest.json'
];

// ==========================================
// インストール時：静的ファイルをキャッシュ
// ==========================================
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[SW] 静的ファイルをキャッシュ中...');
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// ==========================================
// アクティベート時：古いキャッシュを削除
// ==========================================
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => {
                        console.log('[SW] 古いキャッシュを削除:', key);
                        return caches.delete(key);
                    })
            )
        )
    );
    self.clients.claim();
});

// ==========================================
// フェッチ時：キャッシュ優先 / APIはネットワーク優先
// ==========================================
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // /assign などのAPIリクエストはネットワーク優先（キャッシュしない）
    if (url.pathname.startsWith('/assign')) {
        event.respondWith(
            fetch(event.request).catch(() =>
                new Response(
                    JSON.stringify({ error: 'オフラインのため配車計算できません。インターネット接続を確認してください。' }),
                    { headers: { 'Content-Type': 'application/json' } }
                )
            )
        );
        return;
    }

    // 静的ファイルはキャッシュ優先
    event.respondWith(
        caches.match(event.request).then(cached => {
            return cached || fetch(event.request).then(response => {
                // 取得できたらキャッシュに追加
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return response;
            });
        }).catch(() => {
            // オフラインでキャッシュもない場合
            if (event.request.destination === 'document') {
                return caches.match('/');
            }
        })
    );
});
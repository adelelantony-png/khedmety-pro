const CACHE_NAME = 'khedmety-pro-v9';

// قائمة الملفات الأساسية والمكتبات الخارجية المطلوبة أوفلاين
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js'
];

// التثبيت: تحميل الملفات واحداً تلو الآخر حتى لا يفشل الكاش إذا تعثر ملف واحد
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of ASSETS_TO_CACHE) {
        try {
          const response = await fetch(url, { mode: 'cors' }).catch(() => fetch(url, { mode: 'no-cors' }));
          if (response && (response.status === 200 || response.type === 'opaque')) {
            await cache.put(url, response);
          }
        } catch (err) {
          console.warn('تخطي ملف لم يكتمل كاشه:', url);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

// التفعيل: تنظيف ومسح أي كاش قديم لتفادي التعارض
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// الاسترجاع: تقديم النسخة المخزنة أولاً وفي حال عدم توفرها محاولة جلبها من النت
self.addEventListener('fetch', (event) => {
  // استثناء اتصالات Firebase المباشرة لتعمل مكتبة realtime بحرية
  if (event.request.url.includes('firebaseio.com') || event.request.url.includes('googleapis.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html') || caches.match('./');
        }
      });
    })
  );
});

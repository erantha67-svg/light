const CACHE_NAME = 'aquarium-controller-v1';
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/index.tsx',
  '/App.tsx',
  '/types.ts',
  '/components/icons.tsx',
  '/constants.tsx',
  '/components/Button.tsx',
  '/components/Card.tsx',
  '/components/Slider.tsx',
  '/components/Switch.tsx',
  '/components/Badge.tsx',
  '/components/Dialog.tsx',
  '/components/Toast.tsx',
  '/components/ConnectionStatus.tsx',
  '/components/PresetButton.tsx',
  '/components/ScheduleDialog.tsx',
  '/components/SpectrumPresetButton.tsx',
  '/utils.ts',
  '/commandFormatter.ts',
  '/responseParser.ts',
  'https://cdn.tailwindcss.com/',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        // Use a separate request for CDN resources to avoid CORS issues with cache.addAll
        const cdnRequests = URLS_TO_CACHE.filter(url => url.startsWith('http'))
          .map(url => new Request(url, { mode: 'no-cors' }));
        const localUrls = URLS_TO_CACHE.filter(url => !url.startsWith('http'));
        
        return Promise.all([
          cache.addAll(localUrls),
          ...cdnRequests.map(req => fetch(req).then(res => cache.put(req, res)))
        ]);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }

        return fetch(event.request).then(
          response => {
            if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
    );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
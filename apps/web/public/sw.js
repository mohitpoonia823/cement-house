// Service Worker - NexaHub PWA
const STATIC_CACHE = 'business-hub-static-v3'
const API_CACHE = 'business-hub-api-v3'
const OFFLINE_API_ALLOWLIST = ['/api/reports/dashboard', '/api/inventory', '/api/inventory/stock-by-location']
const IS_LOCALHOST_SW =
  self.location.hostname === 'localhost' ||
  self.location.hostname === '127.0.0.1' ||
  self.location.hostname === '::1'

function notifyClients(payload) {
  self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
    for (const client of clients) client.postMessage(payload)
  })
}

// Cache essential assets on install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll([
        '/',
        '/dashboard',
        '/inventory',
        '/icons/icon.svg',
      ])
    })
  )
  self.skipWaiting()
})

// Clean up old caches
self.addEventListener('activate', (event) => {
  if (IS_LOCALHOST_SW) {
    event.waitUntil(
      (async () => {
        await self.registration.unregister()
        const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
        for (const client of clients) client.navigate(client.url)
      })()
    )
    return
  }

  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== STATIC_CACHE && k !== API_CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

function isOfflineApiRequest(url) {
  return OFFLINE_API_ALLOWLIST.some((path) => url.pathname.startsWith(path))
}

function cacheApiResponse(request, response) {
  if (!response || response.status !== 200) return
  const cloned = response.clone()
  caches.open(API_CACHE).then((cache) => cache.put(request, cloned))
}

// Network-first strategy for navigations/static; API allowlist uses network-first + cached fallback
self.addEventListener('fetch', (event) => {
  if (IS_LOCALHOST_SW) return

  const requestUrl = new URL(event.request.url)

  // Skip non-GET requests
  if (event.request.method !== 'GET') return

  // Same-origin API routes we explicitly support offline for:
  if (requestUrl.origin === self.location.origin && requestUrl.pathname.startsWith('/api/')) {
    if (!isOfflineApiRequest(requestUrl)) return

    event.respondWith(
      fetch(event.request)
        .then((response) => {
          cacheApiResponse(event.request, response)
          notifyClients({ type: 'API_NETWORK_OK', path: requestUrl.pathname })
          return response
        })
        .catch(async () => {
          const cached = await caches.match(event.request)
          if (cached) {
            notifyClients({ type: 'API_CACHE_FALLBACK', path: requestUrl.pathname })
            return cached
          }
          notifyClients({ type: 'API_CACHE_MISS', path: requestUrl.pathname })
          return new Response(JSON.stringify({ success: false, error: 'Offline and no cached data available.' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          })
        })
    )
    return
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone()
        caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone))
        return response
      })
      .catch(() => caches.match(event.request))
  )
})

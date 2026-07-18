import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

// Precache all Vite build assets
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// ── Push notification received ────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()
  const title = data.title || 'Reading Tracker'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // Store url, bookId and tab so notificationclick can deep-link to the right page
    data: { url: data.url || '/', bookId: data.bookId || null, tab: data.tab || null },
    vibrate: [200, 100, 200],
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// ── Notification tapped → open the app directly on the right book's chat ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const { url = '/', bookId, tab } = event.notification.data || {}

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Find an existing window on the same path (admin or reader)
      const targetPath = url.split('?')[0]
      const existing = clientList.find(c => {
        try { return new URL(c.url).pathname === targetPath } catch { return false }
      }) || clientList[0]

      if (existing && 'focus' in existing) {
        // App is already open — focus it and send a message to open the right book + tab
        existing.focus()
        if (bookId) existing.postMessage({ type: 'OPEN_BOOK_CHAT', bookId, tab })
        return
      }

      // App is not open — open URL with book + tab params for deep-link on load
      let openUrl = url
      if (bookId) {
        const sep = url.includes('?') ? '&' : '?'
        openUrl = `${url}${sep}book=${encodeURIComponent(bookId)}${tab ? `&tab=${encodeURIComponent(tab)}` : ''}`
      }
      return clients.openWindow(openUrl)
    })
  )
})

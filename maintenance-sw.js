// maintenance-sw.js — the maintenance team's installed app (maintenance-team.html): shows push notifications for new reports
// even with the app closed, and opens the page when tapped (Jorge 2026-11-06). Scope: /maintenance-team only.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: 'Amansala Maintenance', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Amansala Maintenance', {
    body: d.body || '', tag: d.tag || undefined, renotify: true, requireInteraction: true, vibrate: [300, 150, 300, 150, 300],
    icon: 'https://images.squarespace-cdn.com/content/v1/5a4da1e790bade09791c37c6/7c9523d9-1fc0-4df2-a01e-7b171732ac45/amansala.logo.png?format=300w',
    data: { url: d.url || '/maintenance-team.html' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/maintenance-team.html';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.includes('/maintenance-team'));
    if (open) { open.postMessage({ type: 'mt-refresh' }); return open.focus(); }
    return self.clients.openWindow(url);
  }));
});

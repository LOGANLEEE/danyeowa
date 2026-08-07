// Minimal, hand-rolled push-only service worker (no precache / offline caching — see
// docs/superpowers/plans/2026-08-07-plan9-notifications.md Task 3: that remains backlog).
// Vite copies web/public/* to dist/ unchanged, so this file lands at the site root and
// registers with the default '/' scope.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Malformed/non-JSON payload: fall through to the empty-object default below
    // rather than letting the push event throw.
  }

  const title = data.title || "Roaster Me";
  const options = {
    body: data.body,
    tag: data.tag,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientsList) {
        if ("focus" in client) {
          await client.focus();
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow("/");
      }
    })(),
  );
});

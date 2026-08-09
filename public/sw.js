// =========================
// Service Worker - Web Push Notification
// =========================

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// =========================
// Nhận push từ server và hiển thị notification
// =========================

self.addEventListener("push", function (event) {
  let payloadData = {};

  try {
    payloadData = event.data.json();
    console.log("PUSH PAYLOAD:", payloadData);
  } catch (err) {
    console.error("Không parse được payload push:", err);
    return;
  }

  const notificationOptions = {
    body: payloadData.body,
    icon: payloadData.icon,
    image: payloadData.image,
    badge: payloadData.icon,
    vibrate: [200, 100, 200],
    tag: "new-chapter",
    renotify: true,
    data: {
      url: payloadData.url || "/",
    },
  };

  event.waitUntil(
    self.registration.showNotification(payloadData.title, notificationOptions)
  );
});

// =========================
// Xử lý khi user click vào notification
// =========================

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(targetUrl) && "focus" in client) {
            return client.focus();
          }
        }

        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});
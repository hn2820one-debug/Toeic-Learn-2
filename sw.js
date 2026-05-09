const CACHE_NAME = "toeic-app-v8";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./lesson.html",
  "./quiz.html",
  "./report.html",
  "./progress.html",
  "./manifest.json",
  "./css/base.css",
  "./css/lesson.css",
  "./css/quiz.css",
  "./css/report.css",
  "./css/progress.css",
  "./js/app.js",
  "./js/learning-log.js",
  "./js/quiz-engine.js",
  "./js/scorer.js",
  "./js/report.js",
  "./js/storage.js",
  "./data/index.json",
  "./data/weakness-hunter/wh-w1-d1.json",
  "./data/weakness-hunter/wh-w1-d2.json",
  "./data/weakness-hunter/wh-w1-d3.json",
  "./data/pos-booster/pos-d1.json",
  "./data/pos-booster/pos-d2.json",
  "./data/pos-booster/pos-d3.json",
  "./data/pos-booster/pos-d4.json",
  "./data/pos-booster/pos-d5.json",
  "./data/pos-booster/pos-d6.json",
  "./data/pos-booster/pos-d7.json",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (event.request.method === "GET" && response.status === 200) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
        }
        return response;
      });
    })
  );
});

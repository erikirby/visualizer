// Service Worker with IndexedDB for storing large video blobs across restarts

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Minimal IndexedDB wrapper
const dbPromise = new Promise((resolve, reject) => {
  const request = indexedDB.open('VideoProxyDB', 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore('blobs');
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

async function setBlob(id, blob) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blobs', 'readwrite');
    tx.objectStore('blobs').put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getBlob(id) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('blobs', 'readonly');
    const req = tx.objectStore('blobs').get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

self.addEventListener('message', (event) => {
  if (event.data.type === 'register-blob') {
    const { id, blob } = event.data;
    setBlob(id, blob)
      .then(() => {
        if (event.ports[0]) {
          event.ports[0].postMessage({ type: 'registered', id });
        }
      })
      .catch((err) => {
        console.error('SW: Error saving blob to IDB', err);
      });
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  if (url.pathname.startsWith('/video-proxy/')) {
    const id = url.pathname.split('/').pop();
    
    event.respondWith(
      (async () => {
        try {
          const file = await getBlob(id);
          if (!file) {
            return new Response('Not found', { status: 404 });
          }

          const rangeHeader = event.request.headers.get('Range');
          if (!rangeHeader) {
            return new Response(file, {
              headers: {
                'Content-Type': file.type || 'video/mp4',
                'Content-Length': file.size.toString(),
                'Accept-Ranges': 'bytes'
              }
            });
          }

          const parts = rangeHeader.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : file.size - 1;
          const chunksize = (end - start) + 1;
          
          const slice = file.slice(start, end + 1);

          return new Response(slice, {
            status: 206,
            headers: {
              'Content-Range': `bytes ${start}-${end}/${file.size}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': chunksize.toString(),
              'Content-Type': file.type || 'video/mp4',
            }
          });
        } catch (err) {
          console.error("SW Fetch Error:", err);
          return new Response('Internal Server Error', { status: 500 });
        }
      })()
    );
  }
});

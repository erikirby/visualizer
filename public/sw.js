// Service Worker: range-request proxy for user-uploaded video files.
// Blob URLs don't support HTTP Range requests, which @remotion/media needs
// for efficient frame seeking. This SW stores the uploaded Blob and serves it
// at /video-proxy/{id} with proper HTTP 206 partial-content responses.

const blobRegistry = new Map();

self.addEventListener('message', (event) => {
  if (event.data.type === 'register-blob') {
    blobRegistry.set(event.data.id, event.data.blob);
  } else if (event.data.type === 'unregister-blob') {
    blobRegistry.delete(event.data.id);
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith('/video-proxy/')) return;

  const id = url.pathname.replace('/video-proxy/', '');
  const blob = blobRegistry.get(id);
  if (!blob) {
    event.respondWith(new Response('Not found', { status: 404 }));
    return;
  }

  event.respondWith((async () => {
    const rangeHeader = event.request.headers.get('Range');
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : blob.size - 1;
        const chunk = blob.slice(start, end + 1);
        const buffer = await chunk.arrayBuffer();
        return new Response(buffer, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${blob.size}`,
            'Content-Length': String(end - start + 1),
            'Content-Type': blob.type || 'video/mp4',
            'Accept-Ranges': 'bytes',
          },
        });
      }
    }
    const buffer = await blob.arrayBuffer();
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Length': String(blob.size),
        'Content-Type': blob.type || 'video/mp4',
        'Accept-Ranges': 'bytes',
      },
    });
  })());
});

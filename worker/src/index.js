const ALLOWED_ORIGINS = [
  'https://kanji-stroke-order.pages.dev',
  'https://kokugo.app',
  'https://www.kokugo.app',
  'http://localhost:8000',
  'http://localhost:3000',
];

function corsOrigin(request) {
  const origin = request.headers.get('Origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) return origin;
  return null;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Upload-Key, X-Read-Key',
  };
}

function keyFromPath(url) {
  const prefix = '/api/sheet/';
  const path = new URL(url).pathname;
  if (!path.startsWith(prefix)) return null;
  return decodeURIComponent(path.slice(prefix.length));
}

export default {
  async fetch(request, env) {
    const origin = corsOrigin(request);
    const method = request.method;
    const key = keyFromPath(request.url);

    // Preflight
    if (method === 'OPTIONS' && key !== null) {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (key === null) {
      return new Response('Not Found', { status: 404 });
    }

    // GET — fetch PDF from R2
    if (method === 'GET') {
      // Require read key to prevent unauthorized access / hotlinking
      if (request.headers.get('X-Read-Key') !== env.READ_KEY) {
        return new Response('Unauthorized', { status: 401, headers: corsHeaders(origin) });
      }

      const object = await env.SHEETS.get(key);
      if (!object) {
        return new Response('Not Found', { status: 404, headers: corsHeaders(origin) });
      }

      return new Response(object.body, {
        headers: {
          ...corsHeaders(origin),
          'Content-Type': 'application/pdf',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // PUT — store PDF in R2
    if (method === 'PUT') {
      if (request.headers.get('X-Upload-Key') !== env.UPLOAD_KEY) {
        return new Response('Unauthorized', { status: 401, headers: corsHeaders(origin) });
      }

      const contentType = request.headers.get('Content-Type');
      if (!contentType || !contentType.includes('application/pdf')) {
        return new Response('Content-Type must be application/pdf', {
          status: 400,
          headers: corsHeaders(origin),
        });
      }

      const body = await request.arrayBuffer();
      if (body.byteLength > 2 * 1024 * 1024) {
        return new Response('Payload too large (2MB max)', {
          status: 413,
          headers: corsHeaders(origin),
        });
      }

      await env.SHEETS.put(key, body, {
        httpMetadata: { contentType: 'application/pdf' },
      });

      return new Response(JSON.stringify({ ok: true, key }), {
        status: 201,
        headers: {
          ...corsHeaders(origin),
          'Content-Type': 'application/json',
        },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};

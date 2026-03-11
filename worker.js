// Cloudflare Worker — CORS proxy for NC DOC lookups
// Deploy: npx wrangler deploy worker.js --name ncdoc-proxy
// Or paste into Cloudflare Dashboard > Workers & Pages > Create > Quick Edit

const ALLOWED_ORIGIN = '*'; // Lock down to your GitHub Pages URL if desired
const TARGET_HOST = 'https://webapps.doc.state.nc.us';

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const target = url.searchParams.get('url');

    if (!target || !target.startsWith(TARGET_HOST)) {
      return new Response(JSON.stringify({ error: 'Invalid or missing ?url= parameter' }), {
        status: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    try {
      const resp = await fetch(target, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NCDOC-Lookup/1.0)' },
      });
      const body = await resp.text();

      return new Response(body, {
        status: resp.status,
        headers: {
          ...corsHeaders(),
          'Content-Type': resp.headers.get('Content-Type') || 'text/html',
        },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 502,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

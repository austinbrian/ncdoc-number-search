// Cloudflare Worker — CORS proxy for NC DOC lookups, bug reports, and R2 data serving
// Deploy: npx wrangler deploy
// Secrets: npx wrangler secret put GITHUB_TOKEN
//          npx wrangler secret put UPLOAD_TOKEN

const ALLOWED_ORIGIN = '*';
const TARGET_HOST = 'https://webapps.doc.state.nc.us';
const GITHUB_REPO = 'austinbrian/ncdoc-number-search';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);

    // Serve data files from R2
    if (url.pathname.startsWith('/data/') && request.method === 'GET') {
      return handleDataGet(url.pathname, env);
    }

    // Upload data files to R2
    if (url.pathname.startsWith('/data/') && request.method === 'PUT') {
      return handleDataPut(request, url.pathname, env);
    }

    // Bug report endpoint
    if (url.pathname === '/report' && request.method === 'POST') {
      return handleBugReport(request, env);
    }

    // CORS proxy for NC DOC
    const target = url.searchParams.get('url');
    if (!target || !target.startsWith(TARGET_HOST)) {
      return jsonResponse({ error: 'Invalid or missing ?url= parameter' }, 400);
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
      return jsonResponse({ error: e.message }, 502);
    }
  },
};

const R2_ALLOWED_KEYS = ['dataset.json', 'early_reentries.json'];

async function handleDataGet(pathname, env) {
  const key = pathname.replace('/data/', '');
  if (!R2_ALLOWED_KEYS.includes(key)) {
    return jsonResponse({ error: 'Not found' }, 404);
  }

  const object = await env.R2.get(key);
  if (!object) {
    return jsonResponse({ error: 'Not found' }, 404);
  }

  return new Response(object.body, {
    headers: {
      ...corsHeaders(),
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
      'ETag': object.httpEtag,
    },
  });
}

async function handleDataPut(request, pathname, env) {
  const token = env.UPLOAD_TOKEN;
  if (!token) {
    return jsonResponse({ error: 'Upload not configured' }, 500);
  }

  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${token}`) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const key = pathname.replace('/data/', '');
  if (!R2_ALLOWED_KEYS.includes(key)) {
    return jsonResponse({ error: 'Invalid key' }, 400);
  }

  await env.R2.put(key, request.body, {
    httpMetadata: { contentType: 'application/json' },
  });

  return jsonResponse({ success: true, key });
}

async function handleBugReport(request, env) {
  const token = env.GITHUB_TOKEN;
  if (!token) {
    return jsonResponse({ error: 'Bug reporting is not configured' }, 500);
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const { description, offenderNumbers, errors, browser } = data;
  if (!description || !description.trim()) {
    return jsonResponse({ error: 'Description is required' }, 400);
  }

  let body = `## Description\n${description.trim()}\n\n`;
  if (offenderNumbers) {
    body += `## Offender numbers searched\n\`\`\`\n${offenderNumbers}\n\`\`\`\n\n`;
  }
  if (errors) {
    body += `## Errors shown\n\`\`\`\n${errors}\n\`\`\`\n\n`;
  }
  body += `## Browser\n${browser || 'Unknown'}\n\n---\n*Submitted via bug report form*`;

  try {
    const ghResp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'NCDOC-Lookup-Worker',
        'Accept': 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        title: `Bug report: ${description.trim().substring(0, 80)}`,
        body,
        labels: ['bug'],
      }),
    });

    if (!ghResp.ok) {
      const err = await ghResp.text();
      return jsonResponse({ error: `GitHub API error: ${ghResp.status}` }, 502);
    }

    const issue = await ghResp.json();
    return jsonResponse({ success: true, issueNumber: issue.number, url: issue.html_url });
  } catch (e) {
    return jsonResponse({ error: e.message }, 502);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

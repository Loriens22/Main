/* ===========================================================================
   nvidia-cors-proxy  —  a tiny CORS proxy for the NVIDIA (or any OpenAI-compatible)
   API, so the Co-op 3D single-page app can call it straight from the browser.

   WHY: NVIDIA's https://integrate.api.nvidia.com does NOT send CORS headers, so
   browsers block direct fetch() calls. This proxy forwards your request to NVIDIA
   (keeping your Authorization: Bearer key) and adds the CORS headers the browser
   needs. Because YOU deploy it, your API key only ever passes through YOUR proxy.

   ---------------------------------------------------------------------------
   DEPLOY (Cloudflare Workers — free, no credit card, ~1 minute):
     1. Go to https://dash.cloudflare.com  →  Workers & Pages  →  Create  →  Worker.
     2. Name it (e.g. "nvidia-proxy"), click Deploy, then "Edit code".
     3. Delete the sample, paste ALL of this file, click Deploy.
     4. Copy the worker URL, e.g.  https://nvidia-proxy.YOURNAME.workers.dev
     5. In Co-op 3D → New neighbor → AI/NVIDIA API:
          • enable the toggle
          • CORS proxy:  https://nvidia-proxy.YOURNAME.workers.dev/   (keep the trailing /)
          • API key:     your nvapi-... key
          • Endpoint:    https://integrate.api.nvidia.com/v1/chat/completions
        Click "Test connection" → it should say ✅ Connected.

   The app sends requests as  <worker>/<full target URL>, e.g.
     https://nvidia-proxy.you.workers.dev/https://integrate.api.nvidia.com/v1/chat/completions
   and this worker forwards them to that target with CORS enabled.

   (Optional) Lock it to your own site by setting ALLOW_ORIGIN below to your
   page's origin instead of "*".
   =========================================================================== */

const ALLOW_ORIGIN = "*"; // e.g. "https://yourname.github.io" to restrict
const DEFAULT_UPSTREAM = "https://integrate.api.nvidia.com";

export default {
  async fetch(request) {
    // --- CORS preflight ---
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    // --- work out the upstream target ---
    const url = new URL(request.url);
    // everything after the worker root is the target; supports both
    //   /https://integrate.api.nvidia.com/v1/chat/completions
    //   /v1/chat/completions            (falls back to DEFAULT_UPSTREAM)
    let rest = url.pathname.slice(1) + url.search;
    let target;
    if (/^https?:\/\//i.test(rest)) {
      target = rest;
    } else if (/^https?:\/\//i.test(decodeURIComponent(rest))) {
      target = decodeURIComponent(rest);
    } else {
      target = DEFAULT_UPSTREAM + url.pathname + url.search;
    }

    if (!target || target === DEFAULT_UPSTREAM) {
      return json({ ok: true, hint: "nvidia-cors-proxy is live. Append the full target URL.", example:
        url.origin + "/https://integrate.api.nvidia.com/v1/chat/completions" }, 200, request);
    }

    // --- forward the request, stripping hop-by-hop / browser-only headers ---
    const fwdHeaders = new Headers();
    for (const [k, v] of request.headers) {
      const lk = k.toLowerCase();
      if (["host","origin","referer","content-length","cf-connecting-ip",
           "cf-ipcountry","cf-ray","cf-visitor","x-forwarded-proto",
           "x-forwarded-for","x-real-ip"].includes(lk)) continue;
      fwdHeaders.set(k, v);
    }

    const init = {
      method: request.method,
      headers: fwdHeaders,
      body: ["GET","HEAD"].includes(request.method) ? undefined : request.body,
    };
    // Cloudflare needs this when streaming a request body through:
    if (init.body) init.duplex = "half";

    let upstream;
    try {
      upstream = await fetch(target, init);
    } catch (err) {
      return json({ error: "proxy_fetch_failed", detail: String(err), target }, 502, request);
    }

    // --- relay the response with CORS headers added ---
    const outHeaders = new Headers(upstream.headers);
    const cors = corsHeaders(request);
    for (const k in cors) outHeaders.set(k, cors[k]);
    outHeaders.delete("content-security-policy");
    outHeaders.delete("content-encoding"); // body is already decoded by fetch

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outHeaders,
    });
  },
};

function corsHeaders(request) {
  const reqHdrs = request.headers.get("access-control-request-headers")
    || "authorization, content-type, accept, x-cors-api-key";
  return {
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": reqHdrs,
    "Access-Control-Expose-Headers": "*",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
function json(obj, status, request) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({ "Content-Type": "application/json" }, corsHeaders(request)),
  });
}

/* ===========================================================================
   ALTERNATIVE: Deno Deploy (https://dash.deno.com — also free)
   Create a new Playground, paste the snippet below, Save & Deploy, then use the
   *.deno.dev URL exactly like the worker URL above.

   Deno.serve(async (req) => {
     const cors = {
       "Access-Control-Allow-Origin": "*",
       "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
       "Access-Control-Allow-Headers": "authorization,content-type,accept,x-cors-api-key",
     };
     if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
     const u = new URL(req.url);
     let t = u.pathname.slice(1) + u.search;
     if (!/^https?:\/\//i.test(t)) t = "https://integrate.api.nvidia.com" + u.pathname + u.search;
     const h = new Headers(req.headers); ["host","origin","referer"].forEach(x=>h.delete(x));
     const r = await fetch(t, { method:req.method, headers:h,
       body:["GET","HEAD"].includes(req.method)?undefined:req.body, duplex:"half" });
     const out = new Headers(r.headers); for (const k in cors) out.set(k, cors[k]);
     return new Response(r.body, { status:r.status, headers:out });
   });
   =========================================================================== */

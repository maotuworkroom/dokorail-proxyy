// dokorail-proxy: Vercel edge reverse proxy for dokorail.jp
//
// Why: GitHub Actions runner egress IPs get 403'd by dokorail's Cloudflare.
// Baker traffic goes through this Vercel deployment instead.
//
// Cache policy matters on Hobby plan:
//   - /api/*        live train feed -> short edge cache (10s, dedupe bursts)
//   - /rail/geometry/sha256/*  content-addressed -> immutable, CDN long cache
//   - /rail/*       timetable bundles -> 10min edge cache
//   - /             root HTML -> always fresh (geometry hash lives there)

const UPSTREAM = process.env.UPSTREAM || "https://dokorail.jp";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function cacheControlFor(pathname) {
  if (pathname.startsWith("/api/")) {
    return "public, max-age=0, s-maxage=10, must-revalidate";
  }
  if (/^\/rail\/geometry\/sha256\//.test(pathname)) {
    return "public, max-age=31536000, s-maxage=86400, immutable";
  }
  if (pathname.startsWith("/rail/")) {
    return "public, max-age=0, s-maxage=600";
  }
  return "public, max-age=0, s-maxage=0, must-revalidate";
}

export default async function handler(req) {
  try {
    const url = new URL(req.url, "https://proxy.local");
    const target = UPSTREAM + url.pathname + url.search;

    const headers = {
      "user-agent": BROWSER_UA,
      accept: req.headers.get("accept") || "*/*",
      // dokorail's /api/* rejects calls that don't look like the in-page app:
      // needs the train-search header + same-origin browser headers.
      referer: "https://dokorail.jp/",
      origin: "https://dokorail.jp",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
    };
    // dokorail's /api/* rejects requests without this header.
    if (url.pathname.startsWith("/api/")) headers["x-train-search"] = "1";

    let upstream;
    try {
      upstream = await fetch(target, { headers, redirect: "follow" });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "upstream_unreachable", detail: String(err) }),
        { status: 502, headers: { "content-type": "application/json" } }
      );
    }

    const body = await upstream.arrayBuffer();
    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";

    return new Response(body, {
      status: upstream.status,
      headers: {
        "content-type": contentType,
        "cache-control": cacheControlFor(url.pathname),
        "access-control-allow-origin": "*",
        "x-proxy-upstream": "dokorail",
      },
    });
  } catch (err) {
    return new Response("PROXY-UNCAUGHT: " + (err && err.stack ? err.stack : String(err)), {
      status: 500,
      headers: { "content-type": "text/plain" },
    });
  }
}

export const config = { runtime: "edge" };

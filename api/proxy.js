// dokorail-proxy: Vercel edge reverse proxy for dokorail.jp
//
// Why: GitHub Actions runner egress IPs get 403'd by dokorail's Cloudflare.
// Baker traffic goes through this Vercel deployment instead.
//
// Note: /api/feeds rejects bare API calls ("Application requests only").
// The site sets a session cookie on GET / that the API expects back, so
// for /api/* paths we first warm up the root page and replay its cookies.

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

function cookieString(resp) {
  const arr = typeof resp.headers.getSetCookie === "function"
    ? resp.headers.getSetCookie()
    : [];
  return arr.map((c) => c.split(";")[0]).join("; ");
}

export default async function handler(req) {
  try {
    const url = new URL(req.url, "https://proxy.local");
    const isApi = url.pathname.startsWith("/api/");

    const headers = {
      "user-agent": BROWSER_UA,
      accept: req.headers.get("accept") || "*/*",
      referer: "https://dokorail.jp/",
      origin: "https://dokorail.jp",
      "sec-fetch-dest": isApi ? "empty" : "document",
      "sec-fetch-mode": isApi ? "cors" : "navigate",
      "sec-fetch-site": "same-origin",
    };
    if (isApi) headers["x-train-search"] = "1";

    // Warm-up: grab session cookie from root before hitting the API.
    if (isApi) {
      try {
        const warm = await fetch(UPSTREAM + "/", {
          headers: { "user-agent": BROWSER_UA, accept: "text/html" },
          redirect: "follow",
        });
        const cookies = cookieString(warm);
        if (cookies) headers["cookie"] = cookies;
      } catch (_) {
        /* warm-up failure is non-fatal; try the API call anyway */
      }
    }

    let upstream;
    try {
      upstream = await fetch(UPSTREAM + url.pathname + url.search, {
        headers,
        redirect: "follow",
      });
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

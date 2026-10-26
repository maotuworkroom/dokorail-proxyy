export default async function handler() {
  return new Response("ok-diag-3", {
    headers: { "content-type": "text/plain" },
  });
}

export const config = { runtime: "edge" };

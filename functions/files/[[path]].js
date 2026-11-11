// Serves uploaded images from R2. Software downloads go through /download/<slug>.
export async function onRequestGet({ env, params }) {
  const key = (params.path || []).join("/");
  if (!/^img\/[0-9a-f-]{36}\.(jpg|png|gif|webp)$/.test(key)) return new Response("Not found", { status: 404 });
  const obj = await env.FILES.get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'",
      "X-Content-Type-Options": "nosniff",
      ETag: obj.httpEtag,
    },
  });
}

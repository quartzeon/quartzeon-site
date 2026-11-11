export async function onRequestGet({ env, params, waitUntil }) {
  const row = await env.DB
    .prepare("SELECT id, file_key, file_name, external_url FROM software WHERE slug = ?")
    .bind(params.slug)
    .first();
  if (!row) return new Response("Not found", { status: 404 });

  const count = () => env.DB.prepare("UPDATE software SET downloads = downloads + 1 WHERE id = ?").bind(row.id).run();

  if (row.file_key) {
    const obj = await env.FILES.get(row.file_key);
    if (!obj) return new Response("File missing", { status: 404 });
    waitUntil(count());
    const ascii = row.file_name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    return new Response(obj.body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(obj.size),
        "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  }
  if (row.external_url) {
    waitUntil(count());
    return Response.redirect(row.external_url, 302);
  }
  return new Response("Not found", { status: 404 });
}

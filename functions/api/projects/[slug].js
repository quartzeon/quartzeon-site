import { json, error } from "../../../lib/util.js";

export async function onRequestGet({ env, params }) {
  const row = await env.DB
    .prepare("SELECT slug, title, summary, body, url, tags, cover_key, carousel_key, created_at FROM projects WHERE slug = ?")
    .bind(params.slug)
    .first();
  if (!row) return error(404, "Not found");
  return json(row, 200, { "Cache-Control": "public, max-age=60" });
}

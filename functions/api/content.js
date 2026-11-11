import { json } from "../../lib/util.js";

export async function onRequestGet({ env }) {
  const [settings, projects, software, videos] = await env.DB.batch([
    env.DB.prepare("SELECT key, value FROM settings"),
    env.DB.prepare("SELECT slug, title, summary, url, tags, cover_key, carousel_key, in_carousel, created_at FROM projects ORDER BY created_at DESC, id DESC"),
    env.DB.prepare("SELECT slug, name, description, version, platform, icon_key, file_size, downloads, external_url, file_key != '' AS has_file FROM software ORDER BY created_at DESC, id DESC"),
    env.DB.prepare("SELECT youtube_id, title, description, carousel_key, in_carousel, created_at FROM videos ORDER BY created_at DESC, id DESC"),
  ]);
  return json(
    {
      settings: Object.fromEntries(settings.results.map((r) => [r.key, r.value])),
      projects: projects.results,
      software: software.results,
      videos: videos.results,
    },
    200,
    { "Cache-Control": "public, max-age=60" }
  );
}

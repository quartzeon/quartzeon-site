import { json, error, text, flag, httpUrl, slugify, uniqueSlug, youtubeId, HttpError } from "../../../lib/util.js";
import { saveImage, saveDownload, removeFiles } from "../../../lib/files.js";

// Setting key -> max length. Only these keys can be saved.
const SETTINGS = {
  hero_line1: 80, hero_line2: 80, hero_sub: 300,
  about_text: 300, about_muted: 200,
  channel_name: 80, channel_handle: 60, channel_url: 300, channel_desc: 500, channel_subs: 20,
  contact_email: 120, contact_links: 2000,
};

async function readForm(request) {
  const type = request.headers.get("Content-Type") || "";
  if (!type.startsWith("multipart/form-data")) throw new HttpError(415, "Expected a form upload.");
  return request.formData();
}

function numericId(s) {
  if (!/^\d{1,10}$/.test(s || "")) throw new HttpError(404, "Not found.");
  return Number(s);
}

async function loadAll(db) {
  const [settings, projects, software, videos] = await db.batch([
    db.prepare("SELECT key, value FROM settings"),
    db.prepare("SELECT * FROM projects ORDER BY created_at DESC, id DESC"),
    db.prepare("SELECT * FROM software ORDER BY created_at DESC, id DESC"),
    db.prepare("SELECT * FROM videos ORDER BY created_at DESC, id DESC"),
  ]);
  return {
    settings: Object.fromEntries(settings.results.map((r) => [r.key, r.value])),
    projects: projects.results,
    software: software.results,
    videos: videos.results,
  };
}

// ---------- settings ----------

async function saveSettings(env, form) {
  const values = {};
  for (const [key, max] of Object.entries(SETTINGS)) values[key] = text(form, key, max);
  values.channel_url = httpUrl(form, "channel_url", "Channel link");
  if (values.contact_email && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(values.contact_email)) {
    throw new HttpError(400, "Contact email doesn't look right.");
  }

  const old = await env.DB.prepare("SELECT value FROM settings WHERE key = 'channel_avatar_key'").first();
  const oldAvatar = old ? old.value : "";
  const newAvatar = await saveImage(env, form, "channel_avatar", "Channel picture");
  if (newAvatar || flag(form, "remove_channel_avatar")) {
    values.channel_avatar_key = newAvatar;
    await removeFiles(env, oldAvatar);
  }

  const upsert = env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  await env.DB.batch(Object.entries(values).map(([k, v]) => upsert.bind(k, v)));
}

// ---------- projects ----------

function projectFields(form) {
  return {
    title: text(form, "title", 120, { required: true, label: "Title" }),
    summary: text(form, "summary", 300, { label: "Short summary" }),
    body: text(form, "body", 20000, { label: "Details" }),
    url: httpUrl(form, "url", "Project link"),
    tags: text(form, "tags", 200, { label: "Tags" }),
    in_carousel: flag(form, "in_carousel"),
  };
}

async function createProject(env, form) {
  const f = projectFields(form);
  const slug = await uniqueSlug(env.DB, "projects", slugify(f.title));
  const cover = await saveImage(env, form, "cover", "Cover image");
  const carousel = await saveImage(env, form, "carousel", "Carousel photo");
  await env.DB.prepare(
    "INSERT INTO projects (slug, title, summary, body, url, tags, cover_key, carousel_key, in_carousel) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(slug, f.title, f.summary, f.body, f.url, f.tags, cover, carousel, f.in_carousel).run();
}

async function updateProject(env, id, form) {
  const row = await env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(id).first();
  if (!row) throw new HttpError(404, "Project not found.");
  const f = projectFields(form);
  const images = await replaceImages(env, form, row, { cover_key: ["cover", "Cover image"], carousel_key: ["carousel", "Carousel photo"] });
  await env.DB.prepare(
    "UPDATE projects SET title = ?, summary = ?, body = ?, url = ?, tags = ?, cover_key = ?, carousel_key = ?, in_carousel = ? WHERE id = ?"
  ).bind(f.title, f.summary, f.body, f.url, f.tags, images.cover_key, images.carousel_key, f.in_carousel, id).run();
}

// For each image column: a new upload replaces the old file, "remove_<field>" clears it.
async function replaceImages(env, form, row, columns) {
  const out = {};
  const stale = [];
  for (const [column, [field, label]] of Object.entries(columns)) {
    const key = await saveImage(env, form, field, label);
    if (key || flag(form, `remove_${field}`)) {
      stale.push(row[column]);
      out[column] = key;
    } else {
      out[column] = row[column];
    }
  }
  await removeFiles(env, ...stale);
  return out;
}

// ---------- software ----------

function softwareFields(form) {
  return {
    name: text(form, "name", 120, { required: true, label: "Name" }),
    description: text(form, "description", 1000, { label: "Description" }),
    version: text(form, "version", 30, { label: "Version" }),
    platform: text(form, "platform", 60, { label: "Platform" }),
    external_url: httpUrl(form, "external_url", "Download link"),
  };
}

async function createSoftware(env, form) {
  const f = softwareFields(form);
  const sent = form.get("file");
  if (!(sent && typeof sent === "object" && sent.size > 0) && !f.external_url) {
    throw new HttpError(400, "Add a file or a download link.");
  }
  const icon = await saveImage(env, form, "icon", "Icon");
  const file = await saveDownload(env, form, "file");
  const slug = await uniqueSlug(env.DB, "software", slugify(f.name));
  await env.DB.prepare(
    "INSERT INTO software (slug, name, description, version, platform, icon_key, file_key, file_name, file_size, external_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(slug, f.name, f.description, f.version, f.platform, icon, file?.key || "", file?.name || "", file?.size || 0, f.external_url).run();
}

async function updateSoftware(env, id, form) {
  const row = await env.DB.prepare("SELECT * FROM software WHERE id = ?").bind(id).first();
  if (!row) throw new HttpError(404, "Software not found.");
  const f = softwareFields(form);
  let file = { key: row.file_key, name: row.file_name, size: row.file_size };
  const upload = await saveDownload(env, form, "file");
  if (upload || flag(form, "remove_file")) {
    await removeFiles(env, row.file_key);
    file = upload || { key: "", name: "", size: 0 };
  }
  if (!file.key && !f.external_url) {
    await removeFiles(env, upload?.key);
    throw new HttpError(400, "Add a file or a download link.");
  }
  const images = await replaceImages(env, form, row, { icon_key: ["icon", "Icon"] });
  await env.DB.prepare(
    "UPDATE software SET name = ?, description = ?, version = ?, platform = ?, icon_key = ?, file_key = ?, file_name = ?, file_size = ?, external_url = ? WHERE id = ?"
  ).bind(f.name, f.description, f.version, f.platform, images.icon_key, file.key, file.name, file.size, f.external_url, id).run();
}

// ---------- videos ----------

async function youtubeTitle(id) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent("https://www.youtube.com/watch?v=" + id)}`);
    if (!res.ok) return "";
    const data = await res.json();
    return typeof data.title === "string" ? data.title.slice(0, 200) : "";
  } catch {
    return "";
  }
}

async function videoFields(form) {
  const id = youtubeId(text(form, "youtube", 300, { required: true, label: "YouTube link" }));
  if (!id) throw new HttpError(400, "That doesn't look like a YouTube video link.");
  let title = text(form, "title", 200, { label: "Title" });
  if (!title) title = await youtubeTitle(id);
  if (!title) throw new HttpError(400, "Couldn't read the video title. Type it in.");
  return { youtube_id: id, title, description: text(form, "description", 1000, { label: "Description" }), in_carousel: flag(form, "in_carousel") };
}

async function createVideo(env, form) {
  const f = await videoFields(form);
  const dup = await env.DB.prepare("SELECT 1 FROM videos WHERE youtube_id = ?").bind(f.youtube_id).first();
  if (dup) throw new HttpError(400, "That video is already added.");
  const carousel = await saveImage(env, form, "carousel", "Carousel photo");
  await env.DB.prepare(
    "INSERT INTO videos (youtube_id, title, description, carousel_key, in_carousel) VALUES (?, ?, ?, ?, ?)"
  ).bind(f.youtube_id, f.title, f.description, carousel, f.in_carousel).run();
}

async function updateVideo(env, id, form) {
  const row = await env.DB.prepare("SELECT * FROM videos WHERE id = ?").bind(id).first();
  if (!row) throw new HttpError(404, "Video not found.");
  const f = await videoFields(form);
  const dup = await env.DB.prepare("SELECT 1 FROM videos WHERE youtube_id = ? AND id != ?").bind(f.youtube_id, id).first();
  if (dup) throw new HttpError(400, "That video is already added.");
  const images = await replaceImages(env, form, row, { carousel_key: ["carousel", "Carousel photo"] });
  await env.DB.prepare(
    "UPDATE videos SET youtube_id = ?, title = ?, description = ?, carousel_key = ?, in_carousel = ? WHERE id = ?"
  ).bind(f.youtube_id, f.title, f.description, images.carousel_key, f.in_carousel, id).run();
}

// ---------- delete ----------

const FILE_COLUMNS = {
  projects: ["cover_key", "carousel_key"],
  software: ["icon_key", "file_key"],
  videos: ["carousel_key"],
};

async function removeRow(env, table, id) {
  const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
  if (!row) throw new HttpError(404, "Not found.");
  await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
  await removeFiles(env, ...FILE_COLUMNS[table].map((c) => row[c]));
}

// ---------- router ----------

const HANDLERS = {
  projects: { create: createProject, update: updateProject },
  software: { create: createSoftware, update: updateSoftware },
  videos: { create: createVideo, update: updateVideo },
};

export async function onRequest({ request, env, params }) {
  const [section, idPart, extra] = params.path || [];
  const method = request.method;

  if (section === "all" && !idPart && method === "GET") return json(await loadAll(env.DB));

  if (section === "settings" && !idPart && method === "PUT") {
    await saveSettings(env, await readForm(request));
    return json({ ok: true });
  }

  const h = HANDLERS[section];
  if (!h || extra !== undefined) return error(404, "Not found.");

  if (!idPart && method === "POST") {
    await h.create(env, await readForm(request));
    return json({ ok: true }, 201);
  }
  if (idPart && method === "PUT") {
    await h.update(env, numericId(idPart), await readForm(request));
    return json({ ok: true });
  }
  if (idPart && method === "DELETE") {
    await removeRow(env, section, numericId(idPart));
    return json({ ok: true });
  }
  return error(405, "Method not allowed.");
}

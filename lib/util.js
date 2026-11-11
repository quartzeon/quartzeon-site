export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

export function error(status, message) {
  return json({ error: message }, status);
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Reads a trimmed text field and enforces a maximum length.
export function text(form, name, max, { required = false, label = name } = {}) {
  const raw = form.get(name);
  const value = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
  if (required && !value) throw new HttpError(400, `${label} is required.`);
  if (value.length > max) throw new HttpError(400, `${label} is too long (max ${max} characters).`);
  return value;
}

export function flag(form, name) {
  const v = form.get(name);
  return v === "1" || v === "on" || v === "true" ? 1 : 0;
}

// Only http(s) URLs are stored, so they are safe to put in an href.
export function httpUrl(form, name, label = name) {
  const value = text(form, name, 500, { label });
  if (!value) return "";
  let u;
  try { u = new URL(value); } catch { throw new HttpError(400, `${label} must be a full link starting with https://`); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new HttpError(400, `${label} must start with https://`);
  return u.href;
}

export function slugify(s) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "item";
}

export async function uniqueSlug(db, table, base) {
  let slug = base;
  for (let i = 2; ; i++) {
    const row = await db.prepare(`SELECT 1 FROM ${table} WHERE slug = ?`).bind(slug).first();
    if (!row) return slug;
    slug = `${base}-${i}`;
  }
}

// Accepts the usual YouTube link shapes and returns the 11-character video id.
export function youtubeId(input) {
  const s = (input || "").trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  let u;
  try { u = new URL(s); } catch { return ""; }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  let id = "";
  if (host === "youtu.be") id = u.pathname.slice(1);
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = u.searchParams.get("v") || "";
    const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
    if (!id && m) id = m[1];
  }
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
}

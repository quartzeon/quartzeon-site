import { HttpError } from "./util.js";

const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_DOWNLOAD = 95 * 1024 * 1024; // Cloudflare caps a request body at 100 MB on the free plan

// Image type is decided by the file's first bytes, not by its name or the
// browser's claim. SVG is never accepted (it can carry scripts).
function sniffImage(bytes) {
  const b = new Uint8Array(bytes, 0, Math.min(12, bytes.byteLength));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", type: "image/png" };
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return { ext: "gif", type: "image/gif" };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { ext: "webp", type: "image/webp" };
  return null;
}

function uploaded(form, name) {
  const f = form.get(name);
  return f && typeof f === "object" && f.size > 0 ? f : null;
}

// Stores an uploaded image under img/ and returns its key, or "" when no file was sent.
export async function saveImage(env, form, name, label) {
  const file = uploaded(form, name);
  if (!file) return "";
  if (file.size > MAX_IMAGE) throw new HttpError(400, `${label} must be 10 MB or smaller.`);
  const bytes = await file.arrayBuffer();
  const kind = sniffImage(bytes);
  if (!kind) throw new HttpError(400, `${label} must be a JPG, PNG, WebP or GIF image.`);
  const key = `img/${crypto.randomUUID()}.${kind.ext}`;
  await env.FILES.put(key, bytes, { httpMetadata: { contentType: kind.type } });
  return key;
}

export function safeFileName(name) {
  const cleaned = (name || "download")
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
    .replace(/^\.+/, "")
    .slice(-120);
  return cleaned || "download";
}

// Stores a software download under dl/ and returns { key, name, size }, or null.
export async function saveDownload(env, form, name) {
  const file = uploaded(form, name);
  if (!file) return null;
  if (file.size > MAX_DOWNLOAD) {
    throw new HttpError(400, "File is over 95 MB. Upload it to GitHub Releases (or similar) and paste the link instead.");
  }
  const fileName = safeFileName(file.name);
  const key = `dl/${crypto.randomUUID()}/${fileName}`;
  await env.FILES.put(key, file, { httpMetadata: { contentType: "application/octet-stream" } });
  return { key, name: fileName, size: file.size };
}

export async function removeFiles(env, ...keys) {
  const list = keys.filter(Boolean);
  if (list.length) await env.FILES.delete(list);
}

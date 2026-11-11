import { adminEmail } from "../../../lib/auth.js";
import { error, HttpError } from "../../../lib/util.js";

export async function onRequest({ request, env, next, data }) {
  const email = await adminEmail(request, env);
  if (!email) return error(401, "Not signed in.");

  // Writes must come from our own admin page (blocks cross-site requests).
  if (request.method !== "GET" && request.method !== "HEAD") {
    if (request.headers.get("Origin") !== new URL(request.url).origin) return error(403, "Bad origin.");
  }

  data.email = email;
  try {
    return await next();
  } catch (e) {
    if (e instanceof HttpError) return error(e.status, e.message);
    console.error(e);
    return error(500, "Something went wrong.");
  }
}

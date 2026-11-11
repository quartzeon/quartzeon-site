import { adminEmail } from "../../lib/auth.js";

// Guards the /admin pages themselves (Cloudflare Access should block first).
export async function onRequest({ request, env, next }) {
  if (!(await adminEmail(request, env))) return new Response("Not found", { status: 404 });
  return next();
}

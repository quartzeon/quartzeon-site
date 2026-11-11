// Supabase Edge Function "github": lets the admin page write to the site's
// GitHub repository after the owner signs in with Google.
//
// The admin page sends GitHub API calls here with its Supabase session token.
// This function checks the token belongs to ADMIN_EMAIL's Google account, then
// forwards the call to GitHub with GITHUB_TOKEN, which never leaves the server.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   GITHUB_TOKEN    fine-grained token, this repository only, Contents: Read and write
//   ADMIN_EMAIL     the Google account allowed to edit the site
//   GITHUB_REPO     owner/repo, e.g. quartzeon/quartzeon-site
//   ALLOWED_ORIGIN  the site's address, e.g. https://quartzeon.com
// Deploy with "Verify JWT" turned off; the check below does it instead.

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? "";
const ADMIN_EMAIL = (Deno.env.get("ADMIN_EMAIL") ?? "").trim().toLowerCase();
const GITHUB_REPO = (Deno.env.get("GITHUB_REPO") ?? "").trim();
const ALLOWED_ORIGIN = (Deno.env.get("ALLOWED_ORIGIN") ?? "").trim().replace(/\/$/, "");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, accept",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};

function reply(status: number, message: string): Response {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// True when the session token belongs to ADMIN_EMAIL signed in through Google.
async function isAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization") ?? "";
  if (!ADMIN_EMAIL || !auth.startsWith("Bearer ")) return false;
  const res = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { Authorization: auth, apikey: req.headers.get("apikey") || SUPABASE_ANON_KEY },
  });
  if (!res.ok) return false;
  const user = await res.json();
  const identities: { provider?: string; identity_data?: { email?: string } }[] = user.identities ?? [];
  return identities.some((i) =>
    i.provider === "google" && (i.identity_data?.email ?? "").toLowerCase() === ADMIN_EMAIL
  );
}

// Only the Git data and contents endpoints of the one repository.
function allowedPath(path: string, method: string): boolean {
  const base = "/repos/" + GITHUB_REPO + "/";
  if (!GITHUB_REPO || !path.startsWith(base) || path.includes("..")) return false;
  const rest = path.slice(base.length);
  if (method === "GET") return /^(git\/ref\/heads\/|git\/commits\/|contents\/)/.test(rest);
  if (method === "POST") return /^git\/(blobs|trees|commits)$/.test(rest);
  if (method === "PATCH") return /^git\/refs\/heads\/[\w.\-\/]+$/.test(rest);
  return false;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (origin && origin !== ALLOWED_ORIGIN) return reply(403, "This site isn't allowed to use the admin service.");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  if (!(await isAdmin(req))) return reply(401, "Your sign-in expired or this Google account can't edit the site. Sign in again.");

  const url = new URL(req.url);
  const at = url.pathname.indexOf("/repos/");
  const path = at < 0 ? "" : decodeURIComponent(url.pathname.slice(at));
  if (!allowedPath(path, req.method)) return reply(400, "That request isn't allowed.");
  if (!GITHUB_TOKEN) return reply(502, "The GITHUB_TOKEN secret isn't set in Supabase.");

  const headers: Record<string, string> = {
    Authorization: "Bearer " + GITHUB_TOKEN,
    Accept: req.headers.get("accept") || "application/vnd.github+json",
    "User-Agent": "quartzeon-admin",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const type = req.headers.get("content-type");
  if (type) headers["Content-Type"] = type;

  const res = await fetch("https://api.github.com" + url.pathname.slice(at) + url.search, {
    method: req.method,
    headers,
    body: req.method === "GET" ? undefined : await req.arrayBuffer(),
  });
  if (res.status === 401 || res.status === 403) {
    return reply(502, "GitHub didn't accept the server's token. Make a new one and update the GITHUB_TOKEN secret in Supabase.");
  }
  return new Response(res.body, {
    status: res.status,
    headers: { ...cors, "Content-Type": res.headers.get("content-type") ?? "application/json" },
  });
});

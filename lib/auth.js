// Admin access is granted by Cloudflare Access. Access puts a signed JWT in the
// Cf-Access-Jwt-Assertion header; we verify it ourselves so a mis-configured
// Access policy can never leave the admin API open.

const certCache = new Map();

function b64urlToBytes(s) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function getKeys(team) {
  const hit = certCache.get(team);
  if (hit && hit.until > Date.now()) return hit.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error("Could not load Access certificates");
  const { keys } = await res.json();
  certCache.set(team, { keys, until: Date.now() + 60 * 60 * 1000 });
  return keys;
}

async function verifyAccessJwt(token, env) {
  const team = (env.ACCESS_TEAM_DOMAIN || "").trim().toLowerCase();
  const aud = (env.ACCESS_AUD || "").trim();
  if (!token || !aud || !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team)) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
  if (header.alg !== "RS256") return null;

  const jwk = (await getKeys(team)).find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!ok) return null;

  const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
  const now = Math.floor(Date.now() / 1000);
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.includes(aud)) return null;
  if (claims.iss !== `https://${team}`) return null;
  if (typeof claims.exp !== "number" || claims.exp < now) return null;
  if (typeof claims.nbf === "number" && claims.nbf > now + 60) return null;
  return claims;
}

function allowedEmails(env) {
  return (env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

// Returns the admin's email, or null when the request is not from the admin.
export async function adminEmail(request, env) {
  const url = new URL(request.url);
  if (env.DEV_ADMIN === "1" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
    return "dev@localhost";
  }
  try {
    const claims = await verifyAccessJwt(request.headers.get("Cf-Access-Jwt-Assertion"), env);
    const email = (claims && typeof claims.email === "string") ? claims.email.toLowerCase() : "";
    return email && allowedEmails(env).includes(email) ? email : null;
  } catch {
    return null;
  }
}

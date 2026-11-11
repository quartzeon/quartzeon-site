// Google sign-in through Supabase Auth, without the Supabase library.
// The session is kept in localStorage and refreshed before it expires.
(function () {
  var KEY = "qe-session";

  function Auth(config) {
    this.url = config.url.replace(/\/$/, "");
    this.key = config.key;
  }

  Auth.prototype.read = function () {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; }
  };

  Auth.prototype.write = function (s) {
    try {
      if (s) localStorage.setItem(KEY, JSON.stringify(s));
      else localStorage.removeItem(KEY);
    } catch (e) { /* ignore */ }
  };

  // Sends the browser to Google; it comes back to this page with the session in the address.
  Auth.prototype.signIn = function () {
    location.href = this.url + "/auth/v1/authorize?provider=google&redirect_to=" +
      encodeURIComponent(location.origin + location.pathname);
  };

  // Picks up the session (or error) Supabase puts after "#" when coming back from Google.
  // Resolves the error text, or "" when there was none.
  Auth.prototype.fromRedirect = function () {
    if (location.hash.length < 2) return "";
    var p = new URLSearchParams(location.hash.slice(1));
    if (!p.has("access_token") && !p.has("error")) return "";
    history.replaceState(null, "", location.pathname + location.search);
    if (p.has("error")) return p.get("error_description") || p.get("error");
    this.write({
      access: p.get("access_token"),
      refresh: p.get("refresh_token"),
      expires: Number(p.get("expires_at")) || Math.floor(Date.now() / 1000) + Number(p.get("expires_in") || 3600),
    });
    return "";
  };

  Auth.prototype.signedIn = function () {
    return !!this.read();
  };

  // Resolves a valid access token, refreshing it when it's about to expire.
  Auth.prototype.token = function () {
    var self = this;
    var s = this.read();
    if (!s) return Promise.reject(expired());
    if (s.expires - 60 > Date.now() / 1000) return Promise.resolve(s.access);
    if (!this.refreshing) {
      this.refreshing = fetch(this.url + "/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        headers: { apikey: this.key, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: s.refresh }),
      }).then(function (res) {
        if (!res.ok) { self.write(null); throw expired(); }
        return res.json();
      }).then(function (out) {
        self.write({ access: out.access_token, refresh: out.refresh_token, expires: out.expires_at || Math.floor(Date.now() / 1000) + out.expires_in });
        return out.access_token;
      }).finally(function () { self.refreshing = null; });
    }
    return this.refreshing;
  };

  Auth.prototype.signOut = function () {
    var s = this.read();
    this.write(null);
    if (!s) return Promise.resolve();
    return fetch(this.url + "/auth/v1/logout", {
      method: "POST",
      headers: { apikey: this.key, Authorization: "Bearer " + s.access },
    }).catch(function () { /* the local session is gone either way */ });
  };

  function expired() {
    var e = new Error("Your sign-in expired. Sign in again.");
    e.status = 401;
    return e;
  }

  window.QEAuth = Auth;
})();

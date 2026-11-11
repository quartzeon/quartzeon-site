// Minimal GitHub REST client for the admin page. Every save becomes one commit
// on the site's branch; GitHub Pages then rebuilds the site from it.
(function () {
  function GitHub(config, token) {
    this.base = (config.api || "https://api.github.com") + "/repos/" + encodeURIComponent(config.owner) + "/" + encodeURIComponent(config.repo);
    this.branch = config.branch || "main";
    this.token = token;
  }

  GitHub.prototype.request = function (method, path, body, accept) {
    var headers = { Authorization: "Bearer " + this.token, Accept: accept || "application/vnd.github+json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    return fetch(this.base + path, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    }).then(function (res) {
      if (res.ok) return accept && accept.indexOf("raw") >= 0 ? res.text() : res.json();
      return res.json().catch(function () { return {}; }).then(function (out) {
        var err = new Error(out.message || "GitHub request failed (" + res.status + ").");
        err.status = res.status;
        throw err;
      });
    });
  };

  // Latest commit on the branch: { commit, tree }.
  GitHub.prototype.head = function () {
    var self = this;
    return this.request("GET", "/git/ref/heads/" + encodeURIComponent(this.branch)).then(function (ref) {
      return self.request("GET", "/git/commits/" + ref.object.sha).then(function (c) {
        return { commit: c.sha, tree: c.tree.sha };
      });
    });
  };

  // Reads a text file at a commit. Resolves null when the file doesn't exist.
  GitHub.prototype.readText = function (path, ref) {
    return this.request("GET", "/contents/" + path.split("/").map(encodeURIComponent).join("/") + "?ref=" + encodeURIComponent(ref), undefined, "application/vnd.github.raw+json")
      .catch(function (e) { if (e.status === 404) return null; throw e; });
  };

  function toBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var parts = [];
    for (var i = 0; i < bytes.length; i += 0x8000) {
      parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)));
    }
    return btoa(parts.join(""));
  }

  // Makes one commit on top of `head`. `files` is a list of
  // { path, text } or { path, bytes: ArrayBuffer }; `remove` is a list of paths.
  // Fails with status 422 if the branch moved since `head` was read.
  GitHub.prototype.commit = function (head, message, files, remove) {
    var self = this;
    var blobs = files.map(function (f) {
      var body = f.bytes ? { content: toBase64(f.bytes), encoding: "base64" } : { content: f.text, encoding: "utf-8" };
      return self.request("POST", "/git/blobs", body).then(function (b) {
        return { path: f.path, mode: "100644", type: "blob", sha: b.sha };
      });
    });
    return Promise.all(blobs)
      .then(function (entries) {
        (remove || []).forEach(function (path) {
          entries.push({ path: path, mode: "100644", type: "blob", sha: null });
        });
        return self.request("POST", "/git/trees", { base_tree: head.tree, tree: entries });
      })
      .then(function (tree) {
        return self.request("POST", "/git/commits", { message: message, tree: tree.sha, parents: [head.commit] })
          .then(function (c) { return { commit: c.sha, tree: tree.sha }; });
      })
      .then(function (next) {
        return self.request("PATCH", "/git/refs/heads/" + encodeURIComponent(self.branch), { sha: next.commit, force: false })
          .then(function () { return next; });
      });
  };

  window.QEGitHub = GitHub;
})();

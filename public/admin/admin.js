// Admin page: reads public/content.json from the GitHub repo and saves every
// change as one commit (content.json plus any uploaded files). GitHub Pages
// then rebuilds the site. All content goes into the page with textContent.
(function () {
  var el = QE.el;
  var CONTENT_PATH = "public/content.json";
  var FILES_DIR = "public/files/";
  var TOKEN_KEY = "qe-gh-token";
  var MAX_IMAGE = 10 * 1024 * 1024;
  var MAX_DOWNLOAD = 50 * 1024 * 1024; // GitHub warns about files over 50 MB

  var data = emptyData();
  var head = null;       // { commit, tree } the data was read from
  var gh = null;
  // Google sign-in through Supabase when it's set up, otherwise a GitHub token.
  var auth = window.QE_SUPABASE && QE_SUPABASE.url ? new QEAuth(QE_SUPABASE) : null;
  var busy = false;
  var previews = {};     // file key -> blob: URL for images uploaded in this visit

  var NOUN = { projects: "project", software: "software", videos: "video" };
  var ADD_HEADING = { projects: "Add a project", software: "Add software", videos: "Add a video" };

  // Setting key -> max length. Only these keys are saved.
  var SETTINGS = {
    hero_line1: 80, hero_line2: 80, hero_sub: 300,
    about_text: 300, about_muted: 200,
    channel_name: 80, channel_handle: 60, channel_url: 300, channel_desc: 500, channel_subs: 20,
    contact_email: 120, contact_links: 2000,
  };

  function emptyData() {
    return { settings: {}, projects: [], software: [], videos: [] };
  }

  // ---------- helpers ----------

  var toastTimer;
  function toast(message, isError) {
    var t = document.getElementById("toast");
    t.textContent = message;
    t.classList.toggle("is-error", !!isError);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, isError ? 7000 : 4000);
  }

  function formOf(section) {
    return document.querySelector('form[data-section="' + section + '"]');
  }

  function fail(message) {
    throw new Error(message);
  }

  // Reads a trimmed text field and enforces a maximum length.
  function text(form, name, max, opts) {
    opts = opts || {};
    var label = opts.label || name;
    var value = String(form.elements[name].value || "").replace(/\r\n/g, "\n").trim();
    if (opts.required && !value) fail(label + " is required.");
    if (value.length > max) fail(label + " is too long (max " + max + " characters).");
    return value;
  }

  function flag(form, name) {
    return form.elements[name].checked ? 1 : 0;
  }

  // Only http(s) URLs are stored, so they are safe to put in an href.
  function httpUrl(form, name, label) {
    var value = text(form, name, 500, { label: label });
    if (!value) return "";
    var u;
    try { u = new URL(value); } catch (e) { fail(label + " must be a full link starting with https://"); }
    if (u.protocol !== "https:" && u.protocol !== "http:") fail(label + " must start with https://");
    return u.href;
  }

  function slugify(s) {
    return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "item";
  }

  function uniqueSlug(list, base, exceptId) {
    var slug = base;
    for (var i = 2; list.some(function (r) { return r.slug === slug && r.id !== exceptId; }); i++) slug = base + "-" + i;
    return slug;
  }

  function nextId(list) {
    return list.reduce(function (max, r) { return Math.max(max, r.id); }, 0) + 1;
  }

  // Accepts the usual YouTube link shapes and returns the 11-character video id.
  function youtubeId(input) {
    var s = (input || "").trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
    var u;
    try { u = new URL(s); } catch (e) { return ""; }
    var host = u.hostname.replace(/^www\.|^m\./, "");
    var id = "";
    if (host === "youtu.be") id = u.pathname.slice(1);
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      id = u.searchParams.get("v") || "";
      var m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
      if (!id && m) id = m[1];
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
  }

  function youtubeTitle(id) {
    var url = "https://www.youtube.com/watch?v=" + id;
    return fetch("https://noembed.com/embed?url=" + encodeURIComponent(url))
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (d) { return typeof d.title === "string" ? d.title.slice(0, 200) : ""; })
      .catch(function () { return ""; });
  }

  // Image type is decided by the file's first bytes, not by its name.
  // SVG is never accepted (it can carry scripts).
  function sniffImage(buffer) {
    var b = new Uint8Array(buffer, 0, Math.min(12, buffer.byteLength));
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "gif";
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
        b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
    return "";
  }

  function chosenFile(form, name) {
    var input = form.elements[name];
    return input && input.files && input.files[0] && input.files[0].size > 0 ? input.files[0] : null;
  }

  function safeFileName(name) {
    var cleaned = (name || "download").replace(/[\\/:*?"<>|#%\x00-\x1f]/g, "_").replace(/^\.+/, "").slice(-120);
    return cleaned || "download";
  }

  // Collects the files one save adds and removes.
  function Changes() {
    this.add = [];
    this.remove = [];
  }

  // Reads a chosen image into the change set and returns its key, or "" when none was chosen.
  Changes.prototype.image = function (form, name, label) {
    var file = chosenFile(form, name);
    if (!file) return Promise.resolve("");
    if (file.size > MAX_IMAGE) return Promise.reject(new Error(label + " must be 10 MB or smaller."));
    var self = this;
    return file.arrayBuffer().then(function (bytes) {
      var ext = sniffImage(bytes);
      if (!ext) throw new Error(label + " must be a JPG, PNG, WebP or GIF image.");
      var key = "img/" + crypto.randomUUID() + "." + ext;
      self.add.push({ path: FILES_DIR + key, bytes: bytes });
      previews[key] = URL.createObjectURL(file);
      return key;
    });
  };

  // Reads a chosen download into the change set: { key, name, size }, or null.
  Changes.prototype.download = function (form, name) {
    var file = chosenFile(form, name);
    if (!file) return Promise.resolve(null);
    if (file.size > MAX_DOWNLOAD) {
      return Promise.reject(new Error("File is over 50 MB. Upload it to GitHub Releases (or similar) and paste the link instead."));
    }
    var self = this;
    return file.arrayBuffer().then(function (bytes) {
      var fileName = safeFileName(file.name);
      var key = "dl/" + crypto.randomUUID() + "/" + fileName;
      self.add.push({ path: FILES_DIR + key, bytes: bytes });
      return { key: key, name: fileName, size: file.size };
    });
  };

  Changes.prototype.drop = function () {
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i]) this.remove.push(FILES_DIR + arguments[i]);
    }
  };

  // For each image column: a new upload replaces the old file, "remove_<field>" clears it.
  function replaceImages(changes, form, row, columns) {
    var out = {};
    return Object.keys(columns).reduce(function (p, column) {
      var field = columns[column][0], label = columns[column][1];
      return p.then(function () { return changes.image(form, field, label); }).then(function (key) {
        if (key || flag(form, "remove_" + field)) {
          changes.drop(row[column]);
          out[column] = key;
        } else {
          out[column] = row[column] || "";
        }
      });
    }, Promise.resolve()).then(function () { return out; });
  }

  // ---------- GitHub ----------

  function friendly(e) {
    if (e.status === 409 || e.status === 422) return "The site changed somewhere else since this page loaded. Reload the page and try again.";
    if (auth) return e.message; // the Supabase function explains its own errors
    if (e.status === 401) return "GitHub didn't accept the token. Sign out and sign in with a new one.";
    if (e.status === 403 || e.status === 404) return "The token can't reach the " + QE_GITHUB.repo + " repository, or it can only read. Check its permissions.";
    return e.message;
  }

  function load() {
    return gh.head().then(function (h) {
      return gh.readText(CONTENT_PATH, h.commit).then(function (raw) {
        var parsed = raw ? JSON.parse(raw) : {};
        data = emptyData();
        Object.keys(data).forEach(function (k) { if (parsed[k]) data[k] = parsed[k]; });
        head = h;
        renderLists();
        fillSettings();
      });
    });
  }

  // Applies `change(next, changes)` to a copy of the data and saves it as one commit.
  function save(message, change) {
    var next = JSON.parse(JSON.stringify(data));
    var changes = new Changes();
    return Promise.resolve(change(next, changes)).then(function () {
      changes.add.push({ path: CONTENT_PATH, text: JSON.stringify(next, null, 2) + "\n" });
      return gh.commit(head, message, changes.add, changes.remove);
    }).then(function (h) {
      head = h;
      data = next;
    });
  }

  // ---------- tabs ----------

  function showTab(name) {
    document.querySelectorAll("[data-tab]").forEach(function (b) {
      b.setAttribute("aria-selected", String(b.getAttribute("data-tab") === name));
    });
    document.querySelectorAll("[data-panel]").forEach(function (p) {
      p.hidden = p.getAttribute("data-panel") !== name;
    });
    try { localStorage.setItem("qe-admin-tab", name); } catch (e) { /* ignore */ }
  }

  document.querySelectorAll("[data-tab]").forEach(function (b) {
    b.addEventListener("click", function () { showTab(b.getAttribute("data-tab")); });
  });

  // ---------- lists ----------

  function fileUrl(key) {
    return previews[key] || QE.fileUrl(key);
  }

  function thumbFor(section, row) {
    if (section === "projects") return fileUrl(row.carousel_key || row.cover_key);
    if (section === "software") return fileUrl(row.icon_key);
    return row.carousel_key ? fileUrl(row.carousel_key) : QE.ytThumb(row.youtube_id, "mqdefault");
  }

  function metaFor(section, row) {
    var parts = [];
    if (section === "projects") {
      if (row.tags) parts.push(row.tags);
    } else if (section === "software") {
      if (row.version) parts.push("v" + row.version);
      if (row.platform) parts.push(row.platform);
      parts.push(row.file_key ? row.file_name + " · " + QE.formatSize(row.file_size) : "External link");
    } else {
      parts.push("youtu.be/" + row.youtube_id);
    }
    if (section !== "software" && row.in_carousel) parts.push("In carousel");
    return parts.join(" · ");
  }

  function renderLists() {
    ["projects", "software", "videos"].forEach(function (section) {
      var list = document.querySelector('[data-list="' + section + '"]');
      var editing = formOf(section).dataset.editId;
      list.textContent = "";
      if (!data[section].length) {
        list.appendChild(el("li", { class: "hint", text: "Nothing here yet." }));
        return;
      }
      data[section].forEach(function (row) {
        var src = thumbFor(section, row);
        var edit = el("button", { type: "button", text: "Edit" });
        var del = el("button", { type: "button", class: "danger", text: "Delete" });
        edit.addEventListener("click", function () { startEdit(section, row); });
        del.addEventListener("click", function () { remove(section, row); });
        list.appendChild(el("li", { class: "item" + (String(row.id) === editing ? " is-editing" : "") }, [
          src ? el("img", { class: "item-thumb", src: src, alt: "", loading: "lazy" }) : el("div", { class: "item-thumb" }),
          el("div", { class: "item-text" }, [
            el("div", { class: "item-title", text: row.title || row.name }),
            el("div", { class: "item-meta", text: metaFor(section, row) }),
          ]),
          el("div", { class: "item-actions" }, [edit, del]),
        ]));
      });
    });
  }

  // ---------- add / edit forms ----------

  function setRemoveBoxes(form, row) {
    form.querySelectorAll("label.remove").forEach(function (label) {
      var key = label.getAttribute("data-current");
      label.hidden = !(row && row[key]);
      label.querySelector("input").checked = false;
    });
  }

  function resetForm(section) {
    var form = formOf(section);
    form.reset();
    delete form.dataset.editId;
    form.querySelector("[data-heading]").textContent = ADD_HEADING[section];
    form.querySelector("[data-submit]").textContent = ADD_HEADING[section].replace(/^Add an? /, "Add ");
    form.querySelector("[data-cancel]").hidden = true;
    form.querySelector("[data-status]").textContent = "";
    setRemoveBoxes(form, null);
    renderLists();
  }

  function startEdit(section, row) {
    var form = formOf(section);
    form.reset();
    form.dataset.editId = String(row.id);
    Array.prototype.forEach.call(form.elements, function (input) {
      if (!input.name || input.type === "file" || input.name.indexOf("remove_") === 0) return;
      if (input.type === "checkbox") input.checked = !!row[input.name];
      else if (input.name === "youtube") input.value = "https://www.youtube.com/watch?v=" + row.youtube_id;
      else if (row[input.name] !== undefined && row[input.name] !== null) input.value = row[input.name];
    });
    form.querySelector("[data-heading]").textContent = "Edit " + NOUN[section] + ": " + (row.title || row.name);
    form.querySelector("[data-submit]").textContent = "Save changes";
    form.querySelector("[data-cancel]").hidden = false;
    form.querySelector("[data-status]").textContent = "";
    setRemoveBoxes(form, row);
    renderLists();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function findRow(next, section, id) {
    var row = next[section].filter(function (r) { return r.id === id; })[0];
    if (!row) fail("That item is gone. Reload the page.");
    return row;
  }

  // ---------- per-section saves ----------

  function saveSettings(form) {
    var values = {};
    Object.keys(SETTINGS).forEach(function (key) { values[key] = text(form, key, SETTINGS[key]); });
    values.channel_url = httpUrl(form, "channel_url", "Channel link");
    if (values.contact_email && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(values.contact_email)) {
      fail("Contact email doesn't look right.");
    }
    return save("Update channel and site text", function (next, changes) {
      return replaceImages(changes, form, next.settings, { channel_avatar_key: ["channel_avatar", "Channel picture"] }).then(function (images) {
        Object.keys(values).forEach(function (k) { next.settings[k] = values[k]; });
        next.settings.channel_avatar_key = images.channel_avatar_key;
      });
    });
  }

  function saveProject(form, id) {
    var f = {
      title: text(form, "title", 120, { required: true, label: "Title" }),
      summary: text(form, "summary", 300, { label: "Short summary" }),
      body: text(form, "body", 20000, { label: "Details" }),
      url: httpUrl(form, "url", "Project link"),
      tags: text(form, "tags", 200, { label: "Tags" }),
      in_carousel: flag(form, "in_carousel"),
    };
    return save((id ? "Update" : "Add") + " project: " + f.title, function (next, changes) {
      var row = id ? findRow(next, "projects", id) : { id: nextId(next.projects), slug: uniqueSlug(next.projects, slugify(f.title)), cover_key: "", carousel_key: "", created_at: new Date().toISOString() };
      return replaceImages(changes, form, row, { cover_key: ["cover", "Cover image"], carousel_key: ["carousel", "Carousel photo"] }).then(function (images) {
        Object.assign(row, f, images);
        if (!id) next.projects.unshift(row);
      });
    });
  }

  function saveSoftware(form, id) {
    var f = {
      name: text(form, "name", 120, { required: true, label: "Name" }),
      description: text(form, "description", 1000, { label: "Description" }),
      version: text(form, "version", 30, { label: "Version" }),
      platform: text(form, "platform", 60, { label: "Platform" }),
      external_url: httpUrl(form, "external_url", "Download link"),
    };
    return save((id ? "Update" : "Add") + " software: " + f.name, function (next, changes) {
      var row = id ? findRow(next, "software", id) : { id: nextId(next.software), slug: uniqueSlug(next.software, slugify(f.name)), icon_key: "", file_key: "", file_name: "", file_size: 0, created_at: new Date().toISOString() };
      return changes.download(form, "file").then(function (upload) {
        if (upload || flag(form, "remove_file")) {
          changes.drop(row.file_key);
          row.file_key = upload ? upload.key : "";
          row.file_name = upload ? upload.name : "";
          row.file_size = upload ? upload.size : 0;
        }
        if (!row.file_key && !f.external_url) fail("Add a file or a download link.");
        return replaceImages(changes, form, row, { icon_key: ["icon", "Icon"] });
      }).then(function (images) {
        Object.assign(row, f, images);
        if (!id) next.software.unshift(row);
      });
    });
  }

  function saveVideo(form, id) {
    var youtube = youtubeId(text(form, "youtube", 300, { required: true, label: "YouTube link" }));
    if (!youtube) fail("That doesn't look like a YouTube video link.");
    if (data.videos.some(function (v) { return v.youtube_id === youtube && v.id !== id; })) fail("That video is already added.");
    var title = text(form, "title", 200, { label: "Title" });
    var f = { youtube_id: youtube, description: text(form, "description", 1000, { label: "Description" }), in_carousel: flag(form, "in_carousel") };
    return (title ? Promise.resolve(title) : youtubeTitle(youtube)).then(function (t) {
      if (!t) fail("Couldn't read the video title. Type it in.");
      f.title = t;
      return save((id ? "Update" : "Add") + " video: " + t, function (next, changes) {
        var row = id ? findRow(next, "videos", id) : { id: nextId(next.videos), carousel_key: "", created_at: new Date().toISOString() };
        return replaceImages(changes, form, row, { carousel_key: ["carousel", "Carousel photo"] }).then(function (images) {
          Object.assign(row, f, images);
          if (!id) next.videos.unshift(row);
        });
      });
    });
  }

  var SAVERS = { settings: saveSettings, projects: saveProject, software: saveSoftware, videos: saveVideo };

  var FILE_COLUMNS = {
    projects: ["cover_key", "carousel_key"],
    software: ["icon_key", "file_key"],
    videos: ["carousel_key"],
  };

  function remove(section, row) {
    var name = row.title || row.name;
    if (busy) return toast("Wait for the last save to finish.", true);
    if (!confirm('Delete "' + name + '"? Its uploaded files are deleted too.')) return;
    busy = true;
    save("Delete " + NOUN[section] + ": " + name, function (next, changes) {
      next[section] = next[section].filter(function (r) { return r.id !== row.id; });
      changes.drop.apply(changes, FILE_COLUMNS[section].map(function (c) { return row[c]; }));
    })
      .then(function () {
        if (formOf(section).dataset.editId === String(row.id)) resetForm(section);
        else renderLists();
        toast("Deleted. The site updates in about a minute.");
      })
      .catch(function (e) { toast(friendly(e), true); })
      .then(function () { busy = false; });
  }

  function submitForm(form, section) {
    if (busy) return toast("Wait for the last save to finish.", true);
    var submit = form.querySelector("[data-submit]");
    var status = form.querySelector("[data-status]");
    var id = form.dataset.editId ? Number(form.dataset.editId) : 0;

    var hasFile = Array.prototype.some.call(form.querySelectorAll('input[type="file"]'), function (f) { return f.files.length; });
    busy = true;
    submit.disabled = true;
    status.textContent = hasFile ? "Uploading…" : "Saving…";

    Promise.resolve()
      .then(function () { return SAVERS[section](form, id); })
      .then(function () {
        status.textContent = "";
        toast((section === "settings" ? "Saved." : id ? "Changes saved." : "Added.") + " The site updates in about a minute.");
        if (section === "settings") fillSettings();
        else resetForm(section);
      })
      .catch(function (e) {
        status.textContent = "";
        toast(friendly(e), true);
      })
      .then(function () {
        busy = false;
        submit.disabled = false;
      });
  }

  document.querySelectorAll("form[data-section]").forEach(function (form) {
    var section = form.getAttribute("data-section");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      submitForm(form, section);
    });
    var cancel = form.querySelector("[data-cancel]");
    if (cancel) cancel.addEventListener("click", function () { resetForm(section); });
  });

  // ---------- settings ----------

  function fillSettings() {
    var form = formOf("settings");
    Array.prototype.forEach.call(form.elements, function (input) {
      if (!input.name || input.type === "file" || input.type === "checkbox") return;
      input.value = data.settings[input.name] || "";
    });
    form.querySelectorAll('input[type="file"]').forEach(function (f) { f.value = ""; });
    setRemoveBoxes(form, data.settings);
  }

  // ---------- sign in ----------

  function readToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
  }

  function signedIn(isIn) {
    document.getElementById("signin").hidden = isIn;
    document.getElementById("workspace").hidden = !isIn;
    document.getElementById("signout").hidden = !isIn;
    document.querySelector(".tabs").hidden = !isIn;
  }

  function start(token) {
    gh = auth
      ? new QEGitHub(QE_GITHUB, auth.token.bind(auth), auth.url + "/functions/v1/github", auth.key)
      : new QEGitHub(QE_GITHUB, token, QE_GITHUB.api);
    return load().then(function () { signedIn(true); });
  }

  document.getElementById("google").addEventListener("click", function () {
    auth.signIn();
  });

  document.getElementById("signin").addEventListener("submit", function (e) {
    e.preventDefault();
    if (auth) return;
    var input = document.getElementById("token");
    var token = input.value.trim();
    if (!token) return toast("Paste your GitHub token first.", true);
    start(token)
      .then(function () {
        input.value = "";
        try { localStorage.setItem(TOKEN_KEY, token); } catch (err) { /* ignore */ }
      })
      .catch(function (err) { toast(friendly(err), true); });
  });

  document.getElementById("signout").addEventListener("click", function () {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
    (auth ? auth.signOut() : Promise.resolve()).then(function () { location.reload(); });
  });

  // ---------- start ----------

  document.querySelectorAll(".repo-name").forEach(function (n) { n.textContent = QE_GITHUB.owner + "/" + QE_GITHUB.repo; });
  document.getElementById("signin-google").hidden = !auth;
  document.getElementById("signin-token").hidden = !!auth;

  var saved = null;
  try { saved = localStorage.getItem("qe-admin-tab"); } catch (e) { /* ignore */ }
  if (saved && document.querySelector('[data-panel="' + saved + '"]')) showTab(saved);

  var problem = auth ? auth.fromRedirect() : "";
  if (problem) toast(problem, true);
  var token = auth ? auth.signedIn() : readToken();
  if (token) {
    start(token).catch(function (e) {
      if (auth && e.status === 401) auth.write(null);
      signedIn(false);
      toast(friendly(e), true);
    });
  } else {
    signedIn(false);
  }
})();

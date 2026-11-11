(function () {
  var el = QE.el, safeUrl = QE.safeUrl, fileUrl = QE.fileUrl, ytThumb = QE.ytThumb;
  var $ = function (id) { return document.getElementById(id); };

  $("year").textContent = String(new Date().getFullYear());

  function setText(id, value) {
    if (value) $(id).textContent = value;
  }

  function projectHref(p) { return "/project.html?p=" + encodeURIComponent(p.slug); }
  function videoHref(v) { return "https://www.youtube.com/watch?v=" + encodeURIComponent(v.youtube_id); }

  function renderSettings(s) {
    setText("hero-line1", s.hero_line1);
    setText("hero-line2", s.hero_line2);
    setText("hero-sub", s.hero_sub);
    if (s.about_text) {
      var about = $("about-text");
      about.textContent = s.about_text + " ";
      if (s.about_muted) about.appendChild(el("span", { class: "muted", text: s.about_muted }));
    }
    if (s.channel_subs) $("stat-subs").textContent = QE.compact(s.channel_subs);

    var channelUrl = safeUrl(s.channel_url);
    if (s.channel_name || channelUrl) {
      $("channel").hidden = false;
      setText("channel-name", s.channel_name);
      setText("channel-handle", s.channel_handle);
      setText("channel-desc", s.channel_desc);
      if (s.channel_avatar_key) {
        $("channel-avatar").src = fileUrl(s.channel_avatar_key);
        $("channel-avatar").hidden = false;
      }
      if (channelUrl) $("channel-link").href = channelUrl;
      else $("channel-link").hidden = true;
    }

    var links = $("contact-links");
    if (s.contact_email) {
      links.appendChild(el("a", { class: "pill pill-lime", href: "mailto:" + s.contact_email }, [s.contact_email + " ", el("span", { "aria-hidden": "true", text: "↗" })]));
    }
    (s.contact_links || "").split("\n").forEach(function (line) {
      var parts = line.split("|");
      if (parts.length < 2) return;
      var label = parts[0].trim();
      var url = safeUrl(parts.slice(1).join("|").trim());
      if (!label || !url) return;
      links.appendChild(el("a", { class: "pill glass", href: url, target: "_blank", rel: "noopener noreferrer" }, [label + " ", el("span", { "aria-hidden": "true", text: "↗" })]));
    });
  }

  function renderProjects(list) {
    var grid = $("project-grid");
    $("stat-projects").textContent = String(list.length);
    $("projects-empty").hidden = list.length > 0;
    list.forEach(function (p) {
      var cover = el("div", { class: "project-cover" });
      if (p.cover_key || p.carousel_key) cover.appendChild(el("img", { src: fileUrl(p.cover_key || p.carousel_key), alt: "", loading: "lazy" }));
      var tags = el("div", { class: "tags" });
      (p.tags || "").split(",").forEach(function (t) {
        t = t.trim();
        if (t) tags.appendChild(el("span", { class: "tag", text: t }));
      });
      grid.appendChild(el("a", { class: "project-card", id: "project-" + p.slug, href: projectHref(p) }, [
        cover,
        el("h3", null, [p.title, el("span", { "aria-hidden": "true", text: "↗" })]),
        p.summary ? el("p", { text: p.summary }) : null,
        tags
      ]));
    });
  }

  function renderSoftware(list) {
    var ul = $("software-list");
    $("stat-software").textContent = String(list.length);
    $("software-empty").hidden = list.length > 0;
    list.forEach(function (s) {
      var icon = el("div", { class: "software-icon" });
      if (s.icon_key) icon.appendChild(el("img", { src: fileUrl(s.icon_key), alt: "", loading: "lazy" }));
      else icon.textContent = (s.name || "?").charAt(0).toUpperCase();
      var meta = [s.version ? "v" + s.version : "", s.platform, s.file_key ? QE.formatSize(s.file_size) : ""]
        .filter(Boolean).join(" · ");
      var href = s.file_key ? fileUrl(s.file_key) : safeUrl(s.external_url);
      ul.appendChild(el("li", { class: "software-item" }, [
        icon,
        el("div", null, [
          el("h3", { text: s.name }),
          meta ? el("p", { class: "software-meta", text: meta }) : null,
          s.description ? el("p", { class: "software-desc", text: s.description }) : null
        ]),
        href ? el("a", s.file_key
          ? { class: "pill pill-lime", href: href, download: s.file_name || true, rel: "nofollow" }
          : { class: "pill pill-lime", href: href, target: "_blank", rel: "nofollow noopener noreferrer" },
          ["Download ", el("span", { "aria-hidden": "true", text: "↓" })]) : null
      ]));
    });
  }

  function renderVideos(list) {
    var grid = $("video-grid");
    $("stat-videos").textContent = String(list.length);
    $("videos-empty").hidden = list.length > 0;
    list.forEach(function (v) {
      var img = el("img", { src: ytThumb(v.youtube_id, "hqdefault"), alt: "", loading: "lazy" });
      grid.appendChild(el("a", { class: "video-card", href: videoHref(v), target: "_blank", rel: "noopener noreferrer" }, [
        el("div", { class: "video-thumb" }, [img, el("span", { class: "play glass", text: "▶ Watch" })]),
        el("h3", { text: v.title })
      ]));
    });
  }

  function renderCarousel(data) {
    var items = [];
    data.projects.forEach(function (p) {
      if (!p.in_carousel) return;
      var key = p.carousel_key || p.cover_key;
      if (!key) return;
      items.push({ kind: "Project", title: p.title, image: fileUrl(key), href: projectHref(p), external: false, at: p.created_at });
    });
    data.videos.forEach(function (v) {
      if (!v.in_carousel) return;
      items.push({
        kind: "Video", title: v.title,
        image: v.carousel_key ? fileUrl(v.carousel_key) : ytThumb(v.youtube_id, "maxresdefault"),
        fallback: v.carousel_key ? "" : ytThumb(v.youtube_id, "hqdefault"),
        href: videoHref(v), external: true, at: v.created_at
      });
    });
    items.sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; });
    QECoverflow.mount($("coverflow"), items.slice(0, 12));
  }

  fetch("/content.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      renderSettings(data.settings || {});
      renderProjects(data.projects || []);
      renderSoftware(data.software || []);
      renderVideos(data.videos || []);
      renderCarousel({ projects: data.projects || [], videos: data.videos || [] });
    })
    .catch(function () {
      QECoverflow.mount($("coverflow"), []);
      ["projects-empty", "software-empty", "videos-empty"].forEach(function (id) { $(id).hidden = false; });
    });
})();

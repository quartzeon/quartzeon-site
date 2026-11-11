(function () {
  var el = QE.el;
  var $ = function (id) { return document.getElementById(id); };
  var slug = new URLSearchParams(location.search).get("p") || "";

  function notFound() {
    $("p-title").textContent = "Project not found";
    document.title = "Not found · Quartz Eon";
  }

  if (!slug) return notFound();

  fetch("/content.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      var p = (data.projects || []).filter(function (x) { return x.slug === slug; })[0];
      if (!p) throw new Error("not found");
      document.title = p.title + " · Quartz Eon";
      $("p-title").textContent = p.title;
      $("p-summary").textContent = p.summary || "";
      (p.tags || "").split(",").forEach(function (t) {
        t = t.trim();
        if (t) $("p-tags").appendChild(el("span", { class: "tag", text: t }));
      });
      var key = p.cover_key || p.carousel_key;
      if (key) {
        $("p-cover").appendChild(el("img", { src: QE.fileUrl(key), alt: "" }));
        $("p-cover").hidden = false;
      }
      (p.body || "").split(/\n\s*\n/).forEach(function (para) {
        if (para.trim()) $("p-body").appendChild(el("p", { text: para.trim() }));
      });
      var url = QE.safeUrl(p.url);
      if (url) { $("p-link").href = url; $("p-link").hidden = false; }
    })
    .catch(notFound);
})();

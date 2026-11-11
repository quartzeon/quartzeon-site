// Small DOM helpers shared by the public pages. Content is always set with
// textContent, never innerHTML.
(function () {
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "text") node.textContent = v;
        else if (k === "class") node.className = v;
        else node.setAttribute(k, v === true ? "" : v);
      });
    }
    (children || []).forEach(function (c) {
      if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  // Only allow http(s) links and site-relative paths.
  function safeUrl(u) {
    if (!u) return "";
    if (u.charAt(0) === "/" && u.charAt(1) !== "/") return u;
    try {
      var p = new URL(u);
      return p.protocol === "https:" || p.protocol === "http:" ? p.href : "";
    } catch (e) { return ""; }
  }

  function fileUrl(key) {
    return key ? "/files/" + key.split("/").map(encodeURIComponent).join("/") : "";
  }

  function ytThumb(id, size) {
    return "https://i.ytimg.com/vi/" + encodeURIComponent(id) + "/" + size + ".jpg";
  }

  function formatSize(bytes) {
    if (!bytes) return "";
    var units = ["B", "KB", "MB", "GB"];
    var i = 0;
    while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
    return bytes.toFixed(i ? 1 : 0) + " " + units[i];
  }

  function compact(num) {
    var n = Number(num);
    if (!isFinite(n)) return String(num || "");
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "k";
    return String(n);
  }

  window.QE = { el: el, safeUrl: safeUrl, fileUrl: fileUrl, ytThumb: ytThumb, formatSize: formatSize, compact: compact };
})();

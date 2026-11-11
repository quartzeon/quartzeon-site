// Real refraction (backdrop-filter with an SVG filter) only works in Chromium.
// Other browsers keep the plain frosted glass.
(function () {
  var brands = (navigator.userAgentData && navigator.userAgentData.brands) || [];
  var isChromium = brands.some(function (b) { return /Chromium/.test(b.brand); });
  var reduced = window.matchMedia("(prefers-reduced-transparency: reduce)").matches;
  if (isChromium && !reduced) document.documentElement.classList.add("refract");
})();

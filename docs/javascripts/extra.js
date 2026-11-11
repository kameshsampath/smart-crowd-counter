// Open external links in a new tab/window; internal site links stay in place.
document$.subscribe(function () {
  var host = window.location.hostname;
  document.querySelectorAll("a[href^='http']").forEach(function (link) {
    try {
      if (new URL(link.href).hostname !== host) {
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener noreferrer");
      }
    } catch (_) {
      // ignore malformed hrefs
    }
  });
});

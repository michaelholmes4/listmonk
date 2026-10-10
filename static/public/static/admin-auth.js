/*
 * fork: carry the admin UI's light/dark choice (web/src/composables/useTheme.ts, same origin)
 * over to the server-rendered auth pages, as `data-listmonk-theme` on <html> for admin-auth.css.
 * "auto" (or nothing saved) follows the system, live. Loaded synchronously in <head>, so no flash.
 */
(function () {
  var saved = null;
  try {
    saved = localStorage.getItem("listmonk-theme");
  } catch (e) {}
  var system = window.matchMedia("(prefers-color-scheme: dark)");
  function apply() {
    var dark = saved === "dark" || (saved !== "light" && system.matches);
    document.documentElement.setAttribute("data-listmonk-theme", dark ? "dark" : "light");
  }
  apply();
  if (system.addEventListener) system.addEventListener("change", apply);
})();

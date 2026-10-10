package main

import (
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
)

// fork: the admin UI is web/ (Vue 3 + shadcn-vue), served at /admin/* by AdminPage (the
// SPA entry for every /admin path; routing is done client side). The server-rendered login pages
// (/admin/login, /admin/forgot, ...) are registered as exact routes and win over that catch-all.
// The UI uses the session auth and the /api/* of the server.

// uriLegacyWeb is where the new UI lived while the classic one still existed at /admin. Old
// bookmarks and links to it are redirected.
const uriLegacyWeb = "/app"

// webDir is the compile-time path of the built UI. Overridable:
// -ldflags "-X main.webDir=web/dist".
var webDir = "web/dist"

// webFSFiles returns the stuffbin real_path:virtual_alias mapping for the UI when running from
// the local filesystem (no embedded assets).
func webFSFiles() []string {
	return joinFSPaths(webDir, []string{"./:" + uriAdmin})
}

// LegacyWebRedirect sends /app and /app/* to the same path under /admin.
func (a *App) LegacyWebRedirect(c echo.Context) error {
	rest := strings.TrimPrefix(c.Request().URL.Path, uriLegacyWeb)
	to := uriAdmin + rest
	if q := c.Request().URL.RawQuery; q != "" {
		to += "?" + q
	}
	return c.Redirect(http.StatusFound, to)
}

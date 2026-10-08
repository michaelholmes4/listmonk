package main

import (
	"net/http"
	"path"

	"github.com/labstack/echo/v4"
)

// librelist fork: the new admin UI (web/, Vue 3 + shadcn-vue) is a separate SPA served at /app/*
// next to the classic UI at /admin/*. It uses the same session auth and the same /api/*.

const uriWeb = "/app"

// webDir is the compile-time path of the built new UI. Overridable like frontendDir:
// -ldflags "-X main.webDir=web/dist".
var webDir = "web/dist"

// webFSFiles returns the stuffbin real_path:virtual_alias mapping for the new UI when
// running from the local filesystem (no embedded assets).
func webFSFiles() []string {
	return joinFSPaths(webDir, []string{"./:" + uriWeb})
}

// WebPage serves the SPA entrypoint for every /app/* path; routing is done client side.
func (a *App) WebPage(c echo.Context) error {
	b, err := a.fs.Read(path.Join(uriWeb, "/index.html"))
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.HTMLBlob(http.StatusOK, b)
}

package utils

import (
	"io"
	"net/http"
	"net/url"

	"github.com/labstack/echo/v4"
)

// FormValue is echo's c.FormValue plus a fallback for DELETE requests.
//
// fork: net/http parses a url-encoded body into Request.Form only for POST, PUT and
// PATCH, so a DELETE carrying `password=...` in its body (what the admin UIs send when turning
// off 2FA) was never seen by c.FormValue(). For everything else this behaves exactly like it.
func FormValue(c echo.Context, name string) string {
	r := c.Request()
	if v := c.FormValue(name); v != "" || r.Method != http.MethodDelete || r.Body == nil {
		return v
	}

	// These are tiny forms; bound the read.
	b, err := io.ReadAll(io.LimitReader(r.Body, 1<<16))
	if err != nil {
		return ""
	}
	q, err := url.ParseQuery(string(b))
	if err != nil {
		return ""
	}

	return q.Get(name)
}

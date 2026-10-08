package utils

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
)

func TestFormValueReadsDeleteBody(t *testing.T) {
	e := echo.New()

	cases := []struct {
		name, method, target, body, want string
	}{
		{"delete body", http.MethodDelete, "/x", "password=s3cret-pass", "s3cret-pass"},
		{"delete query still works", http.MethodDelete, "/x?password=q", "", "q"},
		{"delete without the field", http.MethodDelete, "/x", "other=1", ""},
		{"put body", http.MethodPut, "/x", "password=p", "p"},
		{"get ignores a body", http.MethodGet, "/x", "password=nope", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.target, strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
			c := e.NewContext(req, httptest.NewRecorder())

			if got := FormValue(c, "password"); got != tc.want {
				t.Fatalf("FormValue = %q, want %q", got, tc.want)
			}
		})
	}
}

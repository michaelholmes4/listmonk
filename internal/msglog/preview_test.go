package msglog

import (
	"strings"
	"testing"
)

func TestPreviewHTML(t *testing.T) {
	const sub = "6b0a1f2e-1111-4222-8333-444455556666"
	const camp = "00000000-0000-0000-0000-000000000000"
	body := `<p><a href="https://example.com/x">plain</a>` +
		`<a href="http://localhost:9000/link/9d8c7b6a-0000-4000-8000-000000000001/` + camp + `/` + sub + `">tracked</a>` +
		`<a href='http://localhost:9000/subscription/` + camp + `/` + sub + `'>unsubscribe</a>` +
		`<a href="http://localhost:9000/subscription/` + camp + `/` + sub + `?manage=true">manage</a>` +
		`<a href="http://localhost:9000/campaign/` + camp + `/` + sub + `">view in browser</a>` +
		`<img src="http://localhost:9000/campaign/` + camp + `/` + sub + `/px.png" alt="" /></p>`

	got := PreviewHTML(body, false)
	if strings.Contains(got, sub) {
		t.Fatalf("the subscriber's UUID survived: %s", got)
	}
	if !strings.Contains(got, `href="https://example.com/x"`) {
		t.Errorf("an ordinary link was changed: %s", got)
	}

	plain := PreviewHTML("Hi <b>there</b>", true)
	if !strings.HasPrefix(plain, "<pre") || !strings.Contains(plain, "&lt;b&gt;") {
		t.Errorf("plain text not escaped in a <pre>: %s", plain)
	}
}

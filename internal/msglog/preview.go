package msglog

import (
	"html"
	"regexp"
)

// reTrackingPixel is the view-tracking image of a campaign message.
var reTrackingPixel = regexp.MustCompile(`(?i)<img[^>]+/campaign/[^/"'\s]+/[^/"'\s]+/px\.png[^>]*>`)

// reTrackedLink is a link the email routes through listmonk: a click, an unsubscribe, the
// preferences page or the browser view. In a preview they must do nothing, as clicking one would
// record a click for the subscriber or change their subscriptions.
var reTrackedLink = regexp.MustCompile(`(?i)href\s*=\s*(?:"[^"]*` + trackedPath + `[^"]*"|'[^']*` + trackedPath + `[^']*')`)

const trackedPath = `/(?:link/[^/"'\s]+/[^/"'\s]+/[^/"'\s]+|subscription/[^/"'\s]+/[^/"'\s]+|campaign/[^/"'\s]+/[^/"'\s]+)`

// PreviewHTML makes a message safe for an admin to look at: viewing it never counts as the
// subscriber opening it, and its listmonk links lead nowhere. Plain text is escaped into a <pre>.
func PreviewHTML(body string, plain bool) string {
	body = reTrackedLink.ReplaceAllString(reTrackingPixel.ReplaceAllString(body, ""), `href="#"`)
	if plain {
		return "<pre style=\"white-space:pre-wrap;font-family:inherit\">" + html.EscapeString(body) + "</pre>"
	}
	return body
}

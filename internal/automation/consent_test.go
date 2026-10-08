package automation

import "testing"

func TestDecide(t *testing.T) {
	type c struct {
		name              string
		subscriber        string
		subscription      string
		has               bool
		optin, msg        string
		allowed           bool
		reason            Reason
		needsSubscription bool
	}
	cases := []c{
		// Blocklisted: nothing at all, either type.
		{"blocklisted marketing", "blocklisted", "confirmed", true, "single", MessageMarketing, false, ReasonBlocklisted, false},
		{"blocklisted transactional", "blocklisted", "", false, "", MessageTransactional, false, ReasonBlocklisted, false},

		// Transactional ignores topic state and the disabled flag.
		{"transactional, unsubscribed from topic", "enabled", "unsubscribed", true, "single", MessageTransactional, true, ReasonNone, false},
		{"transactional, disabled", "disabled", "", false, "", MessageTransactional, true, ReasonNone, false},

		// Marketing.
		{"marketing, confirmed", "enabled", "confirmed", true, "single", MessageMarketing, true, ReasonNone, false},
		{"marketing, unsubscribed", "enabled", "unsubscribed", true, "single", MessageMarketing, false, ReasonUnsubscribed, false},
		{"marketing, disabled subscriber", "disabled", "confirmed", true, "single", MessageMarketing, false, ReasonDisabled, false},
		{"marketing, never joined a single opt-in topic", "enabled", "", false, "single", MessageMarketing, true, ReasonNone, true},
		{"marketing, never joined a double opt-in topic", "enabled", "", false, "double", MessageMarketing, false, ReasonUnconfirmed, false},
		{"marketing, unconfirmed on double opt-in", "enabled", "unconfirmed", true, "double", MessageMarketing, false, ReasonUnconfirmed, false},
		{"marketing, unconfirmed on single opt-in", "enabled", "unconfirmed", true, "single", MessageMarketing, true, ReasonNone, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			d := decide(tc.subscriber, tc.subscription, tc.has, tc.optin, tc.msg)
			if d.Allowed != tc.allowed || d.Reason != tc.reason || d.NeedsSubscription != tc.needsSubscription {
				t.Fatalf("got %+v", d)
			}
		})
	}
}

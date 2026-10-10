package automation

import "testing"

func TestDecide(t *testing.T) {
	type c struct {
		name         string
		subscriber   string
		subscription string
		has          bool
		optin, msg   string
		allowed      bool
		reason       Reason
	}
	cases := []c{
		// Blocklisted: nothing at all, either type.
		{"blocklisted marketing", "blocklisted", "confirmed", true, "single", MessageMarketing, false, ReasonBlocklisted},
		{"blocklisted transactional", "blocklisted", "", false, "", MessageTransactional, false, ReasonBlocklisted},

		// Transactional ignores topic state and the disabled flag.
		{"transactional, unsubscribed from topic", "enabled", "unsubscribed", true, "single", MessageTransactional, true, ReasonNone},
		{"transactional, disabled", "disabled", "", false, "", MessageTransactional, true, ReasonNone},

		// Marketing.
		{"marketing, confirmed", "enabled", "confirmed", true, "single", MessageMarketing, true, ReasonNone},
		{"marketing, unsubscribed", "enabled", "unsubscribed", true, "single", MessageMarketing, false, ReasonUnsubscribed},
		{"marketing, disabled subscriber", "disabled", "confirmed", true, "single", MessageMarketing, false, ReasonDisabled},
		{"marketing, not on a single opt-in topic", "enabled", "", false, "single", MessageMarketing, false, ReasonNotSubscribed},
		{"marketing, not on a double opt-in topic", "enabled", "", false, "double", MessageMarketing, false, ReasonNotSubscribed},
		{"marketing, unconfirmed on double opt-in", "enabled", "unconfirmed", true, "double", MessageMarketing, false, ReasonUnconfirmed},
		{"marketing, unconfirmed on single opt-in", "enabled", "unconfirmed", true, "single", MessageMarketing, true, ReasonNone},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			d := decide(tc.subscriber, tc.subscription, tc.has, tc.optin, tc.msg)
			if d.Allowed != tc.allowed || d.Reason != tc.reason {
				t.Fatalf("got %+v", d)
			}
		})
	}
}

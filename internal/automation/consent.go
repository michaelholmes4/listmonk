package automation

import (
	"context"
	"database/sql"
	"errors"

	"github.com/jmoiron/sqlx"
)

// Reason a message was refused.
type Reason string

const (
	ReasonNone         Reason = ""
	ReasonNoSubscriber Reason = "no_subscriber"
	ReasonBlocklisted  Reason = "blocklisted"
	ReasonDisabled     Reason = "disabled"
	ReasonUnsubscribed Reason = "unsubscribed"
	// ReasonUnconfirmed: the topic is a double opt-in list and they have not confirmed.
	ReasonUnconfirmed Reason = "unconfirmed"
	// ReasonNotSubscribed: they are not on the topic list at all.
	ReasonNotSubscribed Reason = "not_subscribed"
)

// Decision is the answer to "may this message go to this subscriber?".
type Decision struct {
	Allowed bool
	Reason  Reason
}

// Consent applies the sending rules, using what listmonk already stores rather than anything new:
//
//   - A blocklisted subscriber receives nothing, of either type. That is the suppression list.
//   - A transactional message otherwise goes out: it is not subject to topic opt-outs.
//   - A marketing message needs an enabled subscriber with a live subscription to the topic list:
//     confirmed, or unconfirmed on a single opt-in list. Someone with no subscription gets nothing:
//     listmonk deletes the row when someone is removed from a list, so "never joined" and "was
//     taken off" look the same. An automation that mails new contacts adds them to the topic first.
//
// Note that this is the automation engine's rule. `POST /api/tx` keeps its upstream behaviour and
// does not look at the blocklist.
func Consent(ctx context.Context, q sqlx.QueryerContext, queries Queries, subscriberID int, messageType string, listID int) (Decision, error) {
	var row struct {
		SubscriberStatus   string         `db:"subscriber_status"`
		SubscriptionStatus sql.NullString `db:"subscription_status"`
		ListOptin          sql.NullString `db:"list_optin"`
	}
	if err := sqlx.GetContext(ctx, q, &row, queries.get("consent"), subscriberID, nilIfZero(listID)); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Decision{Reason: ReasonNoSubscriber}, nil
		}
		return Decision{}, err
	}
	return decide(row.SubscriberStatus, row.SubscriptionStatus.String, row.SubscriptionStatus.Valid, row.ListOptin.String, messageType), nil
}

// decide is the pure rule, separated so it can be tested exhaustively without a database.
func decide(subscriber, subscription string, hasSubscription bool, optin, messageType string) Decision {
	if subscriber == "blocklisted" {
		return Decision{Reason: ReasonBlocklisted}
	}
	if messageType == MessageTransactional {
		return Decision{Allowed: true}
	}
	if subscriber != "enabled" {
		return Decision{Reason: ReasonDisabled}
	}
	switch {
	case !hasSubscription:
		return Decision{Reason: ReasonNotSubscribed}
	case subscription == "unsubscribed":
		return Decision{Reason: ReasonUnsubscribed}
	case subscription == "unconfirmed" && optin == "double":
		return Decision{Reason: ReasonUnconfirmed}
	}
	return Decision{Allowed: true}
}

func nilIfZero(n int) any {
	if n == 0 {
		return nil
	}
	return n
}

// Package msglog records every email handed to a messenger (the message log): who it was for,
// what it was, and whether the messenger accepted it. It wraps messengers rather than hooking
// each send site, so it sees campaigns, transactional mail and system mail alike.
package msglog

import (
	"encoding/json"
	"time"

	"github.com/lib/pq"
)

// Sources of a message.
const (
	SourceCampaign     = "campaign"
	SourceAutomation   = "automation"
	SourceTx           = "tx"
	SourceNotification = "notification"
	SourceSystem       = "system"
)

// Statuses of a message. "bounced" exists only as a filter: it is a sent message that later bounced.
const (
	StatusSent    = "sent"
	StatusFailed  = "failed"
	StatusBounced = "bounced"
)

// Entry is one message to be recorded.
type Entry struct {
	CreatedAt    time.Time
	Source       string
	Messenger    string
	Status       string
	Error        string
	SubscriberID int
	CampaignID   int
	AutomationID int
	EnrollmentID int64
	From         string
	To           []string
	Subject      string
	MessageID    string
	ContentType  string
	// Body and AltBody are nil when the content is not kept (campaign and system mail).
	Body        *string
	AltBody     *string
	Headers     json.RawMessage
	Attachments json.RawMessage
}

// Row is a message as listed. It carries no content.
type Row struct {
	ID             int64          `db:"id" json:"id"`
	CreatedAt      time.Time      `db:"created_at" json:"created_at"`
	Source         string         `db:"source" json:"source"`
	Messenger      string         `db:"messenger" json:"messenger"`
	Status         string         `db:"status" json:"status"`
	Error          string         `db:"error" json:"error"`
	SubscriberID   *int           `db:"subscriber_id" json:"subscriber_id"`
	CampaignID     *int           `db:"campaign_id" json:"campaign_id"`
	CampaignName   string         `db:"campaign_name" json:"campaign_name"`
	AutomationID   *int           `db:"automation_id" json:"automation_id"`
	AutomationName string         `db:"automation_name" json:"automation_name"`
	EnrollmentID   *int64         `db:"enrollment_id" json:"enrollment_id"`
	From           string         `db:"from_email" json:"from"`
	To             pq.StringArray `db:"to_email" json:"to"`
	Subject        string         `db:"subject" json:"subject"`
	MessageID      string         `db:"message_id" json:"message_id"`
	ContentType    string         `db:"content_type" json:"content_type"`
	HasBody        bool           `db:"has_body" json:"has_body"`
	// Bounced, Opened and Clicked are only known for campaign mail (matched on subscriber and
	// campaign); opened and clicked also need individual tracking to be on.
	Bounced bool `db:"bounced" json:"bounced"`
	Opened  bool `db:"opened" json:"opened"`
	Clicked bool `db:"clicked" json:"clicked"`
}

// Detail is one message with its content.
type Detail struct {
	Row
	Body        *string         `db:"body" json:"body"`
	AltBody     *string         `db:"alt_body" json:"alt_body"`
	Headers     json.RawMessage `db:"headers" json:"headers"`
	Attachments json.RawMessage `db:"attachments" json:"attachments"`
}

// Filter narrows a listing. Zero values mean "any".
type Filter struct {
	Search       string
	Status       string
	Source       string
	SubscriberID int
	CampaignID   int
	AutomationID int
	Since, Until time.Time
	Ascending    bool
	Offset       int
	Limit        int
}

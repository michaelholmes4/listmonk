// Package automation is librelist's marketing automation engine: triggers enroll subscribers
// into versioned step graphs (send, delay, condition, ...) that a job queue (River) advances.
//
// Email steps reuse what listmonk already has: content, templates and open/click tracking live
// in a hidden campaign per step (campaigns.type = 'automation'), lists are the consent topics,
// and a blocklisted subscriber is suppressed everywhere.
package automation

import (
	"encoding/json"
	"time"
)

// Status of an automation.
type Status string

const (
	StatusDraft    Status = "draft"
	StatusActive   Status = "active"
	StatusPaused   Status = "paused"
	StatusArchived Status = "archived"
)

// Automation is the stable identity; what it does lives in its versions.
type Automation struct {
	ID               int             `db:"id" json:"id"`
	UUID             string          `db:"uuid" json:"uuid"`
	Name             string          `db:"name" json:"name"`
	Status           Status          `db:"status" json:"status"`
	CurrentVersionID *int            `db:"current_version_id" json:"current_version_id"`
	Settings         json.RawMessage `db:"settings" json:"settings"`
	CreatedAt        time.Time       `db:"created_at" json:"created_at"`
	UpdatedAt        time.Time       `db:"updated_at" json:"updated_at"`

	// Filled on read.
	Version *Version `db:"-" json:"version,omitempty"`
	Counts  *Counts  `db:"-" json:"counts,omitempty"`
}

// Counts summarises enrollments for list views.
type Counts struct {
	Active    int `db:"active" json:"active"`
	Waiting   int `db:"waiting" json:"waiting"`
	Completed int `db:"completed" json:"completed"`
	Exited    int `db:"exited" json:"exited"`
	Failed    int `db:"failed" json:"failed"`
}

// Version is one immutable (once published) graph of an automation.
type Version struct {
	ID           int             `db:"id" json:"id"`
	AutomationID int             `db:"automation_id" json:"automation_id"`
	Version      int             `db:"version" json:"version"`
	Graph        json.RawMessage `db:"graph" json:"graph"`
	PublishedAt  *time.Time      `db:"published_at" json:"published_at"`
	CreatedAt    time.Time       `db:"created_at" json:"created_at"`
}

// Settings are the automation-wide rules.
type Settings struct {
	Reentry    Reentry     `json:"reentry"`
	SendWindow *SendWindow `json:"send_window,omitempty"`
	// Timezone is the fallback for subscribers with no `attribs.timezone`. Empty means UTC.
	Timezone string `json:"timezone,omitempty"`
	// Goal, when true for a subscriber at any pause, ends their enrollment as `goal_reached`.
	Goal *Rule `json:"goal,omitempty"`
}

// Reentry decides whether a subscriber who finished (or left) can enter again.
type Reentry struct {
	// "once" (default): never again. "always": any time they're not already inside.
	// "interval": again once `Interval` has passed since their last entry.
	Mode     string `json:"mode"`
	Interval string `json:"interval,omitempty"`
}

// SendWindow limits email steps to certain days and hours in the subscriber's timezone.
type SendWindow struct {
	// Days of the week, 0 = Sunday. Empty means every day.
	Days []int `json:"days,omitempty"`
	// Start and End are "HH:MM", End exclusive. Both empty means all day.
	Start string `json:"start,omitempty"`
	End   string `json:"end,omitempty"`
}

// Trigger types.
const (
	TriggerListJoined       = "list_joined"
	TriggerAttributeChanged = "attribute_changed"
	TriggerEvent            = "event"
	TriggerManual           = "manual"
)

// Trigger starts enrollments.
type Trigger struct {
	ID     string          `json:"id"`
	Type   string          `json:"type"`
	Config json.RawMessage `json:"config"`
}

// TriggerConfig is the union of the trigger types' options.
type TriggerConfig struct {
	// list_joined
	ListID int `json:"list_id,omitempty"`
	// attribute_changed
	Attribute string `json:"attribute,omitempty"`
	// Optional: only when the new value equals this.
	Equals *json.RawMessage `json:"equals,omitempty"`
	// event
	Event string `json:"event,omitempty"`
}

// Node types.
const (
	NodeSendEmail       = "send_email"
	NodeDelay           = "delay"
	NodeWaitUntil       = "wait_until"
	NodeWaitForEvent    = "wait_for_event"
	NodeCondition       = "condition"
	NodeUpdateAttribute = "update_attribute"
	NodeAddToList       = "add_to_list"
	NodeRemoveFromList  = "remove_from_list"
	NodeGoTo            = "go_to"
	NodeExit            = "exit"
)

// Handles of a condition's outgoing edges.
const (
	HandleYes = "yes"
	HandleNo  = "no"
)

// HandleTimeout is the path a wait_for_event takes when no event arrives in time.
const HandleTimeout = "timeout"

// Node is one step.
type Node struct {
	ID     string          `json:"id"`
	Type   string          `json:"type"`
	Config json.RawMessage `json:"config,omitempty"`
}

// Edge connects a node to the next one. Conditions (yes/no) and wait_for_event steps (an event id, or timeout) use Handle.
type Edge struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Handle string `json:"handle,omitempty"`
}

// Graph is what a version holds: the triggers, the steps, and how they connect. The edges form a
// tree; a go_to step adds jumps outside it, held in its config rather than as edges.
type Graph struct {
	Triggers []Trigger `json:"triggers"`
	Nodes    []Node    `json:"nodes"`
	Edges    []Edge    `json:"edges"`
	// Root is the first node after the trigger.
	Root string `json:"root"`
}

// Message types of a send step.
const (
	MessageMarketing     = "marketing"
	MessageTransactional = "transactional"
)

// GoToConfig configures a go_to node: the run continues at Target.
type GoToConfig struct {
	Target string `json:"target"`
	// MaxRuns is how many times one run may pass through this step; 0 means defaultGoToRuns.
	MaxRuns int `json:"max_runs,omitempty"`
}

const (
	defaultGoToRuns = 25
	maxGoToRunsCap  = 100
)

// SendEmailConfig configures a send_email node.
type SendEmailConfig struct {
	// MessageType decides which consent rules apply.
	MessageType string `json:"message_type"`
	// ListID is the topic: a marketing send is refused to someone unsubscribed from it, and the
	// unsubscribe link is scoped to it.
	ListID int `json:"list_id,omitempty"`
	// Exactly one of these: the hidden campaign that holds this step's content, or a tx template.
	CampaignID int `json:"campaign_id,omitempty"`
	TemplateID int `json:"template_id,omitempty"`
}

// DelayConfig configures a delay node: "30m", "2h", "3d", "1w".
type DelayConfig struct {
	Duration string `json:"duration"`
}

// WaitUntilConfig waits for a moment: a fixed time, or a date held in a subscriber attribute,
// optionally shifted ("-3d" is three days before).
type WaitUntilConfig struct {
	At        *time.Time `json:"at,omitempty"`
	Attribute string     `json:"attribute,omitempty"`
	Offset    string     `json:"offset,omitempty"`
}

// WaitForEventConfig configures a wait_for_event node.
type WaitForEventConfig struct {
	// Timeout is the longest it waits: "30m", "1h", "3d".
	Timeout string      `json:"timeout"`
	Events  []WaitEvent `json:"events"`
}

// WaitEvent is one event a wait_for_event watches for. Its ID is the handle of its path.
type WaitEvent struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Restart starts the wait again (with this event as the run's event data) instead of taking a path.
	Restart bool `json:"restart,omitempty"`
}

// ConditionConfig configures a condition node.
type ConditionConfig struct {
	Rule Rule `json:"rule"`
}

// UpdateAttributeConfig sets or removes a subscriber attribute.
type UpdateAttributeConfig struct {
	Attribute string          `json:"attribute"`
	Value     json.RawMessage `json:"value,omitempty"`
	Unset     bool            `json:"unset,omitempty"`
}

// ListConfig configures add_to_list and remove_from_list.
type ListConfig struct {
	ListID int `json:"list_id"`
	// add_to_list: the subscription status; default "confirmed" for single opt-in lists and
	// "unconfirmed" for double opt-in ones.
	Status string `json:"status,omitempty"`
}

// ExitConfig configures an exit node.
type ExitConfig struct {
	Reason string `json:"reason,omitempty"`
}

// Enrollment states.
type EnrollmentStatus string

const (
	EnrollmentActive    EnrollmentStatus = "active"
	EnrollmentWaiting   EnrollmentStatus = "waiting"
	EnrollmentCompleted EnrollmentStatus = "completed"
	EnrollmentExited    EnrollmentStatus = "exited"
	EnrollmentFailed    EnrollmentStatus = "failed"
)

// Exit reasons the engine itself records.
const (
	ExitCompleted    = "completed"
	ExitUnsubscribed = "unsubscribed"
	ExitBlocklisted  = "blocklisted"
	ExitGoalReached  = "goal_reached"
	ExitArchived     = "archived"
	ExitPaused       = "paused"
	ExitNode         = "exit_step"
	ExitLoopLimit    = "loop_limit"
)

// Enrollment is one subscriber's run through one version.
type Enrollment struct {
	ID           int64            `db:"id" json:"id"`
	AutomationID int              `db:"automation_id" json:"automation_id"`
	VersionID    int              `db:"version_id" json:"version_id"`
	SubscriberID int              `db:"subscriber_id" json:"subscriber_id"`
	Status       EnrollmentStatus `db:"status" json:"status"`
	CurrentNode  *string          `db:"current_node_id" json:"current_node_id"`
	NextRunAt    *time.Time       `db:"next_run_at" json:"next_run_at"`
	Context      json.RawMessage  `db:"context" json:"context"`
	EnteredAt    time.Time        `db:"entered_at" json:"entered_at"`
	ExitedAt     *time.Time       `db:"exited_at" json:"exited_at"`
	ExitReason   *string          `db:"exit_reason" json:"exit_reason"`
	// CurrentVisit counts how many times the run has arrived at CurrentNode, from 1.
	CurrentVisit int `db:"current_visit" json:"current_visit"`
}

// StepStatus of a node run for an enrollment.
const (
	StepWaiting = "waiting"
	StepSending = "sending"
	StepDone    = "done"
	StepSkipped = "skipped"
	StepFailed  = "failed"
)

// Step is the record of a node having run for an enrollment.
type Step struct {
	ID           int64           `db:"id" json:"id"`
	EnrollmentID int64           `db:"enrollment_id" json:"enrollment_id"`
	NodeID       string          `db:"node_id" json:"node_id"`
	Status       string          `db:"status" json:"status"`
	StartedAt    time.Time       `db:"started_at" json:"started_at"`
	FinishedAt   *time.Time      `db:"finished_at" json:"finished_at"`
	Result       json.RawMessage `db:"result" json:"result"`
	Error        *string         `db:"error" json:"error"`
	// Visit is which arrival at the node this row belongs to, from 1.
	Visit int `db:"visit" json:"visit"`
}

// Event is something that happened to a subscriber.
type Event struct {
	ID             int64           `db:"id" json:"id"`
	SubscriberID   int             `db:"subscriber_id" json:"subscriber_id"`
	Name           string          `db:"name" json:"name"`
	Properties     json.RawMessage `db:"properties" json:"properties"`
	IdempotencyKey *string         `db:"idempotency_key" json:"idempotency_key,omitempty"`
	OccurredAt     time.Time       `db:"occurred_at" json:"occurred_at"`
	CreatedAt      time.Time       `db:"created_at" json:"created_at"`
}

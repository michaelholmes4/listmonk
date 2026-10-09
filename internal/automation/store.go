package automation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

// Errors callers map to HTTP statuses.
var (
	ErrNotFound = errors.New("not found")
	ErrInvalid  = errors.New("invalid")
	ErrConflict = errors.New("conflict")
)

// InvalidError carries what is wrong so an API can return all of it at once.
type InvalidError struct{ Problems []Problem }

func (e *InvalidError) Error() string {
	var s []string
	for _, p := range e.Problems {
		s = append(s, p.Error())
	}
	return "invalid automation: " + strings.Join(s, "; ")
}
func (e *InvalidError) Unwrap() error { return ErrInvalid }

// Store reads and writes automations, their versions and triggers.
type Store struct {
	db *sqlx.DB
	q  Queries
}

// NewStore returns a Store over the given database.
func NewStore(db *sqlx.DB, q Queries) *Store { return &Store{db: db, q: q} }

// DB exposes the connection (the engine runs its transactions on it).
func (s *Store) DB() *sqlx.DB { return s.db }

func notFound(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

// Row is an automation as listed, with its enrollment counts.
type Row struct {
	Automation
	Total int `db:"total" json:"-"`
	Counts
}

// ListOpts filters and pages a listing.
type ListOpts struct {
	Query    string
	Statuses []Status
	// Manual keeps only those whose published version people can be added to by hand.
	Manual  bool
	OrderBy string // name | status | created_at | updated_at
	Order   string // asc | desc
	Page    int
	PerPage int // 0 = all
}

// List returns automations and the total matching.
func (s *Store) List(ctx context.Context, o ListOpts) ([]Row, int, error) {
	by := map[string]string{"name": "a.name", "status": "a.status", "created_at": "a.created_at", "updated_at": "a.updated_at"}[o.OrderBy]
	if by == "" {
		by = "a.updated_at"
	}
	dir := "DESC"
	if strings.EqualFold(o.Order, "asc") {
		dir = "ASC"
	}
	query := strings.Replace(s.q.get("list-automations"), "%order%", by+" "+dir+", a.id "+dir, 1)

	var statuses any
	if len(o.Statuses) > 0 {
		ss := make([]string, len(o.Statuses))
		for i, st := range o.Statuses {
			ss[i] = string(st)
		}
		statuses = "{" + strings.Join(ss, ",") + "}"
	}

	offset := 0
	if o.PerPage > 0 && o.Page > 1 {
		offset = (o.Page - 1) * o.PerPage
	}
	var rows []Row
	if err := s.db.SelectContext(ctx, &rows, query, o.Query, statuses, offset, o.PerPage, o.Manual); err != nil {
		return nil, 0, err
	}
	total := 0
	for i := range rows {
		total = rows[i].Total
		c := rows[i].Counts
		rows[i].Automation.Counts = &c
	}
	return rows, total, nil
}

// Create makes an automation with an empty draft.
func (s *Store) Create(ctx context.Context, name string, settings Settings) (*Automation, error) {
	name = strings.TrimSpace(name)
	if name == "" || len(name) > 200 {
		return nil, &InvalidError{[]Problem{{Message: "name is required (up to 200 characters)"}}}
	}
	if ps := settings.Validate(ValidateOpts{}); len(ps) > 0 {
		return nil, &InvalidError{ps}
	}
	raw, _ := json.Marshal(settings)

	tx, err := s.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	var a Automation
	if err := tx.GetContext(ctx, &a, s.q.get("insert-automation"), uuid.NewString(), name, raw); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, s.q.get("insert-version"), a.ID, []byte(`{"triggers":[],"nodes":[],"edges":[],"root":""}`)); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return s.Get(ctx, a.ID)
}

// Get returns an automation with its draft (if any) and published version attached.
func (s *Store) Get(ctx context.Context, id int) (*Automation, error) {
	var a Automation
	if err := s.db.GetContext(ctx, &a, s.q.get("get-automation"), id); err != nil {
		return nil, notFound(err)
	}
	return &a, nil
}

// HasTrigger reports whether an automation's published version has a trigger of this type.
func (s *Store) HasTrigger(ctx context.Context, id int, typ string) (bool, error) {
	var ok bool
	err := s.db.GetContext(ctx, &ok, s.q.get("has-trigger"), id, typ)
	return ok, err
}

// Update changes the name and settings.
func (s *Store) Update(ctx context.Context, id int, name string, settings Settings, allowSQL bool) (*Automation, error) {
	name = strings.TrimSpace(name)
	if name == "" || len(name) > 200 {
		return nil, &InvalidError{[]Problem{{Message: "name is required (up to 200 characters)"}}}
	}
	if ps := settings.Validate(ValidateOpts{AllowSQL: allowSQL}); len(ps) > 0 {
		return nil, &InvalidError{ps}
	}
	raw, _ := json.Marshal(settings)
	var a Automation
	if err := s.db.GetContext(ctx, &a, s.q.get("update-automation"), id, name, raw); err != nil {
		return nil, notFound(err)
	}
	return &a, nil
}

// Delete removes an automation that is not live (a draft, or archived).
func (s *Store) Delete(ctx context.Context, id int) error {
	a, err := s.Get(ctx, id)
	if err != nil {
		return err
	}
	if a.Status != StatusDraft && a.Status != StatusArchived {
		return fmt.Errorf("%w: archive an automation before deleting it", ErrConflict)
	}
	_, err = s.db.ExecContext(ctx, s.q.get("delete-automation"), id)
	return err
}

// Draft returns the editable version, creating one (a copy of the published graph) if none exists.
func (s *Store) Draft(ctx context.Context, automationID int) (*Version, error) {
	var v Version
	err := s.db.GetContext(ctx, &v, s.q.get("get-draft"), automationID)
	if err == nil {
		return &v, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	a, err := s.Get(ctx, automationID)
	if err != nil {
		return nil, err
	}
	graph := json.RawMessage(`{"triggers":[],"nodes":[],"edges":[],"root":""}`)
	if a.CurrentVersionID != nil {
		cur, err := s.Version(ctx, *a.CurrentVersionID)
		if err != nil {
			return nil, err
		}
		graph = cur.Graph
	}
	if err := s.db.GetContext(ctx, &v, s.q.get("insert-version"), automationID, []byte(graph)); err != nil {
		return nil, err
	}
	return &v, nil
}

// Version returns one version.
func (s *Store) Version(ctx context.Context, id int) (*Version, error) {
	var v Version
	if err := s.db.GetContext(ctx, &v, s.q.get("get-version"), id); err != nil {
		return nil, notFound(err)
	}
	return &v, nil
}

// Versions lists an automation's versions, newest first.
func (s *Store) Versions(ctx context.Context, automationID int) ([]Version, error) {
	var vs []Version
	if err := s.db.SelectContext(ctx, &vs, s.q.get("list-versions"), automationID); err != nil {
		return nil, err
	}
	return vs, nil
}

// SaveDraft stores the graph as the draft. A draft may be incomplete, but must be structurally
// sound enough to read; completeness is checked on publish.
func (s *Store) SaveDraft(ctx context.Context, automationID int, graph *Graph, allowSQL bool) (*Version, []Problem, error) {
	if graph.Triggers == nil {
		graph.Triggers = []Trigger{}
	}
	if graph.Nodes == nil {
		graph.Nodes = []Node{}
	}
	if graph.Edges == nil {
		graph.Edges = []Edge{}
	}
	problems := graph.Validate(ValidateOpts{AllowSQL: allowSQL})
	if err := s.syncStepCampaigns(ctx, graph); err != nil {
		return nil, nil, err
	}

	draft, err := s.Draft(ctx, automationID)
	if err != nil {
		return nil, nil, err
	}
	raw, err := json.Marshal(graph)
	if err != nil {
		return nil, nil, err
	}
	var v Version
	if err := s.db.GetContext(ctx, &v, s.q.get("update-draft"), draft.ID, raw); err != nil {
		return nil, nil, notFound(err)
	}
	return &v, problems, nil
}

// Publish freezes the draft, makes it the version new enrollments use, and points the triggers
// at it. A paused automation stays paused; a draft becomes active.
func (s *Store) Publish(ctx context.Context, automationID int, allowSQL bool) (*Automation, *Version, error) {
	a, err := s.Get(ctx, automationID)
	if err != nil {
		return nil, nil, err
	}
	if a.Status == StatusArchived {
		return nil, nil, fmt.Errorf("%w: an archived automation cannot be published", ErrConflict)
	}
	draft, err := s.Draft(ctx, automationID)
	if err != nil {
		return nil, nil, err
	}
	g, err := ParseGraph(draft.Graph)
	if err != nil {
		return nil, nil, &InvalidError{[]Problem{{Message: err.Error()}}}
	}
	settings, err := ParseSettings(a.Settings)
	if err != nil {
		return nil, nil, &InvalidError{[]Problem{{Message: err.Error()}}}
	}
	problems := append(g.Validate(ValidateOpts{Publish: true, AllowSQL: allowSQL}), settings.Validate(ValidateOpts{AllowSQL: allowSQL})...)
	if len(problems) > 0 {
		return nil, nil, &InvalidError{problems}
	}

	tx, err := s.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback()

	var v Version
	if err := tx.GetContext(ctx, &v, s.q.get("publish-version"), draft.ID); err != nil {
		return nil, nil, notFound(err)
	}
	if _, err := tx.ExecContext(ctx, s.q.get("set-current-version"), automationID, v.ID); err != nil {
		return nil, nil, err
	}
	if _, err := tx.ExecContext(ctx, s.q.get("delete-triggers"), automationID); err != nil {
		return nil, nil, err
	}
	for _, t := range g.Triggers {
		cfg := t.Config
		if len(cfg) == 0 {
			cfg = json.RawMessage(`{}`)
		}
		if _, err := tx.ExecContext(ctx, s.q.get("insert-trigger"), automationID, v.ID, t.Type, []byte(cfg)); err != nil {
			return nil, nil, err
		}
	}
	status := a.Status
	if status == StatusDraft {
		status = StatusActive
	}
	if _, err := tx.ExecContext(ctx, s.q.get("set-automation-status"), automationID, status); err != nil {
		return nil, nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, nil, err
	}

	out, err := s.Get(ctx, automationID)
	return out, &v, err
}

// SetStatus moves between active and paused (the engine handles the consequences). Archiving goes
// through Engine.Archive so live enrollments are ended.
func (s *Store) SetStatus(ctx context.Context, id int, status Status) (*Automation, error) {
	var a Automation
	if err := s.db.GetContext(ctx, &a, s.q.get("set-automation-status"), id, status); err != nil {
		return nil, notFound(err)
	}
	return &a, nil
}

// StepCampaign describes the hidden campaign that holds an email step's content.
type StepCampaign struct {
	Name        string
	Subject     string
	FromEmail   string
	Messenger   string
	ContentType string
	Body        string
	TemplateID  int // 0: the default campaign template
	ListID      int // the topic, linked so unsubscribing records an opt-out
}

// CreateStepCampaign makes the hidden campaign behind a new email step and returns its ID. It is
// edited afterwards with the ordinary campaign editor.
func (s *Store) CreateStepCampaign(ctx context.Context, p StepCampaign) (int, error) {
	if p.ContentType == "" {
		p.ContentType = "richtext"
	}
	if p.Messenger == "" {
		p.Messenger = "email"
	}
	if p.Subject == "" {
		p.Subject = p.Name
	}
	tx, err := s.db.BeginTxx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	var tpl any
	if p.TemplateID > 0 {
		tpl = p.TemplateID
	} else {
		var id int
		if err := tx.GetContext(ctx, &id, s.q.get("default-template")); err == nil {
			tpl = id
		}
	}
	var id int
	if err := tx.GetContext(ctx, &id, s.q.get("insert-step-campaign"), uuid.NewString(), p.Name, p.Subject, p.FromEmail, p.Body, p.ContentType, p.Messenger, tpl); err != nil {
		return 0, err
	}
	if p.ListID > 0 {
		if _, err := tx.ExecContext(ctx, s.q.get("set-campaign-list"), id, p.ListID); err != nil {
			return 0, err
		}
	}
	return id, tx.Commit()
}

// syncStepCampaigns checks that every email step points at a hidden automation campaign (never an
// ordinary campaign, which it could otherwise hijack) and links each to its topic list (marketing
// emails only).
func (s *Store) syncStepCampaigns(ctx context.Context, g *Graph) error {
	var ids []int
	topic := map[int]int{}
	for _, n := range g.Nodes {
		if n.Type != NodeSendEmail {
			continue
		}
		var c SendEmailConfig
		if json.Unmarshal(n.Config, &c) != nil || c.CampaignID == 0 {
			continue
		}
		ids = append(ids, c.CampaignID)
		// A transactional email has no topic: its unsubscribe link would take people off a list
		// that never stopped it.
		if c.MessageType == MessageMarketing {
			topic[c.CampaignID] = c.ListID
		} else {
			topic[c.CampaignID] = 0
		}
	}
	if len(ids) == 0 {
		return nil
	}

	var ok []int
	if err := s.db.SelectContext(ctx, &ok, s.q.get("step-campaigns"), pqIntArray(ids)); err != nil {
		return err
	}
	good := map[int]bool{}
	for _, id := range ok {
		good[id] = true
	}
	var problems []Problem
	for _, n := range g.Nodes {
		var c SendEmailConfig
		if n.Type == NodeSendEmail && json.Unmarshal(n.Config, &c) == nil && c.CampaignID > 0 && !good[c.CampaignID] {
			problems = append(problems, Problem{NodeID: n.ID, Message: "its content does not exist (or is not an automation email)"})
		}
	}
	if len(problems) > 0 {
		return &InvalidError{problems}
	}

	tx, err := s.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for camp, list := range topic {
		if _, err := tx.ExecContext(ctx, s.q.get("clear-campaign-lists"), camp); err != nil {
			return err
		}
		if list > 0 {
			if _, err := tx.ExecContext(ctx, s.q.get("set-campaign-list"), camp, list); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

// EnrollmentRow is an enrollment as listed, with who it is.
type EnrollmentRow struct {
	Enrollment
	Email          string `db:"email" json:"email"`
	SubscriberName string `db:"subscriber_name" json:"subscriber_name"`
	Total          int    `db:"total" json:"-"`
}

// Enrollments lists an automation's enrollments, newest first.
func (s *Store) Enrollments(ctx context.Context, automationID int, statuses []EnrollmentStatus, search string, page, perPage int) ([]EnrollmentRow, int, error) {
	var st any
	if len(statuses) > 0 {
		ss := make([]string, len(statuses))
		for i, x := range statuses {
			ss[i] = string(x)
		}
		st = "{" + strings.Join(ss, ",") + "}"
	}
	offset := 0
	if perPage > 0 && page > 1 {
		offset = (page - 1) * perPage
	}
	var rows []EnrollmentRow
	if err := s.db.SelectContext(ctx, &rows, s.q.get("list-enrollments"), automationID, st, search, offset, perPage); err != nil {
		return nil, 0, err
	}
	total := 0
	if len(rows) > 0 {
		total = rows[0].Total
	}
	return rows, total, nil
}

// Steps returns what an enrollment has run, in order.
func (s *Store) Steps(ctx context.Context, enrollmentID int64) ([]Step, error) {
	var out []Step
	if err := s.db.SelectContext(ctx, &out, s.q.get("list-steps"), enrollmentID); err != nil {
		return nil, err
	}
	return out, nil
}

// NodeStat counts how an automation's enrollments have fared at one step.
type NodeStat struct {
	NodeID  string `db:"node_id" json:"node_id"`
	Entered int    `db:"entered" json:"entered"`
	Done    int    `db:"done" json:"done"`
	Skipped int    `db:"skipped" json:"skipped"`
	Failed  int    `db:"failed" json:"failed"`
	Waiting int    `db:"waiting" json:"waiting"`
}

// NodeStats returns per-step counts.
func (s *Store) NodeStats(ctx context.Context, automationID int) ([]NodeStat, error) {
	var out []NodeStat
	if err := s.db.SelectContext(ctx, &out, s.q.get("node-stats"), automationID); err != nil {
		return nil, err
	}
	return out, nil
}

// SubscriberEnrollment is one automation a subscriber has been in.
type SubscriberEnrollment struct {
	Enrollment
	AutomationName string `db:"automation_name" json:"automation_name"`
}

// SubscriberEnrollments lists every automation a subscriber has entered.
func (s *Store) SubscriberEnrollments(ctx context.Context, subscriberID int) ([]SubscriberEnrollment, error) {
	var out []SubscriberEnrollment
	if err := s.db.SelectContext(ctx, &out, s.q.get("list-subscriber-enrollments"), subscriberID); err != nil {
		return nil, err
	}
	return out, nil
}

// RecordEvent stores an event. It reports false (and no event) when the idempotency key was used
// before, which is how a retried request is told apart from a new one.
func (s *Store) RecordEvent(ctx context.Context, subscriberID int, name string, properties json.RawMessage, key string, at time.Time) (*Event, bool, error) {
	if len(properties) == 0 {
		properties = json.RawMessage(`{}`)
	}
	var k any
	if key != "" {
		k = key
	}
	var ev Event
	if err := s.db.GetContext(ctx, &ev, s.q.get("insert-event"), subscriberID, name, []byte(properties), k, at); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, false, nil
		}
		return nil, false, err
	}
	return &ev, true, nil
}

// EventRow is an event with the total, for paging.
type EventRow struct {
	Event
	Total int `db:"total" json:"-"`
}

// Events lists a subscriber's events, newest first.
func (s *Store) Events(ctx context.Context, subscriberID, page, perPage int) ([]Event, int, error) {
	offset := 0
	if perPage > 0 && page > 1 {
		offset = (page - 1) * perPage
	}
	var rows []EventRow
	if err := s.db.SelectContext(ctx, &rows, s.q.get("list-events"), subscriberID, offset, perPage); err != nil {
		return nil, 0, err
	}
	out := make([]Event, len(rows))
	total := 0
	for i, r := range rows {
		out[i], total = r.Event, r.Total
	}
	return out, total, nil
}

// DeleteEventsBefore removes old events (the maintenance cleanup).
func (s *Store) DeleteEventsBefore(ctx context.Context, before time.Time) (int64, error) {
	res, err := s.db.ExecContext(ctx, s.q.get("delete-old-events"), before)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// SubscriberIDsOnList pages through the confirmed, enabled members of a list.
func (s *Store) SubscriberIDsOnList(ctx context.Context, listID, afterID, limit int) ([]int, error) {
	var ids []int
	if err := s.db.SelectContext(ctx, &ids, s.q.get("subscriber-ids-by-list"), listID, afterID, limit); err != nil {
		return nil, err
	}
	return ids, nil
}

func pqIntArray(ids []int) any { return pq.Array(ids) }

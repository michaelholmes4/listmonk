package automation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
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
	OrderBy  string // name | status | created_at | updated_at
	Order    string // asc | desc
	Page     int
	PerPage  int // 0 = all
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
	if err := s.db.SelectContext(ctx, &rows, query, o.Query, statuses, offset, o.PerPage); err != nil {
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

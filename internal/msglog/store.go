package msglog

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

// Store reads and writes the message_log table.
type Store struct {
	db *sqlx.DB
}

// NewStore returns a Store on db.
func NewStore(db *sqlx.DB) *Store { return &Store{db: db} }

const insertCols = `created_at, source, messenger, status, error, subscriber_id, campaign_id, automation_id,
	enrollment_id, from_email, to_email, subject, message_id, content_type, body, alt_body, headers, attachments`

const numInsertCols = 18

func nullInt(n int) any {
	if n == 0 {
		return nil
	}
	return n
}

func jsonOr(b []byte, def string) string {
	if len(b) == 0 {
		return def
	}
	return string(b)
}

// Insert records entries in one statement. If that fails because a subscriber or campaign was
// deleted between the send and now (a foreign key), the entries are inserted one by one: a message
// whose campaign is gone is kept without it, and one whose subscriber is gone is dropped, since
// deleting a subscriber deletes their messages and this one must not outlive them.
func (s *Store) Insert(ctx context.Context, entries []Entry) error {
	if len(entries) == 0 {
		return nil
	}
	if err := s.insertBatch(ctx, entries); err == nil {
		return nil
	}
	var firstErr error
	for i := range entries {
		e := entries[i]
		err := s.insertBatch(ctx, []Entry{e})
		if isForeignKey(err, "campaign_id") {
			e.CampaignID = 0
			err = s.insertBatch(ctx, []Entry{e})
		}
		if isForeignKey(err, "subscriber_id") {
			continue
		}
		if err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

// isForeignKey reports whether err is a foreign key violation on the given column.
func isForeignKey(err error, column string) bool {
	var pe *pq.Error
	return errors.As(err, &pe) && pe.Code == "23503" && strings.Contains(pe.Constraint, column)
}

func (s *Store) insertBatch(ctx context.Context, entries []Entry) error {
	var (
		sb   strings.Builder
		args = make([]any, 0, len(entries)*numInsertCols)
	)
	sb.WriteString(`INSERT INTO message_log (` + insertCols + `) VALUES `)
	for i, e := range entries {
		if i > 0 {
			sb.WriteByte(',')
		}
		sb.WriteByte('(')
		for j := 0; j < numInsertCols; j++ {
			if j > 0 {
				sb.WriteByte(',')
			}
			fmt.Fprintf(&sb, "$%d", i*numInsertCols+j+1)
		}
		sb.WriteByte(')')

		to := e.To
		if to == nil {
			to = []string{}
		}
		var enr any
		if e.EnrollmentID != 0 {
			enr = e.EnrollmentID
		}
		args = append(args, e.CreatedAt, e.Source, e.Messenger, e.Status, e.Error,
			nullInt(e.SubscriberID), nullInt(e.CampaignID), nullInt(e.AutomationID), enr,
			e.From, pq.Array(to), e.Subject, e.MessageID, e.ContentType, e.Body, e.AltBody,
			jsonOr(e.Headers, "{}"), jsonOr(e.Attachments, "[]"))
	}
	_, err := s.db.ExecContext(ctx, sb.String(), args...)
	return err
}

// The bounce / open / click flags only make sense for mail that belongs to a campaign.
const selectRow = `
	m.id, m.created_at, m.source, m.messenger, m.status, m.error, m.subscriber_id, m.campaign_id,
	COALESCE(c.name, '') AS campaign_name, m.automation_id, COALESCE(a.name, '') AS automation_name,
	m.enrollment_id, m.from_email, m.to_email, m.subject, m.message_id, m.content_type,
	(m.body IS NOT NULL) AS has_body,
	(m.campaign_id IS NOT NULL AND m.subscriber_id IS NOT NULL AND EXISTS (
		SELECT 1 FROM bounces b WHERE b.subscriber_id = m.subscriber_id AND b.campaign_id = m.campaign_id
		AND b.created_at >= m.created_at)) AS bounced,
	(m.campaign_id IS NOT NULL AND m.subscriber_id IS NOT NULL AND EXISTS (
		SELECT 1 FROM campaign_views v WHERE v.subscriber_id = m.subscriber_id AND v.campaign_id = m.campaign_id)) AS opened,
	(m.campaign_id IS NOT NULL AND m.subscriber_id IS NOT NULL AND EXISTS (
		SELECT 1 FROM link_clicks l WHERE l.subscriber_id = m.subscriber_id AND l.campaign_id = m.campaign_id)) AS clicked`

const fromRow = ` FROM message_log m
	LEFT JOIN campaigns c ON c.id = m.campaign_id
	LEFT JOIN automations a ON a.id = m.automation_id`

// likePattern escapes LIKE wildcards in a user's search text.
func likePattern(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return "%" + r.Replace(s) + "%"
}

func (f Filter) where() (string, []any) {
	var (
		conds []string
		args  []any
	)
	add := func(cond string, v any) {
		args = append(args, v)
		conds = append(conds, strings.ReplaceAll(cond, "?", fmt.Sprintf("$%d", len(args))))
	}
	if f.Search != "" {
		add(`(m.subject ILIKE ? OR ARRAY_TO_STRING(m.to_email, ',') ILIKE ?)`, likePattern(f.Search))
	}
	switch f.Status {
	case StatusSent, StatusFailed:
		add(`m.status = ?`, f.Status)
	case StatusBounced:
		conds = append(conds, `m.status = 'sent' AND m.campaign_id IS NOT NULL AND m.subscriber_id IS NOT NULL AND EXISTS (
			SELECT 1 FROM bounces b WHERE b.subscriber_id = m.subscriber_id AND b.campaign_id = m.campaign_id
			AND b.created_at >= m.created_at)`)
	}
	if f.Source != "" {
		add(`m.source = ?`, f.Source)
	}
	if f.SubscriberID != 0 {
		add(`m.subscriber_id = ?`, f.SubscriberID)
	}
	if f.CampaignID != 0 {
		add(`m.campaign_id = ?`, f.CampaignID)
	}
	if f.AutomationID != 0 {
		add(`m.automation_id = ?`, f.AutomationID)
	}
	if !f.Since.IsZero() {
		add(`m.created_at >= ?`, f.Since)
	}
	if !f.Until.IsZero() {
		add(`m.created_at < ?`, f.Until)
	}
	if len(conds) == 0 {
		return "", args
	}
	return " WHERE " + strings.Join(conds, " AND "), args
}

// Query returns a page of messages (newest first unless f.Ascending) and the total that match.
func (s *Store) Query(ctx context.Context, f Filter) ([]Row, int, error) {
	where, args := f.where()

	var total int
	if err := s.db.GetContext(ctx, &total, `SELECT COUNT(*) FROM message_log m`+where, args...); err != nil {
		return nil, 0, err
	}

	dir := "DESC"
	if f.Ascending {
		dir = "ASC"
	}
	q := `SELECT` + selectRow + fromRow + where + ` ORDER BY m.created_at ` + dir + `, m.id ` + dir
	if f.Limit > 0 {
		args = append(args, f.Limit, f.Offset)
		q += fmt.Sprintf(` LIMIT $%d OFFSET $%d`, len(args)-1, len(args))
	}
	rows := []Row{}
	if err := s.db.SelectContext(ctx, &rows, q, args...); err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

// Get returns one message with its content, or sql.ErrNoRows.
func (s *Store) Get(ctx context.Context, id int64) (Detail, error) {
	var d Detail
	err := s.db.GetContext(ctx, &d, `SELECT`+selectRow+`, m.body, m.alt_body, m.headers, m.attachments`+fromRow+` WHERE m.id = $1`, id)
	return d, err
}

// DeleteBefore removes messages older than t and reports how many.
func (s *Store) DeleteBefore(ctx context.Context, t time.Time) (int64, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM message_log WHERE created_at < $1`, t)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// ErrNotFound is returned by Get for an unknown id.
var ErrNotFound = sql.ErrNoRows

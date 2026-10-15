package automation

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
)

// Rule is a condition: a group of rules joined by and/or, or a single test. Rules compile to a
// parameterised SQL boolean over `subscribers s`, so every user-supplied value reaches Postgres as
// a parameter, never as SQL text. The one exception is the advanced `sql` rule, which carries SQL
// on purpose and is only accepted where the caller has allowed it (it needs the same
// `subscribers:sql_query` permission as the subscriber query box).
type Rule struct {
	// Group.
	Op    string `json:"op,omitempty"` // "and" (default) or "or"
	Rules []Rule `json:"rules,omitempty"`

	// Leaf.
	Type     string          `json:"type,omitempty"` // attribute, subscriber, list, step, event, property, sql
	Path     string          `json:"path,omitempty"` // attribute, property: "plan" or "address.city"; subscriber: email|name|status
	Operator string          `json:"operator,omitempty"`
	Value    json.RawMessage `json:"value,omitempty"`
	// property: compare with this property of the run's event instead of Value (eq and neq only),
	// e.g. "an order for the same product as the checkout that started the run".
	ValueFrom string `json:"value_from,omitempty"`
	ListID    int    `json:"list_id,omitempty"`
	NodeID    string `json:"node_id,omitempty"` // step: the email step to look at
	Name      string `json:"name,omitempty"`    // event
	Within    string `json:"within,omitempty"`  // event: only occurrences in the last "7d"
	// event: "entered" counts only occurrences since the run started (not the event that started it).
	Since string `json:"since,omitempty"`
	// event: only occurrences whose properties match; a group of property rules.
	Where *Rule  `json:"where,omitempty"`
	Query string `json:"query,omitempty"` // sql
}

// Rule leaf types.
const (
	RuleAttribute  = "attribute"
	RuleSubscriber = "subscriber"
	RuleList       = "list"
	RuleStep       = "step"
	RuleEvent      = "event"
	RuleProperty   = "property"
	RuleSQL        = "sql"
)

// SinceEntered is the event rule's "since the run started" window.
const SinceEntered = "entered"

// Env is what compiling a rule needs to know about its surroundings.
type Env struct {
	EnrollmentID int64
	// CampaignOf maps an email step to the hidden campaign that carries its tracking.
	CampaignOf func(nodeID string) (int, bool)
	Now        time.Time
	// AllowSQL permits the advanced raw-SQL rule.
	AllowSQL bool
	// Event is the properties of the run's event (what started it, or what last restarted a
	// wait). Property rules in a condition or goal test it, and value_from reads it. Nil when the
	// run has none.
	Event json.RawMessage
	// NoRunEvent refuses value_from: in a trigger's filter the event is the one starting the run.
	NoRunEvent bool
	// Entered is when the run started (its starting event's time, if it has one) and
	// TriggerEventID that event; "since entered" event rules count from there, without it.
	Entered        time.Time
	TriggerEventID int64
}

// Compiled is a boolean SQL expression over `subscribers s` plus its parameters, numbered from $2
// ($1 is the subscriber ID, supplied by the caller).
type Compiled struct {
	SQL  string
	Args []any
}

var (
	attrPathRe = regexp.MustCompile(`^[A-Za-z0-9_\- ]+(\.[A-Za-z0-9_\- ]+)*$`)
	numberRe   = `'^-?[0-9]+(\.[0-9]+)?$'`
	likeEsc    = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
)

type builder struct {
	env  Env
	args []any
	// props is the SQL for the properties property rules test: the run's event at the top
	// level, the stored event inside an event rule's where, the incoming event in a filter.
	props string
	// filter allows property rules (and groups) only.
	filter   bool
	runEvent string
}

// runEventSQL is the run's event properties as a parameter, added once.
func (b *builder) runEventSQL() string {
	if b.runEvent == "" {
		ev := string(b.env.Event)
		if len(b.env.Event) == 0 {
			ev = "{}"
		}
		b.runEvent = b.add(ev) + "::jsonb"
	}
	return b.runEvent
}

// add registers a parameter and returns its placeholder.
func (b *builder) add(v any) string {
	b.args = append(b.args, v)
	return fmt.Sprintf("$%d", len(b.args)+1) // $1 is the subscriber
}

// Compile turns the rule into SQL.
func (r Rule) Compile(env Env) (Compiled, error) {
	b := &builder{env: env}
	sql, err := b.rule(r, 0)
	if err != nil {
		return Compiled{}, err
	}
	return Compiled{SQL: sql, Args: b.args}, nil
}

// Validate reports whether the rule can be compiled and run.
func (r Rule) Validate(env Env) error {
	_, err := r.Compile(env)
	return err
}

// CompileFilter compiles an event filter, a group of property rules, against an incoming event's
// properties (a trigger's or a wait's event, which is not stored with the run yet).
func (r Rule) CompileFilter(props json.RawMessage, env Env) (Compiled, error) {
	b := &builder{env: env, filter: true}
	if len(props) == 0 {
		props = json.RawMessage("{}")
	}
	b.props = b.add(string(props)) + "::jsonb"
	sql, err := b.rule(r, 0)
	if err != nil {
		return Compiled{}, err
	}
	return Compiled{SQL: sql, Args: b.args}, nil
}

// ValidateFilter reports whether the rule is a usable event filter.
func (r Rule) ValidateFilter(env Env) error {
	_, err := r.CompileFilter(nil, env)
	return err
}

const maxRuleDepth = 8

func (b *builder) rule(r Rule, depth int) (string, error) {
	if depth > maxRuleDepth {
		return "", errors.New("rule is nested too deeply")
	}

	// A group.
	if r.Type == "" {
		if len(r.Rules) == 0 {
			return "", errors.New("empty rule group")
		}
		join := " AND "
		switch r.Op {
		case "", "and":
		case "or":
			join = " OR "
		default:
			return "", fmt.Errorf("unknown group operator %q", r.Op)
		}
		parts := make([]string, 0, len(r.Rules))
		for _, c := range r.Rules {
			s, err := b.rule(c, depth+1)
			if err != nil {
				return "", err
			}
			parts = append(parts, s)
		}
		return "(" + strings.Join(parts, join) + ")", nil
	}

	if b.filter && r.Type != RuleProperty {
		return "", errors.New("an event filter can only test event properties")
	}

	switch r.Type {
	case RuleProperty:
		if !attrPathRe.MatchString(r.Path) {
			return "", fmt.Errorf("invalid property name %q", r.Path)
		}
		if b.props == "" {
			b.props = b.runEventSQL()
		}
		path := b.add(pgPath(r.Path))
		text, raw := fmt.Sprintf("(%s #>> %s::text[])", b.props, path), fmt.Sprintf("(%s #> %s::text[])", b.props, path)
		if r.ValueFrom == "" {
			return b.textTest(text, raw, r)
		}
		if b.env.NoRunEvent {
			return "", errors.New("a trigger's filter can't compare with the run's event")
		}
		if !attrPathRe.MatchString(r.ValueFrom) {
			return "", fmt.Errorf("invalid property name %q", r.ValueFrom)
		}
		other := fmt.Sprintf("(%s #>> %s::text[])", b.runEventSQL(), b.add(pgPath(r.ValueFrom)))
		switch r.Operator {
		case "eq":
			return fmt.Sprintf("%s = %s", text, other), nil
		case "neq":
			return fmt.Sprintf("%s IS DISTINCT FROM %s", text, other), nil
		}
		return "", errors.New("comparing with the run's event works with equals and not equals only")

	case RuleAttribute:
		if !attrPathRe.MatchString(r.Path) {
			return "", fmt.Errorf("invalid attribute name %q", r.Path)
		}
		path := b.add(pgPath(r.Path))
		return b.textTest(fmt.Sprintf("(s.attribs #>> %s::text[])", path), fmt.Sprintf("(s.attribs #> %s::text[])", path), r)

	case RuleSubscriber:
		switch r.Path {
		case "email", "name":
			return b.textTest("s."+r.Path, "", r)
		case "status":
			return b.textTest("s.status::text", "", r)
		}
		return "", fmt.Errorf("unknown subscriber field %q", r.Path)

	case RuleList:
		if r.ListID <= 0 {
			return "", errors.New("list rule needs a list")
		}
		id := b.add(r.ListID)
		exists := "EXISTS (SELECT 1 FROM subscriber_lists sl WHERE sl.subscriber_id = s.id AND sl.list_id = " + id
		switch r.Operator {
		case "is_member":
			return exists + " AND sl.status <> 'unsubscribed')", nil
		case "is_not_member":
			return "NOT " + exists + " AND sl.status <> 'unsubscribed')", nil
		case "confirmed":
			return exists + " AND sl.status = 'confirmed')", nil
		case "unsubscribed":
			return exists + " AND sl.status = 'unsubscribed')", nil
		}
		return "", fmt.Errorf("unknown list operator %q", r.Operator)

	case RuleStep:
		if b.env.CampaignOf == nil {
			return "", errors.New("step rules need an automation context")
		}
		camp, ok := b.env.CampaignOf(r.NodeID)
		if !ok {
			return "", fmt.Errorf("step %q is not an email step", r.NodeID)
		}
		var table, neg string
		switch r.Operator {
		case "opened", "not_opened":
			table = "campaign_views"
		case "clicked", "not_clicked":
			table = "link_clicks"
		default:
			return "", fmt.Errorf("unknown step operator %q", r.Operator)
		}
		if strings.HasPrefix(r.Operator, "not_") {
			neg = "NOT "
		}
		c, e, n := b.add(camp), b.add(b.env.EnrollmentID), b.add(r.NodeID)
		// Only activity after this enrollment last sent the step counts (its latest visit).
		return fmt.Sprintf(`%sEXISTS (SELECT 1 FROM %s t WHERE t.campaign_id = %s AND t.subscriber_id = s.id
			AND t.created_at >= COALESCE((SELECT started_at FROM enrollment_steps WHERE enrollment_id = %s AND node_id = %s ORDER BY visit DESC LIMIT 1), 'infinity'))`,
			neg, table, c, e, n), nil

	case RuleEvent:
		if r.Name == "" {
			return "", errors.New("event rule needs an event name")
		}
		name := b.add(r.Name)
		q := "EXISTS (SELECT 1 FROM subscriber_events ev WHERE ev.subscriber_id = s.id AND ev.name = " + name
		if r.Within != "" && r.Since != "" {
			return "", errors.New("event rule: use either within or since, not both")
		}
		if r.Within != "" {
			d, err := ParseDuration(r.Within)
			if err != nil {
				return "", fmt.Errorf("event window: %w", err)
			}
			q += " AND ev.occurred_at >= " + b.add(b.env.Now.Add(-d))
		}
		switch r.Since {
		case "":
		case SinceEntered:
			q += " AND ev.occurred_at >= " + b.add(b.env.Entered) + " AND ev.id <> " + b.add(b.env.TriggerEventID)
		default:
			return "", fmt.Errorf("unknown event window %q", r.Since)
		}
		if r.Where != nil {
			outer, filter := b.props, b.filter
			b.props, b.filter = "ev.properties", true
			w, err := b.rule(*r.Where, depth+1)
			b.props, b.filter = outer, filter
			if err != nil {
				return "", err
			}
			q += " AND " + w
		}
		q += ")"
		switch r.Operator {
		case "occurred":
			return q, nil
		case "not_occurred":
			return "NOT " + q, nil
		}
		return "", fmt.Errorf("unknown event operator %q", r.Operator)

	case RuleSQL:
		if !b.env.AllowSQL {
			return "", errors.New("raw SQL rules are not allowed here")
		}
		q := strings.TrimSpace(r.Query)
		if q == "" || strings.Contains(q, ";") {
			return "", errors.New("invalid SQL rule")
		}
		return "(" + q + ")", nil
	}
	return "", fmt.Errorf("unknown rule type %q", r.Type)
}

// pgPath turns "address.city" into the text[] literal `{address,city}`.
func pgPath(p string) string {
	return "{" + strings.Join(strings.Split(p, "."), ",") + "}"
}

// textTest compares a text expression (and, for existence, the raw jsonb one) with the rule value.
func (b *builder) textTest(text, raw string, r Rule) (string, error) {
	switch r.Operator {
	case "exists", "not_exists":
		if raw == "" {
			return "", fmt.Errorf("%q does not apply here", r.Operator)
		}
		e := fmt.Sprintf("(%s IS NOT NULL AND jsonb_typeof(%s) <> 'null')", raw, raw)
		if r.Operator == "not_exists" {
			return "NOT " + e, nil
		}
		return e, nil
	}

	v, kind, err := scalar(r.Value)
	if err != nil {
		return "", err
	}
	switch r.Operator {
	case "eq":
		return fmt.Sprintf("%s = %s", text, b.add(v)), nil
	case "neq":
		return fmt.Sprintf("%s IS DISTINCT FROM %s", text, b.add(v)), nil
	case "contains":
		return fmt.Sprintf(`%s ILIKE '%%' || %s || '%%' ESCAPE '\'`, text, b.add(likeEsc.Replace(v))), nil
	case "gt", "gte", "lt", "lte":
		op := map[string]string{"gt": ">", "gte": ">=", "lt": "<", "lte": "<="}[r.Operator]
		if kind == "number" {
			return fmt.Sprintf("(CASE WHEN %s ~ %s THEN (%s)::numeric END) %s %s::numeric", text, numberRe, text, op, b.add(v)), nil
		}
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			if t, err = time.Parse("2006-01-02", v); err != nil {
				return "", fmt.Errorf("%q needs a number or a date, not %q", r.Operator, v)
			}
		}
		return fmt.Sprintf(`(CASE WHEN %s ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN (%s)::timestamptz END) %s %s::timestamptz`, text, text, op, b.add(t)), nil
	}
	return "", fmt.Errorf("unknown operator %q", r.Operator)
}

// scalar reads a JSON string, number or boolean as the text Postgres compares it as.
func scalar(raw json.RawMessage) (string, string, error) {
	if len(raw) == 0 {
		return "", "", errors.New("rule needs a value")
	}
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return "", "", err
	}
	switch x := v.(type) {
	case string:
		return x, "string", nil
	case float64:
		return strings.TrimRight(strings.TrimRight(fmt.Sprintf("%f", x), "0"), "."), "number", nil
	case bool:
		return fmt.Sprintf("%t", x), "bool", nil
	}
	return "", "", errors.New("rule value must be a string, number or boolean")
}

// ParseDuration reads "30s", "15m", "2h", "3d", "1w" (days and weeks, which time.ParseDuration
// lacks). A leading "-" is allowed for offsets.
func ParseDuration(s string) (time.Duration, error) {
	s = strings.TrimSpace(s)
	neg := strings.HasPrefix(s, "-")
	s = strings.TrimPrefix(s, "-")
	if len(s) < 2 {
		return 0, fmt.Errorf("invalid duration %q", s)
	}
	unit := map[byte]time.Duration{'s': time.Second, 'm': time.Minute, 'h': time.Hour, 'd': 24 * time.Hour, 'w': 7 * 24 * time.Hour}[s[len(s)-1]]
	if unit == 0 {
		return 0, fmt.Errorf("invalid duration %q (use s, m, h, d or w)", s)
	}
	var n int
	if _, err := fmt.Sscanf(s[:len(s)-1], "%d", &n); err != nil || fmt.Sprint(n) != s[:len(s)-1] || n < 0 {
		return 0, fmt.Errorf("invalid duration %q", s)
	}
	d := time.Duration(n) * unit
	if neg {
		d = -d
	}
	return d, nil
}

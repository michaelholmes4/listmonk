package automation

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"
)

// Problem is one thing wrong with a graph or its settings, attributed to a node when it has one
// (the builder shows it on the card).
type Problem struct {
	NodeID  string `json:"node_id,omitempty"`
	Message string `json:"message"`
}

func (p Problem) Error() string {
	if p.NodeID != "" {
		return fmt.Sprintf("%s: %s", p.NodeID, p.Message)
	}
	return p.Message
}

// ValidateOpts tunes validation.
type ValidateOpts struct {
	// AllowSQL permits raw-SQL condition rules (the caller checked the permission).
	AllowSQL bool
	// Publish demands a complete automation: at least one trigger and one step.
	Publish bool
}

// Index is a graph made easy to walk.
type Index struct {
	Graph    *Graph
	Nodes    map[string]*Node
	children map[string]map[string]string // from -> handle -> to
	parent   map[string]string
}

// NewIndex indexes a graph. It does not validate.
func NewIndex(g *Graph) *Index {
	ix := &Index{
		Graph:    g,
		Nodes:    make(map[string]*Node, len(g.Nodes)),
		children: map[string]map[string]string{},
		parent:   map[string]string{},
	}
	for i := range g.Nodes {
		ix.Nodes[g.Nodes[i].ID] = &g.Nodes[i]
	}
	for _, e := range g.Edges {
		if ix.children[e.From] == nil {
			ix.children[e.From] = map[string]string{}
		}
		ix.children[e.From][e.Handle] = e.To
		ix.parent[e.To] = e.From
	}
	return ix
}

// Next is the node after `id` along `handle` ("" for everything but a condition's yes/no), or ""
// when the branch ends.
func (ix *Index) Next(id, handle string) string { return ix.children[id][handle] }

// IsAncestor reports whether `anc` is on the path from the root to `id`.
func (ix *Index) IsAncestor(anc, id string) bool {
	for p, ok := ix.parent[id]; ok; p, ok = ix.parent[p] {
		if p == anc {
			return true
		}
	}
	return false
}

// CampaignOf returns the hidden campaign backing an email step.
func (ix *Index) CampaignOf(nodeID string) (int, bool) {
	n := ix.Nodes[nodeID]
	if n == nil || n.Type != NodeSendEmail {
		return 0, false
	}
	var c SendEmailConfig
	if json.Unmarshal(n.Config, &c) != nil || c.CampaignID == 0 {
		return 0, false
	}
	return c.CampaignID, true
}

// ParseGraph decodes a stored graph. An empty document is an empty graph.
func ParseGraph(raw json.RawMessage) (*Graph, error) {
	g := &Graph{}
	if len(raw) == 0 || string(raw) == "null" {
		return g, nil
	}
	if err := json.Unmarshal(raw, g); err != nil {
		return nil, fmt.Errorf("invalid graph: %w", err)
	}
	return g, nil
}

var (
	idRe   = regexp.MustCompile(`^[A-Za-z0-9_\-]{1,64}$`)
	timeRe = regexp.MustCompile(`^([01][0-9]|2[0-3]):[0-5][0-9]$`)
)

// Validate checks the graph and returns every problem found, so the builder can show them all.
func (g *Graph) Validate(opts ValidateOpts) []Problem {
	var out []Problem
	bad := func(node, format string, a ...any) { out = append(out, Problem{node, fmt.Sprintf(format, a...)}) }

	if opts.Publish {
		if len(g.Triggers) == 0 {
			bad("", "add a trigger")
		}
		if len(g.Nodes) == 0 {
			bad("", "add at least one step")
		}
	}

	// Triggers.
	seenT := map[string]bool{}
	for _, t := range g.Triggers {
		if !idRe.MatchString(t.ID) || seenT[t.ID] {
			bad("", "trigger needs a unique id")
		}
		seenT[t.ID] = true
		var c TriggerConfig
		if len(t.Config) > 0 {
			if err := json.Unmarshal(t.Config, &c); err != nil {
				bad("", "trigger %s: invalid options", t.ID)
				continue
			}
		}
		switch t.Type {
		case TriggerListJoined:
			if c.ListID <= 0 {
				bad("", "trigger %s: choose a list", t.ID)
			}
		case TriggerAttributeChanged:
			if !attrPathRe.MatchString(c.Attribute) {
				bad("", "trigger %s: choose an attribute", t.ID)
			}
		case TriggerEvent:
			if strings.TrimSpace(c.Event) == "" {
				bad("", "trigger %s: choose an event name", t.ID)
			}
			if c.Where != nil {
				if err := c.Where.ValidateFilter(Env{Now: time.Now(), NoRunEvent: true}); err != nil {
					bad("", "trigger %s: %v", t.ID, err)
				}
			}
		case TriggerManual:
		default:
			bad("", "trigger %s: unknown type %q", t.ID, t.Type)
		}
	}

	// Nodes and edges: ids, then the tree shape.
	ix := NewIndex(g)
	if len(ix.Nodes) != len(g.Nodes) {
		bad("", "step ids must be unique")
	}
	for _, n := range g.Nodes {
		if !idRe.MatchString(n.ID) {
			bad(n.ID, "invalid step id")
		}
	}
	if len(g.Nodes) > 0 {
		if g.Root == "" || ix.Nodes[g.Root] == nil {
			bad("", "the first step is missing")
		}
	}

	indeg := map[string]int{}
	outHandles := map[string]map[string]int{}
	for _, e := range g.Edges {
		from, to := ix.Nodes[e.From], ix.Nodes[e.To]
		if from == nil || to == nil {
			bad("", "a connection points at a step that does not exist")
			continue
		}
		indeg[e.To]++
		if outHandles[e.From] == nil {
			outHandles[e.From] = map[string]int{}
		}
		outHandles[e.From][e.Handle]++
		switch from.Type {
		case NodeCondition:
			if e.Handle != HandleYes && e.Handle != HandleNo {
				bad(e.From, "a condition's connections must be yes or no")
			}
		case NodeWaitForEvent:
			if !waitHandleOK(from, e.Handle) {
				bad(e.From, "a wait for an event connects only to its events' paths and its time's up path")
			}
		default:
			if e.Handle != "" {
				bad(e.From, "only conditions and waits for an event branch")
			}
		}
	}
	for id, c := range indeg {
		if c > 1 {
			bad(id, "has more than one step leading into it")
		}
		if id == g.Root {
			bad(id, "the first step cannot be reached from another step")
		}
	}
	for id, hs := range outHandles {
		for h, c := range hs {
			if c > 1 {
				bad(id, "has more than one %q connection", h)
			}
		}
		if ix.Nodes[id] != nil && ix.Nodes[id].Type == NodeExit {
			bad(id, "an exit step ends the automation; nothing can follow it")
		}
		if ix.Nodes[id] != nil && ix.Nodes[id].Type == NodeGoTo {
			bad(id, "a go to step ends its path; nothing can follow it")
		}
	}

	// Everything must hang off the root (this also rules out cycles, as every node has one parent).
	if g.Root != "" && ix.Nodes[g.Root] != nil {
		seen := map[string]bool{}
		var walk func(string)
		walk = func(id string) {
			if seen[id] {
				return
			}
			seen[id] = true
			for _, to := range ix.children[id] {
				walk(to)
			}
		}
		walk(g.Root)
		for _, n := range g.Nodes {
			if !seen[n.ID] {
				bad(n.ID, "is not connected to the first step")
			}
		}
	}

	// Node options.
	for _, n := range g.Nodes {
		out = append(out, validateNode(ix, n, opts)...)
	}

	out = append(out, instantLoops(ix)...)

	sort.SliceStable(out, func(i, j int) bool { return out[i].NodeID < out[j].NodeID })
	return out
}

func validateNode(ix *Index, n Node, opts ValidateOpts) []Problem {
	var out []Problem
	bad := func(format string, a ...any) { out = append(out, Problem{n.ID, fmt.Sprintf(format, a...)}) }
	decode := func(v any) bool {
		if len(n.Config) == 0 {
			bad("is not set up")
			return false
		}
		if err := json.Unmarshal(n.Config, v); err != nil {
			bad("has invalid options")
			return false
		}
		return true
	}

	switch n.Type {
	case NodeSendEmail:
		var c SendEmailConfig
		if !decode(&c) {
			break
		}
		switch c.MessageType {
		case MessageMarketing:
			if c.ListID <= 0 {
				bad("a marketing email needs a topic (list), so people can opt out of it")
			}
		case MessageTransactional:
		default:
			bad("choose marketing or transactional")
		}
		if (c.CampaignID > 0) == (c.TemplateID > 0) {
			bad("needs either its own content or a transactional template, not both or neither")
		} else if c.MessageType == MessageMarketing && c.TemplateID > 0 {
			bad("a marketing email needs its own content: a transactional template has no unsubscribe link")
		}

	case NodeDelay:
		var c DelayConfig
		if decode(&c) {
			if d, err := ParseDuration(c.Duration); err != nil || d <= 0 {
				bad("needs a duration like 30m, 2h, 3d or 1w")
			}
		}

	case NodeWaitUntil:
		var c WaitUntilConfig
		if !decode(&c) {
			break
		}
		if (c.At == nil) == (c.Attribute == "") {
			bad("needs either a date or a date attribute")
		}
		if c.Attribute != "" && !attrPathRe.MatchString(c.Attribute) {
			bad("invalid attribute name")
		}
		if c.Offset != "" {
			if _, err := ParseDuration(c.Offset); err != nil {
				bad("invalid offset")
			}
		}

	case NodeWaitForEvent:
		var c WaitForEventConfig
		if !decode(&c) {
			break
		}
		if d, err := ParseDuration(c.Timeout); err != nil || d <= 0 {
			bad("needs a time limit like 30m, 2h or 3d")
		}
		if len(c.Events) < 1 || len(c.Events) > maxWaitEvents {
			bad("needs between 1 and %d events to wait for", maxWaitEvents)
		}
		// The same name may be listed again with different filters; the first that matches wins,
		// so one listed after an unfiltered one is never reached.
		ids, open := map[string]bool{}, map[string]bool{}
		for _, ev := range c.Events {
			if !idRe.MatchString(ev.ID) || ev.ID == HandleTimeout || ids[ev.ID] {
				bad("every event needs its own id")
			}
			ids[ev.ID] = true
			name := strings.TrimSpace(ev.Name)
			switch {
			case name == "":
				bad("every event needs a name")
			case len(name) > maxEventName:
				bad("event names are at most %d characters", maxEventName)
			case open[name]:
				bad("%q is listed after one with no filter, so it is never reached", name)
			}
			if ev.Where == nil {
				open[name] = true
			} else if err := ev.Where.ValidateFilter(Env{Now: time.Now()}); err != nil {
				bad("event %q: %v", name, err)
			}
		}

	case NodeCondition:
		var c ConditionConfig
		if !decode(&c) {
			break
		}
		// Ancestry follows the tree. A run that joined a path halfway may not have sent an earlier
		// email on it; the rule then reads it as not opened or clicked, which is right.
		env := Env{
			CampaignOf: func(id string) (int, bool) {
				// Only a step that has already run on the way here can be asked about.
				if !ix.IsAncestor(id, n.ID) {
					return 0, false
				}
				return ix.CampaignOf(id)
			},
			Now:      time.Now(),
			AllowSQL: opts.AllowSQL,
		}
		if err := c.Rule.Validate(env); err != nil {
			bad("%v", err)
		}

	case NodeUpdateAttribute:
		var c UpdateAttributeConfig
		if !decode(&c) {
			break
		}
		if !attrPathRe.MatchString(c.Attribute) {
			bad("invalid attribute name")
		}
		if !c.Unset && !json.Valid(c.Value) {
			bad("needs a value")
		}

	case NodeAddToList, NodeRemoveFromList:
		var c ListConfig
		if decode(&c) && c.ListID <= 0 {
			bad("choose a list")
		}
		if n.Type == NodeAddToList {
			var c ListConfig
			_ = json.Unmarshal(n.Config, &c)
			if c.Status != "" && c.Status != "confirmed" && c.Status != "unconfirmed" {
				bad("invalid subscription status")
			}
		}

	case NodeGoTo:
		var c GoToConfig
		if !decode(&c) {
			break
		}
		switch t := ix.Nodes[c.Target]; {
		case c.Target == "":
			bad("choose a step to go to")
		case t == nil:
			bad("goes to a step that doesn't exist")
		case c.Target == n.ID:
			bad("can't go to itself")
		case t.Type == NodeGoTo:
			bad("can't go to another go to step")
		}
		if c.MaxRuns < 0 || c.MaxRuns > maxGoToRunsCap {
			bad("can repeat between 1 and %d times", maxGoToRunsCap)
		}

	case NodeExit:
		// Nothing to configure.

	default:
		bad("unknown step type %q", n.Type)
	}
	return out
}

// ListRefs returns, for permission checks, the lists the graph acts on (its triggers, its emails'
// topics, the lists its steps add people to or remove them from) and the lists its conditions only
// look at.
func (g *Graph) ListRefs() (acts, reads []int) {
	for _, t := range g.Triggers {
		var c TriggerConfig
		if t.Type == TriggerListJoined && json.Unmarshal(t.Config, &c) == nil && c.ListID > 0 {
			acts = append(acts, c.ListID)
		}
	}
	for _, n := range g.Nodes {
		switch n.Type {
		case NodeSendEmail:
			var c SendEmailConfig
			if json.Unmarshal(n.Config, &c) == nil && c.MessageType == MessageMarketing && c.ListID > 0 {
				acts = append(acts, c.ListID)
			}
		case NodeAddToList, NodeRemoveFromList:
			var c ListConfig
			if json.Unmarshal(n.Config, &c) == nil && c.ListID > 0 {
				acts = append(acts, c.ListID)
			}
		case NodeCondition:
			var c ConditionConfig
			if json.Unmarshal(n.Config, &c) == nil {
				reads = append(reads, c.Rule.ListRefs()...)
			}
		}
	}
	return acts, reads
}

// ListRefs returns the lists a rule looks at.
func (r Rule) ListRefs() []int {
	var out []int
	if r.Type == RuleList && r.ListID > 0 {
		out = append(out, r.ListID)
	}
	for _, c := range r.Rules {
		out = append(out, c.ListRefs()...)
	}
	return out
}

// HasTransactional reports whether the graph sends a transactional email (one that ignores opt-outs).
func (g *Graph) HasTransactional() bool {
	for _, n := range g.Nodes {
		var c SendEmailConfig
		if n.Type == NodeSendEmail && json.Unmarshal(n.Config, &c) == nil && c.MessageType == MessageTransactional {
			return true
		}
	}
	return false
}

// ParseSettings decodes stored automation settings, applying defaults.
func ParseSettings(raw json.RawMessage) (Settings, error) {
	var s Settings
	if len(raw) > 0 && string(raw) != "null" {
		if err := json.Unmarshal(raw, &s); err != nil {
			return s, fmt.Errorf("invalid settings: %w", err)
		}
	}
	if s.Reentry.Mode == "" {
		s.Reentry.Mode = "once"
	}
	return s, nil
}

// Validate checks automation-wide settings.
func (s Settings) Validate(opts ValidateOpts) []Problem {
	var out []Problem
	bad := func(format string, a ...any) { out = append(out, Problem{Message: fmt.Sprintf(format, a...)}) }

	switch s.Reentry.Mode {
	case "once", "always", "":
	case "interval":
		if d, err := ParseDuration(s.Reentry.Interval); err != nil || d <= 0 {
			bad("re-entry interval needs a duration like 30d")
		}
	default:
		bad("unknown re-entry mode %q", s.Reentry.Mode)
	}

	if w := s.SendWindow; w != nil {
		for _, d := range w.Days {
			if d < 0 || d > 6 {
				bad("send window days are 0 (Sunday) to 6")
			}
		}
		if (w.Start == "") != (w.End == "") || (w.Start != "" && (!timeRe.MatchString(w.Start) || !timeRe.MatchString(w.End))) {
			bad("send window times are HH:MM, both start and end")
		} else if w.Start != "" && w.End <= w.Start {
			bad("send window end must be after its start")
		}
	}
	if s.Timezone != "" {
		if _, err := time.LoadLocation(s.Timezone); err != nil {
			bad("unknown timezone %q", s.Timezone)
		}
	}
	if q := s.QuietPeriod; q != nil {
		if d, err := ParseDuration(q.Duration); err != nil || d <= 0 {
			bad("quiet period needs a duration like 16h")
		}
		switch q.Mode {
		case "", QuietSkip, QuietWait:
		default:
			bad("unknown quiet period mode %q", q.Mode)
		}
	}
	if s.Goal != nil {
		if err := s.Goal.Validate(Env{Now: time.Now(), AllowSQL: opts.AllowSQL}); err != nil {
			bad("goal: %v", err)
		}
	}
	return out
}

const (
	maxWaitEvents = 10
	maxEventName  = 200 // the /api/track name limit
)

// waitHandleOK reports whether handle is a valid path out of a wait_for_event: time's up, or one
// of its events that has a path (not a restart).
func waitHandleOK(n *Node, handle string) bool {
	if handle == HandleTimeout {
		return true
	}
	var c WaitForEventConfig
	if json.Unmarshal(n.Config, &c) != nil {
		return false
	}
	for _, ev := range c.Events {
		if ev.ID == handle && !ev.Restart {
			return true
		}
	}
	return false
}

// instantLoops finds go_to steps that sit in a loop with no pause in it: the tree edges plus each
// go_to's jump form a directed graph, and once the arcs out of delay and wait_for_event steps (which
// always pause) are dropped, any cycle left would repeat instantly. A wait_until doesn't count: a
// date already passed makes it finish at once.
func instantLoops(ix *Index) []Problem {
	next := map[string][]string{}
	for _, e := range ix.Graph.Edges {
		next[e.From] = append(next[e.From], e.To)
	}
	for _, n := range ix.Graph.Nodes {
		if n.Type != NodeGoTo {
			continue
		}
		var c GoToConfig
		if json.Unmarshal(n.Config, &c) == nil && ix.Nodes[c.Target] != nil {
			next[n.ID] = append(next[n.ID], c.Target)
		}
	}
	for _, n := range ix.Graph.Nodes {
		if n.Type == NodeDelay || n.Type == NodeWaitForEvent {
			delete(next, n.ID)
		}
	}

	const (
		visiting = 1
		finished = 2
	)
	state := map[string]int{}
	var stack []string
	bad := map[string]bool{}
	var walk func(string)
	walk = func(id string) {
		state[id] = visiting
		stack = append(stack, id)
		for _, to := range next[id] {
			switch state[to] {
			case 0:
				walk(to)
			case visiting:
				// The cycle is the stack from `to` onwards; blame the go_to steps in it.
				i := len(stack) - 1
				for stack[i] != to {
					i--
				}
				for _, m := range stack[i:] {
					if ix.Nodes[m].Type == NodeGoTo {
						bad[m] = true
					}
				}
			}
		}
		stack = stack[:len(stack)-1]
		state[id] = finished
	}
	for _, n := range ix.Graph.Nodes {
		if state[n.ID] == 0 {
			walk(n.ID)
		}
	}

	var out []Problem
	for _, n := range ix.Graph.Nodes {
		if bad[n.ID] {
			out = append(out, Problem{n.ID, "this loop has no Delay or Wait for an event step, so it would repeat instantly"})
		}
	}
	return out
}

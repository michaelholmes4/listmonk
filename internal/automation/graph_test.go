package automation

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func cfg(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

// welcome: trigger -> email -> wait 2d -> (clicked? yes: tag; no: nudge)
func welcome() *Graph {
	return &Graph{
		Triggers: []Trigger{{ID: "t1", Type: TriggerListJoined, Config: cfg(TriggerConfig{ListID: 1})}},
		Root:     "mail",
		Nodes: []Node{
			{ID: "mail", Type: NodeSendEmail, Config: cfg(SendEmailConfig{MessageType: MessageMarketing, ListID: 1, CampaignID: 10})},
			{ID: "wait", Type: NodeDelay, Config: cfg(DelayConfig{Duration: "2d"})},
			{ID: "check", Type: NodeCondition, Config: cfg(ConditionConfig{Rule: Rule{Type: RuleStep, NodeID: "mail", Operator: "clicked"}})},
			{ID: "tag", Type: NodeUpdateAttribute, Config: cfg(UpdateAttributeConfig{Attribute: "engaged", Value: cfg(true)})},
			{ID: "nudge", Type: NodeSendEmail, Config: cfg(SendEmailConfig{MessageType: MessageMarketing, ListID: 1, CampaignID: 11})},
		},
		Edges: []Edge{
			{From: "mail", To: "wait"},
			{From: "wait", To: "check"},
			{From: "check", To: "tag", Handle: HandleYes},
			{From: "check", To: "nudge", Handle: HandleNo},
		},
	}
}

func messages(ps []Problem) string {
	var s []string
	for _, p := range ps {
		s = append(s, p.Error())
	}
	return strings.Join(s, "\n")
}

func TestValidGraph(t *testing.T) {
	if ps := welcome().Validate(ValidateOpts{Publish: true}); len(ps) != 0 {
		t.Fatalf("a valid graph was rejected:\n%s", messages(ps))
	}
}

func TestEmptyDraftIsFineButCannotBePublished(t *testing.T) {
	g := &Graph{}
	if ps := g.Validate(ValidateOpts{}); len(ps) != 0 {
		t.Fatalf("empty draft: %s", messages(ps))
	}
	ps := g.Validate(ValidateOpts{Publish: true})
	if !strings.Contains(messages(ps), "trigger") || !strings.Contains(messages(ps), "step") {
		t.Fatalf("publishing an empty graph should ask for a trigger and a step: %s", messages(ps))
	}
}

func TestGraphProblems(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(*Graph)
		want   string
	}{
		{"no root", func(g *Graph) { g.Root = "" }, "first step is missing"},
		{"unknown edge target", func(g *Graph) { g.Edges = append(g.Edges, Edge{From: "tag", To: "ghost"}) }, "does not exist"},
		{"two parents", func(g *Graph) { g.Edges = append(g.Edges, Edge{From: "tag", To: "nudge"}) }, "more than one step leading into it"},
		{"cycle back to root", func(g *Graph) { g.Edges = append(g.Edges, Edge{From: "tag", To: "mail"}) }, "cannot be reached"},
		{"orphan", func(g *Graph) {
			g.Nodes = append(g.Nodes, Node{ID: "lost", Type: NodeDelay, Config: cfg(DelayConfig{Duration: "1h"})})
		}, "not connected"},
		{"branching delay", func(g *Graph) { g.Edges = append(g.Edges, Edge{From: "wait", To: "tag", Handle: HandleYes}) }, "only conditions and waits for an event branch"},
		{"condition without handle", func(g *Graph) { g.Edges[2].Handle = "" }, "must be yes or no"},
		{"duplicate branch", func(g *Graph) { g.Edges = append(g.Edges, Edge{From: "check", To: "tag", Handle: HandleYes}) }, "more than one"},
		{"bad delay", func(g *Graph) { g.Nodes[1].Config = cfg(DelayConfig{Duration: "soon"}) }, "duration"},
		{"zero delay", func(g *Graph) { g.Nodes[1].Config = cfg(DelayConfig{Duration: "0m"}) }, "duration"},
		{"marketing without topic", func(g *Graph) {
			g.Nodes[0].Config = cfg(SendEmailConfig{MessageType: MessageMarketing, CampaignID: 10})
		}, "needs a topic"},
		{"email with neither content", func(g *Graph) {
			g.Nodes[0].Config = cfg(SendEmailConfig{MessageType: MessageTransactional})
		}, "either its own content or a transactional template"},
		{"email with both content", func(g *Graph) {
			g.Nodes[0].Config = cfg(SendEmailConfig{MessageType: MessageTransactional, CampaignID: 1, TemplateID: 2})
		}, "either its own content or a transactional template"},
		{"marketing with a transactional template", func(g *Graph) {
			g.Nodes[0].Config = cfg(SendEmailConfig{MessageType: MessageMarketing, ListID: 1, TemplateID: 2})
		}, "no unsubscribe link"},
		{"unknown message type", func(g *Graph) { g.Nodes[0].Config = cfg(SendEmailConfig{MessageType: "spam", CampaignID: 1}) }, "marketing or transactional"},
		{"condition asks about a step that has not run", func(g *Graph) {
			g.Nodes[2].Config = cfg(ConditionConfig{Rule: Rule{Type: RuleStep, NodeID: "nudge", Operator: "opened"}})
		}, "not an email step"},
		{"step rule on a non-email", func(g *Graph) {
			g.Nodes[2].Config = cfg(ConditionConfig{Rule: Rule{Type: RuleStep, NodeID: "wait", Operator: "opened"}})
		}, "not an email step"},
		{"exit with a follower", func(g *Graph) {
			g.Nodes = append(g.Nodes, Node{ID: "bye", Type: NodeExit, Config: cfg(ExitConfig{})}, Node{ID: "after", Type: NodeDelay, Config: cfg(DelayConfig{Duration: "1h"})})
			g.Edges = append(g.Edges, Edge{From: "tag", To: "bye"}, Edge{From: "bye", To: "after"})
		}, "nothing can follow"},
		{"bad id", func(g *Graph) {
			g.Nodes[1].ID = "has space"
			g.Edges[0].To = "has space"
			g.Edges[1].From = "has space"
		}, "invalid step id"},
		{"trigger without list", func(g *Graph) { g.Triggers[0].Config = cfg(TriggerConfig{}) }, "choose a list"},
		{"unknown trigger", func(g *Graph) { g.Triggers[0].Type = "moon_phase" }, "unknown type"},
		{"event trigger without name", func(g *Graph) { g.Triggers = []Trigger{{ID: "t2", Type: TriggerEvent, Config: cfg(TriggerConfig{})}} }, "event name"},
		{"unset attribute needs no value, set does", func(g *Graph) {
			g.Nodes[3].Config = cfg(UpdateAttributeConfig{Attribute: "engaged"})
		}, "needs a value"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			g := welcome()
			tc.mutate(g)
			got := messages(g.Validate(ValidateOpts{Publish: true}))
			if !strings.Contains(got, tc.want) {
				t.Fatalf("want a problem containing %q, got:\n%s", tc.want, got)
			}
		})
	}
}

func TestProblemsNameTheNode(t *testing.T) {
	g := welcome()
	g.Nodes[1].Config = cfg(DelayConfig{Duration: "x"})
	ps := g.Validate(ValidateOpts{})
	if len(ps) != 1 || ps[0].NodeID != "wait" {
		t.Fatalf("problems = %+v", ps)
	}
}

func TestRawSQLRulesNeedPermission(t *testing.T) {
	g := welcome()
	g.Nodes[2].Config = cfg(ConditionConfig{Rule: Rule{Type: RuleSQL, Query: "s.attribs->>'a' = 'b'"}})
	if got := messages(g.Validate(ValidateOpts{})); !strings.Contains(got, "not allowed") {
		t.Fatalf("raw SQL accepted without permission: %s", got)
	}
	if ps := g.Validate(ValidateOpts{AllowSQL: true}); len(ps) != 0 {
		t.Fatalf("raw SQL rejected with permission: %s", messages(ps))
	}
}

func TestNavigation(t *testing.T) {
	ix := NewIndex(welcome())
	if ix.Next("check", HandleNo) != "nudge" || ix.Next("mail", "") != "wait" || ix.Next("tag", "") != "" {
		t.Fatal("Next walks the wrong way")
	}
	if !ix.IsAncestor("mail", "nudge") || ix.IsAncestor("nudge", "mail") || ix.IsAncestor("tag", "nudge") {
		t.Fatal("IsAncestor is wrong")
	}
	if id, ok := ix.CampaignOf("nudge"); !ok || id != 11 {
		t.Fatalf("CampaignOf = %d, %v", id, ok)
	}
}

func TestSettings(t *testing.T) {
	s, err := ParseSettings(nil)
	if err != nil || s.Reentry.Mode != "once" {
		t.Fatalf("defaults: %+v %v", s, err)
	}
	ok := Settings{Reentry: Reentry{Mode: "interval", Interval: "30d"}, SendWindow: &SendWindow{Days: []int{1, 2, 3}, Start: "09:00", End: "17:00"}, Timezone: "Europe/Berlin"}
	if ps := ok.Validate(ValidateOpts{}); len(ps) != 0 {
		t.Fatalf("valid settings rejected: %s", messages(ps))
	}
	for name, s := range map[string]Settings{
		"interval without duration": {Reentry: Reentry{Mode: "interval"}},
		"unknown mode":              {Reentry: Reentry{Mode: "sometimes"}},
		"day out of range":          {SendWindow: &SendWindow{Days: []int{7}}},
		"half a window":             {SendWindow: &SendWindow{Start: "09:00"}},
		"bad time":                  {SendWindow: &SendWindow{Start: "9am", End: "5pm"}},
		"window past midnight":      {SendWindow: &SendWindow{Start: "22:00", End: "06:00"}},
		"empty window":              {SendWindow: &SendWindow{Start: "09:00", End: "09:00"}},
		"unknown timezone":          {Timezone: "Mars/Olympus"},
	} {
		if ps := s.Validate(ValidateOpts{}); len(ps) == 0 {
			t.Errorf("%s: accepted", name)
		}
	}
}

func TestParseDuration(t *testing.T) {
	for in, want := range map[string]time.Duration{
		"30s": 30 * time.Second, "15m": 15 * time.Minute, "2h": 2 * time.Hour, "3d": 72 * time.Hour, "1w": 168 * time.Hour, "-3d": -72 * time.Hour,
	} {
		if got, err := ParseDuration(in); err != nil || got != want {
			t.Errorf("%q = %v, %v; want %v", in, got, err, want)
		}
	}
	for _, in := range []string{"", "d", "1", "1x", "1.5h", "abc", "-", "--1d", "1 d"} {
		if _, err := ParseDuration(in); err == nil {
			t.Errorf("%q was accepted", in)
		}
	}
}

func waitGraph(events []WaitEvent, timeout string, edges ...Edge) *Graph {
	g := &Graph{
		Triggers: []Trigger{{ID: "t1", Type: TriggerManual}},
		Root:     "w",
		Nodes:    []Node{{ID: "w", Type: NodeWaitForEvent, Config: cfg(WaitForEventConfig{Timeout: timeout, Events: events})}},
	}
	for _, e := range edges {
		g.Nodes = append(g.Nodes, Node{ID: e.To, Type: NodeExit})
		e.From = "w"
		g.Edges = append(g.Edges, e)
	}
	return g
}

func TestWaitForEventValidation(t *testing.T) {
	one := []WaitEvent{{ID: "e1", Name: "order_completed"}}
	restart := []WaitEvent{{ID: "e1", Name: "order_completed"}, {ID: "e2", Name: "checkout_started", Restart: true}}
	many := make([]WaitEvent, 11)
	for i := range many {
		many[i] = WaitEvent{ID: "e" + string(rune('a'+i)), Name: "n" + string(rune('a'+i))}
	}

	ok := waitGraph(restart, "1h", Edge{To: "x", Handle: "e1"}, Edge{To: "y", Handle: HandleTimeout})
	if ps := ok.Validate(ValidateOpts{Publish: true}); len(ps) != 0 {
		t.Fatalf("a valid wait was rejected:\n%s", messages(ps))
	}

	cases := []struct {
		name string
		g    *Graph
		want string
	}{
		{"no time limit", waitGraph(one, ""), "time limit"},
		{"zero time limit", waitGraph(one, "0m"), "time limit"},
		{"bad time limit", waitGraph(one, "soon"), "time limit"},
		{"no events", waitGraph(nil, "1h"), "between 1 and 10"},
		{"too many events", waitGraph(many, "1h"), "between 1 and 10"},
		{"bad event id", waitGraph([]WaitEvent{{ID: "a b", Name: "x"}}, "1h"), "own id"},
		{"duplicate event id", waitGraph([]WaitEvent{{ID: "e1", Name: "a"}, {ID: "e1", Name: "b"}}, "1h"), "own id"},
		{"event id timeout", waitGraph([]WaitEvent{{ID: "timeout", Name: "a"}}, "1h"), "own id"},
		{"blank name", waitGraph([]WaitEvent{{ID: "e1", Name: "  "}}, "1h"), "needs a name"},
		{"long name", waitGraph([]WaitEvent{{ID: "e1", Name: strings.Repeat("x", 201)}}, "1h"), "at most 200"},
		{"duplicate name", waitGraph([]WaitEvent{{ID: "e1", Name: "a"}, {ID: "e2", Name: " a "}}, "1h"), "never reached"},
		{"restart event cannot have a path", waitGraph(restart, "1h", Edge{To: "x", Handle: "e2"}), "connects only to its events"},
		{"unknown path", waitGraph(one, "1h", Edge{To: "x", Handle: "e9"}), "connects only to its events"},
		{"no handle", waitGraph(one, "1h", Edge{To: "x"}), "connects only to its events"},
		{"yes is not a path", waitGraph(one, "1h", Edge{To: "x", Handle: HandleYes}), "connects only to its events"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if ms := messages(c.g.Validate(ValidateOpts{})); !strings.Contains(ms, c.want) {
				t.Fatalf("want %q in:\n%s", c.want, ms)
			}
		})
	}

	// Other steps still take no handle.
	g := welcome()
	g.Edges[0].Handle = HandleTimeout
	if ms := messages(g.Validate(ValidateOpts{})); !strings.Contains(ms, "only conditions") {
		t.Fatalf("got %s", ms)
	}
}

// loopGraph: root condition -> yes: wait -> mail; no: nudge -> go_to. The go_to's target is set per test.
func goToGraph(target string, wait Node) *Graph {
	g := &Graph{
		Triggers: []Trigger{{ID: "t1", Type: TriggerManual}},
		Root:     "check",
		Nodes: []Node{
			{ID: "check", Type: NodeCondition, Config: cfg(ConditionConfig{Rule: Rule{Type: RuleEvent, Name: "x", Operator: "occurred"}})},
			wait,
			{ID: "mail", Type: NodeUpdateAttribute, Config: cfg(UpdateAttributeConfig{Attribute: "a", Value: cfg(1)})},
			{ID: "nudge", Type: NodeUpdateAttribute, Config: cfg(UpdateAttributeConfig{Attribute: "b", Value: cfg(1)})},
			{ID: "back", Type: NodeGoTo, Config: cfg(GoToConfig{Target: target})},
		},
		Edges: []Edge{
			{From: "check", To: "wait", Handle: HandleYes},
			{From: "wait", To: "mail"},
			{From: "check", To: "nudge", Handle: HandleNo},
			{From: "nudge", To: "back"},
		},
	}
	if wait.Type == NodeWaitForEvent {
		g.Edges[1].Handle = HandleTimeout
	}
	return g
}

var (
	delayNode  = Node{ID: "wait", Type: NodeDelay, Config: cfg(DelayConfig{Duration: "1d"})}
	untilNode  = Node{ID: "wait", Type: NodeWaitUntil, Config: cfg(WaitUntilConfig{Attribute: "when"})}
	eventsNode = Node{ID: "wait", Type: NodeWaitForEvent, Config: cfg(WaitForEventConfig{Timeout: "1d", Events: []WaitEvent{{ID: "e1", Name: "x", Restart: true}}})}
)

func TestGoToJoinsASiblingPath(t *testing.T) {
	if ps := goToGraph("mail", delayNode).Validate(ValidateOpts{}); len(ps) != 0 {
		t.Fatalf("a join was rejected:\n%s", messages(ps))
	}
}

func TestGoToBackToAWaitForEventIsFine(t *testing.T) {
	if ps := goToGraph("wait", eventsNode).Validate(ValidateOpts{}); len(ps) != 0 {
		t.Fatalf("going back to a wait for an event was rejected:\n%s", messages(ps))
	}
}

func TestGoToBackToADelayIsFine(t *testing.T) {
	if ps := goToGraph("wait", delayNode).Validate(ValidateOpts{}); len(ps) != 0 {
		t.Fatalf("going back to a delay was rejected:\n%s", messages(ps))
	}
}

func TestGoToLoopWithoutAPauseIsRejected(t *testing.T) {
	// back -> wait(wait_until) -> mail is no loop; make one: mail's path ends in a go_to to wait.
	g := goToGraph("wait", untilNode)
	g.Nodes = append(g.Nodes, Node{ID: "again", Type: NodeGoTo, Config: cfg(GoToConfig{Target: "wait"})})
	g.Edges = append(g.Edges, Edge{From: "mail", To: "again"})
	ps := g.Validate(ValidateOpts{})
	if !strings.Contains(messages(ps), "repeat instantly") || !strings.Contains(messages(ps), "again") {
		t.Fatalf("a loop through a wait until should be rejected:\n%s", messages(ps))
	}

	// The same loop through a delay is fine.
	g = goToGraph("wait", delayNode)
	g.Nodes = append(g.Nodes, Node{ID: "again", Type: NodeGoTo, Config: cfg(GoToConfig{Target: "wait"})})
	g.Edges = append(g.Edges, Edge{From: "mail", To: "again"})
	if ps := g.Validate(ValidateOpts{}); len(ps) != 0 {
		t.Fatalf("a loop through a delay was rejected:\n%s", messages(ps))
	}
}

func TestTwoGoTosJumpingIntoEachOthersPathsAreRejected(t *testing.T) {
	g := &Graph{
		Triggers: []Trigger{{ID: "t1", Type: TriggerManual}},
		Root:     "check",
		Nodes: []Node{
			{ID: "check", Type: NodeCondition, Config: cfg(ConditionConfig{Rule: Rule{Type: RuleEvent, Name: "x", Operator: "occurred"}})},
			{ID: "a1", Type: NodeUpdateAttribute, Config: cfg(UpdateAttributeConfig{Attribute: "a", Value: cfg(1)})},
			{ID: "b1", Type: NodeUpdateAttribute, Config: cfg(UpdateAttributeConfig{Attribute: "b", Value: cfg(1)})},
			{ID: "ga", Type: NodeGoTo, Config: cfg(GoToConfig{Target: "b1"})},
			{ID: "gb", Type: NodeGoTo, Config: cfg(GoToConfig{Target: "a1"})},
		},
		Edges: []Edge{
			{From: "check", To: "a1", Handle: HandleYes}, {From: "a1", To: "ga"},
			{From: "check", To: "b1", Handle: HandleNo}, {From: "b1", To: "gb"},
		},
	}
	ps := g.Validate(ValidateOpts{})
	m := messages(ps)
	if !strings.Contains(m, "ga:") || !strings.Contains(m, "gb:") || !strings.Contains(m, "repeat instantly") {
		t.Fatalf("expected both go tos to be blamed:\n%s", m)
	}
}

func TestGoToConfigRules(t *testing.T) {
	cases := map[string]struct {
		cfg  GoToConfig
		want string
	}{
		"no target":      {GoToConfig{}, "choose a step to go to"},
		"missing target": {GoToConfig{Target: "nope"}, "doesn't exist"},
		"itself":         {GoToConfig{Target: "back"}, "itself"},
		"another go to":  {GoToConfig{Target: "other"}, "another go to"},
		"too many":       {GoToConfig{Target: "mail", MaxRuns: 101}, "between 1 and 100"},
		"negative":       {GoToConfig{Target: "mail", MaxRuns: -1}, "between 1 and 100"},
	}
	for name, c := range cases {
		g := goToGraph("mail", delayNode)
		g.Nodes[4].Config = cfg(c.cfg)
		g.Nodes = append(g.Nodes, Node{ID: "other", Type: NodeGoTo, Config: cfg(GoToConfig{Target: "mail"})})
		g.Edges = append(g.Edges, Edge{From: "mail", To: "other"})
		if m := messages(g.Validate(ValidateOpts{})); !strings.Contains(m, c.want) {
			t.Errorf("%s: want %q in:\n%s", name, c.want, m)
		}
	}
	g := goToGraph("mail", delayNode)
	g.Nodes[4].Config = cfg(GoToConfig{Target: "mail", MaxRuns: 100})
	if ps := g.Validate(ValidateOpts{}); len(ps) != 0 {
		t.Fatalf("max_runs 100 rejected:\n%s", messages(ps))
	}
}

func TestGoToCannotHaveAnEdgeOut(t *testing.T) {
	g := goToGraph("mail", delayNode)
	g.Nodes = append(g.Nodes, Node{ID: "after", Type: NodeUpdateAttribute, Config: cfg(UpdateAttributeConfig{Attribute: "c", Value: cfg(1)})})
	g.Edges = append(g.Edges, Edge{From: "back", To: "after"})
	if m := messages(g.Validate(ValidateOpts{})); !strings.Contains(m, "nothing can follow it") {
		t.Fatalf("a go to with an edge out was accepted:\n%s", m)
	}
}

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
		{"branching delay", func(g *Graph) { g.Edges = append(g.Edges, Edge{From: "wait", To: "tag", Handle: HandleYes}) }, "only conditions branch"},
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

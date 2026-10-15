package automation

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func prop(path, op string, v any) Rule {
	return Rule{Type: RuleProperty, Path: path, Operator: op, Value: cfg(v)}
}

func filter(rules ...Rule) *Rule { return &Rule{Op: "and", Rules: rules} }

func TestPropertyRulesNeverPutValuesInTheSQLText(t *testing.T) {
	evil := `x'); DROP TABLE subscribers; --`
	env := testEnv
	env.Event = cfg(map[string]any{"product": evil})
	rules := []Rule{
		prop("product", "eq", evil),
		prop("product", "contains", evil),
		{Type: RuleEvent, Name: "order", Operator: "occurred", Where: filter(prop("product", "neq", evil))},
	}
	for _, r := range rules {
		c, err := r.Compile(env)
		if err != nil {
			t.Fatalf("%+v: %v", r, err)
		}
		if strings.Contains(c.SQL, "DROP") {
			t.Fatalf("a value reached the SQL text: %s", c.SQL)
		}
	}
	c, err := filter(prop("product", "eq", "a")).CompileFilter(cfg(map[string]any{"product": evil}), env)
	if err != nil || strings.Contains(c.SQL, "DROP") {
		t.Fatalf("filter: %v, %s", err, c.SQL)
	}
	for _, p := range []string{"a'b", "{x}", "", "a..b"} {
		if _, err := prop(p, "eq", "x").Compile(env); err == nil {
			t.Errorf("path %q was accepted", p)
		}
		if _, err := (Rule{Type: RuleProperty, Path: "a", Operator: "eq", ValueFrom: p}).Compile(env); err == nil {
			t.Errorf("value_from %q was accepted", p)
		}
	}
}

func TestEventFilterShape(t *testing.T) {
	bad := []struct {
		name string
		r    Rule
		env  Env
	}{
		{"non-property rule", *filter(prop("a", "eq", 1), Rule{Type: RuleAttribute, Path: "a", Operator: "eq", Value: cfg(1)}), testEnv},
		{"value_from in a trigger", *filter(Rule{Type: RuleProperty, Path: "a", Operator: "eq", ValueFrom: "a"}), Env{NoRunEvent: true}},
		{"value_from with an ordering", *filter(Rule{Type: RuleProperty, Path: "a", Operator: "gt", ValueFrom: "a"}), testEnv},
	}
	for _, c := range bad {
		if err := c.r.ValidateFilter(c.env); err == nil {
			t.Errorf("%s was accepted", c.name)
		}
	}
	nested := Rule{Type: RuleEvent, Name: "x", Operator: "occurred", Where: filter(Rule{Type: RuleEvent, Name: "y", Operator: "occurred"})}
	if err := nested.Validate(testEnv); err == nil {
		t.Error("an event rule inside a where was accepted")
	}
	both := Rule{Type: RuleEvent, Name: "x", Operator: "occurred", Within: "1d", Since: SinceEntered}
	if err := both.Validate(testEnv); err == nil {
		t.Error("within and since together were accepted")
	}
	if err := (Rule{Type: RuleEvent, Name: "x", Operator: "occurred", Since: "yesterday"}).Validate(testEnv); err == nil {
		t.Error("an unknown since was accepted")
	}
}

func TestWaitEventNamesMayRepeatWithFilters(t *testing.T) {
	g := func(events ...WaitEvent) *Graph {
		return &Graph{Triggers: eventTrigger("go"), Root: "w", Nodes: []Node{
			{ID: "w", Type: NodeWaitForEvent, Config: cfg(WaitForEventConfig{Timeout: "1h", Events: events})},
		}}
	}
	ok := g(WaitEvent{ID: "a", Name: "order", Where: filter(prop("product", "eq", "a"))}, WaitEvent{ID: "b", Name: "order"})
	if ps := ok.Validate(ValidateOpts{}); len(ps) > 0 {
		t.Fatalf("problems: %s", messages(ps))
	}
	unreachable := g(WaitEvent{ID: "a", Name: "order"}, WaitEvent{ID: "b", Name: "order", Where: filter(prop("product", "eq", "a"))})
	if ps := unreachable.Validate(ValidateOpts{}); len(ps) == 0 {
		t.Fatal("an event after an unfiltered one of the same name was accepted")
	}
	trig := &Graph{Triggers: []Trigger{{ID: "t", Type: TriggerEvent, Config: cfg(TriggerConfig{Event: "go",
		Where: filter(Rule{Type: RuleProperty, Path: "a", Operator: "eq", ValueFrom: "a"})})}}, Root: "x",
		Nodes: []Node{{ID: "x", Type: NodeExit}}}
	if ps := trig.Validate(ValidateOpts{}); len(ps) == 0 {
		t.Fatal("a trigger filter comparing with the run's event was accepted")
	}
}

func TestTriggerFilterOnEventProperties(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	auto := h.publish("trial", &Graph{
		Triggers: []Trigger{{ID: "t", Type: TriggerEvent, Config: cfg(TriggerConfig{Event: "trial_started",
			Where: filter(prop("product", "eq", "synth"), prop("days", "gte", 7))})}},
		Root:  "m",
		Nodes: []Node{tx("m", h.campaign())},
	}, Settings{Reentry: Reentry{Mode: "always"}})
	sub := h.subscriber("a@example.com", "enabled", nil)

	h.must(h.eng.OnEvent(ctx, sub, event(sub, "trial_started", h.clock.Now(), map[string]any{"product": "drums", "days": 14})))
	h.must(h.eng.OnEvent(ctx, sub, event(sub, "trial_started", h.clock.Now(), map[string]any{"product": "synth", "days": 3})))
	h.must(h.eng.OnEvent(ctx, sub, event(sub, "trial_started", h.clock.Now(), nil)))
	h.drain()
	if h.sender.count() != 0 {
		t.Fatalf("a non-matching event started it: sent %d", h.sender.count())
	}
	h.must(h.eng.OnEvent(ctx, sub, event(sub, "trial_started", h.clock.Now(), map[string]any{"product": "synth", "days": "14"})))
	h.drain()
	if h.sender.count() != 1 || h.sender.Sent[0].AutomationID != auto {
		t.Fatalf("sent = %+v", h.sender.Sent)
	}
}

// checkout(product) -> wait for an order of the same product (or any other order) up to 1h.
func (h *harness) sameProductGraph() (g *Graph, same, other, late int) {
	same, other, late = h.campaign(), h.campaign(), h.campaign()
	return &Graph{
		Triggers: eventTrigger("checkout_started"),
		Root:     "w",
		Nodes: []Node{
			{ID: "w", Type: NodeWaitForEvent, Config: cfg(WaitForEventConfig{Timeout: "1h", Events: []WaitEvent{
				{ID: "same", Name: "order_completed", Where: filter(Rule{Type: RuleProperty, Path: "product", Operator: "eq", ValueFrom: "product"})},
				{ID: "other", Name: "order_completed"},
			}})},
			tx("s", same), tx("o", other), tx("l", late),
		},
		Edges: []Edge{{From: "w", To: "s", Handle: "same"}, {From: "w", To: "o", Handle: "other"}, {From: "w", To: "l", Handle: HandleTimeout}},
	}, same, other, late
}

func TestWaitFilterComparesWithTheRunsEvent(t *testing.T) {
	for _, c := range []struct {
		bought string
		path   string
	}{{"synth", "same"}, {"drums", "other"}} {
		h := newHarness(t)
		ctx := context.Background()
		g, same, other, _ := h.sameProductGraph()
		auto := h.publish("checkout", g, Settings{})
		sub := h.subscriber("a@example.com", "enabled", nil)
		h.must(h.eng.OnEvent(ctx, sub, event(sub, "checkout_started", h.clock.Now(), map[string]any{"product": "synth"})))
		h.drain()

		h.clock.Advance(time.Minute)
		h.must(h.eng.OnEvent(ctx, sub, event(sub, "order_completed", h.clock.Now(), map[string]any{"product": c.bought})))
		h.drain()
		want := map[string]int{"same": same, "other": other}[c.path]
		enr := h.enrollment(auto, sub)
		if h.sender.count() != 1 || h.sender.Sent[0].CampaignID != want || h.waitResult(enr.ID, "w").Branch != c.path {
			t.Fatalf("bought %s: sent = %+v, result = %+v", c.bought, h.sender.Sent, h.waitResult(enr.ID, "w"))
		}
	}
}

func TestAnEventThatPassesNoFilterIsIgnoredByTheWait(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	late := h.campaign()
	auto := h.publish("checkout", &Graph{
		Triggers: eventTrigger("checkout_started"),
		Root:     "w",
		Nodes: []Node{
			{ID: "w", Type: NodeWaitForEvent, Config: cfg(WaitForEventConfig{Timeout: "1h", Events: []WaitEvent{
				{ID: "paid", Name: "order_completed", Where: filter(prop("total", "gt", 0))},
			}})},
			tx("l", late),
		},
		Edges: []Edge{{From: "w", To: "l", Handle: HandleTimeout}},
	}, Settings{})
	sub := h.subscriber("a@example.com", "enabled", nil)
	h.must(h.eng.OnEvent(ctx, sub, event(sub, "checkout_started", h.clock.Now(), nil)))
	h.drain()
	h.clock.Advance(time.Minute)
	h.must(h.eng.OnEvent(ctx, sub, event(sub, "order_completed", h.clock.Now(), map[string]any{"total": 0})))
	h.drain()
	if enr := h.enrollment(auto, sub); enr.Status != EnrollmentWaiting {
		t.Fatalf("a free order ended the wait: %+v", enr)
	}
	h.clock.Advance(time.Hour)
	h.drain()
	if h.sender.count() != 1 || h.sender.Sent[0].CampaignID != late {
		t.Fatalf("sent = %+v", h.sender.Sent)
	}
}

func TestConditionOnTheRunsEvent(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	yes, no := h.campaign(), h.campaign()
	h.publish("split", &Graph{
		Triggers: eventTrigger("order_completed"),
		Root:     "c",
		Nodes: []Node{
			{ID: "c", Type: NodeCondition, Config: cfg(ConditionConfig{Rule: *filter(prop("first_order", "eq", true))})},
			tx("y", yes), tx("n", no),
		},
		Edges: []Edge{{From: "c", To: "y", Handle: HandleYes}, {From: "c", To: "n", Handle: HandleNo}},
	}, Settings{Reentry: Reentry{Mode: "always"}})
	sub := h.subscriber("a@example.com", "enabled", nil)
	h.must(h.eng.OnEvent(ctx, sub, event(sub, "order_completed", h.clock.Now(), map[string]any{"first_order": true})))
	h.drain()
	h.must(h.eng.OnEvent(ctx, sub, event(sub, "order_completed", h.clock.Now(), map[string]any{"first_order": false})))
	h.drain()
	if h.sender.count() != 2 || h.sender.Sent[0].CampaignID != yes || h.sender.Sent[1].CampaignID != no {
		t.Fatalf("sent = %+v", h.sender.Sent)
	}
}

// The standard abandoned-checkout goal: an order (for the same product) since the run started.
func TestGoalSinceEnteringWithAFilter(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	record := func(sub int, name string, props map[string]any) {
		h.t.Helper()
		_, _, err := h.eng.RecordEvent(ctx, sub, name, cfg(props), "", h.clock.Now())
		h.must(err)
		h.drain()
	}
	auto := h.publish("checkout", &Graph{
		Triggers: eventTrigger("checkout_started"),
		Root:     "d",
		Nodes:    []Node{{ID: "d", Type: NodeDelay, Config: cfg(DelayConfig{Duration: "2h"})}, tx("m", h.campaign())},
		Edges:    []Edge{{From: "d", To: "m"}},
	}, Settings{Reentry: Reentry{Mode: "always"}, Goal: &Rule{Op: "or", Rules: []Rule{
		{Type: RuleEvent, Name: "order_completed", Operator: "occurred", Since: SinceEntered,
			Where: filter(Rule{Type: RuleProperty, Path: "product", Operator: "eq", ValueFrom: "product"})},
		// The event that started the run is not "since entering".
		{Type: RuleEvent, Name: "checkout_started", Operator: "occurred", Since: SinceEntered},
	}}})
	sub := h.subscriber("a@example.com", "enabled", nil)

	// An earlier order for the same product doesn't count; one for another product neither.
	record(sub, "order_completed", map[string]any{"product": "synth"})
	h.clock.Advance(time.Minute)
	record(sub, "checkout_started", map[string]any{"product": "synth"})
	h.clock.Advance(time.Minute)
	record(sub, "order_completed", map[string]any{"product": "drums"})
	h.clock.Advance(3 * time.Hour)
	h.drain()
	if enr := h.enrollment(auto, sub); h.sender.count() != 1 || enr.Status != EnrollmentCompleted {
		t.Fatalf("sent %d, %+v", h.sender.count(), enr)
	}

	// A second run: buying the product ends it before the reminder.
	record(sub, "checkout_started", map[string]any{"product": "synth"})
	h.clock.Advance(time.Minute)
	record(sub, "order_completed", map[string]any{"product": "synth"})
	h.clock.Advance(3 * time.Hour)
	h.drain()
	enr := h.enrollment(auto, sub)
	if h.sender.count() != 1 || enr.Status != EnrollmentExited || *enr.ExitReason != ExitGoalReached {
		t.Fatalf("sent %d, %+v", h.sender.count(), enr)
	}
}

func rawEvent(sub int, name, props string, h *harness) Event {
	eventSeq++
	return Event{ID: eventSeq, SubscriberID: sub, Name: name, Properties: json.RawMessage(props), OccurredAt: h.clock.Now()}
}

// Event properties come from other systems: 10.50 is the number 10.5, whether the rule has the
// value or reads it from the run's event.
func TestNumbersCompareAsNumbers(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	h.publish("price", &Graph{
		Triggers: []Trigger{{ID: "t", Type: TriggerEvent, Config: cfg(TriggerConfig{Event: "order",
			Where: filter(prop("total", "eq", 10.5), prop("qty", "neq", 2))})}},
		Root: "m", Nodes: []Node{tx("m", h.campaign())},
	}, Settings{Reentry: Reentry{Mode: "always"}})
	sub := h.subscriber("a@example.com", "enabled", nil)
	h.must(h.eng.OnEvent(ctx, sub, rawEvent(sub, "order", `{"total":10.50,"qty":2.0}`, h)))
	h.drain()
	if h.sender.count() != 0 {
		t.Fatalf("qty 2.0 passed \"is not 2\"")
	}
	h.must(h.eng.OnEvent(ctx, sub, rawEvent(sub, "order", `{"total":10.50,"qty":1}`, h)))
	h.drain()
	if h.sender.count() != 1 {
		t.Fatalf("total 10.50 did not match 10.5")
	}

	h2 := newHarness(t)
	g, same, _, _ := h2.sameProductGraph()
	h2.publish("checkout", g, Settings{})
	sub = h2.subscriber("a@example.com", "enabled", nil)
	h2.must(h2.eng.OnEvent(ctx, sub, rawEvent(sub, "checkout_started", `{"product":10.50}`, h2)))
	h2.drain()
	h2.must(h2.eng.OnEvent(ctx, sub, rawEvent(sub, "order_completed", `{"product":"10.5"}`, h2)))
	h2.drain()
	if h2.sender.count() != 1 || h2.sender.Sent[0].CampaignID != same {
		t.Fatalf("10.5 and 10.50 were not the same: %+v", h2.sender.Sent)
	}
}

// A value that looks like a date but isn't one doesn't match a date rule, and isn't an error
// (which would fail the event's job and retry it).
func TestABadDateDoesNotMatch(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	h.publish("filtered", &Graph{
		Triggers: []Trigger{{ID: "t", Type: TriggerEvent, Config: cfg(TriggerConfig{Event: "renewal",
			Where: filter(prop("renews_at", "gt", "2026-01-01"))})}},
		Root: "m", Nodes: []Node{tx("m", h.campaign())},
	}, Settings{Reentry: Reentry{Mode: "always"}})
	sub := h.subscriber("a@example.com", "enabled", nil)
	for _, bad := range []string{"2026-02-30", "2026-99-99", "2026-03-01T25:00:00Z"} {
		if err := h.eng.OnEvent(ctx, sub, rawEvent(sub, "renewal", `{"renews_at":"`+bad+`"}`, h)); err != nil {
			t.Fatalf("%s: %v", bad, err)
		}
	}
	h.drain()
	if h.sender.count() != 0 {
		t.Fatalf("a bad date matched")
	}
	h.must(h.eng.OnEvent(ctx, sub, rawEvent(sub, "renewal", `{"renews_at":"2026-03-01T10:00:00+01:00"}`, h)))
	h.drain()
	if h.sender.count() != 1 {
		t.Fatalf("a good date did not match")
	}
}

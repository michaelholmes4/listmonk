package automation

import (
	"context"
	"testing"
	"time"
)

// --- go_to --------------------------------------------------------------------------------------

func tx(id string, campaign int) Node {
	return Node{ID: id, Type: NodeSendEmail, Config: mail(MessageTransactional, 0, campaign)}
}

func goTo(id, target string, maxRuns int) Node {
	return Node{ID: id, Type: NodeGoTo, Config: cfg(GoToConfig{Target: target, MaxRuns: maxRuns})}
}

func eventTrigger(name string) []Trigger {
	return []Trigger{{ID: "t", Type: TriggerEvent, Config: cfg(TriggerConfig{Event: name})}}
}

// loopGraph: "go" starts it; send A, wait 1d, send B, then go back to A (at most maxRuns times).
func (h *harness) loopGraph(maxRuns int) (g *Graph, a, b int) {
	a, b = h.campaign(), h.campaign()
	return &Graph{
		Triggers: eventTrigger("go"),
		Root:     "a",
		Nodes:    []Node{tx("a", a), {ID: "d", Type: NodeDelay, Config: cfg(DelayConfig{Duration: "1d"})}, tx("b", b), goTo("g", "a", maxRuns)},
		Edges:    []Edge{{From: "a", To: "d"}, {From: "d", To: "b"}, {From: "b", To: "g"}},
	}, a, b
}

func (h *harness) startRun(auto int, name string) (sub int, enr Enrollment) {
	h.t.Helper()
	sub = h.subscriber("a@example.com", "enabled", nil)
	h.must(h.eng.OnEvent(context.Background(), sub, event(sub, name, h.clock.Now(), nil)))
	h.drain()
	return sub, h.enrollment(auto, sub)
}

func (h *harness) stepRows(enrollmentID int64) []Step {
	h.t.Helper()
	var rows []Step
	h.must(h.db.Select(&rows, `SELECT * FROM enrollment_steps WHERE enrollment_id = $1 ORDER BY started_at, id`, enrollmentID))
	return rows
}

func (h *harness) sentTo(campaign int) int {
	n := 0
	for _, m := range h.sender.Sent {
		if m.CampaignID == campaign {
			n++
		}
	}
	return n
}

// visits reports the visit numbers of a node's step rows.
func visits(rows []Step, node string) []int {
	var out []int
	for _, r := range rows {
		if r.NodeID == node {
			out = append(out, r.Visit)
		}
	}
	return out
}

func TestGoToJoinsAnotherPath(t *testing.T) {
	h := newHarness(t)
	early, mid, tail, no := h.campaign(), h.campaign(), h.campaign(), h.campaign()
	// check: yes -> early -> mid -> tail; no -> noMail -> go to mid.
	g := &Graph{
		Triggers: eventTrigger("go"),
		Root:     "check",
		Nodes: []Node{
			{ID: "check", Type: NodeCondition, Config: cfg(ConditionConfig{Rule: Rule{Type: RuleEvent, Name: "vip", Operator: "occurred"}})},
			tx("early", early), tx("mid", mid), tx("tail", tail), tx("no", no), goTo("g", "mid", 0),
		},
		Edges: []Edge{
			{From: "check", To: "early", Handle: HandleYes}, {From: "early", To: "mid"}, {From: "mid", To: "tail"},
			{From: "check", To: "no", Handle: HandleNo}, {From: "no", To: "g"},
		},
	}
	auto := h.publish("join", g, Settings{})
	_, enr := h.startRun(auto, "go")

	if enr.Status != EnrollmentCompleted {
		t.Fatalf("enrollment = %+v", enr)
	}
	if h.sentTo(no) != 1 || h.sentTo(mid) != 1 || h.sentTo(tail) != 1 || h.sentTo(early) != 0 {
		t.Fatalf("sent = %+v", h.sender.Sent)
	}
	rows := h.stepRows(enr.ID)
	var to string
	for _, r := range rows {
		if r.NodeID == "g" {
			to = string(r.Result)
		}
	}
	if to != `{"to": "mid"}` {
		t.Fatalf("go to result = %s", to)
	}
}

func TestGoBackWaitsAgain(t *testing.T) {
	h := newHarness(t)
	welcome, welcome2, next, stuck, tail := h.campaign(), h.campaign(), h.campaign(), h.campaign(), h.campaign()
	g := &Graph{
		Triggers: eventTrigger("trial_started"),
		Root:     "hi",
		Nodes: []Node{
			tx("hi", welcome),
			{ID: "w", Type: NodeWaitForEvent, Config: cfg(WaitForEventConfig{Timeout: "2d", Events: []WaitEvent{
				{ID: "act", Name: "activated"}, {ID: "again", Name: "trial_started"},
			}})},
			tx("next", next), tx("tail", tail),
			tx("welcome2", welcome2), goTo("back", "w", 0),
			tx("stuck", stuck), goTo("join", "tail", 0),
		},
		Edges: []Edge{
			{From: "hi", To: "w"},
			{From: "w", To: "next", Handle: "act"}, {From: "next", To: "tail"},
			{From: "w", To: "welcome2", Handle: "again"}, {From: "welcome2", To: "back"},
			{From: "w", To: "stuck", Handle: HandleTimeout}, {From: "stuck", To: "join"},
		},
	}
	auto := h.publish("trial", g, Settings{})
	sub, enr := h.startRun(auto, "trial_started")
	if enr.Status != EnrollmentWaiting || *enr.CurrentNode != "w" || enr.CurrentVisit != 1 {
		t.Fatalf("enrollment = %+v", enr)
	}

	ctx := context.Background()
	for i := 1; i <= 2; i++ {
		h.clock.Advance(time.Hour)
		h.must(h.eng.OnEvent(ctx, sub, event(sub, "trial_started", h.clock.Now(), nil)))
		h.drain()
		enr = h.enrollment(auto, sub)
		if enr.Status != EnrollmentWaiting || *enr.CurrentNode != "w" || enr.CurrentVisit != i+1 {
			t.Fatalf("after trial %d: %+v", i+1, enr)
		}
		if h.sentTo(welcome2) != i {
			t.Fatalf("welcome sent %d times after trial %d", h.sentTo(welcome2), i+1)
		}
	}
	rows := h.stepRows(enr.ID)
	if got := visits(rows, "welcome2"); len(got) != 2 || got[0] != 1 || got[1] != 2 {
		t.Fatalf("welcome2 visits = %v", got)
	}
	if got := visits(rows, "w"); len(got) != 3 {
		t.Fatalf("wait visits = %v", got)
	}

	// Nothing more happens: time's up comes 2 days after the last return to the wait.
	h.clock.Advance(47 * time.Hour)
	h.drain()
	if h.sentTo(stuck) != 0 {
		t.Fatal("time's up counted from an earlier visit")
	}
	h.clock.Advance(2 * time.Hour)
	h.drain()
	if h.sentTo(stuck) != 1 || h.sentTo(tail) != 1 || h.enrollment(auto, sub).Status != EnrollmentCompleted {
		t.Fatalf("sent = %+v, enrollment = %+v", h.sender.Sent, h.enrollment(auto, sub))
	}
}

func TestGoBackToADelayDelaysAgain(t *testing.T) {
	h := newHarness(t)
	g, a, b := h.loopGraph(0)
	auto := h.publish("loop", g, Settings{})
	sub, enr := h.startRun(auto, "go")
	if h.sentTo(a) != 1 || h.sentTo(b) != 0 {
		t.Fatalf("sent = %+v", h.sender.Sent)
	}

	h.clock.Advance(25 * time.Hour)
	h.drain()
	enr = h.enrollment(auto, sub)
	if h.sentTo(b) != 1 || h.sentTo(a) != 2 || enr.Status != EnrollmentWaiting || *enr.CurrentNode != "d" || enr.CurrentVisit != 2 {
		t.Fatalf("sent = %+v, enrollment = %+v", h.sender.Sent, enr)
	}
	// The second pass waits the full day again.
	h.clock.Advance(23 * time.Hour)
	h.drain()
	if h.sentTo(b) != 1 {
		t.Fatal("the second delay was skipped")
	}
	h.clock.Advance(2 * time.Hour)
	h.drain()
	if h.sentTo(b) != 2 {
		t.Fatalf("sent = %+v", h.sender.Sent)
	}
}

func TestRevisitedSendIsStillAtMostOnce(t *testing.T) {
	h := newHarness(t)
	g, a, _ := h.loopGraph(0)
	auto := h.publish("loop", g, Settings{})
	sub, enr := h.startRun(auto, "go")
	if h.sentTo(a) != 1 {
		t.Fatalf("sent = %+v", h.sender.Sent)
	}

	// The state a crash leaves on the second arrival at "a": visit 2 is 'sending', nothing else.
	_, err := h.db.Exec(`UPDATE enrollments SET status = 'active', current_node_id = 'a', current_visit = 2, next_run_at = $2 WHERE id = $1`, enr.ID, h.clock.Now())
	h.must(err)
	_, err = h.db.Exec(`INSERT INTO enrollment_steps (enrollment_id, node_id, status, visit) VALUES ($1, 'a', 'sending', 2)`, enr.ID)
	h.must(err)
	h.must(h.eng.Advance(context.Background(), enr.ID))

	if h.sentTo(a) != 1 {
		t.Fatal("it sent again on a visit that was already under way")
	}
	if e := h.enrollment(auto, sub); *e.CurrentNode != "d" || e.CurrentVisit != 2 {
		t.Fatalf("enrollment = %s %d %s", e.Status, e.CurrentVisit, *e.CurrentNode)
	}
}

func TestEventsFromAnEarlierVisitDoNotCount(t *testing.T) {
	h := newHarness(t)
	ok, late, back := h.campaign(), h.campaign(), h.campaign()
	g := &Graph{
		Triggers: eventTrigger("go"),
		Root:     "w",
		Nodes: []Node{
			{ID: "w", Type: NodeWaitForEvent, Config: cfg(WaitForEventConfig{Timeout: "1d", Events: []WaitEvent{{ID: "e1", Name: "ping"}, {ID: "e2", Name: "again"}}})},
			tx("ok", ok), tx("late", late), tx("back", back), goTo("g", "w", 0),
		},
		Edges: []Edge{{From: "w", To: "ok", Handle: "e1"}, {From: "w", To: "back", Handle: "e2"}, {From: "back", To: "g"}, {From: "w", To: "late", Handle: HandleTimeout}},
	}
	auto := h.publish("events", g, Settings{})
	sub, _ := h.startRun(auto, "go")
	ctx := context.Background()

	// "ping" arrives, but the run is already gone round again by the time it is looked at: it is
	// recorded before the second arrival, so it must not resolve the second wait.
	h.clock.Advance(time.Minute)
	earlier := event(sub, "ping", h.clock.Now().Add(-time.Second), nil)
	h.clock.Advance(time.Minute)
	h.must(h.eng.OnEvent(ctx, sub, event(sub, "again", h.clock.Now(), nil)))
	h.drain()
	if e := h.enrollment(auto, sub); e.CurrentVisit != 2 || e.Status != EnrollmentWaiting {
		t.Fatalf("enrollment = %+v", e)
	}
	h.must(h.eng.OnEvent(ctx, sub, earlier))
	h.drain()
	if h.sentTo(ok) != 0 {
		t.Fatal("an event from before the second arrival resolved the wait")
	}
	h.must(h.eng.OnEvent(ctx, sub, event(sub, "ping", h.clock.Now(), nil)))
	h.drain()
	if h.sentTo(ok) != 1 {
		t.Fatalf("sent = %+v", h.sender.Sent)
	}
}

func TestLoopLimitExits(t *testing.T) {
	h := newHarness(t)
	g, a, _ := h.loopGraph(2)
	auto := h.publish("loop", g, Settings{})
	sub, _ := h.startRun(auto, "go")
	for range 5 {
		h.clock.Advance(25 * time.Hour)
		h.drain()
	}

	enr := h.enrollment(auto, sub)
	if enr.Status != EnrollmentExited || enr.ExitReason == nil || *enr.ExitReason != ExitLoopLimit {
		t.Fatalf("enrollment = %+v", enr)
	}
	// Passed through twice, so the email went three times (the first arrival plus two returns).
	if h.sentTo(a) != 3 {
		t.Fatalf("sent %d", h.sentTo(a))
	}
	rows := h.stepRows(enr.ID)
	last := rows[len(rows)-1]
	if last.NodeID != "g" || last.Status != StepSkipped || string(last.Result) != `{"reason": "loop_limit"}` || last.Visit != 3 {
		t.Fatalf("last step = %+v (%s)", last, last.Result)
	}
}

func TestLoopLimitDefaultsTo25(t *testing.T) {
	h := newHarness(t)
	g, _, b := h.loopGraph(0)
	auto := h.publish("loop", g, Settings{})
	sub, _ := h.startRun(auto, "go")
	for range 40 {
		h.clock.Advance(25 * time.Hour)
		h.drain()
	}
	enr := h.enrollment(auto, sub)
	if enr.Status != EnrollmentExited || *enr.ExitReason != ExitLoopLimit {
		t.Fatalf("enrollment = %+v", enr)
	}
	if h.sentTo(b) != 26 {
		t.Fatalf("passed %d times, want 25 through and a 26th that stops", h.sentTo(b))
	}
}

func TestOpenedConditionLooksAtTheLatestSend(t *testing.T) {
	h := newHarness(t)
	a, yes, no := h.campaign(), h.campaign(), h.campaign()
	// a, wait 1d, if a not opened -> yes else no; the loop only goes round via the "no" branch.
	g := &Graph{
		Triggers: eventTrigger("go"),
		Root:     "a",
		Nodes: []Node{
			tx("a", a), {ID: "d", Type: NodeDelay, Config: cfg(DelayConfig{Duration: "1d"})},
			{ID: "c", Type: NodeCondition, Config: cfg(ConditionConfig{Rule: Rule{Type: RuleStep, NodeID: "a", Operator: "not_opened"}})},
			tx("yes", yes), tx("no", no), goTo("g", "a", 0),
		},
		Edges: []Edge{{From: "a", To: "d"}, {From: "d", To: "c"}, {From: "c", To: "yes", Handle: HandleYes}, {From: "c", To: "no", Handle: HandleNo}, {From: "no", To: "g"}},
	}
	auto := h.publish("opens", g, Settings{})
	sub, _ := h.startRun(auto, "go")

	// Opened during visit 1, so the first condition takes "no" and goes round.
	h.clock.Advance(time.Hour)
	_, err := h.db.Exec(`INSERT INTO campaign_views (campaign_id, subscriber_id, created_at) VALUES ($1, $2, NOW())`, a, sub)
	h.must(err)
	h.clock.Advance(24 * time.Hour)
	h.drain()
	if h.sentTo(no) != 1 || h.sentTo(a) != 2 {
		t.Fatalf("sent = %+v", h.sender.Sent)
	}

	// Sent again on visit 2 and not opened: the old open no longer counts.
	h.clock.Advance(25 * time.Hour)
	h.drain()
	if h.sentTo(yes) != 1 || h.sentTo(no) != 1 {
		t.Fatalf("sent = %+v", h.sender.Sent)
	}
}

func TestStatsCountPeople(t *testing.T) {
	h := newHarness(t)
	g, _, _ := h.loopGraph(0)
	auto := h.publish("loop", g, Settings{})
	_, enr := h.startRun(auto, "go")
	h.clock.Advance(25 * time.Hour)
	h.drain()
	h.clock.Advance(25 * time.Hour)
	h.drain()
	if got := visits(h.stepRows(enr.ID), "a"); len(got) != 3 {
		t.Fatalf("visits of a = %v", got)
	}

	stats, err := h.store.NodeStats(context.Background(), auto)
	h.must(err)
	for _, s := range stats {
		if s.NodeID == "a" && (s.Entered != 1 || s.Done != 1) {
			t.Fatalf("stats for a = %+v", s)
		}
	}
}

func TestTheStepRuleLooksAtTheLatestVisit(t *testing.T) {
	// Covered by TestOpenedConditionLooksAtTheLatestSend; this checks the query itself does not error
	// when a step has several visits (a scalar subquery would).
	h := newHarness(t)
	g, a, _ := h.loopGraph(0)
	auto := h.publish("loop", g, Settings{})
	sub, _ := h.startRun(auto, "go")
	h.clock.Advance(25 * time.Hour)
	h.drain()
	enr := h.enrollment(auto, sub)
	ok, err := h.eng.evalRule(context.Background(), Rule{Type: RuleStep, NodeID: "a", Operator: "not_opened"}, h.eng.env(NewIndex(g), &enr, h.clock.Now()), sub)
	if err != nil || !ok || a == 0 {
		t.Fatalf("ok = %v, err = %v", ok, err)
	}
}

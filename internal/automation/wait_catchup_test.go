package automation

import (
	"context"
	"testing"
	"time"
)

// Events are often recorded in a batch, a little after they happen, so the event a wait is for can
// be recorded before the run has got to the wait.

func (h *harness) record(sub int, name string, at time.Time) *Event {
	h.t.Helper()
	ev, _, err := h.eng.RecordEvent(context.Background(), sub, name, cfg(map[string]any{}), "", at)
	h.must(err)
	return ev
}

func TestWaitCountsAnEventRecordedBeforeItStarted(t *testing.T) {
	h := newHarness(t)
	g, late, ok := h.waitGraph("1h", true)
	auto := h.publish("abandoned", g, Settings{})
	sub := h.subscriber("a@example.com", "enabled", nil)

	// Both recorded together a minute later, before the run starts.
	start := h.clock.Now()
	h.record(sub, "checkout_started", start)
	paid := h.record(sub, "order_completed", start.Add(10*time.Second))
	h.clock.Advance(time.Minute)
	h.drain()

	if h.sender.count() != 1 || h.sender.Sent[0].CampaignID != ok {
		t.Fatalf("sent = %+v", h.sender.Sent)
	}
	enr := h.enrollment(auto, sub)
	if r := h.waitResult(enr.ID, "w"); r.Branch != "e1" || r.EventID != paid.ID || !r.Since.Equal(start) {
		t.Fatalf("result = %+v", r)
	}
	h.clock.Advance(2 * time.Hour)
	h.drain()
	if h.sender.count() != 1 || h.sender.Sent[0].CampaignID == late {
		t.Fatalf("sent = %+v", h.sender.Sent)
	}
}

func TestWaitRestartsOnAnEventRecordedBeforeItStarted(t *testing.T) {
	h := newHarness(t)
	g, late, _ := h.waitGraph("1h", true)
	auto := h.publish("abandoned", g, Settings{})
	sub := h.subscriber("a@example.com", "enabled", nil)

	start := h.clock.Now()
	h.record(sub, "checkout_started", start)
	again := h.record(sub, "checkout_started", start.Add(30*time.Second))
	h.clock.Advance(time.Minute)
	h.drain()

	// The second checkout restarted the wait (once); the one that started the run didn't.
	enr := h.enrollment(auto, sub)
	r := h.waitResult(enr.ID, "w")
	if r.Restarts != 1 || !r.Until.Equal(again.OccurredAt.Add(time.Hour)) {
		t.Fatalf("result = %+v", r)
	}
	// Its own event job, which runs after the wait has started, changes nothing.
	if h.drain(); h.waitResult(enr.ID, "w").Restarts != 1 {
		t.Fatalf("result = %+v", h.waitResult(enr.ID, "w"))
	}

	h.clock.Advance(time.Hour - 45*time.Second)
	h.drain()
	if h.sender.count() != 0 {
		t.Fatal("sent before the restarted time was up")
	}
	h.clock.Advance(time.Minute)
	h.drain()
	if h.sender.count() != 1 || h.sender.Sent[0].CampaignID != late {
		t.Fatalf("sent = %+v", h.sender.Sent)
	}
}

func TestWaitIgnoresEventsFromBeforeItWasReached(t *testing.T) {
	h := newHarness(t)
	g, late, _ := h.waitGraph("1h", true)
	auto := h.publish("abandoned", g, Settings{})
	sub := h.subscriber("a@example.com", "enabled", nil)

	// Paid before this checkout: not what the wait is for.
	h.record(sub, "order_completed", h.clock.Now().Add(-time.Minute))
	h.record(sub, "checkout_started", h.clock.Now())
	h.clock.Advance(time.Minute)
	h.drain()
	if enr := h.enrollment(auto, sub); enr.Status != EnrollmentWaiting || h.sender.count() != 0 {
		t.Fatalf("enrollment = %+v, sent = %+v", enr, h.sender.Sent)
	}

	// After a delay: an event during the delay is from before the wait too.
	late2 := h.campaign()
	g2 := &Graph{
		Triggers: []Trigger{{ID: "t", Type: TriggerEvent, Config: cfg(TriggerConfig{Event: "trial_started"})}},
		Root:     "d",
		Nodes: []Node{
			{ID: "d", Type: NodeDelay, Config: cfg(DelayConfig{Duration: "1h"})},
			{ID: "w", Type: NodeWaitForEvent, Config: cfg(WaitForEventConfig{Timeout: "1h", Events: []WaitEvent{{ID: "e1", Name: "activated"}}})},
			{ID: "late", Type: NodeSendEmail, Config: mail(MessageTransactional, 0, late2)},
		},
		Edges: []Edge{{From: "d", To: "w"}, {From: "w", To: "late", Handle: HandleTimeout}},
	}
	auto2 := h.publish("trial", g2, Settings{})
	sub2 := h.subscriber("b@example.com", "enabled", nil)
	h.record(sub2, "trial_started", h.clock.Now())
	h.clock.Advance(time.Minute)
	h.drain()
	h.clock.Advance(30 * time.Minute)
	h.record(sub2, "activated", h.clock.Now())
	h.clock.Advance(time.Minute)
	h.drain()
	h.clock.Advance(30 * time.Minute)
	h.drain()
	enr := h.enrollment(auto2, sub2)
	if enr.Status != EnrollmentWaiting || *enr.CurrentNode != "w" {
		t.Fatalf("enrollment = %+v", enr)
	}
	h.clock.Advance(time.Hour)
	h.drain()
	if h.sentTo(late) != 1 || h.sentTo(late2) != 1 {
		t.Fatalf("sent = %+v", h.sender.Sent)
	}
}

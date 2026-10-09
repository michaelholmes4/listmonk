package automation

import (
	"context"
	"errors"
	"testing"
)

func TestEnrollManually(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	steps := []Node{{ID: "d", Type: NodeDelay, Config: cfg(DelayConfig{Duration: "1d"})}}
	manual := h.publish("by hand", &Graph{Triggers: []Trigger{{ID: "t1", Type: TriggerManual}}, Root: "d", Nodes: steps}, Settings{})
	list := h.list("news", "single")
	listOnly := h.publish("list only", &Graph{Triggers: listTrigger(list), Root: "d", Nodes: steps}, Settings{})

	a := h.subscriber("a@example.com", "enabled", nil)
	b := h.subscriber("b@example.com", "enabled", nil)
	blocked := h.subscriber("c@example.com", "blocklisted", nil)

	n, err := h.eng.EnrollManually(ctx, manual, []int{a, b, blocked, 999999})
	h.must(err)
	if n != 2 {
		t.Fatalf("enrolled = %d, want 2 (not the blocklisted or missing subscriber)", n)
	}
	var trig string
	h.must(h.db.Get(&trig, `SELECT context->>'trigger' FROM enrollments WHERE automation_id = $1 AND subscriber_id = $2`, manual, a))
	if trig != TriggerManual {
		t.Fatalf("trigger = %q", trig)
	}
	// Already inside: skipped, not an error.
	if n, err := h.eng.EnrollManually(ctx, manual, []int{a}); err != nil || n != 0 {
		t.Fatalf("again: %d %v", n, err)
	}

	// No manual trigger: refused, even though the automation is live.
	if _, err := h.eng.EnrollManually(ctx, listOnly, []int{a}); !errors.Is(err, ErrConflict) {
		t.Fatalf("no manual trigger: err = %v", err)
	}
	// The publish-time backfill still enrolls whatever the triggers.
	if n, err := h.eng.EnrollMany(ctx, listOnly, []int{a}, TriggerListJoined); err != nil || n != 1 {
		t.Fatalf("backfill: %d %v", n, err)
	}

	// Not active: refused.
	_, err = h.eng.Pause(ctx, manual)
	h.must(err)
	if _, err := h.eng.EnrollManually(ctx, manual, []int{b}); !errors.Is(err, ErrConflict) {
		t.Fatalf("paused: err = %v", err)
	}
	if _, err := h.eng.EnrollManually(ctx, 999999, []int{a}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing automation: err = %v", err)
	}
}

func TestManualTriggerCountsOnceItIsPublished(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	list := h.list("news", "single")
	steps := []Node{{ID: "d", Type: NodeDelay, Config: cfg(DelayConfig{Duration: "1d"})}}
	auto := h.publish("a", &Graph{Triggers: listTrigger(list), Root: "d", Nodes: steps}, Settings{})
	sub := h.subscriber("a@example.com", "enabled", nil)

	// A manual trigger in the draft does nothing until it is published.
	g := &Graph{Triggers: append(listTrigger(list), Trigger{ID: "t2", Type: TriggerManual}), Root: "d", Nodes: steps}
	_, _, err := h.store.SaveDraft(ctx, auto, g, true)
	h.must(err)
	if _, err := h.eng.EnrollManually(ctx, auto, []int{sub}); !errors.Is(err, ErrConflict) {
		t.Fatalf("draft only: err = %v", err)
	}
	rows, _, err := h.store.List(ctx, ListOpts{Manual: true})
	h.must(err)
	if len(rows) != 0 {
		t.Fatalf("listed as manual before publishing: %d", len(rows))
	}

	_, _, err = h.store.Publish(ctx, auto, true)
	h.must(err)
	if n, err := h.eng.EnrollManually(ctx, auto, []int{sub}); err != nil || n != 1 {
		t.Fatalf("published: %d %v", n, err)
	}
	rows, _, err = h.store.List(ctx, ListOpts{Manual: true})
	h.must(err)
	if len(rows) != 1 || rows[0].ID != auto {
		t.Fatalf("manual listing = %+v", rows)
	}
}

package automation

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"
)

func TestRecordEventIsIdempotentPerKey(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	sub := h.subscriber("e@x.io", "enabled", nil)

	ev, created, err := h.store.RecordEvent(ctx, sub, "signed_up", json.RawMessage(`{"plan":"pro"}`), "k1", time.Now())
	if err != nil || !created || ev == nil || ev.ID == 0 {
		t.Fatalf("first: %v %v %v", ev, created, err)
	}
	if _, created, err := h.store.RecordEvent(ctx, sub, "signed_up", nil, "k1", time.Now()); err != nil || created {
		t.Fatalf("repeat with the same key: created=%v err=%v", created, err)
	}
	// No key: every call is a new event. A key is per subscriber.
	for i := 0; i < 2; i++ {
		if _, created, _ := h.store.RecordEvent(ctx, sub, "signed_up", nil, "", time.Now()); !created {
			t.Fatal("events without a key must always be recorded")
		}
	}
	other := h.subscriber("f@x.io", "enabled", nil)
	if _, created, _ := h.store.RecordEvent(ctx, other, "signed_up", nil, "k1", time.Now()); !created {
		t.Fatal("the same key for another subscriber is a different event")
	}

	evs, total, err := h.store.Events(ctx, sub, 1, 10)
	if err != nil || total != 3 || len(evs) != 3 {
		t.Fatalf("events: total=%d len=%d err=%v", total, len(evs), err)
	}
	n, err := h.store.DeleteEventsBefore(ctx, time.Now().Add(time.Hour))
	if err != nil || n != 4 {
		t.Fatalf("delete: %d %v", n, err)
	}
}

func TestStepCampaignsAreHiddenAndOnlyAutomationOnesCanBeUsed(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	list := h.list("topic", "single")

	id, err := h.store.CreateStepCampaign(ctx, StepCampaign{Name: "Welcome", Messenger: "email", FromEmail: "a@b.c", ListID: list})
	if err != nil {
		t.Fatal(err)
	}
	var typ, status string
	var lists int
	h.must(h.db.QueryRow(`SELECT type::TEXT, status::TEXT FROM campaigns WHERE id = $1`, id).Scan(&typ, &status))
	h.must(h.db.Get(&lists, `SELECT COUNT(*) FROM campaign_lists WHERE campaign_id = $1 AND list_id = $2`, id, list))
	// Cancelled, so stock listmonk can never start it at the topic list.
	if typ != "automation" || status != "cancelled" || lists != 1 {
		t.Fatalf("type=%s status=%s linked lists=%d", typ, status, lists)
	}

	// An ordinary campaign cannot be used as a step's content.
	var regular int
	h.must(h.db.Get(&regular, `INSERT INTO campaigns (uuid, name, subject, from_email, body, messenger, type) VALUES (gen_random_uuid(), 'r', 's', 'a@b.c', 'b', 'email', 'regular') RETURNING id`))
	a, err := h.store.Create(ctx, "x", Settings{})
	h.must(err)
	g := &Graph{Triggers: listTrigger(list), Root: "m", Nodes: []Node{{ID: "m", Type: NodeSendEmail, Config: mail(MessageMarketing, list, regular)}}}
	_, problems, err := h.store.SaveDraft(ctx, a.ID, g, false)
	if err == nil && len(problems) == 0 {
		t.Fatal("an ordinary campaign was accepted as an email step")
	}

	// A good step links its campaign to the step's topic, even when the topic changed.
	other := h.list("other", "single")
	g = &Graph{Triggers: listTrigger(list), Root: "m", Nodes: []Node{{ID: "m", Type: NodeSendEmail, Config: mail(MessageMarketing, other, id)}}}
	if _, problems, err := h.store.SaveDraft(ctx, a.ID, g, false); err != nil || len(problems) > 0 {
		t.Fatalf("save: %v %v", problems, err)
	}
	var linked []int
	h.must(h.db.Select(&linked, `SELECT list_id FROM campaign_lists WHERE campaign_id = $1`, id))
	if len(linked) != 1 || linked[0] != other {
		t.Fatalf("campaign lists = %v, want [%d]", linked, other)
	}

	// A transactional step has no topic: its campaign is unlinked, whatever list_id says.
	g = &Graph{Triggers: listTrigger(list), Root: "m", Nodes: []Node{{ID: "m", Type: NodeSendEmail, Config: mail(MessageTransactional, other, id)}}}
	if _, problems, err := h.store.SaveDraft(ctx, a.ID, g, false); err != nil || len(problems) > 0 {
		t.Fatalf("save: %v %v", problems, err)
	}
	linked = nil
	h.must(h.db.Select(&linked, `SELECT list_id FROM campaign_lists WHERE campaign_id = $1`, id))
	if len(linked) != 0 {
		t.Fatalf("transactional campaign lists = %v, want none", linked)
	}
}

func TestStepCampaignsDoNotShowInCampaignQueries(t *testing.T) {
	h := newHarness(t)
	list := h.list("topic", "single")
	_, err := h.store.CreateStepCampaign(context.Background(), StepCampaign{Name: "Hidden", Messenger: "email", FromEmail: "a@b.c", ListID: list})
	h.must(err)
	var n int
	h.must(h.db.Get(&n, `SELECT COUNT(*) FROM campaigns WHERE type != 'automation'`))
	if n != 0 {
		t.Fatalf("test setup: %d ordinary campaigns", n)
	}
}

func TestEnrollmentListingAndPaging(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	list := h.list("topic", "single")
	camp := h.campaign()
	auto := h.publish("a", &Graph{Triggers: listTrigger(list), Root: "d", Nodes: []Node{{ID: "d", Type: NodeDelay, Config: cfg(DelayConfig{Duration: "1h"})}}}, Settings{})
	_ = camp
	for _, e := range []string{"a@x.io", "b@x.io", "c@x.io"} {
		sub := h.subscriber(e, "enabled", nil)
		if _, err := h.eng.Enroll(ctx, auto, sub, EnrollContext{Trigger: TriggerManual}); err != nil {
			t.Fatal(err)
		}
	}
	h.drain()

	rows, total, err := h.store.Enrollments(ctx, auto, []EnrollmentStatus{EnrollmentWaiting}, "", 1, 2)
	if err != nil || total != 3 || len(rows) != 2 {
		t.Fatalf("page 1: total=%d len=%d err=%v", total, len(rows), err)
	}
	rows, total, _ = h.store.Enrollments(ctx, auto, nil, "b@x", 1, 10)
	if total != 1 || len(rows) != 1 || rows[0].Email != "b@x.io" {
		t.Fatalf("search: %d %+v", total, rows)
	}
	if _, err := h.store.Get(ctx, 9999); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing automation: %v", err)
	}
	stats, err := h.store.NodeStats(ctx, auto)
	if err != nil || len(stats) != 1 || stats[0].NodeID != "d" || stats[0].Waiting != 3 {
		t.Fatalf("stats: %+v %v", stats, err)
	}
}

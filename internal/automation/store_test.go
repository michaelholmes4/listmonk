package automation

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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

	// Saving a draft doesn't touch the campaign's list; publishing links it to the step's topic.
	other := h.list("other", "single")
	g = &Graph{Triggers: listTrigger(list), Root: "m", Nodes: []Node{{ID: "m", Type: NodeSendEmail, Config: mail(MessageMarketing, other, id)}}}
	if _, problems, err := h.store.SaveDraft(ctx, a.ID, g, false); err != nil || len(problems) > 0 {
		t.Fatalf("save: %v %v", problems, err)
	}
	if got := h.campaignLists(id); len(got) != 1 || got[0] != list {
		t.Fatalf("after saving the draft: campaign lists = %v, want [%d]", got, list)
	}
	_, v, err := h.store.Publish(ctx, a.ID, false)
	h.must(err)
	// Nothing else sends this campaign, so it is relinked in place rather than copied.
	if c := h.stepCampaign(v, "m"); c != id {
		t.Fatalf("published step campaign = %d, want %d", c, id)
	}
	if got := h.campaignLists(id); len(got) != 1 || got[0] != other {
		t.Fatalf("campaign lists = %v, want [%d]", got, other)
	}
}

func TestChangingALiveEmailsTopicKeepsItsUnsubscribeLink(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	newsletter, updates := h.list("newsletter", "single"), h.list("updates", "single")
	camp := h.campaign()
	_, err := h.db.Exec(`INSERT INTO campaign_lists (campaign_id, list_id, list_name) VALUES ($1, $2, 'newsletter')`, camp, newsletter)
	h.must(err)
	g := &Graph{Triggers: listTrigger(newsletter), Root: "d", Nodes: []Node{
		{ID: "d", Type: NodeDelay, Config: cfg(DelayConfig{Duration: "1d"})},
		{ID: "m", Type: NodeSendEmail, Config: mail(MessageMarketing, newsletter, camp)},
	}, Edges: []Edge{{From: "d", To: "m"}}}
	auto := h.publish("live", g, Settings{})

	// The draft moves the email to another topic.
	g.Nodes[1].Config = mail(MessageMarketing, updates, camp)
	_, _, err = h.store.SaveDraft(ctx, auto, g, false)
	h.must(err)
	if got := h.campaignLists(camp); len(got) != 1 || got[0] != newsletter {
		t.Fatalf("a draft save changed the live email's list: %v", got)
	}

	// Publishing gives the new version a copy on the new topic; the live email keeps its own.
	_, v, err := h.store.Publish(ctx, auto, false)
	h.must(err)
	cp := h.stepCampaign(v, "m")
	if cp == camp || cp == 0 {
		t.Fatalf("published step campaign = %d, want a copy of %d", cp, camp)
	}
	if got := h.campaignLists(camp); len(got) != 1 || got[0] != newsletter {
		t.Fatalf("original email lists = %v, want [%d]", got, newsletter)
	}
	if got := h.campaignLists(cp); len(got) != 1 || got[0] != updates {
		t.Fatalf("copy lists = %v, want [%d]", got, updates)
	}
	var typ, subject string
	h.must(h.db.QueryRow(`SELECT type::TEXT, subject FROM campaigns WHERE id = $1`, cp).Scan(&typ, &subject))
	if typ != "automation" || subject != "s" {
		t.Fatalf("copy: type=%s subject=%q", typ, subject)
	}
	// The next draft starts from the published graph, so it edits the copy.
	d, err := h.store.Draft(ctx, auto)
	h.must(err)
	if c := h.stepCampaign(d, "m"); c != cp {
		t.Fatalf("next draft's step campaign = %d, want %d", c, cp)
	}

	// Becoming transactional takes the topic off (again on a copy: the current version still uses it).
	g.Nodes[1].Config = mail(MessageTransactional, 0, cp)
	_, _, err = h.store.SaveDraft(ctx, auto, g, false)
	h.must(err)
	_, v, err = h.store.Publish(ctx, auto, false)
	h.must(err)
	if tx := h.stepCampaign(v, "m"); tx == cp || len(h.campaignLists(tx)) != 0 || len(h.campaignLists(cp)) != 1 {
		t.Fatalf("transactional copy %d lists %v; previous %d lists %v", tx, h.campaignLists(tx), cp, h.campaignLists(cp))
	}
}

func (h *harness) campaignLists(id int) []int {
	h.t.Helper()
	var out []int
	h.must(h.db.Select(&out, `SELECT list_id FROM campaign_lists WHERE campaign_id = $1 ORDER BY list_id`, id))
	return out
}

func (h *harness) stepCampaign(v *Version, node string) int {
	h.t.Helper()
	g, err := ParseGraph(v.Graph)
	h.must(err)
	c, _ := NewIndex(g).CampaignOf(node)
	return c
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

func TestPublishChecksSeeTheGraphAndCanRefuseIt(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	trig, topic, add, looked := h.list("trigger", "single"), h.list("topic", "single"), h.list("add", "single"), h.list("looked", "single")
	g := &Graph{Triggers: listTrigger(trig), Root: "c", Nodes: []Node{
		{ID: "c", Type: NodeCondition, Config: cfg(ConditionConfig{Rule: Rule{Op: "or", Rules: []Rule{{Type: RuleList, ListID: looked, Operator: "is_member"}}}})},
		{ID: "m", Type: NodeSendEmail, Config: mail(MessageMarketing, topic, h.campaign())},
		{ID: "a", Type: NodeAddToList, Config: cfg(ListConfig{ListID: add})},
		{ID: "t", Type: NodeSendEmail, Config: mail(MessageTransactional, 0, h.campaign())},
	}, Edges: []Edge{{From: "c", To: "m", Handle: HandleYes}, {From: "c", To: "t", Handle: HandleNo}, {From: "m", To: "a"}}}

	acts, reads := g.ListRefs()
	if fmt.Sprint(acts) != fmt.Sprint([]int{trig, topic, add}) || fmt.Sprint(reads) != fmt.Sprint([]int{looked}) || !g.HasTransactional() {
		t.Fatalf("acts=%v reads=%v transactional=%v", acts, reads, g.HasTransactional())
	}

	a, err := h.store.Create(ctx, "perms", Settings{})
	h.must(err)
	_, problems, err := h.store.SaveDraft(ctx, a.ID, g, false)
	h.must(err)
	if len(problems) > 0 {
		t.Fatal(messages(problems))
	}
	refused := errors.New("refused")
	if _, _, err := h.store.Publish(ctx, a.ID, false, func(*Graph) error { return refused }); !errors.Is(err, refused) {
		t.Fatalf("publish: %v", err)
	}
	if got, _ := h.store.Get(ctx, a.ID); got.Status != StatusDraft || got.CurrentVersionID != nil {
		t.Fatalf("a refused publish went live: %+v", got)
	}
}

func TestStepsCarryTheDeliveryOutcomeOfTheirEmail(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	list := h.list("l", "single")
	auto := h.publish("d", &Graph{Triggers: listTrigger(list), Root: "m", Nodes: []Node{
		{ID: "m", Type: NodeSendEmail, Config: mail(MessageTransactional, 0, h.campaign())},
	}}, Settings{})
	sub := h.subscriber("a@example.com", "enabled", nil)
	h.must(h.eng.OnListJoined(ctx, sub, list))
	h.drain()
	enr := h.enrollment(auto, sub)

	steps, err := h.store.Steps(ctx, enr.ID)
	h.must(err)
	if len(steps) != 1 || steps[0].DeliveryStatus != nil {
		t.Fatalf("before the message is logged: %+v", steps)
	}

	// The messenger refused it (what the message log records after the step was already done).
	_, err = h.db.Exec(`INSERT INTO librelist_messages (source, status, error, subscriber_id, automation_id, enrollment_id)
		VALUES ('automation', 'failed', 'smtp: 550 mailbox unavailable', $1, $2, $3)`, sub, auto, enr.ID)
	h.must(err)
	steps, err = h.store.Steps(ctx, enr.ID)
	h.must(err)
	if steps[0].Status != StepDone || steps[0].DeliveryStatus == nil || *steps[0].DeliveryStatus != "failed" ||
		steps[0].DeliveryError == nil || *steps[0].DeliveryError != "smtp: 550 mailbox unavailable" || steps[0].MessageLogID == nil {
		t.Fatalf("after: %+v", steps[0])
	}
}

// Editing a step campaign changes every step that sends it, drafts included, so all of them are found.
func TestCampaignSteps(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	list := h.list("topic", "single")
	camp, unused := h.campaign(), h.campaign()

	h.publish("live", &Graph{Triggers: listTrigger(list), Root: "m", Nodes: []Node{{ID: "m", Type: NodeSendEmail, Config: mail(MessageMarketing, list, camp)}}}, Settings{})
	draft, err := h.store.Create(ctx, "draft", Settings{})
	h.must(err)
	_, _, err = h.store.SaveDraft(ctx, draft.ID, &Graph{Triggers: listTrigger(list), Root: "m", Nodes: []Node{{ID: "m", Type: NodeSendEmail, Config: mail(MessageTransactional, 0, camp)}}}, true)
	h.must(err)

	steps, err := h.store.CampaignSteps(ctx, camp)
	h.must(err)
	var marketing, transactional int
	for _, s := range steps {
		switch {
		case s.MessageType == MessageMarketing && s.ListID == list:
			marketing++
		case s.MessageType == MessageTransactional:
			transactional++
		}
	}
	if marketing != 1 || transactional != 1 {
		t.Fatalf("steps = %+v, want the published marketing step and the draft's transactional one", steps)
	}

	if steps, err := h.store.CampaignSteps(ctx, unused); err != nil || len(steps) != 0 {
		t.Fatalf("unused campaign: %+v %v", steps, err)
	}
}

// Only a draft or an archived automation can be deleted, and the delete itself checks: a live one
// keeps its runs however the requests interleave.
func TestDeleteOnlyWhenNotLive(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	list := h.list("l", "single")
	g := &Graph{Triggers: listTrigger(list), Root: "m", Nodes: []Node{{ID: "m", Type: NodeSendEmail, Config: mail(MessageMarketing, list, h.campaign())}}}

	live := h.publish("live", g, Settings{})
	if err := h.store.Delete(ctx, live); !errors.Is(err, ErrConflict) {
		t.Fatalf("deleting an active automation: %v, want a conflict", err)
	}
	if _, err := h.store.Get(ctx, live); err != nil {
		t.Fatalf("the active automation is gone: %v", err)
	}

	draft, err := h.store.Create(ctx, "draft", Settings{})
	h.must(err)
	h.must(h.store.Delete(ctx, draft.ID))
	if _, err := h.store.Get(ctx, draft.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("draft still there: %v", err)
	}

	_, err = h.store.SetStatus(ctx, live, StatusActive, StatusArchived)
	h.must(err)
	h.must(h.store.Delete(ctx, live))

	if err := h.store.Delete(ctx, live); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleting a missing automation: %v, want not found", err)
	}
}

package automation

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"
)

// welcome: email -> wait 2d -> clicked? yes: set attribute / no: nudge email.
func (h *harness) welcomeGraph(list, first, nudge int) *Graph {
	return &Graph{
		Triggers: listTrigger(list),
		Root:     "mail",
		Nodes: []Node{
			{ID: "mail", Type: NodeSendEmail, Config: mail(MessageMarketing, list, first)},
			{ID: "wait", Type: NodeDelay, Config: cfg(DelayConfig{Duration: "2d"})},
			{ID: "check", Type: NodeCondition, Config: cfg(ConditionConfig{Rule: Rule{Type: RuleStep, NodeID: "mail", Operator: "clicked"}})},
			{ID: "tag", Type: NodeUpdateAttribute, Config: cfg(UpdateAttributeConfig{Attribute: "engaged", Value: cfg(true)})},
			{ID: "nudge", Type: NodeSendEmail, Config: mail(MessageMarketing, list, nudge)},
		},
		Edges: []Edge{
			{From: "mail", To: "wait"}, {From: "wait", To: "check"},
			{From: "check", To: "tag", Handle: HandleYes}, {From: "check", To: "nudge", Handle: HandleNo},
		},
	}
}

func TestWelcomeFlowWaitsThenBranches(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	list := h.list("news", "single")
	first, nudge := h.campaign(), h.campaign()
	auto := h.publish("welcome", h.welcomeGraph(list, first, nudge), Settings{})

	sub := h.subscriber("a@example.com", "enabled", nil)
	h.subscribe(sub, list, "confirmed")
	h.must(h.eng.OnListJoined(ctx, sub, list))

	// Joining the list starts it: the first email goes out and the enrollment waits two days.
	h.drain()
	if h.sender.count() != 1 || h.sender.Sent[0].CampaignID != first || h.sender.Sent[0].SubscriberID != sub {
		t.Fatalf("sent = %+v", h.sender.Sent)
	}
	enr := h.enrollment(auto, sub)
	if enr.Status != EnrollmentWaiting || *enr.CurrentNode != "wait" || enr.NextRunAt == nil {
		t.Fatalf("enrollment = %+v", enr)
	}
	if want := h.clock.Now().Add(48 * time.Hour); enr.NextRunAt.Sub(want).Abs() > time.Second {
		t.Fatalf("wakes at %v, want %v", enr.NextRunAt, want)
	}
	if got := h.steps(enr.ID); got["mail"] != StepDone || got["wait"] != StepWaiting {
		t.Fatalf("steps = %v", got)
	}

	// A day later nothing happens, however often it is woken.
	h.clock.Advance(24 * time.Hour)
	h.must(h.eng.Advance(ctx, enr.ID))
	h.must(h.eng.Advance(ctx, enr.ID))
	if h.sender.count() != 1 || h.enrollment(auto, sub).Status != EnrollmentWaiting {
		t.Fatal("it moved before the delay was up")
	}

	// After two days: they never clicked, so the nudge goes.
	h.clock.Advance(25 * time.Hour)
	h.drain()
	if h.sender.count() != 2 || h.sender.Sent[1].CampaignID != nudge {
		t.Fatalf("sent = %+v", h.sender.Sent)
	}
	enr = h.enrollment(auto, sub)
	if enr.Status != EnrollmentCompleted {
		t.Fatalf("status = %s", enr.Status)
	}
	if got := h.steps(enr.ID); got["check"] != StepDone || got["nudge"] != StepDone || got["tag"] != "" {
		t.Fatalf("steps = %v", got)
	}
}

func TestClickedBranchTakesYes(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	list := h.list("news", "single")
	first, nudge := h.campaign(), h.campaign()
	auto := h.publish("welcome", h.welcomeGraph(list, first, nudge), Settings{})
	sub := h.subscriber("a@example.com", "enabled", nil)
	h.subscribe(sub, list, "confirmed")
	h.must(h.eng.OnListJoined(ctx, sub, list))
	h.drain()

	// They click the first email's link (tracking records it against its hidden campaign).
	h.clock.Advance(time.Hour)
	var link int
	h.must(h.db.Get(&link, `INSERT INTO links (uuid, url) VALUES (gen_random_uuid(), 'https://x.test') RETURNING id`))
	_, err := h.db.Exec(`INSERT INTO link_clicks (campaign_id, link_id, subscriber_id, created_at) VALUES ($1, $2, $3, $4)`, first, link, sub, h.clock.Now())
	h.must(err)

	h.clock.Advance(48 * time.Hour)
	h.drain()
	if h.sender.count() != 1 {
		t.Fatalf("the nudge went to someone who clicked: %+v", h.sender.Sent)
	}
	enr := h.enrollment(auto, sub)
	if enr.Status != EnrollmentCompleted || h.steps(enr.ID)["tag"] != StepDone {
		t.Fatalf("enrollment = %+v steps = %v", enr, h.steps(enr.ID))
	}
	var attribs string
	h.must(h.db.Get(&attribs, `SELECT attribs::TEXT FROM subscribers WHERE id = $1`, sub))
	if attribs != `{"engaged": true}` {
		t.Fatalf("attribs = %s", attribs)
	}
}

func TestAClickBeforeTheSendDoesNotCount(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	list := h.list("news", "single")
	first, nudge := h.campaign(), h.campaign()
	auto := h.publish("welcome", h.welcomeGraph(list, first, nudge), Settings{})
	sub := h.subscriber("a@example.com", "enabled", nil)
	h.subscribe(sub, list, "confirmed")

	// An old click on the same campaign, from before this enrollment.
	var link int
	h.must(h.db.Get(&link, `INSERT INTO links (uuid, url) VALUES (gen_random_uuid(), 'https://x.test') RETURNING id`))
	_, err := h.db.Exec(`INSERT INTO link_clicks (campaign_id, link_id, subscriber_id, created_at) VALUES ($1, $2, $3, NOW() - INTERVAL '30 days')`, first, link, sub)
	h.must(err)

	h.must(h.eng.OnListJoined(ctx, sub, list))
	h.drain()
	h.clock.Advance(49 * time.Hour)
	h.drain()
	if h.sender.count() != 2 {
		t.Fatalf("the old click counted: sent %d", h.sender.count())
	}
	_ = auto
}

func TestEnrollingTwiceDoesNotDouble(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	list := h.list("news", "single")
	auto := h.publish("a", &Graph{
		Triggers: listTrigger(list), Root: "d",
		Nodes: []Node{{ID: "d", Type: NodeDelay, Config: cfg(DelayConfig{Duration: "1d"})}},
	}, Settings{})
	sub := h.subscriber("a@example.com", "enabled", nil)

	for range 3 {
		h.must(h.eng.OnListJoined(ctx, sub, list))
	}
	var n int
	h.must(h.db.Get(&n, `SELECT COUNT(*) FROM enrollments WHERE automation_id = $1`, auto))
	if n != 1 {
		t.Fatalf("enrollments = %d", n)
	}
	// A different list does not trigger it.
	other := h.list("other", "single")
	sub2 := h.subscriber("b@example.com", "enabled", nil)
	h.must(h.eng.OnListJoined(ctx, sub2, other))
	h.must(h.db.Get(&n, `SELECT COUNT(*) FROM enrollments WHERE automation_id = $1`, auto))
	if n != 1 {
		t.Fatalf("an unrelated list enrolled someone: %d", n)
	}
}

func TestReentry(t *testing.T) {
	short := &Graph{Triggers: listTrigger(0), Root: "x", Nodes: []Node{{ID: "x", Type: NodeUpdateAttribute, Config: cfg(UpdateAttributeConfig{Attribute: "a", Value: cfg(1)})}}}
	for _, tc := range []struct {
		name     string
		settings Settings
		wait     time.Duration
		again    bool
	}{
		{"once", Settings{}, 1000 * time.Hour, false},
		{"always", Settings{Reentry: Reentry{Mode: "always"}}, time.Minute, true},
		{"interval, too soon", Settings{Reentry: Reentry{Mode: "interval", Interval: "7d"}}, 24 * time.Hour, false},
		{"interval, long enough", Settings{Reentry: Reentry{Mode: "interval", Interval: "7d"}}, 8 * 24 * time.Hour, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := newHarness(t)
			ctx := context.Background()
			list := h.list("l", "single")
			g := *short
			g.Triggers = listTrigger(list)
			auto := h.publish("re", &g, tc.settings)
			sub := h.subscriber("a@example.com", "enabled", nil)

			h.must(h.eng.OnListJoined(ctx, sub, list))
			h.drain() // finishes at once
			h.clock.Advance(tc.wait)
			h.must(h.eng.OnListJoined(ctx, sub, list))
			var n int
			h.must(h.db.Get(&n, `SELECT COUNT(*) FROM enrollments WHERE automation_id = $1`, auto))
			if (n == 2) != tc.again {
				t.Fatalf("enrollments = %d, want re-entry = %v", n, tc.again)
			}
		})
	}
}

func TestConsent(t *testing.T) {
	type tc struct {
		name         string
		msgType      string
		subscriber   string
		subscription string // "" = none
		optin        string
		sends        bool
		exit         string
	}
	for _, c := range []tc{
		{"marketing to a confirmed subscriber", MessageMarketing, "enabled", "confirmed", "single", true, ""},
		{"marketing after unsubscribing", MessageMarketing, "enabled", "unsubscribed", "single", false, ExitUnsubscribed},
		{"transactional after unsubscribing", MessageTransactional, "enabled", "unsubscribed", "single", true, ""},
		{"marketing to a blocklisted subscriber", MessageMarketing, "blocklisted", "confirmed", "single", false, ExitBlocklisted},
		{"transactional to a blocklisted subscriber", MessageTransactional, "blocklisted", "", "single", false, ExitBlocklisted},
		{"marketing, double opt-in not confirmed", MessageMarketing, "enabled", "unconfirmed", "double", false, "unconfirmed"},
	} {
		t.Run(c.name, func(t *testing.T) {
			h := newHarness(t)
			ctx := context.Background()
			list := h.list("topic", c.optin)
			camp := h.campaign()
			cfgMail := SendEmailConfig{MessageType: c.msgType, ListID: list, CampaignID: camp}
			if c.msgType == MessageTransactional {
				cfgMail.ListID = 0
			}
			trig := h.list("trigger", "single")
			auto := h.publish("c", &Graph{Triggers: listTrigger(trig), Root: "m", Nodes: []Node{{ID: "m", Type: NodeSendEmail, Config: cfg(cfgMail)}}}, Settings{})
			sub := h.subscriber("a@example.com", c.subscriber, nil)
			if c.subscription != "" {
				h.subscribe(sub, list, c.subscription)
			}
			// A blocklisted subscriber is never enrolled by a trigger, so enrol directly to exercise the send-time check.
			_, err := h.db.Exec(`INSERT INTO enrollments (automation_id, version_id, subscriber_id) SELECT id, current_version_id, $2::INT FROM automations WHERE id = $1`, auto, sub)
			h.must(err)
			var id int64
			h.must(h.db.Get(&id, `SELECT id FROM enrollments WHERE automation_id = $1`, auto))
			h.must(h.eng.Advance(ctx, id))

			enr := h.enrollment(auto, sub)
			if c.sends {
				if h.sender.count() != 1 || enr.Status != EnrollmentCompleted {
					t.Fatalf("sent %d, status %s", h.sender.count(), enr.Status)
				}
				return
			}
			if h.sender.count() != 0 || enr.Status != EnrollmentExited || *enr.ExitReason != c.exit {
				t.Fatalf("sent %d, status %s, reason %v", h.sender.count(), enr.Status, enr.ExitReason)
			}
			// A blocklisted subscriber is caught when the enrollment wakes, before any step; the others
			// are refused at the email step itself.
			if c.exit != ExitBlocklisted && h.steps(enr.ID)["m"] != StepSkipped {
				t.Fatalf("steps = %v", h.steps(enr.ID))
			}
		})
	}
}

func TestMarketingNeedsASubscriptionToTheTopic(t *testing.T) {
	cases := []struct {
		name  string
		setup func(h *harness, sub, topic int)
		steps func(h *harness, topic int) ([]Node, []Edge)
	}{
		{"never joined the topic", func(*harness, int, int) {}, func(h *harness, topic int) ([]Node, []Edge) {
			return []Node{{ID: "m", Type: NodeSendEmail, Config: mail(MessageMarketing, topic, h.campaign())}}, nil
		}},
		// listmonk deletes the subscription when someone is removed, so this looks like "never joined".
		{"removed from the topic by an earlier step", func(h *harness, sub, topic int) { h.subscribe(sub, topic, "confirmed") }, func(h *harness, topic int) ([]Node, []Edge) {
			return []Node{
				{ID: "rm", Type: NodeRemoveFromList, Config: cfg(ListConfig{ListID: topic})},
				{ID: "m", Type: NodeSendEmail, Config: mail(MessageMarketing, topic, h.campaign())},
			}, []Edge{{From: "rm", To: "m"}}
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			h := newHarness(t)
			ctx := context.Background()
			topic, trig := h.list("topic", "single"), h.list("trigger", "single")
			nodes, edges := c.steps(h, topic)
			auto := h.publish("c", &Graph{Triggers: listTrigger(trig), Root: nodes[0].ID, Nodes: nodes, Edges: edges}, Settings{})
			sub := h.subscriber("a@example.com", "enabled", nil)
			c.setup(h, sub, topic)
			h.must(h.eng.OnListJoined(ctx, sub, trig))
			h.drain()

			enr := h.enrollment(auto, sub)
			if h.sender.count() != 0 || enr.Status != EnrollmentExited || *enr.ExitReason != string(ReasonNotSubscribed) {
				t.Fatalf("sent %d, status %s, reason %v", h.sender.count(), enr.Status, enr.ExitReason)
			}
			var n int
			h.must(h.db.Get(&n, `SELECT COUNT(*) FROM subscriber_lists WHERE subscriber_id = $1 AND list_id = $2`, sub, topic))
			if n != 0 {
				t.Fatal("the send subscribed them to the topic")
			}
		})
	}
}

func TestAddToListNeverUndoesAnOptOut(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	topic, trig := h.list("topic", "single"), h.list("trigger", "single")
	auto := h.publish("a", &Graph{Triggers: listTrigger(trig), Root: "add", Nodes: []Node{
		{ID: "add", Type: NodeAddToList, Config: cfg(ListConfig{ListID: topic, Status: "confirmed"})},
		{ID: "m", Type: NodeSendEmail, Config: mail(MessageMarketing, topic, h.campaign())},
	}, Edges: []Edge{{From: "add", To: "m"}}}, Settings{})
	joined := h.publish("j", &Graph{Triggers: listTrigger(topic), Root: "d", Nodes: []Node{{ID: "d", Type: NodeDelay, Config: cfg(DelayConfig{Duration: "1h"})}}}, Settings{})
	sub := h.subscriber("a@example.com", "enabled", nil)
	h.subscribe(sub, topic, "unsubscribed")
	h.must(h.eng.OnListJoined(ctx, sub, trig))
	h.drain()

	var status string
	h.must(h.db.Get(&status, `SELECT status::TEXT FROM subscriber_lists WHERE subscriber_id = $1 AND list_id = $2`, sub, topic))
	if status != "unsubscribed" {
		t.Fatalf("subscription = %s", status)
	}
	if enr := h.enrollment(auto, sub); h.sender.count() != 0 || *enr.ExitReason != ExitUnsubscribed {
		t.Fatalf("sent %d, %+v", h.sender.count(), enr)
	}
	var n int
	h.must(h.db.Get(&n, `SELECT COUNT(*) FROM enrollments WHERE automation_id = $1`, joined))
	if n != 0 {
		t.Fatal("the step counted as joining the list")
	}
}

func TestAddToListDoesNotDowngradeAConfirmedSubscription(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	trig, dbl := h.list("t", "single"), h.list("d", "double")
	h.publish("a", &Graph{Triggers: listTrigger(trig), Root: "add", Nodes: []Node{{ID: "add", Type: NodeAddToList, Config: cfg(ListConfig{ListID: dbl})}}}, Settings{})
	sub := h.subscriber("a@example.com", "enabled", nil)
	h.subscribe(sub, dbl, "confirmed")
	h.must(h.eng.OnListJoined(ctx, sub, trig))
	h.drain()
	var status string
	h.must(h.db.Get(&status, `SELECT status::TEXT FROM subscriber_lists WHERE subscriber_id = $1 AND list_id = $2`, sub, dbl))
	if status != "confirmed" {
		t.Fatalf("subscription = %s", status)
	}
}

func TestMarketingWithATransactionalTemplateIsNeverSent(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	topic, trig := h.list("topic", "single"), h.list("trigger", "single")
	auto := h.publish("c", &Graph{Triggers: listTrigger(trig), Root: "m", Nodes: []Node{{ID: "m", Type: NodeSendEmail, Config: mail(MessageMarketing, topic, h.campaign())}}}, Settings{})
	// Saving refuses this now; a version published before that check could still hold it.
	g := Graph{Triggers: listTrigger(trig), Root: "m", Nodes: []Node{{ID: "m", Type: NodeSendEmail, Config: cfg(SendEmailConfig{MessageType: MessageMarketing, ListID: topic, TemplateID: 1})}}}
	raw, _ := json.Marshal(g)
	_, err := h.db.Exec(`UPDATE automation_versions SET graph = $2 WHERE id = (SELECT current_version_id FROM automations WHERE id = $1)`, auto, raw)
	h.must(err)
	sub := h.subscriber("a@example.com", "enabled", nil)
	h.subscribe(sub, topic, "confirmed")
	h.must(h.eng.OnListJoined(ctx, sub, trig))
	h.drain()

	if enr := h.enrollment(auto, sub); h.sender.count() != 0 || enr.Status != EnrollmentFailed {
		t.Fatalf("sent %d, status %s", h.sender.count(), enr.Status)
	}
}

func TestSendIsNeverDoubled(t *testing.T) {
	t.Run("a failed send is retried exactly once", func(t *testing.T) {
		h := newHarness(t)
		ctx := context.Background()
		list := h.list("l", "single")
		auto := h.publish("c", &Graph{Triggers: listTrigger(list), Root: "m", Nodes: []Node{{ID: "m", Type: NodeSendEmail, Config: mail(MessageMarketing, list, h.campaign())}}}, Settings{})
		sub := h.subscriber("a@example.com", "enabled", nil)
		h.subscribe(sub, list, "confirmed")
		h.must(h.eng.OnListJoined(ctx, sub, list))

		h.sender.Err = errors.New("queue is full")
		var id int64
		h.must(h.db.Get(&id, `SELECT id FROM enrollments WHERE automation_id = $1`, auto))
		if err := h.eng.Advance(ctx, id); err == nil {
			t.Fatal("the failure was swallowed")
		}
		if h.steps(id)["m"] != "" {
			t.Fatal("a failed send left a step behind, so the retry would skip it")
		}
		h.sender.Err = nil
		h.must(h.eng.Advance(ctx, id))
		h.must(h.eng.Advance(ctx, id)) // and a stray extra wake-up
		if h.sender.count() != 1 {
			t.Fatalf("sent %d times", h.sender.count())
		}
	})

	t.Run("a crash after queueing does not send again", func(t *testing.T) {
		h := newHarness(t)
		ctx := context.Background()
		list := h.list("l", "single")
		auto := h.publish("c", &Graph{Triggers: listTrigger(list), Root: "m", Nodes: []Node{{ID: "m", Type: NodeSendEmail, Config: mail(MessageMarketing, list, h.campaign())}}}, Settings{})
		sub := h.subscriber("a@example.com", "enabled", nil)
		h.subscribe(sub, list, "confirmed")
		h.must(h.eng.OnListJoined(ctx, sub, list))
		var id int64
		h.must(h.db.Get(&id, `SELECT id FROM enrollments WHERE automation_id = $1`, auto))

		// The state a process killed mid-send leaves behind: the step is 'sending', nothing else.
		_, err := h.db.Exec(`INSERT INTO enrollment_steps (enrollment_id, node_id, status) VALUES ($1, 'm', 'sending')`, id)
		h.must(err)
		h.must(h.eng.Advance(ctx, id))
		if h.sender.count() != 0 {
			t.Fatal("it sent again after an interruption")
		}
		if h.enrollment(auto, sub).Status != EnrollmentCompleted {
			t.Fatal("it did not carry on")
		}
	})

	t.Run("concurrent workers send once", func(t *testing.T) {
		h := newHarness(t)
		ctx := context.Background()
		list := h.list("l", "single")
		auto := h.publish("c", &Graph{Triggers: listTrigger(list), Root: "m", Nodes: []Node{{ID: "m", Type: NodeSendEmail, Config: mail(MessageMarketing, list, h.campaign())}}}, Settings{})
		sub := h.subscriber("a@example.com", "enabled", nil)
		h.subscribe(sub, list, "confirmed")
		h.must(h.eng.OnListJoined(ctx, sub, list))
		var id int64
		h.must(h.db.Get(&id, `SELECT id FROM enrollments WHERE automation_id = $1`, auto))

		h.sender.Before = func(Message) { time.Sleep(50 * time.Millisecond) }
		var wg sync.WaitGroup
		for range 6 {
			wg.Add(1)
			go func() {
				defer wg.Done()
				_ = h.eng.Advance(ctx, id)
			}()
		}
		wg.Wait()
		if h.sender.count() != 1 {
			t.Fatalf("sent %d times by concurrent workers", h.sender.count())
		}
	})
}

func TestSendWindowDefersToTheNextOpening(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	list := h.list("l", "single")
	// Friday 2026-03-06 18:00 UTC, in a Mon-Fri 09:00-17:00 window: it must wait for Monday.
	h.clock.t = time.Date(2026, 3, 6, 18, 0, 0, 0, time.UTC)
	auto := h.publish("w", &Graph{Triggers: listTrigger(list), Root: "m", Nodes: []Node{{ID: "m", Type: NodeSendEmail, Config: mail(MessageMarketing, list, h.campaign())}}},
		Settings{SendWindow: &SendWindow{Days: []int{1, 2, 3, 4, 5}, Start: "09:00", End: "17:00"}})
	sub := h.subscriber("a@example.com", "enabled", nil)
	h.subscribe(sub, list, "confirmed")
	h.must(h.eng.OnListJoined(ctx, sub, list))
	h.drain()

	enr := h.enrollment(auto, sub)
	if h.sender.count() != 0 || enr.Status != EnrollmentWaiting {
		t.Fatalf("sent %d, status %s", h.sender.count(), enr.Status)
	}
	if want := time.Date(2026, 3, 9, 9, 0, 0, 0, time.UTC); !enr.NextRunAt.Equal(want) {
		t.Fatalf("wakes at %v, want %v", enr.NextRunAt, want)
	}
	h.clock.t = time.Date(2026, 3, 9, 9, 0, 1, 0, time.UTC)
	h.drain()
	if h.sender.count() != 1 {
		t.Fatalf("sent %d after the window opened", h.sender.count())
	}
}

func TestSubscriberTimezoneDecidesTheWindow(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	list := h.list("l", "single")
	h.clock.t = time.Date(2026, 1, 14, 8, 0, 0, 0, time.UTC) // 09:00 in Berlin, 03:00 in New York
	auto := h.publish("w", &Graph{Triggers: listTrigger(list), Root: "m", Nodes: []Node{{ID: "m", Type: NodeSendEmail, Config: mail(MessageMarketing, list, h.campaign())}}},
		Settings{SendWindow: &SendWindow{Start: "09:00", End: "17:00"}})
	berlin := h.subscriber("b@example.com", "enabled", map[string]any{"timezone": "Europe/Berlin"})
	ny := h.subscriber("n@example.com", "enabled", map[string]any{"timezone": "America/New_York"})
	for _, s := range []int{berlin, ny} {
		h.subscribe(s, list, "confirmed")
		h.must(h.eng.OnListJoined(ctx, s, list))
	}
	h.drain()
	if h.sender.count() != 1 || h.sender.Sent[0].SubscriberID != berlin {
		t.Fatalf("sent = %+v", h.sender.Sent)
	}
	if enr := h.enrollment(auto, ny); enr.Status != EnrollmentWaiting || !enr.NextRunAt.Equal(time.Date(2026, 1, 14, 14, 0, 0, 0, time.UTC)) {
		t.Fatalf("new york: %+v", enr)
	}
}

func TestPauseResumeArchive(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	list := h.list("l", "single")
	auto := h.publish("p", &Graph{Triggers: listTrigger(list), Root: "d", Nodes: []Node{
		{ID: "d", Type: NodeDelay, Config: cfg(DelayConfig{Duration: "1d"})},
		{ID: "m", Type: NodeSendEmail, Config: mail(MessageMarketing, list, h.campaign())},
	}, Edges: []Edge{{From: "d", To: "m"}}}, Settings{})
	sub := h.subscriber("a@example.com", "enabled", nil)
	h.subscribe(sub, list, "confirmed")
	h.must(h.eng.OnListJoined(ctx, sub, list))
	h.drain()

	_, err := h.eng.Pause(ctx, auto)
	h.must(err)
	// New people are not enrolled while it is paused...
	sub2 := h.subscriber("b@example.com", "enabled", nil)
	h.must(h.eng.OnListJoined(ctx, sub2, list))
	var n int
	h.must(h.db.Get(&n, `SELECT COUNT(*) FROM enrollments WHERE subscriber_id = $1`, sub2))
	if n != 0 {
		t.Fatal("enrolled while paused")
	}
	// ...and the one inside doesn't move, even past its wake-up time.
	h.clock.Advance(2 * 24 * time.Hour)
	h.drain()
	if h.sender.count() != 0 || h.enrollment(auto, sub).Status != EnrollmentWaiting {
		t.Fatal("it moved while paused")
	}

	// Resuming wakes it, and it carries on from where it was.
	_, err = h.eng.Resume(ctx, auto)
	h.must(err)
	h.drain()
	if h.sender.count() != 1 || h.enrollment(auto, sub).Status != EnrollmentCompleted {
		t.Fatalf("after resume: sent %d, %s", h.sender.count(), h.enrollment(auto, sub).Status)
	}

	// Archiving ends whoever is still inside.
	sub3 := h.subscriber("c@example.com", "enabled", nil)
	h.subscribe(sub3, list, "confirmed")
	_, err = h.eng.Resume(ctx, auto)
	if err == nil {
		t.Fatal("resumed an automation that was not paused")
	}
	h.must(h.eng.OnListJoined(ctx, sub3, list))
	h.drain()
	_, err = h.eng.Archive(ctx, auto)
	h.must(err)
	if enr := h.enrollment(auto, sub3); enr.Status != EnrollmentExited || *enr.ExitReason != ExitArchived {
		t.Fatalf("archived: %+v", enr)
	}
}

// delayEmailDelayEmail is Delay 1h → e1 → Delay 3d → e2, the shape where a run advanced twice at
// once used to skip the second delay.
func (h *harness) delayEmailDelayEmail(list int) *Graph {
	return &Graph{Triggers: listTrigger(list), Root: "d1", Nodes: []Node{
		{ID: "d1", Type: NodeDelay, Config: cfg(DelayConfig{Duration: "1h"})},
		{ID: "e1", Type: NodeSendEmail, Config: mail(MessageTransactional, 0, h.campaign())},
		{ID: "d2", Type: NodeDelay, Config: cfg(DelayConfig{Duration: "3d"})},
		{ID: "e2", Type: NodeSendEmail, Config: mail(MessageTransactional, 0, h.campaign())},
	}, Edges: []Edge{{From: "d1", To: "e1"}, {From: "e1", To: "d2"}, {From: "d2", To: "e2"}}}
}

func TestResumeDoesNotDuplicateAWaitingRunsJob(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	list := h.list("l", "single")
	auto := h.publish("p", h.delayEmailDelayEmail(list), Settings{})
	sub := h.subscriber("a@example.com", "enabled", nil)
	h.subscribe(sub, list, "confirmed")
	h.must(h.eng.OnListJoined(ctx, sub, list))
	h.drain()
	if n := h.pendingJobs(); n != 1 {
		t.Fatalf("waiting on the delay: %d jobs", n)
	}

	// Its wake-up hasn't come yet, so it still has its job: resuming must not add a second.
	_, err := h.eng.Pause(ctx, auto)
	h.must(err)
	_, err = h.eng.Resume(ctx, auto)
	h.must(err)
	if n := h.pendingJobs(); n != 1 {
		t.Fatalf("after pause and resume: %d jobs", n)
	}
}

func TestADuplicateWakeUpDuringASendKeepsTheNextDelay(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	list := h.list("l", "single")
	auto := h.publish("p", h.delayEmailDelayEmail(list), Settings{})
	sub := h.subscriber("a@example.com", "enabled", nil)
	h.subscribe(sub, list, "confirmed")
	h.must(h.eng.OnListJoined(ctx, sub, list))
	h.drain()
	enr := h.enrollment(auto, sub)

	// A second wake-up of the run arrives while the first is handing e1 to the sender.
	h.clock.Advance(time.Hour)
	once := false
	h.sender.Before = func(Message) {
		if !once {
			once = true
			h.must(h.eng.Advance(ctx, enr.ID))
		}
	}
	h.must(h.eng.Advance(ctx, enr.ID))

	if n := h.sender.count(); n != 1 {
		t.Fatalf("sent %d messages; e2 must wait 3 days", n)
	}
	got := h.enrollment(auto, sub)
	if got.Status != EnrollmentWaiting || got.CurrentNode == nil || *got.CurrentNode != "d2" ||
		!got.NextRunAt.Equal(h.clock.Now().Add(3*24*time.Hour)) {
		t.Fatalf("enrollment = %+v", got)
	}
	if st := h.steps(enr.ID); st["e1"] != StepDone || st["d2"] != StepWaiting {
		t.Fatalf("steps = %v", st)
	}

	h.clock.Advance(3 * 24 * time.Hour)
	h.drain()
	if n := h.sender.count(); n != 2 || h.enrollment(auto, sub).Status != EnrollmentCompleted {
		t.Fatalf("after the delay: sent %d, %s", n, h.enrollment(auto, sub).Status)
	}
}

func TestGoalEndsAnEnrollmentAfterAPause(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	list := h.list("l", "single")
	auto := h.publish("g", &Graph{Triggers: listTrigger(list), Root: "d", Nodes: []Node{
		{ID: "d", Type: NodeDelay, Config: cfg(DelayConfig{Duration: "3d"})},
		{ID: "m", Type: NodeSendEmail, Config: mail(MessageMarketing, list, h.campaign())},
	}, Edges: []Edge{{From: "d", To: "m"}}},
		Settings{Goal: &Rule{Type: RuleAttribute, Path: "purchased", Operator: "eq", Value: cfg(true)}})
	sub := h.subscriber("a@example.com", "enabled", nil)
	h.subscribe(sub, list, "confirmed")
	h.must(h.eng.OnListJoined(ctx, sub, list))
	h.drain()

	_, err := h.db.Exec(`UPDATE subscribers SET attribs = '{"purchased": true}' WHERE id = $1`, sub)
	h.must(err)
	h.clock.Advance(4 * 24 * time.Hour)
	h.drain()
	enr := h.enrollment(auto, sub)
	if h.sender.count() != 0 || enr.Status != EnrollmentExited || *enr.ExitReason != ExitGoalReached {
		t.Fatalf("sent %d, %+v", h.sender.count(), enr)
	}
}

func TestBlocklistedWhileWaitingExits(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	list := h.list("l", "single")
	auto := h.publish("b", &Graph{Triggers: listTrigger(list), Root: "d", Nodes: []Node{
		{ID: "d", Type: NodeDelay, Config: cfg(DelayConfig{Duration: "1d"})},
		{ID: "m", Type: NodeSendEmail, Config: mail(MessageTransactional, 0, h.campaign())},
	}, Edges: []Edge{{From: "d", To: "m"}}}, Settings{})
	sub := h.subscriber("a@example.com", "enabled", nil)
	h.subscribe(sub, list, "confirmed")
	h.must(h.eng.OnListJoined(ctx, sub, list))
	h.drain()
	_, err := h.db.Exec(`UPDATE subscribers SET status = 'blocklisted' WHERE id = $1`, sub)
	h.must(err)
	h.clock.Advance(2 * 24 * time.Hour)
	h.drain()
	if enr := h.enrollment(auto, sub); h.sender.count() != 0 || enr.Status != EnrollmentExited || *enr.ExitReason != ExitBlocklisted {
		t.Fatalf("sent %d, %+v", h.sender.count(), enr)
	}
}

func TestEventTriggerCarriesTheEventToTheEmail(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	auto := h.publish("e", &Graph{
		Triggers: []Trigger{{ID: "t", Type: TriggerEvent, Config: cfg(TriggerConfig{Event: "cart_abandoned"})}},
		Root:     "m",
		Nodes:    []Node{{ID: "m", Type: NodeSendEmail, Config: mail(MessageTransactional, 0, h.campaign())}},
	}, Settings{})
	sub := h.subscriber("a@example.com", "enabled", nil)

	h.must(h.eng.OnEvent(ctx, sub, Event{SubscriberID: sub, Name: "something_else"}))
	h.drain()
	if h.sender.count() != 0 {
		t.Fatal("an unrelated event started it")
	}
	h.must(h.eng.OnEvent(ctx, sub, Event{SubscriberID: sub, Name: "cart_abandoned", Properties: cfg(map[string]any{"item": "boots"})}))
	h.drain()
	if h.sender.count() != 1 {
		t.Fatalf("sent %d", h.sender.count())
	}
	var ev Event
	h.must(json.Unmarshal(h.sender.Sent[0].Event, &ev))
	var props map[string]string
	h.must(json.Unmarshal(ev.Properties, &props))
	if ev.Name != "cart_abandoned" || props["item"] != "boots" || h.sender.Sent[0].AutomationID != auto {
		t.Fatalf("message = %+v", h.sender.Sent[0])
	}
}

func TestAttributeTrigger(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	eq := json.RawMessage(`"pro"`)
	auto := h.publish("a", &Graph{
		Triggers: []Trigger{{ID: "t", Type: TriggerAttributeChanged, Config: cfg(TriggerConfig{Attribute: "plan", Equals: &eq})}},
		Root:     "x", Nodes: []Node{{ID: "x", Type: NodeDelay, Config: cfg(DelayConfig{Duration: "1h"})}},
	}, Settings{})
	sub := h.subscriber("a@example.com", "enabled", nil)
	count := func() int {
		var n int
		h.must(h.db.Get(&n, `SELECT COUNT(*) FROM enrollments WHERE automation_id = $1`, auto))
		return n
	}
	h.must(h.eng.OnAttributesChanged(ctx, sub, map[string]any{}, map[string]any{"plan": "free"}))
	h.must(h.eng.OnAttributesChanged(ctx, sub, map[string]any{"plan": "pro"}, map[string]any{"plan": "pro", "x": 1}))
	if count() != 0 {
		t.Fatal("enrolled without the attribute becoming 'pro'")
	}
	h.must(h.eng.OnAttributesChanged(ctx, sub, map[string]any{"plan": "free"}, map[string]any{"plan": "pro"}))
	if count() != 1 {
		t.Fatal("did not enroll when the attribute became 'pro'")
	}
}

func TestOneAutomationCanStartAnother(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	first, second := h.list("first", "single"), h.list("second", "single")
	h.publish("a", &Graph{Triggers: listTrigger(first), Root: "add", Nodes: []Node{{ID: "add", Type: NodeAddToList, Config: cfg(ListConfig{ListID: second})}}}, Settings{})
	b := h.publish("b", &Graph{Triggers: listTrigger(second), Root: "d", Nodes: []Node{{ID: "d", Type: NodeDelay, Config: cfg(DelayConfig{Duration: "1h"})}}}, Settings{})
	sub := h.subscriber("a@example.com", "enabled", nil)
	h.subscribe(sub, first, "confirmed")
	h.must(h.eng.OnListJoined(ctx, sub, first))
	h.drain()

	if h.enrollment(b, sub).Status != EnrollmentWaiting {
		t.Fatal("joining the second list did not start the second automation")
	}
	var status string
	h.must(h.db.Get(&status, `SELECT status::TEXT FROM subscriber_lists WHERE subscriber_id = $1 AND list_id = $2`, sub, second))
	if status != "confirmed" {
		t.Fatalf("subscription = %s", status)
	}
}

func TestDoubleOptInListsAreJoinedUnconfirmed(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	trig, dbl := h.list("t", "single"), h.list("d", "double")
	other := h.publish("o", &Graph{Triggers: listTrigger(dbl), Root: "x", Nodes: []Node{{ID: "x", Type: NodeDelay, Config: cfg(DelayConfig{Duration: "1h"})}}}, Settings{})
	h.publish("a", &Graph{Triggers: listTrigger(trig), Root: "add", Nodes: []Node{{ID: "add", Type: NodeAddToList, Config: cfg(ListConfig{ListID: dbl})}}}, Settings{})
	sub := h.subscriber("a@example.com", "enabled", nil)
	h.must(h.eng.OnListJoined(ctx, sub, trig))
	h.drain()
	var status string
	h.must(h.db.Get(&status, `SELECT status::TEXT FROM subscriber_lists WHERE subscriber_id = $1 AND list_id = $2`, sub, dbl))
	if status != "unconfirmed" {
		t.Fatalf("subscription = %s", status)
	}
	var n int
	h.must(h.db.Get(&n, `SELECT COUNT(*) FROM enrollments WHERE automation_id = $1`, other))
	if n != 0 {
		t.Fatal("an unconfirmed address started a list-join automation")
	}
}

func TestWaitUntilAttributeAndOffset(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	list := h.list("l", "single")
	h.clock.t = time.Date(2026, 5, 1, 12, 0, 0, 0, time.UTC)
	auto := h.publish("w", &Graph{Triggers: listTrigger(list), Root: "w", Nodes: []Node{
		{ID: "w", Type: NodeWaitUntil, Config: cfg(WaitUntilConfig{Attribute: "renewal", Offset: "-3d"})},
		{ID: "m", Type: NodeSendEmail, Config: mail(MessageMarketing, list, h.campaign())},
	}, Edges: []Edge{{From: "w", To: "m"}}}, Settings{})
	has := h.subscriber("a@example.com", "enabled", map[string]any{"renewal": "2026-05-20"})
	none := h.subscriber("n@example.com", "enabled", nil)
	past := h.subscriber("p@example.com", "enabled", map[string]any{"renewal": "2026-05-02"})
	for _, s := range []int{has, none, past} {
		h.subscribe(s, list, "confirmed")
		h.must(h.eng.OnListJoined(ctx, s, list))
	}
	h.drain()

	// Three days before the 20th, at midnight UTC.
	enr := h.enrollment(auto, has)
	if want := time.Date(2026, 5, 17, 0, 0, 0, 0, time.UTC); enr.Status != EnrollmentWaiting || !enr.NextRunAt.Equal(want) {
		t.Fatalf("waiting subscriber: %+v", enr)
	}
	// No date: the wait is skipped. A date already passed: carries straight on.
	for _, s := range []int{none, past} {
		if h.enrollment(auto, s).Status != EnrollmentCompleted {
			t.Fatalf("subscriber %d did not run straight through", s)
		}
	}
	if h.sender.count() != 2 {
		t.Fatalf("sent %d", h.sender.count())
	}
}

func TestExitStep(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	list := h.list("l", "single")
	auto := h.publish("x", &Graph{Triggers: listTrigger(list), Root: "e", Nodes: []Node{{ID: "e", Type: NodeExit, Config: cfg(ExitConfig{Reason: "not_a_fit"})}}}, Settings{})
	sub := h.subscriber("a@example.com", "enabled", nil)
	h.must(h.eng.OnListJoined(ctx, sub, list))
	h.drain()
	if enr := h.enrollment(auto, sub); enr.Status != EnrollmentExited || *enr.ExitReason != "not_a_fit" {
		t.Fatalf("%+v", enr)
	}
}

func TestABrokenRuleFailsTheEnrollmentInsteadOfRetryingForever(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	list := h.list("l", "single")
	auto := h.publish("bad", &Graph{Triggers: listTrigger(list), Root: "c", Nodes: []Node{
		{ID: "c", Type: NodeCondition, Config: cfg(ConditionConfig{Rule: Rule{Type: RuleSQL, Query: "this is not sql"}})},
	}}, Settings{})
	sub := h.subscriber("a@example.com", "enabled", nil)
	h.must(h.eng.OnListJoined(ctx, sub, list))
	h.drain() // Advance returns nil: the failure is recorded, not retried
	enr := h.enrollment(auto, sub)
	if enr.Status != EnrollmentFailed {
		t.Fatalf("status = %s", enr.Status)
	}
	if h.pendingJobs() != 0 {
		t.Fatal("a job was left to retry")
	}
}

// --- wait_for_event -----------------------------------------------------------------------------

// waitGraph: checkout_started starts it; the run waits `timeout` for order_completed (e1, with a path
// to a transactional email when withPath) or checkout_started (e2, restarts); time's up sends `late`.
func (h *harness) waitGraph(timeout string, withPath bool) (g *Graph, late, ok int) {
	late, ok = h.campaign(), h.campaign()
	g = &Graph{
		Triggers: []Trigger{{ID: "t", Type: TriggerEvent, Config: cfg(TriggerConfig{Event: "checkout_started"})}},
		Root:     "w",
		Nodes: []Node{
			{ID: "w", Type: NodeWaitForEvent, Config: cfg(WaitForEventConfig{Timeout: timeout, Events: []WaitEvent{
				{ID: "e1", Name: "order_completed"},
				{ID: "e2", Name: "checkout_started", Restart: true},
			}})},
			{ID: "late", Type: NodeSendEmail, Config: mail(MessageTransactional, 0, late)},
		},
		Edges: []Edge{{From: "w", To: "late", Handle: HandleTimeout}},
	}
	if withPath {
		g.Nodes = append(g.Nodes, Node{ID: "ok", Type: NodeSendEmail, Config: mail(MessageTransactional, 0, ok)})
		g.Edges = append(g.Edges, Edge{From: "w", To: "ok", Handle: "e1"})
	}
	return g, late, ok
}

var eventSeq int64

// event is an event that happened at `at` (the harness clock, usually).
func event(sub int, name string, at time.Time, props map[string]any) Event {
	eventSeq++
	return Event{ID: eventSeq, SubscriberID: sub, Name: name, Properties: cfg(props), OccurredAt: at}
}

func (h *harness) waitResult(enrollmentID int64, node string) waitResult {
	h.t.Helper()
	var st Step
	h.must(h.db.Get(&st, `SELECT * FROM enrollment_steps WHERE enrollment_id = $1 AND node_id = $2`, enrollmentID, node))
	var r waitResult
	h.must(json.Unmarshal(st.Result, &r))
	return r
}

// start enrolls a new subscriber through the trigger event and runs the engine to the first wait.
func (h *harness) startWaiting(auto int) (sub int, enr Enrollment) {
	h.t.Helper()
	sub = h.subscriber("a@example.com", "enabled", nil)
	h.must(h.eng.OnEvent(context.Background(), sub, event(sub, "checkout_started", h.clock.Now(), map[string]any{"cart": "first"})))
	h.drain()
	enr = h.enrollment(auto, sub)
	if enr.Status != EnrollmentWaiting || *enr.CurrentNode != "w" {
		h.t.Fatalf("enrollment = %+v", enr)
	}
	return sub, enr
}

func TestWaitForEventTimesOut(t *testing.T) {
	h := newHarness(t)
	g, late, _ := h.waitGraph("1h", true)
	auto := h.publish("abandoned", g, Settings{})
	start := h.clock.Now()
	sub, enr := h.startWaiting(auto)

	if r := h.waitResult(enr.ID, "w"); !r.Since.Equal(start) || !r.Until.Equal(start.Add(time.Hour)) {
		t.Fatalf("result = %+v", r)
	}
	if enr.NextRunAt.Sub(start.Add(time.Hour)).Abs() > time.Second {
		t.Fatalf("wakes at %v", enr.NextRunAt)
	}

	h.clock.Advance(59 * time.Minute)
	h.drain()
	if h.sender.count() != 0 {
		t.Fatal("sent before the time was up")
	}
	h.clock.Advance(2 * time.Minute)
	h.drain()
	if h.sender.count() != 1 || h.sender.Sent[0].CampaignID != late || h.sender.Sent[0].SubscriberID != sub {
		t.Fatalf("sent = %+v", h.sender.Sent)
	}
	enr = h.enrollment(auto, sub)
	if enr.Status != EnrollmentCompleted || h.waitResult(enr.ID, "w").Branch != HandleTimeout || h.steps(enr.ID)["w"] != StepDone {
		t.Fatalf("enrollment = %+v, steps = %v", enr, h.steps(enr.ID))
	}
}

func TestWaitForEventTakesTheEventsPath(t *testing.T) {
	h := newHarness(t)
	g, _, ok := h.waitGraph("1h", true)
	auto := h.publish("abandoned", g, Settings{})
	sub, enr := h.startWaiting(auto)
	ctx := context.Background()

	h.clock.Advance(10 * time.Minute)
	ev := event(sub, "order_completed", h.clock.Now(), nil)
	h.must(h.eng.OnEvent(ctx, sub, ev))
	h.must(h.eng.OnEvent(ctx, sub, ev)) // delivering it twice changes nothing
	h.drain()
	if h.sender.count() != 1 || h.sender.Sent[0].CampaignID != ok {
		t.Fatalf("sent = %+v", h.sender.Sent)
	}
	r := h.waitResult(enr.ID, "w")
	if r.Branch != "e1" || r.Event != "order_completed" || r.EventID != ev.ID {
		t.Fatalf("result = %+v", r)
	}
	if h.enrollment(auto, sub).Status != EnrollmentCompleted {
		t.Fatal("did not complete")
	}

	// The time's up path never runs, however late.
	h.clock.Advance(2 * time.Hour)
	h.drain()
	if h.sender.count() != 1 {
		t.Fatalf("sent = %+v", h.sender.Sent)
	}
}

func TestWaitForEventEmptyPathCompletes(t *testing.T) {
	h := newHarness(t)
	g, _, _ := h.waitGraph("1h", false)
	auto := h.publish("abandoned", g, Settings{})
	sub, _ := h.startWaiting(auto)

	h.clock.Advance(time.Minute)
	h.must(h.eng.OnEvent(context.Background(), sub, event(sub, "order_completed", h.clock.Now(), nil)))
	h.drain()
	enr := h.enrollment(auto, sub)
	if enr.Status != EnrollmentCompleted || *enr.ExitReason != ExitCompleted || h.sender.count() != 0 {
		t.Fatalf("enrollment = %+v, sent %d", enr, h.sender.count())
	}
}

func TestRestartEventResetsTheWaitAndRefreshesTheEvent(t *testing.T) {
	h := newHarness(t)
	g, late, _ := h.waitGraph("1h", true)
	auto := h.publish("abandoned", g, Settings{})
	sub, enr := h.startWaiting(auto) // 10:00
	ctx := context.Background()

	h.clock.Advance(40 * time.Minute)
	at := h.clock.Now()
	h.must(h.eng.OnEvent(ctx, sub, event(sub, "checkout_started", at, map[string]any{"cart": "second"})))
	h.drain()
	if h.enrollment(auto, sub).NextRunAt.Sub(at.Add(time.Hour)).Abs() > time.Second {
		t.Fatalf("next run = %v", h.enrollment(auto, sub).NextRunAt)
	}

	h.clock.Advance(20 * time.Minute) // 11:00: the first wake-up does nothing
	h.drain()
	if h.sender.count() != 0 {
		t.Fatal("the old timer fired")
	}
	h.clock.Advance(40 * time.Minute) // 11:40
	h.drain()
	if h.sender.count() != 1 || h.sender.Sent[0].CampaignID != late {
		t.Fatalf("sent = %+v", h.sender.Sent)
	}
	var ev Event
	h.must(json.Unmarshal(h.sender.Sent[0].Event, &ev))
	var props map[string]string
	h.must(json.Unmarshal(ev.Properties, &props))
	if props["cart"] != "second" {
		t.Fatalf("the email carries %v", props)
	}
	r := h.waitResult(enr.ID, "w")
	if r.Restarts != 1 || r.RestartedAt == nil || r.Branch != HandleTimeout {
		t.Fatalf("result = %+v", r)
	}
}

func TestRepeatedRestarts(t *testing.T) {
	h := newHarness(t)
	g, _, _ := h.waitGraph("1h", true)
	auto := h.publish("abandoned", g, Settings{})
	sub, enr := h.startWaiting(auto)

	for range 4 {
		h.clock.Advance(30 * time.Minute)
		h.must(h.eng.OnEvent(context.Background(), sub, event(sub, "checkout_started", h.clock.Now(), nil)))
		h.drain()
	}
	last := h.clock.Now()
	if h.sender.count() != 0 {
		t.Fatalf("sent early: %+v", h.sender.Sent)
	}
	if h.waitResult(enr.ID, "w").Restarts != 4 {
		t.Fatalf("result = %+v", h.waitResult(enr.ID, "w"))
	}
	h.clock.Advance(59 * time.Minute)
	h.drain()
	if h.sender.count() != 0 {
		t.Fatal("sent before the last restart's time limit")
	}
	h.clock.Advance(2 * time.Minute)
	h.drain()
	if h.sender.count() != 1 || h.clock.Now().Sub(last) < time.Hour {
		t.Fatalf("sent %d", h.sender.count())
	}
}

func TestEventsBeforeTheWaitDoNotCount(t *testing.T) {
	h := newHarness(t)
	g, _, _ := h.waitGraph("1h", true)
	auto := h.publish("abandoned", g, Settings{})
	start := h.clock.Now()
	sub, enr := h.startWaiting(auto)

	// The event that started the run is a restart event of the step, but did not restart it.
	if r := h.waitResult(enr.ID, "w"); r.Restarts != 0 {
		t.Fatalf("the starting event restarted the wait: %+v", r)
	}

	// An old event that only now arrives does not count either.
	h.clock.Advance(10 * time.Minute)
	h.must(h.eng.OnEvent(context.Background(), sub, event(sub, "order_completed", start.Add(-time.Minute), nil)))
	h.must(h.eng.OnEvent(context.Background(), sub, event(sub, "checkout_started", start.Add(-time.Minute), nil)))
	h.drain()
	r := h.waitResult(enr.ID, "w")
	if r.Branch != "" || r.Restarts != 0 || !r.Until.Equal(start.Add(time.Hour)) || h.enrollment(auto, sub).Status != EnrollmentWaiting {
		t.Fatalf("result = %+v", r)
	}
}

func TestEventAfterTimeoutIsIgnored(t *testing.T) {
	h := newHarness(t)
	g, late, _ := h.waitGraph("1h", true)
	// Keep the run alive after the time's up path so there is something to (wrongly) change.
	g.Nodes = append(g.Nodes, Node{ID: "hold", Type: NodeDelay, Config: cfg(DelayConfig{Duration: "1d"})})
	g.Edges = []Edge{{From: "w", To: "late", Handle: HandleTimeout}, {From: "w", To: "ok", Handle: "e1"}, {From: "late", To: "hold"}}
	auto := h.publish("abandoned", g, Settings{})
	sub, enr := h.startWaiting(auto)

	h.clock.Advance(61 * time.Minute)
	h.drain()
	h.must(h.eng.OnEvent(context.Background(), sub, event(sub, "order_completed", h.clock.Now(), nil)))
	h.drain()
	if h.sender.count() != 1 || h.sender.Sent[0].CampaignID != late {
		t.Fatalf("sent = %+v", h.sender.Sent)
	}
	if r := h.waitResult(enr.ID, "w"); r.Branch != HandleTimeout {
		t.Fatalf("result = %+v", r)
	}
	if got := h.enrollment(auto, sub); got.Status != EnrollmentWaiting || *got.CurrentNode != "hold" {
		t.Fatalf("enrollment = %+v", got)
	}
}

func TestWaitForEventWhilePaused(t *testing.T) {
	h := newHarness(t)
	g, _, ok := h.waitGraph("1h", true)
	auto := h.publish("abandoned", g, Settings{})
	sub, enr := h.startWaiting(auto)
	ctx := context.Background()

	_, err := h.eng.Pause(ctx, auto)
	h.must(err)
	h.clock.Advance(10 * time.Minute)
	h.must(h.eng.OnEvent(ctx, sub, event(sub, "order_completed", h.clock.Now(), nil)))
	h.drain()
	if r := h.waitResult(enr.ID, "w"); r.Branch != "e1" {
		t.Fatalf("result = %+v", r)
	}
	if h.sender.count() != 0 || h.enrollment(auto, sub).Status != EnrollmentWaiting {
		t.Fatal("it moved while paused")
	}

	_, err = h.eng.Resume(ctx, auto)
	h.must(err)
	h.drain()
	if h.sender.count() != 1 || h.sender.Sent[0].CampaignID != ok || h.enrollment(auto, sub).Status != EnrollmentCompleted {
		t.Fatalf("after resume: sent %+v", h.sender.Sent)
	}
}

func TestWaitForEventUsesTheRunsVersion(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	g, _, ok := h.waitGraph("1h", true)
	auto := h.publish("abandoned", g, Settings{})
	sub, enr := h.startWaiting(auto)

	// v2 watches different events.
	g2, _, _ := h.waitGraph("1h", true)
	g2.Nodes[0].Config = cfg(WaitForEventConfig{Timeout: "1h", Events: []WaitEvent{{ID: "e1", Name: "payment_received"}}})
	_, problems, err := h.store.SaveDraft(ctx, auto, g2, true)
	h.must(err)
	if len(problems) > 0 {
		t.Fatal(messages(problems))
	}
	_, _, err = h.store.Publish(ctx, auto, true)
	h.must(err)

	h.must(h.eng.OnEvent(ctx, sub, event(sub, "payment_received", h.clock.Now(), nil)))
	if r := h.waitResult(enr.ID, "w"); r.Branch != "" {
		t.Fatalf("v2's event moved a v1 run: %+v", r)
	}
	h.must(h.eng.OnEvent(ctx, sub, event(sub, "order_completed", h.clock.Now(), nil)))
	h.drain()
	if h.sender.count() != 1 || h.sender.Sent[0].CampaignID != ok {
		t.Fatalf("sent = %+v", h.sender.Sent)
	}
}

func TestAnEventJobStartsRunsOnceEvenIfItRunsTwice(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	auto := h.publish("e", &Graph{
		Triggers: []Trigger{{ID: "t", Type: TriggerEvent, Config: cfg(TriggerConfig{Event: "signed_up"})}},
		Root:     "m",
		Nodes:    []Node{{ID: "m", Type: NodeSendEmail, Config: mail(MessageTransactional, 0, h.campaign())}},
	}, Settings{Reentry: Reentry{Mode: "always"}})
	sub := h.subscriber("a@example.com", "enabled", nil)

	ev, created, err := h.eng.RecordEvent(ctx, sub, "signed_up", nil, "k", h.clock.Now())
	if err != nil || !created {
		t.Fatalf("record: %v %v", created, err)
	}
	// Recording queued the job (stamped with the database clock, so let the fake one pass it).
	if n := h.pendingJobs(); n != 1 {
		t.Fatalf("%d jobs", n)
	}
	h.clock.Advance(time.Minute)
	h.drain()
	// A retry of the same job (e.g. it failed after enrolling) must not start a second run.
	h.must(h.eng.processEvent(ctx, ev.ID))
	h.drain()

	var runs int
	h.must(h.db.Get(&runs, `SELECT COUNT(*) FROM enrollments WHERE automation_id = $1`, auto))
	if runs != 1 || h.sender.count() != 1 {
		t.Fatalf("runs=%d sent=%d", runs, h.sender.count())
	}
	if _, created, _ := h.eng.RecordEvent(ctx, sub, "signed_up", nil, "k", h.clock.Now()); created || h.pendingJobs() != 0 {
		t.Fatal("a repeated idempotency key queued another job")
	}
}

func TestARetriedEventJobRecognisesItsRunAfterARestart(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	g, _, _ := h.waitGraph("1h", true)
	auto := h.publish("abandoned", g, Settings{Reentry: Reentry{Mode: "always"}})
	sub := h.subscriber("a@example.com", "enabled", nil)
	first := event(sub, "checkout_started", h.clock.Now(), map[string]any{"cart": "first"})
	h.must(h.eng.OnEvent(ctx, sub, first))
	h.drain()

	// A second event restarts the wait (replacing the run's event), then the run times out and ends.
	h.clock.Advance(10 * time.Minute)
	h.must(h.eng.OnEvent(ctx, sub, event(sub, "checkout_started", h.clock.Now(), map[string]any{"cart": "second"})))
	h.drain()
	h.clock.Advance(2 * time.Hour)
	h.drain()
	if enr := h.enrollment(auto, sub); enr.Status != EnrollmentCompleted || h.sender.count() != 1 {
		t.Fatalf("sent %d, %+v", h.sender.count(), enr)
	}

	// The first event's job runs again (a retry): it already started a run, so it starts no other.
	h.must(h.eng.OnEvent(ctx, sub, first))
	h.drain()
	var runs int
	h.must(h.db.Get(&runs, `SELECT COUNT(*) FROM enrollments WHERE automation_id = $1`, auto))
	if runs != 1 || h.sender.count() != 1 {
		t.Fatalf("runs=%d sent=%d", runs, h.sender.count())
	}
}

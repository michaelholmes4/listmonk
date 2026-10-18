package automation

import (
	"context"
	"strings"
	"testing"
	"time"
)

// quietSetup publishes "other", which sends one email of msgType as soon as someone joins its
// list, and "quiet", which sends m1, waits a day and sends m2, with the quiet period q. One
// subscriber is on both lists.
type quietSetup struct {
	h                  *harness
	other, quiet, sub  int
	otherList, quietLs int
}

func newQuietSetup(t *testing.T, msgType string, q *QuietPeriod, gap string) *quietSetup {
	h := newHarness(t)
	h.clock.t = time.Date(2026, 3, 2, 10, 0, 0, 0, time.UTC)
	s := &quietSetup{h: h, otherList: h.list("other", "single"), quietLs: h.list("quiet", "single")}
	s.other = h.publish("other", &Graph{Triggers: listTrigger(s.otherList), Root: "m",
		Nodes: []Node{{ID: "m", Type: NodeSendEmail, Config: mail(msgType, s.otherList, h.campaign())}}}, Settings{})
	s.quiet = h.publish("quiet", &Graph{Triggers: listTrigger(s.quietLs), Root: "m1",
		Nodes: []Node{
			{ID: "m1", Type: NodeSendEmail, Config: mail(MessageMarketing, s.quietLs, h.campaign())},
			{ID: "d", Type: NodeDelay, Config: cfg(DelayConfig{Duration: gap})},
			{ID: "m2", Type: NodeSendEmail, Config: mail(MessageMarketing, s.quietLs, h.campaign())},
		},
		Edges: []Edge{{From: "m1", To: "d"}, {From: "d", To: "m2"}}},
		Settings{QuietPeriod: q})
	s.sub = h.subscriber("a@example.com", "enabled", nil)
	h.subscribe(s.sub, s.otherList, "confirmed")
	h.subscribe(s.sub, s.quietLs, "confirmed")
	return s
}

func (s *quietSetup) join(list int) {
	s.h.must(s.h.eng.OnListJoined(context.Background(), s.sub, list))
	s.h.drain()
}

func TestQuietPeriodSkipsAndCarriesOn(t *testing.T) {
	s := newQuietSetup(t, MessageMarketing, &QuietPeriod{Duration: "16h"}, "1d")
	h := s.h
	s.join(s.otherList)
	h.clock.Advance(time.Hour)
	s.join(s.quietLs)

	enr := h.enrollment(s.quiet, s.sub)
	if st := h.steps(enr.ID); st["m1"] != StepSkipped {
		t.Fatalf("m1 is %q, want skipped", st["m1"])
	}
	if h.sender.count() != 1 {
		t.Fatalf("sent %d, want only the other automation's email", h.sender.count())
	}
	// A day on, the quiet period is over: m2 goes.
	h.clock.Advance(24*time.Hour + time.Minute)
	h.drain()
	if h.sender.count() != 2 {
		t.Fatalf("sent %d after the delay, want 2", h.sender.count())
	}
	if st := h.steps(enr.ID); st["m2"] != StepDone {
		t.Fatalf("m2 is %q", st["m2"])
	}
}

func TestQuietPeriodWaitSendsWhenItEnds(t *testing.T) {
	s := newQuietSetup(t, MessageMarketing, &QuietPeriod{Duration: "16h", Mode: QuietWait}, "1d")
	h := s.h
	sentAt := h.clock.Now()
	s.join(s.otherList)
	h.clock.Advance(time.Hour)
	s.join(s.quietLs)

	enr := h.enrollment(s.quiet, s.sub)
	if enr.Status != EnrollmentWaiting || h.sender.count() != 1 {
		t.Fatalf("status %s, sent %d", enr.Status, h.sender.count())
	}
	if want := sentAt.Add(16 * time.Hour); !enr.NextRunAt.Equal(want) {
		t.Fatalf("wakes at %v, want %v", enr.NextRunAt, want)
	}
	h.clock.t = sentAt.Add(16*time.Hour + time.Second)
	h.drain()
	if h.sender.count() != 2 {
		t.Fatalf("sent %d once the period ended, want 2", h.sender.count())
	}
}

func TestQuietPeriodIgnoresTheRunsOwnEmails(t *testing.T) {
	s := newQuietSetup(t, MessageMarketing, &QuietPeriod{Duration: "16h"}, "1h")
	h := s.h
	s.join(s.quietLs)
	h.clock.Advance(time.Hour + time.Minute)
	h.drain()
	if h.sender.count() != 2 {
		t.Fatalf("sent %d, want both of the run's own emails", h.sender.count())
	}
}

func TestQuietPeriodIgnoresTransactionalEmails(t *testing.T) {
	s := newQuietSetup(t, MessageTransactional, &QuietPeriod{Duration: "16h"}, "1d")
	h := s.h
	s.join(s.otherList)
	s.join(s.quietLs)
	if st := h.steps(h.enrollment(s.quiet, s.sub).ID); st["m1"] != StepDone {
		t.Fatalf("m1 is %q after a transactional email, want done", st["m1"])
	}
}

func TestQuietPeriodCountsEmailsFromAutomationsWithoutOne(t *testing.T) {
	// The quiet automation's email was first: "other" has no quiet period, so it still sends, and
	// its email then holds back the quiet automation's next one.
	s := newQuietSetup(t, MessageMarketing, &QuietPeriod{Duration: "16h"}, "2h")
	h := s.h
	s.join(s.quietLs)
	h.clock.Advance(time.Hour)
	s.join(s.otherList)
	if h.sender.count() != 2 {
		t.Fatalf("sent %d, want both first emails", h.sender.count())
	}
	h.clock.Advance(time.Hour + time.Minute)
	h.drain()
	if st := h.steps(h.enrollment(s.quiet, s.sub).ID); st["m2"] != StepSkipped {
		t.Fatalf("m2 is %q, want skipped: the other automation emailed an hour before", st["m2"])
	}
}

func TestQuietPeriodSettingsAreChecked(t *testing.T) {
	for _, tc := range []struct {
		q    QuietPeriod
		want string
	}{
		{QuietPeriod{Duration: ""}, "quiet period needs a duration"},
		{QuietPeriod{Duration: "0h"}, "quiet period needs a duration"},
		{QuietPeriod{Duration: "16h", Mode: "later"}, "unknown quiet period mode"},
	} {
		ps := Settings{Reentry: Reentry{Mode: "once"}, QuietPeriod: &tc.q}.Validate(ValidateOpts{})
		if !strings.Contains(messages(ps), tc.want) {
			t.Errorf("%+v: got %q, want %q", tc.q, messages(ps), tc.want)
		}
	}
	if ps := (Settings{QuietPeriod: &QuietPeriod{Duration: "16h", Mode: QuietWait}}).Validate(ValidateOpts{}); len(ps) > 0 {
		t.Errorf("valid settings refused: %s", messages(ps))
	}
}

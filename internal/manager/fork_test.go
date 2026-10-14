package manager

import (
	"context"
	"errors"
	"io"
	"log"
	"sync"
	"testing"
	"time"

	"github.com/knadh/listmonk/models"
)

type countingMessenger struct {
	mu  sync.Mutex
	got int
}

func (c *countingMessenger) Name() string { return "email" }
func (c *countingMessenger) Flush() error { return nil }
func (c *countingMessenger) Close() error { return nil }
func (c *countingMessenger) Push(models.Message) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.got++
	return nil
}

func (c *countingMessenger) count() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.got
}

func testManager(t *testing.T) (*Manager, *countingMessenger) {
	t.Helper()
	m := New(Config{Concurrency: 1, MessageRate: 10}, nil, nil, log.New(io.Discard, "", 0))
	msgr := &countingMessenger{}
	if err := m.AddMessenger(msgr); err != nil {
		t.Fatal(err)
	}
	return m, msgr
}

func automationMessage() CampaignMessage {
	c := &models.Campaign{Messenger: "email", Type: "automation"}
	return CampaignMessage{Campaign: c, Automation: map[string]any{}, to: "a@example.com"}
}

func TestSendAutomationMessageReturnsOnceTheMessengerHasIt(t *testing.T) {
	m, msgr := testManager(t)
	go m.worker()
	defer close(m.campMsgQ)

	if err := m.SendAutomationMessage(context.Background(), automationMessage(), time.Second); err != nil {
		t.Fatal(err)
	}
	if msgr.count() != 1 {
		t.Fatalf("pushed %d", msgr.count())
	}
}

func TestAWithdrawnAutomationMessageIsNeverSent(t *testing.T) {
	m, msgr := testManager(t)

	// No worker is running, as during a shutdown.
	err := m.SendAutomationMessage(context.Background(), automationMessage(), 20*time.Millisecond)
	if !errors.Is(err, ErrNotSent) {
		t.Fatalf("err = %v, want ErrNotSent", err)
	}
	// A worker that finds it later must drop it: the step will send it again.
	go m.worker()
	if err := m.SendAutomationMessage(context.Background(), automationMessage(), time.Second); err != nil {
		t.Fatal(err)
	}
	close(m.campMsgQ)
	if msgr.count() != 1 {
		t.Fatalf("pushed %d, want only the second message", msgr.count())
	}
}

func TestSendAutomationMessageRefusesAnUnknownMessenger(t *testing.T) {
	m, _ := testManager(t)
	msg := automationMessage()
	msg.Campaign.Messenger = "email-gone"
	if err := m.SendAutomationMessage(context.Background(), msg, time.Second); !errors.Is(err, ErrNotSent) {
		t.Fatalf("err = %v, want ErrNotSent", err)
	}
}

// Automation emails and campaigns share the sliding window: a full window refuses automation emails
// until it ends, and a campaign that fills it waits that long.
func TestSlidingWindowIsShared(t *testing.T) {
	m := New(Config{Concurrency: 1, MessageRate: 10, SlidingWindow: true, SlidingWindowRate: 3, SlidingWindowDuration: time.Hour}, nil, nil, log.New(io.Discard, "", 0))
	for i := 0; i < 2; i++ {
		if ok, _ := m.SlidingReserve(); !ok {
			t.Fatalf("automation email %d refused", i+1)
		}
	}
	wait := m.slidingCountPipe()
	if wait < 59*time.Minute || wait > time.Hour {
		t.Fatalf("campaign that filled the window waits %s, want about an hour", wait)
	}
	ok, until := m.SlidingReserve()
	if ok {
		t.Fatal("automation email sent over the limit")
	}
	if d := time.Until(until); d < 59*time.Minute || d > time.Hour {
		t.Fatalf("refused until %s from now, want about an hour", d)
	}

	// Once the window is over the count starts again.
	m.slidingStart = time.Now().Add(-time.Hour)
	if ok, _ := m.SlidingReserve(); !ok {
		t.Fatal("refused in a new window")
	}

	// Without a limit nothing is counted or refused.
	off := New(Config{Concurrency: 1, MessageRate: 10}, nil, nil, log.New(io.Discard, "", 0))
	for i := 0; i < 5; i++ {
		if ok, _ := off.SlidingReserve(); !ok || off.slidingCountPipe() != 0 {
			t.Fatal("limited without a sliding window")
		}
	}
}

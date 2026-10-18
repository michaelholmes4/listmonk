package automation

import (
	"context"
	"testing"
)

// The listing flags a published automation whose draft differs from what's live.
func TestListUnpublishedChanges(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	list := h.list("l", "single")

	flagged := func(id int) bool {
		t.Helper()
		rows, _, err := h.store.List(ctx, ListOpts{})
		h.must(err)
		for _, r := range rows {
			if r.ID == id {
				return r.UnpublishedChanges
			}
		}
		t.Fatalf("automation %d not listed", id)
		return false
	}

	steps := []Node{{ID: "d", Type: NodeDelay, Config: cfg(DelayConfig{Duration: "1d"})}}
	auto := h.publish("a", &Graph{Triggers: listTrigger(list), Root: "d", Nodes: steps}, Settings{})
	if flagged(auto) {
		t.Fatal("flagged straight after publishing")
	}

	// Opening the editor makes a draft that copies the live version: nothing to publish.
	_, err := h.store.Draft(ctx, auto)
	h.must(err)
	if flagged(auto) {
		t.Fatal("flagged for an unchanged draft")
	}

	changed := []Node{{ID: "d", Type: NodeDelay, Config: cfg(DelayConfig{Duration: "2d"})}}
	_, _, err = h.store.SaveDraft(ctx, auto, &Graph{Triggers: listTrigger(list), Root: "d", Nodes: changed}, true)
	h.must(err)
	if !flagged(auto) {
		t.Fatal("not flagged for a changed draft")
	}

	_, _, err = h.store.Publish(ctx, auto, true)
	h.must(err)
	if flagged(auto) {
		t.Fatal("still flagged after publishing the draft")
	}

	// One never published has nothing live to differ from: its status already says draft.
	fresh, err := h.store.Create(ctx, "b", Settings{})
	h.must(err)
	if flagged(fresh.ID) {
		t.Fatal("never-published automation flagged")
	}
}

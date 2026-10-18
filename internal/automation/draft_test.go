package automation

import (
	"context"
	"encoding/json"
	"errors"
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

	// An archived one can't be published again, so its leftover draft is nothing to act on.
	_, _, err = h.store.SaveDraft(ctx, auto, &Graph{Triggers: listTrigger(list), Root: "d", Nodes: steps}, true)
	h.must(err)
	if !flagged(auto) {
		t.Fatal("not flagged for a changed draft")
	}
	_, err = h.eng.Archive(ctx, auto)
	h.must(err)
	if flagged(auto) {
		t.Fatal("archived automation flagged")
	}
}

// Discarding puts the live graph back into the draft.
func TestDiscardDraft(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	list := h.list("l", "single")
	graph := func(d string) *Graph {
		return &Graph{Triggers: listTrigger(list), Root: "d", Nodes: []Node{{ID: "d", Type: NodeDelay, Config: cfg(DelayConfig{Duration: d})}}}
	}
	duration := func(v *Version) string {
		t.Helper()
		g, err := ParseGraph(v.Graph)
		h.must(err)
		var c DelayConfig
		h.must(json.Unmarshal(g.Nodes[0].Config, &c))
		return c.Duration
	}

	auto := h.publish("a", graph("1d"), Settings{})
	draft, _, err := h.store.SaveDraft(ctx, auto, graph("2d"), true)
	h.must(err)

	v, err := h.store.DiscardDraft(ctx, auto)
	h.must(err)
	if v.ID != draft.ID || v.PublishedAt != nil || duration(v) != "1d" {
		t.Fatalf("discarded draft = %+v (%s), want draft %d back at 1d", v, duration(v), draft.ID)
	}
	got, err := h.store.Draft(ctx, auto)
	h.must(err)
	if duration(got) != "1d" {
		t.Fatalf("draft after discard = %s, want 1d", duration(got))
	}

	// Without a draft there is nothing to throw away: a copy of the live version comes back.
	auto2 := h.publish("b", graph("3d"), Settings{})
	v, err = h.store.DiscardDraft(ctx, auto2)
	h.must(err)
	if v.PublishedAt != nil || duration(v) != "3d" {
		t.Fatalf("discard without a draft = %+v, want a 3d draft", v)
	}

	// Never published: nothing to go back to.
	fresh, err := h.store.Create(ctx, "c", Settings{})
	h.must(err)
	if _, err := h.store.DiscardDraft(ctx, fresh.ID); !errors.Is(err, ErrConflict) {
		t.Fatalf("discard of a never-published automation: err = %v, want a conflict", err)
	}

	// Archived: read-only.
	_, _, err = h.store.SaveDraft(ctx, auto, graph("2d"), true)
	h.must(err)
	_, err = h.eng.Archive(ctx, auto)
	h.must(err)
	if _, err := h.store.DiscardDraft(ctx, auto); !errors.Is(err, ErrConflict) {
		t.Fatalf("discard of an archived automation: err = %v, want a conflict", err)
	}
}

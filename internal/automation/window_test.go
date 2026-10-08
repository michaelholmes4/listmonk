package automation

import (
	"reflect"
	"testing"
	"time"
)

func at(t *testing.T, layout, s string, loc *time.Location) time.Time {
	t.Helper()
	v, err := time.ParseInLocation(layout, s, loc)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func TestNextSendTime(t *testing.T) {
	berlin, _ := time.LoadLocation("Europe/Berlin")
	ny, _ := time.LoadLocation("America/New_York")
	const L = "2006-01-02 15:04"
	weekdays9to5 := &SendWindow{Days: []int{1, 2, 3, 4, 5}, Start: "09:00", End: "17:00"}

	cases := []struct {
		name string
		now  time.Time
		w    *SendWindow
		loc  *time.Location
		want time.Time
	}{
		{"no window", at(t, L, "2026-03-04 03:00", time.UTC), nil, time.UTC, at(t, L, "2026-03-04 03:00", time.UTC)},
		{"inside the window", at(t, L, "2026-03-04 10:30", time.UTC), weekdays9to5, time.UTC, at(t, L, "2026-03-04 10:30", time.UTC)},
		{"before opening, same day", at(t, L, "2026-03-04 07:00", time.UTC), weekdays9to5, time.UTC, at(t, L, "2026-03-04 09:00", time.UTC)},
		{"after closing waits for tomorrow", at(t, L, "2026-03-04 17:00", time.UTC), weekdays9to5, time.UTC, at(t, L, "2026-03-05 09:00", time.UTC)},
		{"friday evening waits for monday", at(t, L, "2026-03-06 18:00", time.UTC), weekdays9to5, time.UTC, at(t, L, "2026-03-09 09:00", time.UTC)},
		{"saturday morning waits for monday", at(t, L, "2026-03-07 09:30", time.UTC), weekdays9to5, time.UTC, at(t, L, "2026-03-09 09:00", time.UTC)},
		// 08:00 UTC is 09:00 in Berlin (winter, UTC+1): open. The same instant is 03:00 in New York: not yet.
		{"the subscriber's own clock: Berlin", at(t, L, "2026-01-14 08:00", time.UTC), weekdays9to5, berlin, at(t, L, "2026-01-14 08:00", time.UTC)},
		{"the subscriber's own clock: New York", at(t, L, "2026-01-14 08:00", time.UTC), weekdays9to5, ny, at(t, L, "2026-01-14 09:00", ny)},
		{"days only", at(t, L, "2026-03-04 22:00", time.UTC), &SendWindow{Days: []int{4}}, time.UTC, at(t, L, "2026-03-05 00:00", time.UTC)},
		{"hours only", at(t, L, "2026-03-04 22:00", time.UTC), &SendWindow{Start: "08:00", End: "20:00"}, time.UTC, at(t, L, "2026-03-05 08:00", time.UTC)},
		{"a window that wraps midnight is ignored", at(t, L, "2026-03-04 03:00", time.UTC), &SendWindow{Start: "22:00", End: "06:00"}, time.UTC, at(t, L, "2026-03-04 03:00", time.UTC)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := NextSendTime(tc.now, tc.w, tc.loc)
			if !got.Equal(tc.want) {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
		})
	}
}

func TestNextSendTimeAcrossDST(t *testing.T) {
	ny, _ := time.LoadLocation("America/New_York")
	// The clocks go forward on 2026-03-08. Saturday night -> Monday 09:00 local is 13:00 UTC (EDT).
	now := time.Date(2026, 3, 7, 23, 0, 0, 0, time.UTC)
	got := NextSendTime(now, &SendWindow{Days: []int{1}, Start: "09:00", End: "17:00"}, ny)
	want := time.Date(2026, 3, 9, 13, 0, 0, 0, time.UTC)
	if !got.Equal(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestLocationFor(t *testing.T) {
	if locationFor(map[string]any{"timezone": "Asia/Tokyo"}, "Europe/Berlin").String() != "Asia/Tokyo" {
		t.Error("the subscriber's timezone should win")
	}
	if locationFor(map[string]any{"timezone": "Nowhere/Land"}, "Europe/Berlin").String() != "Europe/Berlin" {
		t.Error("an invalid timezone should fall back to the automation's")
	}
	if locationFor(nil, "").String() != "UTC" {
		t.Error("UTC when nothing is known")
	}
}

func TestAttributePaths(t *testing.T) {
	a := map[string]any{"plan": "pro", "address": map[string]any{"city": "Oslo"}}
	if v, ok := attrPath(a, "address.city"); !ok || v != "Oslo" {
		t.Fatalf("attrPath = %v %v", v, ok)
	}
	if _, ok := attrPath(a, "address.zip"); ok {
		t.Fatal("missing path reported present")
	}
	setAttrPath(a, "prefs.news.weekly", true, false)
	if v, _ := attrPath(a, "prefs.news.weekly"); v != true {
		t.Fatal("nested set failed")
	}
	setAttrPath(a, "address.city", nil, true)
	if _, ok := attrPath(a, "address.city"); ok {
		t.Fatal("unset failed")
	}
	setAttrPath(a, "nothing.here", nil, true) // must not create the path
	if _, ok := a["nothing"]; ok {
		t.Fatal("unset created intermediate objects")
	}
	if !reflect.DeepEqual(a["plan"], "pro") {
		t.Fatal("unrelated attribute changed")
	}
}

func TestParseMoment(t *testing.T) {
	tokyo, _ := time.LoadLocation("Asia/Tokyo")
	if m, ok := parseMoment("2026-05-01", tokyo); !ok || !m.Equal(time.Date(2026, 4, 30, 15, 0, 0, 0, time.UTC)) {
		t.Fatalf("bare date should be local midnight: %v %v", m, ok)
	}
	if m, ok := parseMoment("2026-05-01T10:00:00Z", tokyo); !ok || !m.Equal(time.Date(2026, 5, 1, 10, 0, 0, 0, time.UTC)) {
		t.Fatalf("rfc3339: %v %v", m, ok)
	}
	for _, v := range []any{"tomorrow", 5, nil, ""} {
		if _, ok := parseMoment(v, tokyo); ok {
			t.Errorf("%v accepted", v)
		}
	}
}

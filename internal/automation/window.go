package automation

import (
	"strings"
	"time"
)

// locationFor picks the timezone to reason about a subscriber in: their own `timezone` attribute
// if it is a valid IANA name, else the automation's, else UTC.
func locationFor(attribs map[string]any, fallback string) *time.Location {
	if tz, ok := attribs["timezone"].(string); ok && tz != "" {
		if loc, err := time.LoadLocation(tz); err == nil {
			return loc
		}
	}
	if fallback != "" {
		if loc, err := time.LoadLocation(fallback); err == nil {
			return loc
		}
	}
	return time.UTC
}

// hm parses "HH:MM" into minutes after midnight.
func hm(s string) int {
	if len(s) != 5 {
		return 0
	}
	return int(s[0]-'0')*600 + int(s[1]-'0')*60 + int(s[3]-'0')*10 + int(s[4]-'0')
}

// NextSendTime returns the earliest moment at or after `now` that the window allows, working in
// `loc` (so "09:00" means 9 o'clock for the subscriber). With no window it is `now`.
func NextSendTime(now time.Time, w *SendWindow, loc *time.Location) time.Time {
	if w == nil || (len(w.Days) == 0 && w.Start == "" && w.End == "") {
		return now
	}
	allowed := map[time.Weekday]bool{}
	for _, d := range w.Days {
		allowed[time.Weekday(d)] = true
	}
	startMin, endMin := 0, 24*60
	if w.Start != "" {
		startMin, endMin = hm(w.Start), hm(w.End)
	}
	if endMin <= startMin {
		// A window can't wrap past midnight; treat it as unusable and don't hold mail back forever.
		return now
	}

	local := now.In(loc)
	for add := 0; add <= 8; add++ {
		day := time.Date(local.Year(), local.Month(), local.Day()+add, 0, 0, 0, 0, loc)
		if len(allowed) > 0 && !allowed[day.Weekday()] {
			continue
		}
		open := time.Date(day.Year(), day.Month(), day.Day(), startMin/60, startMin%60, 0, 0, loc)
		var closeAt time.Time
		if endMin >= 24*60 {
			closeAt = time.Date(day.Year(), day.Month(), day.Day()+1, 0, 0, 0, 0, loc)
		} else {
			closeAt = time.Date(day.Year(), day.Month(), day.Day(), endMin/60, endMin%60, 0, 0, loc)
		}
		if !now.Before(closeAt) {
			continue
		}
		if now.Before(open) {
			return open.UTC()
		}
		return now
	}
	return now
}

// attrPath reads a dotted path out of an attributes map.
func attrPath(attribs map[string]any, path string) (any, bool) {
	var cur any = attribs
	for _, k := range strings.Split(path, ".") {
		m, ok := cur.(map[string]any)
		if !ok {
			return nil, false
		}
		cur, ok = m[k]
		if !ok {
			return nil, false
		}
	}
	return cur, true
}

// setAttrPath sets (or with unset, removes) a dotted path, creating objects on the way.
func setAttrPath(attribs map[string]any, path string, value any, unset bool) {
	keys := strings.Split(path, ".")
	cur := attribs
	for _, k := range keys[:len(keys)-1] {
		next, ok := cur[k].(map[string]any)
		if !ok {
			if unset {
				return
			}
			next = map[string]any{}
			cur[k] = next
		}
		cur = next
	}
	last := keys[len(keys)-1]
	if unset {
		delete(cur, last)
		return
	}
	cur[last] = value
}

// parseMoment reads a date attribute: RFC 3339, or a bare date (midnight in `loc`).
func parseMoment(v any, loc *time.Location) (time.Time, bool) {
	s, ok := v.(string)
	if !ok {
		return time.Time{}, false
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, true
	}
	if t, err := time.ParseInLocation("2006-01-02", s, loc); err == nil {
		return t, true
	}
	return time.Time{}, false
}

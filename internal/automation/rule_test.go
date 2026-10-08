package automation

import (
	"strings"
	"testing"
	"time"
)

var testEnv = Env{
	EnrollmentID: 7,
	Now:          time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC),
	CampaignOf: func(id string) (int, bool) {
		if id == "mail" {
			return 10, true
		}
		return 0, false
	},
}

func TestRulesNeverPutValuesInTheSQLText(t *testing.T) {
	evil := `x'); DROP TABLE subscribers; --`
	rules := []Rule{
		{Type: RuleAttribute, Path: "plan", Operator: "eq", Value: cfg(evil)},
		{Type: RuleAttribute, Path: "plan", Operator: "contains", Value: cfg(evil)},
		{Type: RuleSubscriber, Path: "email", Operator: "neq", Value: cfg(evil)},
		{Type: RuleEvent, Name: evil, Operator: "occurred"},
	}
	for _, r := range rules {
		c, err := r.Compile(testEnv)
		if err != nil {
			t.Fatalf("%+v: %v", r, err)
		}
		if strings.Contains(c.SQL, "DROP") || strings.Contains(c.SQL, evil) {
			t.Fatalf("a value reached the SQL text: %s", c.SQL)
		}
		found := false
		for _, a := range c.Args {
			if s, ok := a.(string); ok && strings.Contains(s, "DROP") {
				found = true
			}
		}
		if !found {
			t.Fatalf("the value is missing from the arguments: %+v", c.Args)
		}
	}
}

func TestAttributePathIsRestricted(t *testing.T) {
	for _, p := range []string{"a'b", "a;b", "", "a..b", "a.", "{x}", `a"b`} {
		if _, err := (Rule{Type: RuleAttribute, Path: p, Operator: "eq", Value: cfg("x")}).Compile(testEnv); err == nil {
			t.Errorf("path %q was accepted", p)
		}
	}
	for _, p := range []string{"plan", "address.city", "Plan Name", "a-b_c"} {
		if _, err := (Rule{Type: RuleAttribute, Path: p, Operator: "eq", Value: cfg("x")}).Compile(testEnv); err != nil {
			t.Errorf("path %q rejected: %v", p, err)
		}
	}
}

func TestGroupsAndPlaceholders(t *testing.T) {
	r := Rule{Op: "or", Rules: []Rule{
		{Type: RuleList, ListID: 3, Operator: "is_member"},
		{Op: "and", Rules: []Rule{
			{Type: RuleAttribute, Path: "plan", Operator: "eq", Value: cfg("pro")},
			{Type: RuleStep, NodeID: "mail", Operator: "opened"},
		}},
	}}
	c, err := r.Compile(testEnv)
	if err != nil {
		t.Fatal(err)
	}
	// $1 is the subscriber; parameters are numbered from $2 with no gaps or repeats.
	for i := range c.Args {
		if !strings.Contains(c.SQL, "$"+string(rune('2'+i))) {
			t.Fatalf("placeholder $%d missing from %s", i+2, c.SQL)
		}
	}
	if !strings.Contains(c.SQL, " OR ") || !strings.Contains(c.SQL, " AND ") {
		t.Fatalf("group operators lost: %s", c.SQL)
	}
}

func TestRuleErrors(t *testing.T) {
	for name, r := range map[string]Rule{
		"empty group":          {Op: "and"},
		"unknown group op":     {Op: "xor", Rules: []Rule{{Type: RuleList, ListID: 1, Operator: "is_member"}}},
		"unknown type":         {Type: "moon"},
		"list without id":      {Type: RuleList, Operator: "is_member"},
		"unknown list op":      {Type: RuleList, ListID: 1, Operator: "maybe"},
		"step on a non-email":  {Type: RuleStep, NodeID: "wait", Operator: "opened"},
		"unknown step op":      {Type: RuleStep, NodeID: "mail", Operator: "liked"},
		"event without name":   {Type: RuleEvent, Operator: "occurred"},
		"bad event window":     {Type: RuleEvent, Name: "x", Operator: "occurred", Within: "lately"},
		"comparison no value":  {Type: RuleAttribute, Path: "n", Operator: "gt"},
		"object value":         {Type: RuleAttribute, Path: "n", Operator: "eq", Value: cfg(map[string]int{"a": 1})},
		"gt on a word":         {Type: RuleAttribute, Path: "n", Operator: "gt", Value: cfg("many")},
		"unknown subscriber":   {Type: RuleSubscriber, Path: "password", Operator: "eq", Value: cfg("x")},
		"exists on subscriber": {Type: RuleSubscriber, Path: "email", Operator: "exists"},
		"raw sql refused":      {Type: RuleSQL, Query: "true"},
	} {
		if _, err := r.Compile(testEnv); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
	// Raw SQL must be one statement.
	env := testEnv
	env.AllowSQL = true
	if _, err := (Rule{Type: RuleSQL, Query: "true; DROP TABLE x"}).Compile(env); err == nil {
		t.Error("a second statement was accepted")
	}
	// Nesting is bounded.
	deep := Rule{Type: RuleList, ListID: 1, Operator: "is_member"}
	for range 12 {
		deep = Rule{Rules: []Rule{deep}}
	}
	if _, err := deep.Compile(testEnv); err == nil {
		t.Error("an absurdly nested rule was accepted")
	}
}

package automation

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// Every query the code asks for by name must exist in queries/automations.sql: a missing one would
// otherwise only show up as a panic when that code path first runs.
func TestEveryQueryNameUsedExists(t *testing.T) {
	q, err := LoadQueries(DefaultQueriesPath())
	if err != nil {
		t.Fatal(err)
	}
	re := regexp.MustCompile(`\.get\("([a-z\-]+)"\)`)
	files, _ := filepath.Glob("*.go")
	used := map[string]bool{}
	for _, f := range files {
		if strings.HasSuffix(f, "_test.go") {
			continue
		}
		b, _ := os.ReadFile(f)
		for _, m := range re.FindAllStringSubmatch(string(b), -1) {
			used[m[1]] = true
		}
	}
	// A name built at run time (the two kinds of list removal).
	used["unsubscribe"], used["remove-subscription"] = true, true
	for name := range used {
		if _, ok := q[name]; !ok {
			t.Errorf("query %q is used but not defined", name)
		}
	}
	if len(used) < 30 {
		t.Fatalf("found only %d query names; the scan is broken", len(used))
	}
}

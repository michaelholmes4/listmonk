package automation

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/knadh/goyesql/v2"
)

const queryPrefix = "automation-"

// Queries holds the SQL of queries/automations.sql by name. They are used as plain strings (not
// prepared statements) so they run equally on a connection or inside a transaction.
type Queries map[string]string

// LoadQueries reads the queries file.
func LoadQueries(path string) (Queries, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return ParseQueries(b)
}

// ParseQueries parses goyesql text.
func ParseQueries(b []byte) (Queries, error) {
	m, err := goyesql.ParseBytes(b)
	if err != nil {
		return nil, fmt.Errorf("parsing automation queries: %w", err)
	}
	q := make(Queries, len(m))
	for name, v := range m {
		// The file's names carry a prefix so they can't collide with upstream's when all the query
		// files are merged into one map; the code uses the short names.
		short, ok := strings.CutPrefix(string(name), queryPrefix)
		if !ok {
			return nil, fmt.Errorf("automation query %q must be named %s...", name, queryPrefix)
		}
		q[short] = v.Query
	}
	return q, nil
}

// get returns a query by name; a missing one is a programming error caught by the tests.
func (q Queries) get(name string) string {
	s, ok := q[name]
	if !ok {
		panic("automation: missing query " + name)
	}
	return s
}

// DefaultQueriesPath is where the file sits in a source checkout (for tests).
func DefaultQueriesPath() string {
	return filepath.Join("..", "..", "queries", "automations.sql")
}

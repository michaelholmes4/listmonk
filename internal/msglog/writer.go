package msglog

import (
	"context"
	"log"
	"sync"
	"sync/atomic"
	"time"
)

const (
	batchSize     = 500
	flushEvery    = time.Second
	queueSize     = 10000
	enqueueWait   = 200 * time.Millisecond
	pruneEvery    = 24 * time.Hour
	firstPruneAft = time.Minute
)

// sink stores a batch of entries.
type sink interface {
	Insert(ctx context.Context, entries []Entry) error
	DeleteBefore(ctx context.Context, t time.Time) (int64, error)
}

// Writer records entries in the background so that logging never slows a send. Entries are queued
// and inserted in batches; if the queue stays full they are dropped (and counted) rather than
// holding up the messenger. Once a day it deletes entries older than the retention.
type Writer struct {
	sink      sink
	lo        *log.Logger
	retention time.Duration

	ch      chan Entry
	mu      sync.RWMutex
	closed  bool
	done    chan struct{}
	dropped atomic.Int64
}

// NewWriter starts a Writer storing in db's table. retention <= 0 keeps everything.
func NewWriter(s *Store, lo *log.Logger, retention time.Duration) *Writer {
	return newWriter(s, lo, retention)
}

func newWriter(s sink, lo *log.Logger, retention time.Duration) *Writer {
	w := &Writer{
		sink:      s,
		lo:        lo,
		retention: retention,
		ch:        make(chan Entry, queueSize),
		done:      make(chan struct{}),
	}
	go w.run()
	return w
}

// Add queues an entry. It is safe to call after Close (the entry is then dropped).
func (w *Writer) Add(e Entry) {
	w.mu.RLock()
	defer w.mu.RUnlock()
	if w.closed {
		return
	}
	select {
	case w.ch <- e:
		return
	default:
	}
	t := time.NewTimer(enqueueWait)
	defer t.Stop()
	select {
	case w.ch <- e:
	case <-t.C:
		if n := w.dropped.Add(1); n == 1 || n%1000 == 0 {
			w.lo.Printf("message log: queue full, %d message(s) not logged so far", n)
		}
	}
}

// Close stops accepting entries, writes what is queued and returns. It can be called more than once.
func (w *Writer) Close() {
	w.mu.Lock()
	if !w.closed {
		w.closed = true
		close(w.ch)
	}
	w.mu.Unlock()
	<-w.done
}

func (w *Writer) run() {
	defer close(w.done)

	var (
		batch = make([]Entry, 0, batchSize)
		tick  = time.NewTicker(flushEvery)
		prune = time.NewTimer(firstPruneAft)
		flush = func() {
			if len(batch) == 0 {
				return
			}
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			if err := w.sink.Insert(ctx, batch); err != nil {
				w.lo.Printf("message log: error saving %d message(s): %v", len(batch), err)
			}
			cancel()
			batch = batch[:0]
		}
	)
	defer tick.Stop()
	defer prune.Stop()

	for {
		select {
		case e, ok := <-w.ch:
			if !ok {
				flush()
				return
			}
			batch = append(batch, e)
			if len(batch) >= batchSize {
				flush()
			}
		case <-tick.C:
			flush()
		case <-prune.C:
			w.prune()
			prune.Reset(pruneEvery)
		}
	}
}

func (w *Writer) prune() {
	if w.retention <= 0 {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	n, err := w.sink.DeleteBefore(ctx, time.Now().Add(-w.retention))
	if err != nil {
		w.lo.Printf("message log: error pruning old messages: %v", err)
		return
	}
	if n > 0 {
		w.lo.Printf("message log: deleted %d message(s) older than %s", n, w.retention)
	}
}

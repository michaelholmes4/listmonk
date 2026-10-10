package manager

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/knadh/listmonk/internal/messenger/email"
	"github.com/knadh/listmonk/internal/msglog"
	"github.com/knadh/listmonk/models"
	"github.com/knadh/smtppool/v2"
)

// fakeSMTP is a mail server that answers as told, and counts the messages it received in full
// (the final "." seen), whatever it then answered.
type fakeSMTP struct {
	addr     *net.TCPAddr
	greeting string // "220 ..." to talk
	rcpt     string // the answer to RCPT TO
	end      string // the answer to the final "."; "" hangs up without one

	mu       sync.Mutex
	received int
}

func startSMTP(t *testing.T, f *fakeSMTP) *fakeSMTP {
	t.Helper()
	if f.greeting == "" {
		f.greeting = "220 test"
	}
	if f.rcpt == "" {
		f.rcpt = "250 ok"
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	f.addr = ln.Addr().(*net.TCPAddr)
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go f.serve(c)
		}
	}()
	return f
}

func (f *fakeSMTP) serve(c net.Conn) {
	defer c.Close()
	r := bufio.NewReader(c)
	say := func(s string) { fmt.Fprintf(c, "%s\r\n", s) }
	say(f.greeting)
	if !strings.HasPrefix(f.greeting, "2") {
		return
	}
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return
		}
		cmd := strings.ToUpper(strings.TrimSpace(line))
		switch {
		case strings.HasPrefix(cmd, "EHLO"), strings.HasPrefix(cmd, "HELO"):
			say("250 test")
		case strings.HasPrefix(cmd, "MAIL"), strings.HasPrefix(cmd, "RSET"), strings.HasPrefix(cmd, "NOOP"):
			say("250 ok")
		case strings.HasPrefix(cmd, "RCPT"):
			say(f.rcpt)
		case cmd == "DATA":
			say("354 go ahead")
			for {
				l, err := r.ReadString('\n')
				if err != nil {
					return
				}
				if l == ".\r\n" {
					break
				}
			}
			f.mu.Lock()
			f.received++
			f.mu.Unlock()
			if f.end == "" {
				return
			}
			say(f.end)
		case cmd == "QUIT":
			say("221 bye")
			return
		default:
			say("502 unknown")
		}
	}
}

func (f *fakeSMTP) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.received
}

// smtpMessenger is listmonk's email messenger pointed at the port, behind a wrapper as in the app. smtppool
// retries as configured by default (max_msg_retries 2).
func smtpMessenger(t *testing.T, port int) Messenger {
	t.Helper()
	e, err := email.New("email", email.Server{TLSType: "none", Opt: smtppool.Opt{
		Host: "127.0.0.1", Port: port, MaxConns: 1, MaxMessageRetries: 2, PoolWaitTimeout: 2 * time.Second, IdleTimeout: 2 * time.Second, // no 1s sweep on Close
	}})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { e.Close() })
	return wrapped{e}
}

func testMail() models.Message {
	return models.Message{From: "a@example.com", To: []string{"b@example.com"}, Subject: "s", ContentType: "plain", Body: []byte("hello")}
}

// Only an email the mail server certainly did not take is "not delivered", and so sent again. A
// reply lost after the whole email went out may be an acceptance: that one must count as sent.
func TestNotDeliveredOnlyWhenTheServerDidNotTakeIt(t *testing.T) {
	cases := []struct {
		name         string
		server       *fakeSMTP // nil: nothing listening
		wantErr      bool
		notDelivered bool
		received     int
	}{
		{"accepted", &fakeSMTP{end: "250 queued"}, false, false, 1},
		{"recipient refused", &fakeSMTP{rcpt: "550 5.1.1 no such user"}, true, true, 0},
		{"recipient deferred", &fakeSMTP{rcpt: "451 4.7.1 try later"}, true, true, 0},
		{"refused after the content", &fakeSMTP{end: "554 5.7.1 rejected"}, true, true, 1},
		{"deferred after the content", &fakeSMTP{end: "451 4.3.0 try later"}, true, true, 1},
		{"server not accepting connections", &fakeSMTP{greeting: "421 too busy"}, true, true, 0},
		{"server down", nil, true, true, 0},
		{"reply lost after the content", &fakeSMTP{}, true, false, 1},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var port int
			if c.server != nil {
				port = startSMTP(t, c.server).addr.Port
			} else {
				ln, err := net.Listen("tcp", "127.0.0.1:0")
				if err != nil {
					t.Fatal(err)
				}
				port = ln.Addr().(*net.TCPAddr).Port
				ln.Close()
			}
			msgr := smtpMessenger(t, port)

			err := msgr.Push(testMail())
			if (err != nil) != c.wantErr {
				t.Fatalf("push: %v", err)
			}
			if got := notDelivered(msgr, err); got != c.notDelivered {
				t.Fatalf("notDelivered(%v) = %v, want %v", err, got, c.notDelivered)
			}
			if c.server != nil && c.server.count() != c.received {
				// smtppool must not have sent it again itself either.
				t.Fatalf("the server received %d message(s), want %d", c.server.count(), c.received)
			}
		})
	}
}

func TestNotDeliveredJudgesOnlyTheSMTPMessenger(t *testing.T) {
	dial := &net.OpError{Op: "dial", Net: "tcp", Err: errors.New("connection refused")}
	if notDelivered(&countingMessenger{}, dial) {
		t.Error("an error from another messenger (a postback that may have arrived) must count as sent")
	}
	if !notDelivered(smtpMessenger(t, 1), dial) {
		t.Error("a dial error from the SMTP messenger means it was not sent")
	}
	if notDelivered(smtpMessenger(t, 1), errors.New("something else")) {
		t.Error("an unknown error must count as sent")
	}
	if !notDelivered(smtpMessenger(t, 1), errors.New(errPoolWait)) {
		t.Error("no free connection in the pool means it was not sent")
	}
	// As the app wraps it.
	if !isSMTP(msglog.Wrap(&email.Emailer{}, nil, msglog.SourceTx, false)) {
		t.Error("the message log's wrapper hides the SMTP messenger")
	}
}

// The step learns of a refusal (and sends again later), but not of a lost reply.
func TestSendAutomationMessageReportsARefusal(t *testing.T) {
	for _, c := range []struct {
		server  *fakeSMTP
		notSent bool
	}{
		{&fakeSMTP{rcpt: "451 4.7.1 try later"}, true},
		{&fakeSMTP{end: "250 queued"}, false},
		{&fakeSMTP{}, false}, // reply lost
	} {
		m := New(Config{Concurrency: 1, MessageRate: 10}, nil, nil, log.New(io.Discard, "", 0))
		if err := m.AddMessenger(smtpMessenger(t, startSMTP(t, c.server).addr.Port)); err != nil {
			t.Fatal(err)
		}
		go m.worker()

		queued := automationMessage()
		queued.from = "a@example.com"
		err := m.SendAutomationMessage(context.Background(), queued, 5*time.Second)
		if errors.Is(err, ErrNotSent) != c.notSent {
			t.Errorf("queued, rcpt %q end %q: err = %v", c.server.rcpt, c.server.end, err)
		}
		msg := testMail()
		msg.Messenger = "email"
		err = m.SendMessageNow(msg)
		if errors.Is(err, ErrNotSent) != c.notSent {
			t.Errorf("direct, rcpt %q end %q: err = %v", c.server.rcpt, c.server.end, err)
		}
		close(m.campMsgQ)
	}
}

// wrapped stands in for the message log's wrapper, which needs a database.
type wrapped struct{ Messenger }

func (w wrapped) Unwrap() any { return w.Messenger }

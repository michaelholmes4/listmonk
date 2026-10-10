package manager

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net"
	"net/textproto"
	"sync/atomic"
	"time"

	"github.com/knadh/listmonk/internal/messenger/email"
	"github.com/knadh/listmonk/internal/msglog"
	"github.com/knadh/listmonk/models"
	"github.com/knadh/smtppool/v2"
)

// librelist fork: NewAutomationMessage is NewCampaignMessage for an automation email step. The
// message is rendered exactly like a campaign message, and templates additionally get:
//
//	{{ .Event.Name }}  {{ .Event.Properties.item }}   the event that started the automation, if any
//	{{ .Automation.Name }}  {{ .Automation.Step }}     which automation and step this is
//
// Both are empty maps when not applicable, so templates need no guards.
func (m *Manager) NewAutomationMessage(c *models.Campaign, s models.Subscriber, event, automation map[string]any) (CampaignMessage, error) {
	if event == nil {
		event = map[string]any{}
	}
	if automation == nil {
		automation = map[string]any{}
	}
	msg := CampaignMessage{
		Campaign:   c,
		Subscriber: s,
		Event:      event,
		Automation: automation,

		subject:  c.Subject,
		from:     c.FromEmail,
		to:       s.Email,
		unsubURL: fmt.Sprintf(m.cfg.UnsubURL, c.UUID, s.UUID),
	}
	if err := msg.render(); err != nil {
		return msg, err
	}
	return msg, nil
}

// LoadCampaignMedia attaches a campaign's media once, up front. The automation sender shares one
// compiled campaign between concurrent sends; with its media already loaded, PushCampaignMessage
// finds nothing to add instead of appending to the shared campaign from several goroutines.
func (m *Manager) LoadCampaignMedia(c *models.Campaign) error {
	return m.attachMedia(c)
}

// forkTransactional reports a transactional automation email, which gets no List-Unsubscribe
// header: it has no topic to unsubscribe from, and unsubscribing would not stop it.
func (msg *CampaignMessage) forkTransactional() bool {
	return msg.Automation["MessageType"] == "transactional"
}

// forkLogHeaders adds the internal headers that tell the message log which automation and
// enrollment a message belongs to. The log's messenger wrapper removes them before sending.
func (msg *CampaignMessage) forkLogHeaders(h textproto.MIMEHeader) {
	for key, hdr := range map[string]string{"ID": msglog.HdrAutomation, "Enrollment": msglog.HdrEnrollment} {
		if v, ok := msg.Automation[key]; ok && v != nil && fmt.Sprint(v) != "0" {
			h.Set(hdr, fmt.Sprint(v))
		}
	}
}

// ErrNotSent is returned for an automation email that never reached the mail server and never will
// from this attempt, so the caller can safely send it again.
var ErrNotSent = errors.New("message not sent")

// delivery is the hand-over of one queued automation email from its sender to a worker. Whoever
// moves it out of deliveryQueued first decides: a worker (it sends) or the sender (it gave up, and
// the worker drops the message).
type delivery struct {
	state atomic.Int32
	err   error         // the messenger's answer, set before done is closed
	done  chan struct{} // closed once a worker has pushed the message
}

const (
	deliveryQueued int32 = iota
	deliveryClaimed
	deliveryCancelled
)

// SendAutomationMessage queues msg like PushCampaignMessage (so it shares the campaign workers and
// their rate limit), then waits until a worker has handed it to the messenger. It returns nil once
// the messenger has it, unless the mail server certainly did not take it (see notDelivered).
// If no worker took it within wait, or ctx ends first, the message is withdrawn. Either way the
// error wraps ErrNotSent. A message a worker already took is waited for: the send is under way.
func (m *Manager) SendAutomationMessage(ctx context.Context, msg CampaignMessage, wait time.Duration) error {
	msgr, ok := m.messengers[msg.Campaign.Messenger]
	if !ok {
		return fmt.Errorf("%w: unknown messenger %q", ErrNotSent, msg.Campaign.Messenger)
	}
	d := &delivery{done: make(chan struct{})}
	msg.delivery = d
	if err := m.PushCampaignMessage(msg); err != nil {
		return fmt.Errorf("%w: %v", ErrNotSent, err)
	}

	t := time.NewTimer(wait)
	defer t.Stop()
	select {
	case <-d.done:
		return sendResult(msgr, d.err)
	case <-ctx.Done():
	case <-t.C:
	}
	if d.state.CompareAndSwap(deliveryQueued, deliveryCancelled) {
		return fmt.Errorf("%w: still queued after %s", ErrNotSent, wait)
	}
	<-d.done
	return sendResult(msgr, d.err)
}

// SendMessageNow pushes msg straight to its messenger and returns once the messenger has it. It is
// for an automation's transactional-template step, which, like /api/tx, the queue would not rate
// limit either; skipping the queue means it can't be lost there. A messenger error is logged (as the
// queue's worker does) and returned only when the mail server certainly did not take the message.
func (m *Manager) SendMessageNow(msg models.Message) error {
	msgr, ok := m.messengers[msg.Messenger]
	if !ok {
		return fmt.Errorf("%w: unknown messenger %q", ErrNotSent, msg.Messenger)
	}
	err := msgr.Push(msg)
	if err != nil {
		m.log.Printf("error sending message '%s': %v", msg.Subject, err)
	}
	return sendResult(msgr, err)
}

// sendResult is what an automation step learns of a push: ErrNotSent when sending again cannot
// deliver the email twice, otherwise nil (sent, or possibly sent: the message log has the error).
func sendResult(msgr Messenger, err error) error {
	if notDelivered(msgr, err) {
		return fmt.Errorf("%w: %v", ErrNotSent, err)
	}
	return nil
}

// errPoolWait is smtppool's error when no connection came free in time (it has no variable for it).
const errPoolWait = "timed out waiting for free conn in pool"

// notDelivered reports whether a messenger's error means the mail server certainly did not take the
// email. Anything not recognised here counts as possibly delivered, and is never sent again.
//
// Only the email messengers are judged, as their errors come from smtppool, whose steps are known:
// get a connection (dial, TLS, AUTH), MAIL, RCPT, DATA, write the content, then the final "." and
// the server's reply. Only that reply accepts the email, so only a reply that never arrived (a
// network error after the final ".") leaves it unknown. smtppool retries an email itself only after
// failures before the final "." (never after a failed reply; and a failed write leaves its buffer
// refusing all further writes, so the "." never goes out), so the error it returns covers every
// attempt it made. Other messengers (postback) may retry after a request that did arrive: an error
// from them never means "not sent".
func notDelivered(msgr Messenger, err error) bool {
	if err == nil || !isSMTP(msgr) {
		return false
	}
	// The server answered with a refusal, at any step up to the final reply: 4xx (try later) or
	// 5xx (refused). A 2xx or 3xx here is an unexpected positive answer and may be an acceptance.
	var te *textproto.Error
	if errors.As(err, &te) {
		return te.Code >= 400 && te.Code < 600
	}
	// No connection was made: the server is unreachable, its name doesn't resolve, or its
	// certificate is invalid.
	var oe *net.OpError
	if errors.As(err, &oe) && oe.Op == "dial" {
		return true
	}
	var ce *tls.CertificateVerificationError
	if errors.As(err, &ce) {
		return true
	}
	// No connection from the pool (busy, or shutting down).
	return errors.Is(err, smtppool.ErrPoolClosed) || err.Error() == errPoolWait
}

// forkClaim is called by a worker before it sends a campaign message. It reports false for an
// automation email whose sender has given up on it, which must then not be sent.
func (msg *CampaignMessage) forkClaim() bool {
	return msg.delivery == nil || msg.delivery.state.CompareAndSwap(deliveryQueued, deliveryClaimed)
}

// forkSent is called by a worker once it has pushed a campaign message, with the messenger's error.
func (msg *CampaignMessage) forkSent(err error) {
	if msg.delivery != nil {
		msg.delivery.err = err
		close(msg.delivery.done)
	}
}

// isSMTP reports whether msgr is listmonk's SMTP messenger, looking through wrappers such as the
// message log's. Names don't tell: a postback messenger can be called anything.
func isSMTP(msgr any) bool {
	for {
		switch v := msgr.(type) {
		case *email.Emailer:
			return true
		case interface{ Unwrap() any }:
			msgr = v.Unwrap()
		default:
			return false
		}
	}
}

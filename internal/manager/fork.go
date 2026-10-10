package manager

import (
	"context"
	"errors"
	"fmt"
	"net/textproto"
	"sync/atomic"
	"time"

	"github.com/knadh/listmonk/internal/msglog"
	"github.com/knadh/listmonk/models"
)

// fork: NewAutomationMessage is NewCampaignMessage for an automation email step. The
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

// ErrNotSent is returned for an automation email that never reached a messenger and never will,
// so the caller can safely send it again.
var ErrNotSent = errors.New("message not sent")

// delivery is the hand-over of one queued automation email from its sender to a worker. Whoever
// moves it out of deliveryQueued first decides: a worker (it sends) or the sender (it gave up, and
// the worker drops the message).
type delivery struct {
	state atomic.Int32
	done  chan struct{} // closed once a worker has pushed the message
}

const (
	deliveryQueued int32 = iota
	deliveryClaimed
	deliveryCancelled
)

// SendAutomationMessage queues msg like PushCampaignMessage (so it shares the campaign workers and
// their rate limit), then waits until a worker has handed it to the messenger. It returns nil once
// the messenger has it; whether the server accepted it is logged by the worker and the message log.
// If no worker took it within wait, or ctx ends first, the message is withdrawn and the error wraps
// ErrNotSent. A message a worker already took is waited for: the send is under way.
func (m *Manager) SendAutomationMessage(ctx context.Context, msg CampaignMessage, wait time.Duration) error {
	if !m.HasMessenger(msg.Campaign.Messenger) {
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
		return nil
	case <-ctx.Done():
	case <-t.C:
	}
	if d.state.CompareAndSwap(deliveryQueued, deliveryCancelled) {
		return fmt.Errorf("%w: still queued after %s", ErrNotSent, wait)
	}
	<-d.done
	return nil
}

// SendMessageNow pushes msg straight to its messenger and returns once the messenger has it. It is
// for an automation's transactional-template step, which, like /api/tx, the queue would not rate
// limit either; skipping the queue means it can't be lost there. A messenger error is logged (as the
// queue's worker does), not returned: the message may have reached the server.
func (m *Manager) SendMessageNow(msg models.Message) error {
	msgr, ok := m.messengers[msg.Messenger]
	if !ok {
		return fmt.Errorf("%w: unknown messenger %q", ErrNotSent, msg.Messenger)
	}
	if err := msgr.Push(msg); err != nil {
		m.log.Printf("error sending message '%s': %v", msg.Subject, err)
	}
	return nil
}

// forkClaim is called by a worker before it sends a campaign message. It reports false for an
// automation email whose sender has given up on it, which must then not be sent.
func (msg *CampaignMessage) forkClaim() bool {
	return msg.delivery == nil || msg.delivery.state.CompareAndSwap(deliveryQueued, deliveryClaimed)
}

// forkSent is called by a worker once it has pushed a campaign message.
func (msg *CampaignMessage) forkSent() {
	if msg.delivery != nil {
		close(msg.delivery.done)
	}
}

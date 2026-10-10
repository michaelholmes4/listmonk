package manager

import (
	"fmt"
	"net/textproto"

	"github.com/knadh/listmonk/internal/msglog"
	"github.com/knadh/listmonk/models"
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

package manager

import (
	"fmt"

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

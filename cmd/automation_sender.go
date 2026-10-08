package main

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/knadh/listmonk/internal/automation"
	"github.com/knadh/listmonk/internal/core"
	"github.com/knadh/listmonk/internal/manager"
	"github.com/knadh/listmonk/models"
)

// librelist fork: automationSender turns an automation's email step into a message on the same
// queue (and so the same messengers, rate limits and tracking) that campaigns and /api/tx use.
type automationSender struct {
	core *core.Core
	mgr  *manager.Manager

	// Compiling a campaign template is the expensive part of a send; a step is typically sent many
	// times in a row, so keep the compiled campaign until it changes.
	mu    sync.Mutex
	cache map[int]cachedCampaign
}

type cachedCampaign struct {
	camp    *models.Campaign
	updated time.Time
	at      time.Time
}

func newAutomationSender(co *core.Core, mgr *manager.Manager) *automationSender {
	return &automationSender{core: co, mgr: mgr, cache: map[int]cachedCampaign{}}
}

// SendEmail implements automation.Sender.
func (s *automationSender) SendEmail(_ context.Context, m automation.Message) error {
	sub, err := s.core.GetSubscriber(m.SubscriberID, "", "")
	if err != nil {
		return fmt.Errorf("subscriber %d: %w", m.SubscriberID, err)
	}

	var props map[string]any
	_ = json.Unmarshal(m.Event, &props) // m.Event is the stored {name, properties, occurred_at}
	event := map[string]any{"Name": "", "Properties": map[string]any{}, "OccurredAt": time.Time{}}
	if props != nil {
		if v, ok := props["name"].(string); ok {
			event["Name"] = v
		}
		if v, ok := props["properties"].(map[string]any); ok {
			event["Properties"] = v
		}
		if v, ok := props["occurred_at"].(string); ok {
			if t, err := time.Parse(time.RFC3339Nano, v); err == nil {
				event["OccurredAt"] = t
			}
		}
	}
	auto := map[string]any{"Name": m.AutomationName, "UUID": m.AutomationUUID, "ID": m.AutomationID, "Step": m.NodeID}

	if m.CampaignID != 0 {
		camp, err := s.campaign(m.CampaignID)
		if err != nil {
			return err
		}
		msg, err := s.mgr.NewAutomationMessage(camp, sub, event, auto)
		if err != nil {
			return fmt.Errorf("rendering step %s: %w", m.NodeID, err)
		}
		return s.mgr.PushCampaignMessage(msg)
	}

	// A transactional template.
	tpl, err := s.mgr.GetTpl(m.TemplateID)
	if err != nil {
		return fmt.Errorf("template %d: %w", m.TemplateID, err)
	}
	tx := models.TxMessage{TemplateID: m.TemplateID, ContentType: "html", Messenger: "email"}
	tx.Data, _ = event["Properties"].(map[string]any)
	if err := tx.Render(sub, tpl, s.mgr.GenericTemplateFuncs()); err != nil {
		return fmt.Errorf("rendering template %d: %w", m.TemplateID, err)
	}
	msg := models.Message{
		Subscriber:  sub,
		To:          []string{sub.Email},
		Subject:     tx.Subject,
		ContentType: tx.ContentType,
		Messenger:   tx.Messenger,
		Body:        tx.Body,
	}
	msg.Attachments = append(msg.Attachments, tpl.Attachments...)
	return s.mgr.PushMessage(msg)
}

// campaign returns the compiled hidden campaign behind an email step.
func (s *automationSender) campaign(id int) (*models.Campaign, error) {
	fresh, err := s.core.GetCampaignForPreview(id, 0)
	if err != nil {
		return nil, fmt.Errorf("campaign %d: %w", id, err)
	}
	// Only hidden automation campaigns may be sent from a step: otherwise an automation could
	// be pointed at, and re-send, an ordinary campaign.
	if fresh.Type != "automation" {
		return nil, fmt.Errorf("campaign %d is not an automation email", id)
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if c, ok := s.cache[id]; ok && c.updated.Equal(fresh.UpdatedAt.Time) && time.Since(c.at) < time.Minute {
		return c.camp, nil
	}
	if err := s.mgr.LoadInlineImages(&fresh); err != nil {
		return nil, err
	}
	if err := fresh.CompileTemplate(s.mgr.TemplateFuncs(&fresh)); err != nil {
		return nil, fmt.Errorf("compiling campaign %d: %w", id, err)
	}
	s.cache[id] = cachedCampaign{camp: &fresh, updated: fresh.UpdatedAt.Time, at: time.Now()}
	return &fresh, nil
}

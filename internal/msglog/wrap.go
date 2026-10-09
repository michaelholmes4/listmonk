package msglog

import (
	"encoding/json"
	"fmt"
	"net/mail"
	"net/textproto"
	"strconv"
	"strings"
	"time"

	"github.com/knadh/listmonk/internal/utils"
	"github.com/knadh/listmonk/models"
)

// Internal headers a sender can set to tell the log which automation a message belongs to. They are
// removed before the message reaches the messenger, so they are never sent.
const (
	HdrAutomation = "X-Librelist-Log-Automation"
	HdrEnrollment = "X-Librelist-Log-Enrollment"
)

// Messenger is manager.Messenger (declared again so this package does not import the manager).
type Messenger interface {
	Name() string
	Push(models.Message) error
	Flush() error
	Close() error
}

type logged struct {
	inner Messenger
	w     *Writer
	// source is what a message with no campaign counts as.
	source string
}

// Wrap returns a Messenger that records every message it is asked to push, and the outcome. A
// message with a campaign is logged as "campaign" (or "automation" for an automation's hidden
// campaign); any other message is logged as `source`.
//
// Closing the wrapper closes the messenger and the Writer, which any other wrappers sharing it
// can still call safely: entries pushed after that are not logged.
func Wrap(m Messenger, w *Writer, source string) Messenger {
	return &logged{inner: m, w: w, source: source}
}

func (l *logged) Name() string { return l.inner.Name() }
func (l *logged) Flush() error { return l.inner.Flush() }

func (l *logged) Close() error {
	err := l.inner.Close()
	l.w.Close()
	return err
}

func (l *logged) Push(m models.Message) error {
	e := l.entry(&m)
	err := l.inner.Push(m)
	if err != nil {
		e.Status, e.Error = StatusFailed, err.Error()
	}
	l.w.Add(e)
	return err
}

// entry describes m before it is sent. It strips the internal headers from m and gives it a
// Message-Id if it will not get one otherwise (so the log can record it).
func (l *logged) entry(m *models.Message) Entry {
	e := Entry{
		CreatedAt:    time.Now(),
		Source:       l.source,
		Messenger:    l.inner.Name(),
		Status:       StatusSent,
		From:         m.From,
		To:           m.To,
		Subject:      m.Subject,
		ContentType:  m.ContentType,
		SubscriberID: m.Subscriber.ID,
	}

	if m.Headers != nil {
		e.AutomationID, _ = strconv.Atoi(m.Headers.Get(HdrAutomation))
		e.EnrollmentID, _ = strconv.ParseInt(m.Headers.Get(HdrEnrollment), 10, 64)
		m.Headers.Del(HdrAutomation)
		m.Headers.Del(HdrEnrollment)
	}

	keepBody := true
	switch {
	case m.Campaign != nil:
		e.CampaignID = m.Campaign.ID
		if m.Campaign.Type == "automation" {
			e.Source = SourceAutomation
		} else {
			e.Source = SourceCampaign
			keepBody = false
		}
	case e.AutomationID != 0:
		e.Source = SourceAutomation
	case l.source == SourceSystem:
		keepBody = false
	}
	if keepBody {
		body := string(m.Body)
		e.Body = &body
		if len(m.AltBody) > 0 {
			alt := string(m.AltBody)
			e.AltBody = &alt
		}
	}

	// Only the email messengers generate their own Message-Id (and only when none is set).
	if strings.HasPrefix(l.inner.Name(), "email") {
		if m.Headers == nil {
			m.Headers = textproto.MIMEHeader{}
		}
		if m.Headers.Get("Message-Id") == "" {
			d := "localhost"
			if a, err := mail.ParseAddress(m.From); err == nil {
				d = a.Address[strings.LastIndex(a.Address, "@")+1:]
			}
			if r, err := utils.GenerateRandomString(24); err == nil {
				m.Headers.Set("Message-Id", fmt.Sprintf("<%s@%s>", r, d))
			}
		}
	}
	e.MessageID = m.Headers.Get("Message-Id")
	if len(m.Headers) > 0 {
		e.Headers, _ = json.Marshal(m.Headers)
	}

	type att struct {
		Name   string `json:"name"`
		Size   int    `json:"size"`
		Inline bool   `json:"inline,omitempty"`
	}
	atts := make([]att, 0, len(m.Attachments))
	for _, a := range m.Attachments {
		atts = append(atts, att{Name: a.Name, Size: len(a.Content), Inline: a.IsInline})
	}
	e.Attachments, _ = json.Marshal(atts)
	return e
}

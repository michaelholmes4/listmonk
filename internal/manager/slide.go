package manager

import "time"

// fork: the sliding window (the "N messages per period" sending limit) covers automation emails as
// well as campaigns. Upstream only the campaign pipe counts and enforces it, so automation emails,
// which skip the pipe, could go over a provider's limit. The count is shared and guarded by a lock
// (several campaigns may run at once). A campaign that reaches the limit sleeps until the window
// ends, as upstream; an automation email over the limit is refused with the time the window ends,
// and its caller sends it again then.

func (m *Manager) slidingOn() bool {
	return m.cfg.SlidingWindow && m.cfg.SlidingWindowRate > 0 && m.cfg.SlidingWindowDuration.Seconds() > 1
}

// slidingCountPipe counts one campaign message and returns how long the campaign must wait before
// its next one (0: no wait). The count stays at the limit until the window ends, so automation emails
// are held back meanwhile too.
func (m *Manager) slidingCountPipe() time.Duration {
	if !m.slidingOn() {
		return 0
	}
	m.forkSlide.Lock()
	defer m.forkSlide.Unlock()
	m.slidingRoll()
	m.slidingCount++
	if m.slidingCount < m.cfg.SlidingWindowRate {
		return 0
	}
	wait := time.Until(m.slidingStart.Add(m.cfg.SlidingWindowDuration))
	m.log.Printf("messages exceeded (%d) for the window (%v since %s). Sleeping for %s.",
		m.slidingCount, m.cfg.SlidingWindowDuration, m.slidingStart.Format(time.RFC822Z), wait.Round(time.Second))
	return wait
}

// SlidingReserve takes one message from the sliding window for an automation email. It reports
// false, with the time the window ends, if the window is full.
func (m *Manager) SlidingReserve() (bool, time.Time) {
	if !m.slidingOn() {
		return true, time.Time{}
	}
	m.forkSlide.Lock()
	defer m.forkSlide.Unlock()
	m.slidingRoll()
	if m.slidingCount >= m.cfg.SlidingWindowRate {
		return false, m.slidingStart.Add(m.cfg.SlidingWindowDuration)
	}
	m.slidingCount++
	return true, time.Time{}
}

// slidingRoll starts a new window once the current one is over. Call with forkSlide held.
func (m *Manager) slidingRoll() {
	if time.Since(m.slidingStart) >= m.cfg.SlidingWindowDuration {
		m.slidingStart = time.Now()
		m.slidingCount = 0
	}
}

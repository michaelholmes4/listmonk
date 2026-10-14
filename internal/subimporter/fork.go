package subimporter

// fork: automation triggers for imported subscribers. The importer writes subscribers and
// their subscriptions with its own statements, in batches, so core's trigger hooks never see them.
// Before each batch is committed, Options.ForkBatch is given the batch's emails and lists (it reads
// the state before the batch, which is not committed yet) and returns what to call once the batch is
// committed (it compares and fires the triggers). Only the subscribe mode is passed on: a blocklist
// import never starts anything.

// forkAdd remembers an imported subscriber's email for the current batch.
func (s *Session) forkAdd(email string) {
	if s.im.opt.ForkBatch != nil && s.opt.Mode == ModeSubscribe {
		s.forkEmails = append(s.forkEmails, email)
	}
}

// forkBatch is called just before a batch is committed. Call the function it returns once the commit
// has succeeded.
func (s *Session) forkBatch() func() {
	emails := s.forkEmails
	s.forkEmails = nil
	if len(emails) == 0 {
		return func() {}
	}
	return s.im.opt.ForkBatch(emails, s.opt.ListIDs)
}

-- The hidden campaigns behind automation email steps were created as 'draft'. Stock listmonk lets a
-- draft be started, which would send the step's email to its whole topic list if the fork were ever
-- rolled back. 'cancelled' can't be started, scheduled or edited there. The fork never reads a step
-- campaign's status: the engine sends it, and the step editor updates it through core.UpdateCampaign.
UPDATE campaigns SET status = 'cancelled', updated_at = NOW() WHERE type = 'automation' AND status <> 'cancelled';

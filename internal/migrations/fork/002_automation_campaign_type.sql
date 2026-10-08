-- Automation send steps are backed by a hidden campaign of this type, so they get the campaign
-- editor, templates, link/open tracking and analytics unchanged. The campaign manager and the
-- default campaign list skip them (queries/campaigns.sql).
ALTER TYPE campaign_type ADD VALUE IF NOT EXISTS 'automation';

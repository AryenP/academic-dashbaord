-- Aryen's call (2026-10-21): read with Claude Haiku 5.5 by default, for cost. Opus 5.5 stays one
-- update away: update app_config set value = '"claude-opus-5-5"' where key = 'ai_model_classify'.
update app_config set value = '"claude-haiku-5-5"', updated_at = now() where key = 'ai_model_classify';

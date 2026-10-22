-- Runway v2, Phase 5: the iPhone Shortcut gets its own token purpose, so making a new extension
-- token doesn't break the Shortcut and the other way round. Same table, same one-row-per-purpose.

alter table access_tokens drop constraint access_tokens_purpose_check;
alter table access_tokens
  add constraint access_tokens_purpose_check check (purpose in ('feed', 'extension', 'shortcut'));

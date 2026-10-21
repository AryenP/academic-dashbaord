-- App-level secrets in Vault, read by the Edge Functions through the service role.
--
-- The hosted functions runtime serves a stale environment after some deploys (seen 2026-10-21:
-- `supabase secrets set` changed the stored secret, the running functions kept the old value for
-- hours). The database is never stale, so the shared secrets the functions need (the sync key,
-- the Anthropic key) live here, encrypted, and the environment is only a fallback.

create function set_app_secret(p_name text, p_value text) returns void
language plpgsql security definer set search_path = public, vault as $$
declare sid uuid;
begin
  if p_name !~ '^[A-Z0-9_]{3,40}$' then raise exception 'bad secret name'; end if;
  select id into sid from vault.secrets where name = 'app:' || p_name;
  if sid is null then
    perform vault.create_secret(p_value, 'app:' || p_name);
  else
    perform vault.update_secret(sid, p_value);
  end if;
end $$;

create function app_secret(p_name text) returns text
language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'app:' || p_name
$$;

revoke execute on function set_app_secret(text, text), app_secret(text) from public, anon, authenticated;
grant execute on function set_app_secret(text, text), app_secret(text) to service_role;

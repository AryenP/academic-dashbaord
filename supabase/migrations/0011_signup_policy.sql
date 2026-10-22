-- Runway v2: the school-email rule becomes a switch.
--
-- `app_config.school_email_only` (default true) is read by the sign-up trigger and, through
-- `signup_policy()`, by the sign-in form. Off while Runway is tested with ordinary accounts;
-- back on with: update app_config set value = 'true' where key = 'school_email_only'.

insert into app_config (key, value) values ('school_email_only', 'true')
  on conflict (key) do nothing;

create or replace function check_school_email() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  only_school boolean := coalesce(
    (select (value)::boolean from app_config where key = 'school_email_only'), true);
begin
  if new.email is null then
    raise exception 'Runway needs an email address to sign up.' using errcode = 'P0001';
  end if;
  if only_school and not is_school_email(new.email) then
    raise exception 'Runway is for students: sign up with your school email.' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- What the sign-in screen needs to know before anyone is signed in. Nothing private in it.
create function signup_policy() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'school_email_only',
    coalesce((select (value)::boolean from app_config where key = 'school_email_only'), true));
$$;
revoke all on function signup_policy() from public;
grant execute on function signup_policy() to anon, authenticated;

-- Runway v2, Phase 5: signals. One coarse summary per day per kind (hours slept, exercise minutes,
-- steps, a place label) posted by the person's iPhone Shortcut through the `signals` function.
-- No raw health samples and no coordinates: the place is a short label the person chose.

create table signals (
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  day date not null,
  kind text not null check (kind in ('sleep_h', 'exercise_min', 'steps', 'place')),
  value numeric,
  label text check (label is null or char_length(label) between 1 and 80),
  source text not null default 'shortcut' check (char_length(source) between 1 and 40),
  updated_at timestamptz not null default now(),
  primary key (user_id, day, kind),
  -- The ranges live here too, so they hold whichever way a row arrives.
  check (
    case kind
      when 'sleep_h' then value is not null and value between 0 and 24
      when 'exercise_min' then value is not null and value between 0 and 1440
      when 'steps' then value is not null and value between 0 and 200000 and value = trunc(value)
      when 'place' then label is not null
    end
  )
);

alter table signals enable row level security;
create policy "own signals" on signals
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke all on signals from anon;

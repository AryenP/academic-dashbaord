-- Runway v2, step 6: the AI's weekly review, kept so it's written once per week.

create table weekly_reviews (
  user_id uuid not null references auth.users on delete cascade,
  week date not null,          -- the Monday, in the person's timezone
  text text not null,
  model text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, week)
);
alter table weekly_reviews enable row level security;
create policy "own reviews" on weekly_reviews for select to authenticated using (auth.uid() = user_id);
revoke all on weekly_reviews from anon;
revoke insert, update, delete on weekly_reviews from authenticated; -- the function writes them

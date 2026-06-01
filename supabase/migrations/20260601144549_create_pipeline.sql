create table if not exists public.pipeline (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stage text not null check (stage in ('tracking','rfi_submitted','bid_no_bid','proposal_in_progress','submitted','awarded','no_bid')),
  solicitation_number text,
  agency text,
  title text not null,
  estimated_value text,
  due_date date,
  naics text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.pipeline enable row level security;
create policy "Users see own pipeline" on public.pipeline
  for all using (auth.uid() = user_id);

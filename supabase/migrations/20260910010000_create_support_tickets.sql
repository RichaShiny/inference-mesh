create table if not exists public.support_tickets (
  id uuid primary key,
  workspace_id uuid not null,
  message text not null check (char_length(message) between 1 and 2000),
  category text not null,
  predicted_category text not null,
  model text not null,
  model_score double precision not null,
  inference_ms double precision not null,
  total_ms double precision not null,
  reviewed boolean not null default false,
  policy text not null,
  priority text not null check (priority in ('Normal', 'High')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  owner_name text not null default 'Unassigned',
  work_unit jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_workspace_created_idx
  on public.support_tickets (workspace_id, created_at desc);

alter table public.support_tickets enable row level security;

-- Prototype policy: the browser-generated workspace id separates demo queues.
-- Replace this with auth.uid()-based membership before production use.
create policy "prototype workspace ticket access"
  on public.support_tickets for all to anon
  using (true) with check (true);

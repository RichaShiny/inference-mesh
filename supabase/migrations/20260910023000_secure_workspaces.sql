create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create or replace function public.ensure_personal_workspace()
returns uuid language plpgsql security definer set search_path = public
as $$
declare selected_workspace uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select workspace_id into selected_workspace from public.workspace_members
    where user_id = auth.uid() order by created_at limit 1;
  if selected_workspace is null then
    insert into public.workspaces (name, owner_id)
      values (coalesce(auth.jwt() ->> 'email', 'My') || ' workspace', auth.uid())
      returning id into selected_workspace;
    insert into public.workspace_members (workspace_id, user_id, role)
      values (selected_workspace, auth.uid(), 'owner');
  end if;
  return selected_workspace;
end;
$$;

revoke all on function public.ensure_personal_workspace() from public;
grant execute on function public.ensure_personal_workspace() to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

create policy "members can view their workspace" on public.workspaces for select to authenticated
  using (exists (select 1 from public.workspace_members m where m.workspace_id = id and m.user_id = auth.uid()));
create policy "users can view their memberships" on public.workspace_members for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "prototype workspace ticket access" on public.support_tickets;
create policy "members can read tickets" on public.support_tickets for select to authenticated
  using (exists (select 1 from public.workspace_members m where m.workspace_id = support_tickets.workspace_id and m.user_id = auth.uid()));
create policy "members can create tickets" on public.support_tickets for insert to authenticated
  with check (exists (select 1 from public.workspace_members m where m.workspace_id = support_tickets.workspace_id and m.user_id = auth.uid()));
create policy "members can update tickets" on public.support_tickets for update to authenticated
  using (exists (select 1 from public.workspace_members m where m.workspace_id = support_tickets.workspace_id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.workspace_members m where m.workspace_id = support_tickets.workspace_id and m.user_id = auth.uid()));

grant select on public.workspaces, public.workspace_members to authenticated;
grant select, insert, update on public.support_tickets to authenticated;

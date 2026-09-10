-- Workspace members need an explicit delete policy for the privacy controls in the app.
create policy "members can delete tickets"
  on public.support_tickets for delete to authenticated
  using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = support_tickets.workspace_id
        and m.user_id = auth.uid()
    )
  );

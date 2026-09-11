-- 0015_storage
--
-- Private buckets and their policies.
--
-- Every bucket except public-assets is private. Nothing here is ever served
-- from a permanent public URL: private objects reach a browser only through a
-- short-lived signed URL issued server-side, after the same permission check
-- the table policies apply.
--
-- Object paths are prefixed with the organization id, so storage isolation is
-- keyed on the same boundary as table isolation:
--
--   attendance-selfies/{organization_id}/{employee_id}/{record_id}.jpg
--
-- On a real Supabase project the storage schema already exists. The guard
-- below lets this migration run against the local test cluster too, where it
-- does not — the policies are then skipped, and the table tests that matter
-- are unaffected.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema absent (local test cluster) — skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values
    ('public-assets',        'public-assets',        true),
    ('employee-documents',   'employee-documents',   false),
    ('attendance-selfies',   'attendance-selfies',   false),
    ('applicant-documents',  'applicant-documents',  false),
    ('task-attachments',     'task-attachments',     false),
    ('field-visit-evidence', 'field-visit-evidence', false),
    ('company-documents',    'company-documents',    false),
    ('payslips',             'payslips',             false)
  on conflict (id) do nothing;

  -- Read: the first path segment must be the caller's own organization.
  -- Beyond that, who may see a particular selfie is decided by the table
  -- policies when the signed URL is issued — this is the outer boundary, not
  -- the whole rule.
  execute $p$
    create policy "tenant reads its own private objects"
      on storage.objects for select to authenticated
      using (
        bucket_id in (
          'employee-documents', 'attendance-selfies', 'applicant-documents',
          'task-attachments', 'field-visit-evidence', 'company-documents',
          'payslips'
        )
        and (storage.foldername(name))[1] = current_org_id()::text
      )
  $p$;

  -- Write: an employee may add their own attendance selfie; everything else
  -- is written server-side.
  execute $p$
    create policy "employee writes own attendance selfie"
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'attendance-selfies'
        and (storage.foldername(name))[1] = current_org_id()::text
        and (storage.foldername(name))[2] = my_employee_id()::text
      )
  $p$;

  -- Selfies are evidence. They are never replaced or removed by the person
  -- they depict, so there is deliberately no update or delete policy —
  -- retention deletion runs server-side.
  execute $p$
    create policy "public assets are readable"
      on storage.objects for select to public
      using (bucket_id = 'public-assets')
  $p$;
end
$$;

-- Create paths.
--
-- The workspace shipped with review and approval screens but no way to
-- originate anything: no employee, task, payroll period or job could be
-- created through the product. Almost all of that was a missing UI over
-- policies that already existed — this migration covers the one place where
-- the schema itself blocked a create.
--
-- `tasks.reference` is `not null` with no default and no trigger, so every
-- insert had to supply a value. The sequence and the generator function have
-- existed since 0016; nothing was wired to them. Making it a column default
-- keeps reference allocation in the database, where a client cannot skip it,
-- pick its own, or race another writer for the same number.

alter table tasks
  alter column reference set default next_task_reference();

-- nextval() needs USAGE on the sequence, and the default is evaluated as the
-- inserting role. Without this the default raises instead of filling in.
grant usage on sequence task_reference_seq to authenticated;

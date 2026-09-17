-- ===========================================================================
-- Who the hiring emails come from.
--
-- The sending address is the company's, not the platform's, and it changes
-- without a deploy — so it belongs in settings, next to the timezone the same
-- emails are rendered in, rather than in an environment variable.
--
-- The API key stays a server secret. The split is deliberate: the key is a
-- credential that must never reach a browser or a database row, and the
-- address is ordinary tenant configuration that an administrator should be
-- able to read and change.
--
-- CHANGING THESE DOES NOT MAKE THEM VALID
--
-- Resend rejects any `from` on a domain that has not been verified in their
-- dashboard. Nothing here can check that — a verified domain is a fact about
-- an account we cannot see — so the failure surfaces where it is actionable:
-- the provider's own words, recorded against the message that failed.
-- ===========================================================================

alter table organization_settings
  add column if not exists email_from_name    text,
  add column if not exists email_from_address text,
  add column if not exists email_reply_to     text;

-- A blank string is not an address, and would otherwise reach the provider as
-- one. Null means "not configured"; anything present must look like an email.
alter table organization_settings
  drop constraint if exists email_from_address_shaped;
alter table organization_settings
  add constraint email_from_address_shaped
  check (
    email_from_address is null
    or email_from_address ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  );

alter table organization_settings
  drop constraint if exists email_reply_to_shaped;
alter table organization_settings
  add constraint email_reply_to_shaped
  check (
    email_reply_to is null
    or email_reply_to ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  );

comment on column organization_settings.email_from_address is
  'The address hiring emails are sent from. Must be on a domain verified with '
  'the email provider, which this cannot check — a send against an '
  'unverified domain is rejected and the reason is recorded on the message.';

comment on column organization_settings.email_from_name is
  'The display name beside the address. "Recruitment" reads better to a '
  'candidate than the address alone.';

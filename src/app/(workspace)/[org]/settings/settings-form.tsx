"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { updateSettings } from "@/lib/settings/actions";
import type { OrgSettings } from "@/lib/settings/queries";

/**
 * Company settings.
 *
 * One form, saved in one transaction, rather than a save button per section.
 * These values are read together — a session timeout and a lockout window only
 * make sense next to each other — and per-field autosave on a security policy
 * invites a half-applied change nobody notices.
 *
 * Read-only for anyone without settings.manage. The fields still render,
 * disabled, because "restricted, not hidden" applies here as it does to the
 * nav: a blank panel makes the product look unfinished.
 */
export function SettingsForm({
  org,
  settings,
  canEdit,
}: {
  org: string;
  settings: OrgSettings;
  canEdit: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateSettings({}, formData);
      if (result.done) setSaved(true);
      else setError(result.error ?? "That couldn't be saved.");
    });
  }

  return (
    <form action={submit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="org" value={org} />

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-error-border bg-error-surface p-3 text-small text-danger-fg"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      {saved ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-success-border bg-success-surface p-3 text-small text-success-fg"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          Saved. The change is recorded in the audit log.
        </p>
      ) : null}

      <Section
        title="Company"
        note="Used for dates, times and money across every screen and payslip."
      >
        <Field label="Timezone" htmlFor="timezone" required>
          <Input
            id="timezone"
            name="timezone"
            defaultValue={settings.timezone}
            disabled={!canEdit}
          />
        </Field>
        <Field label="Currency" htmlFor="currencyCode" hint="Three letters, e.g. NGN." required>
          <Input
            id="currencyCode"
            name="currencyCode"
            defaultValue={settings.currency_code}
            maxLength={3}
            disabled={!canEdit}
          />
        </Field>
      </Section>

      <Section
        title="Attendance"
        note="The default radius applies to a new office. Each office can override it below."
      >
        <Field
          label="Default geofence radius"
          htmlFor="defaultGeofenceRadiusM"
          hint="Metres. A check-in inside this distance counts as at the office."
          required
        >
          <Input
            id="defaultGeofenceRadiusM"
            name="defaultGeofenceRadiusM"
            type="number"
            min={1}
            max={5000}
            defaultValue={settings.default_geofence_radius_m}
            disabled={!canEdit}
          />
        </Field>
      </Section>

      <Section
        title="Security"
        note="Applies to everyone who signs in, including administrators."
      >
        <Field label="Session timeout" htmlFor="sessionTimeoutMinutes" hint="Minutes." required>
          <Input id="sessionTimeoutMinutes" name="sessionTimeoutMinutes" type="number"
            min={1} max={1440} defaultValue={settings.session_timeout_minutes} disabled={!canEdit} />
        </Field>
        <Field label="Failed sign-ins before lockout" htmlFor="failedLoginLimit" required>
          <Input id="failedLoginLimit" name="failedLoginLimit" type="number"
            min={1} max={20} defaultValue={settings.failed_login_limit} disabled={!canEdit} />
        </Field>
        <Field label="Lockout length" htmlFor="lockoutMinutes" hint="Minutes." required>
          <Input id="lockoutMinutes" name="lockoutMinutes" type="number"
            min={1} max={1440} defaultValue={settings.lockout_minutes} disabled={!canEdit} />
        </Field>
        <Field
          label="Minimum password length"
          htmlFor="passwordMinLength"
          hint="Eight is the lowest this product accepts."
          required
        >
          <Input id="passwordMinLength" name="passwordMinLength" type="number"
            min={8} max={72} defaultValue={settings.password_min_length} disabled={!canEdit} />
        </Field>
      </Section>

      <Section
        title="Data retention"
        note="How long personal data is kept. Selfies and coordinates are the most sensitive things this product stores; shorter is safer, and the law may set a floor."
      >
        <Field label="Check-in selfies" htmlFor="selfieRetentionMonths" hint="Months." required>
          <Input id="selfieRetentionMonths" name="selfieRetentionMonths" type="number"
            min={1} max={120} defaultValue={settings.selfie_retention_months} disabled={!canEdit} />
        </Field>
        <Field label="Location readings" htmlFor="coordinateRetentionMonths" hint="Months." required>
          <Input id="coordinateRetentionMonths" name="coordinateRetentionMonths" type="number"
            min={1} max={120} defaultValue={settings.coordinate_retention_months} disabled={!canEdit} />
        </Field>
        <Field label="Audit log" htmlFor="auditRetentionYears" hint="Years." required>
          <Input id="auditRetentionYears" name="auditRetentionYears" type="number"
            min={1} max={25} defaultValue={settings.audit_retention_years} disabled={!canEdit} />
        </Field>
      </Section>

      {canEdit ? (
        <div>
          <Button type="submit" loading={pending}>
            Save settings
          </Button>
        </div>
      ) : null}
    </form>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <div>
          <h2 className="text-h3">{title}</h2>
          <p className="mt-1 max-w-[68ch] text-small text-text-2">{note}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">{children}</div>
      </CardBody>
    </Card>
  );
}

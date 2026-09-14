"use client";

import { CreatePanel } from "@/components/forms/create-panel";
import { Field, Input } from "@/components/ui/field";
import { Card, CardBody } from "@/components/ui/card";
import { createOffice } from "@/lib/settings/actions";
import type { OfficeRow } from "@/lib/settings/queries";

/**
 * Offices and their geofences.
 *
 * The radius here is not cosmetic: it decides whether someone standing at this
 * site is recorded as present or as remote, and a check-in is evidence in a
 * pay dispute. So each office shows its own radius plainly rather than
 * inheriting a company default invisibly.
 *
 * Coordinates are entered as decimal degrees. A map picker would be kinder,
 * and the product has no tile provider — that decision is still open
 * (docs/BACKLOG.md), and a fake map would be worse than an honest number.
 */
export function Offices({
  org,
  offices,
  canManage,
  defaultRadius,
}: {
  org: string;
  offices: OfficeRow[];
  canManage: boolean;
  defaultRadius: number;
}) {
  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-h3">Offices</h2>
            <p className="mt-1 max-w-[68ch] text-small text-text-2">
              A check-in within an office&rsquo;s radius is recorded as at the
              office. Outside it, as remote — and remote check-ins are flagged
              for review.
            </p>
          </div>
          {canManage ? (
            <CreatePanel
              org={org}
              action={createOffice}
              label="Add office"
              title="Add an office"
              subtitle="Coordinates in decimal degrees, radius in metres."
            >
              <Field label="Name" htmlFor="name" required>
                <Input id="name" name="name" placeholder="Apapa depot" required />
              </Field>
              <Field label="Address" htmlFor="address">
                <Input id="address" name="address" placeholder="Warehouse Road, Apapa, Lagos" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Latitude" htmlFor="latitude" hint="e.g. 6.4312" required>
                  <Input id="latitude" name="latitude" type="number" step="any" required />
                </Field>
                <Field label="Longitude" htmlFor="longitude" hint="e.g. 3.4219" required>
                  <Input id="longitude" name="longitude" type="number" step="any" required />
                </Field>
              </div>
              <Field
                label="Geofence radius"
                htmlFor="geofenceRadiusM"
                hint="Metres. A depot usually needs more than an office."
                required
              >
                <Input
                  id="geofenceRadiusM"
                  name="geofenceRadiusM"
                  type="number"
                  min={1}
                  max={5000}
                  defaultValue={defaultRadius}
                  required
                />
              </Field>
            </CreatePanel>
          ) : null}
        </div>

        {offices.length === 0 ? (
          <p className="rounded-lg border border-border bg-bg p-4 text-small text-text-2">
            No offices yet. Until one exists, every check-in is recorded as
            remote, because there is nowhere for it to be near.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {offices.map((office) => (
              <li
                key={office.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-bg px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-small font-medium">{office.name}</p>
                  <p className="mt-0.5 text-small text-text-3">
                    {office.address ?? "No address recorded"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-small" data-numeric>
                    {office.geofence_radius_m}m
                  </p>
                  <p className="font-mono text-[11px] text-text-3">
                    {office.latitude?.toFixed(4) ?? "—"},{" "}
                    {office.longitude?.toFixed(4) ?? "—"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

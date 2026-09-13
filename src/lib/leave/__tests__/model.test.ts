import { describe, expect, it } from "vitest";
import {
  buildLeaveTimeline,
  leaveStatusLabel,
  leaveStatusShort,
  leaveStatusTone,
  LEAVE_STATUSES,
  waitedFor,
  type ApprovalRecord,
} from "@/lib/leave/model";

describe("leave status vocabulary", () => {
  it("labels and tones every status", () => {
    for (const status of LEAVE_STATUSES) {
      expect(leaveStatusLabel[status]).toBeTruthy();
      expect(leaveStatusShort[status]).toBeTruthy();
      expect(leaveStatusTone[status]).toBeTruthy();
    }
  });

  it("does not present a declined request as neutral", () => {
    expect(leaveStatusTone.declined).toBe("danger");
    expect(leaveStatusTone.approved).toBe("success");
  });

  it("distinguishes the two waiting stages", () => {
    // "Pending" alone would leave the requester unable to tell who to chase.
    expect(leaveStatusShort.pending_hod).not.toBe(leaveStatusShort.pending_hr);
    expect(leaveStatusLabel.pending_hod).toMatch(/head of department/i);
    expect(leaveStatusLabel.pending_hr).toMatch(/HR/);
  });
});

describe("buildLeaveTimeline", () => {
  const submitted = "2026-03-01T09:00:00Z";
  const now = new Date("2026-03-04T09:00:00Z");

  it("shows four nodes when the request routed through an HOD", () => {
    const nodes = buildLeaveTimeline({
      status: "pending_hod",
      approvals: [],
      routedToHod: true,
      submittedAt: submitted,
      now,
    });
    expect(nodes.map((n) => n.label)).toEqual([
      "Submitted",
      "Head of department",
      "HR",
      "Approved",
    ]);
  });

  it("omits the HOD node when there was no HOD stage", () => {
    // A department head's own request goes straight to HR. Showing a
    // permanently empty HOD node would imply a missing step.
    const nodes = buildLeaveTimeline({
      status: "pending_hr",
      approvals: [],
      routedToHod: false,
      submittedAt: submitted,
      now,
    });
    expect(nodes.map((n) => n.label)).toEqual(["Submitted", "HR", "Approved"]);
  });

  it("marks the stage currently waiting as active, with how long", () => {
    const nodes = buildLeaveTimeline({
      status: "pending_hod",
      approvals: [],
      routedToHod: true,
      submittedAt: submitted,
      now,
    });
    const hod = nodes.find((n) => n.label === "Head of department");
    expect(hod?.state).toBe("active");
    expect(hod?.waiting).toBe("waiting 3 days");
  });

  it("advances to HR once the HOD has approved", () => {
    const approvals: ApprovalRecord[] = [
      {
        stage: "hod",
        decision: "approved",
        note: "Cover arranged.",
        decided_at: "2026-03-02T09:00:00Z",
      },
    ];
    const nodes = buildLeaveTimeline({
      status: "pending_hr",
      approvals,
      routedToHod: true,
      submittedAt: submitted,
      now,
    });
    expect(nodes.find((n) => n.label === "Head of department")?.state).toBe("done");
    expect(nodes.find((n) => n.label === "HR")?.state).toBe("active");
    // Waiting is measured from the HOD decision, not from submission — HR has
    // only had it for two days.
    expect(nodes.find((n) => n.label === "HR")?.waiting).toBe("waiting 2 days");
  });

  it("shows a decline as rejected and carries the reason", () => {
    const approvals: ApprovalRecord[] = [
      {
        stage: "hod",
        decision: "declined",
        note: "Stock-take week — please move this.",
        decided_at: "2026-03-02T09:00:00Z",
      },
    ];
    const nodes = buildLeaveTimeline({
      status: "declined",
      approvals,
      routedToHod: true,
      submittedAt: submitted,
      now,
    });
    const hod = nodes.find((n) => n.label === "Head of department");
    expect(hod?.state).toBe("rejected");
    expect(hod?.detail).toMatch(/Stock-take/);
    expect(nodes.at(-1)?.label).toBe("Declined");
  });

  it("marks the final node done only on approval", () => {
    const nodes = buildLeaveTimeline({
      status: "approved",
      approvals: [
        { stage: "hod", decision: "approved", note: null, decided_at: submitted },
        { stage: "hr", decision: "approved", note: null, decided_at: submitted },
      ],
      routedToHod: true,
      submittedAt: submitted,
      now,
    });
    expect(nodes.at(-1)).toMatchObject({ label: "Approved", state: "done" });
  });
});

describe("waitedFor", () => {
  const now = new Date("2026-03-04T12:00:00Z");

  it("reports whole days", () => {
    expect(waitedFor("2026-03-01T12:00:00Z", now)).toBe("waiting 3 days");
    expect(waitedFor("2026-03-03T12:00:00Z", now)).toBe("waiting 1 day");
  });

  it("falls back to hours under a day", () => {
    expect(waitedFor("2026-03-04T09:00:00Z", now)).toBe("waiting 3 hours");
    expect(waitedFor("2026-03-04T11:00:00Z", now)).toBe("waiting 1 hour");
  });

  it("says so rather than showing zero", () => {
    expect(waitedFor("2026-03-04T11:59:00Z", now)).toBe("waiting less than an hour");
  });

  it("returns nothing without a start", () => {
    expect(waitedFor(null, now)).toBeUndefined();
  });
});

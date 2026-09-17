import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Sending what the pipeline queued.
 *
 * WHY THE QUEUE EXISTS AT ALL
 *
 * Every message is written to `outbound_emails` by the same database function
 * that moves the applicant, inside the same statement. Delivery is a separate
 * attempt against that row. So the record of what a candidate was told, and
 * when, survives a provider outage, a bad API key, and a deploy in the middle
 * of a stage change — none of which are hypothetical.
 *
 * It also means the product is honest with no provider configured: rows sit at
 * `queued`, the screen says so, and nothing is silently dropped.
 *
 * WHY THERE IS NO SDK
 *
 * Resend's REST API is one POST. A dependency for that is a dependency to
 * audit, update and trust, and swapping providers becomes a rewrite rather
 * than a different fetch.
 */

export type SendOutcome = {
  attempted: number;
  sent: number;
  failed: number;
  /** True when no provider is configured — nothing was attempted. */
  unconfigured: boolean;
};

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

type QueuedEmail = {
  id: string;
  to_email: string;
  to_name: string;
  subject: string;
  body: string;
};

/**
 * Drain the queue for the caller's organization.
 *
 * Reads are scoped by RLS to the caller's tenant, so this cannot reach another
 * company's mail. Marking a row sent or failed goes through a SECURITY DEFINER
 * function rather than the service-role client — the service key is used for
 * exactly one thing in this codebase (creating an auth user) and this is not
 * a reason to widen that.
 *
 * Called after each pipeline action rather than on a schedule. A cron would be
 * better under load; at the volume a hiring pipeline produces, sending on the
 * action means the person who pressed the button learns immediately whether
 * the message went.
 */
export async function sendQueuedEmails(limit = 10): Promise<SendOutcome> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("outbound_emails")
    .select("id, to_email, to_name, subject, body")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("email: could not read the queue", error.message, error.code);
    return { attempted: 0, sent: 0, failed: 0, unconfigured: false };
  }

  const queued = (data ?? []) as QueuedEmail[];
  if (queued.length === 0) {
    return { attempted: 0, sent: 0, failed: 0, unconfigured: !isEmailConfigured() };
  }

  if (!isEmailConfigured()) {
    // Deliberately not marked failed. Nothing was wrong with the message and
    // nothing was attempted — they send the moment a key is added, which is
    // what someone setting this up expects to happen.
    return {
      attempted: 0,
      sent: 0,
      failed: 0,
      unconfigured: true,
    };
  }

  let sent = 0;
  let failed = 0;

  for (const email of queued) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM,
          to: [email.to_email],
          subject: email.subject,
          text: email.body,
          ...(process.env.EMAIL_REPLY_TO
            ? { reply_to: process.env.EMAIL_REPLY_TO }
            : {}),
        }),
      });

      if (!response.ok) {
        // The provider's own message, truncated. It names the actual problem —
        // an unverified domain, a malformed address — and a generic "sending
        // failed" would send someone hunting through code instead.
        const detail = await response.text();
        await supabase.rpc("mark_email_failed", {
          p_id: email.id,
          p_error: `${response.status}: ${detail.slice(0, 300)}`,
        });
        failed++;
        continue;
      }

      const payload = (await response.json()) as { id?: string };
      await supabase.rpc("mark_email_sent", {
        p_id: email.id,
        p_provider_id: payload.id ?? null,
      });
      sent++;
    } catch (cause) {
      await supabase.rpc("mark_email_failed", {
        p_id: email.id,
        p_error: cause instanceof Error ? cause.message : "network error",
      });
      failed++;
    }
  }

  return { attempted: queued.length, sent, failed, unconfigured: false };
}

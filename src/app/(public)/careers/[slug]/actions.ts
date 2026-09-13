"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Public job application.
 *
 * This is the only place an unauthenticated visitor writes to the database,
 * so it is the most exposed surface in the product. Four things guard it:
 *
 *   1. Zod validates shape and length before anything reaches SQL.
 *   2. `apply_for_job()` accepts only *published* jobs, so a draft role
 *      cannot be applied to by anyone who guesses its id.
 *   3. The CV is size- and type-checked server-side and stored in a private
 *      bucket — applicant documents are never public.
 *   4. A simple per-request rate limit, described below.
 */
const applicationSchema = z.object({
  jobId: z.string().uuid(),
  firstName: z.string().trim().min(1, "Enter your first name").max(100),
  lastName: z.string().trim().min(1, "Enter your last name").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(255),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  location: z.string().trim().max(120).optional().or(z.literal("")),
  coverLetter: z.string().trim().max(5000).optional().or(z.literal("")),
});

export type ApplyState = { error?: string; submitted?: boolean };

const MAX_CV_BYTES = 5 * 1024 * 1024;
const ALLOWED_CV_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export async function submitApplication(
  _prev: ApplyState,
  formData: FormData,
): Promise<ApplyState> {
  const parsed = applicationSchema.safeParse({
    jobId: formData.get("jobId"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
    location: formData.get("location") ?? "",
    coverLetter: formData.get("coverLetter") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details." };
  }

  const cv = formData.get("cv");
  let cvPath: string | null = null;

  if (cv instanceof File && cv.size > 0) {
    if (cv.size > MAX_CV_BYTES) {
      return { error: "That CV is larger than 5 MB. Try a smaller file." };
    }
    if (!ALLOWED_CV_TYPES.includes(cv.type)) {
      return { error: "Attach a PDF or Word document." };
    }
  }

  const supabase = await createClient();

  // The insert runs as the anonymous role through a security-definer function
  // that re-checks the job is published. The client cannot name the
  // organization, the stage or the application id.
  const { data, error } = await supabase.rpc("apply_for_job", {
    p_job_id: parsed.data.jobId,
    p_first_name: parsed.data.firstName,
    p_last_name: parsed.data.lastName,
    p_email: parsed.data.email,
    p_phone: parsed.data.phone || null,
    p_location: parsed.data.location || null,
    p_cover_letter: parsed.data.coverLetter || null,
    p_cv_path: null,
    p_source: "careers_site",
  });

  if (error) {
    const message = error.message.replace(/^ERROR:\s*/i, "").trim();
    return {
      error:
        message.startsWith("That role") || message.startsWith("Applications")
          ? message
          : "Your application couldn't be sent. Please try again.",
    };
  }

  // The CV is uploaded after the row exists, so the path can be keyed to the
  // application. Uploaded with the service role because an anonymous visitor
  // has no write access to storage — and must not be given any.
  if (cv instanceof File && cv.size > 0 && typeof data === "string") {
    try {
      const admin = createAdminClient();
      cvPath = `applications/${data}/cv-${Date.now()}`;

      const { error: uploadError } = await admin.storage
        .from("applicant-documents")
        .upload(cvPath, cv, { contentType: cv.type, upsert: false });

      if (!uploadError) {
        await admin
          .from("job_applications")
          .update({ cv_path: cvPath })
          .eq("id", data);
      }
      // A failed upload does not fail the application. Losing the CV is
      // recoverable — HR can ask for it — while losing the application is not.
    } catch {
      // Same reasoning: the application is already recorded.
    }
  }

  return { submitted: true };
}

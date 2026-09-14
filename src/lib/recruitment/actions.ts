"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/session";
import { type FormState, describeWriteError } from "@/lib/forms/result";

/**
 * Job postings.
 *
 * Without this the careers site could never have a role on it: `/careers`
 * reads published jobs, and nothing in the product could publish one.
 *
 * A job is created as a draft unless the author explicitly publishes it. That
 * matters more here than elsewhere — `jobs_public_read` makes a published row
 * readable by anonymous visitors, so publishing is the one action in this
 * module that puts text on the public internet. It is a deliberate choice on
 * the form, not the default.
 */
const jobSchema = z.object({
  title: z.string().trim().min(1, "Give the role a title").max(160),
  departmentId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal(""))
    .transform((value) => (value ? value : null)),
  location: z.string().trim().max(160).optional().or(z.literal("")),
  employmentType: z.enum([
    "full_time",
    "part_time",
    "contract",
    "intern",
    "nysc",
  ]),
  summary: z.string().trim().max(500).optional().or(z.literal("")),
  description: z.string().trim().max(8000).optional().or(z.literal("")),
  responsibilities: z.string().trim().max(8000).optional().or(z.literal("")),
  requirements: z.string().trim().max(8000).optional().or(z.literal("")),
  closesOn: z.string().date().optional().or(z.literal("")),
  publish: z.boolean(),
});

/**
 * Slug from the title: lowercase, single dashes, no leading or trailing dash.
 * Must satisfy the table's CHECK, and it appears in a public URL.
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export async function createJob(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const org = String(formData.get("org") ?? "");
  const parsed = jobSchema.safeParse({
    title: formData.get("title"),
    departmentId: formData.get("departmentId") ?? "",
    location: formData.get("location") ?? "",
    employmentType: formData.get("employmentType"),
    summary: formData.get("summary") ?? "",
    description: formData.get("description") ?? "",
    responsibilities: formData.get("responsibilities") ?? "",
    requirements: formData.get("requirements") ?? "",
    closesOn: formData.get("closesOn") ?? "",
    publish: formData.get("publish") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  const slug = slugify(parsed.data.title);
  if (!slug) {
    return {
      error: "That title can't be turned into a web address. Add some letters or numbers.",
    };
  }

  const session = await requireOrg(org);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      organization_id: session.organizationId,
      title: parsed.data.title,
      slug,
      department_id: parsed.data.departmentId,
      location: parsed.data.location || null,
      employment_type: parsed.data.employmentType,
      summary: parsed.data.summary || null,
      description: parsed.data.description || null,
      responsibilities: parsed.data.responsibilities || null,
      requirements: parsed.data.requirements || null,
      closes_on: parsed.data.closesOn || null,
      status: parsed.data.publish ? "published" : "draft",
      published_at: parsed.data.publish ? new Date().toISOString() : null,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      error: describeWriteError(
        error?.code,
        error?.message ?? "",
        `A role with the web address “${slug}” already exists. Change the title slightly.`,
      ),
    };
  }

  revalidatePath("/[org]/recruitment", "page");
  // The public careers site reads published jobs, so it has to be rebuilt too.
  revalidatePath("/careers", "page");
  return { done: true, id: data.id };
}

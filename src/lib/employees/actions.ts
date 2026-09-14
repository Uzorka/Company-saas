"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/session";
import { type FormState, describeWriteError } from "@/lib/forms/result";

/**
 * Employee, department and position creation.
 *
 * These are plain inserts rather than database functions, because there is no
 * multi-table rule to enforce — RLS already decides who may write and into
 * which organization. Two things are still settled here rather than in the
 * browser:
 *
 *   1. `organization_id` comes from the verified session, never from the form.
 *      A hidden field naming the tenant is a tenant-switching bug waiting to
 *      be found.
 *   2. Zod checks shape before anything reaches SQL, so a table CHECK
 *      constraint is the backstop rather than the error message.
 */

const employeeNo = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z]{2,5}-[0-9]{3,6}$/,
    "Use letters, a dash, then digits — for example CHF-001.",
  );

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

const optionalUuid = z
  .string()
  .uuid()
  .optional()
  .or(z.literal(""))
  .transform((value) => (value ? value : null));

const employeeSchema = z.object({
  employeeNo,
  firstName: z.string().trim().min(1, "Enter a first name").max(100),
  lastName: z.string().trim().min(1, "Enter a last name").max(100),
  workEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid work email address")
    .max(255)
    .optional()
    .or(z.literal("")),
  phone: optionalText(40),
  location: optionalText(120),
  departmentId: optionalUuid,
  positionId: optionalUuid,
  employmentType: z.enum([
    "full_time",
    "part_time",
    "contract",
    "intern",
    "nysc",
  ]),
  employmentStatus: z.enum(["active", "probation"]),
  hireDate: z.string().date("Enter a hire date"),
});

export async function createEmployee(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const org = String(formData.get("org") ?? "");
  const parsed = employeeSchema.safeParse({
    employeeNo: formData.get("employeeNo"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    workEmail: formData.get("workEmail") ?? "",
    phone: formData.get("phone") ?? "",
    location: formData.get("location") ?? "",
    departmentId: formData.get("departmentId") ?? "",
    positionId: formData.get("positionId") ?? "",
    employmentType: formData.get("employmentType"),
    employmentStatus: formData.get("employmentStatus"),
    hireDate: formData.get("hireDate"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  // requireOrg re-checks the slug against the organization on the verified
  // JWT, so the id below is the session's, not the URL's.
  const session = await requireOrg(org);
  const supabase = await createClient();

  const { error } = await supabase.from("employees").insert({
    organization_id: session.organizationId,
    employee_no: parsed.data.employeeNo,
    first_name: parsed.data.firstName,
    last_name: parsed.data.lastName,
    work_email: parsed.data.workEmail || null,
    phone: parsed.data.phone || null,
    location: parsed.data.location || null,
    department_id: parsed.data.departmentId,
    position_id: parsed.data.positionId,
    employment_type: parsed.data.employmentType,
    employment_status: parsed.data.employmentStatus,
    hire_date: parsed.data.hireDate,
  });

  if (error) {
    return {
      error: describeWriteError(
        error.code,
        error.message,
        `Employee number ${parsed.data.employeeNo} is already in use.`,
      ),
    };
  }

  revalidatePath("/[org]/employees", "page");
  revalidatePath("/[org]/departments", "page");
  return { done: true };
}

const departmentSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z0-9-]{2,16}$/,
      "Use 2–16 capital letters, digits or dashes — for example SALES or OPS-LAG.",
    ),
  name: z.string().trim().min(1, "Enter a department name").max(120),
  description: optionalText(500),
  parentId: optionalUuid,
});

export async function createDepartment(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const org = String(formData.get("org") ?? "");
  const parsed = departmentSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    parentId: formData.get("parentId") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  const session = await requireOrg(org);
  const supabase = await createClient();

  const { error } = await supabase.from("departments").insert({
    organization_id: session.organizationId,
    code: parsed.data.code,
    name: parsed.data.name,
    description: parsed.data.description || null,
    parent_id: parsed.data.parentId,
  });

  if (error) {
    return {
      error: describeWriteError(
        error.code,
        error.message,
        `A department with the code ${parsed.data.code} already exists.`,
      ),
    };
  }

  revalidatePath("/[org]/departments", "page");
  return { done: true };
}

const positionSchema = z.object({
  title: z.string().trim().min(1, "Enter a job title").max(120),
  grade: optionalText(40),
  departmentId: optionalUuid,
});

export async function createPosition(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const org = String(formData.get("org") ?? "");
  const parsed = positionSchema.safeParse({
    title: formData.get("title"),
    grade: formData.get("grade") ?? "",
    departmentId: formData.get("departmentId") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  const session = await requireOrg(org);
  const supabase = await createClient();

  const { error } = await supabase.from("positions").insert({
    organization_id: session.organizationId,
    department_id: parsed.data.departmentId,
    title: parsed.data.title,
    grade: parsed.data.grade || null,
  });

  if (error) {
    return {
      error: describeWriteError(
        error.code,
        error.message,
        `“${parsed.data.title}” already exists in that department.`,
      ),
    };
  }

  revalidatePath("/[org]/departments", "page");
  revalidatePath("/[org]/employees", "page");
  return { done: true };
}

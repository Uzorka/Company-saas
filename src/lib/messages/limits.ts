/**
 * Limits shared by the server action and the form that calls it.
 *
 * Its own module because `actions.ts` is a `"use server"` file, and such a
 * file may only export async functions — exporting a number from it fails the
 * build with "A 'use server' file can only export async functions". The
 * browser checks the size before uploading so a person is told immediately;
 * the server checks it again, because the browser's check is a courtesy.
 */

/** 25 MB. Large enough for a photo of a delivery note, small enough to send. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

import Link from "next/link";
import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/**
 * Export this section.
 *
 * A plain link, not a fetch-and-blob: the browser already knows how to save a
 * response with a Content-Disposition header, it shows real download progress,
 * and a large export never has to exist in memory on the page.
 *
 * `download` is deliberately absent. The header names the file, and the
 * attribute would be ignored for a cross-origin response anyway — leaving it
 * off keeps one source of truth for the filename.
 */
export function ExportButton({
  org,
  dataset,
  label = "Export CSV",
}: {
  org: string;
  dataset: string;
  label?: string;
}) {
  return (
    <Link
      href={`/${org}/export/${dataset}`}
      prefetch={false}
      className={buttonVariants({ variant: "secondary", size: "sm" })}
    >
      <Download aria-hidden />
      {label}
    </Link>
  );
}

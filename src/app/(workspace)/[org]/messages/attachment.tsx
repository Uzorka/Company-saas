"use client";

import { useState } from "react";
import { FileText, Download, ImageOff } from "lucide-react";
import type { MessageRow } from "@/lib/messages/queries";

/** Bytes, as a person would say them. */
export function fileSize(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * What was sent, shown as what it is.
 *
 * An image renders, a video plays, and everything else is a link with its name
 * and size — a spreadsheet has no useful preview and pretending otherwise
 * wastes the space a filename needs.
 *
 * The signed URL expires after ten minutes. A conversation left open past that
 * would show a broken image with no explanation, so a failed load says so and
 * offers a reload, rather than leaving a grey box.
 */
export function Attachment({
  message,
  mine,
}: {
  message: MessageRow;
  mine: boolean;
}) {
  const [broken, setBroken] = useState(false);

  if (!message.attachment_path || !message.attachment_name) return null;

  const url = message.attachmentUrl;
  const type = message.attachment_type ?? "";
  const size = fileSize(message.attachment_size);

  if (!url || broken) {
    return (
      <span
        className={`mt-1 flex items-center gap-2 rounded-lg border p-2.5 text-small ${
          mine ? "border-white/30" : "border-border"
        }`}
      >
        <ImageOff className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0">
          <span className="block truncate">{message.attachment_name}</span>
          <span className={mine ? "text-white/70" : "text-text-3"}>
            The link has expired — reload to see it again.
          </span>
        </span>
      </span>
    );
  }

  if (type.startsWith("image/")) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="mt-1 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={message.attachment_name}
          onError={() => setBroken(true)}
          className="max-h-80 w-auto max-w-full rounded-lg border border-black/10"
        />
      </a>
    );
  }

  if (type.startsWith("video/")) {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        onError={() => setBroken(true)}
        className="mt-1 max-h-80 w-full max-w-md rounded-lg border border-black/10"
      >
        <a href={url}>{message.attachment_name}</a>
      </video>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={`mt-1 flex items-center gap-2.5 rounded-lg border p-2.5 text-small transition-colors ${
        mine
          ? "border-white/30 hover:bg-white/10"
          : "border-border hover:bg-canvas"
      }`}
    >
      <FileText className="size-5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {message.attachment_name}
        </span>
        {size ? (
          <span className={mine ? "text-white/70" : "text-text-3"}>{size}</span>
        ) : null}
      </span>
      <Download className="size-4 shrink-0" aria-hidden />
    </a>
  );
}

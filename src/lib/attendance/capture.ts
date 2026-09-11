"use client";

/**
 * Browser location and camera capture.
 *
 * Two rules from the design are enforced here rather than left to the UI:
 *
 *  1. Location is requested at the moment of the action and never before, and
 *     never in the background. There is no watchPosition anywhere in this
 *     file — a single getCurrentPosition per explicit action, which is what
 *     the on-screen copy promises.
 *
 *  2. The camera is the only source for a selfie. No gallery, no file input.
 *     "If proof can be chosen from a library, it isn't proof."
 */

export type LocationResult =
  | { ok: true; latitude: number; longitude: number; accuracyM: number | null }
  | { ok: false; reason: "denied" | "unavailable" | "timeout" | "unsupported" };

/** One position reading. Never a subscription. */
export async function readLocationOnce(
  timeoutMs = 15_000,
): Promise<LocationResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { ok: false, reason: "unsupported" };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          ok: true,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          // Some devices report no accuracy at all. That is not the same as a
          // perfect fix, so it travels as null and classifies as uncertain.
          accuracyM: Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : null,
        }),
      (error) => {
        const reason =
          error.code === error.PERMISSION_DENIED
            ? "denied"
            : error.code === error.TIMEOUT
              ? "timeout"
              : "unavailable";
        resolve({ ok: false, reason });
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        // Never reuse a cached fix: a check-in has to reflect where the person
        // is now, not where their phone last looked.
        maximumAge: 0,
      },
    );
  });
}

export type CameraResult =
  | { ok: true; stream: MediaStream }
  | { ok: false; reason: "denied" | "unavailable" | "unsupported" };

/** Front camera only. There is deliberately no file-input fallback. */
export async function openFrontCamera(): Promise<CameraResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { ok: false, reason: "unsupported" };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
      audio: false,
    });
    return { ok: true, stream };
  } catch (error) {
    const name = (error as DOMException)?.name;
    const reason =
      name === "NotAllowedError" || name === "SecurityError"
        ? "denied"
        : "unavailable";
    return { ok: false, reason };
  }
}

/** Freeze the current frame to a JPEG blob. */
export async function captureFrame(
  video: HTMLVideoElement,
  quality = 0.82,
): Promise<Blob | null> {
  const size = Math.min(video.videoWidth, video.videoHeight);
  if (!size) return null;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) return null;

  // Mirror, so the capture matches what the person saw in the preview.
  context.translate(size, 0);
  context.scale(-1, 1);
  context.drawImage(
    video,
    (video.videoWidth - size) / 2,
    (video.videoHeight - size) / 2,
    size,
    size,
    0,
    0,
    size,
    size,
  );

  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality),
  );
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

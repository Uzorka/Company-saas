"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  MapPin, Camera, CameraOff, ShieldAlert, CheckCircle2,
  Loader2, RotateCcw, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GeofenceMap } from "@/components/attendance/geofence-map";
import {
  classifyAttendance, classificationCopy, distanceMetres,
  formatAccuracy, formatDistance, type AttendanceType,
} from "@/lib/attendance/geofence";
import {
  readLocationOnce, openFrontCamera, captureFrame, stopStream,
} from "@/lib/attendance/capture";
import { checkIn, attachSelfie } from "@/lib/attendance/actions";
import { duration, ease } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Stage =
  | "idle" | "locating" | "located" | "location_denied"
  | "camera" | "camera_denied" | "review" | "submitting" | "success";

export type NearestOffice = {
  id: string; name: string;
  latitude: number; longitude: number; radiusM: number;
};

/**
 * Check-in. Source: Phase 4, const CI — a 13-state machine.
 *
 * The order is load-bearing: location, then the classification stated in
 * plain words, then the selfie. "Classification is stated before the selfie,
 * not after — the employee always knows what is being recorded about them
 * before they commit to it."
 *
 * Every failure has a way forward. Location denied, camera denied and a weak
 * fix all still let the employee record their time, flagged for HR. A person
 * who cannot record their time stops trusting the tool.
 */
export function CheckInCapture({
  office, defaultRadiusM,
}: {
  office: NearestOffice | null;
  defaultRadiusM: number;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [position, setPosition] = useState<{
    latitude: number; longitude: number; accuracyM: number | null;
  } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [selfie, setSelfie] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ type: string; flagged: boolean } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const radiusM = office?.radiusM ?? defaultRadiusM;
  const classified: AttendanceType = classifyAttendance(
    distance, position?.accuracyM ?? null, radiusM,
  );
  const copy = classificationCopy(classified, distance, office?.name ?? "the office");

  useEffect(() => () => stopStream(streamRef.current), []);

  // Derived from the blob rather than mirrored into state — a preview URL is
  // a function of the capture, not a separate fact about it. The effect below
  // exists only to release it, which is what effects are actually for.
  const selfieUrl = useMemo(
    () => (selfie ? URL.createObjectURL(selfie) : null),
    [selfie],
  );

  useEffect(() => {
    if (!selfieUrl) return;
    return () => URL.revokeObjectURL(selfieUrl);
  }, [selfieUrl]);

  async function requestLocation() {
    setStage("locating");
    setError(null);
    const reading = await readLocationOnce();

    if (!reading.ok) {
      setStage("location_denied");
      setError(
        reading.reason === "denied"
          ? "Location permission was denied."
          : reading.reason === "timeout"
            ? "Your device took too long to find a position."
            : "Your device couldn't provide a position.",
      );
      return;
    }

    setPosition(reading);
    setDistance(office ? distanceMetres(reading, office) : null);
    setStage("located");
  }

  async function startCamera() {
    setStage("camera");
    setError(null);
    const result = await openFrontCamera();

    if (!result.ok) {
      setStage("camera_denied");
      setError(
        result.reason === "denied"
          ? "Camera permission was denied."
          : "No camera is available on this device.",
      );
      return;
    }

    streamRef.current = result.stream;
    if (videoRef.current) {
      videoRef.current.srcObject = result.stream;
      await videoRef.current.play().catch(() => {});
    }
  }

  async function capture() {
    if (!videoRef.current) return;
    const blob = await captureFrame(videoRef.current);
    if (!blob) {
      setError("The capture failed. Try again.");
      return;
    }
    stopStream(streamRef.current);
    streamRef.current = null;
    setSelfie(blob);
    setStage("review");
  }

  async function submit() {
    setStage("submitting");
    setError(null);

    const response = await checkIn({
      latitude: position?.latitude ?? null,
      longitude: position?.longitude ?? null,
      accuracyM: position?.accuracyM ?? null,
      device: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : undefined,
    });

    if (!response.ok) {
      setError(response.error);
      setStage(selfie ? "review" : "located");
      return;
    }

    if (selfie) {
      // A failed upload must not cost the employee their recorded time: the
      // record already exists and is simply flagged for a missing selfie.
      await attachSelfie(
        response.recordId,
        new File([selfie], "selfie.jpg", { type: "image/jpeg" }),
      );
    }

    setResult({ type: response.attendanceType, flagged: response.reviewRequired });
    setStage("success");
  }

  if (stage === "success" && result) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: duration.confirm, ease: ease.standard }}
        className="flex flex-col items-center gap-4 rounded-xl bg-success-bg p-8 text-center"
      >
        <CheckCircle2 className="size-12 text-success-fg" aria-hidden />
        <div>
          <h2 className="text-h2 text-success-fg">You&rsquo;re checked in</h2>
          <p className="mt-1 font-mono text-small text-text-2">
            {result.type === "office" ? "Office" : result.type === "remote" ? "Remote" : "Under review"}
            {" · "}
            {formatAccuracy(position?.accuracyM ?? null)}
          </p>
        </div>
        {result.flagged ? (
          <p className="max-w-[40ch] text-small text-text-2">
            This check-in is flagged for HR to confirm. Your time is recorded
            either way — nothing is lost.
          </p>
        ) : null}
        <p className="text-small text-text-3">
          Your location will not be read again until you check out.
        </p>
        <Button onClick={() => router.refresh()}>Back to dashboard</Button>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Stepper stage={stage} />

      <div className="overflow-hidden rounded-xl border border-border bg-bg">
        <div className="flex min-h-[260px] items-center justify-center bg-surface p-6">
          {stage === "idle" ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <MapPin className="size-8 text-text-3" aria-hidden />
              <p className="max-w-[38ch] text-body text-text-2">
                We read your location once, now. Nothing runs in the background.
              </p>
            </div>
          ) : null}

          {stage === "locating" ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <Loader2 className="size-8 animate-spin text-brand-600" aria-hidden />
              <p className="text-body text-text-2">
                Reading GPS… usually under three seconds.
              </p>
            </div>
          ) : null}

          {stage === "located" ? (
            <GeofenceMap
              distanceM={distance}
              accuracyM={position?.accuracyM ?? null}
              radiusM={radiusM}
              classified={classified}
            />
          ) : null}

          {stage === "location_denied" || stage === "camera_denied" ? (
            <div className="flex flex-col items-center gap-3 text-center">
              {stage === "location_denied" ? (
                <ShieldAlert className="size-8 text-danger-fg" aria-hidden />
              ) : (
                <CameraOff className="size-8 text-danger-fg" aria-hidden />
              )}
              <p className="max-w-[40ch] text-body text-text-2">
                {stage === "location_denied"
                  ? "We need one position reading to record whether you're at the office or working remotely."
                  : "The selfie confirms it's really you checking in. Without it, HR verifies manually."}
              </p>
            </div>
          ) : null}

          <video
            ref={videoRef}
            playsInline
            muted
            className={cn(
              "size-[240px] rounded-xl object-cover [transform:scaleX(-1)]",
              stage === "camera" ? "block" : "hidden",
            )}
          />

          {stage === "review" && selfieUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selfieUrl}
              alt="The selfie you just took"
              className="size-[240px] rounded-xl object-cover"
            />
          ) : null}

          {stage === "submitting" ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <Loader2 className="size-8 animate-spin text-brand-600" aria-hidden />
              <p className="text-body text-text-2">Recording your check-in…</p>
            </div>
          ) : null}
        </div>

        <StatusBar
          stage={stage}
          copy={copy}
          distance={distance}
          accuracyM={position?.accuracyM ?? null}
          officeName={office?.name ?? null}
        />
      </div>

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-error-border bg-error-surface p-3 text-small text-danger-fg">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <Actions
        stage={stage}
        classified={classified}
        onLocate={requestLocation}
        onCamera={startCamera}
        onCapture={capture}
        onRetake={startCamera}
        onSubmit={submit}
        onSkipLocation={() => setStage("camera")}
        onSkipCamera={submit}
      />
    </div>
  );
}

function Stepper({ stage }: { stage: Stage }) {
  const step =
    stage === "idle" || stage === "locating" ? 1
      : stage === "located" || stage === "location_denied" ? 2 : 3;
  return (
    <p className="font-mono text-overline uppercase text-text-3">
      Step {step} of 3 · {step === 1 ? "Location" : step === 2 ? "Confirm" : "Selfie"}
    </p>
  );
}

function StatusBar({
  stage, copy, distance, accuracyM, officeName,
}: {
  stage: Stage;
  copy: { title: string; detail: string; tone: "success" | "info" | "warn" };
  distance: number | null;
  accuracyM: number | null;
  officeName: string | null;
}) {
  if (stage === "idle" || stage === "locating") {
    return (
      <div className="border-t border-border px-5 py-4">
        <p className="text-small font-medium">
          {stage === "idle" ? "Location not requested yet" : "Finding your location"}
        </p>
        <p className="mt-0.5 text-small text-text-2">
          {stage === "idle"
            ? "We ask only when you tap below."
            : "You can cancel at any point."}
        </p>
      </div>
    );
  }

  if (stage === "location_denied") {
    return (
      <div className="border-t border-border bg-danger-bg px-5 py-4">
        <p className="text-small font-medium text-danger-fg">No coordinates captured</p>
        <p className="mt-0.5 text-small text-text-2">
          Your check-in will be flagged for HR review. Your time is still recorded.
        </p>
      </div>
    );
  }

  const toneClass =
    copy.tone === "success" ? "bg-success-bg" : copy.tone === "warn" ? "bg-warn-bg" : "bg-info-bg";

  return (
    <div className={cn("border-t border-border px-5 py-4", toneClass)}>
      <p className="text-small font-medium">{copy.title}</p>
      <p className="mt-0.5 text-small text-text-2">{copy.detail}</p>
      <p className="mt-1.5 font-mono text-[11px] text-text-2">
        {officeName ?? "No office configured"} · {formatDistance(distance)} ·{" "}
        {formatAccuracy(accuracyM)}
      </p>
    </div>
  );
}

function Actions({
  stage, classified, onLocate, onCamera, onCapture, onRetake, onSubmit,
  onSkipLocation, onSkipCamera,
}: {
  stage: Stage;
  classified: AttendanceType;
  onLocate: () => void;
  onCamera: () => void;
  onCapture: () => void;
  onRetake: () => void;
  onSubmit: () => void;
  onSkipLocation: () => void;
  onSkipCamera: () => void;
}) {
  // The primary action is pinned above the bottom nav on phones, 46px tall.
  const wrap = "sticky bottom-[70px] flex flex-col gap-2 sm:static sm:bottom-auto";

  switch (stage) {
    case "idle":
      return (
        <div className={wrap}>
          <Button size="lg" className="h-[46px] w-full" onClick={onLocate}>
            Check in
          </Button>
        </div>
      );
    case "locating":
      return (
        <div className={wrap}>
          <Button size="lg" variant="secondary" className="h-[46px] w-full" disabled>
            Locating…
          </Button>
        </div>
      );
    case "located":
      return (
        <div className={wrap}>
          <Button size="lg" className="h-[46px] w-full" onClick={onCamera}>
            <Camera aria-hidden />
            Take selfie
          </Button>
          {classified === "uncertain" ? (
            <Button variant="secondary" className="w-full" onClick={onLocate}>
              <RotateCcw aria-hidden />
              Retry location
            </Button>
          ) : null}
        </div>
      );
    case "location_denied":
      return (
        <div className={wrap}>
          <Button size="lg" className="h-[46px] w-full" onClick={onLocate}>
            Enable location
          </Button>
          <Button variant="secondary" className="w-full" onClick={onSkipLocation}>
            Continue without location
          </Button>
        </div>
      );
    case "camera":
      return (
        <div className={wrap}>
          <Button size="lg" className="h-[46px] w-full" onClick={onCapture}>
            Capture
          </Button>
        </div>
      );
    case "camera_denied":
      return (
        <div className={wrap}>
          <Button size="lg" className="h-[46px] w-full" onClick={onCamera}>
            Enable camera
          </Button>
          <Button variant="secondary" className="w-full" onClick={onSkipCamera}>
            Check in without a selfie
          </Button>
        </div>
      );
    case "review":
      return (
        <div className={wrap}>
          <Button size="lg" className="h-[46px] w-full" onClick={onSubmit}>
            Confirm check-in
          </Button>
          <Button variant="secondary" className="w-full" onClick={onRetake}>
            <RotateCcw aria-hidden />
            Retake photo
          </Button>
        </div>
      );
    default:
      return (
        <div className={wrap}>
          <Button size="lg" className="h-[46px] w-full" loading disabled>
            Please wait
          </Button>
        </div>
      );
  }
}

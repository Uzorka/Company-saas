"use client";

/**
 * The arrival tone.
 *
 * Synthesised rather than shipped as a file. An audio asset would be another
 * request, another thing in the bundle, and another format question — for two
 * notes. This is a short two-tone chime built with the Web Audio API, which
 * every browser this product supports has had for a decade.
 *
 * TWO THINGS THAT MATTER MORE THAN THE SOUND
 *
 * Browsers refuse to play audio until the person has interacted with the page.
 * That is not a bug to work around: it is the rule that stops a tab making
 * noise at someone who never asked. So the context is created on the first
 * click or keypress and stays silent until then, and nothing is logged when it
 * cannot play.
 *
 * And it is off unless the person turns it on. A workplace tool that starts
 * beeping in an open-plan office on first load has made a decision that was
 * not its to make. The preference is remembered per browser.
 */

const STORAGE_KEY = "heron.messages.tone";

let context: AudioContext | null = null;

/** Called from a real user gesture, which is the only time this can succeed. */
export function primeTone(): void {
  if (context || typeof window === "undefined") return;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (Ctor) context = new Ctor();
  } catch {
    // An environment that refuses an AudioContext is one that will not play a
    // sound either. Silence is the correct outcome, not an error.
  }
}

function read(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    // Private browsing, or storage blocked. Default to silent.
    return false;
  }
}

/**
 * Subscribers, so React can read this with `useSyncExternalStore`.
 *
 * Reading localStorage in an effect and calling setState works and is wrong:
 * it renders once with the default and once with the truth, and the lint rule
 * that forbids it is right. This is the hook that exists for a value living
 * outside React, and its server snapshot is `false` — the honest answer, since
 * a server has no idea what this browser prefers.
 */
const listeners = new Set<() => void>();

export function subscribeToTone(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changing the preference should change this one too.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export const toneSnapshot = read;
export const toneServerSnapshot = () => false;

export function setToneEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Nothing to do. The preference simply will not survive a reload.
  }
  for (const listener of listeners) listener();
}

/** Two short notes, rising. Quiet enough not to carry across a room. */
export function playTone(): void {
  if (!context) return;
  if (context.state === "suspended") void context.resume();

  const now = context.currentTime;
  for (const [index, frequency] of [880, 1174.7].entries()) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;

    const start = now + index * 0.09;
    // A ramp rather than a switch: an abrupt start and stop on a sine wave
    // clicks, and the click is the part people find unpleasant.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.06, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);

    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.18);
  }
}

// ---------------------------------------------------------------------------
// The one clock the assembly animation runs on.
//
// It is a mutable object, not React state: the parts read it inside `useFrame`
// at 60 fps, and a state update per frame would re-render the whole page (and
// the rail, and the control bar) sixty times a second. React state changes
// only when the STEP changes, which is the only thing the DOM needs to know.
//
// `t` counts seconds within the current step. The first `duration` seconds are
// the motion; the next `hold` seconds are the pause that lets the viewer see
// what was just done before the next step starts.
// ---------------------------------------------------------------------------

export interface AssemblyClock {
  /** Index into the plan's steps. */
  stepIndex: number;
  /** Seconds elapsed in this step. */
  t: number;
  /** Length of this step's motion. */
  duration: number;
  /** Seconds to hold after the motion. */
  hold: number;
  /** False while paused, and after the final step has completed. */
  playing: boolean;
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Cubic ease-in-out. The frame is heavy; a linear slide reads as a machine
 *  moving a part, this reads as a person placing it. */
export const easeInOut = (v: number): number => {
  const t = clamp01(v);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

/** How installed a piece is, 0 → 1.
 *
 *  Derived from the step index so jumping around needs no per-part state:
 *  anything before the current step is fully installed, anything after it has
 *  not started, and only the current step is mid-motion. */
export function stepProgress(stepIndex: number, clock: AssemblyClock): number {
  if (clock.stepIndex > stepIndex) return 1;
  if (clock.stepIndex < stepIndex) return 0;
  if (clock.duration <= 0) return 1;
  return clamp01(clock.t / clock.duration);
}

/** A sub-window of a step, used to stagger hardware inside one joint: the
 *  T-nuts go in, then the screws, then the cover. */
export function windowProgress(p: number, from: number, to: number): number {
  if (p <= from) return 0;
  if (p >= to) return 1;
  return (p - from) / (to - from);
}

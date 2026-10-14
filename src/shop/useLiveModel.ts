import { useEffect, useRef } from 'react';
import { useShopStore } from './shopStore';

/**
 * Keeps the model on the right in step with the choices on the left.
 *
 * Two clocks, because the two things being asked of the server differ by four
 * orders of magnitude in cost:
 *
 *   - the SOLVER, ~1 ms and no CAD, asks again every `SOLVE_THROTTLE_MS` while
 *     the customer is dragging. This is what makes the pane follow the slider.
 *     Throttled rather than fired per change because `_load_template` re-reads
 *     and re-parses the YAML template on every call — cheap, but not free
 *     enough to do on every pixel of a drag.
 *
 *   - the CAD BUILD, tens of seconds of build123d, asks ONCE after the customer
 *     has been still for `BUILD_DEBOUNCE_MS`. This is the only path that starts
 *     real work on the server, and the only one that can produce an STL.
 *
 * `values` is replaced by a fresh object on every `setValue`, so the effect
 * below re-runs once per change and its cleanup is what implements both clocks:
 * clearing the pending timers on the way out means only the last change in a
 * burst ever gets a build.
 */

/** Long enough to skip the intermediate values a drag passes through, short
 *  enough that the pane feels attached to the slider. */
const SOLVE_THROTTLE_MS = 120;

/** Long enough that a customer nudging a slider through four sizes does not
 *  start four CAD builds, short enough that the model is there by the time they
 *  have read the list. */
const BUILD_DEBOUNCE_MS = 1200;

export function useLiveModel(): void {
  const template = useShopStore((s) => s.template);
  const values = useShopStore((s) => s.values);
  const profile = useShopStore((s) => s.profile);
  const solve = useShopStore((s) => s.solve);
  const build = useShopStore((s) => s.build);

  /** Survives the effect's re-runs, which is the point: the throttle window is
   *  measured across changes, not within one. */
  const lastSolveAt = useRef(0);

  useEffect(() => {
    if (!template) return;

    const timers: number[] = [];

    const runSolve = () => {
      lastSolveAt.current = Date.now();
      void solve();
    };

    // The first ask of a new furniture or a new size should not sit out the
    // throttle — there is nothing to be gained by waiting when the pane is
    // about to be the only thing that changed on screen.
    const waited = Date.now() - lastSolveAt.current;
    if (waited >= SOLVE_THROTTLE_MS) runSolve();
    else timers.push(window.setTimeout(runSolve, SOLVE_THROTTLE_MS - waited));

    timers.push(window.setTimeout(() => void build(), BUILD_DEBOUNCE_MS));

    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [template, values, profile, solve, build]);
}

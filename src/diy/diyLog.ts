import { logBracketEvent } from '../api/modelApi';

/**
 * DIY-builder bracket logger.
 *
 * Wraps every bracket event in a single call that (1) mirrors it to the
 * console for live debugging and (2) persists it to the backend JSONL log
 * (logs/diy_brackets.jsonl) so a whole session can be replayed/analysed
 * afterwards. Logging is fire-and-forget — a backend hiccup must never
 * break the DIY editor.
 *
 * Events:
 *   - "corner_hints"   corner-preview mode computed its hints (position + pose)
 *   - "bracket_placed" a bracket was placed by double-clicking two faces
 */
export function logDiyBracket(
  event: 'corner_hints' | 'bracket_placed',
  payload: Record<string, unknown>,
): void {
  console.log(
    `%c[DIY日志] ${event}`,
    'color:#22cc88;font-weight:bold',
    JSON.stringify(payload, null, 2),
  );
  logBracketEvent(event, payload).catch(() => {
    /* fire-and-forget — logging must never break the app */
  });
}

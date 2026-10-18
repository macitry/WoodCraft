import React from 'react';
import type { BracketInstance } from '../types/furniture';
import { bracketStlUrl } from '../types/furniture';
import { useModelStore } from '../store/modelStore';
import { useKitLayoutFor } from '../store/kitLayoutStore';
import { FastenerSetFor } from './FastenerParts';

/**
 * The editor's fastener set: the store lookups, and nothing else.
 *
 * Everything that draws a screw, a nut or a cover lives in `FastenerParts`,
 * which takes its inputs as props. That split is what lets the customer page
 * (`src/shop/`) render the same hardware without importing `useModelStore` —
 * which would pull the editor's whole document into the shop bundle.
 *
 * MUST be rendered INSIDE the bracket's own <group position rotation>, never as
 * a sibling with a recomputed transform: `BracketInstance.rotation` is documented
 * as intrinsic ZYX but is consumed by three as its default XYZ order, so any
 * re-derivation in one order or the other drifts on multi-axis brackets. Nested,
 * the fasteners inherit the bracket's matrix verbatim and cannot disagree with it.
 */
export const FastenerSet: React.FC<{ bracket: BracketInstance }> = ({ bracket }) => {
  const activeKitId = useModelStore((s) => s.activeKitId);
  const showFasteners = useModelStore((s) => s.showFasteners);
  const showInternalFasteners = useModelStore((s) => s.showInternalFasteners);

  // The user's per-part edits, resolved through the bracket's own STL url —
  // which is what scopes the edits (see `kitLayoutKey`, keyed on the pattern).
  const layout = useKitLayoutFor(activeKitId, bracketStlUrl(bracket));

  return (
    <FastenerSetFor
      bracket={bracket}
      kitId={activeKitId}
      showFasteners={showFasteners}
      showInternalFasteners={showInternalFasteners}
      layout={layout}
    />
  );
};

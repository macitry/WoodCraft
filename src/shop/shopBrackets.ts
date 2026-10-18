import { autoGenerateBracketsForParts } from '../diy/mainBracketAuto';
import { TEMPLATE_LAYOUTS, type BracketInstance } from '../types/furniture';
import type { ShopModel } from './shopApi';

/**
 * Where the corner brackets go on the customer page's model.
 *
 * The server returns parts and poses but no joint hardware. The editor derives
 * brackets from the same frame math it draws with (`computeFrameLayout`); after
 * the solver's profile-section fix those joints ARE the parts' real joints, so
 * the same generator is reused here instead of a second copy of the rules.
 *
 * The generator answers in the editor's frame: millimetres, Y up, the FLOOR at
 * y = 0. The shop's scene is the server's frame — Y up, the TABLETOP TOP at
 * y = 0 — so the renderer drops the whole set by the desk height. That is the
 * only difference between the two pictures, and it is a translation, not a
 * re-layout: the brackets stay glued to the beams and legs either way.
 */
export function shopBrackets(model: ShopModel, templateId: string): BracketInstance[] {
  const dims = model.dimensions ?? {};
  // Same defaults `frameFor` uses, so a model whose dimensions have not arrived
  // yet still gets a frame rather than a scatter of brackets at the origin.
  const width = dims.width ?? 1200;
  const depth = dims.depth ?? 600;
  const height = dims.height ?? 750;
  const tabletopThickness = dims.tabletop_thickness ?? 18;

  // The editor does the same fallback (`TEMPLATE_LAYOUTS[id] || basic-desk`).
  // Every catalogue style has an entry, so the fallback only covers a template
  // the backend adds before this table learns about it.
  const layout = TEMPLATE_LAYOUTS[templateId] ?? TEMPLATE_LAYOUTS['basic-desk'];

  return autoGenerateBracketsForParts(
    model.parts.map((part) => ({
      // The solver's part name is the editor's part id — both come from the
      // same YAML — and the generator keys off ids (`beam_front`, `leg_*`).
      id: part.name,
      name: part.name,
      partType: part.partType,
      visible: true,
      dimensions: part.dimensions,
    })),
    {
      templateId,
      width,
      depth,
      height,
      tabletopThickness,
      insetRatioX: layout.insetRatioX,
      insetRatioZ: layout.insetRatioZ,
      crossBeamHeightRatio: layout.crossBeamHeightRatio,
    },
  );
}

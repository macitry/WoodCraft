// ---------------------------------------------------------------------------
// Display names for things that carry their own name as DATA.
//
// A `DiyConnector` has `label`/`desc`; a `TabletopTexture` has `label`/`note`;
// an `AccessoryKit` has `name`/`desc`/`ops`; a hole template has
// `name`/`description`; the API hands out parameters and parts whose `name` the
// server wrote. Two of those files are generated, and the rest are large
// hand-authored tables, so NONE of them were rewritten to hold keys. Instead
// every name is resolved here, by the stable id that sits beside it, and the
// string still in the data is the fallback for an id with no translation yet.
//
// The fallback matters: the backend can return a template or a parameter this
// build has never heard of, and the right answer for that is to show what the
// server said, not an empty string or a `part.foo` key.
//
// REACTIVITY: these are plain functions reading the live language, exactly like
// `t`. A component that renders their result must ALSO subscribe — call
// `useT()` (or `useLang()`) once in the component — or flipping the switch will
// leave that one label behind.
// ---------------------------------------------------------------------------

import { hasKey, t, type Vars } from './index';
import { coverById, type DiyConnector } from '../diy/connectors';
import type { TabletopTexture } from '../materials/tabletopTextures';
import {
  SCREW_FAMILIES,
  SCREW_SERIES,
  TNUT_FAMILIES,
  type AccessoryKit,
  type HardwareSpec,
} from '../utils/accessoryKits';
import { DEFAULT_SCREW_FAMILY } from '../diy/fastenerDims';

/**
 * A key built at runtime, e.g. `cat.${id}.label`. Dynamic keys cannot be
 * literal types, so this is the one place the dictionary is indexed by a
 * string — and `hasKey` is the type guard that makes the lookup safe.
 */
function dyn(key: string, fallback: string, vars?: Vars): string {
  return hasKey(key) ? t(key, vars) : fallback;
}

// --- API / mock data -------------------------------------------------------
export const templateName = (id: string, fallback: string): string => dyn(`tpl.${id}.name`, fallback);
export const templateDescription = (id: string, fallback: string): string =>
  dyn(`tpl.${id}.desc`, fallback);
export const paramName = (id: string, fallback: string): string => dyn(`param.${id}`, fallback);
export const partName = (id: string, fallback: string): string => dyn(`part.${id}`, fallback);
export const materialName = (id: string, fallback: string): string => dyn(`material.${id}`, fallback);

/**
 * A component's `partType` — the grouping key, not a part. The same four values
 * name the group headers in the component tree, the part list and the info bar,
 * so this is deliberately the ONE lookup for all three: they used to be a
 * hand-written `groupLabels` table in the tree and a raw `partType` string two
 * panels away, which is how the same part came to be 「桌面」 in one place and
 * `tabletop` in another.
 */
export const partTypeName = (id: string | undefined, fallback: string): string =>
  id ? dyn(`panel.group.${id}`, fallback) : fallback;

// --- CAD catalog -----------------------------------------------------------
export const connectorLabel = (c: DiyConnector): string => dyn(`cat.${c.id}.label`, c.label);
export const connectorDesc = (c: DiyConnector): string => dyn(`cat.${c.id}.desc`, c.desc);

export const textureLabel = (x: TabletopTexture): string => dyn(`tex.${x.id}.label`, x.label);
export const textureNote = (x: TabletopTexture): string => dyn(`tex.${x.id}.note`, x.note);

export const kitName = (k: AccessoryKit): string => dyn(`kit.${k.id}.name`, k.name);
export const kitDesc = (k: AccessoryKit): string => dyn(`kit.${k.id}.desc`, k.desc);

/** The op notes, the same list in the same order — keyed by position, because
 *  an op note has no id of its own and the array is authored in the data file. */
export const kitOps = (k: AccessoryKit): string[] =>
  k.ops.map((op, i) => dyn(`kit.${k.id}.op.${i}`, op));

// --- hardware ---------------------------------------------------------------

export const screwFamilyLabel = (family: string, fallback: string): string =>
  dyn(`fam.${family}.label`, fallback);
export const screwFamilyShort = (family: string, fallback: string): string =>
  dyn(`fam.${family}.short`, fallback);
export const tNutFamilyShort = (family: string, fallback: string): string =>
  dyn(`fam.tnut.${family}.short`, fallback);

/**
 * A `HardwareSpec`'s display name, RECOMPOSED from its own fields.
 *
 * `spec.name` already holds this string and is correct — but it was built once,
 * when `ACCESSORY_KITS` was constructed at module load, in whatever language the
 * module happened to load in. Reading it in a component would pin every screw in
 * the app to that moment: flipping the switch would leave the hardware as the
 * only rows still in the other language.
 *
 * So the same composition `screwName`/`tNutName` do, with only the words moved.
 * `spec.name` is still the fallback, because it is the right answer for a spec
 * whose fields this build does not recognise — a layout persisted by a newer
 * version, say. Losing the translation there is far better than printing a name
 * with a hole in it.
 */
export function hardwareName(spec: HardwareSpec): string {
  if (spec.kind === 'cover') {
    const catalog = spec.uid ? coverById(spec.uid) : null;
    return catalog ? t('name.cover', { label: catalog.label }) : spec.name;
  }
  if (spec.kind === 't_nut') {
    const family = spec.tnutFamily ?? 't_slot';
    if (!(family in TNUT_FAMILIES)) return spec.name;
    // The series is not a field on the spec — `tNut()` takes it as an argument
    // and `catalogUid` resolves the nut through the same constant — so it is
    // read here rather than parsed back out of the sentence being replaced.
    return t('name.tnut', {
      size: spec.size ?? '',
      series: SCREW_SERIES,
      family: tNutFamilyShort(family, TNUT_FAMILIES[family].short),
    });
  }
  const family = spec.family ?? DEFAULT_SCREW_FAMILY;
  if (!(family in SCREW_FAMILIES)) return spec.name;
  return t('name.screw', {
    family: screwFamilyLabel(family, SCREW_FAMILIES[family].label),
    size: spec.size ?? '',
    length: spec.length ?? 0,
  });
}

export const holeTemplateName = (id: string, fallback: string): string =>
  dyn(`hole.${id}.name`, fallback);
export const holeTemplateDescription = (id: string, fallback: string): string =>
  dyn(`hole.${id}.desc`, fallback);

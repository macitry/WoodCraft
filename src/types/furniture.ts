// ============================================================
// WoodCraft — Core Furniture Data Types
// ============================================================

/** A user-adjustable parameter for a furniture template. */
export interface Parameter {
  id: string;
  name: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
}

/** A single component within a furniture assembly. */
export interface Component {
  id: string;
  name: string;
  modelUrl: string;
  visible: boolean;
  partType?: string;
  material?: string;
  dimensions?: Record<string, number>;
  /** STL file URL from the backend (if CAD build succeeded). */
  stlUrl?: string;
  /** Absolute world position from URDF tree walk (assembly frame, mm). */
  pose?: PartPose;
  /** Parent link name from URDF joint (null for root/base_link children). */
  jointParent?: string;
}

/** Position + orientation from the backend solver (mm, radians). */
export interface PartPose {
  x: number;
  y: number;
  z: number;
  roll: number;
  pitch: number;
  yaw: number;
}

/** Top-level furniture model representing a configured piece. */
export interface FurnitureModel {
  id: string;
  name: string;
  modelUrl: string;
  thumbnail?: string;
  parameters: Parameter[];
  components: Component[];
}

/** A furniture template (before parameterization). */
export interface FurnitureTemplate {
  id: string;
  name: string;
  type: string;
  description?: string;
  thumbnail?: string;
  defaultModelUrl?: string;
  parameters: ParameterTemplate[];
  parts: PartTemplate[];
}

/** Template-level parameter definition (no current value). */
export interface ParameterTemplate {
  id: string;
  name: string;
  defaultValue: number;
  unit: string;
  min: number;
  max: number;
  step: number;
}

/** A part definition within a template. */
export interface PartTemplate {
  name: string;
  partType: string;
  profile: string | null;
  board: string | null;
  material: string;
}

/** Parameters sent to the backend for model generation. */
export interface GenerateModelParams {
  templateId: string;
  width: number;
  depth: number;
  height: number;
  tabletopThickness?: number;
  profile?: string;
  boardMaterial?: string;
  color?: string;
  stlQuality?: string;  // "web" | "standard" | "fine"
}

/** Response from the backend model generation endpoint. */
export interface GenerateModelResponse {
  model_id: string;
  name: string;
  status: 'full' | 'partial' | 'solver_only' | 'warming';
  parts: ApiPartInfo[];
  dimensions: Record<string, number>;
  stl_url?: string | null;
  urdf_url?: string | null;
  joints: JointInfo[];
  message?: string | null;
}

/** Joint info from URDF assembly structure. */
export interface JointInfo {
  name: string;
  parent: string;
  child: string;
  origin: PartPose;
}

/** Part info from the backend API response. */
export interface ApiPartInfo {
  name: string;
  part_type: string;
  profile?: string | null;
  board?: string | null;
  material: string;
  dimensions?: Record<string, number> | null;
  mass_kg?: number | null;
  stl_url?: string | null;
  step_url?: string | null;
  pose?: PartPose | null;
  joint_parent?: string | null;
}

/** BOM (Bill of Materials) entry. */
export interface BomEntry {
  name: string;
  partType: string;
  quantity: number;
  material: string;
  dimensions?: Record<string, number>;
  massKg?: number;
}

/** BOM response from the backend. */
export interface BomResponse {
  furnitureName: string;
  entries: BomEntry[];
  totalMassKg?: number;
}

/** Drawing / blueprint metadata. */
export interface DrawingInfo {
  id: string;
  name: string;
  type: 'part' | 'assembly' | 'installation';
  url: string;
  format: 'pdf' | 'svg' | 'png';
}

/** Drawing list response. */
export interface DrawingListResponse {
  furnitureName: string;
  drawings: DrawingInfo[];
}

/** Camera viewpoint preset. */
export type ViewPreset = 'front' | 'top' | 'side' | 'perspective';

/** Material information. */
export interface MaterialInfo {
  id: string;
  name: string;
  category: string;
  density?: number;
  color?: string;
  textureUrl?: string;
}

/** Future: motion support for movable furniture structures. */
export interface Motion {
  type: 'linear' | 'rotation';
  target: string;
  axis?: [number, number, number];
  range?: [number, number];
}

/** Frontend layout configuration per template. */
export interface BracketConfig {
  enabled: boolean;
  /** Which connections get brackets. */
  placements: ('beam_corners' | 'leg_tops')[];
}

export interface TemplateLayoutConfig {
  insetRatioX: number;
  insetRatioZ: number;
  profileSize: number;
  crossBeamHeightRatio: number;
  hasCrossBeams: boolean;
  crossBeamOrientation: 'front_back' | 'left_right';
  /** Corner bracket configuration. */
  brackets: BracketConfig;
}

/** Map of template ID → layout config. */
export const TEMPLATE_LAYOUTS: Record<string, TemplateLayoutConfig> = {
  'basic-desk': {
    insetRatioX: 0, insetRatioZ: 0, profileSize: 30,
    crossBeamHeightRatio: 0.5, hasCrossBeams: false, crossBeamOrientation: 'front_back',
    brackets: { enabled: true, placements: ['beam_corners', 'leg_tops'] },
  },
  'inset-desk': {
    insetRatioX: 0.05, insetRatioZ: 0.10, profileSize: 30,
    crossBeamHeightRatio: 0.5, hasCrossBeams: false, crossBeamOrientation: 'front_back',
    brackets: { enabled: true, placements: ['beam_corners', 'leg_tops'] },
  },
  'cross-beam-desk': {
    insetRatioX: 0, insetRatioZ: 0, profileSize: 30,
    crossBeamHeightRatio: 0.3, hasCrossBeams: true, crossBeamOrientation: 'front_back',
    brackets: { enabled: true, placements: ['beam_corners', 'leg_tops'] },
  },
  'side-cross-desk': {
    insetRatioX: 0, insetRatioZ: 0, profileSize: 30,
    crossBeamHeightRatio: 0.3, hasCrossBeams: true, crossBeamOrientation: 'left_right',
    brackets: { enabled: true, placements: ['beam_corners', 'leg_tops'] },
  },
};

// ============================================================
// DIY Mode — free-form aluminum profile frame builder
// ============================================================

export type ProfileSize = '2020' | '3030' | '4040';
export type AxisDir = 'X' | 'Y' | 'Z';
export type FaceDir = '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z';

/** A single aluminum profile in the DIY frame. */
export interface DiyProfile {
  id: string;
  /** Stable creation sequence — used for structure-tree numbering (never changes on delete). */
  seq: number;
  profileSize: ProfileSize;
  /** Length in mm — fixed after initial placement + stretch. */
  length: number;
  /** Center position in mm (assembly frame). */
  position: { x: number; y: number; z: number };
  /** Axis direction of the profile. */
  direction: AxisDir;
  /** Parent profile ID (null = root, placed independently). */
  parentId: string | null;
  /** Which face of the parent this profile attaches to. */
  parentFace: FaceDir | null;
  /** Offset along parent axis from parent center (mm). */
  parentOffset: number;
}

/** A corner bracket in the DIY frame. */
export interface DiyBracket {
  id: string;
  /**
   * Which connector catalog entry renders this bracket (see src/diy/connectors.ts).
   * 'corner_bracket' = the built-in cast bracket; any other id is a baked
   * MayTec 角码 model dropped from the Connectors tab.
   */
  connectorId: string;
  /** World position (mm). */
  position: { x: number; y: number; z: number };
  /** World rotation (degrees, ZYX Euler). */
  rotation: { roll: number; pitch: number; yaw: number };
  /** Local anchor offset from bracket origin (mm). */
  anchorPosition: { x: number; y: number; z: number };
  /** Local anchor rotation (degrees, ZYX Euler). */
  anchorRotation: { roll: number; pitch: number; yaw: number };
  connectedProfiles: string[];
  enabled: boolean;
  /** Cube edge length (mm), matches profile cross-section. */
  size: number;
}

/** Socket-head screw sizes offered in the DIY library. */
export type ScrewSize = 'M4' | 'M5' | 'M6';

/** A screw mounted on a DIY profile face (head flush on the face, shaft in). */
export interface DiyScrew {
  id: string;
  /** Shoulder origin world position (mm) — the screw head rests on the face. */
  position: { x: number; y: number; z: number };
  /** World rotation (degrees, XYZ Euler — same convention as brackets). */
  rotation: { roll: number; pitch: number; yaw: number };
  size: ScrewSize;
  /** Total screw length (mm, head + shaft). */
  length: number;
  /** The profile face this screw is mounted on (removal cascades). */
  profileId: string;
  enabled: boolean;
  /** Optional STL override — entry point for real screw models later. */
  stlUrl?: string;
}

/** Head diameter / head height per screw size (mm, DIN912 socket head). */
export const SCREW_HEAD_DIMS: Record<ScrewSize, { headD: number; headH: number }> = {
  M4: { headD: 7, headH: 4 },
  M5: { headD: 8.5, headH: 5 },
  M6: { headD: 10, headH: 6 },
};

/** Default total length per screw size (mm). */
export const SCREW_DEFAULT_LENGTH: Record<ScrewSize, number> = {
  M4: 14,
  M5: 16,
  M6: 18,
};

/** Ghost screw shown while dragging a screw over the 3D viewport. */
export interface DiyScrewGhost {
  position: { x: number; y: number; z: number };
  rotation: { roll: number; pitch: number; yaw: number };
  size: ScrewSize;
  profileId: string;
}

/** DIY editor mode. */
export type DiyMode =
  | 'idle'
  | 'stretching'
  | 'selecting_direction'
  | 'placing_bracket'
  | 'placing_child'
  | 'placing_bracket_faces';

/**
 * A face picked on a profile while placing a bracket by clicking two faces.
 * `normal` is the outward unit normal (world, mm frame), `hit` the clicked
 * point on that face in mm.
 */
export interface BracketFacePick {
  profileId: string;
  /** Dominant-axis face name, e.g. "+Z" — which face was double-clicked. */
  face: string;
  normal: { x: number; y: number; z: number };
  hit: { x: number; y: number; z: number };
}

/** Profile size → cross-section dimension (mm). */
export const PROFILE_DIMS: Record<ProfileSize, number> = {
  '2020': 20,
  '3030': 30,
  '4040': 40,
};

/** Allowed growth directions for each profile axis (face → available directions). */
export const GROWTH_DIRS: Record<AxisDir, Record<string, AxisDir[]>> = {
  X: {
    '+Y': ['X', 'Y', 'Z'],
    '-Y': ['X', 'Y', 'Z'],
    '+Z': ['X', 'Y', 'Z'],
    '-Z': ['X', 'Y', 'Z'],
  },
  Y: {
    '+X': ['X', 'Y', 'Z'],
    '-X': ['X', 'Y', 'Z'],
    '+Z': ['X', 'Y', 'Z'],
    '-Z': ['X', 'Y', 'Z'],
  },
  Z: {
    '+X': ['X', 'Y', 'Z'],
    '-X': ['X', 'Y', 'Z'],
    '+Y': ['X', 'Y', 'Z'],
    '-Y': ['X', 'Y', 'Z'],
  },
};

/** Frontend template ID → backend template ID (some share the same YAML). */
export const TEMPLATE_BACKEND_ID: Record<string, string> = {
  'basic-desk': 'basic-desk',
  'inset-desk': 'basic-desk',
  'cross-beam-desk': 'basic-desk',  // same YAML, different layout
  'side-cross-desk': 'basic-desk',  // same YAML, different layout
};

/** Per-axis edge rule that keeps a "managed" (template-inserted) hole glued to a
 *  board edge while the tabletop is resized. Plain holes (manually placed, or
 *  detached copies) carry no anchor and keep their absolute coordinates.
 *
 *  `sign` names the reference edge side: X +1 = right (+W/2), X -1 = left (-W/2);
 *  Y +1 = front (+D/2), Y -1 = rear (-D/2). `value` is measured inboard from that
 *  edge to the hole CENTRE — in mm for `mode:'mm'`, or as a fraction of the full
 *  board dimension (W for X, D for Y) for `mode:'pct'`.
 *  `mode:'abs'` means "don't move when the board resizes". */
export type AxisAnchor =
  | { mode: 'abs' }
  | { mode: 'mm'; sign: -1 | 1; value: number }
  | { mode: 'pct'; sign: -1 | 1; value: number };

/** Common transform shared by every cutout shape.
 *  Position is in the tabletop frame (mm, origin at board centre, X right / Y front).
 *  `angle` is degrees around the hole centre, 0 default (optional so pre-existing
 *  circle literals need no migration — consumers must use `(h.angle ?? 0)`).
 *  `anchorX`/`anchorY` are only present on template-inserted (managed) holes —
 *  see {@link AxisAnchor}. */
export interface HoleBase {
  id: string;
  x: number;
  y: number;
  angle?: number;
  anchorX?: AxisAnchor;
  anchorY?: AxisAnchor;
}

/** A user-defined hole/cutout on the tabletop plan. Discriminated on `type`. */
export type TabletopHole =
  | (HoleBase & { type: 'circle'; radius: number }) // round hole
  | (HoleBase & { type: 'rect'; width: number; height: number; cornerRadius: number }) // square / rounded-rect; cr 0 = sharp
  | (HoleBase & { type: 'slot'; length: number; width: number }); // stadium (腰孔); length >= width, cap radius = width/2

/** A retained measure annotation (line between two board-frame mm points). */
export interface MeasureAnnotation {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Shape-agnostic hole edit patch (union members can't be spread via Partial).
 *  Never patches `type` — a hole keeps its shape while it is edited.
 *  anchorX/anchorY let an explicit anchor edit (the axis editor) replace the rule
 *  in the same atomic update as the coordinate derived from it. */
export interface HolePatch {
  x?: number;
  y?: number;
  angle?: number;
  radius?: number;
  width?: number;
  height?: number;
  cornerRadius?: number;
  length?: number;
  anchorX?: AxisAnchor;
  anchorY?: AxisAnchor;
}

/** Mate state machine for SolidWorks-style assembly. */
export type MateState = 'idle' | 'selecting_source_face' | 'selecting_target_face';

/** Data captured during mate face selection. */
export interface MateHit {
  /** World-space hit point (meters, Three.js coords). */
  point: [number, number, number];
  /** World-space face normal (unit vector). */
  normal: [number, number, number];
  /** Name of the hit object. */
  objectName: string;
}

/** A user-editable corner bracket / connector instance.
 *  Position and rotation are in the same assembly frame as solver parts
 *  (mm for position, degrees for rotation). */
export interface BracketInstance {
  id: string;
  name: string;
  /** World-space position in mm (assembly frame). */
  position: { x: number; y: number; z: number };
  /** Rotation in degrees (intrinsic ZYX Euler). */
  rotation: { roll: number; pitch: number; yaw: number };
  /** Which component IDs this bracket connects. */
  connectedParts: string[];
  /** Whether to render this bracket. */
  enabled: boolean;
  /** Profile cross-section the bracket matches (mm) — display metadata. */
  size?: number;
  /** Override bracket STL model per bracket; falls back to the default. */
  stlUrl?: string;
}

/** Default cast corner bracket STL. Configurable so the model can be swapped
 *  without touching the renderer (see also BracketInstance.stlUrl). */
export const DEFAULT_BRACKET_STL_URL = '/Cast_Corner_Bracket.stl';

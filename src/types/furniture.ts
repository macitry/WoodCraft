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
  position: { x: number; y: number; z: number };
  rotation: { roll: number; pitch: number; yaw: number };
  connectedProfiles: string[];
  enabled: boolean;
  /** Cube edge length (mm), matches profile cross-section. */
  size: number;
}

/** DIY editor mode. */
export type DiyMode =
  | 'idle'
  | 'stretching'
  | 'selecting_direction'
  | 'placing_bracket';

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

/** A user-defined hole/cutout on the tabletop plan. */
export interface TabletopHole {
  id: string;
  x: number;       // center X (mm, from tabletop center, right = +X)
  y: number;       // center Y (mm, from tabletop center, depth = +Y)
  radius: number;  // mm
  type: 'circle';
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
}

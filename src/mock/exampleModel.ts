import type {
  FurnitureTemplate,
  FurnitureModel,
  GenerateModelResponse,
  BomResponse,
  DrawingListResponse,
} from '../types/furniture';

// ============================================================
// Mock Templates — based on the backend's desk template
// ============================================================

export const mockTemplates: FurnitureTemplate[] = [
  {
    id: 'basic-desk',
    name: 'Basic Desk',
    type: 'desk',
    description: 'A simple, sturdy desk with aluminum extrusion frame and wood tabletop.',
    parameters: [
      {
        id: 'width',
        name: '桌面宽度',
        defaultValue: 1200,
        unit: 'mm',
        min: 600,
        max: 3000,
        step: 10,
      },
      {
        id: 'depth',
        name: '桌面深度',
        defaultValue: 600,
        unit: 'mm',
        min: 400,
        max: 1200,
        step: 10,
      },
      {
        id: 'height',
        name: '桌面高度',
        defaultValue: 750,
        unit: 'mm',
        min: 500,
        max: 1300,
        step: 10,
      },
      {
        id: 'tabletop_thickness',
        name: '桌板厚度',
        defaultValue: 18,
        unit: 'mm',
        min: 12,
        max: 40,
        step: 1,
      },
    ],
    parts: [
      { name: 'leg_front_left', partType: 'leg', profile: '3030', board: null, material: 'aluminum' },
      { name: 'leg_front_right', partType: 'leg', profile: '3030', board: null, material: 'aluminum' },
      { name: 'leg_back_left', partType: 'leg', profile: '3030', board: null, material: 'aluminum' },
      { name: 'leg_back_right', partType: 'leg', profile: '3030', board: null, material: 'aluminum' },
      { name: 'beam_front', partType: 'beam', profile: '3030', board: null, material: 'aluminum' },
      { name: 'beam_back', partType: 'beam', profile: '3030', board: null, material: 'aluminum' },
      { name: 'beam_left', partType: 'beam', profile: '3030', board: null, material: 'aluminum' },
      { name: 'beam_right', partType: 'beam', profile: '3030', board: null, material: 'aluminum' },
      { name: 'tabletop', partType: 'tabletop', profile: null, board: 'plywood', material: 'wood' },
    ],
  },
  {
    id: 'standing-desk',
    name: 'Standing Desk',
    type: 'desk',
    description: 'A height-adjustable standing desk with electric lift mechanism.',
    parameters: [
      {
        id: 'width',
        name: '桌面宽度',
        defaultValue: 1400,
        unit: 'mm',
        min: 800,
        max: 2400,
        step: 10,
      },
      {
        id: 'depth',
        name: '桌面深度',
        defaultValue: 700,
        unit: 'mm',
        min: 500,
        max: 1000,
        step: 10,
      },
      {
        id: 'height',
        name: '桌面高度',
        defaultValue: 1100,
        unit: 'mm',
        min: 700,
        max: 1300,
        step: 10,
      },
      {
        id: 'tabletop_thickness',
        name: '桌板厚度',
        defaultValue: 25,
        unit: 'mm',
        min: 18,
        max: 50,
        step: 1,
      },
    ],
    parts: [
      { name: 'leg_front_left', partType: 'leg', profile: '4040', board: null, material: 'aluminum' },
      { name: 'leg_front_right', partType: 'leg', profile: '4040', board: null, material: 'aluminum' },
      { name: 'leg_back_left', partType: 'leg', profile: '4040', board: null, material: 'aluminum' },
      { name: 'leg_back_right', partType: 'leg', profile: '4040', board: null, material: 'aluminum' },
      { name: 'beam_front', partType: 'beam', profile: '4040', board: null, material: 'aluminum' },
      { name: 'beam_back', partType: 'beam', profile: '4040', board: null, material: 'aluminum' },
      { name: 'tabletop', partType: 'tabletop', profile: null, board: 'oak', material: 'wood' },
    ],
  },
];

// ============================================================
// Mock Generated Model
// ============================================================

export const mockModel: FurnitureModel = {
  id: 'model-basic-desk-default',
  name: 'Basic Desk',
  modelUrl: '/models/desk.glb',  // will use procedural Three.js geometry as fallback
  thumbnail: undefined,
  parameters: [
    { id: 'width', name: '桌面宽度', value: 1200, unit: 'mm', min: 600, max: 3000, step: 10 },
    { id: 'depth', name: '桌面深度', value: 600, unit: 'mm', min: 400, max: 1200, step: 10 },
    { id: 'height', name: '桌面高度', value: 750, unit: 'mm', min: 500, max: 1300, step: 10 },
    { id: 'tabletop_thickness', name: '桌板厚度', value: 18, unit: 'mm', min: 12, max: 40, step: 1 },
  ],
  components: [
    { id: 'leg_front_left', name: '左前腿', modelUrl: '', visible: true, partType: 'leg', material: 'aluminum' },
    { id: 'leg_front_right', name: '右前腿', modelUrl: '', visible: true, partType: 'leg', material: 'aluminum' },
    { id: 'leg_back_left', name: '左后腿', modelUrl: '', visible: true, partType: 'leg', material: 'aluminum' },
    { id: 'leg_back_right', name: '右后腿', modelUrl: '', visible: true, partType: 'leg', material: 'aluminum' },
    { id: 'beam_front', name: '前横梁', modelUrl: '', visible: true, partType: 'beam', material: 'aluminum' },
    { id: 'beam_back', name: '后横梁', modelUrl: '', visible: true, partType: 'beam', material: 'aluminum' },
    { id: 'beam_left', name: '左横梁', modelUrl: '', visible: true, partType: 'beam', material: 'aluminum' },
    { id: 'beam_right', name: '右横梁', modelUrl: '', visible: true, partType: 'beam', material: 'aluminum' },
    { id: 'tabletop', name: '桌面', modelUrl: '', visible: true, partType: 'tabletop', material: 'wood' },
  ],
};

// ============================================================
// Mock API Response Helpers
// ============================================================

export function createMockGenerateResponse(model: FurnitureModel): GenerateModelResponse {
  return {
    modelId: model.id,
    modelUrl: model.modelUrl,
    format: 'glb',
    parts: model.components.map((c) => ({
      name: c.name,
      stlPath: undefined,
      stepPath: undefined,
      massKg: c.material === 'aluminum' ? 0.5 : 3.0,
      dimensions: {
        length: model.parameters.find((p) => p.id === 'width')?.value || 1200,
        width: model.parameters.find((p) => p.id === 'depth')?.value || 600,
        height: model.parameters.find((p) => p.id === 'height')?.value || 750,
      },
    })),
  };
}

export const mockBomData: BomResponse = {
  furnitureName: 'Basic Desk',
  entries: [
    { name: 'tabletop', partType: 'tabletop', quantity: 1, material: 'plywood', dimensions: { width: 1200, depth: 600, thickness: 18 }, massKg: 10.1 },
    { name: 'leg_front_left', partType: 'leg', quantity: 1, material: 'aluminum', dimensions: { length: 732 }, massKg: 1.78 },
    { name: 'leg_front_right', partType: 'leg', quantity: 1, material: 'aluminum', dimensions: { length: 732 }, massKg: 1.78 },
    { name: 'leg_back_left', partType: 'leg', quantity: 1, material: 'aluminum', dimensions: { length: 732 }, massKg: 1.78 },
    { name: 'leg_back_right', partType: 'leg', quantity: 1, material: 'aluminum', dimensions: { length: 732 }, massKg: 1.78 },
    { name: 'beam_front', partType: 'beam', quantity: 1, material: 'aluminum', dimensions: { length: 1140 }, massKg: 0.92 },
    { name: 'beam_back', partType: 'beam', quantity: 1, material: 'aluminum', dimensions: { length: 1140 }, massKg: 0.92 },
    { name: 'beam_left', partType: 'beam', quantity: 1, material: 'aluminum', dimensions: { length: 540 }, massKg: 0.44 },
    { name: 'beam_right', partType: 'beam', quantity: 1, material: 'aluminum', dimensions: { length: 540 }, massKg: 0.44 },
  ],
  totalMassKg: 19.94,
};

export const mockDrawings: DrawingListResponse = {
  furnitureName: 'Basic Desk',
  drawings: [
    { id: 'assembly-overview', name: 'Assembly Overview', type: 'assembly', url: '/drawings/assembly.svg', format: 'svg' },
    { id: 'tabletop-drawing', name: 'Tabletop', type: 'part', url: '/drawings/tabletop.svg', format: 'svg' },
    { id: 'leg-drawing', name: 'Leg Detail', type: 'part', url: '/drawings/leg.svg', format: 'svg' },
    { id: 'install-guide', name: 'Installation Guide', type: 'installation', url: '/drawings/install.svg', format: 'svg' },
  ],
};

// ============================================================
// Materials
// ============================================================

export const mockMaterials = [
  { id: 'plywood', name: 'Plywood', category: 'wood', density: 700, color: '#c4a46c' },
  { id: 'mdf', name: 'MDF', category: 'wood', density: 750, color: '#b8a080' },
  { id: 'oak', name: 'Oak', category: 'wood', density: 900, color: '#a07848' },
  { id: 'walnut', name: 'Walnut', category: 'wood', density: 650, color: '#5c3a1e' },
  { id: 'aluminum', name: 'Aluminum', category: 'metal', density: 2700, color: '#c0c0c0' },
  { id: 'steel', name: 'Steel', category: 'metal', density: 7850, color: '#808080' },
];

/** Simulate network delay for realistic mock behavior. */
export function delay(ms: number = 400): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

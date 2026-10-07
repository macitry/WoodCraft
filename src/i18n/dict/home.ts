// ---------------------------------------------------------------------------
// Area: the home configurator (`/`) — top bar, part tree, parameter panel,
// material selector, bracket editor. Keys are prefixed `home.`.
// ---------------------------------------------------------------------------

export const zh = {
  // --- top bar ------------------------------------------------------------
  'home.selectTemplate': '选择模板',
  'home.templates': '家具模板',
  'home.importDxf': '导入 DXF',
  'home.importDxfHint': '导入桌面轮廓 DXF',
  'home.exportDxfHint': '把桌面导出为 DXF',
  'home.clearDxfHint': '清除已导入的 DXF',
  'home.bom': 'BOM 物料清单',
  'home.bomHint': '查看 BOM 物料清单',
  'home.dxfImportFailed': 'DXF 导入失败：',
  'home.exporting': '导出中…',
  'home.modelFailed': '模型加载失败',

  // --- part tree ----------------------------------------------------------
  'home.tree.tabletop': '桌面',
  'home.tree.leg': '桌腿',
  'home.tree.beam': '横梁',
  'home.tree.shelf': '搁板',
  'home.tree.other': '其他',

  // --- parameter panel ----------------------------------------------------
  'home.params.title': '参数',
  'home.params.insetX': '宽边内缩',
  'home.params.insetZ': '深边内缩',
  'home.params.crossBeamHeight': '加强横梁高度',
  'home.params.groundEnd': '0%（地面）',
  'home.params.legTopEnd': '100%（桌腿顶）',

  // --- status bar ---------------------------------------------------------
  'home.info.parts': '{n} 个零件',
  'home.info.selected': '已选中：',
  'home.info.hint': '点击 3D 视图或零件树中的零件以查看信息',
} as const;

export type HomeKey = keyof typeof zh;

export const en: Record<HomeKey, string> = {
  'home.selectTemplate': 'Select Template',
  'home.templates': 'Furniture Templates',
  'home.importDxf': 'Import DXF',
  'home.importDxfHint': 'Import a tabletop outline from DXF',
  'home.exportDxfHint': 'Export the tabletop as DXF',
  'home.clearDxfHint': 'Clear the imported DXF',
  'home.bom': 'BOM',
  'home.bomHint': 'View the BOM',
  'home.dxfImportFailed': 'DXF import failed: ',
  'home.exporting': 'Exporting…',
  'home.modelFailed': 'Failed to load model',

  'home.tree.tabletop': 'Tabletop',
  'home.tree.leg': 'Legs',
  'home.tree.beam': 'Beams',
  'home.tree.shelf': 'Shelves',
  'home.tree.other': 'Other',

  'home.params.title': 'Parameters',
  'home.params.insetX': 'Width inset',
  'home.params.insetZ': 'Depth inset',
  'home.params.crossBeamHeight': 'Cross beam height',
  'home.params.groundEnd': '0% (floor)',
  'home.params.legTopEnd': '100% (leg top)',

  'home.info.parts': '{n} parts',
  'home.info.selected': 'Selected: ',
  'home.info.hint': 'Click a part in the 3D view or the component tree to inspect it',
};

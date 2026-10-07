// ---------------------------------------------------------------------------
// Area: plan — the tabletop plan view (`TabletopPlan`) and the hole property
// panel (`HolePropertiesPanel`).
//
// Chinese is the source of truth for the KEY SET; `en` is typed against it, so a
// key added here and forgotten there is a compile error rather than a string
// that silently falls back to its own name.
//
// Units (`mm`, `°`), axis letters (`X`/`Y`), catalog ids and format acronyms are
// never translated — they are part of the drawing, not the copy.
// ---------------------------------------------------------------------------

export const zh = {
  // --- mode toolbar (TOOLS) ----------------------------------------------
  'plan.tool.select': '选择',
  'plan.tool.selectTitle': '选中/移动孔 · 拖动空白平移 · 单击空白取消',
  'plan.tool.addCircle': '圆孔',
  'plan.tool.addCircleTitle': '单击放置圆孔（可连续）· Esc 退出',
  'plan.tool.addRect': '方孔',
  'plan.tool.addRectTitle': '单击放置方孔/圆角方孔（可连续）· Esc 退出',
  'plan.tool.addSlot': '腰孔',
  'plan.tool.addSlotTitle': '单击放置可旋转腰孔（可连续）· Esc 退出',
  'plan.tool.measure': '测量',
  'plan.tool.measureTitle':
    '吸附孔心/孔特征点/板边/角 → 水平垂直锁定 → 点第二点记录 · Esc 退出',
  'plan.toolLockedHint': '模板已锁定：需手动加孔请先转为自由副本或删除孔',

  // --- template menu -----------------------------------------------------
  'plan.template': '模板',
  'plan.templateApplied': '模板 ✓',
  'plan.templateManagedHint': '模板已锁定：孔随桌板尺寸自适应 · 可替换模板或转为自由副本',
  'plan.insertTemplateHint': '插入预设开孔模板',
  'plan.templateManagedTitle': '模板已锁定 · 一块板仅一套',
  'plan.templateManagedDesc': '{n} 个孔随桌板尺寸自适应 · 手动开孔已关闭',
  'plan.tplTooSmall': '板面需 ≥{minW}×{minD}mm（当前 {w}×{d}）',
  'plan.detachTemplateHint': '解除模板锁定：当前孔变成普通可编辑孔，之后可自由手动加孔',
  'plan.detachTemplate': '✂ 转为自由副本（脱离模板）',
  'plan.applyClears': '套用会先清空当前已布孔（一步可撤销）',

  // --- plan chrome (header row + footer legend) --------------------------
  'plan.holeCount': '{n} 孔',
  'plan.undoHint': '撤销 (Ctrl+Z)',
  'plan.redoHint': '重做 (Ctrl+Shift+Z)',
  'plan.annotate': '标注',
  'plan.annotateHint': '测量标注 显示/隐藏',
  'plan.gridHint': '对齐网格 (G 键)',
  'plan.gridLabel': '网格 {grid}',
  'plan.gridOff': '关闭',
  'plan.fitHint': '适配视图',
  'plan.fit': '适配',

  // --- profile (beam) projection labels ----------------------------------
  'plan.beam.front': '前',
  'plan.beam.back': '后',
  'plan.beam.left': '左',
  'plan.beam.right': '右',

  // --- in-canvas tool hints ----------------------------------------------
  'plan.measureHint1': '单击第一点（吸附孔心/孔特征点/板边）',
  'plan.measureHint2': '单击第二点记录距离（吸附孔特征点/板边/水平垂直）· Esc 退出',
  'plan.placeHint': '在台面上单击放置（吸附网格/孔心）· Esc 退出',

  // --- footer legend -----------------------------------------------------
  'plan.legendTop': '台面',
  'plan.legendProfile': '型材投影',
  'plan.legendHole': '开孔',
  'plan.legendMeasure': '测量标注',

  // --- keyboard cheat-sheet ----------------------------------------------
  'plan.keyboardHelp':
    '方向键 移动(Shift 10mm) · +/- 主尺寸 · R 旋转15° · G 网格 · Del 删除 · Esc 返回 · Ctrl+Z 撤销',

  // --- hole shape labels / descriptions (HolePropertiesPanel) ------------
  'plan.shape.rect': '方孔 · 圆角',
  'plan.shape.circleDesc': '直径可调，无需角度',
  'plan.shape.rectDesc': '圆角半径 0 = 直角方孔',
  'plan.shape.slotDesc': '两端半圆，长度 ≥ 宽度',

  // --- numeric field labels ----------------------------------------------
  'plan.field.radius': '半径',
  'plan.field.width': '宽',
  'plan.field.height': '高',
  'plan.field.cornerRadius': '圆角半径',
  'plan.field.cornerHint': '0 = 直角',
  'plan.field.length': '长',
  'plan.field.angle': '角度 °',

  // --- axis + edge-anchor editor -----------------------------------------
  'plan.axis.x': 'X · 宽方向',
  'plan.axis.y': 'Y · 深方向',
  'plan.edge.right': '右沿',
  'plan.edge.left': '左沿',
  'plan.edge.front': '前沿',
  'plan.edge.rear': '后沿',
  'plan.anchor.fixedCoord': '固定坐标',
  'plan.anchor.refEdge': '参考 {edge}（自动最近边）',
  'plan.anchor.mode.abs': '不动',
  'plan.anchor.mode.mm': '固定',
  'plan.anchor.mode.pct': '比例',
  'plan.anchor.current': '当前 {axis}{coord}mm',
  'plan.anchor.coordLabel': '坐标 {axis} (mm)',
  'plan.anchor.distPctLabel': '距{edge} 比例 (%)',
  'plan.anchor.distMmLabel': '距{edge} (mm)',
  'plan.anchor.absNote': '改桌板尺寸时该轴保持此坐标不动。',
  'plan.anchor.relNote': '改桌板尺寸时孔心与{edge}的距离固定为{val}。',
  'plan.anchor.snapNote': '拖动或按方向键后会自动吸附到最近边。',

  // --- panel chrome ------------------------------------------------------
  'plan.editingHole': '正在编辑孔洞',
  'plan.holeProps': '开孔属性',
  'plan.edgeAnchorSection': '边缘锚定 · 随桌板尺寸',
  'plan.sizeSection': '尺寸',
  'plan.numFieldNote': '输入后按 Enter / 失焦即应用（计入一步撤销）。',
  'plan.panelExitNote': '面板外点空白或按 Esc 也可返回产品参数。',
} as const;

export type PlanKey = keyof typeof zh;

export const en: Record<PlanKey, string> = {
  'plan.tool.select': 'Select',
  'plan.tool.selectTitle': 'Select/move holes · drag empty space to pan · click empty space to deselect',
  'plan.tool.addCircle': 'Circle',
  'plan.tool.addCircleTitle': 'Click to place a circle hole (repeatable) · Esc to exit',
  'plan.tool.addRect': 'Rectangle',
  'plan.tool.addRectTitle': 'Click to place a square/rounded-square hole (repeatable) · Esc to exit',
  'plan.tool.addSlot': 'Slot',
  'plan.tool.addSlotTitle': 'Click to place a rotatable slot (repeatable) · Esc to exit',
  'plan.tool.measure': 'Measure',
  'plan.tool.measureTitle':
    'Snaps to hole centres/feature points/board edges/corners → locks horizontal/vertical → click a second point to record · Esc to exit',
  'plan.toolLockedHint': 'Template locked: to add holes by hand, first convert to a free copy or delete holes',

  'plan.template': 'Template',
  'plan.templateApplied': 'Template ✓',
  'plan.templateManagedHint': 'Template locked: holes follow the board size · replace the template or convert to a free copy',
  'plan.insertTemplateHint': 'Insert a preset hole template',
  'plan.templateManagedTitle': 'Template locked · one layout per board',
  'plan.templateManagedDesc': '{n} holes follow the board size · manual hole-adding is off',
  'plan.tplTooSmall': 'Board must be ≥{minW}×{minD}mm (currently {w}×{d})',
  'plan.detachTemplateHint': 'Unlock the template: the holes become ordinary editable holes and you can add holes by hand afterwards',
  'plan.detachTemplate': '✂ Convert to free copy (detach from template)',
  'plan.applyClears': 'Applying clears the current holes first (one undo step)',

  'plan.holeCount': '{n} holes',
  'plan.undoHint': 'Undo (Ctrl+Z)',
  'plan.redoHint': 'Redo (Ctrl+Shift+Z)',
  'plan.annotate': 'Annotations',
  'plan.annotateHint': 'Measure annotations — show/hide',
  'plan.gridHint': 'Snap grid (G key)',
  'plan.gridLabel': 'Grid {grid}',
  'plan.gridOff': 'Off',
  'plan.fitHint': 'Fit view',
  'plan.fit': 'Fit',

  'plan.beam.front': 'Front',
  'plan.beam.back': 'Back',
  'plan.beam.left': 'Left',
  'plan.beam.right': 'Right',

  'plan.measureHint1': 'Click the first point (snaps to hole centres/feature points/board edges)',
  'plan.measureHint2': 'Click the second point to record the distance (snaps to feature points/board edges, locks horizontal/vertical) · Esc to exit',
  'plan.placeHint': 'Click on the tabletop to place (snaps to grid/hole centres) · Esc to exit',

  'plan.legendTop': 'Tabletop',
  'plan.legendProfile': 'Profile projection',
  'plan.legendHole': 'Hole',
  'plan.legendMeasure': 'Measure annotation',

  'plan.keyboardHelp':
    'Arrows move (Shift 10mm) · +/- primary size · R rotate 15° · G grid · Del delete · Esc back · Ctrl+Z undo',

  'plan.shape.rect': 'Rectangle · rounded',
  'plan.shape.circleDesc': 'Adjustable diameter, no angle needed',
  'plan.shape.rectDesc': 'Corner radius 0 = square corners',
  'plan.shape.slotDesc': 'Half-round ends, length ≥ width',

  'plan.field.radius': 'Radius',
  'plan.field.width': 'Width',
  'plan.field.height': 'Height',
  'plan.field.cornerRadius': 'Corner radius',
  'plan.field.cornerHint': '0 = square',
  'plan.field.length': 'Length',
  'plan.field.angle': 'Angle °',

  'plan.axis.x': 'X · width',
  'plan.axis.y': 'Y · depth',
  'plan.edge.right': 'right edge',
  'plan.edge.left': 'left edge',
  'plan.edge.front': 'front edge',
  'plan.edge.rear': 'rear edge',
  'plan.anchor.fixedCoord': 'Fixed coordinate',
  'plan.anchor.refEdge': 'Relative to {edge} (nearest edge, auto)',
  'plan.anchor.mode.abs': 'Absolute',
  'plan.anchor.mode.mm': 'Distance',
  'plan.anchor.mode.pct': 'Ratio',
  'plan.anchor.current': 'Now {axis}{coord}mm',
  'plan.anchor.coordLabel': 'Coord {axis} (mm)',
  'plan.anchor.distPctLabel': 'Ratio from {edge} (%)',
  'plan.anchor.distMmLabel': 'From {edge} (mm)',
  'plan.anchor.absNote': 'When the board is resized, this axis keeps this coordinate.',
  'plan.anchor.relNote': 'When the board is resized, the hole centre stays {val} from the {edge}.',
  'plan.anchor.snapNote': 'Dragging or using the arrow keys snaps it to the nearest edge automatically.',

  'plan.editingHole': 'Editing hole',
  'plan.holeProps': 'Hole properties',
  'plan.edgeAnchorSection': 'Edge anchoring · follows board size',
  'plan.sizeSection': 'Size',
  'plan.numFieldNote': 'Applied on Enter / blur (counts as one undo step).',
  'plan.panelExitNote': 'Click empty space outside the panel or press Esc to return to the product parameters.',
};

// ---------------------------------------------------------------------------
// Area: the kit / assembly editor (`/kits`, 「组合」). Keys are prefixed `kit.`.
// ---------------------------------------------------------------------------

export const zh = {
  // --- page header (migrated with the shared AppHeader) -------------------
  'kit.count': '共 {n} 件 · 3D / 清单 / 导出同源',
  'kit.hiddenCount': '· 另有 {n} 件已隐藏',
  'kit.resetAll': '恢复整套默认',
  'kit.resetAllHint': '清除本组合的全部微调，回到预设',
  'kit.resetAllNone': '这套组合尚未改动',
  'kit.frameRefused': '「{name}」按整块桌板计价，不产生可放置的零件 —— 已切换到可微调的组合。',

  // --- kit library / hole-pattern picker (left aside, top) ----------------
  'kit.library': '组合库',
  'kit.frameNotEditable': '按整块桌板计价，不产生可放置的零件，无装配体可调',
  'kit.holeTable': '孔位表',
  'kit.holeTableNote': '微调按孔位表区分，孔位表由连接件尺寸决定 —— 尺寸相同就共用一份。',
  'kit.sharedCount': '{n} 件共用',
  'kit.profile': '型材',
  'kit.profileNote': '只影响这里的预览，不改零件数量与位置。',
  'kit.parts': '零件',
  'kit.partsCount': '（{n}）',

  // --- hand-adding hardware (left aside, bottom) --------------------------
  'kit.addSocketScrew': '内六角螺栓',
  'kit.addCountersunkScrew': '沉头螺钉',
  'kit.addTNut': 'T 型螺母',
  'kit.addPart': '＋ 添加零件',
  'kit.addAtPart': '加在「{name}」处',
  'kit.addAtFirst': '加在第一个孔位',
  'kit.addHint': '添加后会选中，可直接拖走或改数值。',
  'kit.addTotal': '共 {n} 件',
  'kit.tweakScopeNote':
    '微调只改变 3D 位置、清单与导出数量；不修改角码模型，也不在型材上生成真实孔位。',

  // --- the 3D viewport hint (over the canvas) ----------------------------
  'kit.pickHint': '点选零件可在右侧查看',
  'kit.escHint': 'Esc 取消选中，再按返回',
  'kit.nothingSelected': '未选中零件。点 3D 中的一颗，或左侧清单里的一行。',
  'kit.profileLoadFailed': '型材模型加载失败，装配体只剩五金件',

  // --- the selected-part panel (right aside) -----------------------------
  'kit.selectedPart': '选中零件',
  'kit.handAdded': '手工添加',
  'kit.bolt': '螺栓',
  'kit.mate': '配合件',
  'kit.internalGhost': ' · 槽内（透视）',
  'kit.sectionPosition': '位置 (mm) · 绝对值',
  'kit.sectionRotation': '朝向 (°) · XYZ 序',
  'kit.seatBase': '预设孔位 {pos} mm · 存的是相对它的增量',
  'kit.rotAbsolute': '绝对值。',
  'kit.rotOffset': '相对预设朝向的增量。',
  'kit.rotNote': '注意：Z 轴旋转不改变螺栓的朝向 —— 轴向只由 X / Y 决定。',
  'kit.sectionSize': '规格',
  'kit.shaftLength': '杆长 (mm)',
  'kit.lengthNotInCatalog': '{n} · 目录无此长度',
  'kit.catalogRange': '· 目录内 {min}–{max}mm',
  'kit.tNutLocked':
    'T 型螺母的规格不可改：名字里的「系列」由它压进的型材槽决定，不是 `size` 的函数 —— 由 size 拼出来的名字会说谎。取下它或换一颗，比改半个名字诚实。',
  'kit.hideHint': '3D、清单与导出同时消失；清单仍留一行可恢复',
  'kit.restoreShow': '恢复显示',
  'kit.hidePart': '隐藏此零件',
  'kit.removePart': '移除这个零件',
  'kit.resetPart': '重置此零件',
} as const;

export type KitKey = keyof typeof zh;

export const en: Record<KitKey, string> = {
  'kit.count': '{n} parts · 3D / list / export from one source',
  'kit.hiddenCount': '· {n} more hidden',
  'kit.resetAll': 'Reset kit to default',
  'kit.resetAllHint': 'Clear every adjustment to this kit and go back to the preset',
  'kit.resetAllNone': 'This kit has not been adjusted',
  'kit.frameRefused':
    '「{name}」 is priced per whole tabletop and produces no placeable parts — switched to a kit you can adjust.',

  'kit.library': 'Kit library',
  'kit.frameNotEditable': 'Priced per whole tabletop, produces no placeable parts, nothing to adjust',
  'kit.holeTable': 'Hole table',
  'kit.holeTableNote':
    'Edits are keyed by hole pattern, and the pattern follows the connector dimensions — the same size shares one layout.',
  'kit.sharedCount': '{n} share one',
  'kit.profile': 'Profile',
  'kit.profileNote': 'Preview only — it changes neither the part count nor the positions.',
  'kit.parts': 'Parts',
  'kit.partsCount': '({n})',

  'kit.addSocketScrew': 'Socket screw',
  'kit.addCountersunkScrew': 'Countersunk screw',
  'kit.addTNut': 'T-nut',
  'kit.addPart': '+ Add part',
  'kit.addAtPart': 'Add at "{name}"',
  'kit.addAtFirst': 'Add at the first seat',
  'kit.addHint': 'It is selected on arrival — drag it away or edit its numbers.',
  'kit.addTotal': '{n} parts total',
  'kit.tweakScopeNote':
    'Edits change only the 3D positions, the list and the exported quantity; the bracket model is untouched and no real holes are cut in the profiles.',

  'kit.pickHint': 'Click a part to inspect it on the right',
  'kit.escHint': 'Esc clears the selection, press again to leave',
  'kit.nothingSelected': 'No part selected. Click one in the 3D view, or a row in the list on the left.',
  'kit.profileLoadFailed': 'Profile model failed to load — only the hardware is shown',

  'kit.selectedPart': 'Selected part',
  'kit.handAdded': 'Hand-added',
  'kit.bolt': 'Bolt',
  'kit.mate': 'Mating part',
  'kit.internalGhost': ' · in slot (ghosted)',
  'kit.sectionPosition': 'Position (mm) · absolute',
  'kit.sectionRotation': 'Rotation (°) · XYZ order',
  'kit.seatBase': 'Preset seat {pos} mm · stored as an offset from it',
  'kit.rotAbsolute': 'Absolute.',
  'kit.rotOffset': 'An offset from the preset orientation.',
  'kit.rotNote': 'Note: a Z rotation does not change the bolt direction — the axis is set by X / Y alone.',
  'kit.sectionSize': 'Size / Length',
  'kit.shaftLength': 'Shaft length (mm)',
  'kit.lengthNotInCatalog': '{n} · not in catalog',
  'kit.catalogRange': '· catalog {min}–{max}mm',
  'kit.tNutLocked':
    'A T-nut cannot be re-specced: the series in its name is set by the profile slot it presses into, not by `size` — a name built from size would lie. Removing it, or swapping in another nut, is more honest than half-editing its name.',
  'kit.hideHint': 'Disappears from the 3D view, the list and the export; a row stays in the list so it can be restored',
  'kit.restoreShow': 'Show again',
  'kit.hidePart': 'Hide this part',
  'kit.removePart': 'Remove this part',
  'kit.resetPart': 'Reset this part',
};

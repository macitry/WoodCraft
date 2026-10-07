// ---------------------------------------------------------------------------
// Area: panel — the configurator's side panels and the BOM modal.
// Keys are prefixed 'panel.'. Anything shared with another area lives in
// common.ts instead (common.hide / common.show / common.noModel / …), so this
// file does not grow a second spelling of a word the app already has.
// ---------------------------------------------------------------------------

export const zh = {
  // --- ParameterPanel ----------------------------------------------------
  'panel.parameters': '参数',
  'panel.profile': '型材',
  'panel.frameInset': '边框内缩',
  'panel.insetX': '宽边内缩',
  'panel.insetZ': '深边内缩',
  'panel.crossBeamHeight': '加强横梁高度',
  'panel.ground': '0%（地面）',
  'panel.legTop': '100%（桌腿顶）',
  'panel.boardMaterial': '桌面板材',
  'panel.updating': '正在更新模型…',

  // --- ProgressBar -------------------------------------------------------
  'panel.phase.warming': '预热中',
  'panel.phase.generating': '生成 CAD 模型',
  'panel.phase.idle': '就绪',

  // --- ModelInfo (bottom bar) -------------------------------------------
  'panel.dims': '{w} × {d} × {h} mm',
  'panel.partCount': '{n} 个零件',
  'panel.selected': '已选：',
  'panel.inspectHint': '点选 3D 视图或零件树中的零件查看详情',

  // --- FurnitureTree -----------------------------------------------------
  'panel.group.tabletop': '桌面',
  'panel.group.leg': '桌腿',
  'panel.group.beam': '横梁',
  'panel.group.shelf': '搁板',
  'panel.group.other': '其他',

  // --- MaterialSelector --------------------------------------------------
  'panel.myUploads': '自己上传',
  'panel.uploadImage': '＋ 上传图片',
  'panel.uploadBusy': '处理中…',
  'panel.uploadHint': '上传一张图片作为桌板',
  'panel.uploadFailed': '这张图片用不了：',
  'panel.uploadEmptyHint': '照片会按中心裁成正方形铺到桌面上。浏览器会记住它，除非你删掉。',
  'panel.uploadFooterHint':
    '照片按中心裁成正方形。这个毫米数填错，木纹在桌面上的大小就是错的——它该是裁出来的那个正方形拍了多宽的一块板。',
  'panel.squareRepresents': '正方形代表',
  'panel.deleteBoard': '删除这张板',
  'panel.boardScope': '只作用于桌板。桌架是铝型材，角码是钢，不受此项影响。',

  // --- BracketEditor -----------------------------------------------------
  'panel.cornerBrackets': '角码',
  'panel.bracketCount': '{n} 个角码',
  'panel.addBracket': '＋ 添加',
  'panel.addBracketHint': '添加一个手动角码',
  'panel.autoRegen': '⚡ 自动',
  'panel.autoRegenHint': '按接头算法重新生成角码（覆盖手动调整）',
  'panel.noBrackets': '还没有角码。按住 Ctrl 点选两个面即可生成。',
  'panel.bracketManual': '角铁-手动#{n}',
  'panel.copySuffix': '（副本）',
  'panel.disable': '停用',
  'panel.enable': '启用',
  'panel.name': '名称',
  'panel.position': '位置 (mm)',
  'panel.rotation': '旋转 (°)',
  'panel.connectedParts': '连接零件',
  'panel.connectedPartsHint': '例如 leg_front_left, beam_front',
  'panel.stlModel': 'STL 模型 (stlUrl)',
  'panel.stlModelHint': '/Cast_Corner_Bracket.stl',

  // --- AccessoryKitPanel (the kit cards inside BracketEditor) -------------
  'panel.kits': '配件组合',
  'panel.noKit': '无',
  'panel.noKitHint': '不统计紧固件',
  'panel.noKitTitle': '不使用配件组合',
  'panel.boltsPerJoint': '每处 {n} 颗',
  'panel.seatedExact': '每处 {n} 颗（额定 {r}）',
  'panel.seatedRange': '每处 {lo}–{hi} 颗（额定 {r}）',
  'panel.perFrame': '每桌板 {n} 颗',
  'panel.frameOnly': '{name} · 清单与工序专用，不在 3D 中显示',
  'panel.jointParts': '每处 {parts}',
  'panel.jointCount': ' · 共 {n} 处',
  'panel.jointSeparator': '；',
  'panel.partQty': '{qty} 颗 {name}',
  'panel.noEnabledBrackets': '当前没有启用的角码 —— 紧固件也无处可放。',
  'panel.tweakParts': '微调零件…',
  'panel.tweakHint': '逐颗调整：{connector} · {parts}',
  'panel.showFasteners': '显示紧固件',
  'panel.showInternal': '槽内螺母（透视）',
  'panel.showInternalHint': '半透明显示压入型材槽内的 T 型螺母',

  // --- BomPreviewModal ---------------------------------------------------
  'panel.bomTitle': '📋 BOM 物料清单',
  'panel.colPart': '零件名称',
  'panel.colMaterial': '材料',
  'panel.colProfile': '型材',
  'panel.colArticle': '料号',
  'panel.colLength': '长度 (mm)',
  'panel.colQty': '数量',
  'panel.articleHint': '料号 — 点击可选中复制',
  'panel.articleMissing': '此零件不在 MayTec 目录中',
  'panel.ops': '加工要求',
  'panel.bomTotal': '共 {n} 件',
  'panel.exportCsv': '📤 导出 CSV',
  'panel.exportCsvHint': '导出 BOM 为 CSV',

  // --- BOM row labels and export headers (`utils/bomExport`) -------------
  // These were bilingual IN ONE STRING — 「桌面 (Tabletop)」 — which is the exact
  // 混杂 this pass exists to remove. The dictionary now holds one name per
  // language instead of one name containing both.
  'bom.tabletop': '桌面',
  'bom.leg': '桌腿',
  'bom.beamLong': '横梁-长边',
  'bom.beamShort': '横梁-短边',
  'bom.crossBeam': '加强横梁',
  'bom.bracket': '角码',
  'bom.csvHeader': '零件名称,类型,材料,型材型号,长度(mm),数量',
  'bom.csvNotes': '备注',
  'bom.csvArticle': '料号',
  'bom.csvOpsComment': '# 加工要求',
  'bom.textTotal': '  零件合计：{n}',
  'bom.profile': '型材',
  'bom.bracketNamed': '角码 {label}',

  // Board-upload failures. Each one is thrown as an Error whose message is shown
  // verbatim to the user (see MaterialSelector's alert), so it is a sentence for
  // the reader, not a diagnostic for the log.
  'panel.errTooLarge': '图片太大（{mb} MB），请用 20 MB 以内的一张',
  'panel.errTileMm': '覆盖毫米数必须是正数',
  'panel.errNotImage': '这个文件不是浏览器能解码的图片',
  'panel.errTooSmall': '图片太小，至少需要 32 像素见方',

  // The two-step face-mating prompt drawn over the viewer.
  'panel.mateStep1': '⚓ 配合 1/2：点选角码表面（要配合的面）',
  'panel.mateStep2': '⚓ 配合 2/2：点选目标零件表面（要贴合的位置）',
} as const;

export type PanelKey = keyof typeof zh;

export const en: Record<PanelKey, string> = {
  'panel.parameters': 'Parameters',
  'panel.profile': 'Profile',
  'panel.frameInset': 'Frame inset',
  'panel.insetX': 'Width inset',
  'panel.insetZ': 'Depth inset',
  'panel.crossBeamHeight': 'Cross beam height',
  'panel.ground': '0% (floor)',
  'panel.legTop': '100% (leg top)',
  'panel.boardMaterial': 'Board material',
  'panel.updating': 'Updating model…',

  'panel.phase.warming': 'Warming up',
  'panel.phase.generating': 'Generating CAD model',
  'panel.phase.idle': 'Ready',

  'panel.dims': '{w} × {d} × {h} mm',
  'panel.partCount': '{n} parts',
  'panel.selected': 'Selected:',
  'panel.inspectHint': 'Click a part in the 3D view or component tree to inspect',

  'panel.group.tabletop': 'Tabletop',
  'panel.group.leg': 'Legs',
  'panel.group.beam': 'Beams',
  'panel.group.shelf': 'Shelves',
  'panel.group.other': 'Other',

  'panel.myUploads': 'Your uploads',
  'panel.uploadImage': '+ Upload image',
  'panel.uploadBusy': 'Processing…',
  'panel.uploadHint': 'Upload an image to use as the tabletop board',
  'panel.uploadFailed': 'That image cannot be used: ',
  'panel.uploadEmptyHint':
    'The photo is centre-cropped to a square and tiled across the tabletop. The browser remembers it until you delete it.',
  'panel.uploadFooterHint':
    'The photo is centre-cropped to a square. Get this millimetre value wrong and the grain comes out the wrong size on the table — it should be how wide a piece of board the cropped square photographed.',
  'panel.squareRepresents': 'square represents',
  'panel.deleteBoard': 'Delete this board',
  'panel.boardScope':
    'Tabletop only. The frame is extruded aluminium and the brackets are steel; neither is affected by this.',

  'panel.cornerBrackets': 'Corner brackets',
  'panel.bracketCount': '{n} bracket(s)',
  'panel.addBracket': '+ Add',
  'panel.addBracketHint': 'Add a bracket by hand',
  'panel.autoRegen': '⚡ Auto',
  'panel.autoRegenHint': 'Regenerate brackets from the joint algorithm (discards manual edits)',
  'panel.noBrackets': 'No brackets. Ctrl+Click two faces.',
  'panel.bracketManual': 'Bracket-manual#{n}',
  'panel.copySuffix': ' (copy)',
  'panel.disable': 'Disable',
  'panel.enable': 'Enable',
  'panel.name': 'Name',
  'panel.position': 'Position (mm)',
  'panel.rotation': 'Rotation (deg)',
  'panel.connectedParts': 'Connected parts',
  'panel.connectedPartsHint': 'e.g. leg_front_left, beam_front',
  'panel.stlModel': 'STL model (stlUrl)',
  'panel.stlModelHint': '/Cast_Corner_Bracket.stl',

  'panel.kits': 'Accessory kits',
  'panel.noKit': 'None',
  'panel.noKitHint': 'Fasteners not counted',
  'panel.noKitTitle': 'Use no accessory kit',
  'panel.boltsPerJoint': '{n} per joint',
  'panel.seatedExact': '{n} per joint (rated {r})',
  'panel.seatedRange': '{lo}–{hi} per joint (rated {r})',
  'panel.perFrame': '{n} per tabletop',
  'panel.frameOnly': '{name} · list and machining only, not drawn in 3D',
  'panel.jointParts': '{parts} per joint',
  'panel.jointCount': ' · {n} joints',
  'panel.jointSeparator': '; ',
  'panel.partQty': '{qty} × {name}',
  'panel.noEnabledBrackets': 'No brackets are enabled — the fasteners have nowhere to go.',
  'panel.tweakParts': 'Tweak parts…',
  'panel.tweakHint': 'Adjust individually: {connector} · {parts}',
  'panel.showFasteners': 'Show fasteners',
  'panel.showInternal': 'Nuts in slot (x-ray)',
  'panel.showInternalHint': 'Draw the T-nuts pressed into the profile slot semi-transparently',

  'panel.bomTitle': '📋 BOM — bill of materials',
  'panel.colPart': 'Part',
  'panel.colMaterial': 'Material',
  'panel.colProfile': 'Profile',
  'panel.colArticle': 'Article no.',
  'panel.colLength': 'Length (mm)',
  'panel.colQty': 'Qty',
  'panel.articleHint': 'Article number — click to select and copy',
  'panel.articleMissing': 'This part is not in the MayTec catalogue',
  'panel.ops': 'Machining',
  'panel.bomTotal': '{n} pcs in total',
  'panel.exportCsv': '📤 Export CSV',
  'panel.exportCsvHint': 'Export the BOM as CSV',

  'bom.tabletop': 'Tabletop',
  'bom.leg': 'Leg',
  'bom.beamLong': 'Beam (long)',
  'bom.beamShort': 'Beam (short)',
  'bom.crossBeam': 'Cross beam',
  'bom.bracket': 'Corner bracket',
  'bom.csvHeader': 'Part,Type,Material,Profile,Length(mm),Qty',
  'bom.csvNotes': 'Notes',
  'bom.csvArticle': 'Article no.',
  'bom.csvOpsComment': '# Machining',
  'bom.textTotal': '  Total parts: {n}',
  'bom.profile': 'Profile',
  'bom.bracketNamed': 'Bracket {label}',

  'panel.errTooLarge': 'Image too large ({mb} MB) — pick one under 20 MB',
  'panel.errTileMm': 'The covered size must be a positive number of millimetres',
  'panel.errNotImage': 'That file is not an image the browser can decode',
  'panel.errTooSmall': 'Image too small — it needs to be at least 32 pixels square',

  'panel.mateStep1': '⚓ Mate 1/2: click the BRACKET face you want to mate',
  'panel.mateStep2': '⚓ Mate 2/2: click the TARGET face to attach it to',
};

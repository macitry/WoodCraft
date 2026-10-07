// ---------------------------------------------------------------------------
// Area: the CAD catalog — connectors, fasteners, kits, boards, hole templates.
//
// These display names live in DATA files, and two of those files are GENERATED
// (`src/diy/connectors.ts`, `src/materials/tabletopTextures.ts`), so their
// strings cannot simply be swapped for keys. Every entry is therefore looked up
// by its stable ID through `src/i18n/names.ts`, and the string still sitting in
// the data file is only a FALLBACK for an id nobody has translated yet.
//
// Ids are never translated: `1.46.204.2828A`, `28x28`, `M6`, `DIN 912`,
// `GD-Zn` are what the drawing, the supplier and the BOM agree on. Translate
// them and the BOM stops matching the part.
// ---------------------------------------------------------------------------

export const zh = {
  // --- connectors (`CONNECTORS` / `CAST_CONNECTOR` / `CONNECTOR_COVERS`) ---
  'cat.corner_bracket.label': '铸铝角码',
  'cat.corner_bracket.desc': '铸铝 L 型角码 · 30 系列',
  'cat.1.46.110.label': '铝角码 25x40',
  'cat.1.46.110.desc': '铝 · 角码 · Ø6.6',
  'cat.1.46.115.label': '铝角码 25x40',
  'cat.1.46.115.desc': '铝 · 角码 · Ø8.7',
  'cat.1.46.120.label': '铝角码 25x40',
  'cat.1.46.120.desc': '铝 · 角码 · M6',
  'cat.1.46.203.2028.1.label': '尼龙角码 20x28',
  'cat.1.46.203.2028.1.desc': '尼龙 PA · 灰',
  'cat.1.46.203.2028.2.label': '尼龙角码 20x28',
  'cat.1.46.203.2028.2.desc': '尼龙 PA · 黑',
  'cat.1.46.203.3038.1.label': '尼龙角码 30x38',
  'cat.1.46.203.3038.1.desc': '尼龙 PA · 灰',
  'cat.1.46.203.3038.2.label': '尼龙角码 30x38',
  'cat.1.46.203.3038.2.desc': '尼龙 PA · 黑',
  'cat.1.46.20536.label': '铝角码 48x48',
  'cat.1.46.20536.desc': '铝 · 角码 · Ø6.6',
  'cat.1.46.20539.label': '铝角码 48x48',
  'cat.1.46.20539.desc': '铝 · 角码 · Ø9.0',
  'cat.1.68.1.1.4030.X/01V.label': '钢角板 40x40',
  'cat.1.68.1.1.4030.X/01V.desc': '钢 · 角板',
  'cat.7.11.706.89/01.label': '钢角板 47.5x47.5',
  'cat.7.11.706.89/01.desc': '钢 · 角板',
  'cat.1.46.204.2828.2.label': '锌合金角码 28x28',
  'cat.1.46.204.2828.2.desc': '锌合金 · 角件 · 粉末喷涂 · 三角加强',
  'cat.1.46.204.2828A.label': '角件盖板 28x28',
  'cat.1.46.204.2828A.desc': '角件盖板 · 锌合金',

  // --- board surfaces (`TABLETOP_TEXTURES`) ------------------------------
  'tex.oak.label': '橡木',
  'tex.oak.note': '直纹 · 年轮细密，导管孔在光下发暗',
  'tex.walnut.label': '黑胡桃',
  'tex.walnut.note': '直纹 · 色深，年轮宽、明暗对比强',
  'tex.plank.label': '橡木拼板',
  'tex.plank.note': '宽窄不一的板条胶拼 · 接缝处的胶线比木头更光',
  'tex.ply.label': '多层板',
  'tex.ply.note': '薄面皮 + 侧边一叠胶合层 · 层厚按毫米固定，不随板厚变',

  // --- accessory kits (`ACCESSORY_KITS`) ---------------------------------
  'kit.corner-standard.name': '角码标准连接',
  'kit.corner-standard.desc':
    '每处角码 2 颗 M6×10 圆头法兰螺钉 + 2 颗带弹簧 T 型螺母（可后装）+ 1 只角件盖板',
  'kit.corner-heavy.name': '角码加强连接',
  'kit.corner-heavy.desc': '每处角码 4 颗 M6×12 内六角薄头螺栓 + 4 颗 T 型螺母，用于承重横梁',
  'kit.corner-tapped.name': '端面攻丝连接',
  'kit.corner-tapped.desc': '每处角码 2 颗 M6×14 内六角薄头螺栓，不配螺母 —— 型材端面攻丝代替',
  'kit.corner-tapped.op.0': '型材端面攻丝 M6 · 深 15（代替 T 型螺母）',
  'kit.tabletop-fix.name': '桌板固定',
  'kit.tabletop-fix.desc':
    '每张桌板 4 颗 M5×16 内六角沉头螺栓（配预埋螺母）—— 只进清单与工序，不在 3D 中显示',
  'kit.tabletop-fix.op.0': '桌板钻孔 Ø5',
  'kit.tabletop-fix.op.1': '孔口沉头 Ø10',
  'kit.tabletop-fix.op.2': '桌板侧预埋 M5 螺母 / 螺纹嵌件',

  // --- screw + T-nut families (`SCREW_FAMILIES` / `TNUT_FAMILIES`) --------
  'fam.din912.label': '内六角圆柱头螺栓',
  'fam.din912.short': '圆柱头',
  'fam.din7984.label': '内六角薄头螺栓',
  'fam.din7984.short': '薄头',
  'fam.countersunk.label': '内六角沉头螺栓',
  'fam.countersunk.short': '沉头',
  'fam.wn7381.label': '圆头法兰螺钉',
  'fam.wn7381.short': '圆头法兰',
  'fam.tnut.t_slot.short': '普通',
  'fam.tnut.spring.short': '带弹簧',

  // --- assembled part names (built, not stored) --------------------------
  'name.screw': '{family} {size}×{length}',
  'name.tnut': 'T 型螺母 {size} · {series} 系列 · {family}',
  'name.cover': '盖板 {label}',
  'name.bracketManual': '角铁-手动#{n}',
  'name.bracketAuto': '角铁-自动#{n}',
  'name.bracketAutoPair': '角铁-自动#{n}({side})',
  // A bracket dropped by clicking a face: `{part}` is the clicked object's raw
  // three.js name, which is an identity (it also goes into `connectedParts`) and
  // therefore arrives at this key already untranslated.
  'name.bracketSnap': '角铁-{part}#{n}',
  'name.profile': '型材 {size}',
  'name.uploadedBoard': '上传的板',
  'name.uploadedBoardNote': '上传 · 裁出的正方形代表 {mm} mm',

  // --- screw head readouts (`fastenerDims.headText`) ---------------------
  'head.countersunk': '头径 {d}mm · 沉头（头部低于安装面）',
  'head.plain': '头径 {d}mm · 头高 {h}mm',

  // --- kit / template fit refusal (`kitFitReason`, `holeTemplateFitReason`) -
  'fit.tooSmall': '需 ≥{min}mm 型材（当前 {cur}mm）',
  'fit.tooSmallBoard': '板面需 ≥{w}×{d}mm（当前 {curW}×{curD}）',

  // --- hole templates (`HOLE_TEMPLATES`) ---------------------------------
  'hole.rear-cable.name': '后沿理线 · 经典',
  'hole.rear-cable.desc': '桌后集中走线：中央 360×28 走线槽 + 两角 Ø60 电源/数据线孔',
  'hole.grommet-desk.name': '显示器穿孔 · 电源线盒',
  'hole.grommet-desk.desc': '中央 Ø85 穿线/夹持孔 + 前中部 108×60 圆角电源线盒开口',
  'hole.rear-vents.name': '对称散热腰孔',
  'hole.rear-vents.desc': '后部左右对称各 3 条竖向散热腰孔（90°）',
} as const;

export type CatalogKey = keyof typeof zh;

export const en: Record<CatalogKey, string> = {
  'cat.corner_bracket.label': 'Cast corner bracket',
  'cat.corner_bracket.desc': 'Cast aluminium L-bracket · 30 series',
  'cat.1.46.110.label': 'Alu angle 25x40',
  'cat.1.46.110.desc': 'Aluminium · angle · Ø6.6',
  'cat.1.46.115.label': 'Alu angle 25x40',
  'cat.1.46.115.desc': 'Aluminium · angle · Ø8.7',
  'cat.1.46.120.label': 'Alu angle 25x40',
  'cat.1.46.120.desc': 'Aluminium · angle · M6',
  'cat.1.46.203.2028.1.label': 'PA angle 20x28',
  'cat.1.46.203.2028.1.desc': 'Nylon PA · grey',
  'cat.1.46.203.2028.2.label': 'PA angle 20x28',
  'cat.1.46.203.2028.2.desc': 'Nylon PA · black',
  'cat.1.46.203.3038.1.label': 'PA angle 30x38',
  'cat.1.46.203.3038.1.desc': 'Nylon PA · grey',
  'cat.1.46.203.3038.2.label': 'PA angle 30x38',
  'cat.1.46.203.3038.2.desc': 'Nylon PA · black',
  'cat.1.46.20536.label': 'Alu angle 48x48',
  'cat.1.46.20536.desc': 'Aluminium · angle · Ø6.6',
  'cat.1.46.20539.label': 'Alu angle 48x48',
  'cat.1.46.20539.desc': 'Aluminium · angle · Ø9.0',
  'cat.1.68.1.1.4030.X/01V.label': 'Steel gusset 40x40',
  'cat.1.68.1.1.4030.X/01V.desc': 'Steel · gusset',
  'cat.7.11.706.89/01.label': 'Steel gusset 47.5x47.5',
  'cat.7.11.706.89/01.desc': 'Steel · gusset',
  'cat.1.46.204.2828.2.label': 'GD-Zn angle 28x28',
  'cat.1.46.204.2828.2.desc': 'Zinc alloy · angle · powder-coated · triangular rib',
  'cat.1.46.204.2828A.label': 'Angle cover 28x28',
  'cat.1.46.204.2828A.desc': 'Corner cover · zinc alloy',

  'tex.oak.label': 'Oak',
  'tex.oak.note': 'Straight grain · tight rings, pores darken in the light',
  'tex.walnut.label': 'Walnut',
  'tex.walnut.note': 'Straight grain · dark, wide rings with strong contrast',
  'tex.plank.label': 'Oak plank',
  'tex.plank.note': 'Glued-up staves of varying width · the glue line is glossier than the wood',
  'tex.ply.label': 'Plywood',
  'tex.ply.note': 'Thin face veneer + a stack of plies on the edge · ply thickness is fixed in mm',

  'kit.corner-standard.name': 'Standard corner joint',
  'kit.corner-standard.desc':
    '2 × M6×10 button-head flange screws + 2 spring T-nuts (retrofit) + 1 angle cover, per bracket',
  'kit.corner-heavy.name': 'Reinforced corner joint',
  'kit.corner-heavy.desc':
    '4 × M6×12 low-head socket screws + 4 T-nuts per bracket, for load-bearing beams',
  'kit.corner-tapped.name': 'End-face tapped joint',
  'kit.corner-tapped.desc':
    '2 × M6×14 low-head socket screws per bracket, no nuts — the profile end face is tapped instead',
  'kit.corner-tapped.op.0': 'Tap the profile end face M6 × 15 deep (instead of a T-nut)',
  'kit.tabletop-fix.name': 'Tabletop fixing',
  'kit.tabletop-fix.desc':
    '4 × M5×16 countersunk socket screws per tabletop (with captive nuts) — BOM and routing only, never drawn',
  'kit.tabletop-fix.op.0': 'Drill Ø5 in the tabletop',
  'kit.tabletop-fix.op.1': 'Countersink Ø10',
  'kit.tabletop-fix.op.2': 'M5 captive nut / threaded insert in the tabletop edge',

  'fam.din912.label': 'Socket head cap screw',
  'fam.din912.short': 'cap',
  'fam.din7984.label': 'Low-head socket screw',
  'fam.din7984.short': 'low-head',
  'fam.countersunk.label': 'Countersunk socket screw',
  'fam.countersunk.short': 'countersunk',
  'fam.wn7381.label': 'Button-head flange screw',
  'fam.wn7381.short': 'flange',
  'fam.tnut.t_slot.short': 'plain',
  'fam.tnut.spring.short': 'spring',

  'name.screw': '{family} {size}×{length}',
  'name.tnut': 'T-nut {size} · {series} series · {family}',
  // Identity in this column, deliberately. The zh side is 盖板 + the catalog's
  // own foreign-language name; in English the catalog name already IS the
  // English kind + name, so a prefix turns 'Angle Cover 28x28' into 'Cover Angle
  // Cover 28x28'. Which is right depends on the catalog label, and the catalog
  // holds exactly one cover — `Cover <label>` is what it would read if that ever
  // stopped being true.
  'name.cover': '{label}',
  'name.bracketManual': 'Bracket-manual#{n}',
  'name.bracketAuto': 'Bracket-auto#{n}',
  'name.bracketAutoPair': 'Bracket-auto#{n}({side})',
  'name.bracketSnap': 'Bracket-{part}#{n}',
  'name.profile': 'Profile {size}',
  'name.uploadedBoard': 'Uploaded board',
  'name.uploadedBoardNote': 'Uploaded · the cropped square covers {mm} mm',

  'head.countersunk': 'head Ø{d}mm · countersunk (sits below the mounting face)',
  'head.plain': 'head Ø{d}mm · head height {h}mm',

  'fit.tooSmall': 'needs a profile ≥{min}mm (currently {cur}mm)',
  'fit.tooSmallBoard': 'needs a board ≥{w}×{d}mm (currently {curW}×{curD})',

  'hole.rear-cable.name': 'Rear cable run · classic',
  'hole.rear-cable.desc':
    'Cables gathered at the back: central 360×28 slot + Ø60 power/data holes in both corners',
  'hole.grommet-desk.name': 'Monitor grommet · power box',
  'hole.grommet-desk.desc':
    'Central Ø85 grommet + a 108×60 rounded power-box cut-out at the front centre',
  'hole.rear-vents.name': 'Symmetric vent slots',
  'hole.rear-vents.desc': 'Three vertical vent slots on each side at the rear (90°)',
};

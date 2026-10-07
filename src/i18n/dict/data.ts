// ---------------------------------------------------------------------------
// Area: names that arrive as DATA rather than as markup.
//
// Parameters, parts, templates and materials all cross the API boundary
// carrying a human-readable `name` field that the server wrote in one language.
// Those fields cannot be translated at the source, so the app keys off the
// STABLE id that travels beside them and looks the display name up here —
// the same trick `formatPartName` already used for snake_case part ids, now
// with both languages.
//
// Keys are `param.<id>`, `part.<id>`, `tpl.<id>.name` … The ids are the
// contract (they are what the backend and the mock agree on); the strings here
// are free to change.
// ---------------------------------------------------------------------------

export const zh = {
  // --- templates (`mockTemplates` / the backend's template list) ----------
  'tpl.basic-desk.name': '基础桌',
  'tpl.basic-desk.desc': '结构简单、稳固的桌子：铝型材框架配木质桌面。',
  'tpl.cross-beam-desk.name': '加强横梁桌',
  'tpl.cross-beam-desk.desc': '在前腿与后腿之间增加横梁的加强款。',
  'tpl.side-cross-desk.name': '侧加强横梁桌',
  'tpl.side-cross-desk.desc': '在左腿与右腿之间增加横梁的加强款。',
  'tpl.inset-desk.name': '内缩桌',
  'tpl.inset-desk.desc': '桌腿与框架自桌面边缘内缩 15% 的款式。',

  // --- parameters (`dimensionsToParameters` / the API's parameter list) ----
  'param.width': '桌面宽度',
  'param.depth': '桌面深度',
  'param.height': '桌面高度',
  'param.tabletop_thickness': '桌板厚度',

  // --- parts (snake_case ids — `formatPartName` and the mock's components) -
  'part.tabletop': '桌面',
  'part.leg_front_left': '左前腿',
  'part.leg_front_right': '右前腿',
  'part.leg_back_left': '左后腿',
  'part.leg_back_right': '右后腿',
  'part.beam_front': '前横梁',
  'part.beam_back': '后横梁',
  'part.beam_left': '左横梁',
  'part.beam_right': '右横梁',
  'part.cross_beam_front': '前加强横梁',
  'part.cross_beam_back': '后加强横梁',
  'part.cross_beam_left': '左加强横梁',
  'part.cross_beam_right': '右加强横梁',
  'part.bracket_corner_fl': '角铁-前左角',
  'part.bracket_corner_fr': '角铁-前右角',
  'part.bracket_corner_bl': '角铁-后左角',
  'part.bracket_corner_br': '角铁-后右角',
  'part.bracket_leg_fl_front': '角铁-左前腿-前',
  'part.bracket_leg_fl_left': '角铁-左前腿-左',
  'part.bracket_leg_fr_front': '角铁-右前腿-前',
  'part.bracket_leg_fr_right': '角铁-右前腿-右',
  'part.bracket_leg_bl_back': '角铁-左后腿-后',
  'part.bracket_leg_bl_left': '角铁-左后腿-左',
  'part.bracket_leg_br_back': '角铁-右后腿-后',
  'part.bracket_leg_br_right': '角铁-右后腿-右',

  // --- material ids (the API's material list, and the mock's) -------------
  'material.plywood': '多层板',
  'material.mdf': '中密度板',
  'material.oak': '橡木',
  'material.walnut': '黑胡桃',
  'material.aluminum': '铝',
  'material.steel': '钢',
  'material.brass': '黄铜',
  'material.zinc': '锌合金',
  'material.wood': '木质',
} as const;

export type DataKey = keyof typeof zh;

export const en: Record<DataKey, string> = {
  'tpl.basic-desk.name': 'Basic Desk',
  'tpl.basic-desk.desc': 'A simple, sturdy desk with an aluminium extrusion frame and a wood tabletop.',
  'tpl.cross-beam-desk.name': 'Cross-Beam Desk',
  'tpl.cross-beam-desk.desc': 'Reinforced desk with extra cross beams between the front and back legs.',
  'tpl.side-cross-desk.name': 'Side Cross Desk',
  'tpl.side-cross-desk.desc': 'Reinforced desk with cross beams between the left and right legs.',
  'tpl.inset-desk.name': 'Inset Desk',
  'tpl.inset-desk.desc': 'Legs and frame inset 15% from the tabletop edges.',

  'param.width': 'Tabletop width',
  'param.depth': 'Tabletop depth',
  'param.height': 'Tabletop height',
  'param.tabletop_thickness': 'Tabletop thickness',

  'part.tabletop': 'Tabletop',
  'part.leg_front_left': 'Front-left leg',
  'part.leg_front_right': 'Front-right leg',
  'part.leg_back_left': 'Back-left leg',
  'part.leg_back_right': 'Back-right leg',
  'part.beam_front': 'Front beam',
  'part.beam_back': 'Back beam',
  'part.beam_left': 'Left beam',
  'part.beam_right': 'Right beam',
  'part.cross_beam_front': 'Front cross beam',
  'part.cross_beam_back': 'Back cross beam',
  'part.cross_beam_left': 'Left cross beam',
  'part.cross_beam_right': 'Right cross beam',
  'part.bracket_corner_fl': 'Bracket · front-left',
  'part.bracket_corner_fr': 'Bracket · front-right',
  'part.bracket_corner_bl': 'Bracket · back-left',
  'part.bracket_corner_br': 'Bracket · back-right',
  'part.bracket_leg_fl_front': 'Bracket · front-left leg, front',
  'part.bracket_leg_fl_left': 'Bracket · front-left leg, left',
  'part.bracket_leg_fr_front': 'Bracket · front-right leg, front',
  'part.bracket_leg_fr_right': 'Bracket · front-right leg, right',
  'part.bracket_leg_bl_back': 'Bracket · back-left leg, back',
  'part.bracket_leg_bl_left': 'Bracket · back-left leg, left',
  'part.bracket_leg_br_back': 'Bracket · back-right leg, back',
  'part.bracket_leg_br_right': 'Bracket · back-right leg, right',

  'material.plywood': 'Plywood',
  'material.mdf': 'MDF',
  'material.oak': 'Oak',
  'material.walnut': 'Walnut',
  'material.aluminum': 'Aluminium',
  'material.steel': 'Steel',
  'material.brass': 'Brass',
  'material.zinc': 'Zinc alloy',
  'material.wood': 'Wood',
};

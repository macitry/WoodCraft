// ---------------------------------------------------------------------------
// Area: the customer page (`shop.html`) — the four-step guided configurator.
// Keys are prefixed `shop.`.
//
// The voice is different from the rest of the dictionary on purpose. Everywhere
// else the reader is whoever is building the furniture; here it is whoever is
// buying it, so nothing says "solver", "profile", or "BOM" — the words are the
// ones a customer would use, and where a number needs a scale it gets one.
// ---------------------------------------------------------------------------

export const zh = {
  // --- header / footer ----------------------------------------------------
  'shop.brand.tag': '定制你的家具',
  'shop.stepLabel': '第 {n} 步，共 {total} 步',
  'shop.step.style': '选款式',
  'shop.step.size': '定尺寸',
  'shop.step.preview': '看效果',
  'shop.step.bom': '要清单',
  'shop.next': '下一步',
  'shop.back': '上一步',
  'shop.foot.furniture': '家具',
  'shop.foot.size': '外形',
  'shop.foot.profile': '型材',
  'shop.foot.none': '未选择',

  // --- step 1: the catalogue ----------------------------------------------
  'shop.style.title': '先挑一件',
  'shop.style.lead':
    '每一件都可以改尺寸。选好之后，后面的每一步都只围绕它。',
  'shop.style.cardMeta': '{n} 项尺寸可调',
  'shop.style.select': '选它',
  'shop.style.selected': '已选择',
  'shop.style.empty': '暂时取不到家具目录。请确认后端已启动后重试。',
  'shop.style.retry': '重新获取',

  // --- step 2: dimensions -------------------------------------------------
  'shop.size.title': '定尺寸',
  'shop.size.lead':
    '拖动滑块或直接输入数值。每一件家具的尺寸范围由后端给出，不是这里写死的。',
  'shop.size.profile.title': '型材规格',
  'shop.size.profile.lead':
    '规格决定铝型材的截面大小，也决定腿和横梁的实际长度——换一个，模型会跟着变。',
  'shop.size.profile.sub': '{n} mm 截面',

  // --- step 3: the stage --------------------------------------------------
  'shop.preview.title': '看效果',
  'shop.preview.lead': '这是按你的选择实际生成的三维模型，不是示意图。',
  'shop.preview.building': '正在生成…',
  'shop.preview.buildingNote':
    '后端正在按你的尺寸建模，第一次生成会慢一些。完成后会自动出现在这里，不用停留在这个页面。',
  'shop.preview.failed': '生成失败',
  'shop.preview.failedNote':
    '后端没有给出模型。可能是服务没有启动，或者这次尺寸后端没能算出来。',
  'shop.preview.retry': '重试',
  'shop.preview.hint': '拖动旋转 · 滚轮缩放 · 右键平移',
  'shop.preview.ready': '已生成',
  'shop.preview.parts': '{n} 个零件',

  // --- step 4: the list ---------------------------------------------------
  'shop.bom.title': '清单',
  'shop.bom.lead': '这是上面这个模型实际用到的全部零件，可以直接发给加工方。',
  'shop.bom.col.name': '零件',
  'shop.bom.col.type': '类别',
  'shop.bom.col.material': '材料',
  'shop.bom.col.spec': '规格',
  'shop.bom.col.length': '长度',
  'shop.bom.col.qty': '数量',
  'shop.bom.col.mass': '重量',
  'shop.bom.col.price': '单价',
  'shop.bom.col.subtotal': '小计',
  'shop.bom.massTotal': '总重',
  'shop.bom.priceTotal': '合计',
  'shop.bom.pricePlaceholder':
    '价格一栏是占位的 0.00——后端目前不返回报价，所以导出文件里不含价格，只含零件本身。',
  'shop.bom.empty': '这个模型没有返回零件清单。',
  'shop.bom.loading': '正在取零件清单…',
  'shop.bom.failed': '没有取到零件清单。后端可能没有启动，或者这个模型已经被清理了。',
  'shop.bom.retry': '重新获取',
  'shop.bom.export.xlsx': '导出 Excel',
  'shop.bom.export.csv': '导出 CSV',
  'shop.bom.exportNote': '导出文件含零件、材料、规格、长度、数量与重量，不含价格。',

  // --- part types, as a customer would name them --------------------------
  'shop.partType.tabletop': '桌面',
  'shop.partType.leg': '支腿',
  'shop.partType.beam': '横梁',
  'shop.partType.other': '配件',

  // --- names that arrive from the server ----------------------------------
  // The catalogue, the parameter labels and the part names all come off the
  // wire in English, because that is the language the backend is written in.
  // These keys translate the ones we know about; anything not listed here falls
  // back to the server's own string, so a piece of furniture added on the
  // backend shows up here untranslated rather than missing.
  'shop.template.basic-desk.name': '基础书桌',
  'shop.template.basic-desk.desc': '铝型材框架配木桌板。最普通的一张桌子，也最能说明这套东西是怎么搭起来的。',
  'shop.template.standing-desk.name': '升降书桌',
  'shop.template.standing-desk.desc': '更高的那张。默认尺寸按站着用来定，腿更长，桌面也厚一些。',
  'shop.param.width': '宽度',
  'shop.param.depth': '深度',
  'shop.param.height': '高度',
  'shop.param.tabletop_thickness': '桌板厚度',
  'shop.part.tabletop': '桌面',
  'shop.part.leg_front_left': '左前腿',
  'shop.part.leg_front_right': '右前腿',
  'shop.part.leg_back_left': '左后腿',
  'shop.part.leg_back_right': '右后腿',
  'shop.part.beam_front': '前横梁',
  'shop.part.beam_back': '后横梁',
  'shop.part.beam_left': '左横梁',
  'shop.part.beam_right': '右横梁',
} as const;

export type ShopKey = keyof typeof zh;

export const en: Record<ShopKey, string> = {
  'shop.brand.tag': 'Build your furniture',
  'shop.stepLabel': 'Step {n} of {total}',
  'shop.step.style': 'Choose',
  'shop.step.size': 'Size',
  'shop.step.preview': 'Preview',
  'shop.step.bom': 'List',
  'shop.next': 'Next',
  'shop.back': 'Back',
  'shop.foot.furniture': 'Furniture',
  'shop.foot.size': 'Size',
  'shop.foot.profile': 'Frame',
  'shop.foot.none': 'Not chosen',

  'shop.style.title': 'Pick one to start',
  'shop.style.lead':
    'Every piece can be resized. Whatever you choose here is what the rest of the steps are about.',
  'shop.style.cardMeta': '{n} adjustable dimensions',
  'shop.style.select': 'Choose this',
  'shop.style.selected': 'Chosen',
  'shop.style.empty': 'The furniture catalogue is not reachable right now.',
  'shop.style.retry': 'Try again',

  'shop.size.title': 'Set the size',
  'shop.size.lead':
    'Drag a slider or type a number. Each piece states its own limits, and they come from the server rather than being fixed here.',
  'shop.size.profile.title': 'Frame size',
  'shop.size.profile.lead':
    'The frame section decides how thick the aluminium is, and with it how long the legs and rails actually come out — change it and the model changes.',
  'shop.size.profile.sub': '{n} mm section',

  'shop.preview.title': 'Take a look',
  'shop.preview.lead': 'This is the model built from your choices, not an illustration.',
  'shop.preview.building': 'Building…',
  'shop.preview.buildingNote':
    'The server is modelling your dimensions now. The first build takes a while; it will appear here on its own.',
  'shop.preview.failed': 'That did not build',
  'shop.preview.failedNote':
    'The server returned no model — either it is not running, or it could not work out these dimensions.',
  'shop.preview.retry': 'Try again',
  'shop.preview.hint': 'Drag to rotate · scroll to zoom · right-drag to pan',
  'shop.preview.ready': 'Ready',
  'shop.preview.parts': '{n} parts',

  'shop.bom.title': 'The list',
  'shop.bom.lead':
    'Every part the model above actually uses. This is what you send to whoever builds it.',
  'shop.bom.col.name': 'Part',
  'shop.bom.col.type': 'Kind',
  'shop.bom.col.material': 'Material',
  'shop.bom.col.spec': 'Section',
  'shop.bom.col.length': 'Length',
  'shop.bom.col.qty': 'Qty',
  'shop.bom.col.mass': 'Mass',
  'shop.bom.col.price': 'Unit price',
  'shop.bom.col.subtotal': 'Subtotal',
  'shop.bom.massTotal': 'Total mass',
  'shop.bom.priceTotal': 'Total',
  'shop.bom.pricePlaceholder':
    'The prices are a placeholder 0.00 — the server does not return a quote yet, so the exported file carries the parts but no prices.',
  'shop.bom.empty': 'The model came back with no parts.',
  'shop.bom.loading': 'Fetching the parts list…',
  'shop.bom.failed':
    'The parts list did not come back — the server may be down, or this model may already have been cleared away.',
  'shop.bom.retry': 'Try again',
  'shop.bom.export.xlsx': 'Export Excel',
  'shop.bom.export.csv': 'Export CSV',
  'shop.bom.exportNote':
    'The file carries part, material, section, length, quantity and mass. No prices.',

  'shop.partType.tabletop': 'Tabletop',
  'shop.partType.leg': 'Leg',
  'shop.partType.beam': 'Rail',
  'shop.partType.other': 'Fitting',

  'shop.template.basic-desk.name': 'Basic desk',
  'shop.template.basic-desk.desc':
    'An aluminium frame under a wooden top. The plainest desk there is, and the clearest illustration of how one goes together.',
  'shop.template.standing-desk.name': 'Standing desk',
  'shop.template.standing-desk.desc':
    'The taller one. Its default dimensions are set for standing, with longer legs and a thicker top.',
  'shop.param.width': 'Width',
  'shop.param.depth': 'Depth',
  'shop.param.height': 'Height',
  'shop.param.tabletop_thickness': 'Top thickness',
  'shop.part.tabletop': 'Tabletop',
  'shop.part.leg_front_left': 'Front left leg',
  'shop.part.leg_front_right': 'Front right leg',
  'shop.part.leg_back_left': 'Back left leg',
  'shop.part.leg_back_right': 'Back right leg',
  'shop.part.beam_front': 'Front rail',
  'shop.part.beam_back': 'Back rail',
  'shop.part.beam_left': 'Left rail',
  'shop.part.beam_right': 'Right rail',
};

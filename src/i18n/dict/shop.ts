// ---------------------------------------------------------------------------
// Area: the customer page (`shop.html`) — the three-step guided configurator.
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
  // Not 「定尺寸」 any more: this step also fixes the frame section and the
  // tabletop board, and a name that promised only numbers was the one label on
  // the page the contents disagreed with.
  'shop.step.size': '定规格',
  'shop.step.bom': '要清单',
  'shop.next': '下一步',
  'shop.back': '上一步',
  'shop.foot.furniture': '家具',
  'shop.foot.size': '外形',
  'shop.foot.profile': '型材',
  'shop.foot.board': '桌面材料',
  'shop.foot.none': '未选择',

  // --- step 1: the catalogue ----------------------------------------------
  'shop.style.title': '先挑一件',
  'shop.style.lead':
    '每一件都可以改尺寸。点一张卡片，右边就会显示它；选好之后再按「下一步」。',
  'shop.style.cardMeta': '{n} 项尺寸可调',
  'shop.style.select': '选它',
  'shop.style.selected': '已选择',
  'shop.style.empty': '暂时取不到家具目录。请确认后端已启动后重试。',
  'shop.style.retry': '重新获取',

  // --- step 2: size, section and board ------------------------------------
  'shop.size.title': '尺寸和材料',
  'shop.size.lead':
    '拖动滑块或直接输入数值。尺寸范围由后端给出；型材和桌面材料由你挑，右边的模型会跟着变。',
  'shop.size.profile.title': '型材规格',
  'shop.size.profile.lead':
    '规格决定铝型材的截面大小，也决定腿和横梁的实际长度——换一个，模型会跟着变。',
  'shop.size.profile.sub': '{n} mm 截面',
  'shop.size.board.title': '桌面材料',
  'shop.size.board.lead':
    '桌面是整张桌子唯一的木板。选一种，右边的桌面会立刻换上这种木纹，清单和导出也会按它写材料。',

  // --- the right-hand view ------------------------------------------------
  // It used to be a step of its own. It is a pane now, and these keys are the
  // only place the page says what kind of picture the customer is looking at:
  // a stand-in that follows the sliders, or the real thing.
  'shop.view.empty': '选一件家具，它的样子会出现在这里。',
  'shop.view.solving': '正在按默认尺寸画出它……',
  'shop.view.live': '示意图 · 跟着尺寸变',
  'shop.view.building': '正在生成精细模型…',
  'shop.view.buildingNote':
    '后端正在按这个尺寸建模，第一次会慢一些。左边可以继续改，改完这里会重新来一次。',
  'shop.view.ready': '精细模型',
  'shop.view.failed': '精细模型没生成出来',
  'shop.view.failedNote':
    '后端没能按这个尺寸把模型建出来。换一下尺寸，或者点重试；示意几何还能照常看。',
  'shop.view.retry': '重试',
  'shop.view.stlFailed':
    '这个模型的文件暂时取不到——可能已经被清理掉了。改一下尺寸，或者稍后再试。',
  'shop.view.hint': '拖动旋转 · 滚轮缩放 · 右键平移',
  'shop.view.parts': '{n} 个零件',

  // --- step 3: the list ---------------------------------------------------
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
  // 导出图片 = 右边模型的画面 + 同一份零件清单，合成一张图。
  'shop.bom.export.png': '导出图片',
  'shop.bom.imageName': '零件清单图',
  'shop.bom.imageNoPrice': '价格未包含',
  'shop.bom.imageFailed': '这个浏览器没能把模型存成图片，请稍后再试。',
  'shop.bom.exportNote':
    '清单文件含零件、材料、规格、长度、数量与重量，不含价格；图片把模型和同一份清单画在一起。',

  // --- part types, as a customer would name them --------------------------
  'shop.partType.tabletop': '桌面',
  'shop.partType.leg': '支腿',
  'shop.partType.beam': '横梁',
  'shop.partType.cross_beam': '加强横梁',
  'shop.partType.bracket': '角码',
  'shop.partType.hardware': '紧固件',
  'shop.partType.other': '配件',

  // --- names that arrive from the server ----------------------------------
  // The catalogue, the parameter labels and the part names all come off the
  // wire in English, because that is the language the backend is written in.
  // These keys translate the ones we know about; anything not listed here falls
  // back to the server's own string, so a piece of furniture added on the
  // backend shows up here untranslated rather than missing.
  'shop.template.basic-desk.name': '基础书桌',
  'shop.template.basic-desk.desc': '铝型材框架配木桌板。最普通的一张桌子，也最能说明这套东西是怎么搭起来的。',
  'shop.template.cross-beam-desk.name': '加强横梁桌',
  'shop.template.cross-beam-desk.desc': '前后两对腿之间多加两根横梁。桌子要放重东西、或者你常趴在边上画图，就选这张。',
  'shop.template.side-cross-desk.name': '侧加强横梁桌',
  'shop.template.side-cross-desk.desc': '加强横梁放在左右两侧。桌子窄而深、主要靠两侧受力时，这个方向更管用。',
  'shop.template.inset-desk.name': '内缩桌',
  'shop.template.inset-desk.desc': '框架往桌板里面收，四面都留出悬边。腿不顶脚，看着也轻一些。',
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
  'shop.part.cross_beam_front': '前加强横梁',
  'shop.part.cross_beam_back': '后加强横梁',
  'shop.part.cross_beam_left': '左加强横梁',
  'shop.part.cross_beam_right': '右加强横梁',
} as const;

export type ShopKey = keyof typeof zh;

export const en: Record<ShopKey, string> = {
  'shop.brand.tag': 'Build your furniture',
  'shop.stepLabel': 'Step {n} of {total}',
  'shop.step.style': 'Choose',
  'shop.step.size': 'Specify',
  'shop.step.bom': 'List',
  'shop.next': 'Next',
  'shop.back': 'Back',
  'shop.foot.furniture': 'Furniture',
  'shop.foot.size': 'Size',
  'shop.foot.profile': 'Frame',
  'shop.foot.board': 'Board',
  'shop.foot.none': 'Not chosen',

  'shop.style.title': 'Pick one to start',
  'shop.style.lead':
    'Every piece can be resized. Click a card to see it on the right; carry on with «Next» when you are ready.',
  'shop.style.cardMeta': '{n} adjustable dimensions',
  'shop.style.select': 'Choose this',
  'shop.style.selected': 'Chosen',
  'shop.style.empty': 'The furniture catalogue is not reachable right now.',
  'shop.style.retry': 'Try again',

  'shop.size.title': 'Size and materials',
  'shop.size.lead':
    'Drag a slider or type a number. The limits come from the server; the frame section and the board are yours to pick, and the model on the right follows.',
  'shop.size.profile.title': 'Frame section',
  'shop.size.profile.lead':
    'The section decides how thick the aluminium is, and with it how long the legs and rails actually come out — change it and the model changes.',
  'shop.size.profile.sub': '{n} mm section',
  'shop.size.board.title': 'Tabletop board',
  'shop.size.board.lead':
    'The top is the only board on the desk. Pick one and the tabletop in the model changes at once; the list and the export name the same material.',

  'shop.view.empty': 'Pick a piece and it will appear here.',
  'shop.view.solving': 'Drawing it at the default size…',
  'shop.view.live': 'Stand-in · follows your size',
  'shop.view.building': 'Building the detailed model…',
  'shop.view.buildingNote':
    'The server is modelling this size now, and the first one takes a while. Carry on changing things on the left — it will start again when you stop.',
  'shop.view.ready': 'Detailed model',
  'shop.view.failed': 'The detailed model did not come out',
  'shop.view.failedNote':
    'The server could not build this size. Change a dimension, or try again — the stand-in still works as usual.',
  'shop.view.retry': 'Try again',
  'shop.view.stlFailed':
    'This model\'s files cannot be fetched right now — they may have been cleared away. Change a dimension, or try again later.',
  'shop.view.hint': 'Drag to rotate · scroll to zoom · right-drag to pan',
  'shop.view.parts': '{n} parts',

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
  'shop.bom.export.png': 'Export image',
  'shop.bom.imageName': 'parts sheet',
  'shop.bom.imageNoPrice': 'No prices',
  'shop.bom.imageFailed': 'This browser could not save the model as an image. Please try again.',
  'shop.bom.exportNote':
    'The parts file carries part, material, section, length, quantity and mass — no prices. The image puts the model and the same list on one sheet.',

  'shop.partType.tabletop': 'Tabletop',
  'shop.partType.leg': 'Leg',
  'shop.partType.beam': 'Rail',
  'shop.partType.cross_beam': 'Cross rail',
  'shop.partType.bracket': 'Corner bracket',
  'shop.partType.hardware': 'Fastener',
  'shop.partType.other': 'Fitting',

  'shop.template.basic-desk.name': 'Basic desk',
  'shop.template.basic-desk.desc':
    'An aluminium frame under a wooden top. The plainest desk there is, and the clearest illustration of how one goes together.',
  'shop.template.cross-beam-desk.name': 'Cross-beam desk',
  'shop.template.cross-beam-desk.desc':
    'Two extra rails between the front and back legs. Pick this one if the desk carries weight, or if you lean on the edge.',
  'shop.template.side-cross-desk.name': 'Side cross desk',
  'shop.template.side-cross-desk.desc':
    'The extra rails run between the left and right legs — the stiffer direction on a deep, narrow desk.',
  'shop.template.inset-desk.name': 'Inset desk',
  'shop.template.inset-desk.desc':
    'The frame sits in from the edges, so the top overhangs on all four sides. The desk reads lighter, and the legs stay out of your way.',
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
  'shop.part.cross_beam_front': 'Front cross rail',
  'shop.part.cross_beam_back': 'Back cross rail',
  'shop.part.cross_beam_left': 'Left cross rail',
  'shop.part.cross_beam_right': 'Right cross rail',
};

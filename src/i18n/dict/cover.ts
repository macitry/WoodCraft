// ---------------------------------------------------------------------------
// Area: the cover site (`cover.html`) — the page the product is shown to the
// outside world on.
//
// Keys are prefixed `cover.`. The voice is neither the editor's nor the
// customer wizard's: this page has to say what WoodCraft IS in a few lines
// before a stranger has any reason to click. Concrete nouns, real numbers,
// no adjectives that a furniture catalogue could also use.
//
// The page also borrows a handful of `shop.bom.col.*`, `shop.partType.*` and
// `tex.*` keys for the sample parts sheet, deliberately: those strings already
// exist in both languages and a second copy would be a second thing to keep in
// step.
// ---------------------------------------------------------------------------

export const zh = {
  // --- navigation ---------------------------------------------------------
  'cover.nav.idea': '理念',
  'cover.nav.process': '工序',
  'cover.nav.materials': '材料',
  'cover.nav.delivery': '交付',
  'cover.nav.start': '开始定制',
  'cover.nav.editor': '打开设计器',
  'cover.menu.open': '打开菜单',
  'cover.menu.close': '关闭菜单',
  'cover.menu.label': '导航',

  // --- hero ---------------------------------------------------------------
  'cover.hero.eyebrow': '参数化家具 · 铝与木',
  'cover.hero.line1': '不是挑一张桌子，',
  'cover.hero.line2': '是造一张。',
  'cover.hero.sub':
    '铝型材的骨架，实木的桌面。选款式、定规格、导出可直接下料的零件清单——从想法到图纸，三步。',
  'cover.hero.scroll': '向下',
  'cover.hero.stat.pieces': '款家具',
  'cover.hero.stat.sections': '种型材',
  'cover.hero.stat.steps': '步完成',
  'cover.hero.note1': '30 × 30 mm · 阳极氧化铝',
  'cover.hero.note2': '18 mm · 黑胡桃',

  // --- idea ---------------------------------------------------------------
  'cover.idea.eyebrow': '理念',
  'cover.idea.line1': '家具不该由库存决定尺寸。',
  'cover.idea.line2': '应该由房间决定。',
  'cover.idea.body':
    'WoodCraft 用一套参数化模型，把铝型材、木桌板和连接件算成一件家具。改一个数字，所有零件跟着重算——长度、位置、数量、重量。你看到的就是能加工的那一份。',
  'cover.idea.note': '实时求解 · 毫米为单位',

  // --- process ------------------------------------------------------------
  'cover.process.eyebrow': '工序',
  'cover.process.title': '三步，从想法到清单。',
  'cover.process.s1.title': '挑一件',
  'cover.process.s1.body': '四款基础结构，都是同一套铝型材语言。选一个起点。',
  'cover.process.s1.tag': '款式',
  'cover.process.s2.title': '定规格',
  'cover.process.s2.body': '宽度、深度、高度、板厚，加上型材截面和桌面木料。模型实时跟着变。',
  'cover.process.s2.tag': '尺寸 · 材料',
  'cover.process.s3.title': '要清单',
  'cover.process.s3.body':
    '每个零件的材料、规格、长度、数量和重量，导出 Excel、CSV，或一张带模型的清单图。',
  'cover.process.s3.tag': '清单 · 导出',

  // --- materials ----------------------------------------------------------
  'cover.materials.eyebrow': '材料',
  'cover.materials.title': '一块桌面，四种木。',
  'cover.materials.body':
    '木纹是烘焙出来的真实贴图，不是颜色。选哪一种，模型、清单和导出会一起换。',
  'cover.metal.title': '骨架，三种截面。',
  'cover.metal.body':
    '2020 / 3030 / 4040 三种铝型材，共用一套角码与槽位。截面越大，能承受的跨度和重量越大。',
  'cover.metal.section': '{n} mm 截面',

  // --- delivery -----------------------------------------------------------
  'cover.delivery.eyebrow': '交付',
  'cover.delivery.title1': '不是一张效果图。',
  'cover.delivery.title2': '是一份能下料的清单。',
  'cover.delivery.body':
    '清单里的每一行，都是模型里真实存在的零件。没有装饰性的数字，也没有要你自己换算的长度。',
  'cover.delivery.f1.title': '零件清单',
  'cover.delivery.f1.body': '每个零件的材料、规格、长度、数量与重量。九列，一屏看完。',
  'cover.delivery.f2.title': '三种导出',
  'cover.delivery.f2.body': 'Excel、CSV，或一张把模型和清单画在一起的图片。',
  'cover.delivery.f3.title': '可转的模型',
  'cover.delivery.f3.body': '每个零件带真实位姿和截面，屏幕上转一圈，再进 CAD。',

  // --- the sample parts sheet --------------------------------------------
  'cover.sample.label': '示例清单',
  'cover.sample.spec': '1200 × 600 × 750 · 3030 · 橡木',
  'cover.sample.legs': '支腿',
  'cover.sample.rails': '横梁',
  'cover.sample.sideRails': '侧横梁',
  'cover.sample.mat.alu': '铝 6063',
  'cover.sample.mat.diecast': '压铸铝',
  'cover.sample.mat.steel': '钢',
  'cover.sample.total': '总重',
  'cover.sample.export': '导出',
  'cover.sample.note': '示例数据，输出以实际模型为准。',

  // --- closing call -------------------------------------------------------
  'cover.cta.eyebrow': '开始',
  'cover.cta.title': '从一张桌子开始。',
  'cover.cta.body': '不用注册。选一个款式，改一个数字，看看它会变成什么。',

  // --- footer -------------------------------------------------------------
  'cover.footer.tagline': '铝与木，按毫米。',
  'cover.footer.product': '产品',
  'cover.footer.explore': '了解',
  'cover.footer.note': '参数化家具 · 实时求解 · 可加工清单',
  'cover.footer.built': '以毫米为单位构建。',
  'cover.footer.rights': '保留所有权利。',
} as const;

export type CoverKey = keyof typeof zh;

export const en: Record<CoverKey, string> = {
  'cover.nav.idea': 'Idea',
  'cover.nav.process': 'Process',
  'cover.nav.materials': 'Materials',
  'cover.nav.delivery': 'Delivery',
  'cover.nav.start': 'Start building',
  'cover.nav.editor': 'Open the editor',
  'cover.menu.open': 'Open menu',
  'cover.menu.close': 'Close menu',
  'cover.menu.label': 'Navigation',

  'cover.hero.eyebrow': 'Parametric furniture · aluminium & wood',
  'cover.hero.line1': 'Not a desk you pick.',
  'cover.hero.line2': 'A desk you build.',
  'cover.hero.sub':
    'An aluminium frame under a solid-wood top. Choose a piece, set its dimensions, and export a parts list you can take straight to the workshop — three steps from idea to drawing.',
  'cover.hero.scroll': 'Scroll',
  'cover.hero.stat.pieces': 'pieces',
  'cover.hero.stat.sections': 'sections',
  'cover.hero.stat.steps': 'steps',
  'cover.hero.note1': '30 × 30 mm · anodised aluminium',
  'cover.hero.note2': '18 mm · walnut',

  'cover.idea.eyebrow': 'Idea',
  'cover.idea.line1': 'Furniture shouldn’t be sized by what’s in stock.',
  'cover.idea.line2': 'It should be sized by the room.',
  'cover.idea.body':
    'WoodCraft turns aluminium extrusions, a wooden top and a handful of joints into one parametric model. Change a number and every part recalculates — length, position, quantity, mass. What you see is what gets made.',
  'cover.idea.note': 'Solved live · in millimetres',

  'cover.process.eyebrow': 'Process',
  'cover.process.title': 'Three steps, idea to list.',
  'cover.process.s1.title': 'Choose',
  'cover.process.s1.body': 'Four base structures, one aluminium language. Pick a starting point.',
  'cover.process.s1.tag': 'Piece',
  'cover.process.s2.title': 'Specify',
  'cover.process.s2.body':
    'Width, depth, height, top thickness, plus frame section and board. The model follows live.',
  'cover.process.s2.tag': 'Size · material',
  'cover.process.s3.title': 'Take the list',
  'cover.process.s3.body':
    'Material, section, length, quantity and mass for every part — as Excel, CSV, or a parts sheet with the model on it.',
  'cover.process.s3.tag': 'List · export',

  'cover.materials.eyebrow': 'Materials',
  'cover.materials.title': 'One top, four woods.',
  'cover.materials.body':
    'The grain is a baked photograph, not a tint. Pick one and the model, the list and the export all change together.',
  'cover.metal.title': 'A frame in three sections.',
  'cover.metal.body':
    'Three extrusions — 2020, 3030 and 4040 — sharing one joint system. The larger the section, the longer the span and the more it carries.',
  'cover.metal.section': '{n} mm section',

  'cover.delivery.eyebrow': 'Delivery',
  'cover.delivery.title1': 'Not a render.',
  'cover.delivery.title2': 'A list you can build from.',
  'cover.delivery.body':
    'Every row is a part that exists in the model. No decorative numbers, no lengths for you to work out yourself.',
  'cover.delivery.f1.title': 'Parts list',
  'cover.delivery.f1.body':
    'Material, section, length, quantity and mass for every part — nine columns, one screen.',
  'cover.delivery.f2.title': 'Three exports',
  'cover.delivery.f2.body': 'Excel, CSV, or one image with the model and the list together.',
  'cover.delivery.f3.title': 'A model you can turn',
  'cover.delivery.f3.body':
    'Every part with its true pose and section. Turn it on screen, then take it into CAD.',

  'cover.sample.label': 'Sample list',
  'cover.sample.spec': '1200 × 600 × 750 · 3030 · oak',
  'cover.sample.legs': 'Legs',
  'cover.sample.rails': 'Rails',
  'cover.sample.sideRails': 'Side rails',
  'cover.sample.mat.alu': 'Aluminium 6063',
  'cover.sample.mat.diecast': 'Die-cast aluminium',
  'cover.sample.mat.steel': 'Steel',
  'cover.sample.total': 'Total mass',
  'cover.sample.export': 'Export',
  'cover.sample.note': 'Sample data; the export follows the actual model.',

  'cover.cta.eyebrow': 'Begin',
  'cover.cta.title': 'Start with a desk.',
  'cover.cta.body': 'No account. Pick a piece, move a number, see what it becomes.',

  'cover.footer.tagline': 'Aluminium and wood, to the millimetre.',
  'cover.footer.product': 'Product',
  'cover.footer.explore': 'Explore',
  'cover.footer.note': 'Parametric furniture · solved live · machinable parts',
  'cover.footer.built': 'Built in millimetres.',
  'cover.footer.rights': 'All rights reserved.',
};

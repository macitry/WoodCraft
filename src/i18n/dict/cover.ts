// ---------------------------------------------------------------------------
// Area: the cover site (`cover.html`) — the page the product is shown to the
// outside world on.
//
// Keys are prefixed `cover.`. The voice is neither the editor's nor the
// customer wizard's: this page has to say what WoodCraft IS in a few lines
// before a stranger has any reason to click. Concrete nouns, real numbers,
// no adjectives that a furniture catalogue could also use.
//
// Every claim here has to be checkable against the product: the sample list is
// solver output, the width control recalculates it, and the downloads are real
// files. If a sentence needs an asterisk, it belongs in the shop, not here.
//
// The page also borrows a handful of `shop.bom.col.*`, `shop.partType.*` and
// `tex.*` keys for the sample parts sheet, deliberately: those strings already
// exist in both languages and a second copy would be a second thing to keep in
// step.
// ---------------------------------------------------------------------------

export const zh = {
  // --- navigation ---------------------------------------------------------
  'cover.nav.delivery': '清单',
  'cover.nav.process': '工序',
  'cover.nav.materials': '材料',
  'cover.nav.start': '开始定制',
  'cover.nav.editor': '打开设计器',
  'cover.menu.open': '打开菜单',
  'cover.menu.close': '关闭菜单',
  'cover.menu.label': '导航',

  // --- hero ---------------------------------------------------------------
  'cover.hero.eyebrow': '参数化家具 · 铝与木',
  'cover.hero.line1': '不是挑一张桌子，',
  'cover.hero.line2': '是造一张。',
  'cover.hero.sub': '说一个尺寸。桌面、桌架和每一根型材的下料长度，一起算好。',
  'cover.hero.scroll': '向下',
  'cover.hero.width': '宽度',
  'cover.hero.widthHint': '改宽度，下面的清单跟着重算。',
  'cover.hero.note1': '30 × 30 mm · 阳极氧化铝',
  'cover.hero.note2': '18 mm · 橡木',

  // --- manifesto ----------------------------------------------------------
  // Split where the sentence may break on a phone. The two halves are inline
  // on desktop (so the line reads as one) and the second becomes a block at
  // the narrow breakpoint, which keeps 「库存」 together instead of letting the
  // browser split the word after 「库」.
  'cover.idea.line1a': '家具不该由库存',
  'cover.idea.line1b': '决定尺寸。',
  'cover.idea.line2': '应该由房间决定。',

  // --- process ------------------------------------------------------------
  'cover.process.eyebrow': '工序',
  'cover.process.title': '三步，从想法到清单。',
  'cover.process.s1.title': '挑一件',
  'cover.process.s1.body': '四款基础结构，都是同一套铝型材语言。选一个起点。',
  'cover.process.s2.title': '定规格',
  'cover.process.s2.body':
    '宽度、深度、高度、板厚，加上 2020 / 3030 / 4040 型材截面和桌面木料。模型实时跟着变。',
  'cover.process.s3.title': '要清单',
  'cover.process.s3.body':
    '每个零件的材料、规格、长度、数量和重量，导出 Excel、CSV，或一张带模型的清单图。',

  // --- materials ----------------------------------------------------------
  'cover.materials.eyebrow': '材料',
  'cover.materials.title': '一块桌面，四种木。',
  'cover.materials.body':
    '木纹是烘焙出来的真实贴图，不是颜色。选哪一种，模型、清单和导出会一起换。',

  // --- delivery -----------------------------------------------------------
  'cover.delivery.eyebrow': '清单',
  'cover.delivery.title1': '不是一张效果图。',
  'cover.delivery.title2': '是一份能下料的清单。',
  'cover.delivery.body':
    '清单里的每一行，都是模型里真实存在的零件。没有装饰性的数字，也没有要你自己换算的长度。',

  // --- the sample parts sheet --------------------------------------------
  'cover.sample.label': '示例清单',
  'cover.sample.spec': '{w} × 600 × 750 · 3030 · 橡木',
  'cover.sample.legs': '支腿',
  'cover.sample.rails': '横梁',
  'cover.sample.sideRails': '侧横梁',
  'cover.sample.mat.alu': '铝 6063',
  'cover.sample.total': '总重',
  'cover.sample.export': '下载',
  'cover.sample.note': '数据来自求解器；换成你的尺寸时，导出会重新计算。',

  // --- closing call -------------------------------------------------------
  'cover.cta.eyebrow': '开始',
  'cover.cta.title': '从一张桌子开始。',
  'cover.cta.body': '不用注册。说一个尺寸，拿走一份能下料的清单。',

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
  'cover.nav.delivery': 'The list',
  'cover.nav.process': 'Process',
  'cover.nav.materials': 'Materials',
  'cover.nav.start': 'Start building',
  'cover.nav.editor': 'Open the editor',
  'cover.menu.open': 'Open menu',
  'cover.menu.close': 'Close menu',
  'cover.menu.label': 'Navigation',

  'cover.hero.eyebrow': 'Parametric furniture · aluminium & wood',
  'cover.hero.line1': 'Not a desk you pick.',
  'cover.hero.line2': 'A desk you build.',
  'cover.hero.sub':
    'Say a size. The top, the frame and every cut length are solved together.',
  'cover.hero.scroll': 'Scroll',
  'cover.hero.width': 'Width',
  'cover.hero.widthHint': 'Change the width; the list below recalculates.',
  'cover.hero.note1': '30 × 30 mm · anodised aluminium',
  'cover.hero.note2': '18 mm · oak',

  // Trailing space: the halves are inline on desktop, so this is the point
  // the sentence can break without concatenating two words.
  'cover.idea.line1a': 'Furniture shouldn’t be sized ',
  'cover.idea.line1b': 'by what’s in stock.',
  'cover.idea.line2': 'It should be sized by the room.',

  'cover.process.eyebrow': 'Process',
  'cover.process.title': 'Three steps, idea to list.',
  'cover.process.s1.title': 'Choose',
  'cover.process.s1.body': 'Four base structures, one aluminium language. Pick a starting point.',
  'cover.process.s2.title': 'Specify',
  'cover.process.s2.body':
    'Width, depth, height, top thickness, plus 2020 / 3030 / 4040 sections and the board. The model follows live.',
  'cover.process.s3.title': 'Take the list',
  'cover.process.s3.body':
    'Material, section, length, quantity and mass for every part — as Excel, CSV, or a parts sheet with the model on it.',

  'cover.materials.eyebrow': 'Materials',
  'cover.materials.title': 'One top, four woods.',
  'cover.materials.body':
    'The grain is a baked photograph, not a tint. Pick one and the model, the list and the export all change together.',

  'cover.delivery.eyebrow': 'The list',
  'cover.delivery.title1': 'Not a render.',
  'cover.delivery.title2': 'A list you can build from.',
  'cover.delivery.body':
    'Every row is a part that exists in the model. No decorative numbers, no lengths for you to work out yourself.',

  'cover.sample.label': 'Sample list',
  'cover.sample.spec': '{w} × 600 × 750 · 3030 · oak',
  'cover.sample.legs': 'Legs',
  'cover.sample.rails': 'Rails',
  'cover.sample.sideRails': 'Side rails',
  'cover.sample.mat.alu': 'Aluminium 6063',
  'cover.sample.total': 'Total mass',
  'cover.sample.export': 'Download',
  'cover.sample.note': 'Solver output; your own export recalculates to your dimensions.',

  'cover.cta.eyebrow': 'Begin',
  'cover.cta.title': 'Start with a desk.',
  'cover.cta.body': 'No account. Say a size, take a list you can build from.',

  'cover.footer.tagline': 'Aluminium and wood, to the millimetre.',
  'cover.footer.product': 'Product',
  'cover.footer.explore': 'Explore',
  'cover.footer.note': 'Parametric furniture · solved live · machinable parts',
  'cover.footer.built': 'Built in millimetres.',
  'cover.footer.rights': 'All rights reserved.',
};

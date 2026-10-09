// ---------------------------------------------------------------------------
// Shared vocabulary. Chinese is the source of truth for the KEY SET — `en` is
// typed against it, so a key added here and forgotten there is a compile error
// rather than a string that silently falls back to its own name.
//
// Keys are flat and dotted (`home.crossBeamHeight`) rather than nested objects:
// a nested tree buys autocomplete nobody needs at this size, and costs a
// template-literal type to walk it. The prefix records which AREA FILE owns the
// key, so two areas cannot collide.
// ---------------------------------------------------------------------------

export const zh = {
  // --- the switch itself -------------------------------------------------
  'lang.label': '语言',
  'lang.switchTo': '切换到{name}',
  'lang.zh': '中文',
  'lang.en': 'English',

  // --- generic actions ---------------------------------------------------
  'common.add': '添加',
  'common.delete': '删除',
  'common.duplicate': '复制',
  'common.close': '关闭',
  'common.cancel': '取消',
  'common.reset': '重置',
  'common.resetAll': '恢复默认',
  'common.undo': '撤销',
  'common.redo': '重做',
  'common.hide': '隐藏',
  'common.show': '显示',
  'common.restoreAll': '全部恢复',
  'common.showOnlyThis': '只看这一个',
  'common.none': '无',
  'common.unknown': '未知',
  'common.custom': '手动',
  'common.default': '默认',
  'common.yes': '是',
  'common.no': '否',
  'common.copy': '复制',
  'common.done': '完成',
  'common.tweaked': '已微调',
  'common.hidden': '已隐藏',
  'common.loading': '加载中…',
  'common.noModel': '尚未加载模型。',

  // --- units (suffixes only; `mm`/`°`/`m` themselves are never translated) -
  'unit.mm': 'mm',
  'unit.deg': '°',
  'unit.count': '{n} 件',
  'unit.pieces': '{n} 件',
  'unit.rows': '共 {n} 行',

  // --- navigation / page chrome -----------------------------------------
  'nav.home': '首页',
  'nav.configurator': '配置器',
  'nav.diy': '自由搭建',
  'nav.kits': '组合',
  'nav.backHome': '← 首页',
  'nav.components': '零件',
  'nav.settings': '设置',

  // --- view presets (shared by every page with a camera) -----------------
  'view.front': '正视',
  'view.top': '俯视',
  'view.side': '侧视',
  'view.perspective': '轴测',
  'view.3d': '3D',
  'view.plan': '平面图',
  'view.orbitHint': '拖动旋转 · 滚轮缩放 · 右键平移',

  // --- scenes (the main viewer's room picker) ----------------------------
  'scene.label': '场景',
  'scene.hint': '把这件家具放进不同的房间里看',
  'scene.off': '关',
  'scene.offNote': '不显示房间，回到原始视图',
  'scene.bedroom': '卧室',
  'scene.bedroomNote': '夜晚的卧室，床头一盏暖灯，桌子还是原来的样子',
  'scene.daylight': '日间',
  'scene.daylightNote': '明亮的白天房间，木地板，带陈设',
  'scene.studio': '影棚',
  'scene.studioNote': '无缝白背景，像产品图',
  'scene.workshop': '工坊',
  'scene.workshopNote': '水泥地车间，顶灯偏冷，落地灯常亮',
} as const;

export type CommonKey = keyof typeof zh;

export const en: Record<CommonKey, string> = {
  'lang.label': 'Language',
  'lang.switchTo': 'Switch to {name}',
  'lang.zh': '中文',
  'lang.en': 'English',

  'common.add': 'Add',
  'common.delete': 'Delete',
  'common.duplicate': 'Duplicate',
  'common.close': 'Close',
  'common.cancel': 'Cancel',
  'common.reset': 'Reset',
  'common.resetAll': 'Reset all',
  'common.undo': 'Undo',
  'common.redo': 'Redo',
  'common.hide': 'Hide',
  'common.show': 'Show',
  'common.restoreAll': 'Restore all',
  'common.showOnlyThis': 'Show only this',
  'common.none': 'None',
  'common.unknown': 'Unknown',
  'common.custom': 'Manual',
  'common.default': 'Default',
  'common.yes': 'Yes',
  'common.no': 'No',
  'common.copy': 'Copy',
  'common.done': 'Done',
  'common.tweaked': 'Edited',
  'common.hidden': 'Hidden',
  'common.loading': 'Loading…',
  'common.noModel': 'No model loaded.',

  'unit.mm': 'mm',
  'unit.deg': '°',
  'unit.count': '{n} pcs',
  'unit.pieces': '{n} pcs',
  'unit.rows': '{n} rows',

  'nav.home': 'Home',
  'nav.configurator': 'Configurator',
  'nav.diy': 'DIY Builder',
  'nav.kits': 'Kits',
  'nav.backHome': '← Home',
  'nav.components': 'Components',
  'nav.settings': 'Settings',

  'view.front': 'Front',
  'view.top': 'Top',
  'view.side': 'Side',
  // 'Isometric', not '3D': these four sit in a row of camera presets, and the
  // view-mode toggle right beside them already says 3D. Two buttons labelled 3D,
  // one switching the camera and one switching the whole view, is a coin flip
  // for the reader — the zh column never had the clash, and now neither does
  // this one.
  'view.perspective': 'Isometric',
  'view.3d': '3D',
  'view.plan': 'Plan',
  'view.orbitHint': 'Drag to rotate · Scroll to zoom · Right-drag to pan',

  'scene.label': 'Scene',
  'scene.hint': 'See the piece in a different room',
  'scene.off': 'Off',
  'scene.offNote': 'No room — the original view',
  'scene.bedroom': 'Bedroom',
  'scene.bedroomNote': 'A bedroom at night — one warm lamp, and the desk as it always was',
  'scene.daylight': 'Daylight',
  'scene.daylightNote': 'A bright room with oak boards, furnished',
  'scene.studio': 'Studio',
  'scene.studioNote': 'A seamless white sweep, like a product shot',
  'scene.workshop': 'Workshop',
  'scene.workshopNote': 'Concrete, a cool overhead light, and a lamp left on',
};

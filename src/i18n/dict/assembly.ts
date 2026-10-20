// ---------------------------------------------------------------------------
// Assembly-steps page. The step copy is generic on purpose: the plan builder
// supplies the ORDER and the part ids, and this file supplies the sentence,
// so a new template reuses the same lines. `{name}`, `{a}` and `{b}` are
// resolved with `partName` at render time — the dictionary never learns a
// component id.
// ---------------------------------------------------------------------------

export const zh = {
  'assembly.open': '装配步骤',
  'assembly.openHint': '从码好零件开始，一步一步把桌子装起来',
  'assembly.title': '装配步骤',
  'assembly.subtitle': '按顺序装完 {parts} 个零件和 {brackets} 个连接件',
  'assembly.back': '返回配置器',
  'assembly.loading': '正在准备装配…',
  'assembly.empty': '没有可装配的模型。',
  'assembly.hint': '空格 播放/暂停 · ← → 上一步/下一步 · 拖动旋转视角',

  'assembly.phase.prep': '备料',
  'assembly.phase.frame': '搭框架',
  'assembly.phase.joints': '装连接件',
  'assembly.phase.top': '上桌面',
  'assembly.phase.done': '完成',

  'assembly.step.layout.title': '清点零件',
  'assembly.step.layout.desc': '把型材和桌板平放在地面，确认数量、长度和方向。',
  'assembly.step.leg.title': '立起{name}',
  'assembly.step.leg.desc': '把{name}转到竖直，推到对应的桌角。',
  'assembly.step.beam.title': '装上{name}',
  'assembly.step.beam.desc': '把{name}搭到相邻两条腿的顶部，上沿齐平。',
  'assembly.step.crossBeam.title': '装上{name}',
  'assembly.step.crossBeam.desc': '把{name}装进两条腿之间，按设定高度对齐。',
  'assembly.step.tabletop.title': '铺上桌面',
  'assembly.step.tabletop.desc': '桌板盖住框架，前后左右留出均匀的边。',
  'assembly.step.bracket.title': '连接 {a} 与 {b}',
  'assembly.step.bracket.generic': '安装角码',
  'assembly.step.bracket.desc':
    '角码贴进内侧转角，先推入 T 型螺母，再拧紧两颗螺丝，最后扣上盖板。',
  'assembly.step.complete.title': '装配完成',
  'assembly.step.complete.desc': '检查所有螺丝是否拧紧，桌子是否平稳。',

  'assembly.chip.extrusion': '{profile} 型材',
  'assembly.chip.tabletop': '桌板',
  'assembly.chip.bolts': '螺丝 ×{n}',
  'assembly.chip.tnuts': 'T 型螺母 ×{n}',
  'assembly.chip.cover': '盖板 ×{n}',

  'assembly.legend.current': '本步安装',
  'assembly.legend.installed': '已装好',

  'assembly.counter': '第 {n} / {total} 步',
  'assembly.controls.prev': '上一步',
  'assembly.controls.next': '下一步',
  'assembly.controls.play': '播放',
  'assembly.controls.pause': '暂停',
  'assembly.controls.replay': '重新播放',
  'assembly.controls.resetView': '复位视角',

  'assembly.summary.parts': '{parts} 个零件',
  'assembly.summary.brackets': '{brackets} 个角码',
  'assembly.summary.screws': '{n} 颗螺丝',
};

export type AssemblyKey = keyof typeof zh;

export const en: Record<AssemblyKey, string> = {
  'assembly.open': 'Assembly steps',
  'assembly.openHint': 'Start from the parts laid out, and build the desk one step at a time',
  'assembly.title': 'Assembly steps',
  'assembly.subtitle': 'Assemble {parts} parts and {brackets} connectors, in order',
  'assembly.back': 'Back to configurator',
  'assembly.loading': 'Preparing the assembly…',
  'assembly.empty': 'There is no model to assemble.',
  'assembly.hint': 'Space play/pause · ← → step · drag to orbit',

  'assembly.phase.prep': 'Prep',
  'assembly.phase.frame': 'Frame',
  'assembly.phase.joints': 'Connectors',
  'assembly.phase.top': 'Tabletop',
  'assembly.phase.done': 'Done',

  'assembly.step.layout.title': 'Lay out the parts',
  'assembly.step.layout.desc':
    'Lay the profiles and the board flat on the floor. Check the count, lengths and orientation.',
  'assembly.step.leg.title': 'Stand up {name}',
  'assembly.step.leg.desc': 'Turn {name} upright and move it to its corner.',
  'assembly.step.beam.title': 'Fit {name}',
  'assembly.step.beam.desc': 'Set {name} on the two legs it spans, keeping the top edges flush.',
  'assembly.step.crossBeam.title': 'Fit {name}',
  'assembly.step.crossBeam.desc': 'Fit {name} between the legs at the set height.',
  'assembly.step.tabletop.title': 'Lay the tabletop',
  'assembly.step.tabletop.desc':
    'Lower the board onto the frame, leaving an even overhang on all sides.',
  'assembly.step.bracket.title': 'Join {a} and {b}',
  'assembly.step.bracket.generic': 'Fit a bracket',
  'assembly.step.bracket.desc':
    'Seat the bracket in the inner corner: push in the T-nuts, drive both screws, then clip on the cover.',
  'assembly.step.complete.title': 'Assembly complete',
  'assembly.step.complete.desc': 'Check every screw is tight and the desk sits level.',

  'assembly.chip.extrusion': '{profile} profile',
  'assembly.chip.tabletop': 'Tabletop',
  'assembly.chip.bolts': 'Screws ×{n}',
  'assembly.chip.tnuts': 'T-nuts ×{n}',
  'assembly.chip.cover': 'Cover ×{n}',

  'assembly.legend.current': 'Installing',
  'assembly.legend.installed': 'Installed',

  'assembly.counter': 'Step {n} of {total}',
  'assembly.controls.prev': 'Previous',
  'assembly.controls.next': 'Next',
  'assembly.controls.play': 'Play',
  'assembly.controls.pause': 'Pause',
  'assembly.controls.replay': 'Replay',
  'assembly.controls.resetView': 'Reset view',

  'assembly.summary.parts': '{parts} parts',
  'assembly.summary.brackets': '{brackets} brackets',
  'assembly.summary.screws': '{n} screws',
};

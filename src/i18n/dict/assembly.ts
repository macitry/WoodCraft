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
  'assembly.hint': '空格 播放/暂停 · ← → 上一步/下一步 · 点击零件跳到它那一步 · 拖动旋转视角',

  'assembly.mode.demo': '演示',
  'assembly.mode.guide': '施工',
  'assembly.guide.progress': '已装 {n} / {total}',
  'assembly.guide.reset': '清除进度',

  'assembly.phase.prep': '备料',
  'assembly.phase.frame': '搭框架',
  'assembly.phase.joints': '装连接件',
  'assembly.phase.flip': '翻面',
  'assembly.phase.top': '上桌面',
  'assembly.phase.done': '完成',

  'assembly.step.layout.title': '清点零件',
  'assembly.step.layout.desc':
    '型材按长度排在后方，角码和它的一套螺丝、螺母在前面的托盘里分组摆好，桌板单独放好；核对数量、长度和方向。',
  'assembly.step.leg.title': '立起{name}',
  'assembly.step.leg.desc': '把{name}竖到已经装好的角码上，脚端朝上，顶端抵住横梁。',
  'assembly.step.beam.title': '摆上{name}',
  'assembly.step.beam.desc': '把{name}靠上已经装好的角码，围成桌面的外圈，接头朝上。',
  'assembly.step.crossBeam.title': '装上{name}',
  'assembly.step.crossBeam.desc': '把{name}装进两条腿之间、已经装好的角码上，按设定高度对齐。',
  'assembly.step.flip.title': '把框架翻过来',
  'assembly.step.flip.desc': '抓住前后横梁，把整个框架翻转 180°，让四条腿落到地面。',
  'assembly.step.tabletop.title': '铺上桌面',
  'assembly.step.tabletop.desc': '桌板盖住框架，前后左右留出均匀的边。',
  'assembly.step.bracket.mount.title': '把角码固定到 {a}',
  'assembly.step.bracket.mount.desc':
    '在 {a} 的槽里放好 T 型螺母，把角码贴到型材上，拧紧这一侧的螺丝。',
  'assembly.step.bracket.attach.title': '把 {b} 接到角码上',
  'assembly.step.bracket.attach.desc':
    '把 {b} 靠上已经固定好的角码，放入另一侧的 T 型螺母，拧紧螺丝，最后扣上盖板。',
  'assembly.step.complete.title': '装配完成',
  'assembly.step.complete.desc': '检查所有螺丝是否拧紧，桌子是否平稳。',

  'assembly.chip.extrusion': '{profile} 型材',
  'assembly.chip.tabletop': '桌板',
  'assembly.chip.length': '长度 {len} mm',
  'assembly.chip.boardSize': '{w}×{d}×{t} mm',
  'assembly.chip.bolts': '螺丝 ×{n}',
  'assembly.chip.tnuts': 'T 型螺母 ×{n}',
  'assembly.chip.cover': '盖板 ×{n}',

  'assembly.cut.leg': '腿 {len} mm ×{n}',
  'assembly.cut.beam': '横梁 {len} mm ×{n}',
  'assembly.cut.cross': '横撑 {len} mm ×{n}',
  'assembly.cut.board': '桌板 {w}×{d}×{t} mm',

  'assembly.callout.mate': 'T 型螺母',
  'assembly.callout.bolt': '螺丝',
  'assembly.callout.cover': '盖板',

  'assembly.legend.current': '本步安装',
  'assembly.legend.installed': '已装好',

  'assembly.counter': '第 {n} / {total} 步',
  'assembly.controls.prev': '上一步',
  'assembly.controls.next': '下一步',
  'assembly.controls.play': '播放',
  'assembly.controls.pause': '暂停',
  'assembly.controls.replay': '重新播放',
  'assembly.controls.resetView': '复位视角',
  'assembly.controls.done': '完成这步',

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
  'assembly.hint': 'Space play/pause · ← → step · click a part to jump to its step · drag to orbit',

  'assembly.mode.demo': 'Demo',
  'assembly.mode.guide': 'Build',
  'assembly.guide.progress': 'Fitted {n} / {total}',
  'assembly.guide.reset': 'Clear progress',

  'assembly.phase.prep': 'Prep',
  'assembly.phase.frame': 'Frame',
  'assembly.phase.joints': 'Connectors',
  'assembly.phase.flip': 'Flip',
  'assembly.phase.top': 'Tabletop',
  'assembly.phase.done': 'Done',

  'assembly.step.layout.title': 'Lay out the parts',
  'assembly.step.layout.desc':
    'Profiles are racked at the back, each connector waits in the tray at the front with its screws and nuts, and the board lies on its own. Check the counts, lengths and orientation.',
  'assembly.step.leg.title': 'Stand up {name}',
  'assembly.step.leg.desc':
    'Stand {name} on the brackets already fitted, foot end up, its top meeting the rails.',
  'assembly.step.beam.title': 'Lay {name}',
  'assembly.step.beam.desc':
    'Lay {name} onto the brackets already fitted, forming the top rail ring, joints facing up.',
  'assembly.step.crossBeam.title': 'Fit {name}',
  'assembly.step.crossBeam.desc':
    'Fit {name} between the legs, onto the brackets already fitted, at the set height.',
  'assembly.step.flip.title': 'Flip the frame over',
  'assembly.step.flip.desc':
    'Grip the front and back rails, turn the whole frame through 180°, and set the legs on the floor.',
  'assembly.step.tabletop.title': 'Lay the tabletop',
  'assembly.step.tabletop.desc':
    'Lower the board onto the frame, leaving an even overhang on all sides.',
  'assembly.step.bracket.mount.title': 'Fix a bracket to {a}',
  'assembly.step.bracket.mount.desc':
    'Drop a T-nut into the slot of {a}, seat the bracket on the profile, and drive this side’s screw.',
  'assembly.step.bracket.attach.title': 'Fasten {b} onto the bracket',
  'assembly.step.bracket.attach.desc':
    'Lay {b} onto the bracket already fixed in place, add the far side’s T-nut, drive the screw, and clip on the cover.',
  'assembly.step.complete.title': 'Assembly complete',
  'assembly.step.complete.desc': 'Check every screw is tight and the desk sits level.',

  'assembly.chip.extrusion': '{profile} profile',
  'assembly.chip.tabletop': 'Tabletop',
  'assembly.chip.length': 'Length {len} mm',
  'assembly.chip.boardSize': '{w}×{d}×{t} mm',
  'assembly.chip.bolts': 'Screws ×{n}',
  'assembly.chip.tnuts': 'T-nuts ×{n}',
  'assembly.chip.cover': 'Cover ×{n}',

  'assembly.cut.leg': 'Leg {len} mm ×{n}',
  'assembly.cut.beam': 'Rail {len} mm ×{n}',
  'assembly.cut.cross': 'Cross rail {len} mm ×{n}',
  'assembly.cut.board': 'Board {w}×{d}×{t} mm',

  'assembly.callout.mate': 'T-nut',
  'assembly.callout.bolt': 'Screw',
  'assembly.callout.cover': 'Cover',

  'assembly.legend.current': 'Installing',
  'assembly.legend.installed': 'Installed',

  'assembly.counter': 'Step {n} of {total}',
  'assembly.controls.prev': 'Previous',
  'assembly.controls.next': 'Next',
  'assembly.controls.play': 'Play',
  'assembly.controls.pause': 'Pause',
  'assembly.controls.replay': 'Replay',
  'assembly.controls.resetView': 'Reset view',
  'assembly.controls.done': 'Finish this step',

  'assembly.summary.parts': '{parts} parts',
  'assembly.summary.brackets': '{brackets} brackets',
  'assembly.summary.screws': '{n} screws',
};

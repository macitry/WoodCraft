import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import { useModelStore } from '../store/modelStore';
import { useT, type Translate } from '../i18n';
import { partName } from '../i18n/names';
import type { DictKey } from '../i18n/dict';
import { accessoryKitById } from '../utils/accessoryKits';
import type { FurnitureModel } from '../types/furniture';
import AssemblyViewer from './AssemblyViewer';
import { buildAssemblyPlan, type AssemblyPhase, type AssemblyStep } from './assemblyPlan';
import type { AssemblyClock } from './assemblyClock';

const PHASE_KEY: Record<AssemblyPhase, DictKey> = {
  prep: 'assembly.phase.prep',
  frame: 'assembly.phase.frame',
  joints: 'assembly.phase.joints',
  top: 'assembly.phase.top',
  done: 'assembly.phase.done',
};

function partLookup(model: FurnitureModel, id: string | undefined): string {
  if (!id) return '';
  const part = model.components.find((c) => c.id === id);
  return part ? partName(part.id, part.name) : id;
}

/** The sentence for one step. Part names go through `partName`, so this must be
 *  called from a component that subscribes with `useT()` — it is, the page. */
function stepCopy(
  step: AssemblyStep,
  model: FurnitureModel,
  t: Translate,
): { title: string; desc: string } {
  switch (step.kind) {
    case 'layout':
      return {
        title: t('assembly.step.layout.title'),
        desc: t('assembly.step.layout.desc'),
      };
    case 'part': {
      const name = partLookup(model, step.partId);
      if (step.partType === 'leg') {
        return {
          title: t('assembly.step.leg.title', { name }),
          desc: t('assembly.step.leg.desc', { name }),
        };
      }
      if (step.partType === 'cross_beam') {
        return {
          title: t('assembly.step.crossBeam.title', { name }),
          desc: t('assembly.step.crossBeam.desc', { name }),
        };
      }
      if (step.partType === 'tabletop') {
        return {
          title: t('assembly.step.tabletop.title'),
          desc: t('assembly.step.tabletop.desc'),
        };
      }
      return {
        title: t('assembly.step.beam.title', { name }),
        desc: t('assembly.step.beam.desc', { name }),
      };
    }
    case 'bracket': {
      const names = (step.connectedPartIds ?? []).map((id) => partLookup(model, id));
      return {
        title:
          names.length >= 2
            ? t('assembly.step.bracket.title', { a: names[0], b: names[1] })
            : t('assembly.step.bracket.generic'),
        desc: t('assembly.step.bracket.desc'),
      };
    }
    case 'complete':
    default:
      return {
        title: t('assembly.step.complete.title'),
        desc: t('assembly.step.complete.desc'),
      };
  }
}

// ---------------------------------------------------------------------------
// The player. Mounted only once a model exists, and keyed by model id, so the
// clock always starts with the plan it belongs to.
// ---------------------------------------------------------------------------

const AssemblyPlayer: React.FC<{ model: FurnitureModel }> = ({ model }) => {
  const t = useT();
  const navigate = useNavigate();
  const brackets = useModelStore((s) => s.brackets);
  const cp = useModelStore((s) => s.currentParams);
  const kitId = useModelStore((s) => s.activeKitId);
  const kit = accessoryKitById(kitId);

  const plan = useMemo(
    () => buildAssemblyPlan(model, brackets, cp),
    [model, brackets, cp],
  );

  // Lazy value, reused every render; only the first one is kept.
  const clockRef = useRef<AssemblyClock>({
    stepIndex: 0,
    t: 0,
    duration: plan.steps[0].duration,
    hold: plan.steps[0].hold,
    playing: true,
  });

  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const stepIndexRef = useRef(0);
  const [resetNonce, setResetNonce] = useState(0);

  const reduceMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  const goTo = useCallback(
    (index: number, autoplay = true) => {
      const clamped = Math.max(0, Math.min(plan.steps.length - 1, index));
      const step = plan.steps[clamped];
      const c = clockRef.current;
      c.stepIndex = clamped;
      c.t = 0;
      c.duration = step.duration;
      c.hold = step.hold;
      c.playing = autoplay;
      stepIndexRef.current = clamped;
      setStepIndex(clamped);
      setPlaying(autoplay);
    },
    [plan],
  );

  const onStepDone = useCallback(() => {
    const i = stepIndexRef.current;
    if (i >= plan.steps.length - 1) {
      clockRef.current.playing = false;
      setPlaying(false);
      return;
    }
    goTo(i + 1, true);
  }, [goTo, plan.steps.length]);

  const togglePlay = useCallback(() => {
    const c = clockRef.current;
    if (c.playing) {
      c.playing = false;
      setPlaying(false);
      return;
    }
    if (c.stepIndex >= plan.steps.length - 1) {
      goTo(0, true);
      return;
    }
    c.playing = true;
    setPlaying(true);
  }, [goTo, plan.steps.length]);

  const prev = useCallback(() => {
    goTo(stepIndexRef.current - 1, true);
  }, [goTo]);

  const next = useCallback(() => {
    goTo(stepIndexRef.current + 1, true);
  }, [goTo]);

  const replay = useCallback(() => goTo(0, true), [goTo]);

  // Keyboard: the page is a presentation, and a presentation should advance
  // without hunting for a 28px button. Bound once; the actions read through a
  // ref so re-renders do not re-register the listener.
  const actionsRef = useRef({ togglePlay, prev, next });
  actionsRef.current = { togglePlay, prev, next };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        actionsRef.current.togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        actionsRef.current.prev();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        actionsRef.current.next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Dev-only: step/progress state for headless checks. The transforms live in
  // the scene (each group is tagged), this is the control-side truth.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __wcAssembly?: unknown };
    w.__wcAssembly = {
      stepIndex,
      playing,
      total: plan.steps.length,
      stepIds: plan.steps.map((s) => s.id),
      stepKinds: plan.steps.map((s) => s.kind),
      // Live, not a render snapshot: the probe needs to stop on a frame
      // mid-step (the hardware close-up), and that value changes every frame.
      get t() {
        return clockRef.current.t;
      },
    };
    return () => {
      delete w.__wcAssembly;
    };
  }, [stepIndex, playing, plan]);

  const currentRowRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    currentRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [stepIndex]);

  const progressRef = useRef<HTMLDivElement>(null);
  const step = plan.steps[stepIndex] ?? plan.steps[0];
  const copy = stepCopy(step, model, t);
  const counter = t('assembly.counter', {
    n: stepIndex + 1,
    total: plan.steps.length,
  });

  const chips: string[] = [];
  if (step.kind === 'part') {
    const part = model.components.find((c) => c.id === step.partId);
    if (step.partType === 'tabletop') {
      chips.push(t('assembly.chip.tabletop'));
    } else {
      chips.push(t('assembly.chip.extrusion', { profile: cp.profile }));
    }
    if (part?.material) chips.push(part.material);
  } else if (step.kind === 'bracket' && kit) {
    const bolts = Math.max(1, kit.boltsPerJoint);
    chips.push(t('assembly.chip.bolts', { n: bolts }));
    if (kit.mate) chips.push(t('assembly.chip.tnuts', { n: bolts }));
    if (kit.cover) chips.push(t('assembly.chip.cover', { n: 1 }));
  } else if (step.kind === 'layout') {
    chips.push(t('assembly.summary.parts', { parts: plan.parts }));
    chips.push(t('assembly.summary.brackets', { brackets: plan.brackets }));
  } else if (step.kind === 'complete' && kit) {
    chips.push(t('assembly.summary.parts', { parts: plan.parts }));
    chips.push(t('assembly.summary.brackets', { brackets: plan.brackets }));
    chips.push(
      t('assembly.summary.screws', {
        n: plan.brackets * Math.max(1, kit.boltsPerJoint),
      }),
    );
  }

  return (
    <div className="w-screen h-screen flex flex-col bg-neutral-950 overflow-hidden">
      <AppHeader
        active="home"
        left={
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-white whitespace-nowrap">
              {t('assembly.title')}
            </span>
            <span className="text-xs text-neutral-500 truncate hidden xl:inline">
              {t('assembly.subtitle', {
                parts: plan.parts,
                brackets: plan.brackets,
              })}
            </span>
          </div>
        }
        right={
          <button
            data-assembly-back
            onClick={() => navigate('/')}
            className="px-3 py-1.5 text-xs rounded-md bg-neutral-900 border border-neutral-700
              text-neutral-300 hover:text-white hover:border-neutral-600 transition-colors cursor-pointer"
          >
            ← {t('assembly.back')}
          </button>
        }
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Step rail. The whole assembly is visible here, so a reader can see
            how far they are and jump to the joint they are stuck on. */}
        <aside className="hidden lg:flex w-72 xl:w-80 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950">
          <div className="px-4 py-3 border-b border-neutral-800/70">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500">
              {t('assembly.title')}
            </div>
            <div className="text-xs text-neutral-400 mt-1">
              {t('assembly.subtitle', { parts: plan.parts, brackets: plan.brackets })}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {plan.steps.map((s, i) => {
              const state = i < stepIndex ? 'done' : i === stepIndex ? 'current' : 'todo';
              const label = stepCopy(s, model, t);
              const showPhase = i === 0 || plan.steps[i - 1].phase !== s.phase;
              return (
                <Fragment key={s.id}>
                  {showPhase && (
                    <div className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-wider text-neutral-600">
                      {t(PHASE_KEY[s.phase])}
                    </div>
                  )}
                  <button
                    ref={state === 'current' ? currentRowRef : undefined}
                    data-assembly-step={i}
                    data-state={state}
                    aria-current={state === 'current' ? 'step' : undefined}
                    onClick={() => goTo(i)}
                    className={`w-full flex items-start gap-2.5 px-4 py-2 text-left transition-colors cursor-pointer ${
                      state === 'current'
                        ? 'bg-wood-600/15 border-l-2 border-wood-500'
                        : state === 'done'
                          ? 'border-l-2 border-transparent hover:bg-neutral-900'
                          : 'border-l-2 border-transparent hover:bg-neutral-900/60'
                    }`}
                  >
                    <span
                      className={`mt-0.5 w-5 h-5 shrink-0 rounded-full text-[10px] flex items-center justify-center ${
                        state === 'done'
                          ? 'bg-wood-600/25 text-wood-300'
                          : state === 'current'
                            ? 'bg-wood-600 text-white'
                            : 'bg-neutral-800 text-neutral-500'
                      }`}
                    >
                      {state === 'done' ? '✓' : i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-xs truncate ${
                          state === 'todo' ? 'text-neutral-500' : 'text-neutral-200'
                        }`}
                      >
                        {label.title}
                      </span>
                      {state === 'current' && (
                        <span className="block text-[11px] leading-snug text-neutral-400 mt-0.5">
                          {label.desc}
                        </span>
                      )}
                    </span>
                  </button>
                </Fragment>
              );
            })}
          </div>
        </aside>

        <main className="flex-1 min-w-0 flex flex-col bg-neutral-950">
          <div className="relative flex-1 min-h-0">
            <AssemblyViewer
              model={model}
              brackets={brackets}
              plan={plan}
              step={step}
              stepIndex={stepIndex}
              clock={clockRef}
              onStepDone={onStepDone}
              resetNonce={resetNonce}
              reduceMotion={reduceMotion}
              progressRef={progressRef}
            />

            <div className="absolute top-3 left-3 pointer-events-none">
              <span className="px-2.5 py-1 rounded-full bg-neutral-950/70 border border-neutral-700/70 text-[11px] text-neutral-300 backdrop-blur-sm">
                {t(PHASE_KEY[step.phase])} · {counter}
              </span>
            </div>

            <button
              data-assembly-reset-view
              onClick={() => setResetNonce((n) => n + 1)}
              className="absolute top-3 right-3 px-2.5 py-1 rounded-md bg-neutral-950/70 border border-neutral-700/70
                text-[11px] text-neutral-300 hover:text-white hover:border-neutral-500 backdrop-blur-sm transition-colors cursor-pointer"
            >
              {t('assembly.controls.resetView')}
            </button>

            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none hidden md:block">
              <span className="px-3 py-1 rounded-full bg-neutral-950/60 text-[10px] text-neutral-500">
                {t('assembly.hint')}
              </span>
            </div>
          </div>

          {/* Control bar — one row on desktop, stacked on a phone. */}
          <div className="shrink-0 border-t border-neutral-800 bg-neutral-950">
            <div className="h-0.5 bg-neutral-900">
              <div
                ref={progressRef}
                className="h-full w-full origin-left bg-wood-500"
                style={{ transform: 'scaleX(0)' }}
              />
            </div>
            <div className="px-4 py-3 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wider text-neutral-500">
                  {t(PHASE_KEY[step.phase])} · {counter}
                </div>
                <div className="text-sm font-medium text-white mt-0.5 truncate">
                  {copy.title}
                </div>
                <div className="text-xs text-neutral-400 mt-1 line-clamp-2">{copy.desc}</div>
              </div>

              <div className="hidden xl:flex flex-wrap gap-1.5 max-w-[16rem] justify-end shrink-0">
                {chips.map((chip, i) => (
                  <span
                    key={`${chip}-${i}`}
                    className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-[10px] text-neutral-400"
                  >
                    {chip}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  data-assembly-prev
                  onClick={prev}
                  title={t('assembly.controls.prev')}
                  aria-label={t('assembly.controls.prev')}
                  className="w-9 h-9 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-900
                    transition-colors cursor-pointer text-sm"
                >
                  ←
                </button>
                <button
                  data-assembly-play
                  data-playing={playing ? '1' : '0'}
                  aria-pressed={playing}
                  onClick={togglePlay}
                  title={playing ? t('assembly.controls.pause') : t('assembly.controls.play')}
                  className="h-9 px-3 rounded-md bg-wood-600 hover:bg-wood-500 text-white text-xs
                    font-medium transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span aria-hidden="true">{playing ? '⏸' : '▶'}</span>
                  <span className="hidden sm:inline">
                    {playing ? t('assembly.controls.pause') : t('assembly.controls.play')}
                  </span>
                </button>
                <button
                  data-assembly-next
                  onClick={next}
                  title={t('assembly.controls.next')}
                  aria-label={t('assembly.controls.next')}
                  className="w-9 h-9 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-900
                    transition-colors cursor-pointer text-sm"
                >
                  →
                </button>
                <button
                  data-assembly-replay
                  onClick={replay}
                  title={t('assembly.controls.replay')}
                  aria-label={t('assembly.controls.replay')}
                  className="w-9 h-9 rounded-md text-neutral-500 hover:text-white hover:bg-neutral-900
                    transition-colors cursor-pointer text-sm"
                >
                  ↻
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Route entry — hydrates the shared model on a direct visit.
// ---------------------------------------------------------------------------

const AssemblyPage: React.FC = () => {
  const t = useT();
  const model = useModelStore((s) => s.model);
  const isLoading = useModelStore((s) => s.isLoading);
  const loadModelFromApi = useModelStore((s) => s.loadModelFromApi);

  useEffect(() => {
    // Same guard as HomePage: a client-side navigation already has the model,
    // and re-fetching would replace `brackets` wholesale mid-assembly.
    const state = useModelStore.getState();
    if (state.model || state.isLoading) return;
    loadModelFromApi();
  }, [loadModelFromApi]);

  if (!model) {
    return (
      <div className="w-screen h-screen flex flex-col bg-neutral-950">
        <AppHeader active="home" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            {isLoading ? (
              <>
                <div className="w-10 h-10 border-2 border-wood-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-sm text-neutral-400">{t('assembly.loading')}</p>
              </>
            ) : (
              <p className="text-sm text-neutral-500">{t('assembly.empty')}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return <AssemblyPlayer key={model.id} model={model} />;
};

export default AssemblyPage;

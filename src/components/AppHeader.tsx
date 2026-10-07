import React, { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import LangToggle from './LangToggle';
import { useT } from '../i18n';

/**
 * The one top bar, used by all three pages.
 *
 * Each page used to hand-roll its own strip, which is how the same three
 * destinations came to be spelled three different ways: `/` offered 「DIY」 and
 * 「组合」 but no way home, `/diy` offered 「← Home」 and 「组合」, `/kits` offered
 * only 「← Home」 and had to be reached from the other two. DiyPage even carried
 * a comment apologising for repeating the 「组合」 button. There is now one list
 * of destinations and it is the same on every page.
 *
 * Page-specific controls go in `left` (next to the nav: identity, pickers) and
 * `right` (the far side: toggles, exports). The language switch is deliberately
 * NOT a slot — it must be in the same place on every page, or the one control
 * whose job is to rescue a user from a language they cannot read would be the
 * control that moves.
 *
 * `data-nav` on each destination is what probes click: they used to match on
 * 「🔧 DIY」, i.e. on the very text this component exists to translate.
 */
export type AppPage = 'home' | 'diy' | 'kits';

interface AppHeaderProps {
  /** Which destination is the current page — for the active style only. */
  active: AppPage;
  /** Controls immediately after the nav (title, pickers, project name). */
  left?: ReactNode;
  /** Controls before the language switch (view toggles, exports, counts). */
  right?: ReactNode;
  /** A full-width strip under the bar — banners, refusals, pick hints. */
  banner?: ReactNode;
}

const AppHeader: React.FC<AppHeaderProps> = ({ active, left, right, banner }) => {
  const t = useT();
  const navigate = useNavigate();

  const destinations: { id: AppPage; path: string; label: string }[] = [
    { id: 'home', path: '/', label: t('nav.configurator') },
    { id: 'diy', path: '/diy', label: t('nav.diy') },
    { id: 'kits', path: '/kits', label: t('nav.kits') },
  ];

  return (
    <>
      <header className="h-12 px-4 flex items-center gap-3 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur-sm flex-shrink-0 relative z-50">
        {/* Brand — the way home on every page, so no page needs a 「← 首页」. */}
        <button
          onClick={() => navigate('/')}
          title={t('nav.home')}
          className="flex items-center gap-2 mr-1 cursor-pointer"
        >
          <span className="w-8 h-8 rounded-lg bg-wood-600 flex items-center justify-center text-white font-bold text-sm">
            W
          </span>
          <span className="text-sm font-semibold text-white tracking-wide">WoodCraft</span>
        </button>

        <div className="w-px h-6 bg-neutral-800" />

        {destinations.map((d) => (
          <button
            key={d.id}
            data-nav={d.id}
            aria-current={active === d.id ? 'page' : undefined}
            onClick={() => navigate(d.path)}
            className={`px-3 py-1 text-xs rounded transition-colors cursor-pointer font-medium ${
              active === d.id
                ? 'bg-wood-600/20 text-wood-300 border border-wood-600/40'
                : 'bg-neutral-800 hover:bg-neutral-700 text-wood-400 hover:text-wood-300 border border-transparent'
            }`}
          >
            {d.label}
          </button>
        ))}

        {left && (
          <>
            <div className="w-px h-6 bg-neutral-800" />
            {left}
          </>
        )}

        <div className="flex-1" />

        {right}

        <div className="w-px h-6 bg-neutral-800" />
        <LangToggle />
      </header>
      {banner}
    </>
  );
};

export default AppHeader;

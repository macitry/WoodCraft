import React from 'react';
import { useLang, useLangStore, useT } from '../i18n';

/**
 * The CH / EN switch, in the top bar of all three pages.
 *
 * Both labels are always shown in their own language — a switch that reads
 * 「中文 / EN」 is legible to someone who cannot read the language they are
 * currently stuck in, which is the whole point of a language switch.
 *
 * `data-lang` on each half keeps this clickable from a probe without
 * depending on the label text, which is the thing that changes here.
 */
const LangToggle: React.FC<{ className?: string }> = ({ className }) => {
  const t = useT();
  const lang = useLang();
  const setLang = useLangStore((s) => s.setLang);

  const options = [
    { id: 'zh' as const, label: t('lang.zh') },
    { id: 'en' as const, label: t('lang.en') },
  ];

  return (
    <div
      data-lang-toggle
      className={`flex items-center rounded-md bg-neutral-900 border border-neutral-700 overflow-hidden ${className ?? ''}`}
    >
      {options.map((o) => (
        <button
          key={o.id}
          data-lang={o.id}
          aria-pressed={lang === o.id}
          title={t('lang.switchTo', { name: o.label })}
          onClick={() => setLang(o.id)}
          className={`px-2.5 py-1.5 text-xs transition-colors cursor-pointer ${
            lang === o.id
              ? 'bg-wood-600 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
};

export default LangToggle;

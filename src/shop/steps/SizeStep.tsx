import { useEffect, useState } from 'react';
import { GlassSlider } from '@glass-sdk/liquid-glass';
import { useT } from '../../i18n';
import { textureLabel, textureNote } from '../../i18n/names';
import { TABLETOP_TEXTURES } from '../../materials/tabletopTextures';
import { SHOP_PROFILES, useShopStore } from '../shopStore';
import { paramLabel } from '../labels';

/**
 * Step two: the dimensions.
 *
 * Every field on this page is drawn from the chosen template's own
 * `parameters[]` — its label, its limits, its step and the value it starts at.
 * None of that is written here, and that is the point: the numbers a customer
 * is allowed to type are the numbers the solver can actually build, and the
 * page could not get that wrong if it tried.
 */
const SizeStep: React.FC = () => {
  const t = useT();
  const template = useShopStore((s) => s.template);
  const values = useShopStore((s) => s.values);
  const profile = useShopStore((s) => s.profile);
  const board = useShopStore((s) => s.board);
  const setValue = useShopStore((s) => s.setValue);
  const setProfile = useShopStore((s) => s.setProfile);
  const setBoard = useShopStore((s) => s.setBoard);

  if (!template) return null;

  return (
    <div className="shop-scroll">
      <h2 className="shop-h1">{t('shop.size.title')}</h2>
      <p className="shop-lead">{t('shop.size.lead')}</p>

      <div className="shop-fields">
        {template.parameters.map((p) => {
          const value = values[p.id] ?? p.defaultValue;
          return (
            <div className="shop-field" key={p.id}>
              <div className="shop-field-head">
                <span className="shop-field-name">{paramLabel(t, p.id, p.name)}</span>
                <span className="shop-field-readout">
                  <NumberField
                    value={value}
                    min={p.min}
                    max={p.max}
                    onChange={(next) => setValue(p.id, next)}
                  />
                  <span className="shop-field-unit">{p.unit}</span>
                </span>
              </div>
              <GlassSlider
                min={p.min}
                max={p.max}
                step={p.step}
                value={value}
                onValueChange={(next: number) => setValue(p.id, next)}
                aria-label={paramLabel(t, p.id, p.name)}
              />
              <div className="shop-field-range">
                {p.min} – {p.max} {p.unit}
              </div>
            </div>
          );
        })}
      </div>

      <div className="shop-field" style={{ marginTop: 18, maxWidth: 640 }}>
        <div className="shop-field-head">
          <span className="shop-field-name">{t('shop.size.profile.title')}</span>
        </div>
        <p className="shop-lead" style={{ margin: '6px 0 0', maxWidth: 'none' }}>
          {t('shop.size.profile.lead')}
        </p>
        <div className="shop-sizes">
          {SHOP_PROFILES.map((size) => (
            <button
              key={size}
              type="button"
              className="shop-size"
              aria-pressed={profile === size}
              onClick={() => setProfile(size)}
            >
              <span className="shop-size-cap">{size}</span>
              <span className="shop-size-sub">
                {t('shop.size.profile.sub', { n: Number(size.slice(0, 2)) })}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* The board chooser. The swatch is the baked tile itself rather than a
          brown square, because the difference between oak and walnut is mostly
          the grain — the same reasoning the editor's MaterialSelector gives. */}
      <div className="shop-field" style={{ marginTop: 18, maxWidth: 640 }}>
        <div className="shop-field-head">
          <span className="shop-field-name">{t('shop.size.board.title')}</span>
        </div>
        <p className="shop-lead" style={{ margin: '6px 0 0', maxWidth: 'none' }}>
          {t('shop.size.board.lead')}
        </p>
        <div className="shop-sizes shop-boards">
          {TABLETOP_TEXTURES.map((b) => (
            <button
              key={b.id}
              type="button"
              className="shop-size shop-board"
              data-shop-board={b.id}
              aria-pressed={board === b.id}
              title={textureNote(b)}
              onClick={() => setBoard(b.id)}
            >
              <span
                className="shop-board-swatch"
                style={{ backgroundImage: `url(${b.faceUrl})`, backgroundColor: b.color }}
              />
              <span className="shop-size-cap">{textureLabel(b)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * The number beside a slider.
 *
 * It holds what is being typed rather than what is stored, and only clamps when
 * the field is left. Clamping on every keystroke is the version that looks
 * right and is unusable: type "9" on the way to "900" and a field whose minimum
 * is 400 snaps to 400 under the cursor, and the next character lands in the
 * wrong number.
 */
const NumberField: React.FC<{
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}> = ({ value, min, max, onChange }) => {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  // Committed from the ELEMENT's value, not from `draft`. The two are usually
  // the same, but `setDraft` is a state update and a blur can arrive before
  // React has flushed it — the field would then commit the number the user had
  // typed one keystroke ago. Reading the DOM at the moment of commit has no
  // such window, and it is the value the user can actually see.
  const commit = (element: HTMLInputElement) => {
    setEditing(false);
    const parsed = Number(element.value);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, parsed));
    setDraft(String(clamped));
    onChange(clamped);
  };

  return (
    <input
      className="shop-field-number"
      type="text"
      inputMode="numeric"
      value={draft}
      onFocus={() => setEditing(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
};

export default SizeStep;

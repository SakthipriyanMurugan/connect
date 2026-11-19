import React from 'react';
import { useAppearance } from '../../context/AppearanceContext';
import { X, RotateCcw, Check, Sparkles } from 'lucide-react';
import type { AppearanceSettings } from '../../types';

export const CustomizerDrawer: React.FC = () => {
  const { appearance, updateAppearance, resetAppearance, isCustomizerOpen, setIsCustomizerOpen } =
    useAppearance();

  if (!isCustomizerOpen) return null;

  const accentPresets = [
    { label: 'Blue', color: '#1769ef' },
    { label: 'Violet', color: '#7454e8' },
    { label: 'Emerald', color: '#079b83' },
    { label: 'Rose', color: '#d65b83' },
    { label: 'Amber', color: '#d17b22' },
    { label: 'Teal', color: '#168fa8' },
  ];

  return (
    <div 
      className="fixed inset-0 z-50 flex justify-end bg-[#071a36]/60 backdrop-blur-sm transition-opacity"
      onClick={() => setIsCustomizerOpen(false)}
    >
      <aside
        className="w-full max-w-[420px] h-full bg-gradient-to-b from-[#f9faff] to-[#edf0ff] dark:from-[#151c3b] dark:to-[#10162f] p-6 shadow-2xl flex flex-col justify-between overflow-y-auto border-l border-white/60 dark:border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-black/5 dark:border-white/10">
            <div>
              <span className="text-[10px] uppercase font-extrabold tracking-widest text-[var(--accent)] flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Personalization
              </span>
              <h2 className="text-xl font-bold text-[#182044] dark:text-[#eef1ff] mt-0.5">
                Customize Workspace
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setIsCustomizerOpen(false)}
              className="w-8 h-8 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 text-[#182044] dark:text-[#eef1ff] flex items-center justify-center transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-[#6f7899] dark:text-[#aeb8dc] my-4 leading-relaxed">
            Personalize your workspace look, reading typography, accent hues, and UI density.
          </p>

          {/* Section 1: Theme mode */}
          <div className="py-4 border-t border-black/5 dark:border-white/10">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#182044] dark:text-[#eef1ff] mb-3">
              Theme Mode
            </h3>
            <div className="grid grid-cols-3 gap-2.5">
              {(['light', 'dark', 'system'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updateAppearance('theme', mode)}
                  className={`p-2.5 rounded-xl border text-left flex flex-col gap-2 transition-all cursor-pointer ${
                    appearance.theme === mode
                      ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/20 bg-white/80 dark:bg-white/10'
                      : 'border-[#cbd5ff]/50 dark:border-white/10 bg-white/40 dark:bg-white/5 hover:border-[#cbd5ff]'
                  }`}
                >
                  <div
                    className={`h-11 rounded-lg border border-black/10 flex overflow-hidden ${
                      mode === 'light'
                        ? 'bg-gradient-to-r from-[#0b2346] via-[#0b2346] to-[#f4f7fc]'
                        : mode === 'dark'
                        ? 'bg-gradient-to-r from-[#070f20] to-[#18243a]'
                        : 'bg-gradient-to-r from-[#0b2346] via-[#f4f7fc] to-[#18243a]'
                    }`}
                  />
                  <span className="text-xs font-bold capitalize text-[#182044] dark:text-[#eef1ff]">
                    {mode}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Section 2: Accent Colour */}
          <div className="py-4 border-t border-black/5 dark:border-white/10">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#182044] dark:text-[#eef1ff] mb-3">
              Accent Color
            </h3>
            <div className="flex items-center gap-2.5 flex-wrap">
              {accentPresets.map((preset) => {
                const isSelected = appearance.accent.toLowerCase() === preset.color.toLowerCase();
                return (
                  <button
                    key={preset.color}
                    type="button"
                    onClick={() => updateAppearance('accent', preset.color)}
                    title={preset.label}
                    style={{ backgroundColor: preset.color }}
                    className={`w-8 h-8 rounded-full border-2 border-white shadow-md flex items-center justify-center transition-transform hover:scale-110 cursor-pointer ${
                      isSelected ? 'ring-2 ring-[var(--accent)] scale-110' : ''
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                  </button>
                );
              })}

              {/* Custom Color Input */}
              <label
                className="w-8 h-8 rounded-full border border-dashed border-[#aab7ca] dark:border-white/30 flex items-center justify-center relative cursor-pointer hover:border-[var(--accent)] transition-colors overflow-hidden"
                title="Custom color picker"
              >
                <span className="text-xs font-bold text-[#6f7899] dark:text-[#aeb8dc]">+</span>
                <input
                  type="color"
                  value={appearance.accent}
                  onChange={(e) => updateAppearance('accent', e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
              </label>
            </div>
          </div>

          {/* Section 3: Typography */}
          <div className="py-4 border-t border-black/5 dark:border-white/10 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#182044] dark:text-[#eef1ff]">
              Typography
            </h3>

            <div className="flex items-center justify-between text-xs">
              <span className="text-[#182044] dark:text-[#eef1ff] font-medium">Text Size</span>
              <select
                value={appearance.fontSize}
                onChange={(e) => updateAppearance('fontSize', e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-[#cbd5ff]/60 dark:border-white/15 bg-white/70 dark:bg-[#0c1230] text-[#182044] dark:text-[#eef1ff] focus:outline-none focus:border-[var(--accent)] text-xs"
              >
                <option value="13">Small (13px)</option>
                <option value="14">Default (14px)</option>
                <option value="15">Large (15px)</option>
                <option value="16">Extra Large (16px)</option>
              </select>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-[#182044] dark:text-[#eef1ff] font-medium">Font Family</span>
              <select
                value={appearance.fontFamily}
                onChange={(e) =>
                  updateAppearance('fontFamily', e.target.value as AppearanceSettings['fontFamily'])
                }
                className="px-2.5 py-1.5 rounded-lg border border-[#cbd5ff]/60 dark:border-white/15 bg-white/70 dark:bg-[#0c1230] text-[#182044] dark:text-[#eef1ff] focus:outline-none focus:border-[var(--accent)] text-xs"
              >
                <option value="system">System Default</option>
                <option value="inter">Modern Sans-Serif</option>
                <option value="serif">Classic Serif</option>
                <option value="mono">Monospace</option>
              </select>
            </div>
          </div>

          {/* Section 4: Interface Density & Accessibility */}
          <div className="py-4 border-t border-black/5 dark:border-white/10 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#182044] dark:text-[#eef1ff]">
              Layout & Comfort
            </h3>

            <label className="flex items-center justify-between text-xs font-medium text-[#182044] dark:text-[#eef1ff] cursor-pointer">
              <span>Compact spacing</span>
              <input
                type="checkbox"
                checked={appearance.compact}
                onChange={(e) => updateAppearance('compact', e.target.checked)}
                className="w-4 h-4 rounded accent-[var(--accent)] cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between text-xs font-medium text-[#182044] dark:text-[#eef1ff] cursor-pointer">
              <span>Reduce motion</span>
              <input
                type="checkbox"
                checked={appearance.motion}
                onChange={(e) => updateAppearance('motion', e.target.checked)}
                className="w-4 h-4 rounded accent-[var(--accent)] cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between text-xs font-medium text-[#182044] dark:text-[#eef1ff] cursor-pointer">
              <span>Show sidebar text labels</span>
              <input
                type="checkbox"
                checked={appearance.labels}
                onChange={(e) => updateAppearance('labels', e.target.checked)}
                className="w-4 h-4 rounded accent-[var(--accent)] cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* Bottom Drawer Actions */}
        <div className="pt-4 border-t border-black/5 dark:border-white/10 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={resetAppearance}
            className="px-3.5 py-2 rounded-xl text-xs font-medium text-[#46517f] dark:text-[#cbd4ff] bg-black/5 dark:bg-white/10 hover:bg-black/10 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCustomizerOpen(false)}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#718bff] to-[#9b83f7] hover:brightness-110 shadow-md transition-all cursor-pointer"
          >
            Done
          </button>
        </div>
      </aside>
    </div>
  );
};

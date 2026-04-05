
import React, { useState } from 'react';
import { RPGItem, EquipmentSlot, ActiveCosmetics } from '../../types';
import Modal from '../Modal';
import OperativeAvatar, { SKIN_TONES, HAIR_COLORS, HAIR_STYLE_NAMES } from './OperativeAvatar';
import Avatar3D from './Avatar3D';
import { CHARACTER_MODELS, getStarterModels, DEFAULT_CHARACTER_MODEL, ENABLE_3D_AVATAR } from '../../lib/characterModels';

interface Appearance {
  hue?: number;
  suitHue?: number;
  bodyType?: 'A' | 'B' | 'C';
  skinTone?: number;
  hairStyle?: number;
  hairColor?: number;
}

interface CustomizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  equipped: Partial<Record<EquipmentSlot, RPGItem>>;
  appearance: Appearance | undefined;
  onSave: (appearance: { hue: number; suitHue: number; bodyType: 'A' | 'B' | 'C'; skinTone: number; hairStyle: number; hairColor: number }) => void;
  /** Currently selected 3D character model ID */
  selectedCharacterModel?: string;
  /** Character model IDs the student owns */
  ownedCharacterModels?: string[];
  /** Callback when student selects a different character model */
  onSelectCharacterModel?: (modelId: string) => void;
  /** Active cosmetics for 3D preview */
  activeCosmetics?: ActiveCosmetics;
}

type Tab = '2d' | '3d';

// Uses the shared flag from characterModels.ts
const ENABLE_3D_TAB = ENABLE_3D_AVATAR;

const CustomizeModal: React.FC<CustomizeModalProps> = ({
  isOpen, onClose, equipped, appearance, onSave,
  selectedCharacterModel, ownedCharacterModels = [], onSelectCharacterModel, activeCosmetics,
}) => {
  const [previewHue, setPreviewHue] = useState<number | null>(null);
  const [previewSuitHue, setPreviewSuitHue] = useState<number | null>(null);
  const [previewBodyType, setPreviewBodyType] = useState<'A' | 'B' | 'C' | null>(null);
  const [previewSkinTone, setPreviewSkinTone] = useState<number | null>(null);
  const [previewHairStyle, setPreviewHairStyle] = useState<number | null>(null);
  const [previewHairColor, setPreviewHairColor] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(ENABLE_3D_TAB ? '3d' : '2d');
  const [preview3DModel, setPreview3DModel] = useState<string | null>(null);

  // Free starters are always available
  const starterIds = getStarterModels().map(m => m.id);
  const availableModelIds = new Set([...starterIds, ...ownedCharacterModels]);

  const current3DModel = preview3DModel ?? selectedCharacterModel ?? DEFAULT_CHARACTER_MODEL;

  const suitHueValue = previewSuitHue ?? appearance?.suitHue ?? appearance?.hue ?? 0;

  const handleClose = () => {
    onClose();
    setPreviewHue(null);
    setPreviewSuitHue(null);
    setPreviewBodyType(null);
    setPreviewSkinTone(null);
    setPreviewHairStyle(null);
    setPreviewHairColor(null);
    setPreview3DModel(null);
  };

  const handleSave = () => {
    // Save 2D appearance
    onSave({
      hue: previewHue ?? appearance?.hue ?? 0,
      suitHue: previewSuitHue ?? appearance?.suitHue ?? appearance?.hue ?? 0,
      bodyType: previewBodyType ?? appearance?.bodyType ?? 'A',
      skinTone: previewSkinTone ?? appearance?.skinTone ?? 0,
      hairStyle: previewHairStyle ?? appearance?.hairStyle ?? 1,
      hairColor: previewHairColor ?? appearance?.hairColor ?? 0,
    });
    // Save 3D model if changed
    if (preview3DModel && preview3DModel !== selectedCharacterModel && onSelectCharacterModel) {
      onSelectCharacterModel(preview3DModel);
    }
    setPreviewHue(null);
    setPreviewSuitHue(null);
    setPreviewBodyType(null);
    setPreviewSkinTone(null);
    setPreviewHairStyle(null);
    setPreviewHairColor(null);
    setPreview3DModel(null);
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Customize Your Agent" maxWidth="max-w-4xl">
      <div className="p-4 lg:p-6">
        <div className="flex flex-col lg:flex-row gap-6">

          {/* Left column: controls */}
          <div className="flex-1 space-y-4 lg:overflow-y-auto lg:max-h-[75vh] lg:pr-2 custom-scrollbar">

            {/* Tab switcher — hidden when 3D tab is disabled */}
            {ENABLE_3D_TAB && (
              <div className="flex gap-1 bg-[var(--surface-glass)] rounded-xl p-1 border border-[var(--border)]">
                <button
                  onClick={() => setActiveTab('3d')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                    activeTab === '3d' ? 'bg-purple-600 text-white shadow-lg' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  3D Model
                </button>
                <button
                  onClick={() => setActiveTab('2d')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                    activeTab === '2d' ? 'bg-purple-600 text-white shadow-lg' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  2D Classic
                </button>
              </div>
            )}

            {activeTab === '3d' ? (
              <>
                {/* Character Model Selection */}
                <div className="bg-[var(--surface-glass)] p-4 rounded-2xl border border-[var(--border)]">
                  <label className="block text-[10px] font-black text-[var(--text-tertiary)] uppercase tracking-widest mb-3 text-center">Character Model</label>
                  <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                    {CHARACTER_MODELS.map(model => {
                      const owned = availableModelIds.has(model.id);
                      const isActive = current3DModel === model.id;
                      return (
                        <button
                          key={model.id}
                          onClick={() => owned && setPreview3DModel(model.id)}
                          disabled={!owned}
                          className={`relative p-3 rounded-xl border-2 text-left transition-all ${
                            isActive
                              ? 'border-purple-500 bg-purple-500/20'
                              : owned
                                ? 'border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-glass)]'
                                : 'border-[var(--border)] opacity-40 cursor-not-allowed'
                          }`}
                        >
                          {/* Color indicator dot */}
                          <div
                            className="w-5 h-5 rounded-full mb-1.5 border border-[var(--border-strong)]"
                            style={{ backgroundColor: model.thumbnailColor }}
                          />
                          <div className="text-xs font-bold text-[var(--text-primary)] truncate">{model.name}</div>
                          <div className="text-[9px] text-[var(--text-tertiary)] truncate">{model.description}</div>
                          {/* Price tag */}
                          <div className={`absolute top-1.5 right-1.5 text-[8px] font-black px-1.5 py-0.5 rounded-full ${
                            model.cost === 0
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : owned
                                ? 'bg-purple-500/20 text-purple-400'
                                : 'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {model.cost === 0 ? 'FREE' : owned ? 'OWNED' : `${model.cost} \u26A1`}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {/* Hint for locked models */}
                  <p className="text-[9px] text-[var(--text-muted)] text-center mt-2">
                    Locked models can be purchased in the Flux Shop
                  </p>
                </div>

                {/* Skin Tone (3D) — gradient slider */}
                <div className="bg-[var(--surface-glass)] p-4 rounded-2xl border border-[var(--border)]">
                  <label className="block text-[10px] font-black text-[var(--text-tertiary)] uppercase tracking-widest mb-3 text-center">Skin Tone</label>
                  <div className="px-2">
                    <div className="relative h-6 rounded-full overflow-hidden border border-[var(--border)]"
                      style={{ background: `linear-gradient(to right, ${SKIN_TONES.join(', ')})` }}>
                      <input
                        type="range"
                        min={0}
                        max={SKIN_TONES.length - 1}
                        step={1}
                        value={previewSkinTone ?? appearance?.skinTone ?? 0}
                        onChange={e => setPreviewSkinTone(Number(e.target.value))}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      {/* Thumb indicator */}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white shadow-lg pointer-events-none transition-all"
                        style={{
                          left: `calc(${((previewSkinTone ?? appearance?.skinTone ?? 0) / (SKIN_TONES.length - 1)) * 100}% - 10px)`,
                          backgroundColor: SKIN_TONES[previewSkinTone ?? appearance?.skinTone ?? 0],
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Suit Color (3D) — hue slider */}
                <div className="bg-[var(--surface-glass)] p-4 rounded-2xl border border-[var(--border)]">
                  <label className="block text-[10px] font-black text-[var(--text-tertiary)] uppercase tracking-widest mb-3 text-center">Suit Color</label>
                  <div className="px-2">
                    <div className="relative h-6 rounded-full overflow-hidden border border-[var(--border)]"
                      style={{ background: 'linear-gradient(to right, hsl(0,55%,40%), hsl(30,55%,40%), hsl(60,55%,40%), hsl(120,55%,40%), hsl(180,55%,40%), hsl(240,55%,40%), hsl(300,55%,40%), hsl(360,55%,40%))' }}>
                      <input
                        type="range"
                        min={0}
                        max={360}
                        step={1}
                        value={previewSuitHue ?? appearance?.suitHue ?? appearance?.hue ?? 0}
                        onChange={e => setPreviewSuitHue(Number(e.target.value))}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white shadow-lg pointer-events-none transition-all"
                        style={{
                          left: `calc(${((previewSuitHue ?? appearance?.suitHue ?? appearance?.hue ?? 0) / 360) * 100}% - 10px)`,
                          backgroundColor: `hsl(${previewSuitHue ?? appearance?.suitHue ?? appearance?.hue ?? 0}, 55%, 40%)`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Skin Tone — gradient slider */}
                <div className="bg-[var(--surface-glass)] p-4 rounded-2xl border border-[var(--border)]">
                  <label className="block text-[10px] font-black text-[var(--text-tertiary)] uppercase tracking-widest mb-3 text-center">Skin Tone</label>
                  <div className="px-2">
                    <div className="relative h-6 rounded-full overflow-hidden border border-[var(--border)]"
                      style={{ background: `linear-gradient(to right, ${SKIN_TONES.join(', ')})` }}>
                      <input
                        type="range"
                        min={0}
                        max={SKIN_TONES.length - 1}
                        step={1}
                        value={previewSkinTone ?? appearance?.skinTone ?? 0}
                        onChange={e => setPreviewSkinTone(Number(e.target.value))}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white shadow-lg pointer-events-none transition-all"
                        style={{
                          left: `calc(${((previewSkinTone ?? appearance?.skinTone ?? 0) / (SKIN_TONES.length - 1)) * 100}% - 10px)`,
                          backgroundColor: SKIN_TONES[previewSkinTone ?? appearance?.skinTone ?? 0],
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Hair Style */}
                <div className="bg-[var(--surface-glass)] p-4 rounded-2xl border border-[var(--border)]">
                  <label className="block text-[10px] font-black text-[var(--text-tertiary)] uppercase tracking-widest mb-3 text-center">Hair Style</label>
                  <div className="grid grid-cols-4 gap-2">
                    {HAIR_STYLE_NAMES.map((name, i) => {
                      const isActive = (previewHairStyle ?? appearance?.hairStyle ?? 1) === i;
                      return (
                        <button key={i} onClick={() => setPreviewHairStyle(i)}
                          className={`px-2 py-2 rounded-xl text-xs font-bold transition-all ${isActive ? 'bg-purple-500/30 border-purple-500 text-white border-2' : 'bg-[var(--surface-glass)] border border-[var(--border)] text-[var(--text-tertiary)] hover:bg-[var(--surface-glass-heavy)] hover:text-[var(--text-primary)]'}`}>
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Hair Color — gradient slider */}
                <div className="bg-[var(--surface-glass)] p-4 rounded-2xl border border-[var(--border)]">
                  <label className="block text-[10px] font-black text-[var(--text-tertiary)] uppercase tracking-widest mb-3 text-center">Hair Color</label>
                  <div className="px-2">
                    <div className="relative h-6 rounded-full overflow-hidden border border-[var(--border)]"
                      style={{ background: `linear-gradient(to right, ${HAIR_COLORS.join(', ')})` }}>
                      <input
                        type="range"
                        min={0}
                        max={HAIR_COLORS.length - 1}
                        step={1}
                        value={previewHairColor ?? appearance?.hairColor ?? 0}
                        onChange={e => setPreviewHairColor(Number(e.target.value))}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white shadow-lg pointer-events-none transition-all"
                        style={{
                          left: `calc(${((previewHairColor ?? appearance?.hairColor ?? 0) / (HAIR_COLORS.length - 1)) * 100}% - 10px)`,
                          backgroundColor: HAIR_COLORS[previewHairColor ?? appearance?.hairColor ?? 0],
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Body Frame */}
                <div className="bg-[var(--surface-glass)] p-4 rounded-2xl border border-[var(--border)]">
                  <label className="block text-[10px] font-black text-[var(--text-tertiary)] uppercase tracking-widest mb-3 text-center">Body Frame</label>
                  <div className="flex justify-center gap-2">
                    {(['A', 'B', 'C'] as const).map(type => {
                      const isActive = (previewBodyType ?? appearance?.bodyType ?? 'A') === type;
                      return (
                        <button key={type} onClick={() => setPreviewBodyType(type)}
                          className={`px-3 py-2 rounded-xl border-2 transition-all font-bold text-xs ${isActive ? 'border-purple-500 bg-purple-500/20 text-white' : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]'}`}>
                          {type === 'A' ? 'Alpha' : type === 'B' ? 'Beta' : 'Femme'}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Suit Color — hue slider */}
                <div className="bg-[var(--surface-glass)] p-4 rounded-2xl border border-[var(--border)]">
                  <label className="block text-[10px] font-black text-[var(--text-tertiary)] uppercase tracking-widest mb-3 text-center">Suit Color</label>
                  <div className="px-2">
                    <div className="relative h-6 rounded-full overflow-hidden border border-[var(--border)]"
                      style={{ background: 'linear-gradient(to right, hsl(0,55%,40%), hsl(30,55%,40%), hsl(60,55%,40%), hsl(120,55%,40%), hsl(180,55%,40%), hsl(240,55%,40%), hsl(300,55%,40%), hsl(360,55%,40%))' }}>
                      <input
                        type="range"
                        min={0}
                        max={360}
                        step={1}
                        value={previewSuitHue ?? appearance?.suitHue ?? appearance?.hue ?? 0}
                        onChange={e => setPreviewSuitHue(Number(e.target.value))}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white shadow-lg pointer-events-none transition-all"
                        style={{
                          left: `calc(${((previewSuitHue ?? appearance?.suitHue ?? appearance?.hue ?? 0) / 360) * 100}% - 10px)`,
                          backgroundColor: `hsl(${previewSuitHue ?? appearance?.suitHue ?? appearance?.hue ?? 0}, 55%, 40%)`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Eye Color — hue slider */}
                <div className="bg-[var(--surface-glass)] p-4 rounded-2xl border border-[var(--border)]">
                  <label className="block text-[10px] font-black text-[var(--text-tertiary)] uppercase tracking-widest mb-3 text-center">Eye Color</label>
                  <div className="px-2">
                    <div className="relative h-6 rounded-full overflow-hidden border border-[var(--border)]"
                      style={{ background: 'linear-gradient(to right, hsl(180,70%,50%), hsl(210,70%,50%), hsl(240,70%,50%), hsl(270,70%,50%), hsl(300,70%,50%), hsl(330,70%,50%), hsl(0,70%,50%), hsl(30,70%,50%), hsl(60,70%,50%), hsl(90,70%,50%), hsl(120,70%,50%), hsl(150,70%,50%), hsl(180,70%,50%))' }}>
                      <input
                        type="range"
                        min={0}
                        max={360}
                        step={1}
                        value={previewHue ?? appearance?.hue ?? 0}
                        onChange={e => setPreviewHue(Number(e.target.value))}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white shadow-lg pointer-events-none transition-all"
                        style={{
                          left: `calc(${((previewHue ?? appearance?.hue ?? 0) / 360) * 100}% - 10px)`,
                          backgroundColor: `hsl(${((previewHue ?? appearance?.hue ?? 0) + 180) % 360}, 70%, 50%)`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Right column: sticky avatar preview + actions */}
          <div className="lg:w-[42%] flex-shrink-0 lg:sticky lg:top-0 lg:self-start space-y-4">

            {/* Avatar preview panel */}
            <div className="bg-[var(--panel-bg)] border border-[var(--border)] rounded-2xl p-4 backdrop-blur-sm max-w-xs mx-auto lg:max-w-none">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-4 h-4 text-teal-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-widest">Agent Preview</h3>
              </div>
              <div
                className="w-full aspect-[3/4] rounded-xl border border-[var(--border)] overflow-hidden"
                style={{ background: `radial-gradient(ellipse at 50% 70%, hsla(${suitHueValue + 200}, 60%, 20%, 0.4) 0%, rgba(0,0,0,0.5) 70%)` }}
              >
                {activeTab === '3d' ? (
                  <Avatar3D
                    characterModelId={current3DModel}
                    appearance={{
                      ...appearance,
                      hue: previewHue ?? appearance?.hue ?? 0,
                      suitHue: previewSuitHue ?? appearance?.suitHue ?? appearance?.hue ?? 0,
                      bodyType: previewBodyType ?? appearance?.bodyType ?? 'A',
                      skinTone: previewSkinTone ?? appearance?.skinTone ?? 0,
                    }}
                    activeCosmetics={activeCosmetics}
                  />
                ) : (
                  <OperativeAvatar equipped={equipped} appearance={{
                    ...appearance,
                    hue: previewHue ?? appearance?.hue ?? 0,
                    suitHue: previewSuitHue ?? appearance?.suitHue ?? appearance?.hue ?? 0,
                    bodyType: previewBodyType ?? appearance?.bodyType ?? 'A',
                    skinTone: previewSkinTone ?? appearance?.skinTone ?? 0,
                    hairStyle: previewHairStyle ?? appearance?.hairStyle ?? 1,
                    hairColor: previewHairColor ?? appearance?.hairColor ?? 0,
                  }} />
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 max-w-xs mx-auto lg:max-w-none">
              <button onClick={handleClose}
                className="flex-1 py-3 bg-[var(--surface-glass)] border border-[var(--border)] text-[var(--text-tertiary)] font-bold rounded-xl hover:bg-[var(--surface-glass-heavy)] transition">
                Cancel
              </button>
              <button onClick={handleSave}
                className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-500 transition shadow-lg shadow-purple-900/20">
                Save Profile
              </button>
            </div>
          </div>

        </div>
      </div>
    </Modal>
  );
};

export default CustomizeModal;

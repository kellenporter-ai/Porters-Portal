
import React, { useState } from 'react';
import { RPGItem, EquipmentSlot } from '../../types';
import Modal from '../Modal';
import OperativeAvatar, { SKIN_TONES, HAIR_COLORS, HAIR_STYLE_NAMES } from './OperativeAvatar';

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
}

const SUIT_HUE_OPTIONS = [0, 30, 60, 120, 180, 210, 240, 270, 300, 330];
const ENERGY_HUE_OPTIONS = [0, 30, 60, 90, 120, 180, 240, 300];

const CustomizeModal: React.FC<CustomizeModalProps> = ({ isOpen, onClose, equipped, appearance, onSave }) => {
  const [previewHue, setPreviewHue] = useState<number | null>(null);
  const [previewSuitHue, setPreviewSuitHue] = useState<number | null>(null);
  const [previewBodyType, setPreviewBodyType] = useState<'A' | 'B' | 'C' | null>(null);
  const [previewSkinTone, setPreviewSkinTone] = useState<number | null>(null);
  const [previewHairStyle, setPreviewHairStyle] = useState<number | null>(null);
  const [previewHairColor, setPreviewHairColor] = useState<number | null>(null);

  const handleClose = () => {
    onClose();
    setPreviewHue(null);
    setPreviewSuitHue(null);
    setPreviewBodyType(null);
    setPreviewSkinTone(null);
    setPreviewHairStyle(null);
    setPreviewHairColor(null);
  };

  const handleSave = () => {
    onSave({
      hue: previewHue ?? appearance?.hue ?? 0,
      suitHue: previewSuitHue ?? appearance?.suitHue ?? appearance?.hue ?? 0,
      bodyType: previewBodyType ?? appearance?.bodyType ?? 'A',
      skinTone: previewSkinTone ?? appearance?.skinTone ?? 0,
      hairStyle: previewHairStyle ?? appearance?.hairStyle ?? 1,
      hairColor: previewHairColor ?? appearance?.hairColor ?? 0,
    });
    setPreviewHue(null);
    setPreviewSuitHue(null);
    setPreviewBodyType(null);
    setPreviewSkinTone(null);
    setPreviewHairStyle(null);
    setPreviewHairColor(null);
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Customize Your Agent" maxWidth="max-w-lg">
      <div className="p-4 space-y-4">
        {/* Live preview */}
        <div className="sticky top-0 z-10 flex justify-center bg-[#0f0720]/95 backdrop-blur-sm pb-3 -mx-4 px-4 pt-1 rounded-b-2xl">
          <div className="w-44 h-64 bg-black/40 rounded-3xl p-3 border border-purple-500/20 shadow-inner loadout-hex-bg">
            <OperativeAvatar equipped={equipped} appearance={{
              ...appearance,
              hue: previewHue ?? appearance?.hue ?? 0,
              suitHue: previewSuitHue ?? appearance?.suitHue ?? appearance?.hue ?? 0,
              bodyType: previewBodyType ?? appearance?.bodyType ?? 'A',
              skinTone: previewSkinTone ?? appearance?.skinTone ?? 0,
              hairStyle: previewHairStyle ?? appearance?.hairStyle ?? 1,
              hairColor: previewHairColor ?? appearance?.hairColor ?? 0,
            }} />
          </div>
        </div>

        {/* Skin Tone */}
        <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 text-center">Skin Tone</label>
          <div className="flex justify-center gap-2">
            {SKIN_TONES.map((tone, i) => {
              const isActive = (previewSkinTone ?? appearance?.skinTone ?? 0) === i;
              return (
                <button key={i} onClick={() => setPreviewSkinTone(i)}
                  className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${isActive ? 'border-white scale-110 ring-2 ring-white/30' : 'border-white/10'}`}
                  style={{ backgroundColor: tone }} />
              );
            })}
          </div>
        </div>

        {/* Hair Style */}
        <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 text-center">Hair Style</label>
          <div className="grid grid-cols-4 gap-2">
            {HAIR_STYLE_NAMES.map((name, i) => {
              const isActive = (previewHairStyle ?? appearance?.hairStyle ?? 1) === i;
              return (
                <button key={i} onClick={() => setPreviewHairStyle(i)}
                  className={`px-2 py-2 rounded-xl text-xs font-bold transition-all ${isActive ? 'bg-purple-500/30 border-purple-500 text-white border-2' : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200'}`}>
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Hair Color */}
        <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 text-center">Hair Color</label>
          <div className="flex justify-center gap-2">
            {HAIR_COLORS.map((color, i) => {
              const isActive = (previewHairColor ?? appearance?.hairColor ?? 0) === i;
              return (
                <button key={i} onClick={() => setPreviewHairColor(i)}
                  className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${isActive ? 'border-white scale-110 ring-2 ring-white/30' : 'border-white/10'}`}
                  style={{ backgroundColor: color }} />
              );
            })}
          </div>
        </div>

        {/* Body Frame */}
        <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 text-center">Body Frame</label>
          <div className="flex justify-center gap-2">
            {(['A', 'B', 'C'] as const).map(type => {
              const isActive = (previewBodyType ?? appearance?.bodyType ?? 'A') === type;
              return (
                <button key={type} onClick={() => setPreviewBodyType(type)}
                  className={`px-3 py-2 rounded-xl border-2 transition-all font-bold text-xs ${isActive ? 'border-purple-500 bg-purple-500/20 text-white' : 'border-white/10 text-gray-500 hover:border-white/20'}`}>
                  {type === 'A' ? 'Alpha' : type === 'B' ? 'Beta' : 'Femme'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Suit Color + Energy Color row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 text-center">Suit Color</label>
            <div className="grid grid-cols-5 gap-1.5">
              {SUIT_HUE_OPTIONS.map(h => {
                const isActive = (previewSuitHue ?? appearance?.suitHue ?? appearance?.hue ?? 0) === h;
                return (
                  <button key={h} onClick={() => setPreviewSuitHue(h)}
                    className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-110 mx-auto ${isActive ? 'border-white scale-110 ring-1 ring-white/30' : 'border-transparent'}`}
                    style={{ backgroundColor: `hsl(${h}, 55%, 40%)` }} />
                );
              })}
            </div>
          </div>
          <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 text-center">Eye Color</label>
            <div className="grid grid-cols-4 gap-1.5">
              {ENERGY_HUE_OPTIONS.map(h => {
                const isActive = (previewHue ?? appearance?.hue ?? 0) === h;
                return (
                  <button key={h} onClick={() => setPreviewHue(h)}
                    className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-110 mx-auto ${isActive ? 'border-white scale-110 ring-1 ring-white/30' : 'border-transparent'}`}
                    style={{ backgroundColor: `hsl(${(h + 180) % 360}, 70%, 50%)` }} />
                );
              })}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={handleClose}
            className="flex-1 py-3 bg-white/5 border border-white/10 text-gray-400 font-bold rounded-xl hover:bg-white/10 transition">
            Cancel
          </button>
          <button onClick={handleSave}
            className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-500 transition shadow-lg shadow-purple-900/20">
            Save Profile
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default CustomizeModal;

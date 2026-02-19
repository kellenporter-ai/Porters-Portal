import React from 'react';

interface SectionPickerProps {
  availableSections: string[];
  selectedSections: string[];
  onChange: (sections: string[]) => void;
  label?: string;
}

const SectionPicker: React.FC<SectionPickerProps> = ({ availableSections, selectedSections, onChange, label = 'Target Sections' }) => {
  if (availableSections.length === 0) return null;

  const allSelected = selectedSections.length === 0;

  const toggleSection = (section: string) => {
    if (selectedSections.includes(section)) {
      onChange(selectedSections.filter(s => s !== section));
    } else {
      onChange([...selectedSections, section]);
    }
  };

  return (
    <div>
      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 px-1">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange([])}
          className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold transition ${
            allSelected
              ? 'bg-purple-600 border-purple-600 text-white'
              : 'bg-black/30 border-white/10 text-gray-400 hover:border-white/20'
          }`}
        >
          All Sections
        </button>
        {availableSections.map(s => (
          <button
            key={s}
            type="button"
            onClick={() => toggleSection(s)}
            className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold transition ${
              selectedSections.includes(s)
                ? 'bg-purple-600 border-purple-600 text-white'
                : 'bg-black/30 border-white/10 text-gray-400 hover:border-white/20'
            }`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SectionPicker;

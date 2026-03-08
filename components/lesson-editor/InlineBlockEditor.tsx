import React, { useState, useRef } from 'react';
import { LessonBlock } from '../../types';
import { Plus, Trash2, Target, Upload, Link } from 'lucide-react';
import { dataService } from '../../services/dataService';

// ──────────────────────────────────────────────
// Shared CSS class constants used across lesson editor components
// ──────────────────────────────────────────────
export const inputClass = "w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition";
export const textareaClass = "w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-purple-500/50 transition";
export const labelClass = "text-[10px] text-gray-500 uppercase font-bold tracking-widest block mb-1";

const InlineImageEditor: React.FC<{ block: LessonBlock; onUpdate: (b: LessonBlock) => void }> = ({ block, onUpdate }) => {
  const [mode, setMode] = useState<'url' | 'upload'>(block.url ? 'url' : 'upload');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please select an image file.'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('Image must be under 10 MB.'); return; }
    setError(null);
    setUploading(true);
    try {
      const url = await dataService.uploadLessonImage(file);
      onUpdate({ ...block, url });
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-1 p-0.5 bg-white/5 rounded-lg w-fit">
        <button type="button" onClick={() => setMode('url')} className={`px-3 py-1 text-xs rounded-md transition-colors ${mode === 'url' ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white'}`}><Link className="w-3 h-3 inline mr-1" />URL</button>
        <button type="button" onClick={() => setMode('upload')} className={`px-3 py-1 text-xs rounded-md transition-colors ${mode === 'upload' ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white'}`}><Upload className="w-3 h-3 inline mr-1" />Upload</button>
      </div>
      {mode === 'url' ? (
        <div><label className={labelClass}>Image URL</label><input type="text" value={block.url || ''} onChange={e => onUpdate({ ...block, url: e.target.value })} placeholder="https://..." className={inputClass} /></div>
      ) : (
        <div>
          <label className={labelClass}>Upload Image</label>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} disabled={uploading} className="hidden" />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className={`w-full border-2 border-dashed border-white/20 rounded-xl p-4 text-center transition-colors ${uploading ? 'opacity-50 cursor-wait' : 'hover:border-white/40 hover:bg-white/5 cursor-pointer'}`}>
            {uploading ? (
              <div className="flex flex-col items-center gap-1 text-gray-400">
                <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">Uploading...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1 text-gray-400">
                <Upload className="w-5 h-5" />
                <span className="text-xs">Click to select an image</span>
                <span className="text-[10px] text-gray-500">PNG, JPG, GIF, WebP — max 10 MB</span>
              </div>
            )}
          </button>
          {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
        </div>
      )}
      {block.url && <img src={block.url} alt={block.alt || ''} className="max-h-32 rounded-lg border border-white/10 object-contain" onError={e => (e.currentTarget.style.display = 'none')} />}
      <div className="grid grid-cols-2 gap-2">
        <div><label className={labelClass}>Caption</label><input type="text" value={block.caption || ''} onChange={e => onUpdate({ ...block, caption: e.target.value })} placeholder="Caption..." className={inputClass} /></div>
        <div><label className={labelClass}>Alt Text</label><input type="text" value={block.alt || ''} onChange={e => onUpdate({ ...block, alt: e.target.value })} placeholder="Describe..." className={inputClass} /></div>
      </div>
    </div>
  );
};

interface InlineBlockEditorProps {
  block: LessonBlock;
  allBlocks: LessonBlock[];
  onUpdate: (b: LessonBlock) => void;
}

const InlineBlockEditor: React.FC<InlineBlockEditorProps> = ({ block, allBlocks, onUpdate }) => {
  switch (block.type) {
    case 'TEXT':
      return <textarea value={block.content} onChange={e => onUpdate({ ...block, content: e.target.value })} placeholder="Enter text content..." className={`${textareaClass} min-h-[80px]`} rows={3} />;
    case 'SECTION_HEADER':
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <div><label className={labelClass}>Icon</label><input type="text" value={block.icon || ''} onChange={e => onUpdate({ ...block, icon: e.target.value })} placeholder="📚" className={inputClass} /></div>
            <div><label className={labelClass}>Title</label><input type="text" value={block.title || ''} onChange={e => onUpdate({ ...block, title: e.target.value })} placeholder="Section title..." className={inputClass} /></div>
          </div>
          <div><label className={labelClass}>Subtitle</label><input type="text" value={block.subtitle || ''} onChange={e => onUpdate({ ...block, subtitle: e.target.value })} placeholder="Optional subtitle..." className={inputClass} /></div>
        </div>
      );
    case 'IMAGE':
      return <InlineImageEditor block={block} onUpdate={onUpdate} />;
    case 'VIDEO':
      return (
        <div className="space-y-2">
          <div><label className={labelClass}>YouTube URL</label><input type="text" value={block.url || ''} onChange={e => onUpdate({ ...block, url: e.target.value })} placeholder="https://youtube.com/watch?v=..." className={inputClass} /></div>
          <div><label className={labelClass}>Caption</label><input type="text" value={block.caption || ''} onChange={e => onUpdate({ ...block, caption: e.target.value })} placeholder="Caption..." className={inputClass} /></div>
        </div>
      );
    case 'OBJECTIVES': {
      const items = block.items || [''];
      return (
        <div className="space-y-2">
          <div><label className={labelClass}>Title</label><input type="text" value={block.title || ''} onChange={e => onUpdate({ ...block, title: e.target.value })} className={inputClass} /></div>
          {items.map((item, idx) => (
            <div key={idx} className="flex gap-2">
              <Target className="w-4 h-4 text-emerald-400 mt-2 shrink-0" />
              <input type="text" value={item} onChange={e => { const n = [...items]; n[idx] = e.target.value; onUpdate({ ...block, items: n }); }} placeholder={`Objective ${idx + 1}`} className={`flex-1 ${inputClass}`} />
              {items.length > 1 && <button type="button" onClick={() => onUpdate({ ...block, items: items.filter((_, i) => i !== idx) })} className="p-1 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
          <button type="button" onClick={() => onUpdate({ ...block, items: [...items, ''] })} className="text-xs text-purple-400 flex items-center gap-1"><Plus className="w-3 h-3" /> Add</button>
        </div>
      );
    }
    case 'DIVIDER':
      return <div className="text-xs text-gray-500 italic">Horizontal divider — no configuration needed.</div>;
    case 'EXTERNAL_LINK':
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelClass}>Title</label><input type="text" value={block.title || ''} onChange={e => onUpdate({ ...block, title: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>URL</label><input type="text" value={block.url || ''} onChange={e => onUpdate({ ...block, url: e.target.value })} className={inputClass} /></div>
          </div>
          <div><label className={labelClass}>Description</label><input type="text" value={block.content} onChange={e => onUpdate({ ...block, content: e.target.value })} className={inputClass} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelClass}>Button Label</label><input type="text" value={block.buttonLabel || ''} onChange={e => onUpdate({ ...block, buttonLabel: e.target.value })} className={inputClass} /></div>
            <div className="flex items-end pb-1"><label className="flex items-center gap-2 text-xs text-gray-400"><input type="checkbox" checked={block.openInNewTab ?? true} onChange={e => onUpdate({ ...block, openInNewTab: e.target.checked })} /> New tab</label></div>
          </div>
        </div>
      );
    case 'EMBED':
      return (
        <div className="space-y-2">
          <div><label className={labelClass}>Embed URL</label><input type="text" value={block.url || ''} onChange={e => onUpdate({ ...block, url: e.target.value })} className={inputClass} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelClass}>Caption</label><input type="text" value={block.caption || ''} onChange={e => onUpdate({ ...block, caption: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Height (px)</label><input type="number" value={block.height || 500} onChange={e => onUpdate({ ...block, height: parseInt(e.target.value) || 500 })} className={inputClass} /></div>
          </div>
        </div>
      );
    case 'INFO_BOX':
      return (
        <div className="space-y-2">
          <div className="flex gap-2">{(['tip', 'warning', 'note'] as const).map(v => <button key={v} type="button" onClick={() => onUpdate({ ...block, variant: v })} className={`px-3 py-1 rounded-lg border text-xs font-bold capitalize transition ${block.variant === v ? (v === 'tip' ? 'bg-green-500/20 border-green-500/30 text-green-400' : v === 'warning' ? 'bg-amber-500/20 border-amber-500/30 text-amber-400' : 'bg-blue-500/20 border-blue-500/30 text-blue-400') : 'bg-black/30 border-white/10 text-gray-400'}`}>{v}</button>)}</div>
          <textarea value={block.content} onChange={e => onUpdate({ ...block, content: e.target.value })} placeholder="Content..." className={textareaClass} rows={2} />
        </div>
      );
    case 'MC': {
      const options = block.options || ['', ''];
      return (
        <div className="space-y-2">
          <textarea value={block.content} onChange={e => onUpdate({ ...block, content: e.target.value })} placeholder="Question..." className={textareaClass} rows={2} />
          {options.map((opt, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <button type="button" onClick={() => onUpdate({ ...block, correctAnswer: idx })} className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${block.correctAnswer === idx ? 'border-green-500 bg-green-500' : 'border-gray-600'}`}>{block.correctAnswer === idx && <div className="w-2 h-2 bg-white rounded-full" />}</button>
              <input type="text" value={opt} onChange={e => { const n = [...options]; n[idx] = e.target.value; onUpdate({ ...block, options: n }); }} placeholder={`Option ${String.fromCharCode(65 + idx)}`} className={`flex-1 ${inputClass}`} />
              {options.length > 2 && <button type="button" onClick={() => { const n = options.filter((_, i) => i !== idx); onUpdate({ ...block, options: n, correctAnswer: block.correctAnswer === idx ? 0 : (block.correctAnswer || 0) > idx ? (block.correctAnswer || 0) - 1 : block.correctAnswer }); }} className="p-1 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
          {options.length < 6 && <button type="button" onClick={() => onUpdate({ ...block, options: [...options, ''] })} className="text-xs text-purple-400 flex items-center gap-1"><Plus className="w-3 h-3" /> Add Option</button>}
        </div>
      );
    }
    case 'SHORT_ANSWER': {
      const answers = block.acceptedAnswers || [''];
      return (
        <div className="space-y-2">
          <textarea value={block.content} onChange={e => onUpdate({ ...block, content: e.target.value })} placeholder="Question..." className={textareaClass} rows={2} />
          <label className={labelClass}>Accepted Answers</label>
          {answers.map((ans, idx) => (
            <div key={idx} className="flex gap-2">
              <input type="text" value={ans} onChange={e => { const n = [...answers]; n[idx] = e.target.value; onUpdate({ ...block, acceptedAnswers: n }); }} placeholder={`Answer ${idx + 1}`} className={`flex-1 ${inputClass}`} />
              {answers.length > 1 && <button type="button" onClick={() => onUpdate({ ...block, acceptedAnswers: answers.filter((_, i) => i !== idx) })} className="p-1 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
          <button type="button" onClick={() => onUpdate({ ...block, acceptedAnswers: [...answers, ''] })} className="text-xs text-purple-400 flex items-center gap-1"><Plus className="w-3 h-3" /> Add Answer</button>
        </div>
      );
    }
    case 'VOCABULARY':
      return (
        <div className="grid grid-cols-2 gap-2">
          <div><label className={labelClass}>Term</label><input type="text" value={block.term || ''} onChange={e => onUpdate({ ...block, term: e.target.value })} className={inputClass} /></div>
          <div><label className={labelClass}>Definition</label><input type="text" value={block.definition || ''} onChange={e => onUpdate({ ...block, definition: e.target.value })} className={inputClass} /></div>
        </div>
      );
    case 'VOCAB_LIST': {
      const terms = block.terms || [{ term: '', definition: '' }];
      return (
        <div className="space-y-2">
          {terms.map((t, idx) => (
            <div key={idx} className="flex gap-2">
              <input type="text" value={t.term} onChange={e => { const n = [...terms]; n[idx] = { ...n[idx], term: e.target.value }; onUpdate({ ...block, terms: n }); }} placeholder="Term" className={`flex-1 ${inputClass}`} />
              <input type="text" value={t.definition} onChange={e => { const n = [...terms]; n[idx] = { ...n[idx], definition: e.target.value }; onUpdate({ ...block, terms: n }); }} placeholder="Definition" className={`flex-1 ${inputClass}`} />
              {terms.length > 1 && <button type="button" onClick={() => onUpdate({ ...block, terms: terms.filter((_, i) => i !== idx) })} className="p-1 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
          <button type="button" onClick={() => onUpdate({ ...block, terms: [...terms, { term: '', definition: '' }] })} className="text-xs text-purple-400 flex items-center gap-1"><Plus className="w-3 h-3" /> Add Term</button>
        </div>
      );
    }
    case 'CHECKLIST': {
      const items = block.items || [''];
      return (
        <div className="space-y-2">
          <textarea value={block.content} onChange={e => onUpdate({ ...block, content: e.target.value })} placeholder="Checklist title..." className={textareaClass} rows={1} />
          {items.map((item, idx) => (
            <div key={idx} className="flex gap-2"><div className="w-5 h-5 rounded border-2 border-gray-600 shrink-0 mt-1.5" />
              <input type="text" value={item} onChange={e => { const n = [...items]; n[idx] = e.target.value; onUpdate({ ...block, items: n }); }} placeholder={`Item ${idx + 1}`} className={`flex-1 ${inputClass}`} />
              {items.length > 1 && <button type="button" onClick={() => onUpdate({ ...block, items: items.filter((_, i) => i !== idx) })} className="p-1 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
          <button type="button" onClick={() => onUpdate({ ...block, items: [...items, ''] })} className="text-xs text-purple-400 flex items-center gap-1"><Plus className="w-3 h-3" /> Add Item</button>
        </div>
      );
    }
    case 'ACTIVITY':
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <div><label className={labelClass}>Icon</label><input type="text" value={block.icon || ''} onChange={e => onUpdate({ ...block, icon: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Title</label><input type="text" value={block.title || ''} onChange={e => onUpdate({ ...block, title: e.target.value })} className={inputClass} /></div>
          </div>
          <div><label className={labelClass}>Instructions</label><textarea value={block.instructions || ''} onChange={e => onUpdate({ ...block, instructions: e.target.value })} className={`${textareaClass} min-h-[60px]`} rows={2} /></div>
        </div>
      );
    case 'SORTING': {
      const sortItems = block.sortItems || [{ text: '', correct: 'left' as const }];
      return (
        <div className="space-y-2">
          <div><label className={labelClass}>Title</label><input type="text" value={block.title || ''} onChange={e => onUpdate({ ...block, title: e.target.value })} className={inputClass} /></div>
          <div><label className={labelClass}>Instructions</label><textarea value={block.instructions || ''} onChange={e => onUpdate({ ...block, instructions: e.target.value })} className={textareaClass} rows={1} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelClass}>Left Category</label><input type="text" value={block.leftLabel || ''} onChange={e => onUpdate({ ...block, leftLabel: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Right Category</label><input type="text" value={block.rightLabel || ''} onChange={e => onUpdate({ ...block, rightLabel: e.target.value })} className={inputClass} /></div>
          </div>
          {sortItems.map((item, idx) => (
            <div key={idx} className="flex gap-2">
              <input type="text" value={item.text} onChange={e => { const n = [...sortItems]; n[idx] = { ...n[idx], text: e.target.value }; onUpdate({ ...block, sortItems: n }); }} placeholder={`Item ${idx + 1}`} className={`flex-1 ${inputClass}`} />
              <select value={item.correct} onChange={e => { const n = [...sortItems]; n[idx] = { ...n[idx], correct: e.target.value as 'left' | 'right' }; onUpdate({ ...block, sortItems: n }); }} className={`w-28 ${inputClass}`}><option value="left">{block.leftLabel || 'Left'}</option><option value="right">{block.rightLabel || 'Right'}</option></select>
              {sortItems.length > 1 && <button type="button" onClick={() => onUpdate({ ...block, sortItems: sortItems.filter((_, i) => i !== idx) })} className="p-1 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
          <button type="button" onClick={() => onUpdate({ ...block, sortItems: [...sortItems, { text: '', correct: 'left' }] })} className="text-xs text-purple-400 flex items-center gap-1"><Plus className="w-3 h-3" /> Add Item</button>
        </div>
      );
    }
    case 'DATA_TABLE': {
      const columns = block.columns || [{ key: 'col1', label: 'Column 1', editable: true }];
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelClass}>Title</label><input type="text" value={block.title || ''} onChange={e => onUpdate({ ...block, title: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Rows</label><input type="number" value={block.trials || 3} onChange={e => onUpdate({ ...block, trials: parseInt(e.target.value) || 3 })} className={inputClass} /></div>
          </div>
          {columns.map((col, idx) => (
            <div key={idx} className="flex gap-2">
              <input type="text" value={col.label} onChange={e => { const n = [...columns]; n[idx] = { ...n[idx], label: e.target.value }; onUpdate({ ...block, columns: n }); }} placeholder="Label" className={`flex-1 ${inputClass}`} />
              <input type="text" value={col.unit || ''} onChange={e => { const n = [...columns]; n[idx] = { ...n[idx], unit: e.target.value }; onUpdate({ ...block, columns: n }); }} placeholder="Unit" className={`w-20 ${inputClass}`} />
              {columns.length > 1 && <button type="button" onClick={() => onUpdate({ ...block, columns: columns.filter((_, i) => i !== idx) })} className="p-1 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
          <button type="button" onClick={() => onUpdate({ ...block, columns: [...columns, { key: `col${columns.length + 1}`, label: '', editable: true }] })} className="text-xs text-purple-400 flex items-center gap-1"><Plus className="w-3 h-3" /> Add Column</button>
        </div>
      );
    }
    case 'BAR_CHART':
      return (
        <div className="space-y-2">
          <div><label className={labelClass}>Title</label><input type="text" value={block.title || ''} onChange={e => onUpdate({ ...block, title: e.target.value })} className={inputClass} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelClass}>Bars</label><input type="number" value={block.barCount || 3} onChange={e => onUpdate({ ...block, barCount: parseInt(e.target.value) || 3 })} className={inputClass} /></div>
            <div><label className={labelClass}>Height (px)</label><input type="number" value={block.height || 300} onChange={e => onUpdate({ ...block, height: parseInt(e.target.value) || 300 })} className={inputClass} /></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><label className={labelClass}>Initial</label><input type="text" value={block.initialLabel || ''} onChange={e => onUpdate({ ...block, initialLabel: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Delta</label><input type="text" value={block.deltaLabel || ''} onChange={e => onUpdate({ ...block, deltaLabel: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Final</label><input type="text" value={block.finalLabel || ''} onChange={e => onUpdate({ ...block, finalLabel: e.target.value })} className={inputClass} /></div>
          </div>
        </div>
      );
    case 'RANKING': {
      const items = block.items || [''];
      return (
        <div className="space-y-2">
          <textarea value={block.content} onChange={e => onUpdate({ ...block, content: e.target.value })} placeholder="Ranking question..." className={textareaClass} rows={2} />
          <label className={labelClass}>Items (in correct order)</label>
          {items.map((item, idx) => (
            <div key={idx} className="flex gap-2">
              <span className="text-xs font-mono text-gray-600 mt-2 w-5 text-right">{idx + 1}.</span>
              <input type="text" value={item} onChange={e => { const n = [...items]; n[idx] = e.target.value; onUpdate({ ...block, items: n }); }} className={`flex-1 ${inputClass}`} />
              {items.length > 1 && <button type="button" onClick={() => onUpdate({ ...block, items: items.filter((_, i) => i !== idx) })} className="p-1 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
          <button type="button" onClick={() => onUpdate({ ...block, items: [...items, ''] })} className="text-xs text-purple-400 flex items-center gap-1"><Plus className="w-3 h-3" /> Add Item</button>
        </div>
      );
    }
    case 'LINKED': {
      const linkable = allBlocks.filter(b => b.id !== block.id && ['MC', 'SHORT_ANSWER', 'RANKING'].includes(b.type));
      const answers = block.acceptedAnswers || [''];
      return (
        <div className="space-y-2">
          <div><label className={labelClass}>Reference Block</label><select value={block.linkedBlockId || ''} onChange={e => onUpdate({ ...block, linkedBlockId: e.target.value })} className={inputClass}><option value="">Select...</option>{linkable.map(b => <option key={b.id} value={b.id}>{b.type}: {(b.content || '').slice(0, 40)}</option>)}</select></div>
          <textarea value={block.content} onChange={e => onUpdate({ ...block, content: e.target.value })} placeholder="Follow-up question..." className={textareaClass} rows={2} />
          <label className={labelClass}>Accepted Answers</label>
          {answers.map((ans, idx) => (
            <div key={idx} className="flex gap-2">
              <input type="text" value={ans} onChange={e => { const n = [...answers]; n[idx] = e.target.value; onUpdate({ ...block, acceptedAnswers: n }); }} className={`flex-1 ${inputClass}`} />
              {answers.length > 1 && <button type="button" onClick={() => onUpdate({ ...block, acceptedAnswers: answers.filter((_, i) => i !== idx) })} className="p-1 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
            </div>
          ))}
          <button type="button" onClick={() => onUpdate({ ...block, acceptedAnswers: [...answers, ''] })} className="text-xs text-purple-400 flex items-center gap-1"><Plus className="w-3 h-3" /> Add Answer</button>
        </div>
      );
    }
    case 'DRAWING': {
      return (
        <div className="space-y-2">
          <div><label className={labelClass}>Prompt / Title</label><input type="text" value={block.title || ''} onChange={e => onUpdate({ ...block, title: e.target.value })} placeholder="e.g. Draw a free body diagram..." className={inputClass} /></div>
          <div><label className={labelClass}>Instructions</label><textarea value={block.instructions || ''} onChange={e => onUpdate({ ...block, instructions: e.target.value })} placeholder="Additional instructions..." className={textareaClass} rows={2} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Drawing Mode</label>
              <select value={block.drawingMode || 'free'} onChange={e => onUpdate({ ...block, drawingMode: e.target.value as 'free' | 'point_model' | 'extended_body' })} className={inputClass}>
                <option value="free">Free Draw</option>
                <option value="point_model">Point Model (forces from center)</option>
                <option value="extended_body">Extended Rigid Body</option>
              </select>
            </div>
            <div><label className={labelClass}>Canvas Height (px)</label><input type="number" value={block.canvasHeight || 400} onChange={e => onUpdate({ ...block, canvasHeight: parseInt(e.target.value) || 400 })} className={inputClass} /></div>
          </div>
          <div><label className={labelClass}>Background Image URL (optional)</label><input type="text" value={block.backgroundImage || ''} onChange={e => onUpdate({ ...block, backgroundImage: e.target.value })} placeholder="https://..." className={inputClass} /></div>
        </div>
      );
    }
    case 'MATH_RESPONSE': {
      const labels = block.stepLabels || ['Given:', 'Find:', 'Step 1:', 'Step 2:', 'Step 3:'];
      return (
        <div className="space-y-2">
          <div><label className={labelClass}>Prompt / Title</label><input type="text" value={block.title || ''} onChange={e => onUpdate({ ...block, title: e.target.value })} placeholder="e.g. Show your work for..." className={inputClass} /></div>
          <div><label className={labelClass}>Question</label><textarea value={block.content} onChange={e => onUpdate({ ...block, content: e.target.value })} placeholder="Question text..." className={textareaClass} rows={2} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelClass}>Max Steps</label><input type="number" value={block.maxSteps || 10} onChange={e => onUpdate({ ...block, maxSteps: parseInt(e.target.value) || 10 })} className={inputClass} /></div>
            <div className="flex items-end pb-1"><label className="flex items-center gap-2 text-xs text-gray-400"><input type="checkbox" checked={block.showLatexHelp ?? true} onChange={e => onUpdate({ ...block, showLatexHelp: e.target.checked })} /> Show symbol toolbar</label></div>
          </div>
          <div>
            <label className={labelClass}>Step Label Suggestions (comma-separated)</label>
            <input type="text" value={labels.join(', ')} onChange={e => onUpdate({ ...block, stepLabels: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="Given:, Find:, Step 1:, Step 2:" className={inputClass} />
          </div>
        </div>
      );
    }
    default:
      return <div className="text-xs text-gray-500 italic">Unknown block type: {block.type}</div>;
  }
};

export default InlineBlockEditor;

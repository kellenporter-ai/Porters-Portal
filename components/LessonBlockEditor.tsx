
import React, { useState, useCallback } from 'react';
import {
  Plus, Trash2, ChevronUp, ChevronDown, Type, HelpCircle, MessageSquare,
  BookOpen, ListChecks, Info, Eye, Edit2, GripVertical, Copy, Heading,
  Image, Play, Target, Minus, ExternalLink, Code, List, Zap,
  ArrowUpDown, Table, BarChart3, Link, Upload, X
} from 'lucide-react';
import { LessonBlock, BlockType } from '../types';
import LessonBlocks from './LessonBlocks';

interface LessonBlockEditorProps {
  blocks: LessonBlock[];
  onChange: (blocks: LessonBlock[]) => void;
}

const BLOCK_TYPES: { type: BlockType; label: string; icon: React.ReactNode; description: string; category: string }[] = [
  // Content
  { type: 'TEXT', label: 'Text', icon: <Type className="w-4 h-4" />, description: 'Plain text content', category: 'Content' },
  { type: 'SECTION_HEADER', label: 'Section Header', icon: <Heading className="w-4 h-4" />, description: 'Section with title & subtitle', category: 'Content' },
  { type: 'IMAGE', label: 'Image', icon: <Image className="w-4 h-4" />, description: 'Image with caption', category: 'Content' },
  { type: 'VIDEO', label: 'Video', icon: <Play className="w-4 h-4" />, description: 'YouTube video embed', category: 'Content' },
  { type: 'OBJECTIVES', label: 'Objectives', icon: <Target className="w-4 h-4" />, description: 'Learning objectives list', category: 'Content' },
  { type: 'DIVIDER', label: 'Divider', icon: <Minus className="w-4 h-4" />, description: 'Horizontal separator', category: 'Content' },
  { type: 'EXTERNAL_LINK', label: 'External Link', icon: <ExternalLink className="w-4 h-4" />, description: 'Styled link card', category: 'Content' },
  { type: 'EMBED', label: 'Embed', icon: <Code className="w-4 h-4" />, description: 'iFrame embed (Forms, Docs)', category: 'Content' },
  { type: 'INFO_BOX', label: 'Info Box', icon: <Info className="w-4 h-4" />, description: 'Tip, warning, or note', category: 'Content' },
  // Interactive
  { type: 'VOCABULARY', label: 'Vocabulary', icon: <BookOpen className="w-4 h-4" />, description: 'Term & definition card', category: 'Interactive' },
  { type: 'VOCAB_LIST', label: 'Vocab List', icon: <List className="w-4 h-4" />, description: 'Multiple term/definition pairs', category: 'Interactive' },
  { type: 'ACTIVITY', label: 'Activity', icon: <Zap className="w-4 h-4" />, description: 'Activity instructions box', category: 'Interactive' },
  { type: 'CHECKLIST', label: 'Checklist', icon: <ListChecks className="w-4 h-4" />, description: 'Completable task list', category: 'Interactive' },
  { type: 'SORTING', label: 'Sorting', icon: <ArrowUpDown className="w-4 h-4" />, description: 'Sort items into two categories', category: 'Interactive' },
  { type: 'DATA_TABLE', label: 'Data Table', icon: <Table className="w-4 h-4" />, description: 'Editable data table', category: 'Interactive' },
  { type: 'BAR_CHART', label: 'Bar Chart', icon: <BarChart3 className="w-4 h-4" />, description: 'Interactive bar chart', category: 'Interactive' },
  // Questions
  { type: 'MC', label: 'Multiple Choice', icon: <HelpCircle className="w-4 h-4" />, description: 'Question with options', category: 'Questions' },
  { type: 'SHORT_ANSWER', label: 'Short Answer', icon: <MessageSquare className="w-4 h-4" />, description: 'Free-text question', category: 'Questions' },
  { type: 'RANKING', label: 'Ranking', icon: <GripVertical className="w-4 h-4" />, description: 'Drag to reorder items', category: 'Questions' },
  { type: 'LINKED', label: 'Linked Question', icon: <Link className="w-4 h-4" />, description: 'Follow-up referencing prior block', category: 'Questions' },
];

const generateId = () => `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const createEmptyBlock = (type: BlockType): LessonBlock => {
  const base: LessonBlock = { id: generateId(), type, content: '' };
  switch (type) {
    case 'MC':
      return { ...base, options: ['', ''], correctAnswer: 0 };
    case 'SHORT_ANSWER':
      return { ...base, acceptedAnswers: [''] };
    case 'VOCABULARY':
      return { ...base, term: '', definition: '' };
    case 'CHECKLIST':
      return { ...base, items: [''] };
    case 'INFO_BOX':
      return { ...base, variant: 'note' };
    case 'SECTION_HEADER':
      return { ...base, icon: '📚', title: '', subtitle: '' };
    case 'IMAGE':
      return { ...base, url: '', caption: '', alt: '' };
    case 'VIDEO':
      return { ...base, url: '', caption: '' };
    case 'OBJECTIVES':
      return { ...base, title: 'Learning Objectives', items: [''] };
    case 'DIVIDER':
      return base;
    case 'EXTERNAL_LINK':
      return { ...base, title: '', url: '', buttonLabel: 'Open', openInNewTab: true };
    case 'EMBED':
      return { ...base, url: '', caption: '', height: 500 };
    case 'VOCAB_LIST':
      return { ...base, terms: [{ term: '', definition: '' }] };
    case 'ACTIVITY':
      return { ...base, icon: '⚡', title: '', instructions: '' };
    case 'SORTING':
      return { ...base, title: '', instructions: '', leftLabel: 'Category A', rightLabel: 'Category B', sortItems: [{ text: '', correct: 'left' }] };
    case 'DATA_TABLE':
      return { ...base, title: '', columns: [{ key: 'col1', label: 'Column 1', editable: true }], trials: 3 };
    case 'BAR_CHART':
      return { ...base, title: '', barCount: 3, initialLabel: 'Initial', finalLabel: 'Final', deltaLabel: 'Change', height: 300 };
    case 'RANKING':
      return { ...base, items: [''] };
    case 'LINKED':
      return { ...base, linkedBlockId: '' };
    default:
      return base;
  }
};

// ──────────────────────────────────────────────
// Shared input helpers
// ──────────────────────────────────────────────

const inputClass = "w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition";
const textareaClass = "w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-purple-500/50 transition";
const labelClass = "text-[10px] text-gray-500 uppercase font-bold tracking-widest block mb-1";

// ──────────────────────────────────────────────
// Original block editors
// ──────────────────────────────────────────────

const TextBlockEditor: React.FC<{ block: LessonBlock; onUpdate: (b: LessonBlock) => void }> = ({ block, onUpdate }) => (
  <textarea
    value={block.content}
    onChange={e => onUpdate({ ...block, content: e.target.value })}
    placeholder="Enter text content..."
    className={`${textareaClass} min-h-[80px]`}
    rows={3}
  />
);

const MCBlockEditor: React.FC<{ block: LessonBlock; onUpdate: (b: LessonBlock) => void }> = ({ block, onUpdate }) => {
  const options = block.options || ['', ''];

  const addOption = () => onUpdate({ ...block, options: [...options, ''] });
  const removeOption = (idx: number) => {
    if (options.length <= 2) return;
    const newOpts = options.filter((_, i) => i !== idx);
    const newCorrect = block.correctAnswer === idx ? 0 : (block.correctAnswer || 0) > idx ? (block.correctAnswer || 0) - 1 : block.correctAnswer;
    onUpdate({ ...block, options: newOpts, correctAnswer: newCorrect });
  };
  const updateOption = (idx: number, val: string) => {
    const newOpts = [...options];
    newOpts[idx] = val;
    onUpdate({ ...block, options: newOpts });
  };

  return (
    <div className="space-y-3">
      <textarea
        value={block.content}
        onChange={e => onUpdate({ ...block, content: e.target.value })}
        placeholder="Enter the question..."
        className={textareaClass}
        rows={2}
      />
      <div className="space-y-2">
        <label className={labelClass}>Options (click radio to mark correct)</label>
        {options.map((opt, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onUpdate({ ...block, correctAnswer: idx })}
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition ${
                block.correctAnswer === idx ? 'border-green-500 bg-green-500' : 'border-gray-600 hover:border-gray-400'
              }`}
            >
              {block.correctAnswer === idx && <div className="w-2 h-2 bg-white rounded-full" />}
            </button>
            <input
              type="text"
              value={opt}
              onChange={e => updateOption(idx, e.target.value)}
              placeholder={`Option ${String.fromCharCode(65 + idx)}`}
              className={`flex-1 ${inputClass}`}
            />
            {options.length > 2 && (
              <button type="button" onClick={() => removeOption(idx)} className="p-1 text-red-400 hover:bg-red-500/10 rounded transition">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        {options.length < 6 && (
          <button type="button" onClick={addOption} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition">
            <Plus className="w-3 h-3" /> Add Option
          </button>
        )}
      </div>
    </div>
  );
};

const ShortAnswerEditor: React.FC<{ block: LessonBlock; onUpdate: (b: LessonBlock) => void }> = ({ block, onUpdate }) => {
  const answers = block.acceptedAnswers || [''];

  const addAnswer = () => onUpdate({ ...block, acceptedAnswers: [...answers, ''] });
  const removeAnswer = (idx: number) => {
    if (answers.length <= 1) return;
    onUpdate({ ...block, acceptedAnswers: answers.filter((_, i) => i !== idx) });
  };
  const updateAnswer = (idx: number, val: string) => {
    const newAnswers = [...answers];
    newAnswers[idx] = val;
    onUpdate({ ...block, acceptedAnswers: newAnswers });
  };

  return (
    <div className="space-y-3">
      <textarea
        value={block.content}
        onChange={e => onUpdate({ ...block, content: e.target.value })}
        placeholder="Enter the question..."
        className={textareaClass}
        rows={2}
      />
      <div className="space-y-2">
        <label className={labelClass}>Accepted Answers (case-insensitive)</label>
        {answers.map((ans, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              type="text"
              value={ans}
              onChange={e => updateAnswer(idx, e.target.value)}
              placeholder={`Accepted answer ${idx + 1}`}
              className={`flex-1 ${inputClass}`}
            />
            {answers.length > 1 && (
              <button type="button" onClick={() => removeAnswer(idx)} className="p-1 text-red-400 hover:bg-red-500/10 rounded transition">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={addAnswer} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition">
          <Plus className="w-3 h-3" /> Add Accepted Answer
        </button>
      </div>
    </div>
  );
};

const VocabularyEditor: React.FC<{ block: LessonBlock; onUpdate: (b: LessonBlock) => void }> = ({ block, onUpdate }) => (
  <div className="grid grid-cols-2 gap-3">
    <div>
      <label className={labelClass}>Term</label>
      <input type="text" value={block.term || ''} onChange={e => onUpdate({ ...block, term: e.target.value })} placeholder="Term..." className={inputClass} />
    </div>
    <div>
      <label className={labelClass}>Definition</label>
      <input type="text" value={block.definition || ''} onChange={e => onUpdate({ ...block, definition: e.target.value })} placeholder="Definition..." className={inputClass} />
    </div>
  </div>
);

const ChecklistEditor: React.FC<{ block: LessonBlock; onUpdate: (b: LessonBlock) => void }> = ({ block, onUpdate }) => {
  const items = block.items || [''];

  const addItem = () => onUpdate({ ...block, items: [...items, ''] });
  const removeItem = (idx: number) => {
    if (items.length <= 1) return;
    onUpdate({ ...block, items: items.filter((_, i) => i !== idx) });
  };
  const updateItem = (idx: number, val: string) => {
    const newItems = [...items];
    newItems[idx] = val;
    onUpdate({ ...block, items: newItems });
  };

  return (
    <div className="space-y-3">
      <textarea
        value={block.content}
        onChange={e => onUpdate({ ...block, content: e.target.value })}
        placeholder="Checklist title/instructions..."
        className={textareaClass}
        rows={1}
      />
      <div className="space-y-2">
        <label className={labelClass}>Items</label>
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className="w-5 h-5 rounded border-2 border-gray-600 shrink-0" />
            <input type="text" value={item} onChange={e => updateItem(idx, e.target.value)} placeholder={`Item ${idx + 1}`} className={`flex-1 ${inputClass}`} />
            {items.length > 1 && (
              <button type="button" onClick={() => removeItem(idx)} className="p-1 text-red-400 hover:bg-red-500/10 rounded transition">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={addItem} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition">
          <Plus className="w-3 h-3" /> Add Item
        </button>
      </div>
    </div>
  );
};

const InfoBoxEditor: React.FC<{ block: LessonBlock; onUpdate: (b: LessonBlock) => void }> = ({ block, onUpdate }) => (
  <div className="space-y-3">
    <div>
      <label className={labelClass}>Variant</label>
      <div className="flex gap-2">
        {(['tip', 'warning', 'note'] as const).map(v => (
          <button
            key={v}
            type="button"
            onClick={() => onUpdate({ ...block, variant: v })}
            className={`px-3 py-1.5 rounded-lg border text-xs font-bold capitalize transition ${
              block.variant === v
                ? v === 'tip' ? 'bg-green-500/20 border-green-500/30 text-green-400'
                  : v === 'warning' ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                  : 'bg-blue-500/20 border-blue-500/30 text-blue-400'
                : 'bg-black/30 border-white/10 text-gray-400 hover:text-white'
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
    <textarea value={block.content} onChange={e => onUpdate({ ...block, content: e.target.value })} placeholder="Info box content..." className={textareaClass} rows={2} />
  </div>
);

// ──────────────────────────────────────────────
// NEW block editors
// ──────────────────────────────────────────────

const SectionHeaderEditor: React.FC<{ block: LessonBlock; onUpdate: (b: LessonBlock) => void }> = ({ block, onUpdate }) => (
  <div className="space-y-3">
    <div className="grid grid-cols-[80px_1fr] gap-3">
      <div>
        <label className={labelClass}>Icon</label>
        <input type="text" value={block.icon || ''} onChange={e => onUpdate({ ...block, icon: e.target.value })} placeholder="📚" className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Title</label>
        <input type="text" value={block.title || ''} onChange={e => onUpdate({ ...block, title: e.target.value })} placeholder="Section title..." className={inputClass} />
      </div>
    </div>
    <div>
      <label className={labelClass}>Subtitle</label>
      <input type="text" value={block.subtitle || ''} onChange={e => onUpdate({ ...block, subtitle: e.target.value })} placeholder="Optional subtitle..." className={inputClass} />
    </div>
  </div>
);

const ImageEditor: React.FC<{ block: LessonBlock; onUpdate: (b: LessonBlock) => void }> = ({ block, onUpdate }) => (
  <div className="space-y-3">
    <div>
      <label className={labelClass}>Image URL</label>
      <input type="text" value={block.url || ''} onChange={e => onUpdate({ ...block, url: e.target.value })} placeholder="https://..." className={inputClass} />
    </div>
    {block.url && (
      <div className="rounded-xl overflow-hidden border border-white/10 max-h-48">
        <img src={block.url} alt={block.alt || ''} className="w-full h-full object-contain bg-black/30" onError={e => (e.currentTarget.style.display = 'none')} />
      </div>
    )}
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className={labelClass}>Caption</label>
        <input type="text" value={block.caption || ''} onChange={e => onUpdate({ ...block, caption: e.target.value })} placeholder="Image caption..." className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Alt Text</label>
        <input type="text" value={block.alt || ''} onChange={e => onUpdate({ ...block, alt: e.target.value })} placeholder="Describe the image..." className={inputClass} />
      </div>
    </div>
  </div>
);

const VideoEditor: React.FC<{ block: LessonBlock; onUpdate: (b: LessonBlock) => void }> = ({ block, onUpdate }) => {
  const getEmbedUrl = (url: string) => {
    const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : '';
  };
  const embedUrl = getEmbedUrl(block.url || '');

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>YouTube URL</label>
        <input type="text" value={block.url || ''} onChange={e => onUpdate({ ...block, url: e.target.value })} placeholder="https://youtube.com/watch?v=..." className={inputClass} />
      </div>
      {embedUrl && (
        <div className="rounded-xl overflow-hidden border border-white/10 aspect-video">
          <iframe src={embedUrl} className="w-full h-full" allowFullScreen title="Video preview" />
        </div>
      )}
      <div>
        <label className={labelClass}>Caption</label>
        <input type="text" value={block.caption || ''} onChange={e => onUpdate({ ...block, caption: e.target.value })} placeholder="Video caption..." className={inputClass} />
      </div>
    </div>
  );
};

const ObjectivesEditor: React.FC<{ block: LessonBlock; onUpdate: (b: LessonBlock) => void }> = ({ block, onUpdate }) => {
  const items = block.items || [''];
  const addItem = () => onUpdate({ ...block, items: [...items, ''] });
  const removeItem = (idx: number) => {
    if (items.length <= 1) return;
    onUpdate({ ...block, items: items.filter((_, i) => i !== idx) });
  };
  const updateItem = (idx: number, val: string) => {
    const next = [...items];
    next[idx] = val;
    onUpdate({ ...block, items: next });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Title</label>
        <input type="text" value={block.title || ''} onChange={e => onUpdate({ ...block, title: e.target.value })} placeholder="Learning Objectives" className={inputClass} />
      </div>
      <div className="space-y-2">
        <label className={labelClass}>Objectives</label>
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-400 shrink-0" />
            <input type="text" value={item} onChange={e => updateItem(idx, e.target.value)} placeholder={`Objective ${idx + 1}`} className={`flex-1 ${inputClass}`} />
            {items.length > 1 && (
              <button type="button" onClick={() => removeItem(idx)} className="p-1 text-red-400 hover:bg-red-500/10 rounded transition"><Trash2 className="w-3.5 h-3.5" /></button>
            )}
          </div>
        ))}
        <button type="button" onClick={addItem} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition">
          <Plus className="w-3 h-3" /> Add Objective
        </button>
      </div>
    </div>
  );
};

const ExternalLinkEditor: React.FC<{ block: LessonBlock; onUpdate: (b: LessonBlock) => void }> = ({ block, onUpdate }) => (
  <div className="space-y-3">
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className={labelClass}>Title</label>
        <input type="text" value={block.title || ''} onChange={e => onUpdate({ ...block, title: e.target.value })} placeholder="Link title..." className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>URL</label>
        <input type="text" value={block.url || ''} onChange={e => onUpdate({ ...block, url: e.target.value })} placeholder="https://..." className={inputClass} />
      </div>
    </div>
    <div>
      <label className={labelClass}>Description</label>
      <input type="text" value={block.content} onChange={e => onUpdate({ ...block, content: e.target.value })} placeholder="Brief description..." className={inputClass} />
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className={labelClass}>Button Label</label>
        <input type="text" value={block.buttonLabel || ''} onChange={e => onUpdate({ ...block, buttonLabel: e.target.value })} placeholder="Open" className={inputClass} />
      </div>
      <div className="flex items-end pb-1">
        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
          <input type="checkbox" checked={block.openInNewTab ?? true} onChange={e => onUpdate({ ...block, openInNewTab: e.target.checked })} className="rounded" />
          Open in new tab
        </label>
      </div>
    </div>
  </div>
);

const EmbedEditor: React.FC<{ block: LessonBlock; onUpdate: (b: LessonBlock) => void }> = ({ block, onUpdate }) => (
  <div className="space-y-3">
    <div>
      <label className={labelClass}>Embed URL</label>
      <input type="text" value={block.url || ''} onChange={e => onUpdate({ ...block, url: e.target.value })} placeholder="https://docs.google.com/..." className={inputClass} />
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className={labelClass}>Caption</label>
        <input type="text" value={block.caption || ''} onChange={e => onUpdate({ ...block, caption: e.target.value })} placeholder="Optional caption..." className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Height (px)</label>
        <input type="number" value={block.height || 500} onChange={e => onUpdate({ ...block, height: parseInt(e.target.value) || 500 })} className={inputClass} />
      </div>
    </div>
  </div>
);

const VocabListEditor: React.FC<{ block: LessonBlock; onUpdate: (b: LessonBlock) => void }> = ({ block, onUpdate }) => {
  const terms = block.terms || [{ term: '', definition: '' }];
  const addTerm = () => onUpdate({ ...block, terms: [...terms, { term: '', definition: '' }] });
  const removeTerm = (idx: number) => {
    if (terms.length <= 1) return;
    onUpdate({ ...block, terms: terms.filter((_, i) => i !== idx) });
  };
  const updateTerm = (idx: number, field: 'term' | 'definition', val: string) => {
    const next = [...terms];
    next[idx] = { ...next[idx], [field]: val };
    onUpdate({ ...block, terms: next });
  };

  return (
    <div className="space-y-3">
      <label className={labelClass}>Terms & Definitions</label>
      {terms.map((t, idx) => (
        <div key={idx} className="flex items-start gap-2">
          <span className="text-xs font-mono text-gray-600 mt-2.5 w-5 text-right shrink-0">{idx + 1}.</span>
          <div className="flex-1 grid grid-cols-2 gap-2">
            <input type="text" value={t.term} onChange={e => updateTerm(idx, 'term', e.target.value)} placeholder="Term" className={inputClass} />
            <input type="text" value={t.definition} onChange={e => updateTerm(idx, 'definition', e.target.value)} placeholder="Definition" className={inputClass} />
          </div>
          {terms.length > 1 && (
            <button type="button" onClick={() => removeTerm(idx)} className="p-1 mt-1.5 text-red-400 hover:bg-red-500/10 rounded transition"><Trash2 className="w-3.5 h-3.5" /></button>
          )}
        </div>
      ))}
      <button type="button" onClick={addTerm} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition">
        <Plus className="w-3 h-3" /> Add Term
      </button>
    </div>
  );
};

const ActivityEditor: React.FC<{ block: LessonBlock; onUpdate: (b: LessonBlock) => void }> = ({ block, onUpdate }) => (
  <div className="space-y-3">
    <div className="grid grid-cols-[80px_1fr] gap-3">
      <div>
        <label className={labelClass}>Icon</label>
        <input type="text" value={block.icon || ''} onChange={e => onUpdate({ ...block, icon: e.target.value })} placeholder="⚡" className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Title</label>
        <input type="text" value={block.title || ''} onChange={e => onUpdate({ ...block, title: e.target.value })} placeholder="Activity title..." className={inputClass} />
      </div>
    </div>
    <div>
      <label className={labelClass}>Instructions</label>
      <textarea value={block.instructions || ''} onChange={e => onUpdate({ ...block, instructions: e.target.value })} placeholder="Describe the activity..." className={`${textareaClass} min-h-[80px]`} rows={3} />
    </div>
  </div>
);

const SortingEditor: React.FC<{ block: LessonBlock; onUpdate: (b: LessonBlock) => void }> = ({ block, onUpdate }) => {
  const items = block.sortItems || [{ text: '', correct: 'left' as const }];
  const addItem = () => onUpdate({ ...block, sortItems: [...items, { text: '', correct: 'left' }] });
  const removeItem = (idx: number) => {
    if (items.length <= 1) return;
    onUpdate({ ...block, sortItems: items.filter((_, i) => i !== idx) });
  };
  const updateItem = (idx: number, field: 'text' | 'correct', val: string) => {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: val };
    onUpdate({ ...block, sortItems: next });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Title</label>
        <input type="text" value={block.title || ''} onChange={e => onUpdate({ ...block, title: e.target.value })} placeholder="Sorting activity title..." className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Instructions</label>
        <textarea value={block.instructions || ''} onChange={e => onUpdate({ ...block, instructions: e.target.value })} placeholder="Explain what to sort..." className={textareaClass} rows={2} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Left Category</label>
          <input type="text" value={block.leftLabel || ''} onChange={e => onUpdate({ ...block, leftLabel: e.target.value })} placeholder="Category A" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Right Category</label>
          <input type="text" value={block.rightLabel || ''} onChange={e => onUpdate({ ...block, rightLabel: e.target.value })} placeholder="Category B" className={inputClass} />
        </div>
      </div>
      <div className="space-y-2">
        <label className={labelClass}>Items (select correct category)</label>
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input type="text" value={item.text} onChange={e => updateItem(idx, 'text', e.target.value)} placeholder={`Item ${idx + 1}`} className={`flex-1 ${inputClass}`} />
            <select value={item.correct} onChange={e => updateItem(idx, 'correct', e.target.value)} className={`w-32 ${inputClass}`}>
              <option value="left">{block.leftLabel || 'Left'}</option>
              <option value="right">{block.rightLabel || 'Right'}</option>
            </select>
            {items.length > 1 && (
              <button type="button" onClick={() => removeItem(idx)} className="p-1 text-red-400 hover:bg-red-500/10 rounded transition"><Trash2 className="w-3.5 h-3.5" /></button>
            )}
          </div>
        ))}
        <button type="button" onClick={addItem} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition">
          <Plus className="w-3 h-3" /> Add Item
        </button>
      </div>
    </div>
  );
};

const DataTableEditor: React.FC<{ block: LessonBlock; onUpdate: (b: LessonBlock) => void }> = ({ block, onUpdate }) => {
  const columns = block.columns || [{ key: 'col1', label: 'Column 1', editable: true }];
  const addColumn = () => {
    const key = `col${columns.length + 1}`;
    onUpdate({ ...block, columns: [...columns, { key, label: '', editable: true }] });
  };
  const removeColumn = (idx: number) => {
    if (columns.length <= 1) return;
    onUpdate({ ...block, columns: columns.filter((_, i) => i !== idx) });
  };
  const updateColumn = (idx: number, field: string, val: string | boolean) => {
    const next = [...columns];
    next[idx] = { ...next[idx], [field]: val };
    onUpdate({ ...block, columns: next });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Title</label>
          <input type="text" value={block.title || ''} onChange={e => onUpdate({ ...block, title: e.target.value })} placeholder="Table title..." className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Number of Rows</label>
          <input type="number" value={block.trials || 3} onChange={e => onUpdate({ ...block, trials: parseInt(e.target.value) || 3 })} min={1} max={20} className={inputClass} />
        </div>
      </div>
      <div className="space-y-2">
        <label className={labelClass}>Columns</label>
        {columns.map((col, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input type="text" value={col.label} onChange={e => updateColumn(idx, 'label', e.target.value)} placeholder={`Column label`} className={`flex-1 ${inputClass}`} />
            <input type="text" value={col.unit || ''} onChange={e => updateColumn(idx, 'unit', e.target.value)} placeholder="Unit" className={`w-24 ${inputClass}`} />
            <label className="flex items-center gap-1 text-[10px] text-gray-400 whitespace-nowrap">
              <input type="checkbox" checked={col.editable !== false} onChange={e => updateColumn(idx, 'editable', e.target.checked)} />
              Editable
            </label>
            {columns.length > 1 && (
              <button type="button" onClick={() => removeColumn(idx)} className="p-1 text-red-400 hover:bg-red-500/10 rounded transition"><Trash2 className="w-3.5 h-3.5" /></button>
            )}
          </div>
        ))}
        <button type="button" onClick={addColumn} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition">
          <Plus className="w-3 h-3" /> Add Column
        </button>
      </div>
    </div>
  );
};

const BarChartEditor: React.FC<{ block: LessonBlock; onUpdate: (b: LessonBlock) => void }> = ({ block, onUpdate }) => (
  <div className="space-y-3">
    <div>
      <label className={labelClass}>Title</label>
      <input type="text" value={block.title || ''} onChange={e => onUpdate({ ...block, title: e.target.value })} placeholder="Chart title..." className={inputClass} />
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className={labelClass}>Number of Bars</label>
        <input type="number" value={block.barCount || 3} onChange={e => onUpdate({ ...block, barCount: parseInt(e.target.value) || 3 })} min={1} max={10} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Chart Height (px)</label>
        <input type="number" value={block.height || 300} onChange={e => onUpdate({ ...block, height: parseInt(e.target.value) || 300 })} className={inputClass} />
      </div>
    </div>
    <div className="grid grid-cols-3 gap-3">
      <div>
        <label className={labelClass}>Initial Label</label>
        <input type="text" value={block.initialLabel || ''} onChange={e => onUpdate({ ...block, initialLabel: e.target.value })} placeholder="Initial" className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Delta Label</label>
        <input type="text" value={block.deltaLabel || ''} onChange={e => onUpdate({ ...block, deltaLabel: e.target.value })} placeholder="Change" className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Final Label</label>
        <input type="text" value={block.finalLabel || ''} onChange={e => onUpdate({ ...block, finalLabel: e.target.value })} placeholder="Final" className={inputClass} />
      </div>
    </div>
  </div>
);

const RankingEditor: React.FC<{ block: LessonBlock; onUpdate: (b: LessonBlock) => void }> = ({ block, onUpdate }) => {
  const items = block.items || [''];
  const addItem = () => onUpdate({ ...block, items: [...items, ''] });
  const removeItem = (idx: number) => {
    if (items.length <= 1) return;
    onUpdate({ ...block, items: items.filter((_, i) => i !== idx) });
  };
  const updateItem = (idx: number, val: string) => {
    const next = [...items];
    next[idx] = val;
    onUpdate({ ...block, items: next });
  };

  return (
    <div className="space-y-3">
      <textarea value={block.content} onChange={e => onUpdate({ ...block, content: e.target.value })} placeholder="Enter the ranking question..." className={textareaClass} rows={2} />
      <div className="space-y-2">
        <label className={labelClass}>Items (in correct order — students will see them shuffled)</label>
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="text-xs font-mono text-gray-600 w-5 text-right shrink-0">{idx + 1}.</span>
            <input type="text" value={item} onChange={e => updateItem(idx, e.target.value)} placeholder={`Item ${idx + 1}`} className={`flex-1 ${inputClass}`} />
            {items.length > 1 && (
              <button type="button" onClick={() => removeItem(idx)} className="p-1 text-red-400 hover:bg-red-500/10 rounded transition"><Trash2 className="w-3.5 h-3.5" /></button>
            )}
          </div>
        ))}
        <button type="button" onClick={addItem} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition">
          <Plus className="w-3 h-3" /> Add Item
        </button>
      </div>
    </div>
  );
};

const LinkedEditor: React.FC<{ block: LessonBlock; allBlocks: LessonBlock[]; onUpdate: (b: LessonBlock) => void }> = ({ block, allBlocks, onUpdate }) => {
  const linkableBlocks = allBlocks.filter(b => b.id !== block.id && ['MC', 'SHORT_ANSWER', 'RANKING'].includes(b.type));

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Reference Block</label>
        <select value={block.linkedBlockId || ''} onChange={e => onUpdate({ ...block, linkedBlockId: e.target.value })} className={inputClass}>
          <option value="">Select a question block...</option>
          {linkableBlocks.map(b => (
            <option key={b.id} value={b.id}>{b.type}: {(b.content || '').slice(0, 50)}{(b.content || '').length > 50 ? '...' : ''}</option>
          ))}
        </select>
      </div>
      <textarea value={block.content} onChange={e => onUpdate({ ...block, content: e.target.value })} placeholder="Follow-up question..." className={textareaClass} rows={2} />
      <div className="space-y-2">
        <label className={labelClass}>Accepted Answers (case-insensitive)</label>
        {(block.acceptedAnswers || ['']).map((ans, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              type="text"
              value={ans}
              onChange={e => {
                const next = [...(block.acceptedAnswers || [''])];
                next[idx] = e.target.value;
                onUpdate({ ...block, acceptedAnswers: next });
              }}
              placeholder={`Accepted answer ${idx + 1}`}
              className={`flex-1 ${inputClass}`}
            />
            {(block.acceptedAnswers || []).length > 1 && (
              <button type="button" onClick={() => onUpdate({ ...block, acceptedAnswers: (block.acceptedAnswers || []).filter((_, i) => i !== idx) })} className="p-1 text-red-400 hover:bg-red-500/10 rounded transition">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => onUpdate({ ...block, acceptedAnswers: [...(block.acceptedAnswers || ['']), ''] })} className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition">
          <Plus className="w-3 h-3" /> Add Answer
        </button>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────
// Block editor selector
// ──────────────────────────────────────────────

const BlockEditor: React.FC<{ block: LessonBlock; allBlocks: LessonBlock[]; onUpdate: (b: LessonBlock) => void }> = ({ block, allBlocks, onUpdate }) => {
  switch (block.type) {
    case 'TEXT': return <TextBlockEditor block={block} onUpdate={onUpdate} />;
    case 'MC': return <MCBlockEditor block={block} onUpdate={onUpdate} />;
    case 'SHORT_ANSWER': return <ShortAnswerEditor block={block} onUpdate={onUpdate} />;
    case 'VOCABULARY': return <VocabularyEditor block={block} onUpdate={onUpdate} />;
    case 'CHECKLIST': return <ChecklistEditor block={block} onUpdate={onUpdate} />;
    case 'INFO_BOX': return <InfoBoxEditor block={block} onUpdate={onUpdate} />;
    case 'SECTION_HEADER': return <SectionHeaderEditor block={block} onUpdate={onUpdate} />;
    case 'IMAGE': return <ImageEditor block={block} onUpdate={onUpdate} />;
    case 'VIDEO': return <VideoEditor block={block} onUpdate={onUpdate} />;
    case 'OBJECTIVES': return <ObjectivesEditor block={block} onUpdate={onUpdate} />;
    case 'DIVIDER': return <div className="text-xs text-gray-500 italic">Horizontal divider — no configuration needed.</div>;
    case 'EXTERNAL_LINK': return <ExternalLinkEditor block={block} onUpdate={onUpdate} />;
    case 'EMBED': return <EmbedEditor block={block} onUpdate={onUpdate} />;
    case 'VOCAB_LIST': return <VocabListEditor block={block} onUpdate={onUpdate} />;
    case 'ACTIVITY': return <ActivityEditor block={block} onUpdate={onUpdate} />;
    case 'SORTING': return <SortingEditor block={block} onUpdate={onUpdate} />;
    case 'DATA_TABLE': return <DataTableEditor block={block} onUpdate={onUpdate} />;
    case 'BAR_CHART': return <BarChartEditor block={block} onUpdate={onUpdate} />;
    case 'RANKING': return <RankingEditor block={block} onUpdate={onUpdate} />;
    case 'LINKED': return <LinkedEditor block={block} allBlocks={allBlocks} onUpdate={onUpdate} />;
    default: return null;
  }
};

// ──────────────────────────────────────────────
// JSON Import Modal
// ──────────────────────────────────────────────

const JsonImportModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onImport: (blocks: LessonBlock[], mode: 'replace' | 'append') => void;
  hasExistingBlocks: boolean;
}> = ({ open, onClose, onImport, hasExistingBlocks }) => {
  const [json, setJson] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'replace' | 'append'>('append');

  if (!open) return null;

  const handleImport = () => {
    setError('');
    try {
      const parsed = JSON.parse(json);
      let blocks: LessonBlock[];

      if (Array.isArray(parsed)) {
        blocks = parsed;
      } else if (parsed && Array.isArray(parsed.blocks)) {
        blocks = parsed.blocks;
      } else {
        setError('JSON must be an array of blocks, or an object with a "blocks" array.');
        return;
      }

      // Validate and assign IDs
      blocks = blocks.map(b => {
        if (!b.type) {
          throw new Error(`Block missing "type" field: ${JSON.stringify(b).slice(0, 80)}`);
        }
        return { ...b, id: b.id || generateId(), content: b.content ?? '' };
      });

      onImport(blocks, mode);
      setJson('');
      setError('');
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#1a1b26] border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-purple-400" />
            <h3 className="text-lg font-bold text-white">Import Blocks from JSON</h3>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white transition"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 flex-1 overflow-auto space-y-4">
          <div className="text-xs text-gray-400 space-y-1">
            <p>Paste a JSON array of blocks, or an object with <code className="text-purple-300">{"{ blocks: [...] }"}</code>.</p>
            <p>Each block needs at minimum a <code className="text-purple-300">type</code> field. IDs will be auto-generated if missing.</p>
          </div>

          {hasExistingBlocks && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('append')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border ${mode === 'append' ? 'bg-purple-600/20 border-purple-500/30 text-purple-300' : 'bg-black/30 border-white/10 text-gray-400'}`}
              >
                Append to existing
              </button>
              <button
                type="button"
                onClick={() => setMode('replace')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border ${mode === 'replace' ? 'bg-red-600/20 border-red-500/30 text-red-300' : 'bg-black/30 border-white/10 text-gray-400'}`}
              >
                Replace all
              </button>
            </div>
          )}

          <textarea
            value={json}
            onChange={e => { setJson(e.target.value); setError(''); }}
            placeholder={`[\n  { "type": "SECTION_HEADER", "icon": "📚", "title": "My Section" },\n  { "type": "TEXT", "content": "Hello world" }\n]`}
            className={`${textareaClass} min-h-[200px] font-mono text-xs`}
            rows={10}
          />

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl p-3">{error}</div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/10">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition">Cancel</button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!json.trim()}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl text-sm font-bold transition"
          >
            {mode === 'replace' && hasExistingBlocks ? 'Replace & Import' : 'Import Blocks'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────
// Main editor component
// ──────────────────────────────────────────────

const LessonBlockEditor: React.FC<LessonBlockEditorProps> = ({ blocks, onChange }) => {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [showJsonImport, setShowJsonImport] = useState(false);

  const addBlock = useCallback((type: BlockType) => {
    onChange([...blocks, createEmptyBlock(type)]);
    setShowAddMenu(false);
  }, [blocks, onChange]);

  const updateBlock = useCallback((index: number, updated: LessonBlock) => {
    const next = [...blocks];
    next[index] = updated;
    onChange(next);
  }, [blocks, onChange]);

  const removeBlock = useCallback((index: number) => {
    onChange(blocks.filter((_, i) => i !== index));
  }, [blocks, onChange]);

  const moveBlock = useCallback((index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }, [blocks, onChange]);

  const duplicateBlock = useCallback((index: number) => {
    const dup = { ...blocks[index], id: generateId() };
    const next = [...blocks];
    next.splice(index + 1, 0, dup);
    onChange(next);
  }, [blocks, onChange]);

  const handleJsonImport = useCallback((importedBlocks: LessonBlock[], mode: 'replace' | 'append') => {
    if (mode === 'replace' || blocks.length === 0) {
      onChange(importedBlocks);
    } else {
      onChange([...blocks, ...importedBlocks]);
    }
  }, [blocks, onChange]);

  const getBlockTypeInfo = (type: BlockType) => BLOCK_TYPES.find(bt => bt.type === type);

  // Group block types by category for the add menu
  const categories = ['Content', 'Interactive', 'Questions'];

  return (
    <div className="space-y-4">
      {/* Header with preview toggle + JSON import */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">
          Lesson Blocks ({blocks.length})
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowJsonImport(true)}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border bg-white/5 border-white/10 text-gray-400 hover:text-white transition"
          >
            <Upload className="w-3.5 h-3.5" />
            Paste JSON
          </button>
          {blocks.length > 0 && (
            <button
              type="button"
              onClick={() => setPreviewMode(!previewMode)}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition ${
                previewMode
                  ? 'bg-purple-600/20 border-purple-500/30 text-purple-300'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
              }`}
            >
              {previewMode ? <Edit2 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {previewMode ? 'Edit' : 'Preview'}
            </button>
          )}
        </div>
      </div>

      {/* Preview mode */}
      {previewMode && blocks.length > 0 ? (
        <div className="bg-[#0f0720]/80 border border-white/10 rounded-2xl p-6">
          <LessonBlocks blocks={blocks} />
        </div>
      ) : (
        <>
          {/* Block list */}
          <div className="space-y-3">
            {blocks.map((block, index) => {
              const typeInfo = getBlockTypeInfo(block.type);
              return (
                <div
                  key={block.id}
                  className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition"
                >
                  {/* Block header */}
                  <div className="flex items-center gap-2 px-4 py-2 bg-black/20 border-b border-white/5">
                    <GripVertical className="w-4 h-4 text-gray-600 shrink-0" />
                    <span className="text-gray-500">{typeInfo?.icon}</span>
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex-1">
                      {typeInfo?.label || block.type} #{index + 1}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <button type="button" onClick={() => moveBlock(index, -1)} disabled={index === 0} className="p-1 text-gray-500 hover:text-white disabled:opacity-20 transition" title="Move up">
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => moveBlock(index, 1)} disabled={index === blocks.length - 1} className="p-1 text-gray-500 hover:text-white disabled:opacity-20 transition" title="Move down">
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => duplicateBlock(index)} className="p-1 text-gray-500 hover:text-blue-400 transition" title="Duplicate">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => removeBlock(index)} className="p-1 text-gray-500 hover:text-red-400 transition" title="Delete block">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Block editor body */}
                  <div className="p-4">
                    <BlockEditor block={block} allBlocks={blocks} onUpdate={(updated) => updateBlock(index, updated)} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add block button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="w-full py-3 border-2 border-dashed border-white/10 rounded-2xl text-gray-500 hover:text-purple-400 hover:border-purple-500/30 transition flex items-center justify-center gap-2 text-sm font-bold"
            >
              <Plus className="w-4 h-4" /> Add Block
            </button>

            {showAddMenu && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1b26] border border-white/10 rounded-2xl shadow-2xl p-3 z-50 max-h-[60vh] overflow-y-auto">
                {categories.map(cat => {
                  const catTypes = BLOCK_TYPES.filter(bt => bt.category === cat);
                  return (
                    <div key={cat} className="mb-3 last:mb-0">
                      <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest px-2 mb-1">{cat}</div>
                      <div className="grid grid-cols-2 gap-1">
                        {catTypes.map(bt => (
                          <button
                            key={bt.type}
                            type="button"
                            onClick={() => addBlock(bt.type)}
                            className="flex items-center gap-3 p-3 rounded-xl text-left hover:bg-white/5 transition group"
                          >
                            <span className="text-gray-500 group-hover:text-purple-400 transition">{bt.icon}</span>
                            <div>
                              <div className="text-xs font-bold text-gray-300">{bt.label}</div>
                              <div className="text-[10px] text-gray-600">{bt.description}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* JSON Import Modal */}
      <JsonImportModal
        open={showJsonImport}
        onClose={() => setShowJsonImport(false)}
        onImport={handleJsonImport}
        hasExistingBlocks={blocks.length > 0}
      />
    </div>
  );
};

export default LessonBlockEditor;

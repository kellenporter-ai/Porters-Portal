
import React, { useState, useCallback } from 'react';
import {
  Plus, Trash2, ChevronUp, ChevronDown, Type, HelpCircle, MessageSquare,
  BookOpen, ListChecks, Info, Eye, Edit2, GripVertical, Copy
} from 'lucide-react';
import { LessonBlock, BlockType } from '../types';
import LessonBlocks from './LessonBlocks';

interface LessonBlockEditorProps {
  blocks: LessonBlock[];
  onChange: (blocks: LessonBlock[]) => void;
}

const BLOCK_TYPES: { type: BlockType; label: string; icon: React.ReactNode; description: string }[] = [
  { type: 'TEXT', label: 'Text', icon: <Type className="w-4 h-4" />, description: 'Plain text content' },
  { type: 'MC', label: 'Multiple Choice', icon: <HelpCircle className="w-4 h-4" />, description: 'Question with options' },
  { type: 'SHORT_ANSWER', label: 'Short Answer', icon: <MessageSquare className="w-4 h-4" />, description: 'Free-text question' },
  { type: 'VOCABULARY', label: 'Vocabulary', icon: <BookOpen className="w-4 h-4" />, description: 'Term & definition card' },
  { type: 'CHECKLIST', label: 'Checklist', icon: <ListChecks className="w-4 h-4" />, description: 'Completable task list' },
  { type: 'INFO_BOX', label: 'Info Box', icon: <Info className="w-4 h-4" />, description: 'Tip, warning, or note' },
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
    default:
      return base;
  }
};

// ──────────────────────────────────────────────
// Individual block editors
// ──────────────────────────────────────────────

const TextBlockEditor: React.FC<{ block: LessonBlock; onUpdate: (b: LessonBlock) => void }> = ({ block, onUpdate }) => (
  <textarea
    value={block.content}
    onChange={e => onUpdate({ ...block, content: e.target.value })}
    placeholder="Enter text content..."
    className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-gray-600 resize-none min-h-[80px] focus:outline-none focus:border-purple-500/50 transition"
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
        className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-purple-500/50 transition"
        rows={2}
      />
      <div className="space-y-2">
        <label className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Options (click radio to mark correct)</label>
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
              className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition"
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
        className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-purple-500/50 transition"
        rows={2}
      />
      <div className="space-y-2">
        <label className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Accepted Answers (case-insensitive)</label>
        {answers.map((ans, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              type="text"
              value={ans}
              onChange={e => updateAnswer(idx, e.target.value)}
              placeholder={`Accepted answer ${idx + 1}`}
              className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition"
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
      <label className="text-[10px] text-gray-500 uppercase font-bold tracking-widest block mb-1">Term</label>
      <input
        type="text"
        value={block.term || ''}
        onChange={e => onUpdate({ ...block, term: e.target.value })}
        placeholder="Term..."
        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition"
      />
    </div>
    <div>
      <label className="text-[10px] text-gray-500 uppercase font-bold tracking-widest block mb-1">Definition</label>
      <input
        type="text"
        value={block.definition || ''}
        onChange={e => onUpdate({ ...block, definition: e.target.value })}
        placeholder="Definition..."
        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition"
      />
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
        className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-purple-500/50 transition"
        rows={1}
      />
      <div className="space-y-2">
        <label className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Items</label>
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className="w-5 h-5 rounded border-2 border-gray-600 shrink-0" />
            <input
              type="text"
              value={item}
              onChange={e => updateItem(idx, e.target.value)}
              placeholder={`Item ${idx + 1}`}
              className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition"
            />
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
      <label className="text-[10px] text-gray-500 uppercase font-bold tracking-widest block mb-1">Variant</label>
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
    <textarea
      value={block.content}
      onChange={e => onUpdate({ ...block, content: e.target.value })}
      placeholder="Info box content..."
      className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-gray-600 resize-none focus:outline-none focus:border-purple-500/50 transition"
      rows={2}
    />
  </div>
);

// ──────────────────────────────────────────────
// Block editor selector
// ──────────────────────────────────────────────

const BlockEditor: React.FC<{ block: LessonBlock; onUpdate: (b: LessonBlock) => void }> = ({ block, onUpdate }) => {
  switch (block.type) {
    case 'TEXT': return <TextBlockEditor block={block} onUpdate={onUpdate} />;
    case 'MC': return <MCBlockEditor block={block} onUpdate={onUpdate} />;
    case 'SHORT_ANSWER': return <ShortAnswerEditor block={block} onUpdate={onUpdate} />;
    case 'VOCABULARY': return <VocabularyEditor block={block} onUpdate={onUpdate} />;
    case 'CHECKLIST': return <ChecklistEditor block={block} onUpdate={onUpdate} />;
    case 'INFO_BOX': return <InfoBoxEditor block={block} onUpdate={onUpdate} />;
    default: return null;
  }
};

// ──────────────────────────────────────────────
// Main editor component
// ──────────────────────────────────────────────

const LessonBlockEditor: React.FC<LessonBlockEditorProps> = ({ blocks, onChange }) => {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

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

  const getBlockTypeInfo = (type: BlockType) => BLOCK_TYPES.find(bt => bt.type === type);

  return (
    <div className="space-y-4">
      {/* Header with preview toggle */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">
          Lesson Blocks ({blocks.length})
        </label>
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
                      {typeInfo?.label} #{index + 1}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveBlock(index, -1)}
                        disabled={index === 0}
                        className="p-1 text-gray-500 hover:text-white disabled:opacity-20 transition"
                        title="Move up"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveBlock(index, 1)}
                        disabled={index === blocks.length - 1}
                        className="p-1 text-gray-500 hover:text-white disabled:opacity-20 transition"
                        title="Move down"
                      >
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicateBlock(index)}
                        className="p-1 text-gray-500 hover:text-blue-400 transition"
                        title="Duplicate"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeBlock(index)}
                        className="p-1 text-gray-500 hover:text-red-400 transition"
                        title="Delete block"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Block editor body */}
                  <div className="p-4">
                    <BlockEditor block={block} onUpdate={(updated) => updateBlock(index, updated)} />
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
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1b26] border border-white/10 rounded-2xl shadow-2xl p-2 z-50 grid grid-cols-2 gap-1">
                {BLOCK_TYPES.map(bt => (
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
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default LessonBlockEditor;

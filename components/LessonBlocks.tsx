
import React, { useState, useCallback } from 'react';
import { CheckCircle2, XCircle, ChevronRight, BookOpen, MessageSquare, HelpCircle, ListChecks } from 'lucide-react';
import { LessonBlock } from '../types';
import LessonProgressSidebar from './LessonProgressSidebar';

export type { LessonBlock } from '../types';

interface LessonBlocksProps {
  blocks: LessonBlock[];
  onBlockComplete?: (blockId: string, correct: boolean) => void;
  onAllComplete?: () => void;
  showSidebar?: boolean;
  engagementTime?: number;
  xpEarned?: number;
}

// Individual block renderers
const TextBlock: React.FC<{ block: LessonBlock }> = ({ block }) => (
  <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
    {block.content}
  </div>
);

const InfoBoxBlock: React.FC<{ block: LessonBlock }> = ({ block }) => {
  const variantStyles = {
    tip: 'border-green-500/30 bg-green-500/5 text-green-400',
    warning: 'border-amber-500/30 bg-amber-500/5 text-amber-400',
    note: 'border-blue-500/30 bg-blue-500/5 text-blue-400',
  };
  const style = variantStyles[block.variant || 'note'];
  return (
    <div className={`border rounded-xl p-4 text-sm ${style}`}>
      <div className="font-bold text-xs uppercase tracking-widest mb-1">
        {block.variant === 'tip' ? 'Tip' : block.variant === 'warning' ? 'Warning' : 'Note'}
      </div>
      <div className="text-gray-300">{block.content}</div>
    </div>
  );
};

const MCBlock: React.FC<{ block: LessonBlock; onComplete: (correct: boolean) => void }> = ({ block, onComplete }) => {
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const isCorrect = selected === block.correctAnswer;

  const handleSubmit = () => {
    if (selected === null) return;
    setAnswered(true);
    onComplete(selected === block.correctAnswer);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-white font-medium flex items-center gap-2">
        <HelpCircle className="w-4 h-4 text-purple-400 shrink-0" />
        {block.content}
      </p>
      <div className="space-y-2">
        {(block.options || []).map((opt, idx) => (
          <button
            key={idx}
            onClick={() => !answered && setSelected(idx)}
            disabled={answered}
            className={`w-full text-left p-3 rounded-xl border text-sm transition-all ${
              answered && idx === block.correctAnswer
                ? 'border-green-500/50 bg-green-500/10 text-green-400'
                : answered && idx === selected && !isCorrect
                ? 'border-red-500/50 bg-red-500/10 text-red-400'
                : selected === idx
                ? 'border-purple-500/30 bg-purple-500/10 text-white'
                : 'border-white/10 bg-white/5 hover:bg-white/10 text-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-gray-600 w-5">{String.fromCharCode(65 + idx)}.</span>
              <span>{opt}</span>
              {answered && idx === block.correctAnswer && <CheckCircle2 className="w-4 h-4 text-green-400 ml-auto" />}
              {answered && idx === selected && !isCorrect && <XCircle className="w-4 h-4 text-red-400 ml-auto" />}
            </div>
          </button>
        ))}
      </div>
      {!answered && (
        <button
          onClick={handleSubmit}
          disabled={selected === null}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition"
        >
          Check Answer
        </button>
      )}
      {answered && (
        <div className={`text-xs font-bold ${isCorrect ? 'text-green-400' : 'text-red-400'}`}>
          {isCorrect ? 'Correct!' : 'Incorrect — review the material above.'}
        </div>
      )}
    </div>
  );
};

const ShortAnswerBlock: React.FC<{ block: LessonBlock; onComplete: (correct: boolean) => void }> = ({ block, onComplete }) => {
  const [answer, setAnswer] = useState('');
  const [answered, setAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const handleSubmit = () => {
    if (!answer.trim()) return;
    const accepted = (block.acceptedAnswers || []).map(a => a.toLowerCase().trim());
    const correct = accepted.includes(answer.toLowerCase().trim());
    setIsCorrect(correct);
    setAnswered(true);
    onComplete(correct);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-white font-medium flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-cyan-400 shrink-0" />
        {block.content}
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          disabled={answered}
          placeholder="Type your answer..."
          className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition"
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        />
        {!answered && (
          <button
            onClick={handleSubmit}
            disabled={!answer.trim()}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition"
          >
            Submit
          </button>
        )}
      </div>
      {answered && (
        <div className={`text-xs font-bold flex items-center gap-1 ${isCorrect ? 'text-green-400' : 'text-amber-400'}`}>
          {isCorrect ? <><CheckCircle2 className="w-3 h-3" /> Correct!</> : <><XCircle className="w-3 h-3" /> Accepted answers: {(block.acceptedAnswers || []).join(', ')}</>}
        </div>
      )}
    </div>
  );
};

const VocabularyBlock: React.FC<{ block: LessonBlock }> = ({ block }) => {
  const [flipped, setFlipped] = useState(false);

  return (
    <button
      onClick={() => setFlipped(!flipped)}
      className="w-full text-left p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <BookOpen className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
        <div>
          <div className="text-sm font-bold text-white">{block.term}</div>
          {flipped ? (
            <div className="text-sm text-gray-300 mt-1 animate-in fade-in duration-200">{block.definition}</div>
          ) : (
            <div className="text-xs text-gray-600 mt-1">Tap to reveal definition</div>
          )}
        </div>
      </div>
    </button>
  );
};

const ChecklistBlock: React.FC<{ block: LessonBlock; onComplete: (correct: boolean) => void }> = ({ block, onComplete }) => {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const allChecked = (block.items || []).length > 0 && checked.size === (block.items || []).length;

  const toggle = (idx: number) => {
    const next = new Set(checked);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setChecked(next);
    if (next.size === (block.items || []).length) {
      onComplete(true);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-white font-medium flex items-center gap-2">
        <ListChecks className="w-4 h-4 text-green-400 shrink-0" />
        {block.content}
      </p>
      <div className="space-y-2">
        {(block.items || []).map((item, idx) => (
          <button
            key={idx}
            onClick={() => toggle(idx)}
            className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border text-sm transition ${
              checked.has(idx)
                ? 'border-green-500/30 bg-green-500/5 text-green-400 line-through'
                : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
            }`}
          >
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition ${
              checked.has(idx) ? 'border-green-500 bg-green-500' : 'border-gray-600'
            }`}>
              {checked.has(idx) && <CheckCircle2 className="w-3 h-3 text-white" />}
            </div>
            {item}
          </button>
        ))}
      </div>
      {allChecked && (
        <div className="text-xs font-bold text-green-400 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> All items completed!
        </div>
      )}
    </div>
  );
};

const LessonBlocks: React.FC<LessonBlocksProps> = ({ blocks, onBlockComplete, onAllComplete, showSidebar = false, engagementTime, xpEarned }) => {
  const [completedBlocks, setCompletedBlocks] = useState<Set<string>>(new Set());
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);

  const handleBlockComplete = useCallback((blockId: string, correct: boolean) => {
    onBlockComplete?.(blockId, correct);
    setCompletedBlocks(prev => {
      const next = new Set(prev);
      next.add(blockId);
      // Check if all interactive blocks are complete
      const interactiveBlocks = blocks.filter(b => ['MC', 'SHORT_ANSWER', 'CHECKLIST'].includes(b.type));
      if (interactiveBlocks.every(b => next.has(b.id))) {
        onAllComplete?.();
      }
      return next;
    });
  }, [blocks, onBlockComplete, onAllComplete]);

  const handleNext = () => {
    if (currentBlockIndex < blocks.length - 1) {
      setCurrentBlockIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentBlockIndex > 0) {
      setCurrentBlockIndex(prev => prev - 1);
    }
  };

  if (blocks.length === 0) return null;

  const currentBlock = blocks[currentBlockIndex];
  const isInteractive = ['MC', 'SHORT_ANSWER', 'CHECKLIST'].includes(currentBlock.type);
  const isBlockDone = completedBlocks.has(currentBlock.id);

  const contentArea = (
    <div className="space-y-4 flex-1 min-w-0">
      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-white/5 rounded-full h-1.5 overflow-hidden">
          <div
            className="h-1.5 rounded-full bg-purple-500 transition-all duration-500"
            style={{ width: `${((currentBlockIndex + 1) / blocks.length) * 100}%` }}
          />
        </div>
        <span className="text-[10px] text-gray-500 font-mono">{currentBlockIndex + 1}/{blocks.length}</span>
      </div>

      {/* Current block */}
      <div key={currentBlock.id} className="animate-in fade-in slide-in-from-right-2 duration-200">
        {currentBlock.type === 'TEXT' && <TextBlock block={currentBlock} />}
        {currentBlock.type === 'INFO_BOX' && <InfoBoxBlock block={currentBlock} />}
        {currentBlock.type === 'MC' && <MCBlock block={currentBlock} onComplete={(correct) => handleBlockComplete(currentBlock.id, correct)} />}
        {currentBlock.type === 'SHORT_ANSWER' && <ShortAnswerBlock block={currentBlock} onComplete={(correct) => handleBlockComplete(currentBlock.id, correct)} />}
        {currentBlock.type === 'VOCABULARY' && <VocabularyBlock block={currentBlock} />}
        {currentBlock.type === 'CHECKLIST' && <ChecklistBlock block={currentBlock} onComplete={(correct) => handleBlockComplete(currentBlock.id, correct)} />}
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center pt-2 border-t border-white/5">
        <button
          onClick={handlePrev}
          disabled={currentBlockIndex === 0}
          className="text-xs text-gray-500 hover:text-white disabled:opacity-30 transition px-3 py-1.5 rounded-lg hover:bg-white/5"
        >
          Previous
        </button>

        <div className="flex gap-1">
          {blocks.map((b, i) => (
            <button
              key={b.id}
              onClick={() => setCurrentBlockIndex(i)}
              className={`w-2 h-2 rounded-full transition ${
                i === currentBlockIndex ? 'bg-purple-500 scale-125' :
                completedBlocks.has(b.id) ? 'bg-green-500' :
                'bg-white/10 hover:bg-white/20'
              }`}
            />
          ))}
        </div>

        <button
          onClick={handleNext}
          disabled={currentBlockIndex >= blocks.length - 1 || (isInteractive && !isBlockDone)}
          className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 disabled:opacity-30 transition px-3 py-1.5 rounded-lg hover:bg-purple-500/10"
        >
          Next <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );

  if (showSidebar && blocks.length >= 3) {
    return (
      <div className="flex gap-4">
        {contentArea}
        <LessonProgressSidebar
          blocks={blocks}
          currentBlockIndex={currentBlockIndex}
          completedBlocks={completedBlocks}
          onNavigateToBlock={setCurrentBlockIndex}
          engagementTime={engagementTime}
          xpEarned={xpEarned}
        />
      </div>
    );
  }

  return contentArea;
};

export default LessonBlocks;

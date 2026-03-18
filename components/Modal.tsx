
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useFocusTrap } from '../lib/useFocusTrap';
import { sfx } from '../lib/sfx';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
  /** Set false to suppress open/close sounds (default true) */
  playSounds?: boolean;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, maxWidth = 'max-w-md', playSounds = true }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  useFocusTrap(dialogRef, isOpen);

  // Play open/close sounds
  useEffect(() => {
    if (!playSounds) { wasOpen.current = isOpen; return; }
    if (isOpen && !wasOpen.current) sfx.modalOpen();
    if (!isOpen && wasOpen.current) sfx.modalClose();
    wasOpen.current = isOpen;
  }, [isOpen, playSounds]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--backdrop)] backdrop-blur-sm animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-label={title}>
      <div ref={dialogRef} className={`bg-[var(--surface-overlay)] backdrop-blur-xl border border-[var(--border)] rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.3)] w-full ${maxWidth} overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in-95 duration-200`}>
        <div className="flex justify-between items-center p-6 border-b border-[var(--border)] bg-[var(--surface-glass)]">
          <h3 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">{title}</h3>
          <button onClick={onClose} className="p-2 hover:bg-[var(--surface-glass-heavy)] rounded-full transition text-[var(--text-muted)] hover:text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500" aria-label="Close dialog">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Modal;

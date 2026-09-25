import React from 'react';
import { ClipboardList, Gift } from 'lucide-react';
import { useT } from '../../../lib/i18n';

const REQUIRED = [1, 2, 3, 4, 5] as const;
const RECOMMENDED = [1, 2, 3] as const;

interface SyllabusMaterialsProps {
  /** Bullet dot color class, e.g. 'bg-cyan-500' or 'bg-amber-500'. */
  dotClass: string;
}

/** Required + recommended materials as a matched pair of cards. */
const SyllabusMaterials: React.FC<SyllabusMaterialsProps> = ({ dotClass }) => {
  const t = useT();

  return (
    <div className="pub-reveal mt-8 grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-glass)] p-6 sm:p-8">
        <h3 className="flex items-center gap-2 font-bold text-[var(--text-primary)]">
          <ClipboardList className="h-5 w-5 text-[var(--accent-text)]" aria-hidden="true" />
          {t('public.syllabus.materialsHeading')}
        </h3>
        <ul className="mt-4">
          {REQUIRED.map((n) => (
            <li key={n} className="flex items-center gap-3 py-2 text-[var(--text-secondary)]">
              <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
              {t(`public.syllabus.materials.item${n}`)}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-glass)] p-6 sm:p-8">
        <h3 className="flex items-center gap-2 font-bold text-[var(--text-primary)]">
          <Gift className="h-5 w-5 text-[var(--accent-text)]" aria-hidden="true" />
          {t('public.syllabus.materialsRecommendedHeading')}
        </h3>
        <ul className="mt-4">
          {RECOMMENDED.map((n) => (
            <li key={n} className="flex items-center gap-3 py-2 text-[var(--text-secondary)]">
              <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
              {t(`public.syllabus.materials.rec${n}`)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default SyllabusMaterials;

import React, { useMemo } from 'react';
import { Submission, StudentBucketProfile } from '../../types';
import { Clipboard, MousePointerClick, Keyboard, MonitorX } from 'lucide-react';

interface BehavioralIndicatorsProps {
  submissions: Submission[];
  bucket: StudentBucketProfile | null;
}

const BehavioralIndicators: React.FC<BehavioralIndicatorsProps> = ({ submissions }) => {
  const metrics = useMemo(() => {
    const completed = submissions.filter(s => s.status !== 'STARTED');
    if (completed.length === 0) return null;

    const totalPastes = completed.reduce((a, s) => a + (s.metrics?.pasteCount || 0), 0);
    const totalKeystrokes = completed.reduce((a, s) => a + (s.metrics?.keystrokes || 0), 0);
    const totalClicks = completed.reduce((a, s) => a + (s.metrics?.clickCount || 0), 0);
    const totalTabSwitches = completed.reduce((a, s) => a + (s.metrics?.tabSwitchCount || 0), 0);
    const pasteRatio = (totalKeystrokes + totalPastes) > 0 ? totalPastes / (totalKeystrokes + totalPastes) : 0;

    // Typing cadence (from submissions that have it)
    const cadences = completed
      .map(s => s.metrics?.typingCadence?.avgIntervalMs)
      .filter((v): v is number => v != null && v > 0);
    const avgCadence = cadences.length > 0 ? Math.round(cadences.reduce((a, v) => a + v, 0) / cadences.length) : null;

    return {
      totalPastes,
      totalKeystrokes,
      totalClicks,
      totalTabSwitches,
      pasteRatio,
      avgPastePerSub: Math.round((totalPastes / completed.length) * 10) / 10,
      avgTabSwitches: Math.round((totalTabSwitches / completed.length) * 10) / 10,
      avgCadence,
      subCount: completed.length,
    };
  }, [submissions]);

  if (!metrics) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-[var(--text-tertiary)] uppercase tracking-widest print:text-gray-700">Behavioral Indicators</h3>
        <div className="text-center py-8 text-[var(--text-muted)] italic text-xs">No submission data available.</div>
      </div>
    );
  }

  const indicators = [
    {
      label: 'Paste Ratio',
      value: `${Math.round(metrics.pasteRatio * 100)}%`,
      detail: `${metrics.totalPastes} pastes / ${metrics.subCount} submissions`,
      icon: <Clipboard className="w-4 h-4" />,
      level: metrics.pasteRatio > 0.4 ? 'danger' : metrics.pasteRatio > 0.15 ? 'warning' : 'good',
    },
    {
      label: 'Avg Tab Switches',
      value: String(metrics.avgTabSwitches),
      detail: `${metrics.totalTabSwitches} total across submissions`,
      icon: <MonitorX className="w-4 h-4" />,
      level: metrics.avgTabSwitches > 10 ? 'danger' : metrics.avgTabSwitches > 4 ? 'warning' : 'good',
    },
    {
      label: 'Total Keystrokes',
      value: metrics.totalKeystrokes.toLocaleString(),
      detail: `~${Math.round(metrics.totalKeystrokes / metrics.subCount)} per submission`,
      icon: <Keyboard className="w-4 h-4" />,
      level: metrics.totalKeystrokes < 50 && metrics.subCount > 3 ? 'warning' : 'good',
    },
    {
      label: 'Total Clicks',
      value: metrics.totalClicks.toLocaleString(),
      detail: `~${Math.round(metrics.totalClicks / metrics.subCount)} per submission`,
      icon: <MousePointerClick className="w-4 h-4" />,
      level: 'good' as const,
    },
  ];

  if (metrics.avgCadence !== null) {
    indicators.push({
      label: 'Typing Cadence',
      value: `${metrics.avgCadence}ms`,
      detail: 'Avg interval between keystrokes',
      icon: <Keyboard className="w-4 h-4" />,
      level: metrics.avgCadence < 50 ? 'warning' : 'good',
    });
  }

  const colorMap = {
    good: { text: 'text-emerald-700 dark:text-emerald-400 print:text-emerald-600', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', dot: 'bg-emerald-500' },
    warning: { text: 'text-yellow-600 dark:text-yellow-400 print:text-yellow-600', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', dot: 'bg-yellow-500' },
    danger: { text: 'text-red-600 dark:text-red-400 print:text-red-600', bg: 'bg-red-500/10', border: 'border-red-500/20', dot: 'bg-red-500' },
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-gray-600 dark:text-gray-400 uppercase tracking-widest print:text-gray-700">Behavioral Indicators</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {indicators.map(ind => {
          const colors = colorMap[ind.level as keyof typeof colorMap];
          return (
            <div key={ind.label} className={`${colors.bg} border ${colors.border} rounded-xl p-3 print:border-gray-300 print:bg-gray-50`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[var(--text-tertiary)] print:text-gray-500">{ind.icon}</span>
                <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
              </div>
              <div className={`text-lg font-bold ${colors.text}`}>{ind.value}</div>
              <div className="text-[11.5px] text-[var(--text-muted)] uppercase font-bold tracking-widest">{ind.label}</div>
              <div className="text-[11.5px] text-[var(--text-muted)] mt-1">{ind.detail}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BehavioralIndicators;

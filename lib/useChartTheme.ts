import { useTheme } from './ThemeContext';

export function useChartTheme() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return {
    // Grid and axes
    gridColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
    axisColor: isDark ? '#9ca3af' : '#6b7280',
    tickColor: isDark ? '#9ca3af' : '#6b7280',

    // Tooltip
    tooltipStyle: {
      backgroundColor: isDark ? '#1a0d35' : '#ffffff',
      border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.12)',
      borderRadius: '8px',
      color: isDark ? '#e9d5ff' : '#1e1233',
    },

    // Text
    labelColor: isDark ? '#d1d5db' : '#4a4560',

    // Common chart colors (consistent across themes)
    purple: '#a855f7',
    cyan: '#22d3ee',
    emerald: '#10b981',
    amber: '#f59e0b',
    red: '#ef4444',
    blue: '#3b82f6',

    // Background for chart containers
    chartBg: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.5)',

    isDark,
  };
}

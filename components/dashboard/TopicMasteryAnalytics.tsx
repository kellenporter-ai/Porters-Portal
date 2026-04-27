
import React, { useMemo } from 'react';
import { TopicMastery } from '../../types';
import { normalizeTopicMastery } from '../../lib/gamification';
import { TrendingUp, Target, BookOpen, Award, AlertTriangle } from 'lucide-react';

interface TopicMasteryAnalyticsProps {
  topicMastery: TopicMastery[] | Record<string, TopicMastery> | undefined;
}

const TopicMasteryAnalytics: React.FC<TopicMasteryAnalyticsProps> = ({ topicMastery: rawTopicMastery }) => {
  const topicMastery = normalizeTopicMastery(rawTopicMastery);
  const stats = useMemo(() => {
    const total = topicMastery.length;
    const avgAccuracy = total > 0
      ? topicMastery.reduce((s, t) => s + t.currentAccuracy, 0) / total
      : 0;
    const maxed = topicMastery.filter(t => t.level >= 10).length;
    const struggling = topicMastery.filter(t => t.currentAccuracy < 0.5).length;
    const totalQuestions = topicMastery.reduce((s, t) => s + t.questionsAnswered, 0);
    const totalCorrect = topicMastery.reduce((s, t) => s + t.questionsCorrect, 0);
    return { total, avgAccuracy, maxed, struggling, totalQuestions, totalCorrect };
  }, [topicMastery]);

  const sortedTopics = useMemo(() => {
    return [...topicMastery].sort((a, b) => b.currentAccuracy - a.currentAccuracy);
  }, [topicMastery]);

  const weakTopics = useMemo(() => {
    return sortedTopics.filter(t => t.currentAccuracy < 0.6).slice(0, 5);
  }, [sortedTopics]);

  const strongTopics = useMemo(() => {
    return sortedTopics.filter(t => t.currentAccuracy >= 0.8).slice(0, 5);
  }, [sortedTopics]);

  if (topicMastery.length === 0) {
    return (
      <div className="p-8 text-center">
        <BookOpen className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
        <p className="text-sm font-bold text-[var(--text-primary)]">No Topic Data Yet</p>
        <p className="text-[11.5px] text-[var(--text-tertiary)] mt-1">
          Complete boss fights and quizzes to build your topic mastery profile.
        </p>
      </div>
    );
  }

  const StatCard = ({ icon: Icon, label, value, color, subtext }: { icon: typeof TrendingUp; label: string; value: string; color: string; subtext?: string }) => (
    <div className={`p-3 rounded-xl border ${color} bg-opacity-10`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color.replace('border-', 'text-')}`} />
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</span>
      </div>
      <div className={`text-xl font-black ${color.replace('border-', 'text-')}`}>{value}</div>
      {subtext && <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{subtext}</div>}
    </div>
  );

  const TopicBar = ({ topic, showRank }: { topic: TopicMastery; showRank?: number }) => {
    const accuracy = topic.currentAccuracy;
    const color = accuracy >= 0.8 ? 'bg-green-500' : accuracy >= 0.6 ? 'bg-yellow-500' : 'bg-red-500';
    const textColor = accuracy >= 0.8 ? 'text-green-600 dark:text-green-400' : accuracy >= 0.6 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400';

    return (
      <div className="flex items-center gap-3 py-2">
        {showRank && (
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
            showRank === 1 ? 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' :
            showRank === 2 ? 'bg-gray-400/20 text-gray-500' :
            showRank === 3 ? 'bg-amber-600/20 text-amber-600' :
            'text-[var(--text-muted)]'
          }`}>
            {showRank}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11.5px] font-semibold text-[var(--text-secondary)] truncate">{topic.topicId}</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--text-muted)]">Lv.{topic.level}</span>
              <span className={`text-[11px] font-bold ${textColor}`}>{(accuracy * 100).toFixed(0)}%</span>
            </div>
          </div>
          <div className="h-2 rounded-full bg-[var(--surface-glass-heavy)] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${color}`}
              style={{ width: `${accuracy * 100}%` }}
            />
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[9px] text-[var(--text-muted)]">
              {topic.questionsCorrect}/{topic.questionsAnswered} correct
            </span>
            {topic.questionsAnswered >= 10 && (
              <span className="text-[9px] px-1 rounded bg-[var(--surface-glass-heavy)] text-[var(--text-muted)]">
                {topic.accuracyHistory.slice(-5).filter(a => a === 1).length}/5 recent
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-[var(--text-primary)]">Topic Mastery</h3>
          <p className="text-[11.5px] text-[var(--text-muted)] mt-0.5">
            Horizontal progression across subject areas
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Target}
          label="Topics"
          value={String(stats.total)}
          color="border-blue-500/30"
          subtext={`${stats.maxed} maxed`}
        />
        <StatCard
          icon={TrendingUp}
          label="Avg Accuracy"
          value={`${(stats.avgAccuracy * 100).toFixed(0)}%`}
          color={stats.avgAccuracy >= 0.7 ? 'border-green-500/30' : stats.avgAccuracy >= 0.5 ? 'border-yellow-500/30' : 'border-red-500/30'}
        />
        <StatCard
          icon={BookOpen}
          label="Questions"
          value={String(stats.totalQuestions)}
          color="border-purple-500/30"
          subtext={`${stats.totalCorrect} correct`}
        />
        <StatCard
          icon={Award}
          label="Mastery Lv"
          value={String(Math.round(stats.avgAccuracy * 10))}
          color="border-amber-500/30"
          subtext="out of 10"
        />
      </div>

      {/* Weak topics alert */}
      {weakTopics.length > 0 && (
        <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
            <span className="text-sm font-bold text-red-600 dark:text-red-400">Focus Areas</span>
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mb-2">
            These topics need attention. Focus here for maximum damage improvement.
          </p>
          <div className="space-y-1">
            {weakTopics.map(topic => (
              <TopicBar key={topic.topicId} topic={topic} />
            ))}
          </div>
        </div>
      )}

      {/* Strong topics */}
      {strongTopics.length > 0 && (
        <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Award className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-bold text-green-600 dark:text-green-400">Strengths</span>
          </div>
          <div className="space-y-1">
            {strongTopics.map((topic, i) => (
              <TopicBar key={topic.topicId} topic={topic} showRank={i + 1} />
            ))}
          </div>
        </div>
      )}

      {/* All topics */}
      <div className="p-3 border border-[var(--border)] rounded-xl bg-[var(--surface-glass)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-[var(--text-primary)]">All Topics</span>
          <span className="text-[11px] text-[var(--text-muted)]">{sortedTopics.length} total</span>
        </div>
        <div className="space-y-1 max-h-80 overflow-y-auto custom-scrollbar">
          {sortedTopics.map(topic => (
            <TopicBar key={topic.topicId} topic={topic} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default TopicMasteryAnalytics;

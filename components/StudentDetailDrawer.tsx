
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { User, Submission, Assignment, StudentBucketProfile, TelemetryBucket } from '../types';
import { X, Zap, Clock, BookOpen, Shield, Crosshair, Flame, Package, TrendingDown, TrendingUp, Minus, Lightbulb, ChevronDown, ChevronUp, BarChart3 } from 'lucide-react';
import { getRankDetails, calculatePlayerStats, calculateGearScore } from '../lib/gamification';
import { getClassProfile } from '../lib/classProfile';
import { BUCKET_META } from '../lib/telemetry';

interface StudentDetailDrawerProps {
  student: User;
  submissions: Submission[];
  assignments: Assignment[];
  bucketProfiles?: StudentBucketProfile[];
  onClose: () => void;
}

const StudentDetailDrawer: React.FC<StudentDetailDrawerProps> = ({ student, submissions, assignments, bucketProfiles = [], onClose }) => {
  const [resourcesExpanded, setResourcesExpanded] = useState(false);
  const level = student.gamification?.level || 1;
  const xp = student.gamification?.xp || 0;
  const currency = student.gamification?.currency || 0;
  const rankDetails = getRankDetails(level);
  const playerStats = calculatePlayerStats(student);
  const enrolledClasses = student.enrolledClasses || (student.classType ? [student.classType] : []);
  const completedQuests = student.gamification?.completedQuests?.length || 0;
  const activeQuests = student.gamification?.activeQuests?.filter(q => q.status === 'ACCEPTED' || q.status === 'DEPLOYED').length || 0;

  // Per-class breakdown
  const classBreakdown = useMemo(() => {
    return enrolledClasses.map(cls => {
      const classXp = student.gamification?.classXp?.[cls] || 0;
      const profile = getClassProfile(student, cls);
      const gearScore = calculateGearScore(profile.equipped);
      const inventoryCount = profile.inventory.length;
      const classSubs = submissions.filter(s => {
        const a = assignments.find(a => a.id === s.assignmentId);
        return a?.classType === cls;
      });
      const totalTime = Math.round(classSubs.reduce((acc, s) => acc + (s.metrics?.engagementTime || 0), 0) / 60);
      return { cls, classXp, gearScore, inventoryCount, resourcesViewed: classSubs.length, totalTime };
    });
  }, [student, submissions, assignments, enrolledClasses]);

  // Per-resource performance: aggregate all submissions per assignment
  const resourcePerformance = useMemo(() => {
    const byAssignment = new Map<string, { title: string; classType: string; category: string; visits: number; totalTime: number; totalKeystrokes: number; totalClicks: number; totalPastes: number; lastVisit: string | null; statuses: string[] }>();
    submissions.forEach(s => {
      const a = assignments.find(a => a.id === s.assignmentId);
      const key = s.assignmentId;
      const existing = byAssignment.get(key);
      const engTime = s.metrics?.engagementTime || 0;
      if (existing) {
        existing.visits++;
        existing.totalTime += engTime;
        existing.totalKeystrokes += s.metrics?.keystrokes || 0;
        existing.totalClicks += s.metrics?.clickCount || 0;
        existing.totalPastes += s.metrics?.pasteCount || 0;
        existing.statuses.push(s.status);
        if (s.submittedAt && (!existing.lastVisit || s.submittedAt > existing.lastVisit)) {
          existing.lastVisit = s.submittedAt;
        }
      } else {
        byAssignment.set(key, {
          title: a?.title || s.assignmentTitle,
          classType: a?.classType || 'Unknown',
          category: a?.category || 'Supplemental',
          visits: 1,
          totalTime: engTime,
          totalKeystrokes: s.metrics?.keystrokes || 0,
          totalClicks: s.metrics?.clickCount || 0,
          totalPastes: s.metrics?.pasteCount || 0,
          lastVisit: s.submittedAt || null,
          statuses: [s.status],
        });
      }
    });
    return Array.from(byAssignment.values()).sort((a, b) => b.totalTime - a.totalTime);
  }, [submissions, assignments]);

  // Recent activity (last 10 submissions)
  const recentActivity = useMemo(() => {
    return submissions
      .filter(s => s.submittedAt)
      .sort((a, b) => new Date(b.submittedAt!).getTime() - new Date(a.submittedAt!).getTime())
      .slice(0, 10)
      .map(s => ({
        ...s,
        assignmentTitle: assignments.find(a => a.id === s.assignmentId)?.title || s.assignmentTitle,
        classType: assignments.find(a => a.id === s.assignmentId)?.classType || 'Unknown'
      }));
  }, [submissions, assignments]);

  const totalTime = Math.round(submissions.reduce((acc, s) => acc + (s.metrics?.engagementTime || 0), 0) / 60);

  // Streak (weeks with activity based on submission dates)
  const streak = useMemo(() => {
    const weeks = new Set<string>();
    submissions.forEach(s => {
      if (s.submittedAt) {
        const d = new Date(s.submittedAt);
        const year = d.getFullYear();
        const startOfYear = new Date(year, 0, 1);
        const weekNum = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
        weeks.add(`${year}-W${weekNum}`);
      }
    });
    // Count consecutive weeks ending at current
    const now = new Date();
    const year = now.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const currentWeek = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
    let count = 0;
    for (let w = currentWeek; w > 0; w--) {
      if (weeks.has(`${year}-W${w}`)) count++;
      else break;
    }
    return count;
  }, [submissions]);

  // Engagement trend: last 7 days activity heatmap + trend direction
  const engagementTrend = useMemo(() => {
    const days: { label: string; time: number; subs: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const daySubs = submissions.filter(s => s.submittedAt?.startsWith(dateStr));
      const dayTime = daySubs.reduce((acc, s) => acc + (s.metrics?.engagementTime || 0), 0);
      days.push({
        label: d.toLocaleDateString([], { weekday: 'short' }),
        time: Math.round(dayTime / 60), // minutes
        subs: daySubs.length,
      });
    }
    // Trend: compare last 3 days vs previous 4 days
    const recent = days.slice(4).reduce((a, d) => a + d.time, 0);
    const earlier = days.slice(0, 4).reduce((a, d) => a + d.time, 0);
    const recentAvg = recent / 3;
    const earlierAvg = earlier / 4;
    const trend: 'up' | 'down' | 'flat' = recentAvg > earlierAvg * 1.2 ? 'up' : recentAvg < earlierAvg * 0.6 ? 'down' : 'flat';
    const maxTime = Math.max(1, ...days.map(d => d.time));
    return { days, trend, maxTime };
  }, [submissions]);

  return createPortal(
    <>
      {/* Backdrop overlay — click to close */}
      <div className="fixed inset-0 z-[9998] bg-black/40 animate-in fade-in duration-200" onClick={onClose} />

      <div className="fixed top-0 right-0 bottom-0 z-[9999] w-full xl:max-w-lg">
        <div className="relative w-full bg-[#12132a]/98 border-l border-white/10 h-full overflow-y-auto custom-scrollbar animate-in slide-in-from-right duration-300 shadow-2xl">

          {/* Header */}
          <div className="sticky top-0 z-10 bg-[#12132a]/95 backdrop-blur-md border-b border-white/5 p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl p-0.5 bg-gradient-to-tr from-white/10 to-white/5 ${rankDetails.tierGlow} shadow-xl`}>
                {student.avatarUrl ? (
                  <img src={student.avatarUrl} alt={student.name} className={`w-full h-full rounded-2xl border-2 object-cover ${rankDetails.tierColor.split(' ')[0]}`} />
                ) : (
                  <div className={`w-full h-full rounded-2xl border-2 ${rankDetails.tierColor.split(' ')[0]} bg-purple-500/20 flex items-center justify-center text-xl font-bold text-white`}>
                    {student.name.charAt(0)}
                  </div>
                )}
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">{student.name}</h2>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono uppercase font-bold tracking-widest ${rankDetails.tierColor.split(' ')[1]}`}>{rankDetails.rankName}</span>
                  <span className="text-[10px] text-gray-500">· Lv.{level}</span>
                </div>
                {student.gamification?.codename && (
                  <div className="text-[10px] text-purple-400 italic">"{student.gamification.codename}"</div>
                )}
              </div>
            </div>
            <button onClick={onClose} className="p-2.5 text-gray-400 hover:text-white bg-white/5 hover:bg-red-500/20 hover:text-red-300 border border-white/10 rounded-xl transition group" title="Close">
              <X className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>
          </div>

        <div className="p-6 space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <Zap className="w-5 h-5 text-purple-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-white">{xp.toLocaleString()}</div>
              <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Total XP</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <Clock className="w-5 h-5 text-blue-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-white">{totalTime}m</div>
              <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Total Time</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <BookOpen className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-white">{submissions.length}</div>
              <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Resources</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <Crosshair className="w-5 h-5 text-orange-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-white">{completedQuests}</div>
              <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Missions</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <Package className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-white">{currency}</div>
              <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Cyber-Flux</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
              <Flame className="w-5 h-5 text-red-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-white">{streak}w</div>
              <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Streak</div>
            </div>
          </div>

          {/* Stat Radar (text-based) */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Operative Stats</h4>
            <div className="space-y-2">
              {Object.entries(playerStats).map(([stat, val]) => (
                <div key={stat} className="flex items-center gap-3">
                  <span className="text-[10px] text-gray-400 uppercase w-16 font-bold">{stat}</span>
                  <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-purple-500 to-cyan-400 rounded-full transition-all" style={{ width: `${Math.min(100, val)}%` }} />
                  </div>
                  <span className="text-xs text-white font-bold w-8 text-right">{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Telemetry Bucket & Recommendations */}
          {bucketProfiles.length > 0 && (() => {
            const bp = bucketProfiles[0]; // Primary bucket profile
            const meta = BUCKET_META[bp.bucket as TelemetryBucket];
            if (!meta) return null;
            return (
              <div className={`border rounded-2xl p-4 ${meta.borderColor} ${meta.bgColor}`}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Engagement Bucket</h4>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${meta.color} border ${meta.borderColor}`}>
                    {meta.label}
                  </span>
                </div>
                <p className="text-xs text-gray-300 mb-3">{meta.description}</p>
                {/* Metrics snapshot */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-400 mb-3">
                  <span>ES: {bp.engagementScore}</span>
                  <span>Subs: {bp.metrics.submissionCount}</span>
                  <span>Days Active: {bp.metrics.activityDays}/7</span>
                  <span>Paste Ratio: {Math.round(bp.metrics.avgPasteRatio * 100)}%</span>
                  <span>Time: {Math.round(bp.metrics.totalTime / 60)}m</span>
                </div>
                {/* Recommendation */}
                <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Recommended Action</span>
                  </div>
                  <p className="text-xs text-gray-300 mb-2">{bp.recommendation.action}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {bp.recommendation.categories.map(cat => (
                      <span key={cat} className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-white/5 border border-white/10 text-gray-300">
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
                {/* Matching resources in class */}
                {(() => {
                  const classAssignments = assignments.filter(a =>
                    a.classType === bp.classType &&
                    a.status === 'ACTIVE' &&
                    bp.recommendation.categories.includes(a.category || 'Supplemental')
                  ).slice(0, 3);
                  if (classAssignments.length === 0) return null;
                  return (
                    <div className="mt-3">
                      <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Suggested Resources</div>
                      <div className="space-y-1">
                        {classAssignments.map(a => (
                          <div key={a.id} className="flex items-center gap-2 py-1 text-xs">
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-white/5 text-gray-400">{a.category}</span>
                            <span className="text-white truncate">{a.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* Engagement Trend (7-day) */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">7-Day Engagement</h4>
              <div className="flex items-center gap-1">
                {engagementTrend.trend === 'up' && <TrendingUp className="w-3.5 h-3.5 text-green-400" />}
                {engagementTrend.trend === 'down' && <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
                {engagementTrend.trend === 'flat' && <Minus className="w-3.5 h-3.5 text-gray-400" />}
                <span className={`text-[10px] font-bold uppercase ${engagementTrend.trend === 'up' ? 'text-green-400' : engagementTrend.trend === 'down' ? 'text-red-400' : 'text-gray-400'}`}>
                  {engagementTrend.trend === 'up' ? 'Trending Up' : engagementTrend.trend === 'down' ? 'Declining' : 'Stable'}
                </span>
              </div>
            </div>
            <div className="flex items-end gap-1 h-16">
              {engagementTrend.days.map((day, i) => {
                const height = engagementTrend.maxTime > 0 ? Math.max(2, (day.time / engagementTrend.maxTime) * 100) : 2;
                const isToday = i === engagementTrend.days.length - 1;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div
                      className={`w-full rounded-t transition-all ${day.time > 0 ? (isToday ? 'bg-purple-400' : 'bg-purple-500/60') : 'bg-white/5'}`}
                      style={{ height: `${height}%` }}
                    />
                    <span className="text-[8px] text-gray-500">{day.label}</span>
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-1 hidden group-hover:block bg-black/90 border border-white/10 rounded px-2 py-1 text-[10px] text-white whitespace-nowrap z-10 pointer-events-none">
                      {day.time}m · {day.subs} sub{day.subs !== 1 ? 's' : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Per-Class Breakdown */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Class Performance</h4>
            <div className="space-y-3">
              {classBreakdown.map(cb => (
                <div key={cb.cls} className="bg-black/20 rounded-xl p-3 border border-white/5">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-bold text-white">{cb.cls}</span>
                    <span className="text-xs text-purple-400 font-bold">{cb.classXp.toLocaleString()} XP</span>
                  </div>
                  <div className="flex gap-4 text-[10px] text-gray-400">
                    <span><Shield className="w-3 h-3 inline mr-0.5" />{cb.gearScore} GS</span>
                    <span><Package className="w-3 h-3 inline mr-0.5" />{cb.inventoryCount} items</span>
                    <span><BookOpen className="w-3 h-3 inline mr-0.5" />{cb.resourcesViewed} viewed</span>
                    <span><Clock className="w-3 h-3 inline mr-0.5" />{cb.totalTime}m</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Per-Resource Performance */}
          {resourcePerformance.length > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <button
                onClick={() => setResourcesExpanded(!resourcesExpanded)}
                className="flex items-center justify-between w-full mb-1"
              >
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5" /> Resource Performance
                  <span className="text-[9px] text-gray-600 normal-case tracking-normal font-normal ml-1">({resourcePerformance.length})</span>
                </h4>
                {resourcesExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
              </button>
              {resourcesExpanded && (
                <div className="space-y-2 mt-3">
                  {resourcePerformance.map((r, i) => {
                    const mins = Math.round(r.totalTime / 60);
                    const quality = r.totalKeystrokes > 20 && r.totalClicks > 5 ? 'high' : r.totalClicks > 2 ? 'medium' : 'low';
                    const qualityColor = quality === 'high' ? 'text-green-400' : quality === 'medium' ? 'text-yellow-400' : 'text-red-400';
                    const qualityBg = quality === 'high' ? 'bg-green-500' : quality === 'medium' ? 'bg-yellow-500' : 'bg-red-500';
                    return (
                      <div key={i} className="bg-black/20 rounded-xl p-3 border border-white/5">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-xs text-white font-bold truncate">{r.title}</div>
                            <div className="text-[9px] text-gray-500">{r.classType} · {r.category}</div>
                          </div>
                          <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${qualityBg}`} title={`${quality} engagement`} />
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-[10px]">
                          <div>
                            <div className="text-gray-500">Time</div>
                            <div className="text-white font-bold">{mins}m</div>
                          </div>
                          <div>
                            <div className="text-gray-500">Visits</div>
                            <div className="text-white font-bold">{r.visits}</div>
                          </div>
                          <div>
                            <div className="text-gray-500">Keys</div>
                            <div className="text-white font-bold">{r.totalKeystrokes}</div>
                          </div>
                          <div>
                            <div className="text-gray-500">Quality</div>
                            <div className={`font-bold capitalize ${qualityColor}`}>{quality}</div>
                          </div>
                        </div>
                        {r.lastVisit && (
                          <div className="text-[9px] text-gray-600 mt-1.5">
                            Last visited {new Date(r.lastVisit).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Recent Activity */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Recent Activity</h4>
            {recentActivity.length === 0 ? (
              <p className="text-xs text-gray-500 italic text-center py-4">No recorded activity.</p>
            ) : (
              <div className="space-y-2">
                {recentActivity.map(s => {
                  const engMin = Math.round((s.metrics?.engagementTime || 0) / 60);
                  return (
                    <div key={s.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                      <div className={`w-2 h-2 rounded-full ${engMin >= 5 ? 'bg-green-500' : engMin >= 1 ? 'bg-yellow-500' : 'bg-gray-500'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-white font-bold truncate">{s.assignmentTitle}</div>
                        <div className="text-[10px] text-gray-500">{s.classType} · {engMin}m engaged</div>
                      </div>
                      <div className="text-[10px] text-gray-500 whitespace-nowrap">
                        {s.submittedAt ? new Date(s.submittedAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active Quests */}
          {activeQuests > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Active Missions</h4>
              <div className="space-y-2">
                {student.gamification?.activeQuests?.filter(q => q.status === 'ACCEPTED' || q.status === 'DEPLOYED').map(q => (
                  <div key={q.questId} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                    <div className="flex items-center gap-2">
                      <Crosshair className={`w-3.5 h-3.5 ${q.status === 'DEPLOYED' ? 'text-yellow-400' : 'text-blue-400'}`} />
                      <span className="text-xs text-white">{q.questId}</span>
                    </div>
                    <span className={`text-[10px] font-bold uppercase ${q.status === 'DEPLOYED' ? 'text-yellow-400' : 'text-blue-400'}`}>
                      {q.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Meta */}
          <div className="text-[10px] text-gray-600 space-y-1 pb-4">
            <div>Email: {student.email}</div>
            <div>Section: {student.section || 'Unassigned'}</div>
            <div>Enrolled: {enrolledClasses.join(', ') || 'None'}</div>
            <div>Last login: {student.lastLoginAt ? new Date(student.lastLoginAt).toLocaleString() : 'Never'}</div>
            <div>Created: {student.createdAt ? new Date(student.createdAt).toLocaleDateString() : '—'}</div>
            {student.mutedUntil && new Date(student.mutedUntil) > new Date() && (
              <div className="text-orange-400 font-bold">⚠ Muted until {new Date(student.mutedUntil).toLocaleString()}</div>
            )}
          </div>
        </div>
      </div>
    </div>
    </>,
    document.body
  );
};

export default StudentDetailDrawer;

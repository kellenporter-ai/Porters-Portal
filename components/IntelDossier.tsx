
import React, { useMemo } from 'react';
import { User, Submission, Assignment, RPGItem, PlayerStats } from '../types';
import { deriveCombatStats, calculateGearScore, calculateGemStats, calculateRunewordStats, calculateSetBonusStats, getRankDetails } from '../lib/gamification';
import { classifyStudentBucket, BUCKET_META, getBucketRecommendation, AggregatedStudentMetrics } from '../lib/telemetry';
import { getClassProfile } from '../lib/classProfile';
import { getStreakMultiplier } from '../lib/achievements';
import { Shield, Swords, Heart, Crosshair, Zap, Target, Activity, BarChart3, Flame, Star, ArrowUpRight, Sparkles, Brain } from 'lucide-react';

interface IntelDossierProps {
  user: User;
  submissions: Submission[];
  assignments: Assignment[];
  activeClass: string;
}

// ─── Stat bar with percentage fill ─────────────────────
const StatBar: React.FC<{ label: string; value: number; max: number; color: string; icon: React.ReactNode; description: string }> = ({
  label, value, max, color, icon, description
}) => {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="group relative">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 text-xs">
          <span className={color}>{icon}</span>
          <span className="text-gray-400 font-bold uppercase tracking-wider">{label}</span>
        </div>
        <span className={`text-sm font-black ${color}`}>{value}</span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${color.replace('text-', 'bg-').replace('400', '500/60')}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="absolute -top-10 left-0 hidden group-hover:block z-20 w-56 p-2 bg-black/95 border border-white/10 rounded-lg text-[10px] text-gray-300 shadow-xl">
        {description}
      </div>
    </div>
  );
};

// ─── Mini metric card ──────────────────────────────────
const MetricCard: React.FC<{ label: string; value: string | number; sub?: string; color?: string; icon: React.ReactNode }> = ({
  label, value, sub, color = 'text-white', icon
}) => (
  <div className="bg-black/20 rounded-xl p-3 border border-white/5">
    <div className="flex items-center gap-2 mb-1">
      <span className="text-gray-600">{icon}</span>
      <span className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">{label}</span>
    </div>
    <div className={`text-lg font-black ${color} leading-tight`}>{value}</div>
    {sub && <div className="text-[10px] text-gray-600 mt-0.5">{sub}</div>}
  </div>
);

const IntelDossier: React.FC<IntelDossierProps> = ({ user, submissions, assignments, activeClass }) => {
  const gam = user.gamification;
  const classXp = gam?.classXp?.[activeClass] || 0;
  const totalXp = gam?.xp || 0;
  const level = gam?.level || 1;
  const currency = gam?.currency || 0;
  const streak = gam?.engagementStreak || 0;
  const loginStreak = gam?.loginStreak || 0;
  const rankDetails = getRankDetails(level);

  // Class profile
  const classProfile = useMemo(() => getClassProfile(user, activeClass), [user, activeClass]);
  const equipped = classProfile.equipped;

  // Player stats (base + gear)
  const playerStats = useMemo(() => {
    const base: PlayerStats = { tech: 10, focus: 10, analysis: 10, charisma: 10 };
    const items: RPGItem[] = Object.values(equipped).filter(Boolean) as RPGItem[];
    items.forEach(item => {
      if (item.stats) Object.entries(item.stats).forEach(([key, val]) => {
        base[key as keyof PlayerStats] += (val as number);
      });
    });
    return base;
  }, [equipped]);

  const combat = useMemo(() => deriveCombatStats(playerStats), [playerStats]);
  const gearScore = useMemo(() => calculateGearScore(equipped), [equipped]);
  const gemStats = useMemo(() => calculateGemStats(equipped), [equipped]);
  const runewordStats = useMemo(() => calculateRunewordStats(equipped), [equipped]);
  const setBonusStats = useMemo(() => calculateSetBonusStats(equipped), [equipped]);
  const streakMultiplier = getStreakMultiplier(streak);

  // ─── XP Breakdown by source ──────────────────────────
  const classSubmissions = useMemo(() => {
    const classAssignmentIds = new Set(assignments.filter(a => a.classType === activeClass).map(a => a.id));
    return submissions.filter(s => classAssignmentIds.has(s.assignmentId));
  }, [submissions, assignments, activeClass]);

  const xpBreakdown = useMemo(() => {
    // Engagement XP: approximate from total engagement time
    const totalEngagementSec = classSubmissions.reduce((acc, s) => acc + (s.metrics?.engagementTime || 0), 0);
    const engagementXp = Math.round(totalEngagementSec / 60) * 10; // ~10 XP per minute

    // Quest XP
    const completedQuests = gam?.completedQuests?.length || 0;
    const questXp = completedQuests * 100; // approximate

    // Boss XP (from damage records)
    const bossDamage = gam?.bossDamageDealt || {};
    const bossXp = Object.values(bossDamage).reduce((sum: number, dmg) => sum + (dmg as number), 0) * 2; // approximate

    // Tutoring XP
    const tutoringXp = gam?.tutoringXpEarned || 0;

    // Behavior awards, daily challenges etc. make up the rest
    const otherXp = Math.max(0, classXp - engagementXp - questXp - bossXp - tutoringXp);

    return { engagementXp, questXp, bossXp, tutoringXp, otherXp };
  }, [classSubmissions, gam, classXp]);

  // ─── Telemetry bucket classification ─────────────────
  const bucketInfo = useMemo(() => {
    // Aggregate metrics from submissions over last 7 days
    const now = Date.now();
    const windowMs = 7 * 24 * 60 * 60 * 1000;
    const recentSubs = classSubmissions.filter(s => {
      const t = s.submittedAt ? new Date(s.submittedAt).getTime() : 0;
      return t > now - windowMs;
    });

    const activityDays = new Set(
      recentSubs
        .filter(s => s.submittedAt)
        .map(s => new Date(s.submittedAt!).toISOString().split('T')[0])
    ).size;

    const metrics: AggregatedStudentMetrics = {
      totalTime: recentSubs.reduce((a, s) => a + (s.metrics?.engagementTime || 0), 0),
      submissionCount: recentSubs.length,
      totalClicks: recentSubs.reduce((a, s) => a + (s.metrics?.clickCount || 0), 0),
      totalPastes: recentSubs.reduce((a, s) => a + (s.metrics?.pasteCount || 0), 0),
      totalKeystrokes: recentSubs.reduce((a, s) => a + (s.metrics?.keystrokes || 0), 0),
      totalXP: classXp,
      activityDays,
    };

    // Estimate class mean/stddev from this student's data as a reference
    // (students only see their own data, so we provide a rough benchmark)
    const engagementScore = metrics.totalTime / 60 + metrics.submissionCount * 10;
    const estimatedMean = 150; // rough benchmark for a 7-day window
    const estimatedStdDev = 60;

    const bucket = classifyStudentBucket(metrics, engagementScore, estimatedMean, estimatedStdDev);
    const recommendation = getBucketRecommendation(bucket);
    const meta = BUCKET_META[bucket];

    return { bucket, recommendation, meta, metrics, engagementScore };
  }, [classSubmissions, classXp]);

  // ─── Activity timeline (last 7 days) ─────────────────
  const activityTimeline = useMemo(() => {
    const days: { label: string; count: number; minutes: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('en', { weekday: 'short' });
      const daySubs = classSubmissions.filter(s => s.submittedAt?.startsWith(dateStr));
      days.push({
        label,
        count: daySubs.length,
        minutes: Math.round(daySubs.reduce((a, s) => a + (s.metrics?.engagementTime || 0), 0) / 60),
      });
    }
    return days;
  }, [classSubmissions]);

  const maxDayMinutes = Math.max(1, ...activityTimeline.map(d => d.minutes));

  // ─── Submission status breakdown ──────────────────────
  const statusBreakdown = useMemo(() => {
    const counts = { SUCCESS: 0, NORMAL: 0, SUPPORT_NEEDED: 0, FLAGGED: 0, STARTED: 0 };
    classSubmissions.forEach(s => {
      if (s.status in counts) counts[s.status as keyof typeof counts]++;
    });
    return counts;
  }, [classSubmissions]);

  return (
    <div className="space-y-6" style={{ animation: 'tabEnter 0.3s ease-out both' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-400" />
            Intel Dossier
          </h2>
          <p className="text-xs text-gray-500 mt-1">Classified operative analysis — {activeClass}</p>
        </div>
        <div className="text-right">
          <div className={`text-sm font-black ${rankDetails.tierColor.split(' ')[1]}`}>{rankDetails.rankName}</div>
          <div className="text-[10px] text-gray-500">Level {level}</div>
        </div>
      </div>

      {/* ═══════════════ ROW 1: OVERVIEW METRICS ═══════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Class XP" value={classXp.toLocaleString()} sub={`${totalXp.toLocaleString()} total across all classes`} color="text-amber-400" icon={<Zap className="w-3.5 h-3.5" />} />
        <MetricCard label="Gear Score" value={gearScore} sub={`${Object.values(equipped).filter(Boolean).length}/8 slots filled`} color="text-purple-400" icon={<Shield className="w-3.5 h-3.5" />} />
        <MetricCard label="Resources Accessed" value={classSubmissions.length} sub={`${statusBreakdown.SUCCESS} excellent`} color="text-emerald-400" icon={<Target className="w-3.5 h-3.5" />} />
        <MetricCard label="Cyber-Flux" value={currency} sub="crafting currency" color="text-cyan-400" icon={<Sparkles className="w-3.5 h-3.5" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ═══════════════ COMBAT STATS DEEP DIVE ═══════════════ */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
            <Swords className="w-4 h-4 text-red-400" /> Combat Analysis
          </h3>
          <p className="text-[11px] text-gray-500 -mt-2">How your character stats translate to boss fight performance</p>

          <div className="space-y-3">
            <StatBar label="Tech" value={playerStats.tech} max={100} color="text-blue-400" icon={<Zap className="w-3 h-3" />} description="Attack Power — Increases base damage dealt to bosses in quiz events." />
            <StatBar label="Focus" value={playerStats.focus} max={100} color="text-green-400" icon={<Crosshair className="w-3 h-3" />} description={`Critical Strikes — ${(combat.critChance * 100).toFixed(0)}% crit chance, ${combat.critMultiplier.toFixed(2)}x crit multiplier.`} />
            <StatBar label="Analysis" value={playerStats.analysis} max={100} color="text-yellow-400" icon={<Shield className="w-3 h-3" />} description={`Armor — Reduces incoming boss damage by ${combat.armorPercent.toFixed(0)}%.`} />
            <StatBar label="Charisma" value={playerStats.charisma} max={100} color="text-purple-400" icon={<Heart className="w-3 h-3" />} description={`Health Pool — Gives you ${combat.maxHp} HP in boss fights (base 100 + 5 per charisma above 10).`} />
          </div>

          {/* Derived combat readouts */}
          <div className="grid grid-cols-4 gap-2 pt-3 border-t border-white/5">
            <div className="text-center">
              <div className="text-[9px] text-gray-600 uppercase font-bold">Max HP</div>
              <div className="text-sm font-black text-emerald-400">{combat.maxHp}</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] text-gray-600 uppercase font-bold">Armor</div>
              <div className="text-sm font-black text-yellow-400">{combat.armorPercent.toFixed(0)}%</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] text-gray-600 uppercase font-bold">Crit %</div>
              <div className="text-sm font-black text-green-400">{(combat.critChance * 100).toFixed(0)}%</div>
            </div>
            <div className="text-center">
              <div className="text-[9px] text-gray-600 uppercase font-bold">Crit Dmg</div>
              <div className="text-sm font-black text-red-400">{combat.critMultiplier.toFixed(2)}x</div>
            </div>
          </div>

          {/* Stat source breakdown */}
          {(Object.keys(gemStats).length > 0 || Object.keys(runewordStats).length > 0 || Object.keys(setBonusStats).length > 0) && (
            <div className="pt-3 border-t border-white/5 space-y-2">
              <div className="text-[9px] text-gray-600 uppercase font-bold tracking-widest">Stat Sources</div>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <div className="flex justify-between text-gray-500"><span>Base Stats</span><span className="text-gray-400">10 each</span></div>
                {Object.keys(gemStats).length > 0 && (
                  <div className="flex justify-between text-cyan-400/70"><span>Gems</span><span>+{Object.values(gemStats).reduce((a, b) => a + b, 0)}</span></div>
                )}
                {Object.keys(runewordStats).length > 0 && (
                  <div className="flex justify-between text-orange-400/70"><span>Runewords</span><span>+{Object.values(runewordStats).reduce((a, b) => a + b, 0)}</span></div>
                )}
                {Object.keys(setBonusStats).length > 0 && (
                  <div className="flex justify-between text-amber-400/70"><span>Set Bonus</span><span>+{Object.values(setBonusStats).reduce((a, b) => a + b, 0)}</span></div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ═══════════════ XP BREAKDOWN ═══════════════ */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" /> XP Sources
          </h3>
          <p className="text-[11px] text-gray-500 -mt-2">Where your {classXp.toLocaleString()} XP in {activeClass} came from</p>

          <div className="space-y-2">
            {[
              { label: 'Resource Engagement', xp: xpBreakdown.engagementXp, color: 'bg-purple-500', textColor: 'text-purple-400', desc: '~10 XP per minute of active engagement' },
              { label: 'Mission Rewards', xp: xpBreakdown.questXp, color: 'bg-indigo-500', textColor: 'text-indigo-400', desc: 'XP from completing contracts' },
              { label: 'Boss Encounters', xp: xpBreakdown.bossXp, color: 'bg-red-500', textColor: 'text-red-400', desc: 'XP from boss quiz damage' },
              { label: 'Peer Tutoring', xp: xpBreakdown.tutoringXp, color: 'bg-emerald-500', textColor: 'text-emerald-400', desc: 'XP earned helping other agents' },
              { label: 'Other (Badges, Daily, Behavior)', xp: xpBreakdown.otherXp, color: 'bg-amber-500', textColor: 'text-amber-400', desc: 'Login rewards, behavior awards, badge XP' },
            ].filter(s => s.xp > 0).map(source => (
              <div key={source.label} className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${source.color}`} />
                <div className="flex-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-300">{source.label}</span>
                    <span className={`font-bold ${source.textColor}`}>~{source.xp.toLocaleString()} XP</span>
                  </div>
                  <div className="text-[10px] text-gray-600">{source.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Active multipliers */}
          {(streakMultiplier > 1) && (
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 mt-2">
              <div className="flex items-center gap-2 text-xs">
                <Flame className="w-4 h-4 text-orange-400" />
                <span className="text-orange-400 font-bold">Streak Bonus Active</span>
                <span className="ml-auto text-sm font-black text-yellow-400">+{Math.round((streakMultiplier - 1) * 100)}%</span>
              </div>
              <div className="text-[10px] text-gray-500 mt-1">{streak}-week engagement streak &middot; All XP earnings boosted</div>
            </div>
          )}

          {/* Login streak */}
          {loginStreak > 1 && (
            <div className="flex items-center gap-2 text-xs text-gray-500 pt-2 border-t border-white/5">
              <Star className="w-3.5 h-3.5 text-purple-400" />
              <span>{loginStreak}-day daily login streak</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ═══════════════ TELEMETRY BUCKET ═══════════════ */}
        <div className={`border rounded-2xl p-5 space-y-4 ${bucketInfo.meta.bgColor} ${bucketInfo.meta.borderColor}`}>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <Activity className="w-4 h-4" /> Engagement Status
            </h3>
            <span className={`text-sm font-black ${bucketInfo.meta.color}`}>{bucketInfo.meta.label}</span>
          </div>

          <p className="text-sm text-gray-300">{bucketInfo.meta.description}</p>

          {/* Why this bucket */}
          <div className="bg-black/20 rounded-xl p-3 border border-white/5 space-y-2">
            <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">Why this classification</div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="flex justify-between">
                <span className="text-gray-500">Active time (7d)</span>
                <span className="text-gray-300 font-mono">{Math.round(bucketInfo.metrics.totalTime / 60)}m</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Resources (7d)</span>
                <span className="text-gray-300 font-mono">{bucketInfo.metrics.submissionCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Active days</span>
                <span className="text-gray-300 font-mono">{bucketInfo.metrics.activityDays}/7</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Keystrokes</span>
                <span className="text-gray-300 font-mono">{bucketInfo.metrics.totalKeystrokes}</span>
              </div>
            </div>
          </div>

          {/* Recommendation */}
          <div className="bg-black/20 rounded-xl p-3 border border-white/5">
            <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-1">How to level up your status</div>
            <p className="text-sm text-gray-300">{bucketInfo.recommendation.studentTip}</p>
          </div>

          {/* Recommended resources */}
          <div>
            <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-2">Recommended for you</div>
            <div className="flex flex-wrap gap-1.5">
              {bucketInfo.recommendation.categories.map(cat => (
                <span key={cat} className="text-[10px] bg-white/5 border border-white/10 px-2.5 py-1 rounded-full text-gray-300 font-medium">
                  {cat}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ═══════════════ WEEKLY ACTIVITY CHART ═══════════════ */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" /> 7-Day Activity
          </h3>

          <div className="flex items-end gap-2 h-32">
            {activityTimeline.map((day, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="text-[9px] text-gray-600 font-mono">{day.minutes}m</div>
                <div className="w-full bg-white/5 rounded-t-lg relative flex-1 flex items-end">
                  <div
                    className={`w-full rounded-t-lg transition-all duration-500 ${
                      day.minutes > 0 ? 'bg-purple-500/50 border border-purple-500/30' : 'bg-white/5'
                    }`}
                    style={{ height: `${Math.max(day.minutes > 0 ? 8 : 0, (day.minutes / maxDayMinutes) * 100)}%` }}
                  />
                </div>
                <div className="text-[9px] text-gray-500 font-bold">{day.label}</div>
                {day.count > 0 && (
                  <div className="text-[8px] text-gray-600">{day.count} res</div>
                )}
              </div>
            ))}
          </div>

          {/* Submission status breakdown */}
          <div className="pt-3 border-t border-white/5">
            <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-2">Submission Quality</div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {statusBreakdown.SUCCESS > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-gray-400">Excellent</span>
                  <span className="text-emerald-400 font-bold ml-auto">{statusBreakdown.SUCCESS}</span>
                </div>
              )}
              {statusBreakdown.NORMAL > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-gray-400">Normal</span>
                  <span className="text-blue-400 font-bold ml-auto">{statusBreakdown.NORMAL}</span>
                </div>
              )}
              {statusBreakdown.SUPPORT_NEEDED > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-gray-400">Needs Support</span>
                  <span className="text-amber-400 font-bold ml-auto">{statusBreakdown.SUPPORT_NEEDED}</span>
                </div>
              )}
              {statusBreakdown.STARTED > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-gray-500" />
                  <span className="text-gray-400">Started</span>
                  <span className="text-gray-400 font-bold ml-auto">{statusBreakdown.STARTED}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════ BOSS FIGHT READINESS ═══════════════ */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
          <Swords className="w-4 h-4 text-red-400" /> Boss Fight Readiness
        </h3>
        <p className="text-[11px] text-gray-500 -mt-2">How your equipment and stats prepare you for boss quiz encounters</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Offense */}
          <div className="bg-black/20 rounded-xl p-4 border border-red-500/10 space-y-2">
            <div className="text-[10px] text-red-400 uppercase font-bold tracking-widest flex items-center gap-1.5">
              <Swords className="w-3 h-3" /> Offense
            </div>
            <div className="text-sm text-gray-300">
              Your <span className="text-blue-400 font-bold">{playerStats.tech} Tech</span> powers your base attack.
              {playerStats.tech > 20 && <span className="text-emerald-400"> Strong offensive capability.</span>}
              {playerStats.tech <= 20 && playerStats.tech > 10 && <span className="text-yellow-400"> Moderate damage output.</span>}
              {playerStats.tech <= 10 && <span className="text-red-400"> Low damage — equip Tech gear to improve.</span>}
            </div>
            <div className="text-[10px] text-gray-500">
              Crit chance: <span className="text-green-400 font-bold">{(combat.critChance * 100).toFixed(0)}%</span> (from {playerStats.focus} Focus)
            </div>
          </div>

          {/* Defense */}
          <div className="bg-black/20 rounded-xl p-4 border border-yellow-500/10 space-y-2">
            <div className="text-[10px] text-yellow-400 uppercase font-bold tracking-widest flex items-center gap-1.5">
              <Shield className="w-3 h-3" /> Defense
            </div>
            <div className="text-sm text-gray-300">
              <span className="text-yellow-400 font-bold">{combat.armorPercent.toFixed(0)}% Armor</span> from {playerStats.analysis} Analysis reduces boss damage.
              {combat.armorPercent >= 30 && <span className="text-emerald-400"> Excellent damage mitigation.</span>}
              {combat.armorPercent < 30 && combat.armorPercent >= 15 && <span className="text-yellow-400"> Decent protection.</span>}
              {combat.armorPercent < 15 && <span className="text-red-400"> Vulnerable — equip Analysis gear.</span>}
            </div>
          </div>

          {/* Survivability */}
          <div className="bg-black/20 rounded-xl p-4 border border-emerald-500/10 space-y-2">
            <div className="text-[10px] text-emerald-400 uppercase font-bold tracking-widest flex items-center gap-1.5">
              <Heart className="w-3 h-3" /> Survivability
            </div>
            <div className="text-sm text-gray-300">
              <span className="text-emerald-400 font-bold">{combat.maxHp} HP</span> from {playerStats.charisma} Charisma.
              {combat.maxHp >= 150 && <span className="text-emerald-400"> Large health pool — can absorb many hits.</span>}
              {combat.maxHp < 150 && combat.maxHp >= 120 && <span className="text-yellow-400"> Average survivability.</span>}
              {combat.maxHp < 120 && <span className="text-red-400"> Fragile — Charisma gear increases HP.</span>}
            </div>
          </div>
        </div>

        {/* Improvement tips */}
        <div className="bg-black/20 rounded-xl p-3 border border-white/5">
          <div className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mb-2">Recommendations</div>
          <div className="space-y-1.5">
            {gearScore < 100 && (
              <div className="flex items-start gap-2 text-[11px] text-gray-400">
                <ArrowUpRight className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />
                <span>Your Gear Score is <span className="text-amber-400 font-bold">{gearScore}</span>. Complete more missions and level up to earn better equipment drops.</span>
              </div>
            )}
            {playerStats.tech <= 15 && (
              <div className="flex items-start gap-2 text-[11px] text-gray-400">
                <ArrowUpRight className="w-3 h-3 text-blue-400 mt-0.5 shrink-0" />
                <span>Equip items with <span className="text-blue-400 font-bold">Tech</span> stats to increase boss damage output.</span>
              </div>
            )}
            {combat.critChance < 0.1 && (
              <div className="flex items-start gap-2 text-[11px] text-gray-400">
                <ArrowUpRight className="w-3 h-3 text-green-400 mt-0.5 shrink-0" />
                <span>Socket <span className="text-green-400 font-bold">Focus</span> gems to boost critical hit chance beyond {(combat.critChance * 100).toFixed(0)}%.</span>
              </div>
            )}
            {combat.armorPercent < 10 && (
              <div className="flex items-start gap-2 text-[11px] text-gray-400">
                <ArrowUpRight className="w-3 h-3 text-yellow-400 mt-0.5 shrink-0" />
                <span>Your armor is low. <span className="text-yellow-400 font-bold">Analysis</span> items will reduce boss damage significantly.</span>
              </div>
            )}
            {gearScore >= 100 && combat.critChance >= 0.1 && combat.armorPercent >= 10 && playerStats.tech > 15 && (
              <div className="flex items-start gap-2 text-[11px] text-emerald-400">
                <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
                <span>Your loadout is well-balanced. Consider specializing in one stat for even greater effectiveness.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IntelDossier;

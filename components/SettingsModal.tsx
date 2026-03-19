
import React from 'react';
import { User, UserSettings } from '../types';
import { Cpu, Shield, Loader2, Save, Volume2, VolumeX, BellRing, KeyRound, CheckCircle, Sun, Moon } from 'lucide-react';
import Modal from './Modal';
import { useToast } from './ToastProvider';
import { useTheme } from '../lib/ThemeContext';
import { isPushSupported, getPushPermission, requestPushPermission } from '../lib/usePushNotifications';

import { dataService } from '../services/dataService';
import { reportError } from '../lib/errorReporting';
import { setSfxEnabled, setSfxVolume } from '../lib/sfx';

// ─── Inline component for joining another class via enrollment code ───
const JoinClassSection: React.FC<{ userId: string }> = ({ userId }) => {
  const [code, setCode] = React.useState('');
  const [isRedeeming, setIsRedeeming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const toast = useToast();

  const handleCodeChange = (raw: string) => {
    const cleaned = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8);
    setCode(cleaned.length > 4 ? cleaned.slice(0, 4) + '-' + cleaned.slice(4) : cleaned);
    setError(null);
    setSuccess(null);
  };

  const handleRedeem = async () => {
    if (code.replace('-', '').length < 4) { setError('Enter a valid code.'); return; }
    setIsRedeeming(true);
    setError(null);
    try {
      const result = await dataService.redeemEnrollmentCode(code, userId);
      if (result.success) {
        setSuccess(`Enrolled in ${result.classType}!`);
        toast.success(`Joined ${result.classType}!`);
        setCode('');
      } else {
        setError(result.error || 'Failed to redeem code.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsRedeeming(false);
    }
  };

  return (
    <div className="mb-6">
      <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2 px-1">Enrollment</label>
      <div className="p-4 bg-[var(--surface-glass)] rounded-2xl border border-[var(--border)]">
        <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)] mb-2">
          <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
          Join Another Class
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={code}
            onChange={e => handleCodeChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !isRedeeming) handleRedeem(); }}
            placeholder="XXXX-XXXX"
            className="flex-1 bg-[var(--surface-sunken)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm font-mono font-bold text-emerald-400 tracking-widest placeholder-[var(--text-muted)] focus:outline-none focus:border-emerald-500/50 focus-visible:ring-2 focus-visible:ring-purple-400 transition"
            maxLength={9}
            disabled={isRedeeming}
          />
          <button
            onClick={handleRedeem}
            disabled={isRedeeming || code.replace('-', '').length < 4}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
          >
            {isRedeeming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Join'}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        {success && (
          <p className="mt-2 text-xs text-emerald-400 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5" /> {success}
          </p>
        )}
      </div>
    </div>
  );
};

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onSaveSettings: (settings: UserSettings) => Promise<void>;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, user, onSaveSettings }) => {
  const [localSettings, setLocalSettings] = React.useState<UserSettings>(user.settings || {
    performanceMode: false,
    privacyMode: false,
    compactView: true,
    soundEffects: true,
    themeMode: 'dark'
  });
  const [codename, setCodename] = React.useState(user.gamification?.codename || '');
  const [isSaving, setIsSaving] = React.useState(false);
  const toast = useToast();
  const { theme, setTheme } = useTheme();

  // Re-sync localSettings from persisted user.settings every time modal opens
  React.useEffect(() => {
    if (isOpen) {
      setLocalSettings(user.settings || {
        performanceMode: false,
        privacyMode: false,
        compactView: true,
        soundEffects: true,
        themeMode: 'dark'
      });
      setCodename(user.gamification?.codename || '');
    }
  }, [isOpen, user.settings, user.gamification?.codename]);

  // Revert sfx to persisted settings when modal closes (handles cancel without save)
  React.useEffect(() => {
    if (!isOpen) {
      setSfxEnabled(user.settings?.soundEffects !== false);
      setSfxVolume(user.settings?.soundVolume ?? 0.5);
    }
  }, [isOpen, user.settings?.soundEffects, user.settings?.soundVolume]);

  const handleToggle = (key: keyof UserSettings) => {
    setLocalSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    // Apply sound settings immediately (don't wait for Firestore round-trip)
    setSfxEnabled(localSettings.soundEffects !== false);
    setSfxVolume(localSettings.soundVolume ?? 0.5);
    try {
      await onSaveSettings(localSettings);
      if (codename !== (user.gamification?.codename || '')) {
        await dataService.updateCodename(user.id, codename.trim().slice(0, 24));
      }
      onClose();
    } catch (err) {
      reportError(err, { component: 'SettingsModal' });
      toast.error("Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const SettingRow = ({ 
    icon: Icon, 
    title, 
    description, 
    value, 
    onToggle 
  }: { 
    icon: React.ElementType,
    title: string, 
    description: string, 
    value: boolean, 
    onToggle: () => void 
  }) => (
    <div className="flex items-center justify-between p-4 bg-[var(--surface-glass)] rounded-2xl border border-[var(--border)] hover:border-[var(--border-accent)] transition">
      <div className="flex items-start gap-4">
        <div className={`p-2 rounded-xl ${value ? 'bg-purple-500/20 text-purple-400' : 'bg-[var(--surface-glass-heavy)] text-[var(--text-tertiary)]'}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-bold text-[var(--text-primary)] text-sm">{title}</h4>
          <p className="text-xs text-[var(--text-tertiary)] leading-tight mt-0.5">{description}</p>
        </div>
      </div>
      <button
        onClick={onToggle}
        className={`relative shrink-0 h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ring-offset)] ${value ? 'bg-[var(--accent)]' : 'bg-[var(--toggle-off)]'}`}
      >
        <span className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${value ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="User Control Center" maxWidth="max-w-md">
      <div className="space-y-3">
        <div className="mb-4">
          <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2 px-1">Visuals & Performance</label>
          <div className="space-y-2">
            <SettingRow
              icon={Cpu} 
              title="Performance Mode" 
              description="Disable blurs and heavy animations for older hardware." 
              value={localSettings.performanceMode} 
              onToggle={() => handleToggle('performanceMode')} 
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2 px-1">Privacy & Identity</label>
          <div className="space-y-2">
            <SettingRow 
              icon={Shield} 
              title="Privacy Codename" 
              description="Hide real name on leaderboards and use your operative codename." 
              value={localSettings.privacyMode} 
              onToggle={() => handleToggle('privacyMode')} 
            />
            {localSettings.privacyMode && (
              <div className="p-4 bg-[var(--surface-glass)] rounded-2xl border border-[var(--border)]">
                <label className="text-xs font-bold text-[var(--text-secondary)] block mb-2">Operative Codename</label>
                <input
                  type="text"
                  value={codename}
                  onChange={(e) => setCodename(e.target.value.slice(0, 24))}
                  placeholder="Enter codename..."
                  className="w-full bg-[var(--surface-sunken)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-purple-400 transition"
                  maxLength={24}
                />
                <p className="text-[10px] text-[var(--text-tertiary)] mt-1">{codename.length}/24 characters</p>
              </div>
            )}
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2 px-1">Interface</label>
          <div className="space-y-2">
            <SettingRow
              icon={localSettings.soundEffects === false ? VolumeX : Volume2}
              title="Sound Effects"
              description="Play audio feedback for XP gains, level ups, and actions."
              value={localSettings.soundEffects !== false}
              onToggle={() => setLocalSettings(prev => {
                const next = prev.soundEffects === false;
                setSfxEnabled(next);
                return { ...prev, soundEffects: next };
              })}
            />
            {localSettings.soundEffects !== false && (
              <div className="p-4 bg-[var(--surface-glass)] rounded-2xl border border-[var(--border)]">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-2">
                    <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                    Master Volume
                  </label>
                  <span className="text-xs font-mono text-purple-400">{Math.round((localSettings.soundVolume ?? 0.5) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round((localSettings.soundVolume ?? 0.5) * 100)}
                  onChange={e => {
                    const vol = parseInt(e.target.value) / 100;
                    setSfxVolume(vol);
                    setLocalSettings(prev => ({ ...prev, soundVolume: vol }));
                  }}
                  className="w-full h-1.5 bg-[var(--toggle-off)] rounded-full appearance-none cursor-pointer accent-[var(--accent)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-purple-500/50"
                />
              </div>
            )}
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2 px-1">Notifications</label>
          <div className="space-y-2">
            {isPushSupported() ? (
              <div className="flex items-center justify-between p-4 bg-[var(--surface-glass)] rounded-2xl border border-[var(--border)] hover:border-[var(--border-accent)] transition">
                <div className="flex items-start gap-4">
                  <div className={`p-2 rounded-xl ${localSettings.pushNotifications ? 'bg-purple-500/20 text-purple-400' : 'bg-[var(--surface-glass-heavy)] text-[var(--text-tertiary)]'}`}>
                    <BellRing className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-[var(--text-primary)] text-sm">Push Notifications</h4>
                    <p className="text-xs text-[var(--text-tertiary)] leading-tight mt-0.5">
                      {getPushPermission() === 'denied'
                        ? 'Blocked by your browser. Allow notifications in browser settings to enable.'
                        : 'Get desktop alerts for quests, loot drops, and announcements when the tab is in the background.'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    if (localSettings.pushNotifications) {
                      setLocalSettings(prev => ({ ...prev, pushNotifications: false }));
                    } else {
                      const perm = await requestPushPermission();
                      if (perm === 'granted') {
                        setLocalSettings(prev => ({ ...prev, pushNotifications: true }));
                        toast.success('Push notifications enabled!');
                      } else if (perm === 'denied') {
                        toast.error('Notifications blocked by browser. Check your browser settings.');
                      }
                    }
                  }}
                  disabled={getPushPermission() === 'denied'}
                  className={`relative shrink-0 h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ring-offset)] ${
                    getPushPermission() === 'denied' ? 'bg-[var(--toggle-off)] opacity-50 cursor-not-allowed' :
                    localSettings.pushNotifications ? 'bg-[var(--accent)]' : 'bg-[var(--toggle-off)]'
                  }`}
                >
                  <span className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${localSettings.pushNotifications ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            ) : (
              <div className="p-4 bg-[var(--surface-glass)] rounded-2xl border border-[var(--border)] text-xs text-[var(--text-tertiary)]">
                Push notifications are not supported in this browser.
              </div>
            )}
          </div>
        </div>

        {/* ─── Appearance ─── */}
        <div className="mb-6">
          <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2 px-1">Appearance</label>
          <div className="flex gap-2 p-1.5 bg-[var(--surface-glass)] border border-[var(--border)] rounded-xl">
            <button
              onClick={() => { setTheme('light'); setLocalSettings(prev => ({ ...prev, themeMode: 'light' })); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-bold transition ${
                theme === 'light'
                  ? 'bg-[var(--accent)] text-white shadow-lg'
                  : 'text-[var(--text-muted)] hover:bg-[var(--surface-glass-heavy)]'
              }`}
            >
              <Sun className="w-4 h-4" />
              Light
            </button>
            <button
              onClick={() => { setTheme('dark'); setLocalSettings(prev => ({ ...prev, themeMode: 'dark' })); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-bold transition ${
                theme === 'dark'
                  ? 'bg-[var(--accent)] text-white shadow-lg'
                  : 'text-[var(--text-muted)] hover:bg-[var(--surface-glass-heavy)]'
              }`}
            >
              <Moon className="w-4 h-4" />
              Dark
            </button>
          </div>
        </div>

        {/* Join Another Class */}
        {user.role === 'STUDENT' && (
          <JoinClassSection userId={user.id} />
        )}

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white py-3 rounded-2xl font-bold transition shadow-lg shadow-purple-900/30 flex items-center justify-center gap-2"
        >
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          Apply Changes
        </button>
      </div>
    </Modal>
  );
};

export default SettingsModal;

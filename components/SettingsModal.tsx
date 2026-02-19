
import React from 'react';
import { User, UserSettings } from '../types';
import { Monitor, Cpu, Shield, Layout as LayoutIcon, Loader2, Save, Volume2, BellRing } from 'lucide-react';
import Modal from './Modal';
import { useToast } from './ToastProvider';
import { isPushSupported, getPushPermission, requestPushPermission } from '../lib/usePushNotifications';

import { dataService } from '../services/dataService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onSaveSettings: (settings: UserSettings) => Promise<void>;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, user, onSaveSettings }) => {
  const [localSettings, setLocalSettings] = React.useState<UserSettings>(user.settings || {
    liveBackground: true,
    performanceMode: false,
    privacyMode: false,
    compactView: false,
    soundEffects: true
  });
  const [codename, setCodename] = React.useState(user.gamification?.codename || '');
  const [isSaving, setIsSaving] = React.useState(false);
  const toast = useToast();

  const handleToggle = (key: keyof UserSettings) => {
    setLocalSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveSettings(localSettings);
      if (codename !== (user.gamification?.codename || '')) {
        await dataService.updateCodename(user.id, codename.trim().slice(0, 24));
      }
      onClose();
    } catch (err) {
      console.error(err);
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
    <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10 hover:border-purple-500/30 transition">
      <div className="flex items-start gap-4">
        <div className={`p-2 rounded-xl ${value ? 'bg-purple-500/20 text-purple-400' : 'bg-white/10 text-gray-500'}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-bold text-white text-sm">{title}</h4>
          <p className="text-xs text-gray-500 leading-tight mt-0.5">{description}</p>
        </div>
      </div>
      <button
        onClick={onToggle}
        className={`relative shrink-0 h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none ${value ? 'bg-purple-600' : 'bg-white/20'}`}
      >
        <span className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${value ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="User Control Center" maxWidth="max-w-md">
      <div className="space-y-3">
        <div className="mb-4">
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Visuals & Performance</label>
          <div className="space-y-2">
            <SettingRow 
              icon={Monitor} 
              title="Live Neon Background" 
              description="Toggle the video loop background. Disable to save GPU." 
              value={localSettings.liveBackground} 
              onToggle={() => handleToggle('liveBackground')} 
            />
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
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Privacy & Identity</label>
          <div className="space-y-2">
            <SettingRow 
              icon={Shield} 
              title="Privacy Codename" 
              description="Hide real name on leaderboards and use your operative codename." 
              value={localSettings.privacyMode} 
              onToggle={() => handleToggle('privacyMode')} 
            />
            {localSettings.privacyMode && (
              <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                <label className="text-xs font-bold text-gray-300 block mb-2">Operative Codename</label>
                <input
                  type="text"
                  value={codename}
                  onChange={(e) => setCodename(e.target.value.slice(0, 24))}
                  placeholder="Enter codename..."
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition"
                  maxLength={24}
                />
                <p className="text-[10px] text-gray-500 mt-1">{codename.length}/24 characters</p>
              </div>
            )}
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Interface</label>
          <div className="space-y-2">
            <SettingRow 
              icon={LayoutIcon} 
              title="Compact View" 
              description="Reduce sidebar and dashboard padding for power users." 
              value={localSettings.compactView} 
              onToggle={() => handleToggle('compactView')} 
            />
            <SettingRow
              icon={Volume2}
              title="Sound Effects"
              description="Play audio feedback for XP gains, level ups, and actions."
              value={localSettings.soundEffects !== false}
              onToggle={() => setLocalSettings(prev => ({ ...prev, soundEffects: prev.soundEffects === false ? true : false }))}
            />
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Notifications</label>
          <div className="space-y-2">
            {isPushSupported() ? (
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10 hover:border-purple-500/30 transition">
                <div className="flex items-start gap-4">
                  <div className={`p-2 rounded-xl ${localSettings.pushNotifications ? 'bg-purple-500/20 text-purple-400' : 'bg-white/10 text-gray-500'}`}>
                    <BellRing className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">Push Notifications</h4>
                    <p className="text-xs text-gray-500 leading-tight mt-0.5">
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
                  className={`relative shrink-0 h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none ${
                    getPushPermission() === 'denied' ? 'bg-white/10 opacity-50 cursor-not-allowed' :
                    localSettings.pushNotifications ? 'bg-purple-600' : 'bg-white/20'
                  }`}
                >
                  <span className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${localSettings.pushNotifications ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            ) : (
              <div className="p-4 bg-white/5 rounded-2xl border border-white/10 text-xs text-gray-500">
                Push notifications are not supported in this browser.
              </div>
            )}
          </div>
        </div>

        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-2xl font-bold transition shadow-lg shadow-purple-900/30 flex items-center justify-center gap-2"
        >
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          Apply Changes
        </button>
      </div>
    </Modal>
  );
};

export default SettingsModal;

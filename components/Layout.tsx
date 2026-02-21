
import React, { useState, useEffect } from 'react';
import { User, UserRole, UserSettings } from '../types';
import { NAVIGATION, NavItem } from '../constants';
import { LogOut, GraduationCap, Settings, Menu, X, ChevronDown } from 'lucide-react';
import { storage } from '../lib/firebase';
import { ref, getDownloadURL } from 'firebase/storage';
import SettingsModal from './SettingsModal';
import NotificationBell from './NotificationBell';
import { dataService } from '../services/dataService';

interface LayoutProps {
  user: User;
  onLogout: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ user, onLogout, activeTab, setActiveTab, children }) => {
  const [bgUrl, setBgUrl] = useState<string>('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Derived settings with defaults
  const settings: UserSettings = user.settings || {
    liveBackground: true,
    performanceMode: false,
    privacyMode: false,
    compactView: false
  };

  useEffect(() => {
    if (!settings.liveBackground) {
        setBgUrl('');
        return;
    }

    const fetchBg = async () => {
      try {
        const videoRef = ref(storage, 'public/background.mp4');
        const url = await getDownloadURL(videoRef);
        setBgUrl(url);
      } catch (err) {
        console.warn("Firebase background not found, using local fallback.");
        setBgUrl('/background.mp4');
      }
    };
    fetchBg();
  }, [settings.liveBackground]);

  const handleUpdateSettings = async (newSettings: UserSettings) => {
    await dataService.updateUserSettings(user.id, newSettings);
  };

  const [expandedParent, setExpandedParent] = useState<string | null>(null);

  // Auto-expand parent when a child tab is active
  useEffect(() => {
    const parent = NAVIGATION.find(item => item.children?.some(c => activeTab === `${item.name}:${c.name}`));
    if (parent) setExpandedParent(parent.name);
  }, [activeTab]);

  const NavItems = () => {
    const filteredItems = NAVIGATION.filter(item => {
      if (item.role === 'ADMIN' && user.role !== UserRole.ADMIN) return false;
      if (item.role === 'STUDENT' && user.role !== UserRole.STUDENT) return false;
      return true;
    });

    const isChildActive = (item: NavItem) => item.children?.some(c => activeTab === `${item.name}:${c.name}`);

    return (
      <>
        {filteredItems.map((item) => (
          <div key={item.name}>
            <button
              onClick={() => {
                if (item.children) {
                  // Toggle expand; select first child if collapsing to expanded
                  if (expandedParent === item.name) {
                    setExpandedParent(null);
                  } else {
                    setExpandedParent(item.name);
                    // Select first child if no child is active
                    if (!isChildActive(item)) {
                      setActiveTab(`${item.name}:${item.children[0].name}`);
                      setIsMobileMenuOpen(false);
                    }
                  }
                } else {
                  setActiveTab(item.name);
                  setIsMobileMenuOpen(false);
                }
              }}
              className={`w-full flex items-center gap-4 px-6 rounded-xl transition-all group ${settings.compactView ? 'py-2.5' : 'py-3'} ${
                (activeTab === item.name || isChildActive(item))
                  ? item.children ? 'bg-purple-500/10 text-white border border-purple-500/20' : 'bg-purple-600/80 text-white shadow-lg border border-purple-500/50'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white hover:pl-7'
              }`}
            >
              <span className={`${(activeTab === item.name || isChildActive(item)) ? 'text-white' : 'text-gray-500 group-hover:text-purple-400'}`}>
                {item.icon}
              </span>
              <span className="font-medium text-sm flex-1 text-left">{item.name}</span>
              {item.children && (
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedParent === item.name ? 'rotate-180' : ''} ${isChildActive(item) ? 'text-purple-400' : 'text-gray-600'}`} />
              )}
            </button>
            {item.children && expandedParent === item.name && (
              <div className="ml-6 mt-1 space-y-0.5 border-l border-white/10 pl-3">
                {item.children.map(child => {
                  const childTab = `${item.name}:${child.name}`;
                  return (
                    <button
                      key={child.name}
                      onClick={() => { setActiveTab(childTab); setIsMobileMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                        activeTab === childTab
                          ? 'bg-purple-600/60 text-white'
                          : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
                      }`}
                    >
                      <span className={activeTab === childTab ? 'text-white' : 'text-gray-600'}>{child.icon}</span>
                      {child.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </>
    );
  };

  return (
    <div className={`flex flex-col md:flex-row h-screen overflow-hidden text-gray-100 relative ${settings.performanceMode ? 'perf-mode' : ''}`}>
      {/* 1. Static Purple Background (Base Layer) */}
      <div className="fixed inset-0 z-[-3] bg-[#0f0720] static-purple-bg"></div>

      {/* 2. Live Video Background (Conditional) */}
      {settings.liveBackground && bgUrl && (
        <div className="fixed inset-0 pointer-events-none z-[-2] overflow-hidden">
            <video
              key={bgUrl} 
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover scale-105"
            >
              <source src={bgUrl} type="video/mp4" />
            </video>
        </div>
      )}

      {/* 3. Dark Glass Overlay */}
      <div className={`fixed inset-0 pointer-events-none z-[-1] transition-opacity duration-700 ${settings.liveBackground ? 'bg-[#0f0720]/70' : 'bg-[#0f0720]/40'} ${settings.performanceMode ? '' : 'backdrop-blur-[3px]'}`}></div>

      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between p-4 bg-black/40 backdrop-blur-md border-b border-white/10 z-30">
          <div className="flex items-center gap-3">
              <div className="bg-purple-600 p-2 rounded-lg">
                  <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <h1 className="font-bold text-white text-lg">Porter Portal</h1>
          </div>
          <div className="flex items-center gap-1">
              <NotificationBell userId={user.id} settings={settings} onUpdateSettings={handleUpdateSettings} />
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="p-2 text-white hover:bg-white/10 rounded-lg transition"
                aria-label="Open navigation menu"
              >
                  <Menu className="w-6 h-6" />
              </button>
          </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
              {/* Backdrop */}
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => setIsMobileMenuOpen(false)}></div>
              
              {/* Drawer Content */}
              <div className="relative w-4/5 max-w-xs bg-[#1a1b26] border-r border-white/10 h-full flex flex-col p-6 animate-in slide-in-from-left duration-300 shadow-2xl">
                  <div className="flex justify-between items-center mb-8">
                      <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-sm font-bold shadow-inner border border-white/20">
                              {user.name.charAt(0)}
                          </div>
                          <div>
                              <p className="text-sm font-bold text-white">{settings.privacyMode ? (user.gamification?.codename || 'Agent') : user.name}</p>
                              <p className="text-[10px] text-gray-500">{user.role}</p>
                          </div>
                      </div>
                      <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-gray-400 hover:text-white">
                          <X className="w-6 h-6" />
                      </button>
                  </div>

                  <nav className="flex-1 space-y-2 overflow-y-auto">
                      <NavItems />
                  </nav>

                  <div className="pt-6 border-t border-white/10 space-y-3">
                      <button 
                          onClick={() => { setIsSettingsOpen(true); setIsMobileMenuOpen(false); }}
                          className="w-full flex items-center gap-3 p-3 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition"
                      >
                          <Settings className="w-5 h-5" />
                          <span className="font-medium">Settings</span>
                      </button>
                      <button
                          onClick={onLogout}
                          className="w-full flex items-center gap-3 p-3 text-red-400 hover:bg-red-500/10 rounded-xl transition"
                      >
                          <LogOut className="w-5 h-5" />
                          <span className="font-medium">Sign Out</span>
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Desktop Sidebar */}
      <aside className={`p-4 hidden md:flex flex-col z-10 transition-all ${settings.compactView ? 'w-60' : 'w-72'}`}>
        <div className={`h-full bg-white/5 border border-white/10 rounded-3xl flex flex-col shadow-2xl animate-glass-turn ${settings.performanceMode ? '' : 'backdrop-blur-2xl'}`}>
          <div className="p-8 flex items-center gap-4 border-b border-white/5">
            <div className="bg-purple-600 shadow-[0_0_15px_rgba(147,51,234,0.5)] p-3 rounded-xl">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight text-white">Porter Portal</h1>
              <p className="text-xs text-purple-300 font-medium tracking-widest uppercase">
                {user.role === UserRole.ADMIN ? 'Admin System' : 'Operative Terminal'}
              </p>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-2 mt-4 overflow-y-auto custom-scrollbar">
            <NavItems />
          </nav>

          <div className="p-6 border-t border-white/5 bg-black/10 rounded-b-3xl">
            <div className="flex items-center justify-between mb-4">
               <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-sm font-bold shadow-inner border border-white/20">
                    {user.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate text-white">
                        {settings.privacyMode ? (user.gamification?.codename || 'Agent') : user.name}
                    </p>
                    <p className="text-[10px] text-gray-500 truncate">{user.email}</p>
                  </div>
               </div>
               <div className="flex items-center gap-1">
                 <NotificationBell userId={user.id} settings={settings} onUpdateSettings={handleUpdateSettings} dropUp />
                 <button
                   onClick={() => setIsSettingsOpen(true)}
                   className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition"
                 >
                   <Settings className="w-4 h-4" />
                 </button>
               </div>
            </div>
            
            <button
              onClick={onLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all text-sm font-medium"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 overflow-y-auto p-4 md:p-8 animate-fade-in z-10 ${settings.performanceMode ? 'no-anim' : 'animate-slide-up'}`}>
        <div className="max-w-7xl mx-auto h-full">
          {children}
        </div>
      </main>

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        user={user} 
        onSaveSettings={handleUpdateSettings} 
      />
    </div>
  );
};

export default Layout;


import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import { User, UserRole, UserSettings } from '../types';
import { NAVIGATION, NavItem, NavGroup } from '../constants';
import { TAB_TO_PATH, PATH_TO_TAB } from '../lib/routes';
import { LogOut, GraduationCap, Settings, Menu, X, ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen, Home, Layers, Target, TrendingUp, Zap, MessageSquare, Bug, LineChart, Music } from 'lucide-react';
import { sfx } from '../lib/sfx';
import SettingsModal from './SettingsModal';
import NotificationBell from './NotificationBell';
import { dataService } from '../services/dataService';
import { useClassConfig, useAssignments } from '../lib/AppDataContext';
import { useTheme } from '../lib/ThemeContext';
import { useChat } from '../lib/ChatContext';

interface LayoutProps {
  user: User;
  onLogout: () => void;
}

const Layout: React.FC<LayoutProps> = ({ user, onLogout }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const { enabledFeatures } = useClassConfig();
  const { isCommOpen, setIsCommOpen } = useChat();

  // Collapsible sidebar — default to collapsed on narrow screens (<1440px)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem('sidebar-collapsed');
      if (stored !== null) return JSON.parse(stored) as boolean;
      return typeof window !== 'undefined' && window.innerWidth < 1440;
    } catch { return false; }
  });
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', JSON.stringify(next));
      return next;
    });
  }, []);

  // ChromeOS performance mode suggestion (one-time)
  const [showCrosBanner, setShowCrosBanner] = useState(false);
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const isCrOS = /CrOS/.test(navigator.userAgent);
    const alreadySuggested = localStorage.getItem('perfModeSuggested');
    const currentSettings: UserSettings = user.settings || { performanceMode: false, privacyMode: false, compactView: true, themeMode: 'dark' };
    if (isCrOS && !alreadySuggested && !currentSettings.performanceMode) {
      setShowCrosBanner(true);
    }
  }, [user.settings]);

  const dismissCrosBanner = useCallback(() => {
    localStorage.setItem('perfModeSuggested', 'true');
    setShowCrosBanner(false);
  }, []);

  const enablePerfMode = useCallback(async () => {
    const currentSettings: UserSettings = user.settings || { performanceMode: false, privacyMode: false, compactView: true, themeMode: 'dark' };
    await dataService.updateUserSettings(user.id, { ...currentSettings, performanceMode: true });
    dismissCrosBanner();
  }, [user.id, user.settings, dismissCrosBanner]);

  // Derive activeTab from URL for nav highlighting
  const activeTab = PATH_TO_TAB[location.pathname] || '';

  // Derived settings with defaults
  const settings: UserSettings = user.settings || {
    performanceMode: false,
    privacyMode: false,
    compactView: true,
    themeMode: 'dark'
  };

  const handleUpdateSettings = async (newSettings: UserSettings) => {
    await dataService.updateUserSettings(user.id, newSettings);
  };

  const handleNavigate = useCallback((tabName: string) => {
    const path = TAB_TO_PATH[tabName];
    if (path) {
      sfx.tabSwitch();
      navigate(path);
    }
  }, [navigate]);

  const [expandedParent, setExpandedParent] = useState<string | null>(null);

  // Auto-expand parent when a child tab is active
  useEffect(() => {
    const parent = NAVIGATION.find(item => item.children?.some(c => activeTab === `${item.name}:${c.name}`));
    if (parent) setExpandedParent(parent.name);
  }, [activeTab]);

  // Group labels for student nav sections
  const NAV_GROUP_LABELS: Record<NavGroup, string> = {
    learning: 'Learning',
    operations: 'Operations',
    intel: 'Intel',
  };

  // Persist collapsed groups in localStorage
  const [collapsedGroups, setCollapsedGroups] = useState<Set<NavGroup>>(() => {
    try {
      const stored = localStorage.getItem('nav-collapsed-groups');
      return stored ? new Set(JSON.parse(stored) as NavGroup[]) : new Set();
    } catch { return new Set(); }
  });

  const toggleGroup = useCallback((group: NavGroup) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group); else next.add(group);
      localStorage.setItem('nav-collapsed-groups', JSON.stringify([...next]));
      return next;
    });
  }, []);

  const NavItems = () => {
    const { enabledFeatures } = useClassConfig();
    const { assignments } = useAssignments();

    // Urgency dot: count overdue or due-today assignments for students
    const hasUrgentAssignments = user.role === UserRole.STUDENT && assignments.some(a => {
      if (!a.dueDate || a.status === 'DRAFT' || a.status === 'ARCHIVED') return false;
      const diff = new Date(a.dueDate).getTime() - Date.now();
      return diff < 86400000; // due within 24h or overdue
    });

    const featureNavMap: Record<string, keyof typeof enabledFeatures> = {
      'Dungeons': 'dungeons',
      'Arena': 'pvpArena',
      'Leaderboard': 'leaderboard',
    };

    const filteredItems = NAVIGATION.filter(item => {
      if (item.role === 'ADMIN' && user.role !== UserRole.ADMIN) return false;
      if (item.role === 'STUDENT' && user.role !== UserRole.STUDENT) return false;
      if (user.role === UserRole.STUDENT && featureNavMap[item.name] && !enabledFeatures[featureNavMap[item.name]]) return false;
      return true;
    });

    const isChildActive = (item: NavItem) => item.children?.some(c => activeTab === `${item.name}:${c.name}`);

    // Render a single nav button (reused for both ungrouped and grouped items)
    const renderNavButton = (item: NavItem, collapsed = false) => {
      const isActive = activeTab === item.name || isChildActive(item);

      const showUrgencyDot = item.name === 'Resources' && hasUrgentAssignments;

      // Collapsed sidebar: icon-only buttons with tooltips
      if (collapsed) {
        return (
          <div key={item.name} className="flex justify-center">
            <button
              data-nav-item
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${item.name}`}
              onClick={() => {
                if (item.children) {
                  if (!isChildActive(item)) {
                    handleNavigate(`${item.name}:${item.children[0].name}`);
                  }
                } else {
                  handleNavigate(item.name);
                }
              }}
              title={item.name}
              aria-label={item.name}
              aria-current={isActive && !item.children ? 'page' : undefined}
              className={`relative w-10 h-10 flex items-center justify-center rounded-xl transition-all ${
                isActive
                  ? 'bg-[var(--accent-muted)] text-[var(--sidebar-text-active)] shadow-md border border-[var(--accent)]/30'
                  : 'text-[var(--sidebar-text-muted)] hover:bg-[var(--sidebar-border)] hover:text-[var(--sidebar-text-active)]'
              }`}
            >
              <span className={isActive ? 'text-[var(--sidebar-text-active)]' : ''}>
                {item.icon}
              </span>
              {showUrgencyDot && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />}
            </button>
          </div>
        );
      }

      return (
        <div key={item.name}>
          <button
            data-nav-item
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${item.name}`}
            onClick={() => {
              if (item.children) {
                if (expandedParent === item.name) {
                  setExpandedParent(null);
                } else {
                  setExpandedParent(item.name);
                  if (!isChildActive(item)) {
                    handleNavigate(`${item.name}:${item.children[0].name}`);
                    setIsMobileMenuOpen(false);
                  }
                }
              } else {
                handleNavigate(item.name);
                setIsMobileMenuOpen(false);
              }
            }}
            aria-current={isActive && !item.children ? 'page' : undefined}
            aria-expanded={item.children ? expandedParent === item.name : undefined}
            className={`w-full flex items-center gap-4 px-6 rounded-xl transition-all group ${settings.compactView ? 'py-2.5' : 'py-3'} ${
              isActive
                ? item.children ? 'bg-[var(--accent-muted)] text-[var(--sidebar-text-active)] border border-[var(--accent)]/20' : 'bg-[var(--accent-muted)] text-[var(--sidebar-text-active)] shadow-md border border-[var(--accent)]/30'
                : 'text-[var(--sidebar-text-muted)] hover:bg-[var(--sidebar-border)] hover:text-[var(--sidebar-text-active)] hover:pl-7'
            }`}
          >
            <span className={`${isActive ? 'text-[var(--sidebar-text-active)]' : 'text-[var(--sidebar-text-muted)] group-hover:text-[var(--sidebar-text-active)]'}`}>
              {item.icon}
            </span>
            <span className="font-medium text-sm flex-1 text-left flex items-center gap-2">
              {item.name}
              {showUrgencyDot && <span className="w-2 h-2 bg-red-500 rounded-full shrink-0" />}
            </span>
            {item.children && (
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedParent === item.name ? 'rotate-180' : ''} ${isChildActive(item) ? 'text-[var(--accent-text)]' : 'text-[var(--sidebar-text-muted)]'}`} />
            )}
          </button>
          {item.children && expandedParent === item.name && (
            <div className="ml-6 mt-1 space-y-0.5 border-l border-[var(--sidebar-border)] pl-3" role="group" aria-label={`${item.name} sub-navigation`}>
              {item.children.map(child => {
                const childTab = `${item.name}:${child.name}`;
                const childActive = activeTab === childTab;
                return (
                  <button
                    key={child.name}
                    data-nav-item
                    onClick={() => { handleNavigate(childTab); setIsMobileMenuOpen(false); }}
                    aria-current={childActive ? 'page' : undefined}
                    className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                      childActive
                        ? 'bg-[var(--accent-muted)] text-[var(--sidebar-text-active)]'
                        : 'text-[var(--sidebar-text-muted)] hover:bg-[var(--sidebar-border)] hover:text-[var(--sidebar-text-active)]'
                    }`}
                  >
                    <span className={childActive ? 'text-[var(--sidebar-text-active)]' : ''}>{child.icon}</span>
                    {child.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    };

    // For student role: split items into ungrouped + grouped sections
    if (user.role === UserRole.STUDENT) {
      const ungrouped = filteredItems.filter(i => !i.group);
      const groups: NavGroup[] = ['learning', 'operations', 'intel'];

      // Collapsed sidebar: icon-only, no group headers
      if (sidebarCollapsed) {
        return (
          <>
            {ungrouped.map(i => renderNavButton(i, true))}
            {groups.map(group => {
              const groupItems = filteredItems.filter(i => i.group === group);
              if (groupItems.length === 0) return null;
              return (
                <React.Fragment key={group}>
                  <div className="h-px bg-[var(--sidebar-border)] my-2" />
                  {groupItems.map(i => renderNavButton(i, true))}
                </React.Fragment>
              );
            })}
          </>
        );
      }

      const groupLightStyles: Record<NavGroup, { wrap: string; label: string }> = {
        learning:   { wrap: 'bg-blue-50/80 border border-blue-100',    label: 'text-blue-700 dark:text-blue-500 hover:text-blue-800 dark:hover:text-blue-600' },
        operations: { wrap: 'bg-amber-50/70 border border-amber-100',  label: 'text-amber-800 dark:text-amber-600 hover:text-amber-900 dark:hover:text-amber-700' },
        intel:      { wrap: 'bg-emerald-50/70 border border-emerald-100', label: 'text-emerald-700 dark:text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-700' },
      };

      return (
        <>
          {ungrouped.map(i => renderNavButton(i))}
          {groups.map(group => {
            const groupItems = filteredItems.filter(i => i.group === group);
            if (groupItems.length === 0) return null;
            const isCollapsed = collapsedGroups.has(group);
            return (
              <div key={group} className={`mt-2 rounded-xl overflow-hidden ${isLight ? groupLightStyles[group].wrap : ''}`}>
                <button
                  onClick={() => toggleGroup(group)}
                  aria-expanded={!isCollapsed}
                  className={`w-full flex items-center gap-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.15em] transition-colors ${isLight ? groupLightStyles[group].label : 'text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text)]'}`}
                >
                  <ChevronRight className={`w-3 h-3 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
                  {NAV_GROUP_LABELS[group]}
                  <span className="flex-1 h-px bg-[var(--sidebar-border)] ml-1" />
                </button>
                {!isCollapsed && (
                  <div className="space-y-1" role="group" aria-label={`${NAV_GROUP_LABELS[group]} navigation`}>
                    {groupItems.map(i => renderNavButton(i))}
                  </div>
                )}
              </div>
            );
          })}
        </>
      );
    }

    // Admin: render flat, respecting collapsed state
    return <>{filteredItems.map(i => renderNavButton(i, sidebarCollapsed))}</>;
  };

  // Arrow key navigation within sidebar nav items
  const handleNavKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const nav = e.currentTarget;
    const buttons = Array.from(nav.querySelectorAll<HTMLElement>('button[data-nav-item]'));
    const idx = buttons.indexOf(document.activeElement as HTMLElement);
    if (idx === -1) return;
    const next = e.key === 'ArrowDown' ? (idx + 1) % buttons.length : (idx - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }, []);

  return (
    <div className={`flex flex-col lg:flex-row h-screen overflow-hidden text-[var(--text-primary)] relative ${settings.performanceMode ? 'perf-mode' : ''}`}>
      {/* Skip to main content link */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[60] focus:bg-purple-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-bold">
        Skip to main content
      </a>

      {/* 1. Static Background (Base Layer) */}
      <div className={`fixed inset-0 z-[-3] bg-[var(--surface-base)] ${isLight ? '' : 'static-purple-bg'}`}></div>

      {/* 2a. Light mode: Tech circuit background image */}
      {isLight && (
        <div className="fixed inset-0 z-[-2] bg-cover bg-center bg-no-repeat opacity-40" style={{ backgroundImage: "url('/assets/light-bg.png')" }}></div>
      )}

      {/* 2b. Dark mode: Circuit board background image */}
      {!isLight && (
        <div className="fixed inset-0 z-[-2] bg-cover bg-center bg-no-repeat opacity-40" style={{ backgroundImage: "url('/assets/dark-bg.jpg')" }}></div>
      )}

      {/* 3. Glass Overlay */}
      {isLight && (
        <div className={`fixed inset-0 pointer-events-none z-[-1] bg-purple-50/10 ${settings.performanceMode ? '' : 'backdrop-blur-sm'}`}></div>
      )}
      {!isLight && (
        <div className={`fixed inset-0 pointer-events-none z-[-1] transition-opacity duration-700 bg-[var(--surface-base)]/40 ${settings.performanceMode ? '' : 'backdrop-blur-[3px]'}`}></div>
      )}

      {/* ChromeOS performance mode suggestion banner */}
      {showCrosBanner && (
        <div className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-center gap-3 px-4 py-3 bg-purple-900/95 border-b border-purple-500/30 backdrop-blur-md text-sm text-white animate-in slide-in-from-top duration-300">
          <Zap className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-purple-100">On a Chromebook? Enable <strong>Performance Mode</strong> for smoother scrolling.</span>
          <button onClick={enablePerfMode} className="px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded-lg text-xs font-bold transition">
            Enable
          </button>
          <button onClick={dismissCrosBanner} className="text-gray-400 hover:text-white transition" aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Mobile/Tablet Header — visible below lg breakpoint */}
      <header className="lg:hidden flex items-center justify-between p-4 bg-[var(--surface-overlay)] backdrop-blur-md border-b border-[var(--border)] z-30">
          <div className="flex items-center gap-3">
              <div className="bg-purple-600 p-2 rounded-lg">
                  <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <h1 className="font-bold text-[var(--text-primary)] text-lg">Porter Portal</h1>
          </div>
          <div className="flex items-center gap-1">
              <NotificationBell userId={user.id} settings={settings} onUpdateSettings={handleUpdateSettings} />
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className="p-2 text-[var(--text-primary)] hover:bg-[var(--surface-glass)]/10 rounded-lg transition"
                aria-label="Open navigation menu"
              >
                  <Menu className="w-6 h-6" />
              </button>
          </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
              {/* Backdrop */}
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => setIsMobileMenuOpen(false)}></div>

              {/* Drawer Content */}
              <div className="relative w-4/5 max-w-xs bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)] h-full flex flex-col p-6 animate-in slide-in-from-left duration-300 shadow-2xl">
                  <div className="flex justify-between items-center mb-8">
                      <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-sm font-bold shadow-inner border border-white/20">
                              {user.name.charAt(0)}
                          </div>
                          <div>
                              <p className="text-sm font-bold text-[var(--sidebar-text)]">{settings.privacyMode ? (user.gamification?.codename || 'Agent') : user.name}</p>
                              <p className="text-[10px] text-[var(--sidebar-text-muted)]">{user.role}</p>
                          </div>
                      </div>
                      <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text)]" aria-label="Close navigation menu">
                          <X className="w-6 h-6" />
                      </button>
                  </div>

                  <nav className="flex-1 space-y-2 overflow-y-auto" role="tablist" aria-label="Mobile navigation" onKeyDown={handleNavKeyDown}>
                      <NavItems />
                  </nav>

                  <div className="pt-6 border-t border-[var(--sidebar-border)] space-y-3">
                      <button
                          onClick={() => { setIsSettingsOpen(true); setIsMobileMenuOpen(false); }}
                          className="w-full flex items-center gap-3 p-3 text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text-active)] hover:bg-[var(--sidebar-border)] rounded-xl transition"
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

      {/* Desktop Sidebar — visible at lg breakpoint and above */}
      <aside className={`p-4 hidden lg:flex flex-col z-10 transition-all duration-200 ${sidebarCollapsed ? 'w-[76px]' : settings.compactView ? 'w-60' : 'w-72'}`}>
        <div className={`h-full bg-[var(--sidebar-bg)] border border-[var(--sidebar-border)] rounded-3xl flex flex-col shadow-2xl animate-glass-turn ${settings.performanceMode ? '' : 'backdrop-blur-2xl'}`}>
          {/* Header */}
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center gap-2 p-3 border-b border-[var(--sidebar-border)]">
              <div className="bg-purple-600 shadow-[0_0_15px_rgba(147,51,234,0.5)] rounded-xl p-2">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <button
                onClick={toggleSidebar}
                className="p-1.5 text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text-active)] hover:bg-[var(--sidebar-border)] rounded-lg transition"
                aria-label="Expand sidebar"
                title="Expand sidebar"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--sidebar-border)] gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="bg-purple-600 shadow-[0_0_15px_rgba(147,51,234,0.5)] rounded-xl p-2.5 shrink-0">
                  <GraduationCap className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="font-bold text-base tracking-tight text-[var(--sidebar-text)] truncate">Porter Portal</h1>
                  <p className="text-[10px] text-[var(--sidebar-text-muted)] font-medium tracking-widest uppercase">
                    {user.role === UserRole.ADMIN ? 'Admin System' : 'Operative Terminal'}
                  </p>
                </div>
              </div>
              <button
                onClick={toggleSidebar}
                className="p-1.5 text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text-active)] hover:bg-[var(--sidebar-border)] rounded-lg transition shrink-0"
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>
          )}

          <nav className={`flex-1 space-y-2 overflow-y-auto custom-scrollbar ${sidebarCollapsed ? 'p-2' : 'p-4'}`} role="tablist" aria-label="Main navigation" onKeyDown={handleNavKeyDown}>
            <NavItems />
          </nav>

          {/* Profile / Footer */}
          {sidebarCollapsed ? (
            <div className="p-3 border-t border-[var(--sidebar-border)] bg-black/5 dark:bg-black/10 rounded-b-3xl flex flex-col items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-xs font-bold text-white shadow-inner border border-white/20" title={settings.privacyMode ? (user.gamification?.codename || 'Agent') : user.name}>
                {user.name.charAt(0)}
              </div>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text-active)] hover:bg-[var(--sidebar-border)] rounded-lg transition"
                aria-label="Open settings"
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={onLogout}
                className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition"
                aria-label="Sign out"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
              {enabledFeatures.communications && (
                <button
                  onClick={() => setIsCommOpen(!isCommOpen)}
                  className="p-2 text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text-active)] hover:bg-[var(--sidebar-border)] rounded-lg transition"
                  aria-label="Chat"
                  title="Chat"
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('porters:openBugReport'))}
                className="p-2 text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text-active)] hover:bg-[var(--sidebar-border)] rounded-lg transition"
                aria-label="Report a bug"
                title="Report a bug"
              >
                <Bug className="w-4 h-4" />
              </button>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('porters:openSongRequest'))}
                className="p-2 text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text-active)] hover:bg-[var(--sidebar-border)] rounded-lg transition"
                aria-label="Request a song"
                title="Request a song"
              >
                <Music className="w-4 h-4" />
              </button>
              {enabledFeatures.physicsTools && (
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('porters:openGrapher'))}
                  className="p-2 text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text-active)] hover:bg-[var(--sidebar-border)] rounded-lg transition"
                  aria-label="Grapher"
                  title="Grapher"
                >
                  <LineChart className="w-4 h-4" />
                </button>
              )}
            </div>
          ) : (
            <div className="p-3 border-t border-[var(--sidebar-border)] bg-black/5 dark:bg-black/10 rounded-b-3xl">
              <div className="flex items-center gap-0.5 flex-wrap">
                <div
                  className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-xs font-bold text-white shadow-inner border border-white/20 shrink-0 mr-1"
                  title={settings.privacyMode ? (user.gamification?.codename || 'Agent') : user.name}
                >
                  {user.name.charAt(0)}
                </div>
                <button
                  onClick={onLogout}
                  className="p-2 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-lg transition"
                  aria-label="Sign out"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
                <NotificationBell userId={user.id} settings={settings} onUpdateSettings={handleUpdateSettings} dropUp />
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="p-2 text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text-active)] hover:bg-[var(--sidebar-border)] rounded-lg transition"
                  aria-label="Open settings"
                  title="Settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
                {enabledFeatures.communications && (
                  <button
                    onClick={() => setIsCommOpen(!isCommOpen)}
                    className="p-2 text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text-active)] hover:bg-[var(--sidebar-border)] rounded-lg transition"
                    aria-label="Chat"
                    title="Chat"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('porters:openBugReport'))}
                  className="p-2 text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text-active)] hover:bg-[var(--sidebar-border)] rounded-lg transition"
                  aria-label="Report a bug"
                  title="Report a bug"
                >
                  <Bug className="w-4 h-4" />
                </button>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('porters:openSongRequest'))}
                  className="p-2 text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text-active)] hover:bg-[var(--sidebar-border)] rounded-lg transition"
                  aria-label="Request a song"
                  title="Request a song"
                >
                  <Music className="w-4 h-4" />
                </button>
                {enabledFeatures.physicsTools && (
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('porters:openGrapher'))}
                    className="p-2 text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text-active)] hover:bg-[var(--sidebar-border)] rounded-lg transition"
                    aria-label="Grapher"
                    title="Grapher"
                  >
                    <LineChart className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main id="main-content" className={`flex-1 overflow-y-auto p-2 pb-20 md:p-4 md:pb-20 lg:p-4 lg:pb-4 animate-fade-in z-10 ${settings.performanceMode ? 'no-anim' : 'animate-slide-up'}`}>
        <div className="h-full">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav — quick access to key pages (below lg breakpoint) */}
      {user.role === UserRole.STUDENT && (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 h-14 bg-[var(--surface-overlay)] backdrop-blur-md border-t border-[var(--border)] flex items-center justify-around px-2" role="tablist" aria-label="Quick navigation">
          {([
            { name: 'Home', icon: <Home className="w-5 h-5" />, tab: 'Home' },
            { name: 'Resources', icon: <Layers className="w-5 h-5" />, tab: 'Resources' },
            { name: 'Missions', icon: <Target className="w-5 h-5" />, tab: 'Missions' },
            { name: 'Progress', icon: <TrendingUp className="w-5 h-5" />, tab: 'Progress' },
          ] as const).map(item => {
            const isActive = activeTab === item.tab;
            return (
              <button
                key={item.tab}
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${item.tab}`}
                onClick={() => handleNavigate(item.tab)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${
                  isActive ? 'text-[var(--accent-text)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {item.icon}
                <span className="text-[10px] font-bold">{item.name}</span>
              </button>
            );
          })}
        </nav>
      )}

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

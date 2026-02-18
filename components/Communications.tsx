
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { User, ChatMessage, DefaultClassTypes, Assignment, ClassConfig } from '../types';
import { MessageSquare, X, Send, Shield, ChevronDown, BookOpen, ExternalLink, Bookmark, Smile, ChevronLeft, Hash, Pin, Trash2, AlertTriangle, Check, MicOff } from 'lucide-react';
import { dataService } from '../services/dataService';
import { useConfirm } from './ConfirmDialog';

interface CommunicationsProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
  assignments: Assignment[];
  classConfigs: ClassConfig[];
  onOpenResource?: (id: string) => void;
}

const QUICK_REACTIONS = ['❤️', '🔥', '✅', '❌', '🧪', '🔭', '🤔', '💯'];
const EMOJI_GRID = ['😀', '😂', '😍', '😎', '🤔', '🤨', '😐', '🙄', '😴', '🤮', '🤯', '🥳', '😭', '😱', '👍', '👎', '🔥', '✨', '⚛️', '🧪', '🔭', '🔬', '🎓', '📚', '✅', '❌'];

const Communications: React.FC<CommunicationsProps> = ({ user, isOpen, onClose, assignments, classConfigs, onOpenResource }) => {
  const { confirm } = useConfirm();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [activeTab, setActiveTab] = useState<'Main' | 'Resources' | 'Bookmarks' | 'Moderation'>('Main');
  const [isLoading, setIsLoading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMessageEmojiPickerId, setShowMessageEmojiPickerId] = useState<string | null>(null);
  
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [flaggedMessages, setFlaggedMessages] = useState<ChatMessage[]>([]);
  const [muteMenuTarget, setMuteMenuTarget] = useState<{ id: string; senderId: string; senderName: string } | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const msgEmojiPickerRef = useRef<HTMLDivElement>(null);
  const muteMenuRef = useRef<HTMLDivElement>(null);
  
  const chatEnabledClasses = useMemo(() => {
      return Object.values(DefaultClassTypes).filter(c => {
          if (c === DefaultClassTypes.UNCATEGORIZED) return false;
          if (user.role === 'ADMIN') return true;
          const config = classConfigs.find(conf => conf.className === c);
          const isEnrolled = user.enrolledClasses?.includes(c);
          const hasFeature = config ? config.features.communications : true;
          return isEnrolled && hasFeature;
      });
  }, [classConfigs, user.role, user.enrolledClasses]);

  const [selectedClass, setSelectedClass] = useState<string>(chatEnabledClasses[0] || '');
  
  const activeChannelId = useMemo(() => {
      if (activeTab === 'Resources' && selectedResourceId) return `res_${selectedResourceId}`;
      if (activeTab === 'Resources' && !selectedResourceId) return '';
      if (!selectedClass) return '';
      return `class_${selectedClass.replace(/\s+/g, '_').toLowerCase()}`;
  }, [selectedClass, activeTab, selectedResourceId]);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  const resourceRooms = useMemo(() => {
    return assignments.filter(a => a.classType === selectedClass && a.status !== 'DRAFT');
  }, [assignments, selectedClass]);

  const pinnedMessages = useMemo(() => {
    return messages.filter(m => m.isGlobalPinned || m.pinnedBy?.includes(user.id));
  }, [messages, user.id]);

  const isMuted = useMemo(() => {
      if (!user.mutedUntil) return false;
      return new Date(user.mutedUntil) > new Date();
  }, [user.mutedUntil]);

  useEffect(() => {
    if (!isOpen) return;
    let channelToSubscribe = '';
    if (activeTab === 'Resources' && selectedResourceId) {
        channelToSubscribe = `res_${selectedResourceId}`;
    } else if (activeTab === 'Main' || activeTab === 'Bookmarks') {
        channelToSubscribe = `class_${selectedClass.replace(/\s+/g, '_').toLowerCase()}`;
    }
    if (!channelToSubscribe) return;

    setIsLoading(true);
    const unsubMessages = dataService.subscribeToChannelMessages(channelToSubscribe, (msgs) => {
        setMessages(msgs);
        setIsLoading(false);
    });

    return () => {
        unsubMessages();
    };
  }, [isOpen, selectedClass, activeTab, selectedResourceId]);

  useEffect(() => {
    if (!isOpen || user.role !== 'ADMIN') return;
    const unsub = dataService.subscribeToFlaggedMessages((msgs) => {
        setFlaggedMessages(msgs);
    });
    return () => unsub();
  }, [isOpen, user.role]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading, activeTab, selectedResourceId]);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
              setShowEmojiPicker(false);
          }
          if (msgEmojiPickerRef.current && !msgEmojiPickerRef.current.contains(event.target as Node)) {
              setShowMessageEmojiPickerId(null);
          }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard navigation: Escape closes panel
  useEffect(() => {
      if (!isOpen) return;
      const handleKey = (e: KeyboardEvent) => {
          if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKey);
      return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const handleSendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeChannelId) return;
    if (isMuted) return;

    try {
        await dataService.sendMessage(user, inputText, activeChannelId, selectedClass);
        setInputText('');
        setShowEmojiPicker(false);
    } catch (err) {
        console.error("Failed to send message:", err);
    }
  }, [inputText, activeChannelId, isMuted, user, selectedClass]);

  const handleReaction = useCallback(async (msgId: string, emoji: string) => {
      try {
          await dataService.toggleReaction(msgId, emoji, user.id);
          setShowMessageEmojiPickerId(null);
      } catch (err) { console.error(err); }
  }, [user.id]);

  const handleTogglePin = useCallback(async (msgId: string) => {
      try {
          await dataService.togglePersonalPin(msgId, user.id);
      } catch (err) { console.error(err); }
  }, [user.id]);

  const handleToggleGlobalPin = useCallback(async (msgId: string, currentStatus: boolean) => {
      try {
          await dataService.toggleGlobalPin(msgId, !currentStatus);
      } catch (err) { console.error(err); }
  }, []);

  const handleDeleteMessage = async (msgId: string) => {
      if (!await confirm({ message: "Permanently delete this message?", confirmLabel: "Delete" })) return;
      try {
          await dataService.deleteMessage(msgId);
      } catch (err) { console.error(err); }
  };

  const handleApproveMessage = async (msgId: string) => {
      try {
          await dataService.unflagMessage(msgId);
          await dataService.resolveFlagByMessageId(msgId);
      } catch (err) { console.error(err); }
  };

  const handleDeleteFlagged = async (msgId: string) => {
      if (!await confirm({ message: "Delete this flagged message?", confirmLabel: "Delete" })) return;
      try {
          await dataService.resolveFlagByMessageId(msgId);
          await dataService.deleteMessage(msgId);
      } catch (err) { console.error(err); }
  };

  const MUTE_DURATIONS = [
      { label: '15 min', minutes: 15 },
      { label: '1 hour', minutes: 60 },
      { label: '24 hours', minutes: 1440 },
      { label: 'Indefinite', minutes: dataService.INDEFINITE_MUTE },
  ];

  const handleMuteUser = async (minutes: number) => {
      if (!muteMenuTarget) return;
      try {
          await dataService.muteUser(muteMenuTarget.senderId, minutes);
      } catch (err) { console.error(err); }
      setMuteMenuTarget(null);
  };

  useEffect(() => {
      const handleClickOutsideMute = (e: MouseEvent) => {
          if (muteMenuRef.current && !muteMenuRef.current.contains(e.target as Node)) setMuteMenuTarget(null);
      };
      if (muteMenuTarget) document.addEventListener('mousedown', handleClickOutsideMute);
      return () => document.removeEventListener('mousedown', handleClickOutsideMute);
  }, [muteMenuTarget]);

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-0 right-0 md:bottom-6 md:right-6 w-full md:w-[420px] h-[650px] z-[60] font-sans animate-in slide-in-from-bottom-10 duration-500 shadow-2xl flex flex-col bg-black/40 backdrop-blur-xl border border-white/10 md:rounded-3xl overflow-hidden">
      
      {/* HEADER */}
      <div className="flex items-center justify-between p-4 bg-white/5 border-b border-white/5 backdrop-blur-md z-10">
        <div className="flex items-center gap-3 overflow-hidden">
            {activeTab === 'Resources' && selectedResourceId ? (
                <button onClick={() => setSelectedResourceId(null)} className="p-2 hover:bg-white/10 rounded-full transition text-gray-300">
                    <ChevronLeft className="w-5 h-5" />
                </button>
            ) : (
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg text-white shrink-0">
                    <MessageSquare className="w-5 h-5" />
                </div>
            )}
            <div className="min-w-0">
                <h3 className="font-bold text-white text-sm truncate leading-tight">
                    {activeTab === 'Moderation' ? 'Moderation Queue' : activeTab === 'Resources' ? (selectedResourceId ? resourceRooms.find(r => r.id === selectedResourceId)?.title : "Class Resources") : selectedClass}
                </h3>
                {activeTab !== 'Resources' && activeTab !== 'Moderation' && chatEnabledClasses.length > 1 && (
                    <div className="relative group flex items-center cursor-pointer">
                        <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider truncate">{selectedClass}</span>
                        <ChevronDown className="w-3 h-3 text-gray-500 ml-1" />
                        <select className="absolute inset-0 opacity-0 cursor-pointer" value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
                            {chatEnabledClasses.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                )}
            </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition text-gray-400 hover:text-white" aria-label="Close chat"><X className="w-5 h-5" /></button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* NAV */}
        <div className="w-16 bg-black/20 border-r border-white/5 flex flex-col items-center py-4 gap-4">
            <button onClick={() => setActiveTab('Main')} aria-label="Main chat" className={`p-3 rounded-2xl transition-all ${activeTab === 'Main' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}><MessageSquare className="w-5 h-5" /></button>
            <button onClick={() => setActiveTab('Resources')} aria-label="Resource channels" className={`p-3 rounded-2xl transition-all ${activeTab === 'Resources' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}><BookOpen className="w-5 h-5" /></button>
            <button onClick={() => setActiveTab('Bookmarks')} aria-label="Bookmarked messages" className={`p-3 rounded-2xl transition-all relative ${activeTab === 'Bookmarks' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}><Bookmark className="w-5 h-5" /></button>
            {user.role === 'ADMIN' && (
                <button onClick={() => setActiveTab('Moderation')} aria-label="Moderation queue" className={`mt-auto p-3 rounded-2xl transition-all relative ${activeTab === 'Moderation' ? 'bg-red-600 text-white shadow-lg shadow-red-500/20' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>
                    <Shield className="w-5 h-5" />
                    {flaggedMessages.length > 0 && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">{flaggedMessages.length}</span>
                    )}
                </button>
            )}
        </div>

        <div className="flex-1 flex flex-col relative">
            {activeTab === 'Resources' && !selectedResourceId && (
                <div className="absolute inset-0 p-4 overflow-y-auto custom-scrollbar animate-in slide-in-from-right duration-300">
                    <div className="space-y-2">
                        {resourceRooms.map(room => (
                            <div key={room.id} onClick={() => setSelectedResourceId(room.id)} className="group p-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all cursor-pointer flex justify-between items-center">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition shadow-inner"><Hash className="w-5 h-5" /></div>
                                    <div className="min-w-0">
                                        <h4 className="font-bold text-gray-200 text-sm truncate group-hover:text-white transition">{room.title}</h4>
                                        <span className="text-[10px] text-gray-500 uppercase tracking-widest">{room.unit}</span>
                                    </div>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); onOpenResource?.(room.id); onClose(); }} className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition"><ExternalLink className="w-4 h-4" /></button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'Moderation' && user.role === 'ADMIN' && (
                <div className="absolute inset-0 p-4 overflow-y-auto custom-scrollbar animate-in slide-in-from-right duration-300">
                    <div className="flex items-center gap-2 mb-4">
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                        <span className="text-sm font-bold text-red-400 uppercase tracking-widest">Flagged Messages</span>
                        <span className="ml-auto text-xs text-gray-500">{flaggedMessages.length} item{flaggedMessages.length !== 1 ? 's' : ''}</span>
                    </div>
                    {flaggedMessages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-gray-500">
                            <Shield className="w-10 h-10 mb-3 opacity-30" />
                            <p className="text-sm">Queue clear — no flagged messages</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {flaggedMessages.map(msg => (
                                <div key={msg.id} className="p-3 bg-red-900/20 border border-red-500/30 rounded-2xl">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold text-gray-300">{msg.senderName}</span>
                                        <span className="text-[10px] text-gray-500">{new Date(msg.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <p className="text-sm text-gray-200 mb-1">{msg.content}</p>
                                    {msg.systemNote && <p className="text-[10px] text-red-400 mb-2 italic">{msg.systemNote}</p>}
                                    <div className="text-[10px] text-gray-500 mb-3">{msg.channelId?.replace('class_', '').replace(/_/g, ' ') || 'unknown channel'}</div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleApproveMessage(msg.id)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-bold transition">
                                            <Check className="w-3.5 h-3.5" /> Approve
                                        </button>
                                        <button onClick={() => handleDeleteFlagged(msg.id)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-red-400 rounded-xl text-xs font-bold transition">
                                            <Trash2 className="w-3.5 h-3.5" /> Delete
                                        </button>
                                        <div className="relative">
                                            <button onClick={() => setMuteMenuTarget(muteMenuTarget?.id === `flag-${msg.id}` ? null : { id: `flag-${msg.id}`, senderId: msg.senderId, senderName: msg.senderName })} className="flex items-center justify-center gap-1.5 px-3 py-2 bg-orange-600/20 hover:bg-orange-600/40 border border-orange-500/30 text-orange-400 rounded-xl text-xs font-bold transition" title="Mute">
                                                <MicOff className="w-3.5 h-3.5" />
                                            </button>
                                            {muteMenuTarget?.id === `flag-${msg.id}` && (
                                                <div ref={muteMenuRef} className="absolute bottom-full mb-1 right-0 bg-black/95 border border-orange-500/30 rounded-xl p-1 shadow-2xl z-50 animate-in zoom-in-95 whitespace-nowrap">
                                                    <div className="text-[9px] text-gray-500 px-2 py-1 font-bold uppercase">Mute {msg.senderName}</div>
                                                    {MUTE_DURATIONS.map(d => (
                                                        <button key={d.minutes} onClick={() => handleMuteUser(d.minutes)} className="block w-full text-left px-3 py-1.5 text-xs text-orange-300 hover:bg-orange-500/20 rounded-lg transition">{d.label}</button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {(activeTab === 'Main' || activeTab === 'Bookmarks' || (activeTab === 'Resources' && selectedResourceId)) && (
                <>
                    {/* Bug Fix #1: Added top padding to container and adjusted toolbar positioning logic */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 pt-12 space-y-6 custom-scrollbar scroll-smooth">
                        {(activeTab === 'Bookmarks' ? pinnedMessages : messages).map((msg, idx, arr) => {
                            const isMe = msg.senderId === user.id;
                            const isContinuation = idx > 0 && arr[idx - 1].senderId === msg.senderId && (new Date(msg.timestamp).getTime() - new Date(arr[idx - 1].timestamp).getTime() < 300000);
                            
                            return (
                                <div key={msg.id} className={`group flex flex-col ${isMe ? 'items-end' : 'items-start'} ${isContinuation ? 'mt-1' : 'mt-4'}`}>
                                    {!isContinuation && (
                                        <div className="flex items-center gap-2 mb-1 px-1">
                                            <span className={`text-xs font-bold ${isMe ? 'text-indigo-400' : 'text-gray-300'}`}>{msg.senderName}</span>
                                            <span className="text-[10px] text-gray-600">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                            {msg.isGlobalPinned && <Pin className="w-3 h-3 text-yellow-500 fill-current" />}
                                        </div>
                                    )}

                                    <div className="relative max-w-[85%]">
                                        {/* Action Toolbar: Repositioned to top to avoid visual clipping when at window top */}
                                        <div className={`flex items-center bg-black/80 backdrop-blur rounded-full px-2 py-1 gap-2 border border-white/10 opacity-0 group-hover:opacity-100 transition-all absolute -top-8 ${isMe ? 'right-0' : 'left-0'} z-30`}>
                                            <button onClick={() => setShowMessageEmojiPickerId(msg.id)} className="p-1 hover:bg-white/10 rounded-full transition" aria-label="Add reaction"><Smile className="w-3.5 h-3.5 text-yellow-400" /></button>
                                            <button onClick={() => handleTogglePin(msg.id)} className={`p-1 hover:bg-white/10 rounded-full transition ${msg.pinnedBy?.includes(user.id) ? 'text-purple-400' : 'text-gray-400'}`} aria-label="Bookmark message"><Bookmark className="w-3.5 h-3.5" /></button>
                                            {user.role === 'ADMIN' && (
                                                <>
                                                    <button onClick={() => handleToggleGlobalPin(msg.id, !!msg.isGlobalPinned)} className={`p-1 hover:bg-white/10 rounded-full transition ${msg.isGlobalPinned ? 'text-yellow-400' : 'text-gray-400'}`} aria-label="Pin for everyone"><Pin className="w-3.5 h-3.5" /></button>
                                                    <button onClick={() => handleDeleteMessage(msg.id)} className="p-1 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-full transition" aria-label="Delete message"><Trash2 className="w-3.5 h-3.5" /></button>
                                                    {msg.senderId !== user.id && (
                                                        <div className="relative">
                                                            <button onClick={() => setMuteMenuTarget(muteMenuTarget?.id === msg.id ? null : { id: msg.id, senderId: msg.senderId, senderName: msg.senderName })} className="p-1 hover:bg-orange-500/20 text-gray-400 hover:text-orange-400 rounded-full transition" aria-label="Mute user"><MicOff className="w-3.5 h-3.5" /></button>
                                                            {muteMenuTarget?.id === msg.id && (
                                                                <div ref={muteMenuRef} className="absolute bottom-full mb-1 right-0 bg-black/95 border border-orange-500/30 rounded-xl p-1 shadow-2xl z-50 animate-in zoom-in-95 whitespace-nowrap">
                                                                    <div className="text-[9px] text-gray-500 px-2 py-1 font-bold uppercase">Mute {msg.senderName}</div>
                                                                    {MUTE_DURATIONS.map(d => (
                                                                        <button key={d.minutes} onClick={() => handleMuteUser(d.minutes)} className="block w-full text-left px-3 py-1.5 text-xs text-orange-300 hover:bg-orange-500/20 rounded-lg transition">{d.label}</button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>

                                        {/* Quick Emoji Picker Submenu */}
                                        {showMessageEmojiPickerId === msg.id && (
                                            <div ref={msgEmojiPickerRef} className={`absolute z-40 bottom-full mb-2 bg-black/95 border border-white/20 rounded-xl p-1 shadow-2xl flex gap-1 animate-in zoom-in-95 ${isMe ? 'right-0' : 'left-0'}`}>
                                                {QUICK_REACTIONS.map(emoji => (
                                                    <button key={emoji} onClick={() => handleReaction(msg.id, emoji)} className="p-1.5 hover:bg-white/10 rounded-lg transition text-sm">{emoji}</button>
                                                ))}
                                            </div>
                                        )}

                                        <div className={`px-4 py-2.5 text-sm leading-relaxed shadow-lg backdrop-blur-sm border ${
                                            isMe 
                                                ? 'bg-indigo-600/80 text-white rounded-2xl rounded-tr-sm border-indigo-500/30' 
                                                : `bg-white/10 text-gray-100 rounded-2xl rounded-tl-sm border-white/5 ${msg.isFlagged ? 'border-red-500/50 bg-red-900/20' : ''}`
                                        } ${msg.isGlobalPinned ? 'ring-1 ring-yellow-500/50 bg-yellow-900/10' : ''}`}>
                                            {msg.content}
                                        </div>

                                        <div className="flex flex-wrap gap-1 mt-1 justify-end">
                                            {msg.reactions && Object.entries(msg.reactions).map(([emoji, users]) => {
                                                const userList = users as string[];
                                                return userList.length > 0 && (
                                                    <button key={emoji} onClick={() => handleReaction(msg.id, emoji)} className={`text-[10px] px-1.5 py-0.5 rounded-full border transition ${userList.includes(user.id) ? 'bg-indigo-500/30 border-indigo-500/50 text-white' : 'bg-black/30 border-white/5 text-gray-400 hover:bg-white/10'}`}>
                                                        {emoji} {userList.length}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* INPUT AREA */}
                    <div className="p-4 bg-black/20 backdrop-blur-md border-t border-white/5">
                        <form onSubmit={handleSendMessage} className="relative flex items-center gap-2">
                            {showEmojiPicker && (
                                <div ref={emojiPickerRef} className="absolute bottom-full left-0 mb-4 bg-[#1a1b1e] border border-white/10 rounded-2xl p-3 shadow-2xl grid grid-cols-6 gap-2 w-64 animate-in slide-in-from-bottom-2 z-50">
                                    {EMOJI_GRID.map(e => <button key={e} type="button" onClick={() => setInputText(prev => prev + e)} className="p-2 hover:bg-white/10 rounded-lg text-xl transition">{e}</button>)}
                                </div>
                            )}
                            <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="p-3 text-gray-400 hover:text-yellow-400 hover:bg-white/5 rounded-xl transition" aria-label="Open emoji picker"><Smile className="w-5 h-5" /></button>
                            <input type="text" value={inputText} onChange={e => setInputText(e.target.value)} placeholder={isMuted ? "Transmission Disabled" : "Type message..."} disabled={!activeChannelId || isMuted} className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50 focus:bg-white/10 transition" />
                            <button type="submit" disabled={!activeChannelId || isMuted || !inputText.trim()} className="p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg transition" aria-label="Send message"><Send className="w-5 h-5" /></button>
                        </form>
                    </div>
                </>
            )}
        </div>
      </div>
    </div>
  );
};

export default Communications;

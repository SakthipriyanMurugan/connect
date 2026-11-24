import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  Send, 
  Paperclip, 
  Smile, 
  Phone, 
  Video, 
  MoreVertical, 
  CheckCheck, 
  Search, 
  Plus, 
  Mic,
  MessageSquare,
  AtSign,
  UserPlus,
  Check,
  Clock,
  Download,
  FileText,
  Image as ImageIcon,
  UserCheck,
  Loader2,
  X,
  Reply,
  Trash2,
  StopCircle,
  Flame,
  ThumbsUp,
  Heart,
  ArrowLeft,
  Star,
  Users,
  BellOff,
  Bell,
  Palette,
  Ban,
  Share2,
  Copy,
  Laptop,
  Smartphone,
  Shield,
  Music,
  ChevronRight,
  ChevronDown,
  Info,
  CheckSquare,
  ListFilter,
  XCircle,
  Link2,
  PhoneCall,
  ThumbsDown,
  MinusCircle,
  Lock,
  Archive
} from 'lucide-react';
import type { ChatMessage, ConnectionUser, SearchUserResult } from '../../types';
import { VoiceNotePlayer, sanitizeMediaUrl } from '../chat/VoiceNotePlayer';
import { SidebarChatsSkeleton, ChatHeaderSkeleton, ChatMessagesSkeleton, FullChatPaneSkeleton } from '../chat/ChatSkeletons';
import { API_BASE_URL, WS_BASE_URL } from '../../config/api';

const getDisplayName = (name?: string, connectId?: string) => {
  const cid = connectId?.toLowerCase();
  if (!name || name.toLowerCase() === 'hinata') {
    if (cid === 'sakthi') return 'Sakthi';
    if (cid === 'nila') return 'Nila';
    if (connectId) return connectId.charAt(0).toUpperCase() + connectId.slice(1);
    return 'User';
  }
  return name;
};

const getInitials = (name?: string, connectId?: string) => {
  const clean = getDisplayName(name, connectId);
  return clean.slice(0, 2).toUpperCase();
};

interface MessagesPageProps {
  onStartCall: (name: string, callType?: 'video' | 'audio', targetUserId?: string, targetConnectId?: string) => void;
  onShowToast: (msg: string) => void;
}

export const MessagesPage: React.FC<MessagesPageProps> = ({ onStartCall, onShowToast }) => {
  const { user } = useAuth();

  // Active view tab: 'chats' | 'requests'
  const [activeTab, setActiveTab] = useState<'chats' | 'requests'>('chats');

  // Search by Connect ID state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUserResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUserPreview, setSelectedUserPreview] = useState<SearchUserResult | null>(null);

  // Friends & Connections (with instant cache hydration)
  const [friends, setFriends] = useState<ConnectionUser[]>(() => {
    try {
      const savedUserStr = localStorage.getItem('vertexUser');
      const uid = savedUserStr ? JSON.parse(savedUserStr)?.id : '';
      if (uid) {
        const cached = localStorage.getItem(`vertex_cached_friends_${uid}`);
        if (cached) return JSON.parse(cached);
      }
    } catch {}
    return [];
  });
  const [pendingIncoming, setPendingIncoming] = useState<ConnectionUser[]>(() => {
    try {
      const savedUserStr = localStorage.getItem('vertexUser');
      const uid = savedUserStr ? JSON.parse(savedUserStr)?.id : '';
      if (uid) {
        const cached = localStorage.getItem(`vertex_cached_incoming_${uid}`);
        if (cached) return JSON.parse(cached);
      }
    } catch {}
    return [];
  });
  const [pendingOutgoing, setPendingOutgoing] = useState<ConnectionUser[]>([]);
  const [isLoadingConnections, setIsLoadingConnections] = useState<boolean>(() => {
    try {
      const savedUserStr = localStorage.getItem('vertexUser');
      const uid = savedUserStr ? JSON.parse(savedUserStr)?.id : '';
      if (uid) {
        const cached = localStorage.getItem(`vertex_cached_friends_${uid}`);
        if (cached && JSON.parse(cached).length > 0) return false;
      }
    } catch {}
    return true;
  });

  // Active Chat State (with instant cache hydration)
  const [activeFriend, setActiveFriend] = useState<ConnectionUser | null>(() => {
    try {
      const savedUserStr = localStorage.getItem('vertexUser');
      const uid = savedUserStr ? JSON.parse(savedUserStr)?.id : '';
      if (uid) {
        const cachedActive = localStorage.getItem(`vertex_active_friend_${uid}`);
        if (cachedActive) return JSON.parse(cachedActive);
        const cachedFriends = localStorage.getItem(`vertex_cached_friends_${uid}`);
        if (cachedFriends) {
          const list = JSON.parse(cachedFriends);
          if (list && list.length > 0) return list[0];
        }
      }
    } catch {}
    return null;
  });
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const savedUserStr = localStorage.getItem('vertexUser');
      const uid = savedUserStr ? JSON.parse(savedUserStr)?.id : '';
      const cachedActive = uid ? localStorage.getItem(`vertex_active_friend_${uid}`) : null;
      const convId = cachedActive ? JSON.parse(cachedActive)?.conversation_id : null;
      if (convId) {
        const cachedMsgs = localStorage.getItem(`vertex_cached_msgs_${convId}`);
        if (cachedMsgs) return JSON.parse(cachedMsgs);
      }
    } catch {}
    return [];
  });
  const [inputMessage, setInputMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  // WhatsApp Voice Note Recording State
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [voiceRecordSeconds, setVoiceRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const voiceTimerRef = useRef<any>(null);

  // Message Reply & Reaction State
  const [replyingTo, setReplyingTo] = useState<{ id: string; sender_name: string; content: string } | null>(null);

  // WhatsApp Menus & Popups State
  const [isChatListMenuOpen, setIsChatListMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isChatMenuOpen, setIsChatMenuOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  
  // WhatsApp Modals & Drawers
  const [isContactInfoOpen, setIsContactInfoOpen] = useState(false);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [mediaTab, setMediaTab] = useState<'media' | 'docs' | 'audio'>('media');
  const [isInChatSearchOpen, setIsInChatSearchOpen] = useState(false);
  const [inChatSearchQuery, setInChatSearchQuery] = useState('');
  const [isMuteModalOpen, setIsMuteModalOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDisappearingModalOpen, setIsDisappearingModalOpen] = useState(false);
  const [disappearingOption, setDisappearingOption] = useState<'off' | '24h' | '7d' | '90d'>('off');
  const [isWallpaperModalOpen, setIsWallpaperModalOpen] = useState(false);
  const [chatWallpaper, setChatWallpaper] = useState<'default' | 'doodle' | 'emerald' | 'navy' | 'dark'>('doodle');
  const [isClearChatModalOpen, setIsClearChatModalOpen] = useState(false);
  const [isDeleteChatModalOpen, setIsDeleteChatModalOpen] = useState(false);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState('Spam or unwanted advertising');
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('vertex_blocked_users');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });
  const isBlocked = Boolean(activeFriend?.user_id && blockedUserIds.has(activeFriend.user_id));
  
  // WhatsApp Filter Chips: 'all' | 'unread' | 'favourites' | 'groups' | 'requests'
  const [chatFilter, setChatFilter] = useState<'all' | 'unread' | 'favourites' | 'groups' | 'requests'>('all');
  const [friendSearchTerm, setFriendSearchTerm] = useState('');
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState<Set<string>>(new Set());
  const [isAddToListModalOpen, setIsAddToListModalOpen] = useState(false);
  const [isNewChatMenuOpen, setIsNewChatMenuOpen] = useState(false);
  const [isAddFriendModalOpen, setIsAddFriendModalOpen] = useState(false);
  const [addFriendInput, setAddFriendInput] = useState('');

  const toggleBlockActiveUser = () => {
    if (!activeFriend) return;
    setBlockedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(activeFriend.user_id)) {
        next.delete(activeFriend.user_id);
        onShowToast(`Unblocked @${activeFriend.connect_id}`);
      } else {
        next.add(activeFriend.user_id);
        onShowToast(`Blocked @${activeFriend.connect_id}`);
      }
      try {
        localStorage.setItem('vertex_blocked_users', JSON.stringify([...next]));
      } catch {}
      return next;
    });
    setIsBlockModalOpen(false);
  };

  // Muted Chats with localStorage persistence
  const [mutedChatIds, setMutedChatIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('vertexMutedChats');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('vertexMutedChats', JSON.stringify(Array.from(mutedChatIds)));
    } catch {}
  }, [mutedChatIds]);

  // Custom List Tags with localStorage persistence
  const [customListTags, setCustomListTags] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('vertexCustomListTags');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Favourite Chats with localStorage persistence
  const [favouriteChatIds, setFavouriteChatIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('vertexFavouriteChats');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('vertexFavouriteChats', JSON.stringify(Array.from(favouriteChatIds)));
    } catch {}
  }, [favouriteChatIds]);

  const toggleFavouriteChat = (id: string) => {
    setFavouriteChatIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        onShowToast('Removed from favourites');
      } else {
        next.add(id);
        onShowToast('Added to favourites ❤️');
      }
      return next;
    });
  };

  // Helper to load custom created groups from localStorage so they NEVER vanish
  const loadSavedGroups = (): ConnectionUser[] => {
    try {
      const raw = localStorage.getItem('vertex_custom_groups');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  // Clean up legacy localStorage deleted connections key on load so connections sync naturally
  useEffect(() => {
    try {
      localStorage.removeItem('vertex_deleted_connections');
    } catch {}
  }, []);

  // Chats List 3-Dots Modals
  const [isNewGroupModalOpen, setIsNewGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<string[]>([]);
  const [isLinkedDevicesModalOpen, setIsLinkedDevicesModalOpen] = useState(false);
  const [isStarredMessagesModalOpen, setIsStarredMessagesModalOpen] = useState(false);
  const [starredMessageIds, setStarredMessageIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('vertexStarredMessages');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('vertexStarredMessages', JSON.stringify(Array.from(starredMessageIds)));
    } catch {}
  }, [starredMessageIds]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldInstantScrollRef = useRef<boolean>(true);
  const isNearBottomRef = useRef<boolean>(true);
  const userSentMessageRef = useRef<boolean>(false);
  const hasRecentlyDeletedRef = useRef<boolean>(false);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const activeFriendRef = useRef<ConnectionUser | null>(activeFriend);
  const typingTimeoutRef = useRef<any>(null);
  const lastTypingSentRef = useRef<number>(0);

  useEffect(() => {
    activeFriendRef.current = activeFriend;
    shouldInstantScrollRef.current = true;
    isNearBottomRef.current = true;
    setShowScrollBottomBtn(false);
    if (activeFriend) {
      hasRecentlyDeletedRef.current = false;
      if (user?.id) {
        try {
          localStorage.setItem(`vertex_active_friend_${user.id}`, JSON.stringify(activeFriend));
        } catch {}
      }
    } else if (user?.id) {
      try {
        localStorage.removeItem(`vertex_active_friend_${user.id}`);
      } catch {}
    }
  }, [activeFriend, user?.id]);

  useEffect(() => {
    if (user?.id && friends.length > 0) {
      try {
        localStorage.setItem(`vertex_cached_friends_${user.id}`, JSON.stringify(friends));
      } catch {}
    }
  }, [friends, user?.id]);

  useEffect(() => {
    if (activeFriend?.conversation_id && messages.length > 0) {
      try {
        localStorage.setItem(`vertex_cached_msgs_${activeFriend.conversation_id}`, JSON.stringify(messages.slice(-60)));
      } catch {}
    }
  }, [messages, activeFriend?.conversation_id]);

  // WhatsApp-style scroll listener: Detects if user scrolled up to read history
  const handleScroll = () => {
    const el = chatScrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isNear = distanceFromBottom < 120;
    isNearBottomRef.current = isNear;
    setShowScrollBottomBtn(!isNear);
  };

  // WhatsApp-style quick scroll-to-bottom action
  const handleScrollToBottom = () => {
    if (chatScrollContainerRef.current) {
      chatScrollContainerRef.current.scrollTo({
        top: chatScrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
      isNearBottomRef.current = true;
      setShowScrollBottomBtn(false);
    }
  };

  // Smart auto-scroll: preserves user's position when reading past messages
  useEffect(() => {
    if (!chatScrollContainerRef.current) return;

    // 1. Initial chat load or switched chat -> snap instant to bottom without animation
    if (shouldInstantScrollRef.current) {
      chatScrollContainerRef.current.scrollTop = chatScrollContainerRef.current.scrollHeight;
      shouldInstantScrollRef.current = false;
      isNearBottomRef.current = true;
      setShowScrollBottomBtn(false);
      return;
    }

    // 2. User explicitly sent a message (text / voice / file) -> instant snap without downward slide
    if (userSentMessageRef.current) {
      userSentMessageRef.current = false;
      chatScrollContainerRef.current.scrollTop = chatScrollContainerRef.current.scrollHeight;
      isNearBottomRef.current = true;
      setShowScrollBottomBtn(false);
      return;
    }

    // 3. New incoming message arrived (from polling or websocket):
    // Only scroll to bottom IF user is already near the bottom!
    // Instant snap to eliminate any downward sliding / jumping artifact
    if (isNearBottomRef.current) {
      chatScrollContainerRef.current.scrollTop = chatScrollContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // 1. Fetch user's friends and pending requests from Backend (Isolated per user)
  const fetchConnections = async () => {
    if (!user) return;
    if (friends.length === 0) {
      setIsLoadingConnections(true);
    }
    try {
      const [res, presenceRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/connections?user_id=${user.id}`),
        fetch(`${API_BASE_URL}/api/v1/presence`).catch(() => null)
      ]);

      let presenceMap: Record<string, any> = {};
      if (presenceRes && presenceRes.ok) {
        presenceMap = await presenceRes.json();
      }

      if (res.ok) {
        const data = await res.json();

        const enrichedFriends = (data.friends || [])
          .map((f: ConnectionUser) => {
            const pres = presenceMap[f.user_id];
            return {
              ...f,
              name: getDisplayName(f.name, f.connect_id),
              status: pres?.status || f.status || 'offline',
              last_seen: pres?.last_seen || f.last_seen,
            };
          });

        // Merge custom saved groups so groups NEVER vanish on fetch!
        const savedGroups = loadSavedGroups();
        const allChats = [
          ...savedGroups,
          ...enrichedFriends.filter((ef: ConnectionUser) => !savedGroups.some(sg => sg.connection_id === ef.connection_id))
        ];

        setFriends(allChats);
        setPendingIncoming((data.pending_incoming || []).map((f: ConnectionUser) => ({
          ...f,
          name: getDisplayName(f.name, f.connect_id)
        })));
        setPendingOutgoing((data.pending_outgoing || []).map((f: ConnectionUser) => ({
          ...f,
          name: getDisplayName(f.name, f.connect_id)
        })));

        // If no active friend selected, select first friend (unless recently deleted chat)
        if (!activeFriendRef.current && allChats.length > 0 && !hasRecentlyDeletedRef.current) {
          let toSelect = allChats[0];
          try {
            const savedUserStr = localStorage.getItem('vertexUser');
            const uid = savedUserStr ? JSON.parse(savedUserStr)?.id : '';
            const cachedActive = uid ? localStorage.getItem(`vertex_active_friend_${uid}`) : null;
            if (cachedActive) {
              const parsed = JSON.parse(cachedActive);
              const found = allChats.find(c => c.connection_id === parsed.connection_id || c.user_id === parsed.user_id);
              if (found) toSelect = found;
            }
          } catch {}
          setActiveFriend(toSelect);
        }
      }
    } catch (e) {
      console.error('Failed to load connections', e);
    } finally {
      setIsLoadingConnections(false);
    }
  };

  useEffect(() => {
    fetchConnections();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchConnections();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // 2. Real-time WebSocket connection for user-isolated events (when WS server is active)
  useEffect(() => {
    if (!user?.id || !WS_BASE_URL) return;
    let ws: WebSocket | null = null;
    let reconnectTimer: any = null;

    const connectWS = () => {
      try {
        ws = new WebSocket(`${WS_BASE_URL}/api/v1/ws/${user.id}`);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[Messages WS] Connected for user:', user.id);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Forward call signaling redundancy
            if (['incoming_call', 'call_response', 'call_ended', 'call_failed', 'call_ringing', 'call_timeout'].includes(data.type)) {
              window.dispatchEvent(new CustomEvent('vertex_call_signaling', { detail: data }));
              return;
            }

            if (data.type === 'new_message') {
              const newMsg: ChatMessage = data.message;
              // If message belongs to current open conversation
              if (activeFriendRef.current?.conversation_id === newMsg.conversation_id) {
                setMessages((prev) => {
                  if (prev.some((m) => m.id === newMsg.id)) return prev;
                  return [...prev, newMsg];
                });

                // Immediately send read receipt via WebSocket (< 0.1ms instant blue tick for sender)
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                  wsRef.current.send(
                    JSON.stringify({
                      type: 'read_messages',
                      conversation_id: newMsg.conversation_id,
                    })
                  );
                } else if (user?.id && newMsg?.conversation_id && !String(newMsg.conversation_id).startsWith('group_')) {
                  fetch(`${API_BASE_URL}/api/v1/messages/read`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ conversation_id: newMsg.conversation_id, reader_id: user.id }),
                  }).catch(() => {});
                }
              }
              onShowToast(`New message from ${newMsg.sender_name}`);
            } else if (data.type === 'messages_read') {
              if (activeFriendRef.current?.conversation_id === data.conversation_id) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.sender_id === user?.id ? { ...m, is_read: true } : m
                  )
                );
              }
            } else if (data.type === 'message_reaction') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === data.message_id ? { ...m, reactions: data.reactions } : m
                )
              );
            } else if (data.type === 'presence_update') {
              setFriends((prev) =>
                prev.map((f) =>
                  f.user_id === data.user_id
                    ? { ...f, status: data.status, last_seen: data.last_seen || f.last_seen }
                    : f
                )
              );
              if (activeFriendRef.current?.user_id === data.user_id) {
                setActiveFriend((curr) =>
                  curr ? { ...curr, status: data.status, last_seen: data.last_seen || curr.last_seen } : null
                );
              }
            } else if (data.type === 'connection_request') {
              onShowToast('You received a new connection request!');
              fetchConnections();
            } else if (data.type === 'connection_accepted') {
              onShowToast('Connection accepted! You can now chat.');
              fetchConnections();
            } else if (data.type === 'typing') {
              if (activeFriendRef.current && data.sender_id === activeFriendRef.current.user_id) {
                setIsTyping(!!data.is_typing);
              }
            }
          } catch (err) {
            console.error('WS parse error', err);
          }
        };

        ws.onclose = () => {
          wsRef.current = null;
          reconnectTimer = setTimeout(connectWS, 3000);
        };
      } catch (err) {
        console.error('WS connection error', err);
      }
    };

    connectWS();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.close();
        wsRef.current = null;
      }
    };
  }, [user?.id]);

  // 3. Fetch message history when active friend changes (with instant cache hydration)
  useEffect(() => {
    if (!activeFriend?.conversation_id) {
      setMessages([]);
      setIsLoadingMessages(false);
      return;
    }

    // Load cached messages immediately so UI appears in 0ms!
    try {
      const cached = localStorage.getItem(`vertex_cached_msgs_${activeFriend.conversation_id}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.length > 0) {
          setMessages(parsed);
          setIsLoadingMessages(false);
        } else {
          setIsLoadingMessages(true);
        }
      } else {
        setIsLoadingMessages(true);
      }
    } catch {
      setIsLoadingMessages(true);
    }

    const fetchMessages = async () => {
      // If active friend is a custom created group, load messages from localStorage
      if (activeFriend.connection_id.startsWith('group_')) {
        try {
          const stored = JSON.parse(localStorage.getItem(`vertex_group_msgs_${activeFriend.connection_id}`) || '[]');
          setMessages((prev) => {
            if (prev.length === stored.length) {
              let changed = false;
              for (let i = 0; i < prev.length; i++) {
                if (prev[i].id !== stored[i].id || JSON.stringify(prev[i].reactions) !== JSON.stringify(stored[i].reactions)) {
                  changed = true;
                  break;
                }
              }
              if (!changed) return prev;
            }
            return stored;
          });
        } catch {
          setMessages([]);
        }
        return;
      }

      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/messages/${activeFriend.conversation_id}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (res.ok) {
          const rawData: any[] = await res.json();
          const data: ChatMessage[] = (rawData || []).map((m: any) => ({
            ...m,
            is_me: m.sender_id === user?.id,
          }));
          setMessages((prev) => {
            if (!data) return prev;

            const serverIds = new Set(data.map((d) => d.id));
            const now = Date.now();

            // Preserved messages (keep optimistic messages so they never flicker or disappear):
            const preserved = prev.filter((m) => {
              if (serverIds.has(m.id)) return false;

              if (m.id.startsWith('temp_')) {
                const tempTime = parseInt(m.id.replace('temp_', ''), 10) || now;
                const serverHasIt = data.some(
                  (d) =>
                    d.sender_id === m.sender_id &&
                    d.content === m.content &&
                    Math.abs(new Date(d.created_at).getTime() - tempTime) < 30000
                );
                return !serverHasIt;
              }

              const isMine = m.sender_id === user?.id || m.is_me;
              if (isMine) {
                const msgTime = new Date(m.created_at).getTime();
                if (!isNaN(msgTime) && now - msgTime < 30000) {
                  const serverHasIt = data.some(
                    (d) => d.content === m.content && Math.abs(new Date(d.created_at).getTime() - msgTime) < 30000
                  );
                  return !serverHasIt;
                }
              }

              return false;
            });

            const merged = [...data, ...preserved];
            merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

            if (prev.length === merged.length) {
              let changed = false;
              for (let i = 0; i < prev.length; i++) {
                if (
                  prev[i].id !== merged[i].id ||
                  prev[i].status !== merged[i].status ||
                  prev[i].is_read !== merged[i].is_read ||
                  JSON.stringify(prev[i].reactions) !== JSON.stringify(merged[i].reactions)
                ) {
                  changed = true;
                  break;
                }
              }
              if (!changed) return prev;
            }
            return merged;
          });

          // Mark unread messages as read instantly over WebSocket
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && activeFriend?.conversation_id) {
            wsRef.current.send(
              JSON.stringify({
                type: 'read_messages',
                conversation_id: activeFriend.conversation_id,
              })
            );
          } else if (user?.id && activeFriend?.conversation_id && !activeFriend.connection_id.startsWith('group_')) {
            fetch(`${API_BASE_URL}/api/v1/messages/read`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                conversation_id: activeFriend.conversation_id,
                reader_id: user.id,
              }),
            }).catch(() => {});
          }
        }
      } catch (err) {
        console.error('Failed to load messages', err);
      } finally {
        setIsLoadingMessages(false);
      }
    };

    fetchMessages();

    // Auto-poll every 2.5s so messages sync in real-time 24/7 even in serverless mode
    const pollInterval = setInterval(fetchMessages, 2500);
    return () => clearInterval(pollInterval);
  }, [activeFriend]);

  // 4. Search Users by Connect ID or Name (Instagram-style Instant Search)
  useEffect(() => {
    const raw = (friendSearchTerm || searchQuery).trim().replace(/^@/, '');
    if (!raw || raw.length < 1 || !user) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/users/search?q=${encodeURIComponent(raw)}&current_user_id=${user.id}`, {
          cache: 'no-store'
        });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } catch (err) {
        console.error('Search error', err);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [friendSearchTerm, searchQuery, user]);

  // 5. Send Connection Request via Connect ID (Instagram Follow / Connect)
  const handleSendConnectRequest = async (targetConnectId: string) => {
    if (!user) return;
    const cleanId = targetConnectId.trim().replace(/^@/, '');

    // Instant optimistic update on search results
    setSearchResults((prev) =>
      prev.map((u) =>
        u.connect_id.toLowerCase() === cleanId.toLowerCase()
          ? { ...u, connection_status: 'pending', is_sender: true }
          : u
      )
    );

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/connections/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requester_id: user.id,
          from_user_id: user.id,
          target_connect_id: cleanId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onShowToast(data.message || `Request sent to @${cleanId}! 🎉`);
        fetchConnections();
      } else {
        onShowToast(data.detail || data.message || 'Failed to send request');
      }
    } catch {
      onShowToast('Backend server unreachable.');
    }
  };

  // 6. Accept Connection Request (Instagram Instant Confirm & Direct Chat Open)
  const handleAcceptRequest = async (connectionId: string, friendName: string) => {
    if (!user) return;
    const reqItem = pendingIncoming.find((r) => r.connection_id === connectionId);
    setPendingIncoming((prev) => prev.filter((r) => r.connection_id !== connectionId));

    if (reqItem) {
      const ids = [user.id, reqItem.user_id].sort();
      const newFriend: ConnectionUser = {
        connection_id: connectionId,
        user_id: reqItem.user_id,
        name: reqItem.name,
        connect_id: reqItem.connect_id,
        bio: reqItem.bio || '',
        status: 'online',
        avatar: reqItem.avatar || '',
        conversation_id: `direct_${ids[0]}_${ids[1]}`,
      };
      setFriends((prev) => [newFriend, ...prev.filter((f) => f.user_id !== reqItem.user_id)]);
      setActiveFriend(newFriend);
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/connections/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: connectionId,
          user_id: user.id,
        }),
      });
      if (res.ok) {
        onShowToast(`Connected with ${friendName}! 🎉`);
        fetchConnections();
        setChatFilter('all');
      }
    } catch {
      onShowToast('Failed to accept request');
    }
  };

  // 6b. Decline Connection Request
  const handleDeclineRequest = async (connectionId: string, name?: string) => {
    if (!user) return;
    setPendingIncoming((prev) => prev.filter((r) => r.connection_id !== connectionId));
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/connections/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: connectionId,
          user_id: user.id,
        }),
      });
      if (res.ok) {
        onShowToast(`Request declined.`);
        fetchConnections();
      }
    } catch {
      onShowToast('Failed to decline request');
    }
  };

  // Real-Time Typing Emitter (Throttled for ultra-fast, smooth performance)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputMessage(val);

    if (activeFriend && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const now = Date.now();
      // Throttle typing emission to once every 1000ms
      if (now - lastTypingSentRef.current > 1000) {
        lastTypingSentRef.current = now;
        wsRef.current.send(
          JSON.stringify({
            type: 'typing',
            target_user_id: activeFriend.user_id,
            is_typing: true,
          })
        );
      }

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && activeFriend) {
          wsRef.current.send(
            JSON.stringify({
              type: 'typing',
              target_user_id: activeFriend.user_id,
              is_typing: false,
            })
          );
        }
      }, 1500);
    }
  };

  // 7. Send Real-Time Text Message (Instant Optimistic UI + Reply Quote)
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !user || !activeFriend) return;

    userSentMessageRef.current = true;
    const messageContent = inputMessage.trim();
    const tempId = `temp_${Date.now()}`;
    const replySnippet = replyingTo ? `${replyingTo.sender_name}: ${replyingTo.content.slice(0, 60)}` : undefined;
    const replyId = replyingTo?.id;

    // Handle Group Messaging Persistence
    if (activeFriend.connection_id.startsWith('group_')) {
      const groupMsg: ChatMessage = {
        id: `msg_grp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        conversation_id: activeFriend.connection_id,
        sender_id: user.id,
        sender_name: user.name,
        content: messageContent,
        reply_to_id: replyId,
        reply_to_snippet: replySnippet,
        reactions: {},
        is_read: true,
        status: 'delivered',
        created_at: new Date().toISOString(),
        is_me: true
      };
      setMessages((prev) => [...prev, groupMsg]);
      setInputMessage('');
      setReplyingTo(null);

      // Persist permanently in localStorage
      try {
        const stored = JSON.parse(localStorage.getItem(`vertex_group_msgs_${activeFriend.connection_id}`) || '[]');
        localStorage.setItem(`vertex_group_msgs_${activeFriend.connection_id}`, JSON.stringify([...stored, groupMsg]));
      } catch {}

      // Broadcast to online teammates via WebSocket
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'group_message',
            group_id: activeFriend.connection_id,
            message: groupMsg
          })
        );
      }
      return;
    }

    const isReceiverOnline = activeFriend.status === 'online' || activeFriend.status === 'in_call';
    const optimisticMessage: ChatMessage = {
      id: tempId,
      conversation_id: activeFriend.conversation_id || '',
      sender_id: user.id,
      sender_name: user.name,
      receiver_id: activeFriend.user_id,
      content: messageContent,
      reply_to_id: replyId,
      reply_to_snippet: replySnippet,
      reactions: {},
      is_read: false,
      status: isReceiverOnline ? 'delivered' : 'sent',
      created_at: new Date().toISOString(),
      is_me: true,
    };

    // 0ms Perception: Append locally immediately
    setMessages((prev) => [...prev, optimisticMessage]);
    setInputMessage('');
    setReplyingTo(null);

    // Clear typing status immediately on send
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'typing',
          target_user_id: activeFriend.user_id,
          is_typing: false,
        })
      );
    }

    const payload = {
      conversation_id: activeFriend.conversation_id,
      sender_id: user.id,
      sender_name: user.name,
      receiver_id: activeFriend.user_id,
      content: messageContent,
      reply_to_id: replyId,
      reply_to_snippet: replySnippet,
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        // Replace temporary client message with server persisted record
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...(data.message || m), status: 'delivered', is_me: true } : m))
        );
      } else {
        onShowToast('Failed to deliver message.');
      }
    } catch (err) {
      console.error('Error sending message', err);
      onShowToast('Message delivery failed: check server.');
    }
  };

  // 7b. WhatsApp Voice Audio Notes Recording
  const handleStartVoiceRecord = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      onShowToast('Microphone recording not supported on this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start();
      setIsRecordingVoice(true);
      setVoiceRecordSeconds(0);

      if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = setInterval(() => {
        setVoiceRecordSeconds((s) => s + 1);
      }, 1000);
    } catch (err: any) {
      onShowToast(`Microphone error: ${err.message || 'Permission denied'}`);
    }
  };

  const handleCancelVoiceRecord = () => {
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current.stop();
    }
    setIsRecordingVoice(false);
    setVoiceRecordSeconds(0);
    audioChunksRef.current = [];
    onShowToast('Voice note discarded');
  };

  const handleStopAndSendVoiceRecord = async () => {
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    if (!mediaRecorderRef.current || !activeFriend || !user) return;

    const durationSec = voiceRecordSeconds;
    setIsRecordingVoice(false);
    setVoiceRecordSeconds(0);

    mediaRecorderRef.current.onstop = async () => {
      mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const audioFile = new File([audioBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
      audioChunksRef.current = [];

      onShowToast('Delivering voice note…');

      const formData = new FormData();
      formData.append('file', audioFile);

      try {
        const uploadRes = await fetch(`${API_BASE_URL}/api/v1/files/upload`, {
          method: 'POST',
          body: formData,
        });

        if (uploadRes.ok) {
          const fileData = await uploadRes.json();
          const durStr = `${Math.floor(durationSec / 60)}:${durationSec % 60 < 10 ? '0' : ''}${durationSec % 60}`;

          const msgPayload = {
            conversation_id: activeFriend.conversation_id,
            sender_id: user.id,
            sender_name: user.name,
            receiver_id: activeFriend.user_id,
            content: '🎤 Voice note',
            file_url: fileData.file_url,
            file_name: fileData.file_name,
            file_size: durStr,
            file_type: 'audio/webm',
          };

          const sendRes = await fetch(`${API_BASE_URL}/api/v1/messages/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(msgPayload),
          });

          if (sendRes.ok) {
            userSentMessageRef.current = true;
            const sent = await sendRes.json();
            setMessages((prev) => [...prev, { ...sent.message, is_me: true }]);
            onShowToast('Voice note sent!');
          }
        }
      } catch (e) {
        onShowToast('Failed to send voice note');
      }
    };

    if (mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  // 7c. Emoji Reactions
  const handleReactToMessage = async (messageId: string, emoji: string) => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/messages/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_id: messageId,
          user_id: user.id,
          user_name: user.name,
          emoji,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, reactions: data.reactions } : m))
        );
      }
    } catch (e) {
      console.warn('React error', e);
    }
  };

  // 8. Upload File / Attachment (WhatsApp Style)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !activeFriend) return;

    setIsUploading(true);
    onShowToast(`Uploading ${file.name}…`);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const uploadRes = await fetch(`${API_BASE_URL}/api/v1/files/upload`, {
        method: 'POST',
        body: formData,
      });

      if (uploadRes.ok) {
        const fileData = await uploadRes.json();
        
        // Send message with attachment
        const msgPayload = {
          conversation_id: activeFriend.conversation_id,
          sender_id: user.id,
          sender_name: user.name,
          receiver_id: activeFriend.user_id,
          content: `Shared file: ${file.name}`,
          file_url: fileData.file_url,
          file_name: fileData.file_name,
          file_size: fileData.file_size,
          file_type: fileData.file_type,
        };

        const sendRes = await fetch(`${API_BASE_URL}/api/v1/messages/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(msgPayload),
        });

        if (sendRes.ok) {
          userSentMessageRef.current = true;
          const sent = await sendRes.json();
          setMessages((prev) => [...prev, sent.message]);
          onShowToast(`File ${file.name} sent successfully!`);
        }
      }
    } catch (err) {
      onShowToast('File upload failed. Ensure backend is running.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // WhatsApp Feature Handlers
  const handleExportChat = () => {
    if (!activeFriend) return;
    setIsChatMenuOpen(false);
    const lines = messages.map(m => {
      const time = new Date(m.created_at).toLocaleString();
      const sender = m.sender_name || (m.sender_id === user?.id ? getDisplayName(user?.name, user?.connect_id) : getDisplayName(activeFriend.name, activeFriend.connect_id));
      return `[${time}] ${sender}: ${m.content || m.file_name || 'Attachment'}`;
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Vertex_Chat_with_${activeFriend.connect_id}.txt`;
    a.click();
    onShowToast('Chat transcript exported successfully!');
  };

  const handleClearChat = async () => {
    if (!activeFriend) return;
    const convId = activeFriend.conversation_id;
    if (convId) {
      try {
        await fetch(`${API_BASE_URL}/api/v1/messages/clear`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation_id: convId }),
        });
      } catch (e) {
        console.warn('Clear chat error:', e);
      }
    }
    if (activeFriend.connection_id.startsWith('group_')) {
      try {
        localStorage.removeItem(`vertex_group_msgs_${activeFriend.connection_id}`);
      } catch {}
    }
    setMessages([]);
    setIsClearChatModalOpen(false);
    setIsChatMenuOpen(false);
    onShowToast('Entire chat history cleared permanently.');
  };

  const handleToggleStar = (msgId: string) => {
    setStarredMessageIds(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
        onShowToast('Message unstarred');
      } else {
        next.add(msgId);
        onShowToast('Message starred ⭐');
      }
      return next;
    });
  };

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      onShowToast('Copied to clipboard!');
    }).catch(() => {});
  };

  const handleDeleteMessage = (msgId: string) => {
    setMessages(prev => prev.filter(m => m.id !== msgId));
    onShowToast('Message deleted for you');
  };

  const handleSelectEmoji = (emoji: string) => {
    setInputMessage(prev => prev + emoji);
  };

  const handleSelectAttachmentType = (type: 'image' | 'doc' | 'audio') => {
    setIsAttachmentMenuOpen(false);
    if (!fileInputRef.current) return;
    if (type === 'image') {
      fileInputRef.current.accept = 'image/*,video/*';
    } else if (type === 'doc') {
      fileInputRef.current.accept = '.pdf,.doc,.docx,.txt,.zip,.xls,.xlsx';
    } else if (type === 'audio') {
      fileInputRef.current.accept = 'audio/*';
    }
    fileInputRef.current.click();
  };

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) {
      onShowToast('Please enter a group name');
      return;
    }
    const groupId = `group_${Date.now()}`;
    const newGroup: ConnectionUser = {
      connection_id: groupId,
      user_id: groupId,
      name: newGroupName.trim(),
      connect_id: `group_${newGroupName.trim().toLowerCase().replace(/\s+/g, '_')}`,
      bio: `Group · ${selectedGroupMembers.length + 1} participants`,
      status: 'online',
      conversation_id: groupId
    };

    // 1. Permanently store in localStorage
    const saved = loadSavedGroups();
    const updated = [newGroup, ...saved.filter(g => g.connection_id !== groupId)];
    try {
      localStorage.setItem('vertex_custom_groups', JSON.stringify(updated));
    } catch {}

    // 2. Initial welcome message in group
    const initMsg: ChatMessage = {
      id: `msg_init_${Date.now()}`,
      conversation_id: groupId,
      sender_id: user?.id || 'system',
      sender_name: 'System',
      content: `🎉 You created group "${newGroupName.trim()}" with ${selectedGroupMembers.length + 1} participants.`,
      created_at: new Date().toISOString(),
      status: 'read'
    };
    try {
      localStorage.setItem(`vertex_group_msgs_${groupId}`, JSON.stringify([initMsg]));
    } catch {}

    setFriends(prev => [newGroup, ...prev.filter(f => f.connection_id !== groupId)]);
    setActiveFriend(newGroup);
    setMessages([initMsg]);
    setIsNewGroupModalOpen(false);
    setNewGroupName('');
    setSelectedGroupMembers([]);
    setChatFilter('all');
    onShowToast(`Group "${newGroup.name}" created!`);
  };

  const handleDeleteChat = async () => {
    if (!activeFriend) return;
    const targetId = activeFriend.connection_id;
    const convId = activeFriend.conversation_id;
    const friendUserId = activeFriend.user_id;
    const friendConnectId = activeFriend.connect_id;

    hasRecentlyDeletedRef.current = true;
    activeFriendRef.current = null;

    // Clear state immediately
    setFriends(prev => prev.filter(f => f.connection_id !== targetId && f.user_id !== friendUserId));
    setMessages([]);
    setActiveFriend(null);
    setIsChatMenuOpen(false);
    setIsDeleteChatModalOpen(false);

    if (targetId.startsWith('group_')) {
      const saved = loadSavedGroups();
      const updated = saved.filter(g => g.connection_id !== targetId);
      try {
        localStorage.setItem('vertex_custom_groups', JSON.stringify(updated));
        localStorage.removeItem(`vertex_group_msgs_${targetId}`);
      } catch {}
    } else {
      // Direct connection -> delete connection & message history from D1 database permanently
      try {
        await fetch(`${API_BASE_URL}/api/v1/connections/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connection_id: targetId,
            user_id: user?.id,
            target_user_id: friendUserId,
            conversation_id: convId,
          }),
        });
      } catch (e) {
        console.warn('Delete connection error:', e);
      }
    }

    fetchConnections();
    onShowToast(`Chat with @${friendConnectId} deleted. You can search @${friendConnectId} to connect again.`);
  };

  const handleSendCallLink = async () => {
    if (!activeFriend || !user) return;
    setIsChatMenuOpen(false);
    const roomName = `meet_${[user.id, activeFriend.user_id].sort().join('_')}_${Date.now().toString(36)}`;
    const link = `${window.location.origin}/meet/${roomName}`;
    const callMsgText = `📹 Join my Vertex Connect call:\n${link}\nClick above to join now.`;

    // Copy to clipboard
    navigator.clipboard.writeText(link).catch(() => {});

    // Send into conversation directly so the other person receives it in chat!
    const tempId = `temp_${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      id: tempId,
      conversation_id: activeFriend.conversation_id || '',
      sender_id: user.id,
      sender_name: user.name,
      receiver_id: activeFriend.user_id,
      content: callMsgText,
      created_at: new Date().toISOString(),
      is_read: false,
      reactions: {},
    };
    setMessages(prev => [...prev, optimisticMessage]);

    try {
      await fetch(`${API_BASE_URL}/api/v1/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: activeFriend.conversation_id,
          sender_id: user.id,
          sender_name: user.name,
          receiver_id: activeFriend.user_id,
          content: callMsgText,
        }),
      });
      onShowToast('Call link sent to chat & copied to clipboard! 🔗');
    } catch {
      onShowToast('Call link copied to clipboard: ' + link);
    }
  };

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.vertex-menu-container') && !target.closest('.vertex-menu-btn')) {
        setIsChatListMenuOpen(false);
        setIsChatMenuOpen(false);
      }
      if (!target.closest('.notification-menu-container') && !target.closest('.notification-menu-btn')) {
        setIsNotificationsOpen(false);
      }
      if (!target.closest('.new-chat-menu-container') && !target.closest('.new-chat-menu-btn')) {
        setIsNewChatMenuOpen(false);
      }
      if (!target.closest('.emoji-picker-container') && !target.closest('.emoji-picker-btn')) {
        setIsEmojiPickerOpen(false);
      }
      if (!target.closest('.attachment-menu-container') && !target.closest('.attachment-menu-btn')) {
        setIsAttachmentMenuOpen(false);
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const sharedMediaFiles = messages.filter(m => m.file_url);
  const starredMessagesList = messages.filter(m => starredMessageIds.has(m.id));
  const filteredMessages = inChatSearchQuery.trim()
    ? messages.filter(m => (m.content || '').toLowerCase().includes(inChatSearchQuery.toLowerCase()))
    : messages;

  const displayedFriends = friends.filter(f => {
    // 1. Tab filter
    if (chatFilter === 'groups') {
      if (!f.connection_id.startsWith('group_') && !f.bio?.toLowerCase().includes('group')) return false;
    } else if (chatFilter === 'favourites') {
      if (!favouriteChatIds.has(f.connection_id)) return false;
    } else if (chatFilter === 'unread') {
      if (f.status !== 'online' && !f.bio?.includes('new')) return false;
    }

    // 2. Search query filter
    if (friendSearchTerm.trim()) {
      const q = friendSearchTerm.toLowerCase();
      return f.name.toLowerCase().includes(q) || f.connect_id.toLowerCase().includes(q);
    }
    return true;
  });

  const WALLPAPER_CLASSES: Record<string, string> = {
    default: 'bg-[#f8fafc]',
    doodle: 'bg-[#f8fafc] bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:20px_20px]',
    emerald: 'bg-gradient-to-b from-[#f0fdf4] via-[#f8fafc] to-[#f0fdf4]',
    navy: 'bg-gradient-to-b from-[#eff6ff] via-[#f8fafc] to-[#eff6ff]',
    dark: 'bg-[#0f172a]'
  };

  return (
    <div className="h-full w-full flex overflow-hidden bg-slate-50 text-slate-800 select-none">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* LEFT SIDEBAR: Executive Vertex Connect Chats Column */}
      <div className={`w-full md:w-[380px] lg:w-[410px] shrink-0 border-r border-slate-200/80 flex flex-col bg-white h-full ${activeFriend ? 'hidden md:flex' : 'flex'}`}>
        {/* Chats Header */}
        <div className="h-[64px] px-4 bg-white flex items-center justify-between border-b border-slate-200/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-black text-slate-900 tracking-tight">Vertex Connect</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Notification Bell Icon for Incoming Connection Requests (Left side of 3-dots) */}
            <div className="relative notification-menu-container">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsChatListMenuOpen(false);
                  setIsNotificationsOpen(!isNotificationsOpen);
                }}
                title={pendingIncoming.length > 0 ? `${pendingIncoming.length} Connection request(s)` : 'Connection requests'}
                className="notification-menu-btn relative w-9 h-9 rounded-xl flex items-center justify-center hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <Bell className="w-5 h-5" />
                {pendingIncoming.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center shadow-xs animate-in zoom-in duration-150 ring-2 ring-white">
                    {pendingIncoming.length}
                  </span>
                )}
              </button>

              {/* Notification Popover Dropdown */}
              {isNotificationsOpen && (
                <div className="notification-menu-container fixed inset-x-3 top-[68px] sm:absolute sm:inset-x-auto sm:right-[-44px] sm:top-11 sm:w-[350px] max-w-[calc(100vw-24px)] max-h-[min(480px,calc(100vh-80px))] overflow-y-auto overscroll-contain rounded-2xl bg-white border border-slate-200 shadow-2xl z-50 p-3 animate-in fade-in zoom-in-95 duration-150 text-slate-800 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent]">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 px-1">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-blue-600" />
                      <span className="font-bold text-xs text-slate-900">Connection Requests</span>
                    </div>
                    {pendingIncoming.length > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-100">
                        {pendingIncoming.length} pending
                      </span>
                    )}
                  </div>

                  {pendingIncoming.length === 0 ? (
                    <div className="py-7 px-4 text-center">
                      <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
                        <Check className="w-5 h-5" />
                      </div>
                      <p className="text-xs font-semibold text-slate-700">No new connection requests</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">When someone sends you a friend request, you can accept it here.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {pendingIncoming.map((req) => (
                        <div
                          key={req.connection_id}
                          className="p-3 rounded-2xl bg-slate-50/90 border border-slate-200/80 hover:bg-slate-50 transition-colors shadow-xs"
                        >
                          <div className="flex items-center justify-between gap-2.5 mb-2.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-500 flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-xs ring-2 ring-white">
                                {getInitials(req.name, req.connect_id)}
                              </div>
                              <div className="min-w-0">
                                <b className="text-xs font-bold text-slate-900 truncate block">@{req.connect_id}</b>
                                <span className="text-[11px] text-slate-500 block truncate">{getDisplayName(req.name, req.connect_id)}</span>
                                {req.bio && <span className="text-[10px] text-slate-400 truncate block mt-0.5">{req.bio}</span>}
                              </div>
                            </div>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 uppercase shrink-0">
                              Request
                            </span>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200/60">
                            <button
                              type="button"
                              onClick={async () => {
                                await handleDeclineRequest(req.connection_id, req.name);
                              }}
                              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs transition-colors cursor-pointer"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await handleAcceptRequest(req.connection_id, req.name);
                                setIsNotificationsOpen(false);
                              }}
                              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs shadow-blue-500/20 transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-1.5"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Confirm</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 3-Dots Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsNotificationsOpen(false);
                  setIsChatListMenuOpen(!isChatListMenuOpen);
                }}
                title="Menu"
                className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <MoreVertical className="w-5 h-5" />
              </button>

              {/* Chats List Dropdown */}
              {isChatListMenuOpen && (
                <div className="vertex-menu-container absolute right-0 top-11 w-56 max-h-[min(480px,calc(100vh-80px))] overflow-y-auto overscroll-contain rounded-2xl bg-white border border-slate-200 shadow-2xl z-50 p-2 animate-in fade-in zoom-in-95 duration-150 text-slate-700 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent]">
                  <button
                    type="button"
                    onClick={() => {
                      setIsChatListMenuOpen(false);
                      setIsNewGroupModalOpen(true);
                    }}
                    className="w-full px-3 py-2 text-xs flex items-center gap-3 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-colors text-left cursor-pointer font-medium"
                  >
                    <Users className="w-4 h-4 text-blue-600" />
                    <span>New group</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsChatListMenuOpen(false);
                      onShowToast('New broadcast channel created');
                    }}
                    className="w-full px-3 py-2 text-xs flex items-center gap-3 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-colors text-left cursor-pointer font-medium"
                  >
                    <Share2 className="w-4 h-4 text-blue-600" />
                    <span>New broadcast</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsChatListMenuOpen(false);
                      setIsLinkedDevicesModalOpen(true);
                    }}
                    className="w-full px-3 py-2 text-xs flex items-center gap-3 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-colors text-left cursor-pointer font-medium"
                  >
                    <Laptop className="w-4 h-4 text-blue-600" />
                    <span>Linked devices</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsChatListMenuOpen(false);
                      setIsStarredMessagesModalOpen(true);
                    }}
                    className="w-full px-3 py-2 text-xs flex items-center gap-3 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-colors text-left cursor-pointer font-medium"
                  >
                    <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                    <span>Starred messages</span>
                  </button>

                  <div className="h-[1px] bg-slate-100 my-1" />

                  <button
                    type="button"
                    onClick={() => {
                      setIsChatListMenuOpen(false);
                      setChatFilter('all');
                      onShowToast('All chats marked as read');
                    }}
                    className="w-full px-3 py-2 text-xs flex items-center gap-3 rounded-xl hover:bg-blue-50 hover:text-blue-600 transition-colors text-left cursor-pointer font-medium"
                  >
                    <CheckCheck className="w-4 h-4 text-blue-600" />
                    <span>Mark all as read</span>
                  </button>
                </div>
              )}
            </div>

            {/* Cobalt Blue (+) New Chat / Add Friend Button */}
            <div className="relative new-chat-menu-container">
              <button
                type="button"
                onClick={() => setIsNewChatMenuOpen(!isNewChatMenuOpen)}
                className="new-chat-menu-btn w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-md shadow-blue-500/25 transition-transform active:scale-95 cursor-pointer"
                title="New chat or add friend"
              >
                <Plus className="w-5 h-5 text-white stroke-[2.5]" />
              </button>

              {isNewChatMenuOpen && (
                <div className="new-chat-menu-container absolute right-0 top-11 w-56 rounded-2xl bg-white shadow-2xl z-50 py-2 border border-slate-200 animate-in fade-in zoom-in-95 duration-100 text-slate-700">
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewChatMenuOpen(false);
                      setIsAddFriendModalOpen(true);
                    }}
                    className="w-full px-4 py-2.5 text-xs font-semibold flex items-center gap-3 hover:bg-blue-50 hover:text-blue-600 transition-colors text-left cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4 text-blue-600" />
                    <span>Add Friend by Connect ID</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsNewChatMenuOpen(false);
                      setIsNewGroupModalOpen(true);
                    }}
                    className="w-full px-4 py-2.5 text-xs font-semibold flex items-center gap-3 hover:bg-blue-50 hover:text-blue-600 transition-colors text-left cursor-pointer"
                  >
                    <Users className="w-4 h-4 text-blue-600" />
                    <span>New group</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-3.5 pt-3 pb-2 bg-white shrink-0">
          <div className="h-10 px-3.5 rounded-xl bg-slate-100/90 border border-slate-200/60 focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition-all flex items-center gap-2.5">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              value={friendSearchTerm}
              onChange={(e) => {
                setFriendSearchTerm(e.target.value);
                setSearchQuery(e.target.value);
              }}
              placeholder="Search or enter Connect ID (e.g. @john)"
              className="flex-1 bg-transparent border-none text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
            />
            {friendSearchTerm && (
              <button
                type="button"
                onClick={() => {
                  setFriendSearchTerm('');
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Pills: All, Unread, Favourites, Groups, Requests, + */}
        <div className="px-3.5 py-2 bg-white flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0 border-b border-slate-100">
          <button
            type="button"
            onClick={() => setChatFilter('all')}
            className={`px-3 py-1 rounded-full text-xs transition-colors cursor-pointer ${
              chatFilter === 'all'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 font-medium'
            }`}
          >
            All
          </button>

          <button
            type="button"
            onClick={() => setChatFilter('unread')}
            className={`px-3 py-1 rounded-full text-xs transition-colors cursor-pointer ${
              chatFilter === 'unread'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 font-medium'
            }`}
          >
            Unread
          </button>

          <button
            type="button"
            onClick={() => setChatFilter('favourites')}
            className={`px-3 py-1 rounded-full text-xs transition-colors cursor-pointer ${
              chatFilter === 'favourites'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 font-medium'
            }`}
          >
            Favourites
          </button>

          <button
            type="button"
            onClick={() => setChatFilter('groups')}
            className={`px-3 py-1 rounded-full text-xs transition-colors cursor-pointer ${
              chatFilter === 'groups'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 font-medium'
            }`}
          >
            Groups
          </button>

          <button
            type="button"
            onClick={() => setChatFilter('requests')}
            className={`px-3 py-1 rounded-full text-xs transition-colors cursor-pointer flex items-center gap-1.5 ${
              chatFilter === 'requests'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 font-medium'
            }`}
          >
            <span>Requests</span>
            {pendingIncoming.length > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${chatFilter === 'requests' ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'}`}>
                {pendingIncoming.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsNewChatMenuOpen(!isNewChatMenuOpen)}
            className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Add contact or group"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Conversations / Search / Requests Container */}
        {chatFilter === 'requests' ? (
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100/80 p-3 space-y-2">
            <div className="px-1 pt-1 pb-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Pending Requests ({pendingIncoming.length})</span>
            </div>
            {pendingIncoming.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No pending connection requests.
              </div>
            ) : (
              pendingIncoming.map((req) => (
                <div key={req.connection_id} className="p-3 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-500 flex items-center justify-center font-bold text-sm text-white shrink-0 shadow-xs ring-2 ring-white">
                      {getInitials(req.name, req.connect_id)}
                    </div>
                    <div className="min-w-0">
                      <b className="text-xs font-bold text-slate-900 block truncate">@{req.connect_id}</b>
                      <span className="text-[11px] text-slate-500 font-medium block truncate">{getDisplayName(req.name, req.connect_id)}</span>
                      <span className="text-[10px] text-slate-400">Wants to connect with you</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleAcceptRequest(req.connection_id, req.name)}
                      className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeclineRequest(req.connection_id, req.name)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium transition-colors cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : friendSearchTerm.trim() ? (
          /* Search Results Mode: Shows Matching Existing Chats + Global Search Users with Add Friend */
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100/80">
            {/* 1. Existing Chats match */}
            {displayedFriends.length > 0 && (
              <div>
                <div className="px-3.5 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/70">
                  Your Chats ({displayedFriends.length})
                </div>
                {displayedFriends.map((f) => {
                  const isSelected = activeFriend?.connection_id === f.connection_id;
                  const isGroup = f.connection_id.startsWith('group_');
                  return (
                    <div
                      key={f.connection_id}
                      onClick={() => {
                        setActiveFriend(f);
                        setFriendSearchTerm('');
                      }}
                      className={`h-[70px] px-3.5 flex items-center gap-3 cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50/80 border-l-4 border-blue-600' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="relative shrink-0">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm text-white shadow-sm ${
                          isGroup ? 'bg-gradient-to-tr from-blue-600 to-indigo-600' : 'bg-gradient-to-tr from-blue-500 to-sky-500'
                        }`}>
                          {isGroup ? <Users className="w-5 h-5 text-white" /> : getInitials(f.name, f.connect_id)}
                        </div>
                        {!isGroup && f.status === 'online' && (
                          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 pr-1">
                        <div className="flex items-center justify-between">
                          <b className="text-sm font-bold text-slate-900 truncate">{getDisplayName(f.name, f.connect_id)}</b>
                          <span className="text-[10px] text-blue-600 font-semibold bg-blue-50 px-1.5 py-0.5 rounded-md">
                            @{f.connect_id}
                          </span>
                        </div>
                        <span className="text-xs text-slate-500 truncate block mt-0.5">
                          {f.bio || 'Direct connection'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 2. Global Users / Connect ID match */}
            <div>
              <div className="px-3.5 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/70 flex items-center justify-between">
                <span>Global Users & Connect ID</span>
                {isSearching && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />}
              </div>

              {searchResults.length > 0 ? (
                searchResults.map((u) => {
                  const alreadyFriend = friends.find((f) => f.user_id === u.id || f.connect_id.toLowerCase() === u.connect_id.toLowerCase());
                  const isAccepted = Boolean(alreadyFriend || u.connection_status === 'accepted');
                  const isPending = !isAccepted && u.connection_status === 'pending';
                  const isSender = u.is_sender;

                  return (
                    <div
                      key={u.id}
                      className="px-3.5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors border-b border-slate-100"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-500 flex items-center justify-center font-bold text-sm text-white shrink-0 shadow-xs ring-2 ring-white">
                          {getInitials(u.name, u.connect_id)}
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm font-bold text-slate-900 truncate block">@{u.connect_id}</span>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <span className="truncate">{getDisplayName(u.name, u.connect_id)}</span>
                            {u.bio && <span className="text-slate-400 truncate max-w-[130px]">· {u.bio}</span>}
                          </div>
                        </div>
                      </div>

                      {/* Action buttons (Instagram Style) */}
                      <div className="shrink-0">
                        {isAccepted ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (alreadyFriend) {
                                setActiveFriend(alreadyFriend);
                              } else {
                                const newF: ConnectionUser = {
                                  connection_id: u.connection_id || `conn_${[user?.id, u.id].sort().join('_')}`,
                                  user_id: u.id,
                                  name: getDisplayName(u.name, u.connect_id),
                                  connect_id: u.connect_id,
                                  bio: u.bio || '',
                                  status: 'online',
                                  avatar: u.avatar || '',
                                  conversation_id: `direct_${[user?.id, u.id].sort().join('_')}`,
                                };
                                setFriends((prev) => [newF, ...prev]);
                                setActiveFriend(newF);
                              }
                              setFriendSearchTerm('');
                              setSearchQuery('');
                            }}
                            className="px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Message</span>
                          </button>
                        ) : isPending ? (
                          isSender ? (
                            <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold inline-flex items-center gap-1.5 border border-slate-200">
                              <Clock className="w-3.5 h-3.5 text-slate-500" />
                              <span>Requested</span>
                            </span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => u.connection_id && handleAcceptRequest(u.connection_id, u.name)}
                                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => u.connection_id && handleDeclineRequest(u.connection_id, u.name)}
                                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 text-xs font-medium transition-all cursor-pointer"
                              >
                                Delete
                              </button>
                            </div>
                          )
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSendConnectRequest(u.connect_id)}
                            className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs shadow-blue-500/20 transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-1.5"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>Connect</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : !isSearching && friendSearchTerm.trim().length >= 2 ? (
                <div className="p-6 text-center">
                  <p className="text-xs text-slate-500 mb-3">
                    No registered user found for &quot;<span className="font-semibold text-slate-800">@{friendSearchTerm.trim().replace(/^@/, '')}</span>&quot;
                  </p>
                  <button
                    type="button"
                    onClick={() => handleSendConnectRequest(friendSearchTerm.trim())}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 cursor-pointer transition-transform active:scale-95"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Send Connect Request to @{friendSearchTerm.trim().replace(/^@/, '')}</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          /* Normal Conversations List */
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100/80">
            {isLoadingConnections && displayedFriends.length === 0 ? (
              <SidebarChatsSkeleton />
            ) : displayedFriends.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                {chatFilter === 'groups'
                  ? 'No groups found. Click (+) above to create your group!'
                  : chatFilter === 'favourites'
                  ? 'No favourite chats yet. Open any chat and click "Add to favourites".'
                  : 'No chats available. Click (+) above to start a chat!'}
              </div>
            ) : (
              displayedFriends.map((f) => {
                const isSelected = activeFriend?.connection_id === f.connection_id;
                const isGroup = f.connection_id.startsWith('group_');
                return (
                  <div
                    key={f.connection_id}
                    onClick={() => setActiveFriend(f)}
                    className={`h-[74px] px-3.5 flex items-center gap-3 cursor-pointer transition-colors relative ${
                      isSelected ? 'bg-blue-50/80 border-l-4 border-blue-600' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-sm text-white shadow-sm ${
                        isGroup
                          ? 'bg-gradient-to-tr from-blue-600 to-indigo-600'
                          : 'bg-gradient-to-tr from-blue-500 via-indigo-500 to-sky-500'
                      }`}>
                        {isGroup ? <Users className="w-6 h-6 text-white" /> : getInitials(f.name, f.connect_id)}
                      </div>
                      {!isGroup && f.status === 'online' && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 pr-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <b className="text-sm font-bold text-slate-900 truncate">{getDisplayName(f.name, f.connect_id)}</b>
                          {!isGroup && f.connect_id && (
                            <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded shrink-0">
                              @{f.connect_id}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400 font-medium shrink-0">
                          {isGroup ? 'Group' : f.status === 'online' ? 'online' : f.last_seen ? new Date(f.last_seen).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
                        <span className="truncate max-w-[190px]">
                          {isGroup ? f.bio : f.bio || 'Direct connection'}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {customListTags[f.connection_id] && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 border border-blue-100">
                              {customListTags[f.connection_id]}
                            </span>
                          )}
                          {mutedChatIds.has(f.connection_id) && (
                            <BellOff className="w-3.5 h-3.5 text-slate-400" />
                          )}
                          {favouriteChatIds.has(f.connection_id) && (
                            <Heart className="w-3.5 h-3.5 text-blue-600 fill-blue-600 shrink-0" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Bottom Banner: Vertex Connect for Desktop */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200/80 flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 shrink-0 font-bold">
            <Laptop className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-bold text-slate-900 block">Vertex Connect Desktop</span>
            <span className="text-[10px] text-slate-500">HD calls & lightning-fast messaging</span>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE: Executive Vertex Connect Chat Pane */}
      {activeFriend ? (
        <div className="flex-1 flex flex-col bg-[#f8fafc]">
          {/* Header with Friend details, Call buttons */}
          <div className="h-[64px] px-4 border-b border-slate-200/80 flex items-center justify-between bg-white shrink-0 text-slate-800">
            <div className="flex items-center gap-3 min-w-0">
              {/* Mobile Back Button to return to Chats List */}
              <button
                type="button"
                onClick={() => setActiveFriend(null)}
                className="md:hidden p-1.5 -ml-1 rounded-full text-slate-500 hover:bg-slate-100 cursor-pointer"
                title="Back to chats"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <div className="relative shrink-0">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm text-white shadow-sm ${
                  activeFriend.connection_id.startsWith('group_')
                    ? 'bg-gradient-to-tr from-blue-600 to-indigo-600'
                    : 'bg-gradient-to-tr from-blue-500 via-indigo-500 to-sky-500'
                }`}>
                  {activeFriend.connection_id.startsWith('group_') ? (
                    <Users className="w-5 h-5 text-white" />
                  ) : (
                    getInitials(activeFriend.name, activeFriend.connect_id)
                  )}
                </div>
                {!activeFriend.connection_id.startsWith('group_') && activeFriend.status === 'online' && (
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                )}
              </div>

              <div
                className="min-w-0 cursor-pointer"
                onClick={() => setIsContactInfoOpen(true)}
                title="View contact info"
              >
                <div className="flex items-center gap-2 truncate">
                  <b className="text-sm font-bold text-slate-900 leading-tight truncate">
                    {getDisplayName(activeFriend.name, activeFriend.connect_id)}
                  </b>
                  <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full shrink-0">
                    @{activeFriend.connect_id}
                  </span>
                  {isMuted && (
                    <span title="Notifications muted" className="inline-flex items-center">
                      <BellOff className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </span>
                  )}
                  {disappearingOption !== 'off' && (
                    <span title={`Disappearing: ${disappearingOption}`} className="inline-flex items-center">
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </span>
                  )}
                </div>
                <small className="text-[11px] text-slate-500 flex items-center gap-1 truncate">
                  {isTyping ? (
                    <span className="text-blue-600 font-semibold animate-pulse">typing…</span>
                  ) : activeFriend.connection_id.startsWith('group_') ? (
                    <span>click here for group info</span>
                  ) : activeFriend.status === 'online' ? (
                    <span className="text-emerald-600 font-medium">online</span>
                  ) : (
                    <span className="truncate">{activeFriend.bio || 'last seen recently'}</span>
                  )}
                </small>
              </div>
            </div>

            {/* Quick Actions (Voice, Video, In-Chat Search & 3-Dots Menu) */}
            <div className="flex items-center gap-1 text-slate-600">
              <button
                type="button"
                onClick={() => onStartCall(getDisplayName(activeFriend.name, activeFriend.connect_id), 'video', activeFriend.user_id, activeFriend.connect_id)}
                title="Video call"
                className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-blue-50 text-slate-600 hover:text-blue-600 transition-colors cursor-pointer"
              >
                <Video className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => onStartCall(getDisplayName(activeFriend.name, activeFriend.connect_id), 'audio', activeFriend.user_id, activeFriend.connect_id)}
                title="Voice call"
                className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-blue-50 text-slate-600 hover:text-blue-600 transition-colors cursor-pointer"
              >
                <Phone className="w-4.5 h-4.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsInChatSearchOpen(!isInChatSearchOpen)}
                title="Search in chat"
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                  isInChatSearchOpen ? 'bg-blue-50 text-blue-600' : 'hover:bg-blue-50 text-slate-600 hover:text-blue-600'
                }`}
              >
                <Search className="w-4.5 h-4.5" />
              </button>

              {/* Active Chat 3-Dots Menu Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsChatMenuOpen(!isChatMenuOpen);
                  }}
                  title="Menu"
                  className="vertex-menu-btn w-9 h-9 rounded-xl flex items-center justify-center hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                >
                  <MoreVertical className="w-5 h-5" />
                </button>

                {/* Chat 3-Dots Dropdown Menu - EXACT 16 ITEMS WITH SMOOTH SCROLLING */}
                {isChatMenuOpen && (
                  <div className="vertex-menu-container absolute right-0 top-11 w-64 max-h-[min(520px,calc(100vh-80px))] overflow-y-auto overscroll-contain rounded-2xl bg-white shadow-2xl z-50 py-2 border border-slate-200 animate-in fade-in zoom-in-95 duration-100 text-slate-700 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent]">
                    {/* 1. Contact info */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsChatMenuOpen(false);
                        setIsContactInfoOpen(true);
                      }}
                      className="w-full px-4 py-2.5 text-xs font-medium flex items-center gap-3.5 hover:bg-blue-50 hover:text-blue-600 transition-colors text-left cursor-pointer"
                    >
                      <Info className="w-4 h-4 text-blue-600" />
                      <span>{activeFriend.connection_id.startsWith('group_') ? 'Group info' : 'Contact info'}</span>
                    </button>

                    {/* 2. Search */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsChatMenuOpen(false);
                        setIsInChatSearchOpen(true);
                      }}
                      className="w-full px-4 py-2.5 text-xs font-medium flex items-center gap-3.5 hover:bg-blue-50 hover:text-blue-600 transition-colors text-left cursor-pointer"
                    >
                      <Search className="w-4 h-4 text-blue-600" />
                      <span>Search</span>
                    </button>

                    {/* 3. Select messages */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsChatMenuOpen(false);
                        setIsSelectMode(true);
                        setSelectedMsgIds(new Set());
                      }}
                      className="w-full px-4 py-2.5 text-xs font-medium flex items-center gap-3.5 hover:bg-slate-100 hover:text-slate-900 transition-colors text-left cursor-pointer"
                    >
                      <CheckSquare className="w-4 h-4 text-slate-500" />
                      <span>Select messages</span>
                    </button>

                    {/* 4. Mute notifications */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsChatMenuOpen(false);
                        if (mutedChatIds.has(activeFriend.connection_id)) {
                          setMutedChatIds(prev => {
                            const next = new Set(prev);
                            next.delete(activeFriend.connection_id);
                            return next;
                          });
                          onShowToast('Notifications unmuted');
                        } else {
                          setIsMuteModalOpen(true);
                        }
                      }}
                      className="w-full px-4 py-2.5 text-xs font-medium flex items-center justify-between hover:bg-slate-100 hover:text-slate-900 transition-colors text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3.5">
                        <BellOff className="w-4 h-4 text-slate-500" />
                        <span>{mutedChatIds.has(activeFriend.connection_id) ? 'Unmute notifications' : 'Mute notifications'}</span>
                      </div>
                      {!mutedChatIds.has(activeFriend.connection_id) && <ChevronRight className="w-4 h-4 text-slate-400" />}
                    </button>

                    {/* 5. Disappearing messages */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsChatMenuOpen(false);
                        setIsDisappearingModalOpen(true);
                      }}
                      className="w-full px-4 py-2.5 text-xs font-medium flex items-center gap-3.5 hover:bg-slate-100 hover:text-slate-900 transition-colors text-left cursor-pointer"
                    >
                      <Clock className="w-4 h-4 text-slate-500" />
                      <span>Disappearing messages</span>
                    </button>

                    {/* 6. Chat theme */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsChatMenuOpen(false);
                        setIsWallpaperModalOpen(true);
                      }}
                      className="w-full px-4 py-2.5 text-xs font-medium flex items-center gap-3.5 hover:bg-slate-100 hover:text-slate-900 transition-colors text-left cursor-pointer"
                    >
                      <Palette className="w-4 h-4 text-slate-500" />
                      <span>Chat theme</span>
                    </button>

                    {/* 7. Add to favourites */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsChatMenuOpen(false);
                        toggleFavouriteChat(activeFriend.connection_id);
                      }}
                      className="w-full px-4 py-2.5 text-xs font-medium flex items-center gap-3.5 hover:bg-slate-100 hover:text-slate-900 transition-colors text-left cursor-pointer"
                    >
                      <Heart className={`w-4 h-4 ${favouriteChatIds.has(activeFriend.connection_id) ? 'text-blue-600 fill-blue-600' : 'text-slate-500'}`} />
                      <span>{favouriteChatIds.has(activeFriend.connection_id) ? 'Remove from favourites' : 'Add to favourites'}</span>
                    </button>

                    {/* 8. Add to list */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsChatMenuOpen(false);
                        setIsAddToListModalOpen(true);
                      }}
                      className="w-full px-4 py-2.5 text-xs font-medium flex items-center justify-between hover:bg-slate-100 hover:text-slate-900 transition-colors text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-3.5">
                        <ListFilter className="w-4 h-4 text-slate-500" />
                        <span>Add to list</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </button>

                    {/* 9. Export chat */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsChatMenuOpen(false);
                        handleExportChat();
                      }}
                      className="w-full px-4 py-2.5 text-xs font-medium flex items-center gap-3.5 hover:bg-slate-100 hover:text-slate-900 transition-colors text-left cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-slate-500" />
                      <span>Export chat</span>
                    </button>

                    {/* 10. Close chat */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsChatMenuOpen(false);
                        setActiveFriend(null);
                      }}
                      className="w-full px-4 py-2.5 text-xs font-medium flex items-center gap-3.5 hover:bg-slate-100 hover:text-slate-900 transition-colors text-left cursor-pointer"
                    >
                      <XCircle className="w-4 h-4 text-slate-500" />
                      <span>Close chat</span>
                    </button>

                    {/* Divider 1 */}
                    <div className="h-[1px] bg-slate-100 my-1" />

                    {/* 11. Send call link */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsChatMenuOpen(false);
                        handleSendCallLink();
                      }}
                      className="w-full px-4 py-2.5 text-xs font-medium flex items-center gap-3.5 hover:bg-slate-100 hover:text-slate-900 transition-colors text-left cursor-pointer"
                    >
                      <Link2 className="w-4 h-4 text-slate-500" />
                      <span>Send call link</span>
                    </button>

                    {/* 12. New group call */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsChatMenuOpen(false);
                        onStartCall(getDisplayName(activeFriend.name, activeFriend.connect_id), 'video', activeFriend.user_id, activeFriend.connect_id);
                      }}
                      className="w-full px-4 py-2.5 text-xs font-medium flex items-center gap-3.5 hover:bg-slate-100 hover:text-slate-900 transition-colors text-left cursor-pointer"
                    >
                      <Users className="w-4 h-4 text-slate-500" />
                      <span>New group call</span>
                    </button>

                    {/* Divider 2 */}
                    <div className="h-[1px] bg-slate-100 my-1" />

                    {/* 13. Report */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsChatMenuOpen(false);
                        setIsReportModalOpen(true);
                      }}
                      className="w-full px-4 py-2.5 text-xs font-medium flex items-center gap-3.5 hover:bg-slate-100 hover:text-slate-900 transition-colors text-left cursor-pointer"
                    >
                      <ThumbsDown className="w-4 h-4 text-slate-500" />
                      <span>Report</span>
                    </button>

                    {/* 14. Block */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsChatMenuOpen(false);
                        setIsBlockModalOpen(true);
                      }}
                      className="w-full px-4 py-2.5 text-xs font-medium flex items-center gap-3.5 hover:bg-slate-100 hover:text-slate-900 transition-colors text-left cursor-pointer"
                    >
                      <Ban className="w-4 h-4 text-slate-500" />
                      <span>{isBlocked ? 'Unblock' : 'Block'}</span>
                    </button>

                    {/* 15. Clear chat */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsChatMenuOpen(false);
                        setIsClearChatModalOpen(true);
                      }}
                      className="w-full px-4 py-2.5 text-xs font-medium flex items-center gap-3.5 hover:bg-slate-100 hover:text-slate-900 transition-colors text-left cursor-pointer"
                    >
                      <MinusCircle className="w-4 h-4 text-slate-500" />
                      <span>Clear chat</span>
                    </button>

                    {/* 16. Delete chat */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsChatMenuOpen(false);
                        setIsDeleteChatModalOpen(true);
                      }}
                      className="w-full px-4 py-2.5 text-xs font-medium flex items-center gap-3.5 hover:bg-rose-50 text-rose-600 transition-colors text-left cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4 text-rose-500" />
                      <span>Delete chat</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* In-Chat Search Bar */}
          {isInChatSearchOpen && (
            <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex items-center gap-2.5 animate-in slide-in-from-top-2 duration-150">
              <Search className="w-4 h-4 text-blue-600 shrink-0" />
              <input
                type="text"
                value={inChatSearchQuery}
                onChange={(e) => setInChatSearchQuery(e.target.value)}
                placeholder="Search messages in this chat..."
                autoFocus
                className="flex-1 bg-transparent border-none text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
              />
              {inChatSearchQuery && (
                <span className="text-[10px] text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded-full">
                  {filteredMessages.length} {filteredMessages.length === 1 ? 'match' : 'matches'}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setIsInChatSearchOpen(false);
                  setInChatSearchQuery('');
                }}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* WhatsApp Message Selection Action Bar */}
          {isSelectMode && (
            <div className="h-14 px-4 bg-blue-600 text-white flex items-center justify-between shadow-md shrink-0 z-30 animate-in slide-in-from-top-2 duration-150">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsSelectMode(false);
                    setSelectedMsgIds(new Set());
                  }}
                  className="p-1.5 rounded-xl hover:bg-white/20 transition-colors cursor-pointer"
                  title="Cancel selection"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
                <span className="text-sm font-bold tracking-tight">
                  {selectedMsgIds.size} selected
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={selectedMsgIds.size === 0}
                  onClick={() => {
                    selectedMsgIds.forEach(id => handleToggleStar(id));
                    onShowToast(`${selectedMsgIds.size} messages starred ⭐`);
                    setIsSelectMode(false);
                    setSelectedMsgIds(new Set());
                  }}
                  className="p-2 rounded-xl hover:bg-white/20 transition-colors disabled:opacity-40 cursor-pointer"
                  title="Star selected"
                >
                  <Star className="w-4.5 h-4.5" />
                </button>
                <button
                  type="button"
                  disabled={selectedMsgIds.size === 0}
                  onClick={() => {
                    const texts = messages.filter(m => selectedMsgIds.has(m.id)).map(m => m.content).filter(Boolean);
                    navigator.clipboard.writeText(texts.join('\n'));
                    onShowToast(`${selectedMsgIds.size} messages copied!`);
                    setIsSelectMode(false);
                    setSelectedMsgIds(new Set());
                  }}
                  className="p-2 rounded-xl hover:bg-white/20 transition-colors disabled:opacity-40 cursor-pointer"
                  title="Copy selected"
                >
                  <Copy className="w-4.5 h-4.5" />
                </button>
                <button
                  type="button"
                  disabled={selectedMsgIds.size === 0}
                  onClick={() => {
                    setMessages(prev => prev.filter(m => !selectedMsgIds.has(m.id)));
                    onShowToast(`${selectedMsgIds.size} messages deleted`);
                    setIsSelectMode(false);
                    setSelectedMsgIds(new Set());
                  }}
                  className="p-2 rounded-xl hover:bg-rose-500 transition-colors disabled:opacity-40 cursor-pointer"
                  title="Delete selected"
                >
                  <Trash2 className="w-4.5 h-4.5 text-rose-200 hover:text-white" />
                </button>
              </div>
            </div>
          )}

          {/* Messages Thread */}
          <div className="flex-1 relative flex flex-col min-h-0 overflow-hidden">
            <div
              ref={chatScrollContainerRef}
              onScroll={handleScroll}
              className={`flex-1 overflow-y-auto p-4 md:p-6 space-y-3.5 transition-colors ${WALLPAPER_CLASSES[chatWallpaper] || ''}`}
            >
            <div className="text-center">
              <span className="text-[10px] uppercase font-bold text-slate-500 bg-white/90 backdrop-blur-sm px-3.5 py-1 rounded-full border border-slate-200 shadow-xs">
                End-to-End Encrypted Channel • @{activeFriend.connect_id}
              </span>
            </div>

            {isLoadingMessages && filteredMessages.length === 0 ? (
              <ChatMessagesSkeleton />
            ) : filteredMessages.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center text-slate-400">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-2">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <p className="text-xs font-bold text-slate-800">
                  {inChatSearchQuery ? 'No matching messages found' : `Connected with @${activeFriend.connect_id}`}
                </p>
                <span className="text-[11px] text-slate-500 mt-0.5">
                  {inChatSearchQuery ? 'Try a different search term.' : 'Send a message, audio voice note, or files to collaborate!'}
                </span>
              </div>
            ) : (
              filteredMessages.map((m) => {
                const isMe = m.sender_id === user?.id;
                const isImage = m.file_type?.startsWith('image/') || (m.file_name && /\.(png|jpe?g|gif|webp)$/i.test(m.file_name));
                const isAudio = m.file_type?.startsWith('audio/') || (m.file_name && /\.(webm|mp3|wav|ogg)$/i.test(m.file_name)) || m.content === '🎤 Voice note';
                const isStarred = starredMessageIds.has(m.id);
                const isSelected = selectedMsgIds.has(m.id);

                return (
                  <div
                    key={m.id}
                    className={`group relative flex items-center gap-3 w-full ${isMe ? 'justify-end' : 'justify-start'}`}
                  >
                    {isSelectMode && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMsgIds(prev => {
                            const next = new Set(prev);
                            if (next.has(m.id)) next.delete(m.id);
                            else next.add(m.id);
                            return next;
                          });
                        }}
                        className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'border-slate-300 bg-white hover:border-blue-500'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </button>
                    )}

                    <div
                      className={`relative flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[85%] md:max-w-[70%]`}
                      onClick={() => {
                        if (isSelectMode) {
                          setSelectedMsgIds(prev => {
                            const next = new Set(prev);
                            if (next.has(m.id)) next.delete(m.id);
                            else next.add(m.id);
                            return next;
                          });
                        }
                      }}
                    >
                    {/* Floating Reaction & Action Bar */}
                    <div
                      className={`opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 flex items-center gap-1 bg-white/95 backdrop-blur-md px-2 py-0.5 rounded-full border border-slate-200 shadow-lg z-20 ${
                        isMe ? 'right-0' : 'left-0'
                      }`}
                    >
                      {['❤️', '👍', '😂', '🔥', '👏', '🙏'].map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => handleReactToMessage(m.id, emoji)}
                          className="hover:scale-125 transition-transform text-xs p-1 cursor-pointer"
                        >
                          {emoji}
                        </button>
                      ))}
                      <div className="w-[1px] h-3 bg-slate-200 mx-0.5" />
                      <button
                        type="button"
                        onClick={() => handleToggleStar(m.id)}
                        className={`hover:scale-110 transition-transform p-1 cursor-pointer ${isStarred ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'}`}
                        title={isStarred ? 'Unstar message' : 'Star message'}
                      >
                        <Star className={`w-3.5 h-3.5 ${isStarred ? 'fill-amber-500' : ''}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(m.content || m.file_name || '')}
                        className="hover:scale-110 transition-transform text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                        title="Copy message"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setReplyingTo({ id: m.id, sender_name: m.sender_name, content: m.content || m.file_name || 'Attachment' })}
                        className="hover:scale-110 transition-transform text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                        title="Reply"
                      >
                        <Reply className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteMessage(m.id)}
                        className="hover:scale-110 transition-transform text-slate-400 hover:text-rose-500 p-1 cursor-pointer"
                        title="Delete for me"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div
                      className={`px-3.5 py-2 rounded-2xl shadow-xs text-xs relative max-w-full ${
                        isMe
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-xs shadow-blue-500/10'
                          : 'bg-white text-slate-800 border border-slate-200/90 rounded-tl-xs shadow-xs'
                      }`}
                    >
                      {/* Quoted Reply Block */}
                      {m.reply_to_snippet && (
                        <div
                          className={`mb-2 p-2 rounded-xl text-[11px] border-l-3 ${
                            isMe
                              ? 'bg-blue-700/50 border-white text-blue-100'
                              : 'bg-slate-100 border-blue-600 text-slate-700'
                          }`}
                        >
                          <span className="font-bold block truncate opacity-90">{m.reply_to_snippet}</span>
                        </div>
                      )}

                      {/* Voice Audio Note */}
                      {isAudio && m.file_url ? (
                        <VoiceNotePlayer audioUrl={m.file_url} duration={m.file_size} isMe={isMe} />
                      ) : sanitizeMediaUrl(m.file_url) ? (
                        /* Attached Image or File Preview */
                        <div className="mb-2">
                          {isImage ? (
                            <div className="rounded-xl overflow-hidden border border-slate-200 mb-1 max-w-sm">
                              <img
                                src={sanitizeMediaUrl(m.file_url)}
                                alt={m.file_name || 'Attached Image'}
                                className="w-full max-h-60 object-cover"
                                loading="lazy"
                              />
                            </div>
                          ) : (
                            <div className="p-2.5 rounded-xl bg-slate-100 flex items-center justify-between gap-3 mb-1 text-slate-800">
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-5 h-5 shrink-0 text-blue-600" />
                                <div className="min-w-0">
                                  <span className="font-bold text-xs block truncate max-w-[200px]">
                                    {m.file_name}
                                  </span>
                                  <span className="text-[10px] text-slate-500">{m.file_size}</span>
                                </div>
                              </div>
                              <a
                                href={sanitizeMediaUrl(m.file_url)}
                                download={m.file_name}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-blue-600 transition-colors shadow-xs"
                                title="Download"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            </div>
                          )}
                        </div>
                      ) : null}

                      {/* Regular Text & Timestamp straight horizontally inline */}
                      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-0.5 leading-relaxed">
                        {m.content && (!m.file_url || (!m.content.startsWith('Shared file:') && m.content !== '🎤 Voice note')) ? (
                          <span className="break-words select-text font-normal">{m.content}</span>
                        ) : (
                          <span />
                        )}

                        {/* Timestamp, Star & Blue Ticks inline inside the bubble */}
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] shrink-0 font-medium select-none ml-auto pl-1.5 pb-0.5 ${
                            isMe ? 'text-blue-100/90' : 'text-slate-400'
                          }`}
                        >
                          {isStarred && (
                            <span title="Starred message" className="inline-flex items-center">
                              <Star className="w-3 h-3 text-amber-300 fill-amber-300 shrink-0" />
                            </span>
                          )}
                          <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {isMe && (
                            m.is_read ? (
                              <span title="Read">
                                <CheckCheck className="w-3.5 h-3.5 text-white" />
                              </span>
                            ) : (activeFriend?.status === 'online' || activeFriend?.status === 'in_call' || m.status === 'delivered') ? (
                              <span title="Delivered">
                                <CheckCheck className="w-3.5 h-3.5 text-blue-200" />
                              </span>
                            ) : (
                              <span title="Sent">
                                <Check className="w-3.5 h-3.5 text-blue-200" />
                              </span>
                            )
                          )}
                        </span>
                      </div>

                      {/* Emoji Reaction Badges (Floating on bottom border) */}
                      {m.reactions && Object.keys(m.reactions).length > 0 && (
                        <div className={`absolute -bottom-2.5 ${isMe ? 'right-2' : 'left-2'} flex flex-wrap gap-1 z-10`}>
                          {Object.entries(m.reactions).map(([emoji, users]) => {
                            const hasReacted = users.includes(user?.name || '');
                            return (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => handleReactToMessage(m.id, emoji)}
                                title={users.join(', ')}
                                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border transition-all flex items-center gap-0.5 cursor-pointer shadow-xs ${
                                  hasReacted
                                    ? 'bg-blue-50 border-blue-200 text-blue-600'
                                    : 'bg-white border-slate-200 text-slate-600'
                                }`}
                              >
                                <span>{emoji}</span>
                                <span>{users.length}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
              })
            )}
            {/* Animated In-Stream Typing Bubble */}
            {isTyping && (
              <div className="flex items-center gap-2.5 p-2 px-3.5 max-w-[130px] rounded-2xl bg-white border border-slate-200 shadow-xs animate-in fade-in duration-200 mb-2">
                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-600 shrink-0">
                  {getInitials(activeFriend.name, activeFriend.connect_id)}
                </div>
                <div className="flex items-center gap-1 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-bounce" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* WhatsApp-Style Floating Scroll-To-Bottom Button */}
          {showScrollBottomBtn && (
            <button
              type="button"
              onClick={handleScrollToBottom}
              title="Scroll to bottom"
              className="absolute right-5 bottom-4 w-9 h-9 rounded-full bg-white text-slate-700 hover:text-blue-600 shadow-md hover:shadow-lg border border-slate-200/90 flex items-center justify-center transition-all duration-200 hover:scale-110 z-20 cursor-pointer animate-in fade-in zoom-in-90"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          )}
        </div>

          {/* Replying Banner (if user clicked reply on any message) */}
          {replyingTo && (
            <div className="px-5 py-2 bg-blue-50 border-t border-blue-100 flex items-center justify-between text-xs text-blue-900 animate-in fade-in duration-150">
              <div className="flex items-center gap-2 truncate">
                <Reply className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="truncate">
                  Replying to <b className="text-blue-700">{replyingTo.sender_name}</b>: {replyingTo.content}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="w-6 h-6 rounded-full hover:bg-blue-100 flex items-center justify-center shrink-0 cursor-pointer text-blue-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Message Input Box with Voice Note Recording & Menus */}
          <div className="px-4 py-3 border-t border-slate-200/80 bg-white relative shrink-0">
            {isBlocked ? (
              <div className="p-3 text-center text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-center gap-2">
                <span>You blocked this contact.</span>
                <button
                  type="button"
                  onClick={toggleBlockActiveUser}
                  className="font-bold underline text-rose-700 hover:text-rose-900 cursor-pointer ml-1"
                >
                  Unblock
                </button>
              </div>
            ) : isRecordingVoice ? (
              /* Live Voice Recording UI */
              <div className="h-11 px-4 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between gap-4 animate-in fade-in duration-200">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                  <span className="text-xs font-semibold text-rose-600 flex items-center gap-1.5">
                    Recording Audio… {Math.floor(voiceRecordSeconds / 60)}:{voiceRecordSeconds % 60 < 10 ? '0' : ''}{voiceRecordSeconds % 60}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCancelVoiceRecord}
                    title="Discard voice note"
                    className="px-3 py-1.5 rounded-lg bg-white border border-rose-200 hover:bg-rose-100 text-rose-600 font-semibold text-xs flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Cancel</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleStopAndSendVoiceRecord}
                    title="Send voice note"
                    className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-blue-500/20"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Normal Input Box */
              <form onSubmit={handleSendMessage} className="flex items-center gap-2 relative">
                {/* Emoji Picker Popover */}
                {isEmojiPickerOpen && (
                  <div className="emoji-picker-container absolute bottom-14 left-0 w-72 bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="text-[11px] font-bold text-slate-500 mb-2 px-1">Emojis</div>
                    <div className="grid grid-cols-7 gap-1.5 max-h-48 overflow-y-auto p-1">
                      {['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😚','😋','😛','😜','🤪','😎','🤩','🥳','😏','😒','😞','😔','😟','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','🤗','🤔','🤫','🤥','😶','😐','😑','😬','🙄','🥱','😴','😷','🤒','🤑','🤠','😈','👿','💩','👻','💀','👽','🤖','🎃','👏','👍','👎','👊','✊','🤛','🤜','🤞','✌️','🤟','🤘','👌','🤌','👈','👉','👆','👇','☝️','✋','🤚','🖐','👋','🤝','🙏','💪','🦾','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💓','💗','💖','💘','💝','🔥','✨','🎉','🚀','💯','⭐','🌟','⚡','☀️','☕','🍔','🍕','🎉'].map(emoji => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => handleSelectEmoji(emoji)}
                          className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-base hover:scale-125 transition-transform cursor-pointer"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Circular Attachment Popover */}
                {isAttachmentMenuOpen && (
                  <div className="attachment-menu-container absolute bottom-14 left-8 bg-white border border-slate-200 rounded-2xl shadow-2xl p-3 z-50 flex items-center gap-3 animate-in fade-in zoom-in-95 duration-150">
                    <button
                      type="button"
                      onClick={() => handleSelectAttachmentType('image')}
                      className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-slate-50 transition-colors group cursor-pointer"
                      title="Photos & Videos"
                    >
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
                        <ImageIcon className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] text-slate-700 font-semibold">Photos</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectAttachmentType('doc')}
                      className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-slate-50 transition-colors group cursor-pointer"
                      title="Documents & Files"
                    >
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
                        <FileText className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] text-slate-700 font-semibold">Document</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectAttachmentType('audio')}
                      className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-slate-50 transition-colors group cursor-pointer"
                      title="Audio Note or File"
                    >
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
                        <Music className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] text-slate-700 font-semibold">Audio</span>
                    </button>
                  </div>
                )}

                {/* Attachment Paperclip Trigger */}
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAttachmentMenuOpen(!isAttachmentMenuOpen);
                    setIsEmojiPickerOpen(false);
                  }}
                  title="Attach"
                  className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                </button>

                {/* Emoji Picker Trigger */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEmojiPickerOpen(!isEmojiPickerOpen);
                    setIsAttachmentMenuOpen(false);
                  }}
                  title="Emoji"
                  className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors cursor-pointer shrink-0"
                >
                  <Smile className="w-5 h-5" />
                </button>

                <input
                  type="text"
                  value={inputMessage}
                  onChange={handleInputChange}
                  placeholder="Type a message..."
                  className="flex-1 h-11 px-4 rounded-2xl bg-slate-100/90 hover:bg-slate-100 focus:bg-white border border-slate-200/70 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-xs text-slate-900 placeholder-slate-400 focus:outline-none shadow-xs"
                />

                {inputMessage.trim() ? (
                  <button
                    type="submit"
                    className="w-11 h-11 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/25 flex items-center justify-center transition-transform active:scale-95 cursor-pointer shrink-0"
                    title="Send"
                  >
                    <Send className="w-4.5 h-4.5 text-white" />
                  </button>
                ) : (
                  /* Mic Recording Trigger */
                  <button
                    type="button"
                    onClick={handleStartVoiceRecord}
                    title="Voice note"
                    className="w-11 h-11 rounded-2xl bg-blue-50 hover:bg-blue-100 text-blue-600 flex items-center justify-center transition-transform active:scale-95 cursor-pointer shrink-0 shadow-xs"
                  >
                    <Mic className="w-5 h-5" />
                  </button>
                )}
              </form>
            )}
          </div>
        </div>
      ) : isLoadingConnections ? (
        <FullChatPaneSkeleton />
      ) : (
        /* Empty Right Pane when no friend is selected (Laptop/Desktop only) - Executive Vertex Connect Screen */
        <div className="hidden md:flex flex-1 flex-col items-center justify-center text-center p-8 bg-slate-50 text-slate-500 select-none border-b-[6px] border-blue-600">
          <div className="w-20 h-20 rounded-3xl bg-blue-100/80 flex items-center justify-center mb-6 shadow-sm text-blue-600">
            <Laptop className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2 tracking-tight">
            Vertex Connect for Desktop
          </h2>
          <p className="text-xs text-slate-500 max-w-md leading-relaxed mb-6">
            Make HD voice & video calls, share files, and get instant real-time team collaboration on all your devices.
          </p>
          <button
            type="button"
            onClick={() => onShowToast('You are using Vertex Connect Web v2.4')}
            className="px-6 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-transform hover:scale-105 shadow-md shadow-blue-500/25 cursor-pointer"
          >
            Launch Vertex Desktop Experience
          </button>
          <div className="mt-14 flex items-center gap-2 text-xs text-slate-400">
            <Lock className="w-3.5 h-3.5" />
            <span>Your personal messages are 256-bit end-to-end encrypted</span>
          </div>
        </div>
      )}

      {/* User Details Preview Modal */}
      {selectedUserPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-3xl p-6 shadow-2xl bg-white border border-slate-200 text-center relative animate-in zoom-in-95 duration-200 text-slate-800">
            <button
              type="button"
              onClick={() => setSelectedUserPreview(null)}
              className="absolute right-4 top-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-2xl mx-auto shadow-lg mb-3">
              {getInitials(selectedUserPreview.name, selectedUserPreview.connect_id)}
            </div>

            <h3 className="text-lg font-bold text-slate-900 leading-snug">
              {getDisplayName(selectedUserPreview.name, selectedUserPreview.connect_id)}
            </h3>
            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full inline-block mt-0.5 mb-2">
              @{selectedUserPreview.connect_id}
            </span>

            <p className="text-xs text-slate-600 my-3 leading-relaxed">
              {selectedUserPreview.bio || 'Vertex Connect teammate.'}
            </p>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-center gap-2">
              {selectedUserPreview.connection_status === 'accepted' ? (
                <button
                  type="button"
                  onClick={() => {
                    const found = friends.find((f) => f.user_id === selectedUserPreview.id);
                    if (found) setActiveFriend(found);
                    setSelectedUserPreview(null);
                  }}
                  className="w-full py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20 cursor-pointer"
                >
                  Open Chat
                </button>
              ) : selectedUserPreview.connection_status === 'pending' ? (
                <span className="text-xs font-bold text-amber-600 py-2">
                  Request Pending
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    handleSendConnectRequest(selectedUserPreview.connect_id);
                    setSelectedUserPreview(null);
                  }}
                  className="w-full py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Send Connection Request</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Contact Info Slide-Over Drawer */}
      {isContactInfoOpen && activeFriend && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm h-full bg-white text-slate-800 flex flex-col border-l border-slate-200 shadow-2xl animate-in slide-in-from-right duration-250 overflow-y-auto">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 flex items-center gap-3 sticky top-0 bg-white z-10 text-slate-900">
              <button
                type="button"
                onClick={() => setIsContactInfoOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <h3 className="font-bold text-sm">Contact info</h3>
            </div>

            {/* Profile Overview */}
            <div className="p-6 flex flex-col items-center text-center border-b border-slate-100 bg-slate-50">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-3xl shadow-xl mb-3">
                {getInitials(activeFriend.name, activeFriend.connect_id)}
              </div>
              <h2 className="text-lg font-bold text-slate-900">{getDisplayName(activeFriend.name, activeFriend.connect_id)}</h2>
              <span className="text-xs text-blue-600 font-semibold mt-0.5 bg-blue-50 px-2.5 py-0.5 rounded-full">@{activeFriend.connect_id}</span>
              <span className="text-[11px] text-slate-500 mt-1 capitalize">{activeFriend.status}</span>
            </div>

            {/* About / Bio */}
            <div className="p-4 border-b border-slate-100">
              <span className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">About</span>
              <p className="text-xs text-slate-700 mt-1 leading-relaxed">
                {activeFriend.bio || 'Vertex Connect member.'}
              </p>
            </div>

            {/* Media, Links and Docs Shortcut */}
            <div
              onClick={() => {
                setIsContactInfoOpen(false);
                setIsMediaModalOpen(true);
              }}
              className="p-4 border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <ImageIcon className="w-5 h-5 text-blue-600" />
                <div>
                  <div className="text-xs font-semibold text-slate-900">Media, links and docs</div>
                  <div className="text-[10px] text-slate-400">{sharedMediaFiles.length} items shared</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </div>

            {/* Starred Messages Shortcut */}
            <div
              onClick={() => {
                setIsContactInfoOpen(false);
                setIsStarredMessagesModalOpen(true);
              }}
              className="p-4 border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                <div>
                  <div className="text-xs font-semibold text-slate-900">Starred messages</div>
                  <div className="text-[10px] text-slate-400">{starredMessagesList.length} starred</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </div>

            {/* Privacy & Settings */}
            <div className="p-4 border-b border-slate-100 space-y-4">
              <div
                onClick={() => setIsMuteModalOpen(true)}
                className="flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <BellOff className="w-5 h-5 text-slate-500" />
                  <span className="text-xs font-medium text-slate-800">Mute notifications</span>
                </div>
                <span className="text-xs text-blue-600 font-semibold">{isMuted ? 'Muted' : 'Off'}</span>
              </div>

              <div
                onClick={() => setIsDisappearingModalOpen(true)}
                className="flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-slate-500" />
                  <span className="text-xs font-medium text-slate-800">Disappearing messages</span>
                </div>
                <span className="text-xs text-blue-600 font-semibold">{disappearingOption !== 'off' ? disappearingOption : 'Off'}</span>
              </div>
            </div>

            {/* Encryption Notice */}
            <div className="p-4 border-b border-slate-100 flex items-start gap-3">
              <Shield className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-slate-900">256-bit Encryption</div>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                  Messages and calls are end-to-end encrypted. No one outside of this chat, not even Vertex Connect, can read or listen to them.
                </p>
              </div>
            </div>

            {/* Block Action */}
            <div className="p-4 mt-auto">
              <button
                type="button"
                onClick={toggleBlockActiveUser}
                className="w-full py-2.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Ban className="w-4 h-4" />
                <span>{isBlocked ? `Unblock @${activeFriend.connect_id}` : `Block @${activeFriend.connect_id}`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Media, Links and Docs */}
      {isMediaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-2xl p-5 text-slate-800 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-sm text-slate-900">Media, links, and docs</h3>
              <button
                type="button"
                onClick={() => setIsMediaModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 py-3 border-b border-slate-100 text-xs">
              {(['media', 'docs', 'audio'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setMediaTab(tab)}
                  className={`px-3 py-1.5 rounded-xl font-semibold capitalize cursor-pointer transition-colors ${
                    mediaTab === tab ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto py-3">
              {mediaTab === 'media' && (
                sharedMediaFiles.filter(m => m.file_type?.startsWith('image/') || (m.file_name && /\.(png|jpe?g|gif|webp)$/i.test(m.file_name))).length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-xs">No media shared yet</div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {sharedMediaFiles
                      .filter(m => m.file_type?.startsWith('image/') || (m.file_name && /\.(png|jpe?g|gif|webp)$/i.test(m.file_name)))
                      .map(m => (
                        <a
                          key={m.id}
                          href={sanitizeMediaUrl(m.file_url)}
                          target="_blank"
                          rel="noreferrer"
                          className="aspect-square rounded-xl overflow-hidden border border-slate-200 hover:opacity-80 transition-opacity bg-slate-100"
                        >
                          <img src={sanitizeMediaUrl(m.file_url)} alt={m.file_name || 'Media'} className="w-full h-full object-cover" loading="lazy" />
                        </a>
                      ))}
                  </div>
                )
              )}

              {mediaTab === 'docs' && (
                sharedMediaFiles.filter(m => !m.file_type?.startsWith('image/') && !m.file_type?.startsWith('audio/') && !m.content?.startsWith('🎤')).length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-xs">No documents shared yet</div>
                ) : (
                  <div className="space-y-2">
                    {sharedMediaFiles
                      .filter(m => !m.file_type?.startsWith('image/') && !m.file_type?.startsWith('audio/') && !m.content?.startsWith('🎤'))
                      .map(m => (
                        <div key={m.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                            <div className="min-w-0">
                              <span className="text-xs font-semibold block truncate text-slate-900">{m.file_name}</span>
                              <span className="text-[10px] text-slate-400">{m.file_size || 'Document'}</span>
                            </div>
                          </div>
                          <a
                            href={sanitizeMediaUrl(m.file_url)}
                            download={m.file_name}
                            className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-blue-600 transition-colors shadow-xs"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        </div>
                      ))}
                  </div>
                )
              )}

              {mediaTab === 'audio' && (
                sharedMediaFiles.filter(m => m.file_type?.startsWith('audio/') || m.content === '🎤 Voice note').length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-xs">No voice notes shared yet</div>
                ) : (
                  <div className="space-y-2">
                    {sharedMediaFiles
                      .filter(m => m.file_type?.startsWith('audio/') || m.content === '🎤 Voice note')
                      .map(m => (
                        <div key={m.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <Music className="w-5 h-5 text-amber-500" />
                            <div>
                              <span className="text-xs font-semibold block text-slate-900">Voice note</span>
                              <span className="text-[10px] text-slate-400">{new Date(m.created_at).toLocaleString()}</span>
                            </div>
                          </div>
                          {sanitizeMediaUrl(m.file_url) && <audio src={sanitizeMediaUrl(m.file_url)} preload="none" controls className="h-8 max-w-[200px]" />}
                        </div>
                      ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Mute Notifications Dialog */}
      {isMuteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 text-slate-800 space-y-4">
            <h3 className="font-bold text-sm text-slate-900">Mute notifications</h3>
            <p className="text-xs text-slate-500">
              Other participants will not see that you muted this chat. You will still receive notifications if you are mentioned.
            </p>
            <div className="space-y-2 text-xs">
              {['8 hours', '1 week', 'Always'].map((option, idx) => (
                <label key={option} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 cursor-pointer">
                  <input type="radio" name="muteDuration" defaultChecked={idx === 2} className="accent-blue-600" />
                  <span className="font-medium text-slate-700">{option}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsMuteModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (activeFriend) {
                    setMutedChatIds(prev => {
                      const next = new Set(prev);
                      next.add(activeFriend.connection_id);
                      return next;
                    });
                  }
                  setIsMuted(true);
                  setIsMuteModalOpen(false);
                  onShowToast('Notifications muted');
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 cursor-pointer"
              >
                Mute
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Add to Custom List */}
      {isAddToListModalOpen && activeFriend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 text-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <ListFilter className="w-4 h-4 text-blue-600" />
                <span>Add to custom list</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAddToListModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Organize your chats with tags. Select a custom list for <b>{getDisplayName(activeFriend.name, activeFriend.connect_id)}</b>:
            </p>

            <div className="space-y-2">
              {['Work', 'Favourites', 'Family', 'Projects', 'VIP'].map((listName) => {
                const isCurrent = customListTags[activeFriend.connection_id] === listName;
                return (
                  <button
                    key={listName}
                    type="button"
                    onClick={() => {
                      setCustomListTags(prev => {
                        const updated = { ...prev, [activeFriend.connection_id]: listName };
                        try {
                          localStorage.setItem('vertexCustomListTags', JSON.stringify(updated));
                        } catch {}
                        return updated;
                      });
                      setIsAddToListModalOpen(false);
                      onShowToast(`Chat added to "${listName}" list!`);
                    }}
                    className={`w-full px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between border transition-all cursor-pointer ${
                      isCurrent
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span>{listName}</span>
                    {isCurrent && <Check className="w-4 h-4 text-blue-600" />}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsAddToListModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Disappearing Messages Dialog */}
      {isDisappearingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 text-slate-800 space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              <h3 className="font-bold text-sm text-slate-900">Disappearing messages</h3>
            </div>
            <p className="text-xs text-slate-500">
              Make messages in this chat disappear for more privacy. Anyone in the chat can change this setting.
            </p>
            <div className="space-y-2 text-xs">
              {(['24h', '7d', '90d', 'off'] as const).map(opt => (
                <label
                  key={opt}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 cursor-pointer font-medium text-slate-700"
                  onClick={() => setDisappearingOption(opt)}
                >
                  <span className="capitalize">{opt === 'off' ? 'Off' : opt === '24h' ? '24 hours' : opt === '7d' ? '7 days' : '90 days'}</span>
                  <input
                    type="radio"
                    name="disappearing"
                    checked={disappearingOption === opt}
                    onChange={() => setDisappearingOption(opt)}
                    className="accent-blue-600"
                  />
                </label>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsDisappearingModalOpen(false);
                  onShowToast(disappearingOption === 'off' ? 'Disappearing messages turned off' : `Disappearing messages set to ${disappearingOption}`);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: Wallpaper Selector */}
      {isWallpaperModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 text-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900">Set chat wallpaper</h3>
              </div>
              <button type="button" onClick={() => setIsWallpaperModalOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              {[
                { id: 'doodle', name: 'Vertex Matrix', class: 'bg-[#f8fafc] bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:16px_16px]' },
                { id: 'navy', name: 'Azure Breeze', class: 'bg-gradient-to-b from-[#eff6ff] via-[#f8fafc] to-[#eff6ff]' },
                { id: 'emerald', name: 'Soft Sage', class: 'bg-gradient-to-b from-[#f0fdf4] via-[#f8fafc] to-[#f0fdf4]' },
                { id: 'dark', name: 'Midnight Slate', class: 'bg-[#0f172a]' },
                { id: 'default', name: 'Pure White', class: 'bg-white' }
              ].map(w => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => {
                    setChatWallpaper(w.id as any);
                    setIsWallpaperModalOpen(false);
                    onShowToast(`Wallpaper set to ${w.name}`);
                  }}
                  className={`p-3 rounded-2xl border flex flex-col items-center gap-2 transition-transform hover:scale-105 cursor-pointer ${
                    chatWallpaper === w.id ? 'border-blue-600 shadow-md shadow-blue-500/20 ring-2 ring-blue-100' : 'border-slate-200'
                  }`}
                >
                  <div className={`w-full h-16 rounded-xl border border-slate-200/60 ${w.class}`} />
                  <span className="text-[11px] font-semibold text-slate-700">{w.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: Clear Chat Modal */}
      {isClearChatModalOpen && activeFriend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xs bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 text-slate-800 space-y-4">
            <h3 className="font-bold text-sm text-slate-900">Clear entire chat?</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Are you sure? All messages in this conversation will be permanently deleted from the database and cannot be recovered.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsClearChatModalOpen(false)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearChat}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-sm transition-transform active:scale-95"
              >
                Clear all messages
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7: Block Contact Modal */}
      {isBlockModalOpen && activeFriend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xs bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 text-slate-800 space-y-4">
            <h3 className="font-bold text-sm text-slate-900">{isBlocked ? `Unblock @${activeFriend.connect_id}?` : `Block @${activeFriend.connect_id}?`}</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              {isBlocked
                ? 'Unblocked contacts will be able to call you and send you messages.'
                : 'Blocked contacts will no longer be able to call you or send you messages.'}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsBlockModalOpen(false)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={toggleBlockActiveUser}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold text-white cursor-pointer shadow-sm transition-transform active:scale-95 ${
                  isBlocked ? 'bg-blue-600 hover:bg-blue-700' : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {isBlocked ? 'Unblock' : 'Block'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7b: Delete Chat Modal (Removes Connection so user can re-request) */}
      {isDeleteChatModalOpen && activeFriend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xs bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 text-slate-800 space-y-4">
            <div className="flex items-center gap-2 text-rose-600">
              <Trash2 className="w-5 h-5 text-rose-600" />
              <h3 className="font-bold text-sm text-slate-900">Delete chat?</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              This will remove <b>{getDisplayName(activeFriend.name, activeFriend.connect_id)}</b> (@{activeFriend.connect_id}) from your chats and permanently delete all history and your connection. You can search and send a new friend request anytime.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsDeleteChatModalOpen(false)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteChat}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-sm transition-transform active:scale-95"
              >
                Delete chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7c: Report Contact Modal */}
      {isReportModalOpen && activeFriend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 text-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-1 border-b border-slate-100">
              <div className="flex items-center gap-2 text-slate-900">
                <ThumbsDown className="w-5 h-5 text-rose-500" />
                <h3 className="font-bold text-sm">Report @{activeFriend.connect_id}</h3>
              </div>
              <button type="button" onClick={() => setIsReportModalOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Select a reason for reporting this contact. Our safety team will review recent activity.
            </p>
            <div className="space-y-1.5">
              {[
                'Spam or unwanted advertising',
                'Harassment or bullying',
                'Inappropriate or offensive content',
                'Impersonation or fake account',
                'Other safety concern'
              ].map((reason) => (
                <label key={reason} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-slate-50 cursor-pointer text-xs text-slate-700">
                  <input
                    type="radio"
                    name="reportReason"
                    checked={reportReason === reason}
                    onChange={() => setReportReason(reason)}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsReportModalOpen(false)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsReportModalOpen(false);
                  onShowToast(`Report submitted: ${reportReason}. Thank you.`);
                }}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-sm transition-transform active:scale-95"
              >
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 8: New Group Modal */}
      {isNewGroupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 text-slate-800 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900">New group</h3>
              </div>
              <button type="button" onClick={() => setIsNewGroupModalOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Group subject..."
              className="w-full h-10 px-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />

            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                Add participants ({selectedGroupMembers.length} selected)
              </span>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {friends.length === 0 ? (
                  <div className="text-xs text-slate-400 py-4 text-center">No connections available</div>
                ) : (
                  friends.map(f => {
                    const isSelected = selectedGroupMembers.includes(f.user_id);
                    return (
                      <div
                        key={f.connection_id}
                        onClick={() => {
                          setSelectedGroupMembers(prev =>
                            isSelected ? prev.filter(id => id !== f.user_id) : [...prev, f.user_id]
                          );
                        }}
                        className={`p-2 rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shadow-xs">
                            {getInitials(f.name, f.connect_id)}
                          </div>
                          <div>
                            <span className="text-xs font-semibold block text-slate-900">{getDisplayName(f.name, f.connect_id)}</span>
                            <span className="text-[10px] text-slate-400">@{f.connect_id}</span>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="accent-blue-600"
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 mt-auto">
              <button
                type="button"
                onClick={() => setIsNewGroupModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateGroup}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 cursor-pointer"
              >
                Create Group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 9: Linked Devices Modal */}
      {isLinkedDevicesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 text-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Laptop className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900">Linked devices</h3>
              </div>
              <button type="button" onClick={() => setIsLinkedDevicesModalOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Use Vertex Connect on Web, Desktop and other devices simultaneously with end-to-end sync.
            </p>

            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 font-bold">
                  <Laptop className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-semibold block text-slate-900">Windows · Chrome</span>
                  <span className="text-[10px] text-emerald-600 font-medium">Active now (This device)</span>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsLinkedDevicesModalOpen(false);
                  onShowToast('Logged out from all other sessions');
                }}
                className="w-full py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-600 transition-colors cursor-pointer"
              >
                Log out from all other devices
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 10: Starred Messages Modal */}
      {isStarredMessagesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-2xl p-5 text-slate-800 flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                <h3 className="font-bold text-sm text-slate-900">Starred messages</h3>
              </div>
              <button type="button" onClick={() => setIsStarredMessagesModalOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-2">
              {starredMessagesList.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  No starred messages yet. Hover over any message and click ⭐ to star it.
                </div>
              ) : (
                starredMessagesList.map(m => (
                  <div key={m.id} className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-blue-600">{m.sender_name}</span>
                        <span className="text-[10px] text-slate-400">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="text-xs text-slate-800 break-words">{m.content || m.file_name || 'Attachment'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleStar(m.id)}
                      className="p-1 rounded-lg hover:bg-slate-200 text-amber-500 cursor-pointer shrink-0"
                      title="Unstar"
                    >
                      <Star className="w-4 h-4 fill-amber-500" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 11: Add Friend by Connect ID */}
      {isAddFriendModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 text-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900">Add Friend</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddFriendModalOpen(false);
                  setAddFriendInput('');
                }}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Enter any friend&apos;s Vertex Connect ID (e.g. <b>john</b> or <b>@john</b>) to send an instant connection request.
            </p>

            <div className="relative">
              <div className="h-11 px-3.5 rounded-xl bg-slate-50 border border-slate-200 focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition-all flex items-center gap-2">
                <span className="text-blue-600 font-bold text-sm">@</span>
                <input
                  type="text"
                  autoFocus
                  value={addFriendInput}
                  onChange={(e) => setAddFriendInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && addFriendInput.trim()) {
                      handleSendConnectRequest(addFriendInput.trim());
                      setIsAddFriendModalOpen(false);
                      setAddFriendInput('');
                    }
                  }}
                  placeholder="Enter Connect ID..."
                  className="flex-1 bg-transparent border-none text-xs text-slate-800 placeholder-slate-400 focus:outline-none font-medium"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsAddFriendModalOpen(false);
                  setAddFriendInput('');
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!addFriendInput.trim()}
                onClick={() => {
                  if (addFriendInput.trim()) {
                    handleSendConnectRequest(addFriendInput.trim());
                    setIsAddFriendModalOpen(false);
                    setAddFriendInput('');
                  }
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white shadow-md shadow-blue-500/20 cursor-pointer transition-transform active:scale-95"
              >
                Send Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

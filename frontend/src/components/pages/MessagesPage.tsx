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
  Info
} from 'lucide-react';
import type { ChatMessage, ConnectionUser, SearchUserResult } from '../../types';
import { VoiceNotePlayer } from '../chat/VoiceNotePlayer';
import { API_BASE_URL, WS_BASE_URL } from '../../config/api';

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

  // Friends & Connections
  const [friends, setFriends] = useState<ConnectionUser[]>([]);
  const [pendingIncoming, setPendingIncoming] = useState<ConnectionUser[]>([]);
  const [pendingOutgoing, setPendingOutgoing] = useState<ConnectionUser[]>([]);
  const [isLoadingConnections, setIsLoadingConnections] = useState(false);

  // Active Chat State
  const [activeFriend, setActiveFriend] = useState<ConnectionUser | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const activeFriendRef = useRef<ConnectionUser | null>(activeFriend);
  const typingTimeoutRef = useRef<any>(null);
  const lastTypingSentRef = useRef<number>(0);

  useEffect(() => {
    activeFriendRef.current = activeFriend;
  }, [activeFriend]);

  // Scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 1. Fetch user's friends and pending requests from Backend (Isolated per user)
  const fetchConnections = async () => {
    if (!user) return;
    setIsLoadingConnections(true);
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
        const enrichedFriends = (data.friends || []).map((f: ConnectionUser) => {
          const pres = presenceMap[f.user_id];
          return {
            ...f,
            status: pres?.status || f.status || 'offline',
            last_seen: pres?.last_seen || f.last_seen,
          };
        });

        setFriends(enrichedFriends);
        setPendingIncoming(data.pending_incoming || []);
        setPendingOutgoing(data.pending_outgoing || []);

        // If no active friend selected, select first friend
        if (!activeFriend && enrichedFriends.length > 0) {
          setActiveFriend(enrichedFriends[0]);
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
  }, [user?.id]);

  // 2. Real-time WebSocket connection for user-isolated events
  useEffect(() => {
    if (!user?.id) return;
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
                } else if (user?.id) {
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

  // 3. Fetch message history when active friend changes
  useEffect(() => {
    if (!activeFriend?.conversation_id) {
      setMessages([]);
      return;
    }

    const fetchMessages = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/messages/${activeFriend.conversation_id}`);
        if (res.ok) {
          const data: ChatMessage[] = await res.json();
          setMessages(data);

          // Mark unread messages as read instantly over WebSocket
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && activeFriend?.conversation_id) {
            wsRef.current.send(
              JSON.stringify({
                type: 'read_messages',
                conversation_id: activeFriend.conversation_id,
              })
            );
          } else if (user?.id) {
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
      }
    };

    fetchMessages();

    // Auto-poll every 2.5s so messages sync in real-time 24/7 even in serverless mode
    const pollInterval = setInterval(fetchMessages, 2500);
    return () => clearInterval(pollInterval);
  }, [activeFriend]);

  // 4. Search Users by Connect ID or Name
  useEffect(() => {
    const raw = searchQuery.trim();
    if (!raw || raw.length < 2 || !user) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/users/search?q=${encodeURIComponent(raw)}&current_user_id=${user.id}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } catch (err) {
        console.error('Search error', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, user]);

  // 5. Send Connection Request via Connect ID
  const handleSendConnectRequest = async (targetConnectId: string) => {
    if (!user) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/connections/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_user_id: user.id,
          target_connect_id: targetConnectId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        onShowToast(data.message || `Request sent to @${targetConnectId}!`);
        // Update local search status
        setSearchResults((prev) =>
          prev.map((u) => (u.connect_id === targetConnectId ? { ...u, connection_status: 'pending', is_sender: true } : u))
        );
        fetchConnections();
      } else {
        onShowToast(data.detail || 'Failed to send request');
      }
    } catch {
      onShowToast('Backend server unreachable.');
    }
  };

  // 6. Accept Connection Request
  const handleAcceptRequest = async (connectionId: string, friendName: string) => {
    if (!user) return;
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
        onShowToast(`Connected with ${friendName}! You can now message each other.`);
        fetchConnections();
        setActiveTab('chats');
      }
    } catch {
      onShowToast('Failed to accept request');
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

    const messageContent = inputMessage.trim();
    const tempId = `temp_${Date.now()}`;
    const replySnippet = replyingTo ? `${replyingTo.sender_name}: ${replyingTo.content.slice(0, 60)}` : undefined;
    const replyId = replyingTo?.id;

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
          prev.map((m) => (m.id === tempId ? { ...data.message, is_me: true } : m))
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
      const sender = m.sender_name || (m.sender_id === user?.id ? user.name : activeFriend.name);
      return `[${time}] ${sender}: ${m.content || m.file_name || 'Attachment'}`;
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `WhatsApp_Chat_with_${activeFriend.connect_id}.txt`;
    a.click();
    onShowToast('Chat transcript exported successfully!');
  };

  const handleClearChat = () => {
    setMessages([]);
    setIsClearChatModalOpen(false);
    setIsChatMenuOpen(false);
    onShowToast('Chat history cleared.');
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
    setFriends(prev => [newGroup, ...prev]);
    setActiveFriend(newGroup);
    setIsNewGroupModalOpen(false);
    setNewGroupName('');
    setSelectedGroupMembers([]);
    onShowToast(`Group "${newGroup.name}" created!`);
  };

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.whatsapp-menu-container') && !target.closest('.whatsapp-menu-btn')) {
        setIsChatListMenuOpen(false);
        setIsChatMenuOpen(false);
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

  const WALLPAPER_CLASSES: Record<string, string> = {
    default: 'bg-white/20 dark:bg-white/5',
    doodle: 'bg-[#0b141a] bg-[radial-gradient(#128c7e_1px,transparent_1px)] [background-size:16px_16px]',
    emerald: 'bg-gradient-to-b from-[#0b141a] via-[#07241f] to-[#0b141a]',
    navy: 'bg-gradient-to-b from-[#0b1329] via-[#101b3b] to-[#070b1a]',
    dark: 'bg-[#111b21]'
  };

  return (
    <div className="glass-panel h-[calc(100dvh-130px)] md:h-[calc(100vh-140px)] flex overflow-hidden border border-white/60 dark:border-white/10 shadow-2xl animate-in fade-in duration-300">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* LEFT SIDEBAR: Search by Connect ID + Friends List + Requests */}
      <div className={`w-full md:w-80 shrink-0 border-r border-black/5 dark:border-white/10 flex flex-col bg-white/40 dark:bg-white/5 ${activeFriend ? 'hidden md:flex' : 'flex'}`}>
        {/* Search by Connect ID Bar */}
        <div className="p-4 border-b border-black/5 dark:border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#182044] dark:text-[#f1f3ff]">Chats</h2>
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1 text-[11px] font-bold text-[#8ce7f2] bg-[var(--accent)]/15 px-2 py-0.5 rounded-lg">
                <span>@{user?.connect_id}</span>
              </div>

              {/* WhatsApp Chats List 3-Dots Menu Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsChatListMenuOpen(!isChatListMenuOpen);
                  }}
                  title="Menu"
                  className="whatsapp-menu-btn w-8 h-8 rounded-lg flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 text-[#40516c] dark:text-[#cbd4ff] transition-all cursor-pointer"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {/* WhatsApp Chats List Dropdown */}
                {isChatListMenuOpen && (
                  <div className="whatsapp-menu-container absolute right-0 top-9 w-52 rounded-2xl bg-[#111b21] border border-white/10 shadow-2xl z-50 p-1.5 animate-in fade-in zoom-in-95 duration-150 text-white">
                    <button
                      type="button"
                      onClick={() => {
                        setIsChatListMenuOpen(false);
                        setIsNewGroupModalOpen(true);
                      }}
                      className="w-full px-3 py-2 text-xs flex items-center gap-2.5 rounded-xl hover:bg-white/10 transition-colors text-left cursor-pointer"
                    >
                      <Users className="w-4 h-4 text-[#8ce7f2]" />
                      <span>New group</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsChatListMenuOpen(false);
                        onShowToast('New broadcast list created');
                      }}
                      className="w-full px-3 py-2 text-xs flex items-center gap-2.5 rounded-xl hover:bg-white/10 transition-colors text-left cursor-pointer"
                    >
                      <Share2 className="w-4 h-4 text-[#8ce7f2]" />
                      <span>New broadcast</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsChatListMenuOpen(false);
                        setIsLinkedDevicesModalOpen(true);
                      }}
                      className="w-full px-3 py-2 text-xs flex items-center gap-2.5 rounded-xl hover:bg-white/10 transition-colors text-left cursor-pointer"
                    >
                      <Laptop className="w-4 h-4 text-[#8ce7f2]" />
                      <span>Linked devices</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsChatListMenuOpen(false);
                        setIsStarredMessagesModalOpen(true);
                      }}
                      className="w-full px-3 py-2 text-xs flex items-center gap-2.5 rounded-xl hover:bg-white/10 transition-colors text-left cursor-pointer"
                    >
                      <Star className="w-4 h-4 text-amber-400" />
                      <span>Starred messages</span>
                    </button>

                    <div className="h-[1px] bg-white/10 my-1" />

                    <button
                      type="button"
                      onClick={() => {
                        setIsChatListMenuOpen(false);
                        onShowToast('All chats marked as read');
                      }}
                      className="w-full px-3 py-2 text-xs flex items-center gap-2.5 rounded-xl hover:bg-white/10 transition-colors text-left cursor-pointer"
                    >
                      <CheckCheck className="w-4 h-4 text-[#53bdeb]" />
                      <span>Mark all as read</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Search Input with @ icon */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#71809a]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by @ConnectID or name..."
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-[#cbd5ff]/60 dark:border-white/10 bg-white/80 dark:bg-white/5 text-xs text-[#182044] dark:text-[#eef1ff] placeholder-[#71809a] focus:outline-none focus:border-[var(--accent)] shadow-inner transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#71809a] hover:text-black dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Search Results Dropdown/Card */}
        {searchResults.length > 0 && (
          <div className="p-3 bg-gradient-to-b from-[#eaf3ff] to-[#f4f7ff] dark:from-[#17244d] dark:to-[#121c3d] border-b border-black/5 dark:border-white/10 space-y-2 max-h-60 overflow-y-auto">
            <span className="text-[10px] uppercase font-bold text-[#6f7899] dark:text-[#aeb8dc] tracking-wider block px-1">
              Search Results
            </span>
            {searchResults.map((sr) => (
              <div
                key={sr.id}
                onClick={() => setSelectedUserPreview(sr)}
                className="p-2.5 rounded-xl bg-white/80 dark:bg-white/10 border border-black/5 dark:border-white/10 flex items-center justify-between gap-2 hover:shadow-md cursor-pointer transition-all"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#8cf4ff] to-[#d6a2ff] flex items-center justify-center font-bold text-xs text-[#171a42] shrink-0">
                    {sr.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <b className="text-xs font-bold text-[#182044] dark:text-[#f1f3ff] block truncate">
                      {sr.name}
                    </b>
                    <span className="text-[10px] text-[var(--accent)] font-semibold truncate block">
                      @{sr.connect_id}
                    </span>
                  </div>
                </div>

                {sr.connection_status === 'accepted' ? (
                  <span className="text-[10px] font-bold text-[#12a878] bg-[#e7f8f1] px-2 py-0.5 rounded-full flex items-center gap-1">
                    <UserCheck className="w-3 h-3" /> Friends
                  </span>
                ) : sr.connection_status === 'pending' ? (
                  <span className="text-[10px] font-semibold text-[#d17b22] bg-[#fff6e8] px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Pending
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSendConnectRequest(sr.connect_id);
                    }}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-[var(--accent)] hover:brightness-110 flex items-center gap-1 shadow-sm"
                  >
                    <UserPlus className="w-3 h-3" />
                    <span>Connect</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tab Headers: Chats (Friends) vs Requests */}
        <div className="flex border-b border-black/5 dark:border-white/10 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('chats')}
            className={`flex-1 py-2.5 text-center transition-colors cursor-pointer border-b-2 ${
              activeTab === 'chats'
                ? 'border-[var(--accent)] text-[var(--accent)] bg-white/40 dark:bg-white/5'
                : 'border-transparent text-[#6f7899] dark:text-[#aeb8dc] hover:text-[#182044]'
            }`}
          >
            Chats ({friends.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            className={`flex-1 py-2.5 text-center transition-colors cursor-pointer border-b-2 relative ${
              activeTab === 'requests'
                ? 'border-[var(--accent)] text-[var(--accent)] bg-white/40 dark:bg-white/5'
                : 'border-transparent text-[#6f7899] dark:text-[#aeb8dc] hover:text-[#182044]'
            }`}
          >
            <span>Requests</span>
            {pendingIncoming.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-[#f04454] text-white text-[9px]">
                {pendingIncoming.length}
              </span>
            )}
          </button>
        </div>

        {/* Friends Chat List */}
        {activeTab === 'chats' ? (
          <div className="flex-1 overflow-y-auto divide-y divide-black/5 dark:divide-white/5">
            {friends.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center justify-center text-[#71809a]">
                <AtSign className="w-10 h-10 mb-2 opacity-30 text-[var(--accent)]" />
                <p className="text-xs font-bold text-[#182044] dark:text-[#f1f3ff]">No Connected Friends</p>
                <span className="text-[11px] text-[#8491a5] mt-1 max-w-[200px] leading-relaxed">
                  Search a teammate by their <strong className="text-[var(--accent)]">@ConnectID</strong> above to invite and connect!
                </span>
              </div>
            ) : (
              friends.map((f) => {
                const isSelected = activeFriend?.user_id === f.user_id;
                return (
                  <div
                    key={f.user_id}
                    onClick={() => setActiveFriend(f)}
                    className={`p-3.5 flex items-center gap-3 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-white/80 dark:bg-white/10 border-l-4 border-l-[var(--accent)]'
                        : 'hover:bg-white/50 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#8cf4ff] via-[#8d8cff] to-[#d6a2ff] text-[#171a42] flex items-center justify-center font-bold text-xs shadow-sm">
                        {f.name.slice(0, 2).toUpperCase()}
                      </div>
                      <span
                        className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-[#121f33] ${
                          f.status === 'online'
                            ? 'bg-[#12a878]'
                            : f.status === 'in_call'
                            ? 'bg-[#9b83f7] animate-pulse'
                            : f.status === 'away'
                            ? 'bg-[#d17b22]'
                            : 'bg-[#9aa9c0]'
                        }`}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <b className="text-xs font-bold text-[#182044] dark:text-[#f1f3ff] truncate">
                          {f.name}
                        </b>
                        {f.status === 'in_call' ? (
                          <span className="text-[9px] text-[#b39dfa] font-bold flex items-center gap-0.5 bg-[#9b83f7]/15 px-1.5 py-0.2 rounded">
                            <Phone className="w-2.5 h-2.5" /> in call
                          </span>
                        ) : f.status === 'online' ? (
                          <span className="text-[9px] text-[#12a878] font-bold">online</span>
                        ) : (
                          <span className="text-[9px] text-[#8491a5]">offline</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-[#6f7899] dark:text-[#aeb8dc] mt-0.5">
                        <span className="text-[10px] text-[var(--accent)] font-semibold truncate">
                          @{f.connect_id}
                        </span>
                        <span className="text-[10px] opacity-75 truncate max-w-[90px]">
                          {f.bio || 'Connected teammate'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Incoming Connection Requests */
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <span className="text-[10px] uppercase font-bold text-[#6f7899] dark:text-[#aeb8dc] block px-1">
              Incoming Invites ({pendingIncoming.length})
            </span>
            {pendingIncoming.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#71809a]">
                No pending requests.
              </div>
            ) : (
              pendingIncoming.map((req) => (
                <div
                  key={req.connection_id}
                  className="p-3 rounded-2xl bg-white/70 dark:bg-white/5 border border-black/5 dark:border-white/10 space-y-2 shadow-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#8cf4ff] to-[#d6a2ff] flex items-center justify-center font-bold text-xs text-[#171a42]">
                      {req.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <b className="text-xs font-bold text-[#182044] dark:text-[#f1f3ff] block leading-tight">
                        {req.name}
                      </b>
                      <span className="text-[10px] text-[var(--accent)] font-semibold">
                        @{req.connect_id}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#6f7899] dark:text-[#aeb8dc] m-0">
                    Wants to connect with you on Vertex Connect.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleAcceptRequest(req.connection_id, req.name)}
                      className="flex-1 py-1.5 rounded-xl text-xs font-bold text-white bg-[#12a878] hover:bg-[#0e9469] flex items-center justify-center gap-1 shadow-sm"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Accept</span>
                    </button>
                  </div>
                </div>
              ))
            )}

            {/* Outgoing Requests */}
            {pendingOutgoing.length > 0 && (
              <div className="pt-3 border-t border-black/5 dark:border-white/10 space-y-2">
                <span className="text-[10px] uppercase font-bold text-[#6f7899] dark:text-[#aeb8dc] block px-1">
                  Sent Requests ({pendingOutgoing.length})
                </span>
                {pendingOutgoing.map((out) => (
                  <div
                    key={out.connection_id}
                    className="p-2.5 rounded-xl bg-black/5 dark:bg-white/5 text-xs flex items-center justify-between text-[#6f7899] dark:text-[#aeb8dc]"
                  >
                    <div>
                      <b className="text-[#182044] dark:text-[#f1f3ff]">{out.name}</b>
                      <span className="block text-[10px] text-[var(--accent)] font-semibold">@{out.connect_id}</span>
                    </div>
                    <span className="text-[10px] text-[#d17b22] font-semibold flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Waiting
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* RIGHT SIDE: WhatsApp Style Chat Pane */}
      {activeFriend ? (
        <div className="flex-1 flex flex-col bg-white/20 dark:bg-white/5">
          {/* Header with Friend details, Call buttons */}
          <div className="h-16 px-3 md:px-6 border-b border-black/5 dark:border-white/10 flex items-center justify-between bg-white/40 dark:bg-white/5">
            <div className="flex items-center gap-2 md:gap-3 min-w-0">
              {/* Mobile Back Button to return to Chats List */}
              <button
                type="button"
                onClick={() => setActiveFriend(null)}
                className="md:hidden p-2 -ml-1 rounded-xl text-[#40516c] dark:text-[#cbd4ff] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                title="Back to chats"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-gradient-to-tr from-[#8cf4ff] via-[#8d8cff] to-[#d6a2ff] flex items-center justify-center font-bold text-xs text-[#171a42] shrink-0">
                {activeFriend.name.slice(0, 2).toUpperCase()}
              </div>
              <div
                className="min-w-0 cursor-pointer"
                onClick={() => setIsContactInfoOpen(true)}
                title="View contact info"
              >
                <div className="flex items-center gap-1.5 md:gap-2 truncate">
                  <b className="text-xs md:text-sm font-bold text-[#182044] dark:text-[#f1f3ff] leading-tight truncate">
                    {activeFriend.name}
                  </b>
                  <span className="text-[9px] md:text-[10px] font-semibold text-[var(--accent)] bg-[var(--accent)]/10 px-1.5 py-0.2 rounded shrink-0">
                    @{activeFriend.connect_id}
                  </span>
                  {isMuted && (
                    <span title="Notifications muted" className="inline-flex items-center">
                      <BellOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    </span>
                  )}
                  {disappearingOption !== 'off' && (
                    <span title={`Disappearing: ${disappearingOption}`} className="inline-flex items-center">
                      <Clock className="w-3.5 h-3.5 text-[#8ce7f2] shrink-0" />
                    </span>
                  )}
                </div>
                <small className="text-[10px] md:text-[11px] text-[#6f7899] dark:text-[#aeb8dc] flex items-center gap-1 truncate">
                  {isTyping ? (
                    <span className="text-[var(--accent)] font-bold animate-pulse">typing…</span>
                  ) : (
                    <span className="truncate">{activeFriend.bio || 'Tap here for contact info'}</span>
                  )}
                </small>
              </div>
            </div>

            {/* Quick Actions (Voice, Video, In-Chat Search & WhatsApp 3-Dots Menu) */}
            <div className="flex items-center gap-1.5 md:gap-2">
              <button
                type="button"
                onClick={() => onStartCall(activeFriend.name, 'audio', activeFriend.user_id, activeFriend.connect_id)}
                title="Voice call"
                className="w-8 h-8 md:w-9 md:h-9 rounded-xl flex items-center justify-center bg-white/80 dark:bg-white/10 hover:bg-[var(--accent)] hover:text-white border border-black/5 dark:border-white/10 text-[#40516c] dark:text-[#cbd4ff] transition-all cursor-pointer shadow-sm"
              >
                <Phone className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onStartCall(activeFriend.name, 'video', activeFriend.user_id, activeFriend.connect_id)}
                title="Video call"
                className="w-8 h-8 md:w-9 md:h-9 rounded-xl flex items-center justify-center bg-white/80 dark:bg-white/10 hover:bg-[var(--accent)] hover:text-white border border-black/5 dark:border-white/10 text-[#40516c] dark:text-[#cbd4ff] transition-all cursor-pointer shadow-sm"
              >
                <Video className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsInChatSearchOpen(!isInChatSearchOpen)}
                title="Search in chat"
                className={`w-8 h-8 md:w-9 md:h-9 rounded-xl flex items-center justify-center border border-black/5 dark:border-white/10 transition-all cursor-pointer shadow-sm ${
                  isInChatSearchOpen
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-white/80 dark:bg-white/10 hover:bg-[var(--accent)] hover:text-white text-[#40516c] dark:text-[#cbd4ff]'
                }`}
              >
                <Search className="w-4 h-4" />
              </button>

              {/* WhatsApp Active Chat 3-Dots Menu Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsChatMenuOpen(!isChatMenuOpen);
                  }}
                  title="More options"
                  className="whatsapp-menu-btn w-8 h-8 md:w-9 md:h-9 rounded-xl flex items-center justify-center bg-white/80 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 border border-black/5 dark:border-white/10 text-[#40516c] dark:text-[#cbd4ff] transition-all cursor-pointer shadow-sm"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {/* WhatsApp Chat 3-Dots Dropdown Menu */}
                {isChatMenuOpen && (
                  <div className="whatsapp-menu-container absolute right-0 top-10 w-56 rounded-2xl bg-[#111b21] border border-white/10 shadow-2xl z-50 p-1.5 animate-in fade-in zoom-in-95 duration-150 text-white">
                    <button
                      type="button"
                      onClick={() => {
                        setIsChatMenuOpen(false);
                        setIsContactInfoOpen(true);
                      }}
                      className="w-full px-3 py-2 text-xs flex items-center gap-2.5 rounded-xl hover:bg-white/10 transition-colors text-left cursor-pointer"
                    >
                      <Info className="w-4 h-4 text-[#8ce7f2]" />
                      <span>Contact info</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsChatMenuOpen(false);
                        setIsMediaModalOpen(true);
                      }}
                      className="w-full px-3 py-2 text-xs flex items-center gap-2.5 rounded-xl hover:bg-white/10 transition-colors text-left cursor-pointer"
                    >
                      <ImageIcon className="w-4 h-4 text-[#8ce7f2]" />
                      <span>Media, links, and docs</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsChatMenuOpen(false);
                        setIsInChatSearchOpen(true);
                      }}
                      className="w-full px-3 py-2 text-xs flex items-center gap-2.5 rounded-xl hover:bg-white/10 transition-colors text-left cursor-pointer"
                    >
                      <Search className="w-4 h-4 text-[#8ce7f2]" />
                      <span>Search</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsChatMenuOpen(false);
                        setIsMuteModalOpen(true);
                      }}
                      className="w-full px-3 py-2 text-xs flex items-center gap-2.5 rounded-xl hover:bg-white/10 transition-colors text-left cursor-pointer"
                    >
                      {isMuted ? <Bell className="w-4 h-4 text-emerald-400" /> : <BellOff className="w-4 h-4 text-amber-400" />}
                      <span>{isMuted ? 'Unmute notifications' : 'Mute notifications'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsChatMenuOpen(false);
                        setIsDisappearingModalOpen(true);
                      }}
                      className="w-full px-3 py-2 text-xs flex items-center gap-2.5 rounded-xl hover:bg-white/10 transition-colors text-left cursor-pointer"
                    >
                      <Clock className="w-4 h-4 text-[#8ce7f2]" />
                      <span>Disappearing messages</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsChatMenuOpen(false);
                        setIsWallpaperModalOpen(true);
                      }}
                      className="w-full px-3 py-2 text-xs flex items-center gap-2.5 rounded-xl hover:bg-white/10 transition-colors text-left cursor-pointer"
                    >
                      <Palette className="w-4 h-4 text-[#8ce7f2]" />
                      <span>Wallpaper</span>
                    </button>

                    <div className="h-[1px] bg-white/10 my-1" />

                    <button
                      type="button"
                      onClick={handleExportChat}
                      className="w-full px-3 py-2 text-xs flex items-center gap-2.5 rounded-xl hover:bg-white/10 transition-colors text-left cursor-pointer"
                    >
                      <Share2 className="w-4 h-4 text-[#8ce7f2]" />
                      <span>Export chat (.txt)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsChatMenuOpen(false);
                        setIsClearChatModalOpen(true);
                      }}
                      className="w-full px-3 py-2 text-xs flex items-center gap-2.5 rounded-xl hover:bg-white/10 transition-colors text-left cursor-pointer text-amber-300"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Clear chat</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsChatMenuOpen(false);
                        setIsBlockModalOpen(true);
                      }}
                      className="w-full px-3 py-2 text-xs flex items-center gap-2.5 rounded-xl hover:bg-rose-500/20 text-rose-400 transition-colors text-left cursor-pointer"
                    >
                      <Ban className="w-4 h-4" />
                      <span>{isBlocked ? 'Unblock contact' : 'Block contact'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* In-Chat Search Bar (WhatsApp Style) */}
          {isInChatSearchOpen && (
            <div className="px-4 py-2 bg-black/10 dark:bg-[#111b21] border-b border-black/5 dark:border-white/10 flex items-center gap-2 animate-in slide-in-from-top-2 duration-150">
              <Search className="w-4 h-4 text-[#8ce7f2] shrink-0" />
              <input
                type="text"
                value={inChatSearchQuery}
                onChange={(e) => setInChatSearchQuery(e.target.value)}
                placeholder="Search messages in this chat..."
                autoFocus
                className="flex-1 bg-transparent border-none text-xs text-[#182044] dark:text-[#f1f3ff] placeholder-[#71809a] focus:outline-none"
              />
              {inChatSearchQuery && (
                <span className="text-[10px] text-[#8ce7f2] font-semibold">
                  {filteredMessages.length} {filteredMessages.length === 1 ? 'match' : 'matches'}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setIsInChatSearchOpen(false);
                  setInChatSearchQuery('');
                }}
                className="p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-[#71809a]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Messages Thread (WhatsApp Style with dynamic wallpaper) */}
          <div className={`flex-1 overflow-y-auto p-4 md:p-6 space-y-4 transition-colors ${WALLPAPER_CLASSES[chatWallpaper] || ''}`}>
            <div className="text-center">
              <span className="text-[10px] uppercase font-bold text-[#8491a5] dark:text-[#8898b3] bg-white/50 dark:bg-[#111b21]/90 px-3 py-1 rounded-full border border-black/5 dark:border-white/10 shadow-sm">
                End-to-End Encrypted Direct Channel with @{activeFriend.connect_id}
              </span>
            </div>

            {filteredMessages.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center text-[#71809a]">
                <MessageSquare className="w-10 h-10 mb-2 opacity-30 text-[var(--accent)]" />
                <p className="text-xs font-bold text-[#182044] dark:text-[#f1f3ff]">
                  {inChatSearchQuery ? 'No matching messages found' : `Connected with @${activeFriend.connect_id}`}
                </p>
                <span className="text-[11px] text-[#8491a5] mt-0.5">
                  {inChatSearchQuery ? 'Try a different search term.' : 'Send a message, audio voice note, or files to collaborate!'}
                </span>
              </div>
            ) : (
              filteredMessages.map((m) => {
                const isMe = m.sender_id === user?.id;
                const isImage = m.file_type?.startsWith('image/') || (m.file_name && /\.(png|jpe?g|gif|webp)$/i.test(m.file_name));
                const isAudio = m.file_type?.startsWith('audio/') || (m.file_name && /\.(webm|mp3|wav|ogg)$/i.test(m.file_name)) || m.content === '🎤 Voice note';
                const isStarred = starredMessageIds.has(m.id);

                return (
                  <div
                    key={m.id}
                    className={`group relative flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-full`}
                  >
                    {/* Floating Reaction & Action Bar (WhatsApp Style Hover) */}
                    <div
                      className={`opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 flex items-center gap-1 bg-[#141b43]/90 dark:bg-[#0c1230]/90 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/20 shadow-xl z-20 ${
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
                      <div className="w-[1px] h-3 bg-white/20 mx-0.5" />
                      <button
                        type="button"
                        onClick={() => handleToggleStar(m.id)}
                        className={`hover:scale-110 transition-transform p-1 cursor-pointer ${isStarred ? 'text-amber-400' : 'text-white/70 hover:text-amber-400'}`}
                        title={isStarred ? 'Unstar message' : 'Star message'}
                      >
                        <Star className={`w-3.5 h-3.5 ${isStarred ? 'fill-amber-400' : ''}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(m.content || m.file_name || '')}
                        className="hover:scale-110 transition-transform text-white/70 hover:text-white p-1 cursor-pointer"
                        title="Copy message"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setReplyingTo({ id: m.id, sender_name: m.sender_name, content: m.content || m.file_name || 'Attachment' })}
                        className="hover:scale-110 transition-transform text-white/70 hover:text-white p-1 cursor-pointer"
                        title="Reply"
                      >
                        <Reply className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteMessage(m.id)}
                        className="hover:scale-110 transition-transform text-white/70 hover:text-rose-400 p-1 cursor-pointer"
                        title="Delete for me"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div
                      className={`max-w-[80%] sm:max-w-[70%] p-3.5 rounded-2xl shadow-sm text-xs leading-relaxed relative ${
                        isMe
                          ? 'bg-gradient-to-r from-[#128c7e] to-[#0f776a] text-white rounded-br-sm'
                          : 'bg-white dark:bg-[#1f2c34] text-[#182044] dark:text-[#eef1ff] border border-black/5 dark:border-white/10 rounded-bl-sm'
                      }`}
                    >
                      {/* Quoted Reply Block */}
                      {m.reply_to_snippet && (
                        <div
                          className={`mb-2 p-2 rounded-xl text-[11px] border-l-2 ${
                            isMe
                              ? 'bg-black/20 border-white text-white/95'
                              : 'bg-black/5 dark:bg-white/5 border-[var(--accent)] text-[#40516c] dark:text-[#aeb8dc]'
                          }`}
                        >
                          <span className="font-bold block truncate opacity-90">{m.reply_to_snippet}</span>
                        </div>
                      )}

                      {/* WhatsApp Style Voice Audio Note */}
                      {isAudio && m.file_url ? (
                        <VoiceNotePlayer audioUrl={m.file_url} duration={m.file_size} isMe={isMe} />
                      ) : m.file_url ? (
                        /* Attached Image or File Preview */
                        <div className="mb-2">
                          {isImage ? (
                            <div className="rounded-xl overflow-hidden border border-white/20 mb-1 max-w-sm">
                              <img
                                src={m.file_url}
                                alt={m.file_name || 'Attached Image'}
                                className="w-full max-h-60 object-cover"
                              />
                            </div>
                          ) : (
                            <div className="p-2.5 rounded-xl bg-black/10 dark:bg-white/10 flex items-center justify-between gap-3 mb-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-5 h-5 shrink-0 text-[#8ce7f2]" />
                                <div className="min-w-0">
                                  <span className="font-bold text-xs block truncate max-w-[200px]">
                                    {m.file_name}
                                  </span>
                                  <span className="text-[10px] opacity-80">{m.file_size}</span>
                                </div>
                              </div>
                              <a
                                href={m.file_url}
                                download={m.file_name}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-current transition-colors"
                                title="Download"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            </div>
                          )}
                        </div>
                      ) : null}

                      {/* Regular Text Content */}
                      {m.content && (!m.file_url || (!m.content.startsWith('Shared file:') && m.content !== '🎤 Voice note')) && (
                        <p className="m-0 break-words">{m.content}</p>
                      )}
                    </div>

                    {/* Emoji Reaction Badges Below Message */}
                    {m.reactions && Object.keys(m.reactions).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1 px-1">
                        {Object.entries(m.reactions).map(([emoji, users]) => {
                          const hasReacted = users.includes(user?.name || '');
                          return (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => handleReactToMessage(m.id, emoji)}
                              title={users.join(', ')}
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all flex items-center gap-1 cursor-pointer ${
                                hasReacted
                                  ? 'bg-[var(--accent)]/20 border-[var(--accent)] text-[var(--accent)] font-black'
                                  : 'bg-white/70 dark:bg-white/10 border-black/5 dark:border-white/10 text-[#40516c] dark:text-[#cbd4ff]'
                              }`}
                            >
                              <span>{emoji}</span>
                              <span>{users.length}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* WhatsApp Timestamp, Star & Blue Ticks */}
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-[#8491a5] dark:text-[#8898b3] px-1">
                      {isStarred && (
                        <span title="Starred message" className="inline-flex items-center">
                          <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
                        </span>
                      )}
                      <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {isMe && (
                        m.is_read ? (
                          <span title="Read">
                            <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                          </span>
                        ) : (activeFriend?.status === 'online' || activeFriend?.status === 'in_call' || m.status === 'delivered') ? (
                          <span title="Delivered">
                            <CheckCheck className="w-3.5 h-3.5 text-[#8696a0]" />
                          </span>
                        ) : (
                          <span title="Sent">
                            <Check className="w-3.5 h-3.5 text-[#8696a0]" />
                          </span>
                        )
                      )}
                    </div>
                  </div>
                );
              })
            )}
            {/* WhatsApp-Style Animated In-Stream Typing Bubble */}
            {isTyping && (
              <div className="flex items-center gap-2.5 p-2 px-3.5 max-w-[130px] rounded-2xl bg-white/70 dark:bg-[#1a2249] border border-black/5 dark:border-white/10 shadow-sm animate-in fade-in duration-200 mb-2">
                <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#8cf4ff] to-[#d6a2ff] flex items-center justify-center text-[10px] font-bold text-[#171a42] shrink-0">
                  {activeFriend.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex items-center gap-1 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Replying Banner (if user clicked reply on any message) */}
          {replyingTo && (
            <div className="px-5 py-2 bg-[var(--accent)]/15 border-t border-black/5 dark:border-white/10 flex items-center justify-between text-xs text-[#182044] dark:text-[#f1f3ff] animate-in fade-in duration-150">
              <div className="flex items-center gap-2 truncate">
                <Reply className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                <span className="truncate">
                  Replying to <b className="text-[var(--accent)]">{replyingTo.sender_name}</b>: {replyingTo.content}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="w-6 h-6 rounded-full hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center shrink-0 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Message Input Box with Voice Note Recording & WhatsApp Menus */}
          <div className="p-3 md:p-4 border-t border-black/5 dark:border-white/10 bg-white/40 dark:bg-white/5 relative">
            {isBlocked ? (
              <div className="p-3 text-center text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-center gap-2">
                <span>You blocked this contact.</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsBlocked(false);
                    onShowToast(`Unblocked @${activeFriend.connect_id}`);
                  }}
                  className="font-bold underline text-rose-300 hover:text-white cursor-pointer ml-1"
                >
                  Unblock
                </button>
              </div>
            ) : isRecordingVoice ? (
              /* Live Voice Recording UI */
              <div className="h-12 px-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-4 animate-in fade-in duration-200">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
                  <span className="text-xs font-bold text-rose-500 flex items-center gap-1.5">
                    Recording Audio… {Math.floor(voiceRecordSeconds / 60)}:{voiceRecordSeconds % 60 < 10 ? '0' : ''}{voiceRecordSeconds % 60}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCancelVoiceRecord}
                    title="Discard voice note"
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-rose-500/20 text-rose-400 font-bold text-xs flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Cancel</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleStopAndSendVoiceRecord}
                    title="Send voice note"
                    className="px-4 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-rose-500/30 transition-all cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Audio</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Normal WhatsApp Input Box */
              <form onSubmit={handleSendMessage} className="flex items-center gap-2 relative">
                {/* Emoji Picker Popover */}
                {isEmojiPickerOpen && (
                  <div className="emoji-picker-container absolute bottom-14 left-0 w-72 bg-[#111b21] border border-white/10 rounded-2xl shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="text-[11px] font-bold text-[#8ce7f2] mb-2 px-1">Emojis</div>
                    <div className="grid grid-cols-7 gap-1.5 max-h-48 overflow-y-auto p-1">
                      {['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😚','😋','😛','😜','🤪','😎','🤩','🥳','😏','😒','😞','😔','😟','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','🤗','🤔','🤫','🤥','😶','😐','😑','😬','🙄','🥱','😴','😷','🤒','🤑','🤠','😈','👿','💩','👻','💀','👽','🤖','🎃','👏','👍','👎','👊','✊','🤛','🤜','🤞','✌️','🤟','🤘','👌','🤌','👈','👉','👆','👇','☝️','✋','🤚','🖐','👋','🤝','🙏','💪','🦾','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💓','💗','💖','💘','💝','🔥','✨','🎉','🚀','💯','⭐','🌟','⚡','☀️','☕','🍔','🍕','🎉'].map(emoji => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => handleSelectEmoji(emoji)}
                          className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-base hover:scale-125 transition-transform cursor-pointer"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* WhatsApp Circular Attachment Popover */}
                {isAttachmentMenuOpen && (
                  <div className="attachment-menu-container absolute bottom-14 left-8 bg-[#111b21] border border-white/10 rounded-2xl shadow-2xl p-3 z-50 flex items-center gap-3 animate-in fade-in zoom-in-95 duration-150">
                    <button
                      type="button"
                      onClick={() => handleSelectAttachmentType('image')}
                      className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-white/10 transition-colors group cursor-pointer"
                      title="Photos & Videos"
                    >
                      <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-lg group-hover:scale-105 transition-transform">
                        <ImageIcon className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] text-white/80 font-medium">Photos</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectAttachmentType('doc')}
                      className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-white/10 transition-colors group cursor-pointer"
                      title="Documents & Files"
                    >
                      <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-blue-500 to-cyan-600 flex items-center justify-center text-white shadow-lg group-hover:scale-105 transition-transform">
                        <FileText className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] text-white/80 font-medium">Document</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectAttachmentType('audio')}
                      className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-white/10 transition-colors group cursor-pointer"
                      title="Audio Note or File"
                    >
                      <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-lg group-hover:scale-105 transition-transform">
                        <Music className="w-5 h-5" />
                      </div>
                      <span className="text-[10px] text-white/80 font-medium">Audio</span>
                    </button>
                  </div>
                )}

                {/* Emoji Picker Trigger */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEmojiPickerOpen(!isEmojiPickerOpen);
                    setIsAttachmentMenuOpen(false);
                  }}
                  title="Emoji"
                  className="emoji-picker-btn w-10 h-10 rounded-xl flex items-center justify-center bg-white/80 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-[#6f7899] dark:text-[#cbd4ff] transition-all cursor-pointer shadow-sm shrink-0"
                >
                  <Smile className="w-5 h-5" />
                </button>

                {/* Attachment Paperclip Trigger */}
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAttachmentMenuOpen(!isAttachmentMenuOpen);
                    setIsEmojiPickerOpen(false);
                  }}
                  title="Attach file, photo or document"
                  className="attachment-menu-btn w-10 h-10 rounded-xl flex items-center justify-center bg-white/80 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-[#6f7899] dark:text-[#cbd4ff] transition-all cursor-pointer disabled:opacity-50 shadow-sm shrink-0"
                >
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                </button>

                {/* WhatsApp Mic Recording Trigger */}
                <button
                  type="button"
                  onClick={handleStartVoiceRecord}
                  title="Record voice note"
                  className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/80 dark:bg-white/10 hover:bg-rose-500 hover:text-white text-[#6f7899] dark:text-[#cbd4ff] transition-all cursor-pointer shadow-sm active:scale-95 shrink-0"
                >
                  <Mic className="w-4 h-4" />
                </button>

                <input
                  type="text"
                  value={inputMessage}
                  onChange={handleInputChange}
                  placeholder={`Type a message...`}
                  className="flex-1 h-10 px-4 rounded-xl border border-[#cbd5ff]/60 dark:border-white/10 bg-white/80 dark:bg-[#0c1230] text-xs text-[#182044] dark:text-[#eef1ff] placeholder-[#71809a] focus:outline-none focus:border-[#25d366] shadow-inner"
                />

                <button
                  type="submit"
                  disabled={!inputMessage.trim()}
                  className="w-10 h-10 rounded-xl bg-gradient-to-r from-[#128c7e] to-[#25d366] hover:brightness-110 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer shadow-md shadow-[#25d366]/30 disabled:opacity-40 shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>
        </div>
      ) : (
        /* Empty Right Pane when no friend is selected (Laptop/Desktop only) */
        <div className="hidden md:flex flex-1 flex-col items-center justify-center text-center p-8 text-[#71809a]">
          <div className="w-16 h-16 rounded-3xl bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center mb-3">
            <MessageSquare className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-[#182044] dark:text-[#f1f3ff] mb-1">
            Vertex Connect Messaging
          </h3>
          <p className="text-xs text-[#6f7899] dark:text-[#aeb8dc] max-w-sm mb-4">
            Search for a teammate above using their Connect ID (e.g. <strong className="text-[var(--accent)]">@username</strong>) and click Connect to start chatting!
          </p>
        </div>
      )}

      {/* User Details Preview Modal */}
      {selectedUserPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#071a36]/60 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl glass-panel p-6 shadow-2xl bg-white/95 dark:bg-[#151c3b]/95 border border-white/40 dark:border-white/10 text-center relative animate-in zoom-in-95 duration-200">
            <button
              type="button"
              onClick={() => setSelectedUserPreview(null)}
              className="absolute right-4 top-4 p-1.5 rounded-lg text-[#71809a] hover:bg-black/5 dark:hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#8cf4ff] via-[#8d8cff] to-[#d6a2ff] flex items-center justify-center text-[#171a42] font-black text-2xl mx-auto shadow-xl mb-3">
              {selectedUserPreview.name.slice(0, 2).toUpperCase()}
            </div>

            <h3 className="text-lg font-bold text-[#182044] dark:text-[#f1f3ff] leading-snug">
              {selectedUserPreview.name}
            </h3>
            <span className="text-xs font-bold text-[var(--accent)] bg-[var(--accent)]/10 px-2 py-0.5 rounded-full inline-block mt-0.5 mb-2">
              @{selectedUserPreview.connect_id}
            </span>

            <p className="text-xs text-[#6f7899] dark:text-[#aeb8dc] my-3 leading-relaxed">
              {selectedUserPreview.bio || 'Vertex Connect teammate.'}
            </p>

            <div className="pt-3 border-t border-black/5 dark:border-white/10 flex items-center justify-center gap-2">
              {selectedUserPreview.connection_status === 'accepted' ? (
                <button
                  type="button"
                  onClick={() => {
                    const found = friends.find((f) => f.user_id === selectedUserPreview.id);
                    if (found) setActiveFriend(found);
                    setSelectedUserPreview(null);
                  }}
                  className="w-full py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#718bff] to-[#9b83f7] shadow-md cursor-pointer"
                >
                  Open Chat
                </button>
              ) : selectedUserPreview.connection_status === 'pending' ? (
                <span className="text-xs font-bold text-[#d17b22] py-2">
                  Request Pending
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    handleSendConnectRequest(selectedUserPreview.connect_id);
                    setSelectedUserPreview(null);
                  }}
                  className="w-full py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#718bff] to-[#9b83f7] hover:brightness-110 flex items-center justify-center gap-2 shadow-md cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Send Connection Request</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* WHATSAPP MODAL 1: Contact Info Slide-Over Drawer */}
      {isContactInfoOpen && activeFriend && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm h-full bg-[#111b21] text-white flex flex-col border-l border-white/10 shadow-2xl animate-in slide-in-from-right duration-250 overflow-y-auto">
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center gap-3 sticky top-0 bg-[#111b21] z-10">
              <button
                type="button"
                onClick={() => setIsContactInfoOpen(false)}
                className="p-1.5 rounded-xl hover:bg-white/10 text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <h3 className="font-bold text-sm">Contact info</h3>
            </div>

            {/* Profile Overview */}
            <div className="p-6 flex flex-col items-center text-center border-b border-white/10 bg-[#0c1317]">
              <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-[#128c7e] via-[#25d366] to-[#8ce7f2] flex items-center justify-center text-[#111b21] font-black text-3xl shadow-xl mb-3">
                {activeFriend.name.slice(0, 2).toUpperCase()}
              </div>
              <h2 className="text-lg font-bold">{activeFriend.name}</h2>
              <span className="text-xs text-[#25d366] font-semibold mt-0.5">@{activeFriend.connect_id}</span>
              <span className="text-[11px] text-[#8696a0] mt-1 capitalize">{activeFriend.status}</span>
            </div>

            {/* About / Bio */}
            <div className="p-4 border-b border-white/10">
              <span className="text-[11px] text-[#8696a0] uppercase font-bold tracking-wider">About</span>
              <p className="text-xs text-white/90 mt-1 leading-relaxed">
                {activeFriend.bio || 'Vertex Connect member.'}
              </p>
            </div>

            {/* Media, Links and Docs Shortcut */}
            <div
              onClick={() => {
                setIsContactInfoOpen(false);
                setIsMediaModalOpen(true);
              }}
              className="p-4 border-b border-white/10 hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <ImageIcon className="w-5 h-5 text-[#8ce7f2]" />
                <div>
                  <div className="text-xs font-semibold">Media, links and docs</div>
                  <div className="text-[10px] text-[#8696a0]">{sharedMediaFiles.length} items shared</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#8696a0]" />
            </div>

            {/* Starred Messages Shortcut */}
            <div
              onClick={() => {
                setIsContactInfoOpen(false);
                setIsStarredMessagesModalOpen(true);
              }}
              className="p-4 border-b border-white/10 hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <Star className="w-5 h-5 text-amber-400" />
                <div>
                  <div className="text-xs font-semibold">Starred messages</div>
                  <div className="text-[10px] text-[#8696a0]">{starredMessagesList.length} starred</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#8696a0]" />
            </div>

            {/* Privacy & Settings */}
            <div className="p-4 border-b border-white/10 space-y-4">
              <div
                onClick={() => setIsMuteModalOpen(true)}
                className="flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <BellOff className="w-5 h-5 text-[#8696a0]" />
                  <span className="text-xs font-medium">Mute notifications</span>
                </div>
                <span className="text-xs text-[#25d366] font-semibold">{isMuted ? 'Muted' : 'Off'}</span>
              </div>

              <div
                onClick={() => setIsDisappearingModalOpen(true)}
                className="flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-[#8696a0]" />
                  <span className="text-xs font-medium">Disappearing messages</span>
                </div>
                <span className="text-xs text-[#25d366] font-semibold">{disappearingOption !== 'off' ? disappearingOption : 'Off'}</span>
              </div>
            </div>

            {/* Encryption Notice */}
            <div className="p-4 border-b border-white/10 flex items-start gap-3">
              <Shield className="w-5 h-5 text-[#25d366] shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold">Encryption</div>
                <p className="text-[10px] text-[#8696a0] mt-0.5 leading-relaxed">
                  Messages and calls are end-to-end encrypted. No one outside of this chat, not even Vertex Connect, can read or listen to them.
                </p>
              </div>
            </div>

            {/* Block / Report Actions */}
            <div className="p-4 mt-auto">
              <button
                type="button"
                onClick={() => {
                  setIsBlocked(!isBlocked);
                  onShowToast(isBlocked ? `Unblocked @${activeFriend.connect_id}` : `Blocked @${activeFriend.connect_id}`);
                }}
                className="w-full py-2.5 rounded-xl text-xs font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Ban className="w-4 h-4" />
                <span>{isBlocked ? `Unblock @${activeFriend.connect_id}` : `Block @${activeFriend.connect_id}`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WHATSAPP MODAL 2: Media, Links and Docs */}
      {isMediaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-[#111b21] rounded-3xl border border-white/10 shadow-2xl p-5 text-white flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="font-bold text-sm">Media, links, and docs</h3>
              <button
                type="button"
                onClick={() => setIsMediaModalOpen(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 py-3 border-b border-white/10 text-xs">
              {(['media', 'docs', 'audio'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setMediaTab(tab)}
                  className={`px-3 py-1.5 rounded-xl font-semibold capitalize cursor-pointer transition-colors ${
                    mediaTab === tab ? 'bg-[#128c7e] text-white' : 'text-[#8696a0] hover:bg-white/5'
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
                  <div className="text-center py-12 text-[#8696a0] text-xs">No media shared yet</div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {sharedMediaFiles
                      .filter(m => m.file_type?.startsWith('image/') || (m.file_name && /\.(png|jpe?g|gif|webp)$/i.test(m.file_name)))
                      .map(m => (
                        <a
                          key={m.id}
                          href={m.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="aspect-square rounded-xl overflow-hidden border border-white/10 hover:opacity-80 transition-opacity bg-black/20"
                        >
                          <img src={m.file_url} alt={m.file_name || 'Media'} className="w-full h-full object-cover" />
                        </a>
                      ))}
                  </div>
                )
              )}

              {mediaTab === 'docs' && (
                sharedMediaFiles.filter(m => !m.file_type?.startsWith('image/') && !m.file_type?.startsWith('audio/') && !m.content?.startsWith('🎤')).length === 0 ? (
                  <div className="text-center py-12 text-[#8696a0] text-xs">No documents shared yet</div>
                ) : (
                  <div className="space-y-2">
                    {sharedMediaFiles
                      .filter(m => !m.file_type?.startsWith('image/') && !m.file_type?.startsWith('audio/') && !m.content?.startsWith('🎤'))
                      .map(m => (
                        <div key={m.id} className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <FileText className="w-5 h-5 text-[#8ce7f2] shrink-0" />
                            <div className="min-w-0">
                              <span className="text-xs font-semibold block truncate">{m.file_name}</span>
                              <span className="text-[10px] text-[#8696a0]">{m.file_size || 'Document'}</span>
                            </div>
                          </div>
                          <a
                            href={m.file_url}
                            download={m.file_name}
                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
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
                  <div className="text-center py-12 text-[#8696a0] text-xs">No voice notes shared yet</div>
                ) : (
                  <div className="space-y-2">
                    {sharedMediaFiles
                      .filter(m => m.file_type?.startsWith('audio/') || m.content === '🎤 Voice note')
                      .map(m => (
                        <div key={m.id} className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <Music className="w-5 h-5 text-amber-400" />
                            <div>
                              <span className="text-xs font-semibold block">Voice note</span>
                              <span className="text-[10px] text-[#8696a0]">{new Date(m.created_at).toLocaleString()}</span>
                            </div>
                          </div>
                          {m.file_url && <audio src={m.file_url} controls className="h-8 max-w-[200px]" />}
                        </div>
                      ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* WHATSAPP MODAL 3: Mute Notifications Dialog */}
      {isMuteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-[#111b21] rounded-3xl border border-white/10 shadow-2xl p-6 text-white space-y-4">
            <h3 className="font-bold text-sm">Mute notifications</h3>
            <p className="text-xs text-[#8696a0]">
              Other participants will not see that you muted this chat. You will still receive notifications if you are mentioned.
            </p>
            <div className="space-y-2 text-xs">
              {['8 hours', '1 week', 'Always'].map((option, idx) => (
                <label key={option} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 cursor-pointer">
                  <input type="radio" name="muteDuration" defaultChecked={idx === 2} className="accent-[#25d366]" />
                  <span>{option}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsMuteModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#8696a0] hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsMuted(true);
                  setIsMuteModalOpen(false);
                  onShowToast('Notifications muted');
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#128c7e] hover:bg-[#25d366] text-white shadow-md cursor-pointer"
              >
                Mute
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WHATSAPP MODAL 4: Disappearing Messages Dialog */}
      {isDisappearingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-[#111b21] rounded-3xl border border-white/10 shadow-2xl p-6 text-white space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#8ce7f2]" />
              <h3 className="font-bold text-sm">Disappearing messages</h3>
            </div>
            <p className="text-xs text-[#8696a0]">
              Make messages in this chat disappear for more privacy. Anyone in the chat can change this setting.
            </p>
            <div className="space-y-2 text-xs">
              {(['24h', '7d', '90d', 'off'] as const).map(opt => (
                <label
                  key={opt}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 cursor-pointer"
                  onClick={() => setDisappearingOption(opt)}
                >
                  <span className="capitalize">{opt === 'off' ? 'Off' : opt === '24h' ? '24 hours' : opt === '7d' ? '7 days' : '90 days'}</span>
                  <input
                    type="radio"
                    name="disappearing"
                    checked={disappearingOption === opt}
                    onChange={() => setDisappearingOption(opt)}
                    className="accent-[#25d366]"
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
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#128c7e] hover:bg-[#25d366] text-white shadow-md cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WHATSAPP MODAL 5: Wallpaper Selector */}
      {isWallpaperModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-[#111b21] rounded-3xl border border-white/10 shadow-2xl p-6 text-white space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-[#8ce7f2]" />
                <h3 className="font-bold text-sm">Set chat wallpaper</h3>
              </div>
              <button type="button" onClick={() => setIsWallpaperModalOpen(false)} className="p-1 rounded-lg hover:bg-white/10">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              {[
                { id: 'doodle', name: 'WhatsApp Doodle', class: 'bg-[#0b141a] bg-[radial-gradient(#128c7e_1px,transparent_1px)] [background-size:12px_12px]' },
                { id: 'emerald', name: 'Dark Forest', class: 'bg-gradient-to-b from-[#0b141a] via-[#07241f] to-[#0b141a]' },
                { id: 'navy', name: 'Midnight Navy', class: 'bg-gradient-to-b from-[#0b1329] via-[#101b3b] to-[#070b1a]' },
                { id: 'dark', name: 'Pitch Dark', class: 'bg-[#111b21]' },
                { id: 'default', name: 'Classic Clean', class: 'bg-white/20 dark:bg-white/5' }
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
                    chatWallpaper === w.id ? 'border-[#25d366] shadow-lg shadow-[#25d366]/20' : 'border-white/10'
                  }`}
                >
                  <div className={`w-full h-16 rounded-xl ${w.class}`} />
                  <span className="text-[11px] font-semibold">{w.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* WHATSAPP MODAL 6: Clear Chat Modal */}
      {isClearChatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xs bg-[#111b21] rounded-3xl border border-white/10 shadow-2xl p-6 text-white space-y-4">
            <h3 className="font-bold text-sm">Clear this chat?</h3>
            <p className="text-xs text-[#8696a0]">
              Messages will only be removed from this device and your chat history.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsClearChatModalOpen(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[#8696a0] hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearChat}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white cursor-pointer"
              >
                Clear chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WHATSAPP MODAL 7: Block Contact Modal */}
      {isBlockModalOpen && activeFriend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-xs bg-[#111b21] rounded-3xl border border-white/10 shadow-2xl p-6 text-white space-y-4">
            <h3 className="font-bold text-sm">{isBlocked ? `Unblock @${activeFriend.connect_id}?` : `Block @${activeFriend.connect_id}?`}</h3>
            <p className="text-xs text-[#8696a0]">
              {isBlocked
                ? 'Unblocked contacts will be able to call you and send you messages.'
                : 'Blocked contacts will no longer be able to call you or send you messages.'}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsBlockModalOpen(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[#8696a0] hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsBlocked(!isBlocked);
                  setIsBlockModalOpen(false);
                  onShowToast(isBlocked ? `Unblocked @${activeFriend.connect_id}` : `Blocked @${activeFriend.connect_id}`);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold text-white cursor-pointer ${
                  isBlocked ? 'bg-[#128c7e] hover:bg-[#25d366]' : 'bg-rose-500 hover:bg-rose-600'
                }`}
              >
                {isBlocked ? 'Unblock' : 'Block'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WHATSAPP MODAL 8: New Group Modal */}
      {isNewGroupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-[#111b21] rounded-3xl border border-white/10 shadow-2xl p-6 text-white space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-[#8ce7f2]" />
                <h3 className="font-bold text-sm">New group</h3>
              </div>
              <button type="button" onClick={() => setIsNewGroupModalOpen(false)} className="p-1 rounded-lg hover:bg-white/10">
                <X className="w-4 h-4" />
              </button>
            </div>

            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Group subject..."
              className="w-full h-10 px-3.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-[#8696a0] focus:outline-none focus:border-[#25d366]"
            />

            <div>
              <span className="text-[11px] font-bold text-[#8696a0] uppercase tracking-wider block mb-2">
                Add participants ({selectedGroupMembers.length} selected)
              </span>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {friends.length === 0 ? (
                  <div className="text-xs text-[#8696a0] py-4 text-center">No connections available</div>
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
                          isSelected ? 'bg-white/10 border border-[#25d366]/40' : 'hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#128c7e] to-[#25d366] flex items-center justify-center text-xs font-bold text-white">
                            {f.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="text-xs font-medium block">{f.name}</span>
                            <span className="text-[10px] text-[#8696a0]">@{f.connect_id}</span>
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="accent-[#25d366]"
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
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#8696a0] hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateGroup}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#128c7e] hover:bg-[#25d366] text-white shadow-md cursor-pointer"
              >
                Create Group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WHATSAPP MODAL 9: Linked Devices Modal */}
      {isLinkedDevicesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-[#111b21] rounded-3xl border border-white/10 shadow-2xl p-6 text-white space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Laptop className="w-5 h-5 text-[#8ce7f2]" />
                <h3 className="font-bold text-sm">Linked devices</h3>
              </div>
              <button type="button" onClick={() => setIsLinkedDevicesModalOpen(false)} className="p-1 rounded-lg hover:bg-white/10">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#8696a0] leading-relaxed">
              Use Vertex Connect on Web, Desktop and other devices simultaneously without keeping your phone online.
            </p>

            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-[#8ce7f2]">
                  <Laptop className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-semibold block">Windows · Chrome</span>
                  <span className="text-[10px] text-[#25d366] font-medium">Active now (This device)</span>
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
                className="w-full py-2.5 rounded-xl text-xs font-bold bg-white/10 hover:bg-rose-500/20 text-white hover:text-rose-400 transition-colors cursor-pointer"
              >
                Log out from all other devices
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WHATSAPP MODAL 10: Starred Messages Modal */}
      {isStarredMessagesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#111b21] rounded-3xl border border-white/10 shadow-2xl p-5 text-white flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-sm">Starred messages</h3>
              </div>
              <button type="button" onClick={() => setIsStarredMessagesModalOpen(false)} className="p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-2">
              {starredMessagesList.length === 0 ? (
                <div className="text-center py-12 text-[#8696a0] text-xs">
                  No starred messages yet. Hover over any message and click ⭐ to star it.
                </div>
              ) : (
                starredMessagesList.map(m => (
                  <div key={m.id} className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-[#8ce7f2]">{m.sender_name}</span>
                        <span className="text-[10px] text-[#8696a0]">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="text-xs text-white/90 break-words">{m.content || m.file_name || 'Attachment'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleStar(m.id)}
                      className="p-1 rounded-lg hover:bg-white/10 text-amber-400 cursor-pointer shrink-0"
                      title="Unstar"
                    >
                      <Star className="w-4 h-4 fill-amber-400" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

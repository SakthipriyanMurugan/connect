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
  X
} from 'lucide-react';
import type { ChatMessage, ConnectionUser, SearchUserResult } from '../../types';

interface MessagesPageProps {
  onStartCall: (name: string) => void;
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

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
      const res = await fetch(`http://localhost:8000/api/v1/connections?user_id=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setFriends(data.friends || []);
        setPendingIncoming(data.pending_incoming || []);
        setPendingOutgoing(data.pending_outgoing || []);

        // If no active friend selected, select first friend
        if (!activeFriend && data.friends?.length > 0) {
          setActiveFriend(data.friends[0]);
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
  }, [user]);

  // 2. Real-time WebSocket connection for user-isolated events
  useEffect(() => {
    if (!user) return;
    const ws = new WebSocket(`ws://localhost:8000/api/v1/ws/${user.id}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'new_message') {
          const newMsg: ChatMessage = data.message;
          // If message belongs to current open conversation
          if (activeFriend?.conversation_id === newMsg.conversation_id) {
            setMessages((prev) => [...prev, newMsg]);
          }
          onShowToast(`New message from ${newMsg.sender_name}`);
        } else if (data.type === 'connection_request') {
          onShowToast('You received a new connection request!');
          fetchConnections();
        } else if (data.type === 'connection_accepted') {
          onShowToast('Connection accepted! You can now chat.');
          fetchConnections();
        } else if (data.type === 'typing') {
          if (activeFriend && data.sender_id === activeFriend.user_id) {
            setIsTyping(!!data.is_typing);
          }
        }
      } catch (err) {
        console.error('WS parse error', err);
      }
    };

    return () => {
      ws.close();
    };
  }, [user, activeFriend]);

  // 3. Fetch message history when active friend changes
  useEffect(() => {
    if (!activeFriend?.conversation_id) {
      setMessages([]);
      return;
    }

    const fetchMessages = async () => {
      try {
        const res = await fetch(`http://localhost:8000/api/v1/messages/${activeFriend.conversation_id}`);
        if (res.ok) {
          const data: ChatMessage[] = await res.json();
          setMessages(data);
        }
      } catch (err) {
        console.error('Failed to load messages', err);
      }
    };

    fetchMessages();
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
        const res = await fetch(`http://localhost:8000/api/v1/users/search?q=${encodeURIComponent(raw)}&current_user_id=${user.id}`);
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
      const res = await fetch('http://localhost:8000/api/v1/connections/request', {
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
      const res = await fetch('http://localhost:8000/api/v1/connections/accept', {
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

  // 7. Send Real-Time Text Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !user || !activeFriend) return;

    const payload = {
      conversation_id: activeFriend.conversation_id,
      sender_id: user.id,
      sender_name: user.name,
      receiver_id: activeFriend.user_id,
      content: inputMessage.trim(),
    };

    setInputMessage('');

    try {
      const res = await fetch('http://localhost:8000/api/v1/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, data.message]);
      }
    } catch (err) {
      console.error('Error sending message', err);
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
      const uploadRes = await fetch('http://localhost:8000/api/v1/files/upload', {
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

        const sendRes = await fetch('http://localhost:8000/api/v1/messages/send', {
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

  return (
    <div className="glass-panel h-[calc(100vh-140px)] flex overflow-hidden border border-white/60 dark:border-white/10 shadow-2xl animate-in fade-in duration-300">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* LEFT SIDEBAR: Search by Connect ID + Friends List + Requests */}
      <div className="w-80 shrink-0 border-r border-black/5 dark:border-white/10 flex flex-col bg-white/40 dark:bg-white/5">
        {/* Search by Connect ID Bar */}
        <div className="p-4 border-b border-black/5 dark:border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#182044] dark:text-[#f1f3ff]">Messages</h2>
            <div className="flex items-center gap-1 text-[11px] font-bold text-[#8ce7f2] bg-[var(--accent)]/15 px-2 py-0.5 rounded-lg">
              <span>@{user?.connect_id}</span>
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
                            : f.status === 'away'
                            ? 'bg-[#d17b22]'
                            : f.status === 'busy'
                            ? 'bg-[#f04454]'
                            : 'bg-[#9aa9c0]'
                        }`}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <b className="text-xs font-bold text-[#182044] dark:text-[#f1f3ff] truncate">
                          {f.name}
                        </b>
                        <span className="text-[10px] text-[var(--accent)] font-semibold">
                          @{f.connect_id}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#6f7899] dark:text-[#aeb8dc] truncate mt-0.5 m-0">
                        {f.bio || 'Connected teammate'}
                      </p>
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
          <div className="h-16 px-6 border-b border-black/5 dark:border-white/10 flex items-center justify-between bg-white/40 dark:bg-white/5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#8cf4ff] via-[#8d8cff] to-[#d6a2ff] flex items-center justify-center font-bold text-xs text-[#171a42]">
                {activeFriend.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <b className="text-sm font-bold text-[#182044] dark:text-[#f1f3ff] leading-tight">
                    {activeFriend.name}
                  </b>
                  <span className="text-[10px] font-semibold text-[var(--accent)] bg-[var(--accent)]/10 px-1.5 py-0.2 rounded">
                    @{activeFriend.connect_id}
                  </span>
                </div>
                <small className="text-[11px] text-[#6f7899] dark:text-[#aeb8dc] flex items-center gap-1">
                  {isTyping ? (
                    <span className="text-[var(--accent)] font-bold animate-pulse">typing…</span>
                  ) : (
                    <span>{activeFriend.bio || 'Direct connection'}</span>
                  )}
                </small>
              </div>
            </div>

            {/* Quick Actions (Voice & Video Call) */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onStartCall(`${activeFriend.name} (@${activeFriend.connect_id}) - Audio`)}
                title="Voice call"
                className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/80 dark:bg-white/10 hover:bg-[var(--accent)] hover:text-white border border-black/5 dark:border-white/10 text-[#40516c] dark:text-[#cbd4ff] transition-all cursor-pointer shadow-sm"
              >
                <Phone className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onStartCall(`${activeFriend.name} (@${activeFriend.connect_id}) - Video`)}
                title="Video call"
                className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/80 dark:bg-white/10 hover:bg-[var(--accent)] hover:text-white border border-black/5 dark:border-white/10 text-[#40516c] dark:text-[#cbd4ff] transition-all cursor-pointer shadow-sm"
              >
                <Video className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setSelectedUserPreview({
                  id: activeFriend.user_id,
                  name: activeFriend.name,
                  connect_id: activeFriend.connect_id,
                  email: '',
                  bio: activeFriend.bio,
                  status: activeFriend.status,
                  connection_status: 'accepted'
                })}
                title="View user details"
                className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/80 dark:bg-white/10 hover:bg-black/10 border border-black/5 dark:border-white/10 text-[#40516c] dark:text-[#cbd4ff] transition-all cursor-pointer"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Thread (WhatsApp Style) */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="text-center">
              <span className="text-[10px] uppercase font-bold text-[#8491a5] dark:text-[#8898b3] bg-white/50 dark:bg-white/10 px-3 py-1 rounded-full border border-black/5 dark:border-white/10">
                End-to-End Encrypted Direct Channel with @{activeFriend.connect_id}
              </span>
            </div>

            {messages.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center text-[#71809a]">
                <MessageSquare className="w-10 h-10 mb-2 opacity-30 text-[var(--accent)]" />
                <p className="text-xs font-bold text-[#182044] dark:text-[#f1f3ff]">Connected with @{activeFriend.connect_id}</p>
                <span className="text-[11px] text-[#8491a5] mt-0.5">Send a message or share files to start collaborating!</span>
              </div>
            ) : (
              messages.map((m) => {
                const isMe = m.sender_id === user?.id;
                const isImage = m.file_type?.startsWith('image/') || (m.file_name && /\.(png|jpe?g|gif|webp)$/i.test(m.file_name));
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-full`}
                  >
                    <div
                      className={`max-w-[75%] p-3.5 rounded-2xl shadow-sm text-xs leading-relaxed ${
                        isMe
                          ? 'bg-gradient-to-r from-[#718bff] to-[#9b83f7] text-white rounded-br-sm'
                          : 'bg-white dark:bg-[#151c3b] text-[#182044] dark:text-[#eef1ff] border border-black/5 dark:border-white/10 rounded-bl-sm'
                      }`}
                    >
                      {/* Attached File Preview (WhatsApp Style) */}
                      {m.file_url && (
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
                      )}

                      {/* Text content */}
                      {m.content && (!m.file_url || !m.content.startsWith('Shared file:')) && (
                        <p className="m-0 break-words">{m.content}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 mt-1 text-[10px] text-[#8491a5] dark:text-[#8898b3] px-1">
                      <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {isMe && <CheckCheck className="w-3.5 h-3.5 text-[#2463d9]" />}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input Box with Attachment Button */}
          <form onSubmit={handleSendMessage} className="p-4 border-t border-black/5 dark:border-white/10 bg-white/40 dark:bg-white/5 flex items-center gap-2">
            {/* File Attachment Trigger */}
            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              title="Share photo, video, document, or audio"
              className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/80 dark:bg-white/10 hover:bg-[var(--accent)] hover:text-white text-[#6f7899] dark:text-[#cbd4ff] transition-all cursor-pointer disabled:opacity-50 shadow-sm"
            >
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => onShowToast('Audio note recording ready')}
              className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/80 dark:bg-white/10 hover:bg-black/10 text-[#6f7899] dark:text-[#cbd4ff] transition-all cursor-pointer"
            >
              <Mic className="w-4 h-4" />
            </button>

            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={`Message @${activeFriend.connect_id}...`}
              className="flex-1 h-10 px-4 rounded-xl border border-[#cbd5ff]/60 dark:border-white/10 bg-white/80 dark:bg-[#0c1230] text-xs text-[#182044] dark:text-[#eef1ff] placeholder-[#71809a] focus:outline-none focus:border-[var(--accent)] shadow-inner"
            />

            <button
              type="submit"
              disabled={!inputMessage.trim()}
              className="w-10 h-10 rounded-xl bg-gradient-to-r from-[#718bff] to-[#9b83f7] hover:brightness-110 active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer shadow-md shadow-[#718bff]/30 disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      ) : (
        /* Empty Right Pane when no friend is selected */
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-[#71809a]">
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
    </div>
  );
};

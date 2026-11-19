export type ThemeMode = 'light' | 'dark' | 'system';

export interface AppearanceSettings {
  theme: ThemeMode;
  accent: string;
  fontSize: string;
  fontFamily: 'system' | 'inter' | 'serif' | 'mono';
  compact: boolean;
  motion: boolean;
  labels: boolean;
}

export interface User {
  id: string;
  connect_id: string;
  name: string;
  email: string;
  bio?: string;
  avatar?: string;
  role: string;
  status: string;
  created_at?: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: 'free' | 'pilot' | 'pro' | 'enterprise';
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  receiver_id?: string;
  content: string;
  file_url?: string;
  file_name?: string;
  file_size?: string;
  file_type?: string;
  created_at: string;
  is_me?: boolean;
}

export interface ConnectionUser {
  connection_id: string;
  user_id: string;
  name: string;
  connect_id: string;
  bio?: string;
  status: string;
  avatar?: string;
  conversation_id?: string;
}

export interface SearchUserResult {
  id: string;
  connect_id: string;
  name: string;
  email: string;
  bio?: string;
  status: string;
  avatar?: string;
  connection_status: 'none' | 'pending' | 'accepted';
  connection_id?: string;
  is_sender?: boolean;
}

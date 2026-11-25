CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    connect_id TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    hashed_password TEXT NOT NULL,
    bio TEXT DEFAULT 'Hey there! I am using Vertex Connect.',
    role TEXT DEFAULT 'employee',
    status TEXT DEFAULT 'online',
    avatar TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS otp_codes (
    email TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    purpose TEXT DEFAULT 'signup',
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    email TEXT,
    connect_id TEXT,
    action TEXT NOT NULL,
    ip_address TEXT,
    status TEXT DEFAULT 'success',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_connections (
    id TEXT PRIMARY KEY,
    requester_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    workspace_id TEXT DEFAULT 'ws-1',
    conversation_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    receiver_id TEXT,
    content TEXT NOT NULL,
    file_url TEXT,
    file_name TEXT,
    file_size TEXT,
    file_type TEXT,
    reply_to_id TEXT,
    reply_to_snippet TEXT,
    reactions TEXT DEFAULT '{}',
    is_read INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    plan TEXT DEFAULT 'pilot',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    connect_id TEXT,
    description TEXT DEFAULT '',
    created_by TEXT NOT NULL,
    members TEXT DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    owner_id TEXT NOT NULL,
    members TEXT DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    time TEXT DEFAULT 'Upcoming',
    host_id TEXT,
    host_name TEXT DEFAULT 'You',
    room_name TEXT NOT NULL,
    is_live INTEGER DEFAULT 0,
    ai_notes_enabled INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS uploaded_files (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    file_name TEXT NOT NULL,
    file_size TEXT,
    file_type TEXT,
    file_url TEXT NOT NULL,
    shared_by TEXT DEFAULT 'You',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS meeting_intelligence (
    id TEXT PRIMARY KEY,
    room_name TEXT NOT NULL,
    title TEXT NOT NULL,
    caller_id TEXT,
    duration_seconds INTEGER DEFAULT 0,
    executive_summary TEXT NOT NULL,
    action_items TEXT DEFAULT '[]',
    key_decisions TEXT DEFAULT '[]',
    sentiment_score INTEGER DEFAULT 94,
    sentiment_label TEXT DEFAULT 'Highly Collaborative & Constructive',
    talk_time_breakdown TEXT DEFAULT '[]',
    status TEXT DEFAULT 'pending',
    supervisor_notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS call_quality_scorecards (
    id TEXT PRIMARY KEY,
    call_id TEXT NOT NULL,
    workspace_id TEXT,
    agent_id TEXT,
    agent_name TEXT,
    customer_identifier TEXT,
    duration_seconds INTEGER,
    language TEXT,
    overall_score REAL,
    dimensions TEXT,
    status TEXT,
    supervisor_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS calls (
    id TEXT PRIMARY KEY,
    caller_id TEXT NOT NULL,
    call_type TEXT DEFAULT 'video',
    call_status TEXT DEFAULT 'initiated',
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    answered_at TIMESTAMP,
    ended_at TIMESTAMP,
    duration INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS call_participants (
    id TEXT PRIMARY KEY,
    call_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP,
    participant_status TEXT DEFAULT 'joined'
);

CREATE TABLE IF NOT EXISTS call_events (
    id TEXT PRIMARY KEY,
    call_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_call_settings (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    allow_voice_calls INTEGER DEFAULT 1,
    allow_video_calls INTEGER DEFAULT 1,
    notification_enabled INTEGER DEFAULT 1,
    privacy_settings TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS call_notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    call_id TEXT NOT NULL,
    notification_type TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_connect_id ON users(connect_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_connections_users ON user_connections(requester_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_calls_caller ON calls(caller_id);
CREATE INDEX IF NOT EXISTS idx_call_participants_call ON call_participants(call_id, user_id);
CREATE INDEX IF NOT EXISTS idx_call_events_call ON call_events(call_id);
CREATE INDEX IF NOT EXISTS idx_call_notifications_user ON call_notifications(user_id);

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

CREATE INDEX IF NOT EXISTS idx_users_connect_id ON users(connect_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_connections_users ON user_connections(requester_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

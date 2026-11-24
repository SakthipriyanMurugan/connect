from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy import Column, String, Integer, DateTime, Boolean, Text, ForeignKey, JSON
from datetime import datetime
import uuid

Base = declarative_base()

def generate_uuid():
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    connect_id = Column(String, unique=True, index=True, nullable=False)  # Unique handle, e.g. @sakthi
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    bio = Column(String, default="Hey there! I am using Vertex Connect.")
    role = Column(String, default="employee")  # supervisor, employee, admin
    status = Column(String, default="online")  # online, away, busy, offline
    avatar = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class UserConnection(Base):
    __tablename__ = "user_connections"

    id = Column(String, primary_key=True, default=generate_uuid)
    requester_id = Column(String, ForeignKey("users.id"), index=True, nullable=False)
    receiver_id = Column(String, ForeignKey("users.id"), index=True, nullable=False)
    status = Column(String, default="pending")  # pending, accepted, rejected
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, index=True, nullable=False)
    plan = Column(String, default="pilot")
    created_at = Column(DateTime, default=datetime.utcnow)

class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, default=generate_uuid)
    workspace_id = Column(String, index=True, default="default")
    conversation_id = Column(String, index=True, nullable=False)
    sender_id = Column(String, index=True, nullable=False)
    sender_name = Column(String, nullable=False)
    receiver_id = Column(String, index=True, nullable=True)
    content = Column(Text, nullable=False)
    file_url = Column(String, nullable=True)
    file_name = Column(String, nullable=True)
    file_size = Column(String, nullable=True)
    file_type = Column(String, nullable=True)
    reply_to_id = Column(String, nullable=True)
    reply_to_snippet = Column(String, nullable=True)
    reactions = Column(JSON, default=dict)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class MeetingIntelligence(Base):
    __tablename__ = "meeting_intelligence"

    id = Column(String, primary_key=True, default=generate_uuid)
    room_name = Column(String, index=True, nullable=False)
    title = Column(String, nullable=False)
    caller_id = Column(String, index=True, nullable=True)
    duration_seconds = Column(Integer, default=0)
    executive_summary = Column(Text, nullable=False)
    action_items = Column(JSON, default=list)
    key_decisions = Column(JSON, default=list)
    sentiment_score = Column(Integer, default=94)
    sentiment_label = Column(String, default="Highly Collaborative & Constructive")
    talk_time_breakdown = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)

class CallQualityScorecard(Base):
    __tablename__ = "call_quality_scorecards"

    id = Column(String, primary_key=True, default=generate_uuid)
    call_id = Column(String, index=True, nullable=False)
    workspace_id = Column(String, index=True, nullable=False)
    agent_id = Column(String, index=True, nullable=False)
    agent_name = Column(String, nullable=False)
    customer_identifier = Column(String, nullable=True)
    duration_seconds = Column(Integer, default=0)
    language = Column(String, default="Tamil + English")
    overall_score = Column(Integer, default=0)
    dimensions = Column(JSON, nullable=False)
    status = Column(String, default="pending_review")  # pending_review, approved, amended
    supervisor_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Call(Base):
    __tablename__ = "calls"

    id = Column(String, primary_key=True, default=generate_uuid)
    caller_id = Column(String, ForeignKey("users.id"), index=True, nullable=False)
    call_type = Column(String, default="video")  # voice, video, group
    call_status = Column(String, default="initiated")  # initiated, ringing, accepted, rejected, missed, busy, ended, failed
    started_at = Column(DateTime, default=datetime.utcnow)
    answered_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    duration = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

class CallParticipant(Base):
    __tablename__ = "call_participants"

    id = Column(String, primary_key=True, default=generate_uuid)
    call_id = Column(String, ForeignKey("calls.id"), index=True, nullable=False)
    user_id = Column(String, ForeignKey("users.id"), index=True, nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow)
    left_at = Column(DateTime, nullable=True)
    participant_status = Column(String, default="joined")  # invited, ringing, joined, left, rejected, missed, busy

class CallEvent(Base):
    __tablename__ = "call_events"

    id = Column(String, primary_key=True, default=generate_uuid)
    call_id = Column(String, ForeignKey("calls.id"), index=True, nullable=False)
    event_type = Column(String, nullable=False)  # initiate, ring, accept, reject, end, mute, screen_share, reconnect
    user_id = Column(String, ForeignKey("users.id"), index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class UserCallSetting(Base):
    __tablename__ = "user_call_settings"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), unique=True, index=True, nullable=False)
    allow_voice_calls = Column(Boolean, default=True)
    allow_video_calls = Column(Boolean, default=True)
    notification_enabled = Column(Boolean, default=True)
    privacy_settings = Column(JSON, default=dict)

class CallNotification(Base):
    __tablename__ = "call_notifications"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), index=True, nullable=False)
    call_id = Column(String, ForeignKey("calls.id"), index=True, nullable=False)
    notification_type = Column(String, nullable=False)  # missed, incoming, busy
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

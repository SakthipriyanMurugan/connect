from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, status, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import random
import os
import re
from pathlib import Path
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_

from app.core.config import settings
from app.db.session import init_db, get_db
from app.db.d1_client import d1
from app.models.base import User as UserModel, UserConnection as ConnectionModel, Message as MessageModel
from app.core.security import hash_password, verify_password, create_access_token
from app.services.email_service import send_otp_email

# Ensure uploads folder exists
UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB tables on startup
    await init_db()
    # Check Cloudflare D1 connection
    try:
        d1_res = await d1.execute("SELECT 1 as ping;")
        if d1_res.get("success") or d1_res.get("results"):
            print(f"[Cloudflare D1] Connected to database connect ({settings.CLOUDFLARE_D1_DATABASE_ID})")
    except Exception as e:
        print(f"[Cloudflare D1] Warning: {e}")
    yield

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount uploads static directory for attachments
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

# Real-Time WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        # Maps user_id -> active WebSocket
        self.active_users: Dict[str, WebSocket] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_users[user_id] = websocket

    def disconnect(self, user_id: str):
        if user_id in self.active_users:
            del self.active_users[user_id]

    async def send_to_user(self, user_id: str, message: dict):
        if user_id in self.active_users:
            try:
                await self.active_users[user_id].send_json(message)
            except Exception:
                self.disconnect(user_id)

    async def broadcast(self, message: dict):
        disconnected = []
        for uid, conn in self.active_users.items():
            try:
                await conn.send_json(message)
            except Exception:
                disconnected.append(uid)
        for uid in disconnected:
            self.disconnect(uid)

manager = ConnectionManager()

# In-Memory OTP Store: { email: { "code": "123456", "expires_at": datetime } }
otp_store: Dict[str, dict] = {}

# ----------------- SCHEMAS -----------------

class SendOtpRequest(BaseModel):
    email: EmailStr
    purpose: str = "account verification"

class VerifyOtpRequest(BaseModel):
    email: EmailStr
    otp: str

class SignupRequest(BaseModel):
    name: str
    connect_id: str
    email: EmailStr
    password: str
    otp: Optional[str] = None

class LoginRequest(BaseModel):
    identifier: Optional[str] = None
    email: Optional[str] = None
    connect_id: Optional[str] = None
    password: Optional[str] = None
    otp: Optional[str] = None

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp: str
    new_password: str

class ProfileUpdateRequest(BaseModel):
    user_id: str
    name: Optional[str] = None
    bio: Optional[str] = None
    status: Optional[str] = None
    avatar: Optional[str] = None

class ConnectRequestModel(BaseModel):
    from_user_id: str
    target_connect_id: str

class AcceptConnectModel(BaseModel):
    connection_id: str
    user_id: str

class SendMessageModel(BaseModel):
    conversation_id: str
    sender_id: str
    sender_name: str
    receiver_id: Optional[str] = None
    content: str
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[str] = None
    file_type: Optional[str] = None

class UserResponse(BaseModel):
    id: str
    connect_id: str
    name: str
    email: str
    bio: Optional[str] = None
    role: str
    status: str
    avatar: Optional[str] = None
    created_at: Optional[datetime] = None

class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# ----------------- HELPER FUNCTIONS -----------------

def clean_connect_id(raw_id: str) -> str:
    cleaned = raw_id.strip().lower()
    if cleaned.startswith("@"):
        cleaned = cleaned[1:]
    return cleaned

# ----------------- ENDPOINTS -----------------

@app.get("/")
def root():
    return {
        "project": "VERTEX CONNECT",
        "status": "online",
        "version": "2.0.0",
        "database": f"Cloudflare D1 (connect: {settings.CLOUDFLARE_D1_DATABASE_ID}) + Local SQLite",
        "cloudflare_d1_id": settings.CLOUDFLARE_D1_DATABASE_ID,
        "email_service": f"Gmail SMTP Active ({settings.FROM_EMAIL})",
        "features": ["Cloudflare D1 Cloud Database", "Connect ID", "Unique Search", "User-isolated Messaging", "File Attachments"],
        "docs": "/docs"
    }

@app.get("/health")
@app.get(f"{settings.API_V1_STR}/health")
def health_check():
    return {"status": "healthy", "service": "vertex-connect-api"}

@app.get(f"{settings.API_V1_STR}/d1/status")
async def d1_status():
    try:
        user_count = await d1.fetch_one("SELECT COUNT(*) as count FROM users;")
        msg_count = await d1.fetch_one("SELECT COUNT(*) as count FROM messages;")
        conn_count = await d1.fetch_one("SELECT COUNT(*) as count FROM user_connections;")
        return {
            "connected": True,
            "database_name": "connect",
            "database_id": settings.CLOUDFLARE_D1_DATABASE_ID,
            "account_id": settings.CLOUDFLARE_ACCOUNT_ID,
            "cloud_users": user_count.get("count", 0) if user_count else 0,
            "cloud_messages": msg_count.get("count", 0) if msg_count else 0,
            "cloud_connections": conn_count.get("count", 0) if conn_count else 0
        }
    except Exception as e:
        return {"connected": False, "error": str(e)}

# 1. Check Connect ID Availability in Real-Time
@app.get(f"{settings.API_V1_STR}/auth/check-connect-id")
async def check_connect_id(
    id: Optional[str] = Query(None),
    connect_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    target = id or connect_id
    if not target:
        raise HTTPException(status_code=400, detail="Connect ID query parameter 'id' or 'connect_id' is required.")

    cleaned = clean_connect_id(target)
    if not re.match(r"^[a-zA-Z0-9_]{3,30}$", cleaned):
        return {
            "available": False,
            "connect_id": cleaned,
            "message": "Connect ID can only contain letters, numbers, and underscores (3-30 chars)."
        }
    
    stmt = select(UserModel).where(UserModel.connect_id == cleaned)
    res = await db.execute(stmt)
    existing = res.scalar_one_or_none()

    if existing:
        return {
            "available": False,
            "connect_id": cleaned,
            "message": f"@{cleaned} is already taken. Try another!"
        }
    
    return {
        "available": True,
        "connect_id": cleaned,
        "message": f"@{cleaned} is available!"
    }

# 2. Send OTP Endpoint
@app.post(f"{settings.API_V1_STR}/auth/send-otp")
async def send_otp(req: SendOtpRequest):
    otp_code = f"{random.randint(100000, 999999)}"
    expires_at = datetime.utcnow() + timedelta(minutes=10)
    
    otp_store[req.email] = {
        "code": otp_code,
        "expires_at": expires_at
    }
    
    sent = await send_otp_email(req.email, otp_code, req.purpose)
    if not sent:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send verification email. Please check SMTP settings."
        )

    return {
        "success": True,
        "message": f"Verification code sent to {req.email}",
        "expires_in_minutes": 10
    }

# 3. Verify OTP Endpoint
@app.post(f"{settings.API_V1_STR}/auth/verify-otp")
def verify_otp(req: VerifyOtpRequest):
    record = otp_store.get(req.email)
    if not record:
        raise HTTPException(status_code=400, detail="No OTP requested for this email or already expired.")
    
    if datetime.utcnow() > record["expires_at"]:
        del otp_store[req.email]
        raise HTTPException(status_code=400, detail="Verification code has expired. Please request a new one.")
    
    if record["code"].strip() != req.otp.strip():
        raise HTTPException(status_code=400, detail="Invalid verification code. Please check and try again.")
    
    del otp_store[req.email]
    
    return {
        "success": True,
        "verified": True,
        "message": "Email verified successfully."
    }

# 4. Signup with Connect ID & OTP
@app.post(f"{settings.API_V1_STR}/auth/signup", response_model=AuthResponse)
async def signup(req: SignupRequest, db: AsyncSession = Depends(get_db)):
    cleaned_id = clean_connect_id(req.connect_id)
    if not re.match(r"^[a-zA-Z0-9_]{3,30}$", cleaned_id):
        raise HTTPException(status_code=400, detail="Connect ID must be 3-30 alphanumeric characters.")

    if req.otp:
        record = otp_store.get(req.email)
        if not record or record["code"].strip() != req.otp.strip():
            raise HTTPException(status_code=400, detail="Invalid or expired verification code.")
        if datetime.utcnow() > record["expires_at"]:
            raise HTTPException(status_code=400, detail="Verification code has expired.")
        del otp_store[req.email]

    # Check if Connect ID is already taken
    stmt = select(UserModel).where(UserModel.connect_id == cleaned_id)
    res = await db.execute(stmt)
    if res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Connect ID @{cleaned_id} is already taken.")

    # Check if Email already exists
    email_stmt = select(UserModel).where(UserModel.email == req.email)
    email_res = await db.execute(email_stmt)
    if email_res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    # Count users
    count_stmt = select(func.count(UserModel.id))
    count_res = await db.execute(count_stmt)
    user_count = count_res.scalar_one()

    new_user = UserModel(
        connect_id=cleaned_id,
        email=req.email,
        name=req.name,
        hashed_password=hash_password(req.password),
        role="supervisor" if user_count == 0 else "employee",
        status="online",
        bio="Hey there! I am using Vertex Connect."
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    # Sync user to Cloudflare D1
    try:
        await d1.sync_user(new_user)
    except Exception as e:
        print(f"[Cloudflare D1] User sync notice: {e}")

    token = create_access_token(new_user.id)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": UserResponse(
            id=new_user.id,
            connect_id=new_user.connect_id,
            name=new_user.name,
            email=new_user.email,
            bio=new_user.bio,
            role=new_user.role,
            status=new_user.status,
            avatar=new_user.avatar,
            created_at=new_user.created_at
        )
    }

# 5. Login (Email or Connect ID or Identifier)
@app.post(f"{settings.API_V1_STR}/auth/login", response_model=AuthResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    raw_ident = (req.identifier or req.email or req.connect_id or "").strip()
    if not raw_ident:
        raise HTTPException(status_code=400, detail="Please enter your Connect ID or Email address.")

    clean_id = clean_connect_id(raw_ident)
    
    # Flexible lookup: match email (case-insensitive) OR connect_id (with or without @)
    stmt = select(UserModel).where(
        or_(
            func.lower(UserModel.email) == raw_ident.lower(),
            func.lower(UserModel.connect_id) == clean_id,
            func.lower(UserModel.connect_id) == raw_ident.lower()
        )
    )
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    # OTP login verification
    if req.otp:
        lookup_email = user.email if user else raw_ident
        record = otp_store.get(lookup_email)
        if not record or record["code"].strip() != req.otp.strip():
            raise HTTPException(status_code=400, detail="Invalid or expired OTP.")
        if datetime.utcnow() > record["expires_at"]:
            del otp_store[lookup_email]
            raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")
        del otp_store[lookup_email]
        
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No account found with '{raw_ident}'. Please sign up.")
    else:
        # Password check
        if not req.password:
            raise HTTPException(status_code=400, detail="Password or OTP required.")
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No account found for '{raw_ident}'. This Connect ID or Email is not registered. Please sign up."
            )
        if not verify_password(req.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect password. Please check your password or use 'Forgot Password' to sign in with OTP."
            )

    token = create_access_token(user.id)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": UserResponse(
            id=user.id,
            connect_id=user.connect_id,
            name=user.name,
            email=user.email,
            bio=user.bio,
            role=user.role,
            status=user.status,
            avatar=user.avatar,
            created_at=user.created_at
        )
    }

# 5b. Reset Password with OTP
@app.post(f"{settings.API_V1_STR}/auth/reset-password")
async def reset_password(req: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    record = otp_store.get(req.email)
    if not record or record["code"].strip() != req.otp.strip():
        raise HTTPException(status_code=400, detail="Invalid or expired OTP code.")
    if datetime.utcnow() > record["expires_at"]:
        del otp_store[req.email]
        raise HTTPException(status_code=400, detail="OTP code has expired. Please request a new one.")
    del otp_store[req.email]

    stmt = select(UserModel).where(func.lower(UserModel.email) == req.email.lower())
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No user registered with this email address.")

    user.hashed_password = hash_password(req.new_password)
    await db.commit()

    # Sync password update to Cloudflare D1
    try:
        await d1.sync_user(user)
    except Exception as e:
        print(f"[Cloudflare D1] Password sync notice: {e}")

    return {"success": True, "message": "Password reset successfully. You can now login with your new password."}

# 6. Update Profile
@app.put(f"{settings.API_V1_STR}/auth/profile", response_model=UserResponse)
async def update_profile(req: ProfileUpdateRequest, db: AsyncSession = Depends(get_db)):
    stmt = select(UserModel).where(UserModel.id == req.user_id)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if req.name is not None and req.name.strip():
        user.name = req.name.strip()
    if req.bio is not None:
        user.bio = req.bio.strip()
    if req.status is not None:
        user.status = req.status
    if req.avatar is not None:
        user.avatar = req.avatar

    await db.commit()
    await db.refresh(user)

    # Sync profile update to Cloudflare D1
    try:
        await d1.sync_user(user)
    except Exception as e:
        print(f"[Cloudflare D1] Profile sync notice: {e}")

    return UserResponse(
        id=user.id,
        connect_id=user.connect_id,
        name=user.name,
        email=user.email,
        bio=user.bio,
        role=user.role,
        status=user.status,
        avatar=user.avatar,
        created_at=user.created_at
    )

# 7. Search Users by Connect ID or Name
@app.get(f"{settings.API_V1_STR}/users/search")
async def search_users(q: str = Query(..., min_length=1), current_user_id: str = Query(""), db: AsyncSession = Depends(get_db)):
    cleaned = clean_connect_id(q)
    
    stmt = select(UserModel).where(
        or_(
            UserModel.connect_id.ilike(f"%{cleaned}%"),
            UserModel.name.ilike(f"%{q}%"),
            UserModel.email.ilike(f"%{q}%")
        )
    )
    res = await db.execute(stmt)
    users = res.scalars().all()

    # Find connection statuses with current user
    results = []
    for u in users:
        if u.id == current_user_id:
            continue
        
        # Check connection status
        conn_stmt = select(ConnectionModel).where(
            or_(
                and_(ConnectionModel.requester_id == current_user_id, ConnectionModel.receiver_id == u.id),
                and_(ConnectionModel.requester_id == u.id, ConnectionModel.receiver_id == current_user_id)
            )
        )
        conn_res = await db.execute(conn_stmt)
        conn = conn_res.scalar_one_or_none()

        status = "none"
        connection_id = None
        is_sender = False
        if conn:
            status = conn.status
            connection_id = conn.id
            is_sender = (conn.requester_id == current_user_id)

        results.append({
            "id": u.id,
            "connect_id": u.connect_id,
            "name": u.name,
            "email": u.email,
            "bio": u.bio,
            "status": u.status,
            "avatar": u.avatar,
            "connection_status": status,
            "connection_id": connection_id,
            "is_sender": is_sender
        })

    return results

# 8. Send Connection Request
@app.post(f"{settings.API_V1_STR}/connections/request")
async def request_connection(req: ConnectRequestModel, db: AsyncSession = Depends(get_db)):
    target_clean = clean_connect_id(req.target_connect_id)
    
    # Get target user
    stmt = select(UserModel).where(UserModel.connect_id == target_clean)
    res = await db.execute(stmt)
    target = res.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail=f"No user found with Connect ID @{target_clean}")

    if target.id == req.from_user_id:
        raise HTTPException(status_code=400, detail="You cannot connect with yourself.")

    # Check if connection already exists
    conn_stmt = select(ConnectionModel).where(
        or_(
            and_(ConnectionModel.requester_id == req.from_user_id, ConnectionModel.receiver_id == target.id),
            and_(ConnectionModel.requester_id == target.id, ConnectionModel.receiver_id == req.from_user_id)
        )
    )
    conn_res = await db.execute(conn_stmt)
    existing_conn = conn_res.scalar_one_or_none()

    if existing_conn:
        if existing_conn.status == "accepted":
            return {"success": True, "message": "Already connected!", "status": "accepted"}
        return {"success": True, "message": "Connection request already pending.", "status": "pending"}

    # Create new connection request
    new_conn = ConnectionModel(
        requester_id=req.from_user_id,
        receiver_id=target.id,
        status="pending"
    )
    db.add(new_conn)
    await db.commit()
    await db.refresh(new_conn)

    # Sync connection to Cloudflare D1
    try:
        await d1.sync_connection(new_conn)
    except Exception as e:
        print(f"[Cloudflare D1] Connection sync notice: {e}")

    # Notify target user via WebSocket if online
    await manager.send_to_user(target.id, {
        "type": "connection_request",
        "connection_id": new_conn.id,
        "from_user_id": req.from_user_id,
        "message": "You received a new connection request!"
    })

    return {
        "success": True,
        "message": f"Connection request sent to @{target.connect_id}!",
        "connection_id": new_conn.id,
        "status": "pending"
    }

# 9. Accept Connection Request
@app.post(f"{settings.API_V1_STR}/connections/accept")
async def accept_connection(req: AcceptConnectModel, db: AsyncSession = Depends(get_db)):
    stmt = select(ConnectionModel).where(ConnectionModel.id == req.connection_id)
    res = await db.execute(stmt)
    conn = res.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection request not found.")

    conn.status = "accepted"
    conn.updated_at = datetime.utcnow()
    await db.commit()

    # Sync accepted status to Cloudflare D1
    try:
        await d1.sync_connection(conn)
    except Exception as e:
        print(f"[Cloudflare D1] Accept sync notice: {e}")

    # Notify requester
    await manager.send_to_user(conn.requester_id, {
        "type": "connection_accepted",
        "connection_id": conn.id,
        "message": "Your connection request was accepted! You can now chat."
    })

    return {"success": True, "message": "Connection accepted! You can now chat."}

# 10. List User Connections (Friends & Pending)
@app.get(f"{settings.API_V1_STR}/connections")
async def list_connections(user_id: str = Query(...), db: AsyncSession = Depends(get_db)):
    stmt = select(ConnectionModel).where(
        or_(ConnectionModel.requester_id == user_id, ConnectionModel.receiver_id == user_id)
    )
    res = await db.execute(stmt)
    connections = res.scalars().all()

    friends = []
    pending_incoming = []
    pending_outgoing = []

    for c in connections:
        other_id = c.receiver_id if c.requester_id == user_id else c.requester_id
        user_stmt = select(UserModel).where(UserModel.id == other_id)
        user_res = await db.execute(user_stmt)
        other_user = user_res.scalar_one_or_none()
        if not other_user:
            continue

        item = {
            "connection_id": c.id,
            "user_id": other_user.id,
            "name": other_user.name,
            "connect_id": other_user.connect_id,
            "bio": other_user.bio,
            "status": other_user.status,
            "avatar": other_user.avatar,
            "created_at": c.created_at
        }

        if c.status == "accepted":
            # Generate consistent conversation_id for 1-to-1 chat
            ids = sorted([user_id, other_user.id])
            item["conversation_id"] = f"direct_{ids[0]}_{ids[1]}"
            friends.append(item)
        elif c.status == "pending":
            if c.receiver_id == user_id:
                pending_incoming.append(item)
            else:
                pending_outgoing.append(item)

    return {
        "friends": friends,
        "pending_incoming": pending_incoming,
        "pending_outgoing": pending_outgoing
    }

# 11. Send Message (Text & File Attachments)
@app.post(f"{settings.API_V1_STR}/messages/send")
async def send_message(req: SendMessageModel, db: AsyncSession = Depends(get_db)):
    new_msg = MessageModel(
        conversation_id=req.conversation_id,
        sender_id=req.sender_id,
        sender_name=req.sender_name,
        receiver_id=req.receiver_id,
        content=req.content,
        file_url=req.file_url,
        file_name=req.file_name,
        file_size=req.file_size,
        file_type=req.file_type
    )
    db.add(new_msg)
    await db.commit()
    await db.refresh(new_msg)

    # Sync chat message to Cloudflare D1
    try:
        await d1.sync_message(new_msg)
    except Exception as e:
        print(f"[Cloudflare D1] Message sync notice: {e}")

    payload = {
        "id": new_msg.id,
        "conversation_id": new_msg.conversation_id,
        "sender_id": new_msg.sender_id,
        "sender_name": new_msg.sender_name,
        "receiver_id": new_msg.receiver_id,
        "content": new_msg.content,
        "file_url": new_msg.file_url,
        "file_name": new_msg.file_name,
        "file_size": new_msg.file_size,
        "file_type": new_msg.file_type,
        "created_at": new_msg.created_at.isoformat()
    }

    # If receiver is specified, deliver directly to receiver
    if req.receiver_id:
        await manager.send_to_user(req.receiver_id, {
            "type": "new_message",
            "message": payload
        })
    else:
        # Broadcast to conversation
        await manager.broadcast({
            "type": "new_message",
            "message": payload
        })

    return {"success": True, "message": payload}

# 12. Get Messages for a Conversation
@app.get(f"{settings.API_V1_STR}/messages/{{conversation_id}}")
async def get_messages(conversation_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(MessageModel).where(
        MessageModel.conversation_id == conversation_id
    ).order_by(MessageModel.created_at.asc())
    res = await db.execute(stmt)
    msgs = res.scalars().all()

    return [
        {
            "id": m.id,
            "conversation_id": m.conversation_id,
            "sender_id": m.sender_id,
            "sender_name": m.sender_name,
            "receiver_id": m.receiver_id,
            "content": m.content,
            "file_url": m.file_url,
            "file_name": m.file_name,
            "file_size": m.file_size,
            "file_type": m.file_type,
            "created_at": m.created_at.isoformat()
        }
        for m in msgs
    ]

# 13. File Upload Endpoint (Attachments)
@app.post(f"{settings.API_V1_STR}/files/upload")
async def upload_file(file: UploadFile = File(...)):
    filename = f"{int(datetime.utcnow().timestamp())}_{file.filename.replace(' ', '_')}"
    file_path = UPLOADS_DIR / filename
    
    with open(file_path, "wb") as f:
        f.write(await file.read())

    file_size_bytes = os.path.getsize(file_path)
    size_str = f"{round(file_size_bytes / 1024, 1)} KB" if file_size_bytes < 1024 * 1024 else f"{round(file_size_bytes / (1024*1024), 2)} MB"

    return {
        "success": True,
        "file_url": f"http://localhost:8000/uploads/{filename}",
        "file_name": file.filename,
        "file_size": size_str,
        "file_type": file.content_type
    }

# 14. Realtime WebSocket for direct messaging, presence, and invites
@app.websocket(f"{settings.API_V1_STR}/ws/{{user_id}}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await manager.connect(user_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type", "message")
            
            if msg_type == "direct_message":
                target_user_id = data.get("target_user_id")
                if target_user_id:
                    await manager.send_to_user(target_user_id, {
                        "type": "direct_message",
                        "sender_id": user_id,
                        "payload": data.get("payload", {})
                    })
            elif msg_type == "typing":
                target_user_id = data.get("target_user_id")
                if target_user_id:
                    await manager.send_to_user(target_user_id, {
                        "type": "typing",
                        "sender_id": user_id,
                        "is_typing": data.get("is_typing", True)
                    })
    except WebSocketDisconnect:
        manager.disconnect(user_id)

import os
import json
import uuid
import logging
import subprocess
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

class CloudflareD1Client:
    def __init__(self):
        self.account_id = settings.CLOUDFLARE_ACCOUNT_ID
        self.database_id = settings.CLOUDFLARE_D1_DATABASE_ID
        self.base_url = f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}/d1/database/{self.database_id}/query"
        self._cached_token: Optional[str] = None

    def _get_token(self, force_refresh: bool = False) -> str:
        if not force_refresh and self._cached_token:
            return self._cached_token

        # If refresh requested or first time, try to refresh wrangler token via CLI
        if force_refresh:
            try:
                subprocess.run(["npx", "wrangler", "d1", "list"], capture_output=True, timeout=8, shell=True)
            except Exception as e:
                logger.warning(f"Auto-refresh wrangler token notice: {e}")

        # Check default.toml first for latest active OAuth token
        candidates = [
            Path(os.environ.get("APPDATA", "")) / "xdg.config" / ".wrangler" / "config" / "default.toml",
            Path.home() / ".config" / ".wrangler" / "config" / "default.toml"
        ]
        for p in candidates:
            if p.exists():
                try:
                    for line in p.read_text(encoding="utf-8").splitlines():
                        if line.strip().startswith("oauth_token"):
                            token = line.split("=", 1)[1].strip().strip('"').strip("'")
                            self._cached_token = token
                            return token
                except Exception as e:
                    logger.warning(f"Failed to read wrangler token from {p}: {e}")

        if settings.CLOUDFLARE_API_TOKEN:
            self._cached_token = settings.CLOUDFLARE_API_TOKEN
            return settings.CLOUDFLARE_API_TOKEN
        
        return ""

    async def execute(self, sql: str, params: Optional[List[Any]] = None) -> Dict[str, Any]:
        """Execute a raw SQL query or mutation on Cloudflare D1."""
        token = self._get_token()
        if not token:
            logger.warning("Cloudflare D1 token not found. Skipping D1 execution.")
            return {"success": False, "results": []}

        payload: Dict[str, Any] = {"sql": sql}
        if params is not None:
            formatted_params = []
            for p in params:
                if hasattr(p, "isoformat"):
                    formatted_params.append(p.isoformat())
                else:
                    formatted_params.append(p)
            payload["params"] = formatted_params

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
                res = await client.post(self.base_url, json=payload, headers=headers)
                
                # If token expired (401), auto-refresh token and retry once
                if res.status_code == 401:
                    token = self._get_token(force_refresh=True)
                    headers["Authorization"] = f"Bearer {token}"
                    res = await client.post(self.base_url, json=payload, headers=headers)

                if res.status_code == 200:
                    data = res.json()
                    if data.get("success") and data.get("result"):
                        return data["result"][0]
                    return {"success": False, "results": [], "error": data.get("errors")}
                else:
                    logger.error(f"D1 API returned status {res.status_code}: {res.text}")
                    return {"success": False, "results": [], "error": res.text}
        except Exception as e:
            logger.error(f"Exception executing Cloudflare D1 query: {e}")
            return {"success": False, "results": [], "error": str(e)}

    async def fetch_all(self, sql: str, params: Optional[List[Any]] = None) -> List[Dict[str, Any]]:
        """Fetch all rows matching the query from Cloudflare D1."""
        res = await self.execute(sql, params)
        return res.get("results", [])

    async def fetch_one(self, sql: str, params: Optional[List[Any]] = None) -> Optional[Dict[str, Any]]:
        """Fetch first matching row from Cloudflare D1."""
        rows = await self.fetch_all(sql, params)
        return rows[0] if rows else None

    # ----------------- 1. OTP & SECURITY LOGGING IN CLOUDFLARE D1 -----------------
    async def save_otp(self, email: str, code: str, purpose: str = "signup", expires_in_minutes: int = 10):
        """Save OTP to Cloudflare D1 table otp_codes."""
        now = datetime.utcnow().isoformat()
        expires_at = (datetime.utcnow() + timedelta(minutes=expires_in_minutes)).isoformat()
        sql = """
        INSERT OR REPLACE INTO otp_codes (email, code, purpose, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?);
        """
        await self.execute(sql, [email.strip().lower(), code.strip(), purpose, expires_at, now])
        await self.log_auth_event(None, email.strip().lower(), None, f"otp_requested_{purpose}", "success")

    async def get_otp(self, email: str) -> Optional[Dict[str, Any]]:
        """Get active OTP record from Cloudflare D1."""
        sql = "SELECT email, code, purpose, expires_at, created_at FROM otp_codes WHERE lower(email) = ?;"
        return await self.fetch_one(sql, [email.strip().lower()])

    async def delete_otp(self, email: str):
        """Delete used or expired OTP from Cloudflare D1."""
        sql = "DELETE FROM otp_codes WHERE lower(email) = ?;"
        await self.execute(sql, [email.strip().lower()])

    async def log_auth_event(self, user_id: Optional[str], email: Optional[str], connect_id: Optional[str], action: str, status: str = "success", ip_address: Optional[str] = None):
        """Log authentication event (signup, login, OTP) to Cloudflare D1 table auth_logs."""
        sql = """
        INSERT INTO auth_logs (id, user_id, email, connect_id, action, ip_address, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        """
        log_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        await self.execute(sql, [log_id, user_id, email, connect_id, action, ip_address or "web/mobile", status, now])

    # ----------------- 2. USER REGISTRATION & AUTH IN CLOUDFLARE D1 -----------------
    async def create_user(self, u_id: str, connect_id: str, email: str, name: str, hashed_password: str, bio: str = "", role: str = "employee", status: str = "online", avatar: str = "") -> Dict[str, Any]:
        """Insert brand new user directly into Cloudflare D1."""
        now = datetime.utcnow().isoformat()
        sql = """
        INSERT INTO users (id, connect_id, email, name, hashed_password, bio, role, status, avatar, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """
        await self.execute(sql, [
            u_id, connect_id.strip().lower(), email.strip().lower(), name.strip(),
            hashed_password, bio or "Hey there! I am using Vertex Connect.", role, status, avatar or "", now
        ])
        await self.log_auth_event(u_id, email, connect_id, "signup", "success")
        return {
            "id": u_id,
            "connect_id": connect_id.strip().lower(),
            "email": email.strip().lower(),
            "name": name.strip(),
            "bio": bio,
            "role": role,
            "status": status,
            "avatar": avatar,
            "created_at": now
        }

    async def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        sql = "SELECT id, connect_id, email, name, hashed_password, bio, role, status, avatar, created_at FROM users WHERE id = ?;"
        return await self.fetch_one(sql, [user_id])

    async def get_user_by_connect_id(self, connect_id: str) -> Optional[Dict[str, Any]]:
        cleaned = connect_id.strip().lower().replace("@", "")
        sql = "SELECT id, connect_id, email, name, hashed_password, bio, role, status, avatar, created_at FROM users WHERE lower(connect_id) = ?;"
        return await self.fetch_one(sql, [cleaned])

    async def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        sql = "SELECT id, connect_id, email, name, hashed_password, bio, role, status, avatar, created_at FROM users WHERE lower(email) = ?;"
        return await self.fetch_one(sql, [email.strip().lower()])

    async def get_user_by_identifier(self, identifier: str) -> Optional[Dict[str, Any]]:
        ident = identifier.strip().lower().replace("@", "")
        sql = """
        SELECT id, connect_id, email, name, hashed_password, bio, role, status, avatar, created_at
        FROM users
        WHERE lower(email) = ? OR lower(connect_id) = ?;
        """
        return await self.fetch_one(sql, [ident, ident])

    async def count_users(self) -> int:
        res = await self.fetch_one("SELECT COUNT(*) as count FROM users;")
        return res.get("count", 0) if res else 0

    async def update_user_status(self, user_id: str, status: str):
        sql = "UPDATE users SET status = ? WHERE id = ?;"
        await self.execute(sql, [status, user_id])

    async def update_user_password(self, email: str, new_hashed_password: str):
        sql = "UPDATE users SET hashed_password = ? WHERE lower(email) = ?;"
        await self.execute(sql, [new_hashed_password, email.strip().lower()])
        await self.log_auth_event(None, email, None, "password_reset", "success")

    async def update_user_profile(self, user_id: str, name: Optional[str] = None, bio: Optional[str] = None, status: Optional[str] = None, avatar: Optional[str] = None) -> Optional[Dict[str, Any]]:
        current = await self.get_user_by_id(user_id)
        if not current:
            return None
        new_name = name.strip() if name and name.strip() else current["name"]
        new_bio = bio.strip() if bio is not None else current["bio"]
        new_status = status if status is not None else current["status"]
        new_avatar = avatar if avatar is not None else current["avatar"]
        
        sql = "UPDATE users SET name = ?, bio = ?, status = ?, avatar = ? WHERE id = ?;"
        await self.execute(sql, [new_name, new_bio, new_status, new_avatar, user_id])
        return await self.get_user_by_id(user_id)

    async def search_users(self, query: str) -> List[Dict[str, Any]]:
        q = f"%{query.strip().lower().replace('@', '')}%"
        sql = """
        SELECT id, connect_id, email, name, bio, role, status, avatar, created_at
        FROM users
        WHERE lower(connect_id) LIKE ? OR lower(name) LIKE ? OR lower(email) LIKE ?
        LIMIT 25;
        """
        return await self.fetch_all(sql, [q, q, q])

    # ----------------- 3. CONNECTIONS & FRIENDS IN CLOUDFLARE D1 -----------------
    async def create_connection(self, conn_id: str, requester_id: str, receiver_id: str, status: str = "pending") -> Dict[str, Any]:
        now = datetime.utcnow().isoformat()
        sql = """
        INSERT OR REPLACE INTO user_connections (id, requester_id, receiver_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?);
        """
        await self.execute(sql, [conn_id, requester_id, receiver_id, status, now, now])
        return {"id": conn_id, "requester_id": requester_id, "receiver_id": receiver_id, "status": status, "created_at": now}

    async def get_connection_between(self, user1: str, user2: str) -> Optional[Dict[str, Any]]:
        sql = """
        SELECT id, requester_id, receiver_id, status, created_at, updated_at
        FROM user_connections
        WHERE (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?);
        """
        return await self.fetch_one(sql, [user1, user2, user2, user1])

    async def get_user_connections(self, user_id: str) -> List[Dict[str, Any]]:
        sql = """
        SELECT id, requester_id, receiver_id, status, created_at, updated_at
        FROM user_connections
        WHERE requester_id = ? OR receiver_id = ?;
        """
        return await self.fetch_all(sql, [user_id, user_id])

    async def update_connection_status(self, conn_id: str, status: str):
        now = datetime.utcnow().isoformat()
        sql = "UPDATE user_connections SET status = ?, updated_at = ? WHERE id = ?;"
        await self.execute(sql, [status, now, conn_id])

    # ----------------- 4. MESSAGES IN CLOUDFLARE D1 -----------------
    async def save_message(self, m_dict: Dict[str, Any]):
        sql = """
        INSERT OR REPLACE INTO messages (
            id, workspace_id, conversation_id, sender_id, sender_name, receiver_id,
            content, file_url, file_name, file_size, file_type, reply_to_id, reply_to_snippet, reactions, is_read, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """
        reactions_str = json.dumps(m_dict.get("reactions") or {})
        await self.execute(sql, [
            m_dict["id"], m_dict.get("workspace_id", "ws-1"), m_dict["conversation_id"],
            m_dict["sender_id"], m_dict["sender_name"], m_dict.get("receiver_id"),
            m_dict["content"], m_dict.get("file_url"), m_dict.get("file_name"),
            m_dict.get("file_size"), m_dict.get("file_type"), m_dict.get("reply_to_id"),
            m_dict.get("reply_to_snippet"), reactions_str, 1 if m_dict.get("is_read") else 0,
            m_dict["created_at"]
        ])

    async def get_messages(self, conversation_id: str) -> List[Dict[str, Any]]:
        sql = """
        SELECT id, workspace_id, conversation_id, sender_id, sender_name, receiver_id,
               content, file_url, file_name, file_size, file_type, reply_to_id, reply_to_snippet, reactions, is_read, created_at
        FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC;
        """
        rows = await self.fetch_all(sql, [conversation_id])
        for r in rows:
            if isinstance(r.get("reactions"), str):
                try:
                    r["reactions"] = json.loads(r["reactions"])
                except Exception:
                    r["reactions"] = {}
            r["is_read"] = bool(r.get("is_read"))
        return rows

    async def mark_messages_read(self, conversation_id: str, reader_id: str):
        sql = "UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND receiver_id = ? AND is_read = 0;"
        await self.execute(sql, [conversation_id, reader_id])

    async def react_message(self, message_id: str, reactions: Dict[str, Any]):
        reactions_str = json.dumps(reactions)
        sql = "UPDATE messages SET reactions = ? WHERE id = ?;"
        await self.execute(sql, [reactions_str, message_id])

    # Backward-compatible sync helpers
    async def sync_user(self, u: Any):
        created = u.created_at.isoformat() if hasattr(u.created_at, "isoformat") else str(u.created_at)
        sql = """
        INSERT OR REPLACE INTO users (id, connect_id, email, name, hashed_password, bio, role, status, avatar, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """
        await self.execute(sql, [
            u.id, u.connect_id, u.email, u.name, u.hashed_password,
            u.bio or "", u.role or "employee", u.status or "online",
            u.avatar or "", created
        ])

    async def sync_connection(self, c: Any):
        created = c.created_at.isoformat() if hasattr(c.created_at, "isoformat") else str(c.created_at)
        updated = c.updated_at.isoformat() if hasattr(c.updated_at, "isoformat") else str(c.updated_at)
        sql = """
        INSERT OR REPLACE INTO user_connections (id, requester_id, receiver_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?);
        """
        await self.execute(sql, [c.id, c.requester_id, c.receiver_id, c.status, created, updated])

    async def sync_message(self, m: Any):
        if isinstance(m, dict):
            return await self.save_message(m)
        created = m.created_at.isoformat() if hasattr(m.created_at, "isoformat") else str(m.created_at)
        reactions_str = json.dumps(m.reactions or {}) if isinstance(m.reactions, dict) else str(m.reactions or "{}")
        sql = """
        INSERT OR REPLACE INTO messages (
            id, workspace_id, conversation_id, sender_id, sender_name, receiver_id,
            content, file_url, file_name, file_size, file_type, reply_to_id, reply_to_snippet, reactions, is_read, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """
        await self.execute(sql, [
            m.id, getattr(m, "workspace_id", "ws-1"), m.conversation_id,
            m.sender_id, m.sender_name, getattr(m, "receiver_id", None),
            m.content, getattr(m, "file_url", None), getattr(m, "file_name", None),
            getattr(m, "file_size", None), getattr(m, "file_type", None), getattr(m, "reply_to_id", None),
            getattr(m, "reply_to_snippet", None), reactions_str, 1 if getattr(m, "is_read", False) else 0,
            created
        ])

# Singleton instance
d1 = CloudflareD1Client()

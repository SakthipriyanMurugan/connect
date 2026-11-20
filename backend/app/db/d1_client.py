import os
import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

class CloudflareD1Client:
    def __init__(self):
        self.account_id = settings.CLOUDFLARE_ACCOUNT_ID
        self.database_id = settings.CLOUDFLARE_D1_DATABASE_ID
        self.base_url = f"https://api.cloudflare.com/client/v4/accounts/{self.account_id}/d1/database/{self.database_id}/query"
        self._cached_token: Optional[str] = None

    def _get_token(self) -> str:
        if settings.CLOUDFLARE_API_TOKEN:
            return settings.CLOUDFLARE_API_TOKEN
        
        if self._cached_token:
            return self._cached_token

        # Auto-detect from Wrangler config if available
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
        
        return ""

    async def execute(self, sql: str, params: Optional[List[Any]] = None) -> Dict[str, Any]:
        """Execute a raw SQL query or mutation on Cloudflare D1."""
        if not settings.USE_CLOUDFLARE_D1:
            return {"success": False, "results": []}

        token = self._get_token()
        if not token:
            logger.warning("Cloudflare D1 token not found. Skipping D1 execution.")
            return {"success": False, "results": []}

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        payload: Dict[str, Any] = {"sql": sql}
        if params is not None:
            # Format params for JSON serialization (convert datetime to ISO string if needed)
            formatted_params = []
            for p in params:
                if hasattr(p, "isoformat"):
                    formatted_params.append(p.isoformat())
                else:
                    formatted_params.append(p)
            payload["params"] = formatted_params

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
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

    # High-level synchronization helpers
    async def sync_user(self, u: Any):
        """Sync a user record to Cloudflare D1."""
        sql = """
        INSERT OR REPLACE INTO users (id, connect_id, email, name, hashed_password, bio, role, status, avatar, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """
        created = u.created_at.isoformat() if hasattr(u.created_at, "isoformat") else str(u.created_at)
        await self.execute(sql, [
            u.id, u.connect_id, u.email, u.name, u.hashed_password,
            u.bio or "", u.role or "employee", u.status or "online",
            u.avatar or "", created
        ])

    async def sync_connection(self, c: Any):
        """Sync a connection record to Cloudflare D1."""
        sql = """
        INSERT OR REPLACE INTO user_connections (id, requester_id, receiver_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?);
        """
        c_at = c.created_at.isoformat() if hasattr(c.created_at, "isoformat") else str(c.created_at)
        u_at = c.updated_at.isoformat() if hasattr(c.updated_at, "isoformat") else str(c.updated_at)
        await self.execute(sql, [c.id, c.requester_id, c.receiver_id, c.status, c_at, u_at])

    async def sync_message(self, m: Any):
        """Sync a chat message to Cloudflare D1."""
        sql = """
        INSERT OR REPLACE INTO messages (
            id, workspace_id, conversation_id, sender_id, sender_name, receiver_id,
            content, file_url, file_name, file_size, file_type, is_read, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """
        c_at = m.created_at.isoformat() if hasattr(m.created_at, "isoformat") else str(m.created_at)
        await self.execute(sql, [
            m.id, getattr(m, 'workspace_id', 'ws-1'), m.conversation_id,
            m.sender_id, m.sender_name, getattr(m, 'receiver_id', None),
            m.content, getattr(m, 'file_url', None), getattr(m, 'file_name', None),
            getattr(m, 'file_size', None), getattr(m, 'file_type', None),
            1 if getattr(m, 'is_read', False) else 0, c_at
        ])

# Singleton instance
d1 = CloudflareD1Client()

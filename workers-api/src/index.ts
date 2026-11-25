import { DurableObject } from "cloudflare:workers";

export interface Env {
  DB?: D1Database;
  KV?: KVNamespace;
  HUB: DurableObjectNamespace<VertexRealtimeHub>;
  USER_HUB: DurableObjectNamespace<UserShard>;
  CHAT_HUB: DurableObjectNamespace<ConversationShard>;
}

const SECRET_KEY = "vertex-connect-super-secret-key-for-jwt-signing-2026";
const LIVEKIT_API_KEY = "APIFkMSYvVwXjJF";
const LIVEKIT_API_SECRET = "MVlBFHjJfCe3yuuTY4WjUiI5LQGdXuMUQtD6AWN9fIgA";
const LIVEKIT_URL = "wss://connect-jflh7xn8.livekit.cloud";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Upgrade",
};

function jsonRes(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    },
  });
}

function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    parts.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize))));
  }
  return btoa(parts.join(""));
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function formatDisplayName(name?: string | null, connectId?: string | null): string {
  const cid = (connectId || "").toLowerCase();
  if (!name || name.toLowerCase() === "hinata") {
    if (cid === "sakthi") return "Sakthi";
    if (cid === "nila") return "Nila";
    if (connectId) return connectId.charAt(0).toUpperCase() + connectId.slice(1);
    return "User";
  }
  return name;
}

function parseDirectPartnerId(conversationId?: string | null, actorId?: string | null): string | null {
  if (!conversationId || !actorId || !conversationId.startsWith("direct_")) return null;
  const prefix = `direct_${actorId}_`;
  if (conversationId.startsWith(prefix)) return conversationId.slice(prefix.length) || null;
  const suffix = `_${actorId}`;
  if (conversationId.endsWith(suffix)) {
    return conversationId.slice("direct_".length, -suffix.length) || null;
  }
  return null;
}

async function hashPassword(password: string): Promise<string> {
  const salt = SECRET_KEY.slice(0, 16);
  const data = new TextEncoder().encode(salt + password);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function signJwt(payload: any, secret: string = SECRET_KEY): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const data = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, data);
  const sigArr = Array.from(new Uint8Array(signature));
  let bin = "";
  for (let i = 0; i < sigArr.length; i++) bin += String.fromCharCode(sigArr[i]);
  return `${encodedHeader}.${encodedPayload}.${base64UrlEncode(bin)}`;
}

async function generateLiveKitJwt(
  roomName: string,
  identity: string,
  name: string,
  canPublish = true,
  canSubscribe = true
): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  return signJwt(
    {
      exp: nowSec + 6 * 3600,
      iss: LIVEKIT_API_KEY,
      sub: identity,
      nbf: nowSec - 10,
      jti: crypto.randomUUID(),
      name,
      video: {
        room: roomName,
        roomJoin: true,
        canPublish,
        canSubscribe,
      },
    },
    LIVEKIT_API_SECRET
  );
}

let sharedD1BlockedUntil = 0;

async function tryD1WriteGlobal(env: Env, query: string, params: any[]) {
  if (!env.DB || Date.now() < sharedD1BlockedUntil) return;
  try {
    await env.DB.prepare(query).bind(...params).run();
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg.includes("7500") || msg.toLowerCase().includes("limit")) {
      sharedD1BlockedUntil = Date.now() + 15 * 60 * 1000;
    }
  }
}

export class UserShard extends DurableObject<Env> {
  private lastHubSyncAt = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS realtime_signals (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_u_signals_ts ON realtime_signals(created_at);
        CREATE TABLE IF NOT EXISTS typing_status (
          from_user_id TEXT PRIMARY KEY,
          expires_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS presence_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          status TEXT DEFAULT 'online',
          last_seen TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS user_call_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          allow_voice_calls INTEGER DEFAULT 1,
          allow_video_calls INTEGER DEFAULT 1,
          notification_enabled INTEGER DEFAULT 1,
          privacy_settings TEXT DEFAULT '{}'
        );
      `);
    });
  }

  private get sql() {
    return this.ctx.storage.sql;
  }

  private setLocalPresence(status: string): string {
    const now = new Date().toISOString();
    try {
      this.sql.exec(
        "INSERT OR REPLACE INTO presence_state (id, status, last_seen) VALUES (1, ?, ?)",
        status,
        now
      );
    } catch {}
    return now;
  }

  private syncPresenceToHub(userId: string, status: string, force = false) {
    if (!userId) return;
    const nowMs = Date.now();
    if (!force && nowMs - this.lastHubSyncAt < 35000) return;
    this.lastHubSyncAt = nowMs;
    this.ctx.waitUntil(
      (async () => {
        try {
          const hub = this.env.HUB.get(this.env.HUB.idFromName("global-hub-v1"));
          const friends = await hub.setPresenceRpc(userId, status);
          const payload = {
            type: "presence_update",
            user_id: userId,
            status,
            last_seen: new Date().toISOString(),
          };
          await Promise.allSettled(
            friends.slice(0, 80).map((fid) =>
              this.env.USER_HUB.get(this.env.USER_HUB.idFromName(`u:${fid}`)).wsSendRpc(payload)
            )
          );
        } catch {}
      })()
    );
  }

  async wsSendRpc(eventObj: any): Promise<number> {
    const sockets = this.ctx.getWebSockets();
    if (sockets.length === 0) return 0;
    const json = JSON.stringify(eventObj);
    let sent = 0;
    for (const ws of sockets) {
      try {
        ws.send(json);
        sent++;
      } catch {}
    }
    return sent;
  }

  async pushEventRpc(signal: any, persistIfOffline = true): Promise<number> {
    const full = { ...signal, _ts: signal?._ts || Date.now(), _id: signal?._id || crypto.randomUUID() };
    const sent = await this.wsSendRpc(full);
    if (sent === 0 && persistIfOffline) {
      try {
        this.sql.exec(
          "INSERT OR REPLACE INTO realtime_signals (id, payload, created_at) VALUES (?, ?, ?)",
          full._id,
          JSON.stringify(full),
          new Date().toISOString()
        );
      } catch {}
    }
    return sent;
  }

  async receiveTypingRpc(fromUserId: string, isTyping: boolean): Promise<void> {
    try {
      if (isTyping) {
        this.sql.exec(
          "INSERT OR REPLACE INTO typing_status (from_user_id, expires_at) VALUES (?, ?)",
          fromUserId,
          new Date(Date.now() + 7000).toISOString()
        );
      } else {
        this.sql.exec("DELETE FROM typing_status WHERE from_user_id = ?", fromUserId);
      }
    } catch {}
    await this.wsSendRpc({
      type: "typing",
      sender_id: fromUserId,
      is_typing: Boolean(isTyping),
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const tags = this.ctx.getTags(ws);
    const userId = tags[0] || "";
    if (!userId) return;

    let data: any = null;
    try {
      data = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch {
      return;
    }
    if (!data?.type) return;

    const status = data.type === "status_change" ? (data.status || "online") : "online";
    this.setLocalPresence(status);
    this.syncPresenceToHub(userId, status, data.type === "status_change");

    const msgType = data.type;
    if (msgType === "typing" && data.target_user_id && !String(data.target_user_id).startsWith("group_")) {
      this.ctx.waitUntil(
        this.env.USER_HUB.get(this.env.USER_HUB.idFromName(`u:${data.target_user_id}`))
          .receiveTypingRpc(userId, Boolean(data.is_typing))
          .catch(() => {})
      );
    } else if (msgType === "read_messages" && data.conversation_id) {
      this.ctx.waitUntil(
        this.env.CHAT_HUB.get(this.env.CHAT_HUB.idFromName(`c:${data.conversation_id}`))
          .markReadRpc(userId)
          .catch(() => {})
      );
    } else if (msgType === "group_message" && data.group_id && data.message) {
      this.ctx.waitUntil(
        (async () => {
          try {
            const hub = this.env.HUB.get(this.env.HUB.idFromName("global-hub-v1"));
            const members = await hub.getGroupMembersRpc(String(data.group_id));
            await Promise.allSettled(
              members
                .filter((uid) => uid && uid !== userId)
                .map((uid) =>
                  this.env.USER_HUB.get(this.env.USER_HUB.idFromName(`u:${uid}`)).pushEventRpc(
                    { type: "new_message", conversation_id: data.group_id, message: data.message },
                    true
                  )
                )
            );
          } catch {}
        })()
      );
    } else if (msgType === "call_invite" || msgType === "call:initiate") {
      if (!data.target_user_id || !data.room_name) return;
      this.ctx.waitUntil(
        this.env.HUB.get(this.env.HUB.idFromName("global-hub-v1"))
          .syncCallFromWsRpc("call_invite", userId, data)
          .catch(() => {})
      );
    } else if (msgType === "call_response" || msgType === "call:accept" || msgType === "call:reject") {
      const targetUserId = data.target_user_id;
      const accepted = Boolean(data.accepted || msgType === "call:accept");
      if (targetUserId) {
        this.ctx.waitUntil(
          this.env.USER_HUB.get(this.env.USER_HUB.idFromName(`u:${targetUserId}`))
            .pushEventRpc(
              {
                type: "call_response",
                call_id: data.room_name,
                room_name: data.room_name,
                responder_id: userId,
                accepted,
              },
              true
            )
            .catch(() => {})
        );
      }
      if (data.room_name) {
        this.ctx.waitUntil(
          this.env.HUB.get(this.env.HUB.idFromName("global-hub-v1"))
            .syncCallFromWsRpc("call_response", userId, { ...data, accepted })
            .catch(() => {})
        );
      }
    } else if (msgType === "call_ended" || msgType === "call:end" || msgType === "call:cancel") {
      const targetUserId = data.target_user_id;
      if (targetUserId && !String(targetUserId).startsWith("group_")) {
        this.ctx.waitUntil(
          this.env.USER_HUB.get(this.env.USER_HUB.idFromName(`u:${targetUserId}`))
            .pushEventRpc(
              {
                type: "call_ended",
                call_id: data.room_name,
                room_name: data.room_name,
                user_id: userId,
              },
              true
            )
            .catch(() => {})
        );
      }
      if (data.room_name) {
        this.ctx.waitUntil(
          this.env.HUB.get(this.env.HUB.idFromName("global-hub-v1"))
            .syncCallFromWsRpc("call_ended", userId, data)
            .catch(() => {})
        );
      }
    } else if (msgType === "call_timeout") {
      const targetUserId = data.target_user_id;
      if (targetUserId && !String(targetUserId).startsWith("group_")) {
        this.ctx.waitUntil(
          this.env.USER_HUB.get(this.env.USER_HUB.idFromName(`u:${targetUserId}`))
            .pushEventRpc(
              {
                type: "call_timeout",
                call_id: data.room_name,
                room_name: data.room_name,
                caller_id: userId,
              },
              true
            )
            .catch(() => {})
        );
      }
      if (data.room_name) {
        this.ctx.waitUntil(
          this.env.HUB.get(this.env.HUB.idFromName("global-hub-v1"))
            .syncCallFromWsRpc("call_timeout", userId, data)
            .catch(() => {})
        );
      }
    }
  }

  async webSocketClose(ws: WebSocket) {
    const tags = this.ctx.getTags(ws);
    const userId = tags[0] || "";
    if (!userId) return;
    const remaining = this.ctx.getWebSockets().filter((s) => s !== ws);
    if (remaining.length === 0) {
      this.setLocalPresence("offline");
      this.syncPresenceToHub(userId, "offline", true);
    }
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    const getBody = async (): Promise<any> => {
      try {
        return await request.json();
      } catch {
        return {};
      }
    };

    try {
      if (url.pathname.startsWith("/api/v1/ws/")) {
        const upgradeHeader = request.headers.get("Upgrade");
        if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
          return jsonRes({ detail: "Expected WebSocket upgrade" }, 426);
        }
        const userId = decodeURIComponent(url.pathname.replace("/api/v1/ws/", "")).trim();
        if (!userId) return jsonRes({ detail: "Missing user_id" }, 400);

        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        this.ctx.acceptWebSocket(server, [userId]);
        this.setLocalPresence("online");
        this.syncPresenceToHub(userId, "online", true);

        try {
          const sigs = this.sql
            .exec("SELECT id, payload FROM realtime_signals ORDER BY created_at ASC LIMIT 30")
            .toArray();
          for (const row of sigs) {
            try {
              server.send(String(row.payload));
              this.sql.exec("DELETE FROM realtime_signals WHERE id = ?", row.id);
            } catch {}
          }
        } catch {}

        return new Response(null, { status: 101, webSocket: client });
      }

      if (url.pathname === "/api/v1/calls/signals" && request.method === "GET") {
        const userId = url.searchParams.get("user_id") || "";
        const signals: any[] = [];
        const typing: string[] = [];
        if (userId) {
          this.setLocalPresence("online");
          this.syncPresenceToHub(userId, "online", false);
          const cutoffOld = new Date(Date.now() - 180000).toISOString();
          try {
            this.sql.exec("DELETE FROM realtime_signals WHERE created_at < ?", cutoffOld);
          } catch {}
          const sigRows = this.sql
            .exec("SELECT id, payload FROM realtime_signals ORDER BY created_at ASC LIMIT 50")
            .toArray();
          for (const row of sigRows) {
            try { signals.push(JSON.parse(String(row.payload))); } catch {}
            this.sql.exec("DELETE FROM realtime_signals WHERE id = ?", row.id);
          }
          const nowIso = new Date().toISOString();
          const typeRows = this.sql
            .exec("SELECT from_user_id FROM typing_status WHERE expires_at > ?", nowIso)
            .toArray();
          for (const tr of typeRows) {
            if (tr.from_user_id) typing.push(String(tr.from_user_id));
          }
        }
        return jsonRes({ signals, typing });
      }

      if (url.pathname === "/api/v1/presence/heartbeat" && request.method === "POST") {
        const body = await getBody();
        if (body.user_id) {
          const st = body.status || "online";
          this.setLocalPresence(st);
          this.syncPresenceToHub(String(body.user_id), st, false);
        }
        return jsonRes({ success: true });
      }

      if (url.pathname === "/api/v1/presence/typing" && request.method === "POST") {
        const body = await getBody();
        if (body.from_user_id) {
          await this.receiveTypingRpc(String(body.from_user_id), Boolean(body.is_typing));
        }
        return jsonRes({ success: true });
      }

      if (url.pathname === "/api/v1/calls/settings" && request.method === "GET") {
        const userId = url.searchParams.get("user_id") || "";
        const row = this.sql.exec("SELECT * FROM user_call_settings WHERE id = 1").toArray()[0];
        return jsonRes({
          user_id: userId,
          allow_voice_calls: row ? Boolean(row.allow_voice_calls) : true,
          allow_video_calls: row ? Boolean(row.allow_video_calls) : true,
          notification_enabled: row ? Boolean(row.notification_enabled) : true,
          privacy_settings: row?.privacy_settings ? JSON.parse(String(row.privacy_settings)) : {},
        });
      }

      if (url.pathname === "/api/v1/calls/settings" && request.method === "PUT") {
        const body = await getBody();
        if (body.user_id) {
          this.sql.exec(
            "INSERT OR REPLACE INTO user_call_settings (id, allow_voice_calls, allow_video_calls, notification_enabled, privacy_settings) VALUES (1, ?, ?, ?, ?)",
            body.allow_voice_calls !== false ? 1 : 0,
            body.allow_video_calls !== false ? 1 : 0,
            body.notification_enabled !== false ? 1 : 0,
            JSON.stringify(body.privacy_settings || {})
          );
        }
        return jsonRes({ success: true, ...body });
      }

      return jsonRes({ status: "ok" });
    } catch (err: any) {
      return jsonRes({ status: "error", detail: err?.message || String(err) }, 500);
    }
  }
}

export class ConversationShard extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          workspace_id TEXT DEFAULT 'ws-1',
          conversation_id TEXT NOT NULL,
          sender_id TEXT NOT NULL,
          sender_name TEXT NOT NULL,
          receiver_id TEXT,
          content TEXT DEFAULT '',
          file_url TEXT,
          file_name TEXT,
          file_size TEXT,
          file_type TEXT,
          reply_to_id TEXT,
          reply_to_snippet TEXT,
          reactions TEXT DEFAULT '{}',
          is_read INTEGER DEFAULT 0,
          is_deleted INTEGER DEFAULT 0,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_c_msgs_ts ON messages(created_at);
        CREATE TABLE IF NOT EXISTS conversation_meta (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          conversation_id TEXT,
          cleared_at TEXT,
          d1_seeded INTEGER DEFAULT 0
        );
      `);
    });
  }

  private get sql() {
    return this.ctx.storage.sql;
  }

  private async ensureSeeded(conversationId: string) {
    const meta = this.sql.exec("SELECT cleared_at, d1_seeded FROM conversation_meta WHERE id = 1").toArray()[0];
    if (meta && Number(meta.d1_seeded || 0) === 1) return String(meta.cleared_at || "");

    const clearedAt = meta?.cleared_at ? String(meta.cleared_at) : "";
    if (this.env.DB && conversationId) {
      try {
        const { results } = await this.env.DB.prepare(
          `SELECT id, workspace_id, conversation_id, sender_id, sender_name, receiver_id,
                  content, file_url, file_name, file_size, file_type, reply_to_id, reply_to_snippet, reactions, is_read, created_at
           FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 120`
        )
          .bind(conversationId)
          .all();
        for (const m of results || []) {
          this.sql.exec(
            `INSERT OR IGNORE INTO messages (id, workspace_id, conversation_id, sender_id, sender_name, receiver_id, content, file_url, file_name, file_size, file_type, reply_to_id, reply_to_snippet, reactions, is_read, is_deleted, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
            String(m.id),
            String(m.workspace_id || "ws-1"),
            String(m.conversation_id),
            String(m.sender_id),
            String(m.sender_name || "User"),
            m.receiver_id ? String(m.receiver_id) : null,
            String(m.content || ""),
            m.file_url ? String(m.file_url) : null,
            m.file_name ? String(m.file_name) : null,
            m.file_size ? String(m.file_size) : null,
            m.file_type ? String(m.file_type) : null,
            m.reply_to_id ? String(m.reply_to_id) : null,
            m.reply_to_snippet ? String(m.reply_to_snippet) : null,
            typeof m.reactions === "string" ? m.reactions : "{}",
            m.is_read ? 1 : 0,
            String(m.created_at)
          );
        }
      } catch {}
    }
    this.sql.exec(
      "INSERT OR REPLACE INTO conversation_meta (id, conversation_id, cleared_at, d1_seeded) VALUES (1, ?, ?, 1)",
      conversationId,
      clearedAt || null
    );
    return clearedAt;
  }

  private pushToUser(userId: string, signal: any, persistIfOffline = true) {
    if (!userId) return;
    this.ctx.waitUntil(
      this.env.USER_HUB.get(this.env.USER_HUB.idFromName(`u:${userId}`))
        .pushEventRpc(signal, persistIfOffline)
        .catch(() => {})
    );
  }

  async markReadRpc(readerId: string): Promise<void> {
    const meta = this.sql.exec("SELECT conversation_id FROM conversation_meta WHERE id = 1").toArray()[0];
    const convRow = meta?.conversation_id
      ? String(meta.conversation_id)
      : String(this.sql.exec("SELECT conversation_id FROM messages LIMIT 1").toArray()[0]?.conversation_id || "");
    this.sql.exec("UPDATE messages SET is_read = 1 WHERE is_read = 0 AND sender_id != ?", readerId);
    const partnerId = parseDirectPartnerId(convRow, readerId);
    if (partnerId) {
      await this.env.USER_HUB.get(this.env.USER_HUB.idFromName(`u:${partnerId}`))
        .wsSendRpc({
          type: "messages_read",
          conversation_id: convRow,
          reader_id: readerId,
        })
        .catch(() => {});
    }
  }

  async clearChatRpc(): Promise<void> {
    const now = new Date().toISOString();
    const meta = this.sql.exec("SELECT conversation_id FROM conversation_meta WHERE id = 1").toArray()[0];
    this.sql.exec(
      "INSERT OR REPLACE INTO conversation_meta (id, conversation_id, cleared_at, d1_seeded) VALUES (1, ?, ?, 1)",
      meta?.conversation_id || null,
      now
    );
    this.sql.exec("DELETE FROM messages");
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    const getBody = async (): Promise<any> => {
      try {
        return await request.json();
      } catch {
        return {};
      }
    };

    try {
      if (url.pathname.startsWith("/api/v1/messages/") && request.method === "GET") {
        const conversationId = decodeURIComponent(url.pathname.replace("/api/v1/messages/", ""));
        const clearedAt = await this.ensureSeeded(conversationId);
        const rows = this.sql
          .exec("SELECT * FROM messages WHERE COALESCE(is_deleted, 0) = 0 ORDER BY created_at DESC LIMIT 120")
          .toArray();
        const out = rows
          .filter((m: any) => !clearedAt || String(m.created_at) > clearedAt)
          .map((m: any) => {
            let react = {};
            if (typeof m.reactions === "string" && m.reactions) {
              try { react = JSON.parse(m.reactions); } catch {}
            }
            return { ...m, reactions: react, is_read: Boolean(m.is_read) };
          })
          .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        return jsonRes(out);
      }

      if (url.pathname === "/api/v1/messages/send" && request.method === "POST") {
        const body = await getBody();
        if (!body.conversation_id || !body.sender_id) {
          return jsonRes({ detail: "Missing message fields" }, 400);
        }
        await this.ensureSeeded(String(body.conversation_id));

        const mid = crypto.randomUUID();
        const now = new Date().toISOString();
        const targetReceiverId =
          body.receiver_id || parseDirectPartnerId(body.conversation_id, body.sender_id);

        const msgObj = {
          id: mid,
          workspace_id: "ws-1",
          conversation_id: body.conversation_id,
          sender_id: body.sender_id,
          sender_name: body.sender_name || "User",
          receiver_id: targetReceiverId,
          content: body.content || "",
          file_url: body.file_url || null,
          file_name: body.file_name || null,
          file_size: body.file_size || null,
          file_type: body.file_type || null,
          reply_to_id: body.reply_to_id || null,
          reply_to_snippet: body.reply_to_snippet || null,
          reactions: {},
          is_read: false,
          status: "delivered",
          created_at: now,
        };

        this.sql.exec(
          `INSERT INTO messages (id, workspace_id, conversation_id, sender_id, sender_name, receiver_id, content, file_url, file_name, file_size, file_type, reply_to_id, reply_to_snippet, reactions, is_read, is_deleted, created_at)
           VALUES (?, 'ws-1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', 0, 0, ?)`,
          mid,
          body.conversation_id,
          body.sender_id,
          body.sender_name || "User",
          targetReceiverId,
          body.content || "",
          body.file_url || null,
          body.file_name || null,
          body.file_size || null,
          body.file_type || null,
          body.reply_to_id || null,
          body.reply_to_snippet || null,
          now
        );

        this.ctx.waitUntil(
          tryD1WriteGlobal(
            this.env,
            "INSERT INTO messages (id, workspace_id, conversation_id, sender_id, sender_name, receiver_id, content, file_url, file_name, file_size, file_type, reply_to_id, reply_to_snippet, reactions, is_read, created_at) VALUES (?, 'ws-1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', 0, ?)",
            [
              mid,
              body.conversation_id,
              body.sender_id,
              body.sender_name || "User",
              targetReceiverId,
              body.content || "",
              body.file_url || null,
              body.file_name || null,
              body.file_size || null,
              body.file_type || null,
              body.reply_to_id || null,
              body.reply_to_snippet || null,
              now,
            ]
          )
        );

        if (String(body.conversation_id).startsWith("group_")) {
          this.ctx.waitUntil(
            (async () => {
              try {
                const hub = this.env.HUB.get(this.env.HUB.idFromName("global-hub-v1"));
                const members = await hub.getGroupMembersRpc(String(body.conversation_id));
                await Promise.allSettled(
                  members
                    .filter((uid) => uid && uid !== body.sender_id)
                    .map((uid) =>
                      this.env.USER_HUB.get(this.env.USER_HUB.idFromName(`u:${uid}`)).pushEventRpc(
                        { type: "new_message", conversation_id: body.conversation_id, message: msgObj },
                        true
                      )
                    )
                );
              } catch {}
            })()
          );
        } else if (targetReceiverId && targetReceiverId !== body.sender_id) {
          this.pushToUser(
            String(targetReceiverId),
            { type: "new_message", conversation_id: body.conversation_id, message: msgObj },
            true
          );
        }

        return jsonRes({ success: true, message: msgObj });
      }

      if (url.pathname === "/api/v1/messages/read" && request.method === "POST") {
        const body = await getBody();
        const { conversation_id, reader_id } = body || {};
        if (conversation_id) {
          await this.ensureSeeded(String(conversation_id));
          if (reader_id) {
            this.sql.exec("UPDATE messages SET is_read = 1 WHERE is_read = 0 AND sender_id != ?", reader_id);
            const partnerId = parseDirectPartnerId(conversation_id, reader_id);
            if (partnerId) {
              this.pushToUser(
                partnerId,
                { type: "messages_read", conversation_id, reader_id },
                false
              );
            }
          } else {
            this.sql.exec("UPDATE messages SET is_read = 1");
          }
        }
        return jsonRes({ success: true });
      }

      if (url.pathname === "/api/v1/messages/clear" && request.method === "POST") {
        const body = await getBody();
        const convId = body?.conversation_id;
        if (convId) {
          const now = new Date().toISOString();
          this.sql.exec(
            "INSERT OR REPLACE INTO conversation_meta (id, conversation_id, cleared_at, d1_seeded) VALUES (1, ?, ?, 1)",
            convId,
            now
          );
          this.sql.exec("DELETE FROM messages");
          this.ctx.waitUntil(tryD1WriteGlobal(this.env, "DELETE FROM messages WHERE conversation_id = ?", [convId]));
        }
        return jsonRes({ success: true, message: "Chat messages cleared" });
      }

      if (url.pathname === "/api/v1/messages/delete" && request.method === "POST") {
        const body = await getBody();
        const { conversation_id, message_id, message_ids, user_id } = body || {};
        if (conversation_id) await this.ensureSeeded(String(conversation_id));
        const ids: string[] = Array.isArray(message_ids) ? [...message_ids] : [];
        if (message_id && !ids.includes(message_id)) ids.push(message_id);

        for (const mid of ids) {
          const existing = this.sql.exec("SELECT id FROM messages WHERE id = ?", mid).toArray();
          if (existing.length > 0) {
            this.sql.exec("UPDATE messages SET is_deleted = 1 WHERE id = ?", mid);
          } else if (conversation_id) {
            this.sql.exec(
              "INSERT OR IGNORE INTO messages (id, workspace_id, conversation_id, sender_id, sender_name, content, is_deleted, created_at) VALUES (?, 'ws-1', ?, ?, 'Deleted', '', 1, ?)",
              mid,
              conversation_id,
              user_id || "user",
              new Date().toISOString()
            );
          }
          this.ctx.waitUntil(tryD1WriteGlobal(this.env, "DELETE FROM messages WHERE id = ?", [mid]));
        }
        const partnerId = parseDirectPartnerId(conversation_id, user_id);
        if (partnerId && ids.length > 0) {
          this.pushToUser(partnerId, { type: "message_deleted", conversation_id, deleted_ids: ids }, true);
        }
        return jsonRes({ success: true, deleted_ids: ids });
      }

      if (url.pathname === "/api/v1/messages/react" && request.method === "POST") {
        const body = await getBody();
        const { conversation_id, message_id, user_id, user_name, emoji } = body || {};
        if (!message_id || !emoji) return jsonRes({ detail: "Missing message_id or emoji" }, 400);
        if (conversation_id) await this.ensureSeeded(String(conversation_id));

        const row: any = this.sql.exec("SELECT conversation_id, reactions FROM messages WHERE id = ?", message_id).toArray()[0];
        let reactions: Record<string, string[]> = {};
        if (row?.reactions && typeof row.reactions === "string") {
          try { reactions = JSON.parse(row.reactions); } catch {}
        }
        const actor = user_id || user_name || "User";
        const list = Array.isArray(reactions[emoji]) ? [...reactions[emoji]] : [];
        if (list.includes(actor) || (user_name && list.includes(user_name))) {
          const next = list.filter((u) => u !== actor && u !== user_name);
          if (next.length === 0) delete reactions[emoji];
          else reactions[emoji] = next;
        } else {
          list.push(actor);
          reactions[emoji] = list;
        }

        const rJson = JSON.stringify(reactions);
        this.sql.exec("UPDATE messages SET reactions = ? WHERE id = ?", rJson, message_id);
        this.ctx.waitUntil(tryD1WriteGlobal(this.env, "UPDATE messages SET reactions = ? WHERE id = ?", [rJson, message_id]));

        const convId = String(row?.conversation_id || conversation_id || "");
        const partnerId = parseDirectPartnerId(convId, user_id);
        if (partnerId) {
          this.pushToUser(partnerId, { type: "message_reaction", conversation_id: convId, message_id, reactions }, false);
        }
        return jsonRes({ success: true, reactions });
      }

      return jsonRes({ status: "ok" });
    } catch (err: any) {
      return jsonRes({ status: "error", detail: err?.message || String(err) }, 500);
    }
  }
}

export class VertexRealtimeHub extends DurableObject<Env> {
  private d1WriteBlockedUntil = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const sql = this.ctx.storage.sql;
      sql.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          connect_id TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          hashed_password TEXT NOT NULL,
          bio TEXT DEFAULT '',
          role TEXT DEFAULT 'employee',
          status TEXT DEFAULT 'online',
          avatar TEXT DEFAULT '',
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS otp_codes (
          email TEXT PRIMARY KEY,
          code TEXT NOT NULL,
          purpose TEXT DEFAULT 'signup',
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS user_connections (
          id TEXT PRIMARY KEY,
          requester_id TEXT NOT NULL,
          receiver_id TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_do_conn_req ON user_connections(requester_id);
        CREATE INDEX IF NOT EXISTS idx_do_conn_rec ON user_connections(receiver_id);
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          workspace_id TEXT DEFAULT 'ws-1',
          conversation_id TEXT NOT NULL,
          sender_id TEXT NOT NULL,
          sender_name TEXT NOT NULL,
          receiver_id TEXT,
          content TEXT DEFAULT '',
          file_url TEXT,
          file_name TEXT,
          file_size TEXT,
          file_type TEXT,
          reply_to_id TEXT,
          reply_to_snippet TEXT,
          reactions TEXT DEFAULT '{}',
          is_read INTEGER DEFAULT 0,
          is_deleted INTEGER DEFAULT 0,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_do_msgs_conv ON messages(conversation_id, created_at);
        CREATE TABLE IF NOT EXISTS conversation_meta (
          conversation_id TEXT PRIMARY KEY,
          cleared_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS calls (
          id TEXT PRIMARY KEY,
          caller_id TEXT NOT NULL,
          caller_name TEXT,
          caller_connect_id TEXT,
          caller_avatar TEXT,
          target_user_id TEXT,
          target_name TEXT,
          target_connect_id TEXT,
          target_avatar TEXT,
          call_type TEXT DEFAULT 'video',
          call_status TEXT DEFAULT 'initiated',
          started_at TEXT NOT NULL,
          answered_at TEXT,
          ended_at TEXT,
          duration INTEGER DEFAULT 0,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS call_participants (
          id TEXT PRIMARY KEY,
          call_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          joined_at TEXT NOT NULL,
          participant_status TEXT DEFAULT 'joined'
        );
        CREATE INDEX IF NOT EXISTS idx_do_call_part ON call_participants(call_id, user_id);
        CREATE TABLE IF NOT EXISTS active_call_locks (
          user_id TEXT PRIMARY KEY,
          call_id TEXT NOT NULL,
          call_status TEXT NOT NULL,
          expires_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS user_call_settings (
          user_id TEXT PRIMARY KEY,
          allow_voice_calls INTEGER DEFAULT 1,
          allow_video_calls INTEGER DEFAULT 1,
          notification_enabled INTEGER DEFAULT 1,
          privacy_settings TEXT DEFAULT '{}'
        );
        CREATE TABLE IF NOT EXISTS realtime_signals (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_do_signals ON realtime_signals(user_id, created_at);
        CREATE TABLE IF NOT EXISTS typing_status (
          target_user_id TEXT NOT NULL,
          from_user_id TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          PRIMARY KEY(target_user_id, from_user_id)
        );
        CREATE TABLE IF NOT EXISTS presence_state (
          user_id TEXT PRIMARY KEY,
          status TEXT DEFAULT 'online',
          last_seen TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS groups (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          connect_id TEXT,
          description TEXT DEFAULT '',
          created_by TEXT NOT NULL,
          members TEXT DEFAULT '[]',
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS teams (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT DEFAULT '',
          owner_id TEXT NOT NULL,
          members TEXT DEFAULT '[]',
          created_at TEXT NOT NULL
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
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS uploaded_files (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          file_name TEXT NOT NULL,
          file_size TEXT,
          file_type TEXT,
          file_url TEXT NOT NULL,
          shared_by TEXT DEFAULT 'You',
          data_base64 TEXT,
          created_at TEXT NOT NULL
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
          sentiment_label TEXT DEFAULT 'Constructive',
          talk_time_breakdown TEXT DEFAULT '[]',
          status TEXT DEFAULT 'pending',
          supervisor_notes TEXT DEFAULT '',
          created_at TEXT NOT NULL
        );
      `);
    });
  }

  private get sql() {
    return this.ctx.storage.sql;
  }

  private async tryD1Write(query: string, params: any[]) {
    if (!this.env.DB || Date.now() < this.d1WriteBlockedUntil) return;
    try {
      await this.env.DB.prepare(query).bind(...params).run();
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.includes("7500") || msg.toLowerCase().includes("limit")) {
        this.d1WriteBlockedUntil = Date.now() + 15 * 60 * 1000;
      }
    }
  }

  private sendWsToUser(userId: string | null | undefined, eventObj: any): number {
    if (!userId) return 0;
    this.ctx.waitUntil(
      this.env.USER_HUB.get(this.env.USER_HUB.idFromName(`u:${userId}`))
        .wsSendRpc(eventObj)
        .catch(() => {})
    );
    return 1;
  }

  private broadcastWs(eventObj: any, excludeUserId?: string) {
    const sockets = this.ctx.getWebSockets();
    const json = JSON.stringify(eventObj);
    for (const ws of sockets) {
      try {
        const tags = this.ctx.getTags(ws);
        if (excludeUserId && tags.includes(excludeUserId)) continue;
        ws.send(json);
      } catch {}
    }
  }

  private queueSignalAndPush(targetUserId: string | null | undefined, signal: any) {
    if (!targetUserId) return;
    const full = { ...signal, _ts: Date.now(), _id: crypto.randomUUID() };
    this.ctx.waitUntil(
      this.env.USER_HUB.get(this.env.USER_HUB.idFromName(`u:${targetUserId}`))
        .pushEventRpc(full, true)
        .catch(() => {})
    );
  }

  async setPresenceRpc(userId: string, status: string): Promise<string[]> {
    this.setPresence(userId, status);
    const friendIds = new Set<string>();
    try {
      const doConns = this.sql
        .exec(
          "SELECT requester_id, receiver_id FROM user_connections WHERE (requester_id = ? OR receiver_id = ?) AND status = 'accepted'",
          userId,
          userId
        )
        .toArray();
      for (const c of doConns) {
        const pid = String(c.requester_id) === userId ? String(c.receiver_id) : String(c.requester_id);
        if (pid) friendIds.add(pid);
      }
      if (this.env.DB) {
        const { results } = await this.env.DB.prepare(
          "SELECT requester_id, receiver_id FROM user_connections WHERE (requester_id = ? OR receiver_id = ?) AND status = 'accepted' LIMIT 80"
        )
          .bind(userId, userId)
          .all();
        for (const r of results || []) {
          const pid = String(r.requester_id) === userId ? String(r.receiver_id) : String(r.requester_id);
          if (pid) friendIds.add(pid);
        }
      }
    } catch {}
    return Array.from(friendIds);
  }

  async getGroupMembersRpc(groupId: string): Promise<string[]> {
    const grpRow = this.sql.exec("SELECT members, created_by FROM groups WHERE id = ?", groupId).toArray()[0];
    const members: string[] = grpRow?.members ? JSON.parse(String(grpRow.members)) : [];
    if (grpRow?.created_by && !members.includes(String(grpRow.created_by))) {
      members.push(String(grpRow.created_by));
    }
    return members;
  }

  async syncCallFromWsRpc(kind: string, userId: string, data: any): Promise<void> {
    const roomName = data?.room_name;
    const now = new Date().toISOString();
    if (!roomName) return;
    if (kind === "call_invite" && data.target_user_id) {
      const existingCall = this.sql.exec("SELECT id FROM calls WHERE id = ? LIMIT 1", roomName).toArray();
      if (existingCall.length > 0) return;
      this.queueSignalAndPush(String(data.target_user_id), {
        type: "incoming_call",
        call_id: roomName,
        caller_id: userId,
        caller_name: data.caller_name || "Teammate",
        caller_connect_id: data.caller_connect_id || "",
        caller_avatar: data.caller_avatar || "",
        room_name: roomName,
        call_type: data.call_type || "video",
      });
    } else if (kind === "call_response") {
      const newStatus = data.accepted ? "active" : "rejected";
      this.sql.exec("UPDATE calls SET call_status = ?, answered_at = ? WHERE id = ?", newStatus, data.accepted ? now : null, roomName);
      if (!data.accepted) {
        this.sql.exec("DELETE FROM active_call_locks WHERE call_id = ?", roomName);
      } else {
        const exp = new Date(Date.now() + 1800000).toISOString();
        this.sql.exec("UPDATE active_call_locks SET call_status = 'active', expires_at = ? WHERE call_id = ?", exp, roomName);
      }
    } else if (kind === "call_ended") {
      this.sql.exec("UPDATE calls SET call_status = 'ended', ended_at = ? WHERE id = ?", now, roomName);
      this.sql.exec("DELETE FROM active_call_locks WHERE call_id = ?", roomName);
    } else if (kind === "call_timeout") {
      this.sql.exec("UPDATE calls SET call_status = 'missed', ended_at = ?, duration = 0 WHERE id = ?", now, roomName);
      this.sql.exec("DELETE FROM active_call_locks WHERE call_id = ?", roomName);
    }
  }

  private async findUserByIdentifier(ident: string): Promise<any | null> {
    const clean = ident.trim().toLowerCase().replace(/^@/, "");
    const local = this.sql
      .exec(
        "SELECT * FROM users WHERE lower(connect_id) = ? OR lower(email) = ? LIMIT 1",
        clean,
        clean
      )
      .toArray();
    if (local.length > 0) return local[0];

    if (this.env.DB) {
      try {
        const row = await this.env.DB.prepare(
          "SELECT id, connect_id, email, name, hashed_password, bio, role, status, avatar, created_at FROM users WHERE lower(connect_id) = ? OR lower(email) = ? LIMIT 1"
        )
          .bind(clean, clean)
          .first();
        if (row) {
          this.cacheUserInDo(row);
          return row;
        }
      } catch {}
    }
    return null;
  }

  private async findUserById(userId: string): Promise<any | null> {
    if (!userId) return null;
    const local = this.sql.exec("SELECT * FROM users WHERE id = ? LIMIT 1", userId).toArray();
    if (local.length > 0) return local[0];
    if (this.env.DB) {
      try {
        const row = await this.env.DB.prepare(
          "SELECT id, connect_id, email, name, hashed_password, bio, role, status, avatar, created_at FROM users WHERE id = ? LIMIT 1"
        )
          .bind(userId)
          .first();
        if (row) {
          this.cacheUserInDo(row);
          return row;
        }
      } catch {}
    }
    return null;
  }

  private cacheUserInDo(u: any) {
    if (!u?.id) return;
    try {
      this.sql.exec(
        "INSERT OR IGNORE INTO users (id, connect_id, email, name, hashed_password, bio, role, status, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        String(u.id),
        String(u.connect_id || ""),
        String(u.email || `${u.id}@vertex.local`),
        String(u.name || u.connect_id || "User"),
        String(u.hashed_password || ""),
        String(u.bio || ""),
        String(u.role || "employee"),
        String(u.status || "online"),
        String(u.avatar || ""),
        String(u.created_at || new Date().toISOString())
      );
    } catch {}
  }

  private getOnlineSet(): Set<string> {
    const online = new Set<string>();
    const cutoff = new Date(Date.now() - 120000).toISOString();
    try {
      const rows = this.sql
        .exec("SELECT user_id FROM presence_state WHERE status != 'offline' AND last_seen > ?", cutoff)
        .toArray();
      for (const r of rows) {
        if (r.user_id) online.add(String(r.user_id));
      }
    } catch {}
    for (const ws of this.ctx.getWebSockets()) {
      for (const tag of this.ctx.getTags(ws)) {
        if (tag) online.add(tag);
      }
    }
    return online;
  }

  private setPresence(userId: string, status: string) {
    const now = new Date().toISOString();
    try {
      this.sql.exec(
        "INSERT OR REPLACE INTO presence_state (user_id, status, last_seen) VALUES (?, ?, ?)",
        userId,
        status,
        now
      );
    } catch {}
    return now;
  }

  // WebSocket Hibernation Handlers
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const tags = this.ctx.getTags(ws);
    const userId = tags[0] || "";
    if (!userId) return;

    let data: any = null;
    try {
      data = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch {
      return;
    }
    if (!data?.type) return;

    this.setPresence(userId, data.type === "status_change" ? (data.status || "online") : "online");
    const msgType = data.type;

    if (msgType === "typing") {
      const targetUserId = data.target_user_id;
      if (targetUserId && !String(targetUserId).startsWith("group_")) {
        const expIso = new Date(Date.now() + 7000).toISOString();
        try {
          if (data.is_typing) {
            this.sql.exec(
              "INSERT OR REPLACE INTO typing_status (target_user_id, from_user_id, expires_at) VALUES (?, ?, ?)",
              targetUserId,
              userId,
              expIso
            );
          } else {
            this.sql.exec(
              "DELETE FROM typing_status WHERE target_user_id = ? AND from_user_id = ?",
              targetUserId,
              userId
            );
          }
        } catch {}
        this.sendWsToUser(targetUserId, {
          type: "typing",
          sender_id: userId,
          is_typing: Boolean(data.is_typing),
        });
      }
    } else if (msgType === "read_messages" && data.conversation_id) {
      const convId = String(data.conversation_id);
      try {
        this.sql.exec(
          "UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ?",
          convId,
          userId
        );
      } catch {}
      const partnerId = parseDirectPartnerId(convId, userId);
      if (partnerId) {
        this.sendWsToUser(partnerId, {
          type: "messages_read",
          conversation_id: convId,
          reader_id: userId,
        });
      }
    } else if (msgType === "group_message" && data.group_id && data.message) {
      const grpRows = this.sql.exec("SELECT members, created_by FROM groups WHERE id = ?", data.group_id).toArray();
      const members: string[] = grpRows[0]?.members ? JSON.parse(String(grpRows[0].members)) : [];
      if (grpRows[0]?.created_by && !members.includes(String(grpRows[0].created_by))) {
        members.push(String(grpRows[0].created_by));
      }
      for (const uid of members) {
        if (uid && uid !== userId) {
          this.sendWsToUser(uid, { type: "new_message", conversation_id: data.group_id, message: data.message });
        }
      }
    } else if (msgType === "status_change") {
      this.broadcastWs({
        type: "presence_update",
        user_id: userId,
        status: data.status || "online",
        last_seen: new Date().toISOString(),
      }, userId);
    } else if (msgType === "call_invite" || msgType === "call:initiate") {
      // Deduplicated against POST /calls/initiate — handle only if not already initiated via HTTP lock
      const targetUserId = data.target_user_id;
      const roomName = data.room_name;
      if (!targetUserId || !roomName) return;

      const existingCall = this.sql.exec("SELECT id FROM calls WHERE id = ? LIMIT 1", roomName).toArray();
      if (existingCall.length > 0) {
        // /calls/initiate already dispatched or will dispatch authoritative push
        return;
      }

      this.queueSignalAndPush(targetUserId, {
        type: "incoming_call",
        call_id: roomName,
        caller_id: userId,
        caller_name: data.caller_name || "Teammate",
        caller_connect_id: data.caller_connect_id || "",
        caller_avatar: data.caller_avatar || "",
        room_name: roomName,
        call_type: data.call_type || "video",
      });
    } else if (msgType === "call_response" || msgType === "call:accept" || msgType === "call:reject") {
      const targetUserId = data.target_user_id;
      const accepted = Boolean(data.accepted || msgType === "call:accept");
      if (targetUserId) {
        this.queueSignalAndPush(targetUserId, {
          type: "call_response",
          call_id: data.room_name,
          room_name: data.room_name,
          responder_id: userId,
          accepted,
        });
      }
    } else if (msgType === "call_ended" || msgType === "call:end" || msgType === "call:cancel") {
      const targetUserId = data.target_user_id;
      if (targetUserId) {
        this.queueSignalAndPush(targetUserId, {
          type: "call_ended",
          call_id: data.room_name,
          room_name: data.room_name,
          user_id: userId,
        });
      }
    } else if (msgType === "call_timeout") {
      const targetUserId = data.target_user_id;
      if (targetUserId) {
        this.queueSignalAndPush(targetUserId, {
          type: "call_timeout",
          call_id: data.room_name,
          room_name: data.room_name,
          caller_id: userId,
        });
      }
    }
  }

  async webSocketClose(ws: WebSocket) {
    const tags = this.ctx.getTags(ws);
    const userId = tags[0] || "";
    if (!userId) return;
    const remaining = this.ctx.getWebSockets(userId).filter((s) => s !== ws);
    if (remaining.length === 0) {
      const lastSeen = this.setPresence(userId, "offline");
      this.broadcastWs({
        type: "presence_update",
        user_id: userId,
        status: "offline",
        last_seen: lastSeen,
      }, userId);
    }
  }

  async webSocketError(ws: WebSocket) {
    await this.webSocketClose(ws);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const getBody = async (): Promise<any> => {
      try {
        return await request.json();
      } catch {
        return {};
      }
    };

    try {
      // 0. WebSocket Upgrade Endpoint
      if (url.pathname.startsWith("/api/v1/ws/")) {
        const upgradeHeader = request.headers.get("Upgrade");
        if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
          return jsonRes({ detail: "Expected WebSocket upgrade" }, 426);
        }
        const userId = decodeURIComponent(url.pathname.replace("/api/v1/ws/", "")).trim();
        if (!userId) return jsonRes({ detail: "Missing user_id" }, 400);

        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        this.ctx.acceptWebSocket(server, [userId]);
        const lastSeen = this.setPresence(userId, "online");
        this.broadcastWs({ type: "presence_update", user_id: userId, status: "online", last_seen: lastSeen }, userId);

        // Flush any queued unconsumed signals on socket connect!
        try {
          const sigs = this.sql
            .exec("SELECT id, payload FROM realtime_signals WHERE user_id = ? ORDER BY created_at ASC LIMIT 30", userId)
            .toArray();
          for (const row of sigs) {
            try {
              server.send(String(row.payload));
              this.sql.exec("DELETE FROM realtime_signals WHERE id = ?", row.id);
            } catch {}
          }
        } catch {}

        return new Response(null, { status: 101, webSocket: client });
      }

      // 1. Health Endpoint
      if (url.pathname === "/api/v1/health") {
        let usersCount = 0;
        try {
          const row = this.sql.exec("SELECT count(*) as count FROM users").one();
          usersCount = Number(row?.count || 0);
        } catch {}
        if (usersCount === 0 && this.env.DB) {
          try {
            const d1Row = await this.env.DB.prepare("SELECT count(*) as count FROM users").first();
            usersCount = Number(d1Row?.count || 0);
          } catch {}
        }
        return jsonRes({
          status: "healthy",
          service: "vertex-connect-durable-realtime-hub",
          has_do: true,
          has_kv: Boolean(this.env.KV),
          has_db: Boolean(this.env.DB),
          ws_connections: this.ctx.getWebSockets().length,
          users_count: usersCount,
          active_24_7: true,
        });
      }

      // 2. Check Connect ID Availability
      if (url.pathname === "/api/v1/auth/check-connect-id") {
        const rawId = url.searchParams.get("id") || url.searchParams.get("connect_id") || "";
        const cleaned = rawId.trim().toLowerCase().replace(/^@/, "");
        if (!cleaned) return jsonRes({ available: false, message: "Connect ID is required" }, 400);
        const existing = await this.findUserByIdentifier(cleaned);
        if (existing) {
          return jsonRes({ available: false, message: `Connect ID @${cleaned} is already taken.` });
        }
        return jsonRes({ available: true, message: `Connect ID @${cleaned} is available!` });
      }

      // 3. Login
      if (url.pathname === "/api/v1/auth/login" && request.method === "POST") {
        const body = await getBody();
        const ident = (body.identifier || body.email || body.connect_id || "").trim().toLowerCase().replace(/^@/, "");
        const password = body.password || "";
        const otp = (body.otp || "").trim();
        if (!ident) return jsonRes({ detail: "Please enter your Connect ID or Email address." }, 400);

        const user = await this.findUserByIdentifier(ident);
        if (!user) return jsonRes({ detail: `No account found for '${ident}'. Please sign up.` }, 404);

        if (otp) {
          const emailLower = String(user.email || "").toLowerCase();
          let otpRec: any = this.sql
            .exec("SELECT code, expires_at FROM otp_codes WHERE lower(email) = ? LIMIT 1", emailLower)
            .toArray()[0];
          if (!otpRec && this.env.DB) {
            otpRec = await this.env.DB.prepare("SELECT code, expires_at FROM otp_codes WHERE lower(email) = ? LIMIT 1")
              .bind(emailLower)
              .first()
              .catch(() => null);
          }
          const isExpired = otpRec?.expires_at ? new Date(String(otpRec.expires_at)).getTime() < Date.now() : true;
          if (!otpRec || otpRec.code !== otp || isExpired) {
            return jsonRes({ detail: "Invalid or expired verification code." }, 400);
          }
          this.sql.exec("DELETE FROM otp_codes WHERE lower(email) = ?", emailLower);
        } else {
          if (!password) return jsonRes({ detail: "Password or OTP required." }, 400);
          const hashed = await hashPassword(password);
          if (hashed !== user.hashed_password) {
            return jsonRes({ detail: "Incorrect password. Please check your password or use 'Forgot Password' with OTP." }, 401);
          }
        }

        this.setPresence(String(user.id), "online");
        const resolvedName = formatDisplayName(String(user.name), String(user.connect_id));
        const token = await signJwt({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 7 * 86400 });
        return jsonRes({
          access_token: token,
          token_type: "bearer",
          user: {
            id: user.id,
            connect_id: user.connect_id,
            name: resolvedName,
            email: user.email,
            bio: user.bio || "Hey there! I am using Vertex Connect.",
            role: user.role || "employee",
            status: "online",
            avatar: user.avatar || "",
            created_at: user.created_at || new Date().toISOString(),
          },
        });
      }

      // 4. Signup
      if (url.pathname === "/api/v1/auth/signup" && request.method === "POST") {
        const body = await getBody();
        const cleanId = (body.connect_id || "").trim().toLowerCase().replace(/^@/, "");
        const cleanEmail = (body.email || "").trim().toLowerCase();
        const name = (body.name || "").trim();
        const password = body.password || "";
        const otp = (body.otp || "").trim();

        if (!cleanId || cleanId.length < 3) return jsonRes({ detail: "Connect ID must be at least 3 characters." }, 400);
        if (!cleanEmail || !cleanEmail.includes("@")) return jsonRes({ detail: "Valid email is required." }, 400);
        if (!password || password.length < 8) return jsonRes({ detail: "Password must be at least 8 characters." }, 400);

        const existingById = await this.findUserByIdentifier(cleanId);
        const existingByEmail = existingById || (await this.findUserByIdentifier(cleanEmail));
        const hashed = await hashPassword(password);

        if (existingByEmail) {
          if (existingByEmail.hashed_password === hashed) {
            const token = await signJwt({ sub: existingByEmail.id, exp: Math.floor(Date.now() / 1000) + 7 * 86400 });
            return jsonRes({
              access_token: token,
              token_type: "bearer",
              user: {
                id: existingByEmail.id,
                connect_id: existingByEmail.connect_id,
                name: formatDisplayName(String(existingByEmail.name), String(existingByEmail.connect_id)),
                email: existingByEmail.email,
                bio: existingByEmail.bio,
                role: existingByEmail.role,
                status: "online",
                avatar: existingByEmail.avatar || "",
                created_at: existingByEmail.created_at,
              },
            });
          }
          return jsonRes({ detail: `Account @${cleanId} or email already exists. Please log in with your password.` }, 400);
        }

        if (otp) {
          let rec: any = this.sql.exec("SELECT code, expires_at FROM otp_codes WHERE lower(email) = ? LIMIT 1", cleanEmail).toArray()[0];
          if (!rec && this.env.DB) {
            rec = await this.env.DB.prepare("SELECT code, expires_at FROM otp_codes WHERE lower(email) = ? LIMIT 1")
              .bind(cleanEmail)
              .first()
              .catch(() => null);
          }
          const expired = rec?.expires_at ? new Date(String(rec.expires_at)).getTime() < Date.now() : true;
          if (!rec || rec.code !== otp || expired) {
            return jsonRes({ detail: "Invalid or expired verification code." }, 400);
          }
          this.sql.exec("DELETE FROM otp_codes WHERE lower(email) = ?", cleanEmail);
        }

        const uid = crypto.randomUUID();
        const now = new Date().toISOString();
        this.sql.exec(
          "INSERT INTO users (id, connect_id, email, name, hashed_password, bio, role, status, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          uid,
          cleanId,
          cleanEmail,
          name || cleanId,
          hashed,
          "Hey there! I am using Vertex Connect.",
          "employee",
          "online",
          "",
          now
        );
        await this.tryD1Write(
          "INSERT INTO users (id, connect_id, email, name, hashed_password, bio, role, status, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [uid, cleanId, cleanEmail, name || cleanId, hashed, "Hey there! I am using Vertex Connect.", "employee", "online", "", now]
        );
        this.setPresence(uid, "online");

        const token = await signJwt({ sub: uid, exp: Math.floor(Date.now() / 1000) + 7 * 86400 });
        return jsonRes({
          access_token: token,
          token_type: "bearer",
          user: {
            id: uid,
            connect_id: cleanId,
            name: name || cleanId,
            email: cleanEmail,
            bio: "Hey there! I am using Vertex Connect.",
            role: "employee",
            status: "online",
            avatar: "",
            created_at: now,
          },
        });
      }

      // 5. Send OTP
      if (url.pathname === "/api/v1/auth/send-otp" && request.method === "POST") {
        const body = await getBody();
        const cleanEmail = (body.email || "").trim().toLowerCase();
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        const now = new Date().toISOString();

        this.sql.exec(
          "INSERT OR REPLACE INTO otp_codes (email, code, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
          cleanEmail,
          code,
          body.purpose || "account verification",
          expiresAt,
          now
        );
        await this.tryD1Write(
          "INSERT OR REPLACE INTO otp_codes (email, code, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
          [cleanEmail, code, body.purpose || "account verification", expiresAt, now]
        );

        try {
          await fetch("https://vertex-mail-relay.feelit.workers.dev", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer vertex-super-secret-mail-relay-key-2026",
            },
            body: JSON.stringify({
              to: cleanEmail,
              subject: `${code} is your VERTEX CONNECT verification code`,
              html: `<div style="font-family: Arial, sans-serif; background: #0f172a; color: #f8fafc; padding: 32px; border-radius: 16px; max-width: 480px; margin: auto; text-align: center;"><h1 style="color: #38bdf8;">VERTEX CONNECT</h1><div style="background: #1e293b; border-radius: 12px; padding: 24px; margin: 24px 0;"><p>Your verification code:</p><div style="font-size: 36px; font-weight: bold; letter-spacing: 6px; color: #38bdf8;">${code}</div></div></div>`,
              text: `Your VERTEX CONNECT verification code is: ${code}`,
            }),
          });
        } catch {}

        return jsonRes({
          success: true,
          message: `Verification code sent to ${cleanEmail}. Please check Inbox/Spam.`,
          expires_in_minutes: 10,
        });
      }

      // 6. Verify OTP
      if (url.pathname === "/api/v1/auth/verify-otp" && request.method === "POST") {
        const body = await getBody();
        const cleanEmail = (body.email || "").trim().toLowerCase();
        const otp = (body.otp || "").trim();
        let rec: any = this.sql.exec("SELECT code, expires_at FROM otp_codes WHERE lower(email) = ? LIMIT 1", cleanEmail).toArray()[0];
        if (!rec && this.env.DB) {
          rec = await this.env.DB.prepare("SELECT code, expires_at FROM otp_codes WHERE lower(email) = ? LIMIT 1")
            .bind(cleanEmail)
            .first()
            .catch(() => null);
        }
        const expired = rec?.expires_at ? new Date(String(rec.expires_at)).getTime() < Date.now() : true;
        if (rec && rec.code === otp && !expired) {
          this.sql.exec("DELETE FROM otp_codes WHERE lower(email) = ?", cleanEmail);
          return jsonRes({ success: true, verified: true, message: "Email verified successfully." });
        }
        return jsonRes({ detail: "Invalid or expired verification code." }, 400);
      }

      // 7. Reset Password
      if (url.pathname === "/api/v1/auth/reset-password" && request.method === "POST") {
        const body = await getBody();
        const cleanEmail = (body.email || "").trim().toLowerCase();
        const otp = (body.otp || "").trim();
        const newPass = body.new_password || "";
        if (!newPass || newPass.length < 8) return jsonRes({ detail: "Password must be at least 8 characters." }, 400);

        let rec: any = this.sql.exec("SELECT code, expires_at FROM otp_codes WHERE lower(email) = ? LIMIT 1", cleanEmail).toArray()[0];
        if (!rec && this.env.DB) {
          rec = await this.env.DB.prepare("SELECT code, expires_at FROM otp_codes WHERE lower(email) = ? LIMIT 1")
            .bind(cleanEmail)
            .first()
            .catch(() => null);
        }
        const expired = rec?.expires_at ? new Date(String(rec.expires_at)).getTime() < Date.now() : true;
        if (!rec || rec.code !== otp || expired) {
          return jsonRes({ detail: "Invalid or expired verification code." }, 400);
        }

        const hashed = await hashPassword(newPass);
        const userRow = await this.findUserByIdentifier(cleanEmail);
        if (userRow) {
          this.sql.exec("UPDATE users SET hashed_password = ? WHERE lower(email) = ?", hashed, cleanEmail);
        }
        await this.tryD1Write("UPDATE users SET hashed_password = ? WHERE lower(email) = ?", [hashed, cleanEmail]);
        this.sql.exec("DELETE FROM otp_codes WHERE lower(email) = ?", cleanEmail);
        return jsonRes({ success: true, message: "Password updated successfully." });
      }

      // 8. Profile Update
      if (url.pathname === "/api/v1/auth/profile" && request.method === "PUT") {
        const body = await getBody();
        const userId = body.user_id;
        if (!userId) return jsonRes({ detail: "Missing user_id" }, 400);
        const cur = await this.findUserById(userId);
        if (!cur) return jsonRes({ detail: "User not found" }, 404);

        const name = body.name || cur.name;
        const bio = body.bio !== undefined ? body.bio : cur.bio;
        const status = body.status || cur.status;
        const avatar = body.avatar !== undefined ? body.avatar : cur.avatar;

        this.sql.exec("UPDATE users SET name = ?, bio = ?, status = ?, avatar = ? WHERE id = ?", name, bio, status, avatar, userId);
        await this.tryD1Write("UPDATE users SET name = ?, bio = ?, status = ?, avatar = ? WHERE id = ?", [name, bio, status, avatar, userId]);
        return jsonRes({ ...cur, name, bio, status, avatar });
      }

      // 9. Connections List (Merges D1 + DO SQLite + Live WS Online Status)
      if (url.pathname === "/api/v1/connections" && request.method === "GET") {
        const userId = url.searchParams.get("user_id") || "";
        if (!userId) return jsonRes({ friends: [], pending_incoming: [], pending_outgoing: [] });

        const onlineSet = this.getOnlineSet();
        const connByPartner: Record<string, any> = {};

        // 1. Read D1 connections (READs always fast even when D1 writes blocked)
        if (this.env.DB) {
          try {
            const { results } = await this.env.DB.prepare(
              `SELECT c.id as connection_id, c.requester_id, c.receiver_id, c.status as connection_status, c.created_at as connection_created_at,
                      u.id as user_id, u.connect_id, u.name, u.bio, u.status as user_status, u.avatar
               FROM user_connections c
               JOIN users u ON u.id = (CASE WHEN c.requester_id = ? THEN c.receiver_id ELSE c.requester_id END)
               WHERE c.requester_id = ? OR c.receiver_id = ?`
            )
              .bind(userId, userId, userId)
              .all();
            for (const r of results || []) {
              const pid = String(r.user_id);
              this.cacheUserInDo({
                id: pid,
                connect_id: r.connect_id,
                name: r.name,
                bio: r.bio,
                status: r.user_status,
                avatar: r.avatar,
              });
              connByPartner[pid] = {
                connection_id: r.connection_id,
                user_id: pid,
                name: formatDisplayName(String(r.name), String(r.connect_id)),
                connect_id: r.connect_id,
                bio: r.bio || "",
                status: onlineSet.has(pid) ? "online" : "offline",
                avatar: r.avatar || "",
                created_at: r.connection_created_at,
                connection_status: r.connection_status,
                requester_id: r.requester_id,
                receiver_id: r.receiver_id,
              };
            }
          } catch {}
        }

        // 2. Overlay authoritative DO SQLite connections (includes newer requests/accepts/deletes)
        const doConns = this.sql
          .exec("SELECT * FROM user_connections WHERE requester_id = ? OR receiver_id = ?", userId, userId)
          .toArray();
        for (const c of doConns) {
          const pid = String(c.requester_id) === userId ? String(c.receiver_id) : String(c.requester_id);
          if (c.status === "deleted") {
            delete connByPartner[pid];
            continue;
          }
          const pu = await this.findUserById(pid);
          connByPartner[pid] = {
            connection_id: c.id,
            user_id: pid,
            name: formatDisplayName(pu?.name, pu?.connect_id),
            connect_id: pu?.connect_id || "user",
            bio: pu?.bio || "",
            status: onlineSet.has(pid) ? "online" : "offline",
            avatar: pu?.avatar || "",
            created_at: c.created_at,
            connection_status: c.status,
            requester_id: c.requester_id,
            receiver_id: c.receiver_id,
          };
        }

        const friends: any[] = [];
        const pending_incoming: any[] = [];
        const pending_outgoing: any[] = [];
        for (const [pid, item] of Object.entries(connByPartner)) {
          if (item.connection_status === "accepted") {
            const ids = [userId, pid].sort();
            item.conversation_id = `direct_${ids[0]}_${ids[1]}`;
            friends.push(item);
          } else if (item.connection_status === "pending") {
            if (String(item.receiver_id) === userId) pending_incoming.push(item);
            else pending_outgoing.push(item);
          }
        }
        return jsonRes({ friends, pending_incoming, pending_outgoing });
      }

      // 10. Connection Request
      if (url.pathname === "/api/v1/connections/request" && request.method === "POST") {
        const body = await getBody();
        const requesterId = body.requester_id || body.from_user_id;
        const targetConnectId = (body.target_connect_id || "").trim().toLowerCase().replace(/^@/, "");
        if (!requesterId || !targetConnectId) return jsonRes({ detail: "Missing requester_id or target_connect_id" }, 400);

        const targetUser = await this.findUserByIdentifier(targetConnectId);
        if (!targetUser) return jsonRes({ detail: `User @${targetConnectId} not found.` }, 404);
        if (String(targetUser.id) === requesterId) return jsonRes({ detail: "You cannot send a friend request to yourself." }, 400);

        const connId = `conn_${[requesterId, String(targetUser.id)].sort().join("_")}`;
        const existing = this.sql.exec("SELECT * FROM user_connections WHERE id = ? LIMIT 1", connId).toArray()[0];
        if (existing?.status === "accepted") return jsonRes({ success: true, message: "Already connected!", status: "accepted" });
        if (existing?.status === "pending") return jsonRes({ success: true, message: `Connection request already pending with @${targetConnectId}.`, status: "pending" });

        const now = new Date().toISOString();
        this.sql.exec(
          "INSERT OR REPLACE INTO user_connections (id, requester_id, receiver_id, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)",
          connId,
          requesterId,
          String(targetUser.id),
          now,
          now
        );
        await this.tryD1Write(
          "INSERT INTO user_connections (id, requester_id, receiver_id, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?) ON CONFLICT(id) DO UPDATE SET requester_id = excluded.requester_id, receiver_id = excluded.receiver_id, status = 'pending', updated_at = excluded.updated_at",
          [connId, requesterId, String(targetUser.id), now, now]
        );

        const reqUser = await this.findUserById(requesterId);
        this.queueSignalAndPush(String(targetUser.id), {
          type: "connection_request",
          connection_id: connId,
          from_user_id: requesterId,
          from_name: formatDisplayName(reqUser?.name, reqUser?.connect_id),
          from_connect_id: reqUser?.connect_id || "",
          message: `@${reqUser?.connect_id || "Someone"} sent you a connection request!`,
        });

        return jsonRes({ success: true, connection_id: connId, message: `Connection request sent to @${targetConnectId}!` });
      }

      // 11. Accept Connection
      if (url.pathname === "/api/v1/connections/accept" && request.method === "POST") {
        const body = await getBody();
        const connId = body.connection_id;
        if (!connId) return jsonRes({ detail: "Missing connection_id" }, 400);
        const now = new Date().toISOString();

        let rec = this.sql.exec("SELECT * FROM user_connections WHERE id = ? LIMIT 1", connId).toArray()[0] as any;
        if (!rec && this.env.DB) {
          rec = await this.env.DB.prepare("SELECT * FROM user_connections WHERE id = ?").bind(connId).first().catch(() => null);
        }
        if (!rec && connId.startsWith("conn_")) {
          const parts = connId.replace("conn_", "").split("_");
          if (parts.length === 2) rec = { id: connId, requester_id: parts[0], receiver_id: parts[1] };
        }

        if (rec) {
          this.sql.exec(
            "INSERT OR REPLACE INTO user_connections (id, requester_id, receiver_id, status, created_at, updated_at) VALUES (?, ?, ?, 'accepted', ?, ?)",
            connId,
            String(rec.requester_id),
            String(rec.receiver_id),
            String(rec.created_at || now),
            now
          );
          await this.tryD1Write("UPDATE user_connections SET status = 'accepted', updated_at = ? WHERE id = ?", [now, connId]);
          const receiver = await this.findUserById(String(rec.receiver_id));
          this.queueSignalAndPush(String(rec.requester_id), {
            type: "connection_accepted",
            connection_id: connId,
            from_name: formatDisplayName(receiver?.name, receiver?.connect_id),
            message: "Connection request accepted! You can now chat.",
          });
        }
        return jsonRes({ success: true, message: "Connection accepted!" });
      }

      // 11b. Decline Connection
      if ((url.pathname === "/api/v1/connections/decline" || url.pathname === "/api/v1/connections/reject") && request.method === "POST") {
        const body = await getBody();
        const connId = body.connection_id;
        if (!connId) return jsonRes({ detail: "Missing connection_id" }, 400);
        const now = new Date().toISOString();
        const rec = this.sql.exec("SELECT * FROM user_connections WHERE id = ?", connId).toArray()[0];
        if (rec) {
          this.sql.exec("UPDATE user_connections SET status = 'deleted', updated_at = ? WHERE id = ?", now, connId);
        }
        await this.tryD1Write("DELETE FROM user_connections WHERE id = ?", [connId]);
        return jsonRes({ success: true, message: "Connection request declined" });
      }

      // 11c. Delete Connection & Chat
      if ((url.pathname === "/api/v1/connections/delete" || url.pathname === "/api/v1/connections/remove") && request.method === "POST") {
        const body = await getBody();
        const { connection_id, user_id, target_user_id, conversation_id } = body || {};
        const now = new Date().toISOString();

        if (connection_id) {
          const rec = this.sql.exec("SELECT * FROM user_connections WHERE id = ?", connection_id).toArray()[0];
          if (rec) this.sql.exec("UPDATE user_connections SET status = 'deleted', updated_at = ? WHERE id = ?", now, connection_id);
          else if (user_id && target_user_id) {
            this.sql.exec(
              "INSERT OR REPLACE INTO user_connections (id, requester_id, receiver_id, status, created_at, updated_at) VALUES (?, ?, ?, 'deleted', ?, ?)",
              connection_id,
              user_id,
              target_user_id,
              now,
              now
            );
          }
          await this.tryD1Write("DELETE FROM user_connections WHERE id = ?", [connection_id]);
        }
        if (user_id && target_user_id) {
          this.sql.exec(
            "UPDATE user_connections SET status = 'deleted', updated_at = ? WHERE (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?)",
            now,
            user_id,
            target_user_id,
            target_user_id,
            user_id
          );
          await this.tryD1Write(
            "DELETE FROM user_connections WHERE (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?)",
            [user_id, target_user_id, target_user_id, user_id]
          );
        }
        if (conversation_id) {
          this.sql.exec("INSERT OR REPLACE INTO conversation_meta (conversation_id, cleared_at) VALUES (?, ?)", conversation_id, now);
          this.sql.exec("DELETE FROM messages WHERE conversation_id = ?", conversation_id);
          await this.tryD1Write("DELETE FROM messages WHERE conversation_id = ?", [conversation_id]);
          this.ctx.waitUntil(
            this.env.CHAT_HUB.get(this.env.CHAT_HUB.idFromName(`c:${conversation_id}`))
              .clearChatRpc()
              .catch(() => {})
          );
        }
        return jsonRes({ success: true, message: "Connection and chat deleted successfully" });
      }

      // 12. Messages History (Sub-5ms DO SQLite + Existing D1 Read Merge)
      if (url.pathname.startsWith("/api/v1/messages/") && request.method === "GET") {
        const conversationId = decodeURIComponent(url.pathname.replace("/api/v1/messages/", ""));
        const metaRow = this.sql.exec("SELECT cleared_at FROM conversation_meta WHERE conversation_id = ?", conversationId).toArray()[0];
        const clearedAt = metaRow?.cleared_at ? String(metaRow.cleared_at) : "";
        const msgMap: Record<string, any> = {};

        // Read historical D1 messages first (read queries have no write quota cap)
        if (this.env.DB) {
          try {
            const { results } = await this.env.DB.prepare(
              `SELECT id, workspace_id, conversation_id, sender_id, sender_name, receiver_id,
                      content, file_url, file_name, file_size, file_type, reply_to_id, reply_to_snippet, reactions, is_read, created_at
               FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 120`
            )
              .bind(conversationId)
              .all();
            for (const m of results || []) {
              if (clearedAt && String(m.created_at) <= clearedAt) continue;
              let react = {};
              if (typeof m.reactions === "string" && m.reactions) {
                try { react = JSON.parse(m.reactions); } catch {}
              }
              msgMap[String(m.id)] = { ...m, reactions: react, is_read: Boolean(m.is_read) };
            }
          } catch {}
        }

        // Overlay authoritative DO SQLite messages (includes deleted/read/react & all new messages!)
        const doRows = this.sql
          .exec(
            "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 120",
            conversationId
          )
          .toArray();
        for (const m of doRows) {
          if (Number(m.is_deleted || 0) === 1 || (clearedAt && String(m.created_at) <= clearedAt)) {
            delete msgMap[String(m.id)];
            continue;
          }
          let react = {};
          if (typeof m.reactions === "string" && m.reactions) {
            try { react = JSON.parse(m.reactions); } catch {}
          }
          msgMap[String(m.id)] = {
            ...m,
            reactions: react,
            is_read: Boolean(m.is_read),
          };
        }

        const out = Object.values(msgMap).sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        return jsonRes(out);
      }

      // 13. Send Message (DO SQLite Immediate Save + Instant WebSocket Push!)
      if (url.pathname === "/api/v1/messages/send" && request.method === "POST") {
        const body = await getBody();
        if (!body.conversation_id || !body.sender_id) {
          return jsonRes({ detail: "Missing message fields" }, 400);
        }

        const mid = crypto.randomUUID();
        const now = new Date().toISOString();
        const targetReceiverId =
          body.receiver_id || parseDirectPartnerId(body.conversation_id, body.sender_id);

        const msgObj = {
          id: mid,
          workspace_id: "ws-1",
          conversation_id: body.conversation_id,
          sender_id: body.sender_id,
          sender_name: body.sender_name || "User",
          receiver_id: targetReceiverId,
          content: body.content || "",
          file_url: body.file_url || null,
          file_name: body.file_name || null,
          file_size: body.file_size || null,
          file_type: body.file_type || null,
          reply_to_id: body.reply_to_id || null,
          reply_to_snippet: body.reply_to_snippet || null,
          reactions: {},
          is_read: false,
          status: "delivered",
          created_at: now,
        };

        this.sql.exec(
          `INSERT INTO messages (id, workspace_id, conversation_id, sender_id, sender_name, receiver_id, content, file_url, file_name, file_size, file_type, reply_to_id, reply_to_snippet, reactions, is_read, is_deleted, created_at)
           VALUES (?, 'ws-1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', 0, 0, ?)`,
          mid,
          body.conversation_id,
          body.sender_id,
          body.sender_name || "User",
          targetReceiverId,
          body.content || "",
          body.file_url || null,
          body.file_name || null,
          body.file_size || null,
          body.file_type || null,
          body.reply_to_id || null,
          body.reply_to_snippet || null,
          now
        );

        // Best-effort D1 mirror (non-blocking for quota safety)
        this.tryD1Write(
          "INSERT INTO messages (id, workspace_id, conversation_id, sender_id, sender_name, receiver_id, content, file_url, file_name, file_size, file_type, reply_to_id, reply_to_snippet, reactions, is_read, created_at) VALUES (?, 'ws-1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', 0, ?)",
          [
            mid,
            body.conversation_id,
            body.sender_id,
            body.sender_name || "User",
            targetReceiverId,
            body.content || "",
            body.file_url || null,
            body.file_name || null,
            body.file_size || null,
            body.file_type || null,
            body.reply_to_id || null,
            body.reply_to_snippet || null,
            now,
          ]
        );

        // Instant WebSocket + signal delivery!
        if (String(body.conversation_id).startsWith("group_")) {
          const grpRow = this.sql.exec("SELECT members, created_by FROM groups WHERE id = ?", body.conversation_id).toArray()[0];
          const members: string[] = grpRow?.members ? JSON.parse(String(grpRow.members)) : [];
          if (grpRow?.created_by && !members.includes(String(grpRow.created_by))) {
            members.push(String(grpRow.created_by));
          }
          for (const uid of members) {
            if (uid && uid !== body.sender_id) {
              this.queueSignalAndPush(uid, {
                type: "new_message",
                conversation_id: body.conversation_id,
                message: msgObj,
              });
            }
          }
        } else if (targetReceiverId && targetReceiverId !== body.sender_id) {
          this.queueSignalAndPush(targetReceiverId, {
            type: "new_message",
            conversation_id: body.conversation_id,
            message: msgObj,
          });
        }

        return jsonRes({ success: true, message: msgObj });
      }

      // 14. Mark Messages Read
      if (url.pathname === "/api/v1/messages/read" && request.method === "POST") {
        const body = await getBody();
        const { conversation_id, reader_id } = body || {};
        if (conversation_id) {
          if (reader_id) {
            this.sql.exec(
              "UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND is_read = 0 AND sender_id != ?",
              conversation_id,
              reader_id
            );
            const partnerId = parseDirectPartnerId(conversation_id, reader_id);
            if (partnerId) {
              this.sendWsToUser(partnerId, {
                type: "messages_read",
                conversation_id,
                reader_id,
              });
            }
          } else {
            this.sql.exec("UPDATE messages SET is_read = 1 WHERE conversation_id = ?", conversation_id);
          }
        }
        return jsonRes({ success: true });
      }

      // 14b. Clear Chat
      if (url.pathname === "/api/v1/messages/clear" && request.method === "POST") {
        const body = await getBody();
        const convId = body?.conversation_id;
        if (convId) {
          const now = new Date().toISOString();
          this.sql.exec("INSERT OR REPLACE INTO conversation_meta (conversation_id, cleared_at) VALUES (?, ?)", convId, now);
          this.sql.exec("DELETE FROM messages WHERE conversation_id = ?", convId);
          await this.tryD1Write("DELETE FROM messages WHERE conversation_id = ?", [convId]);
        }
        return jsonRes({ success: true, message: "Chat messages cleared" });
      }

      // 14c. Delete Specific Messages
      if (url.pathname === "/api/v1/messages/delete" && request.method === "POST") {
        const body = await getBody();
        const { conversation_id, message_id, message_ids, user_id } = body || {};
        const ids: string[] = Array.isArray(message_ids) ? [...message_ids] : [];
        if (message_id && !ids.includes(message_id)) ids.push(message_id);

        for (const mid of ids) {
          const existing = this.sql.exec("SELECT id FROM messages WHERE id = ?", mid).toArray();
          if (existing.length > 0) {
            this.sql.exec("UPDATE messages SET is_deleted = 1 WHERE id = ?", mid);
          } else if (conversation_id) {
            this.sql.exec(
              "INSERT OR IGNORE INTO messages (id, workspace_id, conversation_id, sender_id, sender_name, content, is_deleted, created_at) VALUES (?, 'ws-1', ?, ?, 'Deleted', '', 1, ?)",
              mid,
              conversation_id,
              user_id || "user",
              new Date().toISOString()
            );
          }
          await this.tryD1Write("DELETE FROM messages WHERE id = ?", [mid]);
        }
        const partnerId = parseDirectPartnerId(conversation_id, user_id);
        if (partnerId && ids.length > 0) {
          this.queueSignalAndPush(partnerId, {
            type: "message_deleted",
            conversation_id,
            deleted_ids: ids,
          });
        }
        return jsonRes({ success: true, deleted_ids: ids });
      }

      // 15. Message Reactions
      if (url.pathname === "/api/v1/messages/react" && request.method === "POST") {
        const body = await getBody();
        const { message_id, user_id, user_name, emoji } = body || {};
        if (!message_id || !emoji) return jsonRes({ detail: "Missing message_id or emoji" }, 400);

        let row: any = this.sql.exec("SELECT conversation_id, reactions FROM messages WHERE id = ?", message_id).toArray()[0];
        if (!row && this.env.DB) {
          const d1Row = await this.env.DB.prepare("SELECT * FROM messages WHERE id = ?").bind(message_id).first().catch(() => null);
          if (d1Row) {
            this.sql.exec(
              "INSERT OR IGNORE INTO messages (id, workspace_id, conversation_id, sender_id, sender_name, receiver_id, content, reactions, is_read, is_deleted, created_at) VALUES (?, 'ws-1', ?, ?, ?, ?, ?, ?, ?, 0, ?)",
              String(d1Row.id),
              String(d1Row.conversation_id),
              String(d1Row.sender_id),
              String(d1Row.sender_name),
              d1Row.receiver_id ? String(d1Row.receiver_id) : null,
              String(d1Row.content || ""),
              String(d1Row.reactions || "{}"),
              d1Row.is_read ? 1 : 0,
              String(d1Row.created_at)
            );
            row = d1Row;
          }
        }

        let reactions: Record<string, string[]> = {};
        if (row?.reactions && typeof row.reactions === "string") {
          try { reactions = JSON.parse(row.reactions); } catch {}
        }
        const actor = user_id || user_name || "User";
        const list = Array.isArray(reactions[emoji]) ? [...reactions[emoji]] : [];
        if (list.includes(actor) || (user_name && list.includes(user_name))) {
          const next = list.filter((u) => u !== actor && u !== user_name);
          if (next.length === 0) delete reactions[emoji];
          else reactions[emoji] = next;
        } else {
          list.push(actor);
          reactions[emoji] = list;
        }

        const rJson = JSON.stringify(reactions);
        this.sql.exec("UPDATE messages SET reactions = ? WHERE id = ?", rJson, message_id);
        await this.tryD1Write("UPDATE messages SET reactions = ? WHERE id = ?", [rJson, message_id]);

        const partnerId = parseDirectPartnerId(String(row?.conversation_id || ""), user_id);
        if (partnerId) {
          this.sendWsToUser(partnerId, {
            type: "message_reaction",
            conversation_id: String(row?.conversation_id || ""),
            message_id,
            reactions,
          });
        }
        return jsonRes({ success: true, reactions });
      }

      // 15b. LiveKit Token Generator
      if (url.pathname === "/api/v1/livekit/token" && request.method === "POST") {
        const body = await getBody();
        const roomName = body.room_name || `room_${Date.now()}`;
        const identity = body.participant_identity || `user_${Date.now()}`;
        const name = body.participant_name || identity;
        const jwtToken = await generateLiveKitJwt(
          roomName,
          identity,
          name,
          body.can_publish !== false,
          body.can_subscribe !== false
        );
        return jsonRes({
          success: true,
          token: jwtToken,
          url: LIVEKIT_URL,
          room_name: roomName,
          participant_identity: identity,
        });
      }

      // 15c. Calling System Endpoints (Authoritative State Machine + Instant WS Push + History)
      if (url.pathname === "/api/v1/calls/initiate" && request.method === "POST") {
        const body = await getBody();
        const { caller_id, target_user_id, call_type, room_name, title } = body || {};
        const callId = room_name || `call_${crypto.randomUUID()}`;
        const now = new Date().toISOString();
        const isGroupTarget = Boolean(target_user_id && String(target_user_id).startsWith("group_"));
        const directTargetId = isGroupTarget ? null : target_user_id;

        this.sql.exec("DELETE FROM active_call_locks WHERE expires_at <= ?", now);
        if (directTargetId) {
          const busy = this.sql
            .exec("SELECT call_id FROM active_call_locks WHERE user_id = ? AND expires_at > ? LIMIT 1", directTargetId, now)
            .toArray();
          if (busy.length > 0) {
            const targetUser = await this.findUserById(directTargetId);
            const targetDisplay = formatDisplayName(targetUser?.name, targetUser?.connect_id);
            return jsonRes({
              success: false,
              reason: "busy",
              message: `${targetDisplay} is currently on another call.`,
            });
          }
        }

        const callerUser = caller_id ? await this.findUserById(caller_id) : null;
        const targetUser = directTargetId ? await this.findUserById(directTargetId) : null;
        const callerName = formatDisplayName(callerUser?.name || title, callerUser?.connect_id);
        const callerConnect = callerUser?.connect_id || "";
        const callerAvatar = callerUser?.avatar || "";
        const targetName = formatDisplayName(targetUser?.name || title, targetUser?.connect_id);
        const targetConnect = targetUser?.connect_id || "";
        const targetAvatar = targetUser?.avatar || "";

        const ringExp = new Date(Date.now() + 45000).toISOString();
        this.sql.exec(
          `INSERT OR REPLACE INTO calls (id, caller_id, caller_name, caller_connect_id, caller_avatar, target_user_id, target_name, target_connect_id, target_avatar, call_type, call_status, started_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          callId,
          caller_id || "anon",
          callerName,
          callerConnect,
          callerAvatar,
          directTargetId,
          targetName,
          targetConnect,
          targetAvatar,
          call_type || "video",
          target_user_id ? "ringing" : "active",
          now,
          now
        );

        if (caller_id) {
          this.sql.exec(
            "INSERT OR IGNORE INTO call_participants (id, call_id, user_id, joined_at, participant_status) VALUES (?, ?, ?, ?, 'joined')",
            crypto.randomUUID(),
            callId,
            caller_id,
            now
          );
          this.sql.exec(
            "INSERT OR REPLACE INTO active_call_locks (user_id, call_id, call_status, expires_at) VALUES (?, ?, 'ringing', ?)",
            caller_id,
            callId,
            ringExp
          );
        }

        if (isGroupTarget) {
          const gRow = this.sql.exec("SELECT name, members, created_by FROM groups WHERE id = ?", target_user_id).toArray()[0];
          const members: string[] = gRow?.members ? JSON.parse(String(gRow.members)) : [];
          if (gRow?.created_by && !members.includes(String(gRow.created_by))) members.push(String(gRow.created_by));
          for (const uid of members) {
            if (!uid || uid === caller_id) continue;
            this.sql.exec(
              "INSERT OR IGNORE INTO call_participants (id, call_id, user_id, joined_at, participant_status) VALUES (?, ?, ?, ?, 'ringing')",
              crypto.randomUUID(),
              callId,
              uid,
              now
            );
            this.queueSignalAndPush(uid, {
              type: "incoming_call",
              call_id: callId,
              caller_id,
              caller_name: `${gRow?.name || "Group"} (${callerName})`,
              caller_connect_id: callerConnect,
              caller_avatar: callerAvatar,
              room_name: callId,
              call_type: "group",
            });
          }
        } else if (directTargetId) {
          this.sql.exec(
            "INSERT OR IGNORE INTO call_participants (id, call_id, user_id, joined_at, participant_status) VALUES (?, ?, ?, ?, 'ringing')",
            crypto.randomUUID(),
            callId,
            directTargetId,
            now
          );
          this.sql.exec(
            "INSERT OR REPLACE INTO active_call_locks (user_id, call_id, call_status, expires_at) VALUES (?, ?, 'ringing', ?)",
            directTargetId,
            callId,
            ringExp
          );
          this.queueSignalAndPush(directTargetId, {
            type: "incoming_call",
            call_id: callId,
            caller_id,
            caller_name: callerName,
            caller_connect_id: callerConnect,
            caller_avatar: callerAvatar,
            room_name: callId,
            call_type: call_type || "video",
          });
        }

        const token = await generateLiveKitJwt(callId, caller_id || "anon", title || callerName);
        return jsonRes({
          success: true,
          call_id: callId,
          room_name: callId,
          call_type: call_type || "video",
          call_status: target_user_id ? "ringing" : "active",
          livekit_token: token,
          livekit_url: LIVEKIT_URL,
        });
      }

      if (url.pathname === "/api/v1/calls/signals" && request.method === "GET") {
        const userId = url.searchParams.get("user_id") || "";
        const signals: any[] = [];
        const typing: string[] = [];
        if (userId) {
          const nowIso = new Date().toISOString();
          this.setPresence(userId, "online");
          const sigRows = this.sql
            .exec("SELECT id, payload FROM realtime_signals WHERE user_id = ? ORDER BY created_at ASC LIMIT 50", userId)
            .toArray();
          for (const row of sigRows) {
            try { signals.push(JSON.parse(String(row.payload))); } catch {}
            this.sql.exec("DELETE FROM realtime_signals WHERE id = ?", row.id);
          }
          const typeRows = this.sql
            .exec("SELECT from_user_id FROM typing_status WHERE target_user_id = ? AND expires_at > ?", userId, nowIso)
            .toArray();
          for (const tr of typeRows) {
            if (tr.from_user_id) typing.push(String(tr.from_user_id));
          }
        }
        return jsonRes({ signals, typing });
      }

      if (url.pathname === "/api/v1/calls/respond" && request.method === "POST") {
        const body = await getBody();
        const { call_id, user_id, accepted } = body || {};
        const now = new Date().toISOString();
        const newStatus = accepted ? "active" : "rejected";

        if (call_id) {
          this.sql.exec("UPDATE calls SET call_status = ?, answered_at = ? WHERE id = ?", newStatus, accepted ? now : null, call_id);
          const row = this.sql.exec("SELECT caller_id FROM calls WHERE id = ?", call_id).toArray()[0];
          if (row?.caller_id) {
            this.queueSignalAndPush(String(row.caller_id), {
              type: "call_response",
              call_id,
              room_name: call_id,
              responder_id: user_id,
              accepted: Boolean(accepted),
            });
          }
          if (!accepted) {
            this.sql.exec("DELETE FROM active_call_locks WHERE call_id = ?", call_id);
          } else {
            const exp = new Date(Date.now() + 1800000).toISOString();
            this.sql.exec("UPDATE active_call_locks SET call_status = 'active', expires_at = ? WHERE call_id = ?", exp, call_id);
          }
        }
        return jsonRes({ success: true, call_status: newStatus });
      }

      if (url.pathname === "/api/v1/calls/end" && request.method === "POST") {
        const body = await getBody();
        const { call_id, user_id, duration_seconds, target_user_id } = body || {};
        const now = new Date().toISOString();
        if (call_id) {
          this.sql.exec("UPDATE calls SET call_status = 'ended', ended_at = ?, duration = ? WHERE id = ?", now, duration_seconds || 0, call_id);
          this.sql.exec("DELETE FROM active_call_locks WHERE call_id = ?", call_id);

          const pRows = this.sql.exec("SELECT DISTINCT user_id FROM call_participants WHERE call_id = ?", call_id).toArray();
          const notify = new Set<string>();
          for (const pr of pRows) {
            if (pr.user_id && String(pr.user_id) !== user_id) notify.add(String(pr.user_id));
          }
          if (target_user_id && target_user_id !== user_id && !String(target_user_id).startsWith("group_")) {
            notify.add(String(target_user_id));
          }
          for (const otherId of notify) {
            this.queueSignalAndPush(otherId, {
              type: "call_ended",
              call_id,
              room_name: call_id,
              user_id,
            });
          }
        }
        return jsonRes({ success: true, duration: duration_seconds || 0 });
      }

      if (url.pathname === "/api/v1/calls/timeout" && request.method === "POST") {
        const body = await getBody();
        const { call_id, caller_id, target_user_id } = body || {};
        const now = new Date().toISOString();
        if (call_id) {
          this.sql.exec("UPDATE calls SET call_status = 'missed', ended_at = ?, duration = 0 WHERE id = ?", now, call_id);
          this.sql.exec("DELETE FROM active_call_locks WHERE call_id = ?", call_id);
          const pRows = this.sql.exec("SELECT DISTINCT user_id FROM call_participants WHERE call_id = ?", call_id).toArray();
          const notify = new Set<string>();
          for (const pr of pRows) {
            if (pr.user_id && String(pr.user_id) !== caller_id) notify.add(String(pr.user_id));
          }
          if (target_user_id && !String(target_user_id).startsWith("group_")) notify.add(String(target_user_id));
          for (const uid of notify) {
            this.queueSignalAndPush(uid, {
              type: "call_timeout",
              call_id,
              room_name: call_id,
              caller_id,
            });
          }
        }
        return jsonRes({ success: true, call_status: "missed" });
      }

      if (url.pathname === "/api/v1/calls/history" && request.method === "GET") {
        const userId = url.searchParams.get("user_id") || "";
        if (!userId) return jsonRes([]);
        const rows = this.sql
          .exec(
            `SELECT c.* FROM calls c
             LEFT JOIN call_participants p ON p.call_id = c.id
             WHERE c.caller_id = ? OR c.target_user_id = ? OR p.user_id = ?
             GROUP BY c.id
             ORDER BY c.created_at DESC LIMIT 50`,
            userId,
            userId,
            userId
          )
          .toArray();
        return jsonRes(
          rows.map((c: any) => {
            const isCaller = String(c.caller_id) === userId;
            const partnerId = isCaller ? c.target_user_id : c.caller_id;
            return {
              id: c.id,
              call_type: c.call_type || "video",
              call_status: c.call_status || "ended",
              duration: Number(c.duration || 0),
              started_at: c.started_at,
              ended_at: c.ended_at,
              created_at: c.created_at,
              is_caller: isCaller,
              partner_id: partnerId,
              partner_name: isCaller ? (c.target_name || "Teammate") : (c.caller_name || "Teammate"),
              partner_connect_id: isCaller ? (c.target_connect_id || "") : (c.caller_connect_id || ""),
              partner_avatar: isCaller ? (c.target_avatar || "") : (c.caller_avatar || ""),
            };
          })
        );
      }

      if (url.pathname === "/api/v1/calls/settings" && request.method === "GET") {
        const userId = url.searchParams.get("user_id") || "";
        const row = this.sql.exec("SELECT * FROM user_call_settings WHERE user_id = ?", userId).toArray()[0];
        return jsonRes({
          user_id: userId,
          allow_voice_calls: row ? Boolean(row.allow_voice_calls) : true,
          allow_video_calls: row ? Boolean(row.allow_video_calls) : true,
          notification_enabled: row ? Boolean(row.notification_enabled) : true,
          privacy_settings: row?.privacy_settings ? JSON.parse(String(row.privacy_settings)) : {},
        });
      }

      if (url.pathname === "/api/v1/calls/settings" && request.method === "PUT") {
        const body = await getBody();
        if (body.user_id) {
          this.sql.exec(
            "INSERT OR REPLACE INTO user_call_settings (user_id, allow_voice_calls, allow_video_calls, notification_enabled, privacy_settings) VALUES (?, ?, ?, ?, ?)",
            body.user_id,
            body.allow_voice_calls !== false ? 1 : 0,
            body.allow_video_calls !== false ? 1 : 0,
            body.notification_enabled !== false ? 1 : 0,
            JSON.stringify(body.privacy_settings || {})
          );
        }
        return jsonRes({ success: true, ...body });
      }

      // 16. Search Users
      if (url.pathname === "/api/v1/users/search" && request.method === "GET") {
        const q = (url.searchParams.get("q") || "").trim().toLowerCase().replace(/^@/, "");
        const currentUserId = url.searchParams.get("current_user_id") || "";
        if (!q) return jsonRes([]);

        const term = `%${q}%`;
        const usersMap = new Map<string, any>();

        if (this.env.DB) {
          try {
            const { results } = await this.env.DB.prepare(
              `SELECT id, connect_id, email, name, bio, status, avatar
               FROM users
               WHERE (lower(connect_id) LIKE ? OR lower(name) LIKE ? OR lower(email) LIKE ?)
                 AND id != ? LIMIT 25`
            )
              .bind(term, term, term, currentUserId)
              .all();
            for (const u of results || []) {
              usersMap.set(String(u.id), u);
            }
          } catch {}
        }

        const doUsers = this.sql
          .exec(
            `SELECT id, connect_id, email, name, bio, status, avatar
             FROM users
             WHERE (lower(connect_id) LIKE ? OR lower(name) LIKE ? OR lower(email) LIKE ?)
               AND id != ? LIMIT 25`,
            term,
            term,
            term,
            currentUserId
          )
          .toArray();
        for (const u of doUsers) usersMap.set(String(u.id), u);

        const out: any[] = [];
        const onlineSet = this.getOnlineSet();
        for (const u of usersMap.values()) {
          const uid = String(u.id);
          let conn = this.sql
            .exec(
              "SELECT * FROM user_connections WHERE (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?) LIMIT 1",
              currentUserId,
              uid,
              uid,
              currentUserId
            )
            .toArray()[0] as any;
          if (!conn && this.env.DB && currentUserId) {
            conn = await this.env.DB.prepare(
              "SELECT * FROM user_connections WHERE (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?) LIMIT 1"
            )
              .bind(currentUserId, uid, uid, currentUserId)
              .first()
              .catch(() => null);
          }

          let connStatus = conn?.status || "none";
          let connId = conn?.id || null;
          let isSender = conn ? String(conn.requester_id) === currentUserId : false;
          if (connStatus === "deleted") {
            connStatus = "none";
            connId = null;
            isSender = false;
          }

          out.push({
            id: uid,
            connect_id: u.connect_id,
            name: formatDisplayName(String(u.name), String(u.connect_id)),
            email: u.email,
            bio: u.bio || "",
            status: onlineSet.has(uid) ? "online" : "offline",
            avatar: u.avatar || "",
            connection_status: connStatus,
            connection_id: connId,
            is_sender: isSender,
          });
        }
        return jsonRes(out);
      }

      // 17. Presence & Typing
      if (url.pathname === "/api/v1/presence/heartbeat" && request.method === "POST") {
        const body = await getBody();
        if (body.user_id) this.setPresence(body.user_id, body.status || "online");
        return jsonRes({ success: true });
      }

      if (url.pathname === "/api/v1/presence/typing" && request.method === "POST") {
        const body = await getBody();
        if (body.from_user_id && body.target_user_id) {
          if (body.is_typing) {
            this.sql.exec(
              "INSERT OR REPLACE INTO typing_status (target_user_id, from_user_id, expires_at) VALUES (?, ?, ?)",
              body.target_user_id,
              body.from_user_id,
              new Date(Date.now() + 7000).toISOString()
            );
          } else {
            this.sql.exec(
              "DELETE FROM typing_status WHERE target_user_id = ? AND from_user_id = ?",
              body.target_user_id,
              body.from_user_id
            );
          }
          this.sendWsToUser(body.target_user_id, {
            type: "typing",
            sender_id: body.from_user_id,
            is_typing: Boolean(body.is_typing),
          });
        }
        return jsonRes({ success: true });
      }

      if (url.pathname === "/api/v1/presence" && request.method === "GET") {
        const map: Record<string, any> = {};
        const now = new Date().toISOString();
        for (const uid of this.getOnlineSet()) {
          map[uid] = { status: "online", last_seen: now };
        }
        return jsonRes(map);
      }

      // 18. Files Upload / Raw / List / Delete
      if (url.pathname === "/api/v1/files/upload" && request.method === "POST") {
        const formData = await request.formData();
        const file = formData.get("file") as File;
        const userId = url.searchParams.get("user_id") || (formData.get("user_id") as string) || "";
        const sharedBy = url.searchParams.get("shared_by") || (formData.get("shared_by") as string) || "You";
        if (!file) return jsonRes({ detail: "No file provided" }, 400);

        const buffer = await file.arrayBuffer();
        const base64 = arrayBufferToBase64(buffer);
        const mimeType = file.type || "application/octet-stream";
        const sizeKb = file.size / 1024;
        const sizeStr = sizeKb < 1024 ? `${sizeKb.toFixed(1)} KB` : `${(sizeKb / 1024).toFixed(2)} MB`;
        const fileId = crypto.randomUUID();
        const now = new Date().toISOString();
        const fileUrl = `/api/v1/files/raw/${fileId}`;

        // Store binary payload in KV if <= 24MB and keep DO SQLite metadata/backup for small payloads
        let storedInKv = false;
        if (this.env.KV) {
          try {
            await this.env.KV.put(`file_blob:${fileId}`, JSON.stringify({ base64, mimeType, fileName: file.name }));
            storedInKv = true;
          } catch {}
        }
        this.sql.exec(
          "INSERT INTO uploaded_files (id, user_id, file_name, file_size, file_type, file_url, shared_by, data_base64, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          fileId,
          userId,
          file.name,
          sizeStr,
          mimeType,
          fileUrl,
          sharedBy,
          storedInKv || file.size > 1200000 ? null : base64,
          now
        );

        return jsonRes({
          success: true,
          id: fileId,
          file_url: fileUrl,
          file_name: file.name,
          file_size: sizeStr,
          file_type: mimeType,
        });
      }

      if (url.pathname.startsWith("/api/v1/files/raw/") && request.method === "GET") {
        const fileId = url.pathname.replace("/api/v1/files/raw/", "");
        if (this.env.KV) {
          const blobStr = await this.env.KV.get(`file_blob:${fileId}`);
          if (blobStr) {
            const { base64, mimeType, fileName } = JSON.parse(blobStr);
            const bytes = base64ToUint8Array(base64);
            return new Response(bytes, {
              headers: {
                ...CORS_HEADERS,
                "Content-Type": mimeType || "application/octet-stream",
                "Content-Disposition": `inline; filename="${fileName || "file"}"`,
                "Cache-Control": "public, max-age=31536000",
              },
            });
          }
        }
        const row = this.sql.exec("SELECT file_name, file_type, data_base64 FROM uploaded_files WHERE id = ?", fileId).toArray()[0];
        if (row?.data_base64) {
          const bytes = base64ToUint8Array(String(row.data_base64));
          return new Response(bytes, {
            headers: {
              ...CORS_HEADERS,
              "Content-Type": String(row.file_type || "application/octet-stream"),
              "Content-Disposition": `inline; filename="${row.file_name || "file"}"`,
            },
          });
        }
        return new Response("File not found", { status: 404, headers: CORS_HEADERS });
      }

      if (url.pathname === "/api/v1/files/list" && request.method === "GET") {
        const rows = this.sql
          .exec("SELECT id, user_id, file_name, file_size, file_type, file_url, shared_by, created_at FROM uploaded_files ORDER BY created_at DESC LIMIT 100")
          .toArray();
        return jsonRes(
          rows.map((r: any) => ({
            id: r.id,
            name: r.file_name,
            size: r.file_size || "1 KB",
            date: r.created_at,
            sharedBy: r.shared_by || "You",
            type: String(r.file_name || "").includes(".") ? String(r.file_name).split(".").pop() : "doc",
            file_url: r.file_url,
          }))
        );
      }

      if (url.pathname.startsWith("/api/v1/files/") && request.method === "DELETE") {
        const fileId = url.pathname.replace("/api/v1/files/", "");
        if (fileId) {
          if (this.env.KV) await this.env.KV.delete(`file_blob:${fileId}`).catch(() => {});
          this.sql.exec("DELETE FROM uploaded_files WHERE id = ?", fileId);
        }
        return jsonRes({ success: true });
      }

      // 19. Groups
      if (url.pathname === "/api/v1/groups" && request.method === "GET") {
        const userId = url.searchParams.get("user_id") || "";
        if (!userId) return jsonRes([]);
        const rows = this.sql.exec("SELECT * FROM groups ORDER BY created_at DESC LIMIT 50").toArray();
        const out: any[] = [];
        for (const g of rows) {
          const members: string[] = g.members ? JSON.parse(String(g.members)) : [];
          if (String(g.created_by) === userId || members.includes(userId)) {
            out.push({
              connection_id: g.id,
              user_id: g.id,
              name: g.name,
              connect_id: g.connect_id || `group_${String(g.name).toLowerCase().replace(/\s+/g, "_")}`,
              bio: g.description || `Group · ${members.length} participants`,
              status: "online",
              conversation_id: g.id,
              members,
            });
          }
        }
        return jsonRes(out);
      }

      if (url.pathname === "/api/v1/groups/create" && request.method === "POST") {
        const body = await getBody();
        const groupName = (body.name || "").trim();
        const createdBy = body.created_by || "";
        const members = Array.from(new Set([createdBy, ...(body.members || [])].filter(Boolean)));
        const groupId = `group_${Date.now()}`;
        const connectId = `group_${groupName.toLowerCase().replace(/\s+/g, "_")}`;
        const desc = body.description || `Group · ${members.length} participants`;
        const now = new Date().toISOString();

        this.sql.exec(
          "INSERT INTO groups (id, name, connect_id, description, created_by, members, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          groupId,
          groupName,
          connectId,
          desc,
          createdBy,
          JSON.stringify(members),
          now
        );
        this.sql.exec(
          "INSERT INTO messages (id, workspace_id, conversation_id, sender_id, sender_name, content, is_read, is_deleted, created_at) VALUES (?, 'ws-1', ?, ?, 'System', ?, 1, 0, ?)",
          crypto.randomUUID(),
          groupId,
          createdBy,
          `Created group "${groupName}" with ${members.length} participants.`,
          now
        );
        return jsonRes({
          success: true,
          group: {
            connection_id: groupId,
            user_id: groupId,
            name: groupName,
            connect_id: connectId,
            bio: desc,
            status: "online",
            conversation_id: groupId,
            members,
          },
        });
      }

      // 20. Meetings
      if (url.pathname === "/api/v1/meetings" && request.method === "GET") {
        const rows = this.sql.exec("SELECT * FROM meetings ORDER BY created_at DESC LIMIT 50").toArray();
        return jsonRes(
          rows.map((m: any) => ({
            id: m.id,
            title: m.title,
            time: m.time || "Upcoming",
            host: m.host_name || "You",
            host_id: m.host_id,
            room_name: m.room_name,
            participants: 1,
            link: `/?room=${m.room_name}`,
            isLive: Boolean(m.is_live),
            aiNotesEnabled: Boolean(m.ai_notes_enabled),
          }))
        );
      }

      if (url.pathname === "/api/v1/meetings" && request.method === "POST") {
        const body = await getBody();
        const mid = `m-${Date.now()}`;
        const title = (body.title || "Team Meeting").trim();
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const roomName = body.room_name || `meet-${slug}-${Date.now()}`;
        const now = new Date().toISOString();

        this.sql.exec(
          "INSERT INTO meetings (id, title, time, host_id, host_name, room_name, is_live, ai_notes_enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?)",
          mid,
          title,
          body.time || "Upcoming",
          body.host_id || "",
          body.host_name || "You",
          roomName,
          now
        );
        return jsonRes({
          id: mid,
          title,
          time: body.time || "Upcoming",
          host: body.host_name || "You",
          host_id: body.host_id || "",
          room_name: roomName,
          participants: 1,
          link: `/?room=${roomName}`,
          isLive: false,
          aiNotesEnabled: true,
        });
      }

      if (url.pathname.startsWith("/api/v1/meetings/") && request.method === "DELETE") {
        const mid = url.pathname.replace("/api/v1/meetings/", "");
        if (mid) this.sql.exec("DELETE FROM meetings WHERE id = ?", mid);
        return jsonRes({ success: true });
      }

      // 21. Teams
      if (url.pathname === "/api/v1/teams" && request.method === "GET") {
        const userId = url.searchParams.get("user_id") || "";
        const rows = this.sql.exec("SELECT * FROM teams ORDER BY created_at DESC LIMIT 50").toArray();
        const list = rows.map((t: any) => {
          const members = t.members ? JSON.parse(String(t.members)) : [];
          return {
            id: t.id,
            name: t.name,
            desc: t.description || "Team workspace",
            owner_id: t.owner_id,
            members: members.length || 1,
            member_list: members,
            activeCalls: 0,
          };
        });
        if (!userId) return jsonRes(list);
        return jsonRes(list.filter((t: any) => t.owner_id === userId || t.member_list.some((m: any) => m.user_id === userId)));
      }

      if (url.pathname === "/api/v1/teams" && request.method === "POST") {
        const body = await getBody();
        const tid = `t-${Date.now()}`;
        const ownerId = body.owner_id || "";
        const name = (body.name || "Team").trim();
        const desc = body.description || "Team workspace";
        const now = new Date().toISOString();
        const owner = ownerId ? await this.findUserById(ownerId) : null;
        const members = [
          {
            user_id: ownerId,
            name: formatDisplayName(owner?.name, owner?.connect_id) || "Owner",
            connect_id: owner?.connect_id || "",
            role: "owner",
          },
        ];
        this.sql.exec(
          "INSERT INTO teams (id, name, description, owner_id, members, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          tid,
          name,
          desc,
          ownerId,
          JSON.stringify(members),
          now
        );
        return jsonRes({ id: tid, name, desc, owner_id: ownerId, members: 1, member_list: members, activeCalls: 0 });
      }

      if (url.pathname === "/api/v1/teams/members" && request.method === "POST") {
        const body = await getBody();
        const { team_id, connect_id, user_id, action } = body || {};
        if (!team_id) return jsonRes({ detail: "Missing team_id" }, 400);
        const team = this.sql.exec("SELECT * FROM teams WHERE id = ?", team_id).toArray()[0];
        if (!team) return jsonRes({ detail: "Team not found" }, 404);
        let members: any[] = team.members ? JSON.parse(String(team.members)) : [];

        if (action === "add" && connect_id) {
          const u = await this.findUserByIdentifier(String(connect_id));
          if (!u) return jsonRes({ detail: `User @${connect_id} not found` }, 404);
          if (!members.some((m) => m.user_id === u.id)) {
            members.push({
              user_id: u.id,
              name: formatDisplayName(String(u.name), String(u.connect_id)),
              connect_id: u.connect_id,
              role: "member",
            });
          }
        } else if (action === "remove" && user_id) {
          members = members.filter((m) => m.user_id !== user_id);
        }

        this.sql.exec("UPDATE teams SET members = ? WHERE id = ?", JSON.stringify(members), team_id);
        return jsonRes({ success: true, member_list: members, members: members.length });
      }

      // 22. Intelligence
      if (url.pathname === "/api/v1/intelligence/summarize" && request.method === "POST") {
        const body = await getBody();
        const durationSec = Number(body.duration_seconds || 0);
        const mins = Math.max(1, Math.floor(durationSec / 60));
        const pNames: string[] = Array.isArray(body.participants) && body.participants.length > 0 ? body.participants : ["Teammate 1", "Teammate 2"];
        const title = body.title || "Team Synchronization";
        const roomName = body.room_name || `room_${Date.now()}`;
        const reportId = crypto.randomUUID();
        const now = new Date().toISOString();
        const summaryText = `Completed ${mins}-minute ${body.meeting_type || "video"} session "${title}" between ${pNames.join(" & ")}. Key objectives and next actions logged cleanly.`;
        const actionItems = [
          `Follow up with ${pNames[pNames.length - 1] || "team"} on milestones`,
          `Review call outcomes inside Vertex Connect`,
        ];
        const keyDecisions = [
          `Session "${title}" completed over encrypted LiveKit WebRTC`,
          `Summary approved for quality intelligence tracking`,
        ];
        const talkTime = pNames.map((p, idx) => ({
          speaker: p,
          percentage: idx === 0 ? Math.ceil(100 / pNames.length) : Math.floor(100 / pNames.length),
        }));

        this.sql.exec(
          `INSERT INTO meeting_intelligence (id, room_name, title, caller_id, duration_seconds, executive_summary, action_items, key_decisions, sentiment_score, sentiment_label, talk_time_breakdown, status, supervisor_notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 94, 'Constructive', ?, 'pending', '', ?)`,
          reportId,
          roomName,
          title,
          body.caller_id || "",
          durationSec,
          summaryText,
          JSON.stringify(actionItems),
          JSON.stringify(keyDecisions),
          JSON.stringify(talkTime),
          now
        );

        return jsonRes({
          success: true,
          report: {
            id: reportId,
            room_name: roomName,
            title,
            duration_seconds: durationSec,
            executive_summary: summaryText,
            action_items: actionItems,
            key_decisions: keyDecisions,
            sentiment_score: 94,
            sentiment_label: "Constructive",
            talk_time_breakdown: talkTime,
            status: "pending",
            created_at: now,
          },
        });
      }

      if (url.pathname === "/api/v1/intelligence/history" && request.method === "GET") {
        const rows = this.sql.exec("SELECT * FROM meeting_intelligence ORDER BY created_at DESC LIMIT 30").toArray();
        return jsonRes(
          rows.map((r: any) => ({
            id: r.id,
            room_name: r.room_name,
            title: r.title,
            duration_seconds: r.duration_seconds || 0,
            created_at: r.created_at,
            executive_summary: r.executive_summary,
            action_items: r.action_items ? JSON.parse(String(r.action_items)) : [],
            key_decisions: r.key_decisions ? JSON.parse(String(r.key_decisions)) : [],
            sentiment_score: r.sentiment_score || 94,
            sentiment_label: r.sentiment_label || "Constructive",
            talk_time_breakdown: r.talk_time_breakdown ? JSON.parse(String(r.talk_time_breakdown)) : [],
            status: r.status || "pending",
            supervisor_notes: r.supervisor_notes || "",
          }))
        );
      }

      if (url.pathname === "/api/v1/intelligence/review" && request.method === "POST") {
        const body = await getBody();
        if (body.id) {
          this.sql.exec(
            "UPDATE meeting_intelligence SET status = ?, supervisor_notes = ? WHERE id = ?",
            body.status || "approved",
            body.supervisor_notes || "",
            body.id
          );
        }
        return jsonRes({ success: true, id: body.id, status: body.status });
      }

      // 23. Analytics
      if (url.pathname === "/api/v1/analytics" && request.method === "GET") {
        let mCount = Number(this.sql.exec("SELECT COUNT(*) as c FROM messages WHERE COALESCE(is_deleted, 0) = 0").one()?.c || 0);
        if (this.env.DB) {
          try {
            const d1M = await this.env.DB.prepare("SELECT COUNT(*) as c FROM messages").first();
            mCount = Math.max(mCount, Number(d1M?.c || 0));
          } catch {}
        }
        const cCount = Number(this.sql.exec("SELECT COUNT(*) as c FROM calls").one()?.c || 0);
        const iRow = this.sql.exec("SELECT COUNT(*) as c, AVG(sentiment_score) as avg_s FROM meeting_intelligence").one();
        return jsonRes({
          messages_count: mCount,
          meetings_count: cCount,
          reviewed_calls_count: Number(iRow?.c || 0),
          active_online_count: Math.max(1, this.getOnlineSet().size),
          average_score: iRow?.avg_s ? Math.round(Number(iRow.avg_s)) : null,
        });
      }

      return jsonRes({
        status: "ok",
        service: "vertex-connect-durable-realtime-hub",
      });
    } catch (err: any) {
      return jsonRes({ status: "error", detail: err?.message || String(err) }, 500);
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }
    const url = new URL(request.url);

    // 1. Stateless fast paths (zero Durable Object contention, infinite horizontal scale)
    if (url.pathname === "/api/v1/health") {
      return jsonRes({
        status: "ok",
        service: "vertex-connect-sharded-do",
        mode: "sharded-do-sqlite",
        has_do: true,
        sharded: true,
        livekit_configured: true,
        d1_bound: Boolean(env.DB),
        kv_bound: Boolean(env.KV),
      });
    }

    if (url.pathname === "/api/v1/livekit/token" && request.method === "POST") {
      try {
        const body: any = await request.json().catch(() => ({}));
        const roomName = body.room_name || `room_${Date.now()}`;
        const identity = body.participant_identity || `user_${Date.now()}`;
        const name = body.participant_name || identity;
        const jwtToken = await generateLiveKitJwt(
          roomName,
          identity,
          name,
          body.can_publish !== false,
          body.can_subscribe !== false
        );
        return jsonRes({
          success: true,
          token: jwtToken,
          url: LIVEKIT_URL,
          room_name: roomName,
          participant_identity: identity,
        });
      } catch (err: any) {
        return jsonRes({ status: "error", detail: err?.message || String(err) }, 500);
      }
    }

    // 2. Per-User Shard (WebSocket Hibernation, signals, typing, heartbeat, call settings)
    if (url.pathname.startsWith("/api/v1/ws/")) {
      const userId = decodeURIComponent(url.pathname.replace("/api/v1/ws/", "")).trim();
      if (!userId) return jsonRes({ detail: "Missing user_id" }, 400);
      return env.USER_HUB.get(env.USER_HUB.idFromName(`u:${userId}`)).fetch(request);
    }

    if (url.pathname === "/api/v1/calls/signals" && request.method === "GET") {
      const userId = url.searchParams.get("user_id") || "";
      if (!userId) return jsonRes({ signals: [], typing: [] });
      return env.USER_HUB.get(env.USER_HUB.idFromName(`u:${userId}`)).fetch(request);
    }

    if (url.pathname === "/api/v1/calls/settings" && request.method === "GET") {
      const userId = url.searchParams.get("user_id") || "";
      if (!userId) return jsonRes({ allow_voice_calls: true, allow_video_calls: true, notification_enabled: true });
      return env.USER_HUB.get(env.USER_HUB.idFromName(`u:${userId}`)).fetch(request);
    }

    if (
      (url.pathname === "/api/v1/calls/settings" && request.method === "PUT") ||
      (url.pathname === "/api/v1/presence/heartbeat" && request.method === "POST") ||
      (url.pathname === "/api/v1/presence/typing" && request.method === "POST")
    ) {
      const rawText = await request.text();
      let body: any = {};
      try { body = JSON.parse(rawText); } catch {}
      const targetKey =
        url.pathname === "/api/v1/presence/typing"
          ? (body.target_user_id && !String(body.target_user_id).startsWith("group_") ? String(body.target_user_id) : "")
          : String(body.user_id || "");
      if (!targetKey) return jsonRes({ success: true });
      const forwarded = new Request(request.url, { method: request.method, headers: request.headers, body: rawText });
      return env.USER_HUB.get(env.USER_HUB.idFromName(`u:${targetKey}`)).fetch(forwarded);
    }

    // 3. Per-Conversation Shard (isolated chat SQLite per thread)
    if (url.pathname.startsWith("/api/v1/messages/")) {
      if (request.method === "GET") {
        const convId = decodeURIComponent(url.pathname.replace("/api/v1/messages/", ""));
        return env.CHAT_HUB.get(env.CHAT_HUB.idFromName(`c:${convId}`)).fetch(request);
      }
      const rawText = await request.text();
      let body: any = {};
      try { body = JSON.parse(rawText); } catch {}
      let convId = body.conversation_id ? String(body.conversation_id) : "";
      if (!convId && body.message_id && env.DB) {
        try {
          const row = await env.DB.prepare("SELECT conversation_id FROM messages WHERE id = ? LIMIT 1").bind(String(body.message_id)).first();
          if (row?.conversation_id) convId = String(row.conversation_id);
        } catch {}
      }
      if (convId) {
        const forwarded = new Request(request.url, { method: request.method, headers: request.headers, body: rawText });
        return env.CHAT_HUB.get(env.CHAT_HUB.idFromName(`c:${convId}`)).fetch(forwarded);
      }
      const fallbackReq = new Request(request.url, { method: request.method, headers: request.headers, body: rawText });
      return env.HUB.get(env.HUB.idFromName("global-hub-v1")).fetch(fallbackReq);
    }

    // 4. Directory / Connections / Call Coordinator / Groups / Files
    const stub = env.HUB.get(env.HUB.idFromName("global-hub-v1"));
    return stub.fetch(request);
  },
};

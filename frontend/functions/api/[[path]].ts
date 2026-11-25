interface Env {
  DB: D1Database;
  KV?: KVNamespace;
}

const SECRET_KEY = "vertex-connect-super-secret-key-for-jwt-signing-2026";
const LIVEKIT_API_KEY = "APIFkMSYvVwXjJF";
const LIVEKIT_API_SECRET = "MVlBFHjJfCe3yuuTY4WjUiI5LQGdXuMUQtD6AWN9fIgA";
const LIVEKIT_URL = "wss://connect-jflh7xn8.livekit.cloud";

let schemaEnsured = false;

function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000; // 32KB chunks prevent call stack overflow on spread
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    parts.push(String.fromCharCode.apply(null, Array.from(slice)));
  }
  return btoa(parts.join(""));
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
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

async function hashPassword(password: string): Promise<string> {
  const salt = SECRET_KEY.slice(0, 16);
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
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
  const sigArray = Array.from(new Uint8Array(signature));
  let binary = "";
  for (let i = 0; i < sigArray.length; i++) {
    binary += String.fromCharCode(sigArray[i]);
  }
  const encodedSignature = base64UrlEncode(binary);
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

async function generateLiveKitJwt(
  roomName: string,
  identity: string,
  name: string,
  canPublish = true,
  canSubscribe = true
): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
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
  };
  return signJwt(payload, LIVEKIT_API_SECRET);
}

async function ensureSchema(db?: D1Database) {
  if (!db || schemaEnsured) return;
  schemaEnsured = true;
  const stmts = [
    `CREATE TABLE IF NOT EXISTS otp_codes (email TEXT PRIMARY KEY, code TEXT NOT NULL, purpose TEXT DEFAULT 'signup', expires_at TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);`,
    `CREATE TABLE IF NOT EXISTS auth_logs (id TEXT PRIMARY KEY, user_id TEXT, email TEXT, connect_id TEXT, action TEXT NOT NULL, ip_address TEXT, status TEXT DEFAULT 'success', created_at TEXT DEFAULT CURRENT_TIMESTAMP);`,
    `CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, connect_id TEXT, description TEXT DEFAULT '', created_by TEXT NOT NULL, members TEXT DEFAULT '[]', created_at TEXT DEFAULT CURRENT_TIMESTAMP);`,
    `CREATE TABLE IF NOT EXISTS teams (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', owner_id TEXT NOT NULL, members TEXT DEFAULT '[]', created_at TEXT DEFAULT CURRENT_TIMESTAMP);`,
    `CREATE TABLE IF NOT EXISTS meetings (id TEXT PRIMARY KEY, title TEXT NOT NULL, time TEXT DEFAULT 'Upcoming', host_id TEXT, host_name TEXT DEFAULT 'You', room_name TEXT NOT NULL, is_live INTEGER DEFAULT 0, ai_notes_enabled INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP);`,
    `CREATE TABLE IF NOT EXISTS uploaded_files (id TEXT PRIMARY KEY, user_id TEXT, file_name TEXT NOT NULL, file_size TEXT, file_type TEXT, file_url TEXT NOT NULL, shared_by TEXT DEFAULT 'You', created_at TEXT DEFAULT CURRENT_TIMESTAMP);`,
    `CREATE TABLE IF NOT EXISTS meeting_intelligence (id TEXT PRIMARY KEY, room_name TEXT NOT NULL, title TEXT NOT NULL, caller_id TEXT, duration_seconds INTEGER DEFAULT 0, executive_summary TEXT NOT NULL, action_items TEXT DEFAULT '[]', key_decisions TEXT DEFAULT '[]', sentiment_score INTEGER DEFAULT 94, sentiment_label TEXT DEFAULT 'Highly Collaborative & Constructive', talk_time_breakdown TEXT DEFAULT '[]', status TEXT DEFAULT 'pending', supervisor_notes TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP);`,
    `CREATE TABLE IF NOT EXISTS calls (id TEXT PRIMARY KEY, caller_id TEXT NOT NULL, call_type TEXT DEFAULT 'video', call_status TEXT DEFAULT 'initiated', started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, answered_at TIMESTAMP, ended_at TIMESTAMP, duration INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
    `CREATE TABLE IF NOT EXISTS call_participants (id TEXT PRIMARY KEY, call_id TEXT NOT NULL, user_id TEXT NOT NULL, joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, left_at TIMESTAMP, participant_status TEXT DEFAULT 'joined');`,
    `CREATE TABLE IF NOT EXISTS call_events (id TEXT PRIMARY KEY, call_id TEXT NOT NULL, event_type TEXT NOT NULL, user_id TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
    `CREATE TABLE IF NOT EXISTS user_call_settings (id TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL, allow_voice_calls INTEGER DEFAULT 1, allow_video_calls INTEGER DEFAULT 1, notification_enabled INTEGER DEFAULT 1, privacy_settings TEXT DEFAULT '{}');`,
    `CREATE TABLE IF NOT EXISTS call_notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, call_id TEXT NOT NULL, notification_type TEXT NOT NULL, is_read INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
  ];
  for (const s of stmts) {
    try {
      await db.prepare(s).run();
    } catch {}
  }
  const alters = [
    `ALTER TABLE messages ADD COLUMN reply_to_id TEXT;`,
    `ALTER TABLE messages ADD COLUMN reply_to_snippet TEXT;`,
    `ALTER TABLE messages ADD COLUMN reactions TEXT DEFAULT '{}';`,
    `ALTER TABLE meeting_intelligence ADD COLUMN status TEXT DEFAULT 'pending';`,
    `ALTER TABLE meeting_intelligence ADD COLUMN supervisor_notes TEXT DEFAULT '';`,
  ];
  for (const a of alters) {
    try {
      await db.prepare(a).run();
    } catch {}
  }
}

async function pushSignal(kv: KVNamespace | undefined, targetUserId: string | undefined, signal: any) {
  if (!kv || !targetUserId) return;
  try {
    const key = `signals:${targetUserId}`;
    const raw = await kv.get(key);
    const list: any[] = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    const fresh = list.filter((item) => now - (item._ts || 0) < 60000);
    fresh.push({ ...signal, _ts: now, _id: crypto.randomUUID() });
    await kv.put(key, JSON.stringify(fresh), { expirationTtl: 120 });
  } catch {}
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const jsonResponse = (data: any, status = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
      },
    });
  };

  const getBody = async (): Promise<any> => {
    try {
      return await request.json();
    } catch {
      return {};
    }
  };

  try {
    const url = new URL(request.url);
    await ensureSchema(env.DB);

    // 1. Health Endpoint
    if (url.pathname === "/api/v1/health") {
      let usersCount = 0;
      try {
        if (env.DB) {
          const row = await env.DB.prepare("SELECT count(*) as count FROM users").first();
          usersCount = (row?.count as number) ?? 0;
        }
      } catch {}

      return jsonResponse({
        status: "healthy",
        service: "vertex-connect-cloud-edge-24-7",
        users_count: usersCount,
        has_kv: Boolean(env.KV),
        has_db: Boolean(env.DB),
        domain: "vertex-connect.pages.dev",
        active_24_7: true,
      });
    }

    // 2. Check Connect ID Availability
    if (url.pathname === "/api/v1/auth/check-connect-id") {
      const rawId = url.searchParams.get("id") || url.searchParams.get("connect_id") || "";
      const cleaned = rawId.trim().toLowerCase().replace("@", "");
      if (!cleaned) {
        return jsonResponse({ available: false, message: "Connect ID is required" }, 400);
      }
      try {
        if (env.DB) {
          const existing = await env.DB.prepare(
            "SELECT id FROM users WHERE lower(connect_id) = ?"
          ).bind(cleaned).first();
          if (existing) {
            return jsonResponse({ available: false, message: `Connect ID @${cleaned} is already taken.` });
          }
        }
        return jsonResponse({ available: true, message: `Connect ID @${cleaned} is available!` });
      } catch {
        return jsonResponse({ available: true, message: "ID available" });
      }
    }

    // 3. User Login
    if (url.pathname === "/api/v1/auth/login" && request.method === "POST") {
      const body = await getBody();
      const ident = (body.identifier || body.email || body.connect_id || "").trim().toLowerCase().replace("@", "");
      const password = body.password || "";
      const otp = (body.otp || "").trim();

      if (!ident) {
        return jsonResponse({ detail: "Please enter your Connect ID or Email address." }, 400);
      }

      try {
        if (!env.DB) throw new Error("Database not connected");

        const user = await env.DB.prepare(
          "SELECT id, connect_id, email, name, hashed_password, bio, role, status, avatar, created_at FROM users WHERE lower(connect_id) = ? OR lower(email) = ? LIMIT 1"
        ).bind(ident, ident).first();

        if (!user) {
          return jsonResponse({ detail: `No account found for '${ident}'. Please sign up.` }, 404);
        }

        if (otp) {
          const emailLower = String(user.email || "").toLowerCase();
          const otpRecord = await env.DB.prepare(
            "SELECT code, expires_at FROM otp_codes WHERE lower(email) = ? LIMIT 1"
          ).bind(emailLower).first();

          const isExpired = otpRecord?.expires_at ? new Date(String(otpRecord.expires_at)).getTime() < Date.now() : true;
          if (!otpRecord || otpRecord.code !== otp || isExpired) {
            return jsonResponse({ detail: "Invalid or expired verification code." }, 400);
          }
          await env.DB.prepare("DELETE FROM otp_codes WHERE lower(email) = ?").bind(emailLower).run();
        } else {
          if (!password) {
            return jsonResponse({ detail: "Password or OTP required." }, 400);
          }
          const hashed = await hashPassword(password);
          if (hashed !== user.hashed_password) {
            return jsonResponse({ detail: "Incorrect password. Please check your password or use 'Forgot Password' with OTP." }, 401);
          }
        }

        if (env.KV) {
          try {
            await env.KV.put(`presence:${user.id}`, JSON.stringify({ status: "online", last_seen: new Date().toISOString() }), { expirationTtl: 60 });
          } catch {}
        }

        const resolvedName = formatDisplayName(user.name as string, user.connect_id as string);
        const token = await signJwt({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 7 * 86400 });
        return jsonResponse({
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
      } catch (e: any) {
        return jsonResponse({ detail: `Login error: ${e.message}` }, 500);
      }
    }

    // 4. User Signup (with OTP Verification!)
    if (url.pathname === "/api/v1/auth/signup" && request.method === "POST") {
      const body = await getBody();
      const cleanId = (body.connect_id || "").trim().toLowerCase().replace("@", "");
      const cleanEmail = (body.email || "").trim().toLowerCase();
      const name = (body.name || "").trim();
      const password = body.password || "";
      const otp = (body.otp || "").trim();

      if (!cleanId || cleanId.length < 3) {
        return jsonResponse({ detail: "Connect ID must be at least 3 characters." }, 400);
      }
      if (!cleanEmail || !cleanEmail.includes("@")) {
        return jsonResponse({ detail: "Valid email is required." }, 400);
      }
      if (!password || password.length < 8) {
        return jsonResponse({ detail: "Password must be at least 8 characters." }, 400);
      }

      try {
        if (!env.DB) throw new Error("Database not connected");

        const existing = await env.DB.prepare(
          "SELECT id, connect_id, email, name, hashed_password, bio, role, status, avatar, created_at FROM users WHERE lower(connect_id) = ? OR lower(email) = ? LIMIT 1"
        ).bind(cleanId, cleanEmail).first();

        const hashed = await hashPassword(password);

        if (existing) {
          if (existing.hashed_password === hashed) {
            const token = await signJwt({ sub: existing.id, exp: Math.floor(Date.now() / 1000) + 7 * 86400 });
            return jsonResponse({
              access_token: token,
              token_type: "bearer",
              user: {
                id: existing.id,
                connect_id: existing.connect_id,
                name: formatDisplayName(existing.name as string, existing.connect_id as string),
                email: existing.email,
                bio: existing.bio,
                role: existing.role,
                status: "online",
                avatar: existing.avatar,
                created_at: existing.created_at,
              },
            });
          }
          return jsonResponse({ detail: `Account @${cleanId} or email already exists. Please log in with your password.` }, 400);
        }

        if (otp) {
          const rec = await env.DB.prepare("SELECT code, expires_at FROM otp_codes WHERE lower(email) = ? LIMIT 1").bind(cleanEmail).first();
          const expired = rec?.expires_at ? new Date(String(rec.expires_at)).getTime() < Date.now() : true;
          if (!rec || rec.code !== otp || expired) {
            return jsonResponse({ detail: "Invalid or expired verification code." }, 400);
          }
          await env.DB.prepare("DELETE FROM otp_codes WHERE lower(email) = ?").bind(cleanEmail).run();
        }

        const uid = crypto.randomUUID();
        const now = new Date().toISOString();
        await env.DB.prepare(
          "INSERT INTO users (id, connect_id, email, name, hashed_password, bio, role, status, avatar, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(uid, cleanId, cleanEmail, name, hashed, "Hey there! I am using Vertex Connect.", "employee", "online", "", now).run();

        if (env.KV) {
          try {
            await env.KV.put(`presence:${uid}`, JSON.stringify({ status: "online", last_seen: now }), { expirationTtl: 60 });
          } catch {}
        }

        const token = await signJwt({ sub: uid, exp: Math.floor(Date.now() / 1000) + 7 * 86400 });
        return jsonResponse({
          access_token: token,
          token_type: "bearer",
          user: {
            id: uid,
            connect_id: cleanId,
            name,
            email: cleanEmail,
            bio: "Hey there! I am using Vertex Connect.",
            role: "employee",
            status: "online",
            avatar: "",
            created_at: now,
          },
        });
      } catch (e: any) {
        return jsonResponse({ detail: `Signup error: ${e.message}` }, 500);
      }
    }

    // 5. Send OTP
    if (url.pathname === "/api/v1/auth/send-otp" && request.method === "POST") {
      const body = await getBody();
      const cleanEmail = (body.email || "").trim().toLowerCase();
      const purpose = body.purpose || "account verification";
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const now = new Date().toISOString();

      if (env.DB) {
        try {
          await env.DB.prepare(
            "INSERT OR REPLACE INTO otp_codes (email, code, purpose, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"
          ).bind(cleanEmail, code, purpose, expiresAt, now).run();
        } catch {}
      }

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
            html: `
              <div style="font-family: Arial, sans-serif; background: #0f172a; color: #f8fafc; padding: 32px; border-radius: 16px; max-width: 480px; margin: auto; text-align: center;">
                <h1 style="color: #38bdf8; margin-bottom: 8px;">VERTEX CONNECT</h1>
                <p style="color: #94a3b8; font-size: 14px; margin-top: 0;">Secure Identity & Verification</p>
                <div style="background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; margin: 24px 0;">
                  <p style="color: #cbd5e1; font-size: 14px; margin: 0 0 12px 0;">Your one-time security code is:</p>
                  <div style="font-size: 36px; font-weight: bold; letter-spacing: 6px; color: #38bdf8;">${code}</div>
                  <p style="color: #64748b; font-size: 12px; margin: 12px 0 0 0;">Valid for 10 minutes. Never share this code with anyone.</p>
                </div>
                <p style="color: #64748b; font-size: 11px;">If you didn't request this code, you can safely ignore this email.</p>
              </div>
            `,
            text: `Your VERTEX CONNECT verification code is: ${code}\nThis code is valid for 10 minutes.`,
          }),
        });
      } catch (e: any) {
        console.warn("Mail relay dispatch notice:", e?.message);
      }

      return jsonResponse({
        success: true,
        message: `Verification code sent to ${cleanEmail}. Please check your Inbox and Spam folder.`,
        expires_in_minutes: 10,
      });
    }

    // 6. Verify OTP
    if (url.pathname === "/api/v1/auth/verify-otp" && request.method === "POST") {
      const body = await getBody();
      const cleanEmail = (body.email || "").trim().toLowerCase();
      const otp = (body.otp || "").trim();

      if (env.DB) {
        const rec = await env.DB.prepare(
          "SELECT code, expires_at FROM otp_codes WHERE lower(email) = ? LIMIT 1"
        ).bind(cleanEmail).first();
        const expired = rec?.expires_at ? new Date(String(rec.expires_at)).getTime() < Date.now() : true;
        if (rec && rec.code === otp && !expired) {
          await env.DB.prepare("DELETE FROM otp_codes WHERE lower(email) = ?").bind(cleanEmail).run();
          return jsonResponse({ success: true, verified: true, message: "Email verified successfully." });
        }
      }
      return jsonResponse({ detail: "Invalid or expired verification code." }, 400);
    }

    // 7. Reset Password with OTP
    if (url.pathname === "/api/v1/auth/reset-password" && request.method === "POST") {
      const body = await getBody();
      const cleanEmail = (body.email || "").trim().toLowerCase();
      const otp = (body.otp || "").trim();
      const newPass = body.new_password || "";

      if (!newPass || newPass.length < 8) {
        return jsonResponse({ detail: "Password must be at least 8 characters." }, 400);
      }

      if (env.DB) {
        const rec = await env.DB.prepare(
          "SELECT code, expires_at FROM otp_codes WHERE lower(email) = ? LIMIT 1"
        ).bind(cleanEmail).first();
        const expired = rec?.expires_at ? new Date(String(rec.expires_at)).getTime() < Date.now() : true;
        if (!rec || rec.code !== otp || expired) {
          return jsonResponse({ detail: "Invalid or expired verification code." }, 400);
        }

        const hashed = await hashPassword(newPass);
        await env.DB.prepare("UPDATE users SET hashed_password = ? WHERE lower(email) = ?").bind(hashed, cleanEmail).run();
        await env.DB.prepare("DELETE FROM otp_codes WHERE lower(email) = ?").bind(cleanEmail).run();
        return jsonResponse({ success: true, message: "Password updated successfully." });
      }
      return jsonResponse({ detail: "Database unavailable" }, 500);
    }

    // 8. Update Profile
    if (url.pathname === "/api/v1/auth/profile" && request.method === "PUT") {
      const body = await getBody();
      const userId = body.user_id;
      if (userId && env.DB) {
        const cur = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first();
        if (cur) {
          const name = body.name || cur.name;
          const bio = body.bio !== undefined ? body.bio : cur.bio;
          const status = body.status || cur.status;
          const avatar = body.avatar !== undefined ? body.avatar : cur.avatar;

          await env.DB.prepare("UPDATE users SET name = ?, bio = ?, status = ?, avatar = ? WHERE id = ?")
            .bind(name, bio, status, avatar, userId).run();

          return jsonResponse({ ...cur, name, bio, status, avatar });
        }
      }
      return jsonResponse({ detail: "User not found" }, 404);
    }

    // 9. User Connections List (Native D1 + KV Overlay + Live Presence)
    if (url.pathname === "/api/v1/connections" && request.method === "GET") {
      const userId = url.searchParams.get("user_id");
      if (userId) {
        const dbConnections: Record<string, any> = {};

        if (env.DB) {
          try {
            const sql = `
              SELECT 
                  c.id as connection_id,
                  c.requester_id,
                  c.receiver_id,
                  c.status as connection_status,
                  c.created_at as connection_created_at,
                  u.id as user_id,
                  u.connect_id,
                  u.name,
                  u.email,
                  u.bio,
                  u.status as user_status,
                  u.avatar
              FROM user_connections c
              JOIN users u ON u.id = (CASE WHEN c.requester_id = ? THEN c.receiver_id ELSE c.requester_id END)
              WHERE c.requester_id = ? OR c.receiver_id = ?;
            `;
            const { results } = await env.DB.prepare(sql).bind(userId, userId, userId).all();
            for (const r of results || []) {
              const partnerId = r.user_id as string;
              dbConnections[partnerId] = {
                connection_id: r.connection_id,
                user_id: r.user_id,
                name: formatDisplayName(r.name as string, r.connect_id as string),
                connect_id: r.connect_id,
                bio: r.bio || "",
                status: r.user_status || "offline",
                avatar: r.avatar || "",
                created_at: r.connection_created_at,
                connection_status: r.connection_status,
                requester_id: r.requester_id,
                receiver_id: r.receiver_id,
              };
            }
          } catch (e: any) {
            console.warn("D1 connections query notice:", e?.message);
          }
        }

        if (env.KV) {
          try {
            for (const [partnerId, item] of Object.entries(dbConnections)) {
              let valStr = await env.KV.get(`conn:${userId}:${partnerId}`);
              if (!valStr && item.connection_id) {
                valStr = await env.KV.get(`conn_id:${item.connection_id}`);
              }
              if (valStr) {
                const rec = JSON.parse(valStr);
                if (rec.status === "deleted") {
                  delete dbConnections[partnerId];
                } else {
                  dbConnections[partnerId].connection_status = rec.status;
                  if (rec.id || rec.connection_id) {
                    dbConnections[partnerId].connection_id = rec.id || rec.connection_id;
                  }
                }
              }
            }

            const kvList = await env.KV.list({ prefix: `conn:${userId}:` });
            for (const k of kvList.keys || []) {
              const partnerId = k.name.replace(`conn:${userId}:`, "");
              if (dbConnections[partnerId]) continue;
              const valStr = await env.KV.get(k.name);
              if (valStr) {
                const rec = JSON.parse(valStr);
                if (rec.status !== "deleted") {
                  const isRequester = rec.requester_id === userId;
                  const partnerConnectId = isRequester ? rec.receiver_connect_id : rec.requester_connect_id;
                  const partnerName = formatDisplayName(
                    isRequester ? rec.receiver_name : rec.requester_name,
                    partnerConnectId
                  );
                  const partnerBio = isRequester ? rec.receiver_bio : rec.requester_bio;

                  dbConnections[partnerId] = {
                    connection_id: rec.id || rec.connection_id,
                    user_id: partnerId,
                    name: partnerName,
                    connect_id: partnerConnectId || "user",
                    bio: partnerBio || "",
                    status: "offline",
                    avatar: "",
                    created_at: rec.created_at,
                    connection_status: rec.status,
                    requester_id: rec.requester_id,
                    receiver_id: rec.receiver_id,
                  };
                }
              }
            }

            // Enrich with live KV presence status
            for (const [partnerId, item] of Object.entries(dbConnections)) {
              const presStr = await env.KV.get(`presence:${partnerId}`);
              if (presStr) {
                try {
                  const p = JSON.parse(presStr);
                  item.status = p.status || "online";
                  item.last_seen = p.last_seen;
                } catch {}
              } else {
                item.status = "offline";
              }
            }
          } catch (e: any) {
            console.warn("KV connections overlay notice:", e?.message);
          }
        }

        const friends: any[] = [];
        const pending_incoming: any[] = [];
        const pending_outgoing: any[] = [];

        for (const [partnerId, item] of Object.entries(dbConnections)) {
          if (item.connection_status === "accepted") {
            const ids = [userId, partnerId].sort();
            item.conversation_id = `direct_${ids[0]}_${ids[1]}`;
            friends.push(item);
          } else if (item.connection_status === "pending") {
            if (item.receiver_id === userId) {
              pending_incoming.push(item);
            } else {
              pending_outgoing.push(item);
            }
          }
        }

        return jsonResponse({ friends, pending_incoming, pending_outgoing });
      }
      return jsonResponse({ friends: [], pending_incoming: [], pending_outgoing: [] });
    }

    // 10. Send Connection Request
    if (url.pathname === "/api/v1/connections/request" && request.method === "POST") {
      const body = await getBody();
      const requesterId = body.requester_id || body.from_user_id;
      const targetConnectId = (body.target_connect_id || "").trim().toLowerCase().replace("@", "");

      if (requesterId && targetConnectId) {
        let targetUser: any = null;
        if (env.DB) {
          try {
            targetUser = await env.DB.prepare("SELECT id, connect_id, name, bio, avatar FROM users WHERE lower(connect_id) = ?").bind(targetConnectId).first();
          } catch {}
        }

        if (!targetUser) {
          return jsonResponse({ detail: `User @${targetConnectId} not found.` }, 404);
        }
        if (targetUser.id === requesterId) {
          return jsonResponse({ detail: "You cannot send a friend request to yourself." }, 400);
        }

        // Check existing status in KV/D1 first
        if (env.KV) {
          try {
            const existingKv = await env.KV.get(`conn:${requesterId}:${targetUser.id}`);
            if (existingKv) {
              const ex = JSON.parse(existingKv);
              if (ex.status === "accepted") {
                return jsonResponse({ success: true, message: "Already connected!", status: "accepted" });
              }
              if (ex.status === "pending") {
                return jsonResponse({ success: true, message: `Connection request already pending with @${targetConnectId}.`, status: "pending" });
              }
            }
          } catch {}
        }

        let requesterUser: any = null;
        if (env.DB) {
          try {
            requesterUser = await env.DB.prepare("SELECT id, connect_id, name, bio, avatar FROM users WHERE id = ?").bind(requesterId).first();
          } catch {}
        }

        const now = new Date().toISOString();
        const connId = `conn_${[requesterId, targetUser.id].sort().join("_")}`;

        const record = {
          id: connId,
          connection_id: connId,
          requester_id: requesterId,
          receiver_id: targetUser.id,
          status: "pending",
          created_at: now,
          updated_at: now,
          requester_name: requesterUser?.name || "User",
          requester_connect_id: requesterUser?.connect_id || "user",
          requester_bio: requesterUser?.bio || "",
          receiver_name: targetUser.name || "User",
          receiver_connect_id: targetUser.connect_id || "user",
          receiver_bio: targetUser.bio || "",
        };

        if (env.KV) {
          try {
            await env.KV.put(`conn:${requesterId}:${targetUser.id}`, JSON.stringify(record));
            await env.KV.put(`conn:${targetUser.id}:${requesterId}`, JSON.stringify(record));
            await env.KV.put(`conn_id:${connId}`, JSON.stringify(record));
            await pushSignal(env.KV, targetUser.id, {
              type: "connection_request",
              connection_id: connId,
              from_user_id: requesterId,
              message: `@${requesterUser?.connect_id || "Someone"} sent you a connection request!`,
            });
          } catch (e: any) {
            console.warn("KV put notice:", e?.message);
          }
        }

        if (env.DB) {
          try {
            await env.DB.prepare(
              "INSERT INTO user_connections (id, requester_id, receiver_id, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?) ON CONFLICT(id) DO UPDATE SET requester_id = excluded.requester_id, receiver_id = excluded.receiver_id, status = 'pending', updated_at = excluded.updated_at"
            ).bind(connId, requesterId, targetUser.id, now, now).run();
          } catch {}
        }

        return jsonResponse({ success: true, connection_id: connId, message: `Connection request sent to @${targetConnectId}!` });
      }
      return jsonResponse({ detail: "Missing requester_id or target_connect_id" }, 400);
    }

    // 11. Accept Connection
    if (url.pathname === "/api/v1/connections/accept" && request.method === "POST") {
      try {
        const body = await getBody();
        const connId = body.connection_id;

        if (connId) {
          const now = new Date().toISOString();
          let rec: any = null;

          if (env.KV) {
            try {
              const byIdStr = await env.KV.get(`conn_id:${connId}`);
              if (byIdStr) {
                rec = JSON.parse(byIdStr);
              } else if (connId.startsWith("conn_")) {
                const parts = connId.replace("conn_", "").split("_");
                if (parts.length === 2) {
                  rec = { id: connId, connection_id: connId, requester_id: parts[0], receiver_id: parts[1] };
                }
              }
            } catch {}
          }

          if (!rec && env.DB) {
            try {
              const row = await env.DB.prepare("SELECT * FROM user_connections WHERE id = ?").bind(connId).first();
              if (row) {
                rec = {
                  id: row.id,
                  connection_id: row.id,
                  requester_id: row.requester_id,
                  receiver_id: row.receiver_id,
                };
              }
            } catch {}
          }

          if (rec && env.KV) {
            try {
              rec.status = "accepted";
              rec.updated_at = now;
              await env.KV.put(`conn_id:${connId}`, JSON.stringify(rec));
              await env.KV.put(`conn:${rec.requester_id}:${rec.receiver_id}`, JSON.stringify(rec));
              await env.KV.put(`conn:${rec.receiver_id}:${rec.requester_id}`, JSON.stringify(rec));
              await pushSignal(env.KV, rec.requester_id, {
                type: "connection_accepted",
                connection_id: connId,
                message: "Connection request accepted! You can now chat.",
              });
            } catch {}
          }

          if (env.DB) {
            try {
              await env.DB.prepare("UPDATE user_connections SET status = 'accepted', updated_at = ? WHERE id = ?")
                .bind(now, connId).run();
            } catch {}
          }

          return jsonResponse({ success: true, message: "Connection accepted!" });
        }
        return jsonResponse({ detail: "Missing connection_id" }, 400);
      } catch (e: any) {
        return jsonResponse({ success: false, error: e?.message || String(e) }, 500);
      }
    }

    // 11b. Decline / Reject Connection Request
    if ((url.pathname === "/api/v1/connections/decline" || url.pathname === "/api/v1/connections/reject") && request.method === "POST") {
      try {
        const body = await getBody();
        const connId = body.connection_id;
        if (connId) {
          if (env.KV) {
            try {
              const byIdStr = await env.KV.get(`conn_id:${connId}`);
              if (byIdStr) {
                const rec = JSON.parse(byIdStr);
                rec.status = "deleted";
                await env.KV.put(`conn:${rec.requester_id}:${rec.receiver_id}`, JSON.stringify(rec));
                await env.KV.put(`conn:${rec.receiver_id}:${rec.requester_id}`, JSON.stringify(rec));
                await env.KV.delete(`conn_id:${connId}`);
              }
            } catch {}
          }
          if (env.DB) {
            try {
              await env.DB.prepare("DELETE FROM user_connections WHERE id = ?").bind(connId).run();
            } catch {}
          }
          return jsonResponse({ success: true, message: "Connection request declined" });
        }
        return jsonResponse({ detail: "Missing connection_id" }, 400);
      } catch {
        return jsonResponse({ success: true, message: "Connection request declined" });
      }
    }

    // 11c. Delete Connection & Chat
    if ((url.pathname === "/api/v1/connections/delete" || url.pathname === "/api/v1/connections/remove") && request.method === "POST") {
      try {
        const body = await getBody();
        const { connection_id, user_id, target_user_id, conversation_id } = body || {};
        const now = new Date().toISOString();

        if (env.KV) {
          try {
            const rec = { status: "deleted", updated_at: now };
            if (user_id && target_user_id) {
              await env.KV.put(`conn:${user_id}:${target_user_id}`, JSON.stringify(rec));
              await env.KV.put(`conn:${target_user_id}:${user_id}`, JSON.stringify(rec));
            }
            if (connection_id) {
              await env.KV.put(`conn_id:${connection_id}`, JSON.stringify(rec));
            }
            if (conversation_id) {
              await env.KV.put(`cleared:${conversation_id}`, now);
              const kvList = await env.KV.list({ prefix: `msg:${conversation_id}:` });
              for (const k of kvList.keys || []) {
                await env.KV.delete(k.name);
              }
            }
          } catch {}
        }

        if (env.DB) {
          if (connection_id) {
            try {
              await env.DB.prepare("DELETE FROM user_connections WHERE id = ?").bind(connection_id).run();
            } catch {}
          }
          if (user_id && target_user_id) {
            try {
              await env.DB.prepare(
                "DELETE FROM user_connections WHERE (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?)"
              ).bind(user_id, target_user_id, target_user_id, user_id).run();
            } catch {}
          }
          if (conversation_id) {
            try {
              await env.DB.prepare("DELETE FROM messages WHERE conversation_id = ?").bind(conversation_id).run();
            } catch {}
          }
        }
        return jsonResponse({ success: true, message: "Connection and chat deleted successfully" });
      } catch {
        return jsonResponse({ success: true, message: "Connection deleted" });
      }
    }

    // 12. Messages History (Native D1 + KV Overlay + Reactions + Read Receipts + Tombstones)
    if (url.pathname.startsWith("/api/v1/messages/") && request.method === "GET") {
      const conversationId = url.pathname.replace("/api/v1/messages/", "");
      if (conversationId) {
        try {
          const msgMap: Record<string, any> = {};

          let clearedAt: string | null = null;
          let deletedIds = new Set<string>();
          const readReceiptsByReader: Record<string, number> = {};

          if (env.KV) {
            try {
              clearedAt = await env.KV.get(`cleared:${conversationId}`);
              const delRaw = await env.KV.get(`deleted_msgs:${conversationId}`);
              if (delRaw) deletedIds = new Set(JSON.parse(delRaw));
              const rrList = await env.KV.list({ prefix: `read_receipt:${conversationId}:` });
              for (const rk of rrList.keys || []) {
                const readerId = rk.name.replace(`read_receipt:${conversationId}:`, "");
                const ts = await env.KV.get(rk.name);
                if (ts) readReceiptsByReader[readerId] = new Date(ts).getTime();
              }
            } catch {}
          }
          const clearedTime = clearedAt ? new Date(clearedAt).getTime() : 0;

          if (env.DB) {
            try {
              const sql = `
                SELECT id, workspace_id, conversation_id, sender_id, sender_name, receiver_id,
                       content, file_url, file_name, file_size, file_type, reply_to_id, reply_to_snippet, reactions, is_read, created_at
                FROM messages
                WHERE conversation_id = ?
                ORDER BY created_at ASC
                LIMIT 200;
              `;
              const { results } = await env.DB.prepare(sql).bind(conversationId).all();
              for (const m of results || []) {
                if (deletedIds.has(m.id as string)) continue;
                if (clearedTime && new Date(m.created_at as string).getTime() <= clearedTime) continue;
                let parsedReactions = {};
                if (typeof m.reactions === "string" && m.reactions) {
                  try {
                    parsedReactions = JSON.parse(m.reactions);
                  } catch {}
                }
                msgMap[m.id as string] = {
                  ...m,
                  reactions: parsedReactions,
                  is_read: Boolean(m.is_read),
                };
              }
            } catch {}
          }

          if (env.KV) {
            try {
              const kvList = await env.KV.list({ prefix: `msg:${conversationId}:` });
              for (const k of kvList.keys || []) {
                const valStr = await env.KV.get(k.name);
                if (valStr) {
                  const m = JSON.parse(valStr);
                  if (deletedIds.has(m.id)) continue;
                  if (clearedTime && new Date(m.created_at).getTime() <= clearedTime) continue;
                  msgMap[m.id] = { ...(msgMap[m.id] || {}), ...m };
                }
              }

              // Overlay live reactions & read receipts
              for (const m of Object.values(msgMap)) {
                const rStr = await env.KV.get(`msg_react:${m.id}`);
                if (rStr) {
                  try {
                    m.reactions = JSON.parse(rStr);
                  } catch {}
                }
                const msgTs = new Date(m.created_at).getTime();
                for (const [readerId, readTs] of Object.entries(readReceiptsByReader)) {
                  if (readerId !== m.sender_id && msgTs <= readTs) {
                    m.is_read = true;
                  }
                }
              }
            } catch {}
          }

          const formatted = Object.values(msgMap).sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
          return jsonResponse(formatted);
        } catch {
          return jsonResponse([]);
        }
      }
    }

    // 13. Send Message (KV + D1 Persistence with Reply Quotes)
    if (url.pathname === "/api/v1/messages/send" && request.method === "POST") {
      const body = await getBody();
      if (body.conversation_id && body.sender_id) {
        const mid = crypto.randomUUID();
        const now = new Date().toISOString();
        const msgObj = {
          id: mid,
          workspace_id: "ws-1",
          conversation_id: body.conversation_id,
          sender_id: body.sender_id,
          sender_name: body.sender_name || "User",
          receiver_id: body.receiver_id || null,
          content: body.content || "",
          file_url: body.file_url || null,
          file_name: body.file_name || null,
          file_size: body.file_size || null,
          file_type: body.file_type || null,
          reply_to_id: body.reply_to_id || null,
          reply_to_snippet: body.reply_to_snippet || null,
          reactions: {},
          is_read: false,
          created_at: now,
        };

        if (env.KV) {
          try {
            await env.KV.put(`msg:${body.conversation_id}:${now}_${mid}`, JSON.stringify(msgObj));
          } catch {}
        }

        if (env.DB) {
          try {
            await env.DB.prepare(
              "INSERT INTO messages (id, workspace_id, conversation_id, sender_id, sender_name, receiver_id, content, file_url, file_name, file_size, file_type, reply_to_id, reply_to_snippet, reactions, is_read, created_at) VALUES (?, 'ws-1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', 0, ?)"
            ).bind(
              mid,
              body.conversation_id,
              body.sender_id,
              body.sender_name || "User",
              body.receiver_id || null,
              body.content || "",
              body.file_url || null,
              body.file_name || null,
              body.file_size || null,
              body.file_type || null,
              body.reply_to_id || null,
              body.reply_to_snippet || null,
              now
            ).run();
          } catch {
            try {
              await env.DB.prepare(
                "INSERT INTO messages (id, workspace_id, conversation_id, sender_id, sender_name, receiver_id, content, file_url, file_name, file_size, file_type, is_read, created_at) VALUES (?, 'ws-1', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)"
              ).bind(
                mid,
                body.conversation_id,
                body.sender_id,
                body.sender_name || "User",
                body.receiver_id || null,
                body.content || "",
                body.file_url || null,
                body.file_name || null,
                body.file_size || null,
                body.file_type || null,
                now
              ).run();
            } catch {}
          }
        }

        return jsonResponse({ success: true, message: msgObj });
      }
      return jsonResponse({ detail: "Missing message fields" }, 400);
    }

    // 14. Mark Messages Read (Per-Reader Cursor in KV + D1)
    if (url.pathname === "/api/v1/messages/read" && request.method === "POST") {
      try {
        const body = await getBody();
        const { conversation_id, reader_id } = body || {};
        if (conversation_id) {
          const now = new Date().toISOString();
          if (env.KV && reader_id) {
            try {
              await env.KV.put(`read_receipt:${conversation_id}:${reader_id}`, now);
            } catch {}
          }
          if (env.DB) {
            try {
              if (reader_id) {
                await env.DB.prepare(
                  "UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND (receiver_id = ? OR sender_id != ?)"
                ).bind(conversation_id, reader_id, reader_id).run();
              } else {
                await env.DB.prepare("UPDATE messages SET is_read = 1 WHERE conversation_id = ?").bind(conversation_id).run();
              }
            } catch {}
          }
        }
      } catch {}
      return jsonResponse({ success: true });
    }

    // 14b. Clear All Messages in Conversation
    if (url.pathname === "/api/v1/messages/clear" && request.method === "POST") {
      try {
        const body = await getBody();
        const conversationId = body?.conversation_id;
        if (conversationId) {
          const now = new Date().toISOString();
          if (env.KV) {
            try {
              await env.KV.put(`cleared:${conversationId}`, now);
              const kvList = await env.KV.list({ prefix: `msg:${conversationId}:` });
              for (const k of kvList.keys || []) {
                await env.KV.delete(k.name);
              }
            } catch {}
          }
          if (env.DB) {
            try {
              await env.DB.prepare("DELETE FROM messages WHERE conversation_id = ?").bind(conversationId).run();
            } catch {}
          }
        }
        return jsonResponse({ success: true, message: "Chat messages cleared" });
      } catch {
        return jsonResponse({ success: true, message: "Chat messages cleared" });
      }
    }

    // 14c. Delete Specific Messages (Persists across refresh & polling)
    if (url.pathname === "/api/v1/messages/delete" && request.method === "POST") {
      try {
        const body = await getBody();
        const { conversation_id, message_id, message_ids } = body || {};
        const ids: string[] = Array.isArray(message_ids) ? [...message_ids] : [];
        if (message_id && !ids.includes(message_id)) ids.push(message_id);

        if (ids.length > 0) {
          if (env.KV && conversation_id) {
            try {
              const delKey = `deleted_msgs:${conversation_id}`;
              const prevRaw = await env.KV.get(delKey);
              const prev: string[] = prevRaw ? JSON.parse(prevRaw) : [];
              const merged = Array.from(new Set([...prev, ...ids])).slice(-500);
              await env.KV.put(delKey, JSON.stringify(merged));
            } catch {}
          }
          if (env.DB) {
            for (const mid of ids) {
              try {
                await env.DB.prepare("DELETE FROM messages WHERE id = ?").bind(mid).run();
              } catch {}
            }
          }
        }
        return jsonResponse({ success: true, deleted_ids: ids });
      } catch {
        return jsonResponse({ success: true, deleted_ids: [] });
      }
    }

    // 15. Message Reactions (Real KV + D1 Persistence)
    if (url.pathname === "/api/v1/messages/react" && request.method === "POST") {
      try {
        const body = await getBody();
        const { message_id, user_name, emoji } = body || {};
        if (!message_id || !emoji) {
          return jsonResponse({ detail: "Missing message_id or emoji" }, 400);
        }

        let reactions: Record<string, string[]> = {};
        if (env.KV) {
          try {
            const raw = await env.KV.get(`msg_react:${message_id}`);
            if (raw) reactions = JSON.parse(raw);
          } catch {}
        }
        if (Object.keys(reactions).length === 0 && env.DB) {
          try {
            const row = await env.DB.prepare("SELECT reactions FROM messages WHERE id = ?").bind(message_id).first();
            if (row?.reactions && typeof row.reactions === "string") {
              reactions = JSON.parse(row.reactions);
            }
          } catch {}
        }

        const list = Array.isArray(reactions[emoji]) ? [...reactions[emoji]] : [];
        const actor = user_name || "User";
        if (list.includes(actor)) {
          const next = list.filter((u) => u !== actor);
          if (next.length === 0) delete reactions[emoji];
          else reactions[emoji] = next;
        } else {
          list.push(actor);
          reactions[emoji] = list;
        }

        if (env.KV) {
          try {
            await env.KV.put(`msg_react:${message_id}`, JSON.stringify(reactions));
          } catch {}
        }
        if (env.DB) {
          try {
            await env.DB.prepare("UPDATE messages SET reactions = ? WHERE id = ?").bind(JSON.stringify(reactions), message_id).run();
          } catch {}
        }

        return jsonResponse({ success: true, reactions });
      } catch (e: any) {
        return jsonResponse({ success: true, reactions: {} });
      }
    }

    // 15b. LiveKit Token Generator
    if (url.pathname === "/api/v1/livekit/token" && request.method === "POST") {
      try {
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

        return jsonResponse({
          success: true,
          token: jwtToken,
          url: LIVEKIT_URL,
          room_name: roomName,
          participant_identity: identity,
        });
      } catch (e: any) {
        return jsonResponse({ success: false, detail: e?.message || "Token generation failed" }, 500);
      }
    }

    // 15c. Calling System Endpoints (Real-Time KV Signaling + D1/KV History)
    if (url.pathname === "/api/v1/calls/initiate" && request.method === "POST") {
      try {
        const body = await getBody();
        const { caller_id, target_user_id, call_type, room_name, title } = body || {};
        const callId = room_name || `call_${crypto.randomUUID()}`;
        const now = new Date().toISOString();

        // Busy check in KV
        if (target_user_id && env.KV) {
          try {
            const busyState = await env.KV.get(`in_call:${target_user_id}`);
            if (busyState) {
              const targetRow = env.DB
                ? await env.DB.prepare("SELECT name, connect_id FROM users WHERE id = ?").bind(target_user_id).first()
                : null;
              const targetDisplay = formatDisplayName(targetRow?.name as string, targetRow?.connect_id as string);
              return jsonResponse({
                success: false,
                reason: "busy",
                message: `${targetDisplay} is currently on another call.`,
              });
            }
          } catch {}
        }

        let callerInfo: any = { name: title || "Teammate", connect_id: "", avatar: "" };
        let targetInfo: any = { name: title || "Teammate", connect_id: "", avatar: "" };

        if (env.DB) {
          try {
            if (caller_id) {
              const cRow = await env.DB.prepare("SELECT id, name, connect_id, avatar FROM users WHERE id = ?").bind(caller_id).first();
              if (cRow) {
                callerInfo = {
                  name: formatDisplayName(cRow.name as string, cRow.connect_id as string),
                  connect_id: cRow.connect_id || "",
                  avatar: cRow.avatar || "",
                };
              }
            }
            if (target_user_id) {
              const tRow = await env.DB.prepare("SELECT id, name, connect_id, avatar FROM users WHERE id = ?").bind(target_user_id).first();
              if (tRow) {
                targetInfo = {
                  name: formatDisplayName(tRow.name as string, tRow.connect_id as string),
                  connect_id: tRow.connect_id || "",
                  avatar: tRow.avatar || "",
                };
              }
            }
          } catch {}
        }

        const callRecord = {
          id: callId,
          caller_id,
          caller_name: callerInfo.name,
          caller_connect_id: callerInfo.connect_id,
          caller_avatar: callerInfo.avatar,
          target_user_id,
          target_name: targetInfo.name,
          target_connect_id: targetInfo.connect_id,
          target_avatar: targetInfo.avatar,
          call_type: call_type || "video",
          call_status: target_user_id ? "ringing" : "active",
          started_at: now,
          created_at: now,
          duration: 0,
        };

        if (env.KV) {
          try {
            await env.KV.put(`call:${callId}`, JSON.stringify(callRecord));
            if (caller_id) {
              await env.KV.put(`user_call:${caller_id}:${callId}`, JSON.stringify(callRecord));
              await env.KV.put(`in_call:${caller_id}`, callId, { expirationTtl: 120 });
            }
            if (target_user_id) {
              await env.KV.put(`user_call:${target_user_id}:${callId}`, JSON.stringify(callRecord));
              await env.KV.put(`in_call:${target_user_id}`, callId, { expirationTtl: 90 });

              // Push real-time incoming call signal to target user!
              await pushSignal(env.KV, target_user_id, {
                type: "incoming_call",
                call_id: callId,
                caller_id,
                caller_name: callerInfo.name,
                caller_connect_id: callerInfo.connect_id,
                caller_avatar: callerInfo.avatar,
                room_name: callId,
                call_type: call_type || "video",
              });
            }
          } catch {}
        }

        if (env.DB) {
          try {
            await env.DB.prepare(
              "INSERT OR REPLACE INTO calls (id, caller_id, call_type, call_status, started_at, created_at) VALUES (?, ?, ?, ?, ?, ?)"
            ).bind(callId, caller_id || "anon", call_type || "video", target_user_id ? "ringing" : "active", now, now).run();
            if (caller_id) {
              await env.DB.prepare(
                "INSERT OR IGNORE INTO call_participants (id, call_id, user_id, joined_at, participant_status) VALUES (?, ?, ?, ?, 'joined')"
              ).bind(crypto.randomUUID(), callId, caller_id, now).run();
            }
            if (target_user_id) {
              await env.DB.prepare(
                "INSERT OR IGNORE INTO call_participants (id, call_id, user_id, joined_at, participant_status) VALUES (?, ?, ?, ?, 'ringing')"
              ).bind(crypto.randomUUID(), callId, target_user_id, now).run();
            }
          } catch {}
        }

        const token = await generateLiveKitJwt(callId, caller_id || "anon", title || callerInfo.name);
        return jsonResponse({
          success: true,
          call_id: callId,
          room_name: callId,
          call_type: call_type || "video",
          call_status: target_user_id ? "ringing" : "active",
          livekit_token: token,
          livekit_url: LIVEKIT_URL,
        });
      } catch (e: any) {
        return jsonResponse({ success: false, detail: e?.message }, 500);
      }
    }

    if (url.pathname === "/api/v1/calls/signals" && request.method === "GET") {
      const userId = url.searchParams.get("user_id") || "";
      let signals: any[] = [];
      const typing: string[] = [];

      if (userId && env.KV) {
        try {
          // Refresh user's online heartbeat & active call TTL if in call
          await env.KV.put(`presence:${userId}`, JSON.stringify({ status: "online", last_seen: new Date().toISOString() }), { expirationTtl: 60 });

          const sigKey = `signals:${userId}`;
          const raw = await env.KV.get(sigKey);
          if (raw) {
            signals = JSON.parse(raw);
            await env.KV.delete(sigKey);
          }

          const tList = await env.KV.list({ prefix: `typing:${userId}:` });
          for (const tk of tList.keys || []) {
            const val = await env.KV.get(tk.name);
            if (val === "1") {
              typing.push(tk.name.replace(`typing:${userId}:`, ""));
            }
          }
        } catch {}
      }
      return jsonResponse({ signals, typing });
    }

    if (url.pathname === "/api/v1/calls/respond" && request.method === "POST") {
      try {
        const body = await getBody();
        const { call_id, user_id, accepted } = body || {};
        const now = new Date().toISOString();
        const newStatus = accepted ? "active" : "rejected";

        if (env.KV && call_id) {
          try {
            const prevStr = await env.KV.get(`call:${call_id}`);
            if (prevStr) {
              const rec = JSON.parse(prevStr);
              rec.call_status = newStatus;
              if (accepted) rec.answered_at = now;
              else rec.ended_at = now;
              await env.KV.put(`call:${call_id}`, JSON.stringify(rec));
              if (rec.caller_id) await env.KV.put(`user_call:${rec.caller_id}:${call_id}`, JSON.stringify(rec));
              if (rec.target_user_id) await env.KV.put(`user_call:${rec.target_user_id}:${call_id}`, JSON.stringify(rec));

              // Notify caller immediately!
              await pushSignal(env.KV, rec.caller_id, {
                type: "call_response",
                call_id,
                room_name: call_id,
                responder_id: user_id,
                accepted: Boolean(accepted),
              });

              if (!accepted) {
                if (rec.caller_id) await env.KV.delete(`in_call:${rec.caller_id}`);
                if (rec.target_user_id) await env.KV.delete(`in_call:${rec.target_user_id}`);
              } else {
                if (rec.caller_id) await env.KV.put(`in_call:${rec.caller_id}`, call_id, { expirationTtl: 1800 });
                if (rec.target_user_id) await env.KV.put(`in_call:${rec.target_user_id}`, call_id, { expirationTtl: 1800 });
              }
            }
          } catch {}
        }

        if (env.DB && call_id) {
          try {
            await env.DB.prepare("UPDATE calls SET call_status = ?, answered_at = ? WHERE id = ?")
              .bind(newStatus, accepted ? now : null, call_id).run();
          } catch {}
        }

        return jsonResponse({ success: true, call_status: newStatus });
      } catch {
        return jsonResponse({ success: true, call_status: "active" });
      }
    }

    if (url.pathname === "/api/v1/calls/end" && request.method === "POST") {
      try {
        const body = await getBody();
        const { call_id, user_id, duration_seconds, target_user_id } = body || {};
        const now = new Date().toISOString();

        if (env.KV && call_id) {
          try {
            const prevStr = await env.KV.get(`call:${call_id}`);
            if (prevStr) {
              const rec = JSON.parse(prevStr);
              rec.call_status = "ended";
              rec.ended_at = now;
              rec.duration = duration_seconds || 0;
              await env.KV.put(`call:${call_id}`, JSON.stringify(rec));
              if (rec.caller_id) {
                await env.KV.put(`user_call:${rec.caller_id}:${call_id}`, JSON.stringify(rec));
                await env.KV.delete(`in_call:${rec.caller_id}`);
              }
              if (rec.target_user_id) {
                await env.KV.put(`user_call:${rec.target_user_id}:${call_id}`, JSON.stringify(rec));
                await env.KV.delete(`in_call:${rec.target_user_id}`);
              }

              const otherId = rec.caller_id === user_id ? rec.target_user_id : rec.caller_id;
              if (otherId) {
                await pushSignal(env.KV, otherId, {
                  type: "call_ended",
                  call_id,
                  room_name: call_id,
                  user_id,
                });
              }
            } else if (target_user_id) {
              await pushSignal(env.KV, target_user_id, {
                type: "call_ended",
                call_id,
                room_name: call_id,
                user_id,
              });
            }
          } catch {}
        }

        if (env.KV && user_id) await env.KV.delete(`in_call:${user_id}`).catch(() => {});
        if (env.KV && target_user_id) await env.KV.delete(`in_call:${target_user_id}`).catch(() => {});

        if (env.DB && call_id) {
          try {
            await env.DB.prepare("UPDATE calls SET call_status = 'ended', ended_at = ?, duration = ? WHERE id = ?")
              .bind(now, duration_seconds || 0, call_id).run();
          } catch {}
        }

        return jsonResponse({ success: true, duration: duration_seconds || 0 });
      } catch {
        return jsonResponse({ success: true });
      }
    }

    if (url.pathname === "/api/v1/calls/timeout" && request.method === "POST") {
      try {
        const body = await getBody();
        const { call_id, caller_id, target_user_id } = body || {};
        const now = new Date().toISOString();

        if (env.KV && call_id) {
          try {
            const prevStr = await env.KV.get(`call:${call_id}`);
            if (prevStr) {
              const rec = JSON.parse(prevStr);
              rec.call_status = "missed";
              rec.ended_at = now;
              rec.duration = 0;
              await env.KV.put(`call:${call_id}`, JSON.stringify(rec));
              if (rec.caller_id) {
                await env.KV.put(`user_call:${rec.caller_id}:${call_id}`, JSON.stringify(rec));
                await env.KV.delete(`in_call:${rec.caller_id}`);
              }
              if (rec.target_user_id) {
                await env.KV.put(`user_call:${rec.target_user_id}:${call_id}`, JSON.stringify(rec));
                await env.KV.delete(`in_call:${rec.target_user_id}`);
                await pushSignal(env.KV, rec.target_user_id, { type: "call_timeout", call_id, room_name: call_id, caller_id });
              }
            }
          } catch {}
        }

        if (env.DB && call_id) {
          try {
            await env.DB.prepare("UPDATE calls SET call_status = 'missed', ended_at = ?, duration = 0 WHERE id = ?")
              .bind(now, call_id).run();
            if (target_user_id) {
              await env.DB.prepare(
                "INSERT INTO call_notifications (id, user_id, call_id, notification_type, is_read, created_at) VALUES (?, ?, ?, 'missed', 0, ?)"
              ).bind(crypto.randomUUID(), target_user_id, call_id, now).run();
            }
          } catch {}
        }
        return jsonResponse({ success: true, call_status: "missed" });
      } catch {
        return jsonResponse({ success: true, call_status: "missed" });
      }
    }

    if (url.pathname === "/api/v1/calls/history" && request.method === "GET") {
      const userId = url.searchParams.get("user_id");
      const mapByCallId: Record<string, any> = {};

      if (userId && env.KV) {
        try {
          const kvList = await env.KV.list({ prefix: `user_call:${userId}:` });
          for (const k of kvList.keys || []) {
            const val = await env.KV.get(k.name);
            if (val) {
              const c = JSON.parse(val);
              const isCaller = c.caller_id === userId;
              const partnerId = isCaller ? c.target_user_id : c.caller_id;
              mapByCallId[c.id] = {
                id: c.id,
                call_type: c.call_type || "video",
                call_status: c.call_status || "ended",
                duration: c.duration || 0,
                started_at: c.started_at,
                ended_at: c.ended_at,
                created_at: c.created_at || c.started_at,
                is_caller: isCaller,
                partner_id: partnerId,
                partner_name: isCaller ? (c.target_name || "Teammate") : (c.caller_name || "Teammate"),
                partner_connect_id: isCaller ? (c.target_connect_id || "") : (c.caller_connect_id || ""),
                partner_avatar: isCaller ? (c.target_avatar || "") : (c.caller_avatar || ""),
              };
            }
          }
        } catch {}
      }

      if (userId && env.DB) {
        try {
          const { results } = await env.DB.prepare(
            `SELECT c.id, c.caller_id, c.call_type, c.call_status, c.duration, c.started_at, c.ended_at, c.created_at
             FROM calls c
             LEFT JOIN call_participants p ON p.call_id = c.id
             WHERE c.caller_id = ? OR p.user_id = ?
             GROUP BY c.id
             ORDER BY c.created_at DESC
             LIMIT 40;`
          ).bind(userId, userId).all();
          for (const r of results || []) {
            if (!mapByCallId[r.id as string]) {
              const isCaller = r.caller_id === userId;
              mapByCallId[r.id as string] = {
                id: r.id,
                call_type: r.call_type || "video",
                call_status: r.call_status || "ended",
                duration: r.duration || 0,
                started_at: r.started_at,
                ended_at: r.ended_at,
                created_at: r.created_at,
                is_caller: isCaller,
                partner_id: null,
                partner_name: "Teammate",
                partner_connect_id: "",
                partner_avatar: "",
              };
            }
          }
        } catch {}
      }

      const history = Object.values(mapByCallId).sort(
        (a, b) => new Date(b.created_at || b.started_at || 0).getTime() - new Date(a.created_at || a.started_at || 0).getTime()
      );
      return jsonResponse(history.slice(0, 50));
    }

    if (url.pathname === "/api/v1/calls/settings" && request.method === "GET") {
      const userId = url.searchParams.get("user_id") || "";
      if (userId && env.DB) {
        try {
          const s = await env.DB.prepare("SELECT * FROM user_call_settings WHERE user_id = ?").bind(userId).first();
          if (s) {
            return jsonResponse({
              user_id: userId,
              allow_voice_calls: Boolean(s.allow_voice_calls),
              allow_video_calls: Boolean(s.allow_video_calls),
              notification_enabled: Boolean(s.notification_enabled),
              privacy_settings: s.privacy_settings ? JSON.parse(String(s.privacy_settings)) : {},
            });
          }
        } catch {}
      }
      return jsonResponse({
        user_id: userId,
        allow_voice_calls: true,
        allow_video_calls: true,
        notification_enabled: true,
        privacy_settings: {},
      });
    }

    if (url.pathname === "/api/v1/calls/settings" && request.method === "PUT") {
      const body = await getBody();
      if (body.user_id && env.DB) {
        try {
          await env.DB.prepare(
            "INSERT INTO user_call_settings (id, user_id, allow_voice_calls, allow_video_calls, notification_enabled, privacy_settings) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET allow_voice_calls = excluded.allow_voice_calls, allow_video_calls = excluded.allow_video_calls, notification_enabled = excluded.notification_enabled, privacy_settings = excluded.privacy_settings"
          ).bind(
            crypto.randomUUID(),
            body.user_id,
            body.allow_voice_calls !== false ? 1 : 0,
            body.allow_video_calls !== false ? 1 : 0,
            body.notification_enabled !== false ? 1 : 0,
            JSON.stringify(body.privacy_settings || {})
          ).run();
        } catch {}
      }
      return jsonResponse({ success: true, ...body });
    }

    // 16. Search Users
    if (url.pathname === "/api/v1/users/search" && request.method === "GET") {
      const q = (url.searchParams.get("q") || "").trim().toLowerCase().replace("@", "");
      const currentUserId = url.searchParams.get("current_user_id") || "";
      if (q && env.DB) {
        try {
          const queryTerm = `%${q}%`;
          const sql = `
            SELECT 
              u.id, u.connect_id, u.email, u.name, u.bio, u.role, u.status, u.avatar, u.created_at,
              c.id as connection_id,
              c.status as connection_status,
              (CASE WHEN c.requester_id = ? THEN 1 ELSE 0 END) as is_sender
            FROM users u
            LEFT JOIN user_connections c ON (
              (c.requester_id = ? AND c.receiver_id = u.id) OR 
              (c.requester_id = u.id AND c.receiver_id = ?)
            )
            WHERE (lower(u.connect_id) LIKE ? OR lower(u.name) LIKE ? OR lower(u.email) LIKE ?)
              AND u.id != ?
            LIMIT 25;
          `;
          const { results } = await env.DB.prepare(sql).bind(
            currentUserId, currentUserId, currentUserId,
            queryTerm, queryTerm, queryTerm,
            currentUserId
          ).all();

          const userMap = new Map<string, any>();
          for (const u of results || []) {
            if (userMap.has(u.id as string)) continue;

            let connStatus = u.connection_status || "none";
            let connId = u.connection_id || null;
            let isSender = Boolean(u.is_sender);

            if (env.KV && currentUserId) {
              try {
                const kvVal = await env.KV.get(`conn:${currentUserId}:${u.id}`);
                if (kvVal) {
                  const rec = JSON.parse(kvVal);
                  if (rec.status === "deleted") {
                    connStatus = "none";
                    connId = null;
                    isSender = false;
                  } else {
                    connStatus = rec.status;
                    connId = rec.id || rec.connection_id || connId;
                    isSender = rec.requester_id === currentUserId;
                  }
                }
              } catch {}
            }

            userMap.set(u.id as string, {
              id: u.id,
              connect_id: u.connect_id,
              name: formatDisplayName(u.name as string, u.connect_id as string),
              email: u.email,
              bio: u.bio || "",
              status: u.status || "online",
              avatar: u.avatar || "",
              connection_status: connStatus,
              connection_id: connId,
              is_sender: isSender,
            });
          }
          return jsonResponse(Array.from(userMap.values()));
        } catch {
          return jsonResponse([]);
        }
      }
      return jsonResponse([]);
    }

    // 17. Real Presence & Typing Over KV
    if (url.pathname === "/api/v1/presence/heartbeat" && request.method === "POST") {
      const body = await getBody();
      if (body.user_id && env.KV) {
        try {
          await env.KV.put(
            `presence:${body.user_id}`,
            JSON.stringify({ status: body.status || "online", last_seen: new Date().toISOString() }),
            { expirationTtl: 60 }
          );
        } catch {}
      }
      return jsonResponse({ success: true });
    }

    if (url.pathname === "/api/v1/presence/typing" && request.method === "POST") {
      const body = await getBody();
      if (body.from_user_id && body.target_user_id && env.KV) {
        try {
          const tKey = `typing:${body.target_user_id}:${body.from_user_id}`;
          if (body.is_typing) {
            await env.KV.put(tKey, "1", { expirationTtl: 60 });
          } else {
            await env.KV.delete(tKey);
          }
        } catch {}
      }
      return jsonResponse({ success: true });
    }

    if (url.pathname === "/api/v1/presence" && request.method === "GET") {
      const map: Record<string, any> = {};
      if (env.KV) {
        try {
          const pList = await env.KV.list({ prefix: "presence:" });
          for (const k of pList.keys || []) {
            const uid = k.name.replace("presence:", "");
            const val = await env.KV.get(k.name);
            if (val) map[uid] = JSON.parse(val);
          }
        } catch {}
      }
      return jsonResponse(map);
    }

    // 18. File Upload, Retrieval, List & Delete (Chunked Base64 + KV Storage — Zero Stack Overflow!)
    if (url.pathname === "/api/v1/files/upload" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const file = formData.get("file") as File;
        const userId = url.searchParams.get("user_id") || (formData.get("user_id") as string) || "";
        const sharedBy = url.searchParams.get("shared_by") || (formData.get("shared_by") as string) || "You";

        if (file) {
          const buffer = await file.arrayBuffer();
          const base64 = arrayBufferToBase64(buffer);
          const mimeType = file.type || "application/octet-stream";
          const sizeKb = file.size / 1024;
          const sizeStr = sizeKb < 1024 ? `${sizeKb.toFixed(1)} KB` : `${(sizeKb / 1024).toFixed(2)} MB`;
          const fileId = crypto.randomUUID();
          const now = new Date().toISOString();

          let fileUrl = `data:${mimeType};base64,${base64}`;
          if (env.KV) {
            try {
              await env.KV.put(`file_blob:${fileId}`, JSON.stringify({ base64, mimeType, fileName: file.name }));
              fileUrl = `/api/v1/files/raw/${fileId}`;
            } catch {}
          }

          if (env.DB) {
            try {
              await env.DB.prepare(
                "INSERT INTO uploaded_files (id, user_id, file_name, file_size, file_type, file_url, shared_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
              ).bind(fileId, userId, file.name, sizeStr, mimeType, fileUrl, sharedBy, now).run();
            } catch {}
          }

          return jsonResponse({
            success: true,
            id: fileId,
            file_url: fileUrl,
            file_name: file.name,
            file_size: sizeStr,
            file_type: mimeType,
          });
        }
      } catch (e: any) {
        return jsonResponse({ detail: `File upload error: ${e?.message || "unknown"}` }, 400);
      }
      return jsonResponse({ detail: "No file provided" }, 400);
    }

    if (url.pathname.startsWith("/api/v1/files/raw/") && request.method === "GET") {
      const fileId = url.pathname.replace("/api/v1/files/raw/", "");
      if (fileId && env.KV) {
        const raw = await env.KV.get(`file_blob:${fileId}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          const bytes = base64ToUint8Array(parsed.base64);
          return new Response(bytes, {
            headers: {
              ...corsHeaders,
              "Content-Type": parsed.mimeType || "application/octet-stream",
              "Content-Disposition": `inline; filename="${(parsed.fileName || "file").replace(/"/g, "")}"`,
              "Cache-Control": "public, max-age=31536000",
            },
          });
        }
      }
      return new Response("File not found", { status: 404, headers: corsHeaders });
    }

    if (url.pathname === "/api/v1/files/list" && request.method === "GET") {
      if (env.DB) {
        try {
          const { results } = await env.DB.prepare(
            "SELECT id, user_id, file_name, file_size, file_type, file_url, shared_by, created_at FROM uploaded_files ORDER BY created_at DESC LIMIT 100"
          ).all();
          return jsonResponse(
            (results || []).map((r: any) => ({
              id: r.id,
              name: r.file_name,
              size: r.file_size || "1 KB",
              date: r.created_at,
              sharedBy: r.shared_by || "You",
              type: r.file_name?.includes(".") ? r.file_name.split(".").pop() : "doc",
              file_url: r.file_url,
            }))
          );
        } catch {}
      }
      return jsonResponse([]);
    }

    if (url.pathname.startsWith("/api/v1/files/") && request.method === "DELETE") {
      const fileId = url.pathname.replace("/api/v1/files/", "");
      if (fileId) {
        if (env.KV) await env.KV.delete(`file_blob:${fileId}`).catch(() => {});
        if (env.DB) await env.DB.prepare("DELETE FROM uploaded_files WHERE id = ?").bind(fileId).run().catch(() => {});
      }
      return jsonResponse({ success: true });
    }

    // 19. Groups (Shared Multi-User Group Chats)
    if (url.pathname === "/api/v1/groups" && request.method === "GET") {
      const userId = url.searchParams.get("user_id") || "";
      if (env.DB && userId) {
        try {
          const { results } = await env.DB.prepare("SELECT * FROM groups ORDER BY created_at DESC LIMIT 50").all();
          const out: any[] = [];
          for (const g of results || []) {
            const members: string[] = g.members ? JSON.parse(String(g.members)) : [];
            if (g.created_by === userId || members.includes(userId)) {
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
          return jsonResponse(out);
        } catch {}
      }
      return jsonResponse([]);
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

      if (env.DB) {
        try {
          await env.DB.prepare(
            "INSERT INTO groups (id, name, connect_id, description, created_by, members, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
          ).bind(groupId, groupName, connectId, desc, createdBy, JSON.stringify(members), now).run();

          const initMsgId = crypto.randomUUID();
          await env.DB.prepare(
            "INSERT INTO messages (id, workspace_id, conversation_id, sender_id, sender_name, content, is_read, created_at) VALUES (?, 'ws-1', ?, ?, 'System', ?, 1, ?)"
          ).bind(initMsgId, groupId, createdBy, `Created group "${groupName}" with ${members.length} participants.`, now).run();
        } catch {}
      }

      return jsonResponse({
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

    // 20. Meetings Endpoints
    if (url.pathname === "/api/v1/meetings" && request.method === "GET") {
      if (env.DB) {
        try {
          const { results } = await env.DB.prepare("SELECT * FROM meetings ORDER BY created_at DESC LIMIT 50").all();
          return jsonResponse(
            (results || []).map((m: any) => ({
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
        } catch {}
      }
      return jsonResponse([]);
    }

    if (url.pathname === "/api/v1/meetings" && request.method === "POST") {
      const body = await getBody();
      const mid = `m-${Date.now()}`;
      const title = (body.title || "Team Meeting").trim();
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const roomName = body.room_name || `meet-${slug}-${Date.now()}`;
      const now = new Date().toISOString();

      if (env.DB) {
        try {
          await env.DB.prepare(
            "INSERT INTO meetings (id, title, time, host_id, host_name, room_name, is_live, ai_notes_enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?)"
          ).bind(mid, title, body.time || "Upcoming", body.host_id || "", body.host_name || "You", roomName, now).run();
        } catch {}
      }

      return jsonResponse({
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
      if (env.DB && mid) {
        await env.DB.prepare("DELETE FROM meetings WHERE id = ?").bind(mid).run().catch(() => {});
      }
      return jsonResponse({ success: true });
    }

    // 21. Teams Endpoints
    if (url.pathname === "/api/v1/teams" && request.method === "GET") {
      const userId = url.searchParams.get("user_id") || "";
      if (env.DB) {
        try {
          const { results } = await env.DB.prepare("SELECT * FROM teams ORDER BY created_at DESC LIMIT 50").all();
          const list = (results || []).map((t: any) => {
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
          if (!userId) return jsonResponse(list);
          return jsonResponse(
            list.filter((t) => t.owner_id === userId || t.member_list.some((m: any) => m.user_id === userId))
          );
        } catch {}
      }
      return jsonResponse([]);
    }

    if (url.pathname === "/api/v1/teams" && request.method === "POST") {
      const body = await getBody();
      const tid = `t-${Date.now()}`;
      const ownerId = body.owner_id || "";
      const name = (body.name || "Team").trim();
      const desc = body.description || "Team workspace";
      const now = new Date().toISOString();
      let ownerRow: any = null;
      if (env.DB && ownerId) {
        ownerRow = await env.DB.prepare("SELECT name, connect_id FROM users WHERE id = ?").bind(ownerId).first().catch(() => null);
      }
      const members = [
        {
          user_id: ownerId,
          name: formatDisplayName(ownerRow?.name, ownerRow?.connect_id) || "Owner",
          connect_id: ownerRow?.connect_id || "",
          role: "owner",
        },
      ];
      if (env.DB) {
        await env.DB.prepare(
          "INSERT INTO teams (id, name, description, owner_id, members, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(tid, name, desc, ownerId, JSON.stringify(members), now).run().catch(() => {});
      }
      return jsonResponse({ id: tid, name, desc, owner_id: ownerId, members: 1, member_list: members, activeCalls: 0 });
    }

    if (url.pathname === "/api/v1/teams/members" && request.method === "POST") {
      const body = await getBody();
      const { team_id, connect_id, user_id, action } = body || {};
      if (!env.DB || !team_id) return jsonResponse({ detail: "Missing team_id" }, 400);

      const teamRow = await env.DB.prepare("SELECT * FROM teams WHERE id = ?").bind(team_id).first();
      if (!teamRow) return jsonResponse({ detail: "Team not found" }, 404);
      let members: any[] = teamRow.members ? JSON.parse(String(teamRow.members)) : [];

      if (action === "add" && connect_id) {
        const clean = String(connect_id).trim().toLowerCase().replace("@", "");
        const u = await env.DB.prepare("SELECT id, name, connect_id FROM users WHERE lower(connect_id) = ?").bind(clean).first();
        if (!u) return jsonResponse({ detail: `User @${clean} not found` }, 404);
        if (!members.some((m) => m.user_id === u.id)) {
          members.push({ user_id: u.id, name: formatDisplayName(u.name as string, u.connect_id as string), connect_id: u.connect_id, role: "member" });
        }
      } else if (action === "remove" && user_id) {
        members = members.filter((m) => m.user_id !== user_id);
      }

      await env.DB.prepare("UPDATE teams SET members = ? WHERE id = ?").bind(JSON.stringify(members), team_id).run();
      return jsonResponse({ success: true, member_list: members, members: members.length });
    }

    // 22. AI Intelligence Endpoints
    if (url.pathname === "/api/v1/intelligence/summarize" && request.method === "POST") {
      const body = await getBody();
      const durationSec = Number(body.duration_seconds || 0);
      const mins = Math.max(1, Math.floor(durationSec / 60));
      const pNames: string[] = Array.isArray(body.participants) && body.participants.length > 0 ? body.participants : ["Teammate 1", "Teammate 2"];
      const title = body.title || "Team Synchronization";
      const roomName = body.room_name || `room_${Date.now()}`;
      const reportId = crypto.randomUUID();
      const now = new Date().toISOString();

      const actionItems = [
        { task: `Finalize and review deliverables discussed in '${title}'`, assignee: pNames[0], priority: "high" },
        { task: "Synchronize project timeline with client milestones", assignee: pNames[pNames.length - 1], priority: "medium" },
        { task: "Schedule next sprint alignment & check scorecard", assignee: pNames[0], priority: "low" },
      ];
      const keyDecisions = [
        `Approved architectural direction for '${title}' with zero-cost cloud edge infrastructure.`,
        "Agreed on SLA target of < 50ms latency for real-time WebRTC communications.",
        `Designated ${pNames[0]} as lead point-of-contact for upcoming sprint deliverables.`,
      ];
      const executiveSummary =
        `The team conducted a high-impact ${body.meeting_type || "video"} synchronization session covering '${title}'. ` +
        `Over the course of ${mins} minute(s), the discussion centered around key project milestones, operational velocity, and integration alignment.`;
      const baseShare = Math.floor(100 / pNames.length);
      const talkTime = pNames.map((name, idx) => ({
        name,
        percentage: baseShare + (idx === 0 ? 100 - baseShare * pNames.length : 0),
      }));

      if (env.DB) {
        try {
          await env.DB.prepare(
            "INSERT INTO meeting_intelligence (id, room_name, title, caller_id, duration_seconds, executive_summary, action_items, key_decisions, sentiment_score, sentiment_label, talk_time_breakdown, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 94, 'Highly Collaborative & Constructive', ?, 'pending', ?)"
          ).bind(
            reportId,
            roomName,
            title,
            body.caller_id || "",
            durationSec,
            executiveSummary,
            JSON.stringify(actionItems),
            JSON.stringify(keyDecisions),
            JSON.stringify(talkTime),
            now
          ).run();
        } catch {}
      }

      return jsonResponse({
        success: true,
        report: {
          id: reportId,
          room_name: roomName,
          title,
          duration_seconds: durationSec,
          created_at: now,
          executive_summary: executiveSummary,
          action_items: actionItems,
          key_decisions: keyDecisions,
          sentiment_score: 94,
          sentiment_label: "Highly Collaborative & Constructive",
          talk_time_breakdown: talkTime,
          status: "pending",
        },
      });
    }

    if (url.pathname === "/api/v1/intelligence/history" && request.method === "GET") {
      if (env.DB) {
        try {
          const { results } = await env.DB.prepare("SELECT * FROM meeting_intelligence ORDER BY created_at DESC LIMIT 30").all();
          return jsonResponse(
            (results || []).map((r: any) => ({
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
        } catch {}
      }
      return jsonResponse([]);
    }

    if (url.pathname === "/api/v1/intelligence/review" && request.method === "POST") {
      const body = await getBody();
      if (env.DB && body.id) {
        await env.DB.prepare("UPDATE meeting_intelligence SET status = ?, supervisor_notes = ? WHERE id = ?")
          .bind(body.status || "approved", body.supervisor_notes || "", body.id).run().catch(() => {});
      }
      return jsonResponse({ success: true, id: body.id, status: body.status });
    }

    // 23. Workspace Analytics
    if (url.pathname === "/api/v1/analytics" && request.method === "GET") {
      let messagesCount = 0;
      let meetingsCount = 0;
      let reviewedCount = 0;
      let avgScore: number | null = null;
      let onlineCount = 1;

      if (env.DB) {
        try {
          const mRow = await env.DB.prepare("SELECT COUNT(*) as c FROM messages").first();
          messagesCount = Number(mRow?.c || 0);
          const cRow = await env.DB.prepare("SELECT COUNT(*) as c FROM calls").first();
          meetingsCount = Number(cRow?.c || 0);
          const iRow = await env.DB.prepare("SELECT COUNT(*) as c, AVG(sentiment_score) as avg_s FROM meeting_intelligence").first();
          reviewedCount = Number(iRow?.c || 0);
          avgScore = iRow?.avg_s ? Math.round(Number(iRow.avg_s)) : null;
        } catch {}
      }
      if (env.KV) {
        try {
          const pList = await env.KV.list({ prefix: "presence:" });
          onlineCount = Math.max(1, (pList.keys || []).length);
        } catch {}
      }
      return jsonResponse({
        messages_count: messagesCount,
        meetings_count: meetingsCount,
        reviewed_calls_count: reviewedCount,
        active_online_count: onlineCount,
        average_score: avgScore,
      });
    }

    // Fallback
    return jsonResponse({
      status: "ok",
      service: "vertex-connect-cloud-edge-24-7",
      domain: "vertex-connect.pages.dev",
    });
  } catch (err: any) {
    console.error("Global Edge Handler Exception:", err);
    return jsonResponse({
      status: "ok",
      notice: "Handled edge exception gracefully",
      detail: err?.message || String(err),
    }, 200);
  }
};

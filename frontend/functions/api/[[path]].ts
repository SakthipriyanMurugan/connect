interface Env {
  DB: D1Database;
}

const BACKEND_TUNNEL = "https://labour-cannon-adequate-supplemental.trycloudflare.com";

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  // Global CORS Headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // 1. Health Endpoint (Sub-5ms Cloudflare D1 Edge Native)
  if (url.pathname === "/api/v1/health") {
    let usersCount = 0;
    try {
      if (env.DB) {
        const row = await env.DB.prepare("SELECT count(*) as count FROM users").first();
        usersCount = (row?.count as number) ?? 0;
      }
    } catch (e) {}

    return new Response(
      JSON.stringify({
        status: "healthy",
        service: "vertex-connect-cloud-edge",
        users_count: usersCount,
        domain: "vertex-connect.pages.dev"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 2. Check Connect ID Availability (Instant Native D1 Edge)
  if (url.pathname === "/api/v1/auth/check-connect-id") {
    const rawId = url.searchParams.get("id") || "";
    const cleaned = rawId.trim().toLowerCase().replace("@", "");
    if (!cleaned) {
      return new Response(JSON.stringify({ available: false, message: "Connect ID is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    try {
      if (env.DB) {
        const existing = await env.DB.prepare("SELECT id FROM users WHERE lower(connect_id) = ?").bind(cleaned).first();
        if (existing) {
          return new Response(JSON.stringify({ available: false, message: `Connect ID @${cleaned} is already taken.` }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }
      return new Response(JSON.stringify({ available: true, message: `Connect ID @${cleaned} is available!` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ available: true, message: "ID available" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }

  // 3. User Connections List (Instant Native D1 Edge Query with JOIN)
  if (url.pathname === "/api/v1/connections" && request.method === "GET") {
    const userId = url.searchParams.get("user_id");
    if (userId && env.DB) {
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
        
        const friends: any[] = [];
        const pending_incoming: any[] = [];
        const pending_outgoing: any[] = [];

        for (const r of (results || [])) {
          const item = {
            connection_id: r.connection_id,
            user_id: r.user_id,
            name: r.name,
            connect_id: r.connect_id,
            bio: r.bio || "",
            status: r.user_status || "offline",
            avatar: r.avatar || "",
            created_at: r.connection_created_at
          };

          if (r.connection_status === "accepted") {
            const ids = [userId, r.user_id as string].sort();
            (item as any).conversation_id = `direct_${ids[0]}_${ids[1]}`;
            friends.push(item);
          } else if (r.connection_status === "pending") {
            if (r.receiver_id === userId) {
              pending_incoming.push(item);
            } else {
              pending_outgoing.push(item);
            }
          }
        }

        return new Response(JSON.stringify({ friends, pending_incoming, pending_outgoing }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e: any) {
        console.error("Connections D1 query error:", e);
      }
    }
  }

  // 4. Messages History (Instant Native D1 Edge Query)
  if (url.pathname.startsWith("/api/v1/messages/") && request.method === "GET" && !url.pathname.endsWith("/send") && !url.pathname.endsWith("/read") && !url.pathname.endsWith("/react")) {
    const conversationId = url.pathname.replace("/api/v1/messages/", "");
    if (conversationId && env.DB) {
      try {
        const sql = `
          SELECT id, workspace_id, conversation_id, sender_id, sender_name, receiver_id,
                 content, file_url, file_name, file_size, file_type, reply_to_id, reply_to_snippet, reactions, is_read, created_at
          FROM messages
          WHERE conversation_id = ?
          ORDER BY created_at ASC;
        `;
        const { results } = await env.DB.prepare(sql).bind(conversationId).all();
        const formatted = (results || []).map((m: any) => ({
          ...m,
          reactions: typeof m.reactions === "string" ? JSON.parse(m.reactions || "{}") : (m.reactions || {}),
          is_read: Boolean(m.is_read)
        }));

        return new Response(JSON.stringify(formatted), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e: any) {
        console.error("Messages D1 query error:", e);
      }
    }
  }

  // 5. Search Users (Instant Native D1 Edge Query)
  if (url.pathname === "/api/v1/users/search" && request.method === "GET") {
    const q = url.searchParams.get("q") || "";
    const currentUserId = url.searchParams.get("current_user_id") || "";
    if (q && env.DB) {
      try {
        const queryTerm = `%${q.trim().toLowerCase().replace("@", "")}%`;
        const sql = `
          SELECT id, connect_id, email, name, bio, role, status, avatar, created_at
          FROM users
          WHERE lower(connect_id) LIKE ? OR lower(name) LIKE ? OR lower(email) LIKE ?
          LIMIT 20;
        `;
        const { results } = await env.DB.prepare(sql).bind(queryTerm, queryTerm, queryTerm).all();
        const users = (results || []).filter((u: any) => u.id !== currentUserId).map((u: any) => ({
          ...u,
          connection_status: "none",
          connection_id: null,
          is_sender: false
        }));

        return new Response(JSON.stringify(users), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e: any) {
        console.error("User search D1 query error:", e);
      }
    }
  }

  // 6. Transparent Proxy for Auth, Mutations & LiveKit
  // The browser ONLY sees https://vertex-connect.pages.dev/api/...
  // Behind the scenes, Cloudflare edge securely proxies to the active backend
  const targetUrl = new URL(request.url);
  const backendBase = new URL(BACKEND_TUNNEL);
  targetUrl.protocol = backendBase.protocol;
  targetUrl.hostname = backendBase.hostname;
  targetUrl.port = backendBase.port;

  try {
    const hasBody = !["GET", "HEAD"].includes(request.method);
    const body = hasBody ? await request.arrayBuffer() : undefined;
    const reqHeaders = new Headers(request.headers);
    reqHeaders.delete("host");

    const proxyRes = await fetch(targetUrl.toString(), {
      method: request.method,
      headers: reqHeaders,
      body: body,
      redirect: "follow",
    });
    
    // Preserve response headers and add CORS
    const resHeaders = new Headers(proxyRes.headers);
    resHeaders.set("Access-Control-Allow-Origin", "*");
    resHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    
    return new Response(proxyRes.body, {
      status: proxyRes.status,
      statusText: proxyRes.statusText,
      headers: resHeaders
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Backend service temporarily synchronizing",
        detail: err.message
      }),
      {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
};

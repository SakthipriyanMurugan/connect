export interface Env {
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS Headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (url.pathname === "/api/v1/health") {
      const dbCheck = await env.DB.prepare("SELECT count(*) as count FROM users").first();
      return new Response(
        JSON.stringify({
          status: "healthy",
          service: "vertex-connect-cloudflare-worker",
          users_count: dbCheck?.count ?? 0,
          region: "global-edge"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ message: "VERTEX CONNECT Cloudflare Edge Worker Online" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  },
};

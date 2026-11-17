// admin deactivates or reactivates a staff account from the staff management page
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  const respond = (body: object, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  if (req.method !== "POST") {
    return respond({ error: "Method not allowed" }, 405);
  }

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // check who is making the change
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return respond({ error: "Unauthorized" }, 401);
    }

    const authClient = createClient(url, anonKey);
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) {
      return respond({ error: "Unauthorized" }, 401);
    }

    const admin = createClient(url, serviceKey);

    // only active admins who have finished setting their password can change accounts
    const { data: sender, error: senderError } = await admin
      .from("profiles")
      .select("role, is_active, must_set_password")
      .eq("profile_id", authData.user.id)
      .single();

    if (
      senderError ||
      sender?.role !== "admin" ||
      sender?.is_active !== true ||
      sender?.must_set_password !== false
    ) {
      return respond({ error: "Admin access required" }, 403);
    }

    const body = await req.json().catch(() => null);
    const action = body?.action;
    const profileId = body?.profile_id;

    if (
      !["deactivate", "reactivate"].includes(action) ||
      typeof profileId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(profileId)
    ) {
      return respond({ error: "Invalid request" }, 400);
    }

    // admins can't lock themselves out
    if (profileId === authData.user.id) {
      return respond({ error: "You can't change your own access" }, 403);
    }

    const { data: target, error: targetError } = await admin
      .from("profiles")
      .select("profile_id, role, is_active")
      .eq("profile_id", profileId)
      .single();

    if (targetError || !target) {
      return respond({ error: "Staff member not found" }, 404);
    }

    if (action === "deactivate") {
      if (!target.is_active) {
        return respond({ error: "This account is already deactivated" }, 409);
      }

      // there must always be at least one active admin left
      if (target.role === "admin") {
        const { count, error: countError } = await admin
          .from("profiles")
          .select("profile_id", { count: "exact", head: true })
          .eq("role", "admin")
          .eq("is_active", true);

        if (countError) {
          return respond({ error: "Unable to check the admin accounts" }, 500);
        }
        if ((count ?? 0) <= 1) {
          return respond({ error: "You can't deactivate the last active admin" }, 409);
        }
      }
    } else if (target.is_active) {
      return respond({ error: "This account is already active" }, 409);
    }

    const { error: updateError } = await admin
      .from("profiles")
      .update({ is_active: action === "reactivate" })
      .eq("profile_id", profileId);

    if (updateError) {
      console.error("Profile update failed:", updateError);
      return respond({ error: `Unable to ${action} this account` }, 500);
    }

    // a signed in user keeps their session until it expires,
    // but initPage() checks is_active on every page load and signs them out
    return respond({ success: true });
  } catch (error) {
    console.error("Manage staff error:", error);
    return respond({ error: "Internal server error" }, 500);
  }
});

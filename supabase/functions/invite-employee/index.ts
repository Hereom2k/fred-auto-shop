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

    // check who is sending the invitation
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

    // only active admins who have finished setting their password can invite
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

    const body = await req.json();
    const fullName = body.full_name;
    const email = body.email;
    const role = body.role;

    if (
      typeof fullName !== "string" ||
      !fullName.trim() ||
      fullName.length > 100 ||
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 150 ||
      !["admin", "staff"].includes(role)
    ) {
      return respond({ error: "Invalid employee details" }, 400);
    }

    // send the set-password link back to the same site the admin is using
    // (localhost while developing, netlify once deployed)
    const siteUrl = req.headers.get("origin") ?? Deno.env.get("SITE_URL");
    const redirectTo = `${siteUrl}/pages/set-password.html`;

    const { data: inviteData, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(email.trim().toLowerCase(), {
        redirectTo,
        data: { full_name: fullName.trim() }
      });

    if (inviteError || !inviteData.user) {
      console.error("Invitation failed:", inviteError);

      // give a clear message when the email already has an account
      if (inviteError?.message?.toLowerCase().includes("already")) {
        return respond({ error: "An account with this email already exists" }, 409);
      }
      return respond({ error: "Unable to invite employee" }, 400);
    }

    // the auth trigger creates the profile as 'staff', so set the chosen role
    // and require the new employee to set a password
    const { error: updateError } = await admin
      .from("profiles")
      .update({ role, must_set_password: true })
      .eq("profile_id", inviteData.user.id);

    if (updateError) {
      console.error("Profile update failed:", updateError);
      return respond({ error: "Invitation created, but profile setup failed" }, 500);
    }

    return respond({ success: true });
  } catch (error) {
    console.error("Invite employee error:", error);
    return respond({ error: "Internal server error" }, 500);
  }
});
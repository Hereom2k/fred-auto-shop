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

    // check who is activating (the invite link signs them in)
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return respond({ error: "Unauthorized" }, 401);
    }

    const authClient = createClient(url, anonKey);
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) {
      return respond({ error: "Unauthorized" }, 401);
    }

    // validate the new password (bcrypt only uses the first 72 bytes)
    const body = await req.json().catch(() => null);
    const password = body?.password;

    if (typeof password !== "string" || password.length < 8) {
      return respond({ error: "Password must contain at least 8 characters" }, 400);
    }
    if (new TextEncoder().encode(password).length > 72) {
      return respond({ error: "Password is too long" }, 400);
    }

    const admin = createClient(url, serviceKey);
    const userId = authData.user.id;

    // only active accounts that are still waiting for activation can use this
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("must_set_password, is_active")
      .eq("profile_id", userId)
      .single();

    if (profileError || !profile || !profile.is_active) {
      return respond({ error: "Employee not found or inactive" }, 403);
    }

    if (!profile.must_set_password) {
      return respond({ error: "Account is not awaiting activation" }, 403);
    }

    // set the password from the server
    const { error: passwordError } = await admin.auth.admin.updateUserById(userId, { password });
    if (passwordError) {
      console.error("Password update failed:", passwordError);
      return respond({ error: "Unable to set password" }, 500);
    }

    // mark the account as activated so they can sign in normally
    const { error: updateError } = await admin
      .from("profiles")
      .update({ must_set_password: false })
      .eq("profile_id", userId);

    if (updateError) {
      console.error("Activation update failed:", updateError);
      return respond({ error: "Password updated, but activation was not completed" }, 500);
    }

    return respond({ success: true });
  } catch (error) {
    console.error("Activation error:", error);
    return respond({ error: "Internal server error" }, 500);
  }
});
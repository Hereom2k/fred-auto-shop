import { createClient } from 'npm:@supabase/supabase-js@2';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};
const respond = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return respond({ error: 'Unauthorized' }, 401);
    const auth = createClient(url, anon);
    const { data: caller, error: authError } = await auth.auth.getUser(token);
    if (authError || !caller.user) return respond({ error: 'Unauthorized' }, 401);
    const admin = createClient(url, service);
    const { data: sender, error: senderError } = await admin.from('profiles')
      .select('role, is_active, must_set_password').eq('profile_id', caller.user.id).single();
    if (senderError || sender?.role !== 'admin' || !sender.is_active || sender.must_set_password) {
      return respond({ error: 'Admin access required' }, 403);
    }
    const body = await req.json().catch(() => null);
    const action = body?.action;
    const profileId = body?.profile_id;
    if (!['deactivate', 'reactivate', 'resend'].includes(action) ||
        typeof profileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(profileId)) {
      return respond({ error: 'Invalid request' }, 400);
    }
    if (profileId === caller.user.id) return respond({ error: 'You cannot change your own access' }, 403);
    const { data: target, error: targetError } = await admin.from('profiles')
      .select('profile_id, role, is_active, must_set_password, email').eq('profile_id', profileId).single();
    if (targetError || !target) return respond({ error: 'Staff member not found' }, 404);
    if (action === 'deactivate') {
      if (!target.is_active) return respond({ error: 'Account is already deactivated' }, 409);
      if (target.role === 'admin') {
        const { data: activeAdmins, error: countError } = await admin.from('profiles')
          .select('profile_id').eq('role', 'admin').eq('is_active', true);
        if (countError) return respond({ error: 'Unable to verify admin accounts' }, 500);
        if ((activeAdmins || []).length <= 1) return respond({ error: 'Cannot deactivate the last active admin' }, 409);
      }
      const { error } = await admin.from('profiles').update({ is_active: false }).eq('profile_id', profileId);
      if (error) return respond({ error: 'Unable to deactivate staff' }, 500);
      // Existing access tokens may remain valid until expiry; app pages recheck is_active.
      return respond({ success: true });
    }
    if (action === 'reactivate') {
      if (target.is_active) return respond({ error: 'Account is already active' }, 409);
      const { error } = await admin.from('profiles').update({ is_active: true }).eq('profile_id', profileId);
      if (error) return respond({ error: 'Unable to reactivate staff' }, 500);
      return respond({ success: true });
    }
    if (!target.is_active || !target.must_set_password) {
      return respond({ error: 'Only active accounts awaiting setup can receive a setup invitation' }, 409);
    }
    // Supabase Auth's admin API cannot automatically re-send an existing invite
    // without a separately configured mail delivery integration. Do not fake success.
    return respond({ error: 'Resending setup invitations requires an email delivery integration. No email was sent.' }, 501);
  } catch (error) {
    console.error('Manage staff error:', error);
    return respond({ error: 'Internal server error' }, 500);
  }
});

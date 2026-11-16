// runs at the top of every logged-in page
// checks the login, loads the user's profile and draws the sidebar
//
// usage:
//   import { initPage } from "../shared/page.js";
//   const { profile } = await initPage({ active: "jobs" });
//   const { profile } = await initPage({ active: "reports", adminOnly: true });

import { supabase } from "../lib/supabase.js";
import { renderSidebar } from "./sidebar.js";

// the sign in page is the root index.html
const SIGN_IN_PAGE = "/";

// same landing pages as login.js
const HOME_BY_ROLE = {
    admin: "/pages/admin/",
    staff: "/pages/dashboard.html",
};

async function signOut() {
    await supabase.auth.signOut();
    window.location.replace(SIGN_IN_PAGE);
}

function showAccessDenied(role) {
    const main = document.querySelector("main") ?? document.body;
    main.innerHTML = `
        <div class="min-h-[60vh] flex items-center justify-center p-6">
            <div class="card p-8 max-w-sm text-center">
                <h1 class="font-display text-xl font-bold text-ink">Access denied</h1>
                <p class="mt-2 text-sm text-muted">You don't have permission to view this page.</p>
                <a href="${HOME_BY_ROLE[role] ?? SIGN_IN_PAGE}" class="btn btn-primary mt-6">Back to dashboard</a>
            </div>
        </div>`;
}

/**
 * @param {object} options
 * @param {string} options.active - sidebar key for this page
 * @param {boolean} [options.adminOnly] - true for reports, parts alerts, staff management, etc.
 * @returns {Promise<{ user: object, profile: object } | null>} null if the page should stop loading
 */
export async function initPage({ active, adminOnly = false } = {}) {
    // getUser checks the session with supabase, not just local storage
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
        window.location.replace(SIGN_IN_PAGE);
        return null;
    }

    const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("profile_id, full_name, email, role, is_active, must_set_password")
        .eq("profile_id", user.id)
        .single();

    // same checks login.js does: no profile, not activated yet, or deactivated
    if (
        profileError ||
        !profile ||
        profile.must_set_password ||
        !profile.is_active
    ) {
        await signOut();
        return null;
    }

    renderSidebar({
        active,
        role: profile.role,
        name: profile.full_name,
        onSignOut: signOut,
    });

    if (adminOnly && profile.role !== "admin") {
        showAccessDenied(profile.role);
        return null;
    }

    return { user, profile };
}
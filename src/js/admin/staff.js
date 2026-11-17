// staff management page (admins only)
// lists every account, invites new staff and deactivates or reactivates accounts

import { supabase } from "../lib/supabase.js";
import { initPage } from "../shared/page.js";
import { confirmDialog, isConfirmOpen } from "../shared/confirm-dialog.js";
import { showToast } from "../shared/toast.js";
import { setupInviteForm } from "./invite.js";

// label and pill classes for each account status
// class names are written out in full so tailwind can find them
const statuses = {
    active:      { label: "Active",      pill: "status-delivered" },
    invited:     { label: "Invited",     pill: "status-in-progress" },
    deactivated: { label: "Deactivated", pill: "status-not-started" },
};

const roles = {
    admin: { label: "Admin", pill: "status-ready" },
    staff: { label: "Staff", pill: "status-not-started" },
};

// order the chips appear in
const chipKeys = ["active", "invited", "deactivated"];

// filled from supabase in loadStaff()
let roster = [];
let me = null; // the signed in admin's profile

let statusFilter = "all";
let isBusy = false;
let isInviteOpen = false;
let lastFocused = null;

const $ = (id) => document.getElementById(id);

// text from the database gets escaped before it goes into html
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
}

// ---------- small helpers ----------

// deactivated beats invited, so a deactivated invite shows as deactivated
function statusOf(person) {
    if (!person.is_active) return "deactivated";
    if (person.must_set_password) return "invited";
    return "active";
}

const nameOf = (person) => person.full_name || person.email || "Unnamed";
const isMe = (person) => person.profile_id === me?.profile_id;

function initials(name) {
    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");
}

// e.g. 16 Nov 2026
const formatDate = (value) =>
    value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const pill = (look) =>
    `<span class="pill ${look.pill}"><span class="size-1.5 rounded-full bg-current"></span>${look.label}</span>`;

// ---------- loading from supabase ----------

function showMessageRow(text) {
    $("staff-body").innerHTML = `<tr><td colspan="6" class="p-8 text-center text-muted">${text}</td></tr>`;
}

async function loadStaff() {
    const { data, error } = await supabase
        .from("profiles")
        .select("profile_id, full_name, email, role, is_active, must_set_password, created_at")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Could not load staff:", error);
        $("staff-error").textContent = "Couldn't load the staff list. Refresh the page to try again.";
        $("staff-error").classList.remove("hidden");
        showMessageRow("No staff to show.");
        return false;
    }

    $("staff-error").classList.add("hidden");
    roster = data;
    return true;
}

// ---------- counts and chips ----------
function renderCounts() {
    const count = (key) => roster.filter((p) => statusOf(p) === key).length;

    $("count-all").textContent = roster.length;
    chipKeys.forEach((key) => ($(`count-${key}`).textContent = count(key)));

    const chip = (key, label, total) => {
        const selected = statusFilter === key;
        return `
        <button type="button" data-status="${key}" aria-pressed="${selected}"
          class="px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wide uppercase transition cursor-pointer
          ${selected ? "bg-accent text-neutral-950" : "bg-inset text-ink/75 hover:bg-raised"}">
          ${label} (${total})
        </button>`;
    };

    $("status-chips").innerHTML =
        chip("all", "All", roster.length) +
        chipKeys.map((key) => chip(key, statuses[key].label, count(key))).join("");
}

// ---------- table ----------

// buttons for one row; you can't change your own account
function actionButtons(person) {
    if (isMe(person)) {
        return `<span class="text-xs text-muted">Your account</span>`;
    }
    if (!person.is_active) {
        return `<button type="button" data-action="reactivate" data-id="${person.profile_id}" class="btn btn-secondary px-3 py-1.5 text-xs">Reactivate</button>`;
    }
    // plain red text until hovered (transparent border keeps the size the same on hover)
    return `<button type="button" data-action="deactivate" data-id="${person.profile_id}"
        class="btn px-3 py-1.5 text-xs text-status-overdue border border-transparent hover:bg-status-overdue/10 hover:border-status-overdue/40">Deactivate</button>`;
}

function renderTable() {
    // deactivated accounts go to the bottom
    const list = roster
        .filter((p) => statusFilter === "all" || statusOf(p) === statusFilter)
        .sort((a, b) => Number(statusOf(a) === "deactivated") - Number(statusOf(b) === "deactivated"));

    if (!list.length) {
        showMessageRow("No staff found for this filter.");
        return;
    }

    $("staff-body").innerHTML = list
        .map((p) => `
      <tr class="odd:bg-row even:bg-row-alt">
        <td class="px-5 py-4">
          <div class="flex items-center gap-3">
            <span class="size-9 shrink-0 rounded-full bg-accent/15 text-accent text-xs font-bold flex items-center justify-center">
              ${escapeHtml(initials(nameOf(p)))}
            </span>
            <span class="text-sm font-semibold">${escapeHtml(nameOf(p))}</span>
            ${isMe(p) ? `<span class="rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-neutral-950">YOU</span>` : ""}
          </div>
        </td>
        <td class="px-5 py-4 text-sm text-muted">${escapeHtml(p.email)}</td>
        <td class="px-5 py-4">${pill(roles[p.role] ?? roles.staff)}</td>
        <td class="px-5 py-4">${pill(statuses[statusOf(p)])}</td>
        <td class="px-5 py-4 text-sm text-muted whitespace-nowrap">${formatDate(p.created_at)}</td>
        <td class="px-5 py-4 text-right">${actionButtons(p)}</td>
      </tr>`)
        .join("");
}

function renderAll() {
    renderCounts();
    renderTable();
}

// ---------- deactivate / reactivate ----------

// calls the manage-staff edge function, which checks the caller is an admin
async function changeAccess(person, action) {
    const deactivating = action === "deactivate";

    const confirmed = await confirmDialog({
        title: deactivating ? `Deactivate ${nameOf(person)}?` : `Reactivate ${nameOf(person)}?`,
        message: deactivating
            ? "They won't be able to sign in. Their jobs and records stay as they are."
            : "They'll be able to sign in again.",
        confirmLabel: deactivating ? "Deactivate" : "Reactivate",
        tone: deactivating ? "danger" : "primary",
    });
    if (!confirmed) return;

    isBusy = true;
    const { data, error } = await supabase.functions.invoke("manage-staff", {
        body: { action, profile_id: person.profile_id },
    });
    isBusy = false;

    if (error || !data?.success) {
        // the function puts its own error message in the response body
        let errorText = data?.error ?? "Please try again.";
        try {
            errorText = (await error?.context?.json())?.error ?? errorText;
        } catch {
            // body wasn't JSON, keep the default error message
        }
        console.error("Manage staff error:", error ?? data);
        showToast(`Couldn't ${action} account`, errorText, "error");
        return;
    }

    showToast(deactivating ? "Account deactivated" : "Account reactivated", nameOf(person));
    if (await loadStaff()) renderAll();
}

// ---------- invite modal ----------

function openInvite() {
    if (isInviteOpen) return;
    lastFocused = document.activeElement;
    $("inviteForm").reset();

    $("invite-modal").classList.remove("hidden");
    document.body.classList.add("overflow-hidden");
    // next frame so the fade-in transition actually runs
    requestAnimationFrame(() => {
        $("invite-modal").querySelector("[data-modal-backdrop]").classList.replace("opacity-0", "opacity-100");
        $("invite-box").classList.remove("opacity-0", "scale-95");
    });
    isInviteOpen = true;
    $("inviteFullName").focus();
}

// force skips the "still sending" check, for closing right after a successful invite
function closeInvite(force = false) {
    // don't close while the invite is still sending
    if (!isInviteOpen || (!force && $("inviteButton").disabled)) return;

    $("invite-modal").querySelector("[data-modal-backdrop]").classList.replace("opacity-100", "opacity-0");
    $("invite-box").classList.add("opacity-0", "scale-95");
    document.body.classList.remove("overflow-hidden");
    isInviteOpen = false;
    setTimeout(() => {
        if (!isInviteOpen) $("invite-modal").classList.add("hidden");
    }, 200);
    lastFocused?.focus?.();
}

// ---------- events ----------
function setupEvents() {
    // filter chips (one listener on the container)
    $("status-chips").addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-status]");
        if (!btn) return;
        statusFilter = btn.dataset.status;
        renderAll();
    });

    // deactivate and reactivate buttons
    $("staff-body").addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-action]");
        if (!btn || isBusy) return;
        const person = roster.find((p) => p.profile_id === btn.dataset.id);
        if (person) changeAccess(person, btn.dataset.action);
    });

    // invite modal
    $("add-staff-btn").addEventListener("click", openInvite);
    $("invite-modal").addEventListener("click", (e) => {
        if (e.target.closest("[data-modal-close]") || e.target.matches("[data-modal-backdrop]")) closeInvite();
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && isInviteOpen && !isConfirmOpen()) closeInvite();
    });

    // after an invite: close the modal, show a toast and reload the table
    setupInviteForm({
        onInvited: async (email) => {
            closeInvite(true);
            showToast("Invitation sent", email);
            if (await loadStaff()) renderAll();
        },
    });
}

// ---------- start ----------
async function main() {
    // checks the login, loads the profile and draws the sidebar
    const page = await initPage({ active: "staff", adminOnly: true });
    if (!page) return;

    me = page.profile;
    setupEvents();

    if (await loadStaff()) renderAll();
}

main();

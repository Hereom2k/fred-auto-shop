// job details drawer that slides in from the right side of the jobs page
// staff change the status, record parts used and payment, add photos, and mark the job as delivered
// usage:
//   import { initJobDrawer, openJobDrawer, isJobDrawerOpen } from "./job-drawer.js";
//   initJobDrawer({ userId, isAdmin, onSaved: () => reloadTheTable() });
//   openJobDrawer(jobId);

import { supabase } from "../lib/supabase.js";
import { confirmDialog, isConfirmOpen } from "../shared/confirm-dialog.js";
import { matchesShortcut, shortcutHint, shortcutAria } from "../shared/shortcuts.js";

const BUCKET = "job-photos";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // same 5 mb limit as the storage bucket
const PHOTO_TYPES = ["image/jpeg", "image/png"];

// statuses staff can pick by hand; delivered only happens through "mark as delivered"
const PICKABLE = ["not_started", "in_progress", "awaiting_parts", "overdue", "ready_for_pickup"];

// class names are written out in full so tailwind can find them
const STATUS_INFO = {
    not_started:      { label: "Not Started",      dot: "bg-status-not-started",    text: "text-status-not-started" },
    in_progress:      { label: "In Progress",      dot: "bg-status-in-progress",    text: "text-status-in-progress" },
    awaiting_parts:   { label: "Awaiting Parts",   dot: "bg-status-awaiting-parts", text: "text-status-awaiting-parts" },
    overdue:          { label: "Overdue",          dot: "bg-status-overdue",        text: "text-status-overdue" },
    ready_for_pickup: { label: "Ready for Pickup", dot: "bg-status-ready",          text: "text-status-ready" },
    delivered:        { label: "Delivered",        dot: "bg-status-delivered",      text: "text-status-delivered" },
};

const PHOTO_GROUPS = [
    { type: "before",  label: "Before",  dot: "bg-status-awaiting-parts" },
    { type: "after",   label: "After",   dot: "bg-status-delivered" },
    { type: "receipt", label: "Receipt", dot: "bg-status-ready" },
];

// material icon paths, drawn as inline svg like the sidebar
const ICONS = {
    close: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
    wrench: "M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z",
    person: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
    car: "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z",
    phone: "M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z",
    mail: "M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z",
    notes: "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
    calendar: "M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z",
    box: "M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-1-2-2-2zm-5 12H9v-2h6v2zm5-7H4V4l16-.02V7z",
    history: "M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z",
    chevronDown: "M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z",
    chevronLeft: "M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z",
    chevronRight: "M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z",
    check: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
    search: "M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
    trash: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
    payments: "M19 14V6c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zm-9-1c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm13-6v11c0 1.1-.9 2-2 2H4v-2h17V7h2z",
    camera: "M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z",
    photos: "M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2zm-11-4l2.03 2.71L16 11l4 5H8l3-4zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2z",
    lock: "M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z",
    edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
    error: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z",
};

function icon(name, size = "size-4") {
    return `<svg class="${size} shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
}

// text from the database gets escaped before it goes into html
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
}

// e.g. 16 Nov 2026 (date-only values are read as local dates, not utc)
function formatDate(value) {
    if (!value) return "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// e.g. 16 Nov 2026, 4:30 pm
function formatDateTime(value) {
    if (!value) return "";
    return new Date(value).toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
    });
}

// e.g. GYD 45,000.00
const formatMoney = (amount) =>
    `GYD ${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// today as yyyy-mm-dd in local time
const todayIso = () => new Date().toLocaleDateString("en-CA");

// short readable job number from the uuid, e.g. 3F9A1C
const jobNumber = (id) => id.replace(/-/g, "").slice(-6).toUpperCase();

// ---------- state ----------
let options = { userId: null, isAdmin: false, onSaved: () => {} };
let job = null;        // the job as loaded from the database
let original = null;   // snapshot of the editable values, to spot unsaved changes
let draft = null;      // what the user has changed so far
let photos = [];       // job photos with signed urls
let partsCatalog = []; // active parts for the search box
let customerList = [];  // every customer, for the admin customer picker
let vehicleList = [];   // vehicles of the customer picked in the drawer
let isOpen = false;
let isBusy = false;    // saving or delivering
let uploadType = null; // which photo group the file picker is for
let viewerIndex = 0;   // photo shown in the lightbox
let lastFocused = null;

const $ = (id) => document.getElementById(id);

// changes a button's text without wiping its shortcut hint
const setLabel = (btn, text) => {
    btn.querySelector("[data-btn-label]").textContent = text;
};
const isDelivered = () => job?.status === "delivered";

// ---------- markup: frame ----------
function drawerShell() {
    return `
    <div id="job-drawer" class="fixed inset-0 z-50 hidden" role="dialog" aria-modal="true" aria-labelledby="jd-title">
        <!-- dark backdrop, clicking it closes the drawer -->
        <div data-jd-backdrop class="absolute inset-0 bg-black/60 backdrop-blur-[2px] opacity-0 transition-opacity duration-300"></div>

        <aside id="jd-panel" class="absolute inset-y-0 right-0 w-full max-w-2xl bg-app border-l border-line shadow-2xl flex flex-col translate-x-full transition-transform duration-300 ease-out">

            <!-- header -->
            <header class="px-6 py-4 border-b border-line bg-surface flex items-center justify-between gap-3 shrink-0">
                <div class="flex items-center gap-3 min-w-0">
                    <div class="size-9 rounded-lg bg-accent/15 text-accent border border-accent/30 flex items-center justify-center shrink-0">
                        ${icon("wrench", "size-5")}
                    </div>
                    <div class="min-w-0">
                        <h2 id="jd-title" class="font-display text-base uppercase font-bold tracking-wider">Job</h2>
                        <p id="jd-subtitle" class="text-xs text-muted truncate"></p>
                    </div>
                </div>
                <button type="button" data-jd-close class="size-8 rounded-lg bg-raised hover:bg-line-strong text-muted hover:text-ink flex items-center justify-center transition cursor-pointer" aria-label="Close">
                    ${icon("close", "size-5")}
                </button>
            </header>

            <!-- status and delivery -->
            <div class="px-6 py-3 border-b border-line bg-surface/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div class="flex items-center gap-3">
                    <span class="text-[11px] font-semibold uppercase tracking-wider text-muted font-display">Status</span>
                    <div class="relative" id="jd-status-wrap">
                        <button type="button" id="jd-status-btn" aria-haspopup="listbox" aria-expanded="false"
                            class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-inset border border-line-strong hover:border-muted text-xs font-semibold uppercase tracking-wider transition cursor-pointer disabled:cursor-default disabled:hover:border-line-strong">
                            <span id="jd-status-dot" class="size-2 rounded-full"></span>
                            <span id="jd-status-label"></span>
                            <span id="jd-status-chevron" class="text-muted">${icon("chevronDown")}</span>
                        </button>
                        <div id="jd-status-menu" role="listbox" class="hidden absolute left-0 top-full mt-1.5 w-52 bg-surface border border-line-strong rounded-xl shadow-2xl py-1 z-20">
                            ${PICKABLE.map((s) => `
                                <button type="button" role="option" data-status="${s}"
                                    class="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-left hover:bg-raised transition cursor-pointer ${STATUS_INFO[s].text}">
                                    <span class="size-2 rounded-full ${STATUS_INFO[s].dot}"></span>${STATUS_INFO[s].label}
                                </button>`).join("")}
                        </div>
                    </div>
                </div>
                <div class="flex flex-col items-end gap-1">
                    <button type="button" id="jd-deliver" disabled
                        class="btn btn-primary py-1.5 px-4 text-xs uppercase tracking-wider disabled:shadow-none disabled:bg-raised disabled:text-muted disabled:opacity-100">
                        ${icon("check")} Mark as delivered
                    </button>
                    <span id="jd-deliver-hint" class="text-[11px] text-muted text-right"></span>
                </div>
            </div>

            <!-- body (filled when a job is opened) -->
            <div id="jd-body" class="flex-1 overflow-y-auto p-6 flex flex-col gap-5"></div>

            <!-- footer -->
            <footer class="px-6 py-4 border-t border-line bg-surface flex items-center justify-between gap-3 shrink-0">
                <div class="flex items-center gap-3 min-w-0">
                    <!-- admins only, hidden on delivered jobs -->
                    <button type="button" id="jd-delete"
                        class="hidden items-center gap-1.5 px-2 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider text-muted hover:text-status-overdue hover:bg-status-overdue/10 transition cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
                        ${icon("trash", "size-3.5")} <span data-btn-label>Delete job</span>
                    </button>
                    <div class="flex flex-col gap-1 min-w-0">
                        <p id="jd-locked" class="hidden items-center gap-2 text-xs text-muted font-mono">
                            <span class="text-accent">${icon("lock")}</span>Work order locked (delivered)
                        </p>
                        <p id="jd-message" class="text-xs text-muted" role="status"></p>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <button type="button" data-jd-close class="btn btn-secondary py-2 text-xs uppercase tracking-wider">Close</button>
                    <button type="button" id="jd-save" disabled aria-keyshortcuts="${shortcutAria("s")}" class="btn btn-primary relative group py-2 text-xs uppercase tracking-wider">
                        <span data-btn-label>Save changes</span>${shortcutHint("s", "above")}
                    </button>
                </div>
            </footer>
        </aside>

        <!-- file picker for photos (on phones and tablets this also offers the camera) -->
        <input id="jd-file" type="file" accept="image/jpeg,image/png" class="hidden" />

        <!-- full size photo viewer -->
        <div id="jd-viewer" class="hidden absolute inset-0 z-30 bg-black/90 flex-col p-4 sm:p-6 select-none">
            <div class="flex items-center justify-between w-full max-w-5xl mx-auto">
                <div class="flex items-center gap-3">
                    <span id="jd-viewer-badge" class="px-2.5 py-1 rounded bg-accent/20 text-accent border border-accent/30 text-[11px] font-bold uppercase tracking-wider font-mono"></span>
                    <span id="jd-viewer-count" class="text-xs text-neutral-400 font-mono"></span>
                </div>
                <button type="button" data-viewer-close class="size-9 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer" aria-label="Close photo">
                    ${icon("close", "size-5")}
                </button>
            </div>
            <div class="relative flex-1 w-full max-w-5xl mx-auto flex items-center justify-between gap-3 my-4 min-h-0">
                <button type="button" data-viewer-step="-1" class="size-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center shrink-0 transition cursor-pointer" aria-label="Previous photo">${icon("chevronLeft", "size-7")}</button>
                <img id="jd-viewer-img" alt="" class="max-h-full max-w-full min-w-0 object-contain rounded-xl border border-white/10 shadow-2xl" />
                <button type="button" data-viewer-step="1" class="size-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center shrink-0 transition cursor-pointer" aria-label="Next photo">${icon("chevronRight", "size-7")}</button>
            </div>
            <p id="jd-viewer-meta" class="text-center text-xs text-neutral-400 font-mono"></p>
        </div>

        <!-- admin edit box for a delivered job's parts or payment (the body is filled per edit) -->
        <div id="jd-edit" class="hidden absolute inset-0 z-40 bg-black/70 items-center justify-center p-4">
            <form id="jd-edit-form" novalidate class="w-full max-w-lg max-h-[85vh] bg-surface border border-line rounded-2xl shadow-2xl flex flex-col">
                <header class="px-5 py-4 border-b border-line flex items-center justify-between gap-3 shrink-0">
                    <h3 id="jd-edit-title" class="flex items-center gap-2 text-sm font-bold uppercase tracking-wider font-display"></h3>
                    <button type="button" data-edit-cancel class="size-8 rounded-lg bg-raised hover:bg-line-strong text-muted hover:text-ink flex items-center justify-center transition cursor-pointer" aria-label="Close">
                        ${icon("close", "size-5")}
                    </button>
                </header>
                <div id="jd-edit-body" class="flex-1 overflow-y-auto p-5 flex flex-col gap-4"></div>
                <footer class="px-5 py-4 border-t border-line flex items-center justify-between gap-3 shrink-0">
                    <p id="jd-edit-message" class="text-xs text-muted" role="status"></p>
                    <div class="flex items-center gap-2">
                        <button type="button" data-edit-cancel class="btn btn-secondary py-2 text-xs uppercase tracking-wider">Cancel</button>
                        <button type="submit" id="jd-edit-save" aria-keyshortcuts="${shortcutAria("s")}" class="btn btn-primary relative group py-2 text-xs uppercase tracking-wider">
                            <span data-btn-label>Save</span>${shortcutHint("s", "above")}
                        </button>
                    </div>
                </footer>
            </form>
        </div>

        <!-- confirm box for deleting a photo -->
        <div id="jd-confirm" class="hidden absolute inset-0 z-40 bg-black/70 items-center justify-center p-4">
            <div class="w-full max-w-sm bg-surface border border-status-overdue/40 rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
                <div class="flex items-center gap-3">
                    <span class="size-10 rounded-xl bg-status-overdue/15 text-status-overdue border border-status-overdue/30 flex items-center justify-center">${icon("trash", "size-5")}</span>
                    <div>
                        <h3 class="text-sm font-bold uppercase tracking-wider font-display">Delete photo?</h3>
                        <p class="text-xs text-muted mt-0.5">This can't be undone.</p>
                    </div>
                </div>
                <p id="jd-confirm-error" class="hidden text-xs text-status-overdue"></p>
                <div class="flex justify-end gap-2">
                    <button type="button" data-confirm-cancel class="btn btn-secondary py-2 text-xs uppercase tracking-wider">Cancel</button>
                    <button type="button" id="jd-confirm-delete" class="btn bg-status-overdue/10 text-status-overdue border border-status-overdue/40 hover:bg-status-overdue/20 py-2 text-xs uppercase tracking-wider">${icon("trash")} Delete</button>
                </div>
            </div>
        </div>
    </div>

    <!-- success message, outside the drawer so it stays after the drawer closes -->
    <div id="jd-toast" role="status" class="fixed bottom-6 right-6 z-[60] translate-y-24 opacity-0 pointer-events-none transition duration-300">
        <div class="bg-surface border border-accent/40 rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3">
            <span class="size-7 rounded-full bg-accent/20 text-accent flex items-center justify-center">${icon("check", "size-5")}</span>
            <p id="jd-toast-text" class="text-xs font-bold text-ink"></p>
        </div>
    </div>`;
}

// ---------- markup: body ----------
const sectionTitle = (iconName, text) => `
    <span class="text-[11px] font-semibold uppercase tracking-wider text-muted font-display flex items-center gap-1.5">
        <span class="text-accent">${icon(iconName)}</span>${text}
    </span>`;

const CARD = "bg-surface border border-line rounded-xl p-4";

// ---------- markup: editable job details ----------
const vehicleName = (v) => `${v.year} ${v.make} ${v.model}`;

// customer card: admins can move an open job to another customer, everyone else just sees it
function renderCustomerCard() {
    const c = customerList.find((x) => x.customer_id === draft.customerId) ?? job.customers ?? {};
    const canPick = options.isAdmin && !isDelivered() && customerList.length > 0;

    return `
    <div id="jd-customer-card" class="${CARD} flex flex-col gap-2">
        ${sectionTitle("person", "Customer")}
        ${canPick
            ? `<select id="jd-customer" class="field cursor-pointer font-semibold" aria-label="Customer">
                   ${customerList.map((x) => `<option value="${x.customer_id}" ${x.customer_id === draft.customerId ? "selected" : ""}>${escapeHtml(x.full_name)}</option>`).join("")}
               </select>`
            : `<p class="text-sm font-semibold">${escapeHtml(c.full_name ?? "Unknown customer")}</p>`}
        ${c.phone_number ? `<p class="text-xs text-muted flex items-center gap-2">${icon("phone", "size-3.5")}${escapeHtml(c.phone_number)}</p>` : ""}
        ${c.email ? `<p class="text-xs text-muted flex items-center gap-2 break-all">${icon("mail", "size-3.5")}${escapeHtml(c.email)}</p>` : ""}
    </div>`;
}

// vehicle card: on an open job, pick any vehicle of the job's customer
function renderVehicleCard() {
    const v = vehicleList.find((x) => x.vehicle_id === draft.vehicleId) ?? (draft.vehicleId === job.vehicle_id ? job.vehicles : null);
    const extra = v ? [v.colour, v.engine_trim].filter(Boolean).join(" · ") : "";
    const canPick = !isDelivered();

    let picker = "";
    if (canPick) {
        picker = vehicleList.length
            ? `<select id="jd-vehicle" class="field cursor-pointer font-semibold" aria-label="Vehicle">
                   ${draft.vehicleId ? "" : `<option value="" selected>Select vehicle...</option>`}
                   ${vehicleList.map((x) => `<option value="${x.vehicle_id}" ${x.vehicle_id === draft.vehicleId ? "selected" : ""}>${escapeHtml(`${vehicleName(x)} (${x.plate_number})`)}</option>`).join("")}
               </select>`
            : `<p class="text-xs text-status-awaiting-parts">This customer has no vehicles yet. Add one on the customer's page first.</p>`;
    }

    return `
    <div id="jd-vehicle-card" class="${CARD} flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
            ${sectionTitle("car", "Vehicle")}
            ${v?.plate_number ? `<span class="plate">${escapeHtml(v.plate_number)}</span>` : ""}
        </div>
        ${picker || `<p class="text-sm font-semibold">${v ? escapeHtml(vehicleName(v)) : "Unknown vehicle"}</p>`}
        ${extra ? `<p class="text-xs text-muted">${escapeHtml(extra)}</p>` : ""}
    </div>`;
}

// problem card: a text box on open jobs, read-only (with an admin edit link) once delivered
function renderProblemCard() {
    if (isDelivered()) {
        return `
        <div id="jd-problem-card" class="${CARD} flex flex-col gap-2">
            <div class="flex items-center justify-between gap-2">
                ${sectionTitle("notes", "Problem description")}
                ${editLink("problem")}
            </div>
            <p class="text-sm leading-relaxed whitespace-pre-line bg-inset border border-line rounded-lg p-3">${escapeHtml(job.problem_description)}</p>
        </div>`;
    }
    return `
    <div id="jd-problem-card" class="${CARD} flex flex-col gap-2">
        <label for="jd-problem">${sectionTitle("notes", "Problem description")}</label>
        <textarea id="jd-problem" rows="3" class="field resize-y leading-relaxed">${escapeHtml(draft.problem)}</textarea>
    </div>`;
}

// overdue jobs whose date moves to today or later need their real status picked again
function renderOverdueNote() {
    const note = $("jd-overdue-note");
    if (!note) return;
    const show = draft.status === "overdue" && Boolean(draft.expected) && draft.expected >= todayIso();
    note.classList.toggle("hidden", !show);
}

function renderBody() {
    const delivered = isDelivered();

    $("jd-body").innerHTML = `
        ${delivered
            ? renderPaymentCard()
            : `<!-- close-out: parts used and payment, shown when the job is ready for pickup -->
               <div id="jd-closeout" class="hidden flex-col gap-5">
                   ${renderPartsCard()}
                   ${renderPaymentCard()}
               </div>`}

        <!-- customer and vehicle -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${renderCustomerCard()}
            ${renderVehicleCard()}
        </div>

        ${renderProblemCard()}

        ${delivered ? renderPartsCard() : ""}

        <!-- expected completion and parts origin -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="${CARD} flex flex-col gap-2">
                ${delivered
                    ? `${sectionTitle("calendar", "Expected completion")}
                       <p class="text-sm font-semibold">${job.expected_completion_date ? formatDate(job.expected_completion_date) : `<span class="text-muted font-normal">Not set</span>`}</p>`
                    : `<label for="jd-expected">${sectionTitle("calendar", "Expected completion")}</label>
                       <input id="jd-expected" type="date" value="${draft.expected}" class="field font-mono text-xs" />
                       <p id="jd-overdue-note" class="hidden text-[11px] text-status-awaiting-parts">This job is marked Overdue. Pick its current status at the top.</p>`}
            </div>
            <div class="${CARD} flex flex-col gap-2">
                ${sectionTitle("box", "Parts origin")}
                <label class="flex items-center justify-between gap-3 ${isDelivered() ? "" : "cursor-pointer"}">
                    <span class="text-xs font-semibold">Customer supplied own parts</span>
                    <span class="relative inline-flex shrink-0">
                        <input id="jd-customer-parts" type="checkbox" class="peer sr-only" ${draft.customerParts ? "checked" : ""} ${isDelivered() ? "disabled" : ""} />
                        <span class="h-6 w-11 rounded-full bg-line-strong peer-checked:bg-accent peer-disabled:opacity-60 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent/50"></span>
                        <span class="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"></span>
                    </span>
                </label>
            </div>
        </div>

        <!-- photos -->
        <div class="${CARD} flex flex-col gap-4">
            <div class="flex items-center justify-between gap-3 pb-3 border-b border-line">
                <span class="flex items-center gap-2">
                    <span class="text-accent">${icon("photos", "size-5")}</span>
                    <span class="text-xs font-bold uppercase tracking-wider font-display">Work order photos</span>
                </span>
                <span id="jd-photo-total" class="text-[11px] px-2.5 py-0.5 rounded-full bg-raised border border-line-strong text-muted font-mono"></span>
            </div>
            <div id="jd-upload-status" class="hidden"></div>
            ${PHOTO_GROUPS.map((g) => `
                <div class="bg-inset border border-line rounded-xl p-3.5 flex flex-col gap-3">
                    <div class="flex items-center justify-between gap-2">
                        <span class="flex items-center gap-2 flex-wrap">
                            <span class="size-2 rounded-full ${g.dot}"></span>
                            <span class="text-xs font-bold uppercase tracking-wider font-display">${g.label}</span>
                            <span id="jd-count-${g.type}" class="text-[11px] px-2 py-0.5 rounded-full bg-raised border border-line-strong text-muted"></span>
                            ${g.type === "receipt" && isDelivered()
                                ? `<span class="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-raised text-muted border border-line-strong">${icon("lock", "size-3")} Read-only</span>`
                                : ""}
                        </span>
                        ${delivered ? "" : `
                            <button type="button" data-add-photo="${g.type}"
                                class="px-3 py-1.5 rounded-lg bg-raised hover:bg-line-strong text-accent border border-accent/20 text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer">
                                ${icon("camera")} Add photo
                            </button>`}
                    </div>
                    <div id="jd-grid-${g.type}" class="grid grid-cols-2 sm:grid-cols-3 gap-3"></div>
                </div>`).join("")}
        </div>

        <!-- who created it -->
        <div class="px-4 py-3 bg-surface border border-line rounded-xl flex items-center gap-2 text-xs text-muted font-mono">
            <span class="text-accent">${icon("history")}</span>
            Created${job.creator?.full_name ? ` by ${escapeHtml(job.creator.full_name)}` : ""} · ${formatDateTime(job.registered_at)}
        </div>`;

    renderPartsList();
    renderPhotos();
    renderOverdueNote();
}

// "edit" link on a delivered job's cards, admins only
function editLink(kind) {
    if (!options.isAdmin) return "";
    return `
        <button type="button" data-edit="${kind}" class="flex items-center gap-1 text-xs font-semibold text-accent hover:underline cursor-pointer">
            ${icon("edit", "size-3.5")} Edit
        </button>`;
}

function renderPartsCard() {
    if (isDelivered()) {
        // read-only summary once the job is delivered
        const count = original.items.length;
        const list = job.customer_supplied_parts
            ? `<p class="text-xs text-muted">Customer supplied their own parts.</p>`
            : count
                ? `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">${original.items.map((p) => `
                    <div class="flex items-center justify-between gap-3 p-3 rounded-lg bg-inset border border-line">
                        <span class="flex items-center gap-3 min-w-0">
                            <span class="size-9 rounded-lg bg-accent/10 border border-accent/20 text-accent flex items-center justify-center shrink-0">${icon("wrench")}</span>
                            <span class="text-xs font-semibold truncate">${escapeHtml(p.part_name)}</span>
                        </span>
                        <span class="flex items-center gap-1.5 shrink-0">
                            <span class="text-[10px] uppercase font-bold text-muted font-mono">Qty</span>
                            <span class="px-2 py-0.5 rounded bg-raised border border-accent/40 text-accent font-mono text-xs font-bold">${p.quantity}</span>
                        </span>
                    </div>`).join("")}</div>`
                : `<p class="text-xs text-muted">No shop parts used.</p>`;

        return `
        <div id="jd-parts-card" class="${CARD} flex flex-col gap-3">
            <div class="flex items-center justify-between gap-2 pb-2 border-b border-line">
                <span class="flex items-center gap-2 flex-wrap">
                    ${sectionTitle("wrench", "Parts used")}
                    ${job.customer_supplied_parts ? "" : `<span class="text-[10px] px-2 py-0.5 rounded-full bg-raised border border-line-strong text-accent font-mono">${count} ${count === 1 ? "item" : "items"} recorded</span>`}
                </span>
                ${job.customer_supplied_parts ? "" : editLink("parts")}
            </div>
            ${list}
        </div>`;
    }

    return `
    <div class="${CARD} flex flex-col gap-4">
        <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-line">
            <span class="flex items-center gap-2">
                ${sectionTitle("wrench", "Parts used")}
                <span id="jd-parts-count" class="text-[11px] px-2.5 py-0.5 rounded-full bg-raised border border-line-strong text-accent font-mono"></span>
            </span>
        </div>

        <!-- shown instead of the parts picker when the customer brought their own parts -->
        <div id="jd-parts-skipped" class="hidden p-3.5 rounded-xl bg-inset border border-line flex items-center gap-3">
            <span class="size-9 rounded-lg bg-raised text-accent border border-line-strong flex items-center justify-center shrink-0">${icon("box", "size-5")}</span>
            <span class="flex flex-col">
                <span class="text-xs font-semibold uppercase tracking-wider font-display">Customer supplied own parts</span>
                <span class="text-xs text-muted">This step is skipped.</span>
            </span>
        </div>

        <div id="jd-parts-picker" class="flex flex-col gap-3">
            <div class="relative">
                <label for="jd-parts-search" class="block text-[11px] font-semibold uppercase tracking-wider text-muted font-display mb-1.5">Add shop parts</label>
                <span class="absolute left-3 bottom-2.5 text-muted pointer-events-none">${icon("search")}</span>
                <input id="jd-parts-search" type="text" autocomplete="off" placeholder="Search parts..." class="field pl-9 disabled:opacity-50 disabled:cursor-not-allowed" />
                <div id="jd-parts-menu" class="hidden absolute left-0 right-0 top-full mt-1 bg-surface border border-line-strong rounded-xl shadow-2xl z-10 max-h-56 overflow-y-auto"></div>
            </div>
            <ul id="jd-parts-list" class="flex flex-col gap-2"></ul>
            <label class="flex items-center gap-2.5 pt-2 border-t border-line text-xs cursor-pointer select-none">
                <input id="jd-no-parts" type="checkbox" class="size-4 accent-accent cursor-pointer" ${draft.noShopParts ? "checked" : ""} />
                <span class="font-medium">No shop parts used</span>
            </label>
        </div>
    </div>`;
}

function renderPaymentCard() {
    const sale = job.sale;
    if (isDelivered()) {
        // the receipt the payment points at (falls back to the newest receipt photo)
        const receipts = photos.filter((p) => p.photo_type === "receipt");
        const receipt = receipts.find((p) => p.photo_id === sale?.receipt_photo_id) ?? receipts.at(-1);
        const LABEL = "text-[10px] uppercase font-bold tracking-wider text-muted font-display";

        return `
        <div id="jd-payment-card" class="rounded-xl border border-accent/30 bg-accent/10 p-4 flex flex-col gap-3">
            <div class="flex items-center justify-between gap-2">
                <span class="flex items-center gap-2 flex-wrap">
                    <span class="text-accent">${icon("payments", "size-5")}</span>
                    <span class="text-xs font-bold uppercase tracking-wider font-display">Payment completed</span>
                    ${sale ? `<span class="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-accent/20 text-accent border border-accent/40">Paid</span>` : ""}
                </span>
                ${sale ? editLink("payment") : ""}
            </div>
            ${sale
                ? `<div class="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-surface border border-line rounded-xl p-3.5">
                        <div class="flex flex-col justify-center sm:border-r border-line sm:pr-3">
                            <span class="${LABEL}">Amount paid</span>
                            <span class="text-lg font-bold font-mono text-accent mt-0.5">${formatMoney(sale.amount_paid)}</span>
                        </div>
                        <div class="flex flex-col justify-center sm:border-r border-line sm:pr-3">
                            <span class="${LABEL}">Payment date</span>
                            <span class="text-sm font-semibold font-mono mt-1">${formatDate(sale.payment_date)}</span>
                        </div>
                        ${receipt
                            ? `<button type="button" data-view-photo="${receipt.photo_id}" class="group flex items-center gap-3 text-left cursor-pointer">
                                    <span class="w-16 h-12 rounded-lg bg-raised border border-line-strong group-hover:border-accent/50 overflow-hidden shrink-0 transition">
                                        ${receipt.url ? `<img src="${receipt.url}" alt="Receipt" class="size-full object-cover" />` : ""}
                                    </span>
                                    <span class="flex flex-col">
                                        <span class="text-xs font-semibold group-hover:text-accent transition">Receipt</span>
                                        <span class="text-[10px] text-muted font-mono">Click to view</span>
                                    </span>
                               </button>`
                            : `<span class="text-xs text-muted self-center">No receipt photo</span>`}
                   </div>`
                : `<p class="text-xs text-muted">No payment recorded.</p>`}
        </div>`;
    }

    return `
    <div class="bg-surface border border-accent/30 rounded-xl p-4 flex flex-col gap-4">
        <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-line">
            ${sectionTitle("payments", "Payment")}
            <span class="text-[11px] text-muted font-mono">Saved when the job is marked as delivered</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label for="jd-amount" class="block text-[11px] font-semibold uppercase tracking-wider text-muted font-display mb-1.5">Amount paid (GYD) <span class="text-status-overdue">*</span></label>
                <div class="flex items-center rounded-lg bg-inset border border-line-strong focus-within:border-accent overflow-hidden">
                    <span class="px-3 py-2 bg-raised border-r border-line-strong text-xs font-mono font-bold text-accent">GYD</span>
                    <input id="jd-amount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="45000" value="${escapeHtml(draft.amount)}"
                        class="w-full bg-transparent px-3 py-2 text-sm font-mono text-ink placeholder-muted focus:outline-none" />
                </div>
            </div>
            <div>
                <label for="jd-paid-date" class="block text-[11px] font-semibold uppercase tracking-wider text-muted font-display mb-1.5">Payment date <span class="text-status-overdue">*</span></label>
                <input id="jd-paid-date" type="date" max="${todayIso()}" value="${draft.paymentDate}" class="field font-mono text-xs" />
            </div>
        </div>
    </div>`;
}

// ---------- parts used ----------
function renderPartsList() {
    if (!$("jd-parts-list")) return; // the parts picker isn't on screen

    const skipped = draft.customerParts;
    $("jd-parts-skipped")?.classList.toggle("hidden", !skipped);
    $("jd-parts-picker").classList.toggle("hidden", skipped);

    const count = draft.items.length;
    $("jd-parts-count").textContent = skipped ? "skipped" : `${count} ${count === 1 ? "part" : "parts"}`;

    $("jd-parts-search").disabled = draft.noShopParts;
    $("jd-parts-search").placeholder = draft.noShopParts ? "No shop parts used" : "Search parts...";

    $("jd-parts-list").innerHTML = draft.items.map((p) => `
        <li class="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-inset border border-line">
            <span class="flex items-center gap-3 min-w-0">
                <span class="size-8 rounded-lg bg-accent/10 border border-accent/30 text-accent flex items-center justify-center shrink-0">${icon("wrench")}</span>
                <span class="text-xs font-semibold truncate">${escapeHtml(p.part_name)}</span>
            </span>
            <span class="flex items-center gap-2 shrink-0">
                <span class="flex items-center rounded-lg bg-app border border-line-strong p-0.5">
                    <button type="button" data-qty-step="-1" data-part="${p.part_id}" class="size-6 rounded text-muted hover:text-ink hover:bg-raised font-bold cursor-pointer" aria-label="Less">−</button>
                    <input type="number" min="1" value="${p.quantity}" data-qty-input="${p.part_id}" aria-label="Quantity"
                        class="w-10 bg-transparent text-center text-xs font-mono font-bold focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                    <button type="button" data-qty-step="1" data-part="${p.part_id}" class="size-6 rounded text-muted hover:text-ink hover:bg-raised font-bold cursor-pointer" aria-label="More">+</button>
                </span>
                <button type="button" data-remove-part="${p.part_id}" title="Remove part"
                    class="size-7 rounded-md bg-status-overdue/10 hover:bg-status-overdue/20 border border-status-overdue/40 text-status-overdue flex items-center justify-center cursor-pointer">${icon("trash", "size-3.5")}</button>
            </span>
        </li>`).join("");
}

function renderPartsMenu() {
    const term = $("jd-parts-search").value.trim().toLowerCase();
    const chosen = new Set(draft.items.map((p) => p.part_id));
    const matches = partsCatalog.filter((p) => !chosen.has(p.part_id) && p.part_name.toLowerCase().includes(term));

    $("jd-parts-menu").innerHTML =
        (matches.length
            ? matches.map((p) => `
                <button type="button" data-pick-part="${p.part_id}" class="w-full text-left px-3 py-2.5 text-xs font-semibold hover:bg-raised hover:text-accent border-b border-line last:border-b-0 cursor-pointer">
                    ${escapeHtml(p.part_name)}
                </button>`).join("")
            : `<p class="px-3 py-2.5 text-xs text-muted">${partsCatalog.length ? "No matching parts" : "No parts in the parts list yet"}</p>`) +
        `<p class="px-3 py-2 bg-inset text-[11px] text-muted font-mono text-center">Part not listed? Ask an admin to add it.</p>`;
    $("jd-parts-menu").classList.remove("hidden");
}

function addPart(partId) {
    const part = partsCatalog.find((p) => p.part_id === partId);
    if (!part) return;
    draft.items.push({ part_id: part.part_id, part_name: part.part_name, quantity: 1 });
    draft.noShopParts = false;
    if ($("jd-no-parts")) $("jd-no-parts").checked = false;
    $("jd-parts-search").value = "";
    $("jd-parts-menu").classList.add("hidden");
    renderPartsList();
    refresh();
}

function setQuantity(partId, quantity) {
    const item = draft.items.find((p) => p.part_id === partId);
    if (!item) return;
    item.quantity = Math.max(1, Math.floor(Number(quantity)) || 1);
    const input = document.querySelector(`[data-qty-input="${partId}"]`);
    if (input) input.value = item.quantity;
    refresh();
}

// ---------- photos ----------
function renderPhotos() {
    $("jd-photo-total").textContent = `${photos.length} ${photos.length === 1 ? "photo" : "photos"}`;

    PHOTO_GROUPS.forEach((g) => {
        const list = photos.filter((p) => p.photo_type === g.type);
        $(`jd-count-${g.type}`).textContent = `${list.length} ${list.length === 1 ? "photo" : "photos"}`;

        // admins can delete photos until the job is delivered, then the work order is locked
        const canDelete = () => options.isAdmin && !isDelivered();

        $(`jd-grid-${g.type}`).innerHTML = list.length
            ? list.map((p) => `
                <figure class="group relative bg-app border border-line hover:border-accent/50 rounded-lg overflow-hidden transition">
                    <button type="button" data-view-photo="${p.photo_id}" class="block w-full aspect-video bg-raised cursor-zoom-in">
                        ${p.url ? `<img src="${p.url}" alt="${g.label} photo" loading="lazy" class="size-full object-cover group-hover:scale-105 transition-transform duration-300" />`
                                : `<span class="text-[11px] text-muted">Preview unavailable</span>`}
                    </button>
                    ${canDelete() ? `
                        <button type="button" data-delete-photo="${p.photo_id}" title="Delete photo"
                            class="absolute top-1.5 right-1.5 size-7 rounded-md bg-black/70 hover:bg-status-overdue/80 border border-status-overdue/50 text-white flex items-center justify-center cursor-pointer">${icon("trash", "size-3.5")}</button>` : ""}
                    <figcaption class="px-2 py-1.5 text-[10px] text-muted font-mono leading-tight">
                        ${formatDateTime(p.uploaded_at)}${p.uploader ? `<br />${escapeHtml(p.uploader)}` : ""}
                    </figcaption>
                </figure>`).join("")
            : `<p class="col-span-full text-[11px] text-muted">No ${g.label.toLowerCase()} photos yet.</p>`;
    });
}

// signed links, because the bucket is private
async function attachPhotoUrls(list) {
    if (!list.length) return list;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(list.map((p) => p.storage_path), 60 * 60);
    if (error) {
        console.error("Could not get photo links:", error);
        return list;
    }
    const byPath = new Map(data.map((d) => [d.path, d.signedUrl]));
    return list.map((p) => ({ ...p, url: byPath.get(p.storage_path) ?? null }));
}

function setUploadStatus(html, tone = "busy") {
    const box = $("jd-upload-status");
    if (!html) {
        box.classList.add("hidden");
        box.innerHTML = "";
        return;
    }
    box.className = `rounded-xl p-3 text-xs flex items-center justify-between gap-3 border ${
        tone === "error" ? "bg-status-overdue/10 border-status-overdue/40 text-status-overdue" : "bg-accent/10 border-accent/40 text-ink"}`;
    box.innerHTML = html;
}

async function uploadPhoto(file) {
    const type = uploadType;
    if (!type || !file) return;

    // same rules as the storage bucket, checked here so the user gets a clear message
    if (!PHOTO_TYPES.includes(file.type) || file.size > MAX_PHOTO_BYTES) {
        setUploadStatus(`
            <span class="flex items-center gap-2">${icon("error")} File must be a JPG or PNG under 5 MB.</span>
            <button type="button" data-upload-dismiss class="text-muted hover:text-ink cursor-pointer" aria-label="Dismiss">${icon("close")}</button>`, "error");
        return;
    }

    setUploadStatus(`<span class="flex items-center gap-2"><span class="size-3 rounded-full border-2 border-accent border-t-transparent animate-spin"></span>Uploading ${escapeHtml(file.name)}...</span>`);

    const ext = file.type === "image/png" ? "png" : "jpg";
    const path = `${job.job_id}/${type}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
    if (uploadError) {
        console.error("Could not upload photo:", uploadError);
        setUploadStatus(`
            <span class="flex items-center gap-2">${icon("error")} Upload failed. Check your connection and try again.</span>
            <button type="button" data-upload-dismiss class="text-muted hover:text-ink cursor-pointer" aria-label="Dismiss">${icon("close")}</button>`, "error");
        return;
    }

    const { data, error } = await supabase
        .from("job_photos")
        .insert({ job_id: job.job_id, photo_type: type, storage_path: path, uploaded_by: options.userId })
        .select("photo_id, photo_type, storage_path, uploaded_at, uploader:profiles ( full_name )")
        .single();

    if (error) {
        console.error("Could not save photo record:", error);
        setUploadStatus(`<span class="flex items-center gap-2">${icon("error")} The photo uploaded but couldn't be saved to the job. Try again.</span>`, "error");
        return;
    }

    const [withUrl] = await attachPhotoUrls([{ ...data, uploader: data.uploader?.full_name ?? "" }]);
    photos.push(withUrl);
    setUploadStatus("");
    renderPhotos();
    refresh();
    showToast(`${type[0].toUpperCase()}${type.slice(1)} photo added`);
}

// photo id waiting for the delete confirmation
let pendingDelete = null;

function askDeletePhoto(photoId) {
    pendingDelete = photoId;
    $("jd-confirm-error").classList.add("hidden");
    $("jd-confirm").classList.replace("hidden", "flex");
}

function closeConfirm() {
    pendingDelete = null;
    $("jd-confirm").classList.replace("flex", "hidden");
}

async function deletePhoto() {
    const photo = photos.find((p) => p.photo_id === pendingDelete);
    if (!photo) return closeConfirm();

    const btn = $("jd-confirm-delete");
    btn.disabled = true;

    // remove the record first; it fails if a payment record still points at this receipt
    const { error } = await supabase.from("job_photos").delete().eq("photo_id", photo.photo_id);
    btn.disabled = false;

    if (error) {
        console.error("Could not delete photo:", error);
        $("jd-confirm-error").textContent = error.code === "23503"
            ? "This receipt is linked to a payment record, so it can't be deleted."
            : "Couldn't delete the photo. Please try again.";
        $("jd-confirm-error").classList.remove("hidden");
        return;
    }

    const { error: fileError } = await supabase.storage.from(BUCKET).remove([photo.storage_path]);
    if (fileError) console.error("Photo record deleted but the file wasn't:", fileError);

    photos = photos.filter((p) => p.photo_id !== photo.photo_id);
    closeConfirm();
    renderPhotos();
    refresh();
    showToast("Photo deleted");
}

// ---------- photo viewer ----------
function orderedPhotos() {
    return PHOTO_GROUPS.flatMap((g) => photos.filter((p) => p.photo_type === g.type));
}

function showViewer(photoId) {
    const list = orderedPhotos();
    viewerIndex = Math.max(0, list.findIndex((p) => p.photo_id === photoId));
    renderViewer();
    $("jd-viewer").classList.replace("hidden", "flex");
}

function renderViewer() {
    const list = orderedPhotos();
    const p = list[viewerIndex];
    if (!p) return;
    $("jd-viewer-img").src = p.url ?? "";
    $("jd-viewer-img").alt = `${p.photo_type} photo`;
    $("jd-viewer-badge").textContent = p.photo_type;
    $("jd-viewer-count").textContent = `Photo ${viewerIndex + 1} of ${list.length}`;
    $("jd-viewer-meta").textContent = `Uploaded ${formatDateTime(p.uploaded_at)}${p.uploader ? ` · ${p.uploader}` : ""}`;
}

function stepViewer(step) {
    const count = orderedPhotos().length;
    if (!count) return;
    viewerIndex = (viewerIndex + step + count) % count;
    renderViewer();
}

const viewerOpen = () => !$("jd-viewer").classList.contains("hidden");
const closeViewer = () => $("jd-viewer").classList.replace("flex", "hidden");

// ---------- status ----------
function updateStatusLook() {
    const info = STATUS_INFO[draft.status] ?? STATUS_INFO.not_started;
    $("jd-status-dot").className = `size-2 rounded-full ${info.dot}`;
    $("jd-status-label").className = info.text;
    $("jd-status-label").textContent = info.label;

    // delivered jobs can't change status
    $("jd-status-btn").disabled = isDelivered();
    $("jd-status-chevron").classList.toggle("hidden", isDelivered());

    // parts and payment only matter when the car is ready to go home
    // delivered jobs show their parts and payment cards directly
    const closeout = $("jd-closeout");
    if (closeout) {
        const show = draft.status === "ready_for_pickup";
        closeout.classList.toggle("hidden", !show);
        closeout.classList.toggle("flex", show);
    }
}

function toggleStatusMenu(show) {
    const menu = $("jd-status-menu");
    const open = show ?? menu.classList.contains("hidden");
    menu.classList.toggle("hidden", !open);
    $("jd-status-btn").setAttribute("aria-expanded", String(open));
}

// ---------- delivery checks ----------

// what's still missing before the job can be delivered (empty list = ready)
function deliveryMissing() {
    const missing = [];
    if (!draft.customerParts && !draft.noShopParts && draft.items.length === 0) missing.push("parts used");
    if (!(Number(draft.amount) > 0)) missing.push("amount paid");
    if (!draft.paymentDate) missing.push("payment date");
    if (!photos.some((p) => p.photo_type === "receipt")) missing.push("a receipt photo");
    return missing;
}

function refreshDeliver() {
    const btn = $("jd-deliver");
    const hint = $("jd-deliver-hint");

    if (isDelivered()) {
        btn.classList.add("hidden");
        hint.innerHTML = `<span class="text-accent">${icon("check")}</span>Delivered on ${formatDateTime(job.delivered_at)}`;
        hint.className = "flex items-center gap-1.5 text-xs text-muted font-mono";
        return;
    }
    btn.classList.remove("hidden");

    if (draft.status !== "ready_for_pickup") {
        btn.disabled = true;
        hint.textContent = "Set the status to Ready for Pickup first";
        hint.className = "text-[11px] text-muted text-right";
        return;
    }

    const missing = deliveryMissing();
    btn.disabled = missing.length > 0 || isBusy;
    hint.textContent = missing.length ? `Still needed: ${missing.join(", ")}` : "Ready to deliver";
    hint.className = `text-[11px] text-right ${missing.length ? "text-status-awaiting-parts" : "text-accent"}`;
}

// ---------- unsaved changes ----------
function snapshot(d) {
    return JSON.stringify({
        status: d.status,
        customerParts: d.customerParts,
        problem: d.problem.trim(),
        expected: d.expected,
        customerId: d.customerId,
        vehicleId: d.vehicleId,
        items: [...d.items].sort((a, b) => a.part_id.localeCompare(b.part_id)).map((p) => [p.part_id, p.quantity]),
    });
}

// payment fields only get saved on delivery, so they count as unsaved work too
const hasChanges = () =>
    !isDelivered() && (snapshot(draft) !== snapshot(original) || draft.amount !== "" || draft.noShopParts !== original.noShopParts);

const hasSavableChanges = () => !isDelivered() && snapshot(draft) !== snapshot(original);

function refresh() {
    $("jd-save").disabled = isBusy || !hasSavableChanges();
    refreshDeliver();
}

function setMessage(text, tone = "muted") {
    $("jd-message").className = `text-xs ${tone === "error" ? "text-status-overdue" : "text-muted"}`;
    $("jd-message").textContent = text;
}

// ---------- loading ----------
async function loadJob(jobId) {
    const { data, error } = await supabase
        .from("jobs")
        .select(`
            job_id, problem_description, status, registered_at, expected_completion_date,
            delivered_at, customer_supplied_parts, customer_id, vehicle_id,
            creator:profiles ( full_name ),
            customers ( customer_id, full_name, phone_number, email ),
            vehicles ( vehicle_id, make, model, year, plate_number, colour, engine_trim ),
            job_parts ( quantity, parts ( part_id, part_name ) ),
            job_photos ( photo_id, photo_type, storage_path, uploaded_at, uploader:profiles ( full_name ) ),
            sales_records ( sale_id, amount_paid, payment_date, receipt_photo_id )
        `)
        .eq("job_id", jobId)
        .single();

    if (error) {
        console.error("Could not load job:", error);
        return null;
    }

    // sales_records comes back as an object or a one-item list depending on the api version
    const sale = Array.isArray(data.sales_records) ? data.sales_records[0] : data.sales_records;
    return { ...data, sale: sale ?? null };
}

async function loadVehicles(customerId) {
    const { data, error } = await supabase
        .from("vehicles")
        .select("vehicle_id, make, model, year, plate_number, colour, engine_trim")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });
    if (error) {
        console.error("Could not load vehicles:", error);
        return [];
    }
    return data;
}

// only admins get the customer picker, so only they load the full list
async function loadCustomers() {
    if (!options.isAdmin) return [];
    const { data, error } = await supabase
        .from("customers")
        .select("customer_id, full_name, phone_number, email")
        .order("full_name");
    if (error) {
        console.error("Could not load customers:", error);
        return [];
    }
    return data;
}

async function loadPartsCatalog() {
    const { data, error } = await supabase
        .from("parts")
        .select("part_id, part_name")
        .eq("is_active", true)
        .order("part_name");
    if (error) {
        console.error("Could not load parts:", error);
        return [];
    }
    return data;
}

// ---------- saving ----------

// brings job_parts in line with the parts in the drawer
async function syncParts() {
    const wanted = draft.customerParts || draft.noShopParts ? [] : draft.items;

    // nothing to do when the parts are the same as what's saved
    const key = (list) => JSON.stringify([...list].sort((a, b) => a.part_id.localeCompare(b.part_id)).map((p) => [p.part_id, p.quantity]));
    if (key(wanted) === key(original.items)) return null;
    const wantedIds = new Set(wanted.map((p) => p.part_id));
    const removed = original.items.filter((p) => !wantedIds.has(p.part_id)).map((p) => p.part_id);

    if (removed.length) {
        // .select() returns the deleted rows, so a delete blocked by row level security shows up as 0 rows
        const { data, error } = await supabase
            .from("job_parts").delete().eq("job_id", job.job_id).in("part_id", removed).select("part_id");
        if (error) return error;
        if ((data?.length ?? 0) < removed.length) {
            return { message: "You don't have permission to remove saved parts. Ask an admin." };
        }
    }

    if (wanted.length) {
        const { error } = await supabase
            .from("job_parts")
            .upsert(wanted.map((p) => ({ job_id: job.job_id, part_id: p.part_id, quantity: p.quantity })), { onConflict: "job_id,part_id" });
        if (error) return error;
    }
    return null;
}

async function saveJobFields({ includeStatus }) {
    const changes = {};
    if (includeStatus && draft.status !== original.status) changes.status = draft.status;
    if (draft.customerParts !== original.customerParts) changes.customer_supplied_parts = draft.customerParts;
    if (draft.problem.trim() !== original.problem.trim()) changes.problem_description = draft.problem.trim();
    if (draft.expected !== original.expected) changes.expected_completion_date = draft.expected || null;
    // customer and vehicle go together so the database's "vehicle belongs to customer" check sees both
    if (draft.customerId !== original.customerId || draft.vehicleId !== original.vehicleId) {
        changes.customer_id = draft.customerId;
        changes.vehicle_id = draft.vehicleId;
    }
    if (!Object.keys(changes).length) return null;

    const { error } = await supabase.from("jobs").update(changes).eq("job_id", job.job_id);
    return error;
}

function setBusy(busy, label) {
    isBusy = busy;
    setLabel($("jd-save"), busy && label === "save" ? "Saving..." : "Save changes");
    $("jd-deliver").lastChild.textContent = busy && label === "deliver" ? " Delivering..." : " Mark as delivered";
    refresh();
}

// problems with the editable details, or "" when they're fine
function detailsError() {
    if (!draft.problem.trim()) return "The problem description can't be empty.";
    if (!draft.vehicleId) return "Pick the vehicle for this job.";
    return "";
}

// turns database errors into something staff can act on
function friendlyError(error, fallback) {
    if (error?.message?.startsWith("You don't")) return error.message;
    if (error?.message?.includes("Vehicle does not belong")) return "That vehicle doesn't belong to the selected customer.";
    if (error?.message?.includes("Only admins")) return "Only admins can move a job to another customer.";
    return fallback;
}

async function save() {
    if (isBusy || !hasSavableChanges()) return;
    const invalid = detailsError();
    if (invalid) return setMessage(invalid, "error");

    setBusy(true, "save");
    setMessage("");

    const error = (await syncParts()) ?? (await saveJobFields({ includeStatus: true }));
    setBusy(false);

    if (error) {
        console.error("Could not save job:", error);
        setMessage(friendlyError(error, "Couldn't save the changes. Please try again."), "error");
        return;
    }

    hide();
    showToast("Job updated");
    options.onSaved(job.job_id);
}

async function deliver() {
    if (isBusy || draft.status !== "ready_for_pickup" || deliveryMissing().length) return;
    const invalid = detailsError();
    if (invalid) return setMessage(invalid, "error");
    const sure = await confirmDialog({
        title: "Mark this job as delivered?",
        message: "The payment is recorded and the work order is locked. After this, only an admin can change it.",
        confirmLabel: "Mark as delivered",
        cancelLabel: "Not yet",
        tone: "primary",
    });
    if (!sure || !isOpen) return;

    setBusy(true, "deliver");
    setMessage("");

    const fail = (error, text = "Couldn't deliver the job. Please try again.") => {
        console.error("Could not deliver job:", error);
        setBusy(false);
        setMessage(text, "error");
    };

    // 1. parts used and parts origin
    const partsError = (await syncParts()) ?? (await saveJobFields({ includeStatus: false }));
    if (partsError) return fail(partsError, friendlyError(partsError, undefined));

    // 2. payment, linked to the newest receipt photo (skipped if an earlier attempt already saved it)
    const { data: existing, error: lookupError } = await supabase
        .from("sales_records").select("sale_id").eq("job_id", job.job_id).maybeSingle();
    if (lookupError) return fail(lookupError);

    if (!existing) {
        const receipt = photos
            .filter((p) => p.photo_type === "receipt")
            .sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at))[0];

        const { error } = await supabase.from("sales_records").insert({
            job_id: job.job_id,
            receipt_photo_id: receipt.photo_id,
            amount_paid: Number(draft.amount),
            payment_date: draft.paymentDate,
        });
        if (error) return fail(error, error.code === "23514" ? "The amount paid must be more than 0." : undefined);
    }

    // 3. the status change; the database refuses it if the payment record is missing
    const { error: statusError } = await supabase
        .from("jobs")
        .update({ status: "delivered", delivered_at: new Date().toISOString() })
        .eq("job_id", job.job_id);
    if (statusError) return fail(statusError);

    setBusy(false);
    hide();
    showToast("Job marked as delivered");
    options.onSaved(job.job_id);
}

// ---------- admin: move an open job to another customer ----------
async function changeCustomer(customerId) {
    draft.customerId = customerId;
    draft.vehicleId = "";
    $("jd-customer-card").outerHTML = renderCustomerCard();
    $("jd-vehicle-card").innerHTML = `<p class="text-xs text-muted">Loading vehicles...</p>`;

    const list = await loadVehicles(customerId);
    if (draft.customerId !== customerId) return; // picked someone else while loading

    vehicleList = list;
    // going back to the original customer restores the original vehicle; one vehicle gets picked for you
    if (customerId === original.customerId) draft.vehicleId = original.vehicleId;
    else if (list.length === 1) draft.vehicleId = list[0].vehicle_id;

    $("jd-vehicle-card").outerHTML = renderVehicleCard();
    refresh();
}

// ---------- admin edits on a delivered job ----------
let editKind = null; // "parts" or "payment" while the edit box is open

const editOpen = () => editKind !== null;

function setEditMessage(text, tone = "muted") {
    $("jd-edit-message").className = `text-xs ${tone === "error" ? "text-status-overdue" : "text-muted"}`;
    $("jd-edit-message").textContent = text;
}

function openEdit(kind) {
    editKind = kind;
    setEditMessage("");
    $("jd-edit-save").disabled = false;
    setLabel($("jd-edit-save"), "Save");

    if (kind === "parts") {
        // start from what's saved
        draft.items = original.items.map((p) => ({ ...p }));
        $("jd-edit-title").innerHTML = `<span class="text-accent">${icon("wrench")}</span> Edit parts used`;
        $("jd-edit-body").innerHTML = `
            <div id="jd-parts-picker" class="flex flex-col gap-3">
                <div class="relative">
                    <label for="jd-parts-search" class="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted font-display mb-1.5">
                        Add shop parts <span id="jd-parts-count" class="normal-case tracking-normal font-mono text-accent"></span>
                    </label>
                    <span class="absolute left-3 bottom-2.5 text-muted pointer-events-none">${icon("search")}</span>
                    <input id="jd-parts-search" type="text" autocomplete="off" placeholder="Search parts..." class="field pl-9" />
                    <div id="jd-parts-menu" class="hidden absolute left-0 right-0 top-full mt-1 bg-surface border border-line-strong rounded-xl shadow-2xl z-10 max-h-56 overflow-y-auto"></div>
                </div>
                <ul id="jd-parts-list" class="flex flex-col gap-2 min-h-24"></ul>
                <p class="text-[11px] text-muted">Removing every part records the job as "no shop parts used".</p>
            </div>`;
        renderPartsList();
    } else if (kind === "problem") {
        $("jd-edit-title").innerHTML = `<span class="text-accent">${icon("notes")}</span> Edit problem description`;
        $("jd-edit-body").innerHTML = `
            <label for="jd-edit-problem" class="block text-[11px] font-semibold uppercase tracking-wider text-muted font-display">Problem description <span class="text-status-overdue">*</span></label>
            <textarea id="jd-edit-problem" rows="6" class="field resize-y leading-relaxed">${escapeHtml(job.problem_description)}</textarea>`;
    } else {
        const sale = job.sale;
        $("jd-edit-title").innerHTML = `<span class="text-accent">${icon("payments")}</span> Edit payment`;
        $("jd-edit-body").innerHTML = `
            <div>
                <label for="jd-edit-amount" class="block text-[11px] font-semibold uppercase tracking-wider text-muted font-display mb-1.5">Amount paid (GYD) <span class="text-status-overdue">*</span></label>
                <div class="flex items-center rounded-lg bg-inset border border-line-strong focus-within:border-accent overflow-hidden">
                    <span class="px-3 py-2 bg-raised border-r border-line-strong text-xs font-mono font-bold text-accent">GYD</span>
                    <input id="jd-edit-amount" type="number" min="0.01" step="0.01" inputmode="decimal" value="${Number(sale.amount_paid)}"
                        class="w-full bg-transparent px-3 py-2 text-sm font-mono text-ink focus:outline-none" />
                </div>
            </div>
            <div>
                <label for="jd-edit-date" class="block text-[11px] font-semibold uppercase tracking-wider text-muted font-display mb-1.5">Payment date <span class="text-status-overdue">*</span></label>
                <input id="jd-edit-date" type="date" max="${todayIso()}" value="${sale.payment_date}" class="field font-mono text-xs" />
            </div>
            <p class="text-[11px] text-muted">Changes show up in the reports straight away.</p>`;
    }

    $("jd-edit").classList.replace("hidden", "flex");
    $("jd-edit-body").querySelector("input, textarea")?.focus();
}

function closeEdit() {
    if (!editOpen()) return;
    if (editKind === "parts") draft.items = original.items.map((p) => ({ ...p })); // drop unsaved edits
    editKind = null;
    $("jd-edit").classList.replace("flex", "hidden");
    $("jd-edit-body").innerHTML = "";
}

async function saveEdit(e) {
    e.preventDefault();
    if (!editOpen() || isBusy) return;

    const btn = $("jd-edit-save");
    const kind = editKind;

    if (kind === "parts") {
        if (snapshot(draft) === snapshot(original)) return closeEdit();

        btn.disabled = true;
        setLabel(btn, "Saving...");
        const error = await syncParts();
        btn.disabled = false;
        setLabel(btn, "Save");

        if (error) {
            console.error("Could not update parts:", error);
            return setEditMessage(error.message?.startsWith("You don't") ? error.message : "Couldn't save the parts. Please try again.", "error");
        }
        original.items = draft.items.map((p) => ({ ...p }));
        editKind = null; // keep the saved parts when the box closes
        $("jd-edit").classList.replace("flex", "hidden");
        $("jd-parts-card").outerHTML = renderPartsCard();
        showToast("Parts used updated");
        return;
    }

    if (kind === "problem") {
        const text = $("jd-edit-problem").value.trim();
        if (!text) return setEditMessage("The problem description can't be empty.", "error");
        if (text === job.problem_description) return closeEdit();

        btn.disabled = true;
        setLabel(btn, "Saving...");
        // .select() returns the updated row, so a change blocked by row level security shows up as no rows
        const { data, error } = await supabase
            .from("jobs").update({ problem_description: text }).eq("job_id", job.job_id).select("problem_description");
        btn.disabled = false;
        setLabel(btn, "Save");

        if (error || !data?.length) {
            console.error("Could not update problem description:", error);
            return setEditMessage(error ? "Couldn't save. Please try again." : "Only admins can change a delivered job.", "error");
        }
        job.problem_description = data[0].problem_description;
        original.problem = draft.problem = job.problem_description;
        closeEdit();
        $("jd-problem-card").outerHTML = renderProblemCard();
        showToast("Problem description updated");
        options.onSaved(job.job_id); // the jobs table shows the problem text
        return;
    }

    // payment
    const amountText = $("jd-edit-amount").value.trim();
    const amount = Number(amountText);
    const date = $("jd-edit-date").value;
    if (!(amount > 0)) return setEditMessage("Enter an amount more than 0.", "error");
    if (!date) return setEditMessage("Pick the payment date.", "error");
    if (date > todayIso()) return setEditMessage("The payment date can't be in the future.", "error");

    btn.disabled = true;
    setLabel(btn, "Saving...");

    // .select() returns the updated row, so a change blocked by row level security shows up as no rows
    const { data, error } = await supabase
        .from("sales_records")
        .update({ amount_paid: amount, payment_date: date })
        .eq("sale_id", job.sale.sale_id)
        .select("sale_id, amount_paid, payment_date, receipt_photo_id");

    btn.disabled = false;
    setLabel(btn, "Save");

    if (error || !data?.length) {
        console.error("Could not update payment:", error);
        return setEditMessage(error ? "Couldn't save the payment. Please try again." : "Only admins can change a payment.", "error");
    }

    job.sale = data[0];
    closeEdit();
    $("jd-payment-card").outerHTML = renderPaymentCard();
    showToast("Payment updated");
}

// ---------- admin: delete a job ----------

// only admins, and only before delivery (a delivered job is a sales record the reports rely on)
const canDeleteJob = () => options.isAdmin && job && !isDelivered();

async function deleteJob() {
    if (!canDeleteJob() || isBusy) return;

    const sure = await confirmDialog({
        title: "Delete this job?",
        message: "This removes the job, its parts used and its photos. Linked appointments are kept. This can't be undone.",
        confirmLabel: "Delete job",
        cancelLabel: "Keep job",
    });
    if (!sure || !isOpen) return;

    isBusy = true;
    setLabel($("jd-delete"), "Deleting...");
    $("jd-delete").disabled = true;
    refresh();
    setMessage("");

    // delete the job first; its photo and parts records go with it.
    // .select() returns the deleted row, so a delete blocked by row level security shows up as no rows
    const { data, error } = await supabase.from("jobs").delete().eq("job_id", job.job_id).select("job_id");

    isBusy = false;
    setLabel($("jd-delete"), "Delete job");
    $("jd-delete").disabled = false;
    refresh();

    if (error || !data?.length) {
        console.error("Could not delete job:", error);
        // 23503: a payment record still points at this job
        const text = error?.code === "23503"
            ? "This job has a payment record, so it can't be deleted."
            : error ? "Couldn't delete the job. Please try again." : "Only admins can delete jobs.";
        return setMessage(text, "error");
    }

    // then clean up the photo files so nothing is left in storage
    const paths = photos.map((p) => p.storage_path);
    if (paths.length) {
        const { error: fileError } = await supabase.storage.from(BUCKET).remove(paths);
        if (fileError) console.error("Job deleted but some photo files weren't:", fileError);
    }

    hide();
    showToast("Job deleted");
    options.onSaved(job.job_id); // reloads the jobs table
}

// ---------- success message ----------
let toastTimer = null;
function showToast(text) {
    const toast = $("jd-toast");
    $("jd-toast-text").textContent = text;
    toast.classList.remove("translate-y-24", "opacity-0");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("translate-y-24", "opacity-0"), 3500);
}

// ---------- open / close ----------
function show() {
    $("job-drawer").classList.remove("hidden");
    document.body.classList.add("overflow-hidden");
    // next frame so the slide-in transition actually runs
    requestAnimationFrame(() => {
        $("job-drawer").querySelector("[data-jd-backdrop]").classList.replace("opacity-0", "opacity-100");
        $("jd-panel").classList.remove("translate-x-full");
    });
    isOpen = true;
}

function hide() {
    $("job-drawer").querySelector("[data-jd-backdrop]").classList.replace("opacity-100", "opacity-0");
    $("jd-panel").classList.add("translate-x-full");
    document.body.classList.remove("overflow-hidden");
    toggleStatusMenu(false);
    closeViewer();
    closeConfirm();
    closeEdit();
    isOpen = false;
    setTimeout(() => {
        if (!isOpen) $("job-drawer").classList.add("hidden");
    }, 300);
    lastFocused?.focus?.();
}

export const isJobDrawerOpen = () => isOpen;

export async function openJobDrawer(jobId) {
    if (isOpen) return;
    lastFocused = document.activeElement;

    // loading state while the job is fetched
    job = null;
    $("jd-title").textContent = `Job #${jobNumber(jobId)}`;
    $("jd-subtitle").textContent = "";
    $("jd-body").innerHTML = `<p class="text-sm text-muted text-center py-10">Loading job...</p>`;
    $("jd-save").disabled = true;
    $("jd-deliver").disabled = true;
    $("jd-deliver-hint").textContent = "";
    $("jd-status-label").textContent = "";
    $("jd-status-dot").className = "size-2 rounded-full";
    $("jd-save").classList.remove("hidden");
    $("jd-delete").classList.replace("flex", "hidden");
    $("jd-locked").classList.replace("flex", "hidden");
    setMessage("");
    show();

    const [loaded, catalog] = await Promise.all([loadJob(jobId), loadPartsCatalog()]);
    if (!isOpen) return; // closed while loading

    if (!loaded) {
        $("jd-body").innerHTML = `<p class="text-sm text-status-overdue text-center py-10">Couldn't load this job. Close the panel and try again.</p>`;
        return;
    }

    job = loaded;
    partsCatalog = catalog;

    const items = (job.job_parts ?? [])
        .filter((row) => row.parts)
        .map((row) => ({ part_id: row.parts.part_id, part_name: row.parts.part_name, quantity: row.quantity }));

    original = {
        status: job.status,
        customerParts: job.customer_supplied_parts,
        items,
        noShopParts: false,
        problem: job.problem_description ?? "",
        expected: job.expected_completion_date ?? "",
        customerId: job.customer_id,
        vehicleId: job.vehicle_id,
    };
    draft = { ...original, items: items.map((p) => ({ ...p })), amount: "", paymentDate: todayIso() };

    // vehicles (and customers, for admins) for the pickers on open jobs
    if (!isDelivered()) {
        [vehicleList, customerList] = await Promise.all([loadVehicles(job.customer_id), loadCustomers()]);
    } else {
        vehicleList = [];
        customerList = [];
    }

    photos = await attachPhotoUrls(
        (job.job_photos ?? []).map((p) => ({ ...p, uploader: p.uploader?.full_name ?? "" }))
            .sort((a, b) => new Date(a.uploaded_at) - new Date(b.uploaded_at)),
    );
    if (!isOpen) return;

    const v = job.vehicles;
    $("jd-subtitle").textContent = [job.customers?.full_name, v && `${v.year} ${v.make} ${v.model}`, v?.plate_number]
        .filter(Boolean).join(" · ");

    renderBody();
    updateStatusLook();
    refresh();

    // delivered work orders are read-only; admins correct parts and payment through the edit links
    $("jd-save").classList.toggle("hidden", isDelivered());
    $("jd-delete").classList.toggle("hidden", !canDeleteJob());
    $("jd-delete").classList.toggle("flex", canDeleteJob());
    if (isDelivered()) $("jd-locked").classList.replace("hidden", "flex");
}

export async function closeJobDrawer() {
    if (!isOpen || isBusy) return;
    if (job && hasChanges()) {
        const discard = await confirmDialog({
            title: "Discard your changes?",
            message: "You have edits on this job that haven't been saved.",
            confirmLabel: "Discard",
            cancelLabel: "Keep editing",
        });
        if (!discard || !isOpen) return;
    }
    hide();
}

// ---------- setup ----------
export function initJobDrawer({ userId, isAdmin = false, onSaved = () => {} } = {}) {
    options = { userId, isAdmin, onSaved };
    document.body.insertAdjacentHTML("beforeend", drawerShell());

    const root = $("job-drawer");

    // clicks anywhere in the drawer (one listener, the body is redrawn per job)
    root.addEventListener("click", (e) => {
        const t = e.target;

        if (t.closest("[data-jd-close]") || t.matches("[data-jd-backdrop]")) return closeJobDrawer();

        // status menu
        if (t.closest("#jd-status-btn")) return toggleStatusMenu();
        const statusOption = t.closest("[data-status]");
        if (statusOption) {
            draft.status = statusOption.dataset.status;
            toggleStatusMenu(false);
            updateStatusLook();
            renderOverdueNote();
            refresh();
            return;
        }
        if (!t.closest("#jd-status-wrap")) toggleStatusMenu(false);

        // parts
        const pick = t.closest("[data-pick-part]");
        if (pick) return addPart(pick.dataset.pickPart);
        if (!t.closest("#jd-parts-search") && !t.closest("#jd-parts-menu")) $("jd-parts-menu")?.classList.add("hidden");

        const step = t.closest("[data-qty-step]");
        if (step) {
            const item = draft.items.find((p) => p.part_id === step.dataset.part);
            if (item) setQuantity(item.part_id, item.quantity + Number(step.dataset.qtyStep));
            return;
        }
        const remove = t.closest("[data-remove-part]");
        if (remove) {
            draft.items = draft.items.filter((p) => p.part_id !== remove.dataset.removePart);
            renderPartsList();
            refresh();
            return;
        }

        // photos
        const add = t.closest("[data-add-photo]");
        if (add) {
            uploadType = add.dataset.addPhoto;
            $("jd-file").value = "";
            $("jd-file").click();
            return;
        }
        if (t.closest("[data-upload-dismiss]")) return setUploadStatus("");
        const view = t.closest("[data-view-photo]");
        if (view) return showViewer(view.dataset.viewPhoto);
        const del = t.closest("[data-delete-photo]");
        if (del) return askDeletePhoto(del.dataset.deletePhoto);

        // admin edits on a delivered job
        const edit = t.closest("[data-edit]");
        if (edit) return openEdit(edit.dataset.edit);
        if (t.closest("[data-edit-cancel]") || t === $("jd-edit")) return closeEdit();

        // viewer and confirm box
        if (t.closest("[data-viewer-close]") || t === $("jd-viewer")) return closeViewer();
        const viewerStep = t.closest("[data-viewer-step]");
        if (viewerStep) return stepViewer(Number(viewerStep.dataset.viewerStep));
        if (t.closest("[data-confirm-cancel]") || t === $("jd-confirm")) return closeConfirm();
    });

    // typing and toggles inside the body
    root.addEventListener("input", (e) => {
        const t = e.target;
        if (t.id === "jd-parts-search") return renderPartsMenu();
        if (t.id === "jd-problem") {
            draft.problem = t.value;
            if (draft.problem.trim()) setMessage(""); // clears "can't be empty" once they type
            return refresh();
        }
        if (t.id === "jd-amount") {
            draft.amount = t.value.trim();
            return refresh();
        }
        if (t.id === "jd-paid-date") {
            draft.paymentDate = t.value;
            return refresh();
        }
    });

    // enter in the parts search or a quantity box shouldn't submit the edit form
    root.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && e.target.closest?.("#jd-parts-picker")) {
            e.preventDefault();
            if (e.target.matches("[data-qty-input]")) setQuantity(e.target.dataset.qtyInput, e.target.value);
        }
    });

    root.addEventListener("focusin", (e) => {
        if (e.target.id === "jd-parts-search" && !e.target.disabled) renderPartsMenu();
    });

    root.addEventListener("change", (e) => {
        const t = e.target;
        if (t.id === "jd-customer-parts") {
            draft.customerParts = t.checked;
            renderPartsList();
            return refresh();
        }
        if (t.id === "jd-no-parts") {
            draft.noShopParts = t.checked;
            if (t.checked) draft.items = [];
            renderPartsList();
            return refresh();
        }
        if (t.id === "jd-expected") {
            draft.expected = t.value;
            renderOverdueNote();
            return refresh();
        }
        if (t.id === "jd-vehicle") {
            draft.vehicleId = t.value;
            $("jd-vehicle-card").outerHTML = renderVehicleCard();
            return refresh();
        }
        if (t.id === "jd-customer") return changeCustomer(t.value);
        if (t.matches("[data-qty-input]")) return setQuantity(t.dataset.qtyInput, t.value);
        if (t.id === "jd-file") return uploadPhoto(t.files?.[0]);
    });

    $("jd-save").addEventListener("click", save);
    $("jd-delete").addEventListener("click", deleteJob);
    $("jd-deliver").addEventListener("click", deliver);
    $("jd-confirm-delete").addEventListener("click", deletePhoto);
    $("jd-edit-form").addEventListener("submit", saveEdit);

    // escape closes the top-most thing: viewer, confirm box, menus, then the drawer
    document.addEventListener("keydown", (e) => {
        if (!isOpen) return;

        // ctrl+s (cmd+s on a mac) saves the edit box if it's open, otherwise the drawer
        if (matchesShortcut(e, "s")) {
            e.preventDefault(); // stops the browser's "save page" window
            if (isConfirmOpen() || viewerOpen() || pendingDelete || isBusy) return;
            if (editOpen()) return $("jd-edit-form").requestSubmit();
            if (!$("jd-save").disabled && !$("jd-save").classList.contains("hidden")) save();
            return;
        }

        if (viewerOpen()) {
            if (e.key === "Escape") closeViewer();
            if (e.key === "ArrowRight") stepViewer(1);
            if (e.key === "ArrowLeft") stepViewer(-1);
            return;
        }
        if (e.key !== "Escape") return;
        if (pendingDelete) return closeConfirm();
        if (editOpen()) {
            // the parts search menu closes first, then the edit box
            if ($("jd-parts-menu") && !$("jd-parts-menu").classList.contains("hidden")) return $("jd-parts-menu").classList.add("hidden");
            return closeEdit();
        }
        if (!$("jd-status-menu").classList.contains("hidden")) return toggleStatusMenu(false);
        if ($("jd-parts-menu") && !$("jd-parts-menu").classList.contains("hidden")) return $("jd-parts-menu").classList.add("hidden");
        closeJobDrawer();
    });

    // warn before leaving the page with unsaved work
    window.addEventListener("beforeunload", (e) => {
        if (isOpen && job && hasChanges()) e.preventDefault();
    });
}
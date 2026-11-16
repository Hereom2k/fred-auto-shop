// shared sidebar for every logged-in page
// usage:
//   import { renderSidebar } from "./sidebar.js";
//   renderSidebar({ active: "jobs", role: "staff", name: "Kyle Osei" });

// small inline icons (material style), so we don't need an icon font
const ICONS = {
    logo: "M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z",
    dashboard: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z",
    jobs: "M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z",
    customers:
        "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
    appointments:
        "M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z",
    reports: "M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z",
    partsAlerts: "M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z",
    staff: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
    signOut:
        "M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z",
    menu: "M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z",
    close: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
};

// paths match the pages in the repo; jobs, customers and appointments are shared by both roles
const STAFF_LINKS = [
    { key: "dashboard", label: "Dashboard", href: "/pages/dashboard.html" },
    { key: "jobs", label: "Jobs", href: "/pages/jobs.html" },
    { key: "customers", label: "Customers", href: "/pages/customers.html" },
    { key: "appointments", label: "Appointments", href: "/pages/appointments.html" },
];

const ADMIN_LINKS = [
    { key: "dashboard", label: "Dashboard", href: "/pages/admin/" },
    { key: "jobs", label: "Jobs", href: "/pages/jobs.html" },
    { key: "customers", label: "Customers", href: "/pages/customers.html" },
    { key: "appointments", label: "Appointments", href: "/pages/appointments.html" },
    { key: "reports", label: "Reports", href: "/pages/admin/reports.html" },
    { key: "partsAlerts", label: "Parts Alerts", href: "/pages/admin/parts.html" },
];

// staff management sits under the divider line
const ADMIN_STAFF_LINK = {
    key: "staff",
    label: "Staff",
    href: "/pages/admin/staff.html",
};

// text that fades out when the desktop sidebar is collapsed
const FADE = "whitespace-nowrap md:opacity-0 md:group-hover/sidebar:opacity-100 md:group-focus-within/sidebar:opacity-100 transition-opacity duration-200";

function icon(name, size = "size-[18px]") {
    return `<svg class="${size} shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
}

// names come from the database, so escape them before putting them in html
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
}

function getInitials(name) {
    return (name || "?")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join("");
}

function navItem(link, active) {
    const isActive = link.key === active;
    const stateClasses = isActive
        ? "bg-accent text-neutral-950 font-semibold"
        : "text-muted hover:bg-raised hover:text-ink";

    return `
        <a href="${link.href}"
           title="${link.label}"
           class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${stateClasses}"
           ${isActive ? 'aria-current="page"' : ""}>
            ${icon(link.key)}
            <span class="flex-1 ${FADE}">${link.label}</span>
        </a>`;
}

/**
 * builds the sidebar and puts it at the start of <body>
 * @param {object} options
 * @param {string} options.active - key of the current page (dashboard, jobs, customers, appointments, reports, partsAlerts, staff)
 * @param {"staff"|"admin"} options.role
 * @param {string} options.name - logged in user's full name
 * @param {function} [options.onSignOut] - runs when sign out is clicked
 */
export function renderSidebar({ active, role = "staff", name = "", onSignOut } = {}) {
    const isAdmin = role === "admin";
    const links = isAdmin ? ADMIN_LINKS : STAFF_LINKS;

    const mainLinks = links.map((link) => navItem(link, active)).join("");

    const staffSection = isAdmin
        ? `<div class="my-3 border-t border-line"></div>
           ${navItem(ADMIN_STAFF_LINK, active)}`
        : "";

    const html = `
        <!-- mobile open button (the top bar can reuse data-sidebar-open later) -->
        <button type="button" data-sidebar-open
                class="md:hidden fixed top-3 left-3 z-30 p-2 rounded-lg bg-surface border border-line text-ink"
                aria-label="Open menu">
            ${icon("menu", "size-5")}
        </button>

        <!-- dark backdrop behind the sidebar on mobile -->
        <div data-sidebar-backdrop class="hidden md:hidden fixed inset-0 z-40 bg-black/60"></div>

        <aside id="sidebar"
               class="group/sidebar fixed inset-y-0 left-0 z-50 w-60 flex flex-col overflow-hidden bg-surface border-r border-line
                      md:w-16 md:hover:w-60 md:focus-within:w-60 md:hover:shadow-2xl md:hover:shadow-black/50
                      -translate-x-full md:translate-x-0 transition-[width,translate,box-shadow] duration-200 ease-out">

            <!-- logo -->
            <div class="flex items-center justify-between px-4 h-16 shrink-0">
                <a href="${links[0].href}" class="flex items-center gap-2.5">
                    <span class="size-8 shrink-0 rounded-lg bg-accent/15 text-accent flex items-center justify-center">
                        ${icon("logo", "size-[18px]")}
                    </span>
                    <!-- business name, split over two lines so it fits the sidebar width -->
                    <span class="flex flex-col leading-tight ${FADE}">
                        <span class="font-display font-bold text-accent tracking-wider">FRED'S AUTO</span>
                        <span class="text-[10px] font-semibold text-muted tracking-[0.2em]">ELECTRICAL</span>
                    </span>
                </a>
                <button type="button" data-sidebar-close class="md:hidden p-1 text-muted hover:text-ink" aria-label="Close menu">
                    ${icon("close", "size-5")}
                </button>
            </div>

            <!-- links -->
            <nav class="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 flex flex-col gap-1">
                ${mainLinks}
                ${staffSection}
            </nav>

            <!-- logged in user -->
            <div class="border-t border-line p-3 shrink-0">
                <div class="flex items-center gap-3 px-2 py-2 rounded-lg bg-raised/60 md:px-0.5 md:group-hover/sidebar:px-2 md:group-focus-within/sidebar:px-2 transition-[padding] duration-200">
                    <span class="size-9 shrink-0 rounded-full bg-neutral-700 text-ink text-xs font-bold flex items-center justify-center">
                        ${escapeHtml(getInitials(name))}
                    </span>
                    <div class="min-w-0 ${FADE}">
                        <p class="text-sm font-semibold text-ink truncate">${escapeHtml(name)}</p>
                        <p class="text-[11px] font-bold uppercase tracking-wide text-muted">${isAdmin ? "Admin" : "Staff"}</p>
                    </div>
                </div>
                <button type="button" data-sign-out title="Sign Out"
                        class="mt-2 w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted hover:bg-red-500/10 hover:text-red-400 transition cursor-pointer">
                    ${icon("signOut")}
                    <span class="${FADE}">Sign Out</span>
                </button>
            </div>
        </aside>`;

    document.body.insertAdjacentHTML("afterbegin", html);

    // push the page content past the collapsed rail on desktop
    // the sidebar expands over the page on hover, so the content doesn't move
    document.body.classList.add("md:pl-16");

    wireUpMobileToggle();

    document.querySelector("[data-sign-out]").addEventListener("click", () => {
        if (typeof onSignOut === "function") onSignOut();
    });
}

function wireUpMobileToggle() {
    const sidebar = document.getElementById("sidebar");
    const backdrop = document.querySelector("[data-sidebar-backdrop]");

    const open = () => {
        sidebar.classList.remove("-translate-x-full");
        backdrop.classList.remove("hidden");
        document.body.classList.add("overflow-hidden");
    };

    const close = () => {
        sidebar.classList.add("-translate-x-full");
        backdrop.classList.add("hidden");
        document.body.classList.remove("overflow-hidden");
    };

    // any button with data-sidebar-open works, so the top bar can use it too
    document.addEventListener("click", (event) => {
        if (event.target.closest("[data-sidebar-open]")) open();
    });
    document.querySelector("[data-sidebar-close]").addEventListener("click", close);
    backdrop.addEventListener("click", close);
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") close();
    });

    // if the screen gets wide again, clear the mobile state
    window.matchMedia("(min-width: 768px)").addEventListener("change", (e) => {
        if (e.matches) close();
    });
}
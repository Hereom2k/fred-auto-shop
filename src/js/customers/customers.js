import { supabase } from "../lib/supabase.js";
import { initPage } from "../shared/page.js";
import { openCustomerModal, deleteCustomer } from "./modals.js";
import { printCustomerList } from "./print-history.js";
import { escapeHtml, initials, avatarClass, formatDate, vehicleName, roleLabel } from "./utils.js";

const PAGE_SIZE = 10; // rows per page

// sort options in the order the menu shows them; a divider goes before each group after the first
const SORTS = [
    { key: "date-desc", label: "Member Since (Newest)", group: 1, fn: (a, b) => new Date(b.since) - new Date(a.since) },
    { key: "date-asc", label: "Member Since (Oldest)", group: 1, fn: (a, b) => new Date(a.since) - new Date(b.since) },
    { key: "name-asc", label: "Name (A-Z)", group: 2, fn: (a, b) => a.name.localeCompare(b.name) },
    { key: "name-desc", label: "Name (Z-A)", group: 2, fn: (a, b) => b.name.localeCompare(a.name) },
    { key: "vehicles-desc", label: "Most Vehicles", group: 3, fn: (a, b) => b.vehicles.length - a.vehicles.length || a.name.localeCompare(b.name) },
    { key: "vehicles-asc", label: "Least Vehicles", group: 3, fn: (a, b) => a.vehicles.length - b.vehicles.length || a.name.localeCompare(b.name) },
    { key: "jobs-desc", label: "Most Jobs", group: 4, fn: (a, b) => b.jobCount - a.jobCount || a.name.localeCompare(b.name) },
    { key: "jobs-asc", label: "Least Jobs", group: 4, fn: (a, b) => a.jobCount - b.jobCount || a.name.localeCompare(b.name) },
];

// filled from supabase in loadCustomers()
let customers = [];

// set from the logged in profile in main()
let isAdmin = false;

// what the user has picked
let view = "all"; // 'all' or 'multiple' (more than one job)
let sortKey = "date-desc";
let creatorFilter = "all"; // 'all', 'none' or a profile_id (admins only)
let currentPage = 1;

// customer the row menu was opened for
let menuCustomer = null;

// page elements
const $ = (id) => document.getElementById(id);
const body = $("customers-body");
const search = $("search");
const noResults = $("no-results");
const rowMenu = $("row-menu");

const icons = {
    chevronLeft: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="m15 6-6 6 6 6" /></svg>`,
    chevronRight: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>`,
    chevron: `<svg class="size-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" /></svg>`,
    dots: `<svg class="size-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" /></svg>`,
    check: `<svg class="size-3.5 text-accent" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round" /></svg>`,
};

// ---------- loading from supabase ----------

// one row of the table spanning every column, used for loading and error messages
function showMessageRow(html) {
    body.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-muted">${html}</td></tr>`;
    noResults.classList.add("hidden");
}

async function loadCustomers() {
    showMessageRow("Loading customers...");

    // vehicles, jobs and the creator's profile are joined through their foreign keys
    const { data, error } = await supabase
        .from("customers")
        .select(`
            customer_id,
            full_name,
            phone_number,
            email,
            address,
            created_at,
            created_by,
            creator:profiles ( full_name, role ),
            vehicles ( vehicle_id, make, model, year, plate_number ),
            jobs ( job_id )
        `)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Could not load customers:", error);
        showMessageRow(`Couldn't load customers. <button id="retry-btn" class="text-accent font-semibold hover:underline cursor-pointer">Try again</button>`);
        $("retry-btn").addEventListener("click", reload);
        return false;
    }

    // flatten each row into the shape the table uses
    customers = data.map((row) => ({
        id: row.customer_id,
        name: row.full_name,
        phone: row.phone_number,
        email: row.email,
        address: row.address,
        since: row.created_at,
        creatorId: row.created_by,
        creatorName: row.creator?.full_name ?? null,
        creatorRole: row.creator?.role ?? null,
        vehicles: row.vehicles ?? [],
        jobCount: row.jobs?.length ?? 0,
    }));

    return true;
}

async function reload() {
    if (await loadCustomers()) renderAll();
}

// ---------- filter, sort ----------

function getFiltered() {
    const term = search.value.toLowerCase().trim();
    const digits = term.replace(/[^0-9]/g, "");
    const sorter = SORTS.find((s) => s.key === sortKey).fn;

    return customers
        .filter((c) => {
            if (view === "multiple" && c.jobCount < 2) return false;
            if (isAdmin && creatorFilter !== "all") {
                if (creatorFilter === "none" ? c.creatorId : c.creatorId !== creatorFilter) return false;
            }
            if (!term) return true;

            const text = [c.name, c.email ?? "", c.phone, ...c.vehicles.map((v) => `${v.plate_number} ${vehicleName(v)}`)]
                .join(" ")
                .toLowerCase();
            // "6001234" should still find "600-1234"
            const phoneDigits = c.phone.replace(/[^0-9]/g, "");
            return text.includes(term) || (digits.length >= 3 && phoneDigits.includes(digits));
        })
        .sort(sorter);
}

// ---------- dropdowns (sort, created by and export) ----------

function closeMenus() {
    for (const id of ["sort", "creator", "export"]) {
        $(`${id}-menu`).classList.add("hidden");
        $(`${id}-btn`).setAttribute("aria-expanded", "false");
    }
    hideRowMenu();
}

function toggleMenu(id) {
    const menu = $(`${id}-menu`);
    const opening = menu.classList.contains("hidden");
    closeMenus();
    menu.classList.toggle("hidden", !opening);
    $(`${id}-btn`).setAttribute("aria-expanded", String(opening));
}

// one option in a dropdown, highlighted with a tick when it's the current choice
function menuOption({ value, label, selected, attr }) {
    return `
        <button type="button" ${attr}="${escapeHtml(value)}" role="menuitemradio" aria-checked="${selected}"
            class="w-full px-3 py-1.5 text-xs text-left flex items-center justify-between gap-2 transition cursor-pointer
            ${selected ? "text-accent bg-accent/10" : "hover:bg-raised"}">
            <span class="truncate">${label}</span>
            ${selected ? icons.check : ""}
        </button>`;
}

const menuHeading = (text) => `<p class="px-3 py-1 text-[11px] font-semibold text-muted uppercase tracking-wider">${text}</p>`;
const menuDivider = `<div class="my-1 border-t border-line"></div>`;

function renderSortMenu() {
    const current = SORTS.find((s) => s.key === sortKey);
    $("sort-label").textContent = current.label;

    $("sort-menu").innerHTML =
        menuHeading("Select order") +
        SORTS.map((s, i) => {
            const divider = i > 0 && s.group !== SORTS[i - 1].group ? menuDivider : "";
            return divider + menuOption({ value: s.key, label: s.label, selected: s.key === sortKey, attr: "data-sort" });
        }).join("");
}

// "Ravi Persaud (Admin)" style label
const creatorText = (name, role) => `${escapeHtml(name)} <span class="text-muted">(${roleLabel(role)})</span>`;

function renderCreatorMenu() {
    if (!isAdmin) return;

    // everyone who has created a customer, in name order
    const people = new Map();
    let hasUnknown = false;
    for (const c of customers) {
        if (c.creatorId && c.creatorName) people.set(c.creatorId, { name: c.creatorName, role: c.creatorRole });
        else hasUnknown = true;
    }
    const sorted = [...people.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));

    // the person picked earlier may have no customers left after a delete
    if (creatorFilter !== "all" && creatorFilter !== "none" && !people.has(creatorFilter)) creatorFilter = "all";
    if (creatorFilter === "none" && !hasUnknown) creatorFilter = "all";

    $("creator-label").innerHTML =
        creatorFilter === "all"
            ? "All Staff"
            : creatorFilter === "none"
              ? "Unknown"
              : escapeHtml(people.get(creatorFilter).name);

    $("creator-menu").innerHTML =
        menuHeading("Filter by staff") +
        menuOption({ value: "all", label: "All Staff", selected: creatorFilter === "all", attr: "data-creator" }) +
        sorted.map(([id, p]) => menuOption({ value: id, label: creatorText(p.name, p.role), selected: creatorFilter === id, attr: "data-creator" })).join("") +
        (hasUnknown ? menuOption({ value: "none", label: "Unknown", selected: creatorFilter === "none", attr: "data-creator" }) : "");
}

// ---------- all / multiple jobs toggle ----------

function renderToggle() {
    const multiple = customers.filter((c) => c.jobCount > 1).length;
    document.querySelectorAll(".view-btn").forEach((btn) => {
        const isActive = btn.dataset.view === view;
        btn.textContent = btn.dataset.view === "all" ? `All (${customers.length})` : `Multiple Jobs (${multiple})`;
        btn.className =
            "view-btn px-3 py-1.5 rounded-md transition cursor-pointer " +
            (isActive ? "bg-accent text-neutral-950 shadow-sm" : "font-medium text-muted hover:text-ink hover:bg-raised");
    });
}

// ---------- table ----------

function creatorCell(c) {
    if (!c.creatorName) return `<span class="text-xs text-muted italic">Unknown</span>`;
    return `
        <div class="flex items-center gap-2">
            <span class="size-6 shrink-0 rounded-full border flex items-center justify-center text-[11px] font-display font-semibold ${avatarClass(c.creatorId)}">${escapeHtml(initials(c.creatorName))}</span>
            <span class="text-xs whitespace-nowrap"><span class="font-medium">${escapeHtml(c.creatorName)}</span> <span class="text-[11px] text-muted">(${roleLabel(c.creatorRole)})</span></span>
        </div>`;
}

// admins get the ⋮ menu (delete), staff get a plain arrow
function actionCell(c) {
    if (!isAdmin) return `<span class="flex justify-end text-muted group-hover:text-ink transition">${icons.chevron}</span>`;
    return `
        <div class="flex justify-end">
            <button type="button" data-menu="${c.id}" class="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-raised transition cursor-pointer"
                aria-label="Actions for ${escapeHtml(c.name)}" title="Customer actions" aria-haspopup="true">${icons.dots}</button>
        </div>`;
}

function renderTable() {
    const filtered = getFiltered();

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageRows = filtered.slice(start, start + PAGE_SIZE);

    body.innerHTML = pageRows
        .map(
            (c) => `
      <tr data-id="${c.id}" class="group odd:bg-row even:bg-row-alt hover:bg-raised/60 cursor-pointer transition">
        <td class="px-6 py-4">
          <div class="flex items-center gap-3">
            <span class="size-9 shrink-0 rounded-full border flex items-center justify-center font-display font-semibold text-xs ${avatarClass(c.id)}">${escapeHtml(initials(c.name))}</span>
            <div class="min-w-0">
              <p class="font-medium group-hover:text-accent transition">${escapeHtml(c.name)}</p>
              ${c.email ? `<p class="text-xs text-muted truncate">${escapeHtml(c.email)}</p>` : `<p class="text-xs text-muted italic">No email on file</p>`}
            </div>
          </div>
        </td>
        <td class="px-6 py-4 font-mono text-xs text-muted whitespace-nowrap">${escapeHtml(c.phone)}</td>
        <td class="px-6 py-4 font-mono text-xs font-medium text-muted whitespace-nowrap">${formatDate(c.since)}</td>
        <td class="px-6 py-4 text-center font-mono text-xs font-medium ${c.vehicles.length > 1 ? "text-accent" : "text-muted"}">${c.vehicles.length}</td>
        <td class="px-6 py-4 text-center font-mono text-xs font-medium text-muted">${c.jobCount}</td>
        <td class="px-6 py-4">
          ${
              c.vehicles.length
                  ? `<div class="flex items-center gap-2 flex-wrap text-xs text-muted">${c.vehicles
                        .map((v) => `<span>${escapeHtml(vehicleName(v))}</span>`)
                        .join(`<span class="text-line-strong">·</span>`)}</div>`
                  : `<span class="text-xs text-muted italic">No vehicles</span>`
          }
        </td>
        ${isAdmin ? `<td class="px-6 py-4">${creatorCell(c)}</td>` : ""}
        <td class="px-6 py-4">${actionCell(c)}</td>
      </tr>`,
        )
        .join("");

    noResults.classList.toggle("hidden", filtered.length > 0);
    renderFooter(filtered.length, start, pageRows.length, totalPages);
}

// ---------- footer (same as the jobs table) ----------

// page list like 1 … 4 5 6 … 100
function pageNumbers(total, current) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    const pages = [1];
    const from = Math.max(2, current - 1);
    const to = Math.min(total - 1, current + 1);

    if (from > 2) pages.push("...");
    for (let p = from; p <= to; p++) pages.push(p);
    if (to < total - 1) pages.push("...");
    pages.push(total);
    return pages;
}

function renderFooter(total, start, shown, totalPages) {
    // left side text
    $("showing-text").innerHTML =
        total === 0
            ? `Showing <span class="font-semibold text-ink">0</span>`
            : `Showing <span class="font-semibold text-ink">${start + 1}–${start + shown}</span>
         of <span class="font-semibold text-ink">${total}</span>`;

    // one page button
    const pageBtn = (content, page, { current = false, disabled = false } = {}) => `
      <button data-page="${page}" ${disabled ? "disabled" : ""}
        class="min-w-10 h-10 px-3 flex items-center justify-center border-l border-line-strong first:border-l-0 transition cursor-pointer
        ${current ? "bg-raised text-ink font-semibold" : "text-muted hover:bg-raised hover:text-ink"}
        disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent">
        ${content}
      </button>`;

    $("pagination").innerHTML =
        pageBtn(icons.chevronLeft, currentPage - 1, { disabled: currentPage === 1 }) +
        pageNumbers(totalPages, currentPage)
            .map((p) =>
                p === "..."
                    ? `<span class="min-w-10 h-10 px-3 flex items-center justify-center border-l border-line-strong text-muted">…</span>`
                    : pageBtn(p, p, { current: p === currentPage }),
            )
            .join("") +
        pageBtn(icons.chevronRight, currentPage + 1, { disabled: currentPage === totalPages });
}

// ---------- row menu (admins only) ----------

// the menu lives outside the table so the scrolling table can't cut it off
function showRowMenu(button, customer) {
    menuCustomer = customer;
    const rect = button.getBoundingClientRect();
    rowMenu.classList.remove("hidden");
    // open below the button, or above it when there's no room at the bottom of the screen
    const below = rect.bottom + 4 + rowMenu.offsetHeight < window.innerHeight;
    rowMenu.style.top = `${below ? rect.bottom + 4 : rect.top - rowMenu.offsetHeight - 4}px`;
    rowMenu.style.left = `${rect.right - rowMenu.offsetWidth}px`;
}

function hideRowMenu() {
    rowMenu.classList.add("hidden");
    menuCustomer = null;
}

// ---------- export ----------

// downloads whatever the table is currently showing (after search / filter / sort)
function exportCsv() {
    const cell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const header = ["Name", "Phone", "Email", "Address", "Member since", "Vehicles", "Jobs"];
    if (isAdmin) header.push("Created by");

    const rows = getFiltered().map((c) => {
        const row = [
            c.name,
            c.phone,
            c.email,
            c.address,
            formatDate(c.since),
            c.vehicles.map((v) => `${vehicleName(v)} (${v.plate_number})`).join("; "),
            c.jobCount,
        ];
        if (isAdmin) row.push(c.creatorName ?? "");
        return row;
    });

    const csv = [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// one line describing what the printed list contains, e.g. "Multiple jobs only · Search: "hilux" · Sorted by Name (A-Z)"
function listSummary() {
    const parts = [];
    if (view === "multiple") parts.push("Multiple jobs only");
    if (isAdmin && creatorFilter !== "all") parts.push(`Created by: ${$("creator-label").textContent}`);
    const term = search.value.trim();
    if (term) parts.push(`Search: "${term}"`);
    parts.push(`Sorted by ${SORTS.find((s) => s.key === sortKey).label}`);
    return parts.join(" · ");
}

function printList() {
    printCustomerList({ customers: getFiltered(), summary: listSummary(), showCreator: isAdmin });
}

// ---------- draw everything ----------

function renderAll() {
    $("total-count").textContent = `${customers.length} total`;
    renderToggle();
    renderSortMenu();
    renderCreatorMenu();
    renderTable();
}

// ---------- events ----------

function setupEvents() {
    document.querySelectorAll(".view-btn").forEach((btn) =>
        btn.addEventListener("click", () => {
            view = btn.dataset.view;
            currentPage = 1;
            renderToggle();
            renderTable();
        }),
    );

    // sort dropdown
    $("sort-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        toggleMenu("sort");
    });
    $("sort-menu").addEventListener("click", (e) => {
        const option = e.target.closest("[data-sort]");
        if (!option) return;
        sortKey = option.dataset.sort;
        currentPage = 1;
        closeMenus();
        renderSortMenu();
        renderTable();
    });

    // created by dropdown (only visible to admins)
    $("creator-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        toggleMenu("creator");
    });
    $("creator-menu").addEventListener("click", (e) => {
        const option = e.target.closest("[data-creator]");
        if (!option) return;
        creatorFilter = option.dataset.creator;
        currentPage = 1;
        closeMenus();
        renderCreatorMenu();
        renderTable();
    });

    // clicking anywhere else, scrolling or pressing escape closes any open menu
    document.addEventListener("click", (e) => {
        if (!e.target.closest("#sort-menu, #creator-menu, #export-menu, #row-menu")) closeMenus();
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeMenus();
    });
    window.addEventListener("scroll", hideRowMenu, true);
    window.addEventListener("resize", hideRowMenu);

    search.addEventListener("input", () => {
        currentPage = 1;
        renderTable();
    });

    $("pagination").addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-page]");
        if (!btn || btn.disabled) return;
        currentPage = Number(btn.dataset.page);
        renderTable();
    });

    // a row opens the customer's profile; the ⋮ button opens the row menu instead
    body.addEventListener("click", (e) => {
        const menuBtn = e.target.closest("[data-menu]");
        if (menuBtn) {
            e.stopPropagation();
            const customer = customers.find((c) => c.id === menuBtn.dataset.menu);
            const alreadyOpen = !rowMenu.classList.contains("hidden") && menuCustomer?.id === customer?.id;
            closeMenus();
            if (customer && !alreadyOpen) showRowMenu(menuBtn, customer);
            return;
        }
        const row = e.target.closest("tr[data-id]");
        if (row) window.location.href = `/pages/customer-details.html?id=${row.dataset.id}`;
    });

    $("row-delete-btn").addEventListener("click", async () => {
        const c = menuCustomer;
        hideRowMenu();
        if (!c) return;
        const deleted = await deleteCustomer({ id: c.id, name: c.name, vehicleCount: c.vehicles.length, jobCount: c.jobCount });
        if (deleted) await reload();
    });

    // export dropdown
    $("export-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        toggleMenu("export");
    });
    $("print-btn").addEventListener("click", () => {
        closeMenus();
        printList();
    });
    $("csv-btn").addEventListener("click", () => {
        closeMenus();
        exportCsv();
    });

    $("new-customer-btn").addEventListener("click", () => {
        openCustomerModal({
            onSaved: async (customerId, { vehicleFailed } = {}) => {
                // a vehicle problem means they need the profile page to fix it
                if (vehicleFailed) {
                    setTimeout(() => (window.location.href = `/pages/customer-details.html?id=${customerId}`), 1500);
                    return;
                }
                await reload();
            },
        });
    });
}

// ---------- start ----------

async function main() {
    const page = await initPage({ active: "customers" });
    if (!page) return;

    // created by column, filter and the delete menu are admin only
    isAdmin = page.profile.role === "admin";
    $("creator-dropdown").classList.toggle("hidden", !isAdmin);
    document.querySelectorAll(".admin-only").forEach((el) => el.classList.toggle("hidden", !isAdmin));

    setupEvents();
    await reload();
}

main();
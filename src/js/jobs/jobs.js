import { supabase } from "../lib/supabase.js";
import { initPage } from "../shared/page.js";

// label, pill class and dot class for each status (keys match the job_status enum)
// class names are written out in full so tailwind can find them
const statuses = {
    overdue:          { label: "Overdue",          pill: "status-overdue",        dot: "bg-status-overdue" },
    in_progress:      { label: "In Progress",      pill: "status-in-progress",    dot: "bg-status-in-progress" },
    awaiting_parts:   { label: "Awaiting Parts",   pill: "status-awaiting-parts", dot: "bg-status-awaiting-parts" },
    not_started:      { label: "Not Started",      pill: "status-not-started",    dot: "bg-status-not-started" },
    ready_for_pickup: { label: "Ready",            pill: "status-ready",          dot: "bg-status-ready" },
    delivered:        { label: "Delivered",        pill: "status-delivered",      dot: "bg-status-delivered" },
};

// order the chips appear in
const chipKeys = ["overdue", "in_progress", "awaiting_parts", "not_started", "ready_for_pickup"];

const PAGE_SIZE = 10; // rows per page

// filled from supabase in loadJobs()
let jobs = [];

// what the user has picked
let view = "active";      // 'active' or 'delivered'
let statusFilter = "all"; // 'all' or a status key
let currentPage = 1;

// page elements
const body = document.getElementById("jobs-body");
const search = document.getElementById("search");
const chipsBox = document.getElementById("status-chips");
const noResults = document.getElementById("no-results");
const totalCount = document.getElementById("total-count");
const showingText = document.getElementById("showing-text");
const pagination = document.getElementById("pagination");

const activeJobs = () => jobs.filter((j) => j.status !== "delivered");
const deliveredJobs = () => jobs.filter((j) => j.status === "delivered");

// small svg icons
const chevronLeft = `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="m15 6-6 6 6 6" /></svg>`;
const chevronRight = `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>`;

// text from the database gets escaped before it goes into html
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
}

// ---------- loading from supabase ----------

// one row of the table spanning every column, used for loading and error messages
function showMessageRow(html) {
    body.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-muted">${html}</td></tr>`;
    noResults.classList.add("hidden");
}

async function loadJobs() {
    showMessageRow("Loading jobs...");

    // customers and vehicles are joined through the foreign keys on jobs
    const { data, error } = await supabase
        .from("jobs")
        .select(`
            job_id,
            problem_description,
            status,
            registered_at,
            customers ( full_name ),
            vehicles ( make, model, year, plate_number )
        `)
        .order("registered_at", { ascending: false });

    if (error) {
        console.error("Could not load jobs:", error);
        showMessageRow(`Couldn't load jobs. <button id="retry-btn" class="text-accent font-semibold hover:underline cursor-pointer">Try again</button>`);
        document.getElementById("retry-btn").addEventListener("click", async () => {
            if (await loadJobs()) renderAll();
        });
        return false;
    }

    // flatten each row into the shape the table uses
    jobs = data.map((row) => ({
        id: row.job_id,
        problem: row.problem_description,
        status: row.status,
        customer: row.customers?.full_name ?? "Unknown customer",
        vehicle: row.vehicles
            ? `${row.vehicles.year} ${row.vehicles.make} ${row.vehicles.model}`
            : "Unknown vehicle",
        plate: row.vehicles?.plate_number ?? "",
    }));

    return true;
}

// ---------- active / delivered switch ----------
function renderToggle() {
    document.querySelectorAll(".view-btn").forEach((btn) => {
        const isActive = btn.dataset.view === view;
        const count = btn.dataset.view === "active" ? activeJobs().length : deliveredJobs().length;
        btn.textContent = `${btn.dataset.view === "active" ? "Active" : "Delivered"} (${count})`;
        btn.className =
            "view-btn px-3 py-1.5 rounded-md transition " +
            (isActive ? "bg-accent text-neutral-950" : "text-muted hover:text-ink");
    });
}

// ---------- status chips ----------
function renderChips() {
    // chips only make sense on the active view
    chipsBox.classList.toggle("hidden", view === "delivered");
    const list = activeJobs();

    const chip = (key, label, count) => {
        const selected = statusFilter === key;
        const dot = key === "all" ? "" : `<span class="w-1.5 h-1.5 rounded-full ${statuses[key].dot}"></span>`;
        return `
        <button data-status="${key}"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wide uppercase transition
          ${selected ? "bg-accent text-neutral-950" : "bg-inset text-ink/75 hover:bg-raised"}">
          ${dot}${label} (${count})
        </button>`;
    };

    chipsBox.innerHTML =
        chip("all", "All", list.length) +
        chipKeys.map((k) => chip(k, statuses[k].label, list.filter((j) => j.status === k).length)).join("");
}

// ---------- table ----------
function renderTable() {
    const term = search.value.toLowerCase().trim();
    const base = view === "active" ? activeJobs() : deliveredJobs();

    // match search text and the selected chip
    const filtered = base.filter((j) => {
        const text = `${j.customer} ${j.vehicle} ${j.plate} ${j.problem}`.toLowerCase();
        const statusOk = view === "delivered" || statusFilter === "all" || j.status === statusFilter;
        return text.includes(term) && statusOk;
    });

    // work out which rows belong on this page
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageJobs = filtered.slice(start, start + PAGE_SIZE);

    body.innerHTML = pageJobs
        .map((j) => {
            const status = statuses[j.status] ?? statuses.not_started;
            return `
      <tr data-id="${j.id}" class="group odd:bg-row even:bg-row-alt hover:bg-raised/60 cursor-pointer transition">
        <td class="px-5 py-4">
          <p class="text-ink text-sm leading-snug line-clamp-2">${escapeHtml(j.problem)}</p>
        </td>
        <td class="px-5 py-4 text-sm font-semibold">${escapeHtml(j.customer)}</td>
        <td class="px-5 py-4">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span class="text-sm font-semibold">${escapeHtml(j.vehicle)}</span>
            ${j.plate ? `<span class="plate">${escapeHtml(j.plate)}</span>` : ""}
          </div>
        </td>
        <td class="px-5 py-4 text-center">
          <span class="pill ${status.pill}">
            <span class="w-1.5 h-1.5 rounded-full bg-current"></span>${status.label}
          </span>
        </td>
        <td class="px-5 py-4 text-muted group-hover:text-ink">${chevronRight}</td>
      </tr>`;
        })
        .join("");

    noResults.classList.toggle("hidden", filtered.length > 0);
    renderFooter(filtered.length, start, pageJobs.length, totalPages);
}

// ---------- footer: count and page buttons ----------

// page list like 1 … 4 5 6 … 100, always keeps first and last page
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
    showingText.innerHTML =
        total === 0
            ? `Showing <span class="font-semibold text-ink">0</span>`
            : `Showing <span class="font-semibold text-ink">${start + 1}–${start + shown}</span>
         of <span class="font-semibold text-ink">${total}</span>`;

    // one page button
    const pageBtn = (content, page, { current = false, disabled = false } = {}) => `
      <button data-page="${page}" ${disabled ? "disabled" : ""}
        class="min-w-10 h-10 px-3 flex items-center justify-center border-l border-line-strong first:border-l-0 transition
        ${current ? "bg-raised text-ink font-semibold" : "text-muted hover:bg-raised hover:text-ink"}
        disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent">
        ${content}
      </button>`;

    pagination.innerHTML =
        pageBtn(chevronLeft, currentPage - 1, { disabled: currentPage === 1 }) +
        pageNumbers(totalPages, currentPage)
            .map((p) =>
                p === "..."
                    ? `<span class="min-w-10 h-10 px-3 flex items-center justify-center border-l border-line-strong text-muted">…</span>`
                    : pageBtn(p, p, { current: p === currentPage }),
            )
            .join("") +
        pageBtn(chevronRight, currentPage + 1, { disabled: currentPage === totalPages });
}

// ---------- draw everything ----------
function renderAll() {
    totalCount.textContent = `${view === "active" ? activeJobs().length : deliveredJobs().length} total`;
    renderToggle();
    renderChips();
    renderTable();
}

// ---------- events ----------
function setupEvents() {
    // active / delivered switch
    document.querySelectorAll(".view-btn").forEach((btn) =>
        btn.addEventListener("click", () => {
            view = btn.dataset.view;
            statusFilter = "all";
            currentPage = 1;
            renderAll();
        }),
    );

    // status chips (one listener on the container)
    chipsBox.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-status]");
        if (!btn) return;
        statusFilter = btn.dataset.status;
        currentPage = 1;
        renderChips();
        renderTable();
    });

    // search box
    search.addEventListener("input", () => {
        currentPage = 1;
        renderTable();
    });

    // page buttons
    pagination.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-page]");
        if (!btn || btn.disabled) return;
        currentPage = Number(btn.dataset.page);
        renderTable();
    });

    // clicking a row opens that job's details page
    body.addEventListener("click", (e) => {
        const row = e.target.closest("tr[data-id]");
        if (row) window.location.href = `/pages/job-details.html?id=${row.dataset.id}`;
    });
}

// ---------- start ----------
async function main() {
    // checks the login, loads the profile and draws the sidebar
    const page = await initPage({ active: "jobs" });
    if (!page) return;

    setupEvents();

    if (await loadJobs()) renderAll();
}

main();
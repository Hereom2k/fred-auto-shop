import { supabase } from "../lib/supabase.js";
import { initPage } from "../shared/page.js";
import { initNewJobModal, openNewJobModal } from "../jobs/new-job-modal.js";
import { openCustomerModal, openVehicleModal, deleteCustomer, deleteVehicle } from "./modals.js";
import { printServiceHistory } from "./print-history.js";
import { escapeHtml, formatDate, formatMonthYear, vehicleName, shortId } from "./utils.js";

// same labels, pill and dot classes as the jobs page (keys match the job_status enum)
// class names are written out in full so tailwind can find them
const statuses = {
    overdue: { label: "Overdue", pill: "status-overdue" },
    in_progress: { label: "In Progress", pill: "status-in-progress" },
    awaiting_parts: { label: "Awaiting Parts", pill: "status-awaiting-parts" },
    not_started: { label: "Not Started", pill: "status-not-started" },
    ready_for_pickup: { label: "Ready for Pickup", pill: "status-ready" },
    delivered: { label: "Delivered", pill: "status-delivered" },
};

const icons = {
    car: `<svg class="size-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>`,
    carSmall: `<svg class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>`,
    dots: `<svg class="size-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" /></svg>`,
    pencil: `<svg class="size-3.5 text-muted" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536M4 20h4L18.5 9.5a2.5 2.5 0 0 0-3.536-3.536L4.5 16.5 4 20z" stroke-linecap="round" stroke-linejoin="round" /></svg>`,
    wrench: `<svg class="size-3.5 text-accent" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke-linecap="round" stroke-linejoin="round" /></svg>`,
    trash: `<svg class="size-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" stroke-linecap="round" stroke-linejoin="round" /></svg>`,
};

const customerId = new URLSearchParams(window.location.search).get("id");

let isAdmin = false;
let customer = null;
let vehicles = [];
let jobs = [];

const $ = (id) => document.getElementById(id);

const backLink = "<a href='/pages/customers.html' class='text-accent font-semibold hover:underline'>Back to customers</a>";

// small teal dot after the section titles
const titleDot = `<span class="inline-block size-1.5 rounded-full bg-accent align-middle ml-1.5"></span>`;

function showMessage(html) {
    $("state-message").innerHTML = html;
    $("state-message").classList.remove("hidden");
    $("content").classList.add("hidden");
    $("actions").classList.add("hidden");
}

// ---------- loading ----------

async function loadCustomer() {
    if (!customerId) {
        showMessage(`No customer selected. ${backLink}`);
        return false;
    }

    const [customerRes, vehiclesRes, jobsRes] = await Promise.all([
        supabase
            .from("customers")
            .select("customer_id, full_name, phone_number, email, address, created_at")
            .eq("customer_id", customerId)
            .maybeSingle(),
        supabase
            .from("vehicles")
            .select("vehicle_id, plate_number, make, model, year, colour, engine_trim")
            .eq("customer_id", customerId)
            .order("created_at"),
        supabase
            .from("jobs")
            .select("job_id, vehicle_id, problem_description, status, registered_at, delivered_at, note_for_next_time, vehicles ( year, make, model, plate_number )")
            .eq("customer_id", customerId)
            .order("registered_at", { ascending: false }),
    ]);

    const error = customerRes.error || vehiclesRes.error || jobsRes.error;

    // 22P02 means the id in the url isn't a valid uuid, so there's no such customer
    if (error?.code === "22P02" || (!error && !customerRes.data)) {
        showMessage(`Customer not found. ${backLink}`);
        return false;
    }

    if (error) {
        console.error("Could not load customer:", error);
        showMessage(`Couldn't load this customer. <button id="retry-btn" class="text-accent font-semibold hover:underline cursor-pointer">Try again</button>`);
        $("retry-btn").addEventListener("click", reload);
        return false;
    }

    customer = customerRes.data;
    vehicles = vehiclesRes.data;
    jobs = jobsRes.data;
    return true;
}

// ---------- drawing ----------

function renderHeader() {
    document.title = `${customer.full_name} - Fred's Auto Electrical`;
    $("customer-name").textContent = customer.full_name;
    $("customer-phone").textContent = customer.phone_number;
    $("customer-since").textContent = `Customer since ${formatMonthYear(customer.created_at)}`;

    const email = $("customer-email");
    email.classList.toggle("hidden", !customer.email);
    email.textContent = customer.email ?? "";
    if (customer.email) email.href = `mailto:${customer.email}`;

    const address = $("customer-address");
    $("customer-address-text").textContent = customer.address ?? "";
    address.classList.toggle("hidden", !customer.address);
    address.classList.toggle("flex", !!customer.address);

    // the appointments page can read these to start a new appointment for this customer
    $("new-appointment-link").href = `/pages/appointments.html?new=1&customer=${customer.customer_id}`;
}

// ⋮ menu on a vehicle card: edit and create job for everyone, delete for admins
function vehicleMenu(v) {
    const item = (action, icon, label, extra = "hover:bg-raised") => `
        <button type="button" data-vehicle-action="${action}" data-vehicle-id="${v.vehicle_id}" role="menuitem"
            class="w-full px-3 py-2 text-xs text-left flex items-center gap-2 transition cursor-pointer ${extra}">
            ${icon}<span class="font-medium">${label}</span>
        </button>`;

    return `
        <div data-vehicle-menu class="hidden absolute right-3 top-11 w-44 card shadow-xl shadow-black/40 z-20 py-1 overflow-hidden" role="menu">
            ${item("edit", icons.pencil, "Edit Vehicle")}
            ${item("job", icons.wrench, "Create Job")}
            ${
                isAdmin
                    ? `<div class="my-1 border-t border-line"></div>` +
                      item("delete", icons.trash, "Delete vehicle", "text-status-overdue hover:bg-status-overdue/15")
                    : ""
            }
        </div>`;
}

function renderVehicles() {
    $("vehicles-title").innerHTML = `VEHICLES (${vehicles.length})${titleDot}`;

    if (!vehicles.length) {
        $("vehicles").innerHTML = `<p class="md:col-span-2 card p-6 text-center text-sm text-muted">No vehicles registered yet.</p>`;
        return;
    }

    $("vehicles").innerHTML = vehicles
        .map(
            (v) => `
        <article class="card rounded-xl p-5 flex items-start gap-4 relative">
            <span class="size-12 shrink-0 rounded-lg bg-raised text-muted flex items-center justify-center">${icons.car}</span>
            <div class="min-w-0 flex-1">
                <h3 class="font-display text-base font-semibold">${escapeHtml(vehicleName(v))}</h3>
                ${v.colour ? `<p class="text-xs text-muted">${escapeHtml(v.colour)}</p>` : ""}
                <div class="mt-3 flex flex-wrap items-center gap-2">
                    <span class="plate text-sm px-3 py-1.5">${escapeHtml(v.plate_number)}</span>
                    ${v.engine_trim ? `<span class="text-xs px-2 py-1 rounded bg-raised border border-line-strong">${escapeHtml(v.engine_trim)}</span>` : ""}
                </div>
            </div>
            <button type="button" data-vehicle-menu-btn class="p-1.5 -mr-1.5 -mt-1 rounded-lg text-muted hover:text-ink hover:bg-raised transition cursor-pointer"
                aria-label="Options for ${escapeHtml(vehicleName(v))}" aria-haspopup="true" aria-expanded="false">${icons.dots}</button>
            ${vehicleMenu(v)}
        </article>`,
        )
        .join("");
}

function renderJobs() {
    $("jobs-title").innerHTML = `JOB HISTORY (${jobs.length})${titleDot}`;

    if (!jobs.length) {
        $("jobs").innerHTML = `<p class="p-6 text-center text-sm text-muted">No jobs yet.</p>`;
        return;
    }

    // each job opens in the job drawer on the jobs page (jobs.js reads ?job=<id>)
    $("jobs").innerHTML = jobs
        .map((j) => {
            const status = statuses[j.status] ?? statuses.not_started;
            return `
        <a href="/pages/jobs.html?job=${j.job_id}" class="flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-2 px-5 py-4 hover:bg-raised/60 transition">
            <span class="font-mono text-[11px] font-semibold px-2.5 py-1.5 rounded bg-inset border border-line text-muted shrink-0">#${shortId(j.job_id)}</span>
            <div class="min-w-0 flex-1 basis-56">
                <p class="text-sm font-semibold line-clamp-1">${escapeHtml(j.problem_description)}</p>
                ${j.vehicles ? `<p class="text-xs text-muted mt-1 flex items-center gap-1.5">${icons.carSmall}${escapeHtml(vehicleName(j.vehicles))}</p>` : ""}
            </div>
            <span class="font-mono text-xs text-muted shrink-0">${formatDate(j.registered_at)}</span>
            <span class="pill ${status.pill} shrink-0"><span class="w-1.5 h-1.5 rounded-full bg-current"></span>${status.label}</span>
        </a>`;
        })
        .join("");
}

function renderAll() {
    $("state-message").classList.add("hidden");
    $("content").classList.remove("hidden");
    $("actions").classList.remove("hidden");
    $("delete-wrap").classList.toggle("hidden", !isAdmin);
    renderHeader();
    renderVehicles();
    renderJobs();
}

async function reload() {
    if (await loadCustomer()) renderAll();
}

// ---------- export ----------

const statusLabel = (status) => (statuses[status] ?? statuses.not_started).label;

// one csv with the customer's details, their vehicles and their job history
function exportProfile() {
    const cell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = [
        ["Customer", "Phone", "Email", "Address", "Customer since"],
        [customer.full_name, customer.phone_number, customer.email, customer.address, formatDate(customer.created_at)],
        [],
        ["Plate", "Year", "Make", "Model", "Colour", "Engine / Trim"],
        ...vehicles.map((v) => [v.plate_number, v.year, v.make, v.model, v.colour, v.engine_trim]),
        [],
        ["Job #", "Registered", "Vehicle", "Plate", "Problem", "Status", "Delivered", "Note for next time"],
        ...jobs.map((j) => [
            shortId(j.job_id),
            formatDate(j.registered_at),
            vehicleName(j.vehicles),
            j.vehicles?.plate_number,
            j.problem_description,
            statusLabel(j.status),
            formatDate(j.delivered_at),
            j.note_for_next_time,
        ]),
    ];

    const csv = rows.map((r) => r.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${customer.full_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-profile.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ---------- menus ----------

function closeMenus() {
    $("more-menu").classList.add("hidden");
    $("more-btn").setAttribute("aria-expanded", "false");
    document.querySelectorAll("[data-vehicle-menu]").forEach((m) => m.classList.add("hidden"));
    document.querySelectorAll("[data-vehicle-menu-btn]").forEach((b) => b.setAttribute("aria-expanded", "false"));
}

// ---------- events ----------

const openEdit = () => openCustomerModal({ customer, onSaved: reload });

function setupEvents() {
    $("edit-btn").addEventListener("click", openEdit);
    $("new-job-btn").addEventListener("click", () => openNewJobModal({ customerId: customer.customer_id }));
    $("add-vehicle-btn").addEventListener("click", () =>
        openVehicleModal({ customerId, customerName: customer.full_name, onSaved: reload }),
    );

    // top ⋮ menu
    $("more-btn").addEventListener("click", (event) => {
        event.stopPropagation();
        const opening = $("more-menu").classList.contains("hidden");
        closeMenus();
        $("more-menu").classList.toggle("hidden", !opening);
        $("more-btn").setAttribute("aria-expanded", String(opening));
    });
    $("edit-details-btn").addEventListener("click", () => {
        closeMenus();
        openEdit();
    });
    $("print-btn").addEventListener("click", () => {
        closeMenus();
        printServiceHistory({ customer, vehicles, jobs, statusLabel });
    });
    $("export-btn").addEventListener("click", () => {
        closeMenus();
        exportProfile();
    });
    $("delete-btn").addEventListener("click", async () => {
        closeMenus();
        if (!isAdmin) return;
        const deleted = await deleteCustomer({
            id: customer.customer_id,
            name: customer.full_name,
            vehicleCount: vehicles.length,
            jobCount: jobs.length,
        });
        if (deleted) setTimeout(() => (window.location.href = "/pages/customers.html"), 800);
    });

    // vehicle card ⋮ menus and their options
    $("vehicles").addEventListener("click", async (event) => {
        const menuBtn = event.target.closest("[data-vehicle-menu-btn]");
        if (menuBtn) {
            event.stopPropagation();
            const menu = menuBtn.parentElement.querySelector("[data-vehicle-menu]");
            const opening = menu.classList.contains("hidden");
            closeMenus();
            menu.classList.toggle("hidden", !opening);
            menuBtn.setAttribute("aria-expanded", String(opening));
            return;
        }

        const option = event.target.closest("[data-vehicle-action]");
        if (!option) return;
        closeMenus();
        const vehicle = vehicles.find((v) => v.vehicle_id === option.dataset.vehicleId);
        if (!vehicle) return;

        if (option.dataset.vehicleAction === "edit") {
            openVehicleModal({ customerId, customerName: customer.full_name, vehicle, onSaved: reload });
        } else if (option.dataset.vehicleAction === "job") {
            openNewJobModal({ customerId: customer.customer_id, vehicleId: vehicle.vehicle_id });
        } else if (option.dataset.vehicleAction === "delete" && isAdmin) {
            if (await deleteVehicle(vehicle)) await reload();
        }
    });

    // clicking anywhere else or pressing escape closes any open menu
    document.addEventListener("click", (event) => {
        if (!event.target.closest("#more-menu, [data-vehicle-menu]")) closeMenus();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeMenus();
    });
}

// ---------- start ----------

async function main() {
    const page = await initPage({ active: "customers" });
    if (!page) return;

    isAdmin = page.profile.role === "admin";

    // the same new job modal as the jobs page, opened with this customer already picked
    initNewJobModal({ userId: page.user.id, onCreated: reload });

    setupEvents();
    await reload();
}

main();
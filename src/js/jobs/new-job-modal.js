// "new job" modal on the jobs page
// staff pick a customer and one of their vehicles (or add new ones inline), describe the problem and save
// usage:
//   import { initNewJobModal, openNewJobModal } from "./new-job-modal.js";
//   initNewJobModal({ userId, onCreated: (jobId) => reloadTheTable() });
//   openNewJobModal();

import { supabase } from "../lib/supabase.js";
import { confirmDialog, isConfirmOpen } from "../shared/confirm-dialog.js";
import { matchesShortcut, shortcutHint, shortcutAria } from "../shared/shortcuts.js";

// same rule as the customers.phone_number check in the database
const PHONE_PATTERN = /^[0-9+ -]{7,20}$/;

// special values for the "+ new ..." options in the dropdowns
const NEW_CUSTOMER = "__new_customer__";
const NEW_VEHICLE = "__new_vehicle__";

// material icon paths, drawn as inline svg like the sidebar and drawer
const ICONS = {
    close: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
    addCircle: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z",
    personAdd: "M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
    car: "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z",
    schedule: "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z",
    error: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z",
    chevronDown: "M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z",
    checkCircle: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
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

// e.g. 16 Nov 2026, 4:30 pm
function formatDateTime(value) {
    const d = new Date(value);
    const date = d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return `${date} · ${time}`;
}

// today as yyyy-mm-dd in local time, for the date input's min
const todayIso = () => new Date().toLocaleDateString("en-CA");

const vehicleLabel = (v) => `${v.year} ${v.make} ${v.model} (${v.plate_number})`;

// ---------- state ----------
let options = { userId: null, onCreated: () => {} };
let customers = [];     // every customer, for the dropdown
let vehicles = [];      // vehicles of the selected customer
let isOpen = false;
let isSaving = false;
let prefilledCustomer = ""; // customer picked by openNewJobModal({ customerId }), see hasChanges
let lastFocused = null; // element to give focus back to when the modal closes

const $ = (id) => document.getElementById(id);
const modal = () => $("new-job-modal");

// ---------- markup ----------

// label above each field; required fields get a red star
const fieldLabel = (forId, text, required = false) => `
    <label for="${forId}" class="block text-[11px] font-semibold uppercase tracking-wider text-muted font-display mb-1.5">
        ${text}${required ? ` <span class="text-status-overdue">*</span>` : ""}
    </label>`;

// red message under a field, hidden until validation fails
const fieldError = (id, text) => `
    <p id="${id}" class="hidden mt-1.5 text-xs text-status-overdue flex items-center gap-1">
        ${icon("error", "size-3.5")}<span>${text}</span>
    </p>`;

// fields get a red ring when aria-invalid="true" (ring, so it doesn't fight the field's border)
const FIELD = "field aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-status-overdue/60";

function modalShell() {
    return `
    <div id="new-job-modal" class="fixed inset-0 z-50 hidden" role="dialog" aria-modal="true" aria-labelledby="new-job-title">
        <!-- dark backdrop, clicking it closes the modal -->
        <div data-modal-backdrop class="absolute inset-0 bg-black/60 backdrop-blur-[2px] opacity-0 transition-opacity duration-200"></div>

        <div class="absolute inset-0 overflow-y-auto p-4 flex pointer-events-none">
            <form id="new-job-form" novalidate
                class="pointer-events-auto relative m-auto w-full max-w-2xl bg-app border border-line rounded-2xl shadow-2xl overflow-hidden
                       flex flex-col max-h-[92vh] opacity-0 scale-95 transition duration-200">

                <!-- header -->
                <header class="px-6 py-4 border-b border-line bg-surface flex items-center justify-between gap-3 shrink-0">
                    <div class="flex items-center gap-3">
                        <div class="size-9 rounded-lg bg-accent/15 text-accent border border-accent/30 flex items-center justify-center">
                            ${icon("addCircle", "size-5")}
                        </div>
                        <h2 id="new-job-title" class="font-display text-base uppercase font-bold tracking-wider">New Job</h2>
                    </div>
                    <button type="button" data-modal-close class="size-8 rounded-lg bg-raised hover:bg-line-strong text-muted hover:text-ink flex items-center justify-center transition cursor-pointer" aria-label="Close">
                        ${icon("close", "size-5")}
                    </button>
                </header>

                <!-- initial status and registration time -->
                <div class="px-6 py-3 border-b border-line bg-surface/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
                    <div class="flex items-center gap-2">
                        <span class="text-[11px] font-semibold uppercase tracking-wider text-muted font-display">Initial status</span>
                        <span class="pill status-not-started"><span class="size-1.5 rounded-full bg-current"></span>Not Started</span>
                    </div>
                    <span class="flex items-center gap-1.5 text-[11px] text-muted font-mono">
                        <span class="text-accent">${icon("schedule", "size-3.5")}</span>
                        <span id="new-job-registered"></span>
                    </span>
                </div>

                <!-- body -->
                <div class="flex-1 overflow-y-auto p-6 flex flex-col gap-5">

                    <!-- customer -->
                    <div>
                        ${fieldLabel("new-job-customer", "Customer", true)}
                        <div class="relative">
                            <select id="new-job-customer" class="${FIELD} appearance-none pr-9 cursor-pointer"></select>
                            <span class="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none">${icon("chevronDown")}</span>
                        </div>
                        ${fieldError("new-job-customer-error", "Please select or add a customer.")}

                        <!-- quick add customer -->
                        <div id="new-customer-box" class="hidden mt-3 p-4 bg-surface border border-accent/30 rounded-xl flex flex-col gap-3">
                            <span class="text-xs text-accent font-semibold uppercase tracking-wider font-display flex items-center gap-1.5">
                                ${icon("personAdd")} Quick add customer
                            </span>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    ${fieldLabel("new-customer-name", "Full name", true)}
                                    <input id="new-customer-name" type="text" maxlength="100" class="${FIELD}" placeholder="e.g. Ravi Persaud" />
                                </div>
                                <div>
                                    ${fieldLabel("new-customer-phone", "Phone number", true)}
                                    <input id="new-customer-phone" type="tel" maxlength="20" class="${FIELD}" placeholder="592-600-1234" />
                                </div>
                            </div>
                            <p id="new-customer-message" class="hidden text-xs text-status-overdue"></p>
                            <div class="flex justify-end gap-2">
                                <button type="button" data-cancel-customer class="btn btn-secondary px-3 py-1.5 text-xs">Cancel</button>
                                <button type="button" id="new-customer-save" class="btn btn-primary px-3 py-1.5 text-xs">Add customer</button>
                            </div>
                        </div>
                    </div>

                    <!-- vehicle -->
                    <div>
                        ${fieldLabel("new-job-vehicle", "Vehicle", true)}
                        <div class="relative">
                            <select id="new-job-vehicle" class="${FIELD} appearance-none pr-9 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"></select>
                            <span class="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none">${icon("chevronDown")}</span>
                        </div>
                        <p id="new-job-vehicle-help" class="mt-1.5 text-[11px] text-muted flex items-center gap-1.5">
                            <span class="text-accent">${icon("car", "size-3.5")}</span><span></span>
                        </p>
                        ${fieldError("new-job-vehicle-error", "Please select or add a vehicle.")}

                        <!-- quick add vehicle -->
                        <div id="new-vehicle-box" class="hidden mt-3 p-4 bg-surface border border-accent/30 rounded-xl flex flex-col gap-3">
                            <span class="text-xs text-accent font-semibold uppercase tracking-wider font-display flex items-center gap-1.5">
                                ${icon("car")} Register vehicle to customer
                            </span>
                            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div>
                                    ${fieldLabel("new-vehicle-make", "Make", true)}
                                    <input id="new-vehicle-make" type="text" maxlength="50" class="${FIELD}" placeholder="Toyota" />
                                </div>
                                <div>
                                    ${fieldLabel("new-vehicle-model", "Model", true)}
                                    <input id="new-vehicle-model" type="text" maxlength="50" class="${FIELD}" placeholder="Allion" />
                                </div>
                                <div>
                                    ${fieldLabel("new-vehicle-year", "Year", true)}
                                    <input id="new-vehicle-year" type="number" min="1900" max="2100" class="${FIELD}" placeholder="2012" />
                                </div>
                                <div>
                                    ${fieldLabel("new-vehicle-plate", "Plate", true)}
                                    <input id="new-vehicle-plate" type="text" maxlength="15" class="${FIELD} font-mono uppercase" placeholder="PXX 1234" />
                                </div>
                            </div>
                            <p id="new-vehicle-message" class="hidden text-xs text-status-overdue"></p>
                            <div class="flex justify-end gap-2">
                                <button type="button" data-cancel-vehicle class="btn btn-secondary px-3 py-1.5 text-xs">Cancel</button>
                                <button type="button" id="new-vehicle-save" class="btn btn-primary px-3 py-1.5 text-xs">Add vehicle</button>
                            </div>
                        </div>
                    </div>

                    <!-- problem -->
                    <div>
                        ${fieldLabel("new-job-problem", "Problem description", true)}
                        <textarea id="new-job-problem" rows="3" class="${FIELD} resize-none"
                            placeholder="Describe what the customer reported, symptoms or the work needed..."></textarea>
                        ${fieldError("new-job-problem-error", "Problem description is required.")}
                    </div>

                    <!-- expected completion and parts origin -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            ${fieldLabel("new-job-expected", "Expected completion date")}
                            <input id="new-job-expected" type="date" class="${FIELD} font-mono text-xs" />
                            ${fieldError("new-job-expected-error", "The date can't be in the past.")}
                        </div>
                        <div>
                            <span class="block text-[11px] font-semibold uppercase tracking-wider text-muted font-display mb-1.5">Parts origin</span>
                            <label class="flex items-center justify-between gap-3 bg-inset border border-line-strong rounded-lg px-3 py-2 cursor-pointer">
                                <span class="text-xs font-semibold">Customer supplied own parts</span>
                                <span class="relative inline-flex shrink-0">
                                    <input id="new-job-customer-parts" type="checkbox" class="peer sr-only" />
                                    <span class="h-6 w-11 rounded-full bg-line-strong peer-checked:bg-accent transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent/50"></span>
                                    <span class="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"></span>
                                </span>
                            </label>
                        </div>
                    </div>
                </div>

                <!-- footer -->
                <footer class="px-6 py-4 border-t border-line bg-surface flex items-center justify-between gap-3 shrink-0">
                    <p id="new-job-message" class="text-xs text-muted" role="status"><span class="text-status-overdue">*</span> Required fields</p>
                    <div class="flex items-center gap-3">
                        <button type="button" data-modal-close class="btn btn-secondary py-2 text-xs uppercase tracking-wider">Cancel</button>
                        <button type="submit" id="new-job-save" aria-keyshortcuts="${shortcutAria("s")}" class="btn btn-primary relative group py-2 text-xs uppercase tracking-wider">
                            <span data-btn-label>Save job</span>${shortcutHint("s", "above")}
                        </button>
                    </div>
                </footer>
            </form>
        </div>
    </div>`;
}

// ---------- small helpers ----------

// shows or hides a field's error message and red ring
function setFieldError(inputId, errorId, hasError) {
    $(inputId).setAttribute("aria-invalid", hasError ? "true" : "false");
    $(errorId).classList.toggle("hidden", !hasError);
}

function setBoxMessage(id, text) {
    $(id).textContent = text;
    $(id).classList.toggle("hidden", !text);
}

function setFooterMessage(text, tone = "muted") {
    const el = $("new-job-message");
    el.className = `text-xs ${tone === "error" ? "text-status-overdue" : "text-muted"}`;
    el.innerHTML = text;
}

const DEFAULT_FOOTER = `<span class="text-status-overdue">*</span> Required fields`;

// ---------- dropdowns ----------
function fillCustomerSelect(selectedId = "") {
    const select = $("new-job-customer");
    select.innerHTML =
        `<option value="">Select customer...</option>` +
        customers
            .map((c) => `<option value="${c.customer_id}">${escapeHtml(c.full_name)} · ${escapeHtml(c.phone_number)}</option>`)
            .join("") +
        `<option value="${NEW_CUSTOMER}">+ New customer</option>`;
    select.value = selectedId;
}

function fillVehicleSelect(selectedId = "") {
    const select = $("new-job-vehicle");
    const help = $("new-job-vehicle-help").lastElementChild;
    const customerId = $("new-job-customer").value;
    const hasCustomer = customerId && customerId !== NEW_CUSTOMER;

    select.disabled = !hasCustomer;

    if (!hasCustomer) {
        select.innerHTML = `<option value="">Select a customer first</option>`;
        help.textContent = "Pick a customer to see their vehicles";
        return;
    }

    const name = customers.find((c) => c.customer_id === customerId)?.full_name ?? "Customer";
    select.innerHTML =
        `<option value="">${vehicles.length ? "Select vehicle..." : "No saved vehicles"}</option>` +
        vehicles.map((v) => `<option value="${v.vehicle_id}">${escapeHtml(vehicleLabel(v))}</option>`).join("") +
        `<option value="${NEW_VEHICLE}">+ New vehicle</option>`;
    select.value = selectedId;
    help.textContent = vehicles.length
        ? `${name}'s saved vehicles (${vehicles.length})`
        : `${name} has no vehicles yet, add one below`;
}

// ---------- loading from supabase ----------
async function loadCustomers() {
    const { data, error } = await supabase
        .from("customers")
        .select("customer_id, full_name, phone_number")
        .order("full_name");

    if (error) {
        console.error("Could not load customers:", error);
        return false;
    }
    customers = data;
    return true;
}

async function loadVehicles(customerId) {
    const { data, error } = await supabase
        .from("vehicles")
        .select("vehicle_id, make, model, year, plate_number")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Could not load vehicles:", error);
        return false;
    }
    vehicles = data;
    return true;
}

// ---------- quick add boxes ----------
function toggleCustomerBox(show) {
    $("new-customer-box").classList.toggle("hidden", !show);
    setBoxMessage("new-customer-message", "");
    if (show) {
        $("new-customer-name").focus();
    } else {
        $("new-customer-name").value = "";
        $("new-customer-phone").value = "";
        $("new-customer-name").setAttribute("aria-invalid", "false");
        $("new-customer-phone").setAttribute("aria-invalid", "false");
    }
}

function toggleVehicleBox(show) {
    $("new-vehicle-box").classList.toggle("hidden", !show);
    setBoxMessage("new-vehicle-message", "");
    if (show) {
        $("new-vehicle-make").focus();
    } else {
        ["new-vehicle-make", "new-vehicle-model", "new-vehicle-year", "new-vehicle-plate"].forEach((id) => {
            $(id).value = "";
            $(id).setAttribute("aria-invalid", "false");
        });
    }
}

async function saveNewCustomer() {
    const name = $("new-customer-name").value.trim();
    const phone = $("new-customer-phone").value.trim();

    const nameBad = !name;
    const phoneBad = !PHONE_PATTERN.test(phone);
    $("new-customer-name").setAttribute("aria-invalid", String(nameBad));
    $("new-customer-phone").setAttribute("aria-invalid", String(phoneBad));
    if (nameBad || phoneBad) {
        setBoxMessage("new-customer-message", nameBad
            ? "Enter the customer's name."
            : "Phone can only use digits, spaces, + and - (7 to 20 characters).");
        return;
    }

    const btn = $("new-customer-save");
    btn.disabled = true;
    btn.textContent = "Adding...";

    const { data, error } = await supabase
        .from("customers")
        .insert({ full_name: name, phone_number: phone, created_by: options.userId })
        .select("customer_id, full_name, phone_number")
        .single();

    btn.disabled = false;
    btn.textContent = "Add customer";

    if (error) {
        console.error("Could not add customer:", error);
        setBoxMessage("new-customer-message", "Couldn't add the customer. Please try again.");
        return;
    }

    // add to the list (kept in name order), select them and go straight to adding their first vehicle
    customers.push(data);
    customers.sort((a, b) => a.full_name.localeCompare(b.full_name));
    fillCustomerSelect(data.customer_id);
    setFieldError("new-job-customer", "new-job-customer-error", false);
    toggleCustomerBox(false);

    vehicles = [];
    fillVehicleSelect(NEW_VEHICLE);
    toggleVehicleBox(true);
}

async function saveNewVehicle() {
    const customerId = $("new-job-customer").value;
    const make = $("new-vehicle-make").value.trim();
    const model = $("new-vehicle-model").value.trim();
    const yearText = $("new-vehicle-year").value.trim();
    const year = Number(yearText);
    const plate = $("new-vehicle-plate").value.trim().toUpperCase();

    const bad = {
        "new-vehicle-make": !make,
        "new-vehicle-model": !model,
        "new-vehicle-year": !yearText || !Number.isInteger(year) || year < 1900 || year > 2100,
        "new-vehicle-plate": !plate,
    };
    Object.entries(bad).forEach(([id, isBad]) => $(id).setAttribute("aria-invalid", String(isBad)));
    if (Object.values(bad).some(Boolean)) {
        setBoxMessage("new-vehicle-message", bad["new-vehicle-year"] && yearText
            ? "Year must be between 1900 and 2100."
            : "Fill in make, model, year and plate.");
        return;
    }

    const btn = $("new-vehicle-save");
    btn.disabled = true;
    btn.textContent = "Adding...";

    const { data, error } = await supabase
        .from("vehicles")
        .insert({ customer_id: customerId, make, model, year, plate_number: plate })
        .select("vehicle_id, make, model, year, plate_number")
        .single();

    btn.disabled = false;
    btn.textContent = "Add vehicle";

    if (error) {
        console.error("Could not add vehicle:", error);
        // 23505 = unique violation, the plate is already registered
        setBoxMessage("new-vehicle-message", error.code === "23505"
            ? `Plate ${plate} is already registered to a vehicle.`
            : "Couldn't add the vehicle. Please try again.");
        if (error.code === "23505") $("new-vehicle-plate").setAttribute("aria-invalid", "true");
        return;
    }

    vehicles.unshift(data);
    fillVehicleSelect(data.vehicle_id);
    setFieldError("new-job-vehicle", "new-job-vehicle-error", false);
    toggleVehicleBox(false);
}

// ---------- dropdown changes ----------
async function onCustomerChange() {
    const value = $("new-job-customer").value;
    setFieldError("new-job-customer", "new-job-customer-error", false);
    setFieldError("new-job-vehicle", "new-job-vehicle-error", false); // the vehicle list is about to change
    toggleVehicleBox(false);
    vehicles = [];

    if (value === NEW_CUSTOMER) {
        fillVehicleSelect();
        toggleCustomerBox(true);
        return;
    }
    toggleCustomerBox(false);

    if (!value) {
        fillVehicleSelect();
        return;
    }

    const select = $("new-job-vehicle");
    select.disabled = true;
    select.innerHTML = `<option>Loading vehicles...</option>`;

    const ok = await loadVehicles(value);
    // the user may have picked a different customer while this was loading
    if ($("new-job-customer").value !== value) return;

    if (!ok) {
        select.innerHTML = `<option value="">Couldn't load vehicles</option>`;
        return;
    }

    // one vehicle: pick it for them; none: open the add vehicle box
    if (vehicles.length === 1) {
        fillVehicleSelect(vehicles[0].vehicle_id);
    } else if (vehicles.length === 0) {
        fillVehicleSelect(NEW_VEHICLE);
        toggleVehicleBox(true);
    } else {
        fillVehicleSelect();
    }
}

function onVehicleChange() {
    setFieldError("new-job-vehicle", "new-job-vehicle-error", false);
    toggleVehicleBox($("new-job-vehicle").value === NEW_VEHICLE);
}

// ---------- validation and saving ----------
function validate() {
    const customerId = $("new-job-customer").value;
    const vehicleId = $("new-job-vehicle").value;
    const problem = $("new-job-problem").value.trim();
    const expected = $("new-job-expected").value;

    const errors = {
        customer: !customerId || customerId === NEW_CUSTOMER,
        vehicle: !vehicleId || vehicleId === NEW_VEHICLE,
        problem: !problem,
        expected: Boolean(expected) && expected < todayIso(),
    };

    setFieldError("new-job-customer", "new-job-customer-error", errors.customer);
    setFieldError("new-job-vehicle", "new-job-vehicle-error", errors.vehicle);
    setFieldError("new-job-problem", "new-job-problem-error", errors.problem);
    setFieldError("new-job-expected", "new-job-expected-error", errors.expected);

    // focus the first field with a problem
    const firstBad = [
        ["customer", "new-job-customer"],
        ["vehicle", "new-job-vehicle"],
        ["problem", "new-job-problem"],
        ["expected", "new-job-expected"],
    ].find(([key]) => errors[key]);
    if (firstBad) $(firstBad[1]).focus();

    return !firstBad;
}

async function save(e) {
    e.preventDefault();
    if (isSaving || !validate()) return;

    isSaving = true;
    const btn = $("new-job-save");
    btn.disabled = true;
    btn.querySelector("[data-btn-label]").textContent = "Saving...";
    setFooterMessage(DEFAULT_FOOTER);

    // status and registered_at use the database defaults (not_started, now())
    const { data, error } = await supabase
        .from("jobs")
        .insert({
            customer_id: $("new-job-customer").value,
            vehicle_id: $("new-job-vehicle").value,
            problem_description: $("new-job-problem").value.trim(),
            expected_completion_date: $("new-job-expected").value || null,
            customer_supplied_parts: $("new-job-customer-parts").checked,
            created_by: options.userId,
        })
        .select("job_id")
        .single();

    isSaving = false;
    btn.disabled = false;
    btn.querySelector("[data-btn-label]").textContent = "Save job";

    if (error) {
        console.error("Could not create job:", error);
        setFooterMessage("Couldn't save the job. Please try again.", "error");
        return;
    }

    hide();
    showToast("Job created", "Added to the active jobs list as Not Started");
    options.onCreated(data.job_id);
}

// ---------- success message ----------

// small message in the bottom right that slides in, then hides itself after a few seconds
let toastTimer = null;
function showToast(title, subtitle) {
    const toast = $("new-job-toast");
    toast.querySelector("[data-toast-title]").textContent = title;
    toast.querySelector("[data-toast-subtitle]").textContent = subtitle;
    toast.classList.remove("translate-y-24", "opacity-0");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("translate-y-24", "opacity-0"), 3500);
}

const toastShell = () => `
    <div id="new-job-toast" role="status"
        class="fixed bottom-6 right-6 z-50 translate-y-24 opacity-0 pointer-events-none transition duration-300">
        <div class="bg-surface border border-accent/40 rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3">
            <span class="size-7 rounded-full bg-accent/20 text-accent flex items-center justify-center">${icon("checkCircle", "size-5")}</span>
            <div>
                <p data-toast-title class="text-xs font-bold text-ink"></p>
                <p data-toast-subtitle class="text-[11px] text-accent"></p>
            </div>
        </div>
    </div>`;

// ---------- open / close ----------

// true if the user has typed or picked anything
function hasChanges() {
    // a customer filled in by openNewJobModal({ customerId }) doesn't count as the user's change
    if ($("new-job-customer").value !== prefilledCustomer) return true;
    const ids = [
        "new-job-problem", "new-job-expected",
        "new-customer-name", "new-customer-phone",
        "new-vehicle-make", "new-vehicle-model", "new-vehicle-year", "new-vehicle-plate",
    ];
    return ids.some((id) => $(id).value.trim() !== "") || $("new-job-customer-parts").checked;
}

function resetForm() {
    $("new-job-form").reset();
    vehicles = [];
    toggleCustomerBox(false);
    toggleVehicleBox(false);
    ["new-job-customer", "new-job-vehicle", "new-job-problem", "new-job-expected"].forEach((id) =>
        setFieldError(id, `${id}-error`, false),
    );
    setFooterMessage(DEFAULT_FOOTER);
    $("new-job-expected").min = todayIso();
    $("new-job-registered").textContent = `Registration: ${formatDateTime(Date.now())}`;
}

function show() {
    modal().classList.remove("hidden");
    document.body.classList.add("overflow-hidden");
    // next frame so the fade-in transition actually runs
    requestAnimationFrame(() => {
        modal().querySelector("[data-modal-backdrop]").classList.replace("opacity-0", "opacity-100");
        $("new-job-form").classList.remove("opacity-0", "scale-95");
    });
    isOpen = true;
}

function hide() {
    modal().querySelector("[data-modal-backdrop]").classList.replace("opacity-100", "opacity-0");
    $("new-job-form").classList.add("opacity-0", "scale-95");
    document.body.classList.remove("overflow-hidden");
    isOpen = false;
    setTimeout(() => {
        if (!isOpen) modal().classList.add("hidden");
    }, 200);
    lastFocused?.focus?.();
}

// customerId / vehicleId are optional and pick that customer (and vehicle) for the user,
// e.g. openNewJobModal({ customerId }) from the customer profile page
// (when used straight as a click handler the click event is passed in, which has neither, so nothing is picked)
export async function openNewJobModal({ customerId = "", vehicleId = "" } = {}) {
    if (isOpen) return;
    lastFocused = document.activeElement;

    prefilledCustomer = "";
    resetForm();
    $("new-job-customer").innerHTML = `<option value="">Loading customers...</option>`;
    fillVehicleSelect();
    show();

    // reload every time so customers added elsewhere show up
    if (!(await loadCustomers())) {
        $("new-job-customer").innerHTML = `<option value="">Couldn't load customers</option>`;
        setFooterMessage("Couldn't load customers. Close and try again.", "error");
        return;
    }
    fillCustomerSelect();

    if (customerId && customers.some((c) => c.customer_id === customerId)) {
        prefilledCustomer = customerId;
        fillCustomerSelect(customerId);
        await onCustomerChange();
        if (vehicleId && vehicles.some((v) => v.vehicle_id === vehicleId)) fillVehicleSelect(vehicleId);
        $("new-job-problem").focus();
        return;
    }
    $("new-job-customer").focus();
}

export async function closeNewJobModal() {
    if (!isOpen || isSaving) return;
    if (hasChanges()) {
        const discard = await confirmDialog({
            title: "Discard this new job?",
            message: "The details you've entered will be lost.",
            confirmLabel: "Discard",
            cancelLabel: "Keep editing",
        });
        if (!discard || !isOpen) return;
    }
    hide();
}

// ---------- setup ----------
export function initNewJobModal({ userId, onCreated = () => {} } = {}) {
    options = { userId, onCreated };
    document.body.insertAdjacentHTML("beforeend", modalShell() + toastShell());

    const root = modal();

    root.addEventListener("click", (e) => {
        if (e.target.closest("[data-modal-close]") || e.target.matches("[data-modal-backdrop]")) {
            closeNewJobModal();
            return;
        }
        if (e.target.closest("[data-cancel-customer]")) {
            toggleCustomerBox(false);
            fillCustomerSelect();
            fillVehicleSelect();
            $("new-job-customer").focus();
        }
        if (e.target.closest("[data-cancel-vehicle]")) {
            toggleVehicleBox(false);
            fillVehicleSelect();
            $("new-job-vehicle").focus();
        }
    });

    $("new-job-customer").addEventListener("change", onCustomerChange);
    $("new-job-vehicle").addEventListener("change", onVehicleChange);
    $("new-customer-save").addEventListener("click", saveNewCustomer);
    $("new-vehicle-save").addEventListener("click", saveNewVehicle);

    // pressing enter inside a quick add box saves that box, not the whole job
    $("new-customer-box").addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); saveNewCustomer(); }
    });
    $("new-vehicle-box").addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); saveNewVehicle(); }
    });

    // clear a field's error as soon as the user fixes it
    $("new-job-problem").addEventListener("input", () => {
        if ($("new-job-problem").value.trim()) setFieldError("new-job-problem", "new-job-problem-error", false);
    });
    $("new-job-expected").addEventListener("change", () =>
        setFieldError("new-job-expected", "new-job-expected-error", false),
    );

    $("new-job-form").addEventListener("submit", save);

    // escape closes the modal
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && isOpen) closeNewJobModal();

        // ctrl+s (cmd+s on a mac) saves the job, same as the save job button
        if (isOpen && matchesShortcut(e, "s")) {
            e.preventDefault(); // stops the browser's "save page" window
            if (!isSaving && !isConfirmOpen()) $("new-job-form").requestSubmit();
        }
    });

    // warn before leaving the page with a half-filled job
    window.addEventListener("beforeunload", (e) => {
        if (isOpen && hasChanges()) e.preventDefault();
    });
}
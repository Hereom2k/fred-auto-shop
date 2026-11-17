
import { supabase } from "../lib/supabase.js";
import { initPage } from "../shared/page.js";

// =========================================================
// HELPERS
// =========================================================

const $ = (id) => document.getElementById(id);

const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);

const icon = (name) => `
    <span class="material-symbols-outlined" aria-hidden="true">
        ${name}
    </span>
`;

const statusLabel = (status) => ({
    not_started: "Not Started",
    in_progress: "In Progress",
    awaiting_parts: "Awaiting Parts",
    overdue: "Overdue",
    ready_for_pickup: "Ready for Pickup",
    delivered: "Delivered",
    scheduled: "Scheduled",
    completed: "Completed",
    rescheduled: "Rescheduled",
    cancelled: "Cancelled",
    missed: "Missed"
})[status] || status || "Unknown";

const dateKey = (value) => {
    const date = new Date(value);

    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
};

const today = () => dateKey(new Date());

const formatTime = (value) =>
    new Date(value).toLocaleTimeString("en-GY", {
        hour: "2-digit",
        minute: "2-digit"
    });

const relativeTime = (value) => {
    if (!value) return "—";

    const seconds = Math.max(
        0,
        (Date.now() - new Date(value).getTime()) / 1000
    );

    if (seconds < 60) return "Just now";
    if (seconds < 3600) {
        return `${Math.floor(seconds / 60)} mins ago`;
    }
    if (seconds < 86400) {
        return `${Math.floor(seconds / 3600)} hours ago`;
    }

    return `${Math.floor(seconds / 86400)} days ago`;
};

const vehicleName = (vehicle) =>
    vehicle
        ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
        : "Vehicle pending";

const pill = (status) => `
    <span class="pill ${escapeHtml(status)}">
        ${escapeHtml(statusLabel(status))}
    </span>
`;

const emptyState = (message) => `
    <div class="empty-state">
        ${escapeHtml(message)}
    </div>
`;

// =========================================================
// STATE
// =========================================================

let profile = null;

let jobs = [];
let appointments = [];
let customers = [];
let vehicles = [];

let searchTerm = "";
let appointmentFilter = "all";
let modalType = "";

const modal = $("staff-modal");

// =========================================================
// NOTIFICATIONS
// =========================================================

function notify(message) {
    const toast = $("staff-toast");

    toast.textContent = message;
    toast.classList.add("visible");

    clearTimeout(notify.timer);

    notify.timer = setTimeout(() => {
        toast.classList.remove("visible");
    }, 3500);
}

function showError(error) {
    console.error("Staff dashboard error:", error);

    $("staff-error").textContent =
        error.message || String(error);

    $("staff-error").classList.remove("hidden");
}

// =========================================================
// SUPABASE DATA
// =========================================================

async function query(table, columns) {
    const { data, error } = await supabase
        .from(table)
        .select(columns);

    if (error) throw error;

    return data || [];
}

async function refresh() {
    $("staff-error").classList.add("hidden");

    try {
        const results = await Promise.all([
            query(
                "jobs",
                `job_id,
                 customer_id,
                 vehicle_id,
                 problem_description,
                 status,
                 registered_at,
                 updated_at,
                 expected_completion_date,
                 customers(full_name),
                 vehicles(make, model, year, plate_number)`
            ),

            query(
                "appointments",
                `appointment_id,
                 customer_id,
                 vehicle_id,
                 service_requested,
                 contact_number,
                 appointment_datetime,
                 status,
                 customers(full_name),
                 vehicles(make, model, year, plate_number)`
            ),

            query(
                "customers",
                "customer_id, full_name, phone_number"
            ),

            query(
                "vehicles",
                "vehicle_id, customer_id, make, model, year, plate_number"
            )
        ]);

        [jobs, appointments, customers, vehicles] = results;

        render();
    } catch (error) {
        showError(error);
        notify("Unable to load dashboard data.");
    }
}

// =========================================================
// FILTERING
// =========================================================

function isOverdue(job) {
    if (job.status === "overdue") return true;

    const finished = [
        "delivered",
        "ready_for_pickup"
    ];

    if (finished.includes(job.status)) return false;

    return Boolean(
        job.expected_completion_date &&
        job.expected_completion_date < today()
    );
}

function matchesSearch(row) {
    const searchable = [
        row.customers?.full_name,
        row.vehicles?.plate_number,
        row.problem_description,
        row.service_requested,
        vehicleName(row.vehicles)
    ].join(" ").toLowerCase();

    return searchable.includes(searchTerm);
}

// =========================================================
// SUMMARY CARDS
// =========================================================

function renderSummary() {
    const active = jobs.filter(
        (job) => ![
            "delivered",
            "ready_for_pickup"
        ].includes(job.status)
    );

    const overdue = jobs.filter(isOverdue);

    const todaysAppointments = appointments.filter(
        (appointment) =>
            dateKey(appointment.appointment_datetime) === today()
    );

    $("staff-active-count").textContent = active.length;
    $("staff-overdue-count").textContent = overdue.length;
    $("staff-appointment-count").textContent =
        todaysAppointments.length;

    const next = todaysAppointments
        .filter((appointment) =>
            new Date(appointment.appointment_datetime) > new Date() &&
            !["completed", "cancelled", "missed"].includes(
                appointment.status
            )
        )
        .sort(
            (a, b) =>
                new Date(a.appointment_datetime) -
                new Date(b.appointment_datetime)
        )[0];

    $("staff-next-appointment").textContent = next
        ? `Next at ${formatTime(next.appointment_datetime)}`
        : "No upcoming appointments";
}

// =========================================================
// TODAY'S APPOINTMENTS
// =========================================================

function renderAppointments() {
    let records = appointments
        .filter(
            (appointment) =>
                dateKey(appointment.appointment_datetime) === today()
        )
        .filter(matchesSearch)
        .sort(
            (a, b) =>
                new Date(a.appointment_datetime) -
                new Date(b.appointment_datetime)
        );

    if (appointmentFilter === "pending") {
        records = records.filter(
            (appointment) =>
                !["completed", "cancelled", "missed"].includes(
                    appointment.status
                )
        );
    }

    if (appointmentFilter === "done") {
        records = records.filter(
            (appointment) => appointment.status === "completed"
        );
    }

    $("staff-appointment-badge").textContent =
        `${records.length} visible`;

    $("staff-appointments").innerHTML = records.length
        ? records.map((appointment) => `
            <div class="record-row">

                <div class="record-main">
                    <div class="time-box">
                        ${escapeHtml(
                            formatTime(appointment.appointment_datetime)
                        )}
                    </div>

                    <div class="record-content">
                        <strong>
                            ${escapeHtml(
                                appointment.customers?.full_name ||
                                "Unknown Customer"
                            )}
                        </strong>

                        <div class="record-sub">
                            ${escapeHtml(appointment.service_requested)}
                        </div>

                        <div class="record-sub">
                            ${escapeHtml(vehicleName(appointment.vehicles))}

                            ${appointment.vehicles?.plate_number
                                ? `<span class="plate">
                                       ${escapeHtml(
                                           appointment.vehicles.plate_number
                                       )}
                                   </span>`
                                : ""}
                        </div>

                        ${pill(appointment.status)}
                    </div>
                </div>

                <button
                    type="button"
                    class="row-action"
                    data-details="appointment"
                    data-id="${escapeHtml(appointment.appointment_id)}"
                    aria-label="View appointment details"
                >
                    ${icon("chevron_right")}
                </button>

            </div>
        `).join("")
        : emptyState("No matching appointments for today.");
}

// =========================================================
// NEEDS ATTENTION
// =========================================================

function renderAttention() {
    const attention = jobs
        .filter(
            (job) =>
                isOverdue(job) ||
                job.status === "ready_for_pickup"
        )
        .filter(matchesSearch);

    $("staff-attention-count").textContent =
        `${attention.length} alerts`;

    $("staff-attention").innerHTML = attention.length
        ? attention.map((job) => `
            <div class="record-row">

                <div class="record-main">
                    <div class="icon-tile">
                        ${icon(
                            isOverdue(job) ? "warning" : "key"
                        )}
                    </div>

                    <div class="record-content">
                        <strong>
                            ${escapeHtml(
                                job.customers?.full_name ||
                                "Unknown Customer"
                            )}
                        </strong>

                        <div class="record-sub">
                            ${escapeHtml(job.problem_description)}
                        </div>

                        <div class="record-sub">
                            ${escapeHtml(vehicleName(job.vehicles))}

                            ${job.vehicles?.plate_number
                                ? `<span class="plate">
                                       ${escapeHtml(
                                           job.vehicles.plate_number
                                       )}
                                   </span>`
                                : ""}
                        </div>

                        ${pill(isOverdue(job) ? "overdue" : job.status)}
                    </div>
                </div>

                <div class="record-actions">
                    ${job.status === "ready_for_pickup"
                        ? `<button
                               type="button"
                               class="primary-action"
                               data-deliver="${escapeHtml(job.job_id)}"
                           >
                               Mark Delivered
                           </button>`
                        : ""}

                    <button
                        type="button"
                        class="row-action"
                        data-details="job"
                        data-id="${escapeHtml(job.job_id)}"
                        aria-label="View job details"
                    >
                        ${icon("chevron_right")}
                    </button>
                </div>

            </div>
        `).join("")
        : emptyState("Nothing needs attention.");
}

// =========================================================
// RECENT JOBS
// =========================================================

function renderRecentJobs() {
    const recent = [...jobs]
        .filter(matchesSearch)
        .sort(
            (a, b) =>
                new Date(b.updated_at) -
                new Date(a.updated_at)
        )
        .slice(0, 8);

    $("staff-recent-jobs").innerHTML = recent.length
        ? recent.map((job) => `
            <tr
                data-details="job"
                data-id="${escapeHtml(job.job_id)}"
                tabindex="0"
                role="button"
                aria-label="View job details"
            >
                <td>
                    ${escapeHtml(job.problem_description)}
                </td>

                <td>
                    <strong>
                        ${escapeHtml(
                            job.customers?.full_name ||
                            "Unknown Customer"
                        )}
                    </strong>

                    <small>
                        ${escapeHtml(vehicleName(job.vehicles))}

                        ${job.vehicles?.plate_number
                            ? ` · ${escapeHtml(
                                job.vehicles.plate_number
                            )}`
                            : ""}
                    </small>
                </td>

                <td>${pill(job.status)}</td>

                <td>
                    ${escapeHtml(relativeTime(job.updated_at))}
                </td>

                <td>
                    ${icon("chevron_right")}
                </td>
            </tr>
        `).join("")
        : `<tr>
               <td colspan="5">No matching jobs.</td>
           </tr>`;
}

// =========================================================
// RENDER DASHBOARD
// =========================================================

function render() {
    renderSummary();
    renderAppointments();
    renderAttention();
    renderRecentJobs();
}

// =========================================================
// MODAL FORM HELPERS
// =========================================================

function option(value, text) {
    return `
        <option value="${escapeHtml(value)}">
            ${escapeHtml(text)}
        </option>
    `;
}

function field(
    title,
    name,
    type = "text",
    required = true,
    symbol = "edit",
    placeholder = ""
) {
    return `
        <label class="db-form-field">
            <span class="db-field-label">
                ${icon(symbol)}
                ${escapeHtml(title)}
                ${required ? "<em>*</em>" : ""}
            </span>

            <input
                name="${name}"
                type="${type}"
                ${required ? "required" : ""}
                placeholder="${escapeHtml(placeholder)}"
            />
        </label>
    `;
}

function selectField(
    title,
    name,
    options,
    required = true,
    symbol = "list"
) {
    return `
        <label class="db-form-field">
            <span class="db-field-label">
                ${icon(symbol)}
                ${escapeHtml(title)}
                ${required ? "<em>*</em>" : ""}
            </span>

            <select name="${name}" ${required ? "required" : ""}>
                ${options}
            </select>
        </label>
    `;
}

function customerOptions() {
    return '<option value="">Select customer</option>' +
        customers.map((customer) =>
            option(customer.customer_id, customer.full_name)
        ).join("");
}

function vehicleOptions(customerId, optional = false) {
    const firstOption = optional
        ? '<option value="">Vehicle pending / not specified</option>'
        : '<option value="">Select vehicle</option>';

    return firstOption + vehicles
        .filter(
            (vehicle) =>
                String(vehicle.customer_id) === String(customerId)
        )
        .map((vehicle) =>
            option(
                vehicle.vehicle_id,
                `${vehicleName(vehicle)} (${vehicle.plate_number})`
            )
        ).join("");
}

const modalConfigs = {
    job: {
        title: "NEW JOB",
        symbol: "add_circle",
        subtitle: "Register a new vehicle service job",
        save: "Save Job"
    },

    appointment: {
        title: "NEW APPOINTMENT",
        symbol: "event",
        subtitle: "Schedule a customer visit",
        save: "Save Appointment"
    },

    customer: {
        title: "ADD CUSTOMER",
        symbol: "person_add",
        subtitle: "Create a new customer record",
        save: "Save Customer"
    }
};

// =========================================================
// OPEN MODAL
// =========================================================

function openModal(type) {
    const config = modalConfigs[type];

    if (!config) return;

    if (type !== "customer" && !customers.length) {
        notify("Add a customer before creating a job or appointment.");
        return;
    }

    modalType = type;

    const form = $("staff-modal-form");
    form.reset();

    $("staff-modal-title").innerHTML = `
        ${icon(config.symbol)}
        <span>${config.title}</span>
    `;

    $("staff-modal-save").classList.remove("hidden");
    $("staff-modal-save").disabled = false;
    $("staff-modal-save").textContent = config.save;

    let html = `
        <p class="db-modal-subtitle">
            ${escapeHtml(config.subtitle)}
        </p>
    `;

    // -----------------------------------------------------
    // ADD CUSTOMER
    // -----------------------------------------------------

    if (type === "customer") {
        html += `
            ${field(
                "Full Name",
                "full_name",
                "text",
                true,
                "person",
                "Enter customer name"
            )}

            ${field(
                "Phone Number",
                "phone_number",
                "tel",
                true,
                "call",
                "e.g. +592 600 1234"
            )}

            ${field(
                "Email Address",
                "email",
                "email",
                false,
                "mail",
                "customer@example.com"
            )}

            ${field(
                "Address",
                "address",
                "text",
                false,
                "location_on",
                "Enter customer address"
            )}
        `;
    }

    // -----------------------------------------------------
    // NEW JOB
    // -----------------------------------------------------

    if (type === "job") {
        html += `
            <div class="db-modal-status">
                ${icon("info")}
                Initial status:
                <strong>Not Started</strong>
            </div>

            ${selectField(
                "Customer",
                "customer_id",
                customerOptions(),
                true,
                "person"
            )}

            ${selectField(
                "Vehicle",
                "vehicle_id",
                '<option value="">Select a customer first</option>',
                true,
                "directions_car"
            )}

            <label class="db-form-field">
                <span class="db-field-label">
                    ${icon("description")}
                    Problem Description
                    <em>*</em>
                </span>

                <textarea
                    name="problem_description"
                    rows="3"
                    required
                    placeholder="Describe customer reported issues, symptoms, or diagnostic requirements..."
                ></textarea>
            </label>

            ${field(
                "Expected Completion Date",
                "expected_completion_date",
                "date",
                false,
                "calendar_today"
            )}

            <label class="db-check-field">
                <span>
                    ${icon("inventory_2")}
                    Customer Supplied Parts
                </span>

                <input
                    type="checkbox"
                    name="customer_supplied_parts"
                />
            </label>
        `;
    }

    // -----------------------------------------------------
    // NEW APPOINTMENT
    // -----------------------------------------------------

    if (type === "appointment") {
        html += `
            ${selectField(
                "Customer",
                "customer_id",
                customerOptions(),
                true,
                "person"
            )}

            ${selectField(
                "Vehicle (Optional)",
                "vehicle_id",
                '<option value="">Select a customer first</option>',
                false,
                "directions_car"
            )}

            ${field(
                "Contact Number",
                "contact_number",
                "tel",
                true,
                "call",
                "Customer contact number"
            )}

            ${field(
                "Service Requested",
                "service_requested",
                "text",
                true,
                "build",
                "Describe the service needed"
            )}

            ${field(
                "Appointment Date and Time",
                "appointment_datetime",
                "datetime-local",
                true,
                "event"
            )}
        `;
    }

    $("staff-modal-fields").innerHTML = html;

    // -----------------------------------------------------
    // CUSTOMER AND VEHICLE SELECTION
    // -----------------------------------------------------

    const customerSelect =
        form.elements.namedItem("customer_id");

    if (customerSelect) {
        customerSelect.addEventListener("change", () => {
            const vehicleSelect =
                form.elements.namedItem("vehicle_id");

            vehicleSelect.innerHTML = vehicleOptions(
                customerSelect.value,
                type === "appointment"
            );

            if (type === "appointment") {
                const customer = customers.find(
                    (item) =>
                        String(item.customer_id) ===
                        String(customerSelect.value)
                );

                form.elements.namedItem("contact_number").value =
                    customer?.phone_number || "";
            }
        });
    }

    // -----------------------------------------------------
    // DATE RESTRICTIONS
    // -----------------------------------------------------

    if (type === "appointment") {
        const input =
            form.elements.namedItem("appointment_datetime");

        const now = new Date();

        const local = new Date(
            now.getTime() -
            now.getTimezoneOffset() * 60000
        );

        input.min = local.toISOString().slice(0, 16);
    }

    modal.showModal();
}

// =========================================================
// DETAILS MODAL
// =========================================================

function showDetails(type, id) {
    const item = type === "job"
        ? jobs.find(
            (job) => String(job.job_id) === String(id)
        )
        : appointments.find(
            (appointment) =>
                String(appointment.appointment_id) === String(id)
        );

    if (!item) return;

    modalType = "details";

    $("staff-modal-title").innerHTML = `
        ${icon(type === "job" ? "build" : "event")}
        <span>
            ${type === "job" ? "JOB DETAILS" : "APPOINTMENT DETAILS"}
        </span>
    `;

    $("staff-modal-fields").innerHTML = `
        <div class="db-modal-status">
            ${icon("info")}
            Current status:
            <strong>
                ${escapeHtml(statusLabel(item.status))}
            </strong>
        </div>

        <div class="record-content">
            <strong>
                ${escapeHtml(
                    item.customers?.full_name ||
                    "Unknown Customer"
                )}
            </strong>

            <div class="record-sub">
                ${escapeHtml(vehicleName(item.vehicles))}

                ${item.vehicles?.plate_number
                    ? `<span class="plate">
                           ${escapeHtml(item.vehicles.plate_number)}
                       </span>`
                    : ""}
            </div>
        </div>

        <div class="db-modal-status">
            ${icon("description")}
            ${escapeHtml(
                item.problem_description ||
                item.service_requested
            )}
        </div>

        ${type === "appointment"
            ? `<div class="db-modal-status">
                   ${icon("schedule")}
                   ${escapeHtml(
                       new Date(
                           item.appointment_datetime
                       ).toLocaleString("en-GY")
                   )}
               </div>`
            : ""}

        ${pill(item.status)}
    `;

    $("staff-modal-save").classList.add("hidden");

    modal.showModal();
}

function closeModal() {
    modal.close();
}

// =========================================================
// SAVE TO SUPABASE
// =========================================================

async function saveModal(event) {
    event.preventDefault();

    if (modalType === "details") return;

    const type = modalType;
    const config = modalConfigs[type];

    if (!config) return;

    const button = $("staff-modal-save");
    const form = $("staff-modal-form");

    button.disabled = true;
    button.textContent = "Saving...";

    const values = Object.fromEntries(
        new FormData(form)
    );

    try {
        let table;
        let record;

        // -------------------------------------------------
        // ADD CUSTOMER
        // -------------------------------------------------

        if (type === "customer") {
            table = "customers";

            record = {
                full_name: values.full_name.trim(),
                phone_number: values.phone_number.trim(),
                email: values.email?.trim() || null,
                address: values.address?.trim() || null,
                created_by: profile.profile_id
            };
        }

        // -------------------------------------------------
        // NEW JOB
        // -------------------------------------------------

        if (type === "job") {
            table = "jobs";

            if (!values.vehicle_id) {
                throw new Error(
                    "Select a vehicle belonging to this customer."
                );
            }

            record = {
                customer_id: values.customer_id,
                vehicle_id: values.vehicle_id,
                problem_description:
                    values.problem_description.trim(),
                expected_completion_date:
                    values.expected_completion_date || null,
                customer_supplied_parts:
                    values.customer_supplied_parts === "on",
                created_by: profile.profile_id
            };
        }

        // -------------------------------------------------
        // NEW APPOINTMENT
        // -------------------------------------------------

        if (type === "appointment") {
            table = "appointments";

            const when = new Date(
                values.appointment_datetime
            );

            if (
                Number.isNaN(when.getTime()) ||
                when.getTime() <= Date.now()
            ) {
                throw new Error(
                    "Choose a valid future appointment time."
                );
            }

            record = {
                customer_id: values.customer_id,
                vehicle_id: values.vehicle_id || null,
                contact_number: values.contact_number.trim(),
                service_requested:
                    values.service_requested.trim(),
                appointment_datetime: when.toISOString(),
                created_by: profile.profile_id
            };
        }

        const { error } = await supabase
            .from(table)
            .insert(record);

        if (error) throw error;

        closeModal();

        notify(
            `${type === "customer"
                ? "Customer"
                : type === "job"
                    ? "Job"
                    : "Appointment"} created successfully.`
        );

        await refresh();
    } catch (error) {
        showError(error);

        notify(
            error.message || "Unable to save record."
        );
    } finally {
        button.disabled = false;
        button.textContent = config.save;
    }
}

// =========================================================
// MARK JOB AS DELIVERED
// =========================================================

async function markDelivered(jobId) {
    const confirmed = window.confirm(
        "Mark this job as delivered?"
    );

    if (!confirmed) return;

    const { error } = await supabase
        .from("jobs")
        .update({
            status: "delivered",
            delivered_at: new Date().toISOString()
        })
        .eq("job_id", jobId)
        .eq("status", "ready_for_pickup")
        .select("job_id");

    if (error) {
        showError(error);
        notify("Unable to update job.");
        return;
    }

    notify("Job delivery update submitted.");
    await refresh();
}

// =========================================================
// EVENT LISTENERS
// =========================================================

function setupEvents() {
    // Search
    $("staff-search").addEventListener("input", (event) => {
        searchTerm = event.target.value
            .trim()
            .toLowerCase();

        render();
    });

    // Ctrl + K search shortcut
    document.addEventListener("keydown", (event) => {
        if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === "k"
        ) {
            event.preventDefault();
            $("staff-search").focus();
        }
    });

    // Appointment filters
    document.querySelectorAll("[data-appt-filter]")
        .forEach((button) => {
            button.addEventListener("click", () => {
                appointmentFilter =
                    button.dataset.apptFilter;

                document.querySelectorAll("[data-appt-filter]")
                    .forEach((item) => {
                        item.classList.remove("active");
                    });

                button.classList.add("active");

                renderAppointments();
            });
        });

    // Quick action buttons
    document.querySelectorAll("[data-staff-open]")
        .forEach((button) => {
            button.addEventListener("click", () => {
                openModal(button.dataset.staffOpen);
            });
        });

    // Summary cards
    document.querySelectorAll("[data-staff-filter]")
        .forEach((button) => {
            button.addEventListener("click", () => {
                const filter = button.dataset.staffFilter;

                const target = filter === "appointments"
                    ? $("staff-appointments-section")
                    : filter === "overdue"
                        ? $("staff-attention-section")
                        : $("staff-jobs-section");

                target.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            });
        });

    // Appointment details
    $("staff-appointments").addEventListener("click", (event) => {
        const button = event.target.closest("[data-details]");

        if (!button) return;

        showDetails(
            button.dataset.details,
            button.dataset.id
        );
    });

    // Attention section actions
    $("staff-attention").addEventListener("click", (event) => {
        const deliverButton =
            event.target.closest("[data-deliver]");

        if (deliverButton) {
            markDelivered(deliverButton.dataset.deliver);
            return;
        }

        const detailsButton =
            event.target.closest("[data-details]");

        if (detailsButton) {
            showDetails(
                detailsButton.dataset.details,
                detailsButton.dataset.id
            );
        }
    });

    // Recent job details
    const recentJobs = $("staff-recent-jobs");

    recentJobs.addEventListener("click", (event) => {
        const row = event.target.closest("[data-details]");

        if (!row) return;

        showDetails(
            row.dataset.details,
            row.dataset.id
        );
    });

    recentJobs.addEventListener("keydown", (event) => {
        if (
            event.key !== "Enter" &&
            event.key !== " "
        ) return;

        const row = event.target.closest("[data-details]");

        if (!row) return;

        event.preventDefault();

        showDetails(
            row.dataset.details,
            row.dataset.id
        );
    });

    // Modal controls
    $("staff-modal-close").addEventListener(
        "click",
        closeModal
    );

    $("staff-modal-cancel").addEventListener(
        "click",
        closeModal
    );

    $("staff-modal-form").addEventListener(
        "submit",
        saveModal
    );

    modal.addEventListener("close", () => {
        $("staff-modal-save").classList.remove("hidden");
    });

    // Close modal when clicking its backdrop
    modal.addEventListener("click", (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });
}

// =========================================================
// INITIALIZE STAFF DASHBOARD
// =========================================================

async function main() {
    const context = await initPage({
        active: "dashboard"
    });

    if (!context) return;

    profile = context.profile;

    // Only staff and admin accounts can use this page.
    if (!["staff", "admin"].includes(profile.role)) {
        window.location.replace("/");
        return;
    }

    // Personalized greeting
    const hour = new Date().getHours();

    const greeting =
        hour < 12 ? "Good morning" :
        hour < 17 ? "Good afternoon" :
        "Good evening";

    const firstName = (
        profile.full_name || "there"
    ).trim().split(/\s+/)[0];

    $("staff-greeting").textContent =
        `${greeting}, ${firstName}`;

    // Current date
    $("staff-date").textContent =
        new Date().toLocaleDateString("en-GY", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric"
        });

    setupEvents();
    await refresh();
}

main();

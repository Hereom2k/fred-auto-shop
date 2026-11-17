
import { supabase } from '../lib/supabase.js';
import { initPage } from '../shared/page.js';

// Use the existing Supabase client.
const $ = (id) => document.getElementById(id);

const escapeHtml = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[c]);

const icon = (name) =>
    `<span class="material-symbols-outlined">${name}</span>`;

const label = (status) => ({
    not_started: 'Not Started',
    in_progress: 'In Progress',
    awaiting_parts: 'Awaiting Parts',
    overdue: 'Overdue',
    ready_for_pickup: 'Ready for Pickup',
    delivered: 'Delivered',
    scheduled: 'Scheduled',
    completed: 'Completed',
    rescheduled: 'Rescheduled',
    missed: 'Missed',
    cancelled: 'Cancelled'
})[status] || status;

const dateKey = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const today = () => dateKey(new Date());

const formatTime = (date) =>
    new Date(date).toLocaleTimeString('en-GY', {
        hour: '2-digit',
        minute: '2-digit'
    });

const relativeTime = (date) => {
    const secs = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);

    if (secs < 60) return 'Just now';
    if (secs < 3600) return `${Math.floor(secs / 60)} mins ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)} hours ago`;

    return `${Math.floor(secs / 86400)} days ago`;
};

const vehicleName = (v) =>
    v ? `${v.year} ${v.make} ${v.model}` : 'Vehicle pending';

const pill = (status) =>
    `<span class="pill ${escapeHtml(status)}">${escapeHtml(label(status))}</span>`;

let jobs = [];
let appointments = [];
let parts = [];
let customers = [];
let vehicles = [];
let filter = 'all';
let term = '';
let profile = null;

const modal = $('dashboard-modal');
let modalType = '';

function notify(message) {
    const toast = $('dashboard-toast');
    toast.textContent = message;
    toast.classList.add('visible');

    clearTimeout(notify.timer);

    notify.timer = setTimeout(() => {
        toast.classList.remove('visible');
    }, 3500);
}

function showError(error) {
    console.error('Dashboard Supabase error:', error);

    $('dashboard-error').textContent =
        `Some dashboard data could not load: ${error.message || error}`;

    $('dashboard-error').classList.remove('hidden');
}

async function query(table, fields, orderField) {
    let q = supabase.from(table).select(fields);

    if (orderField) {
        q = q.order(orderField, { ascending: false });
    }

    const { data, error } = await q;

    if (error) throw error;

    return data || [];
}

async function refresh() {
    $('dashboard-error').classList.add('hidden');

    const requests = [
        [
            'jobs',
            () => query(
                'jobs',
                'job_id,customer_id,vehicle_id,problem_description,status,registered_at,updated_at,expected_completion_date,delivered_at,customers(full_name),vehicles(make,model,year,plate_number)',
                'registered_at'
            )
        ],
        [
            'appointments',
            () => query(
                'appointments',
                'appointment_id,customer_id,vehicle_id,service_requested,appointment_datetime,status,customers(full_name),vehicles(make,model,year,plate_number)',
                'appointment_datetime'
            )
        ],
        [
            'parts',
            () => query(
                'v_restock_alerts',
                'part_id,part_name,alert_threshold,alert_period_days,used_in_period'
            )
        ],
        [
            'customers',
            () => query(
                'customers',
                'customer_id,full_name,phone_number',
                'full_name'
            )
        ],
        [
            'vehicles',
            () => query(
                'vehicles',
                'vehicle_id,customer_id,make,model,year,plate_number'
            )
        ]
    ];

    await Promise.all(
        requests.map(async ([name, fn]) => {
            try {
                const data = await fn();

                if (name === 'jobs') jobs = data;
                if (name === 'appointments') appointments = data;
                if (name === 'parts') parts = data;
                if (name === 'customers') customers = data;
                if (name === 'vehicles') vehicles = data;
            } catch (error) {
                showError(error);

                if (name === 'jobs') jobs = [];
                if (name === 'appointments') appointments = [];
                if (name === 'parts') parts = [];
                if (name === 'customers') customers = [];
                if (name === 'vehicles') vehicles = [];
            }
        })
    );

    render();
}

function matching(row) {
    const customer = row.customers?.full_name || '';
    const vehicle = row.vehicles;

    return `
        ${customer}
        ${row.problem_description || row.service_requested || ''}
        ${vehicleName(vehicle)}
        ${vehicle?.plate_number || ''}
    `.toLowerCase().includes(term);
}

function render() {
    const todays = appointments
        .filter((a) => dateKey(a.appointment_datetime) === today())
        .sort(
            (a, b) =>
                new Date(a.appointment_datetime) -
                new Date(b.appointment_datetime)
        );

    const active = jobs.filter((j) => j.status !== 'delivered');

    const overdue = jobs.filter(
        (j) =>
            j.status === 'overdue' ||
            (
                j.status !== 'delivered' &&
                j.status !== 'ready_for_pickup' &&
                j.expected_completion_date &&
                j.expected_completion_date < today()
            )
    );

    const attention = [
        ...overdue,
        ...jobs.filter((j) => j.status === 'ready_for_pickup')
    ].filter(
        (j, i, arr) =>
            arr.findIndex((x) => x.job_id === j.job_id) === i
    );

    $('active-count').textContent = active.length;
    $('overdue-count').textContent = overdue.length;
    $('appointment-count').textContent = todays.length;
    $('parts-count').textContent = parts.length;

    const next = todays.find(
        (a) =>
            new Date(a.appointment_datetime) > new Date() &&
            a.status === 'scheduled'
    );

    $('next-appointment').textContent = next
        ? `Next up at ${formatTime(next.appointment_datetime)}`
        : 'Scheduled for today';

    const visibleAppointments = todays
        .filter(matching)
        .filter((a) => filter === 'all' || filter === 'appointments');

    $('appointment-badge').textContent =
        `${visibleAppointments.length} visible`;

    $('appointments-list').innerHTML = visibleAppointments.length
        ? visibleAppointments.map((a, i) => `
            <div class="record-row">
                <div class="record-main">
                    <div class="time-box">
                        ${escapeHtml(formatTime(a.appointment_datetime))}
                        <small>Slot ${i + 1}</small>
                    </div>

                    <div class="record-content">
                        <strong>
                            ${escapeHtml(a.customers?.full_name || 'Unknown customer')}
                        </strong>

                        ${pill(a.status)}

                        <div class="record-sub">
                            ${escapeHtml(a.service_requested)}
                            <br>
                            ${escapeHtml(vehicleName(a.vehicles))}

                            ${a.vehicles?.plate_number
                                ? `<span class="plate">${escapeHtml(a.vehicles.plate_number)}</span>`
                                : ''}
                        </div>
                    </div>
                </div>

                <button
                    class="row-action"
                    data-details="appointment"
                    data-id="${a.appointment_id}"
                    aria-label="Appointment details"
                >
                    ${icon('chevron_right')}
                </button>
            </div>
        `).join('')
        : '<div class="empty-state">No appointments to display.</div>';

    const visibleParts =
        filter === 'all' || filter === 'parts'
            ? parts.filter((p) =>
                p.part_name.toLowerCase().includes(term)
            )
            : [];

    $('parts-badge').textContent =
        `${visibleParts.length} alerts`;

    $('parts-list').innerHTML = visibleParts.length
        ? visibleParts.map((p) => `
            <div class="record-row">
                <div class="record-main">
                    <div class="icon-tile amber">
                        ${icon('inventory_2')}
                    </div>

                    <div class="record-content">
                        <strong>${escapeHtml(p.part_name)}</strong>
                        <span class="pill awaiting_parts">
                            Usage alert
                        </span>

                        <div class="record-sub">
                            Used ${p.used_in_period} times in
                            ${p.alert_period_days} days,
                            limit ${p.alert_threshold}
                        </div>
                    </div>
                </div>

                <a
                    class="row-action"
                    href="/pages/admin/parts.html"
                    aria-label="Parts alerts"
                >
                    ${icon('chevron_right')}
                </a>
            </div>
        `).join('')
        : '<div class="empty-state">No parts usage alerts.</div>';

    const visibleAttention = (
        filter === 'all' ||
        filter === 'overdue' ||
        filter === 'active'
            ? attention.filter(
                (j) => filter !== 'overdue' || overdue.includes(j)
            )
            : []
    ).filter(matching);

    $('attention-badge').textContent =
        `${visibleAttention.length} alerts`;

    $('attention-list').innerHTML = visibleAttention.length
        ? visibleAttention.map((j) => `
            <div class="record-row">
                <div class="record-main">
                    <div class="icon-tile">
                        ${icon(
                            j.status === 'ready_for_pickup'
                                ? 'key'
                                : 'timer_off'
                        )}
                    </div>

                    <div class="record-content">
                        <strong>
                            ${escapeHtml(j.customers?.full_name || 'Unknown customer')}
                        </strong>

                        ${pill(
                            j.status === 'ready_for_pickup'
                                ? 'ready_for_pickup'
                                : 'overdue'
                        )}

                        <div class="record-sub">
                            ${escapeHtml(vehicleName(j.vehicles))}
                            <span class="plate">
                                ${escapeHtml(j.vehicles?.plate_number || '—')}
                            </span>
                            · ${escapeHtml(j.problem_description)}
                        </div>
                    </div>
                </div>

                <div class="record-main">
                    ${j.status === 'ready_for_pickup'
                        ? `<button class="primary-action" data-deliver="${j.job_id}">
                            Mark Delivered
                           </button>`
                        : ''}

                    <button
                        class="row-action"
                        data-details="job"
                        data-id="${j.job_id}"
                        aria-label="Job details"
                    >
                        ${icon('chevron_right')}
                    </button>
                </div>
            </div>
        `).join('')
        : '<div class="empty-state">No jobs need immediate attention.</div>';

    const recent = jobs
        .filter(matching)
        .filter((j) =>
            filter === 'all' ||
            filter === 'appointments' ||
            filter === 'parts'
                ? filter === 'all'
                : filter === 'overdue'
                    ? overdue.includes(j)
                    : j.status !== 'delivered'
        )
        .slice(0, 5);

    $('recent-jobs-body').innerHTML = recent.length
        ? recent.map((j) => `
            <tr data-details="job" data-id="${j.job_id}">
                <td>
                    <strong>
                        ${escapeHtml(j.problem_description)}
                    </strong>
                </td>

                <td>
                    ${escapeHtml(j.customers?.full_name || 'Unknown customer')}

                    <small>
                        ${escapeHtml(vehicleName(j.vehicles))}
                        <span class="plate">
                            ${escapeHtml(j.vehicles?.plate_number || '—')}
                        </span>
                    </small>
                </td>

                <td>${pill(j.status)}</td>

                <td>
                    ${escapeHtml(
                        relativeTime(j.updated_at || j.registered_at)
                    )}
                </td>

                <td>${icon('chevron_right')}</td>
            </tr>
        `).join('')
        : `<tr>
            <td colspan="5" class="empty-state">
                No jobs to display.
            </td>
           </tr>`;

    document.querySelectorAll('[data-filter]').forEach((button) => {
        button.classList.toggle(
            'selected',
            button.dataset.filter === filter
        );
    });
}

// =========================================================
// POLISHED MODAL FIELD COMPONENTS
// =========================================================

const modalIcon = (name) => `
    <span class="material-symbols-outlined" aria-hidden="true">
        ${name}
    </span>
`;

function field(
    title,
    name,
    type = 'text',
    required = true,
    symbol = 'edit',
    placeholder = ''
) {
    return `
        <label class="db-form-field">
            <span class="db-field-label">
                ${modalIcon(symbol)}
                ${escapeHtml(title)}
                ${required ? '<em>*</em>' : ''}
            </span>

            <input
                name="${name}"
                type="${type}"
                ${required ? 'required' : ''}
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
    symbol = 'list'
) {
    return `
        <label class="db-form-field">
            <span class="db-field-label">
                ${modalIcon(symbol)}
                ${escapeHtml(title)}
                ${required ? '<em>*</em>' : ''}
            </span>

            <select
                name="${name}"
                ${required ? 'required' : ''}
            >
                ${options}
            </select>
        </label>
    `;
}

const option = (value, text) => `
    <option value="${escapeHtml(value)}">
        ${escapeHtml(text)}
    </option>
`;

function customerOptions() {
    return '<option value="">Select customer</option>' +
        customers.map((customer) =>
            option(customer.customer_id, customer.full_name)
        ).join('');
}

function vehicleOptions(customerId) {
    return '<option value="">Select vehicle</option>' +
        vehicles
            .filter((vehicle) =>
                String(vehicle.customer_id) === String(customerId)
            )
            .map((vehicle) =>
                option(
                    vehicle.vehicle_id,
                    `${vehicleName(vehicle)} (${vehicle.plate_number})`
                )
            ).join('');
}

const modalConfigs = {
    job: {
        title: 'NEW JOB',
        icon: 'add_circle',
        subtitle: 'Register a new vehicle service job'
    },

    appointment: {
        title: 'NEW APPOINTMENT',
        icon: 'event',
        subtitle: 'Schedule a customer visit'
    },

    customer: {
        title: 'ADD CUSTOMER',
        icon: 'person_add',
        subtitle: 'Create a new customer record'
    }
};

// =========================================================
// OPEN MODAL
// =========================================================

function openModal(type) {
    const config = modalConfigs[type];

    if (!config) return;

    modalType = type;

    const form = $('dashboard-form');
    form.reset();

    $('save-modal').classList.remove('hidden');

    $('modal-title').innerHTML = `
        ${modalIcon(config.icon)}
        <span>${config.title}</span>
    `;

    let fields = `
        <p class="db-modal-subtitle">
            ${config.subtitle}
        </p>
    `;

    // ADD CUSTOMER
    if (type === 'customer') {
        fields += `
            ${field(
                'Full name',
                'full_name',
                'text',
                true,
                'person',
                'Enter customer name'
            )}

            ${field(
                'Phone number',
                'phone_number',
                'tel',
                true,
                'call',
                'e.g. +592 600 1234'
            )}

            ${field(
                'Email address',
                'email',
                'email',
                false,
                'mail',
                'customer@example.com'
            )}

            ${field(
                'Address',
                'address',
                'text',
                false,
                'location_on',
                'Enter customer address'
            )}
        `;
    }

    // NEW JOB
    if (type === 'job') {
        fields += `
            <div class="db-modal-status">
                ${modalIcon('info')}
                Initial status:
                <strong>Not Started</strong>
            </div>

            ${selectField(
                'Customer',
                'customer_id',
                customerOptions(),
                true,
                'person'
            )}

            ${selectField(
                'Vehicle',
                'vehicle_id',
                '<option value="">Select a customer first</option>',
                true,
                'directions_car'
            )}

            <label class="db-form-field">
                <span class="db-field-label">
                    ${modalIcon('description')}
                    Problem description
                    <em>*</em>
                </span>

                <textarea
                    name="problem_description"
                    required
                    rows="3"
                    placeholder="Describe customer reported issues, symptoms, or diagnostic requirements..."
                ></textarea>
            </label>

            ${field(
                'Expected completion date',
                'expected_completion_date',
                'date',
                false,
                'calendar_today'
            )}

            <label class="db-check-field">
                <span>
                    ${modalIcon('inventory_2')}
                    Customer supplied parts
                </span>

                <input
                    type="checkbox"
                    name="customer_supplied_parts"
                />
            </label>
        `;
    }

    // NEW APPOINTMENT
    if (type === 'appointment') {
        fields += `
            ${selectField(
                'Customer',
                'customer_id',
                customerOptions(),
                true,
                'person'
            )}

            ${selectField(
                'Vehicle (optional)',
                'vehicle_id',
                '<option value="">Select a customer first</option>',
                false,
                'directions_car'
            )}

            ${field(
                'Contact number',
                'contact_number',
                'tel',
                true,
                'call',
                'Customer contact number'
            )}

            ${field(
                'Service requested',
                'service_requested',
                'text',
                true,
                'build',
                'Describe the service needed'
            )}

            ${field(
                'Appointment date and time',
                'appointment_datetime',
                'datetime-local',
                true,
                'event'
            )}
        `;
    }

    $('modal-fields').innerHTML = fields;

    const customerSelect =
        form.elements.namedItem('customer_id');

    if (customerSelect) {
        customerSelect.addEventListener('change', () => {
            const vehicleSelect =
                form.elements.namedItem('vehicle_id');

            vehicleSelect.innerHTML =
                vehicleOptions(customerSelect.value);

            if (type === 'appointment') {
                const customer = customers.find(
                    (c) =>
                        String(c.customer_id) ===
                        String(customerSelect.value)
                );

                form.elements.namedItem('contact_number').value =
                    customer?.phone_number || '';
            }
        });
    }

    modal.showModal();
}

function showDetails(type, id) {
    const item = type === 'job'
        ? jobs.find((j) => String(j.job_id) === String(id))
        : appointments.find(
            (a) => String(a.appointment_id) === String(id)
        );

    if (!item) return;

    modalType = 'details';

    $('modal-title').textContent =
        type === 'job'
            ? 'JOB DETAILS'
            : 'APPOINTMENT DETAILS';

    $('modal-fields').innerHTML = `
        <div class="record-content">
            <strong>
                ${escapeHtml(item.customers?.full_name || 'Unknown customer')}
            </strong>

            <div class="record-sub">
                ${escapeHtml(vehicleName(item.vehicles))}
                ${escapeHtml(item.vehicles?.plate_number || '')}
            </div>

            <p>
                ${escapeHtml(
                    item.problem_description || item.service_requested
                )}
            </p>

            ${pill(item.status)}
        </div>
    `;

    $('save-modal').classList.add('hidden');
    modal.showModal();
}

function closeModal() {
    modal.close();
    $('save-modal').classList.remove('hidden');
}

// =========================================================
// SAVE TO SUPABASE
// =========================================================

async function save(event) {
    event.preventDefault();

    if (modalType === 'details') return;

    const button = $('save-modal');
    button.disabled = true;

    const values = Object.fromEntries(
        new FormData($('dashboard-form'))
    );

    try {
        let table;
        let record;

        if (modalType === 'customer') {
            table = 'customers';

            record = {
                full_name: values.full_name.trim(),
                phone_number: values.phone_number.trim(),
                email: values.email || null,
                address: values.address || null,
                created_by: profile.profile_id
            };
        }

        if (modalType === 'job') {
            table = 'jobs';

            if (!values.vehicle_id) {
                throw Error(
                    'Select a vehicle belonging to this customer.'
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
                    values.customer_supplied_parts === 'on',
                created_by: profile.profile_id
            };
        }

        if (modalType === 'appointment') {
            table = 'appointments';

            const when = new Date(values.appointment_datetime);

            if (Number.isNaN(when.getTime())) {
                throw Error('Choose a valid appointment time.');
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
            `${modalType === 'customer'
                ? 'Customer'
                : modalType === 'job'
                    ? 'Job'
                    : 'Appointment'} created successfully`
        );

        await refresh();
    } catch (error) {
        showError(error);
        notify(error.message || 'Could not save record');
    } finally {
        button.disabled = false;
    }
}

async function deliver(id) {
    if (!window.confirm(
        'Mark this job as delivered? A payment record and receipt photo must already exist.'
    )) {
        return;
    }

    try {
        const { error } = await supabase
            .from('jobs')
            .update({
                status: 'delivered',
                delivered_at: new Date().toISOString()
            })
            .eq('job_id', id);

        if (error) throw error;

        notify('Job marked delivered');
        await refresh();
    } catch (error) {
        showError(error);
        notify(error.message || 'Unable to deliver job');
    }
}

// =========================================================
// INITIALIZE DASHBOARD
// =========================================================

async function main() {
    const context = await initPage({
        active: 'dashboard',
        adminOnly: true
    });

    if (!context) return;

    profile = {
        ...context.profile,
        profile_id: context.user.id
    };

    const hour = new Date().getHours();

    $('greeting').textContent =
        `Good ${hour < 12
            ? 'morning'
            : hour < 17
                ? 'afternoon'
                : 'evening'}, ${profile.full_name?.split(' ')[0] || 'Admin'}`;

    $('today-label').textContent =
        new Date().toLocaleDateString('en-GY', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });

    await refresh();

    document.querySelectorAll('[data-open]').forEach((button) => {
        button.addEventListener('click', () => {
            openModal(button.dataset.open);
        });
    });

    modal.addEventListener('close', () => {
        $('save-modal').classList.remove('hidden');
    });

    $('close-modal').addEventListener('click', closeModal);
    $('cancel-modal').addEventListener('click', closeModal);
    $('dashboard-form').addEventListener('submit', save);

    $('dashboard-search').addEventListener('input', (event) => {
        term = event.target.value.trim().toLowerCase();
        render();
    });

    document.querySelectorAll('[data-filter]').forEach((button) => {
        button.addEventListener('click', () => {
            filter = filter === button.dataset.filter
                ? 'all'
                : button.dataset.filter;

            render();

            const section =
                filter === 'appointments'
                    ? 'appointments-section'
                    : filter === 'parts'
                        ? 'parts-section'
                        : filter === 'overdue'
                            ? 'attention-section'
                            : 'recent-section';

            document.getElementById(section).scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        });
    });

    document.addEventListener('click', (event) => {
        const deliverButton =
            event.target.closest('[data-deliver]');

        if (deliverButton) {
            deliver(deliverButton.dataset.deliver);
            return;
        }

        const details = event.target.closest('[data-details]');

        if (details) {
            showDetails(
                details.dataset.details,
                details.dataset.id
            );
        }
    });

    document.addEventListener('keydown', (event) => {
        if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === 'k'
        ) {
            event.preventDefault();
            $('dashboard-search').focus();
        }
    });
}

main().catch(showError);

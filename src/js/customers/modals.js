// add / edit customer and add / edit vehicle modals, plus deleting a customer
// shared by the customers list and the customer profile
//
// usage:
//   import { openCustomerModal, openVehicleModal, deleteCustomer } from "./modals.js";
//   openCustomerModal({ onSaved: (customerId) => ... });                 // add (with optional first vehicle)
//   openCustomerModal({ customer, onSaved: () => ... });                 // edit
//   openVehicleModal({ customerId, customerName, onSaved: () => ... });          // add vehicle
//   openVehicleModal({ customerId, customerName, vehicle, onSaved: () => ... }); // edit vehicle
//   if (await deleteCustomer({ id, name, vehicleCount, jobCount })) ...          // admins only
//   if (await deleteVehicle(vehicle)) ...                                        // admins only

import { supabase } from "../lib/supabase.js";
import { showToast } from "../shared/toast.js";
import { confirmDialog, isConfirmOpen } from "../shared/confirm-dialog.js";
import { escapeHtml, vehicleName, initials, avatarClass, shortId } from "./utils.js";

// matches the check constraint on customers.phone_number
const PHONE_PATTERN = /^[0-9+ -]{7,20}$/;

// ---------- icons ----------

const icons = {
    close: `<svg class="size-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 18 18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" /></svg>`,
    plus: `<svg class="size-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" stroke-linecap="round" stroke-linejoin="round" /></svg>`,
    pencil: `<svg class="size-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536M4 20h4L18.5 9.5a2.5 2.5 0 0 0-3.536-3.536L4.5 16.5 4 20z" stroke-linecap="round" stroke-linejoin="round" /></svg>`,
    person: `<svg class="size-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7z" stroke-linecap="round" stroke-linejoin="round" /></svg>`,
    car: `<svg class="size-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M8 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" stroke-linecap="round" stroke-linejoin="round" /><path d="M3 9h13l3 4v4h-2a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H3V9z" stroke-linecap="round" stroke-linejoin="round" /><path d="M5 9V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v4" stroke-linecap="round" stroke-linejoin="round" /></svg>`,
    warning: `<svg class="size-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke-linecap="round" stroke-linejoin="round" /></svg>`,
    error: `<svg class="size-3 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" clip-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0zm-7 4a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-1-9a1 1 0 0 0-1 1v4a1 1 0 1 0 2 0V6a1 1 0 0 0-1-1z" /></svg>`,
};

// ---------- small building blocks ----------

// required fields get a red star, optional ones say (optional)
// caps: the small uppercase labels used by the compact modals (edit customer, vehicle)
function labelText(label, required, caps = false) {
    if (caps) return `<span>${label}</span>${required ? ` <span class="text-status-overdue">*</span>` : ""}`;
    return required
        ? `<span>${label}</span> <span class="text-status-overdue font-bold">*</span>`
        : `<span>${label}</span> <span class="text-[11px] text-muted font-normal">(optional)</span>`;
}

// one labelled input with a hidden error line under it. `name` is the form field name
function input({ name, label, value = "", placeholder = "", required = false, type = "text", maxlength, mono = false, uppercase = false, wide = false, caps = false, extra = "" }) {
    const labelClass = caps ? "text-[11px] font-semibold uppercase tracking-wider text-muted" : "text-xs font-medium";
    return `
        <div class="space-y-1.5 ${wide ? "md:col-span-2" : ""}">
            <label class="${labelClass} flex items-center gap-1" for="field-${name}">${labelText(label, required, caps)}</label>
            <input id="field-${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"
                   ${maxlength ? `maxlength="${maxlength}"` : ""} ${extra}
                   class="field px-3.5 py-2.5 ${mono ? "font-mono" : ""} ${uppercase ? "uppercase" : ""}" />
            <p data-error-for="${name}" class="hidden text-xs text-status-overdue items-center gap-1"></p>
        </div>`;
}

function textarea({ name, label, value = "", placeholder = "", maxlength }) {
    return `
        <div class="space-y-1.5 md:col-span-2">
            <label class="text-xs font-medium flex items-center gap-1" for="field-${name}">${labelText(label, false)}</label>
            <textarea id="field-${name}" name="${name}" rows="2" ${maxlength ? `maxlength="${maxlength}"` : ""} placeholder="${escapeHtml(placeholder)}"
                      class="field px-3.5 py-2.5 resize-none h-16">${escapeHtml(value)}</textarea>
        </div>`;
}

// card around a group of fields, with an icon, title and hint at the top
function sectionCard({ icon, title, hint, badge = "", optional = false, body }) {
    return `
        <section class="p-5 rounded-xl bg-app/60 border border-line space-y-4">
            <div class="flex items-center justify-between gap-3 pb-3 border-b border-line">
                <div class="flex items-center gap-2.5">
                    <span class="size-7 rounded-lg bg-accent/15 text-accent border border-accent/30 flex items-center justify-center shrink-0">${icon}</span>
                    <div>
                        <div class="flex items-center gap-2">
                            <h4 class="font-display text-sm font-semibold tracking-wide uppercase">${title}</h4>
                            ${optional ? `<span class="text-[11px] text-muted">(optional)</span>` : ""}
                        </div>
                        <p class="text-[11px] text-muted">${hint}</p>
                    </div>
                </div>
                ${badge}
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">${body}</div>
        </section>`;
}

function customerFields(c = {}) {
    return (
        input({ name: "full_name", label: "Full name", value: c.full_name, placeholder: "e.g. Ravi Persaud", required: true, maxlength: 100 }) +
        input({ name: "phone_number", label: "Phone number", value: c.phone_number, placeholder: "e.g. 592-600-1234", required: true, maxlength: 20, type: "tel", mono: true }) +
        input({ name: "email", label: "Email", value: c.email, placeholder: "e.g. ravi@example.com", type: "email", maxlength: 150, wide: true }) +
        textarea({ name: "address", label: "Address", value: c.address, placeholder: "e.g. Lot 12 Regent Street, Georgetown", maxlength: 200 })
    );
}

// edit customer modal: name on its own row, then phone and email, then address
function editCustomerFields(c) {
    return `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${input({ name: "full_name", label: "Full name", value: c.full_name, placeholder: "e.g. Ravi Persaud", required: true, maxlength: 100, wide: true, caps: true })}
            ${input({ name: "phone_number", label: "Phone number", value: c.phone_number, placeholder: "e.g. 592-600-1234", required: true, maxlength: 20, type: "tel", mono: true, caps: true })}
            ${input({ name: "email", label: "Email address", value: c.email, placeholder: "e.g. ravi@example.com", type: "email", maxlength: 150, caps: true })}
            ${input({ name: "address", label: "Address", value: c.address, placeholder: "e.g. Lot 12 Regent Street, Georgetown", maxlength: 200, wide: true, caps: true })}
        </div>`;
}

// `required` only changes the red stars; validateVehicle decides what is actually needed
function vehicleFields(v = {}, { required = true, caps = false } = {}) {
    return (
        input({ name: "make", label: "Make", value: v.make, placeholder: "e.g. Toyota", required, maxlength: 50, caps }) +
        input({ name: "model", label: "Model", value: v.model, placeholder: "e.g. Hilux", required, maxlength: 50, caps }) +
        input({ name: "year", label: "Year", value: v.year ?? "", placeholder: "e.g. 2021", required, type: "number", mono: true, caps, extra: 'min="1900" max="2100"' }) +
        input({ name: "plate_number", label: "License plate", value: v.plate_number, placeholder: "e.g. PAA 1234", required, maxlength: 15, mono: true, uppercase: true, caps }) +
        input({ name: "colour", label: "Colour", value: v.colour, placeholder: "e.g. Silver Metallic", maxlength: 30, caps }) +
        input({ name: "engine_trim", label: "Engine / Trim", value: v.engine_trim, placeholder: "e.g. 2.8L Diesel", maxlength: 50, caps })
    );
}

// ---------- modal shell ----------

/**
 * draws a modal and returns helpers
 * compact: the smaller modal from the profile page designs (edit customer, add / edit vehicle)
 * discardTitle: question asked when closing with unsaved changes
 * @returns {{ el: HTMLElement, form: HTMLFormElement, close: function, setNotice: function, setFieldError: function, clearErrors: function, setBusy: function, setSubmitLabel: function, top: HTMLElement }}
 */
function createModal({ icon, title, subtitle, bodyHtml, submitLabel, compact = false, discardTitle = "Discard your changes?" }) {
    const el = document.createElement("div");
    el.className = "fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.innerHTML = `
        <form novalidate class="relative w-full ${compact ? "max-w-xl" : "max-w-3xl"} my-8 flex flex-col max-h-[90vh] bg-surface border border-line-strong rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
            <header class="flex items-center justify-between gap-4 px-6 shrink-0 ${compact ? "pt-6 pb-2" : "py-5 border-b border-line bg-table-head"}">
                <div class="flex items-center gap-3">
                    ${icon.startsWith("<span") ? icon : `<span class="size-9 rounded-xl bg-accent/15 border border-accent/40 text-accent flex items-center justify-center shadow-[0_0_15px_rgba(20,184,166,0.2)]">${icon}</span>`}
                    <div>
                        <h2 class="font-display text-base font-bold tracking-wide">${escapeHtml(title)}</h2>
                        <p class="text-xs text-muted mt-0.5 ${compact ? "font-mono" : ""}">${escapeHtml(subtitle)}</p>
                    </div>
                </div>
                <button type="button" data-close class="size-8 rounded-lg flex items-center justify-center text-muted hover:text-ink hover:bg-raised transition cursor-pointer" aria-label="Close">${icons.close}</button>
            </header>

            <div class="flex-1 overflow-y-auto p-6 ${compact ? "pt-4 space-y-4" : "space-y-6"}">
                <div data-top></div>
                ${bodyHtml}
                <div data-notice class="hidden"></div>
            </div>

            <footer class="flex items-center justify-end gap-3 px-6 shrink-0 ${compact ? "pb-6 pt-2" : "py-4 border-t border-line"}">
                <button type="button" data-close class="btn ${compact ? "text-muted hover:text-ink hover:bg-raised" : "btn-secondary border border-line-strong"} px-4 py-2 text-xs font-medium">Cancel</button>
                <button type="submit" data-submit class="btn btn-primary px-4 py-2 text-xs font-display">${escapeHtml(submitLabel)}</button>
            </footer>
        </form>`;

    document.body.appendChild(el);
    document.body.classList.add("overflow-hidden");

    const form = el.querySelector("form");
    const top = el.querySelector("[data-top]");
    const notice = el.querySelector("[data-notice]");
    const submit = el.querySelector("[data-submit]");
    let label = submitLabel;
    let busy = false;

    // what the form held when it opened, so we can tell if the user changed anything
    const snapshot = () => JSON.stringify([...new FormData(form).entries()]);
    const startValues = snapshot();
    const hasChanges = () => snapshot() !== startValues;

    // closes straight away; used after a successful save
    function close() {
        document.removeEventListener("keydown", onKey);
        document.body.classList.remove("overflow-hidden");
        el.remove();
    }

    // the x, cancel, clicking outside and escape all come here: ask first if anything was typed
    async function requestClose() {
        if (busy || isConfirmOpen()) return;
        if (hasChanges()) {
            const discard = await confirmDialog({
                title: discardTitle,
                message: "The details you've entered will be lost.",
                confirmLabel: "Discard",
                cancelLabel: "Keep editing",
            });
            if (!discard) return;
        }
        close();
    }

    function onKey(event) {
        // the confirm dialog handles its own escape
        if (event.key === "Escape" && !isConfirmOpen()) requestClose();
    }

    document.addEventListener("keydown", onKey);
    el.addEventListener("mousedown", (event) => {
        if (event.target === el) requestClose();
    });
    el.querySelectorAll("[data-close]").forEach((btn) => btn.addEventListener("click", requestClose));

    // red box at the bottom for problems that aren't about one field (connection, duplicate plate)
    function setNotice(text) {
        notice.classList.toggle("hidden", !text);
        notice.className = text ? "rounded-lg border border-status-overdue/40 bg-status-overdue/10 text-status-overdue px-3 py-2 text-sm" : "hidden";
        notice.textContent = text ?? "";
        if (text) notice.scrollIntoView({ block: "nearest" });
    }

    // red line under one field
    function setFieldError(name, text) {
        const line = form.querySelector(`[data-error-for="${name}"]`);
        const field = form.elements[name];
        if (!line) return;
        line.classList.toggle("hidden", !text);
        line.classList.toggle("flex", !!text);
        line.innerHTML = text ? `${icons.error}<span>${escapeHtml(text)}</span>` : "";
        field?.classList.toggle("border-status-overdue", !!text);
    }

    function clearErrors() {
        form.querySelectorAll("[data-error-for]").forEach((line) => setFieldError(line.dataset.errorFor, ""));
        setNotice("");
    }

    // typing in a field clears its own error
    form.addEventListener("input", (event) => {
        if (event.target.name) setFieldError(event.target.name, "");
    });

    // while saving, the modal can't be closed and the save button is disabled
    function setBusy(isBusy) {
        busy = isBusy;
        submit.disabled = isBusy;
        submit.textContent = isBusy ? "Saving..." : label;
    }

    function setSubmitLabel(text) {
        label = text;
        submit.textContent = text;
    }

    // focus the first field
    form.querySelector("input, textarea")?.focus();

    return { el, form, top, close, setNotice, setFieldError, clearErrors, setBusy, setSubmitLabel };
}

// pulls trimmed text out of the form
function readForm(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    for (const key of Object.keys(data)) data[key] = String(data[key]).trim();
    return data;
}

// empty optional fields are saved as null
const orNull = (value) => (value === "" ? null : value);

// ---------- validation ----------

// returns { field: message } for every problem, or an empty object
function validateCustomer(d) {
    const errors = {};
    if (!d.full_name) errors.full_name = "Full name is required";
    if (!PHONE_PATTERN.test(d.phone_number)) errors.phone_number = "Enter a valid phone number (7 to 20 digits; + - and spaces allowed)";
    if (d.email && !/^\S+@\S+\.\S+$/.test(d.email)) errors.email = "That email address doesn't look right";
    return errors;
}

function validateVehicle(d) {
    const errors = {};
    if (!d.make) errors.make = "Make is required";
    if (!d.model) errors.model = "Model is required";
    if (!d.plate_number) errors.plate_number = "License plate is required";
    const year = Number(d.year);
    if (!d.year) errors.year = "Year is required";
    else if (!Number.isInteger(year) || year < 1900 || year > 2100) errors.year = "Year must be between 1900 and 2100";
    return errors;
}

// shows every error under its field; returns true when there were none
function showErrors(modal, errors) {
    const names = Object.keys(errors);
    names.forEach((name) => modal.setFieldError(name, errors[name]));
    if (names.length) modal.form.elements[names[0]]?.focus();
    return names.length === 0;
}

const vehicleRow = (d, customerId) => ({
    customer_id: customerId,
    plate_number: d.plate_number.toUpperCase(),
    make: d.make,
    model: d.model,
    year: Number(d.year),
    colour: orNull(d.colour),
    engine_trim: orNull(d.engine_trim),
});

// postgres unique violation, which is what a duplicate plate number gives
const isDuplicatePlate = (error) => error?.code === "23505";

// ---------- duplicate check ----------

// customers with the same phone number or the same name (case doesn't matter)
async function findDuplicates(d, excludeId) {
    const columns = "customer_id, full_name, phone_number, vehicles ( year, make, model )";
    const byPhone = supabase.from("customers").select(columns).eq("phone_number", d.phone_number).limit(3);
    const byName = supabase.from("customers").select(columns).ilike("full_name", d.full_name.replace(/[%_]/g, "\\$&")).limit(3);

    const [phoneRes, nameRes] = await Promise.all([byPhone, byName]);
    if (phoneRes.error) throw phoneRes.error;
    if (nameRes.error) throw nameRes.error;

    // phone matches first, no repeats, and never the customer being edited
    const seen = new Set();
    return [...phoneRes.data, ...nameRes.data].filter((c) => {
        if (c.customer_id === excludeId || seen.has(c.customer_id)) return false;
        seen.add(c.customer_id);
        return true;
    });
}

// amber card at the top of the modal, same as the design's "this looks like an existing customer"
function duplicateCard(matches, saveLabel) {
    const m = matches[0];
    const vehicle = m.vehicles?.length ? vehicleName(m.vehicles[0]) : "No vehicles";
    const more = matches.length > 1 ? `<p class="text-muted mt-2">and ${matches.length - 1} more with the same name or phone number.</p>` : "";

    return `
        <div class="rounded-xl border border-status-awaiting-parts/40 bg-status-awaiting-parts/10 p-4 space-y-3">
            <div class="flex items-start gap-3">
                <span class="size-7 rounded-lg bg-status-awaiting-parts/20 text-status-awaiting-parts border border-status-awaiting-parts/30 flex items-center justify-center shrink-0 mt-0.5">${icons.warning}</span>
                <div class="flex-1 text-xs">
                    <p class="font-display font-semibold text-status-awaiting-parts text-sm">This looks like an existing customer</p>
                    <p class="mt-0.5">A profile already matches this name or phone number:</p>
                    <div class="mt-2.5 p-2.5 rounded-lg bg-surface border border-line space-y-0.5">
                        <div class="font-semibold flex flex-wrap items-center gap-1.5">
                            <span>${escapeHtml(m.full_name)}</span>
                            <span class="text-[11px] font-mono text-accent bg-accent/15 px-1.5 py-0.5 rounded border border-accent/30">${escapeHtml(m.phone_number)}</span>
                        </div>
                        <div class="text-muted text-[11px]">Vehicle: <span class="text-ink font-medium">${escapeHtml(vehicle)}</span></div>
                    </div>
                    ${more}
                </div>
            </div>
            <div class="flex items-center justify-end gap-2 pt-3 border-t border-status-awaiting-parts/30">
                <a href="/pages/customer-details.html?id=${m.customer_id}" class="px-3 py-1.5 text-xs font-medium rounded-lg bg-raised hover:bg-line-strong border border-line-strong transition">View existing</a>
                <button type="button" data-save-anyway class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-status-awaiting-parts/20 hover:bg-status-awaiting-parts/30 text-status-awaiting-parts border border-status-awaiting-parts/40 transition cursor-pointer">${saveLabel}</button>
            </div>
        </div>`;
}

// ---------- add / edit customer ----------

export function openCustomerModal({ customer = null, onSaved } = {}) {
    const isEdit = !!customer;
    const submitLabel = isEdit ? "Update Profile" : "Save Customer";

    // editing uses the compact form; adding uses the two section cards
    let bodyHtml = isEdit
        ? editCustomerFields(customer)
        : sectionCard({
              icon: icons.person,
              title: "Customer Details",
              hint: "Personal identification and primary contact channels",
              body: customerFields({}),
          });

    if (!isEdit) {
        bodyHtml += sectionCard({
            icon: icons.car,
            title: "Vehicle Information",
            optional: true,
            hint: "Add first vehicle to register alongside customer profile",
            badge: `<span class="text-xs font-mono px-2 py-0.5 rounded bg-accent/10 text-accent border border-accent/30 shrink-0">First Vehicle</span>`,
            body: vehicleFields({}, { required: true }),
        });
    }

    // the edit modal shows the customer's initials in their avatar colour instead of an icon
    const avatar = isEdit
        ? `<span class="size-10 rounded-xl border flex items-center justify-center font-display font-bold text-sm ${avatarClass(customer.customer_id)}">${escapeHtml(initials(customer.full_name))}</span>`
        : icons.plus;

    const modal = createModal({
        icon: avatar,
        title: isEdit ? "Edit Customer Profile" : "Add New Customer",
        subtitle: isEdit ? `ID #${shortId(customer.customer_id)}` : "Create customer profile and register vehicle details",
        bodyHtml,
        submitLabel,
        compact: isEdit,
        discardTitle: isEdit ? "Discard your changes?" : "Discard this new customer?",
    });

    // set to true once the user has seen the duplicate warning and chosen to continue
    let duplicateAcknowledged = false;

    // changing the name or phone means the old duplicate warning no longer applies
    for (const name of ["full_name", "phone_number"]) {
        modal.form.elements[name].addEventListener("input", () => {
            if (!duplicateAcknowledged && !modal.top.innerHTML) return;
            duplicateAcknowledged = false;
            modal.top.innerHTML = "";
            modal.setSubmitLabel(submitLabel);
        });
    }

    // "create anyway" / "save anyway" in the warning card
    modal.top.addEventListener("click", (event) => {
        if (!event.target.closest("[data-save-anyway]")) return;
        duplicateAcknowledged = true;
        modal.form.requestSubmit();
    });

    modal.form.addEventListener("submit", async (event) => {
        event.preventDefault();
        modal.clearErrors();

        const d = readForm(modal.form);
        const errors = validateCustomer(d);

        // vehicle is optional, but if they started filling it in it has to be complete
        const vehicleTouched = !isEdit && ["make", "model", "year", "plate_number", "colour", "engine_trim"].some((k) => d[k]);
        if (vehicleTouched) Object.assign(errors, validateVehicle(d));

        if (!showErrors(modal, errors)) return;

        modal.setBusy(true);

        try {
            if (!duplicateAcknowledged) {
                const matches = await findDuplicates(d, customer?.customer_id);
                if (matches.length > 0) {
                    const anyway = isEdit ? "Save anyway" : "Create anyway";
                    modal.top.innerHTML = duplicateCard(matches, anyway);
                    modal.top.scrollIntoView({ block: "nearest" });
                    modal.setBusy(false);
                    modal.setSubmitLabel(isEdit ? "Save Anyway" : "Create Anyway");
                    return;
                }
            }

            if (isEdit) {
                const { error } = await supabase
                    .from("customers")
                    .update({
                        full_name: d.full_name,
                        phone_number: d.phone_number,
                        email: orNull(d.email),
                        address: orNull(d.address),
                    })
                    .eq("customer_id", customer.customer_id);
                if (error) throw error;

                modal.close();
                showToast("Customer updated", `${d.full_name}'s profile has been updated`);
                onSaved?.(customer.customer_id);
                return;
            }

            // new customer
            const {
                data: { user },
            } = await supabase.auth.getUser();

            const { data: created, error } = await supabase
                .from("customers")
                .insert({
                    full_name: d.full_name,
                    phone_number: d.phone_number,
                    email: orNull(d.email),
                    address: orNull(d.address),
                    created_by: user?.id ?? null,
                })
                .select("customer_id")
                .single();
            if (error) throw error;

            if (vehicleTouched) {
                const { error: vehicleError } = await supabase.from("vehicles").insert(vehicleRow(d, created.customer_id));
                if (vehicleError) {
                    // the customer exists now, so don't make them retype it; the profile is where they fix the vehicle
                    console.error("Vehicle insert failed:", vehicleError);
                    modal.close();
                    showToast(
                        "Customer saved, vehicle not added",
                        isDuplicatePlate(vehicleError)
                            ? "That license plate is already registered to another vehicle"
                            : "Add the vehicle from their profile",
                        "error",
                    );
                    onSaved?.(created.customer_id, { vehicleFailed: true });
                    return;
                }
            }

            modal.close();
            showToast("Customer created", `${d.full_name} has been added to the directory`);
            onSaved?.(created.customer_id);
        } catch (error) {
            console.error("Could not save customer:", error);
            modal.setNotice("Couldn't save the customer. Check your connection and try again.");
            modal.setBusy(false);
        }
    });
}

// ---------- add / edit vehicle ----------

export function openVehicleModal({ customerId, customerName = "this customer", vehicle = null, onSaved } = {}) {
    const isEdit = !!vehicle;

    const modal = createModal({
        icon: icons.car,
        title: isEdit ? "Edit Vehicle" : "Add Vehicle",
        subtitle: isEdit ? `Update ${vehicleName(vehicle)} for ${customerName}` : `Link a new vehicle to ${customerName}`,
        bodyHtml: `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">${vehicleFields(vehicle ?? {}, { caps: true })}</div>`,
        submitLabel: isEdit ? "Save Changes" : "Save Vehicle",
        compact: true,
        discardTitle: isEdit ? "Discard your changes?" : "Discard this new vehicle?",
    });

    modal.form.addEventListener("submit", async (event) => {
        event.preventDefault();
        modal.clearErrors();

        const d = readForm(modal.form);
        if (!showErrors(modal, validateVehicle(d))) return;

        modal.setBusy(true);

        const row = vehicleRow(d, customerId);
        const { error } = isEdit
            ? await supabase.from("vehicles").update(row).eq("vehicle_id", vehicle.vehicle_id)
            : await supabase.from("vehicles").insert(row);

        if (error) {
            console.error("Could not save vehicle:", error);
            if (isDuplicatePlate(error)) modal.setFieldError("plate_number", "That license plate is already registered to another vehicle");
            else modal.setNotice("Couldn't save the vehicle. Check your connection and try again.");
            modal.setBusy(false);
            return;
        }

        modal.close();
        showToast(isEdit ? "Vehicle updated" : "Vehicle added", `${vehicleName(row)} (${row.plate_number})`);
        onSaved?.();
    });
}

// ---------- delete customer (admins only) ----------

// asks first, then deletes; resolves true when the customer is gone
// the database only lets admins delete (customers_delete policy), so staff never see this
export async function deleteCustomer({ id, name, vehicleCount = 0, jobCount = 0 }) {
    // vehicles and jobs point at the customer with ON DELETE RESTRICT, so the delete would fail anyway
    if (vehicleCount || jobCount) {
        showToast("Can't delete this customer", "They still have vehicles or jobs on file", "error");
        return false;
    }

    const ok = await confirmDialog({
        title: `Delete ${name}?`,
        message: "This removes the customer for good and can't be undone.",
        confirmLabel: "Delete",
        tone: "danger",
    });
    if (!ok) return false;

    const { error } = await supabase.from("customers").delete().eq("customer_id", id);
    if (error) {
        console.error("Could not delete customer:", error);
        // 23503 is a foreign key violation: appointments still point at this customer
        showToast(
            "Couldn't delete this customer",
            error.code === "23503" ? "They still have appointments on file" : "Check your connection and try again",
            "error",
        );
        return false;
    }

    showToast("Customer deleted", `${name} has been removed`);
    return true;
}

// ---------- delete vehicle (admins only) ----------

// asks first, then deletes; resolves true when the vehicle is gone
// like customers, only admins can delete vehicles (vehicles_delete policy)
export async function deleteVehicle(vehicle) {
    const name = `${vehicleName(vehicle)} (${vehicle.plate_number})`;
    const ok = await confirmDialog({
        title: "Delete this vehicle?",
        message: `${name} will be removed from this customer. This can't be undone.`,
        confirmLabel: "Delete",
        tone: "danger",
    });
    if (!ok) return false;

    const { error } = await supabase.from("vehicles").delete().eq("vehicle_id", vehicle.vehicle_id);
    if (error) {
        console.error("Could not delete vehicle:", error);
        // 23503: jobs still point at this vehicle (ON DELETE RESTRICT)
        showToast(
            "Couldn't delete this vehicle",
            error.code === "23503" ? "It still has jobs on file" : "Check your connection and try again",
            "error",
        );
        return false;
    }

    showToast("Vehicle deleted", `${name} has been removed`);
    return true;
}
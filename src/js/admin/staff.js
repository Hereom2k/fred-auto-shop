<<<<<<< Updated upstream
=======

import { supabase } from "../lib/supabase.js";
import { initPage } from "../shared/page.js";

// =========================================================
// STAFF MANAGEMENT — STATE
// =========================================================

const $ = (id) => document.getElementById(id);

let roster = [];
let me = null;
let filter = "all";
let action = "invite";
let target = null;
let saving = false;


// =========================================================
// HELPER FUNCTIONS
// =========================================================

function escapeHtml(value) {
    const characters = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    };

    return String(value ?? "").replace(
        /[&<>"']/g,
        (character) => characters[character]
    );
}

function statusOf(person) {
    if (!person.is_active) {
        return "deactivated";
    }

    if (person.must_set_password) {
        return "invited";
    }

    return "active";
}

function nameOf(person) {
    return person.full_name || person.email || "Unnamed staff";
}

function isMe(person) {
    return person.profile_id === me?.profile_id;
}

function initials(name) {
    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || "")
        .join("");
}

function displayDate(date) {
    if (!date) {
        return "—";
    }

    return new Date(date).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}


// =========================================================
// NOTIFICATIONS AND ERRORS
// =========================================================

function alertPage(message = "") {
    const element = $("sm-error");

    element.textContent = message;
    element.hidden = !message;
}

function toast(message, error = false) {
    const element = $("sm-toast");

    element.textContent = message;
    element.style.display = "block";
    element.classList.toggle("sm-toast-error", error);

    clearTimeout(toast.timer);

    toast.timer = setTimeout(() => {
        element.style.display = "none";
    }, 4500);
}


// =========================================================
// STAFF ACTION BUTTONS
// =========================================================

function buttons(person) {
    if (isMe(person)) {
        return '<span class="sm-email">Self protected</span>';
    }

    const id = escapeHtml(person.profile_id);

    if (!person.is_active) {
        return `
            <button
                type="button"
                data-action="reactivate"
                data-id="${id}"
            >
                Reactivate
            </button>
        `;
    }

    const resendButton = person.must_set_password
        ? `
            <button
                type="button"
                data-action="resend"
                data-id="${id}"
            >
                Resend invite
            </button>
        `
        : "";

    return `
        ${resendButton}

        <button
            type="button"
            data-action="deactivate"
            data-id="${id}"
        >
            Deactivate
        </button>
    `;
}


// =========================================================
// RENDER STAFF MANAGEMENT
// =========================================================

function render() {
    const counts = {
        all: roster.length,
        active: 0,
        invited: 0,
        deactivated: 0
    };

    // Count staff by status
    roster.forEach((person) => {
        counts[statusOf(person)]++;
    });

    // Update statistics and filters
    for (const key of Object.keys(counts)) {
        const counter = $(
            key === "all" ? "sm-total" : `sm-${key}`
        );

        counter.textContent = counts[key];

        const button = document.querySelector(
            `#sm-filters [data-filter="${key}"]`
        );

        button.textContent = `
            ${key[0].toUpperCase() + key.slice(1)} (${counts[key]})
        `.trim();

        button.classList.toggle(
            "active",
            filter === key
        );

        button.setAttribute(
            "aria-pressed",
            String(filter === key)
        );
    }

    // Filter and sort staff
    const visible = roster
        .filter((person) => {
            return filter === "all" ||
                statusOf(person) === filter;
        })
        .sort((a, b) => {
            return Number(statusOf(a) === "deactivated") -
                Number(statusOf(b) === "deactivated");
        });

    // -----------------------------------------------------
    // DESKTOP TABLE
    // -----------------------------------------------------

    $("sm-tbody").innerHTML = visible.length
        ? visible.map((person) => {
            const status = statusOf(person);
            const role = String(
                person.role || "staff"
            ).toLowerCase();

            return `
                <tr>
                    <td>
                        <div class="sm-person">
                            <span class="sm-avatar">
                                ${escapeHtml(initials(nameOf(person)))}
                            </span>

                            <span>
                                ${escapeHtml(nameOf(person))}

                                ${isMe(person)
                                    ? '<span class="sm-you">YOU</span>'
                                    : ""}
                            </span>
                        </div>
                    </td>

                    <td class="sm-email">
                        ${escapeHtml(person.email)}
                    </td>

                    <td>
                        <span class="sm-pill ${role}">
                            ${escapeHtml(role)}
                        </span>
                    </td>

                    <td>
                        <span class="sm-pill ${status}">
                            ${status}
                        </span>
                    </td>

                    <td>
                        ${escapeHtml(displayDate(person.created_at))}
                    </td>

                    <td>
                        <div class="sm-actions">
                            ${buttons(person)}
                        </div>
                    </td>
                </tr>
            `;
        }).join("")
        : `
            <tr>
                <td colspan="6">
                    No staff found for this filter.
                </td>
            </tr>
        `;

    // -----------------------------------------------------
    // MOBILE CARDS
    // -----------------------------------------------------

    $("sm-mobile").innerHTML = visible.map((person) => {
        const status = statusOf(person);
        const role = escapeHtml(person.role);

        return `
            <article class="sm-card">

                <div class="sm-card-top">
                    <div class="sm-person">
                        <span class="sm-avatar">
                            ${escapeHtml(initials(nameOf(person)))}
                        </span>

                        <span>
                            ${escapeHtml(nameOf(person))}

                            ${isMe(person)
                                ? '<span class="sm-you">YOU</span>'
                                : ""}
                        </span>
                    </div>

                    <span class="sm-pill ${role}">
                        ${role}
                    </span>
                </div>

                <div class="sm-email">
                    ${escapeHtml(person.email)}
                </div>

                <div class="sm-card-bottom">
                    <span class="sm-pill ${status}">
                        ${status}
                    </span>

                    <span class="sm-email">
                        ${escapeHtml(displayDate(person.created_at))}
                    </span>

                    <div class="sm-actions">
                        ${buttons(person)}
                    </div>
                </div>

            </article>
        `;
    }).join("") || "<p>No staff found for this filter.</p>";
}


// =========================================================
// LOAD STAFF FROM SUPABASE
// =========================================================

async function loadStaff() {
    const { data, error } = await supabase
        .from("profiles")
        .select(`
            profile_id,
            full_name,
            email,
            role,
            is_active,
            must_set_password,
            created_at
        `)
        .order("created_at", {
            ascending: false
        });

    if (error) {
        throw error;
    }

    roster = (data || []).filter((person) => {
        return ["admin", "staff"].includes(person.role);
    });

    render();
}


// =========================================================
// MODAL MANAGEMENT
// =========================================================

function openDialog(nextAction, person = null) {
    action = nextAction;
    target = person;

    $("sm-form").reset();
    $("sm-modal-error").hidden = true;
    $("sm-admin-warning").hidden = true;

    const invite = action === "invite";

    $("sm-form-fields").hidden = !invite;
    $("sm-confirm-message").hidden = invite;

    const labels = {
        invite: "Invite staff",
        deactivate: "Deactivate staff",
        reactivate: "Reactivate staff",
        resend: "Resend invitation"
    };

    const submitLabels = {
        invite: "Create account and send email",
        deactivate: "Deactivate",
        reactivate: "Reactivate",
        resend: "Resend invite"
    };

    $("sm-dialog-title").textContent = labels[action];

    $("sm-dialog-desc").textContent = invite
        ? "Send an onboarding invite to provide system access."
        : "Confirm the action below.";

    $("sm-submit-text").textContent = action === "invite"
    ? "Send invitation"
    : submitLabels[action];

    if (!invite) {
        const messages = {
            deactivate: `
                Deactivate ${nameOf(person)}?
                They will be unable to sign in.
                Their existing records will remain.
            `,

            reactivate: `
                Reactivate ${nameOf(person)}?
            `,

            resend: `
                Resend the setup invitation to ${person.email}?
            `
        };

        $("sm-confirm-message").textContent =
            messages[action].trim();
    }

    $("sm-dialog").showModal();
}


// =========================================================
// SUPABASE EDGE FUNCTION
// =========================================================

async function invoke(functionName, body) {
    const { data, error } = await supabase.functions.invoke(
        functionName,
        { body }
    );

    if (error) {
        let message = error.message;

        try {
            message = (
                await error.context?.json()
            )?.error || message;
        } catch {
            // Non-JSON response
        }

        throw new Error(message);
    }

    if (!data?.success) {
        throw new Error(
            data?.error || "Operation failed."
        );
    }

    return data;
}


// =========================================================
// SUBMIT STAFF ACTION
// =========================================================

async function submit(event) {
    event.preventDefault();

    if (saving) {
        return;
    }

    const errorNode = $("sm-modal-error");
    errorNode.hidden = true;

    let functionName;
    let payload;

    // -----------------------------------------------------
    // INVITE NEW STAFF
    // -----------------------------------------------------

    if (action === "invite") {
        const full_name = $("sm-name").value.trim();

        const email = $("sm-email")
            .value
            .trim()
            .toLowerCase();

        const role = $("sm-role").value;

        if (
            !full_name ||
            full_name.length > 100 ||
            !$("sm-email").checkValidity() ||
            !email
        ) {
            errorNode.textContent =
                "Enter a valid name and email address.";

            errorNode.hidden = false;
            return;
        }

        const exists = roster.some((person) => {
            return person.email?.toLowerCase() === email;
        });

        if (exists) {
            errorNode.textContent =
                "An account with this email already exists.";

            errorNode.hidden = false;
            return;
        }

        functionName = "invite-employee";

        payload = {
            full_name,
            email,
            role
        };
    }

    // -----------------------------------------------------
    // MANAGE EXISTING STAFF
    // -----------------------------------------------------

    else {
        if (!target || isMe(target)) {
            return;
        }

        const activeAdmins = roster.filter((person) => {
            return person.role === "admin" &&
                person.is_active;
        });

        if (
            action === "deactivate" &&
            target.role === "admin" &&
            activeAdmins.length <= 1
        ) {
            errorNode.textContent =
                "Cannot deactivate the last active admin.";

            errorNode.hidden = false;
            return;
        }

        functionName = "manage-staff";

        payload = {
            action,
            profile_id: target.profile_id
        };
    }

    // -----------------------------------------------------
    // SEND REQUEST
    // -----------------------------------------------------

    saving = true;

    const submitButton = $("sm-submit");
    const submitText = $("sm-submit-text");
    const originalLabel = submitText.textContent;

    submitButton.disabled = true;
    submitText.textContent = "Please wait…";

    try {
        await invoke(functionName, payload);

        $("sm-dialog").close();

        toast(
            action === "invite"
                ? "Invitation sent successfully."
                : "Staff account updated successfully."
        );

        try {
            await loadStaff();
            alertPage();
        } catch (loadError) {
            alertPage(
                `Action succeeded, but refreshing the roster failed: ${loadError.message}`
            );
        }
    } catch (error) {
        errorNode.textContent = error.message;
        errorNode.hidden = false;
    } finally {
        saving = false;

        submitButton.disabled = false;
        submitText.textContent = originalLabel;
    }
}


// =========================================================
// INITIALIZE STAFF MANAGEMENT PAGE
// =========================================================

async function main() {
    const context = await initPage({
        active: "staff",
        adminOnly: true
    });

    if (!context) {
        return;
    }

    me = context.profile;

    // -----------------------------------------------------
    // ADD STAFF
    // -----------------------------------------------------

    $("sm-add").addEventListener("click", () => {
        openDialog("invite");
    });

    // -----------------------------------------------------
    // CLOSE MODAL
    // -----------------------------------------------------

    $("sm-close").addEventListener("click", () => {
        if (!saving) {
            $("sm-dialog").close();
        }
    });

    $("sm-cancel").addEventListener("click", () => {
        if (!saving) {
            $("sm-dialog").close();
        }
    });

    $("sm-dialog").addEventListener("cancel", (event) => {
        if (saving) {
            event.preventDefault();
        }
    });

    // -----------------------------------------------------
    // ROLE SELECTION
    // -----------------------------------------------------

    $("sm-role").addEventListener("change", (event) => {
        $("sm-admin-warning").hidden =
            event.target.value !== "admin";
    });

    // -----------------------------------------------------
    // FILTER BUTTONS
    // -----------------------------------------------------

    $("sm-filters").addEventListener("click", (event) => {
        const button = event.target.closest("[data-filter]");

        if (!button) {
            return;
        }

        filter = button.dataset.filter;
        render();
    });

    // -----------------------------------------------------
    // STAFF ACTION BUTTONS
    // -----------------------------------------------------

    document.addEventListener("click", (event) => {
        const button = event.target.closest(
            "[data-action][data-id]"
        );

        if (!button) {
            return;
        }

        const person = roster.find((item) => {
            return item.profile_id === button.dataset.id;
        });

        if (person) {
            openDialog(button.dataset.action, person);
        }
    });

    // -----------------------------------------------------
    // FORM SUBMISSION
    // -----------------------------------------------------

    $("sm-form").addEventListener("submit", submit);

    // -----------------------------------------------------
    // INITIAL DATA LOAD
    // -----------------------------------------------------

    try {
        await loadStaff();
    } catch (error) {
        alertPage(
            `Unable to load staff: ${error.message}`
        );
    }
}


// =========================================================
// START APPLICATION
// =========================================================

main().catch((error) => {
    console.error(
        "Staff management initialization:",
        error
    );

    alertPage(error.message);
});
>>>>>>> Stashed changes

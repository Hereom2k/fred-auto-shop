import { supabase } from "../lib/supabase.js";

const form = document.getElementById("password-form");
const newPassword = document.getElementById("new-password");
const confirmPassword = document.getElementById("confirm-password");
const saveButton = document.getElementById("save-button");
const buttonText = document.getElementById("button-text");
const formMessage = document.getElementById("form-message");

let activationReady = false;

// shows a success or error message above the button
function showMessage(text, success = false) {
    formMessage.textContent = text;
    formMessage.className = `mb-4 text-xs ${success ? "text-accent" : "text-status-overdue"}`;
}

// only enable the button when both passwords are valid and match
function validatePasswords() {
    const valid =
        newPassword.value.length >= 8 &&
        newPassword.value === confirmPassword.value;
    saveButton.disabled = !activationReady || !valid;
}

newPassword.addEventListener("input", validatePasswords);
confirmPassword.addEventListener("input", validatePasswords);

// show or hide each password field
document.querySelectorAll(".toggle-password").forEach((button) => {
    button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.target);
        const showing = input.type === "password";

        input.type = showing ? "text" : "password";
        button.setAttribute(
            "aria-label",
            showing ? "Hide password" : "Show password",
        );
        button.setAttribute("aria-pressed", String(showing));
        button.querySelector(".eye-open").classList.toggle("hidden", showing);
        button
            .querySelector(".eye-closed")
            .classList.toggle("hidden", !showing);
    });
});

// the invite link signs the user in, so check that the session
// belongs to an account that still needs to set its password
async function checkActivationSession() {
    try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
            throw new Error(
                "Your invitation link is invalid or expired. Contact your admin for a new invitation.",
            );
        }

        const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("must_set_password")
            .eq("profile_id", data.user.id)
            .single();

        if (profileError || !profile?.must_set_password) {
            throw new Error(
                "This account is not awaiting password activation.",
            );
        }

        activationReady = true;
        validatePasswords();
    } catch (error) {
        activationReady = false;
        saveButton.disabled = true;
        showMessage(error.message);
    }
}

// reads the error message the edge function sends back
async function functionErrorMessage(error) {
    if (typeof error.context?.json === "function") {
        const details = await error.context.json().catch(() => null);
        if (details?.error) return details.error;
    }
    return error.message;
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activationReady) return;

    if (newPassword.value.length < 8) {
        showMessage("Password must contain at least 8 characters.");
        return;
    }

    if (newPassword.value !== confirmPassword.value) {
        showMessage("Passwords do not match.");
        return;
    }

    saveButton.disabled = true;
    buttonText.textContent = "Saving...";

    try {
        const { data, error } = await supabase.functions.invoke(
            "complete-activation",
            {
                body: { password: newPassword.value },
            },
        );

        if (error) throw new Error(await functionErrorMessage(error));
        if (!data?.success) throw new Error("Password activation failed.");

        showMessage("Password saved! Taking you to sign in...", true);

        // sign out so they sign in fresh with the new password
        const { error: signOutError } = await supabase.auth.signOut({
            scope: "local",
        });
        if (signOutError)
            console.warn("Sign-out warning:", signOutError.message);

        // short pause so they can read the message
        setTimeout(() => window.location.replace("/"), 1500);
    } catch (error) {
        console.error("Activation error:", error);
        showMessage(error.message || "Unable to complete activation.");
        saveButton.disabled = false;
        buttonText.textContent = "Save password";
    }
});

checkActivationSession();

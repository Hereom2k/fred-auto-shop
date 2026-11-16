// admin sends email invitation to staff for them to set their password (to log in)
import { supabase } from "../lib/supabase.js";

// wires up the invite employee form on the staff page
export function setupInviteForm() {
    const form = document.getElementById("inviteForm");
    if (!form) {
        return;
    }

    const button = document.getElementById("inviteButton");
    const buttonText = document.getElementById("inviteButtonText");
    const message = document.getElementById("inviteMessage");

    // shows a green success or red error message under the form
    function showMessage(text, success = false) {
        message.textContent = text;

        let colorClass = "text-accent";
        if (success) {
            colorClass = "text-status-overdue";
        }

        message.className = "mt-4 text-xs leading-relaxed " + colorClass;
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        button.disabled = true;
        buttonText.textContent = "Sending...";
        message.textContent = "";

        try {
            const sessionResult = await supabase.auth.getSession();
            const session = sessionResult.data.session;
            if (!session) {
                throw new Error("Please log in as an admin first.");
            }

            const fullName = document
                .getElementById("inviteFullName")
                .value.trim();
            const email = document.getElementById("inviteEmail").value.trim();
            const role = document.getElementById("inviteRole").value;

            // the edge function creates the account and emails the set-password link
            const response = await supabase.functions.invoke(
                "invite-employee",
                {
                    body: {
                        full_name: fullName,
                        email: email,
                        role: role,
                    },
                },
            );

            const data = response.data;
            const error = response.error;

            if (error) {
                // the function puts its own error message in the response body
                let errorText = error.message;

                if (error.context && typeof error.context.json === "function") {
                    try {
                        const details = await error.context.json();
                        if (details && details.error) {
                            errorText = details.error;
                        }
                    } catch (jsonError) {
                        // body wasn't JSON, keep the default error message
                    }
                }

                throw new Error(errorText);
            }

            if (!data || !data.success) {
                let failText = "Invitation failed.";
                if (data && data.error) {
                    failText = data.error;
                }
                throw new Error(failText);
            }

            showMessage(
                "Invitation sent! The employee can check their email.",
                true,
            );
            form.reset();
        } catch (err) {
            console.error("Invitation error:", err);

            let errorText = "Unable to send invitation.";
            if (err.message) {
                errorText = err.message;
            }
            showMessage(errorText);
        } finally {
            button.disabled = false;
            buttonText.textContent = "Send invitation";
        }
    });
}

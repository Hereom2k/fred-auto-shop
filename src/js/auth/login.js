import { supabase } from "../lib/supabase.js";

const form = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const toggleButton = document.getElementById("toggle-password");
const eyeOpen = document.getElementById("eye-open");
const eyeClosed = document.getElementById("eye-closed");
const errorMessage = document.getElementById("error-message");
const signinButton = document.getElementById("signin-button");

// where each role lands after signing in
const homeByRole = {
    admin: "/pages/admin/",
    staff: "/pages/dashboard.html",
};

function showError(text) {
    errorMessage.textContent = text;
    errorMessage.classList.remove("hidden");
}

// show or hide the password
toggleButton.addEventListener("click", () => {
    const isHidden = passwordInput.type === "password";
    passwordInput.type = isHidden ? "text" : "password";
    toggleButton.setAttribute(
        "aria-label",
        isHidden ? "Hide password" : "Show password",
    );
    eyeOpen.classList.toggle("hidden", isHidden);
    eyeClosed.classList.toggle("hidden", !isHidden);
});

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    errorMessage.classList.add("hidden");
    signinButton.disabled = true;
    signinButton.textContent = "Signing in...";

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: emailInput.value.trim(),
            password: passwordInput.value,
        });
        if (error) throw error;

        // check the employee's profile before letting them in
        const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("role, is_active, must_set_password")
            .eq("profile_id", data.user.id)
            .single();

        if (profileError || !profile)
            throw new Error("Employee profile not found.");

        if (profile.must_set_password) {
            throw new Error(
                "Your account has not been activated. Please use your invitation email to set your password.",
            );
        }

        if (!profile.is_active) throw new Error("Your account is inactive.");

        const home = homeByRole[profile.role];
        if (!home) throw new Error("Invalid employee role.");

        window.location.replace(home);
    } catch (error) {
        console.error("Login error:", error);
        showError(error.message || "An unknown error occurred.");

        // sign back out so a failed check doesn't leave a session behind
        await supabase.auth.signOut();

        signinButton.disabled = false;
        signinButton.textContent = "Sign in";
    }
});

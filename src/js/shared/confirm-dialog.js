// styled replacement for the browser's confirm() box, shared by every page
// usage:
//   import { confirmDialog } from "../shared/confirm-dialog.js";
//   if (await confirmDialog({ title: "Discard this new job?", confirmLabel: "Discard" })) hide();
// resolves true when the user confirms, false when they cancel, press escape or click outside

const ICONS = {
    // warning triangle for "danger", check circle for "primary"
    danger: "M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z",
    primary: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
};

// class names are written out in full so tailwind can find them
const TONES = {
    danger: {
        icon: "bg-status-overdue/15 text-status-overdue border-status-overdue/30",
        border: "border-status-overdue/40",
        button: "bg-status-overdue/10 text-status-overdue border border-status-overdue/40 hover:bg-status-overdue/20",
    },
    primary: {
        icon: "bg-accent/15 text-accent border-accent/30",
        border: "border-accent/40",
        button: "btn-primary",
    },
};

let resolveOpen = null; // resolves the dialog that's on screen
let lastFocused = null;

const $ = (id) => document.getElementById(id);

function ensureMarkup() {
    if ($("confirm-dialog")) return;
    document.body.insertAdjacentHTML("beforeend", `
        <div id="confirm-dialog" class="hidden fixed inset-0 z-70 items-center justify-center p-4" role="alertdialog" aria-modal="true"
            aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message">
            <div data-confirm-backdrop class="absolute inset-0 bg-black/60 backdrop-blur-[2px] opacity-0 transition-opacity duration-150"></div>
            <div id="confirm-dialog-box" class="relative w-full max-w-sm bg-surface border rounded-2xl p-5 shadow-2xl flex flex-col gap-4 opacity-0 scale-95 transition duration-150">
                <div class="flex items-start gap-3">
                    <span id="confirm-dialog-icon" class="size-10 rounded-xl border flex items-center justify-center shrink-0">
                        <svg class="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path id="confirm-dialog-icon-path" /></svg>
                    </span>
                    <div class="min-w-0">
                        <h3 id="confirm-dialog-title" class="text-sm font-bold uppercase tracking-wider font-display"></h3>
                        <p id="confirm-dialog-message" class="text-xs text-muted mt-1 leading-relaxed"></p>
                    </div>
                </div>
                <div class="flex justify-end gap-2">
                    <button type="button" id="confirm-dialog-cancel" class="btn btn-secondary py-2 text-xs uppercase tracking-wider"></button>
                    <button type="button" id="confirm-dialog-ok" class="btn py-2 text-xs uppercase tracking-wider"></button>
                </div>
            </div>
        </div>`);

    $("confirm-dialog-ok").addEventListener("click", () => finish(true));
    $("confirm-dialog-cancel").addEventListener("click", () => finish(false));
    $("confirm-dialog").querySelector("[data-confirm-backdrop]").addEventListener("click", () => finish(false));

    // capture phase on window runs before the page's own escape handlers,
    // so escape closes only this box and not the modal or drawer behind it
    window.addEventListener("keydown", (e) => {
        if (!resolveOpen) return;
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopImmediatePropagation();
            finish(false);
        } else if (e.key === "Tab") {
            // keep focus on the two buttons
            e.preventDefault();
            const next = document.activeElement === $("confirm-dialog-ok") ? "confirm-dialog-cancel" : "confirm-dialog-ok";
            $(next).focus();
        }
    }, true);
}

function finish(result) {
    if (!resolveOpen) return;
    const resolve = resolveOpen;
    resolveOpen = null;

    const root = $("confirm-dialog");
    root.querySelector("[data-confirm-backdrop]").classList.replace("opacity-100", "opacity-0");
    $("confirm-dialog-box").classList.add("opacity-0", "scale-95");
    setTimeout(() => {
        if (!resolveOpen) root.classList.replace("flex", "hidden");
    }, 150);

    lastFocused?.focus?.();
    resolve(result);
}

// true while a question box is on screen
export const isConfirmOpen = () => resolveOpen !== null;

export function confirmDialog({
    title,
    message = "",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    tone = "danger", // "danger" for discarding or deleting, "primary" for a normal yes/no
} = {}) {
    ensureMarkup();
    if (resolveOpen) return Promise.resolve(false); // one box at a time

    const look = TONES[tone] ?? TONES.danger;
    $("confirm-dialog-title").textContent = title;
    $("confirm-dialog-message").textContent = message;
    $("confirm-dialog-message").classList.toggle("hidden", !message);
    $("confirm-dialog-ok").textContent = confirmLabel;
    $("confirm-dialog-cancel").textContent = cancelLabel;
    $("confirm-dialog-ok").className = `btn ${look.button} py-2 text-xs uppercase tracking-wider`;
    $("confirm-dialog-box").className = `relative w-full max-w-sm bg-surface border ${look.border} rounded-2xl p-5 shadow-2xl flex flex-col gap-4 opacity-0 scale-95 transition duration-150`;
    $("confirm-dialog-icon").className = `size-10 rounded-xl border flex items-center justify-center shrink-0 ${look.icon}`;
    $("confirm-dialog-icon-path").setAttribute("d", ICONS[tone] ?? ICONS.danger);

    lastFocused = document.activeElement;
    const root = $("confirm-dialog");
    root.classList.replace("hidden", "flex");

    // next frame so the fade and scale-in actually run
    requestAnimationFrame(() => {
        root.querySelector("[data-confirm-backdrop]").classList.replace("opacity-0", "opacity-100");
        $("confirm-dialog-box").classList.remove("opacity-0", "scale-95");
    });

    // the safe choice gets focus, so a stray enter press doesn't throw work away
    (tone === "danger" ? $("confirm-dialog-cancel") : $("confirm-dialog-ok")).focus();

    return new Promise((resolve) => {
        resolveOpen = resolve;
    });
}
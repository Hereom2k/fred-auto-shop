// small message that slides up in the bottom right corner, shared by every page
// usage:
//   import { showToast } from "../shared/toast.js";
//   showToast("Customer added", "Ravi Persaud was saved");
//   showToast("Couldn't save", "Check your connection and try again", "error");

const ICONS = {
    success: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
    error: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z",
};

// class names are written out in full so tailwind can find them
const TONES = {
    success: { border: "border-accent/40", icon: "bg-accent/20 text-accent", subtitle: "text-accent" },
    error: { border: "border-status-overdue/40", icon: "bg-status-overdue/20 text-status-overdue", subtitle: "text-status-overdue" },
};

let timer = null;

const $ = (id) => document.getElementById(id);

function ensureMarkup() {
    if ($("app-toast")) return;
    document.body.insertAdjacentHTML("beforeend", `
        <div id="app-toast" role="status" aria-live="polite"
            class="fixed bottom-6 right-6 z-80 translate-y-24 opacity-0 pointer-events-none transition duration-300">
            <div id="app-toast-box" class="bg-surface border rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3 max-w-sm">
                <span id="app-toast-icon" class="size-7 rounded-full flex items-center justify-center shrink-0">
                    <svg class="size-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path id="app-toast-path" /></svg>
                </span>
                <div class="min-w-0">
                    <p id="app-toast-title" class="text-xs font-bold text-ink"></p>
                    <p id="app-toast-subtitle" class="text-[11px]"></p>
                </div>
            </div>
        </div>`);
}

export function showToast(title, subtitle = "", tone = "success") {
    ensureMarkup();
    const look = TONES[tone] ?? TONES.success;

    $("app-toast-title").textContent = title;
    $("app-toast-subtitle").textContent = subtitle;
    $("app-toast-subtitle").className = `text-[11px] ${look.subtitle}`;
    $("app-toast-box").className = `bg-surface border ${look.border} rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3 max-w-sm`;
    $("app-toast-icon").className = `size-7 rounded-full flex items-center justify-center shrink-0 ${look.icon}`;
    $("app-toast-path").setAttribute("d", ICONS[tone] ?? ICONS.success);

    const toast = $("app-toast");
    toast.classList.remove("translate-y-24", "opacity-0");

    clearTimeout(timer);
    timer = setTimeout(() => toast.classList.add("translate-y-24", "opacity-0"), 3500);
}

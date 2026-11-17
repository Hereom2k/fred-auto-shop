// shared top bar: mobile menu button, global search, date and time, and the theme toggle
// drawn by initPage() in page.js, so pages don't call this themselves

import { supabase } from "../lib/supabase.js";

const ICONS = {
    menu: "M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z",
    search: "M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
    sun: "M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z",
    moon: "M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z",
    customer: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
    vehicle: "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z",
    job: "M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z",
};

// where search results go (change these if the detail pages read a different parameter)
const CUSTOMER_PAGE = (id) => `/pages/customer-details.html?id=${id}`;
const JOB_PAGE = (id) => `/pages/jobs.html?job=${id}`;

const RESULTS_PER_GROUP = 5;

function icon(name, size = "size-5") {
    return `<svg class="${size} shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
}

// ---------- theme ----------

// localStorage can throw in some browsers, so every use is wrapped
function getSavedTheme() {
    try {
        return localStorage.getItem("theme") === "light" ? "light" : "dark";
    } catch {
        return "dark";
    }
}

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
}

// runs as soon as this file is imported, before the login check, so the page doesn't flash dark first
applyTheme(getSavedTheme());

// switch: knob on the left with a sun = light, knob on the right with a moon = dark
function updateThemeSwitch(button, theme) {
    const isDark = theme === "dark";
    const knob = button.querySelector("[data-knob]");

    button.setAttribute("aria-checked", String(isDark));
    button.title = isDark ? "Switch to light mode" : "Switch to dark mode";
    knob.classList.toggle("translate-x-6", isDark);
    knob.innerHTML = isDark ? icon("moon", "size-3") : icon("sun", "size-3");
}

// ---------- search ----------

// characters that would break the supabase filter syntax get swapped for spaces
function cleanTerm(text) {
    return text.replace(/[%,()*\\]/g, " ").trim();
}

async function runSearch(term) {
    const like = `%${term}%`;

    const [customers, vehicles, jobs] = await Promise.all([
        supabase
            .from("customers")
            .select("customer_id, full_name, phone_number")
            .or(`full_name.ilike.${like},phone_number.ilike.${like}`)
            .order("full_name")
            .limit(RESULTS_PER_GROUP),
        supabase
            .from("vehicles")
            .select("vehicle_id, customer_id, plate_number, make, model, year")
            .ilike("plate_number", like)
            .order("plate_number")
            .limit(RESULTS_PER_GROUP),
        supabase
            .from("jobs")
            .select("job_id, problem_description, customers ( full_name )")
            .ilike("problem_description", like)
            .order("registered_at", { ascending: false })
            .limit(RESULTS_PER_GROUP),
    ]);

    const error = customers.error || vehicles.error || jobs.error;
    if (error) throw error;

    return {
        customers: customers.data,
        vehicles: vehicles.data,
        jobs: jobs.data,
    };
}

function resultItem(href, iconName, title, subtitle) {
    return `
        <a href="${href}" class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-raised focus:bg-raised focus:outline-none transition">
            <span class="size-8 rounded-lg bg-raised text-muted flex items-center justify-center">${icon(iconName, "size-4")}</span>
            <span class="min-w-0">
                <span class="block text-sm font-semibold text-ink truncate">${title}</span>
                <span class="block text-xs text-muted truncate">${subtitle}</span>
            </span>
        </a>`;
}

function resultGroup(label, itemsHtml) {
    if (!itemsHtml) return "";
    return `
        <div class="py-1">
            <p class="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted">${label}</p>
            ${itemsHtml}
        </div>`;
}

function renderResults({ customers, vehicles, jobs }) {
    const customerItems = customers
        .map((c) => resultItem(CUSTOMER_PAGE(c.customer_id), "customer", escapeHtml(c.full_name), escapeHtml(c.phone_number)))
        .join("");

    const vehicleItems = vehicles
        .map((v) =>
            resultItem(
                CUSTOMER_PAGE(v.customer_id),
                "vehicle",
                `<span class="font-mono">${escapeHtml(v.plate_number)}</span>`,
                escapeHtml(`${v.year} ${v.make} ${v.model}`),
            ),
        )
        .join("");

    const jobItems = jobs
        .map((j) =>
            resultItem(
                JOB_PAGE(j.job_id),
                "job",
                escapeHtml(j.problem_description),
                escapeHtml(j.customers?.full_name ?? "Unknown customer"),
            ),
        )
        .join("");

    const html =
        resultGroup("Customers", customerItems) +
        resultGroup("Vehicles", vehicleItems) +
        resultGroup("Jobs", jobItems);

    return html || `<p class="p-4 text-sm text-center text-muted">No records found</p>`;
}

// ---------- date ----------

// e.g. a tile with NOV over 16, then "Monday" over "3:48 PM"
function renderDate(el) {
    const now = new Date();
    const month = now.toLocaleString("en-GB", { month: "short" }).toUpperCase();
    const day = now.getDate();
    const weekday = now.toLocaleString("en-GB", { weekday: "long" });
    const time = now.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" });
    const full = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    el.title = full;
    el.innerHTML = `
        <span class="w-9 overflow-hidden rounded-md border border-line-strong bg-inset text-center leading-none">
            <span class="block py-0.5 bg-accent text-neutral-950 text-[8px] font-bold tracking-wider">${month}</span>
            <span class="block py-1 font-display text-sm font-bold text-ink">${day}</span>
        </span>
        <span class="leading-tight">
            <span class="block text-sm font-semibold text-ink">${weekday}</span>
            <span class="block text-xs font-mono text-muted">${time}</span>
        </span>`;
}

function startClock() {
    const el = document.getElementById("topbar-date");
    renderDate(el);

    // line up with the start of the next minute, then update once a minute
    const msToNextMinute = 60000 - (Date.now() % 60000);
    setTimeout(() => {
        renderDate(el);
        setInterval(() => renderDate(el), 60000);
    }, msToNextMinute);
}

// ---------- top bar ----------

export function renderTopbar() {
    const html = `
        <header id="topbar"
                class="sticky top-0 z-30 h-16 flex items-center gap-2 px-4 md:px-6 bg-surface/90 backdrop-blur border-b border-line">

            <!-- opens the sidebar on mobile -->
            <button type="button" data-sidebar-open
                    class="md:hidden size-9 rounded-lg flex items-center justify-center text-muted hover:bg-raised hover:text-ink transition cursor-pointer"
                    aria-label="Open menu">
                ${icon("menu")}
            </button>

            <!-- search: only the icon shows until it's clicked -->
            <div id="search-box" class="relative flex items-center gap-1">
                <button type="button" id="search-toggle"
                        class="size-9 rounded-lg flex items-center justify-center text-muted hover:bg-raised hover:text-ink transition cursor-pointer"
                        aria-label="Search" aria-expanded="false" title="Search ( / )">
                    ${icon("search")}
                </button>

                <div id="search-field-wrap" class="w-0 overflow-hidden transition-[width] duration-200 ease-out">
                    <input id="global-search" type="search" autocomplete="off" tabindex="-1"
                           placeholder="Search customers, jobs or plates"
                           class="field py-1.5" />
                </div>

                <div id="search-results"
                     class="hidden absolute left-0 top-full mt-2 w-[min(24rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto card p-1 shadow-2xl shadow-black/40">
                </div>
            </div>

            <!-- right side -->
            <div class="ml-auto flex items-center gap-2">
                <!-- date: a small calendar tile, then the weekday and a live clock -->
                <div id="topbar-date" class="hidden sm:flex items-center gap-2.5 pr-2 mr-1 border-r border-line"></div>
                <!-- light / dark switch -->
                <button type="button" id="theme-toggle" role="switch" aria-label="Dark mode"
                        class="relative w-12.5 h-6.5 shrink-0 rounded-full bg-raised border border-line-strong
                               hover:border-accent transition-colors cursor-pointer
                               focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                    <span data-knob
                          class="absolute top-0.5 left-0.5 size-5 rounded-full bg-accent text-neutral-950
                                 flex items-center justify-center shadow transition-transform duration-200 ease-out">
                    </span>
                </button>
            </div>
        </header>`;

    // goes straight after the sidebar so it sits at the top of the page content
    const sidebar = document.getElementById("sidebar");
    if (sidebar) sidebar.insertAdjacentHTML("afterend", html);
    else document.body.insertAdjacentHTML("afterbegin", html);

    startClock();
    setupThemeToggle();
    setupSearch();
}

function setupThemeToggle() {
    const button = document.getElementById("theme-toggle");
    updateThemeSwitch(button, getSavedTheme());

    button.addEventListener("click", () => {
        const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
        applyTheme(next);
        try {
            localStorage.setItem("theme", next);
        } catch {
            // the choice just won't be remembered
        }
        updateThemeSwitch(button, next);
    });
}

function setupSearch() {
    const box = document.getElementById("search-box");
    const toggle = document.getElementById("search-toggle");
    const wrap = document.getElementById("search-field-wrap");
    const input = document.getElementById("global-search");
    const results = document.getElementById("search-results");

    let isOpen = false;
    let timer = null;
    let latestRequest = 0; // so an old, slow search can't overwrite a newer one

    const openWidth = ["w-52", "sm:w-80"];

    function open() {
        if (isOpen) return input.focus();
        isOpen = true;
        wrap.classList.remove("w-0");
        wrap.classList.add(...openWidth);
        input.tabIndex = 0;
        toggle.setAttribute("aria-expanded", "true");
        input.focus();
    }

    function close() {
        if (!isOpen) return;
        isOpen = false;
        wrap.classList.add("w-0");
        wrap.classList.remove(...openWidth);
        input.tabIndex = -1;
        input.value = "";
        results.classList.add("hidden");
        results.innerHTML = "";
        toggle.setAttribute("aria-expanded", "false");
        clearTimeout(timer);
    }

    // clicking the icon opens it, clicking again closes it
    toggle.addEventListener("click", () => (isOpen ? close() : open()));

    input.addEventListener("input", () => {
        clearTimeout(timer);
        const term = cleanTerm(input.value);

        if (term.length < 2) {
            results.classList.add("hidden");
            return;
        }

        results.classList.remove("hidden");
        results.innerHTML = `<p class="p-4 text-sm text-center text-muted">Searching...</p>`;

        // wait until they stop typing for a moment before asking supabase
        timer = setTimeout(async () => {
            const requestId = ++latestRequest;
            try {
                const data = await runSearch(term);
                if (requestId !== latestRequest) return;
                results.innerHTML = renderResults(data);
            } catch (error) {
                if (requestId !== latestRequest) return;
                console.error("Search failed:", error);
                results.innerHTML = `<p class="p-4 text-sm text-center text-muted">Search isn't working right now. Try again.</p>`;
            }
        }, 250);
    });

    // enter opens the first result
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            const first = results.querySelector("a");
            if (first) window.location.href = first.href;
        }
    });

    // close on escape or a click anywhere else
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") close();

        // "/" opens search, unless they're already typing somewhere
        const typing = event.target.closest?.("input, textarea, select, [contenteditable='true']");
        if (event.key === "/" && !typing) {
            event.preventDefault();
            open();
        }
    });

    document.addEventListener("click", (event) => {
        if (!box.contains(event.target)) close();
    });
}
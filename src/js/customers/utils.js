// small helpers shared by the customers list, the customer profile and the modals
//
// usage:
//   import { escapeHtml, initials, avatarClass, formatDate } from "./utils.js";

// text from the database gets escaped before it goes into html
export function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
}

// "Ravi Persaud" -> "RP"
export function initials(name) {
    const parts = (name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    return parts
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join("");
}

// avatar colours, written out in full so tailwind can find them
const AVATARS = [
    "bg-primary-500/15 text-primary-400 border-primary-500/40",
    "bg-tertiary-500/15 text-tertiary-400 border-tertiary-500/40",
    "bg-secondary-500/15 text-secondary-400 border-secondary-500/40",
    "bg-status-awaiting-parts/15 text-status-awaiting-parts border-status-awaiting-parts/40",
    "bg-status-overdue/15 text-status-overdue border-status-overdue/40",
];

// the same id always gets the same colour, so a customer looks the same on every page
export function avatarClass(id) {
    let sum = 0;
    for (const ch of String(id ?? "")) sum += ch.charCodeAt(0);
    return AVATARS[sum % AVATARS.length];
}

// e.g. 2025-03-12
export const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString("en-CA") : "");

// e.g. March 2025
export const formatMonthYear = (iso) =>
    iso ? new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "";

// e.g. March 18, 2025
export const formatLongDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";

// e.g. 2021 Toyota Hilux
export const vehicleName = (v) => (v ? `${v.year} ${v.make} ${v.model}` : "");

// "Admin" or "Staff" for the created by column and filter
export const roleLabel = (role) => (role === "admin" ? "Admin" : "Staff");

// short readable id from a uuid, same idea as the job numbers in the job drawer, e.g. 3F9A1C
export const shortId = (id) => String(id ?? "").replace(/-/g, "").slice(-6).toUpperCase();
// printable sheets for the customers pages, shown in the browser's print dialog
// (where "Save as PDF" is one of the printers), so no pdf library is needed
//   - service history: one customer, their vehicles and job history (customer profile page)
//   - customer list: whatever the customers table is showing (customers page)
//
// usage:
//   import { printServiceHistory, printCustomerList } from "./print-history.js";
//   printServiceHistory({ customer, vehicles, jobs, statusLabel: (status) => "Delivered" });
//   printCustomerList({ customers, summary: "Sorted by Name (A-Z)", showCreator: true });
//
// the sheet is built in a hidden iframe with its own light styles, so the app's sidebar,
// dark theme and buttons never end up on the page, and popup blockers don't get in the way

import { escapeHtml, formatDate, formatMonthYear, vehicleName, shortId, roleLabel } from "./utils.js";

const SHOP_NAME = "Fred's Auto Electrical";

// styles for the printed page only; plain css because tailwind isn't loaded inside the iframe
const STYLES = `
    @page { size: A4; margin: 16mm 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Inter", Arial, sans-serif; font-size: 11px; color: #16191e; }
    h1, h2 { font-family: "Space Grotesk", Arial, sans-serif; margin: 0; }
    .mono { font-family: "JetBrains Mono", "Courier New", monospace; }
    .muted { color: #5f6670; }

    header { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 10px; border-bottom: 2px solid #0d9488; }
    .shop { font-family: "Space Grotesk", Arial, sans-serif; font-size: 18px; font-weight: 700; letter-spacing: 0.04em; }
    .shop span { color: #0d9488; }
    .doc-title { text-align: right; }
    .doc-title h1 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.12em; }

    .customer { display: flex; justify-content: space-between; gap: 24px; margin: 18px 0 6px; }
    .customer h2 { font-size: 20px; text-transform: uppercase; letter-spacing: 0.05em; }
    .customer p { margin: 3px 0; }
    .stats { display: flex; gap: 18px; text-align: center; }
    .stats strong { display: block; font-family: "Space Grotesk", Arial, sans-serif; font-size: 18px; color: #0d9488; }
    .stats span { font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; }

    section { margin-top: 18px; }
    section h3 { font-family: "Space Grotesk", Arial, sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; margin: 0 0 6px; }
    table { width: 100%; border-collapse: collapse; }
    thead { display: table-header-group; } /* repeat the header row on every printed page */
    th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: #5f6670; background: #eef0f3; padding: 6px 8px; border-bottom: 1px solid #c2c8cf; }
    td { padding: 6px 8px; border-bottom: 1px solid #e2e6ea; vertical-align: top; }
    tr { page-break-inside: avoid; }
    .plate { font-family: "JetBrains Mono", "Courier New", monospace; font-weight: 700; letter-spacing: 0.05em; padding: 1px 5px; border: 1px solid #c2c8cf; border-radius: 3px; white-space: nowrap; }
    .status { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; }
    .note { color: #5f6670; font-size: 10px; margin-top: 2px; }
    .empty { padding: 10px 8px; color: #5f6670; font-style: italic; }
    .nowrap { white-space: nowrap; }

    .summary { margin: 14px 0 0; }
    .list td { padding: 5px 8px; }
    .num { text-align: center; }

    footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #c2c8cf; display: flex; justify-content: space-between; color: #5f6670; font-size: 9px; }
`;

// "18 Nov 2026, 12:20 AM" for the printed on line
const printedAt = () =>
    new Date().toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

// the shared page around every sheet: shop header, the sheet's own content, printed-on footer
function page({ title, docTitle, docSubtitle, content }) {
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap" />
    <style>${STYLES}</style>
</head>
<body>
    <header>
        <div class="shop">FRED'S <span>AUTO ELECTRICAL</span></div>
        <div class="doc-title">
            <h1>${escapeHtml(docTitle)}</h1>
            <div class="muted mono">${escapeHtml(docSubtitle)}</div>
        </div>
    </header>
    ${content}
    <footer>
        <span>${escapeHtml(SHOP_NAME)}</span>
        <span>Printed ${printedAt()}</span>
    </footer>
</body>
</html>`;
}

// ---------- service history (one customer) ----------

function buildSheet({ customer, vehicles, jobs, statusLabel }) {
    const e = escapeHtml;

    const contact = [
        `<span class="mono">${e(customer.phone_number)}</span>`,
        customer.email ? e(customer.email) : "",
    ]
        .filter(Boolean)
        .join(" &nbsp;·&nbsp; ");

    const vehicleRows = vehicles.length
        ? vehicles
              .map(
                  (v) => `
            <tr>
                <td><span class="plate">${e(v.plate_number)}</span></td>
                <td>${e(vehicleName(v))}</td>
                <td>${e(v.colour ?? "")}</td>
                <td>${e(v.engine_trim ?? "")}</td>
            </tr>`,
              )
              .join("")
        : `<tr><td colspan="4" class="empty">No vehicles registered.</td></tr>`;

    const jobRows = jobs.length
        ? jobs
              .map(
                  (j) => `
            <tr>
                <td class="mono nowrap">#${shortId(j.job_id)}</td>
                <td class="mono nowrap">${formatDate(j.registered_at)}</td>
                <td class="nowrap">${e(vehicleName(j.vehicles))}${j.vehicles?.plate_number ? `<div class="note mono">${e(j.vehicles.plate_number)}</div>` : ""}</td>
                <td>${e(j.problem_description)}${j.note_for_next_time ? `<div class="note">Note: ${e(j.note_for_next_time)}</div>` : ""}</td>
                <td class="status">${e(statusLabel(j.status))}</td>
                <td class="mono nowrap">${j.delivered_at ? formatDate(j.delivered_at) : "-"}</td>
            </tr>`,
              )
              .join("")
        : `<tr><td colspan="6" class="empty">No jobs yet.</td></tr>`;

    const content = `
    <div class="customer">
        <div>
            <h2>${e(customer.full_name)}</h2>
            <p>${contact}</p>
            ${customer.address ? `<p class="muted">${e(customer.address)}</p>` : ""}
            <p class="muted">Customer since ${formatMonthYear(customer.created_at)}</p>
        </div>
        <div class="stats">
            <div><strong>${vehicles.length}</strong><span class="muted">Vehicles</span></div>
            <div><strong>${jobs.length}</strong><span class="muted">Total jobs</span></div>
        </div>
    </div>

    <section>
        <h3>Vehicles</h3>
        <table>
            <thead><tr><th>Plate</th><th>Vehicle</th><th>Colour</th><th>Engine / Trim</th></tr></thead>
            <tbody>${vehicleRows}</tbody>
        </table>
    </section>

    <section>
        <h3>Job History</h3>
        <table>
            <thead><tr><th>Job #</th><th>Registered</th><th>Vehicle</th><th>Work</th><th>Status</th><th>Delivered</th></tr></thead>
            <tbody>${jobRows}</tbody>
        </table>
    </section>`;

    return page({
        title: `Service History - ${customer.full_name}`,
        docTitle: "Service History",
        docSubtitle: `Customer ID #${shortId(customer.customer_id)}`,
        content,
    });
}

export function printServiceHistory(data) {
    printDocument(buildSheet(data), `Service History - ${data.customer.full_name}`);
}

// ---------- customer list ----------

// customers are in the shape customers.js uses: { id, name, phone, email, since, vehicles, jobCount, creatorName, creatorRole }
function buildList({ customers, summary, showCreator }) {
    const e = escapeHtml;
    const columns = showCreator ? 7 : 6;

    const rows = customers.length
        ? customers
              .map(
                  (c) => `
            <tr>
                <td><strong>${e(c.name)}</strong>${c.email ? `<div class="note">${e(c.email)}</div>` : ""}</td>
                <td class="mono nowrap">${e(c.phone)}</td>
                <td class="mono nowrap">${formatDate(c.since)}</td>
                <td>${
                    c.vehicles.length
                        ? c.vehicles.map((v) => `<div>${e(vehicleName(v))} <span class="note mono">${e(v.plate_number)}</span></div>`).join("")
                        : `<span class="muted">-</span>`
                }</td>
                <td class="num">${c.vehicles.length}</td>
                <td class="num">${c.jobCount}</td>
                ${showCreator ? `<td>${c.creatorName ? `${e(c.creatorName)} <span class="note">(${roleLabel(c.creatorRole)})</span>` : `<span class="muted">Unknown</span>`}</td>` : ""}
            </tr>`,
              )
              .join("")
        : `<tr><td colspan="${columns}" class="empty">No customers match the current search and filters.</td></tr>`;

    const content = `
    <p class="summary muted">${e(summary)}</p>
    <section>
        <table class="list">
            <thead><tr>
                <th>Customer</th><th>Phone</th><th>Member since</th><th>Vehicles</th><th class="num">#</th><th class="num">Jobs</th>
                ${showCreator ? "<th>Created by</th>" : ""}
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>
    </section>`;

    return page({
        title: `Customers - ${formatDate(new Date().toISOString())}`,
        docTitle: "Customer List",
        docSubtitle: `${customers.length} customer${customers.length === 1 ? "" : "s"}`,
        content,
    });
}

export function printCustomerList(data) {
    printDocument(buildList(data), `Customers - ${formatDate(new Date().toISOString())}`);
}

// ---------- printing ----------

// writes the sheet into a hidden iframe and opens the print dialog for it
function printDocument(html, fileName) {
    // reuse one hidden frame, swapping in the new sheet each time
    document.getElementById("print-frame")?.remove();
    const frame = document.createElement("iframe");
    frame.id = "print-frame";
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
    document.body.appendChild(frame);

    const doc = frame.contentDocument;
    doc.open();
    doc.write(html);
    doc.close();

    // the "save as pdf" file name comes from the page title, so borrow it while the dialog is open
    const pageTitle = document.title;
    document.title = fileName;
    frame.contentWindow.addEventListener("afterprint", () => (document.title = pageTitle));

    // wait for the fonts (or 1.5s at most, if they're slow or offline) so the sheet is laid out before printing
    const fontsReady = doc.fonts?.ready ?? Promise.resolve();
    const timeout = new Promise((resolve) => setTimeout(resolve, 1500));
    Promise.race([fontsReady, timeout]).then(() => {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        // some browsers don't fire afterprint for iframes; print() blocks until the dialog closes
        document.title = pageTitle;
    });
}
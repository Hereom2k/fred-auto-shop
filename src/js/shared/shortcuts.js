// helpers for keyboard shortcuts: macs use cmd, everyone else uses ctrl
//   import { matchesShortcut, shortcutHint } from "../shared/shortcuts.js";
//   if (matchesShortcut(e, "s")) { ... }
//   `<button class="btn relative group">Save ${shortcutHint("s", "above")}</button>`

const platform = navigator.userAgentData?.platform ?? navigator.platform ?? "";
export const isMac = /mac|iphone|ipad/i.test(platform);

// e.g. "Ctrl+S" or "⌘S"
export const shortcutLabel = (key) => (isMac ? `⌘${key.toUpperCase()}` : `Ctrl+${key.toUpperCase()}`);

// value for the button's aria-keyshortcuts attribute
export const shortcutAria = (key) => `${isMac ? "Meta" : "Control"}+${key.toUpperCase()}`;

// true for ctrl+key (cmd+key on a mac) with no shift or alt
export function matchesShortcut(e, key) {
    const modifier = isMac ? e.metaKey : e.ctrlKey;
    return modifier && !e.shiftKey && !e.altKey && e.key.toLowerCase() === key;
}

// the faint hint shown on hover, same look as the new job button's
// the button needs "relative group"; use "above" for buttons near the bottom of the screen
export function shortcutHint(key, place = "below") {
    const position = place === "above" ? "bottom-full mb-1.5" : "top-full mt-1.5";
    return `
        <span role="tooltip" class="pointer-events-none absolute ${position} right-0 whitespace-nowrap font-mono text-[10px] normal-case tracking-wide text-muted/70
                   opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-hover:delay-300 group-focus-visible:opacity-100">
            <kbd>${shortcutLabel(key)}</kbd>
        </span>`;
}
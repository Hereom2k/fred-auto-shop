---
name: Obsidian Telemetry
colors:
  surface: '#121314'
  surface-dim: '#121314'
  surface-bright: '#38393a'
  surface-container-lowest: '#0d0e0f'
  surface-container-low: '#1b1c1d'
  surface-container: '#1f2021'
  surface-container-high: '#292a2b'
  surface-container-highest: '#343536'
  on-surface: '#e3e2e3'
  on-surface-variant: '#bbcac6'
  inverse-surface: '#e3e2e3'
  inverse-on-surface: '#303031'
  outline: '#859490'
  outline-variant: '#3c4947'
  surface-tint: '#4fdbc8'
  primary: '#4fdbc8'
  on-primary: '#003731'
  primary-container: '#14b8a6'
  on-primary-container: '#00423b'
  inverse-primary: '#006b5f'
  secondary: '#b4c5ff'
  on-secondary: '#002a78'
  secondary-container: '#0053db'
  on-secondary-container: '#cdd7ff'
  tertiary: '#d0bcff'
  on-tertiary: '#3c0091'
  tertiary-container: '#b192ff'
  on-tertiary-container: '#4700aa'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#71f8e4'
  primary-fixed-dim: '#4fdbc8'
  on-primary-fixed: '#00201c'
  on-primary-fixed-variant: '#005048'
  secondary-fixed: '#dbe1ff'
  secondary-fixed-dim: '#b4c5ff'
  on-secondary-fixed: '#00174b'
  on-secondary-fixed-variant: '#003ea8'
  tertiary-fixed: '#e9ddff'
  tertiary-fixed-dim: '#d0bcff'
  on-tertiary-fixed: '#23005c'
  on-tertiary-fixed-variant: '#5516be'
  background: '#121314'
  on-background: '#e3e2e3'
  surface-variant: '#343536'
typography:
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 1.75rem
    fontWeight: '700'
    lineHeight: 2.25rem
    letterSpacing: 0.05em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 1.375rem
    fontWeight: '700'
    lineHeight: 1.75rem
    letterSpacing: 0.04em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 1.125rem
    fontWeight: '600'
    lineHeight: 1.5rem
    letterSpacing: 0.025em
  title-md:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: '600'
    lineHeight: 1.375rem
  body-md:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.25rem
  body-sm-italic:
    fontFamily: Inter
    fontSize: 0.8125rem
    fontWeight: '400'
    lineHeight: 1.125rem
  label-md:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '500'
    lineHeight: 1.25rem
  label-xs-caps:
    fontFamily: Inter
    fontSize: 0.6875rem
    fontWeight: '700'
    lineHeight: 0.875rem
    letterSpacing: 0.06em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system establishes a high-performance, dark-mode-first aesthetic tailored for automotive service bays, telemetry tracking, and dispatch fleet logistics. The emotional response is one of precision, industrial durability, and frictionless clarity in dimly lit or high-stress operational environments.

Drawing from modern technical minimalism and utility-driven digital cockpit displays, the visual style prioritizes low-eye-strain tonal surfaces (`#131415` through `#1c1d1f`), razor-sharp micro-borders, and punchy, selective neon accents. Information is conveyed with condensed, high-legibility tabular forms, contextual metadata pills, and high-contrast status signifiers. Decorative noise is eliminated in favor of clean horizontal hierarchy, distinct date markers, and immediate operational controls.

## Colors

The palette is engineered around dark charcoal neutrals with saturated functional accents:

- **Surface System**:
  - `canvas-default`: `#131415` — The deep foundation surface for the main viewport and side navigation.
  - `surface-card`: `#1a1b1d` — Raised structural cards and panel containers.
  - `surface-nested`: `#222427` — Secondary date blocks, badge backing, and sub-containers.
  - `border-subtle`: `#2a2b2e` — Standard perimeter borders on interactive tiles and list cards.
  - `border-focus`: `#14b8a6` — Active selection edge indicator.

- **Brand Accents**:
  - `primary` (`#14b8a6` / `#00c49f`): High-energy cyan/teal for key actions, positive confirmations, active navigation bars, and primary buttons.
  - `primary-container`: `rgba(20, 184, 166, 0.12)` — Subtle teal tint for active pills, date blocks, and icon buttons.
  - `secondary` (`#2563eb` / `#3b82f6`): Deep cobalt blue applied to scheduled appointment pills and informational statuses.
  - `tertiary` (`#8b5cf6` / `#a855f7`): Electric purple reserved for specific service categorical tags (e.g., Inspection tags).

- **Typography & States**:
  - `text-high-contrast`: `#ffffff` — Primary headers, client names, and active labels.
  - `text-secondary`: `#9ca3af` — Date titles, time spans, vehicle makes, and secondary text.
  - `text-muted`: `#6b7280` — Italicized technician work notes, subtitles, and idle action icons.
  - `text-accent-teal`: `#2dd4bf` — Primary colored inline actions and active navigation items.

## Typography

The typography pairing uses **Space Grotesk** for brand headers and main module titles, lending an automotive gauge and telemetry instrument character with capitalized wide-tracking treatment. 

**Inter** handles all body content, technical descriptions, data strings, and contextual badges. Sub-details such as technician job notes and problem diagnostics are explicitly set in italicized muted text (`body-sm-italic`) to create instant visual separation from hard telemetry data like vehicle year, make, and appointment duration. Navigation links and status pills leverage uppercase tracking via `label-xs-caps` for fast visual parsing at a glance.

## Layout & Spacing

The layout follows a fluid split structure with a persistent fixed-width left rail sidebar (width: `240px`) and an expanding operational canvas.

- **Main Work Area**:
  - Top header region includes section titles, secondary count indicators, and top-right primary CTA alignment.
  - Tab views (`Upcoming`, `Past`, `All`) feature an active underline offset directly below section titles.
  - The record feed stacks cards with a rigid vertical rhythm of `space-md` (`0.75rem`), maintaining dense screen utilization suitable for operational desktops.

- **Responsive Adaptations**:
  - **Desktop (>= 1024px)**: Fixed side navigation, horizontal card layout containing the left date indicator block, central customer and vehicle info, and right-aligned action buttons (`Confirm`, `Cancel`).
  - **Tablet (768px - 1023px)**: Compact sidebar navigation; right action buttons remain inline.
  - **Mobile (< 768px)**: Sidebar shifts to a drawer or bottom bar. Cards stack their action buttons underneath the appointment vehicle details to prevent horizontal overflow.

## Elevation & Depth

This system avoids heavy physical drop shadows, relying entirely on **tonal contrast** and **subtle surface borders**:

- **Level 0 (Canvas)**: `#131415` base viewport background.
- **Level 1 (Card Surface)**: `#1a1b1d` with a sharp `1px solid #2a2b2e` low-contrast border. Cards retain a flat, inset appearance.
- **Level 2 (Active/Hover Cards)**: `#1e2023` background with border highlight transitioning to `#3a3b40`.
- **Level 3 (Interactive Floating CTAs / Badges)**: Accent glow is strictly reserved for the primary button (`box-shadow: 0 4px 12px rgba(20, 184, 166, 0.2)`). All status pills and date indicators sit flat within the card container to avoid visual clutter.

## Shapes

Containers and interactive elements feature controlled, ergonomic curvature:
- Outer record cards utilize medium rounding (`0.625rem` / `10px`) to retain an industrial structural edge.
- Inner date-indicator blocks share a complementary curvature (`0.5rem` / `8px`).
- Badges and status indicators are rendered as full pills (`9999px`) to immediately distinguish category metadata from structural containers.
- Form controls and primary action buttons share standard `0.5rem` corners.

## Components

### Buttons
- **Primary Action (`+ New Appointment`)**: Solid teal background (`#14b8a6`), high-contrast dark text (`#0a0a0b`), font weight `600`, with an integrated inline icon. Subtle hover brightness (`#2dd4bf`).
- **Inline Text Actions (`Confirm`)**: Frameless button using teal text (`#14b8a6`), weight `600`, with a dark green/teal pill background highlight on hover.
- **Muted Destructive Action (`Cancel`)**: Frameless button using neutral secondary text (`#9ca3af`), hovering to high-contrast white or soft rose.
- **Icon Actions**: 32x32px circular or rounded target (`#1f2124`) hosting subtle glyphs (e.g., bell notifications, mute alerts).

### Status Pills & Badges
- **Status Pills (`CONFIRMED`, `SCHEDULED`)**:
  - Full-pill geometry (`rounded-full`).
  - Darkened saturated background (Teal container: `rgba(20, 184, 166, 0.2)` / Blue container: `rgba(37, 99, 235, 0.25)`).
  - Bold, uppercase text in cyan (`#2dd4bf`) or blue (`#60a5fa`).
  - Accompanied by a leading 6px solid circular dot indicator.
- **Category Chips (`Service`, `Inspection`, `Repair`, `Consultation`)**:
  - Soft rounded rectangles (`rounded-md`, 4px padding).
  - Muted background (`rgba(255, 255, 255, 0.06)` or service-tinted hue).
  - Subtle colored borders matching the service discipline.

### Appointment List Cards
- Flat cards configured with a 3-column layout:
  1. **Date/Time Stamp**: Left-anchored block (`56x56px`) with surface `#222427`, uppercase month/day or `TODAY` label.
  2. **Core Data**: Customer name (`text-high-contrast`), service chip, and status pill horizontally aligned; followed by operational time, vehicle specs (`text-secondary`), and italicized diagnostic notes (`text-muted`).
  3. **Controls**: Right-anchored quick actions and notification toggles.

### Navigation Rails
- Vertical sidebar with active indicator bar on the left edge (`3px solid #14b8a6`).
- Active items tinted with a subtle teal gradient background (`rgba(20, 184, 166, 0.08)`).
- Profile footer card displaying avatar initials badge (`40x40px` circular block `#163330` with teal monogram) and staff role hierarchy.
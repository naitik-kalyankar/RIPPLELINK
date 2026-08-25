# kick-manager — Design Guidance

This project follows an S-Tier SaaS Dashboard design standard (inspired by Stripe, Airbnb, Linear). Apply this checklist to all UI work in this repo.

## I. Core Design Philosophy & Strategy

- Users First: Prioritize user needs, workflows, and ease of use in every design decision.
- Meticulous Craft: Aim for precision, polish, and high quality in every UI element and interaction.
- Speed & Performance: Design for fast load times and snappy, responsive interactions.
- Simplicity & Clarity: Strive for a clean, uncluttered interface. Ensure labels, instructions, and information are unambiguous.
- Focus & Efficiency: Help users achieve their goals quickly and with minimal friction. Minimize unnecessary steps or distractions.
- Consistency: Maintain a uniform design language (colors, typography, components, patterns) across the entire dashboard.
- Accessibility (WCAG AA+): Design for inclusivity. Ensure sufficient color contrast, keyboard navigability, and screen reader compatibility.
- Opinionated Design (Thoughtful Defaults): Establish clear, efficient default workflows and settings, reducing decision fatigue for users.

## II. Design System Foundation (Tokens & Core Components)

- Color Palette:
  - Primary Brand Color: user-specified, used strategically.
  - Neutrals: a scale of grays (5-7 steps) for text, backgrounds, borders.
  - Semantic Colors: Success (green), Error/Destructive (red), Warning (yellow/amber), Informational (blue).
  - Dark Mode Palette: corresponding accessible dark mode palette.
  - Accessibility Check: all color combinations meet WCAG AA contrast ratios.
- Typographic Scale:
  - Primary Font Family: clean, legible sans-serif (e.g., Inter, Manrope, system-ui).
  - Modular Scale: distinct sizes for H1, H2, H3, H4, Body Large, Body Medium (Default), Body Small/Caption (e.g., H1: 32px, Body: 14px/16px).
  - Font Weights: limited set (Regular, Medium, SemiBold, Bold).
  - Line Height: generous for readability (1.5-1.7 for body text).
- Spacing Units:
  - Base Unit: e.g., 8px.
  - Spacing Scale: multiples of the base unit for all padding, margins, layout spacing (4, 8, 12, 16, 24, 32px).
- Border Radii:
  - Small: 4-6px for inputs/buttons; Medium: 8-12px for cards/modals.
- Core UI Components (with consistent default/hover/active/focus/disabled states):
  - Buttons (primary, secondary, tertiary/ghost, destructive, link-style; icon options)
  - Input Fields (text, textarea, select, date picker; labels, placeholders, helper text, error messages)
  - Checkboxes & Radio Buttons
  - Toggles/Switches
  - Cards
  - Tables (headers, rows, cells; sorting, filtering)
  - Modals/Dialogs
  - Navigation Elements (Sidebar, Tabs)
  - Badges/Tags
  - Tooltips
  - Progress Indicators (Spinners, Progress Bars)
  - Icons (single, modern, clean SVG icon set)
  - Avatars

## III. Layout, Visual Hierarchy & Structure

- Responsive Grid System (e.g., 12-column).
- Strategic White Space to reduce cognitive load and create balance.
- Clear Visual Hierarchy via typography, spacing, positioning.
- Consistent Alignment.
- Main Dashboard Layout: persistent left sidebar (primary nav), content area, optional top bar (search, profile, notifications).
- Mobile-First Considerations: graceful adaptation to smaller screens.

## IV. Interaction Design & Animations

- Purposeful micro-interactions: subtle feedback for hovers, clicks, form submissions, status changes. Immediate and clear. Quick (150-300ms), appropriate easing (ease-in-out).
- Loading States: skeleton screens for page loads, spinners for in-component actions.
- Smooth transitions for state changes, modals, section expansions.
- Avoid distraction: animations enhance usability, never overwhelm.
- Keyboard Navigation: all interactive elements keyboard-accessible with clear focus states.

## V. Specific Module Design Tactics

### Multimedia Moderation Module

- Clear media display (grid or list view).
- Obvious moderation actions (Approve, Reject, Flag) with distinct styling and icons.
- Color-coded status badges (Pending, Approved, Rejected).
- Contextual metadata (uploader, timestamp, flags) alongside media.
- Workflow efficiency: bulk actions, keyboard shortcuts.
- Minimize fatigue: clean interface, consider dark mode.

### Data Tables Module (Contacts, Admin Settings)

- Readability: left-align text, right-align numbers, bold headers, optional zebra striping, legible typography, adequate row height.
- Interactive controls: column sorting, intuitive filtering, global table search.
- Large datasets: pagination (preferred for admin tables) or virtual/infinite scroll; sticky headers/frozen columns if applicable.
- Row interactions: expandable rows, inline editing, bulk actions with checkboxes + contextual toolbar, per-row action icons.

### Configuration Panels Module (Microsite, Admin Settings)

- Clear, unambiguous labels; concise helper text/tooltips; no jargon.
- Logical grouping into sections/tabs.
- Progressive disclosure for advanced settings (behind toggles/accordions).
- Appropriate input types per setting.
- Immediate visual feedback on save (toasts, inline messages); clear error messages.
- Sensible defaults for all settings.
- "Reset to Defaults" option.
- Live/near-live preview for microsite changes if applicable.

## VI. CSS & Styling Architecture

- Prefer utility-first CSS (Tailwind CSS) with design tokens defined in config.
- Integrate design tokens (colors, fonts, spacing, radii) directly into the styling system.
- Keep styles maintainable, readable, well-organized.
- Optimize CSS delivery; avoid unnecessary bloat.

## VII. General Best Practices

- Iterate on designs; test with users.
- Clear information architecture and logical navigation.
- Fully responsive across desktop, tablet, mobile.
- Keep design system documentation current.

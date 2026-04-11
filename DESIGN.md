# DESIGN.md - DayDay ERP (Management)

## Visual Identity & Tone
- **Style**: Industrial, compact, functional.
- **Tone**: "Get things done".
- **Focus**: Speed of data entry and monitoring.

## Color Palette
- **Primary**: #34495E (Slate Blue) - calm and neutral for long work sessions.
- **Secondary**: #7F8C8D (Asbestos).
- **Background**: #EBEDF0 (System gray).
- **Action**: #2980B9 (Strong Blue).
- **Border (muted)**: #D5DADF — единая чёткая обводка карточек и зон на фоне `#EBEDF0` (не бледный `slate-100` без контраста).

## UX / UI integrity (v8.9)
- **Headings**: page titles use **#34495E**; primary actions use **#2980B9** (`bg-[#2980B9]`, `PRIMARY_BUTTON_CLASS`).
- **Contrast**: interactive controls (buttons, text links) must stay clearly visible on `#EBEDF0`; do not use washed-out grays for primary actions.
- **Iconography**: every sidebar item has a **Lucide** icon; missing icon is a spec violation.
- **Empty states**: centered layout, icon + title + optional description (`EmptyState` component).

## Typography
- **System Fonts**: SF Pro, Segoe UI, sans-serif.
- **Size**: Base 13px (Compact view).

## Component Rules
- **Inputs**: Square corners (2px radius). High-contrast borders for focus.
- **Buttons**: Small (32px height) for toolbar actions.
- **Grid**: Strict 4px baseline grid. 

## Special Instructions
- Use horizontal layouts for desktop tables.
- All numeric data must be right-aligned.

## Treasury (Bank və Kassa) — v7.1
- Sidebar group label: `nav.sectionTreasury` (AZ: Bank və Kassa; RU: Банк и Касса), icon **Landmark**.
- Hub `/banking`: grid of **account cards** (cash 101* + bank 221–224) → **statement import** (dropzone, channel BANK/CASH) → **operations registry** with filter All / Bank / Cash.
- Registry column **Mənbə / Источник**: `origin` on lines (import, sync, invoice system mirror, manual cash-out).
- **Nəqd məxaric**: `POST /api/banking/cash-out` (731 / 101.01 + registry line).
- Enterprise: subscription module checks bypassed server-side for `ENTERPRISE` tier (`SubscriptionAccessService`).
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
- **Page chrome**: use the shared **`PageHeader`** component (`apps/web/components/layout/page-header.tsx`) for page title (line 1, left), optional subtitle under the title, and optional **actions** (line 2, right-aligned toolbar: buttons, back links, period filters). Do not add a horizontal strip of cross-module links above content — module navigation is **sidebar-only** (aligned with PRD §10.1).
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

## Data Tables (v1.0)
- **Header**: Background `#F8FAFC`, Text `#475569` (bold, 11-12px), Border-bottom `#D5DADF`. Sticky header is mandatory for long lists.
- **Rows**: Base background `white`, Hover background `#F1F5F9`.
- **Typography**: All data 13px (`text-[13px]`).
- **Alignment**:
  - Text/Names: Left-aligned.
  - Numbers/Amounts/Dates: Right-aligned (`text-right`) + Monospace font for digits if possible.
  - Status/Badges: Centered.
- **Borders**: Horizontal borders only (`border-b-[#D5DADF]`). No vertical grid lines.
- **Density**: Compact padding (`py-2 px-4`).

## Table Actions & Icons
All row actions must be grouped in the last column (fixed width, e.g., `w-[120px]`). Use **Lucide React** icons.
- **Style**: Ghost buttons, square corners (`rounded-[2px]`), size 28x28px or 32x32px.
- **Standard Icons**:
  - **Baxış (View)**: `Eye` icon, Color `#2980B9` (Action Blue).
  - **Düzəliş (Edit)**: `Pencil` or `Edit3` icon, Color `#7F8C8D` (Asbestos).
  - **Paylaş / Göndər (Send/Share)**: `Send` or `Share2` icon, Color `#2980B9`.
  - **Sil (Delete)**: `Trash2` icon, Color `#E74C3C` (Alizarin Red).
  - **Arxiv / Kilid (Archive/Lock)**: `Archive` or `Lock` icon, Color `#BDC3C7`.
- **Tooltips**: Every icon button must have a tooltip with the action name (AZ/RU).

## Treasury (Bank və Kassa) — v7.1
- Sidebar group label: `nav.sectionTreasury` (AZ: Bank və Kassa; RU: Банк и Касса), icon **Landmark**.
- Hub `/banking`: grid of **account cards** (cash 101* + bank 221–224) → **statement import** (dropzone, channel BANK/CASH) → **operations registry** with filter All / Bank / Cash.
- Registry column **Mənbə / Источник**: `origin` on lines (import, sync, invoice system mirror, manual cash-out).
- **Nəqd məxaric**: `POST /api/banking/cash-out` (731 / 101.01 + registry line).
- Enterprise: subscription module checks bypassed server-side for `ENTERPRISE` tier (`SubscriptionAccessService`).
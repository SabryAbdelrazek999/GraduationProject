# Design Guidelines: Web Vulnerability Scanner

## Design Approach

**Selected Approach:** Design System with Developer Tool Patterns  
**Justification:** This is a utility-focused, information-dense security application requiring clarity, efficiency, and professional credibility. Drawing inspiration from developer tools like GitHub, Linear, and VS Code's interface patterns.

**Core Principles:**
- Data clarity over decoration
- Immediate information hierarchy
- Professional security tool aesthetic
- Efficient workflows for repeated tasks

---

## Typography System

**Font Families:**
- Primary: Inter (via Google Fonts) - for UI elements, labels, body text
- Monospace: JetBrains Mono - for URLs, vulnerability codes, technical details

**Hierarchy:**
- Page Titles: text-2xl font-semibold
- Section Headers: text-lg font-semibold
- Card Titles: text-base font-medium
- Body Text: text-sm font-normal
- Labels/Meta: text-xs font-medium uppercase tracking-wide
- Technical Data: text-sm font-mono

---

## Layout System

**Spacing Primitives:**  
Use Tailwind units: **2, 4, 6, 8, 12, 16** for consistent rhythm
- Component padding: p-4, p-6
- Section spacing: gap-6, gap-8
- Card spacing: p-6
- Table cells: px-4 py-3

**Grid Structure:**
- Sidebar: Fixed width 256px (w-64)
- Main content: flex-1 with max-w-7xl container
- Dashboard stats: 3-column grid (grid-cols-3) on desktop, stack on mobile
- Tables: Full-width with horizontal scroll on mobile

**Viewport Strategy:**
- Dashboard uses natural height based on content
- Tables scroll independently within viewport
- No forced 100vh constraints

---

## Component Library

### Navigation

**Sidebar (Fixed Left):**
- Full-height navigation with logo at top
- Navigation items with icons (from Heroicons)
- Active state with background treatment
- Profile section at bottom with avatar, name, settings access
- Width: w-64, sticky positioning

**Top Bar (Optional):**
- Breadcrumb navigation for deep pages
- Quick actions toolbar
- User profile dropdown on right

### Dashboard Components

**Stat Cards (3-column grid):**
- Icon at top left (scan count, vulnerability shield, clock icons)
- Large metric number (text-4xl font-bold)
- Descriptive label below (text-sm)
- Subtle background with border treatment
- Height: h-32 for consistency

**Activity Feed Table:**
- Headers: Sticky (sticky top-0)
- Columns: Target URL, Scan Status, Vulnerabilities Found, Timestamp, Actions
- Row height: Comfortable padding (py-3)
- Zebra striping for readability
- Status badges with pill shape (rounded-full px-3 py-1)
- Action buttons: Icon-only with tooltips
- Empty state: Centered message with illustration suggestion

### Scan Interface

**URL Input Section:**
- Large, prominent input field (h-12)
- Scan button with loading state (spinner icon)
- Optional advanced settings accordion below
- Scan type selector (Quick Scan, Deep Scan, Custom)
- Recently scanned URLs as quick-access chips below input

**Results Display:**
- Vulnerability cards grouped by severity
- Severity indicators: Critical (badge with icon), High, Medium, Low, Info
- Each card shows: Title, Description, Affected URL, Remediation steps
- Expandable details with code snippets in monospace
- Filter/sort controls at top

### Tables

**Standard Pattern:**
- Fixed header row with sort indicators
- Hover state on rows
- Right-aligned actions column
- Pagination footer: Items per page selector, page numbers, total count
- Mobile: Convert to card layout with stacked information

### Forms & Inputs

**Input Fields:**
- Label above input (text-sm font-medium mb-2)
- Input height: h-10 for text inputs, h-12 for primary search
- Border treatment with focus state
- Helper text below (text-xs)
- Error states with icon and message

**Buttons:**
- Primary action: Prominent treatment (px-6 py-2.5)
- Secondary: Outlined variant
- Danger: For destructive actions (delete scans)
- Icon buttons: w-10 h-10, centered icon

### Cards

**Content Cards:**
- Padding: p-6
- Header with title and optional actions
- Body content with comfortable spacing
- Footer for metadata or actions
- Subtle border treatment

**Scan Report Cards:**
- Severity indicator on left edge (4px colored border)
- Icon representing vulnerability type
- Title and vulnerability ID
- Collapsible description
- Tags for affected technologies

### Modals & Overlays

**Modal Pattern:**
- Centered overlay (max-w-2xl)
- Header with title and close button
- Content area with scroll if needed
- Footer with action buttons (right-aligned)
- Backdrop blur effect

**Toast Notifications:**
- Top-right positioning
- Auto-dismiss after 5 seconds
- Icon + message + close button
- Success, error, warning, info variants

---

## Interactions & States

**Loading States:**
- Skeleton screens for tables and cards
- Spinner for active scans in progress
- Progress bars for scan completion percentage

**Empty States:**
- Centered icon + message + CTA button
- Friendly illustration suggestions (security-themed)
- "Run your first scan" call-to-action

**Error States:**
- Inline validation for forms
- Error banners for scan failures
- Retry options prominently displayed

---

## Page-Specific Layouts

### Dashboard Home
- 3-column stats grid at top (mb-8)
- Recent Activity table below (full-width)
- Quick Scan input as floating card or right sidebar element

### Scan Now Page
- Centered URL input with generous spacing
- Advanced options in expandable section below
- Scan history sidebar showing recent targets
- Live scan progress when active

### Reports Page
- Filterable list view (by date, severity, target)
- Card grid showing report summaries
- Export options in header toolbar
- Detail view as modal or dedicated page

### Settings Page
- Sidebar navigation for setting categories
- Form sections with clear grouping
- Save/Cancel actions sticky at bottom

---

## Images

**No hero images needed** - This is a functional tool dashboard, not a marketing site. Focus on data visualization, icons, and UI clarity instead of decorative imagery.
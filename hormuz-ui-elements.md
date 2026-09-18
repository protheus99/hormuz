# Hormuz — Key UI Elements & Information Architecture

## Core Principle
**No separate policy-builder UI.** Policies emerge from gameplay. The three main screens are:

1. **Overnight Summary** — What happened & what you should know
2. **Automation Opportunities** — Patterns detected, ready to automate
3. **Active Automations** — Running automations & their status

---

## UI ELEMENT 1: OVERNIGHT SUMMARY

**Purpose:** Player wakes up to see the overnight report. No decisions required—purely informational. Surfaces both routine data and alerts that may prompt action.

**Key Information:**
- Alerts (if any: low cash, storage full, chokepoint status change, project at risk)
- Production summary (all fields, extraction rates, development progress)
- Sales & pricing (volumes sold, netback, market comparison, trends)
- Inventory & storage (current levels, days of supply, leased storage status)
- Cash & credit (liquidity, net worth, daily P&L)
- Capital projects (progress bars, time remaining, status)
- Automation activity log (what automations ran overnight, what they did)

**Visual Hierarchy:**
- Alerts at the top (red/orange badges if critical)
- Production cards in a grid (one card per field/refinery)
- Sales/pricing in separate section (market context helps decisions)
- Storage prominently displayed (critical for inventory management)
- Cash position as a status indicator (not a decision prompt)
- Capital projects with visual progress bars
- Automation log at the bottom (tells the story of what the system did)

**Interaction:**
- Player clicks on any card to drill down (expand production details, see all sales orders, etc.)
- Some cards have action buttons: "Sell down storage", "Schedule maintenance", "Pause extraction"
- Navigation to other screens (capital projects, automations, market data, etc.)

---

## UI ELEMENT 2: AUTOMATION OPPORTUNITIES

**Purpose:** System has detected a repeated pattern in your decisions. Offer to automate it. No coding, no dropdowns—just a simple question: "Do you want us to do this for you?"

**Key Information per Opportunity:**
- What pattern was detected
- How many times you did it (consistency)
- Profit/effectiveness (if quantifiable)
- Suggested automation parameters (what the system will do, default values)
- Simple actions: [Automate This] [Adjust & Automate] [Keep Manual]

**Visual Hierarchy:**
- Card per opportunity (max 5–6 suggestions at once)
- Bold title ("Permian Storage Buffer")
- One-liner description (what will be automated)
- Reason box (why the system thinks this is good)
- Effectiveness metric (profit, success rate)
- Three big buttons (clear, high-contrast)

**No Technical Language:**
- NOT: "Set condition: storage_days > 15 AND price > 70"
- YES: "Keep 10–15 days of supply. Sell when exceeds 15 days."

**Interaction:**
- Click [Automate This] → confirmation dialog, then automation runs
- Click [Adjust & Automate] → simple slider/dropdown screen for parameters
- Click [Keep Manual] → opportunity dismissed, but system remembers pattern

---

## UI ELEMENT 3: ACTIVE AUTOMATIONS

**Purpose:** Dashboard showing all running automations. Players can see what the system is doing, pause/adjust/delete any time.

**Key Information per Automation:**
- Name & description (what it does)
- Current status (Active/Paused/Waiting)
- Conditions (in plain English, e.g., "Storage > 15 days")
- Last action taken (when, what happened)
- Effectiveness metrics (profit this session, success rate)
- Health indicator (running smoothly, waiting for signal, etc.)
- Action buttons: [Edit Settings] [Pause] [View History] [Delete]

**Visual Hierarchy:**
- Large card per automation (active ones first, paused at bottom)
- Color-coded border (green = active, gray = paused)
- Status badge (bright green checkmark for active)
- Plain-language conditions (no code)
- Last action timestamp (when did this last run?)
- Profit/health bar (visual indicator of success)
- Four action buttons (inline, easy to reach)

**Interaction:**
- Player can pause any automation without deleting it
- Click [Edit Settings] to adjust parameters (not rebuild from scratch)
- Click [View History] to see all actions taken by this automation
- Automations remain visible while running; player can watch them work

---

## INFORMATION LAYERS

### Layer 1: Overnight Summary
**Frequency:** Once per day (after each turn)
**Scope:** Routine data only (production, sales, inventory, cash)
**Tone:** Neutral reporting
**Example content:**
- Permian: 6,100 bbl extracted, 5,800 bbl sold at $72.30 avg, storage now 18 days
- Guyana: Field dev 30% complete (32/60 days), on schedule

### Layer 2: Alerts (in Overnight Summary)
**Frequency:** As needed
**Scope:** Anomalies, chokepoints, risks, limits approached
**Tone:** Urgent (red), warning (orange), informational (blue)
**Example:**
- ⚠ Storage at 18 days (above 15-day target)
- ⚠ Hormuz chokepoint: OPEN → TENSION (freight +2%)
- ✓ Tier 2 upgrade: 4 of 5 conditions met (margin needs 1 more day)

### Layer 3: Automation Opportunities
**Frequency:** When pattern detected (1–3 per turn)
**Scope:** Patterns you've repeated 3+ times
**Tone:** Helpful suggestion, not pushy
**Example:**
- "You've sold down storage 4 times in the last 7 days, keeping it at 10–15 days. Automate this?"

### Layer 4: Active Automations Dashboard
**Frequency:** Always available
**Scope:** All running automations + their status & actions
**Tone:** Transparent reporting
**Example:**
- Permian Storage Manager: Active | Sold 2,800 bbl Day 52 | +$32,800 this session

---

## INFORMATION DENSITY BY PLAYER EXPERIENCE

### New Player
- Overnight summary: all sections (small, quiet alerts for everything)
- Automation opportunities: 1–2 per day (don't overwhelm)
- Active automations: simplified (show only [Pause] and [Delete])

### Experienced Player
- Overnight summary: can hide sections (production, sales, etc.)
- Automation opportunities: all suggestions shown
- Active automations: full edit/history/settings access

---

## DECISION FLOW WITHIN THESE SCREENS

### Morning Routine (5–10 min)
1. Open game → See overnight summary
2. Read alerts (if any)
3. Check cash/credit position
4. Glance at capital projects progress
5. Optional: Click on "Automation Opportunities" if new suggestions exist
6. Optional: Review "Active Automations" if something unexpected happened

### Weekly Review (10–15 min)
1. Deep dive into overnight summaries (last 7 days)
2. Compare metrics (production, margins, cash trends)
3. Decide: do I want to scale up/down any operations?
4. If yes → make capital decisions (buy concession, drill, upgrade)
5. System detects pattern → offers automation next day
6. Accept or ignore automation suggestion

### Ongoing Automation Management (2–3 min/day)
1. Automation Opportunities panel appears (if new patterns)
2. Choose [Automate] or [Keep Manual]
3. Automations run silently
4. Overnight summary shows what they did
5. Player can pause/adjust/delete anytime from Active Automations screen

---

## VISUAL DESIGN NOTES

### Color Scheme (Dark Theme)
- **Background:** Deep navy (#0f0f1e, #1a1a2e)
- **Accents:** Cyan/teal (#4fb3d9)
- **Positive:** Bright green (#4caf50)
- **Warning:** Orange (#ff9800)
- **Negative/Alert:** Red (#ff6b6b)
- **Text:** Light gray (#d0d0e0)

### Layout
- Cards in responsive grid (2–3 cols on desktop, 1 col on mobile)
- Sections separated by dividers
- Progress bars for time/capacity (visual, not numeric)
- Badges for status (small, high-contrast)
- Buttons inline or in action rows (no modal dialogs)

### Typography
- Headlines: Bold, 16px cyan
- Section titles: Small caps, 11px gray
- Body text: 12px light gray
- Metrics: Large (18px), colored by type (green/red/cyan)
- Status labels: 11px, uppercase, mono-spaced letter-spacing

### Responsiveness
- Desktop: 1400px max width, multi-column grids
- Tablet: 768px, 2-column grids
- Mobile: 380px, 1-column stacked layout
- Touch-friendly buttons: 44px minimum height

---

## TECHNICAL NOTES FOR IMPLEMENTATION

### Overnight Summary
- Generate after each tick (Phase 7)
- Cache data for 24 hours (in-game)
- Show last 7 days' history (player can scroll back)
- Export button: CSV of production/sales/cash

### Automation Opportunities
- Run after Phase 5 (policy evaluation)
- Pattern detection: 3+ identical actions in past 10 days
- Deduplicate similar opportunities (max 5–6 shown)
- Expire suggestions after 3 days if not acted on

### Active Automations
- Persistent dashboard (visible anytime, not just morning)
- Real-time status updates (paused, waiting, running)
- History log: last 30 automation actions (searchable)
- Export: CSV of all automation actions this session

---

## NEXT STEPS

1. **Create interactive mockup** (HTML/CSS) ✅ Done
2. **Define data structure** for overnight summaries
3. **Specify automation detection algorithm** (pattern matching, thresholds)
4. **Implement GameSession API** to feed data to these screens
5. **Test on multiple screen sizes** (mobile first)
6. **Playtest:** Can new players understand overnight summary without tutorial?


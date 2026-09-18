# Hormuz UI Review Summary — Cap2 Analysis & Mockups

## What Was Reviewed
**Capitalism II User Manual, Page 9: Game View**
- Cap2's bottom toolbar architecture (8 sections)
- 6 key UI elements: Construction, Product Summary, Corp Summary, Finance Summary, Markets Hub, Game Speed

## What Hormuz Adopts from Cap2

### ✅ Toolbar Organization
Cap2's **bottom toolbar with dropdown menus** is cleaner than a side-panel approach:
- **Left section:** Action menus (Construction, Markets, Reports, Automations)
- **Right section:** Status bar (Cash, P&L, Date, Speed)
- Dropdowns appear above toolbar (never cover main game view)

### ✅ Menu Structure (4 Sections)
1. **🏗 CAPITAL PROJECTS** — buy concessions, develop, expand, upgrade, maintain
2. **📊 MARKETS** — crude prices, freight rates, concession bids, credit lines
3. **📈 REPORTS** — product, corporation, finance summaries; drill-down capability
4. **🤖 AUTOMATIONS** — opportunities, active automations, history (Hormuz innovation)

### ✅ Reports Pattern (Cap2's Genius)
Cap2 uses **3-level hierarchy** for every report:
```
Level 1: One-screen summary (quick snapshot)
Level 2: Filters (narrow by grade, status, region)
Level 3: Drill-down detail (click card → full data)
```
This prevents information overload while keeping depth available.

### ✅ Status Bar (Always Visible)
Cap2 keeps **4 key metrics** in view at all times:
- Cash balance (green if positive)
- Profit/Loss (bar chart showing trend)
- Date (current day/month)
- Game Speed (pause / play / fast-forward)

Hormuz adds: **Chokepoint status badge** (real-time alert about Hormuz TENSION)

### ✅ Game Speed Dial (No Time Pressure)
Cap2's genius: **Pause button lets player think forever**
- Paused: Unlimited decision time
- ×1, ×3, ×7: Player chooses pace
- Fast-forward: Until next alert / project completion

### ✅ Construction Menu (Cost Transparency)
Cap2 shows **cost upfront before placement**
- Prevents surprise expenses
- Player never feels trapped (can cancel & salvage ~20%)

Hormuz adapts: **Show timeline + cost for every project upfront**

### ✅ Markets Hub (Not Single Screen)
Cap2's markets are **organized by type**:
- Stock market (company valuation)
- Competitor intelligence
- M&A opportunities

Hormuz adapts to **multiple market sections**:
- Crude prices (NYMEX, NC, DME)
- Shipping & freight
- Concession availability
- Market access licenses
- Credit lines

---

## What Hormuz Adds (Beyond Cap2)

### 🆕 Overnight Summary
- Cap2 requires player to click through reports
- Hormuz auto-generates overnight summary with alerts
- **Brings insights to player instead of burying them in reports**

### 🆕 Automation Opportunities
- Cap2 has **zero automation** (all manual decisions)
- Hormuz detects patterns player repeats → suggests automation
- "You've sold down storage 4 times in 7 days. Automate?"

### 🆕 Active Automations Dashboard
- Shows all running automations + what they did overnight
- Full transparency: "Day 52: Storage Manager sold 2,800 bbl"
- Player can pause/adjust/delete anytime

---

## Deliverables Created

### 1. **cap2-ui-replication-guide.md** (Detailed Analysis)
- 5 key UI elements from Cap2 page 9
- Each element: Cap2 model → Hormuz adaptation → key learnings
- Implementation priority (Phase 1 vs Phase 2)
- Mobile responsiveness notes

### 2. **hormuz-toolbar-mockup.html** (Interactive Demo)
- Fully clickable toolbar mockup
- 4 dropdown menus with sub-options
- 5 example panels (Product Summary, Markets, Corp Summary, etc.)
- Status bar with live data
- Game speed dial (pause / ×1 / ×3 / ×7)
- Dark theme, responsive layout

### 3. **cap2-to-hormuz-mapping.md** (Side-by-Side Comparison)
- All 6 Cap2 UI elements mapped to Hormuz equivalents
- Shows exactly which Cap2 patterns Hormuz replicates
- Explains what Hormuz adds (automations, overnight summary)
- Implementation roadmap (Phase 1-3)

---

## Hormuz Toolbar Final Design

```
BOTTOM TOOLBAR (Always visible)

[🏗 CAPITAL]  [📊 MARKETS]  [📈 REPORTS]  [🤖 AUTOMATIONS]    | CASH: $12.4M  P&L: +$94K  DAY 52/180  SPEED: 1×
    ▼             ▼ alert       ▼ tabs          ▼ badge        |
Construction   Crude Prices   Product Sum    Automation Opps    [Pause] [1×] [3×] [7×]
Project Cal    Shipping       Corp Sum       Active Auto
Quick Cancel   Concessions    Finance Sum    Activity Log
               Credit Lines   Overnight

Toolbar Height: 50-60px (fits mobile)
Dropdowns: Appear above toolbar, max width 250px
Status metrics: Right-aligned, separated by dividers
```

---

## Key Insights from Cap2

### 1. Drill-Down Over Breadth
Don't overwhelm players with detail. Show summary, let them click to expand.

### 2. Pause Button is Essential
Turn-based games need a "pause and think" option. **No time pressure.**

### 3. Cost Transparency
Show cost + timeline **before** commitment. Players hate surprises.

### 4. Status Bar Always Visible
Cash, profit, date, speed should never be hidden. These are the "heartbeat" of the game.

### 5. Organize Markets by Type
Don't put all trading on one screen. Separate Crude Markets / Shipping / Financing / M&A.

### 6. One Report, Multiple Depths
Every report should have: summary (1 screen) → filters (narrow scope) → detail (full data).

---

## What's Different: Hormuz vs Cap2

| Aspect | Cap2 | Hormuz |
|--------|------|--------|
| **Breadth** | Build anything anywhere | CEO sets strategy, AI executes |
| **Automation** | None (all manual) | Pattern detection + automation |
| **Reports** | Player must dig | Overnight summary + alerts auto-served |
| **Speed Control** | Pause + speed dial | Pause + smart fast-forward (next alert/project) |
| **Capital Decisions** | Click & build anywhere | Timeline + cost upfront, project calendar |
| **Information** | Reports buried in menus | Notifications bubble up to player |

---

## Next Steps (Implementation)

### Phase 8-9: Build Core Toolbar
- [ ] Construct toolbar HTML/CSS (40px icons, dropdowns)
- [ ] Wire Construction menu (show all capital options)
- [ ] Wire Markets hub (price feeds, order book)
- [ ] Wire Reports tabs (product, corp, finance summaries)
- [ ] Wire Game Speed dial (pause/play/fast-forward logic)
- [ ] Status bar live-updates (cash, P&L, date, speed)

### Phase 10: Add Hormuz-Specific
- [ ] Overnight Summary screen
- [ ] Automation Opportunities panel (pattern detection)
- [ ] Active Automations dashboard (tracking)
- [ ] Chokepoint status badge on toolbar

### Phase 11-12: Polish
- [ ] Keyboard shortcuts (e.g., `C` = construction, `M` = markets)
- [ ] Historical trend charts (12-month bar charts)
- [ ] Mobile layout (stack toolbar vertically on <640px)
- [ ] Accessibility (ARIA labels, tab order, screen reader testing)

---

## Files Ready for Review

All in `/mnt/user-data/outputs/`:

1. **cap2-ui-replication-guide.md** — Detailed element-by-element analysis
2. **hormuz-toolbar-mockup.html** — Interactive working mockup
3. **cap2-to-hormuz-mapping.md** — Side-by-side Cap2 → Hormuz mapping
4. **game-ui-elements.html** — Original overnight summary + automation UI
5. **hormuz-ui-elements.md** — UI spec (from earlier session)

---

## Recommendation

**Cap2's toolbar architecture is solid and proven.** Hormuz should adopt:
- ✅ Bottom toolbar with 4-section organization
- ✅ Dropdown menus (not side panels)
- ✅ Always-visible status bar
- ✅ Pause button + speed dial
- ✅ Drill-down pattern for reports

And improve with Hormuz innovations:
- ✅ Overnight Summary (pro-active information)
- ✅ Automation Opportunities (pattern detection)
- ✅ Active Automations (transparency)

This combination gives players the **familiar, clean interface of Cap2** plus the **smart automation of modern gaming.**


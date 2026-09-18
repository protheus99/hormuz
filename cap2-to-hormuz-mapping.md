# Cap2 → Hormuz: UI Element Mapping

Based on **Capitalism II User Manual, Page 9** (Game View), here's how Hormuz adapts Cap2's proven UI patterns:

---

## 1. CONSTRUCTION Menu

### Cap2 Model (Page 9)
```
Game Tools → Construction
├─ Retail Store
├─ Factory
├─ Farm
├─ Headquarters
└─ etc.

• Click to select type
• Position on map
• Show cost upfront
• Click "Build" to confirm
```

### Hormuz Adaptation
```
Capital Projects → Construction Menu
├─ Buy Concession (Permian Light, Guyana Heavy, etc.)
├─ Develop Field (known cost, 60-day timeline upfront)
├─ Expand Storage (5,000 bbl increments, 20 days)
├─ Drill Capacity (500 bbl/day increments, 45 days)
├─ Upgrade Refinery (Tier 1→2, 60 days)
├─ Add Processing Unit (90 days)
├─ Schedule Maintenance (5 days)
└─ Close Well (5 days)

• Click to select type
• Show cost + timeline upfront
• Display project calendar impact
• Click "Confirm" to lock in capital
• Can cancel & recover ~20% salvage (like Cap2's land resale)
```

**Key Learning from Cap2:**
- Show cost before placement (prevents surprise)
- Timeline transparency (player knows when project finishes)
- Cancellation option (player never feels trapped)

---

## 2. PRODUCT SUMMARY Report

### Cap2 Model (Page 9)
```
Reports → Product Summary Report

One-screen overview:
• Product name + photo
• Current price
• Demand level
• Inventory
• Profit/Loss status
• Can filter by firm, category, status

Drill-down: Click product → detailed view
```

### Hormuz Adaptation
```
Reports → Product Summary Report

One-screen overview of all grades:
• Light Sweet: $72.30 | 5,800 bbl/day | +$23.50/bbl margin
• Medium: $70.15 | 0 bbl/day | (not in portfolio)
• Heavy Sour: $62.80 | 4,200 bbl/day | +$18.20/bbl margin

Inventory Status:
• Light Sweet Storage: 18 days (above 15-day target) ⚠
• Leased Storage (Asia): 15,200 bbl | 28 days left | $2,100/day cost

Filters:
• By Grade
• By Status (Profitable / At-Risk / Declining)
• Display 15-day / 30-day / 60-day trends

Drill-down: Click grade → detailed price history, netback calc, forward curve
```

**Key Learning from Cap2:**
- Summary cards first (no overwhelming detail)
- Status badges (profitable/at-risk/declining) → visual health check
- Drill-down capability (depth on demand)
- Historical context (30-day average, trends)

---

## 3. CORPORATION SUMMARY Report

### Cap2 Model (Page 9)
```
Reports → Corporate Summary Report

Consolidated view:
• Total cash + profit
• Number of firms (organized by type)
• Employees, productivity
• P&L chart (last 12 months)

Drill-down options:
• By firm
• By product
• By division
```

### Hormuz Adaptation
```
Reports → Corporation Summary Report

Financial Snapshot:
• Net Worth: $145.2M
• Cash on Hand: $12.4M
• Credit Available: $18.6M
• Daily P&L: +$94K
• Monthly P&L Trend: [12-month bar chart]

Portfolio Overview:
• Concessions Owned: 3 (Permian Light, Guyana Heavy, Coastal Medium)
• Market Access (if Trader role): 1 license (Asia-Pacific)
• Storage Capacity: 65,000 bbl total
• Leased Storage: 15,200 bbl (cost: $2,100/day)
• Capital Projects: 2 in progress (Tier 2 upgrade 53%, storage expansion 15%)

Production Metrics:
• Daily Output: 10,300 bbl
• Utilization: 87% (strong)
• Fixed Costs: $18K/day
• Revenue per bbl (avg): $68.50

Drill-down:
• By Region
• By Product Grade
• By Asset Type (Concession / Storage / Processing)
• Historical Comparison (Week / Month / Quarter)
```

**Key Learning from Cap2:**
- Snapshot first (executive view)
- Hierarchical drill-down (summary → detail)
- 12-month chart showing trends
- Key metrics that matter for strategy (ROI, utilization, costs)

---

## 4. FINANCE SUMMARY Report

### Cap2 Model (Page 9)
```
Reports → Finance Summary Report

Financial statements:
├─ Balance Sheet (Assets, Liabilities, Equity)
├─ Income Statement (Revenue, Expenses, Net Profit)
└─ Optional: Ratios (ROI, Debt-to-Equity, etc.)

Time periods: Current month, Last 3 months, Last 12 months
```

### Hormuz Adaptation
```
Reports → Finance Summary Report

[Tab Navigation: Balance Sheet | Income Statement | Cash Flow | Ratios]

BALANCE SHEET (as of Day 52)
Assets:
├─ Cash & Equivalents: $12.4M
├─ Concessions (net of depletion): $28.5M
├─ Refinery Assets: $42.0M
├─ Storage Facilities: $18.2M
└─ Total Assets: $101.1M

Liabilities:
├─ Short-term Debt: $8.6M
├─ Project Payables: $3.2M
└─ Total Liabilities: $11.8M

Equity: $89.3M (Assets - Liabilities)

INCOME STATEMENT (Last 30 Days)
├─ Gross Revenue: $2.94M (crude sales)
├─ Operating Costs: -$0.54M (extraction, lease, labor)
├─ Project Costs: -$0.31M (capex)
├─ Finance Costs: -$0.01M (interest)
└─ Net Profit: $2.08M

CASH FLOW (Last 30 Days)
├─ Operating Cash In: +$2.94M
├─ Operating Cash Out: -$0.54M
├─ Capex: -$0.45M
├─ Finance Activity: +$0.50M
└─ Net Change: +$2.45M

KEY RATIOS
├─ Liquidity Ratio: 2.1x (strong)
├─ Debt-to-Equity: 0.13 (low risk)
├─ Days of Supply: 18 days (high inventory)
└─ ROI: 28.9% (annualized)
```

**Key Learning from Cap2:**
- Standard accounting format (familiar to players)
- Multiple time periods (month, quarter, year)
- Key ratios for quick health check
- Clear profit vs. cash distinction (important in Cap2 & Hormuz)

---

## 5. STOCK MARKET / MARKETS Hub

### Cap2 Model (Page 9)
```
Toolbar → Stock Market

Access point for:
├─ Stock price & trading
├─ Corporate actions (issue shares, buy back, tender offer)
├─ M&A (mergers, takeovers)
└─ Competitor intelligence
```

### Hormuz Adaptation
```
Toolbar → Markets Hub

[Multiple tabs/sections]

CRUDE MARKETS
├─ NYMEX (Light Sweet)
│  ├─ Current: $72.30/bbl
│  ├─ 30-day range: $68–$75
│  ├─ Your Orders: [View/Modify]
│  └─ [Action: Buy/Sell]
├─ NC (Medium)
├─ DME (Heavy Sour)
└─ Market Data: Volume, open interest, forward curve

SHIPPING & LOGISTICS
├─ Freight Rates (by route & chokepoint status)
├─ Charter Market (spot rates, term rates)
├─ Chokepoint Status (Hormuz, Suez, Panama, etc.)
└─ [Action: Charter tanker]

CONCESSION MARKET (Producer/Integrated Major only)
├─ Permian Light: 2 slots available @ $5.2–$6.1M
├─ Guyana Heavy: 1 slot @ $7.8–$8.5M
└─ [Action: Bid/Buy]

MARKET ACCESS (Trader only)
├─ Asia-Pacific: $1.8M (4 slots)
├─ North Sea: $2.2M (2 slots)
└─ [Action: Buy/Bid]

FINANCIAL INSTRUMENTS
├─ Credit Lines (draw/repay)
├─ Forward Contracts (price lock)
└─ [Action: Draw/Transact]
```

**Key Learning from Cap2:**
- Market as a hub (not single screen)
- Multiple market types in one place
- Real-time prices + trends
- User's own position visible (transparency)
- Quick action buttons (Buy/Sell/Bid)

---

## 6. GAME SPEED Control

### Cap2 Model (Page 9)
```
Toolbar → Game Speed

Visual dial showing:
├─ Paused (bottom-left) — player has unlimited time
├─ Slow (quarter turn)
├─ Normal (full turn per click)
├─ Fast (multiple turns per click)
└─ Running (continuous auto-advance)

Purpose: No time pressure, player controls pace
```

### Hormuz Adaptation
```
Toolbar → Game Speed

[Paused] ◯ ◯ ◯ [×1] ◯ [×3] ◯ [×7] [Running]

Visual Dial + Numeric Indicators
├─ Paused (unlimited decision time)
├─ ×1 (Normal) — 1 turn per click
├─ ×3 (Fast) — 3 turns per click
├─ ×7 (Auto) — auto-advance every 5 sec
└─ Running (continuous)

Fast-Forward Options:
├─ Until: Next Alert
├─ Until: Next Automation Action
├─ Until: Next Project Completion
└─ Until: [Specific day]

Current Status Display:
├─ Day 52 of 180
├─ Next Turn Starts In: [When you click]
└─ Paused (no time pressure)
```

**Key Learning from Cap2:**
- Pause button (player never rushed)
- Multiple speed levels (caters to different play styles)
- Visual indicator (easy to see current state)
- "Fast forward until" (smart automation feature)

---

## Complete Hormuz Toolbar Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  HORMUZ BOTTOM TOOLBAR (8 sections, Cap2-inspired)          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [🏗 CAPITAL]  [📊 MARKETS]  [📈 REPORTS]  [🤖 AUTOMATIONS]│
│      ▼             ▼              ▼               ▼         │
│   Menu        Menu + Alert   Menu (4 tabs)   Menu + Badge  │
│                                                              │
│                                                              │
│                        [Right side: Status Bar]              │
│   CASH: $12.4M | P&L: +$94K/day | DAY 52/180 | SPEED: 1× │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Why This Architecture Works

✅ **Clean Separation of Concerns**
- Capital projects, markets, reporting, automation each have own space
- No mixing of strategic & operational decisions

✅ **Always-Visible Status Bar**
- Cash, P&L, date, speed never hidden
- Player always knows financial health + game state

✅ **Drill-Down Pattern (Cap2's Strength)**
- Summary first (one-screen overview)
- Detail on demand (click to expand)
- Never forces unnecessary depth

✅ **No Time Pressure (Cap2's Genius)**
- Pause button lets player think
- Speed dial lets player choose pace
- Prevents "click too fast" mistakes

✅ **Quick Navigation**
- Tabs stay within panel (don't return to main view)
- Back button for breadcrumb history
- Keyboard shortcuts optional but available

✅ **Mobile-Friendly**
- Toolbar stacks vertically on small screens
- Touch targets 44px+ (easy to tap)
- Dropdowns close outside-click

---

## What Hormuz Adds (Not in Cap2)

### Overnight Summary
- Cap2 shows summary, player must dig into reports
- Hormuz shows overnight summary automatically + alerts
- Brings actionable insights to player (not buried in reports)

### Automation Opportunities
- Cap2 has no automation (all manual)
- Hormuz detects patterns + offers to automate
- System learns player behavior

### Active Automations Dashboard
- Cap2 has no automation tracking
- Hormuz shows all running automations + what they did
- Full transparency (player always knows what system did)

---

## Implementation Roadmap

### Phase 1: Cap2-Inspired Toolbar (Phases 8-9)
- ✅ Build toolbar (capital, markets, reports, automations, status bar)
- ✅ Implement Construction menu
- ✅ Implement crude market prices + order book
- ✅ Implement 3 reports (product, corp, finance summaries)
- ✅ Implement game speed control

### Phase 2: Hormuz-Specific Additions (Phase 10)
- ✅ Overnight Summary screen
- ✅ Automation Opportunities panel
- ✅ Active Automations dashboard
- ✅ Chokepoint status indicator

### Phase 3: Polish (Phase 11-12)
- ✅ Keyboard shortcuts (Cap2 had these)
- ✅ Historical trends (12-month charts)
- ✅ Drill-down mechanics (test click targets)
- ✅ Mobile responsiveness (test on tablet/phone)

---

## Files Created

1. **cap2-ui-replication-guide.md** — Detailed analysis of 5 Cap2 UI elements + Hormuz adaptations
2. **hormuz-toolbar-mockup.html** — Interactive mockup of complete toolbar (clickable, live status)
3. **cap2-to-hormuz-mapping.md** — This file: side-by-side comparison of Cap2 → Hormuz

**All files in `/mnt/user-data/outputs/`**


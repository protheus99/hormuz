# Cap2 Game View (Page 9) — UI Elements Worth Replicating for Hormuz

## Overview: Cap2's Toolbar Architecture

Cap2 uses an **8-section toolbar at the bottom of the screen**, organized hierarchically:

```
[GAME TOOLS] [MINI MAP] [WORLD MAP] [INFORMATION] [BACK] [CASH & PROFIT] [PROFIT/LOSS] [DATE]
```

Each section is **clickable and toggles a panel/menu**. This is an excellent model for Hormuz.

---

## Five Key UI Elements to Replicate

### **1. CONSTRUCTION Menu**

**Cap2 Implementation:**
- Click "Game Tools" → "Construction" submenu opens
- Lists available building types (Retail Store, Factory, Farm, Headquarters, etc.)
- Shows building cost before placement
- Player positions building on map, confirms cost, builds

**Hormuz Adaptation:**
```
Capital Projects Interface

[CONSTRUCTION MENU]
├─ Buy Concession (region, grade, cost)
├─ Develop Field (cost, timeline: 60 days)
├─ Expand Storage (cost, timeline: 20 days)
├─ Drill Capacity (cost, timeline: 45 days)
├─ Upgrade Refinery (cost, timeline: 60 days)
├─ Add Processing Unit (cost, timeline: 90 days)
├─ Schedule Maintenance (cost, timeline: 5 days)
└─ Close Well (cost, timeline: 5 days)

[Show cost + timeline before confirming]
[Display project calendar with all active projects]
```

**Key learnings from Cap2:**
- Show cost upfront (no surprise)
- Show timeline before commitment
- Preview before confirmation
- Cancellation with salvage recovery (~20%)

---

### **2. PRODUCT SUMMARY Report**

**Cap2 Implementation:**
- Click icon in toolbar → "Product Summary Report" opens
- Shows all products being manufactured/sold
- Displays: product name, current price, demand, inventory, profit/loss
- Drill-down to see detail per product
- Can filter by firm or corporation

**Hormuz Adaptation:**
```
PRODUCT SUMMARY REPORT

Light Sweet Crude:
├─ Current Price (FOB): $72.30
├─ 30-Day Avg: $70.50
├─ Netback: $68.50
├─ Daily Volume Sold: 5,800 bbl
├─ Storage Level: 18 days (target: 10-15)
├─ Margin: $23.50/bbl
└─ Status: ✓ Profitable

Heavy Sour Crude:
├─ Current Price (FOB): $62.80
├─ Daily Volume Sold: 4,200 bbl
├─ Storage Level: 8 days (at-risk)
└─ Status: ⚠ Below breakeven

[FILTER OPTIONS]
├─ By Grade
├─ By Region
├─ By Status (Profitable / At-Risk / Declining)
└─ Display Spread (15-day, 30-day, 60-day)
```

**Key learnings from Cap2:**
- One-screen overview of all products
- Quick health check (profit/loss status)
- Drill-down to detail per product
- Historical context (30-day average)

---

### **3. CORPORATION SUMMARY Report**

**Cap2 Implementation:**
- Click icon in toolbar → "Corporate Summary Report" opens
- Shows consolidated view across all firms
- Displays: total cash, total profit, number of firms, employees, major products
- Can drill down by firm or by product category
- Shows P&L trend over last 12 months

**Hormuz Adaptation:**
```
CORPORATION SUMMARY REPORT

FINANCIAL SNAPSHOT
├─ Net Worth: $145.2M
├─ Cash on Hand: $12.4M
├─ Credit Available: $18.6M
├─ Daily P&L: +$94K
└─ Monthly P&L Trend: [12-month bar chart]

PORTFOLIO OVERVIEW
├─ Concessions Owned: 3 (Permian Light, Guyana Heavy, Coastal Medium)
├─ Market Access Licenses: 1 (Asia-Pacific)
├─ Storage Capacity: 65,000 bbl
├─ Leased Storage: 15,200 bbl (28 days left)
└─ Capital Projects: 2 in progress

PRODUCTION METRICS
├─ Daily Output: 10,300 bbl total
├─ Utilization: 87%
├─ Fixed Costs: $18K/day
└─ Revenue per bbl (avg): $68.50

[DRILL DOWN]
├─ By Region
├─ By Product Grade
├─ By Asset Type (Production/Storage/Processing)
└─ Historical Comparison (Week/Month/Quarter)
```

**Key learnings from Cap2:**
- Consolidated snapshot first
- Drill-down capability (don't force detail on initial view)
- Historical trend (bar chart showing 12 months)
- Summary stats that matter for strategy

---

### **4. FINANCE SUMMARY Report**

**Cap2 Implementation:**
- Click icon in toolbar → "Finance Summary Report" opens
- Shows financial statements: Balance Sheet, Income Statement, Cash Flow
- Displays: assets, liabilities, equity, revenue, expenses, net profit
- Can compare to previous periods
- Shows key ratios (ROI, debt-to-equity, etc.)

**Hormuz Adaptation:**
```
FINANCE SUMMARY REPORT

BALANCE SHEET (as of Day 52)
├─ ASSETS
│  ├─ Cash & Equivalents: $12.4M
│  ├─ Concessions (net): $28.5M (5 concessions, development in progress)
│  ├─ Refinery Assets: $42.0M (Tier 2 upgrade 53% complete)
│  ├─ Storage Facilities: $18.2M (65K bbl capacity)
│  └─ Total Assets: $101.1M
├─ LIABILITIES
│  ├─ Short-term Debt: $8.6M (credit line)
│  ├─ Project Payables: $3.2M (capex commitments)
│  └─ Total Liabilities: $11.8M
└─ EQUITY: $89.3M

INCOME STATEMENT (Last 30 Days)
├─ Gross Revenue: $2.94M (from crude sales)
├─ Operating Costs: -$0.54M (extraction, lease, labor)
├─ Project Costs: -$0.31M (capex: tier upgrade, storage expansion)
├─ Finance Costs: -$0.01M (interest on credit)
├─ Net Profit: $2.08M (+$69.6K/day)
└─ Profit Margin: 70.8%

CASH FLOW (Last 30 Days)
├─ Operating Cash In: +$2.94M
├─ Operating Cash Out: -$0.54M
├─ Capital Expenditure: -$0.45M
├─ Finance Activity: +$0.50M (credit drawn)
└─ Net Cash Change: +$2.45M

FINANCIAL HEALTH
├─ Liquidity Ratio: 2.1x (strong)
├─ Debt-to-Equity: 0.13 (very low risk)
├─ Days of Supply: 18 days (high)
└─ Score: ✓ Healthy
```

**Key learnings from Cap2:**
- Standard accounting statements (balance sheet, income statement, cash flow)
- Time period context (this month, last 30 days, etc.)
- Key ratios for quick health check
- Comparison to previous periods

---

### **5. STOCK MARKET / MARKETS Hub**

**Cap2 Implementation:**
- Click "Stock Market" icon in toolbar → Market hub opens
- Displays: stock price, trading volume, buy/sell options, tender offers, M&A
- Shows competitor stocks
- Can issue new shares, pay dividends, conduct buybacks
- Access to corporate financing options

**Hormuz Adaptation:**
```
MARKETS HUB

[TAB NAVIGATION]
├─ CRUDE MARKETS (3 tabs below)
├─ SHIPPING & LOGISTICS
├─ FINANCIAL INSTRUMENTS
└─ COMPETITIVE INTELLIGENCE

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CRUDE MARKETS

NYMEX (Light Sweet) 📊
├─ Current: $72.30/bbl (FOB)
├─ 30-day Range: $68–$75
├─ Volume: 1.2M bbl/day
├─ Your Position: 5,800 bbl/day (sell)
├─ My Orders: [View active orders]
└─ [Action: Buy/Sell/Modify]

NC (Medium Crude) 📊
├─ Current: $70.15/bbl (FOB)
├─ 30-day Range: $66–$73
├─ Volume: 800K bbl/day
├─ Your Position: None
└─ [Action: Buy/Sell/Enter Market]

DME (Heavy Sour) 📊
├─ Current: $62.80/bbl (FOB)
├─ 30-day Range: $59–$67
├─ Volume: 2.1M bbl/day
├─ Your Position: 4,200 bbl/day (sell)
└─ [Action: Buy/Sell/Modify]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SHIPPING & LOGISTICS

Freight Rates ($/barrel, via Hormuz):
├─ To East Asia: +$2.10 (Hormuz TENSION: +2%)
├─ To Europe: +$1.85
├─ To US Gulf: +$1.40
└─ Chokepoint Risk: TENSION (OPEN yesterday)

Charter Market:
├─ Tanker Spot Rate: $45K/day
├─ 30-day Charter: $42K/day
└─ [Action: Charter/Release]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FINANCIAL INSTRUMENTS

Credit Lines:
├─ Available: $18.6M @ 0.03%/day
├─ Used: $8.6M
└─ [Action: Draw/Repay]

Concession Market:
├─ Available Permits (Permian, Light): 2 slots @ $5.2M–$6.1M
├─ Available Permits (Guyana, Heavy): 1 slot @ $7.8M–$8.5M
└─ [Action: Buy/Bid]

Market Access Licenses (Traders):
├─ Asia-Pacific: $1.8M (4 slots open)
├─ North Sea: $2.2M (2 slots open)
└─ [Action: Buy/Bid]
```

**Key learnings from Cap2:**
- **Market as a hub**, not a single screen
- Multiple market types (products, financing, M&A)
- Real-time prices and trends
- User's own position/orders visible
- Quick action buttons (Buy/Sell/Modify)

---

### **6. GAME SPEED Control**

**Cap2 Implementation:**
- Visual dial at bottom of toolbar
- Click on dial to set speed: Paused → Slow → Normal → Fast
- Needle points to current speed
- Allows pause during decision-making
- Resume from any speed

**Hormuz Adaptation:**
```
GAME SPEED CONTROL

[Paused] ◯ ◯ ◯ [×1] ◯ [×3] ◯ [×7] [Running]

Status: Game Paused (you have unlimited time to decide)

Current Day: 52 of 180
Next Turn Starts In: [When you click →]

━━━━━━━━━━━━━━━━━━━━━━━━━

Speed Legend:
• Paused: Unlimited decision time
• ×1 (Normal): 1 turn per click
• ×3 (Fast): 3 turns per click
• ×7 (Auto): Auto-advance every 5 seconds
• Running: Continuous auto-advance

Special Options:
├─ Fast Forward Until: [Dropdown]
│  ├─ Next Alert
│  ├─ Next Automation Action
│  ├─ Next Capital Project Completion
│  └─ Specific Day/Date
└─ [OK]
```

**Key learnings from Cap2:**
- Visual speed indicator (dial or slider)
- Discrete speed levels (pause, slow, normal, fast)
- Pause capability during decisions (no time pressure)
- "Fast forward until X" option (smart automation)

---

## Recommended Hormuz Toolbar Layout

```
BOTTOM TOOLBAR (8 sections)

┌─────────────────────────────────────────────────┐
│  [CAPITAL] [MARKETS] [REPORTS] [AUTOMATIONS]   │  (4 icons + dropdowns)
│         [CASH] [P&L] [DATE] [SPEED]            │  (4 status indicators)
└─────────────────────────────────────────────────┘

Section 1: CAPITAL PROJECTS
├─ Construction menu
├─ Project Calendar (all active projects)
├─ Quick-cancel projects (with salvage calc)
└─ [Back] to main view

Section 2: MARKETS
├─ NYMEX (Light Sweet) price + order book
├─ NC (Medium) price + order book
├─ DME (Heavy Sour) price + order book
├─ Shipping & Logistics
├─ Concession Market
├─ Market Access Licenses
└─ Credit Lines

Section 3: REPORTS
├─ Product Summary (all grades, all regions)
├─ Corporation Summary (consolidated P&L, portfolio)
├─ Finance Summary (balance sheet, income statement, cash flow)
├─ Firm Detail (drill-down by field/refinery)
└─ Comparative Analysis (vs. rivals, vs. market)

Section 4: AUTOMATIONS
├─ Automation Opportunities (patterns detected)
├─ Active Automations (running automations + status)
├─ Automation History (last 30 actions)
└─ Automation Settings (thresholds, frequency)

Status Indicators (right side):
├─ CASH: $12.4M (green if > 0)
├─ P&L CHART: +$94K (green bar chart)
├─ DATE: Day 52 of 180
└─ SPEED: ◯ [Normal] ◯ (click to adjust)
```

---

## Implementation Priority

### **Phase 1 (MVP) — Replicate Core From Cap2**
1. ✅ **CAPITAL PROJECTS** menu (construction interface)
2. ✅ **REPORTS** panel (product summary, corp summary, finance summary)
3. ✅ **MARKETS** hub (crude prices, order submission, freight rates)
4. ✅ **GAME SPEED** control (pause/play/fast-forward)
5. ✅ **STATUS BAR** (cash, P&L, date, visible always)

### **Phase 2 (Post-MVP) — Add Hormuz-Specific**
1. **AUTOMATIONS** panel (not in Cap2, Hormuz innovation)
2. **OVERNIGHT SUMMARY** (not in Cap2, Hormuz innovation)
3. **Chokepoint Status** indicator (domain-specific)
4. **Rival Monitoring** (expand on Cap2's competitor view)

---

## Why This Structure Works for Hormuz

✅ **Clean Separation:** Each major activity (capital, markets, reports, automations) has its own menu  
✅ **Always Visible:** Status bar (cash, P&L, date) never hidden  
✅ **Drill-Down Pattern:** Summary first, detail on demand  
✅ **No Time Pressure:** Pause button allows unlimited decision time  
✅ **Fast Navigation:** Tab through reports without returning to main view  
✅ **Mobile-Friendly:** Stack toolbar vertically on small screens  

---

## Sample Implementation Mockup

Would you like me to:
1. Create an interactive HTML mockup of the toolbar (replicating Cap2's design for Hormuz)?
2. Design the **MARKETS hub** in detail (showing order submission, price discovery, hedging)?
3. Refine the **REPORTS panel** tabs (drill-down mechanics)?


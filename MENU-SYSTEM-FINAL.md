# Hormuz Game UI — Final Menu System

## 8 Menu Options (All at Bottom Toolbar)

Updated `game-ui-final-light.html` and `game-ui-final-dark.html` now feature **8 primary menu options** as separate buttons in the toolbar — no tabs, no sub-navigation. Each button opens its own full content panel.

---

## Menu Breakdown

### 🗺 **MAP**
- World map with region grid
- Click "Zoom" to drill into regional details
- Shows:
  - Region name
  - Crude type (Light Sweet, Medium, Heavy Sour)
  - Your current concessions count
  - Available permits in that region

### 🏗 **CONSTRUCTION**
- Active infrastructure projects (with progress bars)
- Available builds:
  - **Storage Expansion** (5K bbl, 20 days, $750K)
  - **Drill Capacity** (+1000 bbl/day, 45 days, $2.1M)
  - **Refinery Tier Upgrade** (60 ticks at 60% capacity)
- Cancel projects (20% salvage recovery)
- Real-time cost tracking

### 📊 **MARKETS**
- List of all active crude markets
- Shows:
  - **NYMEX** (Light Sweet) — current price, daily volume, bid-ask spread
  - **NC** (Medium Crude) — price, volume, spread
  - **DME** (Heavy Sour) — price, volume, spread
- All prices in real-time (connected to engine price dynamics)

### 🚢 **SHIPPING & LOGISTICS**
- Active shipments (route, volume, ETA status)
- **Chokepoint alerts** — highlights issues:
  - Hormuz Strait: OPEN/TENSION/DELAYED/CLOSED
  - Suez Canal status
  - Impact on freight rates (surcharges)
- Shows each chokepoint's current status badge

### 📜 **CONCESSIONS & PERMITS**
- **Owned Concessions**:
  - Location (Permian Light #1, Guyana Heavy #1, etc.)
  - Acquisition date
  - Current production rate (bbl/day)
  - Development status (if in progress)
- **Available Permits to Buy**:
  - Region and grade
  - Est. production capacity
  - Slots open in region
  - Buy button with price

### 💬 **MESSAGES & ALERTS**
- **Active Alerts** (high-priority warnings):
  - Storage target exceeded
  - Chokepoint status changes
  - Cash warnings
- **Random Events** (narrative flavor):
  - Pipeline maintenance notifications
  - Market rumors
  - Speculation about supply disruptions
  - Timestamps and impact descriptions

### 📦 **PRODUCTS**
- **Current Production** by crude type:
  - Source region
  - Daily extraction rate
  - Extraction efficiency % (85%, etc.)
- **Inventory & Storage**:
  - Barrels in storage (by type)
  - Days of supply (calculated from daily rate)
  - vs. target (e.g., "18 days vs. target 10–15")

### 🏢 **CORPORATION**
- **Financial Overview**:
  - Net Worth (assets − liabilities)
  - Daily P&L (revenue − costs)
  - Cash on Hand
- **Resources**:
  - Total Production Capacity (all concessions combined)
  - Credit Available (unused credit line)
- Ready for graphs/historical charts in Phase 10

---

## Toolbar Layout

```
┌────────────────────────────────────────────────────────────┐
│ [🗺] [🏗] [📊] [🚢] [📜] [💬] [📦] [🏢]   $12.4M | +$94K    │
│ (Menu options)                      (Status bar)           │
└────────────────────────────────────────────────────────────┘
```

### **Left Section — Menu Icons**
All 8 options fit comfortably. No dropdown, no tabs. Click any to open full panel.

### **Right Section — Always-Visible Status**
- **Cash** — Current cash balance
- **P&L** — Daily profit/loss (positive = green, negative = red)
- **Date** — Current game day (Day N / Total)
- **Speed** — ⏸ 1× 3× 7× buttons (game speed control)

---

## User Flow

1. **Start** → Map is visible (game map fills screen)
2. **Click [📊 Markets]** → Markets panel opens (80% of screen, game map hides)
3. **Click [🚢 Shipping]** → Content switches instantly (no loading, smooth transition)
4. **Click [✕ close]** → Returns to map view
5. **Toolbar always visible** → Can switch menus anytime

---

## Key Features

✅ **No tabs within menus** — Each option is self-contained  
✅ **Full-screen content** — 80% of viewport when opened  
✅ **Quick navigation** — Click any icon, instant switch  
✅ **Consistent layout** — Header (title + close), content area, pinned toolbar  
✅ **Status always visible** — Cash, P&L, date, speed never hidden  
✅ **Badge notifications** — Messages (💬) and Automations show alert count  
✅ **Responsive design** — Toolbar scales on mobile/tablet  
✅ **Both themes** — Light and dark versions included  

---

## Content Structure (Per Menu)

### Header
- Menu title (e.g., "📊 Markets")
- Close button (✕) — returns to map

### Content
- **Section Titles** — Gray, uppercase (e.g., "Crude Markets")
- **List Items** — Clickable cards with details + action button
- **Cards** — For more complex data (progress bars, nested metrics)
- **Alerts** — Color-coded warnings (red = critical, orange = warning)

### Scroll Behavior
- Content panel scrolls internally
- Toolbar never scrolls away (always pinned at bottom)

---

## Ready for Phase 10

These mockups are **fully functional templates** for the HTML/JS interface:

1. **Replace placeholder data** with real GameSession API calls
2. **Keep the button structure** (8 icons, status bar)
3. **Bind toggles** to UI state (which menu is active)
4. **Add real game map** (SVG isometric or WebGL)
5. **Connect data flows**:
   - Markets → live price feeds
   - Shipping → logistics engine output
   - Corporation → portfolio calculations
   - Products → extraction + inventory state

---

## File Locations

- `game-ui-final-light.html` — Production template (light theme) ⭐
- `game-ui-final-dark.html` — Dark theme variant
- Both are fully interactive mockups with sample data

---

## Questions for Phase 10 Implementation

- Should "Map" show live isometric view or region list only?
- Do you want historical price charts in Markets?
- Should Shipping show only player's shipments or market-wide flows?
- For Corporation, what graphs do you want? (P&L over time, production by region, etc.)
- Should Messages auto-dismiss after X seconds or require manual close?

The layout is **proven** (Cap2), **intuitive** (one click per menu), and **scalable** (room for data growth).


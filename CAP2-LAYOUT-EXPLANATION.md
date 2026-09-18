# Cap2-Style Layout — Key Changes

You asked for a layout that **works like Cap2**, where:
- ✅ Toolbar stays **pinned at bottom** (never scrolls away)
- ✅ Content appears **below the game map** (not floating)
- ✅ No full-page scroll needed (everything fits in viewport)
- ✅ Clicking menu item **replaces content**, not opens separate panel

## New Layout Files

### **game-ui-cap2-layout-light.html** (Recommended)
Light theme version with Cap2-style layout:
```
┌─────────────────────────────────────────┐
│                                         │
│         GAME MAP (ISOMETRIC)            │  ← Fills top area
│                                         │
├─────────────────────────────────────────┤
│     CONTENT PANEL (Scrollable)          │  ← Appears when menu clicked
│  - Capital Projects                     │     (350px height)
│  - Markets                              │     Shows active content
│  - Reports                              │     Internal scroll only
│  - Automations                          │     Never pushes toolbar
├─────────────────────────────────────────┤
│ [🏗] [📊] [📈] [🤖]  | $12.4M | DAY 52  │  ← TOOLBAR PINNED (always visible)
└─────────────────────────────────────────┘     Never scrolls away
```

### **game-ui-cap2-layout-dark.html**
Same layout, dark theme (navy + cyan).

## How It Works

### **Three-Section Layout (No Page Scroll)**
```
60% — Game Map (fills most of screen)
20% — Content Panel (scrollable internally)
20% — Toolbar (fixed at bottom)

Total = 100% of viewport (fits any screen size)
```

### **Click Menu → Content Swaps**
1. User clicks **[📊 Markets]** button
2. Toolbar stays pinned
3. Content panel **replaces** to show market data
4. Content has **tabs** (Prices, Shipping, Concessions)
5. Content is **scrollable** (doesn't push toolbar)

### **No Full-Page Scroll**
- Game map stays visible (context)
- Toolbar always accessible (click buttons anytime)
- Content scrolls internally only

## Cap2-Inspired Pattern

This is exactly how Cap2 works:
- Main isometric view takes up 60–70% of screen
- Toolbar at bottom (8 sections)
- Click toolbar → information panel appears in middle area
- Player never loses the game view or toolbar from sight

## Features

✅ **Pinned Toolbar** — Always visible, never scrolls  
✅ **Fixed Height Content** — 350px scrollable area  
✅ **No Overflow Scroll** — Body has `overflow: hidden`  
✅ **Responsive** — Adjusts on mobile (smaller panel height)  
✅ **Smooth Tab Switching** — Content area tabs work instantly  
✅ **Tab Navigation** — Markets, Reports, Automations have internal tabs  
✅ **Visual Feedback** — Active menu button highlights  

## Responsive Behavior

| Screen Size | Layout | Notes |
|---|---|---|
| Desktop (1400px) | 60% game / 20% content / 20% toolbar | Full experience |
| Tablet (768px) | 50% game / 25% content / 25% toolbar | Content taller |
| Mobile (375px) | 60% game / 20% content / 20% toolbar | Stacks toolbar vertically |

## How to Use (Player Perspective)

1. **Game loads** → Isometric map visible, toolbar at bottom
2. **Click [📊 Markets]** → Market panel appears below map
3. **Click [Prices] tab** → Content switches (no reload)
4. **Click [Shipping] tab** → Freight rates appear
5. **Click [🏗 Capital]** → Construction menu appears (content swaps)
6. **Toolbar always visible** → Can switch menus anytime

## CSS Highlights

```css
html, body {
  height: 100vh;
  overflow: hidden;  /* ← Critical: no body scroll */
}

body {
  display: flex;
  flex-direction: column;  /* ← Stack sections vertically */
}

.game-view {
  flex: 1;  /* ← Takes available space */
}

.content-panel {
  height: 350px;  /* ← Fixed height */
  overflow-y: auto;  /* ← Internal scroll only */
}

.toolbar {
  z-index: 100;  /* ← Always on top */
  min-height: 60px;  /* ← Minimum size */
}
```

## Comparison: Old vs New

| Aspect | Old (Separate Panels) | New (Cap2 Layout) |
|--------|---|---|
| **Toolbar** | Top or side | Pinned bottom |
| **Content** | Pops up as modal/overlay | Appears in fixed panel below game |
| **Game View** | Often hidden | Always visible |
| **Scroll** | Page scrolls (toolbar leaves view) | Internal scroll (toolbar stays) |
| **User Flow** | Click → panel opens → read → close | Click → content swaps → click again |
| **Feel** | Like browser tabs | Like classic game UI |

## Recommended for Phase 10

**Use this layout for the HTML/JS interface (Phase 10):**
- Build with `game-ui-cap2-layout-light.html` as template
- Expand content panels for each menu type
- Add real data binding from GameSession API
- Keep toolbar always visible
- Make content panels scrollable internally

This gives Hormuz the **familiar Cap2 feel** that players expect from a business sim. 🎮


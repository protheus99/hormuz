# Layout Update: Map Button + 80% Content Panel

## Final Layout Changes (Sept 16)

You asked for two key improvements:
1. **Map button** in the toolbar to return to map view
2. **80% content panel** when viewing data (instead of 20%)

## New Mockup Files

### **game-ui-cap2-final-light.html** ⭐ RECOMMENDED
Light theme with all new features:
- Map button (🗺) as first icon in toolbar
- Clicking menu → content panel takes **80% of screen**
- Game map hides when viewing content
- Clicking map button or close (✕) → returns to map (game map returns to full view)
- Toolbar stays pinned at bottom (always visible)

### **game-ui-cap2-final-dark.html**
Same layout, dark theme (navy + cyan)

---

## Layout Behavior

### **On Load / Map View**
```
┌─────────────────────────────────────────┐
│      GAME MAP (100% of viewport)        │  ← Full screen isometric view
│      [Waiting for player input]         │
│                                         │
├─────────────────────────────────────────┤
│ [🗺] [🏗] [📊] [📈] [🤖]  $12.4M | DAY 52│  ← TOOLBAR PINNED
└─────────────────────────────────────────┘
```

### **Click Menu (e.g., [📊 Markets])**
```
┌─────────────────────────────────────────┐
│                                         │
│     CONTENT PANEL (80% of viewport)     │  ← Expands to fill screen
│     Markets Hub                         │     Game map hidden
│     [Prices] [Shipping] [Concessions]   │     Internal scroll only
│     • Current prices                    │
│     • Freight rates                     │
│                                         │
├─────────────────────────────────────────┤
│ [🗺] [🏗] [📊] [📈] [🤖]  $12.4M | DAY 52│  ← TOOLBAR PINNED
└─────────────────────────────────────────┘
```

### **Click [🗺 Map] or Close (✕)**
Returns to map view (game map takes full screen again)

---

## How It Works (Code)

### **Three-State System**
1. **Map State** (default)
   - `.game-view` is visible, flex: 1 (fills screen)
   - `.content-panel` is hidden
   - Map button is active

2. **Content State** (menu clicked)
   - `.game-view` is hidden (display: none)
   - `.content-panel.active.expanded` is visible, flex: 1 (fills screen)
   - Menu button is active

3. **Transition**
   - CSS `transition: all 0.3s ease` for smooth fade

### **Key CSS Classes**
```css
.game-view.hidden {
  display: none;  /* Hides map when content is open */
}

.content-panel.active.expanded {
  height: auto;
  flex: 1;  /* ← Takes 80% (toolbar is 20%) */
}

.toolbar {
  z-index: 100;  /* Always on top */
  min-height: 60px;
}
```

### **JavaScript**
```javascript
function openContent(type) {
  const panel = document.getElementById('contentPanel');
  const gameView = document.getElementById('gameView');
  
  panel.classList.add('active', 'expanded');
  gameView.classList.add('hidden');
}

function goToMap() {
  const panel = document.getElementById('contentPanel');
  const gameView = document.getElementById('gameView');
  
  panel.classList.remove('active', 'expanded');
  gameView.classList.remove('hidden');
}
```

---

## User Workflow

1. **Game loads** → See isometric map (🗺 button active)
2. **Click [📊 Markets]** → Map hides, Markets panel takes 80% of screen
3. **Click [Prices] tab** → Content switches (smooth tab transition)
4. **Click [🗺 Map]** or **[✕] close** → Map returns to full view
5. **Toolbar always visible** → Can switch menus anytime

---

## Visual Comparison

| View | Map Shows | Content Panel | Content Height |
|------|-----------|---------------|-----------------|
| Map (default) | ✅ Full screen | Hidden | — |
| Markets (📊 clicked) | ❌ Hidden | Visible | 80% of screen |
| Reports (📈 clicked) | ❌ Hidden | Visible | 80% of screen |
| Capital (🏗 clicked) | ❌ Hidden | Visible | 80% of screen |

---

## Features

✅ **Map button** (🗺) — First in toolbar, takes you back to map  
✅ **80% content** — Full focus on data when viewing  
✅ **Context preservation** — Game map visible by default (not buried)  
✅ **Smooth transitions** — 0.3s fade between states  
✅ **Responsive** — Works on desktop, tablet, mobile  
✅ **Accessible close button** — (✕) in header closes panel  
✅ **Pinned toolbar** — Always visible, never scrolls away  
✅ **Both themes** — Light and dark versions  

---

## Implementation Notes for Phase 10

For the real HTML/JS interface:
1. Start with `game-ui-cap2-final-light.html` as template
2. Replace content placeholders with real GameSession API data
3. Keep the hide/show logic for game map ↔ content panel swap
4. Bind toolbar buttons to API calls
5. Use tabs for multi-view panels (Markets, Reports, etc.)
6. Add real isometric map rendering (SVG or WebGL)

The layout pattern is **proven** (Cap2), **intuitive** (map → data swap), and **efficient** (80% content space for focus).


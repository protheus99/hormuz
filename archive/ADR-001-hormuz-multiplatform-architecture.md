# ADR-001: Hormuz Multi-Platform Architecture & Web Stack

**Status:** Proposed — pending spike result (see Action Item 1)
**Date:** 2026-09-17
**Deciders:** Jean
**Supersedes:** G10 "Technology & Delivery" (delivery targets table only; engine and interface choices unchanged)

---

## Context

Hormuz is a turn-based, single-player-first oil market strategy game. The engine (GEMS) is specified but **not yet built** — Phase 1 has not started. This is the single most important fact shaping this decision: there is no sunk implementation cost in any language, so the choice is genuinely open.

### Forces at play

| Force | Detail | Source |
|---|---|---|
| **Minimal dependencies** | Engine is Python 3.11 stdlib-only; extras are dev-tools only | G10, standing preference |
| **Deterministic by design** | Seed + command log replays to identical state; no clock-based randomness | G9 multiplayer-ready rules |
| **Clean engine boundary already specced** | `GameSession` is the *only* interface-to-engine path; views filtered inside the engine | G9 |
| **UI already built** | 8-menu toolbar, role-aware, vanilla HTML/CSS/JS, no framework | `game-ui-final-light.html` |
| **Turn-based, low compute** | One tick = one day; 22 regions, ~dozens of agents. Not a real-time loop. | Part II |
| **NEW: mobile required** | Android + iOS store presence | This request |
| **Multiplayer later** | Will wrap `GameSession` in a server | G9, G10 future decisions |

### What changed

G10 currently specifies Pyodide (web) + PyInstaller (desktop) + headless CLI. **PyInstaller cannot target iOS or Android.** Mobile is not an incremental addition to the current plan — it forces a re-evaluation of how the engine reaches the client on every platform.

### Constraints that are non-negotiable

1. Offline play must work (a strategy game that needs a server for single-player is a worse product and a recurring cost).
2. The engine must remain the single source of truth for game rules — no rule logic in the UI layer.
3. Determinism must survive across platforms, or replays and future multiplayer break.

---

## Decision

**Adopt Option A: one Python engine, executed under Pyodide inside a WebView on every graphical target, wrapped by Capacitor for mobile.**

The engine stays Python and stdlib-only. It runs under **CPython** for tests, CLI, balancing, and (later) the multiplayer server; and under **Pyodide** for web, iOS, Android, and desktop. Same source file, two runtimes, no port.

This decision is **gated on a de-risking spike** (Action Item 1). If the spike fails on cold start or memory on a real low-end device, fall back to Option B, which the master doc already anticipates.

---

## Options Considered

### Option A: Python engine under Pyodide, Capacitor shell ✅ RECOMMENDED

| Dimension | Assessment |
|---|---|
| Complexity | **Low** — one engine, one language, no port |
| Cost | **Low** — static hosting; no server for single-player |
| Scalability | Fine (turn-based, tiny state); server path preserved for multiplayer |
| Team familiarity | **High** — engine already specced in Python |
| Runtime risk | **Medium** — Pyodide cold start and memory on low-end mobile |

**Pros**
- Single source of truth. Determinism guaranteed by construction, not by testing two implementations against each other.
- Preserves *all* existing design work: the Part II spec, `GameSession`, the replay format, the balancing CLI.
- Multiplayer path is nearly free — the same Python runs server-side under CPython. No second implementation to write when the server arrives.
- The existing HTML/JS UI is reused verbatim. Capacitor ships a WebView; the UI doesn't know it's in an app.
- Desktop can collapse into the same bundle (Tauri or Electron), retiring the PyInstaller + `http.server` + `webbrowser` dance.

**Cons**
- Pyodide cold start is the main UX cost. <cite index="6-1">Loading the full Python runtime can result in a noticeable delay before code execution begins, and Pyodide relies on large WebAssembly files</cite> — mitigated on mobile because the runtime is *bundled*, not downloaded, but instantiation time remains.
- <cite index="6-1">Browsers cap memory allocation and Pyodide runs in a sandbox</cite>. Our state is small, but this needs measuring on a real device, not assuming.
- Adds ~10–15 MB to app size. Immaterial for a game; worth stating.
- Debugging across the JS↔Python bridge is more awkward than a single language.

### Option B: Port engine to TypeScript, Capacitor shell

| Dimension | Assessment |
|---|---|
| Complexity | **Medium-High** — two engines, or abandon Python |
| Cost | Low |
| Scalability | Excellent |
| Team familiarity | Medium |
| Runtime risk | **Low** — ~200 KB bundle, instant start |

**Pros**
- Best possible runtime characteristics: no WASM runtime, near-instant boot, smallest bundle, no memory ceiling concerns.
- One language across engine and UI.
- The master doc already names this as the contingency, and notes the deterministic replay format makes a port *verifiable* against the Python engine.

**Cons**
- Either maintain two engines forever (unrealistic for a solo developer — this is the decisive objection) or abandon Python, losing the CLI balancing harness and the natural multiplayer server.
- Every future rule change costs double, or drifts.
- Rewrites the Part II spec's implementation target, though not the spec itself.

**When to switch to this:** if the Option A spike shows cold start > ~5 s or memory instability on a low-end device. Since the engine isn't written yet, switching *now* costs nothing — switching *later* costs a full port.

### Option C: Server-authoritative Python, thin clients

| Dimension | Assessment |
|---|---|
| Complexity | Medium |
| Cost | **Ongoing hosting** |
| Scalability | Good, but pays for capacity that single-player doesn't need |
| Runtime risk | Low client-side; network becomes a failure mode |

**Pros:** Thinnest possible client; cheating impossible; natural multiplayer endpoint; no Pyodide risk at all.
**Cons:** **Kills offline play** — disqualifying for a single-player game. Recurring cost before any revenue. Latency on every turn resolution. Server becomes a launch blocker.

**Verdict:** Wrong for single-player; right for multiplayer later. Option A reaches this architecture naturally when needed, without committing now.

### Option D: BeeWare / Briefcase — native Python on mobile

| Dimension | Assessment |
|---|---|
| Complexity | Medium |
| Team familiarity | Low |
| Runtime risk | **High** |

**Pros:** Real CPython on device; keeps Python.
**Cons:** Discards the entire HTML/JS UI already built and requires a native toolkit rewrite. Store-review friction is a documented reality for this toolchain — Briefcase-built apps have hit <cite index="14-1">Guideline 2.5.2 rejections citing executable code that is not permitted on the App Store</cite>. Smaller ecosystem, thinner iOS story.

**Verdict:** Rejected. Loses the UI investment and adds the most risk.

---

## Trade-off Analysis

**The core trade-off is runtime performance (B wins) against maintenance surface (A wins decisively).**

For a turn-based game, runtime performance is a *threshold* requirement, not a *maximizing* one. There is no frame budget. A tick either resolves in acceptable time or it doesn't; being 10× faster than acceptable buys nothing. Cold start is the only place users feel it, and it's a once-per-session cost that a loading screen absorbs — this is a strategy game, not a 20-second casual session.

Maintenance surface, by contrast, compounds forever. Two engines means every balance tweak, every rule fix, and every event card is implemented twice and verified against each other. That cost never stops, and it's paid by one person.

**The multiplayer argument settles it.** G9 already commits to wrapping `GameSession` in a server. Under Option A that server runs the identical Python engine under CPython — zero additional implementation. Under Option B, multiplayer means either a Node server (acceptable) or reintroducing Python and maintaining a third surface. Option A's architecture converges toward the known future requirement; Option B diverges from it.

**On the App Store risk**, which looked like a potential hard blocker: it isn't. <cite index="13-1">Interpreted code may be used if all scripts, code and interpreters are packaged in the Application and not downloaded.</cite> Pyodide and the `.py` files ship inside the signed binary. The guideline targets apps that *fetch* logic post-review; <cite index="17-1">WebViews running JavaScript do not automatically violate 2.5.2</cite>. **Constraint this imposes:** never load game rules or content packs from a server at runtime. Bundle everything; ship rule changes as app updates.

---

## Recommended Architecture

### Layers

```
┌──────────────────────────────────────────────────┐
│  PLATFORM SHELL                                  │
│  Browser │ Capacitor (iOS/Android) │ Tauri       │
└──────────────────────────────────────────────────┘
                      ↕  Platform Services Adapter
┌──────────────────────────────────────────────────┐
│  UI LAYER — vanilla HTML/CSS/JS, no framework    │
│  8-menu toolbar, role-aware panels, SVG map      │
└──────────────────────────────────────────────────┘
                      ↕  Session Bridge (async)
┌──────────────────────────────────────────────────┐
│  GameSession API  ← the ONLY engine entry point  │
│  new_game · get_view · submit · end_turn · save  │
└──────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────┐
│  ENGINE CORE — Python 3.11, stdlib only          │
│  Phases 0–7 · matching · agents · deterministic  │
└──────────────────────────────────────────────────┘
```

Two new seams this ADR introduces:

**1. Session Bridge** — a thin async JS module that is the *only* code aware of how the engine is reached. It exposes `getView()`, `submit()`, `endTurn()`, `save()`, `load()` as promises. Today it calls Pyodide; for multiplayer it calls `fetch()`. Swapping transports must not touch a single line of UI code.

**2. Platform Services Adapter** — abstracts everything that differs per platform, so no UI file ever branches on platform:

| Service | Web | Capacitor (mobile) | Desktop |
|---|---|---|---|
| Save storage | `localStorage` / IndexedDB | Capacitor Preferences + Filesystem | Filesystem |
| Export/share save | Download blob | Share sheet | File dialog |
| Haptics | no-op | Capacitor Haptics | no-op |
| Back button | History API | Hardware back → close panel | no-op |
| Safe areas | CSS env() | CSS env() | n/a |

### Web stack

| Layer | Choice | Why |
|---|---|---|
| Engine | Python 3.11, stdlib only | Unchanged — G10 |
| Engine runtime (GUI) | **Pyodide**, bundled locally | No download at runtime; satisfies 2.5.2 |
| Engine runtime (CLI/server/tests) | **CPython** | Same source; native speed for balancing runs |
| UI | **Vanilla HTML/CSS/JS** | Unchanged — no framework, already built |
| Bundler | **Vite** | Needed to produce the Capacitor `www/` dir; near-zero config; dev server with HMR |
| Mobile shell | **Capacitor** | Wraps the web build; first-class iOS + Android; plugin set covers our adapter needs |
| Desktop shell | **Tauri** (replaces PyInstaller) | Same web bundle; far smaller than Electron; drops the `http.server` + `webbrowser` workaround |
| Map | Pre-projected SVG from Natural Earth | Unchanged — G10 |
| Tests | `unittest` (stdlib) | Unchanged |

**Dependency count added at runtime: one** (Pyodide). Vite, Capacitor, and Tauri are build-time only — consistent with the standing minimal-dependency preference.

### Delivery targets (replaces the G10 table)

| Target | How it works | Build-time tools |
|---|---|---|
| Web | Static host; Pyodide + engine served as assets | Vite |
| iOS | Capacitor → Xcode project → App Store | Vite, Capacitor, Xcode |
| Android | Capacitor → Gradle → Play Store | Vite, Capacitor, Android Studio |
| Desktop | Tauri bundle, same `www/` | Vite, Tauri, CI per-OS |
| Headless CLI | Native CPython, no Pyodide, no UI | None |

---

## Consequences

**What becomes easier**
- One engine implementation, one rule set, one replay format across five targets.
- Multiplayer becomes a transport swap in the Session Bridge, not a rewrite.
- Desktop packaging simplifies — Tauri replaces PyInstaller + local HTTP server + browser launch.
- Rule changes ship everywhere at once.

**What becomes harder**
- Cold start needs active management (splash screen, progressive init, possibly a pre-warmed snapshot).
- Debugging spans a JS↔Python boundary.
- Two build toolchains to maintain (Xcode, Gradle) plus store submission overhead.
- Engine code must stay Pyodide-safe: no threading, no subprocess, no blocking I/O, no filesystem assumptions. **This should be enforced from Phase 1**, not retrofitted.

**What we'll need to revisit**
- If the spike fails → Option B, decided *before* Phase 1 begins so no code is wasted.
- Multiplayer server framework (deferred, unchanged from G10).
- Whether desktop keeps PyInstaller (a CPython build would start faster than Pyodide) or unifies on Tauri. Unification is cleaner; PyInstaller is faster. Low-stakes, decide at Phase 13.

---

## Blocking UI finding: the toolbar does not fit in portrait

The current 8-icon toolbar cannot render on a phone in portrait. Measured against the shipped mockup CSS:

```
8 icons × 44px          = 352px
7 gaps  ×  6px          =  42px
                        ─────────
                          394px   ← already exceeds a 375px viewport
plus status bar (cash, P&L, date, speed)  ≈ 200px more
```

This needs resolving before Phase 10, not during. Three viable approaches:

1. **Split the bars** — status moves to a top bar, menus stay bottom. Uses vertical space, which phones have.
2. **Horizontal scroll** — keeps one bar, but hides options off-screen; poor discoverability for a menu that's meant to be always-visible.
3. **Primary + overflow** — show the role's action menus (1–2) plus 3 most-used reporting menus, collapse the rest behind "More". Fits the action-first ordering already decided.

**Recommend 1 + 3 combined:** status on top, action menus always visible bottom-left, reporting menus behind an overflow on phones only. Desktop and tablet keep all 8 inline. The 44px icon size is already correct — it matches Apple's minimum touch target, so no resizing needed.

---

## Action Items

**Gate — do this before Phase 1**

1. [ ] **Pyodide mobile spike (1–2 days).** Trivial Python module + Pyodide + Capacitor, on a real low-end Android device and a real iPhone. Measure: cold start to interactive, heap after 100 simulated ticks, per-tick time. **Pass criteria: cold start < 5 s, stable memory, tick < 100 ms.** Fail → adopt Option B now, before any engine code exists.

**Phase 1 — bake in the constraints**

2. [ ] Add a "Pyodide-safe subset" rule to the engine coding standards: no threading, subprocess, blocking I/O, or filesystem assumptions in `hormuz/engine/`.
3. [ ] Add a CI job running the test suite under **both** CPython and Pyodide from day one, so drift is caught immediately rather than at Phase 13.

**Phase 8 — when the package split happens**

4. [ ] Implement the **Session Bridge** as the sole engine-access module; forbid direct Pyodide calls from UI code (lint rule or review checklist).
5. [ ] Implement the **Platform Services Adapter** with a web implementation; stub mobile/desktop.
6. [ ] Make the save format transport-agnostic (plain JSON, no platform types) so it round-trips across all five targets.

**Phase 10 — UI**

7. [ ] Resolve the portrait toolbar (recommendation above); add safe-area insets, `touch-action`, and disable text selection/callouts on controls.
8. [ ] Add a loading screen covering Pyodide init, with real progress rather than a spinner.
9. [ ] Handle Android hardware back → close content panel → return to map.

**Phase 13 — packaging**

10. [ ] Vite build → Capacitor sync → Xcode/Gradle; CI for all five targets.
11. [ ] Decide Tauri vs. retaining PyInstaller for desktop.
12. [ ] Store prep: bundle *all* rules and content — never fetch logic at runtime (2.5.2 compliance).

---

## Master doc changes required

| Section | Change |
|---|---|
| G10 delivery table | Replace with the five-target table above |
| G10 engine line | Add: engine must stay within the Pyodide-safe stdlib subset |
| G9 | Add Session Bridge and Platform Services Adapter as named architectural seams |
| Phase 13 | Rewrite scope: Vite/Capacitor/Tauri instead of Pyodide/PyInstaller only |
| Phase 10 | Add responsive/touch toolbar work |
| Issues log | Log this ADR as resolving "mobile delivery not covered by PyInstaller" |

# Phase 1 Coding Roadmap — Core Types & Matching Engine (TypeScript)

**Goal:** a working, tested matching engine that satisfies all seven Phase 1 acceptance criteria from §15.
**Estimated effort:** 9 steps, each 30–90 minutes. Realistically 2–4 working sessions.
**Prerequisite:** Node.js 20+ installed (`node --version` to check).

---

## Definition of done

Phase 1 is complete when these seven tests pass, straight from the master doc:

| # | Acceptance criterion | Rule (§9) |
|---|---|---|
| 1 | Price-time priority | 1 |
| 2 | Landed-cost selection across origins | 2 |
| 3 | Resting-price execution on both sides | 4 |
| 4 | Partial fills | 5 |
| 5 | Marketable-limit remainder cancel | 6 |
| 6 | Lazy cancellation | 7 |
| 7 | Self-trade prevention | 8 |

**Explicitly NOT in Phase 1** — resist scope creep here, each belongs to a later phase:

- Cash, escrow, settlement → Phase 2
- Real regions, freight, chokepoints → Phase 4 (Phase 1 uses a **stub** route table)
- Refining, product prices → Phase 3
- Agents that decide anything → Phase 5
- The tick loop → Phase 6
- Any UI → Phase 10

Phase 1 has **no randomness at all**, so the seeded PRNG isn't needed until Phase 3.

---

## Project setup

```
hormuz/
  package.json
  tsconfig.json
  src/
    engine/
      types.ts          Step 1 — enums, Order, Fill
      routes.ts         Step 2 — stub route table
      priorityQueue.ts  Step 3 — generic heap
      exchangeNode.ts   Steps 4–8 — the matching engine
  tests/
    exchangeNode.test.ts
  inspector/
    index.html          Step 9 — visual book viewer
```

**Dependencies (both dev-only, nothing ships at runtime):**

| Package | Why |
|---|---|
| `typescript` | The compiler |
| `vitest` | Test runner — zero config with TS, watch mode, clear diffs |

Node has a built-in test runner (`node:test`) if you want literally zero dependencies, but Vitest's watch mode suits how you like to work: save a file, see results instantly.

**tsconfig:** use `"strict": true`. It's more warnings up front, but every one is a bug it just caught for you. Turning it on later means fixing them all at once instead of one at a time.

---

## The 9 steps

### Step 0 — Scaffold and prove the loop works · ~30 min
`npm init`, install the two dev dependencies, write `tsconfig.json`, and add one trivial test that asserts `1 + 1 === 2`.

Sounds pointless — it isn't. It confirms the whole toolchain works before any real code exists, so when something breaks later you know it's your logic, not the setup.

**Done when:** `npm test` prints a green pass.
**New TypeScript:** none.

---

### Step 1 — Domain types · ~60 min
Pure type definitions, zero logic. This is where you learn the syntax with nothing that can go wrong at runtime.

```ts
// One source of truth for both the runtime list and the type.
export const GRADES = ["LIGHT_SWEET", "MEDIUM", "HEAVY_SOUR"] as const;
export type Grade = typeof GRADES[number];
//   ^ reads as: "Grade is any one of the values in the GRADES array"

export type RegionId = string;
export type Side = "ASK" | "BID";
```

Then `Order`. Asks carry an origin, bids carry a destination — so model them as two shapes rather than one with optional fields:

```ts
interface OrderBase {
  readonly id: number;
  readonly seq: number;        // submission counter — breaks price ties
  readonly agentId: string;
  readonly grade: Grade;
  readonly price: number;
  readonly qty: number;
  qtyRemaining: number;        // not readonly: partial fills decrement it
  active: boolean;             // lazy cancellation flag (rule 7)
}

export interface Ask extends OrderBase {
  readonly side: "ASK";
  readonly originRegion: RegionId;
}

export interface Bid extends OrderBase {
  readonly side: "BID";
  readonly deliveryRegion: RegionId;
}

export type Order = Ask | Bid;
```

That last line is a **discriminated union**. Once you check `if (order.side === "ASK")`, TypeScript knows `originRegion` exists and that `deliveryRegion` does not. It makes the "ask with a delivery region" bug unrepresentable.

Finally `Fill` — record every component, because Phase 2's settlement and the cash-conservation invariant will need them:

```ts
export interface Fill {
  readonly askOrderId: number;
  readonly bidOrderId: number;
  readonly grade: Grade;
  readonly originRegion: RegionId;
  readonly deliveryRegion: RegionId;
  readonly qty: number;
  readonly fobPrice: number;      // what the seller receives
  readonly freight: number;
  readonly tariff: number;
  readonly landedPrice: number;   // what the buyer pays = fob + freight + tariff
}
```

**Done when:** it compiles. No tests needed — types alone can't run.
**New TypeScript:** `type`, `interface`, union types, `as const`, `readonly`, `extends`, discriminated unions.

---

### Step 2 — Stub route table · ~30 min
§15 says Phase 1 uses a stub. Define the interface the real Phase 4 graph will later satisfy, then back it with a hardcoded map.

```ts
export interface RouteInfo {
  readonly totalFreight: number;
  readonly pipelineCapacity: number;
  readonly chokepoints: readonly string[];
}

export interface RouteTable {
  lookup(origin: RegionId, destination: RegionId): RouteInfo | null;
  tariff(destination: RegionId): number;
}
```

`| null` is deliberate — it forces you to handle "no usable route" (rule 2) at every call site instead of forgetting it.

Getting the *interface* right matters more than the stub behind it. Phase 4 swaps the implementation and nothing else changes.

**Done when:** a test confirms a known pair returns expected freight, and an unknown pair returns `null`.
**New TypeScript:** interfaces as contracts, `| null`, optional chaining.

---

### Step 3 — Priority queue · ~60 min
No built-in heap in JavaScript, so write a small one (~50 lines). Your first generic.

```ts
export class PriorityQueue<T> {
  constructor(private readonly compare: (a: T, b: T) => number) {}
  push(item: T): void { /* sift up */ }
  peek(): T | undefined { /* root */ }
  pop(): T | undefined { /* sift down */ }
  get size(): number { /* ... */ }
}
```

`<T>` means "works with any type, but stays consistent" — a `PriorityQueue<Ask>` gives back `Ask`, never `Bid`.

Asks sort by `(price, seq)` ascending; bids by `(-price, seq)`. Both comparators are two lines.

**Done when:** tests prove ordering, tie-break by `seq`, and behavior when empty.
**New TypeScript:** generics, classes, `private readonly`, function types, getters.

---

### Step 4 — ExchangeNode skeleton, no matching yet · ~60 min
Build the book structure from rule 1: one ask heap **per origin region**, one bid heap **per delivery region**, plus `ordersById` and `ordersByAgent` for cancellation.

`submit()` only rests orders for now — no crossing.

**Done when:** submitted orders land in the correct heap in the correct order. Two asks from different origins occupy separate heaps.
**New TypeScript:** `Map<K, V>`, class state, private methods.

---

### Step 5 — Matching: incoming bid · ~90 min
Rule 2, the heart of the engine. For each origin heap: take the top active ask, look up its route to the bid's delivery region, compute `landed = ask.price + freight + tariff`, skip unusable routes, pick the **lowest landed cost** (ties → earlier `seq`), and fill while `bid.price >= landed`.

This is the hardest step. Everything after it is a variation.

**Done when:** acceptance criteria **1 and 2** pass — price-time priority, and a distant cheap origin correctly losing to a nearer pricier one once freight is added.
**New TypeScript:** narrowing via the `side` discriminant, iterating Maps, array sorting with comparators.

---

### Step 6 — Matching: incoming ask · ~45 min
Rule 3, the mirror image: compute `netback = bid.price − freight − tariff`, pick the **highest**, fill while `netback >= ask.price`.

Much faster than Step 5 — same shape, inverted.

**Done when:** an incoming ask matches resting bids correctly across delivery regions.
**New TypeScript:** none — consolidation.

---

### Step 7 — Resting price and partial fills · ~60 min
Rules 4 and 5. The trade prints at the **resting** order's price: if the resting side is an ask, `fobPrice = ask.price`; if it's a bid, `fobPrice = netback`. Then `fillQty = min(incoming.qtyRemaining, resting.qtyRemaining, pipelineCapacity)`, decrement both, remove filled orders, and **keep priority** on partially filled resting orders.

**Done when:** acceptance criteria **3 and 4** pass.
**New TypeScript:** none.

---

### Step 8 — Cancellation, self-trade, remainder cancel · ~60 min
The three remaining rules:
- **Lazy cancellation (7):** flip `active = false`; skip inactive orders at the heap top and discard them. Never search the heap.
- **Self-trade prevention (8):** an incoming order never matches its own agent — cancel the resting order and continue.
- **Marketable-limit remainder (6):** after crossing, unfilled remainder rests or cancels per order type.

**Done when:** acceptance criteria **5, 6, and 7** pass. **Phase 1 is complete.**
**New TypeScript:** none.

---

### Step 9 — Visual inspector · ~60 min
A single HTML page that builds a book, submits orders, and renders both sides plus resulting fills as tables. No framework, no build step — open the file directly.

Optional for correctness, valuable for you: it turns the engine from passing assertions into something you can *look at*, which is how you prefer to verify things. It also becomes the debugging tool for Phases 2–6, so the hour pays itself back.

**Done when:** you can watch a cross-region match happen and see why one origin won.

---

## Learning ladder

New TypeScript concepts are front-loaded on purpose — Steps 6–9 introduce none, so by the time the logic gets intricate you're working in a language you've already met.

| Steps | New syntax | Difficulty |
|---|---|---|
| 0 | — | Trivial |
| 1–2 | Types, unions, interfaces | Easy — no runtime behavior |
| 3–4 | Generics, classes, Maps | Moderate |
| 5 | Narrowing (logic is the hard part, not the syntax) | **Hardest step** |
| 6–9 | None | Consolidation |

---

## How we work each step

1. I write the code with comments explaining the TypeScript-specific parts
2. You read it and ask about anything unclear — I explain that line, not the language in general
3. We run the tests together and inspect output
4. You request refinements; we iterate before moving on

**Don't move to the next step until the current one's tests are green.** Each step builds directly on the last, and a bug in Step 5 surfacing during Step 8 is far more expensive to find.

---

## Risks

| Risk | Mitigation |
|---|---|
| Step 5 is a genuine difficulty spike | Split it: get single-origin matching working first, then add cross-origin landed-cost selection |
| `strict: true` feels noisy early | Each error is a real bug; I'll explain rather than suppress. Never use `any` to silence one |
| Scope creep into Phase 2 (cash feels "obviously needed") | It isn't. The engine matches orders; settlement moves money. Keep them separate |
| Floating-point comparison in tests | Compare with a tolerance, not `===`. Relevant from Step 5 on |

---

## After Phase 1

Phase 2 adds `Region`, `Agent`, `Producer`, `Manufacturer`, `FeeLedger`, escrow, and settlement — the point where barrels and cash start conserving and the first invariants come alive.

Nothing in this roadmap changes if you later switch UI approach, add a framework, or wrap for mobile. The engine has no UI dependency by design.

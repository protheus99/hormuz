# HORMUZ MASTER PLAN
## Game Design, Engine Specification & Build Plan

**Status:** In build — engine Phases 0–7, the game session (Phase 8) and decision cards (Phase 9) complete; the Phase 10 interface and Phase 11 events, news, campaign and difficulty are built, Phase 12's first balance pass is done, and the owner's first eight rounds of playtest notes are answered (D45–D52); the open balance and process questions are in `QUESTIONS.md`. This is the single source of truth for the Hormuz game and its market engine (GEMS, the Global Energy Market Simulator). It supersedes all earlier GEMS specifications and prototypes.
**Build:** TypeScript. `src/engine/` in Phases 1–7, then `src/game/` and `web/` in Phases 8–13 (§14).

Anything not written here is out of scope. Every number in this document — labor indices, tariffs, transit times, freight rates, capacities, costs, scenario targets — is an **illustrative placeholder** to be tuned for play, not market data. There are no open decisions (§12).

---

# PART I — GAME DESIGN

Hormuz is a **single-player economic strategy game**. The player is the CEO of an oil company inside a living crude market: they set direction and answer decisions, and the company carries them out. Part II is the market engine underneath. Multiplayer comes after launch, and the architecture allows it without a rewrite (G9).

## G1. Vision & Pillars

**Pitch:** Run an oil company in a world where every barrel is real, every tanker takes time, and a single strait can rewrite the market overnight.

1. **Every barrel is real.** The player's company buys, ships, stores and sells through the same markets, routes and storage limits as its rivals, and its decisions move prices.
2. **Geography is the board, and every chokepoint is live.** Chokepoints, routes, pipelines and regional grades are the strategic terrain. Any of the seven chokepoints can come under tension, slow down or close; Hormuz is the most dramatic, not the only one. Where a company operates decides which chokepoints it should watch.
3. **Crises are readable.** Disruptions are signalled in stages, and the decisions they call for arrive in time to act on.
4. **Rivals play fair.** AI companies run the same rules, face the same decisions and see the same public information as the player.
5. **Play at your own pace.** A running clock with pause, speed control and auto-pause keeps a multi-year game manageable.
6. **Simple to decide, deep underneath.** Every choice is a plain-language card with at most three options and a visible impact. The simulation's complexity stays behind the card; a teenager should be able to play well.

## G2. Play Types

The player picks a play type, a home region valid for it (§3.4), and a company name.

| Play type | Starting assets | Core loop | Company setting | Difficulty |
|---|---|---|---|---|
| **Producer** | Wells and storage in one production region | Pump, store and sell crude at the best price | Selling: Sell fast · Balanced · Hold for price | Easy |
| **Refiner** | One refinery (Tier 1 or 2) in a refining region | Secure crude cheaply and refine it when margins are good | Stockpile: Lean · Normal · Deep | Medium |
| **Trader** | Cash, a credit line, and trading offices in one or two regions | Move and store crude to profit from price gaps between regions and over time | Appetite: Low · Medium · High | Hard |

Every play type also has **Risk: Bold · Balanced · Safe** (G4.2).

**Integrated Major is a producer's goal, not a starting type.** A producer that builds a refinery becomes integrated through a late-game card (G4.4). Refiners cannot acquire fields; they grow through refining capacity, technology and a second refinery in another region (G4.4, D34). The new plant is a `UNIT_CAPACITY` (2,500 bbl/day) refinery at the **lowest tier that can refine the producer's own crude** — Tier 1 for light sweet, Tier 2 for medium, Tier 3 for heavy sour — with 10 days of crude storage, priced at `FACTORY_COST` plus `TIER_COST` for each tier above 1, all × labor. A Tier 1 plant would leave most integrated producers unable to refine their own oil. Both halves must sit in the same region, so integration is open where a region has both production and refining roles — `US_Gulf_Coast`, `Mexico_Gulf`, `Brazil_Presalt`, `North_Sea`, `Russia_West`, `Southeast_Asia` — and closed in `Middle_East` for the reason in §10.3.

**Market weight.** The player's company starts at 15–20% of its home region's production (Producer) or refining capacity (Refiner). A Trader starts with capital of about 15% of its regions' daily traded value. Growth can take any company to 35–40%. Below that range nothing the player does visibly moves prices (pillar 1). A starting company is never smaller than 2,000 bbl/day (Producer) or 2,500 bbl/day (Refiner), still at most half the rival it is taken from (D36): in thin regions 17.5% came to 1,000 bbl/day, too small ever to hold a deal (`DEAL_VOLUME` min over `DEAL_MAX_SHARE`), and such a company saw no cards in a year. The player's company enters the world by scaling down the largest AI company of the same type in that region, so global balance (§10.3) holds.

## G3. Time & Pacing

- **One tick is one day.** The engine only ever advances in whole days.
- **Running clock (single player):** Pause, ×1, ×2, ×4, ×8. At ×1 a day takes about two seconds (tunable). "Advance to next event" runs until the next card or alert.
- **Auto-pause** on every new card, and on alerts at or above a severity the player chooses. Critical alerts always pause.
- **Commands at any time.** Card answers and setting changes can be made paused or running. They take effect at the start of the next tick and are stamped with that tick in the replay log, so replays are identical at any speed.
- **Game length:** Sandbox games run 1, 3 or 5 years, or without end. Campaign scenarios set their own length (G7).

A tick costs under 3 ms, so ×8 has ample headroom and a 5-year game (1,825 ticks) costs a few seconds of compute in total.

## G4. Decisions

The player never places an order, types a price or builds a rule. Every day the company runs the decision rules in §6 automatically — the same rules every AI rival runs — shaped by two company settings. Everything else the CEO decides arrives as a **card**. Chokepoint status, freight rates, product prices, regional costs and every rival's state change only through events and other companies' activity.

### G4.1 Decision cards

Every decision is a card, whether the game raised it or the player opened it from the **Opportunities** list.

| Part | Rule |
|---|---|
| **Situation** | Two sentences at most, in plain words |
| **Yes** | Take the proposed action |
| **No** | Leave things as they are |
| **Maybe** | The middle path: half the size, a shorter term, or a partial fix. Omitted when no meaningful middle path exists |
| **Impact** | Every option shows the same four meters: **Cash** (change now), **Profit** (change per month), **Supply** (the worst point over the projection, not the day-30 value: fewest days of crude for a refiner, fullest storage for a producer, largest open position for a trader), **Risk** (Low · Medium · High, covering what the projection cannot see — G4.5) |
| **Deadline** | A card the game raises resolves as **No** if the player does not choose within `CARD_DEADLINE`. A card the player opens from Opportunities has no deadline: it stays until answered or closed |
| **Affordability** | An option costing more than available cash plus unused credit still shows, marked "Not enough money yet" with an estimate of when current profit will cover it ("not at current profit" when profit is zero or negative). It cannot be chosen until affordable; the card is never hidden |
| **Merging** | Cards with the same cause — one chokepoint event, one deal, one asset — merge into a single card whose options cover everything affected. A situation that arises while a related card is open updates that card instead of adding another |
| **Details** | An optional expander with the full numbers — $/bbl, route, landed cost — for players who want them |
| **Limits** | At most `CARD_MAX_OPEN` cards open at once, and a `CARD_COOLDOWN` per card type, so the inbox never floods. Urgent cards (breakdown, cash, low stock, full storage, stuck cargo) are checked first, so a full inbox never hides them |
| **As built** | Opening an Opportunity changes nothing in the world, so it is not a command; answering any card is (`ANSWER_CARD`), and an Opportunity's options are rebuilt from the world when the answer applies, so a replay answers the card the player saw. An action the world no longer allows when the answer applies is skipped with an alert, and the rest still apply |

As the player sees it. Yes is only offered for volume the new route can carry: this deal fits within the Oman pipeline's 3,000 bbl/day, which other companies share.

> **Tension in the Strait of Hormuz**
> Your deal with Qasr Petroleum (2,000 barrels a day) ships through Hormuz. Insurers have raised costs and there is talk the strait could close.
>
> **Yes** — Move the deal to the Oman pipeline route. Safer, but it costs more. *Profit −$24K/mo · Risk High → Low*
> **No** — Keep shipping through Hormuz. *Profit unchanged · Risk High.* If the strait closes, oil you have paid for gets stuck at sea.
> **Maybe** — Move half the deal. *Profit −$12K/mo · Risk High → Medium*
>
> *Decide by day 52*

### G4.2 Company settings

Two settings per company, each a single choice among three options — no conditions, thresholds or rule trees. Each option maps to engine parameters. AI personalities are presets over the same settings (G8).

| Setting | Options | Engine effect |
|---|---|---|
| **Risk** (all) | Bold · Balanced · Safe | Chokepoints to avoid: none · at `DELAYED` or worse · at `TENSION` or worse |
| **Selling** (Producer) | Sell fast · Balanced · Hold for price | `SKEW` 0.20 / 0.10 / 0.05 · `MIN_MARGIN` 0.50 / 1.00 / 3.00 · `DUMP_THRESHOLD` 0.80 / 0.90 / 0.97 |
| **Stockpile** (Refiner) | Lean · Normal · Deep | `TARGET_DAYS` 5 / 10 / 20 · `URGENCY` 0.12 / 0.08 / 0.05 |
| **Appetite** (Trader) | Low · Medium · High | `MAX_RISK_LIMIT` $2M / $5M / $10M · `HALF_SPREAD` 0.60 / 0.40 / 0.25 |

An integrated company holds both Selling and Stockpile. Run rate, maintenance timing, crude mix, internal allocation and charter use run on defaults (§6.5) and change only through cards.

### G4.3 Deals

A **deal** is an agreement for one company to supply another with a fixed volume of one crude every day, from one origin, for 30 or 90 days, at a **fixed price**. It is deliberately simple: the player sees six facts and never types any of them.

| The player sees | The engine handles |
|---|---|
| Partner, crude type, barrels a day, length, price, route | Daily delivery ahead of the spot market (§5), cargo dispatch, routing, first claim on pipeline capacity |
| "You pay when your oil is loaded" | The buyer carries route risk: if a chokepoint closes, paid-for cargo waits at sea |
| "Qasr missed 2 days; you received $X compensation" | Automatic shortfall penalties in either direction (`SHORTFALL_RATE`) |
| A card to cancel, with the fee shown | Early termination (`CANCEL_RATE` × remaining deal value) |
| — | Keeping deals out of marker prices; AI offer and acceptance logic |

Deals only arrive as cards: a rival offers one, or the player opens **Find a deal** and offers arrive within `TENDER_DELAY`. There is no haggling. The price is fixed at signing from the 20-day average FOB price at the origin, **never above what the crude last fetched there** (D43), adjusted ±2% by the offering company's personality. Without that cap a falling market produced offers above spot, which no sensible player signs — and a refiner that turned them all down ran dry. No company may have more than `DEAL_MAX_SHARE` of its capacity under deals, so the spot market keeps real volume.

**Why deals carry the Hormuz story.** A refiner holding a Gulf deal keeps loading and paying after the strait closes while its cargo waits at the entry, and it decides through cards whether to reroute, cancel, or buy emergency crude elsewhere. The fixed price makes the stakes obvious: "you locked in $61 and the market is at $79" is a saving anyone understands.

### G4.4 Card catalog

"No" always keeps things as they are, so only Yes and Maybe are listed. **Opp** marks cards the player can also open from Opportunities at any time. An integrated company receives both the producer and refiner catalogs.

**Shared**

| Card | Raised when | Yes | Maybe | Engine effect |
|---|---|---|---|---|
| Cash running short | Available cash below 10 days of fixed costs | Borrow on the credit line | Pause capital projects | Credit draw / project hold |
| Market report *(Opp)* | Always available | Buy | — | Market report (G5) |
| Find a deal *(Opp)* | Always available | Request 90-day offers | Request 30-day offers | Tender; offers arrive as deal cards |

**Producer**

| Card | Raised when | Yes | Maybe | Engine effect |
|---|---|---|---|---|
| A buyer offers a deal | AI offer | Sign for 90 days | Sign for 30 days | New deal |
| Prices below your cost | Netback below breakeven for 10 days | Cut output to 50% | Cut to 75% | `extraction_rate` |
| Storage nearly full | Fill ≥ 90% | Sell the surplus at a discount | Lease extra storage | One-day ask at cash cost / lease |
| Prices have recovered | Shut in, and netback above breakeven for 10 days | Restart wells (fee) | Restart half | `extraction_rate`, `RESTART_COST` |
| Wells declining | Capacity below 90% of peak | Drill new wells | Drill half | Drilling project |
| Trouble on your export route | Any chokepoint on your buyers' routes reaches `TENSION` or `DELAYED` | Lock in buyers now, at a discount | Lock in half | Discounted deal offers to current buyers |
| Closure risk on exports | `TENSION` on a chokepoint your exports cross, where a bypass pipeline exists | Reserve bypass space | Reserve half | Pipeline reservation |
| Expand storage *(Opp)* | Always available | Two steps | One step | Storage project |
| Build a refinery *(Opp, late)* | Net worth above `INTEGRATE_THRESHOLD`, eligible region | Build | — | Becomes integrated after `FACTORY_TICKS` |

**Refiner**

| Card | Raised when | Yes | Maybe | Engine effect |
|---|---|---|---|---|
| A supplier offers a deal | AI offer | Sign for 90 days | Sign for 30 days | New deal |
| Stock running low | Stock plus inbound below 5 days | Emergency purchase at a premium | Buy half and slow to 75% | One-day bid at maximum urgency / utilization cap |
| Refining is losing money | Margin below `FIXED_COST_RATE` for 5 days | Slow to 50% | Slow to 75% | Utilization cap |
| Margins are strong | Margin above twice fixed cost, maintenance due within 30 days | Run flat out and delay maintenance | Run flat out | Utilization 100%; maintenance deferred 60 days |
| Maintenance due | Days since maintenance ≥ interval | Shut for 5 days now | Schedule in 2 weeks | Maintenance |
| Breakdown | An outage begins | Emergency repair | Partial restart at 50% | Outage halved at `EMERGENCY_REPAIR_COST` / capacity factor |
| Cheap heavy crude | Tier 3, and heavy crude's landed discount above threshold | Switch the crude mix to heavy | Blend in half | Grade weighting |
| Trouble on your supply route | Any chokepoint on a deal's route reaches `TENSION` or `DELAYED` | Reroute the deal (costs more) | Reroute half | Deal avoid set / split |
| Deal oil stuck at sea | Deal cargo held 3+ days | Cancel the deal (fee) | Keep it and buy emergency supply | Deal cancelled / emergency bid |
| Upgrade tech tier *(Opp)* | Tier below 3 | Upgrade | — | Tier project |
| Add a processing unit *(Opp)* | Always available | Build | — | Unit project: +`UNIT_CAPACITY` (2,500 bbl/day) after `FACTORY_TICKS` |
| Build a second refinery *(Opp, late)* | Net worth above `INTEGRATE_THRESHOLD`, one refinery owned | Build | — | A `UNIT_CAPACITY` plant at the first plant's tier in another refining region (not `Middle_East`), after `FACTORY_TICKS` |
| Expand crude storage *(Opp)* | Always available | Two steps | One step | Storage project |

**Trader**

| Card | Raised when | Yes | Maybe | Engine effect |
|---|---|---|---|---|
| Back-to-back deal | A producer–refiner spread exceeds freight plus threshold | Take the whole deal | Take half | Two linked deals; the trader carries route risk |
| Distressed cargo | A seller's storage ≥ 95% | Buy it all | Buy half | One-day bid at a discount |
| Prices unusually low | Marker below its 20-day average by more than carry | Fill storage | Fill half | Storage-play bid size |
| A price gap opens between regions | Landed spread exceeds freight plus threshold | Commit capital for 4 weeks | Commit half | Arbitrage allocation |
| The market is moving against you | Open position down more than 10% | Cut the position | Cut half | Sell-down asks |
| A crisis is brewing | An event at `RUMOR` or `TENSION` | Stock up outside the danger zone | Stock up half | Bids in unaffected regions |
| Your cargo is stuck | Own cargo held 3+ days | Sell it at sea at a discount | Sell half | Forced sale at `DISTRESS_DISCOUNT` |
| Keep cargo afloat | Chartered cargo arriving while prices are unusually low | Hold it at sea | — | Floating storage |
| Lease storage *(Opp)* | An office region with pool space | 90 days | 30 days | Lease |
| Charter a tanker *(Opp)* | Companies that buy crude: refiners, traders, integrated (D45) | Large, 90 days | Small, 30 days | Charter |
| Open a trading office *(Opp)* | A region without an office | Open | — | New tradeable region (`OFFICE_COST`) |

### G4.5 Impact projections

Each option's meters come from **forking the world**: copy the state, apply the option, run `PROJECTION_TICKS` days, and compare with the No fork. Plain-data state (§4.1) makes the copy trivial; three options cost roughly a quarter of a second.

Forks run under **calm conditions**: product-price noise off (σ = 0), no new events, and events in progress held at their current stage. The meters therefore show "what happens if today's conditions hold" and can never leak the real future. What a projection cannot see goes into the Risk meter, which shows the highest of three parts:

| Part | Low | Medium | High |
|---|---|---|---|
| **Routes:** share of the company's flows crossing chokepoints at `TENSION` or worse | Below 20% | 20–50% | Above 50% |
| **Breakdown:** chance of a refinery outage within `PROJECTION_TICKS`, from the §4.9 hazard | Below 5% | 5–15% | Above 15% |
| **Cash:** days of fixed costs covered by available cash plus unused credit, at the projection's lowest point | Above 30 | 10–30 | Below 10 |

The card's Details expander names the part that set the level. Thresholds are placeholders for Phase 12.

### G4.6 AI parity

AI companies receive the same card types from the same detectors, without the text. Instead of forking, they score each option with a cheap estimate from the card's inputs and choose by personality: Conservative weights Risk, Aggressive weights Profit, Balanced sits between. Forking every card for 25 companies would be too slow at ×8.

| Capability | Phase 7 | Phase 9 | Phase 11 |
|---|---|---|---|
| Daily decision rules (§6), settings presets, route avoidance | ✅ | | |
| Deal offers and acceptance | ✅ | | |
| Operating cards (output, run rate, maintenance, repair) | Built-in rules (§6.5) | ✅ Card scoring | |
| Growth cards (drilling, tiers, units, leases, charters, offices, reservations) | | | ✅ Card scoring |

Balance numbers stay provisional until Phase 12, because until Phase 11 the player has growth decisions no rival has.

**As built (Phase 9).** Each operating card has a table of Yes / Maybe / No odds per temperament (`ai/scoring.ts`), and one draw from the AI stream picks the answer; a card without a Maybe gives Maybe's odds to Yes. In a game (`cardsActive`) the built-in maintenance and output-cut rules of §6.5 are off for every company, so these answers are the only way plants get serviced and output gets cut. AI companies answer at once, share the player's `CARD_COOLDOWN`, and skip an answer they cannot afford.

### G4.7 Enough decisions

Each play type must pass four checks (Phases 11–12):

1. **Coverage:** at least 10 card types across deals, operations, risk and growth. Including shared cards: Producer 12, Refiner 16, Trader 14.
2. **Market weight:** the starting company holds 15–20% of its region (G2).
3. **Pacing:** a median of 7–14 game days between cards.
4. **Decisions matter:** a bot that always answers **No** loses every Medium and Hard campaign scenario, and a bot that always answers **Yes** does not reliably win them.

Producer is the thinnest role, because in a calm market pumping and selling run themselves. **Field decline** (§4.8) — about 3% a month for shale, 0.5% for conventional fields — gives it a steady drilling decision.

## G5. Information Visibility

| Information | Visibility |
|---|---|
| Marker prices, product prices, price history | Public |
| Previous close: FOB and landed prices by origin, traded volumes | Public |
| Chokepoint and pipeline status, news | Public |
| Own cash, storage, deals, cargo, projects and cards | Private |
| Rival cash, storage, deals and orders | Hidden |
| Approximate rival storage by region, `REPORT_LAG` days old, ±`REPORT_NOISE` | Purchasable (market report) |

AI companies use only public information plus their own state. Order books are internal to the engine and never shown.

## G6. Goals, Scoring & Failure

**Modes.** **Campaign:** scripted scenarios with goals (G7). **Sandbox:** choose play type, region, length and difficulty; scored on net worth. **Challenge:** a fixed seed and settings so everyone faces the same market (online leaderboards after launch).

**Net worth** = cash + inventory at its grade's marker price + depreciated capital assets − credit drawn.

**Credit line:** limit = `CREDIT_ASSET_SHARE` (5) × capital assets + a play-type base amount (`CREDIT_BASE`: producer $10M, refiner and trader $20M) — generous by decision (D35), because the world has too few companies to lose any to a bad start — with `CREDIT_RATE` daily interest on the drawn balance. Capital assets are valued at replacement cost: the plant at `FACTORY_COST` plus its tier upgrades, wells at `DRILL_COST` and tanks at `STORAGE_COST`, all × labor. At the end of each day negative cash is covered from the line automatically (invariant 9), and cash above `CREDIT_CUSHION_DAYS` (30) of fixed costs repays it. Borrowing is money lent into the economy, so invariant 2 counts net borrowing.

**Bankruptcy:** available cash below zero with the credit line fully drawn for 3 consecutive days. Scenarios may add their own loss conditions.

## G7. Events, News & Campaign

### G7.1 Events and news

**Event cards** drive disruptions through stages that escalate or fade: `RUMOR → TENSION → DISRUPTION → RECOVERY`. Each stage has a duration range, a chance of advancing, and effects: chokepoint status, pipeline capacity, refinery outages, product price shocks, storage costs, or regional production outages. Random events come from a deck weighted by difficulty; scenarios script specific ones. The `TENSION` chokepoint status adds a war-risk freight surcharge without delay (§3.5).

**Every chokepoint is live.** Each of the seven has its own event profile in the deck — a different kind of trouble, a different likely severity, and a different way for traffic to get around it. Figures are for Normal difficulty and are tuned in Phase 12.

| Chokepoint | Kind of trouble | Worst stage | Events a year | Typical length | Traffic diverts via | Who feels it most |
|---|---|---|---|---|---|---|
| `HORMUZ` | Security incidents; insurers withdrawing cover | `CLOSED` | 0.4 (closure 0.1) | Tension 20–60 days; closure 15–45 | Bypass pipelines to the Red Sea and the Gulf of Oman, capacity-limited | Gulf producers; Asian and South Asian refiners |
| `BAB_EL_MANDEB` | Security incidents at sea | `CLOSED` | 0.5 (closure 0.15) | 30–90 days | Cape of Good Hope, about 14 days longer | Europe–Asia cargo; Red Sea terminal exports |
| `SUEZ` | A grounded vessel; canal works | `CLOSED`, briefly | 0.3 | Closed 5–10 days, or delays of 2–5 days | Cape of Good Hope | Gulf and Red Sea crude to Europe; Atlantic crude to Asia |
| `MALACCA` | Congestion; poor visibility | `DELAYED` | 0.5 | Delays of 3–6 days lasting 5–20 days | Lombok passage, 3 days and $0.30 more | Almost all westbound supply into East Asia |
| `BOSPHORUS` | Heavy traffic; fog and storms | `CLOSED`, briefly | 0.8 | 2–10 days | Caspian's Mediterranean pipeline (2,000 bbl/tick); Baltic ports for Russian crude | Russian Black Sea and Caspian exports |
| `DANISH_STRAITS` | Winter storms and ice | `DELAYED` | 0.5, winter only | Delays of 3–8 days lasting 10–40 days | Black Sea ports for Russian crude | Russian Baltic exports |
| `PANAMA` | Low water in the dry season | `DELAYED`, with surcharge | 0.5, dry season only | 30–120 days | Cape of Good Hope | Americas-to-Asia cargo |

Together that is about 3.5 events a year: a 3-year Normal game sees roughly ten, two or three of them closures. Easy halves the rates and Hard raises them by half (G8).

**Deck rules:**

1. **Warning scales with severity.** Long or severe events always start at `RUMOR`, with more notice on easier difficulties (pillar 3). Sudden events — a grounding, fog — skip the warning but are always short.
2. **Never both the chokepoint and its way around.** On Easy and Normal, the deck never closes a chokepoint while the route that bypasses it is also disrupted (for example, Hormuz with Bab el-Mandeb, which would cut off the Red Sea bypass). Hard and scripted scenarios may.
3. **Relevance.** On Normal, each game year includes at least one event on a chokepoint the player's company depends on; the rest fall anywhere. Every event is a world event: rivals on the same routes are hit just as hard.
4. **Seasons.** Danish Straits events happen only in winter and Panama events only in the dry season, so seasonality shapes risk as well as product prices.

**News** is generated from templates when events change stage or prices move sharply.

**As built (Phase 11).** The deck lives in the game layer (`game/events.ts`, profiles and wording in `content/events.ts`). When an event starts, all its stages are drawn at once — rumour (Easy 10–15 days, Normal 5–10, Hard 2–4), tension with its war-risk surcharge, whether it escalates, the disruption and a recovery of lingering delays after a closure — and each stage's chokepoint change is scheduled into the engine for the day it begins. Projections fork the world without the deck, so they cannot see what comes next. Random draws use their own stream (`seed:deck`). Price news fires when a crude marker moves 10% in a week, at most once a fortnight per grade. Across 100 simulated Normal years each chokepoint fires at 60–130% of its rate (events in progress block new ones), Hormuz closes about 0.1 times a year, seasons and the bypass rule hold, and a strait the player depends on is hit every year.

**Event wording rules (D32):**

1. **Faceless.** Say what happened to shipping and markets, never who caused it: "Shipping through the Strait of Hormuz is suspended; insurers have withdrawn cover," never "[country] closes Hormuz." Events have no concept of who is responsible, so these rules are about wording; the engine needs no change.
2. **Non-violent.** Use *incident*, *security concerns*, *insurers withdraw cover*, *shipping suspended*. Never *attack*, *missile* or *war*.
3. **No real people or real companies.** Countries appear only as places.

### G7.2 Campaign scenarios

Each scenario has a starting state, a script of events, **one main goal**, **two or three optional milestones** with small rewards (a cash grant, a free market report, a discount), a time limit, and a loss condition — bankruptcy unless stated. Dollar targets are tuned in Phase 12.

| ID | Scenario | Setup | Goal | Key cards |
|---|---|---|---|---|
| **P1** | First Oil *(tutorial)* | Small Permian producer, calm market, 6 months | 3 profitable months in a row and one deal signed | Deals, drilling |
| **P2** | Shale Glut | Rivals add capacity and Light Sweet slides; low water at Panama slows exports to Asia, 1 year | End the year at or above starting net worth | Cut output, early deals, storage |
| **P3** | Gulf Giant | Gulf producer through a full Hormuz cycle, 1 year | Keep 40%+ of exports flowing through the closure and finish ahead of Qasr | Reserve bypass early, lock in deals during tension |
| **R1** | Keep the Lights On *(tutorial)* | Tier 1 refiner in Coastal_Asia; one short congestion delay at Malacca, 90 days | No stockouts, and profitable | Supply deals, maintenance, a first route card |
| **R2** | Winter Diesel | Refiner in Southern_Europe; a winter diesel spike while fog and storms slow the Bosphorus, 1 year | Q4 profit of at least [TARGET] with no more than 2 stockout days | Run flat out vs maintenance, deep stockpile, rerouting |
| **R3** | Locked In | Tier 3 refiner holding a Gulf deal when Hormuz closes, 1 year | No more than 5 stockout days, and end at or above starting net worth | Reroute, cancel, emergency purchases |
| **T1** | Buy Low *(tutorial)* | One office, $2M; a grounded vessel shuts Suez for a week, 90 days | $500K profit and a second office opened | Storage, back-to-back deals, a price gap |
| **T2** | Contango | A refinery outage floods the market, 120 days | $1.5M profit from the outage | Distressed cargo, storage, timing |
| **T3** | The Long Way Round | Red Sea closed, 180 days | $3M profit, and no cargo held more than 10 days | Charters, price gaps, back-to-back deals |
| **★** | The Strait | Any play type, 3 years: a full Hormuz cycle, plus a second, unannounced chokepoint event drawn from the other six, plus random events | Finish first by net worth among companies of your type | Everything |

Across the campaign, six of the seven chokepoints are featured: Hormuz (P3, R3, ★), Bab el-Mandeb (T3), Panama (P2), Malacca (R1), the Bosphorus (R2) and Suez (T1). The Danish Straits appear through the finale's random draw and in Sandbox.

Scenarios are data, built from seven **goal types**: net worth, profit over a window, stockout days, solvency, owning an asset (tech tier, office count, integration), rank against rivals, and export share through an event. The engine verification runs S0–S17 (§11.2) are separate and never player-facing.

**As built (Phase 11).** Scenarios are data (`content/scenarios.ts`); scripts hold staged chokepoint events, engine events (product shocks, refinery outages) and company actions (rivals drilling, R3's starting Gulf deal). Refiner scenarios start with 30 days of crude, since a voyage to Asia takes weeks. A scenario ends as soon as a goal can no longer be met, on bankruptcy, or at its time limit; milestones pay cash (counted as money entering the economy) or a free report. Comparisons with rivals use profit per barrel a day of starting capacity (growth for traders), because percentage growth favours whoever starts with less cash. `npm run campaign` plays every scenario with the always-No and always-Yes bots over three seeds. Export share counts only crude sold out of the region, against the company's capacity; P3's script also cuts the bypass pipelines to 2,000 bbl/day for repairs, so early reservations decide it. Results at the end of Phase 11 (3 seeds): the always-No bot loses every Medium and Hard scenario; the Yes bot wins P1, R1 and P2 every time and P3, R2 and R3 two times in three; no bot wins T1–T3 or the finale, and both bots lose money as traders — the first targets for Phase 12, with P2, which the Yes bot wins too reliably.

**Sandbox** uses the same systems with no script: pick a play type and region, score on net worth, with an optional milestone list for guidance.

## G8. Difficulty & AI Rivals

| Setting | Easy | Normal | Hard |
|---|---|---|---|
| Starting cash | ×1.5 | ×1.0 | ×0.75 |
| Credit base amount | ×1.5 | ×1.0 | ×0.5 |
| Random event frequency | Low | Medium | High |
| Event warning time | Long | Medium | Short |
| AI personality mix | Mostly Conservative | Even | Mostly Aggressive |
| Market reports | Cheaper, more accurate | Standard | Costlier, less accurate |

**Optional modifier:** "Volatile markets" doubles product price volatility (σ, §7.3).

**As built (Phase 11).** Market reports cost ×0.5 / ×1 / ×2 and err ±7.5% / ±15% / ±22.5% on Easy / Normal / Hard; event rates are ×0.5 / ×1 / ×1.5 with the rumour lengths above; the bypass rule is relaxed on Hard. AI companies answer growth cards — drilling and reservations when raised, and a monthly look at tiers, units, storage, leases and offices — by temperament, paying only from cash in hand.

**Personalities.** Each AI company is Conservative, Balanced or Aggressive, fixed at game start. A personality is a preset over the company settings — Conservative is Safe, Hold for price, Deep, Low; Aggressive is Bold, Sell fast, Lean, High — plus its bias when scoring cards (G4.6), varied within seeded ranges so rivals differ from game to game.

## G9. Game Session & Architecture

**`GameSession` API** — the only way the interface talks to the engine. Every method is asynchronous although backed by a synchronous in-process engine, so moving the engine into a Web Worker or behind a server later is a transport change, not a rewrite.

- `newGame(settings): Promise<GameSession>`
- `getView(playerId): Promise<PlayerView>` — only what that player may see (G5), including open cards
- `submit(playerId, command): Promise<CommandResult>` — validates and queues a command for the next tick: answer a card, change a setting, or open an Opportunity
- `advance(ticks): Promise<AdvanceResult>` — runs up to `ticks` days and stops early on an auto-pause condition (G3); the client's clock calls it at the chosen speed
- `save(): Promise<SaveData>` and `GameSession.load(data): Promise<GameSession>`

**Multiplayer-ready rules** (enforced from Phase 8):

1. The engine never reads interface state; players act only through commands.
2. Commands apply at the start of the tick after submission, in a deterministic order.
3. No randomness uses the clock; every RNG stream derives from the game seed.
4. Views are filtered inside the engine, so a server can send each player only their own view.
5. One authority advances the clock — the client in single player, the host in multiplayer — and every command is stamped with the tick it applies to.

**Save and replay.** A save is a versioned JSON snapshot of the full state, including RNG states, deals and open cards. A replay is the seed, settings and tick-stamped command log, and reproduces the game exactly at any speed.

## G10. Technology & Delivery

**Engine:** TypeScript in strict mode with **zero runtime dependencies**; Vite and Vitest for build and test. Web is the primary target, and a Python engine would reach the browser only through Pyodide, costing every player about 10 MB and several seconds per load; a TypeScript engine ships inside the ~150 KB bundle the interface needs anyway. It also gives one language across engine and interface, compile-checked region, grade and chokepoint names (§4.1), and headless runs fast enough to make balancing sweeps interactive.

**Interface:** one HTML, CSS and TypeScript application with no framework, in a **light theme**. The map is a pre-projected coastline SVG generated at build time from public-domain Natural Earth data, so there is no runtime map library or network access. It shows **coastlines only — no national borders and no flags** — which keeps disputed borders off the screen (a mainland-China release would need a separate map review). Regions are shown to the player by geographic names where one exists ("Permian Basin", "Orinoco Belt", "Volga-Urals"); engine IDs such as `Russia_West` stay internal. If the interface grows unwieldy, reach for a small templating library such as `lit-html` before any framework.

**As built (Phase 10).** One screen: a top bar (company, date, cash, net worth, the clock with Pause, ×1–×8 and "Next", which runs up to 90 days to the next card or alert, Save and Menu); the map with the company's regions named and troubled straits labelled; tabs for Company (assets, projects and the two settings), Markets (prices with 90-day sparklines), Deals & cargo and News; and the decision inbox with Opportunities. The clock catches up on elapsed time, so a browser that delays its timers still keeps pace. Saves go to one browser slot, automatically every 30 days. Until the Natural Earth coastlines are generated at build time, the map draws low-detail land outlines from `data/geo.ts`. A raised card whose options are only market orders that would not fill, and so change no meter, is not shown (G4.7).

**Delivery:** one web build, released in five stages from easiest to hardest: **own site → itch.io → web portals → Steam → mobile rebuild** (§14.8). Each stage adds a thin platform adapter (saves, achievements, store features) and never changes the engine or game rules. A headless Node CLI serves balancing. Steam uses **Electron**, not Tauri, because Steam's overlay cannot draw over the WebView2 view Tauri uses. Mobile is a new portrait and touch interface, not a repackaging, so it comes last and only if players ask for it.

**Determinism.** JavaScript has no seeded RNG, and `Math.sin`, `Math.exp` and `Math.log` are not bit-pinned by the language specification. Four rules keep runs reproducible:

1. **PRNG:** `sfc32`, one stream per purpose (`products`, `events`, `ai`), each seeded by hashing `(master_seed, stream_name)`. Its state is four 32-bit integers, trivial to save.
2. **Normal draws:** Box-Muller, discarding the second value rather than caching it, so there is no hidden state to serialize.
3. **Quantization:** the product-price deviation `x(p, t)` (§7.3) is rounded to 1e-9 each tick, and every published product price and fair value to 1e-6 $/bbl, so last-bit differences between JavaScript engines cannot compound. Rounding `x` alone is not enough: `exp` and `sin` can still differ in the last bit of a price, and revenue multiplies that bit by thousands of barrels — the Phase 3 golden replay caught Chrome and Node disagreeing this way.
4. **Iteration order:** `Map`, never plain objects, wherever iteration order can affect the simulation.

Lint bans `Math.random`, `Date.now` and `new Date()` inside the engine, and a golden-replay test hashes the S0 metrics stream so any nondeterminism fails immediately.

---

# PART II — ENGINE SPECIFICATION

## 1. Purpose

GEMS is a discrete-time, agent-based model of the physical and spot crude oil market. Its job is a believable, reactive economy that players can read and influence, not a forecast. Crude prices are never set by formula: they emerge from companies — producers, refiners, integrated majors and traders, the player's among them — trading in three grade-specific markets that clear once a day, constrained by storage, cash, refinery technology, tariffs, and shipping time across a global network of sea lanes and pipelines.

The flagship case, and the project's namesake, is a **Strait of Hormuz closure**: Gulf cargoes are delayed or blocked, bypass pipelines fill, Gulf crude backs up and discounts, and buyers who depend on it bid up substitute supply from the Atlantic Basin, Russia and Africa. It is one of seven chokepoints the engine treats identically; any of them can disrupt trade (G7.1).

## 2. Design Principles

1. **Bottom-up price discovery.** No price equations for crude. Refined product prices follow a simple stochastic process (§7.3) with weak feedback from refinery output.
2. **Conservation first.** Barrels and cash are created or destroyed only at defined boundaries (extraction, refining, retail sale, fees). Everything else is a transfer, checked every tick.
3. **Physical before financial.** Within a tick, physical phases run first, then deal deliveries, then the spot market clears.
4. **Geography is a network.** Routes come from a graph of sea lanes, pipelines and chokepoints, so closures reroute automatically.
5. **Deterministic and reproducible.** All randomness flows from one seed through independent streams; the same seed and commands always produce the same game.
6. **The engine does not print.** It returns data and records metrics; dashboards and exports read those.
7. **Simple before clever.** Spot trading and fixed-price deals only. Futures and other instruments are out of scope (§13).
8. **Gameplay over fidelity.** Parameters are tuned for clear, interesting decisions. Realism lives in the structure: conservation, geography and time.
9. **Headless and command-driven.** The engine runs without an interface; players affect it only through validated commands.
10. **One rulebook.** The player's company runs the same decision rules (§6) as every rival; only its settings and card answers differ.

## 3. World Model

### 3.1 Time
One tick is **one day**. Verification runs use 365 ticks; games run 1–5 years (G3). Scripted events are scheduled by tick.

### 3.2 Crude grades

| Grade | Exchange node | Character |
|---|---|---|
| `LIGHT_SWEET` | NYMEX | Premium, easiest to refine, highest gasoline yield |
| `MEDIUM` | NC (North Sea) | Standard seaborne grade |
| `HEAVY_SOUR` | DME | Discounted, requires complex refining |

### 3.3 Exchange nodes and landed cost

Each grade trades on one exchange node, but orders carry location:

- **Asks are FOB (free on board) at the seller's origin.** The seller receives the trade price and pays its own origin tariff. A region's infrastructure tariff is paid **once, when crude enters it** (D37): crude resold out of a trading hub in the region it was delivered into pays no origin tariff, because it paid the destination tariff on arrival. Without this a trader paid both tariffs — about $5/bbl against a spread of $0.80 — and no trader could ever cover its costs.
- **Bids are delivered prices to the buyer's region.** The buyer pays freight along the route plus the destination tariff.
- A bid and an ask can trade when `bid ≥ landed`, where `landed = ask + route_freight(origin → destination) + destination_tariff`. If no usable route exists — for example, Hormuz closed and bypass pipelines full — that pair cannot trade.

**Worked example.** A refiner in `Coastal_Asia` bids $70.00 delivered for `HEAVY_SOUR`. Freight from `Middle_East` via Hormuz is $9.80 and the destination tariff is $1.00.

| Gulf ask (FOB) | Landed cost | Result |
|---|---|---|
| $58.00 | 58.00 + 9.80 + 1.00 = **$68.80** | Trades. The surplus is $1.20, so the FOB price prints at the midpoint, $58.60 (§8) |
| $62.00 | 62.00 + 9.80 + 1.00 = **$72.80** | No trade: 70.00 < 72.80 |

If Hormuz closes and the cargo must go through the East-West pipeline and Suez, freight rises and the $58.00 ask may stop trading without any seller changing its price. That is the mechanism behind every chokepoint scenario.

**Marker prices.** Each node publishes a marker price in its marker region: the volume-weighted average of the day's spot fills, each converted to `fob + freight(origin → marker_region)`. It holds its value on a day with no fills, and deal deliveries never enter it.

| Node | Grade | Marker region | Starting marker |
|---|---|---|---|
| NYMEX | `LIGHT_SWEET` | `US_Permian` | 75.00 |
| NC | `MEDIUM` | `North_Sea` | 70.00 |
| DME | `HEAVY_SOUR` | `Middle_East` | 62.00 |

### 3.4 Regions

Each region has one or more **roles** — `PRODUCTION`, `REFINING`, and `TERMINAL` (an export or import point such as the end of a bypass pipeline) — and `exploitable_grades`, which constrain producers only. Placing a company in a region without the matching role or grade is a compile error for built-in data (names are derived union types, §4.1) and throws for anything loaded at runtime. Shale regions (`US_Permian`, `Argentina_Vaca_Muerta`) use the fast decline rate (§7.4); all others are conventional.

#### North America

| Region | Coverage | Roles | Exploitable grades | Labor index | Tariff ($/bbl) |
|---|---|---|---|---|---|
| `US_Permian` | Permian Basin and US mid-continent | Production | LIGHT_SWEET | 1.15 | 0.50 |
| `US_Gulf_Coast` | US Gulf offshore and Gulf Coast refining | Production, Refining | MEDIUM, HEAVY_SOUR | 1.20 | 0.60 |
| `Western_Canada` | Alberta oil sands | Production | HEAVY_SOUR | 1.10 | 1.80 |
| `Mexico_Gulf` | Mexican Gulf of Mexico fields | Production, Refining | HEAVY_SOUR, MEDIUM | 0.70 | 1.20 |

#### Central & South America

| Region | Coverage | Roles | Exploitable grades | Labor index | Tariff ($/bbl) |
|---|---|---|---|---|---|
| `Venezuela_Orinoco` | Orinoco Belt and Maracaibo | Production | HEAVY_SOUR | 0.60 | 2.00 |
| `Colombia_Andean` | Colombia and Ecuador | Production | HEAVY_SOUR, MEDIUM | 0.70 | 1.30 |
| `Guyana_Suriname` | Guyana and Suriname offshore | Production | LIGHT_SWEET, MEDIUM | 0.90 | 0.80 |
| `Brazil_Presalt` | Santos and Campos basins | Production, Refining | MEDIUM | 0.85 | 1.10 |
| `Argentina_Vaca_Muerta` | Neuquén shale | Production | LIGHT_SWEET | 0.80 | 1.50 |

#### Europe

| Region | Coverage | Roles | Exploitable grades | Labor index | Tariff ($/bbl) |
|---|---|---|---|---|---|
| `North_Sea` | UK and Norwegian shelf, NW European refining | Production, Refining | MEDIUM, LIGHT_SWEET | 1.40 | 2.50 |
| `Southern_Europe` | Mediterranean refining coast | Refining | *(none)* | 1.10 | 1.50 |

#### Russia & Caspian

| Region | Coverage | Roles | Exploitable grades | Labor index | Tariff ($/bbl) |
|---|---|---|---|---|---|
| `Russia_West` | Volga-Urals and West Siberia, Baltic and Black Sea export | Production, Refining | MEDIUM | 0.65 | 1.00 |
| `Russia_Far_East` | East Siberia and Sakhalin, Pacific export | Production | LIGHT_SWEET, MEDIUM | 0.75 | 1.00 |
| `Caspian` | Kazakhstan and Azerbaijan | Production | LIGHT_SWEET, MEDIUM | 0.70 | 1.20 |

#### Africa (outside the Middle East)

| Region | Coverage | Roles | Exploitable grades | Labor index | Tariff ($/bbl) |
|---|---|---|---|---|---|
| `North_Africa` | Libya, Algeria and Egypt | Production | LIGHT_SWEET, MEDIUM | 0.65 | 0.90 |
| `West_Africa` | Nigeria, Angola and the Gulf of Guinea | Production | LIGHT_SWEET, MEDIUM | 0.85 | 1.40 |

#### Middle East

| Region | Coverage | Roles | Exploitable grades | Labor index | Tariff ($/bbl) |
|---|---|---|---|---|---|
| `Middle_East` | Persian Gulf producers inside the Strait of Hormuz | Production, Refining | LIGHT_SWEET, MEDIUM, HEAVY_SOUR | 0.75 | 0.20 |
| `Red_Sea_Coast` | West Arabian export terminals (end of the East-West bypass pipeline) | Terminal | *(none)* | 0.75 | 0.30 |
| `Gulf_of_Oman` | Oman and Fujairah, outside the Strait | Production, Terminal | MEDIUM, HEAVY_SOUR | 0.80 | 0.30 |

#### Asia-Pacific

| Region | Coverage | Roles | Exploitable grades | Labor index | Tariff ($/bbl) |
|---|---|---|---|---|---|
| `Southeast_Asia` | Malaysia, Indonesia and Brunei | Production, Refining | LIGHT_SWEET, MEDIUM | 0.70 | 0.90 |
| `Coastal_Asia` | China, Japan and Korea coastal refining | Refining | *(none)* | 0.80 | 1.00 |
| `South_Asia` | Indian west coast refining | Refining | *(none)* | 0.55 | 1.20 |

China's domestic production is captive to its own refineries and is not modeled.

### 3.5 Transport network

The world is a graph of **regions** and **maritime waypoints** joined by **sea lanes** and **pipelines**. Each edge has a transit time in ticks, a freight rate in $/bbl, an optional chokepoint and, for pipelines, a daily capacity. **Edges are bidirectional, and pipeline capacity is shared across both directions** — during a Hormuz closure the Gulf bypass pipelines carry exports and imports out of one budget. Deal cargo claims capacity first; spot trades use what remains (§5, §8).

Routes are the **lowest generalized-cost path** through usable edges:

`generalized_cost = Σ freight + CARRY_RATE × Σ (transit_ticks + chokepoint delay)`

Routes are recomputed with Dijkstra at the start of each tick and cached for all pairs, once per chokepoint-avoidance set. Delivery inside one region has no freight and still takes one tick.

**Regions are endpoints, not junctions.** A route may pass through a region only straight off a pipeline from its origin, then on by sea or straight into its destination (the Gulf bypasses; Russia's eastern line; Western Canada → Permian → US Gulf Coast), or on its way into a pipeline to its destination (Red Sea Coast → Middle East imports). Otherwise every lane being bidirectional would invent land bridges — North Sea crude shipped into the Baltic and piped across Russia, or Permian crude pumped backwards up the Canadian line to the Pacific.

**Routing is capacity-aware.** Asked for a route on a company's behalf, the graph skips pipelines that company can no longer use today, so once the Oman bypass is full the next route offered is the Red Sea bypass. Clearing asks again whenever a route runs out (§8 rule 3).

#### Maritime waypoints

`W_GULF_MEXICO`, `W_CARIBBEAN`, `W_N_ATLANTIC`, `W_S_ATLANTIC`, `W_CAPE`, `W_MEDITERRANEAN`, `W_BLACK_SEA`, `W_BALTIC`, `W_PERSIAN_GULF`, `W_ARABIAN_SEA`, `W_RED_SEA`, `W_INDIAN_OCEAN`, `W_S_CHINA_SEA`, `W_N_PACIFIC`.

#### Chokepoints

| Chokepoint | Edge it controls | Primary flows affected |
|---|---|---|
| `HORMUZ` | Persian Gulf ↔ Arabian Sea | All Persian Gulf seaborne exports |
| `BAB_EL_MANDEB` | Arabian Sea ↔ Red Sea | Gulf-to-Europe via Suez; Red Sea terminal exports to Asia |
| `SUEZ` | Red Sea ↔ Mediterranean | Gulf and Red Sea crude to Europe; Atlantic crude to Asia |
| `MALACCA` | Indian Ocean ↔ South China Sea | Nearly all westbound supply into East Asia |
| `BOSPHORUS` | Black Sea ↔ Mediterranean | Russian Black Sea and Caspian (CPC) exports |
| `DANISH_STRAITS` | Baltic ↔ North Atlantic | Russian Baltic exports |
| `PANAMA` | Caribbean ↔ North Pacific | Americas-to-Asia shortcut |

A chokepoint's `status` is `OPEN`, `TENSION`, `DELAYED` or `CLOSED`. `TENSION` adds its `freight_surcharge` (war-risk insurance) to the edge with no delay. `DELAYED` adds `delay_ticks` and keeps any surcharge. `CLOSED` removes the edge from routing; cargo already at the entry waypoint holds position until it reopens. **Throughput falls in steps with the status (D35):** each chokepoint lane carries a daily `throughput` when `OPEN` (Malacca 40,000 bbl; Hormuz 30,000; Suez and Bab el-Mandeb 20,000; Bosphorus and the Danish Straits 15,000; Panama 10,000 — about 3–4 times a typical day, so an open strait binds only on the busiest days), scaled by `CHOKEPOINT_THROUGHPUT`: 100% `OPEN`, 75% `TENSION`, 50% `DELAYED`, 0% `CLOSED`. Once a narrowed strait is full, cargo is redirected exactly as when a pipeline fills — to a bypass pipeline or another sea route. All seven chokepoints use these statuses; how often each one changes, and how far, is set by its event profile (G7.1). **Closing any single chokepoint leaves every region at least one route to market** — only a pipeline's capacity can limit it — and a property test enforces this (§14.6).

#### Region connections

Unless noted, a region connects to its waypoint with a 1-tick, $0.30/bbl terminal edge.

| Region | Connects to |
|---|---|
| `US_Permian` | `US_Gulf_Coast` by pipeline (2 ticks, $1.00) |
| `US_Gulf_Coast`, `Mexico_Gulf` | `W_GULF_MEXICO` |
| `Western_Canada` | `US_Permian` by pipeline (4 ticks, $2.50, 4,000 bbl/tick); `W_N_PACIFIC` by pipeline and terminal (3 ticks, $2.00, 3,000 bbl/tick) |
| `Venezuela_Orinoco`, `Colombia_Andean`, `Guyana_Suriname` | `W_CARIBBEAN` |
| `Brazil_Presalt`, `West_Africa` | `W_S_ATLANTIC` |
| `Argentina_Vaca_Muerta` | `W_S_ATLANTIC` (2 ticks, $0.80) |
| `North_Sea` | `W_N_ATLANTIC` |
| `Southern_Europe`, `North_Africa` | `W_MEDITERRANEAN` |
| `Russia_West` | `W_BALTIC` and `W_BLACK_SEA`; `Russia_Far_East` by pipeline (8 ticks, $3.00, 3,000 bbl/tick) |
| `Russia_Far_East` | `W_N_PACIFIC` |
| `Caspian` | `W_BLACK_SEA` by pipeline (3 ticks, $1.50, 3,000 bbl/tick); `W_MEDITERRANEAN` by pipeline (4 ticks, $2.00, 2,000 bbl/tick) |
| `Middle_East` | `W_PERSIAN_GULF`; **bypass** to `Red_Sea_Coast` by pipeline (3 ticks, $1.00, 6,000 bbl/tick); **bypass** to `Gulf_of_Oman` by pipeline (2 ticks, $0.80, 3,000 bbl/tick) |
| `Red_Sea_Coast` | `W_RED_SEA` |
| `Gulf_of_Oman`, `South_Asia` | `W_ARABIAN_SEA` |
| `Southeast_Asia` | `W_S_CHINA_SEA` |
| `Coastal_Asia` | `W_S_CHINA_SEA` (3 ticks) and `W_N_PACIFIC` (2 ticks) |

Pipeline capacities let each region export its full production in calm conditions and bind only in a disruption: Western Canada's two lines carry 7,000 against 5,000 produced, and the Caspian's 5,000 against 4,000, so a Bosphorus closure leaves it only the 2,000-barrel Mediterranean line. All are placeholders for Phase 7.

#### Sea lanes

| Edge | Transit (ticks) | Freight ($/bbl) | Chokepoint |
|---|---|---|---|
| `W_PERSIAN_GULF` ↔ `W_ARABIAN_SEA` | 2 | 0.40 | `HORMUZ` |
| `W_ARABIAN_SEA` ↔ `W_RED_SEA` | 4 | 0.80 | `BAB_EL_MANDEB` |
| `W_RED_SEA` ↔ `W_MEDITERRANEAN` | 3 | 1.20 | `SUEZ` |
| `W_ARABIAN_SEA` ↔ `W_INDIAN_OCEAN` | 4 | 0.60 | — |
| `W_INDIAN_OCEAN` ↔ `W_S_CHINA_SEA` | 6 | 0.90 | `MALACCA` |
| `W_INDIAN_OCEAN` ↔ `W_S_CHINA_SEA` (alternate via Lombok) | 9 | 1.20 | — |
| `W_INDIAN_OCEAN` ↔ `W_CAPE` | 10 | 1.20 | — |
| `W_CAPE` ↔ `W_S_ATLANTIC` | 8 | 1.00 | — |
| `W_S_ATLANTIC` ↔ `W_N_ATLANTIC` | 9 | 1.00 | — |
| `W_S_ATLANTIC` ↔ `W_CARIBBEAN` | 7 | 0.90 | — |
| `W_N_ATLANTIC` ↔ `W_CARIBBEAN` | 7 | 0.90 | — |
| `W_CARIBBEAN` ↔ `W_GULF_MEXICO` | 3 | 0.40 | — |
| `W_CARIBBEAN` ↔ `W_N_PACIFIC` | 20 | 4.50 | `PANAMA` |
| `W_N_ATLANTIC` ↔ `W_MEDITERRANEAN` | 5 | 0.60 | — |
| `W_N_ATLANTIC` ↔ `W_BALTIC` | 4 | 0.50 | `DANISH_STRAITS` |
| `W_MEDITERRANEAN` ↔ `W_BLACK_SEA` | 3 | 0.60 | `BOSPHORUS` |
| `W_S_CHINA_SEA` ↔ `W_N_PACIFIC` | 4 | 0.50 | — |

#### Sanity checks

| Route | Default path | Approx. transit |
|---|---|---|
| Middle_East → Coastal_Asia | Hormuz → Arabian Sea → Indian Ocean → Malacca | ~16 ticks |
| North_Sea → Coastal_Asia | Mediterranean → Suez → Bab el-Mandeb → Malacca | ~26 ticks |
| US_Gulf_Coast → Coastal_Asia | Caribbean → Panama → North Pacific | ~26 ticks (~38 via the Cape if Panama closes) |
| West_Africa → South_Asia | South Atlantic → Cape → Indian Ocean → Arabian Sea | ~24 ticks |
| Middle_East → Southern_Europe (Hormuz closed) | East-West pipeline → Red Sea → Suez | ~8 ticks, capacity-limited |

## 4. Data Model

### 4.1 Conventions

- **State is plain data; behavior is functions.** Every type below is a serializable TypeScript interface, and company behavior dispatches on a `kind` discriminant rather than subclass methods. Saving is structural, loading is a validation pass, and forking for projections (G4.5) is a copy.
- **Enumerations** are `const` objects with derived union types, never TypeScript `enum`:
  ```ts
  export const Grade = { LIGHT_SWEET: 'LIGHT_SWEET', MEDIUM: 'MEDIUM', HEAVY_SOUR: 'HEAVY_SOUR' } as const;
  export type Grade = typeof Grade[keyof typeof Grade];
  ```
- **Names are derived from data.** `RegionName`, `NodeName`, `ChokepointName` and `Product` come from the data tables (`keyof typeof REGIONS`), so a misspelled name anywhere is a compile error.
- **Identifiers** (`AgentId`, `OrderId`, `DealId`, `CargoId`) are branded strings. Quantities are plain `number` with the unit in the name (`qty_bbl`, `price_usd_per_bbl`).
- **Canonical names:** `agent_id` for every company; `Producer`, `Refiner`, `IntegratedMajor`, `Trader`; `extract()`, `refine()`; `infrastructure_tariff`; `ExchangeNode`; the medium-crude node is `NC`; `LaneGraph`, `Edge`, `Waypoint`, `Chokepoint`, `Route`, `Cargo`, `Deal`.
- **Case:** this document writes attributes in `snake_case` for readability; code uses `camelCase` (`extraction_capacity` → `extractionCapacity`), `PascalCase` for types and `UPPER_CASE` for constants.

### 4.2 Order

An order lives for one tick: submitted in Phase 5b, cleared in 5c, and any remainder expires.

- `order_id` — deterministic: the company's index in the world plus its per-tick sequence
- `agent_id`, `node`, `side` (`BID` / `ASK`)
- `limit_price` — asks: FOB at origin; bids: delivered to the buyer's region
- `origin_region` (asks), `delivery_region` (bids)
- `qty`, `qty_remaining`
- `avoid_chokepoints` (bids) — from the company's Risk setting

### 4.3 Fill

`tick`, `node`, `buyer_id`, `seller_id`, `qty`, `fob_price`, `freight`, `destination_tariff`, `landed_price`, `origin_region`, `delivery_region`, `route`, `deal_id` (null for spot).

### 4.4 Deal

- `deal_id`, `seller_id`, `buyer_id`, `grade`, `origin_region`, `delivery_region`
- `qty_per_day`, `price` (fixed FOB $/bbl), `start_tick`, `end_tick`
- `avoid_chokepoints` — the buyer's route choice; rerouting cards change it
- `linked_deal_id` — the other half of a trader's back-to-back pair
- `status` (`ACTIVE` / `ENDED` / `CANCELLED`), `delivered_bbl`, `shortfall_bbl`

Rerouting half a deal (a card's Maybe) splits it into two half-volume deals with different avoidance sets.

### 4.5 ExchangeNode

`name`, `grade`, `marker_region`, `orders` (this tick's bids and asks, emptied after clearing), `fills` (today's), `last_fob_by_origin` (the previous close), `marker_price`.

### 4.6 Region

`name`, `continent`, `roles`, `labor_cost_index`, `exploitable_grades`, `infrastructure_tariff`, `waypoint_links`, `decline_class` (`SHALE` / `CONVENTIONAL`), `lease_pool_capacity`, `lease_pool_used`.

### 4.7 Agent (every company)

- `agent_id`, `kind` (`PRODUCER` / `REFINER` / `INTEGRATED` / `TRADER`), `name`, `region`
- `controller` (`AI` / `HUMAN`), `personality` (AI only)
- `settings` — Risk plus the play type's setting (G4.2)
- `cash`, `cash_reserved` (bids during Phase 5), `credit_limit`, `credit_drawn`, `insolvent`
- `leased_storage` — region, capacity, stock by grade, daily fee, expiry
- `charters` — vessel class, capacity, daily rate, expiry, status
- `capital_projects` — type, target, completion tick
- `deal_ids`
- `available_cash = cash − cash_reserved`

**Who trades what.** Producers only sell crude, from their own region and grade. Refiners only buy it, delivered to their own plant, in grades their tier can process. Traders do both, selling from and buying into their office regions. `placeOrder` enforces these rules before any escrow is taken.

### 4.8 Producer

`grade`, `extraction_capacity`, `peak_capacity`, `field_max_capacity` (2 × starting capacity), `decline_rate` (from the region's class), `base_extraction_cost`, `storage_capacity`, `storage`, `storage_escrow`, `extraction_rate` (0–1, default 1), `shut_in`, `ramp_ticks_remaining`.

- `actual_cost = base_extraction_cost × labor_cost_index`
- `fill_ratio = (storage + storage_escrow) ÷ storage_capacity`
- `extract()` pumps `extraction_capacity × extraction_rate × ramp_factor` up to free storage; production halts at 100% fill. Setting output below `SHUT_IN_THRESHOLD` shuts wells in; restarting costs `RESTART_COST` and ramps over `RAMP_TICKS`.
- **Decline:** capacity falls by `decline_rate` each tick; drilling adds `DRILL_STEP` up to `field_max_capacity`.

### 4.9 Refiner

`tech_tier` (1–3), `processing_capacity`, `unit_count`, `crude_storage_capacity`, `crude_stock` (`Map` by grade), `utilization` (set by the automatic throttle), `utilization_cap` (set by cards, default 1), `online`, `outage_ticks_remaining`, `works_ticks_remaining`, `works_factor`, `days_since_maintenance`, `grade_weighting` (default: pure margin order), `inbound_barrels`.

- `accepted_grades`: Tier 1 Light; Tier 2 Light and Medium; Tier 3 all.
- **Two sites (D34):** a refiner may own a second plant in another refining region. Each plant keeps its own region, tanks, utilization and outages and bids delivered to itself; cash is shared. **As built (Phase 12):** every plant carries its own `region`; a refiner holds `second` beside its own flattened plant; bids, deliveries, throttles, maintenance, breakdowns and works all act on the named site, and the two share one wallet — each bids with its share of available cash. Cards name the site in their key and actions, so both plants raise their own maintenance and breakdown cards. The second plant is a `UNIT_CAPACITY` refinery at the first's tier, in the nearest refining region open to new plants.
- `refine()` consumes eligible stock up to `processing_capacity × effective_utilization × works_factor`, highest margin first adjusted by `grade_weighting`, and sells the output to the retail sink.
- `effective_utilization = 0` when offline or in an outage, otherwise `min(utilization, utilization_cap)`. All stock-buffer sizing uses it, so an offline refinery stops buying.
- **Breakdowns:** `hazard = BASE_HAZARD × (1 + days_since_maintenance ÷ MAINT_INTERVAL)^HAZARD_EXPONENT`, rolled in Phase 0 from the `events` stream; an outage lasts `BREAKDOWN_TICKS`, plus `BREAKDOWN_OVERDUE_DAYS` for each full interval maintenance has been deferred (D39). Emergency repair halves the remainder for `EMERGENCY_REPAIR_COST`. A tier upgrade limits capacity to `WORKS_CAPACITY_FACTOR` for `TIER_TICKS`.

### 4.10 IntegratedMajor

Owns one well (`WellState`) and one plant (`PlantState`) in the same region, with cash held at the parent; a `Producer` is a company with a well and a `Refiner` a company with a plant, so the same code runs all three. Phase 2 moves crude from well to plant at cost, with no tariff or freight, up to accepted grades and free storage; the rest is traded under §6.3. A company becomes integrated at game start (AI portfolio) or mid-game when a producer completes the "Build a refinery" card: its producer record becomes one subsidiary and a new refiner record is created for the other. Refiners never become integrated.

### 4.11 Trader

`offices` (regions it can trade in; starts with one or two), `max_risk_limit` (from Appetite), `hub_storage` (barrels by region and grade, in owned or leased storage), `price_memory` (20-day marker history per node), `committed_capital` (card commitments and their end ticks).

A trader bids delivered to, and asks FOB from, its office regions and leased-storage regions only.

### 4.12 Transport

- `Waypoint`: `name`
- `Chokepoint`: `name`, `status`, `delay_ticks`, `freight_surcharge`
- `Edge`: `a`, `b`, `mode` (`SEA` / `PIPELINE`), `transit_ticks`, `freight_rate`, `chokepoint?`, `capacity_per_tick?`, `used_this_tick`, `reserved_capacity` (`Map` of company to barrels per tick)
- `LaneGraph`: nodes, edges, route cache
- `Route`: `edges`, `total_freight`, `total_transit`, `chokepoints_crossed`
- `Cargo`: `cargo_id`, `grade`, `qty`, `owner_id`, `deal_id`, `route`, `edge_index`, `ticks_remaining_on_edge`, `dispatch_tick`, `charter_id`, `status` (`MOVING` / `HELD` / `FLOATING`), `demurrage_ticks`

### 4.13 RetailSink

Holds product prices (`GASOLINE`, `DIESEL`, `FUEL_OIL`) and buys all refined output at the current price. Attributes: `prices`, `fair_values`, `deviations`, `expected_prices`, `bases` (the anchors that persistent shocks move), `output_history`, `output_today`, and its `products` RNG stream. It advances prices once per tick (§7.3), applies scheduled shocks, and returns revenue for refined output. Product prices have no regional differences. The §7.3 parameters live in `Config.PRODUCT_PRICES`, so tests and presets can override them.

### 4.14 World

Owns the regions, nodes, lane graph, companies, deals, cargo, retail sink, RNG streams, event schedule and metrics recorder. Exposes `step()` and `run(n)`. Cards, scenario state and the command queue belong to the game layer (G9) and are saved alongside the world.

## 5. Tick Sequence

| # | Phase | What happens |
|---|---|---|
| 0 | **Commands, events & routing** | Apply commands queued for this tick (card answers, setting changes). Apply scheduled events and advance event stages. Advance product prices using refinery output from previous ticks only. Advance capital projects, works, outages, ramps, leases, charters and offices; apply field decline; roll breakdowns. Reset pipeline counters and rebuild the route cache. |
| 1 | **Extraction** | Every producer, including integrated ones, extracts and pays extraction cost. |
| 2 | **Internal clearing** | Integrated companies move crude from well to plant at cost. |
| 3 | **Refining** | Online refineries refine and sell output to the retail sink. |
| 4 | **Logistics** | Cargo advances. A cargo whose next edge is `CLOSED` is `HELD` at the entry waypoint; a `DELAYED` edge adds its delay on entry. Arriving cargo is delivered up to free storage and pays destination tariff on what is delivered; the rest floats (below). |
| 5a | **Deal deliveries** | Deal cargo already waiting at its origin tries again for a route first. Then active deals deliver in `deal_id` order. The seller's storage becomes cargo on the deal's route, claiming pipeline capacity ahead of spot trades and splitting across routes as each fills; if no route has capacity, the cargo is created `HELD` at the origin, loaded and paid for, and waits. The buyer pays `price × volume`, the seller pays origin tariff, and any shortfall pays `SHORTFALL_RATE`. |
| 5b | **Orders** | Every company runs its §6 rules against the previous close and submits limit orders. Asks escrow barrels; bids reserve cash. Submission order has no effect. |
| 5c | **Clearing** | Each node clears once (§8). Unfilled orders expire and escrow is released. |
| 6 | **Settlement & dispatch** | Each fill settles: cash moves, the seller pays origin tariff, the buyer pays freight, pipeline capacity is reserved, and cargo is dispatched. |
| 7 | **Accounting & metrics** | Storage, fixed operating, lease, charter, office and demurrage costs and credit interest are charged; invariants are checked; metrics are recorded. The game layer then runs card detection and checks auto-pause. |

**Delivery overflow.** Cargo unloads into the owner's tanks at its destination — a refinery's crude tanks or a trader's hub. Cargo can arrive after its buyer's circumstances change — a refinery that bought a ten-day buffer and then broke down has consumed nothing when the cargo lands. Rather than breaching storage limits, delivery stops at free space and the remainder stays aboard as `FLOATING` at the destination, charged `DEMURRAGE_RATE` per barrel per tick. It is delivered as space frees up; after `DEMURRAGE_MAX_TICKS` it is force-sold at the marker price less `DISTRESS_DISCOUNT`. Floating cargo unloads before newly arrived cargo. A forced sale goes to a buyer outside the modelled market: its barrels leave the economy and its revenue enters, so invariants 1 and 2 count forced sales alongside refining and retail revenue. A cargo already at sea is never rerouted automatically; it waits at a closed chokepoint until it reopens or its owner acts through a card.

Cargo dispatched in tick *t* arrives no earlier than tick *t + 1*, so it is refined no earlier than tick *t + 2*.

## 6. Decision Rules

Every company, including the player's, runs these rules every day in Phase 5b. Parameters come from `DEFAULT_CONFIG` (§7.4), overridden by the company's settings (G4.2) and, for AI companies, their personality. Prices reference the **previous close** — yesterday's FOB by origin, and landed prices built from it with today's freight — because today's market has not cleared yet. Cards change settings or trigger one-off actions; they never enter these rules as conditions.

### 6.1 Producers

1. `ref_price` = previous-close FOB at my origin; if none, the marker price minus `freight(my region → marker region)`, floored at zero.
2. `floor = actual_cost + infrastructure_tariff + MIN_MARGIN`.
3. `ask = max(floor, ref_price × (1 − SKEW × (fill_ratio − 0.5)) × (1 − ASK_DECAY)^days_unsold)`, where `days_unsold` counts consecutive days the company offered crude and sold none. Any sale resets it. Without it, an unsold producer kept asking its stale close for ever.
4. Quantity is available storage minus tomorrow's deal commitments.
5. If `fill_ratio ≥ DUMP_THRESHOLD`, the excess above 70% fill is offered at `DUMP_DISCOUNT` (20%) below `ref_price`, never below `actual_cost` (D35). Dumping at cash cost printed trades so far below value that the heavy-crude marker moved 11–12% a day and spent 46–84 days a year under $40; at a discount it moves about 5% and never falls under $40 (tests/scenarios/dumping.test.ts).

### 6.2 Refiners

For each node whose grade the refinery accepts:

1. `product_value` = yield-weighted value of one barrel at expected product prices (§7.2).
2. `delivered_max = product_value − opex(grade) − CARRY_RATE × transit` from the cheapest origin.
3. Bid on the node with the largest `delivered_max − reference_landed`, where `reference_landed` is the cheapest previous-close landed price. With no reference on any node, bid on the node with the highest `delivered_max`.

**Quantity:** `need = (TARGET_DAYS + transit) × processing_capacity × effective_utilization − (stock + inbound, including deal cargo)`, capped by free storage and available cash, where `transit` is the voyage from the chosen node's cheapest origin. Barrels at sea count as held, so the target must also cover what the plant uses while they sail; without the transit term a refinery 25 days from supply buys 10 days of crude and runs dry for two weeks (found in Phase 7). `starvation` uses the same target. An offline refinery needs nothing and bids nothing.

**Price:** `bid = min(delivered_max, max(reference_landed × (1 + URGENCY × starvation), reference_landed + (delivered_max − reference_landed) × starvation))`, where `starvation = 1 − (stock + inbound) ÷ target_stock`. A little short, a refinery offers a small premium over the reference; seriously short, it climbs towards what the barrel is worth, reaching it with empty tanks. The earlier cap of `URGENCY` over the cheapest reference left starving refineries unable to outbid it once that seller sold out, and the whole market collapsed to the cheapest producer's price (found in Phase 7).

**Space:** tank space is judged for when the purchase lands: `crude_storage_capacity − max(0, stock + inbound − daily_use × transit)`. Counting everything at sea as if already in the tanks blocked far refineries from buying at all.

`delivered_max` uses smoothed product prices (λ, about a 10-day memory) against landed prices that move daily. That inertia is deliberate; if S10's response is too slow, give the run-rate throttle a shorter λ than bid pricing.

### 6.3 Integrated majors

After internal clearing, surplus production is offered under §6.1 with a floor of cost plus tariff and no margin. A refinery deficit is bid on the preferred accepted grade at `delivered_max × (1 + AGGRESSION)`.

### 6.4 Traders

Traders act only in office and leased-storage regions.

- **Arbitrage between regions (D35):** at each office region and for each grade, an ask FOB from the hub at `ref + HALF_SPREAD` and a bid delivered into it at `ref − origin tariff − HALF_SPREAD`, where `ref` is the office's previous close or offer. The bid keeps a margin the size of the region's tariff, so bids fill only when crude from elsewhere lands well below the local price — a gap between regions, which is the trader's whole edge. Both are shifted by `−2 × HALF_SPREAD × (hub fill − 0.5)` so an empty hub quotes keen to buy and a full one keen to sell. Asks offer half the grade's stock; bids use half the room left — the least of free tank space, the unused `MAX_RISK_LIMIT` (holdings valued at markers) and cash, shared across every office and grade.
- **Never at a loss (D37):** each hub keeps what its barrels cost delivered, by grade, counting those still at sea. An ask is never priced below that cost plus `HALF_SPREAD`, unless the hub is more than `TRADER_CLEAR_FILL` (90%) full, when clearing space matters more than the margin. Without this floor traders sold medium crude into falling markets at about $2.70 a barrel below cost.
- **Barrels on the way count as held (D37):** crude bought for a hub and still at sea takes up its room and its risk budget, so a trader stops buying before its tanks are spoken for. Without it traders overbought and paid demurrage while their cargo floated.
- **Storage arbitrage:** if `marker < 20-day average − STORAGE_CARRY × HOLD_TICKS`, bids use all the room left instead of half; if `marker > 20-day average`, asks offer all the stock instead of half. The 20-day memory is updated in phase 7.
- **Committed capital:** capital committed through cards (price gaps, crisis bets, distressed cargo) adds targeted bids and asks for the committed period.

### 6.5 Default operations

These run without any decision. Cards change them.

| Behavior | Default |
|---|---|
| Refinery run rate | Crack-spread throttle: if `delivered_max` at the best node is below the cheapest landed price, cut `utilization` 10% a day to a 30% floor; raise it 10% a day when margins recover. Never above `utilization_cap` |
| Maintenance | `MAINT_TICKS` offline every `MAINT_INTERVAL` days |
| Crude mix | Highest-margin grade first |
| Field decline | `DECLINE_RATE` per tick by region class |
| Internal allocation | All eligible production goes to the company's own plant first |
| Charters | Cargo is assigned to an idle owned charter whenever that is cheaper than per-barrel freight. **As built:** a charter carries one cargo at a time, up to its capacity, while its hire runs; that cargo pays only the war-risk surcharge, never the per-barrel freight, and the hire is charged daily whether the ship is working or idle. A charter whose hire ends while it is still carrying something is kept until the cargo lands |
| Leases | Auto-renew at the current rate. If the pool is full, `LEASE_GRACE_TICKS` at `LEASE_GRACE_MULTIPLIER`, then forced sale at `DISTRESS_DISCOUNT`. Warning `LEASE_WARN_TICKS` ahead |
| Delivery overflow | Floating on demurrage, then forced sale (§5) |
| AI output cuts (Phases 7–8) | Cut to 50% after 10 days with netback (reference FOB less origin tariff) below breakeven (cash cost plus `FIXED_COST_RATE`) and storage above 80%; restore after 10 days above. From Phase 9, AI companies answer the "Prices below your cost" card instead |

## 7. Economics

### 7.1 Cash flows

| Flow | From → to | Phase | Kind |
|---|---|---|---|
| Extraction cost | Producer → out | 1 | External |
| Refining opex | Refiner → out | 3 | External |
| Retail revenue | Sink → refiner | 3 | External |
| Destination tariff | Buyer → out | 4 | External |
| Deal payment | Buyer → seller | 5a | Transfer |
| Deal shortfall and cancellation penalties | Defaulting party → other party | 5a, or on command | Transfer |
| Spot trade | Buyer → seller | 6 | Transfer |
| Origin tariff | Seller → out | 5a, 6 | External |
| Freight | Buyer → out | 5a, 6 | External |
| Capital projects and market reports | Company → out | 0 | External |
| Storage, fixed operating, lease, charter, office, demurrage, credit interest | Company → out | 7 | External |

Integrated internal transfers pay no tariff and no freight. There are no exchange fees. A `FeeLedger` records every external flow so cash conservation can be checked.

### 7.2 Refinery yields and product value

| Grade | Gasoline | Diesel | Fuel oil | Opex ($/bbl) |
|---|---|---|---|---|
| `LIGHT_SWEET` | 0.60 | 0.40 | 0.00 | 6.00 |
| `MEDIUM` | 0.50 | 0.42 | 0.08 | 8.00 |
| `HEAVY_SOUR` | 0.38 | 0.44 | 0.18 | 11.00 |

`product_value(grade) = Σ yield(grade, product) × expected_price(product)`. The yield table drives every decision; the 3-2-1 crack, `(2 × gasoline + diesel − 3 × crude) ÷ 3`, is a reporting metric only.

### 7.3 Product price dynamics

Product prices fluctuate slightly around a moving anchor. Each tick, in Phase 0, every product follows a **mean-reverting process on the log of its price** around a fair value that includes seasonality and a weak response to refinery output.

**Fair value:** `fair_value(p, t) = base(p) × season(p, t) × supply_factor(t)`

- `season(p, t) = 1 + A(p) × sin(2π × (day_of_year(t) − φ(p)) ÷ 365)`
- `day_of_year(t) = (START_DAY_OF_YEAR + t) mod 365`, with tick 0 on January 1 by default

**Supply feedback (weak and lagged):**

- `utilization_ratio(t)` = mean refined output over the previous `SUPPLY_WINDOW` ticks ÷ `baseline_output`
- `baseline_output = Σ processing_capacity × BASE_UTILIZATION` across all refineries
- `supply_factor(t) = clamp(utilization_ratio(t) ^ (−β), SUPPLY_MIN, SUPPLY_MAX)`, and 1 during the first `SUPPLY_WINDOW` ticks

When refineries throttle or go offline, product prices drift up; when they run hard, prices soften. Only past ticks are used, so refining and prices never depend on each other within a tick.

**Deviation process:**

- `x(p, t) = ln(price(p, t) ÷ fair_value(p, t))`
- `x(p, t + 1) = (1 − θ) × x(p, t) + σ(p) × ε(p, t)`, quantized to 1e-9 (G10); prices and fair values are rounded to 1e-6
- `price(p, t + 1) = clamp(fair_value(p, t + 1) × exp(x(p, t + 1)), PRICE_FLOOR × base(p), PRICE_CEILING × base(p))`

The shocks `ε` are standard normal draws correlated across products through a Cholesky factor of the matrix below, drawn from the `products` stream. Because product prices have their own stream, adding or removing companies never changes the product-price path.

**Expectations:** `expected_price(p, t) = λ × price(p, t) + (1 − λ) × expected_price(p, t − 1)`

| Parameter | Gasoline | Diesel | Fuel oil |
|---|---|---|---|
| `base` ($/bbl) | 95.00 | 100.00 | 55.00 |
| `σ` (daily log volatility) | 0.012 | 0.010 | 0.015 |
| `A` (seasonal amplitude) | 0.04 | 0.03 | 0.00 |
| `φ` (phase, days) | 105 (peaks mid-July) | 289 (peaks mid-January) | — |

| Shared parameter | Default | Meaning |
|---|---|---|
| `θ` | 0.05 | Mean-reversion speed; a deviation halves in about 14 ticks |
| Correlation gasoline–diesel | 0.70 | |
| Correlation gasoline–fuel oil | 0.40 | |
| Correlation diesel–fuel oil | 0.50 | |
| `β` | 0.10 | A 10% drop in refinery output raises fair values by about 1% |
| `SUPPLY_WINDOW` | 7 ticks | Smoothing window for refinery output |
| `BASE_UTILIZATION` | 0.85 | Output level treated as normal |
| `SUPPLY_MIN`, `SUPPLY_MAX` | 0.90, 1.15 | Bounds on the supply factor |
| `PRICE_FLOOR`, `PRICE_CEILING` | 0.70, 1.40 | Hard bounds as a multiple of base price |
| `λ` | 0.10 | Expectation smoothing, about a 10-tick memory |

With these defaults each product's noise has a long-run standard deviation of about 3–5% of fair value (`σ ÷ √(2θ − θ²)`), and seasonality adds up to ±4%.

**Shocks:** a non-persistent shock adds `ln(1 + pct)` to `x`, so it fades through mean reversion; a persistent shock multiplies `base(p)` by `1 + pct`, moving the anchor. **Setting every σ, every A and β to 0 reproduces fixed product prices exactly** — the first acceptance test for the process, and a way to rerun any scenario with fixed prices.

### 7.4 Constants

Placeholders for balancing. "× labor" scales with the region's `labor_cost_index`.

| Constant | Default | Use |
|---|---|---|
| `LOT_SIZE` | 1,000 bbl | All orders and deals |
| `CARRY_RATE` | $0.10 per bbl per tick | Route cost, refiner pricing |
| `MIN_MARGIN`, `SKEW`, `DUMP_THRESHOLD` | 1.00, 0.10, 0.90 (Balanced) | Producer asks (§6.1, G4.2) |
| `ASK_DECAY` | 2% per consecutive day unsold | Producer asks come down when nothing sells (§6.1) |
| `TARGET_DAYS`, `URGENCY` | 10, 0.08 (Normal) | Refiner bids (§6.2, G4.2) |
| `AGGRESSION` | 0.05 | Integrated deficit bids |
| `HALF_SPREAD`, `STORAGE_CARRY`, `HOLD_TICKS` | $0.40, $0.06 per bbl per tick, 30 | Traders (§6.4) |
| `MAX_RISK_LIMIT` | $5M (Appetite: Medium) | Trader position limit (§6.4, G4.2) |
| `SHUT_IN_THRESHOLD` | 25% | Output below this shuts wells in |
| `RESTART_COST`, `RAMP_TICKS` | $3.00 per bbl/day of capacity, 10 ticks | Producer restart |
| `FIXED_COST_RATE` | Producer $2.00, refiner $4.00 per bbl/day of capacity per tick | Fixed operating cost |
| `DECLINE_RATE` | Shale 0.1% per tick (≈3% a month); conventional 0.017% per tick (≈0.5% a month) | Field decline |
| `DRILL_STEP`, `DRILL_COST`, `DRILL_TICKS` | 500 bbl/day, $2,000 per bbl/day × labor, 45 ticks | Drilling |
| `STORAGE_STEP`, `STORAGE_COST`, `STORAGE_TICKS` | 5,000 bbl, $15 per bbl × labor, 20 ticks | Owned storage |
| `REFINERY_RESTART_COST`, `REFINERY_RAMP_TICKS` | $2.00 per bbl/day, 3 ticks | Refinery restart |
| `TIER_COST` | Tier 1→2 $3,000; Tier 2→3 $5,000 per bbl/day × labor | Tier upgrade |
| `TIER_TICKS`, `WORKS_CAPACITY_FACTOR` | 60 ticks, 60% | Tier upgrade |
| `FACTORY_COST`, `FACTORY_TICKS`, `UNIT_CAPACITY` | $4,000 per bbl/day × labor, 90 ticks, 2,500 bbl/day | Processing unit; a new refinery (integration or a second site) |
| `MAINT_TICKS`, `MAINT_COST`, `MAINT_INTERVAL` | 5 ticks, $0.50 per bbl/day, 120 ticks | Maintenance |
| `BASE_HAZARD`, `HAZARD_EXPONENT`, `BREAKDOWN_TICKS`, `BREAKDOWN_OVERDUE_DAYS` | 0.0005 per tick, 4, 8–20 ticks, 20 days (D39) | Breakdowns |
| `EMERGENCY_REPAIR_COST` | $3.00 per bbl/day of capacity | Halves the remaining outage |
| `MAX_RESERVATION_SHARE`, `RESERVATION_COST`, `RESERVATION_TICKS` | 50% of an edge, $1,500 per bbl/day × labor, 30 ticks | Pipeline reservations |
| `LEASE_STEP`, `LEASE_MIN_TICKS`, `LEASE_RATE`, `LEASE_SCARCITY` | 10,000 bbl, 10 ticks, $0.06 per bbl per tick, 2.0 | Lease fee = `LEASE_RATE × (1 + LEASE_SCARCITY × pool used ÷ pool capacity)`, fixed at signing |
| `lease_pool_capacity`, `MAX_LEASE_SHARE` | 200,000 bbl per eligible region; 40% per company | Leased storage (regions with sea access or `TERMINAL`) |
| `LEASE_WARN_TICKS`, `LEASE_GRACE_TICKS`, `LEASE_GRACE_MULTIPLIER` | 10, 5, 2.0× | Lease expiry |
| `DEMURRAGE_RATE`, `DEMURRAGE_MAX_TICKS` | $0.25 per bbl per tick, 15 ticks | Delivery overflow |
| `DISTRESS_DISCOUNT` | 20% below marker | Forced sales |
| `CHARTER_RATE`, capacity, `CHARTER_MIN_TICKS` | Small $6,000/tick, 50,000 bbl; Large $15,000/tick, 200,000 bbl; 30 ticks | Charters; chartered cargo pays no per-barrel freight but does pay chokepoint surcharges |
| `OFFICE_COST` | $250,000 to open, $1,000 per tick (D37) | Trading offices |
| `TRADER_CLEAR_FILL` | 90% | Hub fill above which a trader sells below cost |
| `DUMP_DISCOUNT` | 20% below the reference, never below cash cost | Producer dumps (§6.1 rule 5) |
| `CHOKEPOINT_THROUGHPUT` | 100% / 75% / 50% / 0% for `OPEN` / `TENSION` / `DELAYED` / `CLOSED` | Strait throughput (§3.5) |
| `CREDIT_ASSET_SHARE` | 5 × capital assets | Credit line (G6) |
| `DEAL_VOLUME`, `DEAL_TERMS` | 1,000–10,000 bbl/day; 30 or 90 days | Deals |
| `DEAL_MAX_SHARE` | 80% of capacity | Deals |
| `SHORTFALL_RATE`, `CANCEL_RATE` | 15% of deal price per missing barrel; 10% of remaining deal value | Deal penalties |
| `TENDER_DELAY`, `DEAL_OFFER_INTERVAL` | 3–5 ticks; 7 ticks | Deal offers |
| `CREDIT_RATE`, `CREDIT_BASE`, `CREDIT_CUSHION_DAYS` | 0.03% per tick; producer $10M, refiner and trader $20M; 30 days | Credit line (G6) |
| `REPORT_COST`, `REPORT_LAG`, `REPORT_NOISE` | $25,000, 5 ticks, ±15% | Market reports |
| `INTEGRATE_THRESHOLD` | Net worth of 3× starting | Integration and second-refinery cards (G2, G4.4) |
| `CARD_MAX_OPEN`, `CARD_COOLDOWN`, `CARD_DEADLINE` | 3; 14 ticks per card type; 7 ticks | Cards |
| `PROJECTION_TICKS` | 30 | Impact projections |

**Balance intent.** Capacity investments should pay back within a 1-year game at typical prices: a Permian drilling step pays back in about 50 days at a $75 marker and far more slowly near breakeven, which makes timing the decision. Fixed costs are set so idling is a real trade-off — a refinery's break-even run margin equals its $4.00 fixed cost, and a halted Gulf producer pays about a quarter of its starting cash over a 30-day closure.

## 8. Market Clearing

Each node clears **once per day** in Phase 5c, as a batch.

1. **Collection.** Every company's orders for the day are gathered. Submission order has no effect on the result.
2. **Candidate pairs.** For each bid and each ask from different companies, find the route from the ask's origin to the bid's delivery region that avoids the bid's `avoid_chokepoints`. If a usable route exists, `landed = ask + route freight + destination tariff` and `surplus = bid − landed`. Only pairs with `surplus ≥ 0` are candidates.
3. **Matching.** Take candidates in descending surplus, breaking ties by lower landed cost, then bid `order_id`, then ask `order_id`. Fill `min(bid remaining, ask remaining, pipeline capacity remaining on the route)`, rounded down to whole lots, then continue down the list, skipping pairs whose orders or route capacity are exhausted. Capacity is claimed on the buyer's behalf, since the buyer ships the cargo.
4. **Price.** The trade prints at the midpoint: `fob = ask + surplus ÷ 2`. The buyer pays `fob + freight + tariff`, which is at most its bid; the seller receives `fob`, which is at least its ask.
5. **Pipeline capacity.** Deal cargo has already claimed capacity in Phase 5a. Capacity reserved by a company is usable only by that company; spot trades share the rest. A spot trade ships in the buyer's space, or in the seller's reservation when that leaves more room, so a producer's reservation carries what it sells (the "Closure risk on exports" card). Without reservations both sides see the same shared pool and nothing changes.
6. **Expiry.** Unfilled remainders expire at the end of Phase 5c, and all escrow is released.
7. **Marker, close and offers.** The node updates its marker price from the day's fills (§3.3) and records the previous close in `last_fob_by_origin`: each origin's volume-weighted FOB on the last day it traded. Origins that did not trade today keep their earlier close. It also publishes the **closing offers**, `last_offer_by_origin`: each origin's lowest ask left unsold today, replaced every day. A buyer's reference for an origin is the lower of its close and its offer, so crude that did not sell is visible at its asking price instead of hidden behind a stale close (found in Phase 7: without offers, refineries crowded one grade while others went unbid).

Greedy surplus-first matching is not the mathematical optimum for this routing problem, but it is deterministic, independent of submission order, and fast: a node sees at most a few hundred orders a day.

## 9. Invariants

Checked every tick in Phase 7; the run halts with a descriptive error if one fails.

1. **Barrel conservation:** `total_extracted − total_refined − total_force_sold = Σ producer storage + Σ refiner stock + Σ trader and leased storage + Σ cargo` (within 1e-6), counting `MOVING`, `HELD` and `FLOATING` cargo.
2. **Cash conservation:** the change in total company cash equals retail and forced-sale revenue plus net borrowing minus the `FeeLedger`'s external costs. Deal payments, penalties and spot trades are transfers.
3. **Clearing completeness:** after Phase 5c, no pair of orders with positive surplus and remaining route capacity is left unmatched on any node.
4. **Escrow:** at the end of every tick, every company's `storage_escrow` and `cash_reserved` are zero.
5. **Physical bounds:** no negative storage anywhere, and no storage above capacity.
6. **Tech tier:** no refinery holds a grade outside its `accepted_grades`.
7. **Network:** no pipeline edge exceeds `capacity_per_tick`, no company's reservation exceeds `MAX_RESERVATION_SHARE`, and no cargo advances across a `CLOSED` chokepoint.
8. **Limits:** lease pools stay within capacity and within `MAX_LEASE_SHARE` per company; `extraction_capacity ≤ field_max_capacity`; `credit_drawn ≤ credit_limit`; no cargo exceeds its charter's capacity; no company's deal volume exceeds `DEAL_MAX_SHARE` of its capacity.
9. **Solvency:** no company's cash is negative while `credit_drawn < credit_limit`, and an insolvent company submits no bids.
10. **Deals:** each active deal's delivered plus shortfall volume for the day equals `qty_per_day`, and no deal delivers outside its term.

## 10. Portfolios

### 10.1 Core portfolio (Phases 1–6 and tests)

| Entity | Type | Region | Grade / Tier | Capacity (bbl/tick) | Base cost | Storage | Starting cash |
|---|---|---|---|---|---|---|---|
| `Boreal_Shale` | Producer | US_Permian | LIGHT_SWEET | 6,000 | 24.00 | 12,000 | $1.0M |
| `Fennrick_Offshore` | Producer | North_Sea | MEDIUM | 3,500 | 32.00 | 15,000 | $1.0M |
| `Metro_Refine` | Refiner | Coastal_Asia | Tier 1 | 6,000 | — | 20,000 | $3.0M |
| `Skaldmark_Integrated` | Integrated (surplus) | North_Sea | Well: MEDIUM 8,000 / Plant: Tier 2, 5,000 | — | 22.00 | Well 20,000 / Plant 15,000 | $5.0M |
| `Sabkhar_Integrated` | Integrated (deficit) | Middle_East | Well: HEAVY_SOUR 4,000 / Plant: Tier 3, 9,000 | — | 12.00 | Well 10,000 / Plant 25,000 | $5.0M |
| `Qasr_Petroleum` | Producer, state enterprise | Middle_East | HEAVY_SOUR | 9,000 | 10.00 | 30,000 | $2.0M |
| `Straits_Refining` | Refiner | Coastal_Asia | Tier 3 | 8,000 | — | 25,000 | $3.0M |
| `Tidemere_Trading` | Trader | Offices in the three marker regions | All nodes | — | — | 50,000 total | $2.0M |

The core portfolio runs a deliberate 28% surplus (30,500 bbl/tick produced against 23,800 consumed at `BASE_UTILIZATION`), because Phases 1–6 exist to exercise the engine, not to model a realistic market.

### 10.2 Global portfolio (from Phase 7; the default world for games)

| Entity | Type | Region | Grade / Tier | Capacity (bbl/tick) | Base cost |
|---|---|---|---|---|---|
| `Marshaven_Refining` | Refiner | US_Gulf_Coast | Tier 3 | 10,000 | — |
| `Tarvale_Sands` | Producer | Western_Canada | HEAVY_SOUR | 5,000 | 30.00 |
| `Campeche_Energia` | Producer | Mexico_Gulf | HEAVY_SOUR | 4,000 | 20.00 |
| `Veracruz_Refining` | Refiner | Mexico_Gulf | Tier 1 | 5,000 | — |
| `Orinoco_Heavy` | Producer | Venezuela_Orinoco | HEAVY_SOUR | 3,000 | 18.00 |
| `Andes_Crudo` | Producer | Colombia_Andean | MEDIUM | 2,500 | 25.00 |
| `Demerara_Offshore` | Producer | Guyana_Suriname | LIGHT_SWEET | 4,000 | 28.00 |
| `Atlantica_Presalt` | Producer | Brazil_Presalt | MEDIUM | 7,000 | 26.00 |
| `Ilhavera_Refining` | Refiner | Brazil_Presalt | Tier 2 | 6,000 | — |
| `Patagonia_Shale` | Producer | Argentina_Vaca_Muerta | LIGHT_SWEET | 2,500 | 30.00 |
| `Levant_Refining` | Refiner | Southern_Europe | Tier 2 | 7,000 | — |
| `Volga_Export` | Producer | Russia_West | MEDIUM | 9,000 | 15.00 |
| `Baltic_Refining` | Refiner | Russia_West | Tier 2 | 8,000 | — |
| `Amur_Pacific` | Producer | Russia_Far_East | MEDIUM | 3,000 | 22.00 |
| `Steppe_Caspian` | Producer | Caspian | LIGHT_SWEET | 4,000 | 18.00 |
| `Sahara_Light` | Producer | North_Africa | LIGHT_SWEET | 3,500 | 16.00 |
| `Guinea_Deepwater` | Producer | West_Africa | LIGHT_SWEET | 6,000 | 27.00 |
| `Dhofar_Oil` | Producer | Gulf_of_Oman | MEDIUM | 2,500 | 14.00 |
| `Borneo_Petro` | Producer | Southeast_Asia | LIGHT_SWEET | 2,000 | 24.00 |
| `Seralang_Refining` | Refiner | Southeast_Asia | Tier 2 | 7,000 | — |
| `Huanghai_Petrochem` | Refiner | Coastal_Asia | Tier 2 | 11,000 | — |
| `Malabar_Refining` | Refiner | South_Asia | Tier 3 | 9,000 | — |
| `Rannvar_Refining` | Refiner | South_Asia | Tier 3 | 8,000 | — |

**Company names are fictional (D32).** Each is an invented or derived root plus a generic word (`Tarvale_Sands`, `Ilhavera_Refining`), and every name was checked against real companies. `Santos`, `Australis`, `Athabasca`, `Gulfport`, `Helios`, `Aegis`, `Meridian`, `Jurong` and `Kandla` were replaced because they matched or crowded real companies. New names follow the same pattern, and the full list goes through formal trademark clearance in Phase 10.

Defaults (the core companies follow them in the global world, except that the Gulf producers keep their tight §10.1 tanks so a closure fills them within days): producer storage holds 10 days of capacity (3 days overflowed on any slow trading day, halting producers within two weeks of a calm start) and refinery storage 10; starting cash is `PRODUCER_CASH` ($5.0M) for producers and `REFINER_CASH_PER_BBL_DAY` ($3,000) per bbl/day of capacity for refiners — about six weeks of crude, raised by decision (D35) to keep rivals from failing early, since a far refinery pays for 16–28 days of cargo at sea (a flat $3.0M left the Asian refineries unable to finance their own supply); refineries start with 5 days of stock and producers at 25% storage. In the global world `Tidemere_Trading` has two offices, North_Sea and Middle_East, each with 25,000 bbl of hub storage, and `TRADER_CASH` ($5.0M). Bypass pipelines carry 6,000 bbl/tick (East-West to Red Sea) and 3,000 bbl/tick (to Gulf of Oman) — deliberately below Gulf export volume, so they bind in Hormuz scenarios.

### 10.3 Balance and calibration

| | bbl/tick |
|---|---|
| Production capacity | 88,500 |
| Refining capacity | 99,000 |
| Consumed at `BASE_UTILIZATION` (0.85) | 84,150 |
| **Surplus** | **4,350 (5.2%)** |

Grade access also clears: Heavy Sour, which only Tier 3 plants accept, has 25,000 bbl/tick of production against 44,000 of Tier 3 capacity, and Tier 1 capacity is 11,000 against 28,000 of Light Sweet. The player's company enters the world without disturbing this balance (G2).

**Calibration targets for Phase 7.** The clearing price is emergent, so tuning targets outcomes rather than individual costs.

| Target | Measure | Acceptance |
|---|---|---|
| Supply/demand balance | Production capacity ÷ (refining capacity × `BASE_UTILIZATION`) | 1.00–1.10 |
| Storage pressure builds slowly in baseline | Mean producer fill in S0 | Rises, but no producer halts before tick 60 |
| Storage pressure bites in disruption | Gulf producers' halt-ticks, S4 vs S0 | Higher; the closure stops Hormuz completely but the bypass pipelines stay open (D35), so the effect is bounded by what they cannot carry |
| Refining margin is contested | Ticks with at least one refiner throttled, S0 | 5–40% |
| A merit order exists | Barrels produced by cost quartile, S0 | Top-cost quartile produces measurably less than the bottom |
| Output cuts happen somewhere | Producers cutting output across S0–S17 | At least three distinct producers |

With supply and demand near parity, prices are set by what refiners will pay, so a cost-based merit order appears **regionally, during disruptions** — when a closure isolates a basin — rather than globally in calm markets. That is the intended behavior; do not force it by inflating extraction costs.

**No new refining capacity inside the Gulf.** The retail sink has no geography, so refined product sells globally from anywhere. A large Gulf refinery would let Gulf crude leave as product during a closure and defuse the flagship scenario. Gulf production (13,000 bbl/tick) must stay well above local Tier 3 capacity (9,000), so Qasr's storage fills within about a week of a closure. This is why the integration cards are closed in `Middle_East`. The constraint can be relaxed if regional product prices are ever added (§13).

## 11. Metrics & Verification

### 11.1 Recorded per tick

- **Per node:** marker price, previous-close FOB by origin, landed prices into the major demand regions, traded volume, 3-2-1 crack.
- **Per product:** price, fair value, expected price, deviation, seasonal factor, supply factor.
- **Per company:** cash, credit drawn, storage or stock, utilization and throttle state, output rate, insolvency flag, deal volume.
- **Per producer:** fill, shut-in and halted flags, netback less breakeven, capacity versus peak.
- **Per refiner:** margin by grade, days since maintenance, breakdown hazard, outage flag.
- **Per deal:** delivered, shortfall and held volume.
- **Per chokepoint:** status, barrels in transit through it, barrels held at its entry.
- **Per pipeline:** use versus capacity, and allocation by company and by deal versus spot.
- **Per region:** lease pool use, and leased capacity by company.
- **Global:** barrels in transit, barrels floating on demurrage, refinery output versus baseline, production versus consumption, conservation residuals.
- **Game layer:** cards raised and answered by type and company, and auto-pause events.

Outputs: a text dashboard every N ticks (CLI), `metrics.csv` at the end of a run, and a self-contained HTML report with inline SVG charts, generated by `tools/`.

### 11.2 Verification scenarios

Engine verification and balancing, run headless with AI-only worlds. These are separate from the player-facing campaign (G7.2).

| Scenario | Setup | Expected behavior |
|---|---|---|
| **S0 Baseline** | 365 ticks, no shocks | Markers settle into bands, NYMEX > NC > DME from grade quality. FOB prices vary by origin with freight to buyers. All invariants hold |
| **S1 No Trader** | Remove `Tidemere_Trading` | Wider and more volatile gaps between regional prices than S0 |
| **S2 Refinery Outage** | `Straits_Refining` offline, ticks 100–130 | DME and NC fall and producer storage fills. The trader accumulates and sells after the restart. Straits bids nothing while offline, and cargo landing during the outage floats on demurrage |
| **S3 Hormuz Delay** | `HORMUZ` `DELAYED` +15 ticks, ticks 150–200 | Gulf crude's landed cost in Asia rises and Asian buyers shift to other origins. Gulf FOB falls, Gulf storage climbs, and bypass pipelines run at capacity |
| **S4 Hormuz Closure** | `HORMUZ` `CLOSED`, ticks 150–180 | Gulf FOB falls sharply and only bypass volume leaves the Gulf. Qasr and Sabkhar fill storage and halt. Landed prices in Coastal_Asia and South_Asia spike as buyers turn to Atlantic Basin, West African and Russian crude. Refinery throttling nudges product prices up. Prices normalize after reopening as held cargo moves |
| **S5 Pipeline Blockade** | `US_Permian → US_Gulf_Coast` capacity set to 0 | Boreal's storage fills, production halts, and cash declines |
| **S6 Red Sea Disruption** | `BAB_EL_MANDEB` `CLOSED`, ticks 200–260, global portfolio | Europe-Asia and Gulf-Europe cargo reroutes via the Cape; transit and freight rise; Southern_Europe landed prices rise relative to Asia |
| **S7 Hormuz, No Bypass** | S4 with both bypass capacities at 0 | A larger, faster spike than S4, isolating the value of bypass infrastructure |
| **S8 Turkish Straits Delay** | `BOSPHORUS` `DELAYED` +10 ticks, ticks 120–180, global portfolio | Russian Black Sea and Caspian exports slow; the Caspian producer shifts to the Mediterranean pipeline until it binds; Russian Baltic exports rise |
| **S9 Product Price Sensitivity** | S0 across 10 seeds, with and without product dynamics | Crude markers are modestly more volatile with dynamics on and follow gasoline's seasonal pattern. Invariants hold in both |
| **S10 Diesel Spike** | Non-persistent +15% diesel shock at tick 90 | Tier 3 refiners, whose yield is diesel-heavy, raise bids first; Heavy Sour gains on Light Sweet, then the effect fades over about a month (see §6.2 on λ) |
| **S11 Credit Squeeze** | Core portfolio; `Metro_Refine` starts at 20% of normal cash with a full credit line, through the S2 outage | Metro borrows to stay supplied, interest accrues, and cash never goes negative while credit remains. If the line runs out, Metro stops bidding and is recorded insolvent, not removed. Invariants 8 and 9 hold |
| **S12 Locked In** | Core portfolio; `Straits_Refining` signs a 90-day, 5,000 bbl/day deal with Qasr at tick 120, then the S4 closure | Deal cargo claims bypass capacity ahead of spot Gulf exports; the rest waits `HELD` while Straits keeps paying; Qasr's realized price stays above DME spot; held cargo arrives in a wave after reopening. Invariant 10 holds |
| **S13 Malacca Congestion** | `MALACCA` `DELAYED` +4 ticks, ticks 100–115, global portfolio | Cargo into East Asia shifts to the Lombok passage (+3 days, +$0.30); Coastal_Asia landed prices rise modestly; nothing is stranded |
| **S14 Suez Blockage** | `SUEZ` `CLOSED`, ticks 200–207, global portfolio | Cargo already queued is held; new Europe–Asia and Gulf–Europe cargo goes via the Cape. Southern_Europe landed prices spike briefly and settle within about three weeks as held cargo arrives |
| **S15 Panama Low Water** | `PANAMA` `TENSION` with a 40% surcharge, then `DELAYED` +8, ticks 30–150, global portfolio | Americas-to-Asia cargo shifts to Cape routes; Permian Light Sweet sold to Asian buyers loses value against Atlantic buyers |
| **S16 Danish Straits Winter** | `DANISH_STRAITS` `DELAYED` +6, ticks 0–60 and 330–365, global portfolio | Russia_West shifts exports to the Black Sea, adding Bosphorus traffic; Baltic_Refining, supplied locally, is barely affected |
| **S17 Chokepoint Sweep** | Seven runs, each closing one chokepoint for ticks 100–130, global portfolio | In every run, every region keeps a route to market, and every invariant holds. Hormuz is the only run in which a producing region is limited by pipeline capacity alone |

## 12. Decisions

The build proceeds on these. Changing one means updating the sections it names.

**Market model**

| ID | Decision |
|---|---|
| D1 | Prices link across regions through FOB asks, delivered bids and landed-cost matching (§3.3) |
| D2 | The spot market clears once a day per node as a batch: surplus-first matching, midpoint prices, orders live one tick (§8) |
| D3 | Deals are fixed-price, fixed-volume, fixed-term agreements delivered before spot clearing and excluded from marker prices (G4.3, §5) |
| D4 | One tick is one day; every delivery travels as cargo and arrives no earlier than T+1 |
| D5 | The buyer pays freight and destination tariff, the seller pays origin tariff, and integrated internal transfers pay neither |
| D6 | Transport is a lane graph routed with Dijkstra, with chokepoints on edges and capacity-limited pipelines shared across directions; held cargo waits at the entry waypoint (§3.5) |
| D7 | 22 regions in seven continental groups, each with a player-facing display name (`src/data/regions.ts`); China's domestic production excluded |
| D8 | Product prices follow a mean-reverting log process with seasonality, correlated shocks and weak lagged supply feedback (§7.3) |
| D9 | The yield table drives decisions; the 3-2-1 crack is reporting only |
| D10 | Fixed operating costs of $2.00 (producer) and $4.00 (refiner) per bbl/day of capacity make idling a real trade-off |
| D11 | Insolvent companies cannot bid and are recorded, not removed. An insolvent company whose available cash is back above zero may trade again; the record stays |
| D12 | Cargo that arrives to full storage floats on demurrage, then is force-sold (§5) |
| D13 | Lease pools cap each company at 40%; expiring leases renew, then take a grace period, then force-sell (§6.5) |
| D14 | Global production ÷ consumption stays within 1.00–1.10, with no new refining inside the Gulf (§10.3) |

**Player model**

| ID | Decision |
|---|---|
| D15 | The player is a CEO. There is no manual trading; the player's company runs the same §6 rules as its rivals |
| D16 | Every decision is a card: Yes / No / Maybe (the middle path), the same four impact meters, and a deadline that resolves to No (G4.1) |
| D17 | Two company settings per company, each one of three options; no rule trees (G4.2) |
| D18 | Three play types — Producer, Refiner, Trader. Integrated Major is reached only by a producer building a refinery; refiners cannot acquire fields (G2) |
| D19 | Impacts are projected by forking the world for 30 days under calm conditions, so projections never leak the future (G4.5) |
| D20 | AI companies face the same cards and answer them by personality scoring; personalities are presets over the same settings (G4.6, G8) |
| D21 | No business-unit heads or staff system |

**Time and structure**

| ID | Decision |
|---|---|
| D22 | Daily ticks. Single player uses a running clock with Pause, ×1, ×2, ×4, ×8 and auto-pause; commands apply at the next tick (G3) |
| D23 | Sandbox games last 1, 3 or 5 years or run without end; campaign scenarios set their own length |
| D24 | The campaign has three scenarios per play type plus a finale, built from seven goal types with optional milestones (G7.2) |
| D25 | Disruptions are staged events (`RUMOR → TENSION → DISRUPTION → RECOVERY`), with a `TENSION` chokepoint status (G7.1) |
| D35 | Owner decisions 2026-09-19: chokepoint throughput falls in steps with status (a closure stops 100% of the strait but redirection by bypass stays possible, so the bypasses keep their capacity); producers dump at a discount to the reference, not at cash cost; the AI trader arbitrages between regions with tariff-aware spreads, from two offices at lower running cost; starting cash raised and credit lines 10× larger; insolvency is recoverable, because the world has too few companies to lose them |
| D34 | Refiners grow through processing units, tier upgrades, storage and one second refinery in another refining region (not the Gulf); rival buyouts are out of scope. Chosen over a single site, which left refiners no late game, and over acquisitions, which add valuation and merger rules a teenager should not need |
| D52 | Owner's eighth playtest: the campaign picks the company first, from a select box, and then shows that company's three scenarios. The finale sets no company of its own, so instead of sitting alone at the bottom of one long list it appears at the end of all three, as "The Strait as a producer", "as a refiner" and "as a trader" — the same scenario, entered as whichever company was chosen, which is what its null `playType` always meant. A default company name follows the choice, until the player types their own |
| D51 | Owner's seventh playtest: each scenario says which company it puts you in charge of — a coloured word on the card, the finale saying the choice is yours — and "How it is played" opens as a modal rather than a drawer that pushed the scenarios down the page. Noted for later, in `QUESTIONS.md`: the refiner tutorial must explain FOB, because a refiner is the buyer and pays on the day of loading for crude that lands a fortnight later, where a producer never has to think about the voyage at all |
| D50 | Owner's sixth playtest: the open market is on screen — the Deals tab opens with what cleared today at each node: barrels, how many trades, and the range a seller was paid at its own port, against the world price. Prices and volumes are public (G5); who traded with whom is not, and is shown only for the player's own trades. Crude at sea carries its worth at today's prices, since it is money already paid and not yet landed. Confirmed in answering the owner's question: sales are FOB, so the seller is paid when the cargo is loaded and the buyer carries the voyage — the model already charges the buyer at loading, and the destination tariff when it lands. A decision now ends with a Continue button that restarts the clock at the speed it was running at, instead of leaving the player to find the speed buttons again |
| D49 | Owner's fifth playtest, "there is no deal under deals but I am selling crude, where is it going?": the day book names the other side of every trade — the company, its region, and whether a deal was behind it — and says in so many words that a sale with no deal against it went on the open market, where the company posts its crude daily and the highest bid takes it. Rival names, regions and clearing prices are already public (G5), so nothing here is a leak |
| D48 | Owner's fourth playtest: no field pumps the same number twice. Extraction is multiplied by a daily swing, `EXTRACTION_SPREAD`, drawn from its own `wells` RNG stream; a calm fork sets it to zero, so projections still show a level plan. The size was measured, not guessed: at ±10% the first producer halt fell to day 51 and 58 on two of three calibration seeds, breaking the §11 target of no halt before day 60; at ±6% the seeds halt on days 83, 62 and 78, with utilisation 78–79%, the markers and grade order unmoved and nobody insolvent, so ±6% it is. The golden replay was re-recorded, since every barrel in the run moves. A save now fills in any setting it was written without, from the defaults — an absent number turned every sum that touched it into NaN. Interface: the decisions panel is gone from the right column unless a decision is waiting, and Opportunities moved to a top-bar sheet beside Mission |
| D47 | Owner's third playtest: the day book now shows what the day cost, from the fee ledger, in five groups — pumping, refining, shipping, running the company and building — beside a "made today" column of money in less money out. Buying crude is counted at the price of the crude itself, with freight and tariffs under shipping, so no dollar is counted twice; over sixty days the book's daily figures add up to the cash in hand to the cent, which a test holds to. The company panel shows the field against its best: the "wells running dry" card fires below 90% of peak capacity, and nothing on screen said what the peak was |
| D46 | Owner's second playtest: the screen is split three fifths map, two fifths panels; stock is given in barrels of capacity, not only a percentage; the Markets tab is gone, since the prices now sit beside the decisions, and its place is taken by a **day book** — the player's own trading, day by day: barrels pumped, bought and sold, what each came to, the average price a barrel, crude held and cash. The company trades on its own, so without it a player sees a stock level rising and a cash balance moving and never the barrels or prices behind either; `TickReport` now carries each company's day (`byAgent`) and the session keeps 120 days for the player, saved with the game. The scenario's goal moved out of the decision column into a Mission button, and the clock stopping for a decision now says so on the decision panel, which was silent about why it had stopped |
| D45 | Owner's first playtest: the screen buried the numbers and hid the market. The map is capped at a third of the height, so the panels beneath it hold the rest; today's prices sit beside the decisions, in two columns — the world price and what that crude fetched coming out of the player's own region, which is the figure a card quotes and was nowhere on screen; a deal shows what it makes or costs a day against today's price, when it ends and how many days are left; the tabs carry a count; and the News tab explains that no headline sets a price — a troubled strait adds war-risk cover and days to a crossing, and a closure strands crude behind it, which is what moves the price. "Charter a tanker" is no longer offered to producers: freight is paid by the buyer, so a producer's crude always travels on someone else's ship and the hire would run empty. An answer that ties the company in for longer than the meters can see — a 90-day deal against a 30-day one — now shows what it comes to over its whole term, since both read the same as a monthly rate |
| D40 | Phase 12, owner's answer: trading is a real business, and volume is the lever — producers and refiners still earn the bulk. A trader quotes off the last close for its port but never above what the crude is worth at today's marker: a close can be months old, and a stale high price left hubs full and idle for a year (a trader in East Asia bought heavy crude at $68, the marker fell to $57, and its ask sat at $77 until the year ended). Cards quote from the same reference and commit at most half the hub's free room, since the daily rules are bidding for that room too. On autopilot a trader now returns about +1% a year in the North Sea, +15% in the Gulf and +20% in East Asia, against roughly nil before; producers and refiners still make ten times the money in absolute terms. Storage pressure improved as a side effect — active traders absorb crude, so the first producer halt moved back from day 49 to 62–67 |
| D39 | Phase 12, owner's answer: neglect must bite. The breakdown hazard rises with the fourth power of time since maintenance, not the cube, and an outage lasts 20 days longer for each interval maintenance has been put off. Deciding by the meters is now worth 6–8% of a refiner's year against ignoring every card, where before the two were level. Accepted consequence: on about one seed in three a producer's tanks now fill before day 60 (the §11 target) while a large refinery is offline |
| D38 | Phase 12 producer balance: extraction costs were $7.50–$44.80 a barrel against markers of $63–78, so no producer was ever near its cost and none ever cut output. Cash costs now run $18–$58 (the same merit order, compressed upward): output cuts appear in S0, markers settle around $82 / $74 / $66, and nobody goes insolvent. Card quantities on trader cards are sized by the room in the hub, because a standing order buys its quantity every day |
| D37 | Phase 12 trading balance: a region's infrastructure tariff is paid once, when crude enters it, so a hub's resale pays none (§3.3); a trader never sells below what its barrels cost until its hub is 90% full; barrels at sea count as held; offices cost $1,000 a tick. Together these took the trader from about −$1.5M a year on autopilot to roughly break-even, and the AI trader to a small profit |
| D42 | Phase 12: a company is drawn back up to `CREDIT_WORKING_DAYS` (5) of fixed costs from its credit line, not merely to zero. Bids are limited by cash in hand, so a company that spent everything — on a second refinery, say — could never buy crude again and starved with an untouched credit line. The global world is unchanged (nobody there hits zero); the eight-company core world refines 17% more |
| D41 | Phase 12, owner's answer to question 7: build all three deferred features. Charters are built — hire by the day, one cargo at a time, surcharge-only freight, and floating storage through the "Keep cargo afloat" card. "Lease more tanks" is now raised as a card rather than hidden in Opportunities. The second refinery follows |
| D36 | Phase 9 choices: starting companies have a size floor (G2); AI companies answer operating cards from per-temperament odds tables rather than scoring each option (G4.6); "Charter a tanker", "Keep cargo afloat" and "Build a second refinery" waited on the charter and multi-plant systems; charters arrived in Phase 12 (D41) |
| D33 | Every chokepoint is live. Each of the seven has its own event profile; warning scales with severity; the deck never disrupts a chokepoint and its bypass together on Easy or Normal; each year hits at least one chokepoint the player depends on; the campaign features six of the seven (G7.1, G7.2) |

**Technology**

| ID | Decision |
|---|---|
| D26 | TypeScript with zero runtime dependencies; Vite and Vitest for build and test (G10) |
| D27 | Determinism: `sfc32` streams, Box-Muller without caching, quantized price deviation, `Map` iteration, lint bans on clock and `Math.random` (G10) |
| D28 | Plain serializable state with `kind` dispatch (§4.1) |
| D29 | Asynchronous `GameSession` over a synchronous engine (G9) |
| D30 | One web build released in stages: own site, itch.io, web portals, Steam (via Electron), then a mobile rebuild. The map is an SVG generated at build time; light theme, no framework (G10, §14.8) |
| D31 | A single package with lint-enforced module boundaries; world data lives in TypeScript, not JSON (§14.2) |

**Presentation**

| ID | Decision |
|---|---|
| D32 | Real geography with fictional companies. Events are faceless and non-violent (G7.1); the map shows coastlines only; companies use invented or derived names cleared against real companies (§10.2). Chosen over renamed places on a real map, which keeps the recognisable shapes but loses the educational value, and over a fictional world, which would lose the game's name and flagship scenario |

## 13. Out of Scope & Deferred

**Out of scope by design**

- Manual trading: placing, pricing or cancelling individual orders
- Rule-based policy builders (if / and / or trees)
- Business-unit heads or a staff system
- Deal negotiation or haggling

**Deferred engine features**

- Futures contracts, and deals priced from an index instead of fixed
- Product swaps
- An OPEC-style coordinating producer defending a price floor
- Freight rates driven by tanker fleet utilization; explicit vessel classes and sea-lane capacity
- Rerouting cargo mid-voyage once it is held at a closed chokepoint
- Sanctions, export quotas and embargoes on origin–destination pairs
- Regional product prices, and demand that falls as prices rise
- China's domestic production and refining
- Integration across regions (upstream and downstream in different regions)
- Exchange and broker fees

**After launch**

- Multiplayer: a server wrapping `GameSession`, host-controlled clock, lobbies
- Online leaderboards for Challenge mode
- More campaign scenarios, and new play types such as a shipping company
- Moddable scenario and world data, loaded through a validating parser
- Localization
- Release stages 3–5: web portals, Steam and the mobile rebuild (§14.8)

## 14. Build Plan

Each phase ends with its acceptance tests passing before the next begins. Phases 1–7 build the engine; Phases 8–13 build the game.

### 14.1 Phases

| Phase | Deliverable | Acceptance criteria |
|---|---|---|
| **0. Scaffold** | Strict `tsconfig`, Vite, Vitest, ESLint boundary and banned-global rules, CI | `test` and `build` run clean on an empty engine; a deliberate cross-boundary import and a stray `Math.random` in `src/engine/` both fail lint |
| **1. Core types & clearing** | Enums, model, config, `sfc32` streams, `Order`, `Fill`, `ExchangeNode`, batch clearing against a stub route provider | Surplus-first matching, midpoint prices, capacity-limited fills, self-trade skipped, remainders expire; fills are identical under any submission order; the PRNG reproduces a fixed sequence and round-trips through serialization |
| **2. Companies, escrow & settlement** | Regions and placement rules, company state, escrow, settlement, `FeeLedger` | A cross-region trade conserves barrels and cash; escrow is zero after every tick; invalid placements are rejected |
| **3. Refining, product prices & integration** | `refine()`, tiers, yields, retail sink with price dynamics, `IntegratedMajor`, golden-replay harness | Tier 1 rejects Medium; internal transfers pay no tariff; an offline plant's effective utilization is 0; with σ, A and β at 0 prices stay exactly at base; over 3,650 ticks each product's mean is within 2% of base, volatility within 20% of theory, correlations within 0.1, clamps never exceeded; the golden hash matches in Node and a browser |
| **4. Lane graph & logistics** | Heap, Dijkstra, lane graph as route provider, cargo states, delivery overflow | Default paths match the §3.5 sanity table; closing Hormuz routes Gulf cargo via bypass until capacity binds; closing Bab el-Mandeb reroutes via the Cape; held cargo does not advance; **routing is capacity-aware** — once one bypass pipeline is full, `route()` offers the next usable route (the Red Sea bypass after the Oman bypass fills), because clearing only ever tries the route it is given |
| **5. Decision rules & deals** | §6 rules for every company type, settings mapping, deals (sign, deliver, shortfall, cancel, split), default operations, field decline | About six table-driven cases per company type with exact expected orders (normal, dump threshold, starved, offline, insolvent, no reference price); deal delivery, shortfall and cancellation tests; settings are monotonic (Safe never crosses more `TENSION` chokepoints than Bold; Deep never targets fewer days than Lean) |
| **6. Tick orchestrator** | `step()` phases 0–7, event scheduler, invariants, metrics, CSV, dashboard | S0 runs 365 ticks with every invariant holding |
| **7. Global portfolio & balancing** | Global portfolio, S0–S17, personalities, route avoidance, AI deal offers and acceptance, distressed-cargo offers, calibration, HTML report | Every §11.2 behavior appears; no AI bankruptcies on Normal; every §10.3 target is met; a 365-tick run takes under one second |
| **8. Game session** | Async `GameSession`, clock (`advance`, speeds, auto-pause hooks), commands, `PlayerView`, the player's company, credit, save/load, replay | A save reloads to an identical state; a replay reproduces the same game at any speed; commands apply at the next tick; views never expose rival data |
| **9. Decision cards** | Advisor (detectors, option builders, forked projections), the full catalog, Opportunities, AI card scoring, integration, emergency repair, trading offices | Each card triggers on its situation and each option changes the world as described; projections match the calm-condition outcome within 5%; changing future events never changes a projection; three options project in under 0.5 s |
| **10. Interface** | Light theme: card inbox, map, reports, company panel, clock controls, save/load | All three tutorials are playable end to end; first-time playtesters finish a tutorial unaided; all card and news text passes a plain-language review and the G7.1 wording rules; company names and the "Hormuz" title pass a formal trademark search; the layout works at 1280×800 and larger, with no text under 12 px (Steam Deck's minimum, cheap to meet now and costly to retrofit) |
| **11. Events, news, campaign & difficulty** | Event cards and stages, news templates, the ten campaign scenarios, difficulty presets, market reports, AI growth-card scoring | Every scenario is winnable and losable by scripted bots; the always-No bot loses every Medium and Hard scenario; the always-Yes bot does not reliably win; event stages behave as specified; all seven chokepoint profiles fire at their G7.1 rates across 100 simulated Sandbox years, and the deck rules hold |
| **12. Balance & playtest** | Tuning with bots and human playtests | No dominant strategy for any play type; median time between cards is 7–14 days for each; win rates fall within agreed bands |
| | **First pass done (2026-09-19):** trading made viable (D37), producer costs raised (D38), trader cards sized to the hub, scenario targets retuned. A player answering by the meters sees a card every 14–17 days in Sandbox, and the always-No bot loses every Medium and Hard scenario. Open: producer decision variety, neglect that does not bite hard enough, trader earnings, agreed win-rate bands, human playtests — all in `QUESTIONS.md` |
| **13. Release stages 1–2** | Static web build and asset bundling, published to our own site, then to itch.io as a free, browser-playable demo | The web build runs on a static host with no runtime downloads, and its golden hash matches the Node CLI; the itch.io page is live and collecting playtest feedback |

### 14.2 Layout and module boundaries

```
src/
  engine/
    enums.ts       const-object enums
    model.ts       branded ids and state interfaces (§4)
    config.ts      Config, DEFAULT_CONFIG, settings mapping (§7.4, G4.2)
    rng.ts         sfc32, streams, Box-Muller
    heap.ts        binary heap for Dijkstra
    transport.ts   lane graph, routing, cargo movement
    logistics.ts   delivery, destination tariff, floating cargo, demurrage and forced sales
    routes.ts      RouteProvider interface; StubRouteProvider for Phase 1 and unit tests
    clearing.ts    ExchangeNode, batch clearing, markers (§8)
    companies.ts   building companies, placement rules (§3.4), integration, accepted grades, available cash
    settlement.ts  escrow at order placement, settling fills into cargo, end-of-day release
    deals.ts       signing, delivery, penalties, cancel, split
    economics.ts   FeeLedger (§7.1); retail sink and yields from Phase 3
    agents.ts      physical operations: extraction, decline, refining, internal transfer (§4.8–4.10)
    rules.ts       the daily decision rules and MarketView (§6)
    world.ts       createWorld, step() phases 0–7, scheduled events, running costs, insolvency, invariants, fork
    metrics.ts     recorders, CSV, canonical serializer
  data/            regions, lanes, portfolios (TypeScript `as const`)
  game/
    session.ts     GameSession: new game, clock (advance, speeds, auto-pause), saves, replay
    newgame.ts     game settings, the player's company (G2), difficulty (G8)
    commands.ts    player commands, validation, the replay log
    view.ts        PlayerView: public information and the player's own company only (G5)
    alerts.ts      plain-language alerts and auto-pause severities (G3)
    advisor/       detectors, option builders, projections
    campaign.ts    scenario loading, goals, milestones
    events.ts      event cards and stages
  ai/              personalities, card scoring
  content/         card text, scenarios, event decks, news templates
  cli/             headless runner: --scenario, --portfolio, --ticks, --seed, --sweep
web/               index.html, app.ts, map.svg (generated)
  platform/        one adapter per release channel: web, portal, steam, mobile (§14.8)
tests/
tools/             map generation, balancing reports, packaging
```

**Boundaries are enforced by lint:**

```
engine/   imports only engine/ and data/ — never game/, ai/, content/, web/, node:* or the DOM
data/     imports engine/enums.ts only
game/     imports engine/, data/, ai/, content/
ai/       imports engine/ types and data/
web/      imports game/ only (the GameSession API) — never engine/, data/, ai/ or content/
cli/      imports game/ and node:*
```

`eslint.config.js` implements this table, and `tests/lint-rules.test.ts` proves each rule fires.

World data stays in TypeScript so region, node and chokepoint names are derived union types; JSON loading arrives only with modding (§13).

### 14.3 Tech stack

| Concern | Choice | Notes |
|---|---|---|
| Runtime | Node 22 LTS or newer | CLI and tests only; the engine is runtime-agnostic |
| Language | TypeScript 5.8+ | 5.8 is the floor for `erasableSyntaxOnly` |
| Package manager | npm | Ships with Node, so there is nothing extra to install |
| Repository | Single package, relative imports | Boundaries come from lint, not workspaces |
| Build | Vite | Library build, web app and dev server from one config |
| Test | Vitest, plus `fast-check` for properties | Shares Vite's config |
| CLI execution | `tsx` | |
| Lint | ESLint 9+ flat config with typescript-eslint | Module boundaries and banned globals. Boundaries use `@typescript-eslint/no-restricted-imports`, which can allow type-only imports (needed for ai/) |
| Runtime dependencies | None | D26 |

```jsonc
// tsconfig.json — the flags that matter
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,   // indexing returns T | undefined
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true, // company dispatch is a switch
    "isolatedModules": true, "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true          // bans TS enums, enforcing §4.1
  }
}
```

```js
// ESLint, engine/ only
'no-restricted-properties': ['error',
  { object: 'Math', property: 'random', message: 'Use rngFor(seed, stream)' },
  { object: 'Date', property: 'now',    message: 'Engine time is the tick counter' }],
'no-restricted-syntax': ['error',
  { selector: "NewExpression[callee.name='Date']", message: 'Engine time is the tick counter' }],
'no-restricted-imports': ['error', { patterns: [
  { group: ['**/game/**', '**/ai/**', '**/content/**', '**/web/**', 'node:*'], message: 'See §14.2' }]}],
```

Scripts: `dev` (vite), `build` (vite build), `test` (vitest run), `typecheck` (tsc --noEmit), `lint` (eslint .), `sim` (tsx src/cli/main.ts). **CI gate: `lint && typecheck && test`.**

### 14.4 Module dependencies

| Module | Imports |
|---|---|
| `engine/enums.ts`, `engine/rng.ts`, `engine/heap.ts` | — |
| `data/regions.ts` | enums |
| `data/nodes.ts`, `data/chokepoints.ts` | enums, regions |
| `data/lanes.ts`, `data/portfolios.ts` | enums, regions, nodes, chokepoints |
| `engine/model.ts` | enums, `data/` |
| `engine/config.ts` | model |
| `engine/transport.ts` | model, config, heap, routes (the interface), `data/lanes` |
| `engine/logistics.ts` | model, config, transport, companies, economics, data |
| `engine/routes.ts` | model |
| `engine/clearing.ts` | model, config, routes — only the `RouteProvider` interface, never the lane graph |
| `engine/deals.ts` | model, config, companies, economics, routes (the interface), clearing (types), data |
| `engine/economics.ts` | model, config, rng |
| `engine/companies.ts` | model, data |
| `engine/settlement.ts` | model, companies, economics, data |
| `engine/agents.ts` | model, config, companies, economics |
| `engine/rules.ts` | model, config, agents, clearing, companies, economics, routes (the interface), data |
| `engine/world.ts` | all of the above |
| `engine/metrics.ts` | model, companies, rng, world (types) |

**`model.ts` imports from `data/`, not the other way round.** Region, node and chokepoint names are derived from the data tables, so those tables must be declared without the model types. Reversing the edge creates a cycle and the derived names silently collapse to `string`.

**The Phase 1 ↔ Phase 4 seam.** Clearing and deals need routes before the lane graph exists, so they depend only on an interface:

```ts
export interface RouteProvider {
  route(origin: RegionName, destination: RegionName, avoid?: readonly ChokepointName[], agentId?: AgentId): Route | null;   // with agentId: skips pipelines full for that company
  capacityLeft(route: Route, agentId: AgentId): number;
  reserve(route: Route, qty: number, agentId: AgentId): number;   // barrels actually reserved
}
```

Phase 1 ships `StubRouteProvider` (a fixed table with unlimited capacity), which unit tests keep using. Phase 4's lane graph implements the same interface; no Phase 1 code changes.

### 14.5 Module contracts

State is plain data; functions take it as their first argument.

```ts
// config.ts
export interface Config { LOT_SIZE: number; MIN_MARGIN: number; /* …every constant in §7.4 */ }
export const DEFAULT_CONFIG: Config;
export function withOverrides(base: Config, o: DeepPartial<Config>): Config;   // new frozen config; base untouched
export function configFor(settings: CompanySettings, base: Config): Config;   // Selling, Stockpile, Appetite (G4.2)
// companies.ts: presetSettings(personality) gives each personality's settings (G8); transport.ts: avoidFor(risk, g) gives Risk's avoid list

// rng.ts
export interface Rng { a: number; b: number; c: number; d: number }   // the whole sfc32 state, plain data
export function rngFor(masterSeed: string, stream: 'products' | 'events' | 'ai'): Rng;
export function nextUint32(rng: Rng): number;                   // advances rng; integer in [0, 2^32)
export function nextFloat(rng: Rng): number;                    // advances rng; float in [0, 1)
export function normal(rng: Rng): number;                       // Phase 3: Box-Muller, second value discarded
export function correlatedNormals(rng: Rng, cholesky: readonly number[][]): number[];   // Phase 3
export function cholesky(matrix: readonly number[][]): number[][];   // Phase 3: factor of the §7.3 correlation table, computed once
// The generator is its state, so there is no separate save/restore: it serializes and forks like any other data.

// clearing.ts
export interface ClearContext { readonly routes: RouteProvider; readonly tick: Tick; readonly config: Config }
export function createNode(name: NodeName): ExchangeNode;                              // grade and marker from data/nodes.ts
export function submit(node: ExchangeNode, order: Order, config: Config): void;        // rejects part-lots
export function clear(node: ExchangeNode, ctx: ClearContext): Fill[];                  // §8
export function previousClose(node: ExchangeNode, dest: RegionName, ctx: ClearContext): Quote[];
export function updateMarker(node: ExchangeNode, fills: readonly Fill[], ctx: ClearContext): void;

// transport.ts
export function buildLaneGraph(config: Config): LaneGraph;                           // plain data: edges, chokepoint states, pipeline use
export function findRoute(g: LaneGraph, from: RegionName, to: RegionName, avoid?: readonly ChokepointName[], agentId?: AgentId): Route | null;
export function setChokepoint(g: LaneGraph, c: ChokepointName, status: ChokepointStatus, delayTicks?: number, surcharge?: number): void;
export function setReservation(g: LaneGraph, edge: EdgeId, agentId: AgentId, qty: number, config: Config): void;
export class LaneRouteProvider implements RouteProvider { constructor(g: LaneGraph); resetTick(): void }   // per-tick route cache
export function advanceCargo(c: Cargo, g: LaneGraph): CargoAdvance;                    // MOVING | HELD | ARRIVED

// logistics.ts
export function runLogistics(cargo: Cargo[], agents: ReadonlyMap<AgentId, Agent>, g: LaneGraph, ledger: FeeLedger,
  tick: Tick, config: Config, distressPrice: (grade: Grade) => number): LogisticsReport;   // phase 4: move, unload, float, force-sell

// deals.ts
export function priceDeal(node: ExchangeNode, origin: RegionName, offeredBy: 'SELLER' | 'BUYER', p: Personality | null): number;   // 20-day average ±2%
export function signDeal(terms: DealTerms, agents, existing: readonly Deal[], seq: number, tick: Tick, cfg: Config): Deal;   // starts tomorrow
export function deliverDeals(deals, cargo, agents, routes: RouteProvider, ledger, tick, cfg): DealDelivery[];   // Phase 5a
export function dealCommitments(deals: readonly Deal[], seller: AgentId, day: Tick): number;
export function cancelDeal(deal: Deal, by: AgentId, agents, tick, cfg): number;          // fee, paid to the other party
export function splitDeal(deal: Deal, avoid: readonly ChokepointName[], seqs: [number, number], tick, cfg): [Deal, Deal];

// economics.ts
export function createRetailSink(seed: string, config: Config): RetailSink;          // tick 0, prices at fair value
export function updatePrices(sink: RetailSink, baselineOutput: number, config: Config): void;   // closes today's output into history, advances one tick
export function applyShock(sink: RetailSink, p: Product, pct: number, persistent: boolean): void;
export function sellToSink(sink: RetailSink, grade: Grade, barrels: number): number;  // revenue at today's prices; counts output
export function productValue(grade: Grade, prices: Readonly<Record<Product, number>>): number;

// rules.ts
export function decideOrders(a: Agent, index: number, view: MarketView, cfg: Config): Order[];   // §6.1–6.4; index gives stable order IDs

// agents.ts
export function advancePlant(r: Refiner | IntegratedMajor, events: Rng, ledger, tick, cfg): void;   // §6.5 maintenance, breakdowns, works; one draw per plant per day
// rules.ts: updateThrottle(r, view, cfg) is the §6.5 crack-spread throttle, run before orders
export function extract(p: Producer | IntegratedMajor, ledger: FeeLedger, tick: Tick, cfg: Config): ExtractResult;   // cost to the ledger
export function applyDecline(p: Producer | IntegratedMajor, cfg: Config): void;
export function setExtractionRate(p: Producer | IntegratedMajor, rate: number, ledger: FeeLedger, tick: Tick, cfg: Config): void;   // shut-in, restart and ramp
export function refine(r: Refiner | IntegratedMajor, sink: RetailSink, ledger: FeeLedger, tick: Tick): RefineResult;   // best margin first; opex to the ledger
export function effectiveUtilization(r: Refiner): number;
export function internalTransfer(m: IntegratedMajor): number;                        // Phase 2 of the tick; barrels moved, no cash
// companies.ts
export function integrate(p: Producer, plant: PlantSpec): IntegratedMajor;          // wells, cash and id carry over; the card pays and picks the plant

// world.ts
export function createWorld(s: WorldSettings): World;                                 // seed, portfolio, scheduled events, config overrides
export function step(w: World): TickReport;                                            // phases 0–7, then checkInvariants
export function run(w: World, n: number): TickReport[];
export function fork(w: World, calm: boolean): World;                                  // G4.5: calm drops future events and price noise
export function checkInvariants(w: World, deliveries?: readonly DealDelivery[]): void; // §9, throws naming tick, company and numbers

// metrics.ts
export function createRecorder(): Recorder;
export function record(r: Recorder, w: World, report: TickReport): void;               // one row of §11.1 headline series per tick
export function toCsv(r: Recorder): string;
export function canonical(value: unknown): string;                                    // §14.6

// game/session.ts (all methods async; spec G9)
export class GameSession {
  static newGame(settings: GameSettings): Promise<GameSession>;       // play type, region, name, difficulty, length
  static load(data: SaveData): Promise<GameSession>;                   // versioned plain-JSON snapshot
  static replay(settings: GameSettings, log: readonly LoggedCommand[], toTick: number): Promise<GameSession>;
  getView(playerId): Promise<PlayerView>;
  submit(playerId, command: Command): Promise<CommandResult>;         // applies at the next tick, stamped in the log
  advance(ticks: number): Promise<AdvanceResult>;                      // stops early on an auto-pause alert
  setPauseLevel(level: Severity): Promise<void>;                       // critical alerts always pause
  save(): Promise<SaveData>;
}

// game/advisor
export function detect(w: World, id: AgentId): Situation[];
export function buildCard(w: World, s: Situation): Card;           // options carry Command[] and Impact
export function project(w: World, id: AgentId, commands: readonly Command[]): Impact;

// game/campaign.ts
export function evaluateGoals(w: World, scenario: Scenario): GoalStatus[];

// ai/
export function chooseOption(card: Card, personality: Personality, rng: Rng): 'yes' | 'no' | 'maybe';
```

**Two views, never conflated.** `MarketView` is what a company's rules see in Phase 5b: the previous close, public information (G5) and its own state. `PlayerView` is what `GameSession.getView` returns: the same filter plus the player's open cards, reports and history.

### 14.6 Testing

| Tier | Question | Runs |
|---|---|---|
| **Unit** | Does each function do what §3–§8 say? | Every save |
| **Property** (`fast-check`) | Do the invariants hold for arbitrary inputs? | Every save |
| **Phase** | Does one tick phase transform a hand-built world correctly? | Every save |
| **Golden** | Is the engine still bit-reproducible? | Every save |
| **Advisor** | Does each card trigger, apply and project honestly? | Every save |
| **Scenario** | Do S0–S17 show the behavior §11.2 predicts? | On push |
| **Campaign** | Do bot strategies win and lose the scenarios as required? | On push |

```
tests/
  unit/        clearing, transport, deals, economics, agents, config, rng, heap
  property/    conservation, order-independence, limits, routing
  phase/       phase0 … phase7
  golden/      replay hash and fixtures
  advisor/     one file per card type, projection honesty, no-leak
  scenarios/   s0 … s17, calibration
  campaign/    p1 … t3, strait — always-No, always-Yes and scripted bots
  perf/        tick budget, projection budget
  helpers/     builders for orders, companies and worlds
```

**Key properties:**

1. **Order independence:** shuffling submission order yields identical fills.
2. **Conservation:** barrels and cash are conserved across any sequence of ticks, deals and cargo states.
3. **Clearing completeness:** after clearing, no pair with positive surplus and route capacity remains.
4. **Escrow:** zero for every company at the end of every tick.
5. **Limits:** pipeline capacity, reservation, lease and deal shares are never exceeded.
6. **No single closure strands a region:** for each of the seven chokepoints, closing it alone leaves every region at least one route to market.

**Advisor properties:** **projection honesty** — in a calm world, the forked forecast matches the actual 30-day outcome within 5%; **no leak** — changing the future event schedule never changes a projection.

**Canonical serializer.** `JSON.stringify` turns a `Map` into `{}`, so `canonical()` writes `Map` entries as arrays in insertion order, sorts plain-object keys, and fixes numbers to the quantization precision. The golden hash and save/load both use it, so they cannot drift apart.

**Browser parity.** `npm run golden:browser` serves `tests/golden/index.html`, which runs the same replay in a browser and shows its hash; it must equal the Node hash recorded in `tests/golden/golden.test.ts`. It is a manual check for now; automating it in CI (headless Chromium, Firefox and WebKit) belongs with the release work in Phase 13.

**Performance is a test.** `perf/` asserts that a 365-tick S0 run finishes within one second and that three projections finish within half a second, so a regression fails CI instead of surfacing as a slow game.

### 14.7 Implementation order

Rough solo-developer days. Phases 7 and 12 are tuning and therefore open-ended.

| Phase | Order of work | Days |
|---|---|---|
| **0** | package.json → tsconfig → ESLint → Vite → Vitest → failing lint fixtures → CI | 1 |
| **1** | enums → rng + tests → data/regions → model → config → `StubRouteProvider` → clearing → order-independence property | 3–5 |
| **2** | placement rules → company state → escrow → settlement and `FeeLedger` → conservation properties | 3–4 |
| **3** | yields → product value → retail sink and seasonality → correlated draws → deviation and quantization → refine and tiers → integration → canonical serializer → golden hash | 5–7 |
| **4** | data/lanes → heap → Dijkstra and route cache → lane graph as `RouteProvider` → cargo states and overflow → sanity-table tests | 4–5 |
| **5** | producer, refiner, integrated and trader rules → settings mapping → deals → default operations and decline → table-driven cases | 8–11 |
| **6** | phases 0–7 with tests → `step()` → invariants → event scheduler → metrics and CSV → dashboard | 4–6 |
| **7** | global portfolio → S0 to green → S1–S17 → personalities → route avoidance → AI deals and distressed cargo → calibration → HTML report | 9–13+ |
| | **Engine subtotal** | **37–52** |
| **8** | package split → `GameSession` → clock and auto-pause → commands → views → save/load → replay | 8–10 |
| **9** | detectors → option builders → fork projections → shared, producer, refiner and trader cards → Opportunities → AI scoring → integration, repair, offices | 12–15 |
| **10** | map SVG → card inbox → reports → company panel → clock controls | 12–18 |
| **11** | event cards and stages → news → goal system → ten scenarios → difficulty → market reports → AI growth cards | 14–20 |
| **12** | sweeps, tuning, playtests | open-ended |
| **13** | static build and bundling → own site → itch.io page | 2–3 |

**Start here:** Phase 0 in one sitting, then `enums.ts` and `rng.ts` with their tests. They have no domain dependencies and every later module rests on them.

### 14.8 Release stages

One codebase, released from the easiest channel to the hardest. Each stage adds a platform adapter under `web/platform/` — saves, achievements, store or portal features — and never touches the engine or game rules. Saves are plain JSON everywhere, so they move between channels unchanged.

| Stage | Channel | Work beyond the web build | Extra effort | Cost | Move on when |
|---|---|---|---|---|---|
| **1** | **Own site** (GitHub Pages, Cloudflare Pages or similar) | None: upload the static build (Phase 13) | — | Free | The full game plays end to end |
| **2** | **itch.io** | A store page for the same build, playable free in the browser, with a devlog | Half a day | Free; we set the revenue share | Playtest feedback is coming in and first-time players finish a tutorial unaided |
| **3** | **Web portals** (CrazyGames, Poki) | The portal's SDK in an adapter, a load-time and bundle-size budget, and a smaller-window layout. Lead with the tutorials and 1-year Sandbox; save progress locally for longer games. Ads only at natural breaks (loading, the end of a scenario), never over a decision card | 2–4 days | Free; ad revenue is shared | Portal approval; session length and return-visit numbers justify a paid version |
| **4** | **Steam** — the paid launch | An Electron wrapper; steamworks.js for achievements (campaign milestones), Steam Cloud saves and the overlay; controller navigation and 1280×800 checks for Steam Deck; store artwork. Windows first; macOS later, as it needs Apple code signing. Put the Coming Soon page up months early to collect wishlists | 4–6 days, plus at least 4–6 weeks on the calendar (a 30-day wait after the fee and a 2-week Coming Soon minimum) | $100, refunded after $1,000 of sales; Steam takes 30% | Launched |
| **5** | **Mobile app stores** — a rebuild | A new portrait and touch interface (the desktop layout does not fit a phone), a Capacitor wrapper, and app store review. iOS builds need a Mac | 10–20+ days | Apple $99 a year; Google $25 once; 15–30% of sales | Only if players ask for it after Steam |

The free web version stays available after Steam launches. Schools mostly use Chromebooks, which cannot run Steam, and many teenagers cannot buy on Steam without a parent, so the browser is how the game reaches its youngest players.

## 15. Revision History

| Rev | Date | Summary |
|---|---|---|
| 1 | 2026-09-17 | Consolidated the earlier GEMS specifications and Python prototypes into one plan. Fixed partial fills, settlement, refinery consumption, tariffs, tech-tier enforcement and naming drift. Introduced landed-cost matching, the lane graph and product price dynamics. |
| 2 | 2026-09-17 | Moved the engine to TypeScript with determinism rules and plain-data state. Rebalanced the global portfolio: production ÷ consumption had been 1.93, which would have halted most of the world's production within two weeks; six refiners bring it to 1.05. Raised fixed costs so idling is a real choice. Added delivery overflow, lease limits, shared bypass capacity, the credit-squeeze scenario and the coding roadmap. |
| 3 | 2026-09-18 | Reframed the player as a CEO. Removed manual trading, standing orders, order lifetimes, order-book depth and player order validation. Added decision cards, two company settings per play type, fixed-price deals, daily batch clearing (replacing continuous matching and overnight-resting orders), the running clock, three play types with integration as a goal, the campaign, field decline, emergency repair and trading offices. Renamed `Manufacturer` to `Refiner`. Consolidated the document and replaced the prototype issue log with this history. |
| 3.1 | 2026-09-18 | Closed the real-world framing decision as D32: real geography, fictional companies, faceless and non-violent event wording, coastline-only map. Renamed nine companies whose names matched or crowded real companies. Removed the refiner's "Buy an oilfield" card: only producers can become integrated. |
| 3.2 | 2026-09-18 | Made every chokepoint a live risk: an event profile for each of the seven, deck rules, route cards that react to delays as well as tension, a campaign featuring six of the seven, verification runs S13–S17, and a property test that no single closure strands a region. |
| 3.5 | 2026-09-19 | Phase 7 calibration: price discovery (bids climb towards value as tanks empty; unsold asks decay; closing offers published), refiners count the voyage in stock targets and tank space, credit lines, recoverable insolvency, AI output cuts, personality mixes, the global portfolio's cash and storage, and the D35 decisions. Global S0: markers about 78 / 71 / 63 in grade order on ~90% of days, no insolvencies. |
| 3.17 | 2026-09-21 | The campaign picks a company first and lists that company's scenarios, with the finale at the end of each (D52). |
| 3.16 | 2026-09-21 | Scenarios name their company type, and "How it is played" became a modal (D51). |
| 3.15 | 2026-09-21 | The open market and the worth of crude at sea on screen, and a Continue button after a decision (D50). |
| 3.14 | 2026-09-21 | The day book names who bought the crude and who it was bought from (D49). |
| 3.13 | 2026-09-21 | The owner's fourth playtest: a daily swing in what fields pump (±6%, the most the storage-pressure target allows), the decisions panel only when a decision waits, Opportunities in the top bar, and saves that fill in settings added since they were written (D48). |
| 3.12 | 2026-09-21 | The owner's third playtest: the day's costs and what it made, and the field's decline against its peak (D47). |
| 3.11 | 2026-09-21 | The owner's second playtest: a three-fifths/two-fifths screen, stock in barrels, the day book in place of the Markets tab, the mission behind a button, and the clock saying why it stopped (D46). |
| 3.10 | 2026-09-21 | The owner's first playtests: the chosen answer is marked on the card and the waiting count clears; costs paid in instalments are shown in full; a commitment longer than the projection shows its whole-term total; the map is capped so the panels below it get the screen; today's prices, world and local, sit beside the decisions; deals show their worth against today's price and when they end; the News tab explains how a troubled strait reaches prices; producers are no longer offered a tanker charter (D45). |
| 3.9 | 2026-09-19 | Phase 12, first balance pass: trading made viable (D37) and producer costs raised so output cuts appear (D38); trader cards priced and sized like the trader's own rules; scenario targets retuned so the always-No bot loses every Medium and Hard scenario; `npm run pacing` and a meter-led bot added. |
| 3.8 | 2026-09-19 | Phase 11: the staged event deck and news, the ten campaign scenarios with goals, milestones and bots, difficulty for reports and events, the Volatile markets modifier, and AI growth cards. |
| 3.7 | 2026-09-19 | Phase 10 interface: new-game screen, map, company, markets, deals and news panels, decision inbox, clock and saves, in the light theme at 1280×800 with no text under 12 px; the web bundle is 146 KB. |
| 3.6 | 2026-09-19 | Phase 9: the advisor, 33 card types with text, forked projections, Opportunities, AI answers to operating cards, card answers in the replay log, and the D36 choices. In a calm year the always-Yes bot sees a card every ~16 days as a refiner and ~6 as a trader, but a producer only every ~90 (one deal at a time fills its deal allowance); Phase 11 events and growth cards must close that gap (G4.7). |
| 3.4 | 2026-09-18 | Settled ten open questions: refiners may build a second refinery (D34); an integrating producer's plant is at the tier its own crude needs; every capacity-limited pipeline has a capacity; processing units are 2,500 bbl/day; Risk covers routes, breakdowns and cash; Supply shows its worst point; related cards merge; Opportunities have no deadline; unaffordable options show when they will be affordable; the example card fits its pipeline. Phase 3 found and fixed a cross-engine price rounding gap (G10). |
| 3.3 | 2026-09-18 | Set the release path: own site → itch.io → web portals → Steam (via Electron, replacing Tauri) → mobile rebuild (§14.8). Phase 10 now requires a 1280×800 layout; npm replaces pnpm. |

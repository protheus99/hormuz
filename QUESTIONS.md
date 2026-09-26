# Open questions for the owner

Written at the end of Phase 12's first balance pass (2026-09-19). Everything here is a decision I
should not take alone: each one changes how the game feels, costs money, or needs a person. The
build continues around them; nothing below blocks the code.

Recommendations are marked **R**.

---

## Noted during playtesting, to do before release

- **Stage 4's deck, to design together.** The engine half is built: wells are serviced every 240
  days, fail on a rising hazard, wait 5–15 days for a crew, and cost money for both. What the player
  has is a board and an alert — no lever. Before writing cards, three things worth deciding:
  *what a policy card may change* (the engine has no well-level "defer the service" hold, unlike a
  refinery's `maintenanceHoldUntil`, and no way to pay a crew to come sooner — both are small to
  add, but only worth adding if a card uses them); *how the safety dilemma reads a well* (the
  manager's hunch in §12A.6 wants a well that is overdue and a specific number of days of output to
  lose, both of which the model can already say); and *what exposure is attached to* (a single
  hidden number, or one for safety that regulators watch and one for legal exposure that lawyers
  do). A fourth, measured 2026-09-22: **an outage costs less than it looks**. A well that is not
  pumping does not deplete, so the lease still holds exactly as much oil — the barrels are deferred,
  not lost — and on any day the tank is the binding constraint, losing a well costs nothing at all.
  If the safety dilemma is to bite, the cost has to come from the workover bill and the catastrophe
  rather than from the production missed. The owner's call, to be taken during stage 4.
  The owner wants the dilemmas in quantity, so the deck is worth laying out before any of it is
  written.

- ~~**Stage 5 is bigger than it looks: the AI grows through those same cards.**~~ **Answered
  2026-09-23: it was not.** `answerAsAi` reads `CARD_DEFS` directly and never checked the
  `opportunity` flag, so the sheet was only ever the player's route. The definitions stay in the
  catalog as the one rulebook and both routes read it; no AI growth rule was needed. What the stage
  did turn up instead: the detectors were answering two questions at once (when to raise, and
  whether a thing can be done at all), and the escapes would have been stranded when the sheet went.
  Both handled — see §12A.7 step 5. Found 2026-09-22, answered 2026-09-23.

- ~~**The finale's measure works against growth.**~~ **Wrong diagnosis, corrected 2026-09-23.**
  `performance()` divides by `c.capacity`, which is recorded at the **start** of the scenario and
  never updated, so buying ground cannot enlarge the denominator and growth can only help the ratio.
  The real cause was the meters: the lease auction showed $0 of profit for Yes, Maybe and No alike,
  because a sealed bid costs nothing today and the lots are awarded thirty days out — the whole
  projection window. A player reading the numbers therefore never grew. Giving capital decisions a
  payback (stage 6a) took the finale's worst rank from 18th of 20 to 5th without touching the
  measure. Whether the measure still needs replacing is now a question for the 6c retune, on
  evidence rather than on this. Found 2026-09-22, re-measured 2026-09-23.

- **Daily reporting.** The engine keeps the day and will (D56), so the Activity tab is a list of
  days and nothing rolls those days up. Wanted: a reporting layer over the daily record — a day's
  own line, and the same figures gathered into months and years — so a player can read the business
  at the length they care about without the engine losing its resolution. Asked for by the owner on
  2026-09-22, explicitly not to be built yet.

- **The refiner tutorial has to explain FOB.** A producer is paid the day its crude is loaded and
  never thinks about the voyage, which is why the producer scenarios can leave it unsaid. A refiner
  is the buyer: it pays on loading day, waits ten to twenty days for crude it has already paid for,
  pays the freight that day and the destination tariff when the cargo lands. That is the difference
  between a full tank and an empty one, and R1 "Keep the Lights On" cannot be learned without it.
  Raised by the owner on 2026-09-21.

---

> **All seven answered.** 1: **A, accepted**. 2: **A, agreed** — neglect now bites (D39).
> 3: **A, with the steer that volume is the lever** — done (D40): a trader answering by the meters
> now makes 19–51% a year. 5: **B** — the hand-drawn map stays for now. 6a: playtests once the
> interface is usable. 6b: dropped. 6c: you will read the text. 7: **D** — all three built (D41,
> D34, D42). 4: **A** — the band is set and the campaign sits inside it (D43, D44).
>
> Confirmed by the owner on 2026-09-21. Nothing here is open. Question 5 is closed for now — the
> hand-drawn map is good enough and needs no more work before a release decision. Playtests are
> under way (6a), and the card text is yours to read (6c).

## 1. Producers have few decisions once they have taken the obvious ones ✅ accepted (A)

**What I measured.** Over a Sandbox year, a producer who answers by the meters sees a card every
14–17 days — inside the 7–14 day target's neighbourhood. A producer who says Yes to everything sees
one every 48–65 days: it has drilled back to peak, signed the deals its 80% cap allows and built its
storage, and then nothing else arises. A producer who ignores everything sees one every 7–9 days,
because unsolved situations keep coming back.

**The question.** Is "quiet once you are in good shape" acceptable for the easiest play type, or
should producers have more to decide?

- **A (R)** Accept it, and let the campaign supply the pressure. Cheapest, and the spec already
  calls Producer the thinnest role.
- **B** Add producer card types: sell part of next quarter's output forward at today's price, a
  trader offering to take a surplus, a well workover that lifts a declining field for a while.
  Perhaps two days of work, and more text to keep plain.
- **C** Tighten producer margins further so price and storage cards fire in normal play. This makes
  the whole economy harsher and would need another balance pass.

## 2. Ignoring every card is still competitive in some places ✅ done (A)

**What I measured** (net worth after a Sandbox year, three seeds):

| Company | By the meters | Always Yes | Always No |
|---|---|---|---|
| Producer, Permian | **$35.9M** | $35.5M | $31.4M |
| Producer, Persian Gulf | $39.1M | **$40.4M** | $39.9M |
| Refiner, East Asia | **$48.4M** | $44.6M | $46.4M |
| Refiner, North Sea | $73.7M | $69.9M | **$74.8M** |
| Trader, North Sea | **$5.3M** | $5.2M | $5.3M |
| Trader, East Asia | $4.3M | $4.2M | **$5.0M** |

No strategy dominates everywhere, but deciding well is worth only a few percent, and in two of six
starts doing nothing wins. The cause is that the costly options — servicing the plant, buying crude
urgently — rarely beat waiting in a calm year.

**The question.** How sharp should the trade-offs be?

- **A (R)** Make neglect bite: breakdowns longer or likelier as maintenance is deferred, so
  servicing clearly pays. One tuning pass, no new systems.
- **B** Leave it: the campaign scenarios already separate the bots cleanly, and Sandbox is a
  sandbox.
- **C** Make cards cheaper to act on (lower maintenance downtime, cheaper emergency crude), so
  saying Yes is usually right. Risks making decisions obvious.

## 3. How much money should a trader make in a good year? ✅ done (A)

> **Result.** On autopilot a trader now returns roughly +1% a year in the North Sea, +15% in the
> Gulf and +20% in East Asia. The fix was volume, as you said: traders were quoting off a price
> that could be months old, so a hub that stopped selling never started again. Producers and
> refiners still earn ten times as much in absolute money. One scenario, T2, still does not
> separate a thinking player from a passive one — see below.

**What a trader is, in the game.** It owns no wells and no refinery. It starts with $5M in cash and
rented tank space at one or two ports. It earns by buying crude where it is cheap and selling it
where, or when, it is dearer. Against that it pays to run each office, to ship the crude, and a
tariff at each port.

**Where it stands.** Left alone for a year, a trader used to lose about $1.5M. After this pass it
ends roughly where it started. So today trading neither makes nor loses much on its own.

**Why I am asking.** The answer decides two things: how much more work goes into the trader's
automatic buying and selling (it trades very little at the moment), and what the trader scenarios
can ask for. T2 currently wants $400K of profit in four months and T3 $250K in six, and no bot gets
near either.

**The choice.**

- **A (R) — trading is a real business.** Played well, a trader makes 10–20% on its money in a year
  ($0.5–1M on $5M), with most of that coming from your decisions. Costs me another pass on the
  trader's daily buying and selling rules.
- **B — trading only pays if you decide well.** Left alone it breaks even; every dollar of profit
  comes from answering cards. Closest to today, and cheapest. The risk: a player who ignores the
  cards slowly bleeds and feels punished for not paying attention.
- **C — trading is steadily profitable.** Give traders a built-in edge (buy cheaper, sell dearer,
  bigger tanks) so they earn even on autopilot. Easiest to tune, but it makes the hardest play type
  the safest one, which reads backwards.

## 3a. T2 "Contango" does not reward deciding ✅ fixed

A refinery outage gluts one region and the trader's own rules collected most of it. T2 now starts
the player with a second office in South Asia, so the crude has somewhere to go, and its target sits
above what a passive trader earns: 0/3 for a player who ignores everything, 2/3 for one who decides.
The acceptance test covers it again.

## 4. How often should a good player win? ✅ answered (A)

> **Answered.** Tutorials almost always · Medium about 3 in 4 · Hard about half · the finale about
> 1 in 4, measured against a player who answers by the meters. The finale now asks for a top-three
> finish rather than first of twenty (D44).

**As built** (three seeds each; `npm run campaign -- METER` and `-- NO`):

| Scenario | Level | Ignores everything | Answers by the meters |
|---|---|---|---|
| P1 First Oil | Tutorial | 0/3 | 3/3 |
| R1 Keep the Lights On | Tutorial | 0/3 | 3/3 |
| T1 Buy Low | Tutorial | 0/3 | 3/3 |
| P2 Shale Glut | Medium | 0/3 | 2/3 |
| R2 Winter Diesel | Medium | 0/3 | 3/3 |
| T2 Contango | Medium | 0/3 | 2/3 |
| P3 Gulf Giant | Hard | 0/3 | 1/3 |
| R3 Locked In | Hard | 0/3 | 1/3 |
| T3 The Long Way Round | Hard | 0/3 | 2/3 |
| ★ The Strait | Hard | 0/3 | 1/3 |

Medium averages 7 wins in 9, Hard 4 in 9, the finale 1 in 3 — inside the band, and a player who
ignores every card now loses all ten, tutorials included. A decision arrives every 14–15 days as a
producer, 14 as a refiner, 8–13 as a trader.

**Two faults found while chasing the band, both now fixed.** Deals were priced off a 20-day average,
so in a falling market a supplier offered crude *above* today's spot: no sensible player signs, and
the refiner that declined them ran dry. A deal is now never offered above what the crude last
fetched (D43). And the Supply meter counted barrels weeks away at sea, so it read comfortably while
a plant was about to run dry; it now counts only what is in the tanks.

## 5. The map: hand-drawn outlines, or the real coastlines? ✅ closed (B — good enough for now)

**What this is.** The world map shows land shapes I wrote by hand from memory — about a dozen rough
outlines. They are recognisable (you can find the Gulf, the Red Sea, Malacca) but crude: no islands
to speak of, wobbly coasts, no detail below about 500 km.

The plan in the spec is to generate the coastlines at build time from **Natural Earth**, a
public-domain map dataset used by most mapping projects. That means:

- downloading their coastline file (about 10 MB, from naturalearthdata.com, or the same data
  repackaged as an npm package);
- a small build step that projects it the way the game's map is projected, simplifies it to keep the
  file small, and writes an SVG;
- committing the generated SVG (roughly 100–300 KB) so the game still builds with no network.

**Why I am asking rather than doing it.** I do not download files without your say-so. It is
public-domain data and the licence is not in question, but it is still fetching something from the
internet into your repository, and it adds a build step you will maintain.

**The question.**

- **A (R)** Yes — fetch Natural Earth, generate real coastlines, commit the result. About half a
  day. The map stops looking like a sketch, which matters for a game named after a strait.
- **B** Not yet. Keep the hand-drawn outlines until after the first playtests, in case players never
  look at the map closely.
- **C** Neither: commission or design a deliberately stylised map (thick simplified shapes, chart
  paper look) instead of geographic accuracy. More character, more work, and it needs an artist's
  eye rather than mine.

---

## 6. The three things I cannot do myself ✅ answered

These are not code. Each needs you, or someone you ask.

**6a. Playtests** — *under way.* Phase 10's acceptance says a first-time player finishes a tutorial unaided. I can
run robots all day; I cannot watch a person get confused. What I would want: three to five people
who have never seen it, each playing one tutorial (about 20 minutes), with you noting where they
hesitate and what they misread.

> **Answered:** you will run these once the interface is usable.

- **A (R)** Do this before any public release, on the current build. It is the cheapest way to find
  out whether the cards read plainly.
- **B** Put it on itch.io first and gather feedback from strangers instead.
- **C** Skip until there is a Steam build.

**6c. Plain-language review** — *you will do this.* Every card and news item follows the wording rules (no violence, no
real companies, plain words), but I wrote them all, so I am the wrong person to judge whether a
teenager understands them. Who reads them — you, a teacher, one of the playtesters?

---

## 7. The three features still not built ✅ done (D — all three)

**What this is.** Three things the spec promises that I have not built, because each needs a system
that does not exist yet:

- **"Charter a tanker"** and **"Keep cargo afloat"** — cards that need chartered shipping, which the
  engine has no concept of. Today cargo moves automatically and you cannot hire or hold a ship.
- **"Build a second refinery"** (D34) — the spec's answer to "what does a refiner do late in the
  game". It needs a company to own two plants, and today a refiner owns exactly one.

**What changed yesterday.** T2 "Contango" showed a concrete need. A refinery outage gluts a region;
the trader's automatic rules already buy the cheap crude, so a player who ignores every card does as
well as one who does not. The player needs a lever the rules do not have. Chartered storage is one.
But so is **leasing tanks**, which already exists in the engine — the player just is not offered it:
"Lease storage" is something you have to go looking for in Opportunities rather than a card that
arrives when crude is cheap and your tanks are full. That is perhaps half a day's work, not a new
system.

**The question.**

- **A (R)** Fix T2 the cheap way first: raise "lease more tanks" as a card when crude is cheap and
  the hub is full, and see whether that separates a thinking player from a passive one. Leave
  charters and the second refinery until after playtests.
- **B** Build the second refinery now. It is D34's promise and the refiner's late game is otherwise
  just tiers, units and storage. Two or three days, and it touches the engine's company model.
- **C** Build chartering now — it unlocks two card types and gives traders a real lever. The largest
  of the three, and it changes how cargo works.
- **D** All of it, before any playtest.

## The lease auction card has a deadline it does not use (2026-09-23)

`LEASE_AUCTION`'s detector returns a `deadline` field that `Situation` does not declare and
`buildCard` never reads, so the card expires on the ordinary `CARD_DEADLINE` rather than on the day
the lots are awarded. Harmless today because the two are close, and it is a latent bug: if the
notice period or the card deadline ever moves, a player could answer a card for a sale that has
already happened. Either honour a per-card deadline in `Situation`, or delete the field.

## Two calibration measures below band, deferred to stage 6 (2026-09-23)

Measured after stage 4: refining margin contested 3–4% against a 5–40% band, and one producer
cutting output against a band of at least three across S0–S17. Both are the same underlying thing —
nothing in this economy is near enough to its cost — and both belong to the stage 6 rebalance the
owner already asked for ("there seems to be little chance of losing money at current high prices").
Halts (70–72), utilisation (76–78%) and insolvencies (none) are all where they should be.

## ~~Drilling cannot pay~~ — built as 6e (2026-09-24)

Each well now carries `initialRate × 365 × BAND_YEARS[band]` of its own oil, a block holds as much
again for every slot nothing has been sunk into, and `reshare` is gone. `DRILL_COST` went 15,000 →
20,000 with it, because a well delivering its own full share brought capital per barrel to $6.45,
under the $8–15 band; it is $8.60 now and a well pays back in 668 days.

On P2 the meter-led bot went from ×1.00 against the idle bot's ×1.15 to ×1.09–1.16 against
×1.08–1.10, and P2's target is set. In the finale it went from 18th, 18th and 13th of 20 to 11th,
14th and 6th.

A bot bug fell out of it, and it is worth knowing about because the bot stands for a competent
player in the D44 band: its rule was "never buy what will not pay for itself", and that was the
comment rather than the code. When neither answer paid back inside two years both scored Infinity,
the tie went to whichever looked less risky, and it bid $35M on ground its own card said would take
56 months. Fixed.

## ~~Ground from a bust that nobody is allowed to buy~~ — answered (2026-09-25)

**"Any producer with rights can buy — if no one does, it's ok."** `mayWork` no longer asks what
crude a company was set up for, only whether it may take ground in that region. Stranded blocks on a
twenty-year run went from **19 to 6**, and a buyer went onto the credit line for one of them.

It was smaller than feared: stage 3b already made a field hold its oil, post its asks and price its
barrels per lease *and* per grade, so a second crude is something a field can carry. Two places
still assumed one grade and now read the leases instead — an integrated major's internal transfer,
and a seller's capacity for a deal, which had been wrong since 3b anyway.

## ~~Renting a tank costs nearly as much as building one~~ - the rate stays (owner, 2026-09-25)

Found while raising `STORAGE_COST`, which the owner was right about: a barrel of tank was $15
against $20–40 in life, and paid for itself in 250 days on an ordinary year's price range where a
well takes 668. It is $30 now.

The worse number is beside it. Renting:

```
build a barrel of tank   $30     one off
rent a barrel of tank    $21.90  a year   (LEASE_RATE 0.06/bbl/day)
renting for a year costs 73% of building one for ever - it was 146%
```

In life, leased tank storage runs $3–7 a barrel a year against $20–40 to build — about **15%**. So
`LEASE_RATE` is out by roughly five times, and nobody who can build should ever rent.

**The owner chose not to cut the rate** (2026-09-25), and to make renting a commitment and the space
scarce instead. Measuring both turned up that scarcity was already there and already working:

```
pool per region        200,000 bbl hard cap    never reached
peak use, one region    60,000-70,000 bbl      30-35%, by 2 companies
rate at that peak      $0.096-$0.108/bbl/day   60-80% over the $0.06 base
per-company share cap  40% of the pool
```

So the escalator bites well before the cap does, and tightening the pool would be machinery for a
thing that never happens. **The commitment was half there too** - rent is charged daily to the end of
term with no way out, so you already pay whether you fill it. What was missing was the part its own
config had named and nobody had written: `LEASE_WARN_TICKS`, `LEASE_GRACE_TICKS` and
`LEASE_GRACE_MULTIPLIER` were dead constants, a term ended with no warning anywhere, and `endLease`
sold whatever no longer fit at a fifth off. Built: the warning, the grace, and a panel line, since
nothing in the interface had ever shown that rented space existed at all.

A first measurement of the pool found zero leased barrels in 7,300 days and was wrong: it ran the
bare engine, which has no cards, and `LEASE_STORAGE` is card-driven and traders-only. Worth
remembering - that harness cannot answer any question about a decision.

`LEASE_RATE` itself is still out by about five times against life ($21.90 a year to rent against $30
to build, where life is nearer 15%), and now belongs with the parcel-size work above, where freight
and storage are being priced together anyway.

## ~~The idle bot can win the finale~~ - answered, and P3 with it (2026-09-25)

On seed `acceptance`, three years of the finale:

```
FINALE  answers nothing     WON   rank 3 of 20
FINALE  answers by meters   LOST  rank 13 of 20
```

Across three seeds the idle bot places 3rd, 5th and 11th, so it loses two in three and the D44 band
holds — but only just, and the direction is wrong. Growing is the player's job (owner, 2026-09-25),
which settles who is responsible; it does not explain why growing makes the meter-led bot *worse*.

Diagnosed and fixed (see §12A.7 6d): half the drilling money went into dry holes and the window was
barely longer than a well's payback, so growth was break-even by construction. The dry-hole floor went
to 0.75 and the finale to five years; the meter bot now beats the idle one on every seed.

**P3 was measured at the same time and the recorded complaint was wrong.** It is 2 of 3 for the meter
bot and 0 of 3 for the idle one, not 1 of 3 - the dry-hole floor helped here too - and for a Hard
scenario against a band of about one in two, that is inside it. The measure was never what lost it:

```
meter bot, three seeds   ahead of Qasr on all three     won 2, and the third went insolvent
idle bot, three seeds     exports 10%, 0%, 0%            lost 3 on the export share
```

So the export condition does all the separating, the profit comparison does almost none, and the one
loss was a company that drilled itself out of cash - which is the company-failure machinery working.
**The owner's A (judge it on operating profit) was therefore not built:** it would have been a second
measure for a problem that is not there. What was wrong was the *words* - the goal said "earn more per
barrel of capacity" for something that measures growth in net worth - so the goal text now says what
the number is. **B was built:** the comparison is against the typical producer rather than Qasr, since
one idle run turned on $11 per bbl/day out of $8,300, which is a coin toss and not a target.

## Trade in parcels, not barrels, and what a trader is for (owner, 2026-09-25)

The owner's direction: **minimum trade sizes should come from the thing that carries the oil.** A
same-region purchase is at least a unit train; a cross-region one is at least a tanker, and the
smallest tanker is dear per barrel. Producers get deeper tanks to accumulate a parcel worth selling.
Numbers given: same-region term **20,000 bbl a month**, same-region spot **30,000 bbl** in one
purchase, producer base storage **100,000 bbl**, cross-region minimums by tanker class (GP 70,000 to
ULCC 4,000,000, at $6.50-8.50 down to $2.80-3.50 a barrel).

**Why it matters beyond realism:** it is the missing answer to stage g. A trader exists because a
small refiner cannot take a whole cargo and a distant producer cannot sell less than one. Breaking
bulk is the trade, and no amount of tuning a contango card substitutes for it.

### What the model says today, measured before any of it is built

| | today | the direction |
|---|---|---|
| Smallest spot trade | `LOT_SIZE` **1,000 bbl**, no minimum | **30,000 bbl** same-region |
| Smallest term deal | `DEAL_VOLUME.min` **1,000 bbl/day** = 30,000 a month | **20,000 a month** |
| Producer tankage | 10 days of output: **20,000-90,000 bbl** (mean field 4,142 bbl/day) | **100,000 bbl** |
| Charter classes | two: 50,000 and 200,000 bbl | seven, 70,000 to 4,000,000 |
| Freight | $0-4.50 a lane, mean **$1.19/bbl** | $2.80-14.50/bbl by class and size |

Three consequences fall out of those numbers, and each is a decision rather than a detail:

- **The 20,000 a month figure is looser than what is there now,** not tighter: a minimum term deal
  already runs 30,000 a month. Either the intent is that term deals be quoted by the month rather
  than by the day, or this floor is already cleared and only the spot one bites. **Needs a word.**
- **A 30,000 bbl spot floor changes the shape of a producer's game.** The mean field pumps 4,142
  bbl/day, so it accumulates a saleable parcel every **7.2 days**: it stops selling daily and starts
  selling about four times a month, and its cash arrives in lumps. Nothing about that is wrong - it
  is how the business works - but every scenario target, the payback meter and the storage-pressure
  calibration are all tuned against daily selling.
- **100,000 bbl as a floor mostly changes the small producers.** The largest field in the world holds
  90,000 already; the smallest holds 20,000 and would hold five times that, which is fifty days of
  its own output. It flattens tankage across the field, and the storage pressure the calibration
  watches (fill 15% to 31%, first halt on day 65-115) would move a long way out. Worth measuring
  before it is set, because storage pressure is the producer's main operating constraint today.
- **Freight does not yet know that a small parcel is dear.** Every barrel pays the same per-lane rate
  whatever it travels in. The table's whole point is that a GP cargo costs twice a VLCC's per barrel,
  and that is what makes breaking bulk a service worth paying for. Without it, parcels are lumpy but
  a small one is not expensive, and the trader still has nothing to sell.

### A world where shipping is the norm: the design, and what it costs (owner, 2026-09-26)

The owner's direction: **long purchases move by ship.** That changes what a refiner has to do to get
fed, and it makes the trader's business real - buying hulls in bulk, landing them in their own tanks in
several regions, and selling in small pieces over time. The owner also notes the world has too few
producers to fill ships. Measured, and it is worse than too few:

```
19 producers          world pumps  88,500 bbl/day   =  1.26 GP cargoes a day, for the whole planet
13 refiners           world refines 99,000 bbl/day  (66,733 actually run)
19 loading regions    so an average quay loads one GP cargo every 15 days
traders' hub space    50,000 bbl in total, across every office in the world - 0.7 of one cargo
```

**The three facts that set the design:**

- **Refiners are already the right size for cargoes.** A GP cargo of 70,000 bbl is **6.4 to 14 days** of
  feed for the refineries in this world, which is what a cargo is in life. Their *tanks* are the problem:
  6 of 13 cannot hold one cargo.
- **Producers are far too small to be the unit of shipping.** The typical field takes **18-28 days** to
  fill a GP cargo and **14 of 19 could not physically hold one**. If a ship has to be filled by one
  company, most of this world can never ship anything.
- **Traders cannot do the job the owner wants at all.** An office hub holds `OFFICE_HUB_CAPACITY` =
  10,000 bbl. Buying a cargo and selling it in pieces needs one or two cargoes of tank, so this number
  is out by a factor of ten to fifteen. It is the single most important number in the whole design.

### The model

**1. A voyage hires a hull, and you pay for the hull.** Sea legs stop being a per-barrel toll and become
`days x day rate / barrels loaded`. Nothing needs a minimum cargo rule: a part load pays for the empty
space, so 1,000 barrels on a 38-day voyage prices itself out at about **$1,100 a barrel** and nobody
does it. Pipelines keep their per-barrel tariff, which is what a pipeline is.

**2. Classes, with a small one this world needs.** The owner's table is the shape - bigger is cheaper per
barrel, and its own efficiency index puts a GP at **3.2x a VLCC per barrel**, which is the number the
whole design rests on. Its absolute figures do not quite agree with each other (a GP at $1.0-1.4M for
30 days over 70,000 bbl is $14-20 a barrel, not the $6.50-8.50 in the next column), so the ratios are
what should be taken and the rates set to make them true in the game. A **coaster of ~20,000 bbl** has
to be added: short-sea trade at this world's size has nothing else to use.

**3. Cargo is assembled at a quay, not at a company.** This is the piece that makes the rest possible. A
buyer fills a hull from whatever sellers have barrels at that loading region, so a 2,500 bbl/day field
is still in the business - it sells into the terminal rather than filling a ship. Stage 3b already built
most of what this needs: a lease holds its own oil, posts its own ask at its own quay, and prices its
barrels per grade. The quay is already there; nothing aggregates across it yet.

**4. An office becomes a terminal.** `OFFICE_HUB_CAPACITY` 10,000 -> **150,000 bbl** (two GP cargoes, or
one MR). A trader lands a hull into its own tank and sells from it in any size, in any region it has an
office. That is the business the owner is describing, and it is currently impossible by a factor of
fifteen.

**5. Why it pays - the trader's margin is the difference between a big ship and a small one.**

```
buy a VLCC parcel, ocean crossing        ~$2.25/bbl of freight
what the buyer would have paid for a GP  ~$12.86/bbl
gross advantage                           $10.61/bbl
less carrying it 30 days at STORAGE_CARRY $1.80/bbl
less the hub's rent and the price risk    the trader's actual job
```

**That gap is the whole reason the trade exists**, and the owner's table hands it to us directly. No
contrivance is needed to make traders matter: make freight depend on the hull and the margin appears.

**6. Refiners shop around, and it becomes a real decision.** Covering next month's feed offers three
genuinely different shapes: a whole cargo from a distant quay at $3-4 a barrel of freight but thirty
days out and a large cash outlay; a parcel from a trader's tank nearby, dearer per barrel but available
tomorrow and in the size you want; or a coaster from a regional producer. That is a card with three
answers that are not versions of each other - which is what section 12A.8 has been asking for.

### What it costs, honestly

- **Production has to roughly triple.** For a refiner to have real choices a quay should load every 3-5
  days rather than every 15, which is **2.5-3x** today's 88,500 bbl/day. The owner's instinct to add
  producers rather than enlarge them is the right one: it also thickens the auction and the leaderboard.
  19 -> about 45 producers, with refining raised to match.
- **That slows everything down.** 32 companies today; about 60 after. The full check is already 440s and
  clearing is per node per day, so expect something near double. Worth deciding before, not after.
- **The merit order becomes size-dependent, and that is the real implementation risk.** `previousClose`
  and `refinerQuote` rank origins by landed cost per barrel. Once freight depends on how much you buy,
  there is no single landed price for an origin any more - only a landed price *for a parcel of a given
  size*. Every rule that compares origins has to be told how much is being bought. This is the piece
  most likely to be underestimated.
- **Two dead systems come back to life**, which is the cheerful part: charters (0 in a year, and no AI
  company can reach them) and the storage-lease pool both become load-bearing.

### Build order, measured at each step

1. **Vessel classes and voyage pricing**, per-barrel freight kept for pipelines. Measure what it does to
   landed costs and to refining margin before anything else moves.
2. **Tanks**: producers and refiners to at least one cargo, trader hubs to two. Nothing can ship before
   there is somewhere to put it.
3. **Cargo assembled at a quay** across sellers.
4. **More producers**, to the cargo-every-3-5-days target, then one recalibration.
5. **The refiner's shopping card and the trader's bulk-and-break business**, which is stage g finally
   having something underneath it.

Steps 1 and 2 are the ones that prove or kill the idea, and neither needs the rescale question answered
first.

### The owner's case, measured: a Permian producer really does put 1,000 barrels a day to sea

Asked 2026-09-26: does a Southeast Asian refiner buy 1,000-barrel parcels from the Permian, and is
that a problem given tankers have minimum sizes? Measured with the cards running, a Permian producer,
one year. Every term deal that has to cross an ocean:

```
lane                             bbl/day   voyage   freight   what sails
US_Permian -> Southeast_Asia       1,000      38d    $6.00    1,000 bbl, every day
US_Permian -> South_Asia           1,000      26d    $5.50    1,000 bbl, every day
US_Permian -> Middle_East          1,000      25d    $5.70    1,000 bbl, every day  (x2)
```

**All four are at `DEAL_VOLUME.min`.** It is not an edge case, it is the default. And a deal delivers
`qtyPerDay` as its own cargo every day, so that lane has about **38 separate 1,000-barrel voyages in
progress at any moment** - 38,000 barrels spread over 38 imaginary ships - where the business would
send one part cargo.

For scale: 1,000 barrels is about 160 cubic metres, six road tanker loads. The smallest ship this game
defines holds **50,000 bbl**; the smallest class in the owner's table holds **70,000**. So the model is
sending a fiftieth of its own smallest ship, and a seventieth of the industry's, across the Pacific,
daily.

**The mechanism behind it: there are no ships.** Two things found in the code:

- Freight is a per-barrel toll summed over lane segments - `totalFreight += c.freight` - with **no
  quantity term anywhere**. Moving 1,000 barrels costs the same per barrel as moving a million. Nothing
  in the model can express a minimum size, because nothing in the model is a vessel.
- **Nobody ever charters one.** Zero charters in a year. `CHARTER_TANKER` is `raised: false`, so it is
  only ever found by a player browsing a panel, and it appears in neither of the AI's tables
  (`OPERATING`, `GROWTH`), so **no AI company can charter a ship at all.** The charter system, its two
  classes and its rates are machinery nothing in the world reaches - the same shape as the credit line
  before 6c and the lease grace before today.

The per-barrel rates are not even wrong: $6.00 a barrel for Permian to Southeast Asia sits right in
the table's GP band of $6.50-8.50. The game charges small-ship money for a parcel seventy times
smaller than a small ship.

**This reframes the fix.** A minimum trade size is a rule bolted on to forbid something. The thing that
forbids it in life is that **a voyage costs what the ship costs, full or empty**: 1,000 barrels on a
38-day GP charter is $1.1M, which is $1,100 a barrel, so nobody does it, and no rule had to say so.
Consolidating many small parcels into one hull is then a service worth paying for, which is the
trader's whole business. Three ways to get there:

1. **Price the voyage, not the barrel, and invent small classes to match this world.** A coaster of
   10,000 bbl alongside the existing two. No rescale, and it works at today's sizes - but the vessel
   classes are then made up rather than the real ones in the table.
2. **Rescale the world, then price the voyage with the real classes.** The table becomes literal and
   every ratio stage 6 set survives, because it is a change of units (see below). My recommendation for
   where this should end up.
3. **Cheapest: a per-barrel surcharge that falls as the parcel grows.** Approximates voyage economics
   with no vessel model at all, and could ship this week. Good as an interim, and it leaves the charter
   machinery still unreachable.

### The number that decides the shape of this: no cargo is anywhere near a tanker

Measured over a year of the game world, 3,822 cargoes:

```
every cargo            min 1,000 bbl   median 5,000   90th 15,000   max 51,000
freight actually paid  min $0.00/bbl   median $2.40   90th $4.70    max $7.50

cargoes that would meet the smallest class in the table (GP, 70,000 bbl):  0.0%
```

**Not one cargo in a year reaches even the smallest tanker.** The largest that ever sailed was 51,000
barrels, against a GP's 70,000 floor, and the median was 5,000. So a cross-region minimum of one
tanker would not make trade lumpy - it would stop cross-region trade entirely. The freight paid
already spans the table's range ($0-7.50 against $2.80-14.50), but it is set by the lane, and knows
nothing about how much is in the ship.

The reason is scale. The average field in this world pumps 4,142 bbl/day, so a single GP cargo is
**eight to thirty-five days of a whole company's output**. In life a Gulf producer pumps hundreds of
thousands of barrels a day and a refinery runs 100,000-400,000. The game is built two orders of
magnitude below the industry it is about, and the minimums are a symptom of that rather than the
disease.

Two ways out, and it is the owner's call:

- **A. Price small parcels instead of banning them.** No hard floor on a voyage; freight per barrel
  comes from how full the ship is, so 5,000 barrels pays GP-like money and a consolidated 70,000 pays
  a third of it. Traders then exist to consolidate, which is the role they have in life, and nothing
  in the world is forbidden. Cheap, and it does not disturb a single tuned number.
- **B. Rescale the world to the industry, and take the table literally.** Capacities, tanks, cargoes
  and company cash all multiply by the same factor (something like 20-50x). **This is cheaper than it
  sounds:** almost every constant in the config is already *per barrel* or *per bbl/day* and so is
  scale-free - `DRILL_COST`, `STORAGE_COST`, `FACTORY_COST`, the tariffs, the freight. What needs
  multiplying is the absolute figures: starting cash, `CREDIT_BASE`, `OFFICE_COST`, `LOT_SIZE`,
  `DEAL_VOLUME`, the charter capacities and the lease pool. Done uniformly it is a **change of units**:
  every ratio in the game stays exactly where stage 6 put it, and nothing needs rebalancing. What it
  buys is that the tanker table, the train, the 100,000 bbl tank and the 30,000 bbl parcel all become
  the natural sizes they are in life instead of numbers the world has to be bent around.

**Recommendation: B, then A on top of it.** B alone makes the minimums sensible; A is what makes a
trader necessary, and it needs B first or the smallest ship in the table is still bigger than anything
anyone ships. Doing A alone works and is much less effort, but it leaves a world whose fields are a
fiftieth of the size of the fields it names.

### The trader's role: what I would do

The owner asked four questions. The shape that answers all of them at once is **the trader breaks
bulk**: buys cargo-sized parcels, holds them in a hub or afloat, and sells in pieces smaller than
anyone else will quote.

1. **Refiners buy from traders' inventory rather than hiring them to ship.** Hiring a trader as a
   freight agent adds a middleman to a journey the model already runs. Holding stock to sell in
   pieces is a position with a risk attached, which is a game.
2. **Producers hold and sell in lumps** - yes, and that is what the 100,000 bbl tank is for.
3. **Traders buying up stock should be able to squeeze a refiner, but not starve one.** Keep the
   same-region floor low enough that a refiner can always buy on its own doorstep; let the
   cross-region market be the one a trader can corner. Insolvencies and stockout days are already
   calibrated, so this can be measured rather than argued.
4. **Traders should not be the only source.** A single channel puts the refiner's game at the mercy of
   trader AI and deletes the direct producer-refiner relationship the P and R scenarios teach. Make
   them the only *practical* source of small cross-region parcels, which is true in life and leaves
   both other routes open.

**Size:** larger than any stage so far. It reaches clearing, deals, transport, charters, portfolios,
the payback meter, every scenario target and the calibration band, and it lands squarely on top of
stage g. It wants to be built in measured steps - freight by parcel size first, since it is the piece
that makes the rest mean anything, and storage before minimums, since minimums without tanks halt
every small producer in the world.

## Two things the economics package raised, for the owner (2026-09-24)

- ~~**Ground is now beyond what a producer can afford.**~~ **Answered by the owner (2026-09-24):
  credit.** "Buying leases will require extra buying power, this is where credit comes in handy.
  Loans can be used for purchases outside of a company's buying power." Built in 6c: every
  affordability question now asks cash *plus the undrawn line*, and the line was resized from 3.7×
  net worth to 1.1× so that being able to borrow is not the same as being able to afford anything.
  Lots that drew no bid went from 8 of 18 to 1 of 18, and eleven of seventeen winners needed the
  line to pay. `AUCTION.WORTH_SHARE` was left alone — ground is not too dear, buyers were too poor.

  What the measurement turned up on the way: **nobody had ever drawn a dollar of credit**, in 31
  companies × 3 seeds × a year. The line existed on every balance sheet and no rule ever reached it.

  Still open underneath it: the failed-company leases were the *other* answer to this, and are still
  worth building — but they are now a source of cheap ground rather than the only way any ground
  moves at all. **The owner's constraint on them (2026-09-24):** "cheap is ok but still has to be
  worth enough to require borrowing." So a dead company's acreage comes up under the reserve of new
  ground, but not under what a producer keeps in the bank: you still buy it on the line.

- **The AI does not read a payback.** Rivals buy ground and drill on fixed per-look odds
  (`ai/scoring.ts` GROWTH), whatever it costs. A player reading the meters now declines a three-year
  payback, so the meter bot is out-grown by companies making a worse decision than it is — which is
  why the finale went to ranks 14–18 after the package. The finale cannot be retuned honestly until
  the AI weighs the same number the player does. Either teach `chooseForAi` the payback, or accept
  that rivals are structurally more reckless and set the finale's band against that.

- ~~**Trader cards do not make a trader better**~~ — **answered (2026-09-24): its own step.** Over
  six seeds on T3 the bot that answers by the meters ends on $-1.18M to $1.18M and the bot that
  answers nothing on $-1.11M to $1.03M: the same spread. A trader's profit comes from holding crude
  while the price drifts, which needs no decision at all — the §12A.8 complaint again, unfixed for
  traders. Now stage 6f. Until it lands, T3's target stays where it is and the D44 band is checked
  on a majority of seeds rather than one game.

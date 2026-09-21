# Open questions for the owner

Written at the end of Phase 12's first balance pass (2026-09-19). Everything here is a decision I
should not take alone: each one changes how the game feels, costs money, or needs a person. The
build continues around them; nothing below blocks the code.

Recommendations are marked **R**.

---

## Noted during playtesting, to do before release

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

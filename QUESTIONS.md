# Open questions for the owner

Written at the end of Phase 12's first balance pass (2026-09-19). Everything here is a decision I
should not take alone: each one changes how the game feels, costs money, or needs a person. The
build continues around them; nothing below blocks the code.

Recommendations are marked **R**.

---

> **Answered 2026-09-19/20.** 1: **A, accepted**. 2: **A, agreed** — neglect now bites (D39).
> 3: **A, with the steer that volume is the lever** — done (D40): a trader answering by the meters
> now makes 19–51% a year. 5: **B** — the hand-drawn map stays for now. 6a: playtests once the
> interface is usable. 6b: dropped. 6c: you will read the text. 7: **D** — all three built (D41,
> D34, D42). **Question 4 is the only one still open**, restated below with fresh numbers.

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

## 3a. T2 "Contango" does not reward deciding

A refinery outage gluts one region. The trader's own daily rules already buy the cheap crude and
sell it on, so on some seeds a player who ignores every card earns as much as one who does not.
Giving the player a lever the rules do not have — chartered storage, or selling forward — would fix
it, and both wait on question 7. Until then the acceptance test skips T2 and says why.

## 4. How often should a good player win?

**What this is.** Phase 12's acceptance asks that win rates "fall within agreed bands". We never
agreed them, so I have nothing to tune the campaign against. Every scenario target — $400K here,
3.3 times net worth there — is currently a number I picked to sit between two robot players.

**How I measure it.** Three robots play every scenario on three seeds each:

- **the No bot** answers No to everything — it stands for a player who ignores the game;
- **the Yes bot** answers Yes to everything it can afford — a player who accepts every offer without
  reading it, including bad deals;
- **the meter bot** picks the option with the best projected profit, preferring the safer one when
  two are close, and keeps the refinery fed before chasing profit. This one stands in for a
  competent player, and it is the one the bands should be set against.

**Where it stands** (three seeds each, measured on today's build, after the charters, the second
refinery and the trading fixes):

| Scenario | Level | Ignores everything | Answers by the meters |
|---|---|---|---|
| P1 First Oil | Tutorial | 0/3 | 3/3 |
| R1 Keep the Lights On | Tutorial | 0/3 | **1/3** |
| T1 Buy Low | Tutorial | 0/3 | 3/3 |
| P2 Shale Glut | Medium | 0/3 | 1/3 |
| R2 Winter Diesel | Medium | 0/3 | 3/3 |
| T2 Contango | Medium | **2/3** | 2/3 |
| P3 Gulf Giant | Hard | 0/3 | 1/3 |
| R3 Locked In | Hard | 0/3 | 1/3 |
| T3 The Long Way Round | Hard | 0/3 | 3/3 |
| ★ The Strait | Hard | 0/3 | 0/3 (best: 2nd of 20) |

And how often a decision arrives, over a Sandbox year: producer every 15 days, refiner every 12–14,
trader every 8–13. The 7–14 day target is met for a competent player everywhere but the producer,
and that one is close.

Three things need your steer rather than more tuning by me.

**R1, a tutorial, is won 1 time in 3.** Its goal is never to run out of crude in 90 days. A player
who follows the Profit meter turns down supply deals that lose money over the next month — and then
runs dry, which loses outright. The deals genuinely are unprofitable; taking them anyway is right.
So either the Supply meter must outrank Profit when the tanks are nearly empty, or those cards must
spell out what running dry costs. This is the clearest thing to fix next, whatever band you choose.

**T2 is won by a player who ignores everything, 2 times in 3.** A refinery outage gluts a region and
the trader's automatic rules already collect most of it. Charters now exist, so the scenario could
be rebuilt around holding cargo at sea until the refinery restarts — that is what "contango" means —
but I would rather do that once the band is set.

**Nobody wins the finale**, though a meter-led player reached second of twenty.

**The question, part one.** What win rate should a competent player have?

- **A (R)** Tutorials almost always; Medium about 3 times in 4; Hard about half the time; the finale
  about 1 in 4. Generous, which suits a teenager learning the game.
- **B** Tutorials always; Medium about half; Hard about 1 in 3; the finale 1 in 10. A game for people
  who like losing and retrying.
- **C** Tutorials always; Medium 9 times in 10; Hard 2 in 3; the finale 1 in 3. Gentler still —
  almost everyone finishes the campaign.

**The question, part two.** The finale currently asks you to finish first among companies of your
type — twenty of them, most far bigger. Keep that, or change it to a top-three finish?

- **A (R)** Top three. "First of twenty" is a lottery in a market this size, and the difference
  between third and first is mostly which events landed on you.
- **B** Keep first place, and accept the finale is a trophy few will see.

---

## 5. The map: hand-drawn outlines, or the real coastlines? ✅ answered (B — revisit later)

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

**6a. Playtests.** Phase 10's acceptance says a first-time player finishes a tutorial unaided. I can
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

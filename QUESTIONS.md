# Open questions for the owner

Written at the end of Phase 12's first balance pass (2026-09-19). Everything here is a decision I
should not take alone: each one changes how the game feels, costs money, or needs a person. The
build continues around them; nothing below blocks the code.

Recommendations are marked **R**.

---

> **Answered 2026-09-19/20.** 1: **A, accepted** — producers stay quiet once they are in good
> shape, and the campaign supplies the pressure. 2: **A, agreed** — neglect now bites (D39).
> 3: **A, with the steer that volume is the lever and producers and refiners still make the bulk**
> — done (D40). 4–7 are open.

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

## 4. Win-rate bands for the campaign

Phase 12's acceptance asks that "win rates fall within agreed bands" — we never agreed them. Today,
over three seeds: the always-No bot loses every scenario, tutorials included; the always-Yes bot
wins all three tutorials, R2 and R3 every time, P2 two times in three, P3 one time in three, and
never wins T2, T3 or the finale.

**The question.** What is a good band? My suggestion: a competent player should win tutorials
almost always, Medium scenarios about 3 times in 4, and Hard about 1 in 2; the finale should be
rare, perhaps 1 in 4.

## 5. The map's coastlines

The map draws low-detail land outlines I wrote by hand. The spec wants coastlines generated at build
time from Natural Earth, which means downloading a public-domain dataset (about 10 MB) and adding a
build step. I have not downloaded anything.

**The question.** Shall I fetch Natural Earth and generate the real coastline SVG? **R: yes, before
any public release** — the hand-drawn outlines are recognisable but crude.

## 6. Things only you can do

- **Human playtests.** Phase 10's acceptance says first-time players finish a tutorial unaided. I
  cannot run this.
- **Trademark search.** The company names and the title "Hormuz" need a formal search before
  release.
- **Plain-language review** of card and news text by someone who is not me.

## 7. Deferred features (D36)

"Charter a tanker", "Keep cargo afloat" and "Build a second refinery" (D34) still wait on the
charter and multi-plant systems. They are not needed for a playable game, but D34 promises the
second refinery as the refiner's late game.

**The question.** Build them now, or leave the refiner's late game as tiers, units and storage?
**R: leave them until after the first playtests** — they add systems, and playtests may show the
refiner already has enough to do.

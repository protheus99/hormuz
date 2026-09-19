# Open questions for the owner

Written at the end of Phase 12's first balance pass (2026-09-19). Everything here is a decision I
should not take alone: each one changes how the game feels, costs money, or needs a person. The
build continues around them; nothing below blocks the code.

Recommendations are marked **R**.

---

## 1. Producers have few decisions once they have taken the obvious ones

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

## 2. Ignoring every card is still competitive in some places

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

## 3. Traders are viable but thin

Trading went from about −$1.5M a year to roughly break-even after this pass (D37). But a trader
based in a refining region (East Asia) still drifts down, and no bot reaches the T1–T3 scenario
goals: T2 and T3 stay out of reach, and the T1 tutorial now asks for a second office rather than a
profit, because trading cannot reliably deliver one in 90 days.

**The question.** What should a good trader make in a year on $5M of capital?

- **A (R)** 10–20% ($0.5–1M), earned mostly through cards. Needs another pass on the trader's daily
  rules, which currently trade little.
- **B** Break-even autopilot with all profit from decisions. Closest to today, but a passive trader
  slowly bleeds.
- **C** Traders keep a structural edge (wider spreads, bigger hubs) and earn steadily. Simplest to
  tune, least skill-testing.

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

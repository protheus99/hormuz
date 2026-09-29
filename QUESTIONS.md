# Open questions

What is still undecided or unbuilt, and nothing else. Every question that has been answered lives in
the decision log in `hormuz-master.md` §12, by its D-number — that is the record, and repeating it
here only made two places to keep in step. This file was 719 lines on 27 September 2026, of which
thirteen sections of twenty were struck through or marked done.

---

## Before a release

**A trader who answers cards may be no better than one who ignores them.** Measured 2026-09-24 over
six seeds on T3: the meter-led bot ended on $-1.18M to $1.18M and the bot that answers nothing on
$-1.11M to $1.03M — the same spread. A trader's profit came from holding crude while the price
drifted, which takes no decision at all. One of the three play types therefore did not reward playing
it, and no scenario bar can separate a competent trader from an idle one while that is true.

**That measurement is now stale and must be re-run before anything is built on it.** It predates the
×20 rescale (D64), vessel classes (D65) and ports (D66) — and those three changed exactly what a
trader trades on: freight a barrel now depends on the size of the parcel it moves in, and a port works
a fixed number of ships a day however small each cargo is. Breaking bulk is a trader's business, and
the world only learned to price it afterwards.

The designed answer, if the gap is still there, is **minimum trade sizes taken from the thing that
carries the oil** (owner, 2026-09-25): a same-region purchase is at least a unit train, a cross-region
one at least a tanker, and producers get deeper tanks to accumulate a parcel worth selling. A trader
exists because a small refiner cannot take a whole cargo and a distant producer cannot sell less than
one. The owner's four answers, still standing:

1. **Refiners buy from a trader's inventory**, rather than hiring one to ship. Hiring a freight agent
   adds a middleman to a journey the model already runs; holding stock to sell in pieces is a position
   with a risk attached, which is a game.
2. **Producers hold and sell in lumps** — what the deeper tank is for.
3. **A trader may squeeze a refiner, never starve one.** Keep the same-region floor low enough that a
   refiner can always buy on its own doorstep; let the cross-region market be the one that can be
   cornered. Insolvencies and stockout days are already calibrated, so this is measurable.
4. **A trader is not the only source** — only the practical source of small cross-region parcels,
   which is true in life and leaves the direct producer–refiner relationship the P and R scenarios
   teach.

**Its size is the reason to measure first.** It reaches clearing, deals, transport, charters,
portfolios, the payback meter, every scenario target and the calibration band. Freight by parcel size
was the piece that made the rest mean anything and is built; storage comes before minimums, because
minimums without tanks halt every small producer in the world.

**The campaign is two goals away, not a rebalance away** (measured 2026-09-28, three seeds each,
`npm run campaign -- HONEST NO`). Nine of the ten scenarios separate a competent player from one who
decides nothing — the idle bot wins **0 of 3 on every scenario in the game** — and eight are inside the
D44 band:

| | honest player | idle | band | |
|---|---|---|---|---|
| P1, R1, T1 tutorials | 3/3 | 0/3 | almost always | ✅ |
| P2 medium | 2/3 ($1,167M, $1,236M, $1,211M of $1,197M) | 0/3 | ~3 in 4 | ✅ |
| R2 medium | 2/3 | 0/3 | ~3 in 4 | ✅ |
| T2 medium | 3/3 ($24.6M, $42.5M, $20.8M of $18.0M) | 0/3 | ~3 in 4 | ✅ generous |
| R3 hard | 2/3 | 0/3 | ~1 in 2 | ✅ |
| T3 hard | 1/3 ($12.3M, $12.7M, $52.0M of $20.0M) | 0/3 | ~1 in 2 | ✅ at the edge |
| **P3 hard** | **0/3** | 0/3 | ~1 in 2 | ❌ one condition |
| **Finale** | **0/3** (rank 17, 13, 13 of 20) | 0/3 (14, 13, 12) | ~1 in 4 | ❌ |

**P3 is fixed** (2026-09-29). Two bugs lived in two numbers. The scripted bypass capacities stayed at
1,500 and 500 through the ×20 rescale — about 1% of each line instead of a fraction — so with a lot at
20,000 bbl nothing could leave the Gulf while Hormuz was shut, and the goal read 0% of output under
every policy. Rescaling them was not enough on its own: a company may reserve half a line and orders
are whole lots, so half of 30,000 floored to nothing and `EXPORT_CLOSURE_RISK` — the card that reserves
the space the whole scenario is built around — could never be raised. One line at 40,000 and the other
shut keeps the same 40,000 bbl a day around Hormuz and makes half of it exactly one lot.

Measured over six seeds afterwards: a careful player wins **2/6** with exports of 50%, 53%, 33%, 51%,
51% and 3%, an idle one **0/6** on 0–9%, and one who says yes to everything **0/6** on 20–49% with
growth down to $-39,788 per bbl/day. Four seeds now clear the export bar and two of those lose on
growth instead — reserving space keeps you flowing and costs you the year, which is the trade-off the
scenario was always meant to pose. At 2 of 6 it sits at the hard edge of the ~1-in-2 band; the bars were
left alone rather than tuned to six samples.

**The finale's rank came down, 3 to 8** (owner, 2026-09-29; D71), and the number was measured: over six
seeds a careful player finishes 4th, 8th, 13th, 13th, 14th and 17th against an idle one's 9th, 12th,
12th, 13th, 13th and 14th, and 8 is the most places that leaves the idle bot winning none of six while
a careful one takes two — about one in four, which is the band. The always-Yes bot finishes 20th of 20
on every seed.

**Still true, and not fixed:** a careful player is only about two thirds of a place ahead of an idle one
on average in the finale (11.5 against 12.2), so the bar separates them through the tail rather than
through a margin. The cause is the AI, which buys ground and drills whatever it costs while a player
reading a payback declines the same ground — left that way by decision (2026-09-27). If the finale
should reward deciding rather than merely punish recklessness, that is the thing to change, and it is
not a bar.

**The meter-led bot stopped standing for a competent player, and the harness now says so.**
A dilemma hides its cost from the meters on purpose, so a bot reading only meters cuts every
corner in a deck that has grown to seven of them. On P2 that was worth about $850M: `METER` won
0 of 3 on $316M, $364M and $1,163M where `HONEST` won 2 of 3 on $1,167M, $1,236M and $1,211M.
`npm run campaign -- HONEST` is what the band is judged on; the gap between the two policies is
what corner-cutting costs, and the only measurement that shows the reckonings working.

**The refiner tutorial has to explain FOB** (owner, 2026-09-21). A producer is paid the day its crude
is loaded and never thinks about the voyage, which is why the producer scenarios can leave it unsaid.
A refiner is the buyer: it pays on loading day, waits ten to twenty days for crude it has already paid
for, pays the freight that day and the destination tariff when the cargo lands. That is the difference
between a full tank and an empty one, and R1 "Keep the Lights On" cannot be learned without it.

**The deal card's wording contradicts its own meters** (owner, 2026-09-27: "the way this is
communicated might be the issue"). It is the most common card a new player meets.

**A save is one `localStorage` slot** on one browser on one device (§14.9). Clearing site data loses
the game; a laptop and a phone are two different games. Fine for one player on one evening, and the
thing to fix before anyone is asked to play for longer — exporting and importing a save file is the
smallest honest answer.

**Two calibration measures sit below band** (measured after stage 4, deferred to stage 6): refining
margin contested 3–4% against a 5–40% band, and one producer cutting output against a band of at
least three across S0–S17. Both are the same underlying thing — nothing in this economy is near
enough to its cost. Halts, utilisation and insolvencies are all where they should be.

**The calibration window cannot see the economic climate**, so a number measured in a boom and one
measured in a panic are averaged together. It matters only because the retune above rests on those
numbers.

**`LEASE_AUCTION` has a deadline it does not use.** Its detector returns a `deadline` field that
`Situation` does not declare and `buildCard` never reads, so the card expires on the ordinary
`CARD_DEADLINE` rather than on the day the lots are awarded. Harmless while the two are close, wrong
the moment either moves: either honour a per-card deadline or delete the field.

## Deferred by decision, not forgotten

**Reserve capacity per product at a port — cut by the owner, 2026-09-29.** The second half of the
port model of D66: a port's ships-a-day limit is built, and how much of each product can *stand* at a
port is not, and now will not be. It was the largest remaining change to where oil lives, so it
touched the conservation invariant, and the ships-a-day limit already produces the congestion the
owner asked for. Not a deferral — a cut. If it ever comes back it starts from D66's note, not here.

**Port card B, contributing to a widening** — the third of the three port cards (D67). Needs a pledge
held and refunded on a deadline, the one new mechanism among them, and it is silent in the eleven
regions of nineteen that have a single company.

**Transport for refined products.** Crude has had all the attention; products need hubs and voyages
too, and a trader selling to markets or consumers needs a regional product sink that does not exist.

**Cargo assembled at a port, across sellers, and monthly quoting.** The remaining architectural piece
of the shipping plan. A daily trickle across the Pacific is the same problem as a 1,000-barrel cargo,
in another form: deals deliver `qtyPerDay` daily, so a monthly figure cannot be expressed today.

**Daily reporting.** The engine keeps the day and will (D56), so the Activity tab is a list of days
and nothing rolls them up. Wanted: a day's own line and the same figures gathered into months and
years, so a player can read the business at the length they care about. Asked for by the owner on
2026-09-22, explicitly not to be built yet.

**Stage 4's safety deck, to design with the owner.** The engine half is built: wells are serviced
every 240 days, fail on a rising hazard, wait 5–15 days for a crew, and cost money for both. What the
player has is a board and an alert — no lever. Three things to decide before writing cards: *what a
policy card may change* (there is no well-level hold, unlike a refinery's `maintenanceHoldUntil`, and
no way to pay a crew to come sooner — both small to add, worth adding only if a card uses them); *how
the safety dilemma reads a well* (overdue, and a number of days of output to lose, both of which the
model can already say); and *what exposure attaches to* (one hidden number, or one for safety that
regulators watch and one for legal exposure that lawyers do).

And a measurement that should shape it: **an outage costs less than it looks.** A well that is not
pumping does not deplete, so the lease still holds exactly as much oil — the barrels are deferred, not
lost — and on any day the tank is the binding constraint, losing a well costs nothing at all. If the
safety dilemma is to bite, the cost has to come from the workover bill and the catastrophe rather than
from the production missed.

**Playing on a phone** (§12B, D58) — reviewed and deferred; the desktop layout does not fit a phone
and a portrait interface is a rebuild.

**Release stages 3–5** (§14.8): web portals, Steam, mobile app stores. Each waits on feedback from
the one before it.

## Answered, and where the answer is

| Question | Answer | Recorded |
|---|---|---|
| Producers have few decisions once the obvious ones are taken | Accepted as it stands | D39 |
| Ignoring every card is still competitive | Neglect now bites | D39 |
| How much should a trader make in a good year? | Volume is the lever; 19–51% a year | D40 |
| How often should a good player win? | The band is set, and the campaign sits inside it | D43, D44 |
| Hand-drawn map, or real coastlines? | Hand-drawn stays, and is good enough for now | — |
| The three features not built | All three built | D34, D41, D42 |
| Drilling cannot pay | A well holds oil of its own; dry-hole floor 0.75 | 6e |
| Ground from a bust nobody may buy | A producer keeps one block and comes back | D57 |
| Renting a tank costs nearly as much as building one | The rate stays; renting became a commitment and space scarce | D61 |
| The idle bot can win the finale | Answered, and P3 with it | D60 |
| Ground is beyond what a producer can afford | Credit becomes buying power | 6c |
| Trader cards do not make a trader better | Its own step — still open above | 6g |
| The AI does not read a payback | Left as it is; the band is set against it | owner, 2026-09-27 |
| A minimum term deal is thirty times the owner's figure | Left as built; the figure predated the rescale | owner, 2026-09-27 |
| Cargo on the map | Option B, dots that glide between days | D63 |
| Shipping as the norm for long purchases | Vessel classes, then ports | D65, D66 |
| Which port-widening card to build | The unethical one first, then asking | D67, D68 |

## A trap worth remembering

**`createWorld` + `step` has no cards.** The bare engine runs no deck, so it cannot answer any
question about a decision: a first attempt to measure leased storage reported "zero leased barrels in
7,300 days" because `LEASE_STORAGE` is card-driven, and the same trap was nearly walked into again
with deals. Anything about a card, an answer or an option must be measured through `GameSession`.

**And a card that passes its unit test can still be broken.** `RENEW_LEASE` renewed every parcel in a
region rather than the one expiring; the test had one parcel per region, and a real game had six.
`PORT_FAVOUR`'s situation text quoted a lifetime tally while claiming it was a year. Both were found
by playing, not by testing.

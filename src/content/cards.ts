// Card text (spec G4.1, G7.1 wording rules): plain words, two sentences of situation at most,
// faceless and non-violent. Each template fills {placeholders} from the card's situation data.

export interface CardText {
  readonly title: string;
  readonly situation: string;
  readonly yes: string;
  readonly maybe: string;
  readonly no: string;
}

const TEXT: Readonly<Record<string, CardText>> = {
  CASH_SHORT: {
    title: 'Cash is running short',
    situation: 'You have cash for about {days} days of running costs. Your credit line has {credit} unused.',
    yes: 'Borrow {amount} on the credit line.', maybe: 'Pause your building projects for a month.', no: 'Carry on as you are.',
  },
  MARKET_REPORT: {
    title: 'Buy a market report',
    situation: 'A report shows roughly how much crude your rivals hold in each region. It costs {cost} and is {lag} days old.',
    yes: 'Buy the report.', maybe: '', no: 'Not now.',
  },
  FIND_DEAL: {
    title: 'Find a deal',
    situation: 'Ask the market for fixed-price deals. Offers arrive within a few days.',
    yes: 'Ask for 90-day offers.', maybe: 'Ask for 30-day offers.', no: 'Not now.',
  },
  BUYER_OFFERS_DEAL: {
    title: '{partner} wants to buy your crude',
    situation: '{partner} offers {price} a barrel for {qty} barrels a day. Today’s price is about {market}.',
    yes: 'Sign for 90 days.', maybe: 'Sign for 30 days.', no: 'Turn it down.',
  },
  PRICES_BELOW_COST: {
    title: 'Prices are below your cost',
    situation: 'For {days} days your crude has sold for less than it costs to pump. Your storage is {fill} full.',
    yes: 'Cut output to half.', maybe: 'Cut output to three quarters.', no: 'Keep pumping.',
  },
  STORAGE_NEARLY_FULL: {
    title: 'Your storage is nearly full',
    situation: 'Your tanks are {fill} full. When they are full, your wells stop.',
    yes: 'Sell the surplus at a discount.', maybe: 'Lease extra storage for a month.', no: 'Wait for buyers.',
  },
  PRICES_RECOVERED: {
    title: 'Prices have recovered',
    situation: 'Your crude has sold above cost for {days} days. You are pumping at {rate} of capacity.',
    yes: 'Go back to full output.', maybe: 'Restart half of what you cut.', no: 'Stay as you are.',
  },
  WELLS_DECLINING: {
    title: 'Your wells are running dry',
    situation: 'Your fields pump {now} barrels a day, down from {peak}. {lease} has room for {slots} more '
      + 'wells; each takes {ticks} days to drill, and not every one finds oil.',
    yes: 'Drill {steps} new wells.', maybe: 'Drill half as many.', no: 'Leave the fields as they are.',
  },
  LEASE_AUCTION: {
    title: 'Ground is coming up for auction',
    situation: '{lot} is on offer: the survey calls it {band}, with room for {slots} wells. '
      + 'Bids are sealed, everyone gets one, and the highest takes it. Nobody is told how much oil is really down there.',
    yes: 'Bid strong, {strong}.', maybe: 'Bid steady, {steady}.', no: 'Stay out of it.',
  },
  EXPORT_ROUTE_TROUBLE: {
    title: 'Trouble on your export route',
    situation: 'The {strait} is {status}. Your buyers’ cargo passes through it.',
    yes: 'Lock in {partner} for 90 days at a small discount.', maybe: 'Lock in half the volume.', no: 'Keep selling day by day.',
  },
  EXPORT_CLOSURE_RISK: {
    title: 'Your exports could be cut off',
    situation: 'The {strait} is tense, and most of your crude leaves through it. A pipeline around it has room today.',
    yes: 'Reserve {qty} barrels a day of pipeline space.', maybe: 'Reserve half as much.', no: 'Take the chance.',
  },
  EXPAND_STORAGE: {
    title: 'Expand your storage',
    situation: 'Your tanks are {fill} full. More tanks let you hold crude when prices are low; each step adds {step} barrels.',
    yes: 'Build two steps.', maybe: 'Build one step.', no: 'Not now.',
  },
  BUILD_REFINERY: {
    title: 'Build your own refinery',
    situation: 'A {capacity}-barrel-a-day refinery would turn your own crude into fuel. It takes {ticks} days to build.',
    yes: 'Build it.', maybe: '', no: 'Not now.',
  },
  SUPPLIER_OFFERS_DEAL: {
    title: '{partner} offers you crude',
    situation: '{partner} offers {qty} barrels a day at {price} a barrel. Today’s price is about {market}.',
    yes: 'Sign for 90 days.', maybe: 'Sign for 30 days.', no: 'Turn it down.',
  },
  STOCK_LOW: {
    title: 'Your crude is running low',
    situation: 'You have about {days} days of crude, counting what is on the way. If it runs out, your refinery stops.',
    yes: 'Buy crude urgently, at a premium.', maybe: 'Buy half as much and slow to three quarters.', no: 'Wait for regular deliveries.',
  },
  REFINING_LOSING: {
    title: 'Refining is losing money',
    situation: 'For {days} days, fuel has not covered the cost of crude and running the plant.',
    yes: 'Slow to half for a month.', maybe: 'Slow to three quarters for a month.', no: 'Keep running.',
  },
  MARGINS_STRONG: {
    title: 'Refining is very profitable',
    situation: 'Each barrel you refine earns about {margin}. Maintenance is due within a month.',
    yes: 'Run flat out and delay maintenance two months.', maybe: 'Run flat out for a month.', no: 'Keep to the plan.',
  },
  MAINTENANCE_DUE: {
    title: 'Maintenance is due',
    situation: 'It has been {days} days since the plant was serviced. The longer you wait, the likelier a breakdown.',
    yes: 'Shut for five days now.', maybe: 'Schedule it in two weeks.', no: 'Keep running.',
  },
  BREAKDOWN: {
    title: 'Your refinery has broken down',
    situation: 'Repairs will take about {days} days. Nothing is being refined.',
    yes: 'Pay for an emergency repair.', maybe: 'Restart half the plant while you repair.', no: 'Wait for the repair.',
  },
  CHEAP_HEAVY: {
    title: 'Heavy crude is cheap',
    situation: 'Heavy crude costs {gap} a barrel less than medium delivered to you. Your plant can refine it.',
    yes: 'Switch to heavy crude.', maybe: 'Blend in half.', no: 'Keep your usual mix.',
  },
  SUPPLY_ROUTE_TROUBLE: {
    title: 'Trouble on your supply route',
    situation: 'Your deal with {partner} ships through the {strait}, which is {status}.',
    yes: 'Move the deal to a route around it.', maybe: 'Move half the deal.', no: 'Keep the route.',
  },
  DEAL_CARGO_STUCK: {
    title: 'Your deal oil is stuck at sea',
    situation: 'Oil from {partner} has waited {days} days at a closed strait. You have already paid for it.',
    yes: 'Cancel the deal, for a fee.', maybe: 'Keep it, and buy emergency crude meanwhile.', no: 'Keep waiting.',
  },
  UPGRADE_TIER: {
    title: 'Upgrade your refinery',
    situation: 'Tier {next} can refine {grades}. The works take {ticks} days, running at reduced capacity.',
    yes: 'Upgrade.', maybe: '', no: 'Not now.',
  },
  ADD_UNIT: {
    title: 'Add a processing unit',
    situation: 'A new unit adds {capacity} barrels a day of refining. It takes {ticks} days to build.',
    yes: 'Build it.', maybe: '', no: 'Not now.',
  },
  EXPAND_TANKS: {
    title: 'Expand your crude tanks',
    situation: 'Bigger tanks let you stock up when crude is cheap. Each step adds {step} barrels.',
    yes: 'Build two steps.', maybe: 'Build one step.', no: 'Not now.',
  },
  BACK_TO_BACK: {
    title: 'A back-to-back deal',
    situation: '{producer} will sell at {buy} and {refiner} will pay {sell}. You would handle the shipping in between.',
    yes: 'Take the whole deal.', maybe: 'Take half.', no: 'Pass.',
  },
  DISTRESSED_CARGO: {
    title: 'A seller needs to unload',
    situation: '{partner}’s tanks are nearly full. Their crude is on offer cheaply.',
    yes: 'Buy it all.', maybe: 'Buy half.', no: 'Pass.',
  },
  PRICES_LOW: {
    title: 'Prices are unusually low',
    situation: '{grade} is well below its recent average. Crude bought now could sell higher later.',
    yes: 'Fill your storage.', maybe: 'Fill half.', no: 'Wait.',
  },
  PRICE_GAP: {
    title: 'A price gap has opened',
    situation: 'Crude lands in {region} for {gap} a barrel less than it sells for there.',
    yes: 'Commit capital to the gap for four weeks.', maybe: 'Commit half.', no: 'Leave it.',
  },
  POSITION_FALLING: {
    title: 'The market is moving against you',
    situation: 'The crude you hold has fallen {fall} in value.',
    yes: 'Sell your position.', maybe: 'Sell half.', no: 'Hold on.',
  },
  CRISIS_BREWING: {
    title: 'A crisis may be brewing',
    situation: 'The {strait} is tense. Crude from elsewhere may soon be in demand.',
    yes: 'Stock up away from the trouble.', maybe: 'Stock up half as much.', no: 'Wait and see.',
  },
  CARGO_STUCK: {
    title: 'Your cargo is stuck',
    situation: 'You have crude held at a closed strait for {days} days.',
    yes: 'Sell it at sea, at a discount.', maybe: 'Sell half.', no: 'Keep waiting.',
  },
  LEASE_STORAGE: {
    title: 'Lease storage',
    situation: 'Tank space is available in {region} at {rate} a barrel a day.',
    yes: 'Lease for 90 days.', maybe: 'Lease for 30 days.', no: 'Not now.',
  },
  SECOND_REFINERY: {
    title: 'Build a second refinery',
    situation: 'A {capacity}-barrel-a-day refinery in {region} would give you a second market to sell into and a second source of crude. It takes {ticks} days to build.',
    yes: 'Build it in {region}.', maybe: '', no: 'Not now.',
  },
  CHARTER_TANKER: {
    title: 'Hire a tanker',
    situation: 'A hired ship carries your crude for a daily fee instead of a charge on every barrel. A large one takes {large} barrels at {largeRate} a day, a small one {small} at {smallRate}.',
    yes: 'Hire a large tanker for 90 days.', maybe: 'Hire a small one for 30 days.', no: 'Keep paying by the barrel.',
  },
  KEEP_AFLOAT: {
    title: 'Hold your cargo at sea',
    situation: '{grade} is {fall} below its recent average, and {qty} barrels of yours are arriving on your own ship. You can leave them aboard until prices recover.',
    yes: 'Keep it at sea for a month.', maybe: 'Keep it at sea for a fortnight.', no: 'Land it and sell as usual.',
  },
  OPEN_OFFICE: {
    title: 'Open a trading office',
    situation: 'An office in {region} lets you buy and sell there. It costs {cost}, then {daily} a day.',
    yes: 'Open it.', maybe: '', no: 'Not now.',
  },
};

/** The text for a card, with its situation data filled in. */
export function cardText(type: string, data: Readonly<Record<string, string | number>>): CardText {
  const t = TEXT[type];
  if (t === undefined) throw new Error(`No text for card ${type}`);
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(data[k] ?? `{${k}}`));
  return { title: fill(t.title), situation: fill(t.situation), yes: fill(t.yes), maybe: fill(t.maybe), no: fill(t.no) };
}

/** Plain money for card text: $1.2M, $85K, $4.50. */
export function money(x: number): string {
  const a = Math.abs(x);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(1)}M` : a >= 1e4 ? `$${Math.round(a / 1e3)}K` : `$${a.toFixed(2)}`;
  return x < 0 ? `-${s}` : s;
}

/** Card types that have text (every one the catalog defines must). */
export const CARD_TEXT_TYPES: readonly string[] = Object.keys(TEXT);

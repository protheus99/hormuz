// Tankers, and what it costs to move a parcel in one (spec §7.4, D65).
//
// A lane's `freight` is what a barrel costs to carry that distance in the ordinary ship for the
// trade. What this table adds is the *other* half of the truth: the same voyage costs far more a
// barrel in a small hull than a large one, because a ship's hire is paid whether it is full or not.
// That single fact is what makes consolidation a business, and it is why a trader exists at all — a
// small refiner cannot take a whole cargo, a distant producer cannot sell less than one, and
// somebody has to stand between them and own the difference.
//
// **The rates are anchored on the General Purpose class, and the world's freight bill falls about
// a fifth. That is the answer, and it took four goes to be sure of it.**
//
// The owner's table gives a relative cost index with a VLCC at 100 and a GP at 320. Taking those
// literally would have made the typical parcel pay 3.2 times today's freight - an across-the-board
// cost rise wearing the clothes of a realism change. So the index is divided through by the GP's
// own 320: a GP parcel pays exactly what a barrel pays today, and every larger hull is cheaper.
//
// Rebasing instead so the *world* paid the same total was tried, measured, and abandoned. Most
// barrels here travel in Medium Range hulls and larger, so holding the total flat meant lifting the
// small and middle classes by about half - and a lot is 20,000 bbl, which is a Coaster, so the
// smallest tradeable parcel in the game took the worst of it. Trades stopped clearing: the §9
// invariant that no profitable pair is left unmatched failed on a one-lot counterexample, and
// producers' tanks filled early enough to break the §10.3 storage-pressure calibration.
//
// So the fall is kept. It is not a distortion to be neutralised away: the world ships in bigger
// parcels than it did, bigger parcels genuinely cost less a barrel, and freight genuinely falls by
// about 18% as a result. What matters is the differential - a parcel too small for a real ship pays
// 40% over the flat rate, a VLCC less than a third of it - and that is what a trader sells.

export interface VesselClass {
  readonly name: string;
  /** Barrels the hull holds. A parcel travels in the smallest class that fits it. */
  readonly capacity: number;
  /**
   * What a barrel pays, as a multiple of the lane's own freight. 1.00 is a General Purpose tanker,
   * which is what this world's median parcel fills, so today's cost is the reference point.
   */
  readonly rate: number;
}

/**
 * Smallest first, which is the order `vesselFor` walks. The coaster is not in the owner's table: a
 * parcel below 70,000 bbl has nothing in the real fleet to travel in, and it still has to cost
 * something, so it takes the penalty a part-loaded small ship would carry.
 */
export const VESSELS: readonly VesselClass[] = [
  { name: 'Coaster', capacity: 20_000, rate: 1.40 },
  { name: 'General Purpose', capacity: 70_000, rate: 1.00 },
  { name: 'Medium Range', capacity: 270_000, rate: 0.88 },
  { name: 'Panamax', capacity: 380_000, rate: 0.69 },
  { name: 'Aframax', capacity: 600_000, rate: 0.56 },
  { name: 'Suezmax', capacity: 850_000, rate: 0.44 },
  { name: 'VLCC', capacity: 2_000_000, rate: 0.31 },
  { name: 'ULCC', capacity: 3_000_000, rate: 0.27 },
];

const SMALLEST = VESSELS[0] as VesselClass;
const LARGEST = VESSELS[VESSELS.length - 1] as VesselClass;

/**
 * The ship a parcel of `qty` travels in: the smallest that holds it. Anything larger than the
 * largest hull goes in several of them, which costs the same a barrel, so the largest class is the
 * floor on what a barrel can be moved for.
 */
export function vesselFor(qty: number): VesselClass {
  if (qty <= 0) return SMALLEST;
  return VESSELS.find((v) => qty <= v.capacity) ?? LARGEST;
}

/** What a barrel of a parcel this size costs to move along `laneFreight` of distance. */
export const freightPerBarrel = (laneFreight: number, qty: number): number =>
  laneFreight * vesselFor(qty).rate;

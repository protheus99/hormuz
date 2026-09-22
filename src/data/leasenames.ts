// Names for ground (spec §12A.2). A block called "Block 1A" tells a player nothing and, worse, two
// companies in one region ended up with the same one. These are invented, in the way of D32: the
// geography is real, everything named on top of it is not, so none of these is a real oil field.
//
// Every name in a game is used once. `nameGround` takes the names already spoken for and returns
// the first free one, walking the list from a starting point so the same seed always names the same
// ground the same way.

export const LEASE_NAMES: readonly string[] = [
  'Coyote Ridge', 'Ironstone Flats', 'Marlin Deep', 'Whitecap Shoal', 'Redcliff Draw',
  'Saltmarsh', 'Blackthorn', 'Kestrel Bank', 'Longspur', 'Hollow Creek',
  'Amber Terrace', 'Sandpiper', 'Cinder Mesa', 'Fallow Bend', 'Greywater',
  'Harrow Point', 'Juniper Gap', 'Kingfisher', 'Lantern Rock', 'Marrowbone',
  'Nettlefield', 'Oxbow', 'Pewter Hollow', 'Quarry Head', 'Rushlight',
  'Stonecrop', 'Tallow Bar', 'Umber Reach', 'Verdigris', 'Wayfarer',
  'Yellowhammer', 'Zephyr Bank', 'Anvil Rise', 'Bracken Fold', 'Candlewick',
  'Driftwood', 'Elmshaw', 'Foxglove', 'Gannet Rock', 'Hazelmere',
  'Inkwell', 'Jackdaw', 'Kelpie Sound', 'Limekiln', 'Mudlark',
  'Northgate', 'Otterburn', 'Pitchfork', 'Quicksilver', 'Ravensworth',
  'Sparrowhawk', 'Thistledown', 'Underhill', 'Vantage', 'Windlass',
  'Wolfram', 'Yarrow', 'Ashgrove', 'Bellweather', 'Coldharbour',
  'Dunlin', 'Eastmarch', 'Fernbrake', 'Goldcrest', 'Hartsmere',
  'Ivyhold', 'Jetsam', 'Knapweed', 'Larkspur', 'Millstone',
  'Netherfield', 'Oakhanger', 'Plumbago', 'Quillon', 'Rooksnest',
];

/**
 * The first name in the list, from `from` onwards, that nobody has taken. Falls back to numbering
 * only if a game somehow outlives the list, which would take more blocks than any scenario offers.
 */
export function nameGround(used: ReadonlySet<string>, from: number): string {
  for (let i = 0; i < LEASE_NAMES.length; i++) {
    const name = LEASE_NAMES[(from + i) % LEASE_NAMES.length];
    if (name !== undefined && !used.has(name)) return name;
  }
  let n = 2;
  for (;;) {
    const name = `${LEASE_NAMES[from % LEASE_NAMES.length] ?? 'Ground'} ${n}`;
    if (!used.has(name)) return name;
    n += 1;
  }
}

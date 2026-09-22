// Names for ground (spec §12A.2). Twenty per producing region, so a block sounds like it belongs
// where it is: a North Sea block is not called the same sort of thing as one in the Bay of Campeche.
//
// Every one of these is invented, in the way of D32 — the geography is real, everything named on top
// of it is not. None is a real oil field, and the real ones were deliberately avoided: no Ghawar or
// Burgan in the Gulf, no Brent or Ekofisk in the North Sea, no Lula or Marlim off Brazil, no Tengiz
// or Kashagan in the Caspian. Where a real field took an obvious local word, the word was left
// alone: Brazil's fields are named after fish, so these are named after everything but.
//
// Every name in a game is used once. `nameGround` takes the names already spoken for and returns the
// first free one from that region's list, walking it from a starting point so the same seed always
// names the same ground the same way.

import type { RegionName } from './regions';

export const FIELD_NAMES: Readonly<Partial<Record<RegionName, readonly string[]>>> = {
  US_Permian: [
    'Sandhill Draw', 'Antelope Mesa', 'Bitterwater', 'Cholla Flats', 'Dead Horse Rim',
    'Escondido Draw', 'Flat Rock', 'Greasewood', 'Hackberry Wash', 'Indigo Wells',
    'Javelina Flats', 'Kiowa Rim', 'Lobo Draw', 'Mescal Flats', 'Nopal Ridge',
    'Ocotillo Wash', 'Piñon Rim', 'Quail Draw', 'Rattlesnake Butte', 'Saddleback Wash',
  ],
  US_Gulf_Coast: [
    'Cypress Point', 'Driftnet Deep', 'Egret Pass', 'Fiddler Bank', 'Gulfrose Deep',
    'Heron Pass', 'Ibis Shoal', 'Jetty Bend', 'Kingfish Deep', 'Longboat Shoal',
    'Mudhole Deep', 'Oyster Pass', 'Pelican Shoal', 'Redfish Bend', 'Saltgrass Deep',
    'Tarpon Bank', 'Verdant Deep', 'Windward Pass', 'Yaupon Shoal', 'Anchor Bend',
  ],
  Western_Canada: [
    'Beaver Lodge', 'Birchbark', 'Cold Coulee', 'Deerfoot Flats', 'Elk Ridge',
    'Frostline', 'Grizzly Coulee', 'Hoarfrost', 'Icefield Flats', 'Jackrabbit Flats',
    'Kettle Coulee', 'Lodestone Flats', 'Muskeg Bend', 'Nightwater', 'Owl River',
    'Poplar Coulee', 'Quillfeather', 'Redstone Coulee', 'Snowshoe Flats', 'Timberline Bend',
  ],
  Mexico_Gulf: [
    'Arrecife Hondo', 'Bahía Clara', 'Cayo Negro', 'Delfín Sur', 'Esmeralda Honda',
    'Farallón', 'Gaviota Norte', 'Huracán Bajo', 'Isla Verde', 'Jaiba Honda',
    'Laguna Azul', 'Manglar Sur', 'Nube Baja', 'Olas Altas', 'Palmar Hondo',
    'Quebrada Sur', 'Roca Blanca', 'Salina Honda', 'Tortuga Norte', 'Ventana Sur',
  ],
  Venezuela_Orinoco: [
    'Arena Parda', 'Bosque Bajo', 'Caño Hondo', 'Diamante Sur', 'El Palmar',
    'Fango Negro', 'Guacamaya', 'Hato Viejo', 'Isla Larga', 'Jabillo',
    'Llano Ancho', 'Morichito', 'Negra Vieja', 'Orquídea', 'Palo Seco',
    'Quebrada Honda', 'Roble Alto', 'Sabana Larga', 'Turpial', 'Verano Seco',
  ],
  Colombia_Andean: [
    'Alto Verde', 'Buenavista Sur', 'Cóndor Alto', 'Duraznal', 'El Filo',
    'Fraile Alto', 'Guayacán', 'Hormiga Sur', 'Iguana Alta', 'Jagüey',
    'Lomalta', 'Manantial', 'Nogal Alto', 'Ocaso Sur', 'Piedra Alta',
    'Quinal', 'Retiro Alto', 'Sauce Hondo', 'Trigal', 'Vereda Honda',
  ],
  Guyana_Suriname: [
    'Amberwater', 'Blackwater Deep', 'Caiman Deep', 'Driftline', 'Emerald Shelf',
    'Fireleaf', 'Greenheart Deep', 'Harpy Deep', 'Ironwood Shelf', 'Jaguarundi',
    'Kiskadee Deep', 'Liana Deep', 'Macaw Shelf', 'Nightjar Deep', 'Orchid Shelf',
    'Palmwater', 'Quartzline', 'Rainbird Deep', 'Silverwater', 'Toucan Deep',
  ],
  Brazil_Presalt: [
    'Araçá Fundo', 'Azulão Fundo', 'Brisa Funda', 'Coral Fundo', 'Duna Funda',
    'Enseada Funda', 'Farol Azul', 'Gaivota Funda', 'Horizonte Fundo', 'Ilha Funda',
    'Jangada Funda', 'Lagoa Funda', 'Maré Funda', 'Névoa Funda', 'Onda Funda',
    'Pérola Funda', 'Quaresma', 'Recife Fundo', 'Sereia Funda', 'Ubá Fundo',
  ],
  Argentina_Vaca_Muerta: [
    'Bajo Frío', 'Cañadón Gris', 'Cerro Pampa', 'Chacay Alto', 'Duraznillo',
    'El Alamito', 'Frontera Sur', 'Guanaco Alto', 'Huincul Bajo', 'Jarilla Alta',
    'Lenga Alta', 'Meseta Gris', 'Ñire Alto', 'Ojo de Agua', 'Pampa Alta',
    'Quimey Alto', 'Rincón Gris', 'Sauzal Alto', 'Tehuel Bajo', 'Vientos Altos',
  ],
  North_Sea: [
    'Bergfast', 'Corriebank', 'Draumen', 'Dunskerry', 'Fjellvik',
    'Grindhav', 'Havbris', 'Isbjørn', 'Jotunbanken', 'Kilbrae',
    'Kvitskjer', 'Lochryn', 'Lundhav', 'Myrvik', 'Nordvind',
    'Ormstad', 'Rimfrost', 'Saltskjer', 'Stormvik', 'Vindskjer',
  ],
  Russia_West: [
    'Beloozero', 'Chernoles', 'Dubrava', 'Glinka', 'Izumrud',
    'Kamenka', 'Krutoyar', 'Lesnoye', 'Medvezhka', 'Nizhnye Klyuchi',
    'Olkhovka', 'Polyana', 'Rudnoye', 'Sosnovka', 'Tikhoye Pole',
    'Uralets', 'Verkhovye', 'Yasnoye', 'Zarechye', 'Zhuravli',
  ],
  Russia_Far_East: [
    'Amurskoye', 'Bereg Vostok', 'Buran', 'Chaika More', 'Dalny Mys',
    'Elnya', 'Gornaya', 'Kedrovoye', 'Ledyanoye', 'Mysovoye',
    'Nerpa', 'Okean Sever', 'Primorye Deep', 'Rybachy', 'Sopka',
    'Taiga Vostok', 'Ussuri Deep', 'Vetrovoye', 'Yantarnoye', 'Zimnik',
  ],
  Caspian: [
    'Aktash', 'Altyn Deniz', 'Balykli', 'Darya Deep', 'Gunesh Bank',
    'Hazar Deep', 'Ismail Bank', 'Jeyran', 'Kumsal', 'Kyzylkum Deep',
    'Mangy Bank', 'Nurly Deep', 'Oryol Bank', 'Qumlu', 'Sarybas',
    'Sholpan', 'Tolkyn Deep', 'Ulan Deep', 'Yashma Bank', 'Zhelezny Bank',
  ],
  North_Africa: [
    'Adrar Halim', 'Bir Anwar', 'Bir Mezrag', 'Draa Sidi', 'Erg Fannar',
    'Ghar Nadir', 'Hamada Zahra', 'Jebel Nafis', 'Kef Sahel', 'Marsa Nadir',
    'Nefud Ghali', 'Oued Salim', 'Ouled Nour', 'Qasr Fannar', 'Rimal Zahir',
    'Sebkha Nour', 'Tassili Nour', 'Tinghir Sud', 'Wadi Halim', 'Zahra Sud',
  ],
  West_Africa: [
    'Abeti Deep', 'Adiaba Deep', 'Bight Reach', 'Calabash Deep', 'Delta Reach',
    'Ebube Deep', 'Fula Bank', 'Gbara Deep', 'Harmattan Deep', 'Ikoro Deep',
    'Kanem Deep', 'Lagoon Reach', 'Mangrove Reach', 'Ndele Deep', 'Olokun Deep',
    'Palm Reach', 'Sahel Bank', 'Tidewater Deep', 'Ubara Deep', 'Wari Deep',
  ],
  Middle_East: [
    'Al Fanar', 'Al Hadid', 'Bahr Zahir', 'Dar Nasib', 'Falak',
    'Ghayth', 'Hamad Bank', 'Jabal Nur', 'Khalij Zahir', 'Layla Deep',
    'Madar', 'Nakhla', 'Qamar Bank', 'Rasheed', 'Sabkha Nur',
    'Tariq Bank', 'Umm Rashid', 'Wadi Salim', 'Yasmin Bank', 'Zahra Bank',
  ],
  Gulf_of_Oman: [
    'Al Khaleej Deep', 'Bahr Salim', 'Bandar Zahir', 'Corniche Deep', 'Falaj Bank',
    'Ghubra Deep', 'Halwan Deep', 'Jebel Sahil', 'Khor Nadir', 'Layan Bank',
    'Meqdad Deep', 'Nazar Bank', 'Ophir Deep', 'Qamra Bank', 'Ras Halim',
    'Sahil Nadir', 'Talib Deep', 'Umm Nasir', 'Warda Bank', 'Zahir Deep',
  ],
  Southeast_Asia: [
    'Anggerik Deep', 'Bakau Deep', 'Cendana Deep', 'Dalam Bank', 'Enggang Deep',
    'Gelombang', 'Hutan Deep', 'Irama Deep', 'Jelapang', 'Kemuning Deep',
    'Lembah Deep', 'Merbau Deep', 'Nusa Deep', 'Ombak Deep', 'Pinang Deep',
    'Rimba Deep', 'Selat Deep', 'Teluk Deep', 'Ulek Deep', 'Waringin Deep',
  ],
};

/** For ground anywhere without a list of its own, and for a region that runs out. */
export const LEASE_NAMES: readonly string[] = [
  'Coyote Ridge', 'Ironstone Flats', 'Marlin Deep', 'Whitecap Shoal', 'Redcliff Draw',
  'Saltmarsh', 'Blackthorn', 'Kestrel Bank', 'Longspur', 'Hollow Creek',
  'Amber Terrace', 'Sandpiper', 'Cinder Mesa', 'Fallow Bend', 'Greywater',
  'Harrow Point', 'Juniper Gap', 'Lantern Rock', 'Marrowbone', 'Nettlefield',
];

/**
 * The first name for this region, from `from` onwards, that nobody has taken. Falls back to the
 * shared list, and then to numbering, which would take more blocks than any scenario offers.
 */
export function nameGround(used: ReadonlySet<string>, from: number, region?: RegionName): string {
  for (const pool of [region === undefined ? undefined : FIELD_NAMES[region], LEASE_NAMES]) {
    if (pool === undefined || pool.length === 0) continue;
    for (let i = 0; i < pool.length; i++) {
      const name = pool[(from + i) % pool.length];
      if (name !== undefined && !used.has(name)) return name;
    }
  }
  const base = (region === undefined ? undefined : FIELD_NAMES[region]?.[0]) ?? LEASE_NAMES[0] ?? 'Ground';
  let n = 2;
  for (;;) {
    const name = `${base} ${n}`;
    if (!used.has(name)) return name;
    n += 1;
  }
}

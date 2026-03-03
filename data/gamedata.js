const GAME_SHIPS = [
  //                                                                                                                                        shield  shield_regen
  { name:'Rustrunner Shuttle',   tier:1, cargo:20,  hull:60,  speed:5,  turn_rate:8,  inertia:2,  weapon_slots:1, upgrade_slots:1, price:1000,   fuel_capacity:6,  hull_mass_t:80,   shield:30,  shield_regen:4  },
  { name:'Cinder Scout',         tier:1, cargo:25,  hull:55,  speed:6,  turn_rate:9,  inertia:2,  weapon_slots:1, upgrade_slots:2, price:3000,   fuel_capacity:6,  hull_mass_t:75,   shield:35,  shield_regen:5  },
  { name:'Mercury Courier',      tier:2, cargo:35,  hull:70,  speed:7,  turn_rate:8,  inertia:3,  weapon_slots:1, upgrade_slots:2, price:7000,   fuel_capacity:8,  hull_mass_t:140,  shield:50,  shield_regen:5  },
  { name:'Atlas Freighter',      tier:2, cargo:60,  hull:90,  speed:4,  turn_rate:5,  inertia:5,  weapon_slots:2, upgrade_slots:2, price:12000,  fuel_capacity:8,  hull_mass_t:220,  shield:55,  shield_regen:5  },
  { name:'Drake Raider',         tier:2, cargo:30,  hull:85,  speed:7,  turn_rate:7,  inertia:3,  weapon_slots:2, upgrade_slots:2, price:14000,  fuel_capacity:8,  hull_mass_t:130,  shield:60,  shield_regen:6  },
  { name:'Nova Trader',          tier:3, cargo:80,  hull:110, speed:4,  turn_rate:5,  inertia:6,  weapon_slots:2, upgrade_slots:3, price:25000,  fuel_capacity:10, hull_mass_t:310,  shield:80,  shield_regen:7  },
  { name:'Falcon Interceptor',   tier:3, cargo:35,  hull:95,  speed:9,  turn_rate:10, inertia:3,  weapon_slots:3, upgrade_slots:2, price:30000,  fuel_capacity:10, hull_mass_t:200,  shield:90,  shield_regen:8  },
  { name:'Orion Gunship',        tier:3, cargo:45,  hull:130, speed:6,  turn_rate:6,  inertia:4,  weapon_slots:3, upgrade_slots:3, price:42000,  fuel_capacity:10, hull_mass_t:360,  shield:100, shield_regen:8  },
  { name:'Titan Hauler',         tier:4, cargo:120, hull:160, speed:3,  turn_rate:4,  inertia:8,  weapon_slots:2, upgrade_slots:4, price:65000,  fuel_capacity:12, hull_mass_t:520,  shield:120, shield_regen:9  },
  { name:'Viper Strikecraft',    tier:4, cargo:40,  hull:140, speed:10, turn_rate:10, inertia:3,  weapon_slots:4, upgrade_slots:3, price:70000,  fuel_capacity:12, hull_mass_t:260,  shield:130, shield_regen:10 },
  { name:'Sentinel Frigate',     tier:4, cargo:90,  hull:180, speed:5,  turn_rate:5,  inertia:6,  weapon_slots:4, upgrade_slots:4, price:90000,  fuel_capacity:12, hull_mass_t:480,  shield:150, shield_regen:10 },
  { name:'Leviathan Freighter',  tier:5, cargo:200, hull:220, speed:2,  turn_rate:3,  inertia:10, weapon_slots:3, upgrade_slots:5, price:150000, fuel_capacity:14, hull_mass_t:950,  shield:180, shield_regen:12 },
  { name:'Phantom Stealth',      tier:5, cargo:50,  hull:170, speed:9,  turn_rate:9,  inertia:4,  weapon_slots:4, upgrade_slots:4, price:180000, fuel_capacity:14, hull_mass_t:280,  shield:190, shield_regen:13 },
  { name:'Aegis Destroyer',      tier:5, cargo:100, hull:260, speed:6,  turn_rate:5,  inertia:7,  weapon_slots:5, upgrade_slots:5, price:220000, fuel_capacity:14, hull_mass_t:740,  shield:220, shield_regen:14 },
  { name:'Celestial Dreadnought',tier:6, cargo:150, hull:350, speed:4,  turn_rate:4,  inertia:9,  weapon_slots:6, upgrade_slots:6, price:350000, fuel_capacity:16, hull_mass_t:1900, shield:300, shield_regen:18 },
  { name:'Matts Ship',           tier:7, cargo:500, hull:9999,speed:15, turn_rate:10, inertia:9,  weapon_slots:50,upgrade_slots:50,price:500000, fuel_capacity:16, hull_mass_t:50,   shield:9999,shield_regen:500}
]

const GAME_COMMODITIES = [
  { id:'food',        label:'Food',        base_price:10,  volatility:0.20, mass_t:0.8 },
  { id:'water',       label:'Water',       base_price:8,   volatility:0.15, mass_t:1.2 },
  { id:'ore',         label:'Ore',         base_price:20,  volatility:0.30, mass_t:2.0 },
  { id:'fuel',        label:'Fuel',        base_price:35,  volatility:0.25, mass_t:1.2 },
  { id:'electronics', label:'Electronics', base_price:80,  volatility:0.40, mass_t:0.3 },
  { id:'medicine',    label:'Medicine',    base_price:120, volatility:0.35, mass_t:0.3 },
  { id:'machinery',   label:'Machinery',   base_price:70,  volatility:0.30, mass_t:1.5 },
  { id:'luxuries',    label:'Luxuries',    base_price:250, volatility:0.50, mass_t:0.2 },
  { id:'contraband',  label:'Contraband',  base_price:380, volatility:0.65, mass_t:0.4, illegal:true },
  { id:'weapons',     label:'Weapons',     base_price:220, volatility:0.50, mass_t:0.8, illegal:true }
]

const GAME_FACTIONS = [
  { name:'Galactic Traders Guild', type:'trade',      color:'#4488ff' },
  { name:'Outer Rim Pirates',      type:'pirate',     color:'#ff4444' },
  { name:'Federation Navy',        type:'military',   color:'#44dd88' },
  { name:'Independent Miners',     type:'industrial', color:'#ff8844' }
]

const GAME_EVENTS = [
  { name:'Supernova Warning',  effect:'system_unreachable',    duration:5  },
  { name:'Trade Boom',         effect:'commodity_prices_up',   duration:10 },
  { name:'Pirate Invasion',    effect:'combat_frequency_high', duration:8  },
  { name:'Mining Rush',        effect:'ore_prices_drop',       duration:12 },
  { name:'Fuel Shortage',      effect:'fuel_prices_up',        duration:10 },
  { name:'Faction War',        effect:'faction_war',           duration:12 },
  { name:'Plague Outbreak',    effect:'plague_outbreak',       duration:10 },
  { name:'Gold Rush',          effect:'gold_rush',             duration:8  }
]

const GAME_UPGRADES = [
  // ── Ship Upgrades ────────────────────────────────────────────────────────────
  { tab:'ship',    name:'Cargo Expansion',           desc:'Add an extra cargo pod to the hull.',                                                   effect:'cargo',           delta:20,    price:5000,  limit:0, usesUpgradeSlot:true,  usesWeaponSlot:false },
  { tab:'ship',    name:'Cargo Converter',           desc:'Sacrifice 10 cargo space to free one extra upgrade slot.',                              effect:'cargo_converter', delta:-10,   price:8000,  limit:1, usesUpgradeSlot:false, usesWeaponSlot:false },
  { tab:'ship',    name:'Improved Thrusters',        desc:'+1 Speed. Max 4.',                                                                      effect:'speed',           delta:1,     price:8000,  limit:4, usesUpgradeSlot:true,  usesWeaponSlot:false },
  { tab:'ship',    name:'Advanced Maneuvering Jets', desc:'+1 Turn Rate. Max 4.',                                                                  effect:'turn_rate',       delta:1,     price:7000,  limit:4, usesUpgradeSlot:true,  usesWeaponSlot:false },
  { tab:'ship',    name:'Inertia Dampeners',         desc:'-1 Inertia (min 1). Max 4.',                                                            effect:'inertia',         delta:-1,    price:6000,  limit:4, usesUpgradeSlot:true,  usesWeaponSlot:false },
  { tab:'ship',    name:'Long-range Scanner',        desc:'Reveals nearby systems when jumping.',                                                  effect:'scanner_radius',  delta:2,     price:15000, limit:1, usesUpgradeSlot:true,  usesWeaponSlot:false },
  { tab:'ship',    name:'Fuel Efficiency Module',    desc:'-20% jump fuel cost. Max 4.',                                                           effect:'jump_cost',       delta:-0.20, price:9000,  limit:4, usesUpgradeSlot:true,  usesWeaponSlot:false },
  { tab:'ship',    name:'Auto Refueler',             desc:'Auto top-up fuel on landing (10% discount).',                                           effect:'auto_refuel',     delta:0,     price:11000, limit:1, usesUpgradeSlot:true,  usesWeaponSlot:false },
  { tab:'ship',    name:'Ramscoop',                  desc:'Harvests hydrogen from space. Slowly regenerates fuel in flight.',                      effect:'ramscoop',        delta:0,     price:13000, limit:1, usesUpgradeSlot:true,  usesWeaponSlot:false },
  { tab:'ship',    name:'Afterburner',               desc:'Hold Boost for a sustained 5-second burn instead of a 3-second burst.',                 effect:'afterburner',     delta:0,     price:20000, limit:1, usesUpgradeSlot:true,  usesWeaponSlot:false },
  // ── Weapons ──────────────────────────────────────────────────────────────────
  { tab:'weapons', name:'Targeting Computer',        desc:'+10% weapon damage. Unique.',                                                           effect:'damage_pct',      delta:0.10,  price:12000, limit:1, usesUpgradeSlot:true,  usesWeaponSlot:false },
  { tab:'weapons', name:'Proton Cannon',             desc:'Heavy beam — 6× damage, 3× slower fire rate. Replaces a Laser Cannon slot.',            effect:'proton_cannon',   delta:0,     price:20000, limit:0, usesUpgradeSlot:false, usesWeaponSlot:true  },
  { tab:'weapons', name:'Missile Launcher',          desc:'Fires guided/standard missiles (X key). Uses 1 weapon slot + 1 upgrade slot. Max 2.',   effect:'missile_launcher',delta:0,     price:18000, limit:2, usesUpgradeSlot:true,  usesWeaponSlot:true  },
  { tab:'weapons', name:'Rocket Launcher',           desc:'Fires unguided rockets (X key). Uses 1 upgrade slot (not a weapon slot). Max 1.',     effect:'rocket_launcher', delta:0,     price:25000, limit:1, usesUpgradeSlot:true,  usesWeaponSlot:false },
  { tab:'weapons', name:'Special Weapon Launcher',   desc:'Fires EMP & Nova warheads (X key). Uses 1 weapon slot + 1 upgrade slot + 10 cargo.',   effect:'special_launcher',delta:0,     price:35000, limit:1, usesUpgradeSlot:true,  usesWeaponSlot:true  },
  // Ammo (no slot cost, requires parent launcher)
  { tab:'weapons', name:'Homing Missiles ×5',        desc:'Guided warheads that track the nearest enemy.',                                         effect:'ammo', ammoType:'homing_missile',   delta:5, price:1500, limit:0, usesUpgradeSlot:false, usesWeaponSlot:false, requiresUpgrade:'Missile Launcher'          },
  { tab:'weapons', name:'Standard Missiles ×5',      desc:'Fast straight-line warheads.',                                                          effect:'ammo', ammoType:'standard_missile', delta:5, price:800,  limit:0, usesUpgradeSlot:false, usesWeaponSlot:false, requiresUpgrade:'Missile Launcher'          },
  { tab:'weapons', name:'Javelin Rockets ×5',        desc:'Fast unguided rockets with moderate damage.',                                           effect:'ammo', ammoType:'javelin',          delta:5, price:1200, limit:0, usesUpgradeSlot:false, usesWeaponSlot:false, requiresUpgrade:'Rocket Launcher'           },
  { tab:'weapons', name:'Standard Rockets ×5',       desc:'General-purpose unguided rockets.',                                                     effect:'ammo', ammoType:'standard_rocket',  delta:5, price:1000, limit:0, usesUpgradeSlot:false, usesWeaponSlot:false, requiresUpgrade:'Rocket Launcher'           },
  { tab:'weapons', name:'Cluster Rockets ×5',        desc:'Explode into multiple fragments on impact.',                                            effect:'ammo', ammoType:'cluster_rocket',   delta:5, price:2000, limit:0, usesUpgradeSlot:false, usesWeaponSlot:false, requiresUpgrade:'Rocket Launcher'           },
  { tab:'weapons', name:'Heavy Rockets ×5',          desc:'Slow but devastating impact damage.',                                                   effect:'ammo', ammoType:'heavy_rocket',     delta:5, price:2500, limit:0, usesUpgradeSlot:false, usesWeaponSlot:false, requiresUpgrade:'Rocket Launcher'           },
  { tab:'weapons', name:'EMP Rounds ×5',             desc:'Disrupt enemy shields and systems.',                                                    effect:'ammo', ammoType:'emp_round',        delta:5, price:3000, limit:0, usesUpgradeSlot:false, usesWeaponSlot:false, requiresUpgrade:'Special Weapon Launcher'   },
  { tab:'weapons', name:'Nova Rounds ×5',            desc:'Massive area-effect detonation warheads.',                                              effect:'ammo', ammoType:'nova_round',       delta:5, price:4000, limit:0, usesUpgradeSlot:false, usesWeaponSlot:false, requiresUpgrade:'Special Weapon Launcher'   },
  // ── Defence ──────────────────────────────────────────────────────────────────
  { tab:'defence', name:'Shield Generator',          desc:'+3 Shield regen/s. Unique.',                                                            effect:'shield_regen',    delta:3,     price:10000, limit:1, usesUpgradeSlot:true,  usesWeaponSlot:false },
  { tab:'defence', name:'Armaplast Plating',         desc:'+30 Armour. Costs 5 cargo space. Stackable.',                                          effect:'armaplast',       delta:30,    price:8000,  limit:0, usesUpgradeSlot:true,  usesWeaponSlot:false, armourMass:5  },
  { tab:'defence', name:'Durasteel Plating',         desc:'+80 Armour. Costs 20 cargo space. Stackable.',                                         effect:'durasteel',       delta:80,    price:18000, limit:0, usesUpgradeSlot:true,  usesWeaponSlot:false, armourMass:20 }
]

// Weighted: agricultural 25%, mining 20%, industrial 15%, trade_hub 12%, military 13%, frontier 15%
const PLANET_TYPES = [
  'agricultural', 'agricultural', 'agricultural', 'agricultural', 'agricultural',
  'mining',       'mining',       'mining',       'mining',
  'industrial',   'industrial',   'industrial',
  'trade_hub',    'trade_hub',    'trade_hub',
  'military',     'military',     'military',
  'frontier',     'frontier',     'frontier'
]

const SYSTEM_NAMES = [
  'Solara',      'Dravos',       'Kepleron',    'Zentari',     'Helion',
  'Arcadia',     'Tyr',          'Nexus',       'Orionis',     'Pyros',
  'Icarus',      'Velorum',      'Xandar',      'Aquila',      'Rhea',
  'Nova Reach',  'Eos',          'Altair',      'Borealis',    'Gamma Verge',
  'Cassian',     'Valdros',      'Erebus',      'Sython',      'Korrath',
  'Velius',      'Miren',        'Theron',      'Calyx',       'Dusk Gate',
  'Ferron',      'Ashveil',      'Noctis',      'Draeven',     'Solan Drift',
  'Krath',       'Veltara',      'Zebulon',     'Halos',       'Crux Minor',
  'Thyris',      'Ombra',        'Selvon',      'Caldera',     'Ashen Reach',
  'Vorrak',      'Elyndra',      'Strix',       'Kandor',      'Phavos',
  'Ultan',       'Dawnspire',    'Mirova',      'Scythe Point','Ixion',
  'Talvos',      'Caelum',       'Braxis',      'Nyxara',      'Delphon',
  'Orrery',      'Sarkon',       'Crestfall',   'Ireth',       'Magnara',
  'Thornveil',   'Pellux',       'Skarris',     'Vaunt',       'Echion',
  'Aurum Gate',  'Draxis',       'Solvane',     'Karroth',     'Pelthos',
  'Umbris',      'Rivath',       'Zephyr Cross','Mordas',      'Telion',
  'Arctus',      'Drevon',       'Sanctum',     'Halo Verge',  'Calix Prime',
  'Ironreach',   'Lyran',        'Velanthos',   'Scarn',       'Pyrex',
  'Novan',       'Kelthon',      'Aldran',      'Volken',      'Styx Reach',
  'Celdara',     'Embrak',       'Tornan',      'Vox Prime',   'Aethon'
]

const GAME_SHIPS = [
  { name:'Rustrunner Shuttle',   tier:1, cargo:20,  hull:60,  speed:5,  turn_rate:8,  inertia:2,  weapon_slots:1, upgrade_slots:1, price:1000,   fuel_capacity:6  },
  { name:'Cinder Scout',         tier:1, cargo:25,  hull:55,  speed:6,  turn_rate:9,  inertia:2,  weapon_slots:1, upgrade_slots:2, price:3000,   fuel_capacity:6  },
  { name:'Mercury Courier',      tier:2, cargo:35,  hull:70,  speed:7,  turn_rate:8,  inertia:3,  weapon_slots:1, upgrade_slots:2, price:7000,   fuel_capacity:8  },
  { name:'Atlas Freighter',      tier:2, cargo:60,  hull:90,  speed:4,  turn_rate:5,  inertia:5,  weapon_slots:2, upgrade_slots:2, price:12000,  fuel_capacity:8  },
  { name:'Drake Raider',         tier:2, cargo:30,  hull:85,  speed:7,  turn_rate:7,  inertia:3,  weapon_slots:2, upgrade_slots:2, price:14000,  fuel_capacity:8  },
  { name:'Nova Trader',          tier:3, cargo:80,  hull:110, speed:4,  turn_rate:5,  inertia:6,  weapon_slots:2, upgrade_slots:3, price:25000,  fuel_capacity:10 },
  { name:'Falcon Interceptor',   tier:3, cargo:35,  hull:95,  speed:9,  turn_rate:10, inertia:3,  weapon_slots:3, upgrade_slots:2, price:30000,  fuel_capacity:10 },
  { name:'Orion Gunship',        tier:3, cargo:45,  hull:130, speed:6,  turn_rate:6,  inertia:4,  weapon_slots:3, upgrade_slots:3, price:42000,  fuel_capacity:10 },
  { name:'Titan Hauler',         tier:4, cargo:120, hull:160, speed:3,  turn_rate:4,  inertia:8,  weapon_slots:2, upgrade_slots:4, price:65000,  fuel_capacity:12 },
  { name:'Viper Strikecraft',    tier:4, cargo:40,  hull:140, speed:10, turn_rate:10, inertia:3,  weapon_slots:4, upgrade_slots:3, price:70000,  fuel_capacity:12 },
  { name:'Sentinel Frigate',     tier:4, cargo:90,  hull:180, speed:5,  turn_rate:5,  inertia:6,  weapon_slots:4, upgrade_slots:4, price:90000,  fuel_capacity:12 },
  { name:'Leviathan Freighter',  tier:5, cargo:200, hull:220, speed:2,  turn_rate:3,  inertia:10, weapon_slots:3, upgrade_slots:5, price:150000, fuel_capacity:14 },
  { name:'Phantom Stealth',      tier:5, cargo:50,  hull:170, speed:9,  turn_rate:9,  inertia:4,  weapon_slots:4, upgrade_slots:4, price:180000, fuel_capacity:14 },
  { name:'Aegis Destroyer',      tier:5, cargo:100, hull:260, speed:6,  turn_rate:5,  inertia:7,  weapon_slots:5, upgrade_slots:5, price:220000, fuel_capacity:14 },
  { name:'Celestial Dreadnought',tier:6, cargo:150, hull:350, speed:4,  turn_rate:4,  inertia:9,  weapon_slots:6, upgrade_slots:6, price:350000, fuel_capacity:16 }
]

const GAME_COMMODITIES = [
  { id:'food',        label:'Food',        base_price:10,  volatility:0.20 },
  { id:'water',       label:'Water',       base_price:8,   volatility:0.15 },
  { id:'ore',         label:'Ore',         base_price:20,  volatility:0.30 },
  { id:'fuel',        label:'Fuel',        base_price:35,  volatility:0.25 },
  { id:'electronics', label:'Electronics', base_price:80,  volatility:0.40 },
  { id:'medicine',    label:'Medicine',    base_price:120, volatility:0.35 },
  { id:'machinery',   label:'Machinery',   base_price:70,  volatility:0.30 },
  { id:'luxuries',    label:'Luxuries',    base_price:250, volatility:0.50 },
  { id:'contraband',  label:'Contraband',  base_price:380, volatility:0.65, illegal:true },
  { id:'weapons',     label:'Weapons',     base_price:220, volatility:0.50, illegal:true }
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
  { name:'Fuel Shortage',      effect:'fuel_prices_up',        duration:10 }
]

const GAME_UPGRADES = [
  { name:'Cargo Expansion',           effect:'cargo',          delta:20,   price:5000  },
  { name:'Improved Thrusters',        effect:'speed',          delta:1,    price:8000  },
  { name:'Advanced Maneuvering Jets', effect:'turn_rate',      delta:1,    price:7000  },
  { name:'Inertia Dampeners',         effect:'inertia',        delta:-1,   price:6000  },
  { name:'Shield Generator',          effect:'hull',           delta:50,   price:10000 },
  { name:'Targeting Computer',        effect:'damage_pct',     delta:0.10, price:12000 },
  { name:'Fuel Efficiency Module',    effect:'jump_cost',      delta:-0.20,price:9000  },
  { name:'Long-range Scanner',        effect:'scanner_radius', delta:2,    price:15000 },
  { name:'Auto Refueler',             effect:'auto_refuel',    delta:0,    price:11000 }
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

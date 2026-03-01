// Per planet type: which commodities are surplus (cheap) and which are in deficit (expensive)
const PLANET_ECONOMY = {
  agricultural: { surplus: ['food', 'water'],              deficit: ['electronics', 'machinery', 'medicine']    },
  mining:       { surplus: ['ore', 'fuel'],                deficit: ['food', 'water', 'electronics', 'medicine'] },
  industrial:   { surplus: ['machinery', 'electronics'],   deficit: ['ore', 'fuel', 'food']                      },
  trade_hub:    { surplus: [],                             deficit: []                                           },
  military:     { surplus: ['medicine'],                   deficit: ['fuel', 'machinery', 'ore']                 },
  frontier:     { surplus: [],                             deficit: ['food', 'water', 'fuel', 'medicine']        }
}

const PLANET_TYPE_LABELS = {
  agricultural: 'Agricultural',
  mining:       'Mining',
  industrial:   'Industrial',
  trade_hub:    'Trade Hub',
  military:     'Military',
  frontier:     'Frontier'
}

// Returns { commodityId: { buy, sell } } for this planet.
// Markets regenerate per visit; Phase 7 (NPC traders) will make them persistent.
function generatePlanetMarket(planet) {
  const econ = PLANET_ECONOMY[planet.type] || PLANET_ECONOMY.trade_hub
  const market = {}

  for (const c of GAME_COMMODITIES) {
    if (c.illegal) continue  // illegal goods only appear in black markets
    const isSurplus = econ.surplus.includes(c.id)
    const isDeficit = econ.deficit.includes(c.id)

    // Availability: trade hubs stock everything; other types skip ~35% of neutral commodities
    if (!isSurplus && !isDeficit && planet.type !== 'trade_hub') {
      if (Math.random() > 0.65) continue
    }

    let supplyMod, demandMod
    if (isSurplus) {
      supplyMod = 1.40 + Math.random() * 0.40  // high supply → cheap to buy
      demandMod = 0.55 + Math.random() * 0.30
    } else if (isDeficit) {
      supplyMod = 0.45 + Math.random() * 0.30  // low supply → expensive
      demandMod = 1.20 + Math.random() * 0.40
    } else {
      supplyMod = 0.90 + Math.random() * 0.20  // near-neutral
      demandMod = 0.90 + Math.random() * 0.20
    }

    const randomFactor = 1 + (Math.random() * c.volatility * 2 - c.volatility)

    // Faction price modifier
    const ftype = GAME_FACTIONS.find(f => f.name === planet.faction)?.type
    const FACTION_MOD = { trade: 0.92, military: 1.10, industrial: 0.95 }
    const factionMod = FACTION_MOD[ftype] ?? 1.0

    const buyPrice = Math.max(1, Math.round(c.base_price * supplyMod * demandMod * randomFactor * factionMod))

    market[c.id] = {
      buy:  buyPrice,
      sell: Math.round(buyPrice * 0.88)  // 12% market spread
    }
  }

  return market
}

function buyCommodity(player, commodity, price) {
  const cargoUsed = Object.values(player.cargo).reduce((sum, n) => sum + n, 0)
  if (player.credits < price) return false
  if (cargoUsed >= player.ship.cargo) return false
  player.credits -= price
  player.cargo[commodity] = (player.cargo[commodity] || 0) + 1
  return true
}

function sellCommodity(player, commodity, price) {
  if (!player.cargo[commodity]) return false
  player.credits += price
  player.cargo[commodity]--
  if (player.cargo[commodity] === 0) delete player.cargo[commodity]
  return true
}

// Nudge a commodity's price in a market by ±6% (direction: +1 = buying, -1 = selling).
// Clamped to [30%, 300%] of base price; sell is always buy × 0.88.
function applyPricePressure(market, commodityId, direction) {
  if (!market[commodityId]) return
  const c = GAME_COMMODITIES.find(x => x.id === commodityId)
  if (!c) return
  const entry  = market[commodityId]
  const factor = direction > 0 ? 1.06 : 0.94
  const min    = Math.round(c.base_price * 0.30)
  const max    = Math.round(c.base_price * 3.00)
  entry.buy    = Math.max(min, Math.min(max, Math.round(entry.buy * factor)))
  entry.sell   = Math.round(entry.buy * 0.88)
}

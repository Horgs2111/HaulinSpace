let activePanel   = null
let panelStack    = []
let currentPlanet = null
let currentMarket = null  // { commodityId: { buy, sell } }

let availableMissions = []
let missionCounter    = 0

const PIRATE_NAMES = [
  'Drek Voss', 'Kira Malcov', 'The Iron Wraith', 'Captain Sable',
  'Vorga the Red', 'Nyx Coldburn', 'Rance Hollow', 'The Blighted',
  'Ezra Kane', 'The Pale Hand'
]

const MISSION_TYPE_LABEL = { delivery: 'Delivery', bounty: 'Bounty', smuggling: 'Smuggling' }

const FACILITIES = [
  { key: 'market',       label: 'Market',        desc: 'Buy and sell commodities'                     },
  { key: 'blackMarket',  label: 'Black Market',  desc: 'Illicit goods — high risk, high reward'       },
  { key: 'shipyard',     label: 'Shipyard',       desc: 'Browse and purchase new ships'                },
  { key: 'upgradeShop',  label: 'Upgrade Shop',   desc: 'Purchase and install ship upgrades'           },
  { key: 'missionBoard', label: 'Mission Board',  desc: 'Accept delivery, escort and bounty contracts' },
  { key: 'observatory',  label: 'Observatory',    desc: 'Scan nearby star systems (radius 3)'          }
]

// Max ship tier available per planet type
const SHIPYARD_TIER_LIMIT = {
  trade_hub:    6,
  military:     6,
  industrial:   4,
  agricultural: 3,
  mining:       3,
  frontier:     2
}

// Ship stat definitions for display + comparison
const SHIP_STAT_DEFS = [
  { key: 'cargo',         label: 'Cargo',    higherBetter: true  },
  { key: 'hull',          label: 'Hull',     higherBetter: true  },
  { key: 'speed',         label: 'Speed',    higherBetter: true  },
  { key: 'turn_rate',     label: 'Turn',     higherBetter: true  },
  { key: 'inertia',       label: 'Inertia',  higherBetter: false },
  { key: 'weapon_slots',  label: 'Weapons',  higherBetter: true  },
  { key: 'upgrade_slots', label: 'Up.slots', higherBetter: true  }
]

// ─── Panel stack ─────────────────────────────────────────────────────────────

function showPanel(panelId) {
  if (paused) closePauseMenu()
  if (activePanel) document.getElementById(activePanel).classList.add('hidden')
  activePanel = panelId
  panelStack.push(panelId)
  document.getElementById(panelId).classList.remove('hidden')
}

function closePanel() {
  if (activePanel) document.getElementById(activePanel).classList.add('hidden')
  panelStack.pop()
  if (panelStack.length > 0) {
    activePanel = panelStack[panelStack.length - 1]
    document.getElementById(activePanel).classList.remove('hidden')
  } else {
    activePanel = null
    AudioEngine.resumeMusic()
    // Returning to space from a landed planet — give ship an outward nudge
    if (player && player.landedPlanet && gameState === 'playing') {
      player.vx = Math.cos(player.angle) * DEPART_SPEED
      player.vy = Math.sin(player.angle) * DEPART_SPEED
      player.landedPlanet = null
    }
  }
}

// ─── Planet landing ───────────────────────────────────────────────────────────

function openLanding(specificPlanet) {
  const sys = galaxy.systems[player.system]

  document.getElementById('landing-system-name').innerText = sys.name

  const piracyLabel = sys.piracyLevel < 0.3 ? 'Low' : sys.piracyLevel < 0.65 ? 'Medium' : 'High'
  document.getElementById('landing-meta').innerText =
    sys.faction + '  ·  Piracy: ' + piracyLabel

  const planetsEl  = document.getElementById('landing-planets')
  planetsEl.innerHTML = ''

  // If landing on a specific planet (system-view flow), show only that planet.
  // If called without argument, show all system planets (fallback / future use).
  const toShow = specificPlanet ? [specificPlanet] : sys.planets

  if (toShow.length === 0) {
    const p = document.createElement('p')
    p.className = 'no-planets'
    p.innerText = 'No inhabited planets in this system.'
    planetsEl.appendChild(p)
  } else {
    toShow.forEach(planet => planetsEl.appendChild(buildPlanetBlock(planet)))
  }

  panelStack = []
  showPanel('panel-landing')
  AudioEngine.dock()
  AudioEngine.stopThrust()
  AudioEngine.pauseMusic()
}

function buildPlanetBlock(planet) {
  const block = document.createElement('div')
  block.className = 'planet-block'

  const typeLabel = PLANET_TYPE_LABELS[planet.type] || planet.type
  const nameEl = document.createElement('div')
  nameEl.className = 'planet-name'
  nameEl.innerText = planet.name + (planet.type ? '  ·  ' + typeLabel : '')
  block.appendChild(nameEl)

  const grid = document.createElement('div')
  grid.className = 'facility-grid'

  FACILITIES.forEach(fac => {
    const btn = document.createElement('button')
    btn.className = 'facility-btn' + (planet[fac.key] ? '' : ' disabled')
    btn.disabled = !planet[fac.key]

    const name = document.createElement('div')
    name.className = 'f-name'
    name.innerText = fac.label

    const desc = document.createElement('div')
    desc.className = 'f-desc'
    desc.innerText = planet[fac.key] ? fac.desc : 'Not available'

    btn.appendChild(name)
    btn.appendChild(desc)

    if (planet[fac.key]) {
      if (fac.key === 'market')       btn.onclick = () => openMarket(planet)
      if (fac.key === 'blackMarket')  btn.onclick = () => openBlackMarket(planet)
      if (fac.key === 'shipyard')     btn.onclick = () => openShipyard(planet)
      if (fac.key === 'upgradeShop')  btn.onclick = () => openUpgradeShop(planet)
      if (fac.key === 'missionBoard') btn.onclick = () => openMissionBoard(planet)
      if (fac.key === 'observatory') btn.onclick = () => {
        const revealed = revealRadius(player.system, 3, 'scanned')
        desc.innerText = revealed > 0
          ? `${revealed} new system${revealed !== 1 ? 's' : ''} added to scanner data`
          : 'All nearby systems already charted'
        btn.disabled = true
      }
    }

    grid.appendChild(btn)
  })

  block.appendChild(grid)
  return block
}

// ─── Market ───────────────────────────────────────────────────────────────────

function openMarket(planet) {
  currentPlanet = planet
  currentMarket = getOrCreateMarket(planet)

  const typeLabel = PLANET_TYPE_LABELS[planet.type] || planet.type
  document.getElementById('market-planet-name').innerText = planet.name + '  ·  ' + typeLabel

  renderMarket()
  showPanel('panel-market')
}

function renderMarket() {
  const cargoUsed = Object.values(player.cargo).reduce((sum, n) => sum + n, 0)
  document.getElementById('market-cargo-used').innerText = cargoUsed
  document.getElementById('market-cargo-cap').innerText  = player.ship.cargo
  document.getElementById('market-credits').innerText    = player.credits.toLocaleString() + ' cr'

  const tableEl = document.getElementById('market-table')
  tableEl.innerHTML = ''

  const header = document.createElement('div')
  header.className = 'market-header-row'
  header.innerHTML =
    '<div>Commodity</div>' +
    '<div style="text-align:right">Buy</div>' +
    '<div style="text-align:right">Sell</div>' +
    '<div style="text-align:center">Hold</div>' +
    '<div></div>'
  tableEl.appendChild(header)

  const toShow = new Set(Object.keys(currentMarket))
  for (const id of Object.keys(player.cargo)) {
    if (player.cargo[id] > 0) toShow.add(id)
  }

  for (const c of GAME_COMMODITIES) {
    if (!toShow.has(c.id)) continue

    const prices   = currentMarket[c.id]
    const stocked  = !!prices
    const owned    = player.cargo[c.id] || 0
    const evMod    = stocked ? getEventModifier(c.id) : 1.0
    const effBuy   = stocked ? Math.max(1, Math.round(prices.buy  * evMod)) : 0
    const effSell  = stocked ? Math.max(1, Math.round(prices.sell * evMod)) : 0
    const canBuy   = stocked && player.credits >= effBuy && cargoUsed < player.ship.cargo
    const canSell  = stocked && owned > 0

    const row = document.createElement('div')
    row.className = 'market-row' + (stocked ? '' : ' unstocked')

    let buyHtml = '<span class="price-na">—</span>'
    if (stocked) {
      const ratio = effBuy / c.base_price
      const cls   = ratio < 0.85 ? 'price-cheap' : ratio > 1.20 ? 'price-dear' : 'price-normal'
      buyHtml = `<span class="${cls}">${effBuy.toLocaleString()} cr</span>`
    }

    const sellHtml = stocked
      ? `<span class="price-sell">${effSell.toLocaleString()} cr</span>`
      : '<span class="price-na">—</span>'

    const holdHtml = owned > 0
      ? `<span class="market-owned in-hold">${owned}</span>`
      : '<span class="market-owned">—</span>'

    row.innerHTML =
      `<div class="market-name">${c.label}` +
        (!stocked ? '<span class="planet-type-badge">not stocked here</span>' : '') +
      '</div>' +
      `<div class="price-col">${buyHtml}</div>` +
      `<div class="price-col">${sellHtml}</div>` +
      holdHtml +
      `<div class="market-actions">` +
        `<button class="btn-buy"  ${canBuy  ? '' : 'disabled'} onclick="buyItem('${c.id}',${effBuy})">Buy</button>` +
        `<button class="btn-sell" ${canSell ? '' : 'disabled'} onclick="sellItem('${c.id}',${effSell})">Sell</button>` +
      `</div>`

    tableEl.appendChild(row)
  }
}

function buyItem(commodityId, price) {
  if (!currentMarket?.[commodityId]) return
  const p = price ?? Math.max(1, Math.round(currentMarket[commodityId].buy * getEventModifier(commodityId)))
  if (buyCommodity(player, commodityId, p)) {
    AudioEngine.trade()
    updateHUD()
    renderMarket()
  }
}

function sellItem(commodityId, price) {
  if (!currentMarket?.[commodityId]) return
  const p = price ?? Math.max(1, Math.round(currentMarket[commodityId].sell * getEventModifier(commodityId)))
  if (sellCommodity(player, commodityId, p)) {
    AudioEngine.trade()
    updateHUD()
    renderMarket()
  }
}

// ─── Black market ─────────────────────────────────────────────────────────────

// Illegal commodities sold/bought at the black market
const BLACK_MARKET_COMMODITIES = ['contraband', 'weapons']
// Buy multiplier (what the market charges you) and sell multiplier (what you receive)
const BM_BUY_MOD  = 1.45   // 45% above base — risky to stock
const BM_SELL_MOD = 1.80   // 80% above base — fence stolen goods here

function openBlackMarket(planet) {
  currentPlanet = planet
  document.getElementById('blackmarket-planet-name').innerText = planet.name + '  ·  Pirate Outpost'
  renderBlackMarket()
  showPanel('panel-blackmarket')
}

function renderBlackMarket() {
  const cargoUsed = Object.values(player.cargo).reduce((sum, n) => sum + n, 0)
  document.getElementById('bm-cargo-used').innerText = cargoUsed
  document.getElementById('bm-cargo-cap').innerText  = player.ship.cargo
  document.getElementById('bm-credits').innerText    = player.credits.toLocaleString() + ' cr'

  const tableEl = document.getElementById('blackmarket-table')
  tableEl.innerHTML = ''

  // Warning banner
  const warn = document.createElement('div')
  warn.className = 'bm-warning'
  warn.innerText = '⚠  Illegal goods. Trading here may affect your standing with law-abiding factions.'
  tableEl.appendChild(warn)

  // Illegal goods section
  const illegalLabel = document.createElement('div')
  illegalLabel.className = 'bm-section-label'
  illegalLabel.innerText = 'Illicit Goods'
  tableEl.appendChild(illegalLabel)

  // Header row (reuse market styles)
  const header = document.createElement('div')
  header.className = 'market-header-row'
  header.innerHTML = '<div>Commodity</div><div style="text-align:right">Buy</div><div style="text-align:right">Sell</div><div style="text-align:center">Hold</div><div></div>'
  tableEl.appendChild(header)

  const illegalCommodities = GAME_COMMODITIES.filter(c => c.illegal)
  for (const c of illegalCommodities) {
    const buyPrice  = Math.round(c.base_price * BM_BUY_MOD  * (1 + (Math.random() - 0.5) * c.volatility))
    const sellPrice = Math.round(c.base_price * BM_SELL_MOD * (1 + (Math.random() - 0.5) * c.volatility))
    const held      = player.cargo[c.id] ?? 0
    const canBuy    = player.credits >= buyPrice && cargoUsed < player.ship.cargo
    const canSell   = held > 0

    const row = document.createElement('div')
    row.className = 'market-row'
    row.innerHTML =
      `<div class="comm-name">${c.label} <span class="comm-tag illegal-tag">ILLEGAL</span></div>` +
      `<div class="price amber" style="text-align:right">${buyPrice} cr</div>` +
      `<div class="price" style="text-align:right">${sellPrice} cr</div>` +
      `<div style="text-align:center">${held}</div>` +
      `<div class="market-actions">` +
        `<button class="btn-buy"  ${canBuy  ? '' : 'disabled'} onclick="bmBuyItem('${c.id}',${buyPrice})"  >Buy</button>` +
        `<button class="btn-sell" ${canSell ? '' : 'disabled'} onclick="bmSellItem('${c.id}',${sellPrice})">Sell</button>` +
      `</div>`
    tableEl.appendChild(row)
  }

  // Regular cargo fence section (sell only — always at BM_SELL_MOD)
  const cargoIds = Object.keys(player.cargo).filter(id => (player.cargo[id] ?? 0) > 0 && !GAME_COMMODITIES.find(c => c.id === id)?.illegal)
  if (cargoIds.length > 0) {
    const fenceLabel = document.createElement('div')
    fenceLabel.className = 'bm-section-label'
    fenceLabel.style.marginTop = '12px'
    fenceLabel.innerText = 'Fence Cargo  (sell at premium)'
    tableEl.appendChild(fenceLabel)

    const fheader = document.createElement('div')
    fheader.className = 'market-header-row'
    fheader.innerHTML = '<div>Commodity</div><div></div><div style="text-align:right">Fence Price</div><div style="text-align:center">Hold</div><div></div>'
    tableEl.appendChild(fheader)

    for (const id of cargoIds) {
      const c    = GAME_COMMODITIES.find(x => x.id === id)
      if (!c) continue
      const held = player.cargo[id]
      const fencePrice = Math.round(c.base_price * 1.20)

      const row = document.createElement('div')
      row.className = 'market-row'
      row.innerHTML =
        `<div class="comm-name">${c.label}</div>` +
        `<div></div>` +
        `<div class="price" style="text-align:right">${fencePrice} cr</div>` +
        `<div style="text-align:center">${held}</div>` +
        `<div class="market-actions">` +
          `<button class="btn-sell" onclick="bmFenceItem('${c.id}',${fencePrice})">Sell</button>` +
        `</div>`
      tableEl.appendChild(row)
    }
  }
}

function bmBuyItem(commodityId, price) {
  if (player.credits < price) return
  const used = Object.values(player.cargo).reduce((s, n) => s + n, 0)
  if (used >= player.ship.cargo) return
  player.credits -= price
  player.cargo[commodityId] = (player.cargo[commodityId] || 0) + 1
  AudioEngine.trade()
  updateHUD()
  renderBlackMarket()
}

function bmSellItem(commodityId, price) {
  if (!(player.cargo[commodityId] > 0)) return
  player.credits += price
  player.cargo[commodityId]--
  if (player.cargo[commodityId] === 0) delete player.cargo[commodityId]
  AudioEngine.trade()
  updateHUD()
  renderBlackMarket()
}

function bmFenceItem(commodityId, price) {
  if (!(player.cargo[commodityId] > 0)) return
  player.credits += price
  player.cargo[commodityId]--
  if (player.cargo[commodityId] === 0) delete player.cargo[commodityId]
  AudioEngine.trade()
  updateHUD()
  renderBlackMarket()
}

// ─── Shipyard ─────────────────────────────────────────────────────────────────

function openShipyard(planet) {
  currentPlanet = planet
  const typeLabel = PLANET_TYPE_LABELS[planet.type] || planet.type
  document.getElementById('shipyard-planet-name').innerText = planet.name + '  ·  ' + typeLabel
  renderShipyard()
  showPanel('panel-shipyard')
}

function renderShipyard() {
  document.getElementById('shipyard-credits').innerText = player.credits.toLocaleString() + ' cr'

  const body = document.getElementById('shipyard-body')
  body.innerHTML = ''

  // Current ship
  const currentTitle = document.createElement('div')
  currentTitle.className = 'section-title'
  currentTitle.innerText = 'Current Ship'
  body.appendChild(currentTitle)
  body.appendChild(buildShipCard(player.ship, true, false, 0))

  // Available ships
  const tierLimit  = SHIPYARD_TIER_LIMIT[currentPlanet?.type] ?? 3
  const tradeIn    = Math.floor(player.ship.price * 0.35)
  const available  = GAME_SHIPS.filter(s => s.tier <= tierLimit && s.name !== player.ship.name)

  const availTitle = document.createElement('div')
  availTitle.className = 'section-title'
  availTitle.style.marginTop = '30px'
  availTitle.innerText = 'Available Ships'
  body.appendChild(availTitle)

  if (available.length === 0) {
    const msg = document.createElement('p')
    msg.className = 'no-planets'
    msg.innerText = 'No other ships available at this shipyard.'
    body.appendChild(msg)
    return
  }

  const grid = document.createElement('div')
  grid.className = 'ship-grid'

  available.forEach(ship => {
    const netCost   = Math.max(0, ship.price - tradeIn)
    const canAfford = player.credits >= netCost
    grid.appendChild(buildShipCard(ship, false, canAfford, netCost, tradeIn))
  })

  body.appendChild(grid)
}

function buildShipCard(ship, isCurrent, canAfford, netCost, tradeIn) {
  const card = document.createElement('div')
  card.className = 'ship-card' +
    (isCurrent  ? ' current-ship' : '') +
    (!isCurrent && !canAfford ? ' cant-afford' : '')

  // Header
  const header = document.createElement('div')
  header.className = 'ship-card-header'
  header.innerHTML =
    `<div class="ship-card-name">${ship.name}</div>` +
    `<div class="ship-card-tier">Tier ${ship.tier}</div>` +
    (isCurrent ? '<div class="ship-card-current-badge">Aboard</div>' : '')
  card.appendChild(header)

  // Stats grid with delta vs current
  const statsEl = document.createElement('div')
  statsEl.className = 'ship-stats'

  SHIP_STAT_DEFS.forEach(def => {
    const val  = ship[def.key]
    const curr = player.ship[def.key]
    const diff = isCurrent ? 0 : val - curr

    let deltaHtml = ''
    if (!isCurrent && diff !== 0) {
      const better = def.higherBetter ? diff > 0 : diff < 0
      const cls    = better ? 'stat-delta-better' : 'stat-delta-worse'
      deltaHtml    = `<span class="${cls}">${diff > 0 ? '+' : ''}${diff}</span>`
    }

    const cell = document.createElement('div')
    cell.className = 'stat-cell'
    cell.innerHTML =
      `<div class="stat-label">${def.label}</div>` +
      `<div class="stat-value">${val}${deltaHtml}</div>`
    statsEl.appendChild(cell)
  })

  card.appendChild(statsEl)

  // Footer
  const footer = document.createElement('div')
  footer.className = 'ship-card-footer'

  if (isCurrent) {
    const hp = document.createElement('div')
    hp.className = 'ship-price'
    hp.innerHTML = `Hull: <strong>${player.hp} / ${player.ship.hull}</strong>` +
      `&nbsp;&nbsp;·&nbsp;&nbsp;Upgrades installed: <strong>${player.upgrades.length}</strong>`
    footer.appendChild(hp)
  } else {
    const priceEl = document.createElement('div')
    priceEl.className = 'ship-price'
    priceEl.innerHTML =
      `Net cost: <strong>${netCost.toLocaleString()} cr</strong>` +
      (tradeIn > 0
        ? `<span class="trade-in-note">Trade-in value: ${tradeIn.toLocaleString()} cr</span>`
        : '')
    footer.appendChild(priceEl)

    const shipIdx = GAME_SHIPS.indexOf(ship)
    const buyBtn  = document.createElement('button')
    buyBtn.className = 'btn-purchase'
    buyBtn.disabled  = !canAfford
    buyBtn.innerText = 'Purchase'
    buyBtn.onclick   = () => buyShip(shipIdx)
    footer.appendChild(buyBtn)
  }

  card.appendChild(footer)
  return card
}

function buyShip(shipIdx) {
  const ship     = GAME_SHIPS[shipIdx]
  if (!ship) return

  const tradeIn  = Math.floor(player.ship.price * 0.35)
  const netCost  = Math.max(0, ship.price - tradeIn)
  if (player.credits < netCost) return

  player.credits -= netCost

  // Transfer cargo up to new ship's capacity; discard overflow
  const newCargo   = {}
  let   remaining  = ship.cargo
  for (const id of Object.keys(player.cargo)) {
    const qty  = player.cargo[id]
    const take = Math.min(qty, remaining)
    if (take > 0) newCargo[id] = take
    remaining -= take
    if (remaining <= 0) break
  }
  player.cargo    = newCargo
  player.ship     = Object.assign({}, ship)
  player.hp       = ship.hull
  player.upgrades = []

  updateHUD()
  renderShipyard()
}

// ─── Upgrade shop ─────────────────────────────────────────────────────────────

function openUpgradeShop(planet) {
  currentPlanet = planet
  const typeLabel = PLANET_TYPE_LABELS[planet.type] || planet.type
  document.getElementById('upgrades-planet-name').innerText = planet.name + '  ·  ' + typeLabel
  renderUpgradeShop()
  showPanel('panel-upgrades')
}

function renderUpgradeShop() {
  document.getElementById('upgrades-credits').innerText = player.credits.toLocaleString() + ' cr'
  document.getElementById('upgrades-slots').innerText   = player.ship.upgrade_slots

  // Ship summary
  const shipInfo = document.getElementById('upgrades-ship-info')
  const statsHtml = SHIP_STAT_DEFS.map(d =>
    `<span>${d.label}: <strong>${player.ship[d.key]}</strong></span>`
  ).join('\n')

  shipInfo.innerHTML =
    `<div class="upgrades-ship-summary">` +
      `<div class="upgrades-ship-name">${player.ship.name}</div>` +
      `<div class="upgrades-stat-row">${statsHtml}</div>` +
    `</div>` +
    `<div class="section-title" style="margin-bottom:12px">Available Upgrades</div>`

  // Upgrade rows
  const listEl = document.getElementById('upgrades-list')
  listEl.innerHTML = ''

  GAME_UPGRADES.forEach((upgrade, idx) => {
    const canAfford  = player.credits >= upgrade.price
    const hasSlots   = player.ship.upgrade_slots > 0
    const canInstall = canAfford && hasSlots

    const row = document.createElement('div')
    row.className = 'upgrade-row'
    row.innerHTML =
      `<div>` +
        `<div class="upgrade-name">${upgrade.name}</div>` +
        `<div class="upgrade-effect">${formatUpgradeEffect(upgrade)}</div>` +
      `</div>` +
      `<div class="upgrade-price">${upgrade.price.toLocaleString()} cr</div>` +
      `<button class="btn-install" ${canInstall ? '' : 'disabled'} onclick="installUpgrade(${idx})">Install</button>`

    listEl.appendChild(row)
  })
}

function formatUpgradeEffect(upgrade) {
  const d = upgrade.delta
  switch (upgrade.effect) {
    case 'cargo':      return `+${d} Cargo capacity`
    case 'speed':      return `+${d} Speed`
    case 'turn_rate':  return `+${d} Turn rate`
    case 'inertia':    return `${d} Inertia (lower is better)`
    case 'hull':       return `+${d} Hull strength`
    case 'damage_pct': return `+${Math.round(d * 100)}% Weapon damage`
    case 'jump_cost':  return `${Math.round(d * 100)}% Jump fuel cost`
    default:           return upgrade.effect
  }
}

function installUpgrade(upgradeIdx) {
  const upgrade = GAME_UPGRADES[upgradeIdx]
  if (!upgrade) return
  if (player.credits < upgrade.price)    return
  if (player.ship.upgrade_slots <= 0)    return

  player.credits -= upgrade.price
  player.ship.upgrade_slots--
  player.upgrades.push(upgrade.name)

  switch (upgrade.effect) {
    case 'cargo':     player.ship.cargo     += upgrade.delta; break
    case 'speed':     player.ship.speed     += upgrade.delta; break
    case 'turn_rate': player.ship.turn_rate += upgrade.delta; break
    case 'inertia':   player.ship.inertia   += upgrade.delta; break
    case 'hull':
      player.ship.hull += upgrade.delta
      player.hp = Math.min(player.hp + upgrade.delta, player.ship.hull)
      break
    // damage_pct and jump_cost applied in combat / travel (future phases)
  }

  updateHUD()
  renderUpgradeShop()
}

// ─── Mission board ────────────────────────────────────────────────────────────

function pickMissionType(target) {
  const ftype = GAME_FACTIONS.find(f => f.name === target.faction)?.type
  const r = Math.random()
  if (ftype === 'pirate' && r < 0.50) return 'bounty'
  if (target.piracyLevel > 0.45 && r < 0.30) return 'bounty'
  if (r < 0.18) return 'smuggling'
  return 'delivery'
}

function buildMission(type, target) {
  const id = `m${++missionCounter}`

  if (type === 'delivery') {
    const c     = GAME_COMMODITIES[Math.floor(Math.random() * GAME_COMMODITIES.length)]
    const qty   = 1 + Math.floor(Math.random() * 4)
    const hops  = 2 + Math.floor(Math.random() * 3)
    const reward = Math.round(c.base_price * qty * (1.8 + Math.random() * 0.8))
    return {
      id, type,
      title: `Deliver ${c.label}`,
      desc:  `Transport ${qty}t of ${c.label} to ${target.name}. Contract expires after ${hops} jumps.`,
      target: { systemId: target.id, systemName: target.name },
      hopsLeft: hops,
      reward
    }
  }

  if (type === 'bounty') {
    const name   = PIRATE_NAMES[Math.floor(Math.random() * PIRATE_NAMES.length)]
    const reward = Math.round(1500 + target.piracyLevel * 3500 + Math.random() * 1000)
    return {
      id, type,
      title: `Bounty: ${name}`,
      desc:  `Eliminate the pirate ${name} operating in ${target.name}. No time limit.`,
      target: { systemId: target.id, systemName: target.name },
      bountyName: name,
      reward
    }
  }

  if (type === 'smuggling') {
    const goods = [
      { label: 'Narcotics',          desc: 'prohibited stimulants'     },
      { label: 'Unlicensed Weapons', desc: 'unregistered arms shipment' },
      { label: 'Stolen Goods',       desc: 'black-market merchandise'   }
    ]
    const g      = goods[Math.floor(Math.random() * goods.length)]
    const hops   = 3 + Math.floor(Math.random() * 3)
    const reward = Math.round(2500 + Math.random() * 3500)
    return {
      id, type,
      title: `Smuggle ${g.label}`,
      desc:  `Deliver a ${g.desc} to contacts in ${target.name}. High reward — faction reputation risk if caught. ${hops} jump limit.`,
      target: { systemId: target.id, systemName: target.name },
      hopsLeft: hops,
      reward
    }
  }

  return null
}

function generateMissions(planet) {
  const sys     = galaxy.systems[player.system]
  const count   = 3 + Math.floor(Math.random() * 3)
  const targets = sys.connections
    .filter(id => systemStates.has(id))
    .map(id => galaxy.systems[id])

  if (targets.length === 0) return []

  const missions = []
  for (let i = 0; i < count; i++) {
    const target = targets[Math.floor(Math.random() * targets.length)]
    const m = buildMission(pickMissionType(target), target)
    if (m) missions.push(m)
  }
  return missions
}

function openMissionBoard(planet) {
  currentPlanet     = planet
  availableMissions = generateMissions(planet)
  const typeLabel   = PLANET_TYPE_LABELS[planet.type] || planet.type
  document.getElementById('missionboard-planet-name').innerText = planet.name + '  ·  ' + typeLabel
  renderMissionBoard()
  showPanel('panel-missionboard')
}

function renderMissionBoard() {
  const content = document.getElementById('missionboard-content')
  content.innerHTML = ''

  const active = player.missions ?? []
  document.getElementById('missionboard-active-count').innerText = active.length

  // Active missions section
  if (active.length > 0) {
    const t = document.createElement('div')
    t.className = 'section-title'; t.innerText = 'Active Missions'
    content.appendChild(t)
    const list = document.createElement('div')
    list.className = 'mission-list'
    active.forEach(m => list.appendChild(buildMissionCard(m, true)))
    content.appendChild(list)
  }

  // Available missions section
  const t2 = document.createElement('div')
  t2.className = 'section-title'
  t2.style.marginTop = active.length ? '28px' : '0'
  t2.innerText = 'Available Missions'
  content.appendChild(t2)

  const list2 = document.createElement('div')
  list2.className = 'mission-list'
  if (availableMissions.length === 0) {
    const msg = document.createElement('p')
    msg.className = 'no-planets'
    msg.innerText = 'No missions available — this system has no connected destinations.'
    list2.appendChild(msg)
  } else {
    availableMissions.forEach((m, idx) => list2.appendChild(buildMissionCard(m, false, idx)))
  }
  content.appendChild(list2)
}

function buildMissionCard(m, isActive, idx) {
  const card = document.createElement('div')
  card.className = 'mission-card' + (isActive ? ' active' : '')

  // Header
  const header = document.createElement('div')
  header.className = 'mission-card-header'
  const title = document.createElement('span')
  title.className = 'mission-card-title'; title.innerText = m.title
  const badge = document.createElement('span')
  badge.className = `mission-type-badge mission-type-${m.type}`
  badge.innerText = MISSION_TYPE_LABEL[m.type] || m.type
  header.appendChild(title); header.appendChild(badge)
  card.appendChild(header)

  // Description
  const desc = document.createElement('div')
  desc.className = 'mission-desc'; desc.innerText = m.desc
  card.appendChild(desc)

  // Footer
  const footer = document.createElement('div')
  footer.className = 'mission-card-footer'

  const left = document.createElement('div')
  const rewardEl = document.createElement('div')
  rewardEl.className = 'mission-reward'
  rewardEl.innerText = `+${m.reward.toLocaleString()} cr`
  left.appendChild(rewardEl)

  if (m.hopsLeft !== undefined) {
    const meta = document.createElement('div')
    meta.className = 'mission-meta'
    meta.innerText = isActive
      ? `${m.hopsLeft} jump${m.hopsLeft !== 1 ? 's' : ''} remaining`
      : `${m.hopsLeft} jump limit`
    left.appendChild(meta)
  }
  if (isActive && m.type === 'bounty') {
    const meta = document.createElement('div')
    meta.className = 'mission-meta'; meta.innerText = `Target system: ${m.target.systemName}`
    left.appendChild(meta)
  }
  footer.appendChild(left)

  const btn = document.createElement('button')
  if (isActive) {
    btn.className = 'btn-abandon'; btn.innerText = 'Abandon'
    btn.onclick = () => { abandonMission(m.id); renderMissionBoard() }
  } else {
    btn.className = 'btn-accept'; btn.innerText = 'Accept'
    btn.disabled  = (player.missions?.length ?? 0) >= 5
    btn.onclick   = () => { acceptMission(idx); renderMissionBoard() }
  }
  footer.appendChild(btn)
  card.appendChild(footer)
  return card
}

function acceptMission(idx) {
  const m = availableMissions[idx]
  if (!m) return
  if (!player.missions) player.missions = []
  if (player.missions.length >= 5) return
  player.missions.push(m)
  availableMissions.splice(idx, 1)
  AudioEngine.notify(true)
}

function abandonMission(missionId) {
  if (!player.missions) return
  player.missions = player.missions.filter(m => m.id !== missionId)
}

// ─── Pause menu ───────────────────────────────────────────────────────────────

function openPauseMenu() {
  if (gameState !== 'playing') return
  paused = true
  if (wasThrusting) { AudioEngine.stopThrust(); wasThrusting = false }
  AudioEngine.pauseMusic()
  document.getElementById('screen-pause').classList.remove('hidden')
  document.getElementById('btn-cog').classList.add('active')
  document.getElementById('btn-pause-load').disabled = !hasSave()
}

function closePauseMenu() {
  paused = false
  document.getElementById('screen-pause').classList.add('hidden')
  document.getElementById('btn-cog').classList.remove('active')
  AudioEngine.resumeMusic()
}

function pauseSaveGame() {
  if (gameState !== 'playing') return
  if (saveGame()) {
    missionNotify = { text: 'Game saved', timer: 2.0, success: true }
    document.getElementById('btn-pause-load').disabled = false
  }
}

function pauseLoadGame() {
  if (!hasSave()) return
  closePauseMenu()
  if (!loadGame()) { alert('Save data could not be loaded.'); return }
  gameState = 'playing'
  document.getElementById('screen-menu').classList.add('hidden')
  document.getElementById('screen-gameover').classList.add('hidden')
  document.getElementById('hud').classList.remove('hidden')
}

function pauseQuitToMenu() {
  closePauseMenu()
  gameState = 'menu'
  document.getElementById('hud').classList.add('hidden')
  document.getElementById('screen-menu').classList.remove('hidden')
  AudioEngine.startSpaceMusic && AudioEngine.startSpaceMusic()
}

// ─── Title / Menu / Options ───────────────────────────────────────────────────

// Where to return when closing options: 'menu' or 'pause'
let optionsCaller = 'menu'

// Currently active options tab
let activeOptTab = 'audio'

// Keybind rebind state
let rebindingAction = null

function showOptionsTab(tab) {
  activeOptTab = tab
  document.querySelectorAll('.opt-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab))
  document.querySelectorAll('.opt-tab-content').forEach(c => c.classList.toggle('hidden', c.id !== 'opt-tab-' + tab))
  if (tab === 'keys') renderKeybindingsTab()
}

const KEYBIND_LABELS = {
  thrust:    'Thrust',
  brake:     'Brake / Reverse',
  turnLeft:  'Turn Left',
  turnRight: 'Turn Right',
  land:      'Land',
  map:       'Galaxy Map',
  jump:      'Jump',
  fire:      'Fire Weapon',
  pause:     'Pause / Menu'
}

function keyLabel(k) {
  if (k === ' ')      return 'Space'
  if (k === 'Escape') return 'Esc'
  return k.toUpperCase()
}

function renderKeybindingsTab() {
  const list = document.getElementById('keybind-list')
  list.innerHTML = ''
  for (const [action, label] of Object.entries(KEYBIND_LABELS)) {
    const row = document.createElement('div')
    row.className = 'keybind-row'
    row.id = 'kbrow-' + action
    row.innerHTML = `
      <span class="keybind-label">${label}</span>
      <span class="keybind-key" id="kbkey-${action}">${keyLabel(keybinds[action])}</span>
      <button class="keybind-btn" onclick="startRebind('${action}')">Rebind</button>
    `
    list.appendChild(row)
  }
}

function startRebind(action) {
  if (rebindingAction) cancelRebind()
  rebindingAction = action
  const row = document.getElementById('kbrow-' + action)
  if (row) row.classList.add('rebinding')
  const keyEl = document.getElementById('kbkey-' + action)
  if (keyEl) keyEl.textContent = 'Press key…'

  function onKey(e) {
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') { cancelRebind(); document.removeEventListener('keydown', onKey, true); return }
    // Conflict check — unassign other action if same key
    for (const [a, k] of Object.entries(keybinds)) {
      if (a !== action && matchKey(e.key, k)) {
        keybinds[a] = ''
      }
    }
    keybinds[action] = e.key.length === 1 ? e.key.toLowerCase() : e.key
    saveKeybinds()
    rebindingAction = null
    if (row) row.classList.remove('rebinding')
    document.removeEventListener('keydown', onKey, true)
    renderKeybindingsTab()
  }
  document.addEventListener('keydown', onKey, true)
}

function cancelRebind() {
  if (!rebindingAction) return
  const row = document.getElementById('kbrow-' + rebindingAction)
  if (row) row.classList.remove('rebinding')
  rebindingAction = null
  renderKeybindingsTab()
}

function restoreDefaultKeybinds() {
  keybinds = { ...DEFAULT_KEYBINDS }
  saveKeybinds()
  renderKeybindingsTab()
}

function initMenuUI() {
  document.getElementById('btn-new-game').onclick     = startNewGame
  document.getElementById('btn-load-game').onclick    = loadSavedGame
  document.getElementById('btn-options').onclick      = () => openOptions('menu')
  document.getElementById('btn-options-back').onclick = closeOptions

  // Disable Load if no save exists
  document.getElementById('btn-load-game').disabled = !hasSave()

  // Game over buttons
  document.getElementById('btn-gameover-load').onclick = loadSavedGame
  document.getElementById('btn-gameover-load').style.display = hasSave() ? '' : 'none'
  document.getElementById('btn-gameover-new').onclick = () => {
    document.getElementById('screen-gameover').classList.add('hidden')
    startNewGame()
  }

  // Pause menu buttons
  document.getElementById('btn-pause-resume').onclick  = closePauseMenu
  document.getElementById('btn-pause-save').onclick    = pauseSaveGame
  document.getElementById('btn-pause-load').onclick    = pauseLoadGame
  document.getElementById('btn-pause-options').onclick = () => openOptions('pause')
  document.getElementById('btn-pause-quit').onclick    = pauseQuitToMenu

  // Volume sliders
  const optMusic = document.getElementById('opt-music')
  const optSfx   = document.getElementById('opt-sfx')
  if (optMusic) optMusic.addEventListener('input', () => AudioEngine.setMusicVolume(+optMusic.value))
  if (optSfx)   optSfx.addEventListener('input',   () => AudioEngine.setSfxVolume(+optSfx.value))

  // Options tab buttons
  document.querySelectorAll('.opt-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => showOptionsTab(btn.dataset.tab))
  })

  // Title screen: any key or click advances to menu
  document.getElementById('screen-title').addEventListener('click', showMenu)
  document.addEventListener('keydown', e => {
    if (gameState === 'title') showMenu()
  })
}

function showMenu() {
  if (gameState !== 'title') return
  gameState = 'menu'
  document.getElementById('screen-title').classList.add('hidden')
  document.getElementById('screen-menu').classList.remove('hidden')
}

function startNewGame() {
  if (hasSave() && !confirm('Start a new game? Your current save will be overwritten.')) return
  deleteSave()
  gameState = 'playing'
  document.getElementById('screen-menu').classList.add('hidden')
  document.getElementById('screen-gameover').classList.add('hidden')
  document.getElementById('hud').classList.remove('hidden')
  initGame()
}

function loadSavedGame() {
  if (!loadGame()) { alert('Save data could not be loaded.'); return }
  gameState = 'playing'
  document.getElementById('screen-menu').classList.add('hidden')
  document.getElementById('screen-gameover').classList.add('hidden')
  document.getElementById('hud').classList.remove('hidden')
}

function openOptions(caller) {
  optionsCaller = caller || 'menu'
  activeOptTab = 'audio'
  showOptionsTab('audio')
  if (optionsCaller === 'pause') {
    document.getElementById('screen-pause').classList.add('hidden')
  } else {
    gameState = 'options'
    document.getElementById('screen-menu').classList.add('hidden')
  }
  document.getElementById('screen-options').classList.remove('hidden')
}

function closeOptions() {
  document.getElementById('screen-options').classList.add('hidden')
  if (optionsCaller === 'pause') {
    document.getElementById('screen-pause').classList.remove('hidden')
  } else {
    gameState = 'menu'
    document.getElementById('screen-menu').classList.remove('hidden')
  }
}

initMenuUI()

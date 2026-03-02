let activePanel   = null
let panelStack    = []
let currentPlanet = null
let currentMarket = null  // { commodityId: { buy, sell } }

let availableMissions = []
let missionCounter    = 0

// ─── Save slot picker state ───────────────────────────────────────────────────
let slotPickerMode     = null   // 'newgame' | 'load'
let slotPickerCaller   = null   // 'menu' | 'difficulty' | 'gameover'
let slotPickerCallback = null   // fn(slotNum)

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

  // Auto Refueler: top up fuel automatically on landing (10% discount)
  if (player.upgrades?.includes('Auto Refueler') && specificPlanet?.fuel) {
    const cap   = player.ship.fuel_capacity
    const needed = cap - (player.fuel ?? cap)
    if (needed > 0) {
      const fuelEvent    = (typeof activeEvents !== 'undefined') && activeEvents.find(e => e.effect === 'fuel_prices_up')
      const pricePerJump = Math.floor(150 * player.ship.tier * (fuelEvent ? 2 : 1) * 0.90)
      const canAfford    = Math.floor(player.credits / pricePerJump)
      const toBuy        = Math.min(needed, canAfford)
      if (toBuy > 0) {
        player.credits -= toBuy * pricePerJump
        player.fuel     = (player.fuel ?? cap) + toBuy
        updateHUD()
      }
    }
  }

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

  // Track planets visited for statistics
  if (specificPlanet && typeof planetsVisitedSet !== 'undefined' && !planetsVisitedSet.has(specificPlanet.id)) {
    planetsVisitedSet.add(specificPlanet.id)
    if (typeof playerStats !== 'undefined') playerStats.planetsVisited = planetsVisitedSet.size
  }

  // Show mission-complete popups for any missions targeting this system
  if (specificPlanet) checkMissionCompletions()
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

  // ── Refuel section ────────────────────────────────────────────────────────
  if (planet.fuel) {
    const refuelRow = document.createElement('div')
    refuelRow.className = 'refuel-row'
    refuelRow.id = 'refuel-row-' + planet.id

    const cap          = player.ship.fuel_capacity
    const needed       = cap - (player.fuel ?? cap)
    const fuelEvent    = (typeof activeEvents !== 'undefined') && activeEvents.find(e => e.effect === 'fuel_prices_up')
    const hasAutoRefuel = player.upgrades?.includes('Auto Refueler')
    const pricePerJump = 150 * player.ship.tier * (fuelEvent ? 2 : 1) * (hasAutoRefuel ? 0.90 : 1)
    const totalCost    = Math.floor(needed * pricePerJump)

    if (hasAutoRefuel) {
      refuelRow.innerHTML = `
        <span class="refuel-label">Fuel Depot</span>
        <span class="refuel-status">${player.fuel ?? cap} / ${cap}</span>
        <span class="refuel-auto-badge">Auto Refueler active — 10% off</span>
      `
    } else {
      refuelRow.innerHTML = `
        <span class="refuel-label">Fuel Depot</span>
        <span class="refuel-status">${player.fuel ?? cap} / ${cap}</span>
        <span class="refuel-cost">${needed > 0 ? totalCost.toLocaleString() + ' cr' : 'Full'}</span>
        <button class="refuel-btn" id="refuel-btn-${planet.id}"
          ${needed <= 0 || player.credits < pricePerJump ? 'disabled' : ''}
          onclick="refuelShip(${planet.id})">Refuel</button>
      `
    }
    if (fuelEvent) {
      const warn = document.createElement('div')
      warn.className = 'refuel-event-warn'
      warn.innerText = '⚠ Fuel Shortage — prices doubled'
      refuelRow.appendChild(warn)
    }
    block.appendChild(refuelRow)
  }

  return block
}

function refuelShip(planetId) {
  const cap   = player.ship.fuel_capacity
  const needed = cap - (player.fuel ?? cap)
  if (needed <= 0) return

  const fuelEvent    = (typeof activeEvents !== 'undefined') && activeEvents.find(e => e.effect === 'fuel_prices_up')
  const pricePerJump = 150 * player.ship.tier * (fuelEvent ? 2 : 1)
  const canAfford    = Math.floor(player.credits / pricePerJump)
  const toBuy        = Math.min(needed, canAfford)
  if (toBuy <= 0) { missionNotify = { text: 'Not enough credits to refuel', timer: 2.0, success: false }; return }

  const totalFuelCost = toBuy * pricePerJump
  player.credits -= totalFuelCost
  player.fuel     = (player.fuel ?? cap) + toBuy
  if (typeof playerStats !== 'undefined') playerStats.creditsSpent += totalFuelCost
  updateHUD()
  AudioEngine.trade()

  // Refresh the refuel row in-place
  const row   = document.getElementById('refuel-row-' + planetId)
  const newNeeded = cap - player.fuel
  if (row) {
    row.querySelector('.refuel-status').innerText = player.fuel + ' / ' + cap
    row.querySelector('.refuel-cost').innerText   = newNeeded > 0 ? (newNeeded * pricePerJump).toLocaleString() + ' cr' : 'Full'
    const btn = row.querySelector('.refuel-btn')
    if (btn) btn.disabled = newNeeded <= 0 || player.credits < pricePerJump
  }
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
    const repMod   = (typeof getRepMod !== 'undefined' && currentPlanet) ? getRepMod(currentPlanet) : 1.0
    const effBuy   = stocked ? Math.max(1, Math.round(prices.buy  * evMod * repMod)) : 0
    const effSell  = stocked ? Math.max(1, Math.round(prices.sell * evMod / repMod)) : 0
    const canBuy   = stocked && player.credits >= effBuy && cargoUsed < player.ship.cargo
    const canSell  = stocked && owned > 0

    const row = document.createElement('div')
    row.className = 'market-row' + (stocked ? '' : ' unstocked')

    let buyHtml = '<span class="price-na">—</span>'
    if (stocked) {
      const ratio = effBuy / c.base_price
      const cls   = ratio < 0.85 ? 'price-cheap' : ratio > 1.20 ? 'price-dear' : 'price-normal'
      // Trend arrow vs purchase history at this planet
      let trend = ''
      if (typeof priceHistory !== 'undefined' && currentPlanet) {
        const hist = priceHistory.get(`${currentPlanet.id}:${c.id}`)
        if (hist && hist.length >= 1) {
          const avg = hist.reduce((a, b) => a + b, 0) / hist.length
          if      (effBuy > avg * 1.05) trend = ' <span class="price-trend-up">\u2191</span>'
          else if (effBuy < avg * 0.95) trend = ' <span class="price-trend-dn">\u2193</span>'
          else                          trend = ' <span class="price-trend-flat">\u2192</span>'
        }
      }
      buyHtml = `<span class="${cls}">${effBuy.toLocaleString()} cr${trend}</span>`
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
  const p      = price ?? Math.max(1, Math.round(currentMarket[commodityId].buy * getEventModifier(commodityId)))
  const oldQty = player.cargo[commodityId] ?? 0
  if (buyCommodity(player, commodityId, p)) {
    if (typeof playerStats !== 'undefined') { playerStats.creditsSpent += p; playerStats.cargoTraded++ }
    // Price history for trend arrows
    if (typeof priceHistory !== 'undefined' && currentPlanet) {
      const hKey = `${currentPlanet.id}:${commodityId}`
      const hist = priceHistory.get(hKey) ?? []
      hist.push(p)
      if (hist.length > 5) hist.shift()
      priceHistory.set(hKey, hist)
    }
    // Rolling avg buy price for cargo manifest
    if (!player.cargoPrices) player.cargoPrices = {}
    const oldAvg = player.cargoPrices[commodityId] ?? p
    player.cargoPrices[commodityId] = oldQty === 0
      ? p
      : Math.round((oldAvg * oldQty + p) / (oldQty + 1))
    computeShipStats()
    AudioEngine.trade()
    updateHUD()
    renderMarket()
  }
}

function sellItem(commodityId, price) {
  if (!currentMarket?.[commodityId]) return
  const p = price ?? Math.max(1, Math.round(currentMarket[commodityId].sell * getEventModifier(commodityId)))
  if (sellCommodity(player, commodityId, p)) {
    if (typeof playerStats !== 'undefined') { playerStats.creditsEarned += p; playerStats.cargoTraded++ }
    if ((player.cargo[commodityId] ?? 0) === 0 && player.cargoPrices) {
      delete player.cargoPrices[commodityId]
    }
    computeShipStats()
    AudioEngine.trade()
    updateHUD()
    renderMarket()
  }
}

// ─── Cargo manifest ──────────────────────────────────────────────────────────

function openCargoManifest() {
  document.getElementById('cargo-credits').innerText = player.credits.toLocaleString() + ' cr'
  renderCargoManifest()
  showPanel('panel-cargo')
}

function jettison(id, qty) {
  const have = player.cargo[id] ?? 0
  if (have <= 0) return
  const missionQty = player.missionCargo?.[id] ?? 0
  const jetQty = Math.min(qty, have - missionQty)  // can't jettison mission cargo
  if (jetQty <= 0) return
  player.cargo[id] = have - jetQty
  if (player.cargo[id] <= 0) {
    delete player.cargo[id]
    if (player.cargoPrices?.[id]) delete player.cargoPrices[id]
  }
  // Scatter jettisoned goods as loot near the ship (in world space)
  if (typeof lootItems !== 'undefined') {
    lootItems.push({
      x:         player.x + (Math.random() - 0.5) * 80,
      y:         player.y + (Math.random() - 0.5) * 80,
      commodity: id,
      qty:       jetQty
    })
  }
  computeShipStats()
  updateHUD()
  renderCargoManifest()
  document.getElementById('cargo-credits').innerText = player.credits.toLocaleString() + ' cr'
}

function renderCargoManifest() {
  const el = document.getElementById('cargo-manifest-body')
  if (!el) return
  const cargoIds = Object.keys(player.cargo).filter(id => (player.cargo[id] ?? 0) > 0)

  if (!cargoIds.length) {
    el.innerHTML = '<div class="cargo-empty">Cargo hold is empty.</div>'
    return
  }

  // Mass summary
  const ms = player._mass
  let massLine = ''
  if (ms) {
    massLine = `<div class="cargo-mass-info">Ship mass: <strong>${ms.hull_mass_t} T hull</strong> + <strong>${ms.cargo_mass_t.toFixed(1)} T cargo</strong> = <strong>${ms.totalMass_t.toFixed(1)} T total</strong> — performance at <strong>${Math.round(ms.mass_ratio * 100)}%</strong></div>`
  }

  let html = massLine + '<div class="cargo-table">' +
    '<div class="cargo-header">' +
      '<div>Commodity</div><div>Qty</div><div>Avg Paid</div><div>Total Paid</div><div>Est. Sell</div><div></div>' +
    '</div>'

  let grandPaid = 0
  let grandSell = 0

  for (const id of cargoIds) {
    const qty = player.cargo[id]
    const com = GAME_COMMODITIES.find(c => c.id === id)
    if (!com) continue
    const avgPaid    = player.cargoPrices?.[id] ?? com.base_price
    const totalP     = avgPaid * qty
    const sellEst    = Math.round(com.base_price * 0.88)
    const totalSE    = sellEst * qty
    grandPaid       += totalP
    grandSell       += totalSE

    const missionQty  = player.missionCargo?.[id] ?? 0
    const canJettison = qty - missionQty > 0
    html += `<div class="cargo-row">` +
      `<div class="cargo-name">${com.label}` +
        (com.illegal ? ' <span class="illegal-badge">ILLEGAL</span>' : '') +
        (missionQty > 0 ? ` <span class="mission-badge">MISSION ×${missionQty}</span>` : '') +
      `</div>` +
      `<div class="cargo-num">${qty}</div>` +
      `<div class="cargo-num">${avgPaid.toLocaleString()} cr</div>` +
      `<div class="cargo-num">${totalP.toLocaleString()} cr</div>` +
      `<div class="cargo-num cargo-sellest">${totalSE.toLocaleString()} cr</div>` +
      `<div class="cargo-jettison">${canJettison ? `<button class="btn-jettison" onclick="jettison('${id}',${qty - missionQty})">Jettison</button>` : ''}</div>` +
    `</div>`
  }

  html += '</div>' +
    '<div class="cargo-totals">' +
      `<span>Total invested: <strong>${grandPaid.toLocaleString()} cr</strong></span>` +
      `<span>Est. sell value: <strong>${grandSell.toLocaleString()} cr</strong></span>` +
    '</div>'

  el.innerHTML = html
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
  if (typeof playerStats !== 'undefined') { playerStats.creditsSpent += price; playerStats.cargoTraded++ }
  adjustRep('Federation Navy', -3)
  computeShipStats()
  AudioEngine.trade()
  updateHUD()
  renderBlackMarket()
}

function bmSellItem(commodityId, price) {
  if (!(player.cargo[commodityId] > 0)) return
  player.credits += price
  player.cargo[commodityId]--
  if (player.cargo[commodityId] === 0) delete player.cargo[commodityId]
  if (typeof playerStats !== 'undefined') { playerStats.creditsEarned += price; playerStats.cargoTraded++ }
  adjustRep('Federation Navy', -3)
  computeShipStats()
  AudioEngine.trade()
  updateHUD()
  renderBlackMarket()
}

function bmFenceItem(commodityId, price) {
  if (!(player.cargo[commodityId] > 0)) return
  player.credits += price
  player.cargo[commodityId]--
  if (player.cargo[commodityId] === 0) delete player.cargo[commodityId]
  if (typeof playerStats !== 'undefined') { playerStats.creditsEarned += price; playerStats.cargoTraded++ }
  adjustRep('Federation Navy', -2)
  computeShipStats()
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
  if (typeof playerStats !== 'undefined' && netCost > 0) playerStats.creditsSpent += netCost

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
  player.hp            = ship.hull
  player.shield        = ship.shield ?? 0
  player.shieldDelay   = 0
  player.armour        = 0
  player.armourMax     = 0
  player.fuel          = ship.fuel_capacity
  player.upgrades      = []
  player.weaponSlots   = Array.from({ length: ship.weapon_slots }, () => 'Laser Cannon')
  player.ammoInventory = {}
  player.ramscoopFrac  = 0
  player.angularVelocity = 0
  computeShipStats()

  updateHUD()
  renderShipyard()
}

// ─── Upgrade shop ─────────────────────────────────────────────────────────────

let activeUpgradeTab = 'ship'

function openUpgradeShop(planet) {
  currentPlanet    = planet
  activeUpgradeTab = 'ship'
  const typeLabel  = PLANET_TYPE_LABELS[planet.type] || planet.type
  document.getElementById('upgrades-planet-name').innerText = planet.name + '  ·  ' + typeLabel
  renderUpgradeShop()
  showPanel('panel-upgrades')
}

function setUpgradeTab(tab) {
  activeUpgradeTab = tab
  renderUpgradeShop()
}

function renderUpgradeShop() {
  document.getElementById('upgrades-credits').innerText = player.credits.toLocaleString() + ' cr'
  document.getElementById('upgrades-slots').innerText   = player.ship.upgrade_slots

  const wsEl = document.getElementById('upgrades-wslots')
  if (wsEl) {
    const free = (player.weaponSlots ?? []).filter(w => w === 'Laser Cannon').length
    wsEl.innerText = free + ' free'
  }

  // Ship summary + tab bar
  const shipInfo = document.getElementById('upgrades-ship-info')
  const statsHtml = SHIP_STAT_DEFS.map(d =>
    `<span>${d.label}: <strong>${player.ship[d.key]}</strong></span>`
  ).join('\n')

  const TAB_LABELS = { ship: 'Ship Upgrades', weapons: 'Weapons', defence: 'Defence' }
  const tabBarHtml = Object.keys(TAB_LABELS).map(t =>
    `<button class="upgrade-tab${t === activeUpgradeTab ? ' active' : ''}" onclick="setUpgradeTab('${t}')">${TAB_LABELS[t]}</button>`
  ).join('')

  shipInfo.innerHTML =
    `<div class="upgrades-ship-summary">` +
      `<div class="upgrades-ship-name">${player.ship.name}</div>` +
      `<div class="upgrades-stat-row">${statsHtml}</div>` +
    `</div>` +
    `<div class="upgrade-tab-bar">${tabBarHtml}</div>`

  // Filter to active tab
  const listEl = document.getElementById('upgrades-list')
  listEl.innerHTML = ''

  const tabItems   = GAME_UPGRADES.map((u, i) => ({ ...u, idx: i })).filter(u => u.tab === activeUpgradeTab)
  const mainItems  = tabItems.filter(u => u.effect !== 'ammo')
  const ammoItems  = tabItems.filter(u => u.effect === 'ammo')

  const renderItem = upgrade => {
    const slots    = player.weaponSlots ?? []
    const upgrades = player.upgrades    ?? []

    // Count fitted
    let fittedCount
    if (upgrade.effect === 'ammo') {
      fittedCount = player.ammoInventory?.[upgrade.ammoType] ?? 0
    } else if (upgrade.usesWeaponSlot) {
      fittedCount = slots.filter(w => w === upgrade.name).length
    } else {
      fittedCount = upgrades.filter(n => n === upgrade.name).length
    }

    const atLimit      = upgrade.limit > 0 && fittedCount >= upgrade.limit
    const alreadyFitted = atLimit && upgrade.effect !== 'ammo'
    const canAfford    = player.credits >= upgrade.price
    const prereqMet    = !upgrade.requiresUpgrade || slots.includes(upgrade.requiresUpgrade)
    const hasFreeSlot  = slots.includes('Laser Cannon')

    let canInstall
    if (!prereqMet) {
      canInstall = false
    } else if (upgrade.effect === 'ammo') {
      canInstall = canAfford
    } else if (upgrade.usesWeaponSlot && upgrade.usesUpgradeSlot) {
      canInstall = canAfford && player.ship.upgrade_slots > 0 && hasFreeSlot && !atLimit
    } else if (upgrade.usesWeaponSlot) {
      canInstall = canAfford && hasFreeSlot && !atLimit
    } else if (upgrade.usesUpgradeSlot) {
      canInstall = canAfford && player.ship.upgrade_slots > 0 && !atLimit
    } else {
      canInstall = canAfford && !atLimit
    }

    // Slot cost label for tooltip
    let slotText = ''
    if      (upgrade.usesUpgradeSlot && upgrade.usesWeaponSlot) slotText = '1 upgrade slot + 1 weapon slot'
    else if (upgrade.usesUpgradeSlot)                           slotText = '1 upgrade slot'
    else if (upgrade.usesWeaponSlot)                            slotText = '1 weapon slot'
    else if (upgrade.effect === 'ammo')                         slotText = 'No slot cost'

    const statChange = getUpgradeStatChange(upgrade)
    const tipLines   = [upgrade.desc, statChange, slotText ? `Costs: ${slotText}` : null,
                        `Price: ${upgrade.price.toLocaleString()} cr`].filter(Boolean).join('\n')

    // Badge
    let badgeHtml = ''
    if (upgrade.effect === 'ammo' && fittedCount > 0) {
      badgeHtml = ` <span class="upgrade-count-badge">×${fittedCount} in hold</span>`
    } else if (fittedCount > 0 && upgrade.limit !== 1) {
      badgeHtml = ` <span class="upgrade-count-badge">×${fittedCount} fitted</span>`
    }

    // Button
    let btnHtml
    if (alreadyFitted) {
      btnHtml = `<button class="btn-install btn-fitted" disabled>✓ Fitted</button>`
    } else if (!prereqMet) {
      btnHtml = `<button class="btn-install" disabled title="Requires ${upgrade.requiresUpgrade}">Need launcher</button>`
    } else if (upgrade.effect === 'ammo') {
      btnHtml = `<button class="btn-install" ${canInstall ? '' : 'disabled'} onclick="installUpgrade(${upgrade.idx})">Buy ×5</button>`
    } else {
      btnHtml = `<button class="btn-install" ${canInstall ? '' : 'disabled'} onclick="installUpgrade(${upgrade.idx})">Install</button>`
    }

    const row = document.createElement('div')
    row.className = 'upgrade-row' + (alreadyFitted ? ' upgrade-fitted' : '')
    row.innerHTML =
      `<div class="upgrade-info">` +
        `<div class="upgrade-name">${upgrade.name}${badgeHtml}</div>` +
        `<div class="upgrade-effect">${upgrade.desc}</div>` +
        `<div class="upgrade-tooltip-box">${tipLines.replace(/\n/g, '<br>')}</div>` +
      `</div>` +
      `<div class="upgrade-price">${upgrade.price.toLocaleString()} cr</div>` +
      btnHtml
    listEl.appendChild(row)
  }

  mainItems.forEach(renderItem)

  if (ammoItems.length > 0) {
    const hdr = document.createElement('div')
    hdr.className = 'upgrade-ammo-section-hdr'
    hdr.innerText = 'Ammunition'
    listEl.appendChild(hdr)
    ammoItems.forEach(renderItem)
  }
}

function getUpgradeStatChange(upgrade) {
  const statMap = { cargo: 'cargo', speed: 'speed', turn_rate: 'turn_rate', inertia: 'inertia', hull: 'hull' }
  const key = statMap[upgrade.effect]
  if (!key) return null
  const cur  = player.ship[key]
  const next = cur + upgrade.delta
  return `${key.replace('_', ' ')}: ${cur} → ${next}`
}

function installUpgrade(upgradeIdx) {
  const upgrade = GAME_UPGRADES[upgradeIdx]
  if (!upgrade) return
  if (player.credits < upgrade.price) return

  const slots    = player.weaponSlots ?? []
  const upgrades = player.upgrades    ?? []

  // Slot & prerequisite checks
  if (upgrade.usesUpgradeSlot && player.ship.upgrade_slots <= 0) return
  if (upgrade.usesWeaponSlot  && !slots.includes('Laser Cannon')) return
  if (upgrade.requiresUpgrade && !slots.includes(upgrade.requiresUpgrade)) return
  if (upgrade.limit > 0 && upgrade.effect !== 'ammo') {
    const fitted = upgrade.usesWeaponSlot
      ? slots.filter(w => w === upgrade.name).length
      : upgrades.filter(n => n === upgrade.name).length
    if (fitted >= upgrade.limit) return
  }

  player.credits -= upgrade.price
  if (typeof playerStats !== 'undefined') playerStats.creditsSpent += upgrade.price

  // Consume slots
  if (upgrade.usesUpgradeSlot) player.ship.upgrade_slots--
  if (upgrade.usesWeaponSlot) {
    const li = player.weaponSlots.indexOf('Laser Cannon')
    if (li >= 0) player.weaponSlots[li] = upgrade.name
  }

  // Record installation (upgrade-slot items, excluding weapon-slot-only items and ammo)
  if (!upgrade.usesWeaponSlot && upgrade.effect !== 'ammo') {
    if (!player.upgrades) player.upgrades = []
    player.upgrades.push(upgrade.name)
  }

  // Apply effect
  switch (upgrade.effect) {
    case 'cargo':
      player.ship.cargo += upgrade.delta; break
    case 'cargo_converter':
      player.ship.cargo         -= 10
      player.ship.upgrade_slots += 1   // gained back — net is +1 since usesUpgradeSlot is false
      break
    case 'speed':     player.ship.speed     += upgrade.delta; break
    case 'turn_rate': player.ship.turn_rate += upgrade.delta; break
    case 'inertia':   player.ship.inertia    = Math.max(1, player.ship.inertia + upgrade.delta); break
    case 'hull':
      player.ship.hull += upgrade.delta
      player.hp = Math.min(player.hp + upgrade.delta, player.ship.hull)
      break
    case 'shield_regen':
      player.ship.shield_regen = (player.ship.shield_regen ?? 0) + upgrade.delta; break
    case 'armaplast':
    case 'durasteel':
      player.armourMax  = (player.armourMax ?? 0) + upgrade.delta
      player.armour     = Math.min((player.armour ?? 0) + upgrade.delta, player.armourMax)
      player.ship.cargo = Math.max(0, player.ship.cargo - (upgrade.armourMass ?? 0))
      break
    case 'ammo':
      if (!player.ammoInventory) player.ammoInventory = {}
      player.ammoInventory[upgrade.ammoType] = (player.ammoInventory[upgrade.ammoType] ?? 0) + upgrade.delta
      break
    // proton_cannon, missile_launcher, rocket_launcher, special_launcher:
    //   weapon slot replacement already handled above; no additional stat change
    // damage_pct: applied at fire time via player.upgrades check
    // jump_cost, scanner_radius, auto_refuel, ramscoop, afterburner: looked up by name in game.js
  }

  updateHUD()
  if (typeof updateMissileHUD === 'function') updateMissileHUD()
  if (typeof updateSidePanel  === 'function') updateSidePanel()
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
    const legalCommodities = GAME_COMMODITIES.filter(c => !c.illegal)
    const c     = legalCommodities[Math.floor(Math.random() * legalCommodities.length)]
    const qty   = 1 + Math.floor(Math.random() * 4)
    const hops  = 2 + Math.floor(Math.random() * 3)
    const reward = Math.round(c.base_price * qty * (1.8 + Math.random() * 0.8))
    return {
      id, type,
      commodityId: c.id,
      cargoQty:    qty,
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
    const qty    = 1 + Math.floor(Math.random() * 2)
    const reward = Math.round(2500 + Math.random() * 3500)
    return {
      id, type,
      commodityId: 'contraband',
      cargoQty:    qty,
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
    .filter(s => s.planets.length > 0)

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
  currentPlanet = planet
  const sys = galaxy.systems[player.system]
  const rep = (player.factionRep ?? {})[sys.faction] ?? 0
  availableMissions = rep <= -50 ? [] : generateMissions(planet)
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
  const sys2 = galaxy.systems[player.system]
  const rep2 = (player.factionRep ?? {})[sys2.faction] ?? 0
  if (availableMissions.length === 0 && rep2 <= -50) {
    const msg = document.createElement('p')
    msg.className = 'no-planets hostile-warning'
    msg.innerText = `⚠ Your standing with ${sys2.faction} is Hostile. No contracts available.`
    list2.appendChild(msg)
  } else if (availableMissions.length === 0) {
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
    const cargoUsed  = Object.values(player.cargo).reduce((s, n) => s + n, 0)
    const noRoom     = !!(m.commodityId && m.cargoQty && cargoUsed + m.cargoQty > player.ship.cargo)
    btn.className    = 'btn-accept'; btn.innerText = noRoom ? 'No room' : 'Accept'
    btn.disabled     = (player.missions?.length ?? 0) >= 5 || noRoom
    btn.onclick      = () => { acceptMission(idx); renderMissionBoard() }
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

  // Add mission cargo to player hold
  if (m.commodityId && m.cargoQty) {
    const used = Object.values(player.cargo).reduce((s, n) => s + n, 0)
    if (used + m.cargoQty > player.ship.cargo) return  // no room
    player.cargo[m.commodityId] = (player.cargo[m.commodityId] ?? 0) + m.cargoQty
    if (!player.missionCargo) player.missionCargo = {}
    player.missionCargo[m.commodityId] = (player.missionCargo[m.commodityId] ?? 0) + m.cargoQty
    computeShipStats()
    updateHUD()
  }

  player.missions.push(m)
  availableMissions.splice(idx, 1)
  AudioEngine.notify(true)
}

function abandonMission(missionId) {
  if (!player.missions) return
  const m = player.missions.find(m => m.id === missionId)
  if (m) removeMissionCargo(m)
  player.missions = player.missions.filter(m => m.id !== missionId)
  updateHUD()
}

// ─── Player info panel ────────────────────────────────────────────────────────

function openPlayerInfo() {
  document.getElementById('playerinfo-credits').innerText =
    (player.credits ?? 0).toLocaleString() + ' cr'
  renderPlayerInfo()
  showPanel('panel-playerinfo')
}

function renderPlayerInfo() {
  const body = document.getElementById('playerinfo-body')
  const s    = player.ship
  const cargoUsed  = Object.values(player.cargo).reduce((a, b) => a + b, 0)
  const cargoFree  = s.cargo - cargoUsed
  const upgradesOn = player.upgrades ?? []
  const slotsUsed  = upgradesOn.length
  const slotsTotal = s.upgrade_slots + slotsUsed  // current slots + used = original total

  // ── Ship stats ──
  const ms       = player._mass
  const massLine = ms
    ? `${ms.hull_mass_t} T hull + ${ms.cargo_mass_t.toFixed(1)} T cargo = ${ms.totalMass_t.toFixed(1)} T (${Math.round(ms.mass_ratio * 100)}% thrust)`
    : '—'
  const statRows = [
    ['Hull',          `${player.hp} / ${s.hull}`],
    ['Shield',        `${Math.round(player.shield ?? 0)} / ${s.shield ?? 0}  (regen ${s.shield_regen ?? 0}/s)`],
    ...(player.armourMax > 0 ? [['Armour', `${player.armour} / ${player.armourMax}`]] : []),
    ['Speed',         s.speed],
    ['Turn Rate',     s.turn_rate],
    ['Inertia',       s.inertia],
    ['Weapon Slots',  s.weapon_slots],
    ['Upgrade Slots', `${player.ship.upgrade_slots} remaining (${slotsUsed} used)`],
    ['Fuel',          `${player.fuel ?? s.fuel_capacity} / ${s.fuel_capacity}`],
    ['Cargo',         `${cargoUsed} used  ·  ${cargoFree} free  ·  ${s.cargo} total`],
    ['Mass',          massLine],
  ]

  const diffLabel = player.difficulty
    ? player.difficulty.charAt(0).toUpperCase() + player.difficulty.slice(1)
    : 'Normal'

  let html = `
    <div class="pi-section">
      <div class="pi-ship-name">${s.name} <span class="pi-tier">Tier ${s.tier}</span> <span class="pi-difficulty diff-${player.difficulty ?? 'normal'}">${diffLabel}</span></div>
      <div class="pi-stat-grid">
        ${statRows.map(([l,v]) => `<div class="pi-stat-label">${l}</div><div class="pi-stat-val">${v}</div>`).join('')}
      </div>
    </div>`

  // ── Cargo contents ──
  const cargoEntries = Object.entries(player.cargo).filter(([,q]) => q > 0)
  html += `<div class="pi-section-title">Cargo Hold</div><div class="pi-section">`
  if (cargoEntries.length === 0) {
    html += `<div class="pi-empty">Empty</div>`
  } else {
    html += `<div class="pi-cargo-list">`
    for (const [id, qty] of cargoEntries) {
      const com     = GAME_COMMODITIES.find(c => c.id === id)
      const label   = com ? com.label : id
      const mission = player.missionCargo?.[id] > 0
      html += `<div class="pi-cargo-row">
        <span class="pi-cargo-name">${label}${mission ? ' <span class="illegal-badge">MISSION</span>' : ''}</span>
        <span class="pi-cargo-qty">${qty}t</span>
      </div>`
    }
    html += `</div>`
  }
  html += `</div>`

  // ── Weapons (weapon slots) ──
  const wslots = player.weaponSlots ?? []
  html += `<div class="pi-section-title">Weapons</div><div class="pi-section">`
  if (wslots.length === 0) {
    html += `<div class="pi-empty">No weapon slots</div>`
  } else {
    const wCounts = {}
    for (const w of wslots) wCounts[w] = (wCounts[w] ?? 0) + 1
    html += `<div class="pi-upgrade-list">`
    for (const [name, count] of Object.entries(wCounts)) {
      html += `<div class="pi-upgrade-row"><span class="pi-upgrade-name">${name}${count > 1 ? ` ×${count}` : ''}</span><span class="pi-upgrade-eff"></span></div>`
    }
    html += `</div>`
  }
  html += `</div>`

  // ── Ammo inventory ──
  const ammoInv = player.ammoInventory ?? {}
  const ammoEntries = Object.entries(ammoInv).filter(([,q]) => q > 0)
  if (ammoEntries.length > 0) {
    html += `<div class="pi-section-title">Ammunition</div><div class="pi-section"><div class="pi-upgrade-list">`
    for (const [type, qty] of ammoEntries) {
      const label = (typeof AMMO_LABEL !== 'undefined' && AMMO_LABEL[type]) || type
      html += `<div class="pi-upgrade-row"><span class="pi-upgrade-name">${label}</span><span class="pi-upgrade-eff">×${qty}</span></div>`
    }
    html += `</div></div>`
  }

  // ── Fitted upgrades ──
  html += `<div class="pi-section-title">Fitted Upgrades</div><div class="pi-section">`
  if (upgradesOn.length === 0) {
    html += `<div class="pi-empty">None installed</div>`
  } else {
    const counts = {}
    for (const n of upgradesOn) counts[n] = (counts[n] ?? 0) + 1
    html += `<div class="pi-upgrade-list">`
    for (const [name, count] of Object.entries(counts)) {
      const def = GAME_UPGRADES.find(u => u.name === name)
      const eff = def ? def.desc : ''
      html += `<div class="pi-upgrade-row">
        <span class="pi-upgrade-name">${name}${count > 1 ? ` ×${count}` : ''}</span>
        <span class="pi-upgrade-eff">${eff}</span>
      </div>`
    }
    html += `</div>`
  }
  html += `</div>`

  // ── Active missions ──
  const missions = player.missions ?? []
  html += `<div class="pi-section-title">Active Missions</div><div class="pi-section">`
  if (missions.length === 0) {
    html += `<div class="pi-empty">No active missions</div>`
  } else {
    html += `<div class="pi-mission-list">`
    for (const m of missions) {
      const hops = m.hopsLeft !== undefined ? `  ·  ${m.hopsLeft} jump${m.hopsLeft !== 1 ? 's' : ''} left` : ''
      html += `<div class="pi-mission-row">
        <span class="pi-mission-name">${m.title}</span>
        <span class="pi-mission-meta">${m.target.systemName}${hops}</span>
        <span class="pi-mission-reward">+${m.reward.toLocaleString()} cr</span>
      </div>`
    }
    html += `</div>`
  }
  html += `</div>`

  // ── Faction standing ──
  const factionRep = player.factionRep ?? {}
  html += `<div class="pi-section-title">Faction Standing</div><div class="pi-section"><div class="pi-rep-list">`
  for (const f of GAME_FACTIONS) {
    const val   = factionRep[f.name] ?? 0
    const label = getRepLabel(val)
    const cls   = label === 'Allied' || label === 'Friendly' ? 'rep-good'
                : label === 'Hostile'     ? 'rep-hostile'
                : label === 'Unfriendly'  ? 'rep-bad'
                : 'rep-neutral'
    html += `<div class="pi-rep-row">
      <span class="pi-rep-faction">${f.name}</span>
      <span class="pi-rep-label ${cls}">${label}</span>
      <span class="pi-rep-val">${val > 0 ? '+' : ''}${val}</span>
    </div>`
  }
  html += `</div></div>`

  body.innerHTML = html
}

// ─── Active missions panel ────────────────────────────────────────────────────

function openActiveMissions() {
  document.getElementById('activemissions-credits').innerText =
    (player.credits ?? 0).toLocaleString()
  renderActiveMissions()
  showPanel('panel-activemissions')
}

function renderActiveMissions() {
  const body = document.getElementById('activemissions-body')
  body.innerHTML = ''
  const active = player.missions ?? []
  if (active.length === 0) {
    const p = document.createElement('p')
    p.className = 'no-planets'; p.innerText = 'No active missions.'
    body.appendChild(p)
    return
  }
  const list = document.createElement('div')
  list.className = 'mission-list'
  active.forEach(m => {
    const card = buildMissionCard(m, true)
    // Rewire abandon to also refresh this panel
    const btn = card.querySelector('.btn-abandon')
    if (btn) btn.onclick = () => { abandonMission(m.id); renderActiveMissions() }
    list.appendChild(card)
  })
  body.appendChild(list)
}

// ─── Mission complete popup ───────────────────────────────────────────────────

const MISSION_FLAVOR = {
  delivery:  ['Package delivered. Contract fulfilled.', 'Goods received. Payment incoming.', 'Delivery confirmed. Well done, Commander.'],
  smuggling: ['Contraband offloaded. No questions asked.', 'Contact satisfied. Credits transferred.', 'Shipment received. Stay off the scanners.'],
  bounty:    ['Target eliminated. Bounty confirmed.', 'Contract closed. Good hunting, Commander.']
}

function checkMissionCompletions() {
  if (!player.missions?.length) return
  const sysId = galaxy.systems[player.system].id
  const completing = player.missions.filter(
    m => (m.type === 'delivery' || m.type === 'smuggling') && m.target.systemId === sysId
  )
  if (completing.length === 0) return

  // Remove cargo and missions from active list now; credits awarded on collect
  for (const m of completing) removeMissionCargo(m)
  player.missions = player.missions.filter(m => !completing.some(c => c.id === m.id))
  updateHUD()

  missionCompleteQueue = [...completing]
  showNextMissionComplete()
}

function showNextMissionComplete() {
  const popup = document.getElementById('popup-mission-complete')
  if (missionCompleteQueue.length === 0) { popup.classList.add('hidden'); return }

  const m       = missionCompleteQueue[0]
  const flavors = MISSION_FLAVOR[m.type] ?? ['Contract fulfilled.']
  const flavor  = flavors[Math.floor(Math.random() * flavors.length)]

  const badge = document.getElementById('popup-mission-type-badge')
  badge.innerText   = MISSION_TYPE_LABEL[m.type] || m.type
  badge.className   = `mission-type-badge mission-type-${m.type}`

  document.getElementById('popup-mission-title').innerText  = m.title
  document.getElementById('popup-mission-flavor').innerText = flavor
  document.getElementById('popup-mission-reward').innerText = `+${m.reward.toLocaleString()} credits`

  const counter = document.getElementById('popup-mission-counter')
  counter.innerText = missionCompleteQueue.length > 1
    ? `${missionCompleteQueue.length} missions to collect`
    : ''

  popup.classList.remove('hidden')
}

function collectMissionReward() {
  if (missionCompleteQueue.length === 0) return
  const m = missionCompleteQueue.shift()
  player.credits += m.reward
  // Stats
  if (typeof playerStats !== 'undefined') {
    playerStats.creditsEarned += m.reward
    playerStats.missionsCompleted++
  }
  // Faction rep
  const targetSys = galaxy.systems.find(s => s.id === m.target?.systemId)
  if (targetSys) {
    adjustRep(targetSys.faction, m.type === 'smuggling' ? 5 : 8)
    if (m.type === 'smuggling') adjustRep('Federation Navy', -8)
  }
  updateHUD()
  AudioEngine.notify(true)
  showNextMissionComplete()
}

// ─── Save slot picker ─────────────────────────────────────────────────────────

function openSaveSlotPicker(mode, caller, callback) {
  slotPickerMode     = mode
  slotPickerCaller   = caller
  slotPickerCallback = callback
  renderSaveSlotPicker()
  if (caller === 'menu')       document.getElementById('screen-menu').classList.add('hidden')
  if (caller === 'difficulty') document.getElementById('screen-difficulty').classList.add('hidden')
  if (caller === 'gameover')   document.getElementById('screen-gameover').classList.add('hidden')
  document.getElementById('screen-save-slots').classList.remove('hidden')
}

function renderSaveSlotPicker() {
  const titles = { newgame: 'Choose Save Slot', load: 'Load Game' }
  document.getElementById('save-slots-title').innerText = titles[slotPickerMode] ?? 'Save Game'

  const listEl = document.getElementById('save-slots-list')
  listEl.innerHTML = ''

  const slots = getAllSaveMeta()
  for (const { slot, meta } of slots) {
    const card = document.createElement('div')
    const isEmpty = !meta
    const isDisabled = isEmpty && slotPickerMode === 'load'
    card.className = 'save-slot-card' +
      (isEmpty    ? ' save-slot-empty'    : '') +
      (isDisabled ? ' save-slot-disabled' : '')

    if (!isDisabled) card.onclick = () => confirmSlotAction(slot)

    if (isEmpty) {
      card.innerHTML =
        `<div class="save-slot-number">Slot ${slot}</div>` +
        `<div class="save-slot-empty-label">Empty Slot</div>`
    } else {
      const d    = new Date(meta.timestamp)
      const date = d.toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' })
      const time = d.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' })
      const diffLabel = meta.difficulty
        ? meta.difficulty.charAt(0).toUpperCase() + meta.difficulty.slice(1)
        : 'Normal'
      card.innerHTML =
        `<div class="save-slot-number">Slot ${slot}</div>` +
        `<div class="save-slot-info">` +
          `<div class="save-slot-ship">${meta.shipName}</div>` +
          `<div class="save-slot-meta">${meta.systemName}  ·  ${meta.credits.toLocaleString()} cr  ·  ${diffLabel}  ·  ${meta.jumps} jumps</div>` +
        `</div>` +
        `<div class="save-slot-time">${date}<br>${time}</div>`
    }

    listEl.appendChild(card)
  }
}

function confirmSlotAction(slot) {
  if (slotPickerMode === 'load') {
    document.getElementById('screen-save-slots').classList.add('hidden')
    if (!loadGame(slot)) { alert('Save data could not be loaded.'); return }
    gameState = 'playing'
    document.getElementById('screen-menu').classList.add('hidden')
    document.getElementById('screen-gameover').classList.add('hidden')
    document.getElementById('hud').classList.remove('hidden')
    // Returning players skip the tutorial
    document.getElementById('tutorial-card').classList.add('hidden')
  } else {
    // newgame mode
    document.getElementById('screen-save-slots').classList.add('hidden')
    if (slotPickerCallback) slotPickerCallback(slot)
  }
}

function cancelSaveSlotPicker() {
  document.getElementById('screen-save-slots').classList.add('hidden')
  if (slotPickerCaller === 'difficulty') document.getElementById('screen-difficulty').classList.remove('hidden')
  else document.getElementById('screen-menu').classList.remove('hidden')
}

// ─── Statistics panel ─────────────────────────────────────────────────────────

function openStats() {
  document.getElementById('stats-credits').innerText = (player.credits ?? 0).toLocaleString() + ' cr'
  renderStats()
  showPanel('panel-stats')
}

function renderStats() {
  const body = document.getElementById('stats-body')
  const s    = typeof playerStats !== 'undefined' ? playerStats : {}
  const earned = s.creditsEarned ?? 0
  const spent  = s.creditsSpent  ?? 0

  const rows = [
    ['Total Jumps',         s.jumpsTotal         ?? 0],
    ['Planets Visited',     s.planetsVisited      ?? 0],
    ['Enemies Destroyed',   s.enemiesDestroyed    ?? 0],
    ['Missions Completed',  s.missionsCompleted   ?? 0],
    ['Cargo Traded (units)', s.cargoTraded        ?? 0],
    ['Credits Earned',      (earned).toLocaleString() + ' cr'],
    ['Credits Spent',       (spent).toLocaleString()  + ' cr'],
    ['Net Profit',          (earned - spent).toLocaleString() + ' cr']
  ]

  body.innerHTML = `<div class="stats-grid">${
    rows.map(([l, v]) => `<div class="stats-label">${l}</div><div class="stats-value">${v}</div>`).join('')
  }</div>`
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
  if (!hasSave(currentSlot)) return
  closePauseMenu()
  if (!loadGame(currentSlot)) { alert('Save data could not be loaded.'); return }
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
  missile:   'Fire Missile',
  boost:     'Boost',
  info:      'Commander Status',
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

  // Game over buttons — reload current session slot, no picker
  document.getElementById('btn-gameover-load').onclick = () => {
    if (!hasSave(currentSlot)) return
    document.getElementById('screen-gameover').classList.add('hidden')
    if (!loadGame(currentSlot)) { alert('Save data could not be loaded.'); return }
    gameState = 'playing'
    document.getElementById('hud').classList.remove('hidden')
  }
  document.getElementById('btn-gameover-load').style.display = hasSave(currentSlot) ? '' : 'none'
  document.getElementById('btn-gameover-new').onclick = () => {
    document.getElementById('screen-gameover').classList.add('hidden')
    startNewGame()
  }

  // Save slot picker back button
  document.getElementById('btn-save-slots-back').onclick = cancelSaveSlotPicker

  // Pause menu buttons
  document.getElementById('btn-pause-resume').onclick  = closePauseMenu
  document.getElementById('btn-pause-save').onclick    = pauseSaveGame
  document.getElementById('btn-pause-load').onclick    = pauseLoadGame
  document.getElementById('btn-pause-options').onclick = () => openOptions('pause')
  document.getElementById('btn-pause-quit').onclick    = pauseQuitToMenu
  document.getElementById('btn-pause-stats').onclick   = () => { closePauseMenu(); openStats() }

  // Difficulty picker buttons
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => confirmDifficulty(btn.dataset.diff))
  })
  document.getElementById('btn-diff-back').onclick = cancelDifficultyPicker

  // Volume sliders
  const optMusic = document.getElementById('opt-music')
  const optSfx   = document.getElementById('opt-sfx')
  if (optMusic) optMusic.addEventListener('input', () => AudioEngine.setMusicVolume(+optMusic.value))
  if (optSfx)   optSfx.addEventListener('input',   () => AudioEngine.setSfxVolume(+optSfx.value))

  // Options tab buttons
  document.querySelectorAll('.opt-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => showOptionsTab(btn.dataset.tab))
  })

  // Credits
  document.getElementById('btn-credits').onclick       = openCredits
  document.getElementById('btn-credits-back').onclick  = closeCredits

  // Tutorial card
  document.getElementById('btn-tutorial-next').onclick = advanceTutorial
  document.getElementById('btn-tutorial-skip').onclick = skipTutorial

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
  openDifficultyPicker()
}

function openDifficultyPicker() {
  document.getElementById('screen-menu').classList.add('hidden')
  document.getElementById('screen-gameover').classList.add('hidden')
  document.getElementById('screen-difficulty').classList.remove('hidden')
}

function confirmDifficulty(diff) {
  openSaveSlotPicker('newgame', 'difficulty', slot => {
    deleteSave(slot)
    currentSlot = slot
    gameState = 'playing'
    document.getElementById('hud').classList.remove('hidden')
    initGame(diff)
  })
}

function cancelDifficultyPicker() {
  document.getElementById('screen-difficulty').classList.add('hidden')
  document.getElementById('screen-menu').classList.remove('hidden')
}

function loadSavedGame() {
  openSaveSlotPicker('load', 'menu', null)
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

// ─── Credits screen ───────────────────────────────────────────────────────────

function openCredits() {
  gameState = 'credits'
  document.getElementById('screen-menu').classList.add('hidden')
  document.getElementById('screen-credits').classList.remove('hidden')
}

function closeCredits() {
  gameState = 'menu'
  document.getElementById('screen-credits').classList.add('hidden')
  document.getElementById('screen-menu').classList.remove('hidden')
}

initMenuUI()

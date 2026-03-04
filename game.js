const canvas = document.getElementById('gameCanvas')
const ctx    = canvas.getContext('2d')

let galaxy
let player
let systemStates = new Map()

// Game state: 'title' | 'menu' | 'options' | 'playing'
let gameState = 'title'
let paused    = false

// ─── Keybindings ──────────────────────────────────────────────────────────────

const DEFAULT_KEYBINDS = {
  thrust:    'w',
  brake:     's',
  turnLeft:  'a',
  turnRight: 'd',
  land:      'l',
  map:       'm',
  jump:      'j',
  fire:      ' ',
  missile:   'x',
  cycleAmmo: 'v',
  boost:     'b',
  target:    'Tab',
  info:      'i',
  pause:     'Escape'
}

const BOOST_DURATION = 3    // seconds boost lasts
const BOOST_COOLDOWN = 7    // seconds before boost is available again
const BOOST_ACCEL    = 3.0  // acceleration multiplier during boost
const BOOST_VMAX     = 2.5  // top speed multiplier during boost

const DIFF_SETTINGS = {
  easy:   { credits: 3000, piracyMult: 0.6,  damageMult: 0.7  },
  normal: { credits: 1000, piracyMult: 1.0,  damageMult: 1.0  },
  hard:   { credits: 500,  piracyMult: 1.3,  damageMult: 1.35 }
}

let keybinds = { ...DEFAULT_KEYBINDS }

function loadKeybinds() {
  try {
    const saved = JSON.parse(localStorage.getItem('hs_keybinds') || 'null')
    if (saved) keybinds = { ...DEFAULT_KEYBINDS, ...saved }
  } catch {}
}

function saveKeybinds() {
  localStorage.setItem('hs_keybinds', JSON.stringify(keybinds))
}

// Case-insensitive match for action keys (single-char or named keys like 'Escape')
function matchKey(pressed, binding) {
  if (pressed === binding) return true
  if (binding.length === 1) return pressed.toLowerCase() === binding.toLowerCase()
  return false
}

// Check if a movement key is currently held (handles caps lock)
function isKeyHeld(k) {
  if (keys[k]) return true
  if (k.length === 1) return !!(keys[k.toLowerCase()] || keys[k.toUpperCase()])
  return false
}

// ─── Input ────────────────────────────────────────────────────────────────────

const keys = {}
document.addEventListener('keydown', e => {
  if (e.key === 'Tab') e.preventDefault()   // always block browser tab-focus
  keys[e.key] = true; handleActionKey(e.key)
})
document.addEventListener('keyup', e => { keys[e.key] = false })

function handleActionKey(key) {
  if (gameState !== 'playing' || jumpState) return

  // Pause key: close galaxy map → close panel → toggle pause
  if (matchKey(key, keybinds.pause)) {
    if (galaxyMapOpen) { closeGalaxyMap(); return }
    if (activePanel)   { closePanel();     return }
    paused ? closePauseMenu() : openPauseMenu()
    return
  }

  // M while map open — close it (checked before paused guard since map sets paused)
  if (matchKey(key, keybinds.map) && galaxyMapOpen) { closeGalaxyMap(); return }

  // I — commander status panel (toggle; works while paused too)
  if (matchKey(key, keybinds.info) && !galaxyMapOpen) {
    if (activePanel === 'panel-playerinfo') { closePanel(); return }
    if (!activePanel) { openPlayerInfo(); return }
  }

  if (paused) return

  // L — land
  if (matchKey(key, keybinds.land) && !activePanel && nearPlanet && !player.landedPlanet) {
    player.vx = 0
    player.vy = 0
    player.landedPlanet = nearPlanet
    openLanding(nearPlanet)
  }

  // M — toggle galaxy map
  if (matchKey(key, keybinds.map) && !activePanel) {
    galaxyMapOpen ? closeGalaxyMap() : openGalaxyMap()
  }

  // B — boost (Afterburner extends to 5 s)
  if (matchKey(key, keybinds.boost) && !activePanel && !galaxyMapOpen &&
      !player.landedPlanet && boostTimer <= 0 && boostCooldown <= 0) {
    const fuel = player.fuel ?? player.ship.fuel_capacity
    if (fuel > 0) {
      player.fuel = fuel - 1
      boostTimer  = player.upgrades?.includes('Afterburner') ? 5 : BOOST_DURATION
      updateFuelHUD()
    }
  }

  // Tab — cycle target
  if (matchKey(key, keybinds.target)  && !activePanel && !galaxyMapOpen) cycleNavTarget()

  // Space — fire weapon
  if (matchKey(key, keybinds.fire)    && !activePanel && !galaxyMapOpen) firePlayerWeapon()

  // X — fire missile / rocket
  if (matchKey(key, keybinds.missile) && !activePanel && !galaxyMapOpen) fireMissile()

  // V — cycle ammo type
  if (matchKey(key, keybinds.cycleAmmo) && !activePanel && !galaxyMapOpen) cycleAmmo()

  // J — initiate jump
  if (matchKey(key, keybinds.jump) && !activePanel && !galaxyMapOpen) initiateJump()
}

// ─── View transform (galaxy map overlay) ─────────────────────────────────────

let viewScale   = 1
let viewOffsetX = 0
let viewOffsetY = 0

const MIN_SCALE = 0.30
const MAX_SCALE = 4.0

function toWorld(sx, sy) {
  return { x: (sx - viewOffsetX) / viewScale, y: (sy - viewOffsetY) / viewScale }
}

function zoomAt(sx, sy, factor) {
  const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, viewScale * factor))
  const delta    = newScale / viewScale
  viewOffsetX    = sx - (sx - viewOffsetX) * delta
  viewOffsetY    = sy - (sy - viewOffsetY) * delta
  viewScale      = newScale
}

function resetView() {
  viewScale = 1
  if (galaxyMapOpen && galaxy) {
    // Centre galaxy map on current system
    const sys = galaxy.systems[player.system]
    viewOffsetX = canvas.width  / 2 - sys.x
    viewOffsetY = canvas.height / 2 - sys.y
  } else {
    viewOffsetX = 0
    viewOffsetY = 0
  }
}

// ─── Galaxy map state ─────────────────────────────────────────────────────────

let galaxyMapOpen = false
let isPanning     = false
let panMoved      = false
let panStartX     = 0, panStartY  = 0
let panOriginX    = 0, panOriginY = 0
let mouseX        = 0, mouseY     = 0
let mouseScreenX  = 0, mouseScreenY = 0
let hoveredSystem = null

function openGalaxyMap() {
  if (activePanel || jumpState) return
  galaxyMapOpen = true
  paused = true
  document.getElementById('overlay-map').classList.remove('hidden')
  // Auto-centre on current system
  const sys = galaxy.systems[player.system]
  viewScale   = 1
  viewOffsetX = canvas.width  / 2 - sys.x
  viewOffsetY = canvas.height / 2 - sys.y
}

function closeGalaxyMap() {
  galaxyMapOpen = false
  paused = false
  document.getElementById('overlay-map').classList.add('hidden')
}

// ─── System layout ────────────────────────────────────────────────────────────

let systemLayout  = null
let nearPlanet    = null

// ─── NPC Traders ──────────────────────────────────────────────────────────────

let planetMarkets = new Map()  // planet.id → persistent market object
let npcTraders    = []
const TRADER_COUNT = 30

const LAND_RADIUS        = 70    // world units — enter to see landing prompt
const DEPART_SPEED       = 50    // world units/s — outward nudge on departure
const JUMP_MIN_DISTANCE  = 400   // world units from all planets before jump
const TRADER_JUMP_DIST   = JUMP_MIN_DISTANCE * 2  // 800 — traders fly this far before jumping
const TRADER_SPEED       = 130   // world units/second for departing/arriving traders

function buildSystemLayout(sys) {
  const count = Math.max(sys.planets.length, 1)
  systemLayout = {
    planets: sys.planets.map((planet, i) => {
      const angle  = (sys.id * 2.618 + i * (Math.PI * 2 / count)) % (Math.PI * 2)
      const radius = 640 + i * 520 + ((sys.id * 37 + i * 23) % 260)
      return { ...planet, sx: Math.cos(angle) * radius, sy: Math.sin(angle) * radius }
    })
  }
}

function checkNearPlanet() {
  if (!systemLayout || activePanel || player.landedPlanet) { nearPlanet = null; return }
  nearPlanet = null
  for (const p of systemLayout.planets) {
    if (Math.hypot(player.x - p.sx, player.y - p.sy) < LAND_RADIUS) { nearPlanet = p; break }
  }
}

// ─── Jump system ──────────────────────────────────────────────────────────────

let jumpTarget    = null  // system id of selected destination, or null
let jumpState     = null  // { phase, timer, targetId, angle } during animation
let jumpWarning   = null  // { msg, timer } — fades out on-screen warning
let missionNotify = null  // { text, timer, success } — mission complete/fail banner

let jumpCount    = 0       // total jumps made this session
let nextEventAt  = 5       // jumpCount value at which next event fires
let activeEvents = []      // { name, effect, jumpsLeft, systemId?, commodityId? }
let eventAlert   = null    // { title, desc, timer } — big event banner

// ── Phase 14 — Visual polish ──────────────────────────────────────────────────
let particles    = []      // { x, y, vx, vy, life, maxLife, color, size }
let nebulaFields = []      // { x, y, radius, hue } — galaxy map nebula clouds
let wasThrusting = false   // for thrust audio toggle

// ── Tutorial ──────────────────────────────────────────────────────────────────
let tutorialStep = null    // 0-4 while active, null when inactive

const TUTORIAL_STEPS = [
  {
    title: 'Piloting Your Ship',
    body:  'Use <strong>W / A / S / D</strong> to fly — W thrusts forward, S brakes, A/D rotate.<br>Press <strong>B</strong> for a short speed boost.'
  },
  {
    title: 'Landing on Planets',
    body:  'Fly close to a planet — it pulses <span style="color:#5599ff">blue</span> when in landing range.<br>Press <strong>L</strong> to land and access its facilities.'
  },
  {
    title: 'Trading',
    body:  'Visit a planet\'s <strong>Market</strong> to buy commodities cheap and sell them elsewhere for profit.<br>Cargo space is limited — choose wisely.'
  },
  {
    title: 'Galaxy Map &amp; Jump Targets',
    body:  'Press <strong>M</strong> to open the Galaxy Map.<br>Click a connected system to set it as your jump target.'
  },
  {
    title: 'Jumping Between Systems',
    body:  'Fly away from all planets until <strong>JUMP READY</strong> appears in the HUD, then press <strong>J</strong>.<br>Fuel is finite — refuel at planets before you\'re stranded!'
  }
]

function initTutorial() {
  if (localStorage.getItem('hs_tutorial_done')) { tutorialStep = null; return }
  tutorialStep = 0
  renderTutorialCard()
  document.getElementById('tutorial-card').classList.remove('hidden')
}

function renderTutorialCard() {
  if (tutorialStep === null) return
  const step = TUTORIAL_STEPS[tutorialStep]
  document.getElementById('tutorial-step-label').innerText =
    `Step ${tutorialStep + 1} of ${TUTORIAL_STEPS.length}`
  document.getElementById('tutorial-title').innerText = ''
  document.getElementById('tutorial-title').textContent = ''
  // Use innerHTML for step title so HTML entities render
  document.getElementById('tutorial-title').innerHTML = step.title
  document.getElementById('tutorial-body').innerHTML  = step.body
  const nextBtn = document.getElementById('btn-tutorial-next')
  nextBtn.innerText = tutorialStep === TUTORIAL_STEPS.length - 1 ? 'Done ✓' : 'Next →'
}

function advanceTutorial() {
  if (tutorialStep === null) return
  if (tutorialStep >= TUTORIAL_STEPS.length - 1) {
    completeTutorial()
  } else {
    tutorialStep++
    renderTutorialCard()
  }
}

function completeTutorial() {
  tutorialStep = null
  localStorage.setItem('hs_tutorial_done', '1')
  document.getElementById('tutorial-card').classList.add('hidden')
}

function skipTutorial() {
  completeTutorial()
}

// ── Phase 21 — QoL ────────────────────────────────────────────────────────────
let autopilot            = null             // planet object (with .sx,.sy) when autopilot active
let priceHistory         = new Map()        // 'planetId:commodityId' → [last 5 buy prices]
let missionCompleteQueue = []               // missions awaiting collect-reward popup
let boostTimer           = 0               // seconds remaining on active boost
let boostCooldown        = 0               // seconds until boost is available again
let navCombatTarget      = null            // explicitly TAB-locked enemy

// ── Phase 19 — Faction reputation + statistics ────────────────────────────────
let playerStats = {
  jumpsTotal: 0, creditsEarned: 0, creditsSpent: 0,
  missionsCompleted: 0, enemiesDestroyed: 0, cargoTraded: 0, planetsVisited: 0
}
let planetsVisitedSet = new Set()

// Pre-generated star positions for warp animation (lateral-scroll design)
const WARP_STARS = []
function initWarpStars() {
  for (let i = 0; i < 160; i++) {
    WARP_STARS.push({
      perp:       (Math.random() - 0.5) * 960,  // perpendicular offset (screen pixels)
      phase:      Math.random(),                  // position along heading axis [0, 1]
      brightness: 0.35 + Math.random() * 0.65,
      width:      0.5 + Math.random() * 1.2
    })
  }
}

function getJumpReadyStatus() {
  if (!jumpTarget) return { ready: false, reason: null }
  if (isSystemBlocked(jumpTarget)) return { ready: false, reason: 'Jump route blocked — Supernova Warning' }
  if (player.fuel <= 0) return { ready: false, reason: 'No fuel — land and refuel' }
  if (!systemLayout) return { ready: false, reason: 'No system data' }
  for (const p of systemLayout.planets) {
    const dist = Math.hypot(player.x - p.sx, player.y - p.sy)
    if (dist < JUMP_MIN_DISTANCE) {
      return { ready: false, reason: `Too close to ${p.name} — gain distance to jump` }
    }
  }
  return { ready: true, reason: null }
}

function updateJumpHUD() {
  const el = document.getElementById('sp-nav-jump')
  if (!el) return
  if (!jumpTarget || !galaxy) { el.textContent = 'No jump target'; el.className = 'sp-nav-line sp-nav-dim'; return }
  const name   = galaxy.systems[jumpTarget].name
  const status = getJumpReadyStatus()
  if (status.ready) {
    el.textContent = `JUMP READY → ${name}`
    el.className   = 'sp-nav-line sp-nav-jump-ready'
  } else {
    el.textContent = `→ ${name}`
    el.className   = 'sp-nav-line sp-nav-jump-set'
  }
}

function initiateJump() {
  const status = getJumpReadyStatus()
  if (!status.ready) {
    if (status.reason) jumpWarning = { msg: status.reason, timer: 2.5 }
    return
  }
  jumpState = { phase: 'decel', timer: 0, targetId: jumpTarget, angle: player.angle }
}

function updateJump(dt) {
  const j = jumpState
  j.timer += dt

  if (j.phase === 'decel') {
    // Exponential velocity decay to near-zero over 1.2 s
    const decay = Math.pow(0.002, dt)
    player.vx *= decay
    player.vy *= decay
    player.x  += player.vx * dt
    player.y  += player.vy * dt
    if (j.timer >= 1.2) {
      player.vx = 0; player.vy = 0
      j.phase = 'spool'; j.timer = 0
      AudioEngine.jumpSpool()
    }
  }
  else if (j.phase === 'spool') {
    if (j.timer >= 0.9) { j.phase = 'warp'; j.timer = 0; AudioEngine.jumpWarp() }
  }
  else if (j.phase === 'warp') {
    // Quadratic warp acceleration
    const warpSpd = (j.timer / 1.4) * (j.timer / 1.4) * 4000
    player.x += Math.cos(j.angle) * warpSpd * dt
    player.y += Math.sin(j.angle) * warpSpd * dt
    if (j.timer >= 1.4) {
      travel(j.targetId)
      jumpTarget = null
      j.phase = 'arrive'; j.timer = 0
      updateJumpHUD()
    }
  }
  else if (j.phase === 'arrive') {
    if (j.timer >= 0.7) jumpState = null
  }
}

// ─── Background stars (procedural tiling, parallax) ──────────────────────────

const BG_LAYERS = [
  { cellSize: 100, alpha: 0.20, size: 0.65, parallax: 0.04 },
  { cellSize:  65, alpha: 0.40, size: 1.05, parallax: 0.12 },
  { cellSize: 140, alpha: 0.58, size: 1.55, parallax: 0.28 },
]

function drawBgStars() {
  for (const { cellSize, alpha, size, parallax } of BG_LAYERS) {
    const wx = player.x * parallax
    const wy = player.y * parallax
    const x0 = Math.floor((wx - canvas.width  / 2 - cellSize) / cellSize)
    const x1 = Math.ceil ((wx + canvas.width  / 2 + cellSize) / cellSize)
    const y0 = Math.floor((wy - canvas.height / 2 - cellSize) / cellSize)
    const y1 = Math.ceil ((wy + canvas.height / 2 + cellSize) / cellSize)
    ctx.fillStyle = `rgba(185, 205, 255, ${alpha})`
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const h  = Math.abs((cx * 1234577 ^ cy * 7654321) | 0)
        const sx = cx * cellSize + (h % cellSize)
        const sy = cy * cellSize + ((h >> 8) % cellSize)
        ctx.beginPath()
        ctx.arc(sx - wx + canvas.width / 2, sy - wy + canvas.height / 2, size, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
}

// ─── Title screen stars ───────────────────────────────────────────────────────

let titleStars = []

function initTitleStars() {
  for (let i = 0; i < 220; i++) {
    titleStars.push({
      x: Math.random() * canvas.width,  y: Math.random() * canvas.height,
      vy: 0.08 + Math.random() * 0.28,  r: Math.random() < 0.07 ? 1.4 : 0.75,
      a:  0.18 + Math.random() * 0.60
    })
  }
}

function drawTitleBackground() {
  ctx.fillStyle = '#020710'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  for (const s of titleStars) {
    s.y += s.vy
    if (s.y > canvas.height) { s.y = -2; s.x = Math.random() * canvas.width }
    ctx.globalAlpha = s.a
    ctx.fillStyle   = s.r > 1 ? '#b8ccff' : '#6677aa'
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

// ─── Ship physics ─────────────────────────────────────────────────────────────

// Recompute mass-derived stats and cache on player._mass.
// Call whenever cargo, ship, or upgrades change.
function computeShipStats() {
  const hull_mass_t = player.ship.hull_mass_t ?? 200
  let   cargo_mass_t = 0
  for (const [id, qty] of Object.entries(player.cargo ?? {})) {
    const com = GAME_COMMODITIES.find(c => c.id === id)
    cargo_mass_t += (com?.mass_t ?? 1.0) * qty
  }
  const engineDef   = player.engine   ? GAME_EQUIPMENT.find(e => e.name === player.engine)   : null
  const thrusterDef = player.thruster ? GAME_EQUIPMENT.find(e => e.name === player.thruster) : null
  const equip_mass_t = (engineDef?.mass_t ?? 0) + (thrusterDef?.mass_t ?? 0)
  const totalMass_t  = hull_mass_t + cargo_mass_t + equip_mass_t
  const mass_ratio   = hull_mass_t / totalMass_t
  const thrust_mult  = engineDef   ? 1 + engineDef.thrust_ts   / 400 : 1.0
  const rcs_mult     = thrusterDef ? 1 + thrusterDef.rcs_ts    / 200 : 1.0
  player._mass = { hull_mass_t, cargo_mass_t, equip_mass_t, totalMass_t, mass_ratio, thrust_mult, rcs_mult }
}

// Shared gravity helper — applies star + planet gravity to any object with x,y,vx,vy
function applyGravity(obj, dt) {
  const starDist = Math.hypot(obj.x, obj.y)
  if (starDist > 30) {
    const grav = 15 * (350 / starDist) * (350 / starDist) * G_SCALE
    obj.vx -= (obj.x / starDist) * grav * dt
    obj.vy -= (obj.y / starDist) * grav * dt
  }
  for (const p of (systemLayout?.planets ?? [])) {
    const pdx   = obj.x - p.sx
    const pdy   = obj.y - p.sy
    const pdist = Math.hypot(pdx, pdy)
    if (pdist > 30 && pdist < 800) {
      const { g: pg, radius: pr } = getPlanetGravity(p)
      const grav = pg * (pr / pdist) * (pr / pdist) * G_SCALE
      obj.vx -= (pdx / pdist) * grav * dt
      obj.vy -= (pdy / pdist) * grav * dt
    }
  }
}

// Gravity parameters by planet type
function getPlanetGravity(planet) {
  const G_CONFIGS = {
    trade_hub:    { g: 6.0, radius: 400 },
    military:     { g: 5.0, radius: 360 },
    industrial:   { g: 4.0, radius: 340 },
    mining:       { g: 3.5, radius: 300 },
    agricultural: { g: 3.0, radius: 280 },
    frontier:     { g: 1.5, radius: 200 }
  }
  return G_CONFIGS[planet.type] ?? { g: 3.0, radius: 280 }
}

const G_SCALE = 0.15  // global gravity strength scale

function updatePhysics(dt) {
  if (dt === 0 || activePanel || player.landedPlanet || galaxyMapOpen || paused) return

  // Boost timers (Afterburner: auto-re-trigger while B is held)
  if (boostTimer > 0) {
    boostTimer -= dt
    if (boostTimer <= 0) {
      const holdingBoost = isKeyHeld(keybinds.boost) && !activePanel && !galaxyMapOpen && !player.landedPlanet
      if (player.upgrades?.includes('Afterburner') && holdingBoost && (player.fuel ?? 0) > 0) {
        player.fuel = Math.max(0, (player.fuel ?? 0) - 1)
        boostTimer  = 5
        updateFuelHUD()
      } else {
        boostTimer = 0; boostCooldown = BOOST_COOLDOWN
      }
    }
  } else if (boostCooldown > 0) {
    boostCooldown = Math.max(0, boostCooldown - dt)
  }
  const boosting = boostTimer > 0

  // Mass ratio: 1.0 when empty, lower when heavy cargo reduces performance
  const mass_ratio = player._mass?.mass_ratio ?? 1.0

  const thrust_mult = player._mass?.thrust_mult ?? 1.0
  const rcs_mult    = player._mass?.rcs_mult    ?? 1.0
  const TURN_BASE  = player.ship.turn_rate * 25 * Math.PI / 180 * rcs_mult
  const ACCEL_BASE = player.ship.speed     * 20 * (boosting ? BOOST_ACCEL : 1) * thrust_mult
  const VMAX_BASE  = player.ship.speed     * 30 * (boosting ? BOOST_VMAX  : 1) * thrust_mult
  const DAMP       = Math.exp(-dt / (player.ship.inertia / 3))

  // Cargo scales performance: full hold reduces accel and top speed noticeably
  const TURN  = TURN_BASE  * Math.pow(mass_ratio, 0.6)  // rotation degrades less than linear
  const ACCEL = ACCEL_BASE * mass_ratio
  const VMAX  = VMAX_BASE  * Math.pow(mass_ratio, 0.4)

  // Angular momentum — rotation has inertia, not instant
  const angAccel = TURN * 5  // steady-state angular rate = TURN rad/s
  if (isKeyHeld(keybinds.turnLeft))  player.angularVelocity -= angAccel * dt
  if (isKeyHeld(keybinds.turnRight)) player.angularVelocity += angAccel * dt
  player.angularVelocity *= Math.exp(-5 * dt)  // 0.2 s time constant
  player.angle += player.angularVelocity * dt

  if (isKeyHeld(keybinds.thrust)) {
    player.vx += Math.cos(player.angle) * ACCEL * dt
    player.vy += Math.sin(player.angle) * ACCEL * dt
  }
  if (isKeyHeld(keybinds.brake)) {
    player.vx -= Math.cos(player.angle) * ACCEL * 0.6 * dt
    player.vy -= Math.sin(player.angle) * ACCEL * 0.6 * dt
  }

  // Autopilot — cancel on manual input
  if (autopilot && (isKeyHeld(keybinds.thrust) || isKeyHeld(keybinds.brake) ||
      isKeyHeld(keybinds.turnLeft) || isKeyHeld(keybinds.turnRight))) {
    autopilot = null
  }

  // Autopilot steering
  if (autopilot) {
    const dx   = autopilot.sx - player.x
    const dy   = autopilot.sy - player.y
    const dist = Math.hypot(dx, dy)
    if (dist < LAND_RADIUS) {
      const ap = autopilot; autopilot = null
      player.vx = 0; player.vy = 0
      player.angularVelocity = 0
      player.landedPlanet = ap
      openLanding(ap)
    } else {
      const targetAngle = Math.atan2(dy, dx)
      let   diff        = targetAngle - player.angle
      while (diff >  Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      if (Math.abs(diff) > 0.08) {
        player.angularVelocity += Math.sign(diff) * angAccel * dt * 0.7
      } else {
        player.vx += Math.cos(player.angle) * ACCEL * dt
        player.vy += Math.sin(player.angle) * ACCEL * dt
      }
    }
  }

  // Gravity wells — star at (0,0) and each planet
  let gravX = 0, gravY = 0
  const starDist = Math.hypot(player.x, player.y)
  if (starDist > 30) {
    const grav = 15 * (350 / starDist) * (350 / starDist) * G_SCALE
    gravX -= (player.x / starDist) * grav
    gravY -= (player.y / starDist) * grav
  }
  for (const p of (systemLayout?.planets ?? [])) {
    const pdx  = player.x - p.sx
    const pdy  = player.y - p.sy
    const pdist = Math.hypot(pdx, pdy)
    if (pdist > LAND_RADIUS && pdist < 800) {
      const { g: pg, radius: pr } = getPlanetGravity(p)
      const grav = pg * (pr / pdist) * (pr / pdist) * G_SCALE
      gravX -= (pdx / pdist) * grav
      gravY -= (pdy / pdist) * grav
    }
  }
  player.vx += gravX * dt
  player.vy += gravY * dt
  player._gravMag = Math.hypot(gravX, gravY)

  const spd = Math.hypot(player.vx, player.vy)
  if (spd > VMAX) { player.vx = (player.vx / spd) * VMAX; player.vy = (player.vy / spd) * VMAX }
  player.vx *= DAMP
  player.vy *= DAMP
  player.x  += player.vx * dt
  player.y  += player.vy * dt
}

// ─── Star sprites ─────────────────────────────────────────────────────────────

const STAR_SPRITE_PATHS = {
  yellow:       'Sprites/stars/star_yellow.png',
  yellow_white: 'Sprites/stars/star_yellow_white.png',
  orange:       'Sprites/stars/star_orange.png',
  red_dwarf:    'Sprites/stars/star_red_dwarf.png',
  white:        'Sprites/stars/star_white.png',
  blue:         'Sprites/stars/star_blue.png',
  red_giant:    'Sprites/stars/star_red_giant.png',
  blue_giant:   'Sprites/stars/star_blue_giant.png',
  purple:       'Sprites/stars/star_purple.png',
  neutron:      'Sprites/stars/star_neutron.png',
}

// Weighted pool — each system ID hashes into this to get a stable star type
const STAR_TYPE_POOL = [
  ...Array(20).fill('yellow'),
  ...Array(15).fill('yellow_white'),
  ...Array(15).fill('orange'),
  ...Array(20).fill('red_dwarf'),
  ...Array(10).fill('white'),
  ...Array(8).fill('blue'),
  ...Array(6).fill('red_giant'),
  ...Array(4).fill('blue_giant'),
  ...Array(1).fill('purple'),
  ...Array(1).fill('neutron'),
]

const STAR_SPRITES = {}

function loadStarSprites() {
  for (const [name, path] of Object.entries(STAR_SPRITE_PATHS)) {
    const img = new Image()
    img.src   = path
    STAR_SPRITES[name] = img
  }
}

function getSystemStarType(sysId) {
  const h = ((sysId * 2654435761) >>> 0) % STAR_TYPE_POOL.length
  return STAR_TYPE_POOL[h]
}

function getStarSprite(sysId) {
  const img = STAR_SPRITES[getSystemStarType(sysId)]
  return (img && img.complete && img.naturalWidth > 0) ? img : null
}

// ─── Ship sprites ─────────────────────────────────────────────────────────────

const SHIP_SPRITES = {}   // ship name → Image

const SHIP_SPRITE_PATHS = {
  // Player / purchasable ships
  'Rustrunner Shuttle':    'Sprites/Ships/Rustrunner_Shuttle.png',
  'Cinder Scout':          'Sprites/Ships/Cinder_Scout.png',
  'Mercury Courier':       'Sprites/Ships/Mercury_Courier.png',
  'Atlas Freighter':       'Sprites/Ships/Atlas_Freighter.png',
  'Drake Raider':          'Sprites/Ships/Drake_Raider.png',
  'Nova Trader':           'Sprites/Ships/Nova_Trader.png',
  'Falcon Interceptor':    'Sprites/Ships/Falcon_Interceptor.png',
  'Orion Gunship':         'Sprites/Ships/Orion_Gunship.png',
  'Titan Hauler':          'Sprites/Ships/Titan_Hauler.png',
  'Viper Strikecraft':     'Sprites/Ships/Viper_Strikecraft.png',
  'Sentinel Frigate':      'Sprites/Ships/Sentinel_Frigate.png',
  'Leviathan Freighter':   'Sprites/Ships/Leviathan_Freighter.png',
  'Phantom Stealth':       'Sprites/Ships/Phantom_Stealth.png',
  'Aegis Destroyer':       'Sprites/Ships/Aegis_Destroyer.png',
  'Celestial Dreadnought': 'Sprites/Ships/Celestial_Dreadnought.png',
  'Matts Ship':            'Sprites/Ships/Matts_Ship.png',
  // NPC ships
  'npc_pirate_light':      'Sprites/Ships/npc_pirate_light.png',
  'npc_pirate_heavy':      'Sprites/Ships/npc_pirate_heavy.png',
  'npc_trader':            'Sprites/Ships/npc_trader.png',
}

function loadShipSprites() {
  for (const [name, path] of Object.entries(SHIP_SPRITE_PATHS)) {
    const img = new Image()
    img.src   = path
    SHIP_SPRITES[name] = img
  }
}

function getShipSprite(name) {
  const img = SHIP_SPRITES[name]
  return (img && img.complete && img.naturalWidth > 0) ? img : null
}

// ─── Planet sprites ────────────────────────────────────────────────────────────

const PLANET_SPRITE_VARIANTS = {
  agricultural: 4,
  mining:       4,
  industrial:   3,
  trade_hub:    3,
  military:     3,
  frontier:     3,
}

const PLANET_SPRITES = {}
let   moonSprite     = null

function loadPlanetSprites() {
  for (const [type, count] of Object.entries(PLANET_SPRITE_VARIANTS)) {
    for (let i = 1; i <= count; i++) {
      const key = `${type}_${i}`
      const img = new Image()
      img.src   = `Sprites/planets/planet_${type}_${i}.png`
      PLANET_SPRITES[key] = img
    }
  }
  moonSprite     = new Image()
  moonSprite.src = 'Sprites/planets/moon.png'
}

function hashStr(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

function getPlanetSprite(planet) {
  const count = PLANET_SPRITE_VARIANTS[planet.type]
  if (!count) return null
  const idx = (hashStr(planet.name) % count) + 1
  const img = PLANET_SPRITES[`${planet.type}_${idx}`]
  return (img && img.complete && img.naturalWidth > 0) ? img : null
}

function planetHasMoon(planet) {
  return hashStr(planet.name + 'moon') % 4 === 0   // ~1-in-4 planets
}

function getMoonSprite() {
  return (moonSprite && moonSprite.complete && moonSprite.naturalWidth > 0) ? moonSprite : null
}

function spriteSize(hull) {
  return Math.round(Math.max(56, Math.min(192, 80 * Math.sqrt(hull / 100))))
}


// ─── System view draw ─────────────────────────────────────────────────────────

function drawSystemView() {
  ctx.fillStyle = '#020710'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  drawBgStars()

  const camX = canvas.width  / 2 - player.x
  const camY = canvas.height / 2 - player.y
  ctx.save()
  ctx.translate(camX, camY)

  // Sun
  ctx.save()
  const _starSprite = getStarSprite(galaxy.systems[player.system].id)
  if (_starSprite) {
    ctx.drawImage(_starSprite, -160, -160, 320, 320)
  } else {
    ctx.shadowColor = '#ffdd66'; ctx.shadowBlur = 50
    ctx.fillStyle   = '#fff3bb'
    ctx.beginPath(); ctx.arc(0, 0, 120, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()

  // Planets
  const atmoTime = Date.now() / 10000
  for (const p of (systemLayout?.planets ?? [])) {
    const isNear = (p === nearPlanet)
    const radius = isNear ? 45 : 36

    // Atmosphere glow (outer halo, slowly rotating gradient)
    ctx.save()
    ctx.translate(p.sx, p.sy)
    ctx.rotate(atmoTime * Math.PI * 2)
    const atmoGrad = ctx.createRadialGradient(0, 0, radius, 0, 0, radius + 42)
    atmoGrad.addColorStop(0, isNear ? 'rgba(100,200,255,0.22)' : 'rgba(60,120,210,0.14)')
    atmoGrad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = atmoGrad
    ctx.beginPath(); ctx.arc(0, 0, radius + 42, 0, Math.PI * 2); ctx.fill()
    ctx.restore()

    // Planet body — sprite if loaded, else canvas circle fallback
    const pSprite = getPlanetSprite(p)
    ctx.save()
    ctx.shadowColor = isNear ? '#88ccff' : 'rgba(80,140,220,0.3)'
    ctx.shadowBlur  = isNear ? 24 : 10
    if (pSprite) {
      ctx.drawImage(pSprite, p.sx - radius, p.sy - radius, radius * 2, radius * 2)
    } else {
      ctx.fillStyle = isNear ? '#aaddff' : '#5577aa'
      ctx.beginPath(); ctx.arc(p.sx, p.sy, radius, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()

    // Moon — orbits ~1-in-4 planets, purely decorative
    if (planetHasMoon(p)) {
      const mSprite  = getMoonSprite()
      const mAngle   = Date.now() / 8000 + hashStr(p.name) * 1.3
      const mOrbit   = radius + 26
      const mx       = p.sx + Math.cos(mAngle) * mOrbit
      const my       = p.sy + Math.sin(mAngle) * mOrbit
      const mSize    = 10
      ctx.save()
      if (mSprite) {
        ctx.drawImage(mSprite, mx - mSize, my - mSize, mSize * 2, mSize * 2)
      } else {
        ctx.fillStyle = '#999999'
        ctx.beginPath(); ctx.arc(mx, my, mSize * 0.7, 0, Math.PI * 2); ctx.fill()
      }
      ctx.restore()
    }

    const dist = Math.hypot(player.x - p.sx, player.y - p.sy)
    if (dist < 700) {
      ctx.save()
      ctx.globalAlpha = Math.min(1, (700 - dist) / 300)
      ctx.font = '11px Arial'; ctx.fillStyle = '#7799bb'; ctx.textAlign = 'center'
      ctx.fillText(p.name, p.sx, p.sy - 58)
      ctx.restore()
    }
  }

  drawLoot()
  drawCivilianNPCs()
  drawEnemies()
  drawProjectiles()
  drawTraders()
  drawParticles()
  drawShip(player.x, player.y, player.angle)
  drawTargetBox()
  ctx.restore()
  drawOffscreenArrows()
  drawCombatHUD()
  drawEventLog()
  drawSystemHUD()
  drawMinimap()
}

function drawShip(wx, wy, angle) {
  const thrusting = !player.landedPlanet && !activePanel && (keys['w'] || keys['W'] || keys['s'] || keys['S'])
  const boosting  = boostTimer > 0
  ctx.save()
  ctx.translate(wx, wy)
  ctx.rotate(angle)

  if (thrusting || boosting) {
    const sz         = spriteSize(player.ship.hull)
    const cfg        = SHIP_THRUSTER[player.ship.name] || DEFAULT_THRUSTER
    const spawnChance = boosting ? 1.0 : 0.7
    if (Math.random() < spawnChance) {
      const perpAngle = angle + Math.PI / 2
      for (const nozzle of cfg.nozzles) {
        const nx = wx + Math.cos(angle + Math.PI) * (sz / 2 * nozzle.back)
                      + Math.cos(perpAngle)        * (sz / 2 * nozzle.side)
        const ny = wy + Math.sin(angle + Math.PI) * (sz / 2 * nozzle.back)
                      + Math.sin(perpAngle)        * (sz / 2 * nozzle.side)
        spawnParticles(nx, ny, player.vx, player.vy,
          boosting ? 'boost' : 'thrust',
          boosting ? cfg.count * 3 : cfg.count,
          boosting ? null : cfg)
      }
    }
  }

  const sprite = getShipSprite(player.ship.name)
  if (sprite) {
    const sz = spriteSize(player.ship.hull)
    ctx.drawImage(sprite, -sz / 2, -sz / 2, sz, sz)
  } else {
    ctx.shadowColor = 'rgba(150,200,255,0.45)'; ctx.shadowBlur = 8
    ctx.fillStyle   = '#aabfd4'; ctx.strokeStyle = '#ddeeff'; ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-4, 0); ctx.lineTo(-8, 9)
    ctx.closePath(); ctx.fill(); ctx.stroke()
  }
  ctx.restore()
}

function drawSystemHUD() {
  updateSidePanel()

  // Landing prompt (pulsing)
  if (nearPlanet && !activePanel) {
    const pulse = 0.60 + 0.40 * Math.sin(Date.now() / 1000 * 3)
    ctx.save()
    ctx.font = 'bold 13px Arial'; ctx.fillStyle = `rgba(130,200,255,${pulse})`
    ctx.textAlign = 'center'; ctx.shadowColor = 'rgba(80,160,255,0.4)'; ctx.shadowBlur = 10
    ctx.fillText(`${nearPlanet.name}  —  Press L to land`, canvas.width / 2, 74)
    ctx.restore()
  }

  // Jump warning (fades out)
  if (jumpWarning) {
    const alpha = Math.min(1, jumpWarning.timer)
    ctx.save()
    ctx.font = 'bold 12px Arial'; ctx.fillStyle = `rgba(255,150,70,${alpha})`
    ctx.textAlign = 'center'; ctx.shadowColor = 'rgba(255,110,30,0.5)'; ctx.shadowBlur = 8
    ctx.fillText(jumpWarning.msg, canvas.width / 2, 95)
    ctx.restore()
  }

  // Mission complete / fail notification
  if (missionNotify) {
    const alpha = Math.min(1, missionNotify.timer)
    ctx.save()
    ctx.font = 'bold 13px Arial'
    ctx.fillStyle   = missionNotify.success ? `rgba(100,220,130,${alpha})` : `rgba(220,100,80,${alpha})`
    ctx.shadowColor = missionNotify.success ? 'rgba(60,200,100,0.5)'       : 'rgba(200,60,50,0.5)'
    ctx.shadowBlur  = 8; ctx.textAlign = 'center'
    ctx.fillText(missionNotify.text, canvas.width / 2, 116)
    ctx.restore()
  }
}

// ─── Minimap ──────────────────────────────────────────────────────────────────

function drawMinimap() {
  if (!systemLayout || gameState !== 'playing' || jumpState) return
  const mmCanvas = document.getElementById('minimap-canvas')
  if (!mmCanvas) return
  const mc    = mmCanvas.getContext('2d')
  const cw    = mmCanvas.width
  const ch    = mmCanvas.height
  const cx    = cw / 2
  const cy    = ch / 2
  const R     = Math.min(cw, ch) / 2 - 5
  const RANGE = 2500
  const scale = R / RANGE

  // Fill entire canvas so sections below get no bleed-through
  mc.fillStyle = 'rgba(2,6,20,0.94)'
  mc.fillRect(0, 0, cw, ch)
  mc.save()
  mc.beginPath(); mc.arc(cx, cy, R, 0, Math.PI * 2)
  mc.fillStyle = 'rgba(0,4,18,0.90)'; mc.fill()
  mc.strokeStyle = 'rgba(40,80,160,0.45)'; mc.lineWidth = 1.5; mc.stroke()
  mc.beginPath(); mc.arc(cx, cy, R, 0, Math.PI * 2); mc.clip()

  // Planets
  for (const p of systemLayout.planets) {
    const rx = (p.sx - player.x) * scale
    const ry = (p.sy - player.y) * scale
    mc.beginPath(); mc.arc(cx + rx, cy + ry, 4, 0, Math.PI * 2)
    mc.fillStyle = p === autopilot ? '#88ccff' : '#4488cc'
    mc.fill()
    if (p === autopilot) {
      mc.beginPath(); mc.arc(cx + rx, cy + ry, 7, 0, Math.PI * 2)
      mc.strokeStyle = 'rgba(100,220,140,0.75)'; mc.lineWidth = 1; mc.stroke()
    }
  }

  // NPC traders in current system
  for (const t of npcTraders) {
    if (t.system !== player.system) continue
    let wx, wy
    if (t.state === 'docked') {
      const lp = systemLayout.planets.find(p => p.id === t.planet?.id)
      if (!lp) continue
      const r = 38 + (t.id % 5) * 8
      wx = lp.sx + Math.cos(t.orbitAngle) * r
      wy = lp.sy + Math.sin(t.orbitAngle) * r
    } else if (t.state === 'departing' || t.state === 'arriving') {
      wx = t.x; wy = t.y
    } else { continue }
    const rx = (wx - player.x) * scale
    const ry = (wy - player.y) * scale
    const isLocked = t === navCombatTarget
    mc.beginPath(); mc.arc(cx + rx, cy + ry, isLocked ? 3.5 : 2, 0, Math.PI * 2)
    mc.fillStyle = isLocked ? '#ff8800' : '#3ec8b8'; mc.fill()
  }

  // Civilian NPCs
  for (const c of civilianNPCs) {
    const dx = (c.x - player.x) * scale
    const dy = (c.y - player.y) * scale
    const d  = Math.hypot(dx, dy)
    const edgeR = R - 3
    const bx = d > edgeR ? cx + (dx / d) * edgeR : cx + dx
    const by = d > edgeR ? cy + (dy / d) * edgeR : cy + dy
    const isLocked = c === navCombatTarget
    mc.beginPath(); mc.arc(bx, by, isLocked ? 3.5 : 2.5, 0, Math.PI * 2)
    mc.fillStyle = isLocked ? '#ff8800' : (c.hostile ? '#ff4444' : '#44dd88'); mc.fill()
  }

  // Loot
  for (const l of lootItems) {
    const rx = (l.x - player.x) * scale
    const ry = (l.y - player.y) * scale
    mc.beginPath(); mc.arc(cx + rx, cy + ry, 2, 0, Math.PI * 2)
    mc.fillStyle = '#ffdd44'; mc.fill()
  }

  // Enemies — clamp out-of-range dots to circle edge; highlight locked target
  for (const en of enemies) {
    const dx = (en.x - player.x) * scale
    const dy = (en.y - player.y) * scale
    const d  = Math.hypot(dx, dy)
    const edgeR = R - 3
    let bx, by
    if (d > edgeR) {
      bx = cx + (dx / d) * edgeR
      by = cy + (dy / d) * edgeR
    } else {
      bx = cx + dx
      by = cy + dy
    }
    const isLocked = en === navCombatTarget
    mc.beginPath(); mc.arc(bx, by, isLocked ? 3.5 : 2.5, 0, Math.PI * 2)
    mc.fillStyle = isLocked ? '#ff8800' : '#ff4444'; mc.fill()
  }

  // Player direction line + dot
  mc.beginPath()
  mc.moveTo(cx, cy)
  mc.lineTo(cx + Math.cos(player.angle) * 9, cy + Math.sin(player.angle) * 9)
  mc.strokeStyle = '#aaddff'; mc.lineWidth = 1.5; mc.stroke()
  mc.beginPath(); mc.arc(cx, cy, 3, 0, Math.PI * 2)
  mc.fillStyle = '#ffffff'; mc.fill()

  mc.restore()
}

// ─── Jump animation draw ──────────────────────────────────────────────────────

function drawJumpEffect() {
  const j  = jumpState
  const cx = canvas.width  / 2
  const cy = canvas.height / 2

  if (j.phase === 'decel') {
    drawSystemView()
    // Subtle blue tint
    ctx.save()
    ctx.globalAlpha = 0.10; ctx.fillStyle = '#2244ff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.restore()
    drawJumpLabel('JUMP DRIVE ENGAGED', 0.75)
  }
  else if (j.phase === 'spool') {
    drawSystemView()
    const t     = j.timer / 0.9
    const pulse = 0.5 + 0.5 * Math.sin(t * 22)
    // Charging overlay
    ctx.save()
    ctx.globalAlpha = 0.18 + t * 0.12; ctx.fillStyle = '#1133ff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.restore()
    // Expanding ring at ship position
    ctx.save()
    ctx.strokeStyle = `rgba(80,180,255,${0.5 + pulse * 0.5})`
    ctx.shadowColor = 'rgba(80,160,255,0.9)'; ctx.shadowBlur = 24
    ctx.lineWidth   = 2
    ctx.beginPath(); ctx.arc(cx, cy, 18 + t * 30, 0, Math.PI * 2); ctx.stroke()
    ctx.restore()
    drawJumpLabel('JUMP DRIVE CHARGING', 0.55 + pulse * 0.45)
  }
  else if (j.phase === 'warp') {
    drawWarpLines(j)
  }
  else if (j.phase === 'arrive') {
    drawSystemView()
    // White flash that fades out
    const alpha = Math.pow(Math.max(0, 1 - j.timer / 0.7), 2)
    ctx.save()
    ctx.globalAlpha = alpha; ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.restore()
  }
}

function drawJumpLabel(text, alpha) {
  const cx = canvas.width / 2, cy = canvas.height / 2
  ctx.save()
  ctx.font = 'bold 14px Arial'; ctx.fillStyle = `rgba(130,200,255,${alpha})`
  ctx.textAlign = 'center'; ctx.shadowColor = 'rgba(80,160,255,0.6)'; ctx.shadowBlur = 10
  ctx.fillText(text, cx, cy - 50)
  ctx.restore()
}

function drawWarpLines(j) {
  ctx.fillStyle = '#010508'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const cx  = canvas.width  / 2
  const cy  = canvas.height / 2
  const t   = Math.min(j.timer / 1.4, 1)
  const spd = t * t  // quadratic ramp 0→1

  // Heading unit vector and perpendicular
  const cos = Math.cos(j.angle), sin = Math.sin(j.angle)
  const px = -sin, py = cos           // perpendicular (rotated 90°)

  // Stars scroll from front to back along the heading axis
  const span       = canvas.width * 1.5     // forward/back extent of the scroll band
  const streakLen  = spd * 550              // trail length grows with speed

  for (const star of WARP_STARS) {
    if (streakLen < 2) continue

    // Animate phase: scrolls from 0→1, wraps; stars appear to flow front→back
    const phase   = (star.phase + t * 1.1) % 1
    const forward = (0.5 - phase) * span   // maps [0,1] → [+span/2, -span/2]

    // Star head position in screen space
    const sx = cx + cos * forward + px * star.perp
    const sy = cy + sin * forward + py * star.perp

    // Trail points in the direction opposite to heading (behind the star)
    const len = streakLen * star.brightness
    const ex  = sx - cos * len
    const ey  = sy - sin * len

    // Fade at wrap seam edges so stars pop in smoothly
    const edgeFade = Math.min(phase * 9, (1 - phase) * 9, 1.0)
    const alpha    = star.brightness * Math.min(1, spd * 3) * edgeFade
    if (alpha < 0.02) continue

    const grad = ctx.createLinearGradient(sx, sy, ex, ey)
    grad.addColorStop(0, `rgba(200,220,255,${alpha})`)
    grad.addColorStop(1, 'rgba(200,220,255,0)')
    ctx.save()
    ctx.strokeStyle = grad; ctx.lineWidth = star.width
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke()
    ctx.restore()
  }

  // Ship at canvas centre during warp
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(j.angle)
  ctx.shadowColor = `rgba(100,180,255,${0.3 + spd * 0.7})`
  ctx.shadowBlur  = 10 + spd * 20
  const _warpSprite = getShipSprite(player.ship.name)
  if (_warpSprite) {
    const sz = spriteSize(player.ship.hull)
    ctx.drawImage(_warpSprite, -sz / 2, -sz / 2, sz, sz)
  } else {
    ctx.fillStyle = '#aabfd4'; ctx.strokeStyle = '#ddeeff'; ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-4, 0); ctx.lineTo(-8, 9)
    ctx.closePath(); ctx.fill(); ctx.stroke()
  }
  ctx.restore()
}

// ─── Galaxy map draw functions ────────────────────────────────────────────────

function drawGalaxyMapOverlay() {
  // Dark veil over system view
  ctx.fillStyle = 'rgba(2, 7, 22, 0.88)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Galaxy map in world space
  ctx.save()
  ctx.setTransform(viewScale, 0, 0, viewScale, viewOffsetX, viewOffsetY)
  drawNebulaFields()
  drawFactionTerritories()
  drawConnections()
  drawJumpTargetLine()
  drawSystems()
  ctx.restore()

  // Screen-space overlays
  if (hoveredSystem && hoveredSystem.id !== player.system) drawTooltip(hoveredSystem)
  drawZoomLabel()
}

function drawJumpTargetLine() {
  if (!jumpTarget) return
  const current = galaxy.systems[player.system]
  const target  = galaxy.systems[jumpTarget]
  if (!target) return
  const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 1000 * 2.8)
  ctx.save()
  ctx.shadowColor = 'rgba(80, 190, 255, 0.70)'
  ctx.shadowBlur  = 10
  ctx.strokeStyle = `rgba(100, 200, 255, ${0.50 + pulse * 0.38})`
  ctx.lineWidth   = 2
  ctx.beginPath(); ctx.moveTo(current.x, current.y); ctx.lineTo(target.x, target.y)
  ctx.stroke()
  ctx.restore()
}

function drawFactionTerritories() {
  if (!galaxy) return
  // Group all known (discovered/visited/scanned) systems by faction
  const factionSystems = new Map()
  for (const sys of galaxy.systems) {
    if (!systemStates.has(sys.id) || !sys.faction) continue
    if (!factionSystems.has(sys.faction)) factionSystems.set(sys.faction, [])
    factionSystems.get(sys.faction).push(sys)
  }

  for (const [factionName, systems] of factionSystems) {
    const faction = GAME_FACTIONS.find(f => f.name === factionName)
    if (!faction) continue
    // Radial gradient blob per system — adjacent systems blend naturally
    for (const sys of systems) {
      ctx.save()
      const r    = 160
      const grad = ctx.createRadialGradient(sys.x, sys.y, 0, sys.x, sys.y, r)
      grad.addColorStop(0,    hexToRgba(faction.color, 0.11))
      grad.addColorStop(0.55, hexToRgba(faction.color, 0.055))
      grad.addColorStop(1,    hexToRgba(faction.color, 0))
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(sys.x, sys.y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }
}

function drawConnections() {
  const drawn = new Set()
  for (const sys of galaxy.systems) {
    if (!systemStates.has(sys.id)) continue
    for (const targetId of sys.connections) {
      if (!systemStates.has(targetId)) continue
      const key = sys.id < targetId ? `${sys.id}-${targetId}` : `${targetId}-${sys.id}`
      if (drawn.has(key)) continue
      drawn.add(key)

      const target = galaxy.systems[targetId]
      const fA = GAME_FACTIONS.find(f => f.name === sys.faction)
      const fB = GAME_FACTIONS.find(f => f.name === target.faction)

      let strokeStyle
      if (sys.faction === target.faction && fA) {
        strokeStyle = hexToRgba(fA.color, 0.22)
      } else if (fA && fB) {
        const grad = ctx.createLinearGradient(sys.x, sys.y, target.x, target.y)
        grad.addColorStop(0, hexToRgba(fA.color, 0.18))
        grad.addColorStop(1, hexToRgba(fB.color, 0.18))
        strokeStyle = grad
      } else {
        strokeStyle = 'rgba(70,110,210,0.18)'
      }

      const isPlayerLane = sys.id === player.system || targetId === player.system
      ctx.save()
      ctx.beginPath(); ctx.moveTo(sys.x, sys.y); ctx.lineTo(target.x, target.y)
      if (isPlayerLane) {
        ctx.strokeStyle = strokeStyle instanceof CanvasGradient
          ? strokeStyle
          : strokeStyle.replace(/[\d.]+\)$/, '0.55)')
        ctx.lineWidth   = 1.5
        ctx.shadowColor = 'rgba(100,160,255,0.25)'; ctx.shadowBlur = 6
      } else {
        ctx.strokeStyle = strokeStyle; ctx.lineWidth = 1
      }
      ctx.stroke(); ctx.restore()
    }
  }
}

function drawSystems() {
  const time    = Date.now() / 1000
  hoveredSystem = null
  const current = galaxy.systems[player.system]
  const hitR    = 15 / viewScale

  for (const sys of galaxy.systems) {
    const state = systemStates.get(sys.id)
    if (!state) continue

    const dx = sys.x - mouseX, dy = sys.y - mouseY
    const hovered   = dx * dx + dy * dy < hitR * hitR
    if (hovered) hoveredSystem = sys

    const isPlayer    = sys.id === player.system
    const isVisited   = state === 'visited'
    const isScanned   = state === 'scanned'
    const isReachable = current.connections.includes(sys.id) && (isVisited || isScanned)
    const faction     = GAME_FACTIONS.find(f => f.name === sys.faction)

    ctx.save()
    if (isVisited) {
      ctx.shadowColor = faction ? faction.color : '#ffffff'; ctx.shadowBlur = 18
      ctx.fillStyle   = faction ? hexToRgba(faction.color, 0.92) : '#ffffff'
      ctx.beginPath(); ctx.arc(sys.x, sys.y, 5, 0, Math.PI * 2); ctx.fill()
    } else if (isScanned) {
      ctx.shadowColor = 'rgba(120,170,255,0.5)'; ctx.shadowBlur = 8
      ctx.fillStyle   = '#7a8fa0'
      ctx.beginPath(); ctx.arc(sys.x, sys.y, 4, 0, Math.PI * 2); ctx.fill()
    } else {
      // 'discovered'
      ctx.shadowColor = 'rgba(160,180,255,0.3)'; ctx.shadowBlur = 4
      ctx.fillStyle   = '#445566'
      ctx.beginPath(); ctx.arc(sys.x, sys.y, 3, 0, Math.PI * 2); ctx.fill()
    }

    // System name label (visited always; scanned at scale > 0.5)
    if (isVisited || (isScanned && viewScale > 0.5)) {
      ctx.save()
      const fs = Math.max(6, Math.round(9 / viewScale))
      ctx.font          = `${fs}px Arial`
      ctx.fillStyle     = isVisited ? '#5c7a8f' : '#3a4f5e'
      ctx.textAlign     = 'center'
      ctx.textBaseline  = 'top'
      ctx.fillText(sys.name, sys.x, sys.y + 7)
      ctx.restore()
    }

    // Hover ring — green tint if jumpable, red tint if out of range or blocked
    if (hovered && !isPlayer) {
      const jumpable = current.connections.includes(sys.id) && !isSystemBlocked(sys.id)
      ctx.shadowColor = jumpable ? 'rgba(100,255,160,0.7)' : 'rgba(255,80,80,0.35)'
      ctx.shadowBlur  = 14
      ctx.strokeStyle = jumpable ? 'rgba(100,255,160,0.65)' : 'rgba(220,80,80,0.30)'
      ctx.lineWidth   = 1
      ctx.beginPath(); ctx.arc(sys.x, sys.y, 10, 0, Math.PI * 2); ctx.stroke()
    }

    // Player position ring
    if (isPlayer) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 3)
      ctx.shadowColor = 'rgba(255,210,70,0.9)'; ctx.shadowBlur = 14
      ctx.strokeStyle = `rgba(255,210,70,${0.5 + pulse * 0.5})`; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(sys.x, sys.y, 11 + pulse * 4, 0, Math.PI * 2); ctx.stroke()
    }

    // Supernova warning ring (dashed orange)
    if (isSystemBlocked(sys.id)) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 2.5)
      ctx.save()
      ctx.strokeStyle = `rgba(255,90,40,${0.35 + pulse * 0.40})`
      ctx.shadowColor = 'rgba(255,70,30,0.55)'; ctx.shadowBlur = 16
      ctx.lineWidth = 1.5; ctx.setLineDash([3, 5])
      ctx.beginPath(); ctx.arc(sys.x, sys.y, 13, 0, Math.PI * 2); ctx.stroke()
      ctx.restore()
    }

    // Jump target ring (animated dashes)
    if (sys.id === jumpTarget) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 2.5)
      ctx.save()
      ctx.shadowColor  = 'rgba(80,220,160,0.8)'; ctx.shadowBlur = 14
      ctx.strokeStyle  = `rgba(80,220,160,${0.5 + pulse * 0.4})`; ctx.lineWidth = 2
      ctx.setLineDash([5, 5]); ctx.lineDashOffset = -(time * 8) % 10
      ctx.beginPath(); ctx.arc(sys.x, sys.y, 15, 0, Math.PI * 2); ctx.stroke()
      ctx.restore()
    }

    // Mission target marker — pulsing ring around the system node
    const sysMissions = (player?.missions ?? []).filter(m => m.target?.systemId === sys.id)
    if (sysMissions.length > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 3.5)
      ctx.save()
      ctx.shadowColor = 'rgba(255,70,70,0.80)'; ctx.shadowBlur = 12
      ctx.strokeStyle = `rgba(255,80,80,${0.50 + pulse * 0.40})`
      ctx.lineWidth   = 1.5
      ctx.beginPath(); ctx.arc(sys.x, sys.y, 10 + pulse * 2, 0, Math.PI * 2); ctx.stroke()
      ctx.restore()
    }

    ctx.restore()
  }

  // Cursor
  const hov       = hoveredSystem
  const canSelect = hov && hov.id !== player.system &&
                    systemStates.has(hov.id) &&
                    current.connections.includes(hov.id) &&
                    !isSystemBlocked(hov.id)
  canvas.style.cursor = isPanning && panMoved ? 'grabbing'
                      : canSelect             ? 'pointer'
                      :                         'grab'
}

function drawTooltip(sys) {
  const state = systemStates.get(sys.id)
  const lines = [sys.name]
  if (state === 'visited') {
    lines.push('Faction: ' + sys.faction)
    const pLabel = sys.piracyLevel < 0.3 ? 'Low' : sys.piracyLevel < 0.65 ? 'Medium' : 'High'
    lines.push('Piracy: ' + pLabel)
    lines.push('Planets: ' + sys.planets.length)
  } else if (state === 'scanned') {
    lines.push('Remotely scanned')
    lines.push('Visit for full data')
  } else {
    lines.push('Unknown system')
  }

  const current = galaxy.systems[player.system]
  if (!current.connections.includes(sys.id)) {
    lines.push('Not in jump range — travel closer first')
  } else if (isSystemBlocked(sys.id)) {
    lines.push('⚠ Jump blocked — Supernova Warning')
  }

  // Facility summary for visited systems
  if (state === 'visited' && sys.planets.length > 0) {
    const FAC_LABELS = { market:'Market', blackMarket:'Black Market', shipyard:'Shipyard',
                         upgradeShop:'Upgrades', missionBoard:'Missions', observatory:'Observatory', fuel:'Refuel' }
    for (const planet of sys.planets) {
      const avail = Object.keys(FAC_LABELS).filter(k => planet[k])
      if (avail.length > 0) {
        lines.push(`${planet.name}: ${avail.map(k => FAC_LABELS[k]).join(' · ')}`)
      }
    }
  }

  // Active missions targeting this system
  const sysMissions = (player?.missions ?? []).filter(m => m.target?.systemId === sys.id)
  if (sysMissions.length > 0) {
    lines.push('─────────────────')
    for (const m of sysMissions) lines.push('▶ ' + m.title)
  }

  const pad = 9, lh = 17, w = 260, h = lines.length * lh + pad * 2
  let tx = mouseScreenX + 16, ty = mouseScreenY - h / 2
  if (tx + w > canvas.width  - 8) tx = mouseScreenX - w - 10
  if (ty < 8)                      ty = 8
  if (ty + h > canvas.height - 8) ty = canvas.height - h - 8

  ctx.save()
  ctx.shadowColor = 'rgba(70,120,220,0.25)'; ctx.shadowBlur = 10
  ctx.fillStyle   = 'rgba(2,7,22,0.90)'; ctx.strokeStyle = 'rgba(80,130,220,0.5)'; ctx.lineWidth = 1
  roundRect(ctx, tx, ty, w, h, 5); ctx.fill(); ctx.stroke()
  ctx.shadowBlur = 0
  ctx.font = 'bold 13px Arial'; ctx.fillStyle = '#ddeeff'
  ctx.fillText(lines[0], tx + pad, ty + pad + 13)
  ctx.font = '12px Arial'
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('▶ '))       ctx.fillStyle = '#ff8888'
    else if (line.startsWith('───')) ctx.fillStyle = 'rgba(180,100,100,0.35)'
    else                             ctx.fillStyle = '#8899bb'
    ctx.fillText(line, tx + pad, ty + pad + 13 + i * lh)
  }
  ctx.restore()
}

function drawZoomLabel() {
  if (Math.abs(viewScale - 1) < 0.01) return
  ctx.save()
  ctx.font = '11px Arial'; ctx.fillStyle = 'rgba(80,120,180,0.55)'; ctx.textAlign = 'right'
  ctx.fillText(Math.round(viewScale * 100) + '%', canvas.width - 12, canvas.height - 12)
  ctx.restore()
}

// Returns true if the given system is blocked by a Supernova Warning event.
function isSystemBlocked(systemId) {
  return activeEvents.some(e => e.effect === 'system_unreachable' && e.systemId === systemId)
}

// Returns the combined price multiplier from active events for a commodity.
function getEventModifier(commodityId) {
  let mod = 1.0
  for (const e of activeEvents) {
    if (e.effect === 'commodity_prices_up' && e.commodityId === commodityId) mod *= 1.50
    if (e.effect === 'ore_prices_drop'     && commodityId === 'ore')           mod *= 0.50
    if (e.effect === 'fuel_prices_up'      && commodityId === 'fuel')          mod *= 2.00
    if (e.effect === 'plague_outbreak'     && commodityId === 'medicine')      mod *= 3.00
    if (e.effect === 'gold_rush'           && commodityId === 'luxuries')      mod *= 2.00
  }
  return mod
}

// ─── Faction reputation helpers ───────────────────────────────────────────────

function adjustRep(factionName, delta) {
  if (!player?.factionRep) return
  const cur = player.factionRep[factionName] ?? 0
  player.factionRep[factionName] = Math.max(-100, Math.min(100, cur + delta))
}

function getRepLabel(val) {
  if (val >=  75) return 'Allied'
  if (val >=  25) return 'Friendly'
  if (val >  -25) return 'Neutral'
  if (val >  -75) return 'Unfriendly'
  return 'Hostile'
}

// Returns a price multiplier based on reputation with a planet's faction.
// < 1.0 = discount (good rep), > 1.0 = penalty (bad rep)
function getRepMod(planet) {
  if (!player?.factionRep || !planet?.faction) return 1.0
  const rep = player.factionRep[planet.faction] ?? 0
  if (rep >=  50) return 0.90
  if (rep >=  25) return 0.95
  if (rep <= -50) return 1.10
  if (rep <= -25) return 1.05
  return 1.0
}

function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

function revealRadius(fromId, radius, newState) {
  const dist = new Map([[fromId, 0]])
  const queue = [fromId]
  let revealed = 0
  while (queue.length) {
    const id = queue.shift()
    const d  = dist.get(id)
    if (d >= radius) continue
    for (const cid of galaxy.systems[id].connections) {
      if (!dist.has(cid)) {
        dist.set(cid, d + 1)
        queue.push(cid)
        const prev = systemStates.get(cid)
        setSystemState(cid, newState)
        if (!prev) revealed++
      }
    }
  }
  return revealed
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y); ctx.quadraticCurveTo(x+w, y, x+w, y+r)
  ctx.lineTo(x+w, y+h-r); ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h)
  ctx.lineTo(x+r, y+h); ctx.quadraticCurveTo(x, y+h, x, y+h-r)
  ctx.lineTo(x, y+r); ctx.quadraticCurveTo(x, y, x+r, y)
  ctx.closePath()
}

// ─── Combat ───────────────────────────────────────────────────────────────────

let enemies        = []
let civilianNPCs   = []
let projectiles    = []
let lootItems      = []
let playerFireTimer = 0
let protonFireTimer = 0

const WEAPON_RANGE        = 220  // world units — enemy engages at this distance
const PROJ_SPEED          = 550  // world units/s
const PROJ_LIFETIME       = 1.8  // seconds before expiry
const PROJ_HIT_RADIUS     = 14   // world units — collision threshold
const LOOT_COLLECT_RADIUS = 55   // world units — auto-collect loot

const MISSILE_SPEED       = 210  // slower than bolts
const MISSILE_LIFETIME    = 5.0  // seconds
const MISSILE_TURN        = 2.8  // radians/second homing rate
const MISSILE_DAMAGE      = 70   // base damage per hit
const MISSILE_HIT_RADIUS  = 20   // larger hit radius than bolts

// Priority order for auto-selecting ammo when X is pressed
const AMMO_PRIORITY = [
  'homing_missile', 'standard_missile',
  'javelin', 'standard_rocket', 'cluster_rocket', 'heavy_rocket',
  'emp_round', 'nova_round'
]

// Which launcher upgrade provides each ammo type
const AMMO_LAUNCHER = {
  homing_missile:   'Missile Launcher',
  standard_missile: 'Missile Launcher',
  javelin:          'Rocket Launcher',
  standard_rocket:  'Rocket Launcher',
  cluster_rocket:   'Rocket Launcher',
  heavy_rocket:     'Rocket Launcher',
  emp_round:        'Special Weapon Launcher',
  nova_round:       'Special Weapon Launcher'
}

// Ammo display names for HUD
const AMMO_LABEL = {
  homing_missile:   'Homing Msls',
  standard_missile: 'Std Msls',
  javelin:          'Jav Rockets',
  standard_rocket:  'Std Rockets',
  cluster_rocket:   'Clstr Rockets',
  heavy_rocket:     'Hvy Rockets',
  emp_round:        'EMP Rounds',
  nova_round:       'Nova Rounds'
}

function getBoltStyle(wslots) {
  if (wslots >= 4) return 'bolt_heavy'
  if (wslots >= 2) return 'bolt_medium'
  return 'bolt_light'
}

// Weapon grade for hostile civilian NPCs — scales with ship tier
function getBoltStyleByTier(tier) {
  if (tier >= 6) return 'bolt_proton'
  if (tier >= 4) return 'bolt_heavy'
  if (tier >= 2) return 'bolt_medium'
  return 'bolt_light'
}

function clearCombat() {
  enemies         = []
  civilianNPCs    = []
  projectiles     = []
  lootItems       = []
  particles       = []
  playerFireTimer = 0
  protonFireTimer = 0
  AudioEngine.stopThrust()
  wasThrusting    = false
}

function spawnBountyTargets(sys) {
  if (!player.missions?.length) return
  for (const m of player.missions) {
    if (m.type !== 'bounty' || m.target.systemId !== sys.id) continue
    const tierMax = Math.min(5, 1 + Math.ceil(sys.piracyLevel * 4))
    const pool    = GAME_SHIPS.filter(s => s.tier >= tierMax - 1 && s.tier <= tierMax + 1)
    const ship    = Object.assign({}, pool[Math.floor(Math.random() * pool.length)] || GAME_SHIPS[2])
    const sa = Math.random() * Math.PI * 2
    const sd = 600 + Math.random() * 150
    enemies.push({
      ship,
      hp:          Math.round(ship.hull * 1.4),  // bounty target is tougher
      shield:      ship.shield ?? 0,
      shieldDelay: 0,
      x:              player.x + Math.cos(sa) * sd,
      y:              player.y + Math.sin(sa) * sd,
      angle:          sa + Math.PI,
      vx: 0, vy: 0,
      fireTimer:      1.5,
      name:           m.bountyName,
      bountyMissionId: m.id
    })
  }
}

function spawnPirates(sys) {
  const invasion    = activeEvents.some(e => e.effect === 'combat_frequency_high')
  const warEvent    = activeEvents.find(e => e.effect === 'faction_war' && e.warFactions?.includes(sys.faction))
  const diff        = DIFF_SETTINGS[player.difficulty ?? 'normal']
  let effectivePiracy = invasion ? Math.min(1.0, sys.piracyLevel * 2) : sys.piracyLevel
  if (warEvent) effectivePiracy = Math.min(1.0, effectivePiracy * 1.6)
  effectivePiracy = Math.min(1.0, effectivePiracy * diff.piracyMult)
  if (Math.random() > effectivePiracy) return
  AudioEngine.startCombatMusic()

  const maxTier = Math.max(1, Math.ceil(sys.piracyLevel * 3))
  const pool    = GAME_SHIPS.filter(s => s.tier <= maxTier)
  const count   = (sys.piracyLevel > 0.70 && Math.random() < 0.55) ? 2 : 1

  for (let i = 0; i < count; i++) {
    const ship  = Object.assign({}, pool[Math.floor(Math.random() * pool.length)])
    const sa    = Math.random() * Math.PI * 2
    const sd    = 580 + Math.random() * 200
    enemies.push({
      ship,
      hp:          ship.hull,
      shield:      ship.shield ?? 0,
      shieldDelay: 0,
      x:         player.x + Math.cos(sa) * sd,
      y:         player.y + Math.sin(sa) * sd,
      angle:     sa + Math.PI,
      vx: 0, vy: 0,
      fireTimer: 2.0 + i * 0.9
    })
  }
}

// ─── Civilian NPC logic ────────────────────────────────────────────────────────

const CIVILIAN_PATROL_RADIUS = 900
const CIVILIAN_WEAPON_RANGE  = 200

function randomPatrolPoint() {
  const a = Math.random() * Math.PI * 2
  const r = 200 + Math.random() * CIVILIAN_PATROL_RADIUS
  return { x: Math.cos(a) * r, y: Math.sin(a) * r }
}

function spawnCivilianNPCs() {
  const lo    = 1 + Math.round(Math.random())             // 1 or 2
  const hi    = 5 + Math.round(Math.random())             // 5 or 6
  const count = lo + Math.floor(Math.random() * (hi - lo + 1))
  const pool  = GAME_SHIPS.filter(s => s.tier <= 5)

  for (let i = 0; i < count; i++) {
    const ship  = { ...pool[Math.floor(Math.random() * pool.length)] }
    const sa    = Math.random() * Math.PI * 2
    const sd    = 300 + Math.random() * 600
    civilianNPCs.push({
      ship,
      hp:           ship.hull,
      shield:       ship.shield ?? 0,
      shieldDelay:  0,
      x:            Math.cos(sa) * sd,
      y:            Math.sin(sa) * sd,
      vx: 0, vy: 0,
      angle:        Math.random() * Math.PI * 2,
      fireTimer:    2 + Math.random() * 3,
      missileTimer: ship.tier >= 5 ? 4 + Math.random() * 4 : Infinity,
      hostile:      false,
      patrolTarget: randomPatrolPoint(),
      patrolTimer:  5 + Math.random() * 10
    })
  }
}

function spawnEscortNPC(missionId, tierOverride) {
  const tier = tierOverride ?? 2
  const pool = GAME_SHIPS.filter(s => s.tier === tier)
  const ship = { ...(pool[Math.floor(Math.random() * pool.length)] || GAME_SHIPS[1]) }
  const sa = Math.random() * Math.PI * 2
  const sd = 250 + Math.random() * 150
  civilianNPCs.push({
    ship,
    hp:           ship.hull,
    shield:       ship.shield ?? 0,
    shieldDelay:  0,
    x:            player.x + Math.cos(sa) * sd,
    y:            player.y + Math.sin(sa) * sd,
    vx: player.vx, vy: player.vy,
    angle:        Math.random() * Math.PI * 2,
    fireTimer:    Infinity,
    missileTimer: Infinity,
    hostile:      false,
    patrolTarget: randomPatrolPoint(),
    patrolTimer:  0,
    escort:       true,
    escortMissionId: missionId
  })
}

function updateCivilianNPCs(dt) {
  if (activePanel || player.landedPlanet) return
  for (const c of civilianNPCs) {
    // Shield regen
    if (c.shieldDelay > 0) {
      c.shieldDelay = Math.max(0, c.shieldDelay - dt)
    } else {
      const maxShield = c.ship.shield ?? 0
      if (c.shield < maxShield)
        c.shield = Math.min(maxShield, c.shield + (c.ship.shield_regen ?? 0) * dt)
    }

    const ACCEL = c.ship.speed * 20
    const VMAX  = c.ship.speed * 28
    const DAMP  = Math.exp(-dt / (c.ship.inertia / 3))
    const TURN  = c.ship.turn_rate * 25 * Math.PI / 180

    if (c.hostile) {
      // ── Hostile: chase and fire at player ─────────────────────────────────
      const dx       = player.x - c.x
      const dy       = player.y - c.y
      const dist     = Math.hypot(dx, dy)
      const toPlayer = Math.atan2(dy, dx)
      let   diff     = toPlayer - c.angle
      while (diff >  Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      c.angle += Math.min(Math.abs(diff), TURN * dt) * Math.sign(diff)

      if (dist > CIVILIAN_WEAPON_RANGE * 0.75) {
        c.vx += Math.cos(c.angle) * ACCEL * dt
        c.vy += Math.sin(c.angle) * ACCEL * dt
      }
      c.fireTimer -= dt
      if (dist < CIVILIAN_WEAPON_RANGE && Math.abs(diff) < 0.30 && c.fireTimer <= 0) {
        c.fireTimer    = 1.8 / c.ship.weapon_slots
        const spread   = (Math.random() - 0.5) * 0.18
        const fa       = c.angle + spread
        projectiles.push({
          x: c.x + Math.cos(c.angle) * 14,
          y: c.y + Math.sin(c.angle) * 14,
          vx: Math.cos(fa) * PROJ_SPEED,
          vy: Math.sin(fa) * PROJ_SPEED,
          owner: 'enemy', timer: PROJ_LIFETIME,
          style: getBoltStyleByTier(c.ship.tier), angle: fa
        })
      }
      // Missile fire — tier 5 straight, tier 6 homing
      if (c.ship.tier >= 5) {
        c.missileTimer -= dt
        if (dist < CIVILIAN_WEAPON_RANGE * 1.8 && c.missileTimer <= 0) {
          const homing = c.ship.tier >= 6
          const mspd   = MISSILE_SPEED * (homing ? 1.0 : 1.3)
          projectiles.push({
            x: c.x + Math.cos(c.angle) * 14,
            y: c.y + Math.sin(c.angle) * 14,
            vx: Math.cos(c.angle) * mspd,
            vy: Math.sin(c.angle) * mspd,
            owner: 'enemy', timer: MISSILE_LIFETIME,
            style: homing ? 'missile' : 'missile_straight',
            angle: c.angle,
            baseDmg: homing ? 70 : 55,
            hitRadius: MISSILE_HIT_RADIUS,
            homingPlayer: homing
          })
          c.missileTimer = homing ? 6 + Math.random() * 4 : 8 + Math.random() * 4
        }
      }
    } else if (c.escort) {
      // ── Escort: follow player at ~250 units ───────────────────────────────
      const dx    = player.x - c.x
      const dy    = player.y - c.y
      const dist  = Math.hypot(dx, dy)
      const toP   = Math.atan2(dy, dx)
      let   diff  = toP - c.angle
      while (diff >  Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      c.angle += Math.min(Math.abs(diff), TURN * dt) * Math.sign(diff)
      if (dist > 300) {
        c.vx += Math.cos(c.angle) * ACCEL * dt
        c.vy += Math.sin(c.angle) * ACCEL * dt
      } else if (dist < 120) {
        c.vx -= Math.cos(c.angle) * ACCEL * 0.4 * dt
        c.vy -= Math.sin(c.angle) * ACCEL * 0.4 * dt
      }
    } else {
      // ── Friendly: wander to patrol points ─────────────────────────────────
      c.patrolTimer -= dt
      const pdx   = c.patrolTarget.x - c.x
      const pdy   = c.patrolTarget.y - c.y
      const pdist = Math.hypot(pdx, pdy)
      if (pdist < 60 || c.patrolTimer <= 0) {
        c.patrolTarget = randomPatrolPoint()
        c.patrolTimer  = 8 + Math.random() * 12
      }
      const toTarget = Math.atan2(pdy, pdx)
      let   diff     = toTarget - c.angle
      while (diff >  Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      c.angle += Math.min(Math.abs(diff), TURN * dt) * Math.sign(diff)
      if (pdist > 80) {
        c.vx += Math.cos(c.angle) * ACCEL * dt
        c.vy += Math.sin(c.angle) * ACCEL * dt
      }
    }

    const spd = Math.hypot(c.vx, c.vy)
    if (spd > VMAX) { c.vx = (c.vx / spd) * VMAX; c.vy = (c.vy / spd) * VMAX }
    c.vx *= DAMP; c.vy *= DAMP
    applyGravity(c, dt)
    c.x  += c.vx * dt; c.y  += c.vy * dt

    // Thrust particles when moving
    if (spd > 15 && Math.random() < 0.4) {
      const cfg  = SHIP_THRUSTER[c.ship.name] || DEFAULT_THRUSTER
      const sz   = spriteSize(c.ship.hull)
      const perp = c.angle + Math.PI / 2
      for (const nozzle of cfg.nozzles) {
        const nx = c.x + Math.cos(c.angle + Math.PI) * (sz / 2 * nozzle.back)
                       + Math.cos(perp) * (sz / 2 * nozzle.side)
        const ny = c.y + Math.sin(c.angle + Math.PI) * (sz / 2 * nozzle.back)
                       + Math.sin(perp) * (sz / 2 * nozzle.side)
        spawnParticles(nx, ny, c.vx, c.vy, 'thrust', cfg.count, cfg)
      }
    }
  }
}

function drawCivilianNPCs() {
  for (const c of civilianNPCs) {
    const sprite = getShipSprite(c.ship.name)
    const sz     = spriteSize(c.ship.hull)

    ctx.save()
    ctx.translate(c.x, c.y)
    ctx.rotate(c.angle)
    if (sprite) {
      ctx.drawImage(sprite, -sz / 2, -sz / 2, sz, sz)
    } else {
      ctx.fillStyle   = c.hostile ? '#b85050' : '#50b890'
      ctx.strokeStyle = c.hostile ? '#ff8870' : '#7feedd'
      ctx.lineWidth   = 1.2
      ctx.beginPath()
      ctx.moveTo(13, 0); ctx.lineTo(-7, -8); ctx.lineTo(-3, 0); ctx.lineTo(-7, 8)
      ctx.closePath(); ctx.fill(); ctx.stroke()
    }
    ctx.restore()

    // Friendly/hostile status dot above ship
    ctx.save()
    ctx.beginPath()
    ctx.arc(c.x, c.y - sz / 2 - 7, 3, 0, Math.PI * 2)
    ctx.fillStyle   = c.hostile ? '#ff4444' : '#44dd88'
    ctx.shadowColor = c.hostile ? 'rgba(255,50,50,0.8)' : 'rgba(50,220,110,0.8)'
    ctx.shadowBlur  = 6
    ctx.fill()
    ctx.restore()
  }
}

// Returns raw (pre-random) damage for a projectile style
function calcProjectileDamage(p) {
  if (p.baseDmg != null) return Math.random() * 15 + p.baseDmg
  if (p.style === 'bolt_proton')   return Math.random() * 20 + 84
  if (p.style === 'missile' || p.style === 'missile_straight') return Math.random() * 20 + MISSILE_DAMAGE
  const base = p.style === 'bolt_heavy' ? 42 : p.style === 'bolt_medium' ? 22 : 14
  return Math.random() * 10 + base
}

// Returns all ammo types the player has a launcher for (regardless of stock)
function getAvailableAmmoTypes() {
  const slots = player.weaponSlots ?? []
  return AMMO_PRIORITY.filter(type => slots.includes(AMMO_LAUNCHER[type]))
}

// Pick the player's selected ammo type if it still has stock; otherwise fall
// back to the next available type in priority order.
function getSelectedAmmo() {
  const inv       = player.ammoInventory ?? {}
  const available = getAvailableAmmoTypes()
  if (available.length === 0) return null

  // Try the pinned selection first
  const pinned = player.selectedAmmoType
  if (pinned && available.includes(pinned) && (inv[pinned] ?? 0) > 0) return pinned

  // Fall back to first type with stock
  for (const type of available) {
    if ((inv[type] ?? 0) > 0) return type
  }
  return null
}

// Cycle to the next available ammo type (wraps, skips types with no launcher)
function cycleAmmo() {
  const available = getAvailableAmmoTypes()
  if (available.length <= 1) return
  const cur = player.selectedAmmoType ?? available[0]
  const idx = available.indexOf(cur)
  player.selectedAmmoType = available[(idx + 1) % available.length]
  updateMissileHUD()
  const label = AMMO_LABEL[player.selectedAmmoType] ?? player.selectedAmmoType
  missionNotify = { text: `Ammo: ${label}`, timer: 1.5, success: true }
}

function firePlayerWeapon() {
  if (player.landedPlanet || activePanel || jumpState || galaxyMapOpen) return
  const slots   = player.weaponSlots ?? []
  const lasers  = slots.filter(w => w === 'Laser Cannon').length
  const protons = slots.filter(w => w === 'Proton Cannon').length
  if (lasers === 0 && protons === 0) return

  const damageMult = player.upgrades?.includes('Targeting Computer') ? 1.10 : 1.0
  const angle = player.angle
  const cos   = Math.cos(angle), sin = Math.sin(angle)
  const baseX = player.x + cos * 16
  const baseY = player.y + sin * 16

  // Fire laser cannons
  if (lasers > 0 && playerFireTimer <= 0) {
    const style = getBoltStyle(lasers)
    const bvx = player.vx + cos * PROJ_SPEED
    const bvy = player.vy + sin * PROJ_SPEED
    if (style === 'bolt_medium') {
      for (const side of [-1, 1]) {
        projectiles.push({
          x: baseX + (-sin) * 5 * side, y: baseY + cos * 5 * side,
          vx: bvx, vy: bvy,
          owner: 'player', timer: PROJ_LIFETIME, style, angle, damageMult
        })
      }
    } else {
      projectiles.push({ x: baseX, y: baseY, vx: bvx, vy: bvy,
        owner: 'player', timer: PROJ_LIFETIME, style, angle, damageMult })
    }
    playerFireTimer = 0.5 / lasers
    spawnParticles(baseX, baseY, player.vx, player.vy, 'muzzle', style === 'bolt_heavy' ? 7 : 4)
    AudioEngine.fire()
  }

  // Fire proton cannons
  if (protons > 0 && protonFireTimer <= 0) {
    const bvx = player.vx + cos * PROJ_SPEED * 0.75
    const bvy = player.vy + sin * PROJ_SPEED * 0.75
    for (let i = 0; i < protons; i++) {
      const off = protons > 1 ? (i - (protons - 1) / 2) * 9 : 0
      projectiles.push({
        x: baseX + (-sin) * off, y: baseY + cos * off,
        vx: bvx, vy: bvy,
        owner: 'player', timer: PROJ_LIFETIME * 1.5, style: 'bolt_proton', angle, damageMult
      })
    }
    protonFireTimer = 1.5
    spawnParticles(baseX, baseY, player.vx, player.vy, 'muzzle', 10)
    AudioEngine.fire()
  }
}

function fireMissile() {
  if (!player || player.landedPlanet || activePanel || jumpState || galaxyMapOpen) return
  const ammoType = getSelectedAmmo()
  if (!ammoType) {
    missionNotify = { text: 'No ammo — buy at upgrade shops', timer: 2.0, success: false }
    return
  }
  player.ammoInventory[ammoType] = Math.max(0, (player.ammoInventory[ammoType] ?? 0) - 1)
  updateMissileHUD()

  const angle = player.angle
  const cos   = Math.cos(angle), sin = Math.sin(angle)

  // Per-ammo-type stats
  const AMMO_STATS = {
    homing_missile:   { style: 'missile',          speed: MISSILE_SPEED,        baseDmg: 70,  lifetime: MISSILE_LIFETIME, hitRadius: MISSILE_HIT_RADIUS      },
    standard_missile: { style: 'missile_straight',  speed: MISSILE_SPEED * 1.3,  baseDmg: 55,  lifetime: MISSILE_LIFETIME * 0.7, hitRadius: MISSILE_HIT_RADIUS },
    javelin:          { style: 'javelin',            speed: MISSILE_SPEED * 1.4,  baseDmg: 50,  lifetime: 2.5, hitRadius: MISSILE_HIT_RADIUS                   },
    standard_rocket:  { style: 'rocket',             speed: MISSILE_SPEED * 0.9,  baseDmg: 65,  lifetime: 3.0, hitRadius: MISSILE_HIT_RADIUS                   },
    cluster_rocket:   { style: 'cluster_rocket',     speed: MISSILE_SPEED * 0.8,  baseDmg: 45,  lifetime: 2.0, hitRadius: MISSILE_HIT_RADIUS                   },
    heavy_rocket:     { style: 'heavy_rocket',       speed: MISSILE_SPEED * 0.6,  baseDmg: 120, lifetime: 3.5, hitRadius: MISSILE_HIT_RADIUS * 1.5              },
    emp_round:        { style: 'emp_round',          speed: MISSILE_SPEED,        baseDmg: 25,  lifetime: 4.0, hitRadius: MISSILE_HIT_RADIUS * 1.5              },
    nova_round:       { style: 'nova_round',         speed: MISSILE_SPEED * 0.7,  baseDmg: 150, lifetime: 5.0, hitRadius: MISSILE_HIT_RADIUS * 2                }
  }

  const s = AMMO_STATS[ammoType]
  projectiles.push({
    x:     player.x + cos * 22,
    y:     player.y + sin * 22,
    vx:    player.vx + cos * s.speed,
    vy:    player.vy + sin * s.speed,
    owner: 'player', timer: s.lifetime, style: s.style, angle,
    baseDmg: s.baseDmg, hitRadius: s.hitRadius
  })
  AudioEngine.fire()
}

function updateShields(dt) {
  // Player shield regen — 5 s delay after last hit
  if (player.shieldDelay > 0) {
    player.shieldDelay = Math.max(0, player.shieldDelay - dt)
  } else {
    const max = player.ship.shield ?? 0
    if (player.shield < max)
      player.shield = Math.min(max, player.shield + (player.ship.shield_regen ?? 0) * dt)
  }
  // Ramscoop: passive fuel regen ~1 fuel per ~8 minutes while flying
  if (player.upgrades?.includes('Ramscoop') && !player.landedPlanet && !activePanel) {
    player.ramscoopFrac = (player.ramscoopFrac ?? 0) + 0.002 * dt
    if (player.ramscoopFrac >= 1.0) {
      player.ramscoopFrac -= 1.0
      const cap = player.ship.fuel_capacity
      if ((player.fuel ?? cap) < cap) {
        player.fuel = Math.min((player.fuel ?? cap) + 1, cap)
        updateFuelHUD()
      }
    }
  }
  // Enemy shield regen
  for (const en of enemies) {
    if (en.shieldDelay > 0) {
      en.shieldDelay = Math.max(0, en.shieldDelay - dt)
    } else {
      const max = en.ship.shield ?? 0
      if (en.shield < max)
        en.shield = Math.min(max, en.shield + (en.ship.shield_regen ?? 0) * dt)
    }
  }
}

function updateEnemies(dt) {
  if (!enemies.length || activePanel || player.landedPlanet) return
  for (const e of enemies) {
    const dx      = player.x - e.x
    const dy      = player.y - e.y
    const dist    = Math.hypot(dx, dy)
    const toPlayer = Math.atan2(dy, dx)

    // Turn toward player
    const TURN  = e.ship.turn_rate * 25 * Math.PI / 180
    let diff    = toPlayer - e.angle
    while (diff >  Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    e.angle += Math.min(Math.abs(diff), TURN * dt) * Math.sign(diff)

    // Physics: approach until in weapon range, then hold distance
    const ACCEL = e.ship.speed * 20
    const VMAX  = e.ship.speed * 30
    const DAMP  = Math.exp(-dt / (e.ship.inertia / 3))
    if (dist > WEAPON_RANGE * 0.75) {
      e.vx += Math.cos(e.angle) * ACCEL * dt
      e.vy += Math.sin(e.angle) * ACCEL * dt
    }
    const spd = Math.hypot(e.vx, e.vy)
    if (spd > VMAX) { e.vx = (e.vx / spd) * VMAX; e.vy = (e.vy / spd) * VMAX }
    e.vx *= DAMP; e.vy *= DAMP
    applyGravity(e, dt)
    e.x  += e.vx * dt; e.y  += e.vy * dt

    // Fire when roughly facing player and in range
    e.fireTimer -= dt
    if (dist < WEAPON_RANGE && Math.abs(diff) < 0.28 && e.fireTimer <= 0) {
      e.fireTimer = 1.8 / e.ship.weapon_slots
      const spread    = (Math.random() - 0.5) * 0.18  // ±5° inaccuracy
      const eAngle    = e.angle + spread
      const eStyle    = getBoltStyle(e.ship.weapon_slots)
      projectiles.push({
        x:      e.x + Math.cos(e.angle) * 14,
        y:      e.y + Math.sin(e.angle) * 14,
        vx:     Math.cos(eAngle) * PROJ_SPEED,
        vy:     Math.sin(eAngle) * PROJ_SPEED,
        owner:  'enemy',
        timer:  PROJ_LIFETIME,
        style:  eStyle,
        angle:  eAngle
      })
    }
  }
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i]

    // Homing — steer toward TAB-locked target, or nearest hostile
    if (p.style === 'missile' && p.owner === 'player') {
      const homingTargets = [...enemies, ...civilianNPCs.filter(c => c.hostile)]
      // Prefer TAB-locked target (any type); fall back to nearest hostile
      let nearest = (navCombatTarget && navCombatTarget.x != null) ? navCombatTarget : null
      if (!nearest) {
        let bestDist = Infinity
        for (const e of homingTargets) {
          const d = Math.hypot(p.x - e.x, p.y - e.y)
          if (d < bestDist) { bestDist = d; nearest = e }
        }
      }
      if (nearest) {
        const desired = Math.atan2(nearest.y - p.y, nearest.x - p.x)
        let diff = desired - p.angle
        while (diff >  Math.PI) diff -= Math.PI * 2
        while (diff < -Math.PI) diff += Math.PI * 2
        p.angle += Math.min(Math.abs(diff), MISSILE_TURN * dt) * Math.sign(diff)
        const spd = Math.hypot(p.vx, p.vy)
        p.vx = Math.cos(p.angle) * spd
        p.vy = Math.sin(p.angle) * spd
      }
      // Flame trail
      if (Math.random() < 0.5) spawnParticles(p.x, p.y, -p.vx * 0.15, -p.vy * 0.15, 'exhaust', 1)
    }

    // Enemy homing missile — steer toward player
    if (p.style === 'missile' && p.owner === 'enemy' && p.homingPlayer) {
      const desired = Math.atan2(player.y - p.y, player.x - p.x)
      let diff = desired - p.angle
      while (diff >  Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      p.angle += Math.min(Math.abs(diff), MISSILE_TURN * dt) * Math.sign(diff)
      const spd = Math.hypot(p.vx, p.vy)
      p.vx = Math.cos(p.angle) * spd
      p.vy = Math.sin(p.angle) * spd
      if (Math.random() < 0.5) spawnParticles(p.x, p.y, -p.vx * 0.15, -p.vy * 0.15, 'exhaust', 1)
    }

    if (p.style === 'missile' || p.style === 'missile_straight') applyGravity(p, dt)

    p.x    += p.vx * dt
    p.y    += p.vy * dt
    p.timer -= dt
    if (p.timer <= 0) { projectiles.splice(i, 1); continue }

    const isMissileStyle = p.style === 'missile' || p.style === 'missile_straight' ||
      p.style === 'javelin' || p.style === 'rocket' || p.style === 'cluster_rocket' ||
      p.style === 'heavy_rocket' || p.style === 'emp_round' || p.style === 'nova_round'
    const hitRadius = p.hitRadius ?? (isMissileStyle ? MISSILE_HIT_RADIUS : PROJ_HIT_RADIUS)

    let hit = false
    if (p.owner === 'player') {
      for (let j = enemies.length - 1; j >= 0; j--) {
        const enHitR = Math.max(hitRadius, spriteSize(enemies[j].ship.hull) * 0.4)
        if (Math.hypot(p.x - enemies[j].x, p.y - enemies[j].y) < enHitR) {
          const dmg = Math.round(calcProjectileDamage(p) * (p.damageMult ?? 1.0))
          const en = enemies[j]
          const enAbsorbed = Math.min(en.shield ?? 0, dmg)
          en.shield = Math.max(0, (en.shield ?? 0) - dmg)
          en.hp -= (dmg - enAbsorbed)
          en.shieldDelay = 5.0
          spawnParticles(p.x, p.y, p.vx, p.vy, isMissileStyle ? 'explosion' : 'hit', isMissileStyle ? 18 : 6)
          AudioEngine.hit()
          if (en.hp <= 0) {
            spawnParticles(en.x, en.y, en.vx, en.vy, 'explosion', 28)
            AudioEngine.explosion()
            playerStats.enemiesDestroyed++
            // Pirate kills: lose pirate rep, gain navy rep
            adjustRep('Outer Rim Pirates', -3)
            adjustRep('Federation Navy', 2)
            if (en.bountyMissionId && player.missions) {
              const bm = player.missions.find(m => m.id === en.bountyMissionId)
              if (bm) {
                player.credits += bm.reward
                playerStats.creditsEarned += bm.reward
                playerStats.missionsCompleted++
                adjustRep('Federation Navy', 5)
                adjustRep('Outer Rim Pirates', -5)
                player.missions = player.missions.filter(m => m.id !== bm.id)
                missionNotify = { text: `${bm.title}  +${bm.reward.toLocaleString()} cr`, timer: 3.5, success: true }
                AudioEngine.notify(true)
                updateHUD()
              }
            }
            spawnLoot(en); enemies.splice(j, 1)
          }
          hit = true; break
        }
      }
      // Check NPC traders — always hittable; die when hp reaches 0
      if (!hit) {
        for (let j = npcTraders.length - 1; j >= 0; j--) {
          const t = npcTraders[j]
          if (t.system !== player.system) continue
          if (t.state === 'transit') continue
          const traderHitR = Math.max(hitRadius, 20)
          if (Math.hypot(p.x - t.x, p.y - t.y) < traderHitR) {
            const dmg      = Math.round(calcProjectileDamage(p) * (p.damageMult ?? 1.0))
            const absorbed = Math.min(t.shield ?? 0, dmg)
            t.shield       = Math.max(0, (t.shield ?? 0) - dmg)
            t.hp          -= (dmg - absorbed)
            t.shieldDelay  = 5.0
            spawnParticles(p.x, p.y, p.vx, p.vy, isMissileStyle ? 'explosion' : 'hit', isMissileStyle ? 18 : 6)
            AudioEngine.hit()
            if (t.hp <= 0) {
              spawnParticles(t.x, t.y, t.vx, t.vy, 'explosion', 28)
              AudioEngine.explosion()
              playerStats.enemiesDestroyed++
              npcTraders.splice(j, 1)
            }
            hit = true; break
          }
        }
      }

      // Check civilian NPCs — always hittable; turn hostile when shot
      if (!hit) {
        for (let j = civilianNPCs.length - 1; j >= 0; j--) {
          const c = civilianNPCs[j]
          const civHitR = Math.max(hitRadius, spriteSize(c.ship.hull) * 0.4)
          if (Math.hypot(p.x - c.x, p.y - c.y) < civHitR) {
            const dmg      = Math.round(calcProjectileDamage(p) * (p.damageMult ?? 1.0))
            const absorbed = Math.min(c.shield ?? 0, dmg)
            c.shield       = Math.max(0, (c.shield ?? 0) - dmg)
            c.hp          -= (dmg - absorbed)
            c.shieldDelay  = 5.0
            c.hostile      = true
            spawnParticles(p.x, p.y, p.vx, p.vy, isMissileStyle ? 'explosion' : 'hit', isMissileStyle ? 18 : 6)
            AudioEngine.hit()
            if (c.hp <= 0) {
              spawnParticles(c.x, c.y, c.vx, c.vy, 'explosion', 28)
              AudioEngine.explosion()
              if (c.escort) {
                if (typeof failEscortMission === 'function') failEscortMission(c.escortMissionId)
              } else {
                playerStats.enemiesDestroyed++
              }
              spawnLoot(c)
              civilianNPCs.splice(j, 1)
            }
            hit = true; break
          }
        }
      }
    } else {
      if (Math.hypot(p.x - player.x, p.y - player.y) < hitRadius) {
        const diffMult = DIFF_SETTINGS[player.difficulty ?? 'normal'].damageMult
        const eDmg    = p.style === 'bolt_heavy' ? 42 : p.style === 'bolt_medium' ? 22 : 14
        let   remain  = Math.round((Math.random() * 10 + eDmg) * diffMult)
        // Shield → Armour → Hull
        const shieldAbsorb = Math.min(player.shield, remain)
        player.shield = Math.max(0, player.shield - remain)
        player.shieldDelay = 5.0
        remain -= shieldAbsorb
        if (remain > 0 && (player.armour ?? 0) > 0) {
          const armourAbsorb = Math.min(player.armour, remain)
          player.armour = Math.max(0, player.armour - remain)
          remain -= armourAbsorb
        }
        if (remain > 0) player.hp = Math.max(0, player.hp - remain)
        spawnParticles(p.x, p.y, p.vx, p.vy, 'hit', 5)
        AudioEngine.hit()
        hit = true
      }
      // Enemy shots can also hit escort NPCs
      if (!hit) {
        for (let j = civilianNPCs.length - 1; j >= 0; j--) {
          const c = civilianNPCs[j]
          if (!c.escort) continue
          const civHitR = Math.max(hitRadius, spriteSize(c.ship.hull) * 0.4)
          if (Math.hypot(p.x - c.x, p.y - c.y) < civHitR) {
            const dmg     = Math.round(calcProjectileDamage(p) * (p.damageMult ?? 1.0))
            const absorbed = Math.min(c.shield ?? 0, dmg)
            c.shield      = Math.max(0, (c.shield ?? 0) - dmg)
            c.hp         -= (dmg - absorbed)
            c.shieldDelay = 5.0
            spawnParticles(p.x, p.y, p.vx, p.vy, isMissileStyle ? 'explosion' : 'hit', isMissileStyle ? 18 : 6)
            AudioEngine.hit()
            if (c.hp <= 0) {
              spawnParticles(c.x, c.y, c.vx, c.vy, 'explosion', 28)
              AudioEngine.explosion()
              if (typeof failEscortMission === 'function') failEscortMission(c.escortMissionId)
              spawnLoot(c)
              civilianNPCs.splice(j, 1)
            }
            hit = true; break
          }
        }
      }
    }
    if (hit) projectiles.splice(i, 1)
  }
}

function spawnLoot(e) {
  const drops = 1 + Math.floor(Math.random() * 2)
  for (let i = 0; i < drops; i++) {
    const c   = GAME_COMMODITIES[Math.floor(Math.random() * GAME_COMMODITIES.length)]
    const qty = 1 + Math.floor(Math.random() * 3)
    lootItems.push({
      x:         e.x + (Math.random() - 0.5) * 70,
      y:         e.y + (Math.random() - 0.5) * 70,
      commodity: c.id,
      label:     c.label,
      qty
    })
  }
}

function checkLootCollection() {
  if (!lootItems.length || activePanel || player.landedPlanet) return
  const used = Object.values(player.cargo).reduce((s, n) => s + n, 0)
  for (let i = lootItems.length - 1; i >= 0; i--) {
    const l = lootItems[i]
    if (Math.hypot(player.x - l.x, player.y - l.y) < LOOT_COLLECT_RADIUS) {
      const take = Math.min(l.qty, player.ship.cargo - used)
      if (take > 0) {
        player.cargo[l.commodity] = (player.cargo[l.commodity] || 0) + take
        computeShipStats()
        updateHUD()
      }
      lootItems.splice(i, 1)
    }
  }
}

function triggerGameOver() {
  clearCombat()
  gameState = 'gameover'
  document.getElementById('screen-gameover').classList.remove('hidden')
  document.getElementById('hud').classList.add('hidden')
  // Show "Load Last Save" only when the current session slot has a save
  const loadBtn = document.getElementById('btn-gameover-load')
  if (loadBtn) loadBtn.style.display = hasSave(currentSlot) ? '' : 'none'
}

// ─── Combat draw ──────────────────────────────────────────────────────────────

function drawEnemies() {
  for (const e of enemies) {
    ctx.save()
    ctx.translate(e.x, e.y)
    ctx.rotate(e.angle)
    const spriteName = (e.ship.tier ?? 1) <= 2 ? 'npc_pirate_light' : 'npc_pirate_heavy'
    const sprite = getShipSprite(spriteName)
    if (sprite) {
      const sz = spriteSize(e.ship.hull)
      ctx.drawImage(sprite, -sz / 2, -sz / 2, sz, sz)
    } else {
      ctx.shadowColor = 'rgba(255,80,60,0.55)'; ctx.shadowBlur = 12
      ctx.fillStyle   = '#b85050'; ctx.strokeStyle = '#ff8870'; ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(13, 0); ctx.lineTo(-7, -8); ctx.lineTo(-3, 0); ctx.lineTo(-7, 8)
      ctx.closePath(); ctx.fill(); ctx.stroke()
    }
    ctx.restore()

    // Name label for bounty targets
    if (e.name) {
      ctx.save()
      ctx.font = 'bold 10px Arial'; ctx.fillStyle = '#ff9977'
      ctx.textAlign = 'center'; ctx.shadowColor = 'rgba(255,80,50,0.4)'; ctx.shadowBlur = 6
      ctx.fillText(e.name, e.x, e.y - 22)
      ctx.restore()
    }
  }
}

function drawProjectiles() {
  for (const p of projectiles) {
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.angle ?? Math.atan2(p.vy, p.vx))

    const ip = p.owner === 'player'

    if (p.style === 'missile' || p.style === 'missile_straight' ||
        p.style === 'javelin' || p.style === 'rocket' ||
        p.style === 'cluster_rocket' || p.style === 'heavy_rocket' ||
        p.style === 'emp_round' || p.style === 'nova_round') {
      // Color by type
      let bodyColor = '#ffcc44', noseColor = '#ffffff', tailColor = '#cc8800', glowColor = '#ff9933'
      if      (p.style === 'missile_straight') { bodyColor = '#aaffcc'; noseColor = '#ffffff'; glowColor = '#44dd88' }
      else if (p.style === 'javelin')     { bodyColor = '#88ccff'; noseColor = '#ffffff'; glowColor = '#2288ff' }
      else if (p.style === 'rocket')      { bodyColor = '#ffaa44'; glowColor = '#ff6600' }
      else if (p.style === 'cluster_rocket') { bodyColor = '#ffdd44'; glowColor = '#ffaa00' }
      else if (p.style === 'heavy_rocket') { bodyColor = '#ff5533'; glowColor = '#ff2200' }
      else if (p.style === 'emp_round')   { bodyColor = '#44ffff'; glowColor = '#00cccc' }
      else if (p.style === 'nova_round')  { bodyColor = '#ff66ff'; glowColor = '#cc00cc' }
      ctx.shadowColor = glowColor; ctx.shadowBlur = 14
      ctx.fillStyle   = bodyColor
      ctx.beginPath(); ctx.ellipse(0, 0, 11, 3.5, 0, 0, Math.PI * 2); ctx.fill()
      ctx.shadowBlur  = 0
      ctx.fillStyle   = noseColor
      ctx.beginPath(); ctx.ellipse(9, 0, 4, 2, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = tailColor
      ctx.fillRect(-11, -4, 5, 8)

    } else if (p.style === 'bolt_proton') {
      ctx.shadowColor = '#aa44ff'; ctx.shadowBlur = 26
      ctx.fillStyle   = '#cc88ff'
      ctx.fillRect(-14, -5, 24, 10)
      ctx.shadowBlur  = 0
      ctx.fillStyle   = '#ffffff'
      ctx.fillRect(-10, -2.5, 18, 5)

    } else if (p.style === 'bolt_light') {
      ctx.shadowColor = ip ? '#66ccff' : '#ff5533'
      ctx.shadowBlur  = ip ? 8 : 7
      ctx.fillStyle   = ip ? '#cceeff' : '#ffaa88'
      ctx.fillRect(-8, -1.5, 13, 3)

    } else if (p.style === 'bolt_medium') {
      ctx.shadowColor = ip ? '#33aaff' : '#ff3311'
      ctx.shadowBlur  = ip ? 14 : 12
      ctx.fillStyle   = ip ? '#88ddff' : '#ff7755'
      ctx.fillRect(-9, -2.5, 15, 5)
      // Bright core
      ctx.shadowBlur  = 0
      ctx.fillStyle   = ip ? '#ddf6ff' : '#ffccaa'
      ctx.fillRect(-6, -1.2, 10, 2.4)

    } else { // bolt_heavy
      ctx.shadowColor = ip ? '#ff8833' : '#ff0000'
      ctx.shadowBlur  = ip ? 22 : 18
      // Outer body
      ctx.fillStyle   = ip ? '#ff9944' : '#ff4422'
      ctx.fillRect(-12, -4, 21, 8)
      // Bright hot core
      ctx.shadowBlur  = 0
      ctx.fillStyle   = ip ? '#ffffcc' : '#ffbbbb'
      ctx.fillRect(-8, -2, 15, 4)
    }

    ctx.restore()
  }
}

function drawLoot() {
  const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 600)
  for (const l of lootItems) {
    ctx.save()
    ctx.shadowColor = `rgba(255,215,60,${pulse})`; ctx.shadowBlur = 14
    ctx.strokeStyle = `rgba(255,215,60,${0.45 + pulse * 0.4})`; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(l.x, l.y, 8, 0, Math.PI * 2); ctx.stroke()
    ctx.font = '11px Arial'; ctx.fillStyle = '#ccaa33'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('◆', l.x, l.y)
    if (Math.hypot(player.x - l.x, player.y - l.y) < 250) {
      ctx.font = '9px Arial'; ctx.textBaseline = 'top'; ctx.fillStyle = '#aa8822'
      ctx.fillText(`${l.label} ×${l.qty}`, l.x, l.y + 11)
    }
    ctx.restore()
  }
}

function drawHPBar(x, y, w, label, hp, maxHp, color) {
  const pct = Math.max(0, Math.min(1, hp / maxHp))
  ctx.save()
  ctx.font = '9px Arial'; ctx.fillStyle = 'rgba(120,150,190,0.75)'; ctx.textAlign = 'left'
  ctx.fillText(label, x, y - 2)
  ctx.fillStyle = 'rgba(15,25,50,0.65)'; ctx.fillRect(x, y, w, 6)
  ctx.fillStyle = color;                 ctx.fillRect(x, y, w * pct, 6)
  ctx.restore()
}

function drawCombatHUD() {
  // "Fly over loot" hint when close to pickup
  for (const l of lootItems) {
    if (Math.hypot(player.x - l.x, player.y - l.y) < 200) {
      const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 400)
      ctx.save()
      ctx.font = 'bold 12px Arial'; ctx.fillStyle = `rgba(220,185,50,${pulse})`
      ctx.textAlign = 'center'; ctx.shadowColor = 'rgba(200,155,20,0.45)'; ctx.shadowBlur = 6
      ctx.fillText('Fly over loot to collect', canvas.width / 2, 40)
      ctx.restore()
      break
    }
  }
}

// ─── NPC Trader logic ─────────────────────────────────────────────────────────

function getOrCreateMarket(planet) {
  if (!planet || !planet.market) return {}
  const key = planet.id ?? planet.name
  if (!planetMarkets.has(key)) planetMarkets.set(key, generatePlanetMarket(planet))
  return planetMarkets.get(key)
}

function initTraders() {
  npcTraders = []
  // Collect all planets with markets across the galaxy
  const slots = []
  for (const sys of galaxy.systems) {
    for (const p of sys.planets) {
      if (p.market && p.id != null) slots.push({ sys, planet: p })
    }
  }
  if (slots.length === 0) return

  for (let i = 0; i < TRADER_COUNT; i++) {
    const { sys, planet } = slots[Math.floor(Math.random() * slots.length)]
    const market   = getOrCreateMarket(planet)
    const ids      = Object.keys(market)
    const startCom = ids.length ? ids[Math.floor(Math.random() * ids.length)] : null
    npcTraders.push({
      id:          i,
      system:      sys.id,
      planet,
      state:       'docked',
      dockTimer:   1 + Math.random() * 3,
      transitTimer: 0,
      destSystem:  null,
      destPlanet:  null,
      cargo:       startCom ? { [startCom]: 3 + Math.floor(Math.random() * 5) } : {},
      orbitAngle:  Math.random() * Math.PI * 2,
      orbitSpeed:  0.25 + Math.random() * 0.35,
      x: 0, y: 0, vx: 0, vy: 0, faceAngle: 0,
      hp: 80, shield: 20, shieldDelay: 0
    })
  }
}

function findBestDestination(trader) {
  const cargoIds = Object.keys(trader.cargo)
  if (!cargoIds.length) return null

  const commodId = cargoIds[0]
  const sys      = galaxy.systems[trader.system]
  let bestSell = -1, bestDest = null

  // Check connected systems (1 hop)
  for (const connId of sys.connections) {
    for (const p of galaxy.systems[connId].planets) {
      if (!p.market || p.id == null) continue
      const m = getOrCreateMarket(p)
      if (m[commodId] && m[commodId].sell > bestSell) {
        bestSell = m[commodId].sell
        bestDest = { sysId: connId, planet: p }
      }
    }
  }

  // Also check other planets in current system
  for (const p of sys.planets) {
    if (p === trader.planet || !p.market || p.id == null) continue
    const m = getOrCreateMarket(p)
    if (m[commodId] && m[commodId].sell > bestSell) {
      bestSell = m[commodId].sell
      bestDest = { sysId: trader.system, planet: p }
    }
  }

  // Fallback: any market planet in a connected system
  if (!bestDest) {
    for (const connId of sys.connections) {
      for (const p of galaxy.systems[connId].planets) {
        if (p.market && p.id != null) return { sysId: connId, planet: p }
      }
    }
  }

  return bestDest
}

function updateTraders(dt) {
  for (const t of npcTraders) {
    t.orbitAngle += t.orbitSpeed * dt

    // Keep x/y live for docked traders so hit detection works
    if (t.state === 'docked' && t.system === player.system && systemLayout) {
      const lp = systemLayout.planets.find(p => p.id === t.planet?.id)
      if (lp) {
        const r = 38 + (t.id % 5) * 8
        t.x = lp.sx + Math.cos(t.orbitAngle) * r
        t.y = lp.sy + Math.sin(t.orbitAngle) * r
      }
    }

    // Shield regen
    if (t.shieldDelay > 0) {
      t.shieldDelay = Math.max(0, t.shieldDelay - dt)
    } else if (t.shield < 20) {
      t.shield = Math.min(20, t.shield + 4 * dt)
    }

    // ── Docked: orbiting a planet ────────────────────────────────────────────
    if (t.state === 'docked') {
      t.dockTimer -= dt
      if (t.dockTimer > 0) continue

      const market = getOrCreateMarket(t.planet)

      // Sell cargo (lower prices at this planet)
      for (const cid of Object.keys(t.cargo)) {
        if (market[cid]) applyPricePressure(market, cid, -1)
      }
      t.cargo = {}

      // Buy cheapest available commodity (raise price)
      const entries = Object.entries(market).sort((a, b) => a[1].buy - b[1].buy)
      if (entries.length > 0) {
        const cheapId = entries[0][0]
        t.cargo = { [cheapId]: 3 + Math.floor(Math.random() * 5) }
        applyPricePressure(market, cheapId, +1)
      }

      // Find best destination
      const dest = findBestDestination(t)
      if (!dest) { t.dockTimer = 3 + Math.random() * 3; continue }

      t.destSystem = dest.sysId
      t.destPlanet = dest.planet

      // Visible departure when in current system
      if (t.system === player.system && systemLayout) {
        const lp = systemLayout.planets.find(p => p.id === t.planet?.id)
        if (lp) {
          const orbitR      = 38 + (t.id % 5) * 8
          t.x               = lp.sx + Math.cos(t.orbitAngle) * orbitR
          t.y               = lp.sy + Math.sin(t.orbitAngle) * orbitR
          const departAngle = Math.atan2(lp.sy, lp.sx)   // radially outward from star
          t.vx              = Math.cos(departAngle) * TRADER_SPEED
          t.vy              = Math.sin(departAngle) * TRADER_SPEED
          t.faceAngle       = departAngle
          t.state           = 'departing'
          continue
        }
      }
      // Fallback: instant transit (other systems)
      t.state       = 'transit'
      t.transitTimer = 2 + Math.random() * 4
    }

    // ── Departing: flying outward toward jump point ──────────────────────────
    else if (t.state === 'departing') {
      // If player jumped away, skip straight to transit
      if (t.system !== player.system) {
        t.state = 'transit'; t.transitTimer = 2 + Math.random() * 4; continue
      }
      t.x += t.vx * dt
      t.y += t.vy * dt
      const lp   = systemLayout?.planets.find(p => p.id === t.planet?.id)
      const dist = lp ? Math.hypot(t.x - lp.sx, t.y - lp.sy) : TRADER_JUMP_DIST
      if (dist >= TRADER_JUMP_DIST) {
        t.state = 'transit'; t.transitTimer = 2 + Math.random() * 4
      }
    }

    // ── Transit: traveling between systems ───────────────────────────────────
    else if (t.state === 'transit') {
      t.transitTimer -= dt
      if (t.transitTimer > 0) continue

      t.system     = t.destSystem
      t.planet     = t.destPlanet
      t.destSystem = null
      t.destPlanet = null

      // Visible arrival when arriving in current system
      if (t.system === player.system && systemLayout) {
        const lp = systemLayout.planets.find(p => p.id === t.planet?.id)
        if (lp) {
          const arrAngle  = Math.atan2(lp.sy, lp.sx)
          const rad       = Math.hypot(lp.sx, lp.sy)
          t.x             = Math.cos(arrAngle) * (rad + TRADER_JUMP_DIST)
          t.y             = Math.sin(arrAngle) * (rad + TRADER_JUMP_DIST)
          const inward    = arrAngle + Math.PI   // heading toward star/planet
          t.vx            = Math.cos(inward) * TRADER_SPEED
          t.vy            = Math.sin(inward) * TRADER_SPEED
          t.faceAngle     = inward
          t.state         = 'arriving'
          continue
        }
      }
      // Fallback: instant dock
      t.state     = 'docked'
      t.dockTimer = 2 + Math.random() * 3
    }

    // ── Arriving: flying inward toward destination planet ────────────────────
    else if (t.state === 'arriving') {
      // If player jumped away, instant dock
      if (t.system !== player.system) {
        t.state = 'docked'; t.dockTimer = 2 + Math.random() * 3; continue
      }
      t.x += t.vx * dt
      t.y += t.vy * dt
      const lp = systemLayout?.planets.find(p => p.id === t.planet?.id)
      if (lp) {
        const orbitR = 38 + (t.id % 5) * 8
        if (Math.hypot(t.x - lp.sx, t.y - lp.sy) <= orbitR + 30) {
          t.state = 'docked'; t.dockTimer = 2 + Math.random() * 3
        }
      } else {
        t.state = 'docked'; t.dockTimer = 2 + Math.random() * 3
      }
    }
  }
}

function drawTraders() {
  if (!systemLayout) return
  const traderSprite = getShipSprite('npc_trader')
  for (const t of npcTraders) {
    if (t.system !== player.system) continue

    let tx, ty, angle
    if (t.state === 'docked') {
      const lp = systemLayout.planets.find(p => p.id === t.planet?.id)
      if (!lp) continue
      const r = 38 + (t.id % 5) * 8
      tx    = lp.sx + Math.cos(t.orbitAngle) * r
      ty    = lp.sy + Math.sin(t.orbitAngle) * r
      angle = t.orbitAngle + Math.PI / 2
    } else if (t.state === 'departing' || t.state === 'arriving') {
      tx    = t.x
      ty    = t.y
      angle = t.faceAngle
    } else {
      continue
    }

    ctx.save()
    ctx.translate(tx, ty)
    ctx.rotate(angle)
    if (traderSprite) {
      ctx.drawImage(traderSprite, -20, -20, 40, 40)
    } else {
      ctx.shadowColor = 'rgba(60,200,180,0.45)'; ctx.shadowBlur = 8
      ctx.fillStyle   = '#3ec8b8'; ctx.strokeStyle = '#7feedd'; ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, -7); ctx.lineTo(-5, 5); ctx.lineTo(0, 2); ctx.lineTo(5, 5)
      ctx.closePath(); ctx.fill(); ctx.stroke()
    }
    ctx.restore()
  }
}

// ─── Target box ───────────────────────────────────────────────────────────────

function drawTargetBox() {
  if (!navCombatTarget) return
  const t  = navCombatTarget
  const tx = t.x
  const ty = t.y
  if (tx == null || ty == null) return

  const half      = (t.ship ? spriteSize(t.ship.hull) * 0.55 : 22) + 8
  const cornerLen = half * 0.42

  // Colour: red = actively hostile, orange = pirate not yet in range, blue = neutral/friendly
  let boxColor, boxGlow
  const distToPlayer = Math.hypot(t.x - player.x, t.y - player.y)
  if (civilianNPCs.includes(t) && t.hostile) {
    boxColor = '#ff3333'; boxGlow = 'rgba(255,60,60,0.7)'
  } else if (enemies.includes(t) && distToPlayer < WEAPON_RANGE) {
    boxColor = '#ff3333'; boxGlow = 'rgba(255,60,60,0.7)'
  } else if (enemies.includes(t)) {
    boxColor = '#ff8800'; boxGlow = 'rgba(255,140,0,0.7)'
  } else {
    boxColor = '#88ccff'; boxGlow = 'rgba(100,200,255,0.7)'
  }

  ctx.save()
  ctx.strokeStyle = boxColor
  ctx.lineWidth   = 2.5
  ctx.lineCap     = 'square'
  ctx.shadowColor = boxGlow
  ctx.shadowBlur  = 8

  for (const [sx, sy] of [[-1,-1],[1,-1],[1,1],[-1,1]]) {
    const cx = tx + sx * half
    const cy = ty + sy * half
    ctx.beginPath()
    ctx.moveTo(cx - sx * cornerLen, cy)   // horizontal arm end
    ctx.lineTo(cx, cy)                     // corner vertex
    ctx.lineTo(cx, cy - sy * cornerLen)   // vertical arm end
    ctx.stroke()
  }

  ctx.restore()
}

// ─── Event draw ───────────────────────────────────────────────────────────────

function drawEventLog() {
  if (!activeEvents.length) return
  const x = canvas.width - 18
  let y   = canvas.height - 48 - (activeEvents.length - 1) * 14
  ctx.save()
  ctx.font = '10px Arial'; ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(220,170,55,0.52)'
  ctx.fillText('ACTIVE EVENTS', x, y)
  y += 14
  for (const e of activeEvents) {
    ctx.fillStyle = 'rgba(190,140,45,0.38)'
    ctx.fillText(`${e.name}  (${e.jumpsLeft}j)`, x, y)
    y += 13
  }
  ctx.restore()
}

function drawEventAlert() {
  if (!eventAlert) return
  const a  = Math.min(1, eventAlert.timer / 1.5)
  const cx = canvas.width  / 2
  const cy = canvas.height / 2 - 45
  ctx.save()
  ctx.textAlign = 'center'
  ctx.font      = 'bold 18px Arial'
  ctx.fillStyle = `rgba(255,195,60,${a})`
  ctx.shadowColor = 'rgba(230,150,20,0.70)'; ctx.shadowBlur = 24
  ctx.fillText(`\u26A1  ${eventAlert.title}`, cx, cy)
  ctx.font      = '13px Arial'
  ctx.fillStyle = `rgba(205,158,52,${a * 0.85})`
  ctx.shadowBlur = 8
  ctx.fillText(eventAlert.desc, cx, cy + 26)
  ctx.restore()
}

// ─── Phase 14: Particles ──────────────────────────────────────────────────────

// Per-ship thruster config.
// nozzles: array of {back, side} as fractions of sprite radius (sz/2).
//   back: 1.0 = rear edge, side: 0 = centreline, +/- = port/starboard
// spread:    lateral scatter multiplier (wider = fatter plume)
// lifeScale: particle lifetime multiplier (higher = longer visible trail)
// sizeScale: particle size multiplier
// count:     particles spawned per nozzle per frame
const SHIP_THRUSTER = {
  // ── Tier 1 ──────────────────────────────────────────────────────────────
  'Rustrunner Shuttle':    { nozzles:[{back:1.0, side:0}],                               spread:0.8, lifeScale:0.8, sizeScale:0.8, count:1 },
  'Cinder Scout':          { nozzles:[{back:1.0, side:0}],                               spread:0.7, lifeScale:0.9, sizeScale:0.8, count:1 },
  // ── Tier 2 ──────────────────────────────────────────────────────────────
  'Mercury Courier':       { nozzles:[{back:1.0, side:0}],                               spread:1.0, lifeScale:1.0, sizeScale:1.0, count:1 },
  'Atlas Freighter':       { nozzles:[{back:0.9, side:0.30}, {back:0.9, side:-0.30}],   spread:1.3, lifeScale:1.2, sizeScale:1.2, count:1 },
  'Drake Raider':          { nozzles:[{back:1.0, side:0.15}, {back:1.0, side:-0.15}],   spread:1.0, lifeScale:1.0, sizeScale:1.0, count:1 },
  // ── Tier 3 ──────────────────────────────────────────────────────────────
  'Nova Trader':           { nozzles:[{back:0.85, side:0.35}, {back:0.85, side:-0.35}], spread:1.5, lifeScale:1.3, sizeScale:1.3, count:1 },
  'Falcon Interceptor':    { nozzles:[{back:1.0, side:0}],                               spread:0.6, lifeScale:1.1, sizeScale:0.9, count:2 },
  'Orion Gunship':         { nozzles:[{back:0.9, side:0.25}, {back:0.9, side:-0.25}],   spread:1.2, lifeScale:1.2, sizeScale:1.1, count:1 },
  // ── Tier 4 ──────────────────────────────────────────────────────────────
  'Titan Hauler':          { nozzles:[{back:0.85, side:0.40}, {back:0.85, side:-0.40}], spread:2.0, lifeScale:1.6, sizeScale:1.8, count:2 },
  'Viper Strikecraft':     { nozzles:[{back:1.0, side:0}],                               spread:0.7, lifeScale:1.2, sizeScale:1.0, count:2 },
  'Sentinel Frigate':      { nozzles:[{back:0.9, side:0.30}, {back:0.9, side:-0.30}],   spread:1.5, lifeScale:1.4, sizeScale:1.4, count:1 },
  // ── Tier 5 ──────────────────────────────────────────────────────────────
  'Leviathan Freighter':   { nozzles:[{back:0.8, side:0.45}, {back:0.8, side:-0.45}],   spread:2.2, lifeScale:1.8, sizeScale:2.0, count:2 },
  'Phantom Stealth':       { nozzles:[{back:1.0, side:0}],                               spread:0.5, lifeScale:0.9, sizeScale:0.8, count:1 },
  'Aegis Destroyer':       { nozzles:[{back:0.85, side:0.38}, {back:0.85, side:-0.38}], spread:1.8, lifeScale:1.6, sizeScale:1.7, count:2 },
  // ── Tier 6 ──────────────────────────────────────────────────────────────
  'Celestial Dreadnought': { nozzles:[{back:0.8, side:0.42}, {back:0.8, side:-0.42}],   spread:2.5, lifeScale:2.0, sizeScale:2.5, count:3 },
  'Matts Ship':            { nozzles:[{back:0.8, side:0.45}, {back:0.8, side:-0.45}, {back:0.9, side:0}], spread:3.0, lifeScale:2.5, sizeScale:3.0, count:3 },
}
const DEFAULT_THRUSTER = { nozzles:[{back:1.0, side:0}], spread:1.0, lifeScale:1.0, sizeScale:1.0, count:1 }

function spawnParticles(wx, wy, baseVx, baseVy, type, count, thrustOpts) {
  const tSpread    = thrustOpts ? thrustOpts.spread    : 1.0
  const tLifeScale = thrustOpts ? thrustOpts.lifeScale : 1.0
  const tSizeScale = thrustOpts ? thrustOpts.sizeScale : 1.0
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const spd   = Math.random()
    const p     = { x: wx, y: wy }

    if (type === 'thrust') {
      p.vx      = baseVx * 0.2 - Math.cos(player.angle) * (40 + Math.random() * 80) + (Math.random() - 0.5) * 30 * tSpread
      p.vy      = baseVy * 0.2 - Math.sin(player.angle) * (40 + Math.random() * 80) + (Math.random() - 0.5) * 30 * tSpread
      p.life    = (0.20 + Math.random() * 0.18) * tLifeScale
      p.color   = Math.random() < 0.55 ? '#ff6622' : (Math.random() < 0.5 ? '#ff9933' : '#ffcc44')
      p.size    = (1.5 + Math.random() * 1.8) * tSizeScale
    } else if (type === 'muzzle') {
      p.vx      = baseVx * 0.4 + Math.cos(angle) * (50 + spd * 80)
      p.vy      = baseVy * 0.4 + Math.sin(angle) * (50 + spd * 80)
      p.life    = 0.06 + Math.random() * 0.07
      p.color   = Math.random() < 0.5 ? '#aaddff' : '#ffffff'
      p.size    = 1.0 + Math.random() * 2.0
    } else if (type === 'hit') {
      p.vx      = baseVx * 0.1 + Math.cos(angle) * (70 + spd * 130)
      p.vy      = baseVy * 0.1 + Math.sin(angle) * (70 + spd * 130)
      p.life    = 0.12 + Math.random() * 0.18
      p.color   = Math.random() < 0.5 ? '#ffcc44' : '#ff8833'
      p.size    = 1.0 + Math.random() * 2.5
    } else if (type === 'explosion') {
      p.vx      = Math.cos(angle) * (60 + spd * 250)
      p.vy      = Math.sin(angle) * (60 + spd * 250)
      p.life    = 0.55 + Math.random() * 0.85
      p.color   = spd < 0.5 ? '#ff8822' : (Math.random() < 0.5 ? '#ffdd33' : '#ff4422')
      p.size    = 2.5 + Math.random() * 5.5
    } else if (type === 'boost') {
      p.vx      = baseVx * 0.15 - Math.cos(player.angle) * (80 + Math.random() * 140) + (Math.random() - 0.5) * 50
      p.vy      = baseVy * 0.15 - Math.sin(player.angle) * (80 + Math.random() * 140) + (Math.random() - 0.5) * 50
      p.life    = 0.18 + Math.random() * 0.22
      p.color   = Math.random() < 0.5 ? '#ffaa33' : (Math.random() < 0.5 ? '#ffdd66' : '#ff6622')
      p.size    = 2.0 + Math.random() * 2.5
    } else if (type === 'exhaust') {
      // Missile flame trail — small, fast-fading orange ember
      p.vx      = baseVx + Math.cos(angle) * (20 + Math.random() * 40)
      p.vy      = baseVy + Math.sin(angle) * (20 + Math.random() * 40)
      p.life    = 0.08 + Math.random() * 0.12
      p.color   = Math.random() < 0.6 ? '#ff8833' : '#ffcc44'
      p.size    = 1.2 + Math.random() * 2.0
    }

    p.maxLife = p.life
    particles.push(p)
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.x    += p.vx * dt
    p.y    += p.vy * dt
    p.life -= dt
    if (p.life <= 0) particles.splice(i, 1)
  }
}

function drawParticles() {
  for (const p of particles) {
    const t = Math.max(0, p.life / p.maxLife)
    ctx.save()
    ctx.globalAlpha = t * 0.9
    ctx.fillStyle   = p.color
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size * (0.4 + t * 0.6), 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

// ─── Phase 14: Nebula fields (galaxy map) ─────────────────────────────────────

function generateNebulaFields() {
  nebulaFields = []
  if (!galaxy?.systems?.length) return
  // Deterministic pseudo-random positions anchored to galaxy systems
  let seed = 0xdeadbeef
  function rng() { seed = ((seed ^ (seed << 13)) ^ (seed >>> 17) ^ (seed << 5)) >>> 0; return seed / 0xffffffff }
  const count = 5 + Math.floor(rng() * 5)
  for (let i = 0; i < count; i++) {
    const anchor = galaxy.systems[Math.floor(rng() * galaxy.systems.length)]
    nebulaFields.push({
      x:      anchor.x + (rng() - 0.5) * 220,
      y:      anchor.y + (rng() - 0.5) * 220,
      radius: 100 + rng() * 260,
      hue:    Math.floor(rng() * 360)
    })
  }
}

function drawNebulaFields() {
  for (const neb of nebulaFields) {
    ctx.save()
    const grad = ctx.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, neb.radius)
    grad.addColorStop(0,   `hsla(${neb.hue},55%,35%,0.13)`)
    grad.addColorStop(0.5, `hsla(${neb.hue},45%,22%,0.07)`)
    grad.addColorStop(1,   'hsla(0,0%,0%,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(neb.x, neb.y, neb.radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

// ─── Phase 14: Off-screen planet direction arrows ─────────────────────────────

function drawOffscreenArrows() {
  if (!systemLayout?.planets?.length) return
  const camX    = canvas.width  / 2 - player.x
  const camY    = canvas.height / 2 - player.y
  const margin  = 34
  const hudTop  = 58
  const pulse   = 0.5 + 0.5 * Math.sin(Date.now() / 700)

  for (const p of systemLayout.planets) {
    const sx = p.sx + camX
    const sy = p.sy + camY
    // On-screen? Skip.
    if (sx >= margin && sx <= canvas.width - margin && sy >= hudTop && sy <= canvas.height - margin) continue

    const angle = Math.atan2(sy - canvas.height / 2, sx - canvas.width / 2)
    const cos   = Math.cos(angle), sin = Math.sin(angle)
    const halfW = canvas.width  / 2 - margin
    const halfH = (canvas.height - hudTop) / 2 - margin
    const t     = Math.min(halfW / Math.abs(cos + 1e-9), halfH / Math.abs(sin + 1e-9))
    const ex    = canvas.width  / 2 + cos * t
    const ey    = Math.max(hudTop + 10, canvas.height / 2 + sin * t)
    const a     = 0.45 + pulse * 0.35

    ctx.save()
    ctx.translate(ex, ey)
    ctx.rotate(angle)
    ctx.shadowColor = 'rgba(60,140,255,0.5)'; ctx.shadowBlur = 8
    ctx.fillStyle   = `rgba(100,185,255,${a})`
    ctx.beginPath()
    ctx.moveTo(11, 0); ctx.lineTo(-7, -5); ctx.lineTo(-4, 0); ctx.lineTo(-7, 5)
    ctx.closePath(); ctx.fill()
    ctx.restore()

    ctx.save()
    const lx = ex + Math.cos(angle + Math.PI) * 18
    const ly = ey + Math.sin(angle + Math.PI) * 16
    ctx.font      = '9px Arial'
    ctx.fillStyle = `rgba(70,140,210,${a})`
    ctx.textAlign = 'center'
    ctx.fillText(p.name, lx, ly)
    ctx.restore()
  }
}

// ─── Canvas events ────────────────────────────────────────────────────────────

canvas.addEventListener('mousemove', e => {
  const rect   = canvas.getBoundingClientRect()
  mouseScreenX = e.clientX - rect.left
  mouseScreenY = e.clientY - rect.top
  if (galaxyMapOpen) {
    const w = toWorld(mouseScreenX, mouseScreenY)
    mouseX = w.x; mouseY = w.y
  }
  if (isPanning && galaxyMapOpen) {
    const dx = e.clientX - panStartX, dy = e.clientY - panStartY
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) panMoved = true
    if (panMoved) { viewOffsetX = panOriginX + dx; viewOffsetY = panOriginY + dy }
  }
})

canvas.addEventListener('contextmenu', e => e.preventDefault())

canvas.addEventListener('mousedown', e => {
  if (e.button !== 0 || !galaxyMapOpen) return
  isPanning = true; panMoved = false
  panStartX = e.clientX; panStartY = e.clientY
  panOriginX = viewOffsetX; panOriginY = viewOffsetY
})

canvas.addEventListener('mouseup',    e => { if (e.button === 0) isPanning = false })
canvas.addEventListener('mouseleave', ()  => { isPanning = false })

canvas.addEventListener('click', e => {
  if (panMoved) { panMoved = false; return }
  // Left-click in system view: click planet → autopilot, click space → fire weapon
  if (!galaxyMapOpen && gameState === 'playing' && !activePanel && !jumpState && !paused) {
    const rect = canvas.getBoundingClientRect()
    const camX = canvas.width  / 2 - player.x
    const camY = canvas.height / 2 - player.y
    const wx   = e.clientX - rect.left - camX
    const wy   = e.clientY - rect.top  - camY
    let clickedPlanet = null
    for (const p of (systemLayout?.planets ?? [])) {
      if (Math.hypot(wx - p.sx, wy - p.sy) < 22) { clickedPlanet = p; break }
    }
    if (clickedPlanet) {
      autopilot = (autopilot === clickedPlanet) ? null : clickedPlanet
    }
    return
  }
  if (!galaxyMapOpen || activePanel) return

  // Use hoveredSystem (set each draw frame) so click always acts on the same
  // system the cursor and hover ring are highlighting — avoids first-vs-last
  // mismatch when two nodes overlap the hit radius.
  const sys = hoveredSystem
  if (!sys || sys.id === player.system) return
  const current = galaxy.systems[player.system]
  if (systemStates.has(sys.id) &&
      current.connections.includes(sys.id) &&
      !isSystemBlocked(sys.id)) {
    jumpTarget = (jumpTarget === sys.id) ? null : sys.id
    updateJumpHUD()
  }
})

canvas.addEventListener('wheel', e => {
  e.preventDefault()
  if (!galaxyMapOpen) return
  const rect = canvas.getBoundingClientRect()
  zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.12 : 1 / 1.12)
}, { passive: false })

// ─── Init ─────────────────────────────────────────────────────────────────────

function fireRandomEvent() {
  const def = GAME_EVENTS[Math.floor(Math.random() * GAME_EVENTS.length)]
  // Don't stack the same effect type
  if (activeEvents.some(e => e.effect === def.effect)) {
    nextEventAt = jumpCount + 3 + Math.floor(Math.random() * 3)
    return
  }

  const ev = { name: def.name, effect: def.effect, jumpsLeft: def.duration }
  let alertDesc = ''

  if (def.effect === 'system_unreachable') {
    const missionTargets = new Set((player.missions ?? []).map(m => m.target?.systemId))
    const candidates = galaxy.systems.filter(s =>
      s.id !== player.system && systemStates.has(s.id) && !isSystemBlocked(s.id) &&
      !missionTargets.has(s.id))
    if (!candidates.length) { nextEventAt = jumpCount + 3; return }
    const target   = candidates[Math.floor(Math.random() * candidates.length)]
    ev.systemId    = target.id
    alertDesc      = `${target.name} is emitting lethal radiation — jump route blocked for ${def.duration} jumps.`
    if (jumpTarget === target.id) { jumpTarget = null; updateJumpHUD() }
  }
  else if (def.effect === 'combat_frequency_high') {
    ev.systemId = null  // global
    alertDesc   = `Pirate fleets are raiding across the sector for ${def.duration} jumps.`
  }
  else if (def.effect === 'commodity_prices_up') {
    const c      = GAME_COMMODITIES[Math.floor(Math.random() * GAME_COMMODITIES.length)]
    ev.commodityId = c.id
    alertDesc    = `Demand spike for ${c.label} — prices up 50% for ${def.duration} jumps.`
  }
  else if (def.effect === 'ore_prices_drop') {
    ev.commodityId = 'ore'
    alertDesc      = `New ore deposits discovered — Ore prices drop 50% for ${def.duration} jumps.`
  }
  else if (def.effect === 'fuel_prices_up') {
    ev.commodityId = 'fuel'
    alertDesc      = `Refinery crisis across all sectors — Fuel prices doubled for ${def.duration} jumps.`
  }
  else if (def.effect === 'faction_war') {
    const nonPirate = GAME_FACTIONS.filter(f => f.type !== 'pirate')
    const idxA = Math.floor(Math.random() * nonPirate.length)
    const idxB = (idxA + 1 + Math.floor(Math.random() * (nonPirate.length - 1))) % nonPirate.length
    ev.warFactions = [nonPirate[idxA].name, nonPirate[idxB].name]
    alertDesc = `${ev.warFactions[0]} and ${ev.warFactions[1]} are at war — piracy surges in contested sectors for ${def.duration} jumps.`
  }
  else if (def.effect === 'plague_outbreak') {
    ev.commodityId = 'medicine'
    alertDesc = `A virulent plague is spreading — Medicine prices have tripled for ${def.duration} jumps.`
  }
  else if (def.effect === 'gold_rush') {
    ev.commodityId = 'luxuries'
    const visited = galaxy.systems.filter(s => systemStates.get(s.id) === 'visited')
    const rich    = visited[Math.floor(Math.random() * visited.length)]
    alertDesc = `Luxury goods are surging in value — Luxuries doubled for ${def.duration} jumps.` +
      (rich ? ` Tip: ${rich.name} may be a strong market.` : '')
  }

  activeEvents.push(ev)
  eventAlert  = { title: def.name, desc: alertDesc, timer: 5.0 }
  nextEventAt = jumpCount + 4 + Math.floor(Math.random() * 4)
  AudioEngine.alert()
}

function initGame(difficulty = 'normal') {
  galaxy        = generateGalaxy(100)
  planetMarkets = new Map()
  systemStates  = new Map()
  jumpTarget    = null
  jumpState     = null
  jumpWarning   = null
  missionNotify = null
  jumpCount     = 0
  nextEventAt   = 4 + Math.floor(Math.random() * 4)
  activeEvents  = []
  eventAlert    = null
  autopilot     = null
  priceHistory  = new Map()
  playerStats   = { jumpsTotal:0, creditsEarned:0, creditsSpent:0, missionsCompleted:0, enemiesDestroyed:0, cargoTraded:0, planetsVisited:0 }
  planetsVisitedSet = new Set()

  setSystemState(0, 'visited')
  galaxy.systems[0].connections.forEach(id => setSystemState(id, 'discovered'))

  buildSystemLayout(galaxy.systems[0])

  const startPlanet = systemLayout.planets[0]
  const startX = startPlanet ? startPlanet.sx + 130 : 200
  const startY = startPlanet ? startPlanet.sy       : 0

  player = {
    system:       0,
    ship:         Object.assign({}, GAME_SHIPS[0]),
    credits:      DIFF_SETTINGS[difficulty].credits,
    cargo:        {},
    cargoPrices:  {},
    missionCargo: {},
    hp:           GAME_SHIPS[0].hull,
    shield:       GAME_SHIPS[0].shield,
    shieldDelay:  0,
    armour:       0,
    armourMax:    0,
    fuel:         GAME_SHIPS[0].fuel_capacity,
    upgrades:     [],
    weaponSlots:  Array.from({ length: GAME_SHIPS[0].weapon_slots }, () => 'Laser Cannon'),
    engine:       null,
    thruster:     null,
    ammoInventory:    {},
    selectedAmmoType: null,
    ramscoopFrac:     0,
    missions:     [],
    factionRep:   Object.fromEntries(GAME_FACTIONS.map(f => [f.name, 0])),
    difficulty,
    x:            startX,
    y:            startY,
    angle:        Math.PI,
    vx:              0,
    vy:              0,
    angularVelocity: 0,
    landedPlanet:    null
  }
  computeShipStats()

  nearPlanet    = null
  lastFrameTime = 0
  clearCombat()
  initTraders()
  generateNebulaFields()
  AudioEngine.startSpaceMusic()
  updateHUD()
  updateJumpHUD()
  initTutorial()
}

function setSystemState(id, state) {
  const current = systemStates.get(id)
  if (current === 'visited') return
  if (current === 'scanned' && state === 'discovered') return
  systemStates.set(id, state)
}

// Remove mission cargo from player hold + missionCargo tracking
function removeMissionCargo(m) {
  if (!m.commodityId || !m.cargoQty) return
  if (player.cargo[m.commodityId]) {
    player.cargo[m.commodityId] = Math.max(0, player.cargo[m.commodityId] - m.cargoQty)
    if (player.cargo[m.commodityId] === 0) delete player.cargo[m.commodityId]
  }
  computeShipStats()
  if (player.missionCargo?.[m.commodityId]) {
    player.missionCargo[m.commodityId] = Math.max(0, player.missionCargo[m.commodityId] - m.cargoQty)
    if (player.missionCargo[m.commodityId] === 0) delete player.missionCargo[m.commodityId]
  }
}

function travel(targetId) {
  const current = galaxy.systems[player.system]
  if (!current.connections.includes(targetId)) return
  if (!systemStates.has(targetId)) return

  // Preserve escort NPCs — they jump alongside the player
  const escapingEscorts = civilianNPCs.filter(c => c.escort)

  clearCombat()

  // ── Fuel ──────────────────────────────────────────────────────────────────
  player.fuel = Math.max(0, (player.fuel ?? player.ship.fuel_capacity) - 1)

  // ── Event tracking ────────────────────────────────────────────────────────
  jumpCount++
  playerStats.jumpsTotal++
  if (jumpCount >= nextEventAt) fireRandomEvent()
  for (const e of activeEvents) e.jumpsLeft--
  activeEvents = activeEvents.filter(e => e.jumpsLeft > 0)

  player.system = targetId
  setSystemState(targetId, 'visited')
  galaxy.systems[targetId].connections.forEach(id => setSystemState(id, 'discovered'))

  // Long-range Scanner upgrade: reveal radius 2 systems as scanned
  if (player.upgrades && player.upgrades.includes('Long-range Scanner')) {
    revealRadius(targetId, 2, 'scanned')
  }

  autopilot = null   // planet refs are stale after system change
  buildSystemLayout(galaxy.systems[targetId])

  const arrivalPlanet = systemLayout.planets[0]
  if (arrivalPlanet) {
    const ang = Math.atan2(arrivalPlanet.sy, arrivalPlanet.sx)
    const rad = Math.hypot(arrivalPlanet.sx, arrivalPlanet.sy)
    player.x  = Math.cos(ang) * (rad + 500)
    player.y  = Math.sin(ang) * (rad + 500)
  } else {
    player.x = 200
    player.y = 0
  }
  player.landedPlanet = null

  // Arrive at max speed in the jump direction; normal inertia takes over immediately
  const VMAX         = player.ship.speed * 30
  const arrivalAngle = jumpState?.angle ?? player.angle
  player.angle = arrivalAngle
  player.vx    = Math.cos(arrivalAngle) * VMAX
  player.vy    = Math.sin(arrivalAngle) * VMAX

  // ── Mission tracking ──────────────────────────────────────────────────────
  // Completion is handled in checkMissionCompletions() when landing on a planet.
  // Here we only handle hop-limit expiry for missions NOT targeting this system.
  if (player.missions?.length) {
    const toRemove = new Set()
    for (const m of player.missions) {
      if ((m.type === 'delivery' || m.type === 'smuggling' || m.type === 'escort') && m.target.systemId !== targetId) {
        m.hopsLeft--
        if (m.hopsLeft <= 0) {
          removeMissionCargo(m)
          if (m.type === 'escort') {
            const idx = civilianNPCs.findIndex(c => c.escortMissionId === m.id)
            if (idx !== -1) civilianNPCs.splice(idx, 1)
          }
          toRemove.add(m.id)
          if (!missionNotify) missionNotify = { text: `Contract expired: ${m.title}`, timer: 3.5, success: false }
        }
      }
    }
    if (toRemove.size) player.missions = player.missions.filter(m => !toRemove.has(m.id))
  }

  spawnBountyTargets(galaxy.systems[targetId])
  spawnPirates(galaxy.systems[targetId])
  spawnCivilianNPCs()
  // Re-place escort NPCs near player in the new system (skip any that just expired)
  const activeMissionIds = new Set((player.missions ?? []).map(m => m.id))
  for (const esc of escapingEscorts) {
    if (!activeMissionIds.has(esc.escortMissionId)) continue
    const sa = Math.random() * Math.PI * 2
    esc.x = player.x + Math.cos(sa) * (200 + Math.random() * 150)
    esc.y = player.y + Math.sin(sa) * (200 + Math.random() * 150)
    esc.vx = player.vx; esc.vy = player.vy
    civilianNPCs.push(esc)
  }
  if (!enemies.length) AudioEngine.startSpaceMusic()
  AudioEngine.dock()
  updateHUD()
  saveGame()
}

function updateHUD() {
  const el = id => document.getElementById(id)
  if (el('sp-ship-name')) el('sp-ship-name').innerText = player.ship.name
  if (el('sp-system'))    el('sp-system').innerText    = galaxy.systems[player.system].name
  if (el('sp-credits'))   el('sp-credits').innerText   = player.credits.toLocaleString()
  const cargoUsed = Object.values(player.cargo).reduce((s, n) => s + n, 0)
  if (el('sp-cargo'))     el('sp-cargo').innerText     = cargoUsed + ' / ' + player.ship.cargo
  updateFuelHUD()
  updateMissileHUD()
}

function updateFuelHUD() {
  const fill = document.getElementById('sp-fuel-bar')
  if (!fill || !player) return
  const fuel = player.fuel ?? player.ship.fuel_capacity
  const cap  = player.ship.fuel_capacity
  const pct  = cap > 0 ? fuel / cap : 0
  fill.style.width = (pct * 100).toFixed(1) + '%'
  fill.className = 'sp-bar-fill sp-fuel' +
    (pct <= 0.10 ? ' sp-crit' : pct <= 0.25 ? ' sp-warn' : '')
}

function updateBoostHUD() {
  const fill = document.getElementById('sp-boost-bar')
  if (!fill) return
  if (boostTimer > 0) {
    fill.style.width = (boostTimer / BOOST_DURATION * 100).toFixed(1) + '%'
    fill.className = 'sp-bar-fill boost-fill-active'
  } else if (boostCooldown > 0) {
    fill.style.width = ((BOOST_COOLDOWN - boostCooldown) / BOOST_COOLDOWN * 100).toFixed(1) + '%'
    fill.className = 'sp-bar-fill boost-fill-cooldown'
  } else {
    fill.style.width = '100%'
    fill.className = 'sp-bar-fill boost-fill-ready'
  }
}

function cycleNavTarget() {
  const pool = [
    ...enemies,
    ...civilianNPCs,
    ...npcTraders.filter(t => t.system === player.system && t.state !== 'transit')
  ]
  if (!pool.length) { navCombatTarget = null; return }
  if (navCombatTarget && !pool.includes(navCombatTarget)) navCombatTarget = null
  if (!navCombatTarget) {
    navCombatTarget = pool[0]
  } else {
    const idx = pool.indexOf(navCombatTarget)
    navCombatTarget = idx >= pool.length - 1 ? null : pool[idx + 1]
  }
}

function isTargetHostile(t) {
  if (enemies.includes(t))      return true
  if (civilianNPCs.includes(t)) return t.hostile
  return false  // traders
}

function updateSidePanel() {
  if (!player || gameState !== 'playing') return

  // Speed + heading
  const speed = Math.hypot(player.vx, player.vy)
  const hdg   = (((player.angle * 180 / Math.PI) % 360) + 360) % 360
  const elSpeed = document.getElementById('sp-speed')
  const elHdg   = document.getElementById('sp-hdg')
  if (elSpeed) elSpeed.innerText = Math.round(speed)
  if (elHdg)   elHdg.innerText   = Math.round(hdg) + '°'

  // Gravity
  const gravMag = player._gravMag ?? 0
  const gravRow = document.getElementById('sp-grav-row')
  const elGrav  = document.getElementById('sp-grav')
  if (gravRow) gravRow.style.display = gravMag > 0.5 ? '' : 'none'
  if (elGrav && gravMag > 0.5) elGrav.innerText = Math.round(gravMag)

  // Shield bar
  const shieldMax = player.ship.shield ?? 0
  const shieldPct = shieldMax > 0 ? Math.max(0, player.shield / shieldMax) : 0
  const shieldBar = document.getElementById('sp-shield-bar')
  if (shieldBar) {
    shieldBar.style.width = (shieldPct * 100).toFixed(1) + '%'
    shieldBar.className = 'sp-bar-fill sp-shield' +
      (shieldPct <= 0.10 ? ' sp-crit' : shieldPct <= 0.25 ? ' sp-warn' : '')
  }

  // Armour bar
  const armourMax = player.armourMax ?? 0
  const armourRow = document.getElementById('sp-armour-row')
  const armourBar = document.getElementById('sp-armour-bar')
  if (armourRow) {
    if (armourMax > 0) {
      armourRow.style.display = ''
      if (armourBar) armourBar.style.width = Math.max(0, (player.armour ?? 0) / armourMax * 100).toFixed(1) + '%'
    } else {
      armourRow.style.display = 'none'
    }
  }

  // Clear dead nav target
  const allTargets  = [
    ...enemies, ...civilianNPCs,
    ...npcTraders.filter(t => t.system === player.system && t.state !== 'transit')
  ]
  const allHostiles = [...enemies, ...civilianNPCs.filter(c => c.hostile)]
  if (navCombatTarget && !allTargets.includes(navCombatTarget)) navCombatTarget = null

  // Target section — show nearest hostile (or TAB-locked target)
  const targetSection = document.getElementById('sp-target-section')
  if (targetSection) {
    let target = navCombatTarget
    if (!target && allHostiles.length > 0) {
      let nearestD = Infinity
      for (const e of allHostiles) {
        const d = Math.hypot(player.x - e.x, player.y - e.y)
        if (d < nearestD) { nearestD = d; target = e }
      }
    }
    if (target) {
      targetSection.style.display = ''
      const elName = document.getElementById('sp-target-name')
      const elType = document.getElementById('sp-target-type')
      const elHp   = document.getElementById('sp-target-hp')
      if (elName) elName.innerText = target.name || target.ship?.name || 'Trader'
      const hostile = isTargetHostile(target)
      const typeLabel = target.bountyMissionId  ? 'BOUNTY TARGET'
                      : npcTraders.includes(target) ? 'TRADER'
                      : civilianNPCs.includes(target) ? (hostile ? 'HOSTILE CIVILIAN' : 'CIVILIAN')
                      : 'PIRATE'
      if (elType) {
        elType.innerText   = typeLabel
        elType.style.color = hostile ? '#ff6644' : '#44dd88'
      }
      if (elHp) {
        const maxHp = target.ship?.hull ?? 80
        const pct   = maxHp > 0 ? Math.max(0, target.hp / maxHp) : 0
        elHp.style.width = (pct * 100).toFixed(1) + '%'
      }
    } else {
      targetSection.style.display = 'none'
    }
  }

  // Nav ship line — show TAB target, hostile count, or autopilot
  const elNavShip = document.getElementById('sp-nav-ship')
  if (elNavShip) {
    if (navCombatTarget) {
      elNavShip.className = 'sp-nav-line sp-nav-ship-lock'
      elNavShip.innerText = (navCombatTarget.name || navCombatTarget.ship?.name || 'Trader') + ' [LOCKED]'
    } else if (allHostiles.length > 0) {
      elNavShip.className = 'sp-nav-line sp-nav-ship-warn'
      elNavShip.innerText = allHostiles.length === 1 ? '1 hostile · TAB' : `${allHostiles.length} hostiles · TAB`
    } else if (autopilot) {
      elNavShip.className = 'sp-nav-line sp-nav-autopilot'
      elNavShip.innerText = 'AP → ' + autopilot.name
    } else {
      elNavShip.className = 'sp-nav-line sp-nav-dim'
      elNavShip.innerText = 'No contacts'
    }
  }

  updateBoostHUD()
  updateJumpHUD()
}

function updateMissileHUD() {
  const section = document.getElementById('sp-missile-section')
  if (!section || !player) return
  const slots = player.weaponSlots ?? []
  const hasAnyLauncher = slots.some(w =>
    w === 'Missile Launcher' || w === 'Rocket Launcher' || w === 'Special Weapon Launcher')
  if (!hasAnyLauncher) { section.style.display = 'none'; return }
  section.style.display = ''
  // Show the pinned selection if valid; fall back to auto-select
  const available = getAvailableAmmoTypes()
  const pinned    = player.selectedAmmoType
  const display   = (pinned && available.includes(pinned)) ? pinned : getSelectedAmmo()
  const typeEl    = document.getElementById('sp-missile-type')
  const countEl   = document.getElementById('sp-missile-count')
  if (display) {
    const count = player.ammoInventory?.[display] ?? 0
    if (typeEl)  typeEl.innerText  = AMMO_LABEL[display] ?? display
    if (countEl) {
      countEl.innerText = count
      countEl.className = 'sp-val' + (count === 0 ? ' sp-val-empty' : '')
    }
  } else {
    if (typeEl)  typeEl.innerText  = 'No ammo'
    if (countEl) { countEl.innerText = '0'; countEl.className = 'sp-val sp-val-empty' }
  }
}

// ─── Save / Load ──────────────────────────────────────────────────────────────

const SAVE_KEY_PREFIX  = 'haulinspace_save_'
const SAVE_META_PREFIX = 'haulinspace_meta_'
let   currentSlot      = 1    // which slot this session auto-saves to

function getSaveKey(slot)  { return SAVE_KEY_PREFIX  + slot }
function getSaveMetaKey(s) { return SAVE_META_PREFIX + s    }

function hasSave(slot) {
  if (slot) return !!localStorage.getItem(getSaveKey(slot))
  return [1,2,3,4,5].some(s => !!localStorage.getItem(getSaveKey(s)))
}

function deleteSave(slot) {
  localStorage.removeItem(getSaveKey(slot))
  localStorage.removeItem(getSaveMetaKey(slot))
}

function getSlotMeta(slot) {
  try {
    const raw = localStorage.getItem(getSaveMetaKey(slot))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function getAllSaveMeta() {
  return [1,2,3,4,5].map(s => ({ slot: s, meta: getSlotMeta(s) }))
}

function saveGame(slot = currentSlot) {
  if (!galaxy || !player) return false
  try {
    const data = {
      version: 1,
      timestamp: Date.now(),
      player: {
        system:        player.system,
        ship:          player.ship,
        hp:            player.hp,
        shield:        player.shield,
        shieldDelay:   player.shieldDelay,
        armour:        player.armour    ?? 0,
        armourMax:     player.armourMax ?? 0,
        fuel:          player.fuel ?? player.ship.fuel_capacity,
        upgrades:      player.upgrades,
        weaponSlots:   player.weaponSlots  ?? [],
        engine:        player.engine       ?? null,
        thruster:      player.thruster     ?? null,
        ammoInventory:    player.ammoInventory    ?? {},
        selectedAmmoType: player.selectedAmmoType ?? null,
        ramscoopFrac:     player.ramscoopFrac     ?? 0,
        credits:       player.credits,
        cargo:         player.cargo,
        cargoPrices:   player.cargoPrices  ?? {},
        missionCargo:  player.missionCargo ?? {},
        missions:      player.missions ?? [],
        factionRep:    player.factionRep  ?? {},
        difficulty:    player.difficulty  ?? 'normal',
        x:             player.x,
        y:             player.y,
        angle:         player.angle,
        vx:              0,
        vy:              0,
        angularVelocity: 0,
        landedPlanet:    null
      },
      galaxy,
      systemStates:  [...systemStates.entries()],
      planetMarkets: [...planetMarkets.entries()],
      npcTraders: npcTraders.map(t => ({
        id:           t.id,
        system:       t.system,
        planetId:     t.planet?.id ?? null,
        state:        t.state,
        dockTimer:    t.dockTimer,
        transitTimer: t.transitTimer,
        destSystem:   t.destSystem,
        destPlanetId: t.destPlanet?.id ?? null,
        cargo:        t.cargo,
        orbitAngle:   t.orbitAngle,
        orbitSpeed:   t.orbitSpeed,
        x:            t.x ?? 0,
        y:            t.y ?? 0,
        vx:           t.vx ?? 0,
        vy:           t.vy ?? 0,
        faceAngle:    t.faceAngle ?? 0
      })),
      activeEvents,
      jumpCount,
      nextEventAt,
      jumpTarget,
      priceHistory:      [...priceHistory.entries()],
      missionCounter:    typeof missionCounter !== 'undefined' ? missionCounter : 0,
      playerStats:       playerStats ?? {},
      planetsVisitedSet: [...planetsVisitedSet]
    }
    localStorage.setItem(getSaveKey(slot), JSON.stringify(data))
    // Write compact metadata for slot picker display
    const meta = {
      shipName:   player.ship.name,
      systemName: galaxy.systems[player.system].name,
      credits:    player.credits,
      difficulty: player.difficulty ?? 'normal',
      jumps:      jumpCount,
      timestamp:  Date.now()
    }
    localStorage.setItem(getSaveMetaKey(slot), JSON.stringify(meta))
    return true
  } catch (e) {
    console.warn('Save failed:', e)
    return false
  }
}

function loadGame(slot) {
  const s = slot ?? currentSlot
  try {
    const raw = localStorage.getItem(getSaveKey(s))
    if (!raw) return false
    const data = JSON.parse(raw)
    if (!data.version || !data.galaxy || !data.player) return false

    galaxy        = data.galaxy
    systemStates  = new Map(data.systemStates)
    planetMarkets = new Map(data.planetMarkets)

    function findPlanet(id) {
      if (id == null) return null
      for (const sys of galaxy.systems) {
        for (const p of sys.planets) { if (p.id === id) return p }
      }
      return null
    }

    npcTraders = (data.npcTraders ?? []).map(t => {
      // Departing/arriving are transient visual states — reset to docked on load
      const safeState = (t.state === 'departing' || t.state === 'arriving') ? 'docked' : t.state
      return {
        ...t,
        state:      safeState,
        dockTimer:  safeState === 'docked' ? (t.dockTimer ?? 1 + Math.random() * 3) : t.dockTimer,
        planet:     findPlanet(t.planetId),
        destPlanet: findPlanet(t.destPlanetId),
        x: t.x ?? 0, y: t.y ?? 0, vx: t.vx ?? 0, vy: t.vy ?? 0, faceAngle: t.faceAngle ?? 0
      }
    })

    activeEvents  = data.activeEvents  ?? []
    jumpCount     = data.jumpCount     ?? 0
    nextEventAt   = data.nextEventAt   ?? 5
    jumpTarget    = data.jumpTarget    ?? null
    jumpState     = null
    jumpWarning   = null
    missionNotify = null
    eventAlert    = null
    autopilot     = null
    priceHistory  = data.priceHistory ? new Map(data.priceHistory) : new Map()

    // Restore missionCounter so new IDs don't collide with loaded missions
    if (typeof missionCounter !== 'undefined') {
      missionCounter = data.missionCounter ?? 0
    }

    player        = { ...data.player, landedPlanet: null }
    // Back-compat: saves before fuel system won't have fuel field
    if (player.fuel == null)            player.fuel            = player.ship.fuel_capacity ?? 6
    if (!player.cargoPrices)            player.cargoPrices     = {}
    if (!player.missionCargo)           player.missionCargo    = {}
    if (!player.factionRep)             player.factionRep      = Object.fromEntries(GAME_FACTIONS.map(f => [f.name, 0]))
    else GAME_FACTIONS.forEach(f => { if (!(f.name in player.factionRep)) player.factionRep[f.name] = 0 })
    if (!player.difficulty)             player.difficulty      = 'normal'
    if (player.angularVelocity == null) player.angularVelocity = 0
    if (player.engine   === undefined)  player.engine          = null
    if (player.thruster === undefined)  player.thruster        = null
    if (player.shield == null)          player.shield          = player.ship.shield ?? 0
    if (player.shieldDelay == null)     player.shieldDelay     = 0
    if (player.armour == null)          player.armour          = 0
    if (player.armourMax == null)       player.armourMax       = 0
    if (!player.ammoInventory)             player.ammoInventory    = {}
    if (player.selectedAmmoType == null)   player.selectedAmmoType = null
    if (player.ramscoopFrac == null)       player.ramscoopFrac     = 0
    // Migrate old missileAmmo scalar to ammoInventory
    if (player.missileAmmo != null && player.missileAmmo > 0) {
      player.ammoInventory.homing_missile = (player.ammoInventory.homing_missile ?? 0) + player.missileAmmo
      delete player.missileAmmo
    }
    // Migrate old flat upgrades to weaponSlots if weaponSlots not present
    if (!player.weaponSlots) {
      const wc = player.ship.weapon_slots ?? 1
      player.weaponSlots = Array.from({ length: wc }, () => 'Laser Cannon')
      // If old save had Missile Launcher in upgrades, move one weapon slot
      const mlCount = (player.upgrades ?? []).filter(n => n === 'Missile Launcher').length
      for (let k = 0; k < Math.min(mlCount, wc); k++) player.weaponSlots[k] = 'Missile Launcher'
    }
    // Migrate: move Rocket Launcher from weaponSlots → upgrades if it's there from an old save
    // (Rocket Launcher changed to usesUpgradeSlot:true, usesWeaponSlot:false)
    if (player.weaponSlots) {
      const rli = player.weaponSlots.indexOf('Rocket Launcher')
      if (rli >= 0) {
        player.weaponSlots[rli] = 'Laser Cannon'  // free the weapon slot
        if (!player.upgrades) player.upgrades = []
        if (!player.upgrades.includes('Rocket Launcher')) player.upgrades.push('Rocket Launcher')
      }
    }
    // Migrate: recalculate upgrade_slots from current GAME_UPGRADES data (catches all slot drift).
    const baseShip = GAME_SHIPS.find(s => s.name === player.ship.name)
    if (baseShip) {
      let usedSlots = 0
      for (const upgName of (player.upgrades ?? [])) {
        const upg = GAME_UPGRADES.find(u => u.name === upgName)
        if (upg && upg.usesUpgradeSlot) usedSlots++
      }
      for (const slot of (player.weaponSlots ?? [])) {
        const upg = GAME_UPGRADES.find(u => u.name === slot)
        if (upg && upg.usesUpgradeSlot && upg.usesWeaponSlot) usedSlots++
      }
      const converters = (player.upgrades ?? []).filter(n => n === 'Cargo Converter').length
      player.ship.upgrade_slots = baseShip.upgrade_slots + converters - usedSlots
    }

    computeShipStats()
    playerStats       = data.playerStats ?? { jumpsTotal:0, creditsEarned:0, creditsSpent:0, missionsCompleted:0, enemiesDestroyed:0, cargoTraded:0, planetsVisited:0 }
    planetsVisitedSet = new Set(data.planetsVisitedSet ?? [])
    nearPlanet    = null
    lastFrameTime = 0
    clearCombat()
    generateNebulaFields()
    buildSystemLayout(galaxy.systems[player.system])
    spawnCivilianNPCs()
    // Respawn escort NPCs for active escort missions
    for (const m of (player.missions ?? [])) {
      if (m.type === 'escort') spawnEscortNPC(m.id, m.escortTier)
    }
    updateHUD()
    updateJumpHUD()
    currentSlot = s
    return true
  } catch (e) {
    console.warn('Load failed:', e)
    return false
  }
}

function hudSaveGame() {
  if (gameState !== 'playing') return
  if (saveGame()) missionNotify = { text: 'Game saved', timer: 2.0, success: true }
}

// Migrate a legacy single-slot save (haulinspace_save) to slot 1
function migrateLegacySave() {
  const LEGACY_KEY = 'haulinspace_save'
  const raw = localStorage.getItem(LEGACY_KEY)
  if (!raw) return
  if ([1,2,3,4,5].some(s => localStorage.getItem(getSaveKey(s)))) return // slots already exist
  try {
    const data = JSON.parse(raw)
    localStorage.setItem(getSaveKey(1), raw)
    if (data.player && data.galaxy) {
      const meta = {
        shipName:   data.player.ship?.name ?? '?',
        systemName: data.galaxy.systems?.[data.player.system]?.name ?? '?',
        credits:    data.player.credits ?? 0,
        difficulty: data.player.difficulty ?? 'normal',
        jumps:      data.jumpCount ?? 0,
        timestamp:  data.timestamp ?? Date.now()
      }
      localStorage.setItem(getSaveMetaKey(1), JSON.stringify(meta))
    }
    localStorage.removeItem(LEGACY_KEY)
  } catch (e) {
    console.warn('Legacy save migration failed:', e)
  }
}

migrateLegacySave()

// ─── Draw loop ────────────────────────────────────────────────────────────────

let lastFrameTime = 0

function draw(timestamp) {
  if (gameState !== 'playing') {
    drawTitleBackground()   // animated stars behind title / menu / gameover overlays
    lastFrameTime = 0
    requestAnimationFrame(draw)
    return
  }

  const dt = lastFrameTime > 0 ? Math.min((timestamp - lastFrameTime) / 1000, 0.05) : 0
  lastFrameTime = timestamp

  AudioEngine.resume()   // ensure AudioContext started after first user gesture

  if (jumpState) {
    updateParticles(dt)
    updateJump(dt)
    if (jumpState) drawJumpEffect()
    else           drawSystemView()
  } else {
    if (!paused) {
      updatePhysics(dt)
      checkNearPlanet()
      if (playerFireTimer > 0) playerFireTimer -= dt
      if (protonFireTimer > 0) protonFireTimer -= dt
      updateShields(dt)
      updateEnemies(dt)
      updateCivilianNPCs(dt)
      updateProjectiles(dt)
      updateParticles(dt)
      updateTraders(dt)
      checkLootCollection()
      if (player.hp <= 0) { triggerGameOver(); requestAnimationFrame(draw); return }
      if (jumpWarning)   { jumpWarning.timer -= dt;   if (jumpWarning.timer <= 0)   jumpWarning = null }
      if (missionNotify) { missionNotify.timer -= dt; if (missionNotify.timer <= 0) missionNotify = null }
      if (eventAlert)    { eventAlert.timer -= dt;    if (eventAlert.timer <= 0)    eventAlert   = null }

      // Thrust audio toggle
      const isThrusting = !player.landedPlanet && !activePanel &&
                          (isKeyHeld(keybinds.thrust) || isKeyHeld(keybinds.brake))
      if (isThrusting && !wasThrusting) AudioEngine.startThrust()
      if (!isThrusting && wasThrusting) AudioEngine.stopThrust()
      wasThrusting = isThrusting
    }

    drawSystemView()
    if (galaxyMapOpen) drawGalaxyMapOverlay()
    updateJumpHUD()
  }

  drawEventAlert()   // on top of everything including galaxy map
  requestAnimationFrame(draw)
}

// ─── Startup ──────────────────────────────────────────────────────────────────

loadKeybinds()
loadStarSprites()
loadShipSprites()
loadPlanetSprites()
initTitleStars()
initWarpStars()
requestAnimationFrame(draw)

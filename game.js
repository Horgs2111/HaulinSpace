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
  boost:     'Shift',
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
document.addEventListener('keydown', e => { keys[e.key] = true;  handleActionKey(e.key) })
document.addEventListener('keyup',   e => { keys[e.key] = false })

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

  // Shift — boost
  if (matchKey(key, keybinds.boost) && !activePanel && !galaxyMapOpen &&
      !player.landedPlanet && boostTimer <= 0 && boostCooldown <= 0) {
    const fuel = player.fuel ?? player.ship.fuel_capacity
    if (fuel > 0) {
      player.fuel = fuel - 1
      boostTimer  = BOOST_DURATION
      updateFuelHUD()
    }
  }

  // Space — fire weapon
  if (matchKey(key, keybinds.fire)    && !activePanel && !galaxyMapOpen) firePlayerWeapon()

  // X — fire missile
  if (matchKey(key, keybinds.missile) && !activePanel && !galaxyMapOpen) fireMissile()

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
const TRADER_COUNT = 15

const LAND_RADIUS      = 70    // world units — enter to see landing prompt
const DEPART_SPEED     = 50    // world units/s — outward nudge on departure
const JUMP_MIN_DISTANCE = 400  // world units from all planets before jump

function buildSystemLayout(sys) {
  const count = Math.max(sys.planets.length, 1)
  systemLayout = {
    planets: sys.planets.map((planet, i) => {
      const angle  = (sys.id * 2.618 + i * (Math.PI * 2 / count)) % (Math.PI * 2)
      const radius = 320 + i * 260 + ((sys.id * 37 + i * 23) % 130)
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

// ── Phase 21 — QoL ────────────────────────────────────────────────────────────
let autopilot            = null             // planet object (with .sx,.sy) when autopilot active
let priceHistory         = new Map()        // 'planetId:commodityId' → [last 5 buy prices]
let missionCompleteQueue = []               // missions awaiting collect-reward popup
let boostTimer           = 0               // seconds remaining on active boost
let boostCooldown        = 0               // seconds until boost is available again

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
  const el = document.getElementById('hud-jump')
  if (!el) return
  if (!jumpTarget || !galaxy) { el.innerHTML = ''; el.className = 'hud-jump'; return }
  const name   = galaxy.systems[jumpTarget].name
  const status = getJumpReadyStatus()
  if (status.ready) {
    el.innerHTML = `JUMP READY <span>→ ${name}</span>`
    el.className = 'hud-jump hud-jump-ready'
  } else {
    el.innerHTML = `<span class="hud-jump-arrow">→</span> ${name}`
    el.className = 'hud-jump hud-jump-set'
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

function updatePhysics(dt) {
  if (dt === 0 || activePanel || player.landedPlanet || galaxyMapOpen || paused) return

  // Boost timers
  if (boostTimer > 0) {
    boostTimer -= dt
    if (boostTimer <= 0) { boostTimer = 0; boostCooldown = BOOST_COOLDOWN }
  } else if (boostCooldown > 0) {
    boostCooldown = Math.max(0, boostCooldown - dt)
  }
  const boosting = boostTimer > 0

  const TURN  = player.ship.turn_rate * 25 * Math.PI / 180
  const ACCEL = player.ship.speed     * 20 * (boosting ? BOOST_ACCEL : 1)
  const VMAX  = player.ship.speed     * 30 * (boosting ? BOOST_VMAX  : 1)
  const DAMP  = Math.exp(-dt / (player.ship.inertia / 3))

  if (isKeyHeld(keybinds.turnLeft))  player.angle -= TURN * dt
  if (isKeyHeld(keybinds.turnRight)) player.angle += TURN * dt
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
      player.landedPlanet = ap
      openLanding(ap)
    } else {
      const targetAngle = Math.atan2(dy, dx)
      let   diff        = targetAngle - player.angle
      while (diff >  Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      if (Math.abs(diff) > 0.08) {
        player.angle += Math.sign(diff) * Math.min(TURN * dt, Math.abs(diff))
      } else {
        player.vx += Math.cos(player.angle) * ACCEL * dt
        player.vy += Math.sin(player.angle) * ACCEL * dt
      }
    }
  }

  const spd = Math.hypot(player.vx, player.vy)
  if (spd > VMAX) { player.vx = (player.vx / spd) * VMAX; player.vy = (player.vy / spd) * VMAX }
  player.vx *= DAMP
  player.vy *= DAMP
  player.x  += player.vx * dt
  player.y  += player.vy * dt
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
  ctx.shadowColor = '#ffdd66'; ctx.shadowBlur = 50
  ctx.fillStyle   = '#fff3bb'
  ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fill()
  ctx.restore()

  // Planets
  const atmoTime = Date.now() / 10000
  for (const p of (systemLayout?.planets ?? [])) {
    const isNear = (p === nearPlanet)
    const radius = isNear ? 15 : 12

    // Atmosphere glow (outer halo, slowly rotating gradient)
    ctx.save()
    ctx.translate(p.sx, p.sy)
    ctx.rotate(atmoTime * Math.PI * 2)
    const atmoGrad = ctx.createRadialGradient(0, 0, radius, 0, 0, radius + 14)
    atmoGrad.addColorStop(0, isNear ? 'rgba(100,200,255,0.22)' : 'rgba(60,120,210,0.14)')
    atmoGrad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = atmoGrad
    ctx.beginPath(); ctx.arc(0, 0, radius + 14, 0, Math.PI * 2); ctx.fill()
    ctx.restore()

    // Planet body
    ctx.save()
    ctx.shadowColor = isNear ? '#88ccff' : 'rgba(80,140,220,0.4)'
    ctx.shadowBlur  = isNear ? 24 : 10
    ctx.fillStyle   = isNear ? '#aaddff' : '#5577aa'
    ctx.beginPath(); ctx.arc(p.sx, p.sy, radius, 0, Math.PI * 2); ctx.fill()
    ctx.restore()

    const dist = Math.hypot(player.x - p.sx, player.y - p.sy)
    if (dist < 700) {
      ctx.save()
      ctx.globalAlpha = Math.min(1, (700 - dist) / 300)
      ctx.font = '11px Arial'; ctx.fillStyle = '#7799bb'; ctx.textAlign = 'center'
      ctx.fillText(p.name, p.sx, p.sy - 22)
      ctx.restore()
    }
  }

  drawLoot()
  drawEnemies()
  drawProjectiles()
  drawTraders()
  drawParticles()
  drawShip(player.x, player.y, player.angle)
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
    ctx.save()
    if (boosting) {
      ctx.shadowColor = 'rgba(255,140,30,0.95)'; ctx.shadowBlur = 34
      ctx.fillStyle   = 'rgba(255,180,60,0.90)'
    } else {
      ctx.shadowColor = 'rgba(80,160,255,0.9)'; ctx.shadowBlur = 22
      ctx.fillStyle   = 'rgba(100,185,255,0.75)'
    }
    const flameLen = boosting ? 26 : 18
    ctx.beginPath()
    ctx.moveTo(-7, 0); ctx.lineTo(-flameLen, -6); ctx.lineTo(-flameLen, 6)
    ctx.closePath(); ctx.fill()
    ctx.restore()
    // Emit thrust particles from engine nozzle
    const nozzleX = wx + Math.cos(angle + Math.PI) * 8
    const nozzleY = wy + Math.sin(angle + Math.PI) * 8
    const spawnChance = boosting ? 1.0 : 0.7
    if (Math.random() < spawnChance) {
      spawnParticles(nozzleX, nozzleY, player.vx, player.vy, boosting ? 'boost' : 'thrust', boosting ? 3 : 1)
    }
  }

  ctx.shadowColor = 'rgba(150,200,255,0.45)'; ctx.shadowBlur = 8
  ctx.fillStyle   = '#aabfd4'; ctx.strokeStyle = '#ddeeff'; ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-4, 0); ctx.lineTo(-8, 9)
  ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.restore()
}

function drawSystemHUD() {
  const speed = Math.hypot(player.vx, player.vy)
  const hdg   = (((player.angle * 180 / Math.PI) % 360) + 360) % 360

  ctx.save()
  ctx.font = '11px Arial'; ctx.fillStyle = 'rgba(65,105,165,0.75)'; ctx.textAlign = 'left'
  ctx.fillText(`SPD  ${Math.round(speed).toString().padStart(3)}`,  18, canvas.height - 28)
  ctx.fillText(`HDG  ${Math.round(hdg).toString().padStart(3)}°`,   18, canvas.height - 14)
  ctx.restore()

  // Boost indicator
  ctx.save()
  ctx.font = '11px Arial'; ctx.textAlign = 'left'
  if (boostTimer > 0) {
    const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 1000 * 8)
    ctx.fillStyle = `rgba(255,160,40,${pulse})`
    ctx.shadowColor = 'rgba(255,120,20,0.6)'; ctx.shadowBlur = 8
    ctx.fillText(`BOOST  ${boostTimer.toFixed(1)}s`, 18, canvas.height - 48)
  } else if (boostCooldown > 0) {
    ctx.fillStyle = 'rgba(100,80,50,0.70)'
    ctx.fillText(`BOOST  ${boostCooldown.toFixed(1)}s`, 18, canvas.height - 48)
  } else {
    ctx.fillStyle = 'rgba(65,105,165,0.55)'
    ctx.fillText('BOOST  [Shift]', 18, canvas.height - 48)
  }
  ctx.restore()

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
  if (!systemLayout || gameState !== 'playing' || activePanel || jumpState || paused) return
  const cx    = 85
  const cy    = 44 + 85   // below the 44px HUD strip
  const R     = 65
  const RANGE = 600
  const scale = R / RANGE

  ctx.save()
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,4,18,0.72)'; ctx.fill()
  ctx.strokeStyle = 'rgba(40,80,160,0.50)'; ctx.lineWidth = 1.5; ctx.stroke()
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip()

  // Planets
  for (const p of systemLayout.planets) {
    const rx = (p.sx - player.x) * scale
    const ry = (p.sy - player.y) * scale
    ctx.beginPath(); ctx.arc(cx + rx, cy + ry, 4, 0, Math.PI * 2)
    ctx.fillStyle = p === autopilot ? '#88ccff' : '#4488cc'
    ctx.fill()
    if (p === autopilot) {
      ctx.beginPath(); ctx.arc(cx + rx, cy + ry, 7, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(100,220,140,0.75)'; ctx.lineWidth = 1; ctx.stroke()
    }
  }

  // NPC traders (docked in current system)
  for (const t of npcTraders) {
    if (t.system !== player.system || t.state !== 'docked') continue
    const lp = systemLayout.planets.find(p => p.id === t.planet?.id)
    if (!lp) continue
    const r  = 38 + (t.id % 5) * 8
    const tx = lp.sx + Math.cos(t.orbitAngle) * r
    const ty = lp.sy + Math.sin(t.orbitAngle) * r
    const rx = (tx - player.x) * scale
    const ry = (ty - player.y) * scale
    ctx.beginPath(); ctx.arc(cx + rx, cy + ry, 2, 0, Math.PI * 2)
    ctx.fillStyle = '#3ec8b8'; ctx.fill()
  }

  // Loot
  for (const l of lootItems) {
    const rx = (l.x - player.x) * scale
    const ry = (l.y - player.y) * scale
    ctx.beginPath(); ctx.arc(cx + rx, cy + ry, 2, 0, Math.PI * 2)
    ctx.fillStyle = '#ffdd44'; ctx.fill()
  }

  // Enemies
  for (const en of enemies) {
    const rx = (en.x - player.x) * scale
    const ry = (en.y - player.y) * scale
    ctx.beginPath(); ctx.arc(cx + rx, cy + ry, 2.5, 0, Math.PI * 2)
    ctx.fillStyle = '#ff4444'; ctx.fill()
  }

  // Player direction line + dot
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + Math.cos(player.angle) * 9, cy + Math.sin(player.angle) * 9)
  ctx.strokeStyle = '#aaddff'; ctx.lineWidth = 1.5; ctx.stroke()
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'; ctx.fill()

  ctx.restore()

  // Autopilot label below the minimap circle
  if (autopilot) {
    ctx.save()
    ctx.font = '9px Arial'; ctx.fillStyle = 'rgba(100,220,140,0.70)'
    ctx.textAlign = 'center'
    ctx.fillText('AUTOPILOT \u00b7 ' + autopilot.name, cx, cy + R + 12)
    ctx.restore()
  }
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

  // Ship silhouette at canvas centre during warp
  ctx.save()
  ctx.translate(cx, cy); ctx.rotate(j.angle)
  ctx.shadowColor = `rgba(100,180,255,${0.3 + spd * 0.7})`; ctx.shadowBlur = 10 + spd * 20
  ctx.fillStyle = '#aabfd4'; ctx.strokeStyle = '#ddeeff'; ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-4, 0); ctx.lineTo(-8, 9)
  ctx.closePath(); ctx.fill(); ctx.stroke()
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
let projectiles    = []
let lootItems      = []
let playerFireTimer = 0

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

function getBoltStyle(wslots) {
  if (wslots >= 4) return 'bolt_heavy'
  if (wslots >= 2) return 'bolt_medium'
  return 'bolt_light'
}

function clearCombat() {
  enemies         = []
  projectiles     = []
  lootItems       = []
  particles       = []
  playerFireTimer = 0
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
      hp:             Math.round(ship.hull * 1.4),  // bounty target is tougher
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
      hp:        ship.hull,
      x:         player.x + Math.cos(sa) * sd,
      y:         player.y + Math.sin(sa) * sd,
      angle:     sa + Math.PI,
      vx: 0, vy: 0,
      fireTimer: 2.0 + i * 0.9
    })
  }
}

function firePlayerWeapon() {
  if (playerFireTimer > 0 || player.landedPlanet || activePanel || jumpState || galaxyMapOpen) return
  const wslots = player.ship.weapon_slots
  const style  = getBoltStyle(wslots)
  playerFireTimer = 0.5 / wslots

  const angle  = player.angle
  const cos    = Math.cos(angle)
  const sin    = Math.sin(angle)
  const baseX  = player.x + cos * 16
  const baseY  = player.y + sin * 16
  const bvx    = player.vx + cos * PROJ_SPEED
  const bvy    = player.vy + sin * PROJ_SPEED

  if (style === 'bolt_medium') {
    // Twin shot — two bolts offset ±5px perpendicular to firing direction
    const offset = 5
    for (const side of [-1, 1]) {
      projectiles.push({
        x: baseX + (-sin) * offset * side,
        y: baseY + cos    * offset * side,
        vx: bvx, vy: bvy,
        owner: 'player', timer: PROJ_LIFETIME,
        style, angle
      })
    }
  } else {
    projectiles.push({
      x: baseX, y: baseY, vx: bvx, vy: bvy,
      owner: 'player', timer: PROJ_LIFETIME,
      style, angle
    })
  }

  spawnParticles(baseX, baseY, player.vx, player.vy, 'muzzle', style === 'bolt_heavy' ? 7 : 4)
  AudioEngine.fire()
}

function fireMissile() {
  if (!player || player.landedPlanet || activePanel || jumpState || galaxyMapOpen) return
  if ((player.missileAmmo ?? 0) <= 0) {
    missionNotify = { text: 'No missiles — reload at a planet', timer: 2.0, success: false }
    return
  }
  player.missileAmmo--
  updateMissileHUD()

  const angle = player.angle
  projectiles.push({
    x:     player.x + Math.cos(angle) * 22,
    y:     player.y + Math.sin(angle) * 22,
    vx:    player.vx + Math.cos(angle) * MISSILE_SPEED,
    vy:    player.vy + Math.sin(angle) * MISSILE_SPEED,
    owner: 'player',
    timer: MISSILE_LIFETIME,
    style: 'missile',
    angle
  })
  AudioEngine.fire()
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

    // Missile homing — steer toward nearest enemy before moving
    if (p.style === 'missile' && p.owner === 'player' && enemies.length > 0) {
      let nearest = null, bestDist = Infinity
      for (const e of enemies) {
        const d = Math.hypot(p.x - e.x, p.y - e.y)
        if (d < bestDist) { bestDist = d; nearest = e }
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

    p.x    += p.vx * dt
    p.y    += p.vy * dt
    p.timer -= dt
    if (p.timer <= 0) { projectiles.splice(i, 1); continue }

    const hitRadius = p.style === 'missile' ? MISSILE_HIT_RADIUS : PROJ_HIT_RADIUS

    let hit = false
    if (p.owner === 'player') {
      for (let j = enemies.length - 1; j >= 0; j--) {
        if (Math.hypot(p.x - enemies[j].x, p.y - enemies[j].y) < hitRadius) {
          const dmg = p.style === 'missile'
            ? Math.round(Math.random() * 20 + MISSILE_DAMAGE)
            : Math.round(Math.random() * 10 + (p.style === 'bolt_heavy' ? 42 : p.style === 'bolt_medium' ? 22 : 14))
          enemies[j].hp -= dmg
          spawnParticles(p.x, p.y, p.vx, p.vy, p.style === 'missile' ? 'explosion' : 'hit', p.style === 'missile' ? 18 : 6)
          AudioEngine.hit()
          if (enemies[j].hp <= 0) {
            const e = enemies[j]
            spawnParticles(e.x, e.y, e.vx, e.vy, 'explosion', 28)
            AudioEngine.explosion()
            playerStats.enemiesDestroyed++
            // Pirate kills: lose pirate rep, gain navy rep
            adjustRep('Outer Rim Pirates', -3)
            adjustRep('Federation Navy', 2)
            if (e.bountyMissionId && player.missions) {
              const bm = player.missions.find(m => m.id === e.bountyMissionId)
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
            spawnLoot(e); enemies.splice(j, 1)
          }
          hit = true; break
        }
      }
    } else {
      if (Math.hypot(p.x - player.x, p.y - player.y) < hitRadius) {
        const diffMult = DIFF_SETTINGS[player.difficulty ?? 'normal'].damageMult
        const eDmg = p.style === 'bolt_heavy' ? 42 : p.style === 'bolt_medium' ? 22 : 14
        player.hp = Math.max(0, player.hp - Math.round((Math.random() * 10 + eDmg) * diffMult))
        spawnParticles(p.x, p.y, p.vx, p.vy, 'hit', 5)
        AudioEngine.hit()
        hit = true
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
    ctx.shadowColor = 'rgba(255,80,60,0.55)'; ctx.shadowBlur = 12
    ctx.fillStyle   = '#b85050'; ctx.strokeStyle = '#ff8870'; ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(13, 0); ctx.lineTo(-7, -8); ctx.lineTo(-3, 0); ctx.lineTo(-7, 8)
    ctx.closePath(); ctx.fill(); ctx.stroke()
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

    if (p.style === 'missile') {
      // Elongated body
      ctx.shadowColor = '#ff9933'; ctx.shadowBlur = 14
      ctx.fillStyle   = '#ffcc44'
      ctx.beginPath(); ctx.ellipse(0, 0, 11, 3.5, 0, 0, Math.PI * 2); ctx.fill()
      // Bright nose
      ctx.shadowBlur  = 0
      ctx.fillStyle   = '#ffffff'
      ctx.beginPath(); ctx.ellipse(9, 0, 4, 2, 0, 0, Math.PI * 2); ctx.fill()
      // Tail fin hint
      ctx.fillStyle = '#cc8800'
      ctx.fillRect(-11, -4, 5, 8)

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
  if (!enemies.length && !lootItems.length) return

  if (enemies.length > 0) {
    drawHPBar(18, 120, 180, `HULL  ${Math.max(0, Math.round(player.hp))}`, player.hp, player.ship.hull, '#44cc88')

    let nearest = null, nearestD = Infinity
    for (const e of enemies) {
      const d = Math.hypot(player.x - e.x, player.y - e.y)
      if (d < nearestD) { nearestD = d; nearest = e }
    }
    if (nearest) {
      const enemyLabel = nearest.name || nearest.ship.name
      drawHPBar(18, 144, 180, `${enemyLabel}  ${Math.max(0, Math.round(nearest.hp))}`, nearest.hp, nearest.ship.hull, '#cc4444')
    }
  }

  // "Fly over loot" hint when close to pickup
  for (const l of lootItems) {
    if (Math.hypot(player.x - l.x, player.y - l.y) < 200) {
      const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 400)
      ctx.save()
      ctx.font = 'bold 12px Arial'; ctx.fillStyle = `rgba(220,185,50,${pulse})`
      ctx.textAlign = 'center'; ctx.shadowColor = 'rgba(200,155,20,0.45)'; ctx.shadowBlur = 6
      ctx.fillText('Fly over loot to collect', canvas.width / 2, 74)
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
      dockTimer:   2 + Math.random() * 6,    // stagger first departures
      transitTimer: 0,
      destSystem:  null,
      destPlanet:  null,
      cargo:       startCom ? { [startCom]: 3 + Math.floor(Math.random() * 5) } : {},
      orbitAngle:  Math.random() * Math.PI * 2,
      orbitSpeed:  0.25 + Math.random() * 0.35
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
      if (!dest) { t.dockTimer = 8 + Math.random() * 5; continue }

      t.destSystem  = dest.sysId
      t.destPlanet  = dest.planet
      t.state       = 'transit'
      t.transitTimer = 5 + Math.random() * 8
    }
    else if (t.state === 'transit') {
      t.transitTimer -= dt
      if (t.transitTimer > 0) continue

      // Arrive at destination
      t.system     = t.destSystem
      t.planet     = t.destPlanet
      t.destSystem = null
      t.destPlanet = null
      t.state      = 'docked'
      t.dockTimer  = 4 + Math.random() * 6
    }
  }
}

function drawTraders() {
  if (!systemLayout) return
  for (const t of npcTraders) {
    if (t.system !== player.system || t.state !== 'docked') continue
    const lp = systemLayout.planets.find(p => p.id === t.planet.id)
    if (!lp) continue

    const r  = 38 + (t.id % 5) * 8
    const tx = lp.sx + Math.cos(t.orbitAngle) * r
    const ty = lp.sy + Math.sin(t.orbitAngle) * r

    ctx.save()
    ctx.translate(tx, ty)
    ctx.rotate(t.orbitAngle + Math.PI / 2)
    ctx.shadowColor = 'rgba(60,200,180,0.45)'; ctx.shadowBlur = 8
    ctx.fillStyle   = '#3ec8b8'; ctx.strokeStyle = '#7feedd'; ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, -7); ctx.lineTo(-5, 5); ctx.lineTo(0, 2); ctx.lineTo(5, 5)
    ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.restore()
  }
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

function spawnParticles(wx, wy, baseVx, baseVy, type, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const spd   = Math.random()
    const p     = { x: wx, y: wy }

    if (type === 'thrust') {
      p.vx      = baseVx * 0.2 - Math.cos(player.angle) * (40 + Math.random() * 80) + (Math.random() - 0.5) * 30
      p.vy      = baseVy * 0.2 - Math.sin(player.angle) * (40 + Math.random() * 80) + (Math.random() - 0.5) * 30
      p.life    = 0.20 + Math.random() * 0.18
      p.color   = Math.random() < 0.55 ? '#88ccff' : '#c0e8ff'
      p.size    = 1.5 + Math.random() * 1.8
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
    fuel:         GAME_SHIPS[0].fuel_capacity,
    upgrades:     [],
    missions:     [],
    factionRep:   Object.fromEntries(GAME_FACTIONS.map(f => [f.name, 0])),
    difficulty,
    missileAmmo:  0,
    x:            startX,
    y:            startY,
    angle:        Math.PI,
    vx:           0,
    vy:           0,
    landedPlanet: null
  }

  nearPlanet    = null
  lastFrameTime = 0
  clearCombat()
  initTraders()
  generateNebulaFields()
  AudioEngine.startSpaceMusic()
  updateHUD()
  updateJumpHUD()
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
  if (player.missionCargo?.[m.commodityId]) {
    player.missionCargo[m.commodityId] = Math.max(0, player.missionCargo[m.commodityId] - m.cargoQty)
    if (player.missionCargo[m.commodityId] === 0) delete player.missionCargo[m.commodityId]
  }
}

function travel(targetId) {
  const current = galaxy.systems[player.system]
  if (!current.connections.includes(targetId)) return
  if (!systemStates.has(targetId)) return

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
  player.x = arrivalPlanet ? arrivalPlanet.sx + 150 : 200
  player.y = arrivalPlanet ? arrivalPlanet.sy        : 0
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
      if ((m.type === 'delivery' || m.type === 'smuggling') && m.target.systemId !== targetId) {
        m.hopsLeft--
        if (m.hopsLeft <= 0) {
          removeMissionCargo(m)
          toRemove.add(m.id)
          if (!missionNotify) missionNotify = { text: `Contract expired: ${m.title}`, timer: 3.5, success: false }
        }
      }
    }
    if (toRemove.size) player.missions = player.missions.filter(m => !toRemove.has(m.id))
  }

  spawnBountyTargets(galaxy.systems[targetId])
  spawnPirates(galaxy.systems[targetId])
  if (!enemies.length) AudioEngine.startSpaceMusic()
  AudioEngine.dock()
  updateHUD()
  saveGame()
}

function updateHUD() {
  document.getElementById('hud-ship').innerText     = player.ship.name
  document.getElementById('hud-location').innerText = galaxy.systems[player.system].name
  document.getElementById('hud-credits').innerText  = player.credits.toLocaleString()
  const cargoUsed = Object.values(player.cargo).reduce((s, n) => s + n, 0)
  document.getElementById('hud-cargo').innerText    = cargoUsed + ' / ' + player.ship.cargo
  updateFuelHUD()
  updateMissileHUD()
}

function updateFuelHUD() {
  const bar      = document.getElementById('hud-fuel-bar')
  const text     = document.getElementById('hud-fuel-text')
  if (!bar || !text || !player) return
  const fuel     = player.fuel ?? player.ship.fuel_capacity
  const cap      = player.ship.fuel_capacity
  bar.innerHTML  = ''
  for (let i = 0; i < cap; i++) {
    const frag = document.createElement('span')
    const filled = i < fuel
    if (filled && fuel === 1) {
      frag.className = 'fuel-frag fuel-frag-warn'
    } else {
      frag.className = filled ? 'fuel-frag fuel-frag-full' : 'fuel-frag'
    }
    bar.appendChild(frag)
  }
  text.innerText = fuel + ' / ' + cap
  text.className = fuel === 0 ? 'hud-fuel-text hud-fuel-empty' : 'hud-fuel-text'
}

function updateMissileHUD() {
  const el  = document.getElementById('hud-missile')
  const sep = document.querySelector('.hud-missile-sep')
  if (!el || !player) return
  const hasMissileLauncher = player.upgrades && player.upgrades.includes('Missile Launcher')
  if (!hasMissileLauncher) {
    el.classList.add('hidden'); if (sep) sep.classList.add('hidden'); return
  }
  el.classList.remove('hidden'); if (sep) sep.classList.remove('hidden')
  const ammo = player.missileAmmo ?? 0
  document.getElementById('hud-missile-count').innerText = ammo
  el.className = 'hud-missile' + (ammo === 0 ? ' msl-empty' : '')
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
        system:       player.system,
        ship:         player.ship,
        hp:           player.hp,
        fuel:         player.fuel ?? player.ship.fuel_capacity,
        upgrades:     player.upgrades,
        credits:      player.credits,
        cargo:        player.cargo,
        cargoPrices:  player.cargoPrices  ?? {},
        missionCargo: player.missionCargo ?? {},
        missions:     player.missions ?? [],
        factionRep:   player.factionRep  ?? {},
        difficulty:   player.difficulty  ?? 'normal',
        missileAmmo:  player.missileAmmo ?? 0,
        x:            player.x,
        y:            player.y,
        angle:        player.angle,
        vx:           0,
        vy:           0,
        landedPlanet: null
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
        orbitSpeed:   t.orbitSpeed
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

    npcTraders = (data.npcTraders ?? []).map(t => ({
      ...t,
      planet:     findPlanet(t.planetId),
      destPlanet: findPlanet(t.destPlanetId)
    }))

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
    if (player.fuel == null)         player.fuel         = player.ship.fuel_capacity ?? 6
    if (!player.cargoPrices)         player.cargoPrices  = {}
    if (!player.missionCargo)        player.missionCargo = {}
    if (!player.factionRep)          player.factionRep   = Object.fromEntries(GAME_FACTIONS.map(f => [f.name, 0]))
    else GAME_FACTIONS.forEach(f => { if (!(f.name in player.factionRep)) player.factionRep[f.name] = 0 })
    if (!player.difficulty)          player.difficulty   = 'normal'
    if (player.missileAmmo == null)  player.missileAmmo  = 0
    playerStats       = data.playerStats ?? { jumpsTotal:0, creditsEarned:0, creditsSpent:0, missionsCompleted:0, enemiesDestroyed:0, cargoTraded:0, planetsVisited:0 }
    planetsVisitedSet = new Set(data.planetsVisitedSet ?? [])
    nearPlanet    = null
    lastFrameTime = 0
    clearCombat()
    generateNebulaFields()
    buildSystemLayout(galaxy.systems[player.system])
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
      updateEnemies(dt)
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
initTitleStars()
initWarpStars()
requestAnimationFrame(draw)

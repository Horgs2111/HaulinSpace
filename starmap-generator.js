function sqDist(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

function tryConnect(a, b) {
  if (a.connections.length >= 3 || b.connections.length >= 3) return false
  if (a.connections.includes(b.id)) return false
  a.connections.push(b.id)
  b.connections.push(a.id)
  return true
}

function generateClusterCentres(count) {
  const centres = []
  const MIN_SQ = 190 * 190
  let attempts = 0

  while (centres.length < count && attempts < 3000) {
    const x = 130 + Math.random() * 940
    const y = 110 + Math.random() * 580
    const ok = centres.every(c => sqDist(c, { x, y }) >= MIN_SQ)
    if (ok) {
      centres.push({
        x,
        y,
        index: centres.length,
        faction: GAME_FACTIONS[centres.length % GAME_FACTIONS.length].name
      })
    }
    attempts++
  }

  while (centres.length < count) {
    centres.push({
      x: 130 + Math.random() * 940,
      y: 110 + Math.random() * 580,
      index: centres.length,
      faction: GAME_FACTIONS[centres.length % GAME_FACTIONS.length].name
    })
  }

  return centres
}

function generateGalaxy(count) {
  const numClusters = 8 + Math.floor(Math.random() * 5)
  const clusters = generateClusterCentres(numClusters)

  // --- Systems: round-robin cluster assignment ---
  const systems = []
  for (let i = 0; i < count; i++) {
    const clusterIdx = i % numClusters
    const centre = clusters[clusterIdx]
    const angle = Math.random() * Math.PI * 2
    const r = 30 + Math.random() * 85
    systems.push({
      id: i,
      name: SYSTEM_NAMES[i],
      x: Math.max(50, Math.min(1150, centre.x + Math.cos(angle) * r)),
      y: Math.max(50, Math.min(750, centre.y + Math.sin(angle) * r)),
      connections: [],
      planets: [],
      faction: centre.faction,
      piracyLevel: 0,
      cluster: clusterIdx
    })
  }

  // --- Intra-cluster connections (nearest-neighbor, max 3) ---
  for (let c = 0; c < numClusters; c++) {
    const members = systems.filter(s => s.cluster === c)
    const pairs = []
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        pairs.push({ a: members[i], b: members[j], d: sqDist(members[i], members[j]) })
      }
    }
    pairs.sort((p, q) => p.d - q.d)
    for (const p of pairs) tryConnect(p.a, p.b)
  }

  // --- Inter-cluster MST (Kruskal) ---
  const clusterEdges = []
  for (let i = 0; i < numClusters; i++) {
    const mi = systems.filter(s => s.cluster === i)
    for (let j = i + 1; j < numClusters; j++) {
      const mj = systems.filter(s => s.cluster === j)
      let bestA = null, bestB = null, bestD = Infinity
      for (const a of mi) {
        for (const b of mj) {
          const d = sqDist(a, b)
          if (d < bestD) { bestD = d; bestA = a; bestB = b }
        }
      }
      if (bestA) clusterEdges.push({ i, j, d: bestD, a: bestA, b: bestB })
    }
  }
  clusterEdges.sort((x, y) => x.d - y.d)

  const parent = Array.from({ length: numClusters }, (_, i) => i)
  function find(x) { return parent[x] === x ? x : (parent[x] = find(parent[x])) }
  function union(x, y) { parent[find(x)] = find(y) }

  for (const e of clusterEdges) {
    if (find(e.i) !== find(e.j)) {
      tryConnect(e.a, e.b)
      union(e.i, e.j)
    }
  }

  // Extra cross-cluster connections for path variety
  let extras = 0
  for (const e of clusterEdges) {
    if (extras >= 4) break
    if (tryConnect(e.a, e.b)) extras++
  }

  // --- Connectivity repair (BFS from 0, force-connect stranded systems) ---
  const reached = new Set([0])
  const queue = [0]
  while (queue.length) {
    const id = queue.shift()
    for (const cid of systems[id].connections) {
      if (!reached.has(cid)) { reached.add(cid); queue.push(cid) }
    }
  }

  for (const sys of systems) {
    if (reached.has(sys.id)) continue
    let nearest = null, nearestD = Infinity
    for (const rid of reached) {
      const d = sqDist(sys, systems[rid])
      if (d < nearestD) { nearestD = d; nearest = systems[rid] }
    }
    if (nearest && !sys.connections.includes(nearest.id)) {
      sys.connections.push(nearest.id)
      nearest.connections.push(sys.id)
      reached.add(sys.id)
      const q2 = [sys.id]
      while (q2.length) {
        const id2 = q2.shift()
        for (const cid of systems[id2].connections) {
          if (!reached.has(cid)) { reached.add(cid); q2.push(cid) }
        }
      }
    }
  }

  // --- Piracy levels ---
  const gcx = 600, gcy = 400
  const maxSqD = gcx * gcx + gcy * gcy
  for (const sys of systems) {
    const dx = sys.x - gcx, dy = sys.y - gcy
    const ftype = GAME_FACTIONS.find(f => f.name === sys.faction)?.type
    const distFactor = (dx * dx + dy * dy) / maxSqD
    sys.piracyLevel = ftype === 'pirate'
      ? 0.65 + Math.random() * 0.35
      : Math.min(1, distFactor * 0.8 + Math.random() * 0.15)
  }

  // --- Planets ---
  for (const sys of systems) {
    const r = Math.random()
    if (r < 0.02)      sys.planets = []
    else if (r < 0.17) sys.planets = [generatePlanet(), generatePlanet()]
    else               sys.planets = [generatePlanet()]
  }

  // --- Faction overrides on planets (also assigns unique IDs) ---
  for (const sys of systems) {
    const ftype = GAME_FACTIONS.find(f => f.name === sys.faction)?.type
    sys.planets.forEach((p, i) => {
      p.id      = sys.id * 10 + i
      p.faction = sys.faction
      if (ftype === 'pirate') {
        p.market      = false
        p.missionBoard = false
        p.blackMarket = Math.random() > 0.30  // 70% of pirate planets have a black market
      }
    })
  }

  return { systems, clusters }
}

const PLANET_PREFIXES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Minor', 'Major', 'Prime', 'Deep', 'Outer']

// Market availability odds per planet type
const MARKET_ODDS = {
  trade_hub:    1.00,
  agricultural: 0.80,
  mining:       0.75,
  industrial:   0.80,
  military:     0.60,
  frontier:     0.40
}

function generatePlanet() {
  const type   = PLANET_TYPES[Math.floor(Math.random() * PLANET_TYPES.length)]
  const prefix = PLANET_PREFIXES[Math.floor(Math.random() * PLANET_PREFIXES.length)]
  const suffix = Math.floor(Math.random() * 900 + 100)
  return {
    name: prefix + ' ' + suffix,
    type,
    faction:      null,  // filled in after system assignment
    market:       Math.random() < (MARKET_ODDS[type] ?? 0.65),
    shipyard:     Math.random() > 0.72,
    upgradeShop:  Math.random() > 0.62,
    missionBoard: Math.random() > 0.55,
    observatory:  Math.random() > 0.88
  }
}

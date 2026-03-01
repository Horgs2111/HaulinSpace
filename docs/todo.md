PROJECT PLAN — Haulin Space
===========================

STATUS KEY
[ ] not started
[x] done
[-] in progress

===========================================
PHASE 1 — DATA & GALAXY FOUNDATION
===========================================

[x] Replace inline JS stubs with data/ JSON files
    - All data in data/gamedata.js as JS globals (no fetch needed, works without a server)
    - Root-level stub JSONs deleted

[x] Rebuild galaxy generation (cluster-based per systems_spec.md)
    - 8–12 clusters with min-distance placement
    - 100 named systems placed near cluster centres (round-robin assignment)
    - Intra-cluster nearest-neighbour connections + inter-cluster MST (Kruskal)
    - Connectivity repair pass ensures no isolated systems
    - Faction assigned per cluster; piracy levels by distance from centre + faction type

[x] Galaxy map rendering (becomes M-key overlay in Phase 7)
    - System visual states: undiscovered / discovered (dim) / visited (faction glow)
    - Glowing connection lines between known systems
    - Hover tooltip: system name, faction, piracy level, planet count
    - Zoom/pan: scroll to zoom, drag to pan, +/-/0 keys, Fit button

===========================================
PHASE 2 — PLANET UI PANELS
===========================================

[x] Planet landing screen
    - Panel shows planet name, type, facilities
    - Facility buttons: Market / Shipyard / Upgrade Shop / Mission Board
    - Disabled/dimmed for facilities the planet does not have

[x] UI panel system
    - ui.js: panelStack, showPanel(), closePanel(), openLanding()
    - Back button on each panel pops the stack
    - HUD always-visible strip: ship name, location, credits, cargo used/capacity

===========================================
PHASE 3 — ECONOMY & TRADING
===========================================

[x] Implement price formula
    price = base_price × supplyMod × demandMod × randomFactor
    - PLANET_ECONOMY maps each type to surplus/deficit lists
    - generatePlanetMarket(planet) produces { buy, sell } per commodity; sell = buy × 0.88
    - Market regenerates each visit (persistent markets in Phase 13)

[x] Market screen (panel-market)
    - Commodity table: name | buy price | sell price | hold | Buy/Sell buttons
    - Buy price colour-coded: green (below base), normal, amber (above base)
    - Cargo items not stocked at this market shown dimmed
    - Buy enforces credits and cargo capacity; sell removes from cargo

[x] Planet commodity specialisation
    - Six planet types: agricultural, mining, industrial, trade_hub, military, frontier
    - PLANET_ECONOMY defines surplus/deficit per type; trade hubs stock all commodities

===========================================
PHASE 4 — SHIPS & UPGRADES
===========================================

[x] Shipyard screen
    - Lists ships available at this planet (filtered by tier/faction)
    - Show stats with deltas vs current ship; trade-in at 35% of current ship price
    - Buy ship: deduct credits, replace player ship (cargo transferred up to new capacity)

[x] Upgrade shop screen
    - Lists upgrades with effect and cost
    - Apply upgrade: modify player.ship stats in-place, decrement upgrade_slots
    - player.upgrades[] tracks installed upgrade names

[x] Ship stats enforcement throughout game
    - Cargo cap from ship.cargo
    - Upgrade slots cap from ship.upgrade_slots
    - Hull/HP initialised from ship.hull (player.hp)

===========================================
PHASE 5 — TITLE SCREEN & MAIN MENU
===========================================

[x] Title screen
    - Canvas draws animated scrolling starfield on startup
    - "HAULIN SPACE" logo with blue glow; tagline; blinking "Press any key" prompt
    - Any key or click advances to main menu

[x] Main menu
    - New Game: initialises player/galaxy state, transitions to playing
    - Load Game: reads localStorage save; disabled if no save exists (Phase 13)
    - Options: volume sliders (music/sfx), placeholder for future settings
    - HTML overlay over canvas starfield, dark space theme

===========================================
PHASE 6 — SYSTEM VIEW & SHIP MOVEMENT
===========================================

This is the core gameplay change. The main game view becomes a top-down
system view where the player physically flies their ship. The galaxy map
(built in Phase 1) becomes an M-key overlay (Phase 7).

[x] System view renderer
    - Canvas draws interior of current star system; camera tracks player ship
    - Procedural tiling parallax starfield (3 layers at different speeds/scales)
    - Sun rendered at system centre with golden glow
    - Planets at deterministic orbital positions (seeded from system.id)
    - Planet labels fade in within 700 units; planet pulses blue when in landing range
    - Player ship rendered as triangle with engine flame when thrusting

[x] Ship physics (WASD controls)
    - W: thrust forward; S: reverse/brake (60% thrust); A/D: rotate
    - Physics scaled from ship stats: speed × 30 = max u/s, turn_rate × 25°/s
    - Inertia as exponential damping: time constant = ship.inertia / 3 seconds
    - Delta-time physics step; velocity capped at max speed

[x] Planet proximity & landing
    - LAND_RADIUS 70 units — entering shows pulsing "Press L to land" prompt
    - L key: stops ship, sets landedPlanet, opens planet landing panel for that planet
    - "← Leave Planet" button returns to space with DEPART_SPEED outward nudge
    - Physics and nearPlanet check paused while panel is open or ship is landed

[x] System HUD elements
    - SPD and HDG readouts drawn on canvas bottom-left
    - Landing prompt drawn centred at top of canvas when in range

===========================================
PHASE 7 — GALAXY MAP OVERLAY & JUMP SYSTEM
===========================================

[x] Galaxy map as M-key overlay
    - M key toggles the galaxy map panel on top of the system view
    - Map pauses ship physics while open (or runs at reduced tick)
    - Existing galaxy map rendering (zoom, pan, system states) reused as overlay
    - Click a connected, known system to select it as jump target
    - Selected target highlighted; name shown in HUD when map is closed
    - M or Escape closes map

[x] Jump prerequisites
    - Player must be beyond JUMP_MIN_DISTANCE from all planets in the system
    - A jump target must be selected via galaxy map
    - "JUMP READY" shown in HUD when both conditions are met
    - "Too close to planet — gain distance to jump" warning if J pressed when blocked

[x] J-key jump execution
    - J key initiates jump when prerequisites are met
    - Jump sequence (see animation below)
    - On completion: player.system updated, adjacent systems marked 'discovered'
    - Ship arrives at new system at a random edge position with low inward velocity
    - Galaxy map jump target cleared on arrival

[x] Jump animation sequence
    - Phase A — Deceleration: ship.velocity → 0 over ~1 second (engine cut)
    - Phase B — Spool-up: brief pause with pulsing HUD glow / audio cue
    - Phase C — Warp: ship accelerates rapidly off-screen in jump direction
    - Phase D — Warp lines: background stars stretch into motion-blur streaks
      (length proportional to warp speed; drawn as radial lines from vanishing point)
    - Phase E — Arrival: instant cut to new system; ship fades in at entry point
    - No player input accepted during jump sequence

===========================================
PHASE 8 — FACTIONS & FOG OF WAR
===========================================

[x] Faction system
    - Systems display owning faction colour on galaxy map
    - Faction type affects: security level, ship availability at shipyard, market price modifiers
    - Pirate faction systems have no market; high pirate spawn rate

[x] Full fog-of-war states
    - undiscovered: hidden on galaxy map
    - discovered: visible on map (revealed by travelling into adjacent system)
    - visited: player has been in system; full info available
    - scanned: revealed by long-range scanner upgrade (radius 2)
    - Observatory facility reveals all systems within radius 3

===========================================
PHASE 9 — COMBAT
===========================================

[x] Pirate spawn in system view
    - On arrival in a system, roll for pirate encounter based on piracy level
    - Spawned pirates are NPC ships visible in the system view
    - Pirates fly toward player and engage at weapon range

[x] Real-time combat
    - Player fires weapons with Space bar (or left-click)
    - Weapon damage from ship.weapon_slots stat
    - Hit detection: radius-based collision between projectile and ship
    - HP bars shown in combat HUD (player + nearest enemy)

[x] Flee mechanic
    - Player can flee by reaching jump distance and jumping (normal jump rules)
    - Faster ships (higher speed stat) have easier time breaking range

[x] Combat outcomes
    - Victory: pirate ship drops cargo loot, player collects by flying over it
    - Defeat: game over screen with option to load last save

===========================================
PHASE 10 — NPC TRADERS
===========================================

[x] NPC trader objects in system view
    - 15 active traders spread across the galaxy
    - Rendered as teal freighter shapes, orbiting their docked planet
    - Properties: system, planet, cargo, state (docked/transit), timers

[x] Trader AI loop
    - Sell cargo at current planet, buy cheapest commodity, pick best destination
    - Transit timer (5–13 s) simulates jump travel; dock timer (4–10 s) before departure
    - findBestDestination: 1-hop scan for highest sell price for current cargo

[x] NPC traders influence supply
    - applyPricePressure: ±6% per trade, clamped to [30%, 300%] of base price
    - Planet markets are now persistent (planetMarkets Map keyed by planet.id)
    - Creates natural price flow across the galaxy

===========================================
PHASE 11 — MISSIONS
===========================================

[x] Mission board screen
    - Generates 3–5 missions per planet visit (per openMissionBoard call)
    - Mission types: Delivery / Bounty / Smuggling (Escort deferred — requires coordinated NPC)
    - Max 5 active missions; Accept/Abandon buttons; missions cached in player.missions[]

[x] Mission logic
    - Delivery: arrive at target system within hop limit; reward credits
    - Bounty: named pirate spawns in target system on arrival; reward on kill; bounty target shown with name label and HP bar
    - Smuggling: like delivery but flagged illegal; high reward (2500–6000 cr); faction rep note in description

[x] Mission state tracking
    - Active missions in player.missions[] (persists across jumps; survives save in Phase 13)
    - Delivery/smuggling: hop counter decrements each non-arriving jump; expire at 0
    - Bounty: spawnBountyTargets() guarantees named enemy on system entry; bountyMissionId links kill to reward
    - On-screen notification: green (complete) / red (expired) banner fades over 3.5 s

===========================================
PHASE 12 — EVENTS SYSTEM
===========================================

[x] Periodic event triggers
    - jumpCount increments each jump; fires when jumpCount >= nextEventAt
    - nextEventAt reset to jumpCount + 4-7 after each event; same effect won't stack
    - Loads all 5 event types from GAME_EVENTS in gamedata.js

[x] Event effects
    - Trade Boom (commodity_prices_up): random commodity ×1.50 in market display + actual trades
    - Pirate Invasion (combat_frequency_high): piracyLevel ×2 in spawnPirates (global)
    - Supernova Warning (system_unreachable): target system blocked on galaxy map (dashed orange ring); jump, select, getJumpReadyStatus all refuse; clears selected jump target if blocked
    - Mining Rush (ore_prices_drop): Ore ×0.50 everywhere
    - Fuel Shortage (fuel_prices_up): Fuel ×2.00 everywhere

[x] Event notifications
    - Big yellow ⚡ banner (18px bold) on arrival with title + description, fades over 5 s
    - Active events log drawn bottom-right corner of canvas: name + jumps remaining
    - drawEventAlert() renders on top of galaxy map overlay

===========================================
PHASE 13 — SAVE SYSTEM
===========================================

[x] LocalStorage save/load
    - Saves: player (ship/hp/upgrades/credits/cargo/missions/position), full galaxy layout,
      systemStates Map, planetMarkets Map, npcTraders (planet refs serialised as IDs),
      activeEvents, jumpCount, nextEventAt, jumpTarget, missionCounter
    - Auto-save on every system jump (end of travel())
    - Manual "Save" button in HUD — shows "Game saved" notification banner on success
    - "Load Game" on main menu fully implemented; falls back with alert on corrupt data
    - "Load Last Save" button on game over screen (hidden when no save exists)
    - "New Game" shows confirm() dialog if save exists before overwriting; calls deleteSave()

===========================================
PHASE 14 — POLISH 1
===========================================

[x] Visual polish
    - Nebula cloud backgrounds on galaxy map overlay
    - Particle effects: engine thruster trail, weapon fire (muzzle flash), hit sparks, explosions
    - Animated planet atmospheres (rotating glow ring)
    - Screen-edge planet arrows when planets are off camera

[x] Content completion
    - Black market on pirate-faction planets (contraband + weapons + cargo fencing)
    - Two illegal commodities added: Contraband (380 cr) and Weapons (220 cr)
    - Observatory already implemented (frontier planets, radius-3 reveal)

===========================================
PHASE 15 — POLISH 2
===========================================

[x] Audio (Web Audio API synthesised — no asset files)
    - Ambient space drone + combat drone music
    - SFX: thrust, weapon fire, hit, explosion, jump spool, jump warp, dock, trade, notify, alert
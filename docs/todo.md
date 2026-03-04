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
    - 30 active traders spread across the galaxy
    - Rendered using npc_trader sprite, orbiting their docked planet
    - Properties: system, planet, cargo, state (docked/departing/transit/arriving), timers

[x] Trader AI loop
    - Sell cargo at current planet, buy cheapest commodity, pick best destination
    - Transit timer simulates jump travel; dock timer before departure
    - findBestDestination: 1-hop scan for highest sell price for current cargo

[x] Trader flight paths (visual departure and arrival)
    - Traders physically fly outward from their planet before jumping (2× player jump distance = 800 units)
    - On arrival, they appear 800 units out and fly inward to the destination planet
    - Minimap shows traders during flight (teal dot)
    - If player jumps away mid-flight, trader instantly transitions to transit/docked

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
PHASE 15 — AUDIO UPGRADE
===========================================

[x] Audio (Web Audio API synthesised — no asset files)
    - Ambient space drone + combat drone music
    - SFX: thrust, weapon fire, hit, explosion, jump spool, jump warp, dock, trade, notify, alert

[ ] Replace synthesised audio with real assets (once files are ready)
    - music/space_ambient.ogg     — looping space flight drone
    - music/combat.ogg            — looping combat track
    - music/title.ogg             — title screen music
    - music/docked.ogg            — docked-at-planet ambient
    - sfx/thrust.ogg              — engine loop
    - sfx/weapon_fire.ogg         — laser/cannon shot
    - sfx/hit.ogg                 — projectile impact
    - sfx/explosion.ogg           — ship destroyed
    - sfx/jump_spool.ogg          — jump drive charging
    - sfx/jump_warp.ogg           — warp transit
    - sfx/dock.ogg                — landing/docking chime
    - sfx/trade.ogg               — buy/sell confirm
    - sfx/notify_success.ogg      — mission complete
    - sfx/notify_fail.ogg         — mission failed/expired
    - sfx/alert.ogg               — galactic event warning

===========================================
PHASE 16 — SHIP SPRITES
===========================================

All ships currently render as coloured triangles. Each needs a sprite image
(PNG with transparency, recommended ~64×64 or ~96×96, facing right = 0°).

Player / purchasable ships (15 total — data/ships.json):

[x] Sprites/Ships/Rustrunner_Shuttle.png       — Tier 1, starter ship
[x] Sprites/Ships/Cinder_Scout.png             — Tier 1, sleek fast scout
[x] Sprites/Ships/Mercury_Courier.png          — Tier 2, slim delivery ship
[x] Sprites/Ships/Atlas_Freighter.png          — Tier 2, wide-body cargo hauler
[x] Sprites/Ships/Drake_Raider.png             — Tier 2, aggressive mid-tier raider
[x] Sprites/Ships/Nova_Trader.png              — Tier 3, bulky trade vessel
[x] Sprites/Ships/Falcon_Interceptor.png       — Tier 3, agile interceptor
[x] Sprites/Ships/Orion_Gunship.png            — Tier 3, medium warship
[x] Sprites/Ships/Titan_Hauler.png             — Tier 4, massive cargo ship
[x] Sprites/Ships/Viper_Strikecraft.png        — Tier 4, fast strike fighter
[x] Sprites/Ships/Sentinel_Frigate.png         — Tier 4, armoured frigate
[x] Sprites/Ships/Leviathan_Freighter.png      — Tier 5, enormous freighter
[x] Sprites/Ships/Phantom_Stealth.png          — Tier 5, sleek stealth ship
[x] Sprites/Ships/Aegis_Destroyer.png          — Tier 5, heavy destroyer
[x] Sprites/Ships/Celestial_Dreadnought.png    — Tier 6, massive capital ship
[x] Sprites/Ships/Matts_Ship.png               — Tier 7, special ship

NPC / enemy ships:

[x] Sprites/Ships/npc_pirate_light.png         — low-tier pirate (Tier 1–2 enemies)
[x] Sprites/Ships/npc_pirate_heavy.png         — high-tier pirate (Tier 3–5 enemies)
[x] Sprites/Ships/npc_trader.png               — NPC freighter that orbits planets

Code work:
[x] Load sprites via Image() objects at startup; fall back to triangle if missing
[x] Draw player ship using ctx.drawImage() rotated to player.angle
[x] Draw enemy ships using sprite mapped from their ship.tier
[x] Draw NPC trader using trader sprite
[x] Scale sprites proportionally to ship hull stat (bigger hull = slightly larger sprite)
[x] Show ship sprite during warp/jump animation (was showing placeholder triangle)

===========================================
PHASE 17 — PLANET & ENVIRONMENT SPRITES
===========================================

Planets currently render as coloured circles with a glow ring.

Planet type images (4 variants for agricultural/mining; 3 for others):
[x] Sprites/planets/planet_agricultural_1.png  — green/brown fertile world
[x] Sprites/planets/planet_agricultural_2.png  — variant
[x] Sprites/planets/planet_agricultural_3.png  — variant
[x] Sprites/planets/planet_agricultural_4.png  — variant
[x] Sprites/planets/planet_mining_1.png        — rocky, cratered, grey/orange
[x] Sprites/planets/planet_mining_2.png        — variant
[x] Sprites/planets/planet_mining_3.png        — variant
[x] Sprites/planets/planet_mining_4.png        — variant
[x] Sprites/planets/planet_industrial_1.png    — polluted, dark with city lights
[x] Sprites/planets/planet_industrial_2.png    — variant
[x] Sprites/planets/planet_industrial_3.png    — variant
[x] Sprites/planets/planet_trade_hub_1.png     — bright, well-lit megacity world
[x] Sprites/planets/planet_trade_hub_2.png     — variant
[x] Sprites/planets/planet_trade_hub_3.png     — variant
[x] Sprites/planets/planet_military_1.png      — grey, fortified appearance
[x] Sprites/planets/planet_military_2.png      — variant
[x] Sprites/planets/planet_military_3.png      — variant
[x] Sprites/planets/planet_frontier_1.png      — barren, remote, dim
[x] Sprites/planets/planet_frontier_2.png      — variant
[x] Sprites/planets/planet_frontier_3.png      — variant
[x] Sprites/planets/moon.png                   — decorative moon, orbits ~1 in 4 planets

Star / sun images (10 types, loaded and assigned per system):
[x] Sprites/stars/star_yellow.png         — standard yellow star
[x] Sprites/stars/star_yellow_white.png   — yellow-white star
[x] Sprites/stars/star_orange.png         — orange star
[x] Sprites/stars/star_blue.png           — hot blue star
[x] Sprites/stars/star_blue_giant.png     — blue giant
[x] Sprites/stars/star_red_dwarf.png      — red dwarf
[x] Sprites/stars/star_red_giant.png      — red giant
[x] Sprites/stars/star_white.png          — white star
[x] Sprites/stars/star_purple.png         — purple star (rare)
[x] Sprites/stars/star_neutron.png        — neutron star (rare)

Code work:
[x] Assign star type deterministically per system via seeded hash of system ID
[x] Draw sun using star sprite (320×320) instead of canvas arc; fallback to arc if not loaded
[x] Draw planets using planet type sprite; variant chosen via hashStr(planet.name); fallback to arc
[x] Keep atmosphere glow ring layered on top of planet sprite
[x] Decorative moon orbits ~1 in 4 planets (hashStr-based, non-interactable, slowly rotates)

Loot / collectibles:
[ ] sprites/loot/cargo_pod.png            — floating loot pickup (replaces ◆ text)

===========================================
PHASE 18 — PROJECTILE & WEAPON VARIETY
===========================================

Currently all projectiles are plain coloured circles. Each weapon tier / type
should have a distinct look (and eventually distinct behaviour).

Projectile sprite / style work:
[x] Player bolt (1 weapon slot)    — small blue-white energy bolt, narrow rect or teardrop
[x] Player bolt (2–3 weapon slots) — brighter, slightly larger, twin-shot offset
[x] Player bolt (4–6 weapon slots) — heavy cannon round, orange/red tint, wider
[x] Enemy bolt                     — red/crimson energy bolt, mirror of player styles by tier
[x] Missile (future weapon type)   — slow, homing; distinct elongated sprite with flame trail
[ ] sprites/projectiles/bolt_player.png     — player energy bolt sprite (optional)
[ ] sprites/projectiles/bolt_enemy.png      — enemy bolt sprite (optional)
[ ] sprites/projectiles/missile.png         — missile sprite (optional)

Code work:
[x] Add projectile.style field ('bolt_light' | 'bolt_medium' | 'bolt_heavy' | 'missile') based on wslots
[x] Update drawProjectiles() to draw as rotated rects/shapes or sprites based on style
[x] Scale bolt size and glow intensity with weapon_slots tier
[x] Add missile weapon type to GAME_UPGRADES (homing, slow, high damage)
    - Missile Launcher upgrade (18,000 cr, unique) — grants 5 missiles, replenished free on landing
    - Fire with X key; homing (MISSILE_TURN 2.8 rad/s), 70+ damage, 5s lifetime
    - HUD missile counter shows ammo; turns red when empty

===========================================
PHASE 19 — REMAINING CONTENT & GAMEPLAY
===========================================

[x] Faction reputation system
    - Player reputation per faction (-100 to +100), starts at 0
    - Trading/missions with a faction increases rep; attacking their ships reduces it
    - High rep: better prices, exclusive missions, access to military ships
    - Low rep: ships attack on sight, banned from faction shipyards/markets
    - Displayed in HUD or dedicated reputation panel

[x] Escort mission type
    - Escort NPC spawns near player on accept; follows player at ~250 units
    - Jumps alongside player (preserved through clearCombat, re-placed on arrival)
    - Enemy shots can hit escort NPC; mission fails if it's destroyed
    - Mission completes on landing at target system with escort alive
    - Hop-limit expiry works same as delivery/smuggling
    - Escort badge: green, +12 rep on completion, distinct flavor text
    - Re-spawned on save load for active escort missions

[x] Faction border overlays on galaxy map
    - Radial gradient blobs per known system, blending into soft faction territories
    - Drawn between nebula and connection layers in drawGalaxyMapOverlay()

[x] Additional galactic events
    - Faction War: two factions conflict; systems contested, rep effects
    - Plague Outbreak: medicine prices ×3 in affected systems for 10 jumps
    - Gold Rush: luxuries prices ×2, player tips about a specific rich system

[x] Player info panel (I key)
    - Full-screen panel showing ship stats, hull/HP, fitted upgrades, active missions, cargo summary
    - Credits, cargo used/free, upgrade slots used/remaining
    - Accessible via I key or pause menu

[x] Upgrade shop improvements
    - Unique upgrades (Targeting Computer, Scanner, etc.) show "✓ Fitted" when installed — not purchasable again
    - Stackable upgrades show "Fitted ×N" count badge
    - Hover tooltip on each upgrade row showing stat change and slot cost

[x] Galaxy map facility indicators
    - Tooltip for visited systems lists available facilities per planet (Market, Shipyard, Refuel, etc.)

[x] Difficulty settings (New Game screen)
    - Easy / Normal / Hard — affects starting credits, piracy rates, combat damage

[x] Tutorial / onboarding
    - 5-step card shown on first new game (localStorage flag suppresses on repeat)
    - Covers: piloting, landing, trading, galaxy map, jumping
    - Next/Skip buttons; loading a save skips it entirely

[x] Statistics screen
    - Total jumps, credits earned, cargo traded, enemies destroyed, missions completed
    - Accessible from main menu or settings panel

[x] Credits / about screen
    - Accessible from main menu; shows game title, version, full controls reference
    - Controls grid with all keybindings (W/A/S/D, L, M, J, Space, X, Shift, I, Esc)

===========================================
PHASE 20 — IN-GAME MENU REVAMP
===========================================

The current settings panel is a minimal cog-icon dropdown. This phase
replaces it with a proper full-screen pause menu and reworks the main menu
options screen.

[x] Pause menu (Escape key)
    - Full-screen overlay that pauses physics, combat timers, and NPC updates
    - Buttons: Resume, Save Game, Load Last Save, Options, Quit to Main Menu
    - Replaces the current cog dropdown — cog button opens pause menu instead
    - Distinct visual style from game panels (darker, more opaque, centred modal)

[x] Options screen (accessible from pause menu and main menu)
    - Audio tab: Music Volume slider, SFX Volume slider
    - Keybindings tab (see below)
    - Changes apply immediately; "Restore Defaults" button resets all

[x] Keybindings
    - Tabbed section within Options listing every bindable action:
        Thrust Forward     (default W)
        Thrust Reverse     (default S)
        Rotate Left        (default A)
        Rotate Right       (default D)
        Fire Weapon        (default Space)
        Land / Interact    (default L)
        Jump               (default J)
        Galaxy Map         (default M)
        Pause / Menu       (default Escape)
    - Click Rebind then press a key to reassign
    - Conflicts auto-clear previous binding for that key
    - Bindings persisted to localStorage
    - DEFAULT_KEYBINDS constant; matchKey() + isKeyHeld() helpers in game.js

[x] HUD polish pass
    - Removed standalone Fit button from HUD
    - HUD hint bar condensed to one-liner
    - Cog button now opens full pause menu

===========================================
PHASE 21 — QUALITY OF LIFE
===========================================

[x] Minimap
    - Small always-visible radar in bottom-right showing nearby planets + enemies
    - Blips colour-coded: blue = planet, red = enemy, teal = NPC trader, yellow = loot
    - Autopilot target highlighted with green ring on minimap

[x] Autopilot / waypoint
    - Click a planet on screen to set it as a waypoint; ship auto-flies toward it
    - Player can interrupt autopilot at any time with any WASD key
    - Auto-lands on arrival; autopilot label shown above minimap

[x] Market price history
    - Track last 5 buy prices per commodity per planet (priceHistory Map in game.js)
    - Trend arrow (↑↓→) next to buy price in market panel

[x] Cargo manifest panel
    - Dedicated screen (panel-cargo) showing full cargo contents, average buy price paid, estimated sell value
    - Accessible via "Cargo Manifest" button in the pause menu

[ ] Keybinding reference overlay
    - Removed — replaced by full keybindings editor in Phase 20 Options screen

===========================================
PHASE 22 — FUEL SYSTEM
===========================================

Ships have a finite fuel supply measured in jumps. Running out strands the
player — they can only drift and fight until refuelled.

[x] Ship fuel capacity (data)
    - fuel_capacity added to all 15 ships in GAME_SHIPS (Tier 1=6 → Tier 6=16)
    - player.fuel initialised on new game and ship purchase
    - Each jump in travel() decrements player.fuel by 1
    - Jump blocked (with "No fuel — land and refuel" warning) if player.fuel === 0

[x] Refuelling
    - fuel: bool added to generatePlanet() per FUEL_ODDS table
    - Trade hubs/military/industrial: 100%, agricultural/mining: 80%, frontier: 50%
    - Pirate faction planets always fuel: false
    - Refuel row appears on planet landing screen when planet has fuel
    - Cost: 150 cr × ship tier per jump; top-up only
    - Fuel Shortage event doubles refuel cost automatically
    - Refuel row updates in-place without reopening the panel

[x] Fuel HUD indicator
    - Fragmented bar in HUD: one fragment per jump of capacity
    - Filled = blue, empty = dark, last fragment pulses red when fuel === 1
    - "N / cap" text label beside bar; turns red when fuel === 0

[x] Stranded state
    - Jump blocked with warning when fuel === 0
    - Ship can still fly within the system; landing and refuelling still works
    - "NO FUEL" shown in red beside the fuel bar

===========================================
PHASE 23 — NEWTONIAN PHYSICS & GRAVITY WELLS
===========================================

Replace the simplified speed/turn_rate stat system with mass-based Newtonian
physics. Ships have real mass; thrust and RCS ratings drive acceleration and
rotation; planets and stars exert gravity within a defined radius.

All masses expressed in Tonnes (T). All thrust expressed in T/s (equivalent
to kN normalised to the game's unit scale).

---

SHIP MASS DATA  (data/gamedata.js — GAME_SHIPS)

[x] Add hull_mass_t (T) to each ship — hull_mass_t field added to all 16 ships
    Actual values used:
      Tier 1: 75–80 T  (shuttle/scout)
      Tier 2: 130–220 T
      Tier 3: 200–360 T
      Tier 4: 260–520 T
      Tier 5: 280–950 T
      Tier 6: 1900 T  (dreadnought)

---

EQUIPMENT CATALOGUE  (data/gamedata.js — new GAME_EQUIPMENT array)

[x] Each equipment object:
      { name, type, mass_t, price, size, description, thrust_ts?, rcs_ts? }
    Types implemented: 'engine' and 'thruster' (6 tiers each)
    'size' limits install to ships of >= that tier

[x] Full GAME_EQUIPMENT catalogue in data/gamedata.js:
      Engines   — Basic Ion Drive (T1) → Quantum Flux Engine (T6)
      Thrusters — Basic RCS Package (T1) → Omni-Directional Grid (T6)
    (Existing GAME_UPGRADES retained as-is; backward compat preserved)

---

CARGO MASS  (data/gamedata.js — GAME_COMMODITIES)

[x] Add mass_t per unit to each commodity
    Implemented values:
      Ore: 2.0 · Machinery: 1.5 · Water/Fuel: 1.2 · Food: 0.8
      Weapons: 0.8 · Contraband: 0.4 · Electronics/Medicine: 0.3 · Luxuries: 0.2

---

COMPUTED SHIP PROPERTIES  (game.js)

[x] computeShipStats() — computes { hull_mass_t, cargo_mass_t, totalMass_t, mass_ratio }
    mass_ratio = hull_mass_t / totalMass_t (1.0 when empty, lower when loaded)
    Stored as player._mass. Called on: cargo buy/sell/jettison/loot, ship purchase, load.
    Equipment array deferred — using mass_ratio against existing speed/turn_rate stats.

---

PHYSICS UPDATE  (game.js — updatePhysics)

[x] Mass-ratio scaling: ACCEL × mass_ratio, TURN × mass_ratio^0.6, VMAX × mass_ratio^0.4
    Empty ship performs at 100%; fully loaded Titan Hauler at ~60%.
[x] Angular momentum: player.angularVelocity with exp(-5*dt) damping (0.2s time constant)
    Rotation now has inertia — you can't stop spinning instantly.
[x] Saved/loaded as part of player state; reset to 0 on ship purchase.

---

GRAVITY WELLS  (game.js)

[x] getPlanetGravity(planet) — returns { g, radius } by planet type
    trade_hub: g=6/r=400 · military: g=5/r=360 · industrial: g=4/r=340
    mining: g=3.5/r=300 · agricultural: g=3/r=280 · frontier: g=1.5/r=200
[x] Star at (0,0): g=15, radius=350; G_SCALE=0.15 globally
[x] Inverse-square gravity applied to player ship each physics tick
[x] player._gravMag stored per tick for HUD display
[x] GRAV indicator shown in system HUD when gravity magnitude > 0.5
[x] Gravity applied to enemies, civilian NPCs, and missiles

---

SLINGSHOT MANOEUVRE

[ ] Emerges naturally from the gravity + physics system — no extra code needed
    Heavy cargo ships can "fall" around a planet to gain speed without burning fuel
    Document in in-game tutorial step 6 (add step) or tooltip

---

CARGO JETTISON  (ui.js + game.js)

[x] Jettison button per commodity row in Cargo Manifest
    Jettisoned goods scatter as loot near ship position
    Mission cargo is protected — can't jettison mission-locked units
    computeShipStats() called immediately → ship performance updates

---

EQUIPMENT SHOP  (ui.js)

[x] Replace / extend Upgrade Shop (panel-upgrades) to list GAME_EQUIPMENT
    - "Equipment" tab added to existing upgrade shop tab bar
    - Filtered by size ≤ ship tier; two sections: Engines / RCS Thrusters
    - Shows mass, thrust/RCS rating, tier requirement, price per row
    - One engine + one thruster equipped at a time; swapping replaces current
    - Sell button refunds 33% of cost; free items have a Remove button
    - Fitted equipment shown in Commander Status (I key) panel
    - Equipment mass included in computeShipStats() total mass
    - thrust_mult / rcs_mult applied to ACCEL_BASE and TURN_BASE in physics

---

HUD & PLAYER INFO UPDATES

[x] Commander Status panel: Mass row shows hull + cargo + total + performance %
[x] GRAV indicator drawn on canvas (bottom-left, same area as SPD/HDG) when > threshold

---

BACKWARD COMPATIBILITY

[x] hull_mass_t ?? 200 fallback for old saves
[x] angularVelocity ?? 0 on load — old saves restore cleanly
[x] computeShipStats() called on load — mass computed from current cargo

===========================================
PHASE 24 — FACTION JUMP GATES
===========================================

Each faction operates one large jump gate somewhere in its territory. Gates
allow the player to skip across a large swathe of the galaxy in a single jump
— bypassing the need to hop through a dozen intermediate systems. A gate is
only usable once the player has physically visited the system it lives in.

Gates are distinct from the existing system-to-system jump drive, which remains
unchanged. Think of the drive as local freight lanes and gates as express
corridors between faction capitals.

---

GATE PLACEMENT  (starmap-generator.js)

[ ] One gate per faction — placed in the faction's most central cluster system
    (the system closest to the cluster's centroid)
    Stored in galaxy.jumpGates = [ { factionName, systemId, x, y, destSystemId }, ... ]

[ ] Gate destination is the most central system of each OTHER faction (round-robin
    pairing so gates form a ring: Traders → Navy → Miners → Pirates → Traders)
    Distance between paired systems should be at least 20 hops; if not, pick the
    farthest known system of that faction instead

[ ] Gate is a physical object in the system view — a large orbital ring structure
    rendered near the star (800–1000 world units out on a fixed bearing)
    Visible as a glowing ring matching faction colour; animated slow rotation

---

DISCOVERY & ACCESS  (game.js)

[ ] A gate is "known" only if systemStates.get(gate.systemId) is 'visited'
    (player has physically been in that system — just discovering it is not enough)

[ ] Gates shown on galaxy map only for known systems:
    - Distinct icon on the galaxy map node (concentric ring symbol)
    - Tooltip lists gate destination system name and faction

[ ] Attempting to use an unknown gate (e.g. via console or future NPC tip)
    shows: "Gate access requires docking at [System Name] first"

---

USING A GATE  (game.js + ui.js)

[ ] Player flies close to the gate structure (proximity radius ~120 world units)
    — same mechanic as planet landing range

[ ] Prompt appears: "Press L to access [Faction] Jump Gate"

[ ] Gate panel (panel-gate) opens — similar to planet landing panel:
    - Shows faction name, gate destination system and its faction
    - Shows player's current reputation with gate's faction
    - Fuel cost: 3 units (same as 3 normal jumps — gates burn reserve power)
    - Hostile rep (≤ -50) blocks access: "Gate authority has locked you out"
    - "Engage Gate" button initiates the long-range jump

[ ] Long-range jump sequence:
    - Same warp animation as normal jump but extended (warp lines last longer)
    - Arrival: player spawns near the destination gate structure
    - All intermediate systems along the shortest path are marked 'discovered'
      (the transit computer pings them — player gets partial map data)
    - galaxy map jump target is cleared on arrival

---

GALAXY MAP  (game.js — drawSystems / drawConnections)

[ ] Draw gate connections as distinct lines on galaxy map:
    - Dashed or double-line style, faction colour at higher opacity than normal lanes
    - Only drawn if both the source system is 'visited' (gate known)
    - Label the line "Jump Gate" on hover

---

ECONOMY & REPUTATION HOOKS  (future extension — not in this phase)

    Gate tax, faction-controlled access tiers, and gate destruction are deferred.
    This phase establishes the physical infrastructure and travel mechanic only.

===========================================
PHASE 25 — POLISH 2 & BUG FIXES
===========================================

[x] Star sprites loaded and assigned per system
    - 10 star types with weighted distribution (yellow/red dwarf most common, neutron/purple rare)
    - Type is deterministic per system ID via Knuth hash — same system always shows same star

[x] Ship sprites fully integrated
    - All 15 player ships + Matts Ship + 3 NPC variants loaded at startup
    - Sprite shown during warp animation (was showing placeholder triangle)
    - Sprite size scaled to hull stat; triangle fallback if image not loaded

[x] NPC trader flight paths
    - Traders now visibly depart from planets and fly to jump distance before jumping
    - Arriving traders fly in from jump distance to planet orbit
    - Minimap tracks traders during flight

[x] Rocket Launcher reworked
    - Changed from weapon slot to upgrade slot (bolt-on rocket pod, not a main turret)
    - Now coexists with Missile Launcher on any ship regardless of weapon slot count
    - Save migration: old Rocket Launcher installs moved from weaponSlots to upgrades on load

[x] Jump arrival position fixed
    - Player now spawns radially outward 500 units past the first planet on arrival
    - Clears the 400-unit jump exclusion zone immediately — can jump again right away

[x] Upgrade slot migration on load
    - upgrade_slots recalculated from current GAME_UPGRADES data on every save load
    - Fixes saves corrupted by old Rocket Launcher slot behaviour

[x] Delete button on save slot picker
    - Small red ✕ button on each filled slot; confirms before deleting

===========================================
WISHLIST — FUTURE / BIG IDEAS
===========================================

Ideas that would significantly expand the game but require substantial design
and implementation work. Not scheduled for any phase yet.
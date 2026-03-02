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

[ ] sprites/ships/rustrunner_shuttle.png       — Tier 1, starter ship, small boxy utility craft
[ ] sprites/ships/cinder_scout.png             — Tier 1, sleek fast scout
[ ] sprites/ships/mercury_courier.png          — Tier 2, slim delivery ship
[ ] sprites/ships/atlas_freighter.png          — Tier 2, wide-body cargo hauler
[ ] sprites/ships/drake_raider.png             — Tier 2, aggressive mid-tier raider
[ ] sprites/ships/nova_trader.png              — Tier 3, bulky trade vessel
[ ] sprites/ships/falcon_interceptor.png       — Tier 3, agile interceptor
[ ] sprites/ships/orion_gunship.png            — Tier 3, medium warship
[ ] sprites/ships/titan_hauler.png             — Tier 4, massive cargo ship
[ ] sprites/ships/viper_strikecraft.png        — Tier 4, fast strike fighter
[ ] sprites/ships/sentinel_frigate.png         — Tier 4, armoured frigate
[ ] sprites/ships/leviathan_freighter.png      — Tier 5, enormous freighter
[ ] sprites/ships/phantom_stealth.png          — Tier 5, sleek stealth ship
[ ] sprites/ships/aegis_destroyer.png          — Tier 5, heavy destroyer
[ ] sprites/ships/celestial_dreadnought.png    — Tier 6, massive capital ship

NPC / enemy ships (these can share art with player ships or be distinct variants):

[ ] sprites/ships/npc_pirate_light.png         — low-tier pirate (used for Tier 1–2 enemies)
[ ] sprites/ships/npc_pirate_heavy.png         — high-tier pirate (used for Tier 3–5 enemies)
[ ] sprites/ships/npc_trader.png               — NPC freighter that orbits planets

Code work (once sprites are ready):
[ ] Load sprites via Image() objects at startup; fall back to triangle if missing
[ ] Draw player ship using ctx.drawImage() rotated to player.angle
[ ] Draw enemy ships using sprite mapped from their ship.tier
[ ] Draw NPC trader using trader sprite
[ ] Scale sprites proportionally to ship hull stat (bigger hull = slightly larger sprite)

===========================================
PHASE 17 — PLANET & ENVIRONMENT SPRITES
===========================================

Planets currently render as coloured circles with a glow ring.

Planet type images (each type needs at least one image; multiple variants optional):
[ ] sprites/planets/agricultural.png      — green/brown fertile world
[ ] sprites/planets/agricultural_2.png    — variant (optional)
[ ] sprites/planets/mining.png            — rocky, cratered, grey/orange
[ ] sprites/planets/mining_2.png          — variant (optional)
[ ] sprites/planets/industrial.png        — polluted, dark with city lights
[ ] sprites/planets/trade_hub.png         — bright, well-lit megacity world
[ ] sprites/planets/military.png          — grey, fortified appearance
[ ] sprites/planets/frontier.png          — barren, remote, dim

Star / sun images:
[ ] sprites/stars/star_yellow.png         — standard yellow star (most systems)
[ ] sprites/stars/star_blue.png           — hot blue star
[ ] sprites/stars/star_red.png            — red dwarf / red giant
[ ] sprites/stars/star_white.png          — white star

Code work (once sprites are ready):
[ ] Add star_type field to systems in generateGalaxy() (derived from faction/seed)
[ ] Draw sun using star sprite instead of canvas arc
[ ] Draw planets using planet type sprite, with slow rotation via ctx.rotate(time)
[ ] Keep atmosphere glow ring layered on top of planet sprite

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

[ ] Escort mission type (deferred from Phase 11)
    - Spawn an NPC ship that follows the player through one jump
    - Player must keep it alive; pirate aggression scales up during escort
    - Reward on successful arrival at destination

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
WISHLIST — FUTURE / BIG IDEAS
===========================================

Ideas that would significantly expand the game but require substantial design
and implementation work. Not scheduled for any phase yet.

---

[ ] Jump Gates
    Every system has a single jump gate acting as the sole entry and exit point
    for smaller ships. Ships below cruiser class have no on-board jump drive and
    must use the gate. Cruiser-class and larger carry their own jump engines and
    can open a jump point anywhere in the system.

    Gameplay implications:
    - Gates are natural choke points — controlling or destroying one locks down
      a system's traffic. Could create tense tactical situations for traders and
      pirates alike.
    - Large ships with jump engines can jump anywhere, enabling pincer manoeuvres
      (fleet warps behind an enemy that expected them to use the gate).
    - Gates are destructible but regenerate quickly; taking one out is a
      disruptive but temporary play.
    - Jump engines aboard large ships have a warm-up and cool-down window that
      leaves the ship exposed — a trade-off vs. the convenience of the gate.
    - The faction controlling a system can levy a gate tax on passing ships,
      creating a steady passive income stream for the player if they hold systems.
    - Even ships with jump engines may prefer the gate to avoid the energy cost
      and vulnerability of a manual jump — making gate use an interesting
      economic/risk decision rather than an obvious choice.

    Design questions to resolve before implementing:
    - Where is the gate physically placed in the system view? Fixed edge position
      or near the star?
    - Does the player's current ship (Shuttle etc.) have a jump drive at all, or
      is jumping always gate-dependent until they buy a cruiser?
    - How does gate tax interact with faction reputation?
    - Can pirates blockade a gate? Can the player do the same?
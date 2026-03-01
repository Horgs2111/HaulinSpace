# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Game

Open `index.html` directly in a browser. There is no build step, no package manager, and no server required.

## Architecture

This is a browser-based 2D space trading game called **Haulin Space** built with vanilla HTML5, CSS, and JavaScript using Canvas rendering and LocalStorage for saves.

### Script Load Order

`index.html` loads scripts in dependency order — this is critical since the project uses global scope with no module system:

1. `data/gamedata.js` — all game data as globals (`GAME_SHIPS`, `GAME_COMMODITIES`, `GAME_FACTIONS`, `GAME_EVENTS`, `GAME_UPGRADES`, `SYSTEM_NAMES`)
2. `starmap-generator.js` — exposes `generateGalaxy()`, `generatePlanet()`
3. `economy-engine.js` — exposes `generateMarket()`, `buyCommodity()`, `sellCommodity()`
4. `combat-engine.js` — exposes `createEnemy()`, `attack()`
5. `game.js` — canvas, player state, draw loop, `updateHUD()`, `travel()`, fog-of-war (`systemStates` Map)
6. `ui.js` — panel stack (`activePanel`, `panelStack`), `showPanel()`, `closePanel()`, `openLanding()`; loaded last so it can safely reference `galaxy`/`player` from game.js

### Canonical Data

`data/` JSON files are the authoritative game data source. The inline JS arrays in the engine files (e.g. `SHIPS` in `combat-engine.js`) are early stubs that should be superseded by loading from `data/`. The `data/ships.json` schema includes fields not present in the stub: `hull`, `upgrade_slots`, `price`, `tier`.

| File | Contents |
|---|---|
| `data/ships.json` | 15 ships across 6 tiers with full stats |
| `data/systems.json` | Named star systems with connections and planet refs |
| `data/factions.json` | Factions (trade, pirate, military, industrial) |
| `data/events.json` | Procedural events with effects and durations |
| `data/upgrades.json` | Ship upgrade definitions and stat effects |
| `data/commodities.json` | Commodity list (see `economy-engine.js` for base prices/volatility) |
| `data/planets.json` | Planet data |

### Design Docs

`docs/` contains the authoritative design specs. Consult these before implementing features:

- `docs/game_design.md` — full game spec (core loop, galaxy layout, economy, factions, combat, missions, fog of war, save system)
- `docs/systems_spec.md` — galaxy generation algorithm, fog-of-war states, economy formula, NPC traders, pirates, faction war, event system
- `docs/ships.md` — canonical ship roster with stats (15 ships across light/trading/combat/special categories)
- `docs/star_map_style.md` — visual style guide for the galaxy map (star states, colors, hover effects)
- `docs/assets.md` — planned asset list (sprites, audio, icons)
- `docs/todo.md` — feature checklist

### Game Systems (Planned vs. Implemented)

The codebase is an early prototype. Implemented so far:
- Procedural galaxy generation (100 systems, random connections, planet generation)
- Canvas rendering of galaxy map with fog-of-war (discovered/undiscovered)
- Click-to-travel between connected systems
- Commodity market data structures and buy/sell functions
- Ship definitions and basic combat math

Not yet implemented (per `docs/todo.md`): trading UI, mission system, NPC traders, pirate AI, faction ownership, procedural events, save/load, all UI screens (planet landing, shipyard, combat HUD, mission board).

### Galaxy Generation

`generateGalaxy(count)` currently places systems randomly. Per `docs/systems_spec.md`, the intended algorithm is cluster-based: generate 8–12 clusters, place systems near cluster centers, connect nearest neighbors, cap at 3 connections per system, ensure full connectivity.

### Economy Formula

Per `docs/systems_spec.md`:
```
price = base_price × supply_modifier × demand_modifier × random_factor
```
NPC traders should influence supply levels as they move commodities between systems.

### Player State Shape

```js
player = {
  system: 0,       // current system index
  ship: SHIPS[0],  // ship object
  credits: 1000,
  cargo: {},       // { commodityId: quantity }
  x, y,            // position (for future inertia physics)
  angle,
  velocity
}
```

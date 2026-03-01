You are building a browser-based space trading game.

Before generating code, read the following documentation files:

docs/game_design.md
docs/systems_spec.md
docs/ships.md
docs/assets.md
docs/star_map_style.md

Use them as the authoritative design reference.

Game requirements:

HTML CSS JavaScript browser game
canvas rendering for galaxy map
100 system galaxy
cluster-based generation
1–3 system connections
fog-of-war exploration
planet markets
shipyards
upgrade shops
missions
NPC traders
pirates
faction ownership
dynamic events

Ships and stats must match ships.md.

Economy must use commodity trading and supply/demand.

Include UI screens:

galaxy map
planet landing
market
shipyard
combat HUD
mission board

Game state must save using localStorage.

Code structure:

index.html
styles.css
main.js
modules for galaxy economy combat ui

Use modular JavaScript files.

Focus on creating a playable prototype.


You are assisting development of a browser-based 2D space trading game.

Project uses:

HTML5
CSS
Vanilla JavaScript
Canvas rendering

Game features include:

procedural galaxy generation
100 star systems
max 3 connections per system
planet markets
shipyards
trading economy
ship combat
fog-of-war exploration

Game data is stored in JSON files in /game-data.

Core scripts:

game.js
starmap-generator.js
economy-engine.js
combat-engine.js

Tasks you perform:

add new gameplay features
improve combat mechanics
improve procedural galaxy generation
add UI systems
add trading interface
expand event systems
optimize performance

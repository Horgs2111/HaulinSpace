GAME NAME
Starlane Trader (working title)

GAME TYPE
2D top-down browser-based space exploration, trading, and combat game.

TECH STACK
HTML
CSS
JavaScript
Canvas rendering
LocalStorage saves

CORE LOOP

1 Travel to star systems
2 Land on planets
3 Buy and sell commodities
4 Upgrade ships
5 Fight pirates
6 Complete missions
7 Explore unknown systems
8 Earn credits
9 Buy better ships

GALAXY

Total systems: 100

Planet distribution:
2% systems have 0 planets
83% systems have 1 planet
15% systems have 2 planets

Connections:
Each system connects to 1–3 other systems
Galaxy must remain fully connected

Galaxy layout:
Cluster-based generation
8–12 clusters
Cluster connections create trade lanes

SYSTEM DATA

System contains:
name
x position
y position
planets
connections
faction owner
piracy level
discovered flag

PLANETS

Planets may contain:
commodity market
shipyard
upgrade shop
mission board
black market
observatory

Not every planet contains every facility.

ECONOMY

Commodity markets vary by planet type.

Commodity examples:
Food
Ore
Electronics
Machinery
Weapons
Luxury Goods
Fuel Cells
Textiles
Medicine
Water

Prices vary by supply and demand.

NPC traders move commodities between systems.

FACTIONS

Factions control regions of space.

Example factions:

Solar Union
Helix Consortium
Iron Armada
Free Colonies
Crimson Syndicate

Faction ownership affects:
security level
ship availability
market prices

COMBAT

Ships use inertia physics.

Stats:
speed
turn speed
inertia
hull
weapon slots
upgrade slots

Pirates spawn more frequently in frontier systems.

MISSION TYPES

Delivery
Escort
Bounty
Smuggling

FOG OF WAR

Systems begin undiscovered.

States:
undiscovered
discovered
visited
scanned

Discovery methods:
travel
long range scanner
observatory

PROCEDURAL EVENTS

Trade Boom
Pirate Invasion
Supernova Warning
Economic Collapse
Faction War

SAVE SYSTEM

Game state stored in browser localStorage.

Saved data includes:

player ship
credits
cargo
location
missions
galaxy state
npc traders
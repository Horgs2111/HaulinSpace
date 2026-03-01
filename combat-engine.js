function createEnemy() {
  const ship = GAME_SHIPS[Math.floor(Math.random() * GAME_SHIPS.length)]
  return {
    ship: ship,
    hp: ship.hull
  }
}

function attack(attacker, defender) {
  const damage = Math.random() * 15 + attacker.ship.weapon_slots * 6
  defender.hp -= damage
  return Math.round(damage)
}

// audio.js — Synthesized audio engine (Web Audio API, no asset files needed)

const AudioEngine = (() => {
  let audioCtx    = null
  let masterGain  = null
  let sfxGain     = null
  let musicGain   = null
  let thrustNode  = null
  let thrustGain  = null
  let musicNodes  = []

  // ── Init ────────────────────────────────────────────────────────────────────

  function ensureInit() {
    if (audioCtx) return true
    try {
      audioCtx   = new (window.AudioContext || window.webkitAudioContext)()
      masterGain = audioCtx.createGain()
      sfxGain    = audioCtx.createGain()
      musicGain  = audioCtx.createGain()
      masterGain.gain.value = 0.6
      sfxGain.gain.value    = 0.85
      musicGain.gain.value  = 0.28
      sfxGain.connect(masterGain)
      musicGain.connect(masterGain)
      masterGain.connect(audioCtx.destination)
      return true
    } catch (e) {
      audioCtx = null
      return false
    }
  }

  // Called on any user gesture so the AudioContext can start
  function resume() {
    if (!ensureInit()) return
    if (audioCtx.state === 'suspended') audioCtx.resume()
  }

  function setSfxVolume(v)   { if (sfxGain)   sfxGain.gain.value   = Math.max(0, v / 100) * 0.85 }
  function setMusicVolume(v) { if (musicGain)  musicGain.gain.value = Math.max(0, v / 100) * 0.28 }

  // ── Utility ─────────────────────────────────────────────────────────────────

  function tone(freq, type, duration, vol, freqEnd, delay) {
    if (!ensureInit()) return
    if (audioCtx.state === 'suspended') audioCtx.resume()
    const start = audioCtx.currentTime + (delay || 0)
    const osc   = audioCtx.createOscillator()
    const gain  = audioCtx.createGain()
    osc.connect(gain)
    gain.connect(sfxGain)
    osc.type = type || 'sine'
    osc.frequency.setValueAtTime(freq, start)
    if (freqEnd != null) osc.frequency.linearRampToValueAtTime(freqEnd, start + duration)
    gain.gain.setValueAtTime(vol || 0.25, start)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    osc.start(start)
    osc.stop(start + duration + 0.02)
  }

  // ── SFX ─────────────────────────────────────────────────────────────────────

  function fire() {
    tone(720, 'square', 0.07, 0.10, 190)
  }

  function hit() {
    tone(210, 'sawtooth', 0.09, 0.15, 85)
  }

  function explosion() {
    tone(90,  'sawtooth', 0.55, 0.28, 18)
    tone(55,  'square',   0.40, 0.18, 12)
    tone(160, 'sawtooth', 0.18, 0.12, 55, 0.04)
  }

  function startThrust() {
    if (!ensureInit() || thrustNode) return
    if (audioCtx.state === 'suspended') audioCtx.resume()
    thrustNode = audioCtx.createOscillator()
    thrustGain = audioCtx.createGain()
    thrustNode.connect(thrustGain)
    thrustGain.connect(sfxGain)
    thrustNode.type = 'sawtooth'
    thrustNode.frequency.value = 72
    thrustGain.gain.setValueAtTime(0, audioCtx.currentTime)
    thrustGain.gain.linearRampToValueAtTime(0.035, audioCtx.currentTime + 0.14)
    thrustNode.start()
  }

  function stopThrust() {
    if (!thrustNode) return
    const now = audioCtx.currentTime
    thrustGain.gain.setValueAtTime(thrustGain.gain.value, now)
    thrustGain.gain.linearRampToValueAtTime(0.0001, now + 0.14)
    const tn = thrustNode, tg = thrustGain
    thrustNode = null
    thrustGain = null
    tn.stop(now + 0.18)
    setTimeout(() => { try { tn.disconnect(); tg.disconnect() } catch(e){} }, 300)
  }

  function jumpSpool() {
    tone(170, 'sine', 2.0, 0.16, 1050)
  }

  function jumpWarp() {
    tone(1050, 'sine', 0.35, 0.20, 60)
    tone(750,  'sine', 0.25, 0.10, 35, 0.08)
  }

  function dock() {
    tone(440, 'sine', 0.18, 0.12)
    tone(660, 'sine', 0.22, 0.11, null, 0.16)
  }

  function trade() {
    tone(880,  'sine', 0.11, 0.09)
    tone(1100, 'sine', 0.09, 0.08, null, 0.09)
  }

  function notify(success) {
    if (success) {
      tone(660, 'sine', 0.13, 0.12)
      tone(880, 'sine', 0.15, 0.11, null, 0.11)
    } else {
      tone(320, 'square', 0.28, 0.13, 190)
    }
  }

  function alert() {
    tone(550, 'square', 0.08, 0.16)
    tone(550, 'square', 0.08, 0.16, null, 0.21)
  }

  // ── Ambient music ────────────────────────────────────────────────────────────
  // Simple space drone: stack of detuned sine oscillators that slowly modulate.

  let musicInterval = null

  function stopMusic() {
    if (musicInterval) { clearInterval(musicInterval); musicInterval = null }
    for (const n of musicNodes) {
      try { n.gain.gain.linearRampToValueAtTime(0.0001, audioCtx.currentTime + 1.5); n.osc.stop(audioCtx.currentTime + 1.6) } catch(e) {}
    }
    musicNodes = []
  }

  function startSpaceMusic() {
    if (!ensureInit()) return
    if (audioCtx.state === 'suspended') audioCtx.resume()
    stopMusic()

    // Drone chord: root + perfect 5th + minor 7th, each slightly detuned
    const drones = [
      { freq: 55.0,  detune:  0  },
      { freq: 55.0,  detune:  6  },   // slightly sharp
      { freq: 82.4,  detune: -4  },   // perfect 5th (E)
      { freq: 98.0,  detune:  3  },   // minor 7th region
      { freq: 110.0, detune: -5  }    // octave
    ]

    for (const d of drones) {
      const osc  = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.connect(gain)
      gain.connect(musicGain)
      osc.type = 'sine'
      osc.frequency.value = d.freq
      osc.detune.value    = d.detune
      gain.gain.setValueAtTime(0, audioCtx.currentTime)
      gain.gain.linearRampToValueAtTime(0.18, audioCtx.currentTime + 3.0)
      osc.start()
      musicNodes.push({ osc, gain })
    }

    // Slowly modulate volume of each drone for organic breathing effect
    let t = 0
    musicInterval = setInterval(() => {
      if (!audioCtx) return
      t += 0.4
      for (let i = 0; i < musicNodes.length; i++) {
        const phase = t + i * 1.3
        const vol   = 0.08 + 0.10 * (0.5 + 0.5 * Math.sin(phase * 0.4))
        musicNodes[i].gain.gain.setTargetAtTime(vol, audioCtx.currentTime, 1.0)
      }
    }, 400)
  }

  function startCombatMusic() {
    if (!ensureInit()) return
    if (audioCtx.state === 'suspended') audioCtx.resume()
    stopMusic()

    // Faster pulsing dissonant drone for tension
    const drones = [
      { freq: 60.0,  detune:  0  },
      { freq: 60.0,  detune: 14  },
      { freq: 90.0,  detune: -8  },
      { freq: 120.0, detune:  5  }
    ]

    for (const d of drones) {
      const osc  = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.connect(gain)
      gain.connect(musicGain)
      osc.type = 'sawtooth'
      osc.frequency.value = d.freq
      osc.detune.value    = d.detune
      gain.gain.setValueAtTime(0, audioCtx.currentTime)
      gain.gain.linearRampToValueAtTime(0.06, audioCtx.currentTime + 0.8)
      osc.start()
      musicNodes.push({ osc, gain })
    }

    let t = 0
    musicInterval = setInterval(() => {
      if (!audioCtx) return
      t += 0.25
      for (let i = 0; i < musicNodes.length; i++) {
        const vol = 0.03 + 0.06 * (0.5 + 0.5 * Math.sin(t * 1.8 + i * 0.9))
        musicNodes[i].gain.gain.setTargetAtTime(vol, audioCtx.currentTime, 0.3)
      }
    }, 250)
  }

  return {
    resume, setSfxVolume, setMusicVolume,
    fire, hit, explosion,
    startThrust, stopThrust,
    jumpSpool, jumpWarp,
    dock, trade, notify, alert,
    startSpaceMusic, startCombatMusic, stopMusic
  }
})()

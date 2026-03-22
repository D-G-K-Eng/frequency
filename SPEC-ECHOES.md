# ECHOES — Game Spec v1

**Concept:** A tile-based dungeon crawler where sound is the map. The world is dark. You navigate by ear — every enemy has a sonic signature, every room has resonance, and your heartbeat is the rhythm you live and die by.

---

## Core Loop

- Grid-based movement: 20×15 cells, 40px each, canvas 800×600
- Player always centered — camera follows, dungeon scrolls
- Global heartbeat BPM starts at 80
- On-beat move (within 150ms window): clean step, no cost
- Off-beat move: costs 1 stamina, wrong-color footstep ripple
- Stamina: 10 points, regenerates 1 per on-beat step
- At 0 stamina: "deafened" for 2 beats — no audio cues, navigation blind

---

## Audio Engine (Hammerz)

- Beat clock: Web Audio API `AudioContext.currentTime` scheduling. No `setTimeout` drift.
- Each enemy emits a looping oscillator — freq, waveform, LFO rate = sonic fingerprint
- Volume: linear falloff, audible from 6 cells, full at 2
- Beat window: 150ms centered on beat

---

## Enemy Types

### The Throb
- Sig: 80Hz sine, slow LFO (0.5Hz). Deep bass pulse.
- Accent: deep red (#8B0000)
- Behavior: slow, hits hard. Moves every 2 beats.
- Bestiary flavor: "a low pressure wave, felt before heard."

### The Scatter
- Sig: 1200Hz sawtooth, fast LFO (8Hz). Nervous high-freq buzz.
- Accent: cold blue (#4FC3F7)
- Behavior: fast, low damage. Moves every beat, erratic path.
- Bestiary flavor: "static at the edge of perception. never where you expect."

### The Drone
- Sig: 400Hz square, no LFO. Constant mid-range hum.
- Accent: amber (#FFA726)
- Behavior: medium speed, medium damage. Telegraphs attacks: 1-beat pitch shift up before moving into player.
- Bestiary flavor: "a steady presence. patient. waiting for you to lose the rhythm."

---

## Combat

- No separate attack button. Moving into an enemy tile = attack.
- On-beat: full damage. Off-beat: 50% damage.
- Player HP: 5. No regeneration floor 1.
- Enemies attack by moving into player tile on-beat relative to *their own* BPM. The mismatch is intentional difficulty.

---

## Boss — The Dissonance

- Sig: 300Hz, shifts ±50Hz every 4 beats. Never fully resolves.
- Accent: sickly green (#76FF03)
- On entry: room BPM shifts to 120 (40BPM jump). Player has 4 beats to adapt.
- The floor grid breathes at boss BPM (subtle scale pulse).
- HP: 10. Phase 2 at 5HP: BPM → 140, LFO activates on tone.
- Bestiary flavor: "the dungeon itself changed. the walls breathed at a different tempo."

---

## Visual Layer (Viv)

### Rendering Layers (back to front)
1. Black base (#000)
2. Floor tiles — visible within 3-cell radius only. Faint grid lines (#111), no fill. You feel the structure, don't see it.
3. Wall resonance glow — adjacent walls pulse with soft radial gradient. Corridors: cool grey (#334). Special rooms: hue shift (learned over runs).
4. Footstep ripple — concentric circle from player on each step, 0.3s fade, white low opacity. Off-beat: desaturated.
5. Enemy silhouettes — visible within 4 cells OR above loudness threshold. Solid fill, acc color. No details, just shape. Breathe at their signature BPM.
6. Player — small white triangle (facing direction) + pulse ring tracking heartbeat. HP communicated through ring: dims and becomes irregular at low HP.
7. Beat feedback — on-beat step: brief tile flash (white, 100ms). Off-beat: red tile flash + corner vignette flicker (dark red, corners only, not full screen).

### HUD (minimal)
- Bottom left: heartbeat bar — fills/empties with BPM cycle. No numbers.
- Top left: floor depth ("FLOOR 1", small).
- No explicit health bar. HP = pulse ring visibility.

### Boss Room
- Full dark for 1 second on entry.
- Grid breathes at boss BPM (subtle scale pulse on all cells).
- Boss silhouette large, centered, acc color cycling slowly through freq spectrum.
- BPM shift: sharp visual cut, grid snaps, player heartbeat bar visibly struggles to sync.

### Death
- Heartbeat bar flatlines.
- Scanline flash (3 frames).
- Slow fade to black.
- "SIGNAL LOST" in game font.

---

## Bestiary

- Persistent via `localStorage` key `echoes_bestiary`
- First encounter: enemy sig logged with floor and run number
- Accessible from death screen only (pause menu access TBD)
- Display: enemy name, small waveform visual representing sig, flavor text
- No stats. The waveform IS the entry.

---

## Session 1 Scope

Floor 1 fully playable:
- Procedural dungeon grid (or hand-authored for v1)
- All 3 enemy types with working sonic signatures
- Boss room at floor end
- Heartbeat mechanic live
- Bestiary records first encounters
- Ship it, play it, iterate

---

## Tech

- Single HTML file (same pattern as Frequency)
- Web Audio API for all audio
- Canvas 2D for rendering
- No external dependencies
- Hosted on GitHub Pages: https://d-g-k-eng.github.io/frequency/ (new repo or subfolder TBD)

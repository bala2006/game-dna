# GameDNA quality principles

Use these to settle trade-offs. Each has a test you can apply to a concrete decision.

| Principle | Means | Test it by asking |
|---|---|---|
| Experience coherence | Every major system serves the one-line player experience | Which part of the experience does this system strengthen? If none, cut or simplify it |
| Physical credibility | Scale, motion, animation and contact follow the game's rules, realistic or stylized, consistently | Does a 1.75 m person fit through the door, and does a car stop like a car of its stated mass? |
| Perceptual responsiveness | Every input gets visible, audible or felt feedback within about 100 ms | Press each action with eyes closed, then with sound off: is each one still legible? |
| Spatial legibility | Players can read where they are, where to go, what they can do and what threatens them | Can a new player name the goal and the nearest threat from a screenshot? |
| Mechanical depth | Mechanics create decisions with trade-offs | Is there a situation where two choices are both reasonable? |
| Visual consistency | Geometry, color, material, light, effects and UI look like one world | Does any element read as placeholder or from another game? |
| State integrity | Every piece of state has one owner and explicit transitions | Can any two systems write the same field? Can a transition happen from an unexpected state? |
| Resource awareness | Visual and simulation cost fits the target device | What is the frame time on the target device, and what scales down first? |
| Composability | Systems meet at typed interfaces and declared events | Can this system be tested without the renderer? |

## When principles conflict

- Responsiveness over realism for player-controlled motion: a slightly unphysical stop is better than overshoot deaths.
- Legibility over visual richness: cut decoration that hides threats or paths.
- State integrity over convenience: no shortcuts that let presentation write rules state, even for effects.
- Resource awareness sets the ceiling for everything else: decide the budget before adding detail.

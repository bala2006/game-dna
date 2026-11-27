# Views: placement, lag and 2D framing

## 3D views

| View | Fits | Placement | Vertical FOV | Lag and behavior | Kit preset |
|---|---|---|---|---|---|
| Chase | Driving, racing | 5.5 to 7 m behind, 1.8 to 2.4 m up, aim 3 to 5 m ahead | 60, widening to 72 to 76 | Heading lag 0.1 to 0.2 s, distance grows about 2 cm per m/s | `chase`: 6.2 m, 1.9 m, lag 0.14 s |
| Far chase | Overview while driving | 8 to 11 m behind, 2.8 to 3.5 m up | 55 to 68 | A little more lag than chase | `chaseFar`: 9.5 m, 3.1 m, 0.2 s |
| Hood | Sense of speed | 0.1 to 0.2 m above the hood | 64 to 76 | Rigid, no lag; look clamps near 70 degrees | `hood` |
| Cockpit | Immersion | Driver's eye, belt line plus 0.22 to 0.3 m | 60 to 70 | Rigid, rolls with the body; look clamps near 110 degrees | `cockpit` |
| Third person | Action on foot | Pivot 1.5 to 1.6 m up, 3 to 4 m back, 0.4 to 0.5 m over the right shoulder | 60 to 66 | Orbit lag about 70 ms; recenter after 2 s of movement | `shoulder` |
| First person | Exploration, shooters | Eye at about 0.94 of stature | 70 to 75, slider 60 to 100 | Absolute yaw, pitch inside plus or minus 1.45 rad, no roll | `firstPerson` |
| Top-down | Arenas, tactics | 15 to 25 m away at 50 to 65 degrees down | 40 to 50 | Fixed north; lead toward aim | `topDown`: 22 m at 60 degrees |
| Side | Platformers | Orthographic or 2D follow | n/a | Dead zone, look-ahead, vertical follow on landing | none (Phaser camera) |

Offer the views a genre expects, such as chase and cockpit, behind one button (C or V, pad Y, a CAM touch button), and show the view name for about 1.4 s after a switch.

## 2D framing per space

| Space | Zoom | Bounds |
|---|---|---|
| Open and fast | 0.8 to 0.9, or zoom out with speed | World |
| Tight interior | 1.1 to 1.3 | The room |
| Precise action | Push in to 1.3 to 1.6 over 200 to 400 ms | Unchanged |
| One threat | Fit player and threat, with a zoom floor | World |

Store zoom zones in level data and blend between them over 300 to 800 ms. On a first reveal of a reward or a threat, pan to it once and let input cancel the pan.

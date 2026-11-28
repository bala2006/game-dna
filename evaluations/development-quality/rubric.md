# Game-quality rubric

Score each criterion from 1 to 5 with one line of evidence (a file and line, or a screenshot path). Score the game as delivered; do not reward code volume or test count by themselves. Reviewers do not know which configuration built which game.

| Criterion | 1 | 3 | 5 |
|---|---|---|---|
| Gameplay responsiveness | Input lags or is dropped | Inputs register; some actions lack feedback | Every action answers within about 100 ms with visible or audible feedback |
| Mechanical correctness | Brief rules broken | Rules hold; edge cases wrong | Rules hold under scripted edge cases; no exploit that trivializes play |
| Visual quality | Placeholder shapes | Coherent but plain | Lighting, materials and composition support the mood |
| Visual consistency | Elements from different styles | Mostly consistent | One visual world across scene, effects and HUD |
| Animation quality | Static or sliding | Basic loops | Gait matches speed, feet plant, transitions blend |
| Camera quality | Clips or loses the player | Follows; occasional clipping | Frames play, avoids terrain, readable at all times |
| Audio feedback | None | Some actions | All key actions and state changes |
| Level composition | Random scatter | Readable layout | Landmarks, paths and threats arranged for play |
| Player guidance | Goal unclear | HUD states the goal | Goal, threat and next action clear from the screen |
| Accessibility | None | Some (remap or reduced motion) | Remap, reduced motion, readable text, color-independent signals |
| Overall polish | Prototype | Complete but rough | Ready to show |

Defects are listed separately with a severity: **high** breaks a brief requirement or crashes, **medium** is visible in normal play, **low** is cosmetic.

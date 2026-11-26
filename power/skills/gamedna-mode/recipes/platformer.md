# Recipe: platformer

Side-view jump and run. The default target is a Phaser project with GameDNA's tools.

| # | Step | Skill | Platformer specifics |
|---|---|---|---|
| 1 | Loop and rules | game-direction | Reach the exit; collect keys or items. Protect: no midair jump without a granted ability; no input moves the player while dead |
| 2 | Look | art-direction, then technical-art | Pick one style pack. Actors carry the strongest value contrast |
| 3 | Levels | level-design | Teach, test, twist per mechanic. Safe spawn. Every hazard visible before it matters |
| 4 | Scale | world-building | Record pixels per meter. Player 1.5-2 tiles tall; jump height 2-4 tiles |
| 5 | Controls | controls-and-input | Arrows and WASD, Space or Z to jump, X to act; gamepad left stick or D-pad, A to jump; touch: left and right buttons on the left, jump on the right |
| 6 | Camera | camera | Side view: follow time constant 60-120 ms, dead zone, look-ahead, vertical snap on landing |
| 7 | Feel | game-feel, then motion-and-physics | Jump arc from target height and time, coyote time 80-120 ms, jump buffer 100-150 ms, variable jump height |
| 8 | HUD | feedback-and-ui | Keys and lives in one corner, nothing over the play area |
| 9 | Finish | polish-and-detail | Dust on jump and land, squash on landing |
| 10 | Tests and options | playtesting, refinement | Scenario per protected rule; offer 2-3 jump variants |

## Acceptance checks

- One scenario per protected rule passes with `gd_run_scenario`, and the seeded fault makes the matching scenario fail.
- Every level is reachable: a scripted path reaches the exit.
- Keyboard, gamepad and touch each run and jump. A quick jump tap registers.
- Screenshots at the target viewport show every hazard before the player reaches it.

# Tasks: GameDNA 2.0

Requirements: `requirements.md`. Design: `design.md`. A task is checked only when it is implemented and verified by the command named next to it.

- [x] 1. Architecture, migration and competitive research documents (`npm run check:docs`)
- [ ] 2. Remove experiments, decisions, design validation, reports and revisions from `packages/core`; remove `packages/phaser-adapter` and the apps' dev bridge (Req 1; `npm test`)
- [ ] 3. Remove `packages/mcp`, `packages/workbench`, `power/server`, `power/mcp.json`, MCP scripts, settings and hooks; port the Phaser production smoke test (Req 1; `npm run build`, `npm run test:e2e`)
- [ ] 4. Project fingerprint script and tests (Req 2)
- [ ] 5. `@gamedna/kit/contracts` and the contract template (Req 3)
- [ ] 6. Kit simulation modules: collision, controllers, vehicle handling (Req 4)
- [ ] 7. Kit gameplay modules: state machine, behavior tree, utility AI, steering, A*, events, saves, inventory, rooms (Req 4)
- [ ] 8. Kit runtime modules: pool, frame budget, feedback timers, three.js disposal (Req 4)
- [ ] 9. Demo games adopt the new modules and declare contracts (Req 3.3, 4.3)
- [ ] 10. Replace the 20 skills with the 25-skill set (Req 5)
- [ ] 11. Director and specialist agents, delegation formats, scope check, installer (Req 6)
- [ ] 12. Knowledge validator in CI (Req 7)
- [ ] 13. Evaluation dataset, scorer, prompt builder and a recorded run (Req 8)
- [ ] 14. Benchmark protocol and rubric (Req 8.4)
- [ ] 15. README, install guide, capability catalog, originality and dependency docs, CI (Req 9)
- [ ] 16. Push the branch and open the pull request (Req 9.1)

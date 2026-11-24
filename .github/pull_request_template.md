## Summary

<!-- What changed and why. Link the spec task in .kiro/specs/ if there is one. -->

## Checks

CI runs these on every pull request; tick them if you also ran them locally.

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run check:docs` (if `docs/` changed)
- [ ] `npm run build` (if games, MCP or workbench changed; commit the regenerated `power/server/`)
- [ ] `npm run test:e2e` (if sessions, adapter, workbench or games changed)

## Originality

- [ ] All new code, assets and text were written for GameDNA (no copied or template code; see `.kiro/steering/clean-slate.md`)
- [ ] New dependencies are pinned and listed in `docs/DEPENDENCY_INVENTORY.md`

---
inclusion: always
---

# Clean-slate originality rules (PRD section 1.1)

- Write all first-party code, skills, assets, tests, docs and both games fresh in this repository. Do not copy, fork, port or adapt code from other projects, templates, sample games, existing MCP servers or existing skills, including the author's older repositories.
- Do not use scaffold generators (`npm create vite`, game templates). Write configuration by hand.
- Standard pinned dependencies used through public APIs are allowed. Add each to `docs/DEPENDENCY_INVENTORY.md`.
- Assets come only from GameDNA generators or are authored here. Record them in the game's `.gamedna/assets-manifest.json`.
- Docs and papers may inform design; cite them and paraphrase. Do not copy code samples.
- If unsure whether something is original, stop, note it in `docs/ORIGINALITY.md`, and replace it with fresh work.
- Never commit secrets, tokens, `.env` files or session data. The Kiro home folder (`~/.kiro`, identity and session files) is never copied into the repo.

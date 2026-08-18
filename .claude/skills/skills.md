# Skills Map

All skills live under `.claude/skills/`. Grouped by category below.

---

## caveman/

Token-efficiency and compression utilities. All caveman-related skills live here.

| Skill | Folder | Trigger | What it does |
|-------|--------|---------|--------------|
| **caveman** | `caveman/caveman/` | `/caveman`, "less tokens", "talk like caveman" | Ultra-compressed communication mode (~75% token reduction). Levels: `lite`, `full` (default), `ultra`, `wenyan-lite`, `wenyan-full`, `wenyan-ultra`. |
| **caveman-commit** | `caveman/caveman-commit/` | `/caveman-commit`, "write a commit" | Terse Conventional Commits messages. Subject ≤50 chars, body only when why is non-obvious. |
| **caveman-compress** | `caveman/caveman-compress/` | `/caveman-compress <filepath>` | Compresses `.md` / `.txt` memory files into caveman prose. Overwrites in place, backs up as `FILE.original.md`. |
| **caveman-help** | `caveman/caveman-help/` | `/caveman-help`, "caveman help" | Quick-reference card for all caveman modes and skills. One-shot, no mode change. |
| **caveman-review** | `caveman/caveman-review/` | `/caveman-review`, "review this PR" | Ultra-compressed PR review comments. Format: `L42: 🔴 bug: problem. fix.` |
| **caveman-stats** | `caveman/caveman-stats/` | `/caveman-stats` | Shows real token usage and estimated savings for the session. Delivered by hook, not AI estimation. |
| **cavecrew** | `caveman/cavecrew/` | "use cavecrew", "delegate to subagent" | Decision guide for spawning caveman-compressed subagents: `cavecrew-investigator`, `cavecrew-builder`, `cavecrew-reviewer`. Reduces subagent tool-result size ~60%. |

---

## Adding a new skill

1. Create a folder under `.claude/skills/<name>/`
2. Add `SKILL.md` with frontmatter (`name`, `description`) and instructions
3. Optionally add `README.md` for human documentation
4. Register it here in `skills.md`

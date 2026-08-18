---
name: agent-teams-reference
description: "Comprehensive reference for Claude Code Agent Teams — what they are, how to enable them, capabilities, architecture, and best practices"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 1aab7ad4-2eac-4e00-9182-fea829126c9f
---

# Claude Code Agent Teams

## What They Are
Agent teams let you coordinate multiple Claude Code instances working together. One session acts as the **team lead** (the main session), coordinating work and assigning tasks. **Teammates** are separate Claude Code instances, each with their own context window, that communicate directly with each other via a shared task list and mailbox system.

Unlike subagents (which only report back to the main agent), teammates can message each other directly without going through the lead.

## How to Enable
Add to `.claude/settings.json` in the project:
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```
Or set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in the shell environment.

> **Status**: Experimental, disabled by default. Enabled in this project via `.claude/settings.json`.

## Starting a Team
Just describe the task in natural language:
```
Spawn three teammates to review PR #142: one on security, one on performance, one on test coverage.
```
Claude spawns teammates and coordinates automatically. You can also let Claude propose spawning teammates when it detects parallel work would help.

## Key Capabilities

### Display Modes
- **In-process** (default): all teammates inside your main terminal — arrow keys to select, Enter to view/message
- **Auto**: uses split panes if tmux or iTerm2 is available, otherwise in-process
- **tmux / iterm2**: explicit split pane mode (each teammate in its own pane)

Set in `~/.claude/settings.json`:
```json
{ "teammateMode": "auto" }
```
Or per session: `claude --teammate-mode auto`

### Task Management
- Shared task list — teammates self-claim tasks or the lead assigns them
- Tasks have states: pending → in progress → completed
- Tasks support dependencies (blocked tasks auto-unblock when dependencies complete)
- File locking prevents race conditions on simultaneous task claims

### Communication
- Teammates message each other directly by name
- Lead receives idle notifications automatically
- Automatic message delivery (no polling needed)

### Plan Approval Workflow
Ask the lead to require plan approval before a teammate implements:
```
Spawn an architect teammate. Require plan approval before they make any changes.
```
Teammate submits plan → lead approves or rejects with feedback → teammate implements.

### Subagent Definitions as Teammates
Reference a subagent type when spawning:
```
Spawn a teammate using the security-reviewer agent type to audit the auth module.
```
The teammate inherits the subagent's `tools` allowlist and `model`, with team coordination tools always available.

### Hooks for Quality Gates
- `TeammateIdle` — runs when a teammate goes idle; exit code 2 keeps them working with feedback
- `TaskCreated` — runs when a task is being created; exit code 2 blocks creation
- `TaskCompleted` — runs when a task is being marked complete; exit code 2 blocks completion

## Architecture

| Component | Role |
|-----------|------|
| Team lead | Main session — spawns teammates, coordinates |
| Teammates | Separate Claude Code instances, own context |
| Task list | Shared work items (`~/.claude/tasks/{team-name}/`) |
| Mailbox | Direct inter-agent messaging |

Team config stored at `~/.claude/teams/{team-name}/config.json` — auto-generated, do not edit by hand.

## Best Use Cases
- **Parallel code review**: different teammates review security / performance / coverage simultaneously
- **Research with competing hypotheses**: teammates investigate different theories and debate each other
- **New modules/features**: each teammate owns a separate piece without file conflicts
- **Cross-layer changes**: frontend, backend, and tests each owned by a different teammate

## Limitations (Experimental)
- No session resumption for in-process teammates (`/resume`/`/rewind` don't restore teammates)
- Task status can lag (stuck tasks may need manual nudging)
- One team per session; no nested teams; lead is fixed
- Split panes require tmux or iTerm2 — not supported in VS Code integrated terminal, Windows Terminal, or Ghostty
- All teammates inherit lead's permission mode at spawn time

## Tips
- Start with 3–5 teammates; 5–6 tasks per teammate is optimal
- Teammates do NOT inherit the lead's conversation history — include task-specific context in the spawn prompt
- Avoid two teammates editing the same file (causes overwrites)
- If lead starts implementing instead of delegating: "Wait for your teammates to complete their tasks"
- If task appears stuck: check if work is actually done and update status manually

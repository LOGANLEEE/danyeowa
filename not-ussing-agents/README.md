# Multi-Agent System Guide

## Overview

The multi-agent system is a framework for orchestrating specialized AI agents to work together on complex development tasks. It uses a **planner → designer → developer → tester** workflow with dependency management and parallel execution.

## Architecture

```
┌─────────┐
│ Planner │ → Breaks down goals into tasks with dependencies
└─────────┘
     │
     ├─→ Designer Agent (UI/UX design)
     │
     ├─→ Developer Agent (Code implementation)
     │
     └─→ Tester Agent (Testing & validation)
```

### Key Components

1. **Planner Agent** (`agents/planner.js`)
   - Analyzes goals and breaks them into tasks
   - Assigns roles (designer, developer, tester)
   - Defines dependencies between tasks

2. **Designer Agent** (`agents/designer.js`)
   - Creates UI/UX designs
   - Outputs design specifications

3. **Developer Agent** (`agents/developer.js`)
   - Implements code based on design specs
   - Receives design outputs as input

4. **Tester Agent** (`agents/tester.js`)
   - Tests implemented code
   - Provides feedback for improvements
   - Triggers retries if tests fail

5. **Mission Runner** (`agents/missionRunner.js`)
   - Orchestrates task execution
   - Handles dependencies (phases)
   - Executes independent tasks in parallel
   - Manages retries (up to 3 attempts)

## How to Use

### 1. Configure Missions

Edit `runAgents.js` to add your missions:

```javascript
const missions = [
  {
    id: 'login-screen',
    goal: 'Roster-me 로그인 화면 개발',
    description: 'OTP 및 생체인증 로그인 화면 구현',
    priority: 'high',
  },
  {
    id: 'roster-calendar',
    goal: '로스터 캘린더 뷰 개발',
    description: '월별 로스터 캘린더 UI 및 기능 구현',
    priority: 'medium',
  },
];
```

### 2. Run Agents

**Parallel execution** (default - for independent missions):
```bash
yarn agents
# or
yarn agents:parallel
```

**Sequential execution** (for dependent missions):
```bash
yarn agents:sequential
```

Or directly:
```bash
node runAgents.js
EXECUTION_MODE=parallel node runAgents.js
EXECUTION_MODE=sequential node runAgents.js
```

### 3. How It Works

1. **Setup Phase**: Creates git worktrees for each agent (isolated workspaces)
2. **Planning Phase**: Planner breaks down each mission goal into tasks
3. **Execution Phase**: 
   - Tasks grouped by dependencies (phases)
   - Independent tasks run in parallel
   - Dependent tasks wait for prerequisites
4. **Retry Logic**: Failed tasks retry up to 3 times
5. **Results**: Summary of all completed/failed tasks

### 4. Task Structure

Each task has:
- `id`: Unique identifier
- `desc`: Task description
- `role`: Agent role (`designer`, `developer`, `tester`)
- `dependsOn`: Optional task ID this depends on

Example:
```javascript
{
  id: 4,
  desc: "로그인 컴포넌트 개발",
  role: "developer",
  dependsOn: 1  // Waits for task 1 (design) to complete
}
```

## Current Status

⚠️ **Note**: The current implementation is a **framework skeleton**. The agents are placeholders that return mock outputs. To make it functional, you need to:

### Enhance Agents with Real AI

The agents currently just log and return mock data. To make them work with real AI:

1. **Integrate with Cursor AI** (Recommended)
   - Use Cursor's AI capabilities within each agent
   - Agents can use codebase context and tools
   - Example: Designer agent could use `codebase_search` to understand design patterns

2. **Use AI API** (Alternative)
   - Integrate OpenAI, Anthropic, or other AI APIs
   - Each agent makes API calls with specific prompts
   - Store results and pass between agents

3. **Hybrid Approach**
   - Use Cursor AI for code generation (developer, tester)
   - Use design tools/APIs for design tasks
   - Use planning prompts for task breakdown

## Example: Enhancing Developer Agent

Current (placeholder):
```javascript
export const developerAgent = (task, designOutput) => {
  console.log(`[Developer] 작업 중: ${task.desc}`);
  return `Code implementing ${task.desc}`;
};
```

Enhanced (with AI):
```javascript
import { codebase_search, read_file, write } from '@cursor/tools';

export const developerAgent = async (task, designOutput) => {
  console.log(`[Developer] 작업 중: ${task.desc}`);
  
  // 1. Understand existing patterns
  const patterns = await codebase_search({
    query: `How are ${task.desc} components implemented?`,
    target_directories: ['components']
  });
  
  // 2. Generate code based on design and patterns
  // (This would use Cursor's AI to generate actual code)
  
  // 3. Write files to agent's worktree
  // (Isolated from main branch)
  
  return { code: generatedCode, files: createdFiles };
};
```

## Git Worktrees

The system uses git worktrees to isolate each agent's work:

- `../roaster-me-worktrees/planner/` - Planner's workspace
- `../roaster-me-worktrees/designer/` - Designer's workspace
- `../roaster-me-worktrees/developer/` - Developer's workspace
- `../roaster-me-worktrees/tester/` - Tester's workspace

Each agent works in isolation on separate branches:
- `agent-planner`
- `agent-designer`
- `agent-developer`
- `agent-tester`

## Execution Flow

```
Mission Goal
    ↓
Planner Agent
    ↓
Task List (with dependencies)
    ↓
Phase 1: [Design tasks] → Parallel execution
    ↓
Phase 2: [Dev tasks] → Parallel execution (depends on Phase 1)
    ↓
Phase 3: [Test tasks] → Parallel execution (depends on Phase 2)
    ↓
Results Summary
```

## Customizing the Planner

Edit `agents/planner.js` to customize task breakdown:

```javascript
export const plannerAgent = (goal) => {
  // Add custom logic for different goals
  if (goal.includes('calendar')) {
    return [
      { id: 1, desc: "캘린더 UI 설계", role: "designer" },
      { id: 2, desc: "날짜 선택 로직 설계", role: "designer" },
      { id: 3, desc: "캘린더 컴포넌트 개발", role: "developer", dependsOn: 1 },
      // ...
    ];
  }
  
  // Default breakdown
  return [/* ... */];
};
```

## Tips

1. **Start Small**: Test with simple missions first
2. **Clear Goals**: Write specific, actionable mission goals
3. **Review Dependencies**: Ensure task dependencies are correct
4. **Monitor Outputs**: Check agent worktrees to see generated files
5. **Iterate**: Refine agent prompts and logic based on results

## Future Enhancements

- [ ] Real AI integration (Cursor AI or API)
- [ ] File generation and code writing
- [ ] Automatic code review and merging
- [ ] Agent communication and collaboration
- [ ] Progress tracking and visualization
- [ ] Rollback and error recovery
- [ ] Agent learning from feedback

## Troubleshooting

**Worktrees already exist?**
```bash
# Remove existing worktrees
git worktree remove ../roaster-me-worktrees/planner
git worktree remove ../roaster-me-worktrees/designer
# ... etc
```

**Tasks not executing?**
- Check task dependencies are correct
- Verify planner is returning valid tasks
- Check console logs for errors

**Agents not producing real output?**
- Current agents are placeholders
- Need to integrate with real AI (see "Enhancing Agents" section)


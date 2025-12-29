# Parallel vs Sequential Execution Guide

## Quick Answer

**Use Sequential by default** for safety, especially when:
- Missions might touch overlapping files
- You want to review results before proceeding
- Missions have dependencies on each other
- You're testing or debugging

**Use Parallel** when:
- Missions are completely independent (different features/modules)
- You need maximum speed
- Each mission uses isolated git worktrees (current setup)
- You're confident about the outcomes

## Detailed Comparison

### Sequential Execution ✅ **Recommended Default**

**Pros:**
- ✅ **Safer**: No file conflicts between missions
- ✅ **Easier to debug**: See results of one mission before starting next
- ✅ **Better error handling**: Can stop on first failure
- ✅ **Clearer logs**: Output is ordered and easier to follow
- ✅ **Resource friendly**: Lower memory/CPU usage

**Cons:**
- ❌ Slower: Total time = sum of all mission times
- ❌ Underutilizes resources: Could run multiple missions simultaneously

**Best for:**
- Development and testing
- Missions that might conflict
- When you need to review intermediate results
- Complex features that need careful coordination

### Parallel Execution ⚡ **For Speed**

**Pros:**
- ✅ **Faster**: Total time ≈ longest mission time
- ✅ **Better resource utilization**: Uses multiple cores/agents simultaneously
- ✅ **Scalable**: Can handle many independent missions

**Cons:**
- ❌ **File conflicts**: If missions touch same files, conflicts can occur
- ❌ **Harder to debug**: Multiple missions running simultaneously
- ❌ **Resource intensive**: Higher memory/CPU usage
- ❌ **Unordered logs**: Output from multiple missions interleaved

**Best for:**
- Independent features (e.g., login screen + calendar view)
- Production runs with well-tested missions
- When speed is critical
- Missions that touch completely different parts of codebase

## Architecture Context

### Current Setup

Your system has **two levels of parallelism**:

1. **Within Mission** (already parallel):
   ```
   Mission: "Login Screen"
   ├─ Phase 1: [Design Task 1, Design Task 2] → Parallel ✅
   ├─ Phase 2: [Dev Task 1, Dev Task 2] → Parallel ✅
   └─ Phase 3: [Test Task 1, Test Task 2] → Parallel ✅
   ```

2. **Between Missions** (your choice):
   ```
   Option A - Sequential:
   Mission 1 → Mission 2 → Mission 3
   
   Option B - Parallel:
   Mission 1 ┐
   Mission 2 ├─→ All at once
   Mission 3 ┘
   ```

### Git Worktrees Protection

Your system uses **git worktrees** which provides isolation:
- Each agent has its own workspace
- Reduces file conflicts
- But conflicts can still occur when merging back

## Decision Matrix

| Scenario | Recommendation | Reason |
|----------|---------------|--------|
| **1-2 missions, independent features** | Parallel | Low risk, high speed gain |
| **3+ missions** | Sequential | Easier to manage, less conflicts |
| **Missions touch same files** | Sequential | Avoid conflicts |
| **Missions in different modules** | Parallel | No overlap |
| **Testing/debugging** | Sequential | Better visibility |
| **Production run** | Parallel | Speed matters |
| **First time running** | Sequential | Learn the system first |

## Recommended Default Strategy

```javascript
// Smart default: Sequential for safety
const executionMode = process.env.EXECUTION_MODE || 'sequential';
```

**Why Sequential as default:**
1. Safety first: Avoid conflicts and errors
2. Better for learning: See how each mission works
3. Easier debugging: Clear, ordered output
4. Can always switch to parallel later

## When to Use Each Mode

### Use Sequential When:

```bash
# Development/testing
yarn agents:sequential

# Missions that might conflict
# Example: Both modify the same component
missions = [
  { id: 'login-ui', goal: 'Login UI updates' },
  { id: 'login-auth', goal: 'Login auth logic' }, // Might touch same files
]
```

### Use Parallel When:

```bash
# Independent features
yarn agents:parallel

# Example: Completely separate features
missions = [
  { id: 'login-screen', goal: 'Login screen' },
  { id: 'calendar-view', goal: 'Calendar view' }, // Different modules
  { id: 'notifications', goal: 'Notifications' }, // Different modules
]
```

## Hybrid Approach (Future Enhancement)

You could implement a **smart mode** that analyzes missions and chooses automatically:

```javascript
const determineExecutionMode = (missions) => {
  // Analyze mission goals to detect potential conflicts
  const hasOverlap = checkFileOverlap(missions);
  const hasDependencies = checkDependencies(missions);
  
  if (hasOverlap || hasDependencies) {
    return 'sequential';
  }
  return 'parallel';
};
```

## Performance Comparison

### Example: 3 Missions, each takes 5 minutes

**Sequential:**
- Total time: 15 minutes (5 + 5 + 5)
- Resource usage: Low
- Risk: Low

**Parallel:**
- Total time: ~5 minutes (longest mission)
- Resource usage: High (3x)
- Risk: Medium (potential conflicts)

## Best Practices

1. **Start with Sequential**: Learn the system, see how it works
2. **Test in Parallel**: Once comfortable, try parallel for independent missions
3. **Monitor Resources**: Watch CPU/memory when running parallel
4. **Review Logs**: Check for conflicts or errors
5. **Use Git Worktrees**: Already implemented - provides good isolation

## Recommendation for Your Project

Given your current setup:

1. **Default to Sequential** (`yarn agents:sequential`)
   - Safer for development
   - Better for learning and debugging
   - Your missions might touch overlapping areas

2. **Use Parallel for Independent Features**
   - When you're confident missions don't conflict
   - For well-tested, separate features
   - When speed is important

3. **Consider Mission Dependencies**
   - If Mission B needs Mission A's output → Sequential
   - If missions are independent → Parallel

## Example Configuration

```javascript
// runAgents.js
const missions = [
  {
    id: 'login-screen',
    goal: 'Roster-me 로그인 화면 개발',
    // Independent feature - can run in parallel
  },
  {
    id: 'roster-calendar',
    goal: '로스터 캘린더 뷰 개발',
    // Different module - can run in parallel
  },
];

// For these missions, parallel is safe
// But sequential is still recommended for first runs
```

## Conclusion

**Start with Sequential**, then move to Parallel once you're comfortable and missions are proven independent.

The performance gain from parallel is significant, but the safety and debuggability of sequential often outweighs it, especially during development.


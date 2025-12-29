// setupAgents.js
const { execSync } = require('child_process');
const path = require('path');

const repoPath = path.resolve(__dirname); // 프로젝트 루트
const worktreesRoot = path.resolve(__dirname, '../roster-me-worktrees'); // 워크트리 위치
const agents = ['planner', 'designer', 'developer', 'tester'];

try {
  // 워크트리 폴더 생성
  execSync(`mkdir -p ${worktreesRoot}`);

  agents.forEach(agent => {
    const branchName = `agent-${agent}`;
    const worktreePath = path.join(worktreesRoot, agent);

    // 브랜치가 없으면 생성
    try {
      execSync(`git rev-parse --verify ${branchName}`, { cwd: repoPath });
    } catch {
      execSync(`git branch ${branchName}`, { cwd: repoPath });
    }

    // 워크트리 추가 (이미 있으면 건너뜀)
    try {
      execSync(`git worktree add ${worktreePath} ${branchName}`, { cwd: repoPath });
      console.log(`✅ Worktree for ${agent} created at ${worktreePath}`);
    } catch (err) {
      console.log(`⚠️ Worktree for ${agent} may already exist`);
    }
  });

  console.log('All agent worktrees ready!');
} catch (err) {
  console.error('Error setting up agent worktrees:', err);
}
// runAgents.js
const { execSync } = require('child_process');

// Dynamic import for ES module
let runMission;

/**
 * Mission configuration with proper role assignments
 */
const missions = [
  {
    id: 'empty-state-component',
    goal: 'EmptyState 재사용 가능한 컴포넌트 개발',
    description: '빈 상태를 표시하는 재사용 가능한 컴포넌트 (로스터 없음, 연결 없음 등)',
    priority: 'medium',
  },
  // Add more missions here as needed
  // {
  //   id: 'login-screen',
  //   goal: 'Roster-me 로그인 화면 개발',
  //   description: 'OTP 및 생체인증 로그인 화면 구현',
  //   priority: 'high',
  // },
];

/**
 * Run multiple missions in parallel
 */
const runMissionsParallel = async (missionList) => {
  console.log(`\n🎯 ${missionList.length}개의 미션을 병렬로 실행합니다.\n`);
  
  const missionPromises = missionList.map(async (mission) => {
    console.log(`\n📌 [${mission.id}] ${mission.goal}`);
    console.log(`   ${mission.description}`);
    try {
      const result = await runMission(mission.goal);
      return { ...mission, result, success: result?.success ?? false };
    } catch (error) {
      console.error(`❌ [${mission.id}] 오류 발생:`, error.message);
      return { ...mission, result: null, success: false, error: error.message };
    }
  });

  const results = await Promise.all(missionPromises);
  return results;
};

/**
 * Run missions sequentially (if dependencies exist)
 */
const runMissionsSequential = async (missionList) => {
  console.log(`\n🎯 ${missionList.length}개의 미션을 순차적으로 실행합니다.\n`);
  
  const results = [];
  for (const mission of missionList) {
    console.log(`\n📌 [${mission.id}] ${mission.goal}`);
    console.log(`   ${mission.description}`);
    try {
      const result = await runMission(mission.goal);
      results.push({ ...mission, result, success: result?.success ?? false });
    } catch (error) {
      console.error(`❌ [${mission.id}] 오류 발생:`, error.message);
      results.push({ ...mission, result: null, success: false, error: error.message });
    }
  }
  
  return results;
};

/**
 * Main execution
 */
const main = async () => {
  try {
    // Import ES module dynamically
    const missionRunner = await import('./agents/missionRunner.js');
    runMission = missionRunner.runMission;

    // 1. 워크트리 생성
    console.log('🔧 Agent 워크트리 설정 중...');
    execSync('node setupAgents.js', { stdio: 'inherit' });
    console.log('✅ 워크트리 설정 완료\n');

    // 2. 미션 실행 모드 선택
    // Set to 'parallel' for independent missions, 'sequential' for dependent missions
    // Default: 'sequential' for safety (can be overridden with EXECUTION_MODE env var)
    const executionMode = process.env.EXECUTION_MODE || 'sequential';
    
    let results;
    if (executionMode === 'parallel') {
      results = await runMissionsParallel(missions);
    } else {
      results = await runMissionsSequential(missions);
    }

    // 3. 결과 요약
    console.log('\n' + '='.repeat(60));
    console.log('📊 최종 결과 요약');
    console.log('='.repeat(60));
    results.forEach(({ id, goal, success, error }) => {
      const status = success ? '✅' : '❌';
      console.log(`${status} [${id}] ${goal}`);
      if (error) {
        console.log(`   오류: ${error}`);
      }
    });
    
    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    console.log(`\n✅ 성공: ${successCount}/${totalCount}개 미션 완료\n`);

    // 4. 필요 시 cleanup (옵션)
    // execSync('git worktree remove ../roster-me-worktrees/planner');
    // execSync('git worktree remove ../roster-me-worktrees/designer');
  } catch (err) {
    console.error('❌ Error running agents mission:', err);
    process.exit(1);
  }
};

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { runMissionsParallel, runMissionsSequential };
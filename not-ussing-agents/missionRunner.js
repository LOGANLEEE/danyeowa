// agents/missionRunner.js
import { designerAgent } from './designer.js';
import { developerAgent } from './developer.js';
import { plannerAgent } from './planner.js';
import { testerAgent } from './tester.js';

/**
 * Execute a single task with retry logic
 */
const executeTask = async (task, designOutputs = {}) => {
  let attempt = 0;
  const maxAttempts = 3;
  let passed = false;
  let result = null;

  while (attempt < maxAttempts && !passed) {
    attempt++;
    try {
      let design = null;
      let code = null;
      let test = null;

      if (task.role === "designer") {
        design = designerAgent(task);
        result = { design, taskId: task.id };
      } else if (task.role === "developer") {
        // Get design output if this task depends on a designer task
        const designOutput = task.dependsOn 
          ? designOutputs[task.dependsOn]?.design 
          : null;
        code = await developerAgent(task, designOutput);
        result = { code, taskId: task.id };
      } else if (task.role === "tester") {
        // Get code output if this task depends on a developer task
        const codeOutput = task.dependsOn 
          ? designOutputs[task.dependsOn]?.code 
          : null;
        test = testerAgent(codeOutput);
        result = { test, taskId: task.id };
      }

      if (test && test.feedback) {
        console.log(`[Feedback] Task '${task.desc}': ${test.feedback} (재시도 ${attempt}/${maxAttempts})`);
      } else {
        passed = true;
        console.log(`[✅ 완료] Task '${task.desc}' 성공!`);
      }
    } catch (error) {
      console.log(`[❌ 오류] Task '${task.desc}': ${error.message} (재시도 ${attempt}/${maxAttempts})`);
    }
  }

  if (!passed) {
    console.log(`[❌ 실패] Task '${task.desc}' 최대 재시도 ${maxAttempts}회 초과`);
  }

  return { passed, result, taskId: task.id };
};

/**
 * Group tasks by their execution phase (based on dependencies)
 */
const groupTasksByPhase = (tasks) => {
  const phases = [];
  const completed = new Set();
  const remaining = new Map(tasks.map(t => [t.id, t]));

  while (remaining.size > 0) {
    const currentPhase = [];
    
    for (const [id, task] of remaining.entries()) {
      // Check if all dependencies are completed
      const dependenciesMet = !task.dependsOn || completed.has(task.dependsOn);
      
      if (dependenciesMet) {
        currentPhase.push(task);
      }
    }

    if (currentPhase.length === 0) {
      // Circular dependency or missing dependency - add remaining tasks anyway
      currentPhase.push(...Array.from(remaining.values()));
    }

    // Remove tasks from remaining and mark as completed
    currentPhase.forEach(task => {
      remaining.delete(task.id);
      completed.add(task.id);
    });

    phases.push(currentPhase);
  }

  return phases;
};

/**
 * Run mission with parallel execution of independent tasks
 */
export const runMission = async (goal) => {
  console.log(`\n🚀 === 새로운 임무 시작: ${goal} ===`);
  const tasks = plannerAgent(goal);

  if (tasks.length === 0) {
    console.log('⚠️ Planner가 작업을 생성하지 않았습니다.');
    return;
  }

  console.log(`📋 총 ${tasks.length}개의 작업이 할당되었습니다.`);

  // Group tasks by execution phase
  const phases = groupTasksByPhase(tasks);
  console.log(`📊 ${phases.length}개의 실행 단계로 구성되었습니다.`);

  const allResults = {};

  // Execute phases sequentially, but tasks within each phase in parallel
  for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex++) {
    const phase = phases[phaseIndex];
    console.log(`\n⚡ Phase ${phaseIndex + 1}/${phases.length}: ${phase.length}개 작업 병렬 실행`);

    // Execute all tasks in this phase in parallel
    const phasePromises = phase.map(task => executeTask(task, allResults));
    const phaseResults = await Promise.all(phasePromises);

    // Store results for dependent tasks
    phaseResults.forEach(({ result, taskId }) => {
      if (result) {
        allResults[taskId] = result;
      }
    });

    // Log phase summary
    const passed = phaseResults.filter(r => r.passed).length;
    const failed = phaseResults.filter(r => !r.passed).length;
    console.log(`📊 Phase ${phaseIndex + 1} 완료: ✅ ${passed}개 성공, ❌ ${failed}개 실패`);
  }

  // Final summary
  const totalPassed = Object.values(allResults).length;
  const totalFailed = tasks.length - totalPassed;
  console.log(`\n🎯 === 임무 완료 ===`);
  console.log(`✅ 성공: ${totalPassed}개, ❌ 실패: ${totalFailed}개\n`);
  
  return { success: totalFailed === 0, results: allResults };
};

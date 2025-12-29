// agents/tester.js
export const testerAgent = (codeOutput) => {
  console.log(`[Tester] 테스트 중: ${codeOutput}`);
  // 랜덤으로 통과/실패 시뮬레이션
  const passed = Math.random() > 0.3;
  const feedback = passed ? null : "버그 발견: 수정 필요";
  return { passed, feedback };
};
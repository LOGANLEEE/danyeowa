// agents/planner.js

/**
 * Planner Agent - Breaks down goals into tasks with dependencies
 * @param {string} goal - The mission goal
 * @returns {Array} Array of tasks with id, desc, role, and optional dependsOn
 */
export const plannerAgent = (goal) => {
  console.log(`[Planner] 목표 분석 중: ${goal}`);

  // Task structure:
  // - id: unique task identifier
  // - desc: task description
  // - role: agent role (designer, developer, tester)
  // - dependsOn: optional task ID this task depends on

  // Example task breakdown for login screen
  if (goal.includes('로그인') || goal.includes('login')) {
    return [
      { id: 1, desc: "로그인 UI/UX 설계", role: "designer" },
      { id: 2, desc: "OTP 입력 화면 설계", role: "designer" },
      { id: 3, desc: "생체인증 버튼 설계", role: "designer" },
      { id: 4, desc: "로그인 컴포넌트 개발", role: "developer", dependsOn: 1 },
      { id: 5, desc: "OTP 검증 로직 개발", role: "developer", dependsOn: 2 },
      { id: 6, desc: "생체인증 통합 개발", role: "developer", dependsOn: 3 },
      { id: 7, desc: "로그인 기능 테스트", role: "tester", dependsOn: 4 },
      { id: 8, desc: "OTP 검증 테스트", role: "tester", dependsOn: 5 },
      { id: 9, desc: "생체인증 테스트", role: "tester", dependsOn: 6 },
    ];
  }

  // Task breakdown for EmptyState component
  if (goal.includes('EmptyState') || goal.includes('빈 상태')) {
    return [
      { id: 1, desc: "EmptyState UI/UX 설계 (아이콘, 텍스트, 레이아웃)", role: "designer" },
      { id: 2, desc: "EmptyState 컴포넌트 개발 (ThemedText, ThemedView 사용)", role: "developer", dependsOn: 1 },
      { id: 3, desc: "EmptyState 테스트 (렌더링, props 검증)", role: "tester", dependsOn: 2 },
    ];
  }

  // Task breakdown for avatar profile menu
  if (goal.includes('아바타') || goal.includes('avatar') || goal.includes('프로필 메뉴')) {
    return [
      { id: 1, desc: "프로필 메뉴 UI/UX 설계 (모달 레이아웃, 메뉴 항목, 애니메이션)", role: "designer" },
      { id: 2, desc: "ProfileMenu 컴포넌트 개발 (components/ProfileMenu.tsx 생성)", role: "developer", dependsOn: 1 },
      { id: 3, desc: "home.tsx 아바타에 TouchableOpacity 추가 및 모달 연동", role: "developer", dependsOn: 2 },
      { id: 4, desc: "프로필 메뉴 테스트 (탭 동작, 모달 표시, 로그아웃 기능)", role: "tester", dependsOn: 3 },
    ];
  }

  // Default task breakdown for other goals
  return [
    { id: 1, desc: "UI 설계", role: "designer" },
    { id: 2, desc: "컴포넌트 개발", role: "developer", dependsOn: 1 },
    { id: 3, desc: "테스트 케이스 작성", role: "tester", dependsOn: 2 },
  ];
};
// agents/developer.js
export const developerAgent = (task, designOutput) => {
  console.log(`[Developer] 작업 중: ${task.desc} using ${designOutput}`);
  const codeOutput = `Code implementing ${task.desc} with ${designOutput}`;
  return codeOutput;
};
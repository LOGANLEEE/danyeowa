// agents/designer.js
export const designerAgent = (task) => {
  console.log(`[Designer] 작업 중: ${task.desc}`);
  const designOutput = `Design for ${task.desc}`;
  return designOutput;
};
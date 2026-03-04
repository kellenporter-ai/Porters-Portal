import { Rubric, RubricQuestion, RubricTier, RubricTierLabel, RubricSkillGrade } from '../types';

const TIER_LABELS: RubricTierLabel[] = ['Missing', 'Emerging', 'Approaching', 'Developing', 'Refining'];
const TIER_PERCENTAGES = [0, 55, 65, 85, 100];

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function parseRubricMarkdown(markdown: string): Rubric {
  const lines = markdown.trim().split('\n');
  let title = '';
  const questions: RubricQuestion[] = [];
  let currentQuestion: RubricQuestion | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Title: "# Blood & Blood Spatter Assessment Rubric"
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      title = line.slice(2).trim();
      continue;
    }

    // Question header: "## Question 1: Blood Composition and Typing"
    if (line.startsWith('## ')) {
      if (currentQuestion) questions.push(currentQuestion);
      currentQuestion = {
        id: generateId(),
        questionLabel: line.slice(3).trim(),
        skills: [],
      };
      continue;
    }

    // Table rows
    if (line.startsWith('|') && currentQuestion) {
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);

      // Skip header row and separator row
      if (cells[0]?.toLowerCase() === 'skill') continue;
      if (cells.every(c => /^[-:]+$/.test(c))) continue;

      if (cells.length >= 6) {
        const skillText = cells[0];
        const tiers: RubricTier[] = TIER_LABELS.map((label, idx) => ({
          label,
          percentage: TIER_PERCENTAGES[idx],
          descriptor: cells[idx + 1] || '',
        }));
        currentQuestion.skills.push({
          id: generateId(),
          skillText,
          tiers,
        });
      }
    }
  }

  if (currentQuestion) questions.push(currentQuestion);

  return { title, questions, rawMarkdown: markdown };
}

export function validateRubric(rubric: Rubric): string[] {
  const errors: string[] = [];
  if (!rubric.title) errors.push('Rubric title is missing (expected # Title)');
  if (rubric.questions.length === 0) errors.push('No questions found (expected ## Question headers)');
  rubric.questions.forEach((q) => {
    if (q.skills.length === 0) errors.push(`${q.questionLabel} has no skill rows`);
    q.skills.forEach((s, si) => {
      if (s.tiers.length !== 5) errors.push(`${q.questionLabel}, Skill ${si + 1} does not have 5 tiers`);
    });
  });
  return errors;
}

export function calculateRubricPercentage(
  grades: Record<string, Record<string, RubricSkillGrade>>,
  rubric: Rubric
): number {
  let total = 0;
  let count = 0;
  for (const question of rubric.questions) {
    for (const skill of question.skills) {
      const grade = grades[question.id]?.[skill.id];
      if (grade !== undefined) {
        total += grade.percentage;
        count++;
      }
    }
  }
  return count > 0 ? Math.round(total / count) : 0;
}

import { LessonBlock } from '../types';

/**
 * Validate a lesson block and return a list of human-readable error messages.
 * Returns an empty array if the block is valid.
 */
export function validateBlock(block: LessonBlock): string[] {
  const errors: string[] = [];

  switch (block.type) {
    case 'TEXT':
    case 'MATH_RESPONSE':
    case 'DRAWING':
      if (!block.content?.trim()) errors.push('Content is empty');
      break;

    case 'MC':
      if (!block.options || block.options.length < 2) errors.push('Need at least 2 options');
      else if (block.options.some(o => !o?.trim())) errors.push('All options must have text');
      if (block.correctAnswer === undefined || block.correctAnswer === null) errors.push('No correct answer selected');
      break;

    case 'SHORT_ANSWER':
      if (!block.acceptedAnswers || block.acceptedAnswers.length === 0) errors.push('Need at least 1 accepted answer');
      else if (block.acceptedAnswers.some(a => !a?.trim())) errors.push('All accepted answers must have text');
      break;

    case 'VOCABULARY':
      if (!block.term?.trim()) errors.push('Term is empty');
      if (!block.definition?.trim()) errors.push('Definition is empty');
      break;

    case 'CHECKLIST':
    case 'OBJECTIVES':
      if (!block.items || block.items.length === 0) errors.push('Need at least 1 item');
      else if (block.items.some(i => !i?.trim())) errors.push('All items must have text');
      break;

    case 'INFO_BOX':
      if (!block.content?.trim()) errors.push('Content is empty');
      break;

    case 'SECTION_HEADER':
      if (!block.title?.trim()) errors.push('Title is empty');
      break;

    case 'IMAGE':
    case 'VIDEO':
    case 'EMBED':
      if (!block.url?.trim()) errors.push('URL is empty');
      break;

    case 'EXTERNAL_LINK':
      if (!block.url?.trim()) errors.push('URL is empty');
      if (!block.buttonLabel?.trim()) errors.push('Button label is empty');
      break;

    case 'VOCAB_LIST':
      if (!block.terms || block.terms.length === 0) errors.push('Need at least 1 term');
      else if (block.terms.some(t => !t.term?.trim() || !t.definition?.trim())) errors.push('All terms need text and definition');
      break;

    case 'SORTING':
      if (!block.leftLabel?.trim()) errors.push('Left label is empty');
      if (!block.rightLabel?.trim()) errors.push('Right label is empty');
      if (!block.sortItems || block.sortItems.length < 2) errors.push('Need at least 2 sort items');
      else if (block.sortItems.some(s => !s.text?.trim())) errors.push('All sort items must have text');
      break;

    case 'DATA_TABLE':
      if (!block.columns || block.columns.length === 0) errors.push('Need at least 1 column');
      else if (block.columns.some(c => !c.label?.trim())) errors.push('All columns must have a label');
      break;

    case 'RANKING':
      if (!block.items || block.items.length < 2) errors.push('Need at least 2 items');
      else if (block.items.some(i => !i?.trim())) errors.push('All items must have text');
      break;

    case 'LINKED':
      if (!block.linkedBlockId?.trim()) errors.push('No linked block selected');
      break;

    case 'ACTIVITY':
      if (!block.instructions?.trim()) errors.push('Instructions are empty');
      break;

    case 'BAR_CHART':
      if (!block.barCount || block.barCount < 1) errors.push('Bar count must be at least 1');
      break;

    case 'DIVIDER':
      // No validation needed
      break;

    default:
      // Unknown block type — no validation
      break;
  }

  return errors;
}

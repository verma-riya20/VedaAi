const test = require('node:test');
const assert = require('node:assert/strict');

const { parseQuestions, matchAnswersToQuestions } = require('./extraction.js');

test('parseQuestions keeps numbering and splits subparts', () => {
  const questions = parseQuestions(`11 (a) Explain photosynthesis.\n\n11 (b) State the equation.\n\n12. What is respiration?`);

  assert.equal(questions.length, 3);
  assert.deepEqual(
    questions.map((q) => q.number),
    ['11 (a)', '11 (b)', '12']
  );
});

test('matching keeps answer order and ties to question labels', () => {
  const questions = parseQuestions(`1. What is the capital of France?\n\n2. What is the capital of Germany?`);
  const answers = [
    'Paris is the capital of France.',
    'Berlin is the capital of Germany.'
  ];

  const mapped = matchAnswersToQuestions(questions, answers);
  assert.equal(mapped.length, 2);
  assert.equal(mapped[0].question.number, '1');
  assert.equal(mapped[1].question.number, '2');
});

test('handles out-of-order answers and keeps unanswered questions', () => {
  const questions = parseQuestions(`1. What is the capital of France?\n\n2. What is the capital of Germany?\n\n3. What is the capital of Italy?`);
  const answers = [
    'Berlin is the capital of Germany.',
    'Rome is the capital of Italy.'
  ];

  const mapped = matchAnswersToQuestions(questions, answers);
  assert.equal(mapped[0].answer.includes('France'), false);
  assert.equal(mapped[1].answer.includes('Germany'), true);
  assert.equal(mapped[2].answer.includes('Italy'), true);
  assert.equal(mapped[0].unanswered, true);
  assert.equal(mapped[2].matched, true);
});

test('treats labelled sub-parts as separate questions and preserves original numbering', () => {
  const questions = parseQuestions(`11 (a) Explain photosynthesis.\n\n11 (b) State the equation.\n\n12. Explain respiration.`);
  const answers = [
    '11 (a) Photosynthesis converts light energy into chemical energy.',
    '11 (b) Carbon dioxide + water -> glucose + oxygen.',
    'Respiration breaks down glucose to release energy.'
  ];

  const mapped = matchAnswersToQuestions(questions, answers);
  assert.deepEqual(
    mapped.map((item) => item.question.number),
    ['11 (a)', '11 (b)', '12']
  );
  assert.equal(mapped[0].matched, true);
  assert.equal(mapped[1].matched, true);
  assert.equal(mapped[2].matched, true);
});

test('keeps unmatched answers separately instead of forcing them onto a question', () => {
  const questions = parseQuestions(`1. What is 2 + 2?\n\n2. What is 3 + 3?`);
  const answers = [
    'This answer does not correspond to any question.'
  ];

  const mapped = matchAnswersToQuestions(questions, answers);
  assert.equal(mapped[0].matched, false);
  assert.equal(mapped[1].matched, false);
  assert.equal(mapped[0].answer, '');
  assert.equal(mapped[1].answer, '');
  assert.equal(Array.isArray(mapped.unmatchedAnswers), true);
  assert.equal(mapped.unmatchedAnswers.length, 1);
});

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

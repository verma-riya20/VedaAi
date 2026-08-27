function normalizeText(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseQuestions(rawText) {
  const text = normalizeText(rawText).replace(/\s+/g, ' ');
  if (!text) return [];

  const matches = [...text.matchAll(/(?:Q(?:uestion)?\s*)?(\d+(?:\s*\([a-zA-Z]\))?)(?:\s*[:.)-])?/gi)];

  if (matches.length === 0) return [];

  const blocks = [];

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const start = match.index ?? 0;
    const end = matches[i + 1]?.index ?? text.length;
    const block = text.slice(start, end).trim();

    if (!block) continue;

    const number = match[1].trim();
    const prompt = block
      .replace(new RegExp(`^(?:Q(?:uestion)?\\s*)?${escapeRegExp(number)}(?:\\s*[:.)-])?\\s*`, 'i'), '')
      .replace(/^[\-–—]\s*/, '')
      .trim();

    blocks.push({
      number,
      prompt,
      original: block,
    });
  }

  return blocks.filter((item) => item.prompt && item.number);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitAnswerSentences(value) {
  return String(value || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeQuestionNumber(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s*\(\s*/g, '(')
    .replace(/\s*\)\s*/g, ')')
    .replace(/\s+/g, ' ')
    .trim();
}

function findQuestionLabel(answerText) {
  const match = String(answerText || '').match(/(?:^|\s)(\d+\s*(?:\([a-zA-Z]\))?)(?=\s*[:.)-]|\s|$)/i);
  if (!match) return null;
  return normalizeQuestionNumber(match[1]);
}

function tokenizeForMatch(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function computeKeywordSimilarity(leftText, rightText) {
  const leftTokens = new Set(tokenizeForMatch(leftText));
  const rightTokens = tokenizeForMatch(rightText);

  if (!leftTokens.size || !rightTokens.length) return 0;

  const overlap = rightTokens.filter((token) => leftTokens.has(token)).length;
  return overlap / Math.max(1, rightTokens.length);
}

function matchAnswersToQuestions(questions, answers) {
  const safeQuestions = Array.isArray(questions) ? questions : [];
  const safeAnswers = Array.isArray(answers) ? answers : [];

  const mapped = safeQuestions.map((question) => ({
    question,
    answer: '',
    answerLines: [''],
    confidence: 0.2,
    matched: false,
    index: -1,
    unanswered: true,
  }));

  const usedAnswerIndexes = new Set();
  const unmatchedAnswers = [];

  safeAnswers.forEach((answerEntry, answerIndex) => {
    const answerText = String(answerEntry || '').trim();
    if (!answerText) return;

    const label = findQuestionLabel(answerText);
    let matchedIndex = -1;

    if (label) {
      matchedIndex = safeQuestions.findIndex((question) => normalizeQuestionNumber(question.number) === label);
    }

    if (matchedIndex === -1) {
      const scoredMatches = safeQuestions
        .map((question, index) => ({
          index,
          score: computeKeywordSimilarity(answerText, question.prompt) +
            (label && normalizeQuestionNumber(question.number) === label ? 1 : 0),
        }))
        .filter((item) => item.score > 0.08)
        .sort((a, b) => b.score - a.score);

      if (scoredMatches.length > 0) {
        matchedIndex = scoredMatches[0].index;
      }
    }

    if (matchedIndex === -1 || usedAnswerIndexes.has(matchedIndex)) {
      unmatchedAnswers.push(answerText);
      return;
    }

    const sentences = splitAnswerSentences(answerText);
    const answerLines = sentences.length > 0 ? sentences : [answerText];

    mapped[matchedIndex] = {
      question: safeQuestions[matchedIndex],
      answer: answerText,
      answerLines,
      confidence: 0.85,
      matched: true,
      index: matchedIndex,
      unanswered: false,
    };

    usedAnswerIndexes.add(matchedIndex);
  });

  mapped.forEach((item, index) => {
    if (!item.matched) {
      mapped[index] = {
        ...item,
        answer: '',
        answerLines: [''],
        confidence: 0.2,
        matched: false,
        index,
        unanswered: true,
      };
    }
  });

  mapped.unmatchedAnswers = unmatchedAnswers;
  return mapped;
}

module.exports = {
  normalizeText,
  parseQuestions,
  matchAnswersToQuestions,
};

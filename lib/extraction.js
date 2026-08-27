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

function matchAnswersToQuestions(questions, answers) {
  const safeQuestions = Array.isArray(questions) ? questions : [];
  const safeAnswers = Array.isArray(answers) ? answers : [];

  const mapped = safeQuestions.map((question, index) => {
    const answerText = safeAnswers[index] || '';
    const sentences = splitAnswerSentences(answerText);
    const answerLines = sentences.length > 0 ? sentences : answerText ? [answerText] : [''];

    return {
      question,
      answer: answerText,
      answerLines,
      confidence: answerText ? 0.85 : 0.2,
      matched: Boolean(answerText),
      index,
      unanswered: !answerText,
    };
  });

  return mapped;
}

module.exports = {
  normalizeText,
  parseQuestions,
  matchAnswersToQuestions,
};

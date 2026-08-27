import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const { parseQuestions, matchAnswersToQuestions } = require("@/lib/extraction");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function extractTextFromPdf(file: File) {
  const bytes = await file.arrayBuffer();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const loadingTask = pdfjs.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;

  let text = "";

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => ("str" in item ? item.str : ""))
      .join(" ");
    text += `${pageText}\n`;
  }

  return text;
}

async function extractTextFromImage(file: File) {
  const { default: Tesseract } = await import("tesseract.js");
  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await Tesseract.recognize(buffer, "eng");
  return result.data?.text || "";
}

async function extractTextFromFile(file: File) {
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf")) {
    return extractTextFromPdf(file);
  }

  return extractTextFromImage(file);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const questionPaper = formData.get("questionPaper") as File | null;
    const answerSheet = formData.get("answerSheet") as File | null;

    if (!questionPaper || !answerSheet) {
      return NextResponse.json({ error: "Both question paper and answer sheet are required." }, { status: 400 });
    }

    const questionText = await extractTextFromFile(questionPaper);
    const answerText = await extractTextFromFile(answerSheet);

    const aiStructured = await extractWithGemini(questionText, answerText);
    const questions = aiStructured?.questions?.length ? aiStructured.questions : parseQuestions(questionText);
    const answerEntries = answerText ? normalizeAnswerEntries(answerText) : [];

    const mapped = aiStructured?.questions?.length
      ? aiStructured.questions.map((item: any, index: number) => ({
          question: { number: item.number || `Q${index + 1}`, prompt: item.prompt || `Question ${index + 1}` },
          answer: item.answer || "No answer detected.",
          confidence: item.confidence ?? 0.8,
          index,
        }))
      : matchAnswersToQuestions(questions, answerEntries);

    const response = mapped.map((entry: any, index: number) => {
      const promptText = String(entry.question?.prompt || entry.prompt || `Question ${index + 1}`);
      const answerValue = String(entry.answer || "").trim();
      const confidence = Number(entry.confidence ?? 0.7);
      const score = computeScore(promptText, answerValue, confidence);

      return {
        id: `Q${index + 1}`,
        number: String(entry.question?.number || entry.number || `Q${index + 1}`),
        prompt: promptText,
        answer: answerValue || "No answer detected.",
        confidence,
        score,
        answerRegion: getAnswerRegion(index),
      };
    });

    const summary = buildSummary(response);

    return NextResponse.json({
      success: true,
      questions: response,
      summary,
      extractedQuestionText: questionText,
      extractedAnswerText: answerText,
    });
  } catch (error) {
    console.error("Extraction failed:", error);
    return NextResponse.json(
      {
        error: "Failed to process the uploaded files. Please re-upload valid PDF or image files.",
      },
      { status: 500 }
    );
  }
}

function normalizeAnswerEntries(answerText: string) {
  const segments = String(answerText)
    .split(/(?=\b(?:Q\d+|Question\s*\d+|\d+\s*[.)]|\d+\s*\([a-zA-Z]\)))/i)
    .map((item) => item.trim())
    .filter(Boolean);

  if (segments.length > 0) {
    return segments;
  }

  return String(answerText)
    .split(/\n{2,}|(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function extractWithGemini(questionText: string, answerText: string) {
  if (!GEMINI_API_KEY) return null;

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const prompt = `
      Extract the questions and corresponding student answers from the provided document text.
      Preserve original numbering and split sub-parts like 11 (a) and 11 (b) into separate entries.
      Return JSON only with an array field named "questions" where each item contains:
      - number: string
      - prompt: string
      - answer: string
      - confidence: number between 0 and 1

      Question paper text:
      ${questionText.slice(0, 12000)}

      Answer sheet text:
      ${answerText.slice(0, 12000)}
    `;

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    const rawText = result?.text ?? "";
    if (!rawText) return null;

    const match = rawText.match(/\{[\s\S]*\}/);
    const jsonText = match ? match[0] : rawText;
    return JSON.parse(jsonText);
  } catch (error) {
    console.warn("Gemini extraction failed, falling back to local parsing.", error);
    return null;
  }
}

function getAnswerRegion(index: number) {
  const presets = [
    { x: 14, y: 16, width: 42, height: 18 },
    { x: 18, y: 36, width: 46, height: 20 },
    { x: 24, y: 58, width: 48, height: 18 },
    { x: 20, y: 76, width: 52, height: 18 },
  ];

  return presets[index % presets.length] ?? { x: 25, y: 40, width: 35, height: 18 };
}

function tokenize(text: string) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function computeScore(prompt: string, answer: string, confidence: number) {
  const answerText = String(answer || "").trim();
  if (!answerText) return 0;

  const promptTokens = new Set(tokenize(prompt));
  const answerTokens = tokenize(answerText);

  const overlap = answerTokens.filter((token) => promptTokens.has(token)).length;
  const overlapRatio = promptTokens.size ? overlap / promptTokens.size : 0;
  const quality = Math.min(1, answerTokens.length / 24);
  const score = Math.max(1, Math.min(10, Math.round((confidence * 6 + overlapRatio * 3 + quality * 2) * 10) / 10)) ;

  return Number(score.toFixed(1));
}

function buildSummary(questions: any[]) {
  const answered = questions.filter((question) => question.answer && question.answer !== "No answer detected.");
  const average = questions.length
    ? questions.reduce((sum, item) => sum + Number(item.score || 0), 0) / questions.length
    : 0;

  return {
    totalQuestions: questions.length,
    answeredQuestions: answered.length,
    unansweredQuestions: Math.max(questions.length - answered.length, 0),
    avgScore: Number(average.toFixed(1)),
    confidence: questions.length
      ? Number((questions.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / questions.length).toFixed(2))
      : 0,
    status: answered.length >= questions.length * 0.75 ? "Strong extraction" : answered.length > 0 ? "Partial extraction" : "No matching answers",
  };
}

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { createCanvas } = await import("canvas");

const { parseQuestions, matchAnswersToQuestions } = require("@/lib/extraction");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function extractTextFromPdf(file: File) {
  const bytes = await file.arrayBuffer();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const workerPath = path.join(
    process.cwd(),
    "node_modules",
    "pdfjs-dist",
    "legacy",
    "build",
    "pdf.worker.mjs"
  );

  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

  let text = "";

  try {
    const loadingTask = pdfjs.getDocument({ data: bytes });
    const pdf = await loadingTask.promise;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (pageText) {
        text += `${pageText}\n`;
      }

      if (!pageText || pageText.length < 20) {
        const fallbackText = await ocrPdfPage(page);
        if (fallbackText && fallbackText.trim().length > 10) {
          text += `${fallbackText}\n`;
        }
      }
    }
  } catch (error) {
    console.warn("PDF.js extraction failed; using raw-PDF fallback.", error);
  }

  const normalizedText = text.trim();
  if (normalizedText) {
    return normalizedText;
  }

  return extractTextFromRawPdfBytes(bytes);
}

function extractTextFromRawPdfBytes(bytes: ArrayBuffer) {
  const raw = Buffer.from(bytes).toString("latin1");
  const matches = raw.match(/\((?:\\.|[^()\\])*\)/g) || [];

  const text = matches
    .map((match) => match.slice(1, -1).replace(/\\([nrtbf()\\])/g, "").replace(/\\([0-7]{1,3})/g, (_, code) => String.fromCharCode(parseInt(code, 8))).replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/\\\s+/g, " "))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

async function ocrPdfPage(page: any) {
  try {
    const viewport = page.getViewport({ scale: 1.4 });
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext("2d");

    await page.render({ canvasContext: context, viewport }).promise;

    const { default: Tesseract } = await import("tesseract.js");
    const result = await Tesseract.recognize(canvas.toBuffer("image/png"), "eng");
    return result?.data?.text || "";
  } catch (error) {
    console.warn("PDF OCR fallback failed for page.", error);
    return "";
  }
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

async function withTimeout<T>(operation: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const questionPaper = formData.get("questionPaper") as File | null;
    const answerSheet = formData.get("answerSheet") as File | null;

    if (!questionPaper || !answerSheet) {
      return NextResponse.json({ error: "Both question paper and answer sheet are required." }, { status: 400 });
    }

    const questionText = await withTimeout(
      extractTextFromFile(questionPaper),
      45000,
      "Question paper extraction"
    );
    const answerText = await withTimeout(
      extractTextFromFile(answerSheet),
      45000,
      "Answer sheet extraction"
    );

    if (!questionText.trim() || !answerText.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "No readable text found in uploaded files.",
          questions: [],
          summary: null,
          unmatchedAnswers: [],
        },
        { status: 422 }
      );
    }

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
      const answerRegions = Array.isArray(entry.answerRegions) && entry.answerRegions.length > 0
        ? entry.answerRegions
        : getMultiAnswerRegions(index, answerValue ? Math.max(1, Math.min(3, Math.ceil(answerValue.split(/\s+/).length / 18))) : 1);

      return {
        id: `Q${index + 1}`,
        number: String(entry.question?.number || entry.number || `Q${index + 1}`),
        prompt: promptText,
        answer: answerValue || "No answer detected.",
        confidence,
        score,
        answerRegion: answerRegions[0],
        answerRegions,
        unanswered: !answerValue,
      };
    });

    const unmatchedAnswers = Array.isArray(mapped.unmatchedAnswers) ? mapped.unmatchedAnswers : [];
    const summary = buildSummary(response);

    return NextResponse.json({
      success: true,
      questions: response,
      summary,
      unmatchedAnswers,
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
    { x: 15, y: 16, width: 48, height: 17 },
    { x: 17, y: 35, width: 52, height: 18 },
    { x: 20, y: 54, width: 50, height: 17 },
    { x: 18, y: 72, width: 54, height: 17 },
    { x: 22, y: 28, width: 46, height: 16 },
    { x: 16, y: 46, width: 52, height: 18 },
    { x: 18, y: 66, width: 52, height: 16 },
    { x: 26, y: 80, width: 42, height: 15 },
  ];

  const base = presets[index % presets.length] ?? { x: 25, y: 40, width: 35, height: 18 };
  const jitter = (index % 3) * 2.5;

  return {
    x: Math.min(68, Math.max(10, Number((base.x + jitter).toFixed(1)))),
    y: Math.min(84, Math.max(10, Number((base.y + (index % 2 === 0 ? 1.5 : 0)).toFixed(1)))),
    width: Math.min(62, Math.max(28, Number((base.width + (index % 2 === 0 ? 2 : -1)).toFixed(1)))),
    height: Math.min(26, Math.max(12, Number((base.height + (index % 3 === 0 ? 2 : 0)).toFixed(1)))),
  };
}

function getMultiAnswerRegions(questionIndex: number, answerCount = 1) {
  if (answerCount <= 1) {
    return [getAnswerRegion(questionIndex)];
  }

  const primary = getAnswerRegion(questionIndex);
  const regions = [primary];

  for (let i = 1; i < answerCount; i += 1) {
    regions.push({
      x: Math.min(68, primary.x + 4 + (i * 5)),
      y: Math.min(84, primary.y + 10 + (i * 7)),
      width: Math.min(56, primary.width - 6),
      height: Math.min(primary.height + 4, 20),
    });
  }

  return regions;
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

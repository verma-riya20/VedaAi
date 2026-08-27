"use client";

import { useEffect, useRef, useState } from "react";

type UploadedFile = {
  id: string;
  name: string;
  size: number;
  type: "Question Paper" | "Answer Sheet";
  pages: number;
  file: File;
};

type AnswerRegion = { x: number; y: number; width: number; height: number };

type Question = {
  id: string;
  number: string;
  prompt: string;
  answer: string;
  answerRegion: AnswerRegion | AnswerRegion[];
  answerRegions?: AnswerRegion[];
  score: number;
  confidence: number;
  unanswered?: boolean;
};

const demoQuestions: Question[] = [
  {
    id: "Q1",
    number: "1",
    prompt: "Photosynthesis is the process used by green plants and some other organisms to convert light energy into chemical energy.",
    answer:
      "The process mainly occurs in the leaves, where chlorophyll captures sunlight and converts carbon dioxide and water into glucose and oxygen.",
    answerRegion: { x: 14, y: 16, width: 42, height: 20 },
    score: 9,
    confidence: 0.9,
  },
  {
    id: "Q2",
    number: "2",
    prompt: "The process mainly occurs in the chloroplasts of plant cells and uses sunlight, carbon dioxide, and water.",
    answer:
      "The light-dependent reactions happen in the thylakoid membranes, while the Calvin cycle occurs in the stroma of the chloroplast.",
    answerRegion: { x: 18, y: 35, width: 46, height: 24 },
    score: 8,
    confidence: 0.8,
  },
  {
    id: "Q3",
    number: "3",
    prompt: "Explain the role of chlorophyll and why the reaction is necessary for plant survival.",
    answer:
      "Chlorophyll absorbs light energy and creates the conditions for glucose production; without it, the plant cannot make its own food.",
    answerRegion: { x: 15, y: 62, width: 50, height: 21 },
    score: 7,
    confidence: 0.7,
  },
  {
    id: "Q4",
    number: "4",
    prompt: "State the outputs of photosynthesis and connect them to life on Earth.",
    answer:
      "The outputs are oxygen and glucose. Oxygen sustains aerobic life, while glucose provides energy for growth and respiration.",
    answerRegion: { x: 26, y: 78, width: 48, height: 18 },
    score: 8,
    confidence: 0.8,
  },
];

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function Home() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [stage, setStage] = useState<"empty" | "uploaded" | "processing" | "mapped">("empty");
  const [selectedQuestion, setSelectedQuestion] = useState<string>(demoQuestions[0].id);
  const [questions, setQuestions] = useState<Question[]>(demoQuestions);
  const [summary, setSummary] = useState<{ totalQuestions:number; answeredQuestions:number; unansweredQuestions:number; avgScore:number; confidence:number; status:string } | null>(null);
  const [unmatchedAnswers, setUnmatchedAnswers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (stage === "processing") {
      const timeout = window.setTimeout(() => setStage("mapped"), 1800);
      return () => window.clearTimeout(timeout);
    }
  }, [stage]);

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);

    if (selected.length === 0) return;

    const mappedFiles: UploadedFile[] = [];

    if (selected[0]) {
      mappedFiles.push({
        id: crypto.randomUUID(),
        name: selected[0].name ?? "class_10_maths_unit_test.pdf",
        size: selected[0].size ?? 2097152,
        type: "Question Paper",
        pages: 2,
        file: selected[0],
      });
    }

    if (selected[1]) {
      mappedFiles.push({
        id: crypto.randomUUID(),
        name: selected[1].name ?? "student_answer_sheet.pdf",
        size: selected[1].size ?? 4194304,
        type: "Answer Sheet",
        pages: 4,
        file: selected[1],
      });
    }

    setFiles(mappedFiles);
    setStage(mappedFiles.length > 0 ? "uploaded" : "empty");
    setError(null);
    setUploadMessage(
      mappedFiles.length >= 2
        ? `Uploaded ${mappedFiles.length} files successfully. Ready to map.`
        : mappedFiles.length === 1
          ? `1 file selected: ${mappedFiles[0].name}. Please upload the second file to continue.`
          : "No file selected yet."
    );
    event.target.value = "";
  };

  const handleRemove = (id: string) => {
    const nextFiles = files.filter((file) => file.id !== id);
    setFiles(nextFiles);
    setUploadMessage(
      nextFiles.length > 0
        ? `${nextFiles.length} file${nextFiles.length > 1 ? "s" : ""} remaining. Upload the missing file to continue.`
        : "No files uploaded yet. Please choose both files."
    );
    if (nextFiles.length === 0) setStage("empty");
  };

  const startMapping = async () => {
    if (files.length < 2) return;

    const questionFile = files.find((file) => file.type === "Question Paper");
    const answerFile = files.find((file) => file.type === "Answer Sheet");

    if (!questionFile || !answerFile) {
      setError("Please upload both files before starting extraction.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setUploadMessage("Processing your uploaded files. Please wait while the questions and answers are extracted.");
    setStage("processing");

    try {
      const formData = new FormData();
      formData.append("questionPaper", questionFile.file);
      formData.append("answerSheet", answerFile.file);

      const response = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Processing failed");
      }

      const result = await response.json();

      if (result.questions?.length) {
        setQuestions(
          result.questions.map((item: any) => ({
            id: item.id,
            number: item.number,
            prompt: item.prompt,
            answer: item.answer,
            score: item.score,
            confidence: item.confidence,
            answerRegion: item.answerRegions?.length ? item.answerRegions : item.answerRegion,
            answerRegions: item.answerRegions || [item.answerRegion],
            unanswered: item.unanswered,
          }))
        );
        setSelectedQuestion(result.questions[0].id);
      }

      setSummary(result.summary || null);
      setUnmatchedAnswers(Array.isArray(result.unmatchedAnswers) ? result.unmatchedAnswers : []);
      setStage("mapped");
    } catch (err) {
      console.error(err);
      setError("Extraction failed. Please upload valid PDF or image files.");
      setUploadMessage("Upload failed. Please check the files and try again.");
      setStage("uploaded");
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeQuestion = questions.find((question) => question.id === selectedQuestion) ?? questions[0];
  const activeRegions = Array.isArray(activeQuestion?.answerRegion)
    ? activeQuestion.answerRegion
    : activeQuestion?.answerRegions?.length
      ? activeQuestion.answerRegions
      : [activeQuestion?.answerRegion ?? { x: 15, y: 30, width: 40, height: 18 }];
  const hasBothFiles = files.length >= 2;

  return (
    <div className="app-shell min-h-screen bg-[#3d3b39] p-2 sm:p-3 md:p-4 lg:p-6">
      <div className="mx-auto max-w-[1500px] overflow-hidden rounded-[18px] border border-black/5 bg-[#f4f1ee] shadow-[0_18px_50px_rgba(0,0,0,0.12)]">
        <div className="flex min-h-[920px] flex-col lg:flex-row">
          <aside className="w-full border-b border-black/5 bg-[#f0efee] p-3 sm:p-4 lg:w-[290px] lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#1f1f1f] text-lg font-bold text-white shadow-sm">
                  V
                </div>
                <div className="text-[2.1rem] font-black tracking-[-0.06em] text-[#1f1f1f]">VedaAI</div>
              </div>
            </div>

            <button className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#1d1d1d] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110">
              <span className="text-lg leading-none">✦</span>
              AI Teacher&apos;s Toolkit
            </button>

            <nav className="mt-6 grid gap-2 text-[0.96rem] font-medium text-[#2f2f2f] sm:mt-8 sm:text-[1.02rem]">
              {[
                "Home",
                "My Classroom",
                "Assignments",
                "Exams",
                "My Library",
              ].map((item, index) => (
                <button
                  key={item}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition ${
                    item === "Exams"
                      ? "bg-[#e7e4e1] text-[#1b1b1b] shadow-inner"
                      : "hover:bg-[#e7e4e1/70]"
                  }`}
                >
                  <span className="text-base opacity-80">{["▣", "◫", "▤", "▢", "◌"][index]}</span>
                  {item}
                </button>
              ))}
            </nav>

            <div className="mt-10 rounded-[20px] bg-[#f4f2f0] p-3 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
              <div className="flex items-center gap-3 rounded-xl bg-white/80 p-2.5">
                <div className="grid h-12 w-12 place-items-center rounded-full border border-[#d8d2ce] bg-[#edf6ee] text-lg">
                  🌿
                </div>
                <div>
                  <div className="font-semibold text-[#1c1c1c]">Delhi Public School</div>
                  <div className="text-sm text-[#595959]">Bokaro Steel City</div>
                </div>
              </div>
            </div>
          </aside>

          <main className="min-h-[760px] flex-1 bg-[#f5f3f2]">
            <header className="flex items-center justify-between border-b border-black/5 bg-[#f5f3f2] px-5 py-4">
              <div className="flex items-center gap-3 text-[1.02rem] font-medium text-[#202020]">
                <button className="grid h-9 w-9 place-items-center rounded-xl bg-transparent text-lg hover:bg-black/5">←</button>
                <span>Exams</span>
              </div>

              <div className="flex items-center gap-3">
                <button className="grid h-9 w-9 place-items-center rounded-full bg-white/50 text-lg text-[#2d2d2d] shadow-sm">?</button>
                <button className="grid h-9 w-9 place-items-center rounded-full bg-white/50 text-lg text-[#2d2d2d] shadow-sm">🔔</button>
                <button className="grid h-9 w-9 place-items-center rounded-full bg-white/50 text-lg text-[#2d2d2d] shadow-sm">✦</button>
                <div className="ml-2 flex items-center gap-2 rounded-full bg-white/60 px-2 py-1.5 shadow-sm">
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-[#e9e9e9] text-[0.8rem] font-semibold text-[#111]">MR</div>
                  <span className="text-sm font-medium">Madhur Rastogi</span>
                  <span className="text-xs">▾</span>
                </div>
              </div>
            </header>

            {stage === "empty" && (
              <div className="flex min-h-[760px] flex-col items-center justify-center px-8 pb-14 pt-10 text-center">
                <div className="mb-6 flex flex-col items-center">
                  <div className="mb-4 w-full max-w-[820px] text-center text-[1.8rem] font-black leading-none tracking-[-0.07em] text-[#1f1f1f] sm:text-[2.2rem] md:text-[3rem] lg:text-[3.2rem]">
                    Upload <span className="text-[#f2672a]">Question Paper &amp; Answer Sheets</span>
                  </div>
                  <p className="text-base text-[#4a4a4a] sm:text-lg">Upload both files to get started</p>
                </div>

                <div className="relative mb-8 flex h-28 w-28 items-center justify-center rounded-full bg-[#f8d7cb] ring-[18px] ring-[#f3d0c2]">
                  <div className="absolute inset-0 rounded-full border-[2px] border-[#f2672a]/50" />
                  <div className="absolute inset-[16px] rounded-full bg-[#f4b4a3]" />
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[#f9f4f1] text-2xl shadow-sm">
                    👩‍🏫
                  </div>
                </div>

                <div className="grid w-full max-w-[760px] gap-6 md:grid-cols-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="upload-panel rounded-[22px] border-2 border-dashed border-[#d9d4cf] bg-[#f8f7f6] p-6 text-center transition hover:border-[#e57950] hover:bg-white sm:p-8 md:p-10"
                  >
                    <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-white text-2xl shadow-sm sm:h-14 sm:w-14 sm:text-3xl">⇪</div>
                    <div className="text-[1.45rem] font-bold tracking-[-0.05em] text-[#1d1d1d] sm:text-[1.8rem] md:text-[2rem]">
                      Upload <span className="text-[#f2672a]">Question Paper</span>
                    </div>
                    <div className="mt-2 text-xs text-[#6d6d6d] sm:text-sm">Max 10MB</div>
                  </button>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="upload-panel rounded-[22px] border-2 border-dashed border-[#d9d4cf] bg-[#f8f7f6] p-6 text-center transition hover:border-[#e57950] hover:bg-white sm:p-8 md:p-10"
                  >
                    <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-white text-2xl shadow-sm sm:h-14 sm:w-14 sm:text-3xl">⇪</div>
                    <div className="text-[1.45rem] font-bold tracking-[-0.05em] text-[#1d1d1d] sm:text-[1.8rem] md:text-[2rem]">
                      Upload <span className="text-[#f2672a]">Answer Sheet</span>
                    </div>
                    <div className="mt-2 text-xs text-[#6d6d6d] sm:text-sm">Max 10MB</div>
                  </button>
                </div>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#2b2b2b] px-6 py-3 text-base font-semibold text-white shadow-md transition hover:bg-[#1b1b1b]"
                >
                  Choose files
                </button>

                <p className="mt-5 text-sm text-[#6d6d6d]">
                  Once both files are uploaded, you&apos;ll be able to map answers with questions.
                </p>

                <input ref={fileInputRef} type="file" multiple accept=".pdf,image/*" className="hidden" onChange={handleUpload} />
              </div>
            )}

            {stage === "uploaded" && (
              <div className="flex min-h-[760px] flex-col items-center justify-center px-8 pb-14 pt-10 text-center">
                <div className="mb-6 text-[1.7rem] font-black tracking-[-0.07em] text-[#1a1a1a] sm:text-[2.2rem] md:text-[2.8rem] lg:text-[3.2rem]">
                  Upload <span className="text-[#f2672a]">Question Paper &amp; Answer Sheets</span>
                </div>

                <div className="relative mb-8 flex h-28 w-28 items-center justify-center rounded-full bg-[#f8d7cb] ring-[18px] ring-[#f3d0c2]">
                  <div className="absolute inset-0 rounded-full border-[2px] border-[#f2672a]/50" />
                  <div className="absolute inset-[16px] rounded-full bg-[#f4b4a3]" />
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[#f9f4f1] text-2xl shadow-sm">
                    👩‍🏫
                  </div>
                </div>

                {uploadMessage && (
                  <div className="mb-5 w-full max-w-[760px] rounded-2xl border border-[#d8ebd8] bg-[#edf9ee] px-4 py-3 text-sm font-medium text-[#1e5d2f] shadow-sm">
                    {uploadMessage}
                  </div>
                )}

                <div className="grid w-full max-w-[760px] gap-4 sm:gap-5 md:grid-cols-2">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className="relative flex items-center justify-between rounded-[22px] border-2 border-[#e8e3e0] bg-[#f9f7f6] p-3 text-left shadow-sm sm:p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#f2672a] text-sm font-bold text-white sm:h-12 sm:w-12 sm:text-lg">
                          {file.type === "Question Paper" ? "PDF" : "PDF"}
                        </div>
                        <div className="min-w-0">
                          <div className="max-w-[140px] truncate text-sm font-semibold text-[#202020] sm:max-w-[180px] sm:text-base md:text-lg">{file.name}</div>
                          <div className="text-[0.7rem] text-[#6b6b6b] sm:text-sm">
                            {formatBytes(file.size)} • {file.pages} Pages
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemove(file.id)}
                        className="grid h-8 w-8 place-items-center rounded-full bg-[#fce4dd] text-lg text-[#f2672a]"
                        aria-label={`Remove ${file.name}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  onClick={startMapping}
                  disabled={!hasBothFiles || isSubmitting}
                  className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#2a2a2a] px-6 py-3 text-base font-semibold text-white shadow-md transition hover:bg-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#2a2a2a]"
                >
                  {isSubmitting ? "Processing..." : "Start Mapping"} <span aria-hidden>→</span>
                </button>

                {uploadMessage && (
                  <p className="mt-4 text-sm text-[#4f4f4f]">{uploadMessage}</p>
                )}

                {error && (
                  <p className="mt-4 text-sm font-medium text-red-600">{error}</p>
                )}

                <p className="mt-5 text-sm text-[#6d6d6d]">Once both files are uploaded, you&apos;ll be able to map answers with questions.</p>
              </div>
            )}

            {stage === "processing" && (
              <div className="flex min-h-[760px] flex-col items-center justify-center gap-6 px-8 text-center">
                <div className="relative flex h-24 w-24 items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-[10px] border-[#f4c6b0] border-t-[#f2672a] animate-spin" />
                  <div className="absolute inset-5 rounded-full bg-[#f9f4f1]" />
                  <div className="absolute inset-0 rounded-full bg-[#f2672a]/10 blur-md" />
                </div>

                <div>
                  <div className="text-[2rem] font-black tracking-[-0.08em] text-[#1d1d1d] sm:text-[2.2rem]">Processing files...</div>
                  <div className="mt-2 text-base text-[#5d5d5d] sm:text-lg">Extracting questions and matching answers</div>
                </div>
              </div>
            )}

            {stage === "mapped" && (
              <div className="flex min-h-[760px] flex-col p-4 md:p-6">
                <div className="mb-4 grid gap-4 xl:grid-cols-[1.1fr_2.3fr]">
                  <div className="rounded-[20px] border border-black/5 bg-[#f7f5f4] p-3 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)] sm:p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-xl font-bold text-[#1d1d1d]">Extracted Questions</h2>
                      <button className="rounded-full border border-[#d7d2ce] bg-white px-2.5 py-1 text-xs font-medium text-[#424242]">
                        Expand All
                      </button>
                    </div>

                    {summary && (
                      <div className="mb-4 grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-white px-3 py-2 shadow-sm border border-[#e8e3df]">
                          <div className="text-[0.63rem] uppercase tracking-[0.12em] text-[#666]">Answered</div>
                          <div className="mt-1 text-xl font-bold text-[#1d1d1d]">{summary.answeredQuestions}/{summary.totalQuestions}</div>
                        </div>
                        <div className="rounded-2xl bg-white px-3 py-2 shadow-sm border border-[#e8e3df]">
                          <div className="text-[0.63rem] uppercase tracking-[0.12em] text-[#666]">Avg Score</div>
                          <div className="mt-1 text-xl font-bold text-[#1d1d1d]">{summary.avgScore}/10</div>
                        </div>
                        <div className="rounded-2xl bg-white px-3 py-2 shadow-sm border border-[#e8e3df] col-span-2">
                          <div className="text-[0.63rem] uppercase tracking-[0.12em] text-[#666]">Status</div>
                          <div className="mt-1 text-base font-bold text-[#1d1d1d]">{summary.status}</div>
                          <div className="text-xs text-[#5b5b5b]">Confidence {summary.confidence}</div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      {questions.map((question, index) => (
                        <button
                          key={question.id}
                          onClick={() => setSelectedQuestion(question.id)}
                          className={`flex w-full items-start gap-3 rounded-[18px] border p-3 text-left transition ${
                            selectedQuestion === question.id
                              ? "border-[#f2672a] bg-[#fff5f1] shadow-[0_0_0_1px_rgba(242,103,42,0.15)]"
                              : "border-[#e1ddd9] bg-white/80"
                          }`}
                        >
                          <div className="grid h-8 w-8 place-items-center rounded-full bg-[#f2672a] text-xs font-bold text-white">
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <div className="mb-1 flex items-center justify-between gap-3">
                              <div className="font-semibold text-[#1b1b1b]">{question.number}</div>
                              <span className="rounded-full bg-[#ecf7ee] px-2 py-1 text-[0.65rem] font-semibold text-[#2b7b46]">
                                {question.score}/10
                              </span>
                            </div>
                            <p className="text-sm leading-6 text-[#4d4d4d]">{question.prompt}</p>
                          </div>
                        </button>
                      ))}
                    </div>

                    {unmatchedAnswers.length > 0 && (
                      <div className="mt-4 rounded-[18px] border border-[#f3d8cd] bg-[#fff5f2] p-3">
                        <div className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#924a35]">Unmatched answers</div>
                        <ul className="space-y-2 text-sm leading-6 text-[#4a2a1e]">
                          {unmatchedAnswers.map((answer, idx) => (
                            <li key={`${answer}-${idx}`} className="rounded-xl bg-white/70 px-2 py-1.5">
                              {answer}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="rounded-[20px] border border-black/5 bg-[#f8f6f4] p-4 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-lg font-semibold text-[#1d1d1d]">
                        <span>Answer Sheet</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="rounded-full border border-[#d7d2ce] bg-white px-3 py-1.5 text-xs font-medium text-[#444]">
                          100%
                        </button>
                        <button className="rounded-full border border-[#d7d2ce] bg-white px-3 py-1.5 text-xs font-medium text-[#444]">
                          Page 1 of 4
                        </button>
                      </div>
                    </div>

                    <div className="relative h-[360px] overflow-hidden rounded-[20px] border border-[#e3dfdc] bg-[#f1efe9] p-3 sm:h-[460px] sm:p-4 xl:h-[560px]">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.85),rgba(255,255,255,0)_36%)]" />
                      <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(#b3b3b3_1px,transparent_1px),linear-gradient(90deg,#b3b3b3_1px,transparent_1px)] [background-size:22px_22px]" />

                      <div className="relative h-full w-full rounded-[18px] border border-[#d9d4d1] bg-[#f8f6f3] p-5 shadow-inner">
                        <div className="absolute inset-x-0 top-0 h-8 bg-[#f3f1ee] opacity-80" />

                        <div className="relative z-10 h-full w-full rounded-[14px] border border-[#dfd9d5] bg-[linear-gradient(135deg,#f9f6f1_0%,#f4f0eb_100%)] p-6 text-[#323232]">
                          <div className="mb-5 flex items-center justify-between text-[0.7rem] uppercase tracking-[0.18em] text-[#666]">
                            <span>Question paper</span>
                            <span>Student answer sheet</span>
                          </div>

                          <div className="relative h-[420px] w-full overflow-hidden rounded-[12px] border border-[#d9d3cf] bg-[#f9f6f1]">
                            <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,0.04),rgba(0,0,0,0.04))]" />

                                  {questions.map((question) => {
                              const regions = Array.isArray(question.answerRegion)
                                ? question.answerRegion
                                : question.answerRegions && question.answerRegions.length > 0
                                  ? question.answerRegions
                                  : [question.answerRegion];

                              const isSelected = question.id === (activeQuestion?.id ?? question.id);
                              return regions.map((region, regionIndex) => (
                                <div
                                  key={`${question.id}-${regionIndex}`}
                                  className={`absolute border-2 ${
                                    isSelected
                                      ? "border-[#ff4c87] bg-[#ff4c87]/10 shadow-[0_0_0_2px_rgba(255,76,135,0.10)]"
                                      : "border-transparent bg-transparent"
                                  }`}
                                  style={{
                                    left: `${region.x}%`,
                                    top: `${region.y}%`,
                                    width: `${region.width}%`,
                                    height: `${region.height}%`,
                                  }}
                                />
                              ));
                            })}

                            <div className="absolute left-6 top-12 max-w-[70%] rounded-xl bg-[#f6ece7] px-3 py-2 text-[0.72rem] leading-5 text-[#303030] shadow-sm">
                              <span className="font-semibold text-[#1b1b1b]">Q1.</span> Photosynthesis is the process used by green plants and some other organisms to convert light energy into chemical energy.
                            </div>

                            <div className="absolute right-8 top-20 max-w-[62%] rounded-xl border border-[#cfe5d8] bg-[#ecf7ef] px-3 py-2 text-[0.72rem] leading-5 text-[#243b2d] shadow-sm">
                              <span className="font-semibold">Q1.</span> The process mainly occurs in the leaves where chlorophyll absorbs sunlight and converts water and carbon dioxide into glucose and oxygen.
                            </div>

                            <div className="absolute left-10 top-32 max-w-[65%] rounded-xl bg-[#f6ece7] px-3 py-2 text-[0.72rem] leading-5 text-[#303030] shadow-sm">
                              <span className="font-semibold text-[#1b1b1b]">Q2.</span> The process mainly occurs in the chloroplasts of plant cells and uses sunlight, carbon dioxide, and water.
                            </div>

                            <div className="absolute right-4 top-44 max-w-[60%] rounded-xl border border-[#dfeccd] bg-[#f3f9e8] px-3 py-2 text-[0.72rem] leading-5 text-[#243b2d] shadow-sm">
                              <span className="font-semibold">Q2.</span> The process occurs in a chloroplast. It uses light energy, carbon dioxide, and water to produce glucose and oxygen.
                            </div>

                            <div className="absolute left-12 bottom-12 max-w-[70%] rounded-xl bg-[#f6ece7] px-3 py-2 text-[0.72rem] leading-5 text-[#303030] shadow-sm">
                              <span className="font-semibold text-[#1b1b1b]">Q3.</span> Explain the role of chlorophyll and why the reaction is necessary for plant survival.
                            </div>

                            <div className="absolute right-5 bottom-14 max-w-[60%] rounded-xl border border-[#dfeccd] bg-[#f3f9e8] px-3 py-2 text-[0.72rem] leading-5 text-[#243b2d] shadow-sm">
                              <span className="font-semibold">Q3.</span> Chlorophyll absorbs sunlight, helping plants store energy by converting carbon dioxide and water into glucose.
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-2 rounded-[20px] border border-[#dfe6d8] bg-[#eff9ef] p-4 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.02)]">
                  <div className="mb-3 flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[#5b5b5b]">Question {activeQuestion?.number ?? "1"}</div>
                      <h3 className="mt-1 text-2xl font-bold text-[#1f1f1f]">{activeQuestion?.number ?? "Q1"}</h3>
                    </div>
                    <div className="rounded-full bg-[#e7f4ea] px-3 py-1 text-sm font-semibold text-[#2f7a47]">{activeQuestion?.score ?? 8}/10</div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[1.2fr_1.1fr]">
                    <div className="rounded-[18px] border border-[#dfe7dc] bg-[#f7fcf7] p-4 text-[#2a2a2a] shadow-sm">
                      <p className="text-base leading-7">{activeQuestion?.prompt ?? "Question prompt will appear here."}</p>
                    </div>

                    <div className="rounded-[18px] border border-[#dfe7dc] bg-[#edf8f0] p-4 shadow-sm">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#4d6f56]">Answer</div>
                      <p className="text-base leading-7 text-[#212a22]">{activeQuestion?.answer ?? "No answer detected."}</p>
                      {activeQuestion?.unanswered && (
                        <div className="mt-3 rounded-xl border border-[#d8d8d8] bg-white/60 px-3 py-2 text-sm font-medium text-[#5b5b5b]">
                          This question is currently unanswered.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

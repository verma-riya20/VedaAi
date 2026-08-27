"use client";

import { useRef, useState } from "react";

type UploadedFile = {
  id: string;
  name: string;
  size: number;
  type: "Question Paper" | "Answer Sheet";
  pages: number;
  file: File;
};

type AnswerRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

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
    prompt:
      "Photosynthesis is the process used by green plants and some other organisms to convert light energy into chemical energy.",
    answer:
      "The process mainly occurs in the leaves, where chlorophyll captures sunlight and converts carbon dioxide and water into glucose and oxygen.",
    answerRegion: {
      x: 14,
      y: 16,
      width: 42,
      height: 20,
    },
    score: 9,
    confidence: 0.9,
  },
  {
    id: "Q2",
    number: "2",
    prompt:
      "The process mainly occurs in the chloroplasts of plant cells and uses sunlight, carbon dioxide, and water.",
    answer:
      "The light-dependent reactions happen in the thylakoid membranes, while the Calvin cycle occurs in the stroma of the chloroplast.",
    answerRegion: {
      x: 18,
      y: 35,
      width: 46,
      height: 24,
    },
    score: 8,
    confidence: 0.8,
  },
  {
    id: "Q3",
    number: "3",
    prompt:
      "Explain the role of chlorophyll and why the reaction is necessary for plant survival.",
    answer:
      "Chlorophyll absorbs light energy and creates the conditions for glucose production; without it, the plant cannot make its own food.",
    answerRegion: {
      x: 15,
      y: 62,
      width: 50,
      height: 21,
    },
    score: 7,
    confidence: 0.7,
  },
  {
    id: "Q4",
    number: "4",
    prompt:
      "State the outputs of photosynthesis and connect them to life on Earth.",
    answer:
      "The outputs are oxygen and glucose. Oxygen sustains aerobic life, while glucose provides energy for growth and respiration.",
    answerRegion: {
      x: 26,
      y: 78,
      width: 48,
      height: 18,
    },
    score: 8,
    confidence: 0.8,
  },
];

const formatBytes = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function Home() {
  const [files, setFiles] = useState<UploadedFile[]>([]);

  const [stage, setStage] = useState<
    "empty" | "uploaded" | "processing" | "mapped"
  >("empty");

  const [selectedQuestion, setSelectedQuestion] = useState<string>("");

  const [questions, setQuestions] =
    useState<Question[]>([]);

  const [summary, setSummary] = useState<{
    totalQuestions: number;
    answeredQuestions: number;
    unansweredQuestions: number;
    avgScore: number;
    confidence: number;
    status: string;
  } | null>(null);

  const [unmatchedAnswers, setUnmatchedAnswers] =
    useState<string[]>([]);

  const [error, setError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  /*
   * IMPORTANT:
   * Separate refs for the two upload buttons.
   * This fixes the original issue where both buttons
   * opened the same file input.
   */
  const questionPaperInputRef =
    useRef<HTMLInputElement | null>(null);

  const answerSheetInputRef =
    useRef<HTMLInputElement | null>(null);

  /*
   * ============================================================
   * UPLOAD
   * ============================================================
   */

  const handleUpload = (
    event: React.ChangeEvent<HTMLInputElement>,
    fileType: "Question Paper" | "Answer Sheet"
  ) => {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    setError(null);

    /*
     * Maximum file size = 10 MB
     */
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError("File size must be less than 10MB.");
      event.target.value = "";
      return;
    }

    setFiles((prevFiles) => {
      const filteredFiles = prevFiles.filter(
        (file) => file.type !== fileType
      );

      const duplicate = filteredFiles.some(
        (file) =>
          file.name === selectedFile.name &&
          file.size === selectedFile.size &&
          file.file.lastModified ===
            selectedFile.lastModified
      );

      if (duplicate) {
        setError("This file has already been uploaded.");
        event.target.value = "";
        return prevFiles;
      }

      const newFile: UploadedFile = {
        id: crypto.randomUUID(),
        name:
          selectedFile.name || "uploaded_file.pdf",
        size: selectedFile.size,
        type: fileType,
        pages: selectedFile.type.includes("pdf")
          ? 2
          : 4,
        file: selectedFile,
      };

      const nextFiles = [
        ...filteredFiles,
        newFile,
      ];

      setStage(
        nextFiles.length > 0
          ? "uploaded"
          : "empty"
      );

      return nextFiles;
    });

    event.target.value = "";
  };

  /*
   * ============================================================
   * REMOVE FILE
   * ============================================================
   */

  const handleRemove = (id: string) => {
    const nextFiles = files.filter(
      (file) => file.id !== id
    );

    setFiles(nextFiles);
    setError(null);

    if (nextFiles.length === 0) {
      setStage("empty");
    } else {
      setStage("uploaded");
    }
  };

  /*
   * ============================================================
   * START MAPPING
   * ============================================================
   */

  const startMapping = async () => {
    const questionFile = files.find(
      (file) => file.type === "Question Paper"
    );

    const answerFile = files.find(
      (file) => file.type === "Answer Sheet"
    );

    if (!questionFile || !answerFile) {
      setError(
        "Please upload both the Question Paper and Answer Sheet."
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setQuestions([]);
    setSummary(null);
    setUnmatchedAnswers([]);
    setSelectedQuestion("");

    /*
     * IMPORTANT:
     * We no longer automatically switch to mapped
     * after 1.8 seconds.
     *
     * The actual API response controls the transition.
     */
    setStage("processing");

    try {
      const formData = new FormData();

      formData.append(
        "questionPaper",
        questionFile.file
      );

      formData.append(
        "answerSheet",
        answerFile.file
      );

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      const response = await fetch(
        "/api/extract",
        {
          method: "POST",
          body: formData,
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          result?.error || "Processing failed"
        );
      }

      if (!result?.questions || !Array.isArray(result.questions) || result.questions.length === 0) {
        throw new Error("No questions extracted from uploaded files.");
      }

      const mappedQuestions = result.questions.map((item: any) => ({
        id: item.id,
        number: item.number,
        prompt: item.prompt,
        answer: item.answer,
        score: item.score,
        confidence: item.confidence,
        answerRegion: item.answerRegions?.length ? item.answerRegions : item.answerRegion,
        answerRegions: item.answerRegions || [item.answerRegion],
        unanswered: item.unanswered,
      }));

      setQuestions(mappedQuestions);
      setSelectedQuestion(mappedQuestions[0]?.id || "");
      setSummary(result.summary || null);
      setUnmatchedAnswers(Array.isArray(result.unmatchedAnswers) ? result.unmatchedAnswers : []);
      setStage("mapped");
    } catch (err) {
      console.error(err);
      setQuestions([]);
      setSummary(null);
      setUnmatchedAnswers([]);
      setSelectedQuestion("");

      const message = err instanceof Error && err.name === "AbortError"
        ? "Extraction timed out. Please try again with smaller or clearer PDF/image files."
        : err instanceof Error && err.message
          ? err.message
          : "Extraction failed. Please upload valid PDF or image files.";

      setError(message);

      /*
       * Go back to upload screen while
       * preserving the uploaded files.
       */
      setStage("uploaded");
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeQuestion =
    questions.find(
      (question) =>
        question.id ===
        selectedQuestion
    ) ?? questions[0];

  const activeRegions =
    Array.isArray(
      activeQuestion?.answerRegion
    )
      ? activeQuestion.answerRegion
      : activeQuestion?.answerRegions
        ?.length
        ? activeQuestion.answerRegions
        : [
            activeQuestion?.answerRegion ??
              {
                x: 15,
                y: 30,
                width: 40,
                height: 18,
              },
          ];

  const questionFile =
    files.find(
      (file) =>
        file.type === "Question Paper"
    );

  const answerFile =
    files.find(
      (file) =>
        file.type === "Answer Sheet"
    );

  const hasBothFiles =
    Boolean(questionFile) &&
    Boolean(answerFile);

  /*
   * ============================================================
   * REUSABLE UPLOAD CARD
   * ============================================================
   */

  const UploadCard = ({
    type,
  }: {
    type:
      | "Question Paper"
      | "Answer Sheet";
  }) => {
    const isQuestionPaper =
      type === "Question Paper";

    return (
      <button
        type="button"
        onClick={() => {
          if (isQuestionPaper) {
            questionPaperInputRef.current?.click();
          } else {
            answerSheetInputRef.current?.click();
          }
        }}
        className="group flex h-[118px] w-full flex-col items-center justify-center rounded-[16px] border-[1.5px] border-dashed border-[#d8d3cf] bg-[#f8f7f6] transition-all duration-200 hover:border-[#f2672a] hover:bg-white"
      >
        <div className="mb-2 flex h-[30px] w-[30px] items-center justify-center rounded-[6px] bg-white text-[15px] text-[#666] shadow-sm">
          ⇧
        </div>

        <div className="text-[15px] font-semibold tracking-[-0.02em] text-[#242424]">
          Upload{" "}
          <span className="text-[#f2672a]">
            {type}
          </span>
        </div>

        <div className="mt-1 text-[10px] text-[#777]">
          Max 10MB
        </div>
      </button>
    );
  };

  /*
   * ============================================================
   * REUSABLE FILE CARD
   * ============================================================
   */

  const UploadedFileCard = ({
    file,
  }: {
    file: UploadedFile;
  }) => {
    return (
      <div className="flex h-[118px] w-full items-center justify-between rounded-[16px] border-[1.5px] border-dashed border-[#d6d1cd] bg-[#f8f7f6] px-4 text-left">
        <div className="flex min-w-0 items-center gap-3">

          <div className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-[14px] bg-[#f2672a] text-[12px] font-bold text-white shadow-sm">
            PDF
          </div>

          <div className="min-w-0">

            <div className="truncate text-[15px] font-bold tracking-[-0.025em] text-[#1d1d1d]">
              {file.name}
            </div>

            <div className="mt-1 text-[11px] font-medium text-[#666]">
              {formatBytes(file.size)}{" "}
              •{" "}
              {file.pages} Pages
            </div>

          </div>
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handleRemove(file.id);
          }}
          className="ml-3 flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full bg-[#2b2b2b] text-[21px] font-light leading-none text-white transition hover:bg-[#151515]"
          aria-label={`Remove ${file.name}`}
        >
          ×
        </button>
      </div>
    );
  };

  /*
   * ============================================================
   * PAGE
   * ============================================================
   */

  return (
    <div className="app-shell min-h-screen bg-[#3d3b39] p-0 sm:p-2 md:p-3 lg:p-4">

      <div className="mx-auto max-w-[1500px] overflow-hidden rounded-none border border-black/5 bg-[#f4f1ee] shadow-[0_18px_50px_rgba(0,0,0,0.12)] sm:rounded-[16px]">

        <div className="flex min-h-screen flex-col lg:min-h-[920px] lg:flex-row">

          {/* ==================================================
              SIDEBAR
          =================================================== */}

          <aside className="w-full border-b border-black/5 bg-[#f0efee] p-3 sm:p-4 lg:w-[290px] lg:border-b-0 lg:border-r">

            {/* Logo */}
            <div className="flex items-center gap-3 pb-3">

              <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#1f1f1f] text-lg font-bold text-white">
                V
              </div>

              <div className="text-[2.1rem] font-black tracking-[-0.06em] text-[#1f1f1f]">
                VedaAI
              </div>

            </div>

            {/* AI Toolkit */}
            <button
              type="button"
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#1d1d1d] px-4 py-3 text-sm font-semibold text-white shadow-sm"
            >
              <span className="text-lg">
                ✦
              </span>

              AI Teacher&apos;s Toolkit
            </button>

            {/* Navigation */}
            <nav className="mt-6 grid gap-2 text-[0.96rem] font-medium text-[#2f2f2f]">

              {[
                "Home",
                "My Classroom",
                "Assignments",
                "Exams",
                "My Library",
              ].map(
                (item, index) => (
                  <button
                    type="button"
                    key={item}
                    className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition ${
                      item === "Exams"
                        ? "bg-[#e7e4e1] text-[#1b1b1b] shadow-inner"
                        : "hover:bg-[#e7e4e1]"
                    }`}
                  >
                    <span className="text-base opacity-80">
                      {
                        [
                          "▣",
                          "◫",
                          "▤",
                          "▢",
                          "◌",
                        ][index]
                      }
                    </span>

                    {item}
                  </button>
                )
              )}

            </nav>

            {/* School */}
            <div className="mt-10 rounded-[20px] bg-[#f4f2f0] p-3 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">

              <div className="flex items-center gap-3 rounded-xl bg-white/80 p-2.5">

                <div className="grid h-12 w-12 place-items-center rounded-full border border-[#d8d2ce] bg-[#edf6ee] text-lg">
                  🌿
                </div>

                <div>
                  <div className="font-semibold text-[#1c1c1c]">
                    Delhi Public School
                  </div>

                  <div className="text-sm text-[#595959]">
                    Bokaro Steel City
                  </div>
                </div>

              </div>

            </div>

          </aside>

          {/* ==================================================
              MAIN
          =================================================== */}

          <main className="flex min-h-[760px] flex-1 flex-col bg-[#f5f3f2]">

            {/* Header */}
            <header className="flex items-center justify-between border-b border-black/5 bg-[#f5f3f2] px-4 py-3 sm:px-5">

              <div className="flex items-center gap-3 text-[1rem] font-medium text-[#202020]">

                <button
                  type="button"
                  className="grid h-9 w-9 place-items-center rounded-xl hover:bg-black/5"
                >
                  ←
                </button>

                <span>
                  Exams
                </span>

              </div>

              <div className="flex items-center gap-2">

                <button
                  type="button"
                  className="grid h-9 w-9 place-items-center rounded-full bg-white/50 text-sm shadow-sm"
                >
                  ?
                </button>

                <button
                  type="button"
                  className="grid h-9 w-9 place-items-center rounded-full bg-white/50 text-sm shadow-sm"
                >
                  🔔
                </button>

                <button
                  type="button"
                  className="grid h-9 w-9 place-items-center rounded-full bg-white/50 text-sm shadow-sm"
                >
                  ✦
                </button>

                <div className="ml-1 flex items-center gap-2 rounded-full bg-white/60 px-2 py-1.5 shadow-sm">

                  <div className="grid h-8 w-8 place-items-center rounded-full bg-[#e9e9e9] text-[0.75rem] font-semibold">
                    MR
                  </div>

                  <span className="hidden text-sm font-medium sm:block">
                    Madhur Rastogi
                  </span>

                  <span className="text-xs">
                    ▾
                  </span>

                </div>

              </div>

            </header>

            {/* ==================================================
                UPLOAD SCREEN
            =================================================== */}

            {(stage === "empty" ||
              stage === "uploaded") && (
              <div className="flex flex-1 flex-col items-center px-5 pb-14 pt-14 text-center sm:px-8 sm:pt-16">

                {/* TITLE */}
                <div className="mb-5">

                  <h1 className="text-[2rem] font-black leading-[1.08] tracking-[-0.06em] text-[#1f1f1f] sm:text-[2.6rem] lg:text-[3rem]">

                    Upload{" "}

                    <span className="inline-block rounded-[6px] bg-[#f9e7df] px-2 py-1 text-[#f2672a]">
                      Question Paper &amp; Answer Sheets
                    </span>

                  </h1>

                  <p className="mt-2 text-sm text-[#525252] sm:text-base">
                    Upload both files to get started
                  </p>

                </div>

                {/* ==================================================
                    TEACHER ILLUSTRATION
                =================================================== */}

                <div className="relative mb-7 flex h-[112px] w-[112px] items-center justify-center rounded-full bg-[#f8d7cb] ring-[15px] ring-[#f3d0c2] sm:h-[126px] sm:w-[126px]">

                  <div className="absolute inset-0 rounded-full border-[2px] border-[#f2672a]/35" />

                  <div className="absolute inset-[17px] rounded-full border-[2px] border-[#f2a082]/60" />

                  {/* Orange dots */}
                  <div className="absolute left-1/2 top-[-3px] h-[15px] w-[15px] -translate-x-1/2 rounded-full bg-[#f2672a]" />

                  <div className="absolute bottom-[-3px] left-1/2 h-[15px] w-[15px] -translate-x-1/2 rounded-full bg-[#f2672a]" />

                  <div className="absolute left-[-3px] top-1/2 h-[15px] w-[15px] -translate-y-1/2 rounded-full bg-[#f2672a]" />

                  <div className="absolute right-[-3px] top-1/2 h-[15px] w-[15px] -translate-y-1/2 rounded-full bg-[#f2672a]" />

                  {/* Teacher */}
                  <div className="relative flex h-[65px] w-[65px] items-center justify-center rounded-full bg-[#f9f4f1] text-[30px] shadow-[0_2px_8px_rgba(0,0,0,0.08)] sm:h-[72px] sm:w-[72px]">
                    👩‍🏫
                  </div>

                </div>

                {/* ==================================================
                    TWO FIXED PANELS
                =================================================== */}

                <div className="grid w-full max-w-[760px] grid-cols-1 gap-4 sm:grid-cols-2">

                  {/* QUESTION PAPER SLOT */}
                  {questionFile ? (
                    <UploadedFileCard
                      file={questionFile}
                    />
                  ) : (
                    <UploadCard
                      type="Question Paper"
                    />
                  )}

                  {/* ANSWER SHEET SLOT */}
                  {answerFile ? (
                    <UploadedFileCard
                      file={answerFile}
                    />
                  ) : (
                    <UploadCard
                      type="Answer Sheet"
                    />
                  )}

                </div>

                {/* ==================================================
                    START MAPPING
                =================================================== */}

                <button
                  type="button"
                  onClick={startMapping}
                  disabled={
                    !hasBothFiles ||
                    isSubmitting
                  }
                  className={`mt-7 inline-flex items-center gap-2 rounded-full px-7 py-3 text-[15px] font-semibold shadow-md transition ${
                    hasBothFiles &&
                    !isSubmitting
                      ? "bg-[#2b2b2b] text-white hover:bg-[#171717]"
                      : "cursor-not-allowed bg-[#a2a2a2] text-white"
                  }`}
                >

                  {isSubmitting
                    ? "Processing..."
                    : "Start Mapping"}

                  <span>
                    →
                  </span>

                </button>

                {/* Helper text */}
                <p className="mt-4 max-w-[550px] text-xs text-[#6d6d6d]">
                  Once both files are uploaded, you&apos;ll be able to map answers with questions.
                </p>

                {/* Error */}
                {error && (
                  <div className="mt-4 rounded-xl bg-[#fff0ed] px-4 py-2 text-sm font-medium text-red-600">
                    {error}
                  </div>
                )}

              </div>
            )}

            {/* ==================================================
                PROCESSING
            =================================================== */}

            {stage === "processing" && (
              <div className="flex flex-1 flex-col bg-[#f5f3f2]">

                <header className="flex items-center justify-between border-b border-black/5 bg-[#f5f3f2] px-4 py-3 sm:px-5">

                  <div className="flex items-center gap-3 text-[1rem] font-medium text-[#202020]">

                    <button
                      type="button"
                      className="grid h-9 w-9 place-items-center rounded-xl hover:bg-black/5"
                    >
                      ←
                    </button>

                    <span>
                      Exams
                    </span>

                  </div>

                  <div className="flex items-center gap-2">

                    <button
                      type="button"
                      className="grid h-9 w-9 place-items-center rounded-full bg-white/50 text-sm shadow-sm"
                    >
                      ?
                    </button>

                    <button
                      type="button"
                      className="grid h-9 w-9 place-items-center rounded-full bg-white/50 text-sm shadow-sm"
                    >
                      🔔
                    </button>

                    <div className="ml-1 flex items-center gap-2 rounded-full bg-white/60 px-2 py-1.5 shadow-sm">

                      <div className="grid h-8 w-8 place-items-center rounded-full bg-[#e9e9e9] text-[0.75rem] font-semibold">
                        MR
                      </div>

                      <span className="hidden text-sm font-medium sm:block">
                        Madhur Rastogi
                      </span>

                      <span className="text-xs">
                        ▾
                      </span>

                    </div>

                  </div>

                </header>

                <div className="flex flex-1 items-center justify-center bg-[#f3f1ef] px-6">
                  <div className="flex flex-col items-center justify-center text-center">

                    <div className="relative mb-6 flex h-28 w-28 items-center justify-center">

                      <div className="absolute h-20 w-20 rotate-45 rounded-[18px] bg-[#f2672a] shadow-[0_12px_25px_rgba(242,103,42,0.28)]" />

                      <div className="absolute h-7 w-7 rotate-45 rounded-[6px] bg-[#f8f4f2]" />

                      <div className="absolute left-[18%] top-[16%] h-2.5 w-2.5 rounded-full bg-[#f2c7b7]" />
                      <div className="absolute right-[18%] top-[16%] h-2.5 w-2.5 rounded-full bg-[#f2c7b7]" />
                      <div className="absolute left-[18%] bottom-[16%] h-2.5 w-2.5 rounded-full bg-[#f2c7b7]" />
                      <div className="absolute right-[18%] bottom-[16%] h-2.5 w-2.5 rounded-full bg-[#f2c7b7]" />

                      <div className="relative text-[1.8rem] font-black text-[#f2672a]">
                        ✦
                      </div>

                    </div>

                    <div className="text-[2.2rem] font-black leading-none tracking-[-0.08em] text-[#1d1d1d]">
                      Extracting...
                    </div>

                    <div className="mt-2 text-base text-[#4c4c4c]">
                      This may take a while
                    </div>

                  </div>
                </div>

              </div>
            )}

            {/* ==================================================
                MAPPED SCREEN
            =================================================== */}

            {stage === "mapped" && (
              <div className="flex min-h-[760px] flex-col p-4 md:p-6">
                <div className="mb-4 grid gap-4 xl:grid-cols-[0.92fr_1.6fr]">

                  {/* QUESTION LIST */}
                  <div className="rounded-[18px] border border-black/5 bg-[#f7f5f4] p-3 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)] sm:p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <h2 className="text-[1.05rem] font-bold tracking-[-0.04em] text-[#1d1d1d]">
                        Extracted Questions
                      </h2>

                      <button
                        type="button"
                        className="rounded-full border border-[#d7d2ce] bg-white px-2.5 py-1 text-[0.68rem] font-medium text-[#424242]"
                      >
                        Expand All
                      </button>
                    </div>

                    {summary && (
                      <div className="mb-4 grid grid-cols-2 gap-3">
                        <div className="rounded-[14px] border border-[#e8e3df] bg-white px-3 py-2 shadow-sm">
                          <div className="text-[0.58rem] uppercase tracking-[0.12em] text-[#666]">
                            Answered
                          </div>
                          <div className="mt-1 text-[1.05rem] font-bold text-[#1d1d1d]">
                            {summary.answeredQuestions}/{summary.totalQuestions}
                          </div>
                        </div>

                        <div className="rounded-[14px] border border-[#e8e3df] bg-white px-3 py-2 shadow-sm">
                          <div className="text-[0.58rem] uppercase tracking-[0.12em] text-[#666]">
                            Avg score
                          </div>
                          <div className="mt-1 text-[1.05rem] font-bold text-[#1d1d1d]">
                            {summary.avgScore}/10
                          </div>
                        </div>

                        <div className="col-span-2 rounded-[14px] border border-[#e8e3df] bg-white px-3 py-2 shadow-sm">
                          <div className="text-[0.58rem] uppercase tracking-[0.12em] text-[#666]">
                            Status
                          </div>
                          <div className="mt-1 text-[0.98rem] font-bold text-[#1d1d1d]">
                            {summary.status}
                          </div>
                          <div className="text-[0.7rem] text-[#5b5b5b]">
                            Confidence {summary.confidence}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      {questions.map((question, index) => (
                        <button
                          type="button"
                          key={question.id}
                          onClick={() => setSelectedQuestion(question.id)}
                          className={`flex w-full items-start gap-3 rounded-[16px] border p-3 text-left transition ${
                            selectedQuestion === question.id
                              ? "border-[#f2672a] bg-[#fff5f1]"
                              : "border-[#e1ddd9] bg-white/80"
                          }`}
                        >
                          <div className="grid h-8 w-8 place-items-center rounded-full bg-[#f2672a] text-[0.72rem] font-bold text-white">
                            {index + 1}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center justify-between gap-3">
                              <div className="text-[0.85rem] font-semibold text-[#1d1d1d]">
                                {question.number}
                              </div>
                              <span className="rounded-full bg-[#ebf7ee] px-2 py-1 text-[0.63rem] font-semibold text-[#2b7b46]">
                                {question.score || 0}/10
                              </span>
                            </div>

                            <p className="text-[0.86rem] leading-6 text-[#4d4d4d]">
                              {question.prompt}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>

                    {unmatchedAnswers.length > 0 && (
                      <div className="mt-4 rounded-[16px] border border-[#f3d8cd] bg-[#fff5f2] p-3">
                        <div className="mb-2 text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-[#924a35]">
                          Unmatched answers
                        </div>

                        <ul className="space-y-2 text-[0.82rem] leading-6 text-[#4a2a1e]">
                          {unmatchedAnswers.map((answer, index) => (
                            <li
                              key={`${answer}-${index}`}
                              className="rounded-xl bg-white/70 px-2 py-1.5"
                            >
                              {answer}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* ANSWER SHEET */}
                  <div className="rounded-[18px] border border-black/5 bg-[#f8f6f4] p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="text-[1.1rem] font-semibold text-[#1d1d1d]">
                        Answer Sheet
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="rounded-full border border-[#d7d2ce] bg-white px-3 py-1.5 text-[0.7rem] font-medium text-[#404040]"
                        >
                          100%
                        </button>
                        <button
                          type="button"
                          className="rounded-full border border-[#d7d2ce] bg-white px-3 py-1.5 text-[0.7rem] font-medium text-[#404040]"
                        >
                          Page 1 of 4
                        </button>
                      </div>
                    </div>

                    <div className="relative h-[360px] overflow-hidden rounded-[18px] border border-[#e3dfdc] bg-[#f1efe9] p-3 sm:h-[500px]">
                      <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(#b3b3b3_1px,transparent_1px),linear-gradient(90deg,#b3b3b3_1px,transparent_1px)] [background-size:22px_22px]" />

                      <div className="relative h-full w-full rounded-[14px] border border-[#d9d4d1] bg-[#f8f6f3] p-4 shadow-inner">
                        <div className="relative z-10 h-full w-full rounded-[12px] border border-[#dfd9d5] bg-[#f9f6f1] p-5">
                          <div className="mb-4 flex items-center justify-between text-[0.64rem] font-medium uppercase tracking-[0.18em] text-[#666]">
                            <span>Question paper</span>
                            <span>Student answer sheet</span>
                          </div>

                          <div className="relative h-[420px] w-full overflow-hidden rounded-[10px] border border-[#d9d3cf] bg-[#f9f6f1]">
                            {questions.map((question) => {
                              const regions = Array.isArray(question.answerRegion)
                                ? question.answerRegion
                                : question.answerRegions?.length
                                  ? question.answerRegions
                                  : [question.answerRegion];

                              const isSelected = question.id === activeQuestion?.id;

                              return regions.map((region, regionIndex) => (
                                <div
                                  key={`${question.id}-${regionIndex}`}
                                  className={`absolute border-2 ${
                                    isSelected ? "border-[#ff4c87] bg-[#ff4c87]/10" : "border-transparent"
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

                            <div className="absolute left-6 top-8 max-w-[46%] rounded-xl bg-[#f6ece7] px-3 py-2 text-[0.68rem] leading-5 text-[#2e2e2e] shadow-sm">
                              <span className="font-semibold">Q1.</span>{" "}
                              {questions[0]?.prompt || "Photosynthesis is the process used by green plants and some other organisms to convert light energy into chemical energy."}
                            </div>

                            <div className="absolute right-7 top-12 max-w-[44%] rounded-xl border border-[#cfe5d8] bg-[#ecf7ef] px-3 py-2 text-[0.68rem] leading-5 text-[#2e2e2e] shadow-sm">
                              <span className="font-semibold">Q1.</span>{" "}
                              {questions[0]?.answer || "The process mainly occurs in the leaves where chlorophyll absorbs sunlight and converts water and carbon dioxide into glucose and oxygen."}
                            </div>

                            <div className="absolute left-10 top-28 max-w-[44%] rounded-xl bg-[#f6ece7] px-3 py-2 text-[0.68rem] leading-5 text-[#2e2e2e] shadow-sm">
                              <span className="font-semibold">Q2.</span>{" "}
                              {questions[1]?.prompt || "The process mainly occurs in the chloroplasts of plant cells and uses sunlight, carbon dioxide, and water."}
                            </div>

                            <div className="absolute right-8 top-34 max-w-[44%] rounded-xl border border-[#dfeccd] bg-[#f3f9e8] px-3 py-2 text-[0.68rem] leading-5 text-[#2e2e2e] shadow-sm">
                              <span className="font-semibold">Q2.</span>{" "}
                              {questions[1]?.answer || "The process occurs in a chloroplast. It uses light energy, carbon dioxide, and water to produce glucose and oxygen."}
                            </div>

                            <div className="absolute left-12 bottom-14 max-w-[46%] rounded-xl bg-[#f6ece7] px-3 py-2 text-[0.68rem] leading-5 text-[#2e2e2e] shadow-sm">
                              <span className="font-semibold">Q3.</span>{" "}
                              {questions[2]?.prompt || "Explain the role of chlorophyll and why the reaction is necessary for plant survival."}
                            </div>

                            <div className="absolute right-6 bottom-12 max-w-[42%] rounded-xl border border-[#dfeccd] bg-[#f3f9e8] px-3 py-2 text-[0.68rem] leading-5 text-[#2e2e2e] shadow-sm">
                              <span className="font-semibold">Q3.</span>{" "}
                              {questions[2]?.answer || "Chlorophyll absorbs sunlight, helping plants store energy by converting carbon dioxide and water into glucose."}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-2 rounded-[18px] border border-[#dfe6d8] bg-[#eef8ee] p-4">
                  <div className="mb-3 flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[#5b5b5b]">
                        Question {activeQuestion?.number}
                      </div>
                      <h3 className="mt-1 text-[1.9rem] font-black leading-none tracking-[-0.06em] text-[#1d1d1d]">
                        Q{activeQuestion?.number}
                      </h3>
                    </div>

                    <div className="rounded-full bg-[#e7f4ea] px-3 py-1 text-[0.8rem] font-semibold text-[#2f7a47]">
                      {activeQuestion?.score || 0}/10
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-[16px] border border-[#dfe7dc] bg-[#f7fcf7] p-4">
                      <p className="text-[1rem] leading-7 text-[#1d1d1d]">
                        {activeQuestion?.prompt}
                      </p>
                    </div>

                    <div className="rounded-[16px] border border-[#dfe7dc] bg-[#edf8f0] p-4">
                      <div className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[#4d6f56]">
                        Answer
                      </div>
                      <p className="text-[1rem] leading-7 text-[#1d1d1d]">
                        {activeQuestion?.answer || "No answer detected."}
                      </p>

                      {activeQuestion?.unanswered && (
                        <div className="mt-3 rounded-xl bg-white/60 px-3 py-2 text-[0.82rem] text-[#3d433e]">
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

      {/* ========================================================
          HIDDEN INPUTS
          These exist ONCE, outside the stage conditions.
      ========================================================= */}

      <input
        ref={questionPaperInputRef}
        type="file"
        accept=".pdf,image/*"
        className="hidden"
        onChange={(event) =>
          handleUpload(
            event,
            "Question Paper"
          )
        }
      />

      <input
        ref={answerSheetInputRef}
        type="file"
        accept=".pdf,image/*"
        className="hidden"
        onChange={(event) =>
          handleUpload(
            event,
            "Answer Sheet"
          )
        }
      />

    </div>
  );
}
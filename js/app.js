// ======== الحالة العامة ========
const state = {
  questions: [],
  currentQuestion: 0,
  score: 0,
  timeLeft: 30,
  questionTime: 30,
  timerId: null,
  isPaused: false,
  answeredQuestions: [],
  lastWrong: [],
  numeralType: "arabic",
  shuffledMaps: [],
  optionsLayout: "2x2",
};

// حالة خاصة بسؤال التوصيل
let connectState = {
  from: null,
  connections: [],
  canvas: null,
  observer: null,
};

// ======== Bootstrap ثابت/افتراضي آمن ========
const STORAGE_KEY = "quiz_teacher_lite_no_math_ar_v6_connecting";

// إن لم يكن معرّفاً من قبل، نضع قيماً افتراضية آمنة
window.quizConfig = window.quizConfig || {
  title: "الاختبار التفاعلي",
  instructions: "اختر الإجابة الصحيحة لكل سؤال",
};
// بعد تعريف window.quizConfig = window.quizConfig || {...}
quizConfig.logo = quizConfig.logo || null; // Data URL للّوگو
quizConfig.logoAlt = quizConfig.logoAlt || ""; // نص بديل

// ==== توافق أسماء الدوال (Shim) ====
window.updateTimer = function () {
  if (typeof window.updateTimerDisplay === "function") {
    window.updateTimerDisplay();
  }
};

window.formatNumber = function (n) {
  const num = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat(
      state.numeralType === "eastern" ? "ar-EG" : "en-US"
    ).format(num);
  } catch {
    return String(num);
  }
};

// === تحصين السؤال الحالي وخياراته ===
window.ensureQuestionSanity = function (q) {
  if (!q) return;
  q.type = q.type || "multiple-choice";
  q.reading = q.reading || { text: "", image: null, audio: null };
  q.question = q.question || { text: "", image: null };
  q.feedback = q.feedback || "";

  if (q.type === "multiple-choice") {
    q.options = q.options || [];
    for (let i = 0; i < 4; i++) {
      if (!q.options[i]) q.options[i] = { text: "", image: null };
    }
    q.correct =
      typeof q.correct === "number" && q.correct >= 0 && q.correct < 4
        ? q.correct
        : 0;
  } else if (q.type === "fill-in-the-blank" || q.type === "short-answer") {
    q.correctAnswer = q.correctAnswer || "";
  } else if (q.type === "true-false") {
    q.correctAnswer =
      typeof q.correctAnswer === "boolean" ? q.correctAnswer : true;
  } else if (q.type === "matching" || q.type === "connecting-lines") {
    if (Array.isArray(q.pairs)) {
      q.prompts = q.pairs.map(
        (pair) => pair.prompt || { text: "", image: null }
      );
      q.answers = q.pairs.map(
        (pair) => pair.answer || { text: "", image: null }
      );
    }
    q.prompts = (Array.isArray(q.prompts) ? q.prompts : []).map((p) =>
      typeof p === "object" && p !== null
        ? { text: p.text || "", image: p.image || null }
        : { text: String(p), image: null }
    );
    q.answers = (Array.isArray(q.answers) ? q.answers : []).map((a) =>
      typeof a === "object" && a !== null
        ? { text: a.text || "", image: a.image || null }
        : { text: String(a), image: null }
    );
  } else if (q.type === "ordering") {
    q.items = (Array.isArray(q.items) ? q.items : []).map((item) => {
      if (typeof item === "string") {
        return { text: item, image: null };
      }
      if (typeof item === "object" && item !== null) {
        return { text: item.text || "", image: item.image || null };
      }
      return { text: "", image: null };
    });
  }

  // حذف الخصائص القديمة أو غير الصالحة لضمان نظافة الكائن
  const validPropsMap = {
    "multiple-choice": [
      "type",
      "reading",
      "question",
      "options",
      "correct",
      "feedback",
    ],
    "fill-in-the-blank": [
      "type",
      "reading",
      "question",
      "correctAnswer",
      "feedback",
    ],
    "true-false": ["type", "reading", "question", "correctAnswer", "feedback"],
    "short-answer": [
      "type",
      "reading",
      "question",
      "correctAnswer",
      "feedback",
    ],
    matching: ["type", "reading", "question", "prompts", "answers", "feedback"],
    "connecting-lines": [
      "type",
      "reading",
      "question",
      "prompts",
      "answers",
      "feedback",
    ],
    ordering: ["type", "reading", "question", "items", "feedback"],
  };

  const validKeys = validPropsMap[q.type] || validPropsMap["multiple-choice"];

  Object.keys(q).forEach((key) => {
    if (!validKeys.includes(key)) {
      delete q[key];
    }
  });
};

window.getCurrentQuestionOrCreate = function () {
  if (!Array.isArray(state.questions)) state.questions = [];

  if (
    typeof state.currentQuestion !== "number" ||
    state.currentQuestion < 0 ||
    state.currentQuestion >= state.questions.length
  ) {
    const newQ = {
      type: "multiple-choice",
      reading: { text: "", image: null, audio: null },
      question: { text: "", image: null },
      options: [
        { text: "", image: null },
        { text: "", image: null },
        { text: "", image: null },
        { text: "", image: null },
      ],
      correct: 0,
    };
    state.questions.push(newQ);
    state.currentQuestion = state.questions.length - 1;
  }

  const q = state.questions[state.currentQuestion];
  window.ensureQuestionSanity(q);
  return q;
};

// السماح بالصوت ضمن التعقيم
window.sanitizeHTML = function (html) {
  if (!window.DOMPurify) return html || "";
  return DOMPurify.sanitize(html || "", {
    ADD_TAGS: [
      "a",
      "u",
      "mark",
      "blockquote",
      "hr",
      "pre",
      "code",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li",
      "img",
      "table",
      "thead",
      "tbody",
      "tr",
      "td",
      "th",
      "p",
      "span",
      "div",
      "br",
      "font", // السماح بوسم <font> الذي قد يستخدمه المتصفح للتلوين
      "sub",
      "sup",
      "strong",
      "em",
      "audio",
      "source",
    ],
    ALLOWED_ATTR: [
      "src",
      "alt",
      "style",
      "class",
      "rowspan",
      "colspan",
      "href",
      "target",
      "rel",
      "dir",
      "width",
      "height",
      "controls",
      "preload",
      "type",
      "color", // السماح بخاصية color لوسم <font>
      "size", // السماح بخاصية size لوسم <font>
    ],
    ALLOW_DATA_ATTR: false,
    FORBID_ATTR: ["onerror", "onclick"],
  });
};

window.plainToHTMLStrict = function (src) {
  if (!src || typeof src !== "string") return "";
  const ESC = (s) =>
    s.replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));
  const lines = src.split(/\r?\n/);
  const out = [];
  for (let raw of lines) {
    let s = raw.trim();
    if (!s) {
      out.push("<p>&nbsp;</p>");
      continue;
    }
    if (/^\/\/\/+$/.test(s)) {
      out.push("<hr>");
      continue;
    }
    s = ESC(s).replace(/(?:\s*\/\/\s*)+/g, "<br>");
    const m = s.match(
      /^(\*+|[\-\u2212\u2013\u2014]|[\(\[]?[0-9٠-٩]+[\)\.\-:]|[IVXLC]+[\)\.\:])\s+(.*)$/i
    );
    if (m) s = `<span class="lead-in">${m[1]}</span> ${m[2]}`;
    out.push(`<p>${s}</p>`);
  }
  if (!out.length) out.push("<p>&nbsp;</p>");
  return out.join("");
};

const EASTERN = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
window.convertNumeralsInText = function (text) {
  if (!text || typeof text !== "string") return text;
  return state.numeralType === "eastern"
    ? text.replace(/\d/g, (d) => EASTERN[d])
    : text.replace(/[٠-٩]/g, (d) => EASTERN.indexOf(d));
};

window.formatQuizContent = function (html) {
  if (!html || typeof html !== "string") return "";
  const looksHTML = /<\/?[a-z][\s\S]*>/i.test(html);
  const rendered = looksHTML ? html : window.plainToHTMLStrict(html);
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = rendered;
  (function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      node.nodeValue = window.convertNumeralsInText(node.nodeValue);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
    }
  })(tempDiv);
  return window.sanitizeHTML(tempDiv.innerHTML);
};

window.formatHeader = function (input) {
  if (!input || typeof input !== "string") return "";
  const looksHTML = /<\/?[a-z][\s\S]*>/i.test(input);
  if (looksHTML) return window.sanitizeHTML(input);
  let s = input.replace(/(?:\s*\/\/\s*)+/g, "<br>");
  return window.sanitizeHTML(s);
};

window.formatSubheader = function (input) {
  if (!input || typeof input !== "string") return "";
  const looksHTML = /<\/?[a-z][\s\S]*>/i.test(input);
  if (looksHTML) return window.sanitizeHTML(input);
  const out = input
    .split(/\r?\n/)
    .map((line) =>
      /^\/\/\/+$/.test(line.trim())
        ? "<hr>"
        : line.replace(/(?:\s*\/\/\s*)+/g, "<br>")
    )
    .join("<br>");
  return window.sanitizeHTML(out);
};

window.applyNumeralTypeToPage = function () {
  const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT"]);
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE)
      node.nodeValue = window.convertNumeralsInText(node.nodeValue);
    else if (node.nodeType === Node.ELEMENT_NODE && !SKIP.has(node.tagName)) {
      for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
    }
  }
  const targets = [
    document.body,
    document.getElementById("readingText"),
    document.getElementById("question"),
    document.getElementById("options"),
    document.getElementById("scoreBoard"),
    document.getElementById("quizTitle"),
    document.getElementById("instructions"),
    document.getElementById("quizFooter"),
    document.getElementById("teacherFooter"),
  ];
  targets.forEach((el) => {
    if (el) walk(el);
  });
  const fs = document.getElementById("finalScore");
  const tq = document.getElementById("totalQuestions");
  if (fs) fs.textContent = window.convertNumeralsInText(fs.textContent);
  if (tq) tq.textContent = window.convertNumeralsInText(tq.textContent);
};

window.persist = function () {
  try {
    const payload = {
      currentQuestion: state.currentQuestion,
      score: state.score,
      timeLeft: state.timeLeft,
      questionTime: state.questionTime,
      answeredQuestions: state.answeredQuestions,
      lastWrong: state.lastWrong,
      numeralType: state.numeralType,
      shuffledMaps: state.shuffledMaps,
      questions: state.questions,
      optionsLayout: state.optionsLayout,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {}
};

window.restore = function () {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    [
      "currentQuestion",
      "score",
      "timeLeft",
      "questionTime",
      "numeralType",
      "optionsLayout",
    ].forEach((k) => {
      if (p[k] !== undefined) state[k] = p[k];
    });
    if (Array.isArray(p.answeredQuestions))
      state.answeredQuestions = p.answeredQuestions;
    if (Array.isArray(p.lastWrong)) state.lastWrong = p.lastWrong;
    if (Array.isArray(p.shuffledMaps)) state.shuffledMaps = p.shuffledMaps;
    if (Array.isArray(p.questions) && p.questions.length)
      state.questions = p.questions.map((q) => {
        window.ensureQuestionSanity(q);
        return q;
      });
  } catch {}
};

window.shuffleOptionsOnce = function (qIndex) {
  if (state.shuffledMaps[qIndex]) return state.shuffledMaps[qIndex];
  const q = state.questions[qIndex];
  if (q.type !== "multiple-choice") return [];
  const map = (q.options || []).map((_, i) => i);
  for (let i = map.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [map[i], map[j]] = [map[j], map[i]];
  }
  state.shuffledMaps[qIndex] = map;
  return map;
};

window.startTimer = function () {
  clearInterval(state.timerId);
  if (!Array.isArray(state.questions) || state.questions.length === 0) {
    state.timeLeft = 0;
    document.getElementById(
      "timer"
    ).textContent = `الوقت المتبقي: ${window.formatNumber(0)} ثانية`;
    return;
  }
  const endAt = Date.now() + state.timeLeft * 1000;
  state.timerId = setInterval(() => {
    if (state.isPaused) return;
    const remain = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    if (remain !== state.timeLeft) {
      state.timeLeft = remain;
      document.getElementById(
        "timer"
      ).textContent = `الوقت المتبقي: ${window.formatNumber(
        state.timeLeft
      )} ثانية`;
    }
    if (remain <= 0) {
      clearInterval(state.timerId);
      window.nextQuestion();
    }
  }, 200);
};

window.updateTimerDisplay = function () {
  document.getElementById(
    "timer"
  ).textContent = `الوقت المتبقي: ${window.formatNumber(state.timeLeft)} ثانية`;
};

window.updateQuestionCounter = function () {
  const total = state.questions.length;
  const current = total > 0 ? state.currentQuestion + 1 : 0;
  document.getElementById(
    "questionCounter"
  ).textContent = `السؤال ${window.formatNumber(
    current
  )} من ${window.formatNumber(total)}`;
};

window.updateScoreCounter = function () {
  const total = state.questions.length;
  document.getElementById(
    "scoreCounter"
  ).textContent = `النتيجة: ${window.formatNumber(
    state.score
  )} من ${window.formatNumber(total)}`;
};

window.init = function (skipRestore = false) {
  if (!skipRestore) window.restore();
  document
    .querySelectorAll("#numeralType")
    .forEach((s) => (s.value = state.numeralType));
  document.getElementById("questionTime").value = state.questionTime;
  document.getElementById("quizTitle").innerHTML = window.formatHeader(
    quizConfig.title
  );
  document.getElementById("instructions").innerHTML = window.formatSubheader(
    quizConfig.instructions
  );

  const logoEl = document.getElementById("quizLogo");
  if (logoEl) {
    logoEl.src = quizConfig.logo || "";
    logoEl.alt = quizConfig.logoAlt || "شعار";
    logoEl.style.display = quizConfig.logo ? "block" : "none";
  }

  if (state.questions.length === 0) {
    clearInterval(state.timerId);
    state.isPaused = false;
    state.timeLeft = 0;
    const reading = document.getElementById("readingText");
    if (reading) reading.style.display = "none";
    const qEl = document.getElementById("question");
    if (qEl) qEl.innerHTML = "";
    const opts = document.getElementById("options");
    if (opts) opts.innerHTML = "";
    const prog = document.getElementById("progress");
    if (prog) prog.style.width = "0%";
    window.updateQuestionCounter();
    window.updateTimerDisplay();
    window.updateScoreCounter();
    return;
  }

  if (
    !Array.isArray(state.answeredQuestions) ||
    state.answeredQuestions.length !== state.questions.length
  ) {
    state.answeredQuestions = new Array(state.questions.length).fill(null);
    state.lastWrong = new Array(state.questions.length).fill(null);
  }
  window.showQuestion();
};

window.canApplyChosenLayout = function (layout, optionCount) {
  if (layout === "4x1")
    return optionCount === 4 && window.matchMedia("(min-width: 769px)").matches;
  return false;
};
window.applyLayoutSafely = function (optionCount) {
  const el = document.getElementById("options");
  if (!el) return;
  if (window.canApplyChosenLayout(state.optionsLayout, optionCount))
    el.dataset.layout = "4x1";
  else delete el.dataset.layout;
};

// For matching/ordering question drag-and-drop
let draggedItem = null;
let orderingDraggedItem = null;

function getDragAfterElement(container, y) {
  const draggableElements = [
    ...container.querySelectorAll(".ordering-item:not(.dragging)"),
  ];
  return draggableElements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    },
    { offset: Number.NEGATIVE_INFINITY }
  ).element;
}

window.showQuestion = function () {
  clearInterval(state.timerId);
  state.timerId = null;
  state.timeLeft = state.questionTime;

  if (connectState.observer) {
    connectState.observer.disconnect();
    connectState.observer = null;
  }
  const oldBtnContainer = document.querySelector(
    '.quiz-box > div[style*="text-align: center"]'
  );
  if (oldBtnContainer) oldBtnContainer.remove();

  const readingTextElement = document.getElementById("readingText");
  const questionElement = document.getElementById("question");
  const optionsElement = document.getElementById("options");
  const controls = document.querySelector(".quiz-box .controls");

  // إزالة صندوق التغذية الراجعة السابق إن وجد
  const existingFeedbackBox = document.querySelector(".feedback-box");
  if (existingFeedbackBox) existingFeedbackBox.remove();

  const q = window.getCurrentQuestionOrCreate();
  const wasAnswered = state.answeredQuestions[state.currentQuestion] !== null;

  // عرض التغذية الراجعة إذا تمت الإجابة على السؤال
  if (wasAnswered && q.feedback && q.feedback.trim() !== "") {
    const isCorrect = state.answeredQuestions[state.currentQuestion];
    const feedbackBox = document.createElement("div");
    feedbackBox.className = "feedback-box";
    feedbackBox.classList.add(isCorrect ? "correct" : "wrong");
    feedbackBox.innerHTML = window.formatQuizContent(q.feedback);
    document
      .querySelector(".quiz-box")
      .insertBefore(feedbackBox, document.querySelector(".quiz-box .controls"));
  }

  if (!Array.isArray(state.questions) || state.questions.length === 0) {
    if (readingTextElement) readingTextElement.style.display = "none";
    if (questionElement) questionElement.innerHTML = "";
    if (optionsElement) optionsElement.innerHTML = "";
    const progressEl = document.getElementById("progress");
    if (progressEl) progressEl.style.width = "0%";
    window.updateQuestionCounter();
    window.updateScoreCounter();
    window.updateTimerDisplay();
    const qb = document.querySelector(".quiz-box");
    const sb = document.getElementById("scoreBoard");
    const cb = document.getElementById("countersBox");
    if (qb) qb.style.display = "block";
    if (sb) sb.style.display = "none";
    if (cb) cb.style.display = "flex";
    const prev = document.getElementById("prevBtn");
    const next = document.getElementById("nextBtn");
    if (prev) prev.disabled = true;
    if (next) next.disabled = true;
    const pause = document.getElementById("pauseBtn");
    if (pause) {
      pause.textContent = "إيقاف مؤقت";
      pause.style.background = "#ffc107";
      pause.style.color = "#000";
    }
    state.isPaused = false;
    return;
  }

  if (state.currentQuestion >= state.questions.length) {
    window.showResult();
    return;
  }

  readingTextElement.innerHTML = "";
  if (q.reading && (q.reading.text || q.reading.image || q.reading.audio)) {
    readingTextElement.style.display = "block";
    if (q.reading.text) {
      const d = document.createElement("div");
      d.className = "reading-text-content";
      d.innerHTML = window.formatQuizContent(q.reading.text);
      readingTextElement.appendChild(d);
    }
    if (q.reading.audio) {
      const aud = document.createElement("audio");
      aud.controls = true;
      aud.preload = "none";
      aud.src = q.reading.audio;
      aud.style.width = "100%";
      aud.style.margin = "8px 0";
      readingTextElement.appendChild(aud);
    }
    if (q.reading.image) {
      const img = document.createElement("img");
      img.src = q.reading.image;
      img.className = "reading-text-image";
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = "صورة للنص القرائي";
      readingTextElement.appendChild(img);
    }
  } else {
    readingTextElement.style.display = "none";
  }

  questionElement.innerHTML = "";
  const questionContent = document.createElement("div");
  questionContent.className = "question-content";
  if (q.question?.text) {
    const d = document.createElement("div");
    d.className = "question-text";
    d.innerHTML = window.formatQuizContent(q.question.text);
    questionContent.appendChild(d);
  }
  if (q.question?.image) {
    const i = document.createElement("img");
    i.src = q.question.image;
    i.className = "question-image";
    i.loading = "lazy";
    i.decoding = "async";
    i.alt = "صورة للسؤال";
    questionContent.appendChild(i);
  }
  questionElement.appendChild(questionContent);

  optionsElement.innerHTML = "";
  optionsElement.className = "";
  optionsElement.removeAttribute("role");
  delete optionsElement.dataset.layout;

  if (controls) controls.style.display = "flex";

  if (q.type === "multiple-choice") {
    optionsElement.className = "options";
    optionsElement.setAttribute("role", "radiogroup");
    const map = window.shuffleOptionsOnce(state.currentQuestion);
    const valid = [];
    map.forEach((origIdx) => {
      const opt = q.options[origIdx];
      if (!opt || (!opt.text && !opt.image)) return;
      const wrap = document.createElement("div");
      wrap.className = "option";
      wrap.setAttribute("role", "radio");
      wrap.setAttribute("tabindex", "0");
      wrap.setAttribute("aria-checked", "false");
      const content = document.createElement("div");
      content.className = "option-content";
      if (opt.image) {
        const img = document.createElement("img");
        img.src = opt.image;
        img.className = "option-image";
        img.loading = "lazy";
        img.decoding = "async";
        img.alt = "صورة للخيار";
        content.appendChild(img);
      }
      if (opt.text) {
        const span = document.createElement("span");
        span.className = "option-text";
        span.innerHTML = window.formatQuizContent(opt.text);
        content.appendChild(span);
      }
      wrap.appendChild(content);
      if (state.answeredQuestions[state.currentQuestion] !== null) {
        wrap.setAttribute("aria-disabled", "true");
        if (origIdx === q.correct) wrap.classList.add("correct");
        if (
          state.answeredQuestions[state.currentQuestion] === false &&
          state.lastWrong[state.currentQuestion] === origIdx
        ) {
          wrap.classList.add("wrong");
        }
      } else {
        wrap.onclick = () => window.checkAnswer(origIdx);
        wrap.onkeydown = (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            window.checkAnswer(origIdx);
          }
        };
      }
      valid.push(wrap);
    });
    window.applyLayoutSafely(valid.length);
    valid.forEach((v) => optionsElement.appendChild(v));
  } else if (q.type === "fill-in-the-blank") {
    const container = document.createElement("form");
    container.className = "fill-in-blank-container";
    container.onsubmit = (e) => {
      e.preventDefault();
      window.checkAnswer(input.value);
    };
    const input = document.createElement("input");
    input.type = "text";
    input.className = "fill-in-blank-input";
    input.placeholder = "اكتب إجابتك هنا";
    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.textContent = "تأكيد الإجابة";
    submitBtn.className = "nav-btn";
    container.appendChild(input);
    container.appendChild(submitBtn);
    optionsElement.appendChild(container);
    if (state.answeredQuestions[state.currentQuestion] !== null) {
      input.value = state.lastWrong[state.currentQuestion] || "";
      input.disabled = true;
      submitBtn.style.display = "none";
      input.classList.add(
        state.answeredQuestions[state.currentQuestion] ? "correct" : "wrong"
      );
      if (!state.answeredQuestions[state.currentQuestion]) {
        const correctAnswerDisplay = document.createElement("div");
        correctAnswerDisplay.className = "correct-answer-display";
        correctAnswerDisplay.textContent = `الإجابة الصحيحة: ${
          q.correctAnswer.split("|")[0]
        }`;
        container.appendChild(correctAnswerDisplay);
      }
    }
  } else if (q.type === "true-false") {
    optionsElement.className = "options options-two";
    const wasAnswered = state.answeredQuestions[state.currentQuestion] !== null;
    const trueBtn = document.createElement("div");
    trueBtn.className = "option";
    trueBtn.textContent = "صح";
    if (!wasAnswered) {
      trueBtn.onclick = () => window.checkAnswer(true);
    } else {
      trueBtn.setAttribute("aria-disabled", "true");
      if (q.correctAnswer === true) trueBtn.classList.add("correct");
      if (
        state.lastWrong[state.currentQuestion] === true &&
        q.correctAnswer === false
      )
        trueBtn.classList.add("wrong");
    }
    const falseBtn = document.createElement("div");
    falseBtn.className = "option";
    falseBtn.textContent = "خطأ";
    if (!wasAnswered) {
      falseBtn.onclick = () => window.checkAnswer(false);
    } else {
      falseBtn.setAttribute("aria-disabled", "true");
      if (q.correctAnswer === false) falseBtn.classList.add("correct");
      if (
        state.lastWrong[state.currentQuestion] === false &&
        q.correctAnswer === true
      )
        falseBtn.classList.add("wrong");
    }
    optionsElement.appendChild(trueBtn);
    optionsElement.appendChild(falseBtn);
  } else if (q.type === "short-answer") {
    const container = document.createElement("form");
    container.className = "short-answer-container";
    container.onsubmit = (e) => {
      e.preventDefault();
      window.checkAnswer(textarea.value);
    };
    const textarea = document.createElement("textarea");
    textarea.className = "short-answer-textarea";
    textarea.placeholder = "اكتب إجابتك هنا...";
    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.textContent = "تأكيد الإجابة";
    submitBtn.className = "nav-btn";
    container.appendChild(textarea);
    container.appendChild(submitBtn);
    optionsElement.appendChild(container);

    if (state.answeredQuestions[state.currentQuestion] !== null) {
      textarea.value = state.lastWrong[state.currentQuestion] || "";
      textarea.disabled = true;
      submitBtn.style.display = "none";
      textarea.classList.add(
        state.answeredQuestions[state.currentQuestion] ? "correct" : "wrong"
      );
      if (!state.answeredQuestions[state.currentQuestion]) {
        const correctAnswerDisplay = document.createElement("div");
        correctAnswerDisplay.className = "correct-answer-display";
        const firstCorrectAnswer = (q.correctAnswer || "").split("|")[0].trim();
        correctAnswerDisplay.textContent = `إحدى الإجابات النموذجية: ${firstCorrectAnswer}`;
        container.appendChild(correctAnswerDisplay);
      }
    }
  } else if (q.type === "matching") {
    const createMatchingContent = (contentData) => {
      const fragment = document.createDocumentFragment();
      const contentContainer = document.createElement("div");
      contentContainer.className = "option-content"; // Reusing style

      if (contentData && contentData.image) {
        const img = document.createElement("img");
        img.src = contentData.image;
        img.style.maxHeight = "80px";
        img.style.objectFit = "contain";
        img.alt = "صورة عنصر المطابقة";
        contentContainer.appendChild(img);
      }
      if (contentData && contentData.text) {
        const textEl = document.createElement("span");
        textEl.innerHTML = window.formatQuizContent(contentData.text);
        contentContainer.appendChild(textEl);
      }
      fragment.appendChild(contentContainer);
      return fragment;
    };

    const container = document.createElement("div");
    container.className = "matching-container";

    const promptsColumn = document.createElement("div");
    promptsColumn.className = "matching-column";
    const answersColumn = document.createElement("div");
    answersColumn.className = "matching-column";

    const shuffledAnswers = (q.answers || [])
      .map((answerContent, index) => ({
        content: answerContent,
        originalIndex: index,
      }))
      .sort(() => Math.random() - 0.5);

    (q.prompts || []).forEach((promptContent, index) => {
      const promptItem = document.createElement("div");
      promptItem.className = "matching-prompt-item";

      const promptDisplay = document.createElement("div");
      promptDisplay.className = "prompt-text";
      promptDisplay.appendChild(createMatchingContent(promptContent));
      promptItem.appendChild(promptDisplay);

      const dropZone = document.createElement("div");
      dropZone.className = "drop-zone";
      dropZone.dataset.index = index;
      promptItem.appendChild(dropZone);
      promptsColumn.appendChild(promptItem);

      if (state.answeredQuestions[state.currentQuestion] === null) {
        dropZone.addEventListener("dragover", (e) => {
          e.preventDefault();
          dropZone.classList.add("over");
        });
        dropZone.addEventListener("dragleave", () =>
          dropZone.classList.remove("over")
        );
        dropZone.addEventListener("drop", (e) => {
          e.preventDefault();
          dropZone.classList.remove("over");
          if (
            draggedItem &&
            (dropZone.children.length === 0 || e.target === dropZone)
          ) {
            if (dropZone.firstChild) {
              answersColumn.appendChild(dropZone.firstChild);
            }
            dropZone.appendChild(draggedItem);
            draggedItem = null;
          }
        });
      }
    });

    shuffledAnswers.forEach((answerData) => {
      const answerItem = document.createElement("div");
      answerItem.className = "answer-item";
      answerItem.draggable = true;
      answerItem.dataset.originalIndex = answerData.originalIndex;
      answerItem.appendChild(createMatchingContent(answerData.content));
      answersColumn.appendChild(answerItem);

      if (state.answeredQuestions[state.currentQuestion] === null) {
        answerItem.addEventListener("dragstart", () => {
          draggedItem = answerItem;
          setTimeout(() => answerItem.classList.add("dragging"), 0);
        });
        answerItem.addEventListener("dragend", () =>
          answerItem.classList.remove("dragging")
        );
      }
    });

    container.appendChild(promptsColumn);
    container.appendChild(answersColumn);
    optionsElement.appendChild(container);

    if (state.answeredQuestions[state.currentQuestion] === null) {
      const btnContainer = document.createElement("div");
      btnContainer.style.textAlign = "center";
      const submitBtn = document.createElement("button");
      submitBtn.textContent = "تأكيد الإجابة";
      submitBtn.className = "nav-btn";
      submitBtn.style.marginTop = "20px";
      submitBtn.onclick = () => window.checkAnswer(null);
      btnContainer.appendChild(submitBtn);
      optionsElement.appendChild(btnContainer);
    } else {
      // Re-construct the answered state
      promptsColumn.querySelectorAll(".drop-zone").forEach((dz) => {
        dz.innerHTML = ""; // Clear first
        const promptIndex = parseInt(dz.dataset.index, 10);
        const userAnswers = state.lastWrong[state.currentQuestion];
        const userAnswerIndex = Array.isArray(userAnswers)
          ? userAnswers[promptIndex]
          : null;

        if (userAnswerIndex !== null && userAnswerIndex !== undefined) {
          const answerContent = q.answers[userAnswerIndex];
          const answerItem = document.createElement("div");
          answerItem.className = "answer-item";
          answerItem.appendChild(createMatchingContent(answerContent));
          dz.appendChild(answerItem);
        }

        if (userAnswerIndex === promptIndex) {
          dz.classList.add("correct");
        } else {
          dz.classList.add("wrong");
        }
      });
      answersColumn.style.display = "none"; // Hide the source answers
    }
  } else if (q.type === "ordering") {
    const container = document.createElement("div");
    container.className = "ordering-container";

    const createOrderingItemContent = (itemData) => {
      const fragment = document.createDocumentFragment();
      if (itemData && itemData.image) {
        const img = document.createElement("img");
        img.src = itemData.image;
        img.style.maxHeight = "50px";
        img.style.maxWidth = "80px";
        img.style.objectFit = "contain";
        img.alt = ""; // Decorative
        img.style.pointerEvents = "none"; // Prevent image drag interference
        fragment.appendChild(img);
      }
      if (itemData && itemData.text) {
        const textEl = document.createElement("span");
        textEl.innerHTML = window.formatQuizContent(itemData.text);
        fragment.appendChild(textEl);
      }
      return fragment;
    };

    const wasAnswered = state.answeredQuestions[state.currentQuestion] !== null;

    if (wasAnswered) {
      const userOrderIndices = state.lastWrong[state.currentQuestion] || [];
      const originalItems = q.items || [];
      userOrderIndices.forEach((originalIndex) => {
        const itemData = originalItems[originalIndex];
        if (itemData) {
          const itemEl = document.createElement("div");
          itemEl.className = "ordering-item";
          itemEl.draggable = false;
          itemEl.appendChild(createOrderingItemContent(itemData));
          container.appendChild(itemEl);
        }
      });

      if (state.answeredQuestions[state.currentQuestion]) {
        container.classList.add("correct");
      } else {
        container.classList.add("wrong");
        const correctOrderDisplay = document.createElement("div");
        correctOrderDisplay.className = "correct-order-display";
        let listHTML = "<strong>الترتيب الصحيح:</strong><ol>";
        (q.items || []).forEach((item) => {
          let itemContent = "";
          if (item.image) {
            itemContent += `<img src="${item.image}" style="max-height: 40px; vertical-align: middle; margin-left: 8px; border-radius: 4px;">`;
          }
          if (item.text) {
            itemContent += `<span>${window.sanitizeHTML(item.text)}</span>`;
          }
          listHTML += `<li style="display: flex; align-items: center; margin-bottom: 5px;">${itemContent}</li>`;
        });
        listHTML += "</ol>";
        correctOrderDisplay.innerHTML = listHTML;
        optionsElement.appendChild(correctOrderDisplay);
      }
    } else {
      const shuffledItems = (q.items || [])
        .map((item, index) => ({ item, originalIndex: index }))
        .sort(() => Math.random() - 0.5);

      shuffledItems.forEach(({ item, originalIndex }) => {
        const itemEl = document.createElement("div");
        itemEl.className = "ordering-item";
        itemEl.draggable = true;
        itemEl.dataset.originalIndex = originalIndex;
        itemEl.appendChild(createOrderingItemContent(item));
        container.appendChild(itemEl);
      });

      const items = container.querySelectorAll(".ordering-item");
      items.forEach((item) => {
        item.addEventListener("dragstart", () => {
          orderingDraggedItem = item;
          setTimeout(() => item.classList.add("dragging"), 0);
        });
        item.addEventListener("dragend", () => {
          item.classList.remove("dragging");
        });
      });

      container.addEventListener("dragover", (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(container, e.clientY);
        if (afterElement == null) {
          container.appendChild(orderingDraggedItem);
        } else {
          container.insertBefore(orderingDraggedItem, afterElement);
        }
      });

      const btnContainer = document.createElement("div");
      btnContainer.style.textAlign = "center";
      const submitBtn = document.createElement("button");
      submitBtn.textContent = "تأكيد الإجابة";
      submitBtn.className = "nav-btn";
      submitBtn.style.marginTop = "20px";
      submitBtn.onclick = () => window.checkAnswer(null);
      btnContainer.appendChild(submitBtn);
      optionsElement.appendChild(btnContainer);
    }
    optionsElement.prepend(container);
  } else if (q.type === "connecting-lines") {
    window.renderConnectingLines(q, optionsElement);
  }

  const progressEl = document.getElementById("progress");
  if (progressEl) {
    const total = Array.isArray(state.questions) ? state.questions.length : 0;
    const pct = total > 0 ? (state.currentQuestion / total) * 100 : 0;
    progressEl.style.width = pct + "%";
  }

  document.getElementById("prevBtn").disabled = state.currentQuestion === 0;
  document.getElementById("nextBtn").disabled = false;

  window.updateQuestionCounter();
  window.updateScoreCounter();
  window.updateTimerDisplay();
  startTimer();
  window.persist();
};

window.renderConnectingLines = function (q, optionsElement) {
  optionsElement.className = "connecting-lines-container";
  connectState = { from: null, connections: [], canvas: null, observer: null };

  const createItemContent = (contentData) => {
    const content = document.createElement("div");
    content.className = "option-content";
    if (contentData.image) {
      const img = document.createElement("img");
      img.src = contentData.image;
      img.style.maxHeight = "60px";
      content.appendChild(img);
    }
    if (contentData.text) {
      const span = document.createElement("span");
      span.innerHTML = window.formatQuizContent(contentData.text);
      content.appendChild(span);
    }
    return content;
  };

  const promptCol = document.createElement("div");
  promptCol.className = "connecting-lines-column";
  const answerCol = document.createElement("div");
  answerCol.className = "connecting-lines-column";

  const validPrompts = (q.prompts || []).filter((p) => p.text || p.image);
  const validAnswers = (q.answers || []).filter((a) => a.text || a.image);

  const shuffledAnswers = validAnswers
    .map((a, i) => ({ content: a, originalIndex: i }))
    .sort(() => 0.5 - Math.random());

  validPrompts.forEach((prompt, index) => {
    const item = document.createElement("div");
    item.className = "connect-item";
    item.dataset.side = "prompt";
    item.dataset.index = index;
    item.appendChild(createItemContent(prompt));
    promptCol.appendChild(item);
  });

  shuffledAnswers.forEach(({ content, originalIndex }) => {
    const item = document.createElement("div");
    item.className = "connect-item";
    item.dataset.side = "answer";
    item.dataset.index = originalIndex;
    item.appendChild(createItemContent(content));
    answerCol.appendChild(item);
  });

  connectState.canvas = document.createElement("canvas");
  connectState.canvas.id = "connectingLinesCanvas";

  optionsElement.appendChild(promptCol);
  optionsElement.appendChild(answerCol);
  optionsElement.appendChild(connectState.canvas);

  const wasAnswered = state.answeredQuestions[state.currentQuestion] !== null;

  if (wasAnswered) {
    connectState.connections = state.lastWrong[state.currentQuestion] || [];
    document
      .querySelectorAll(".connect-item")
      .forEach((el) => (el.style.pointerEvents = "none"));

    // Add feedback classes to items when re-rendering an answered question
    connectState.connections.forEach((conn) => {
      const isCorrect = conn.promptIndex === conn.answerIndex;
      const fromEl = document.querySelector(
        `.connect-item[data-side="prompt"][data-index="${conn.promptIndex}"]`
      );
      const toEl = document.querySelector(
        `.connect-item[data-side="answer"][data-index="${conn.answerIndex}"]`
      );
      if (fromEl && toEl) {
        fromEl.classList.add(isCorrect ? "connect-correct" : "connect-wrong");
        toEl.classList.add(isCorrect ? "connect-correct" : "connect-wrong");
      }
    });

    setTimeout(() => window.drawConnectingLines(true), 100);
  } else {
    document.querySelectorAll(".connect-item").forEach((item) => {
      item.addEventListener("click", () => {
        if (item.dataset.connected === "true") return;

        const side = item.dataset.side;
        const index = parseInt(item.dataset.index, 10);

        if (connectState.from && connectState.from.side !== side) {
          const promptIndex =
            side === "prompt" ? index : connectState.from.index;
          const answerIndex =
            side === "answer" ? index : connectState.from.index;

          connectState.connections = connectState.connections.filter(
            (c) =>
              c.promptIndex !== promptIndex && c.answerIndex !== answerIndex
          );
          connectState.connections.push({ promptIndex, answerIndex });

          document
            .querySelectorAll(".connect-item.selected")
            .forEach((el) => el.classList.remove("selected"));
          document.querySelector(
            `.connect-item[data-side="prompt"][data-index="${promptIndex}"]`
          ).dataset.connected = "true";
          document.querySelector(
            `.connect-item[data-side="answer"][data-index="${answerIndex}"]`
          ).dataset.connected = "true";

          connectState.from = null;
        } else {
          document
            .querySelectorAll(".connect-item.selected")
            .forEach((el) => el.classList.remove("selected"));
          item.classList.add("selected");
          connectState.from = { side, index };
        }
        window.drawConnectingLines();
      });
    });
    const btnContainer = document.createElement("div");
    btnContainer.style.textAlign = "center";
    btnContainer.style.width = "100%";
    btnContainer.style.marginTop = "20px";
    const submitBtn = document.createElement("button");
    submitBtn.textContent = "تأكيد الإجابة";
    submitBtn.className = "nav-btn";
    submitBtn.onclick = () => window.checkAnswer(null);
    btnContainer.appendChild(submitBtn);
    optionsElement.parentElement.appendChild(btnContainer);
  }

  connectState.observer = new ResizeObserver(() =>
    window.drawConnectingLines(wasAnswered)
  );
  connectState.observer.observe(optionsElement);
};

window.drawConnectingLines = function (showFeedback = false) {
  if (!connectState.canvas) return;
  const ctx = connectState.canvas.getContext("2d");
  const containerRect =
    connectState.canvas.parentElement.getBoundingClientRect();

  connectState.canvas.width = containerRect.width;
  connectState.canvas.height = containerRect.height;
  ctx.clearRect(0, 0, connectState.canvas.width, connectState.canvas.height);

  connectState.connections.forEach((conn) => {
    const fromEl = document.querySelector(
      `.connect-item[data-side="prompt"][data-index="${conn.promptIndex}"]`
    );
    const toEl = document.querySelector(
      `.connect-item[data-side="answer"][data-index="${conn.answerIndex}"]`
    );

    if (!fromEl || !toEl) return;

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();

    const startX = fromRect.right - containerRect.left;
    const startY = fromRect.top + fromRect.height / 2 - containerRect.top;
    const endX = toRect.left - containerRect.left;
    const endY = toRect.top + toRect.height / 2 - containerRect.top;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.lineWidth = 3;

    if (showFeedback) {
      ctx.strokeStyle =
        conn.promptIndex === conn.answerIndex
          ? "var(--color-success)"
          : "var(--color-danger)";
    } else {
      ctx.strokeStyle = "var(--color-primary)";
    }
    ctx.stroke();
  });
};

window.checkShortAnswerSimilarity = function (userAnswer, modelAnswer) {
  if (!userAnswer || !modelAnswer) return false;
  const normalize = (str) =>
    str
      .trim()
      .toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_\\`~()؟]/g, "")
      .replace(/\s+/g, " ");
  const userWords = new Set(
    normalize(userAnswer)
      .split(" ")
      .filter((w) => w.length > 0)
  );
  const modelWords = new Set(
    normalize(modelAnswer)
      .split(" ")
      .filter((w) => w.length > 0)
  );
  if (modelWords.size === 0) return userWords.size === 0;
  let matchCount = 0;
  for (const word of userWords) {
    if (modelWords.has(word)) {
      matchCount++;
    }
  }
  const similarity = (matchCount / modelWords.size) * 100;
  return similarity >= 70;
};

window.checkAnswer = function (userAnswer) {
  if (state.answeredQuestions[state.currentQuestion] !== null) return;
  const q = window.getCurrentQuestionOrCreate();
  let isCorrect = false;

  if (q.type === "multiple-choice") {
    isCorrect = userAnswer === q.correct;
    state.lastWrong[state.currentQuestion] = userAnswer;
  } else if (q.type === "fill-in-the-blank") {
    const correctAnswers = q.correctAnswer
      .split("|")
      .map((a) => a.trim().toLowerCase());
    const userAnswerTrimmed = (userAnswer || "")
      .toString()
      .trim()
      .toLowerCase();
    isCorrect = correctAnswers.includes(userAnswerTrimmed);
    state.lastWrong[state.currentQuestion] = userAnswer;
  } else if (q.type === "true-false") {
    isCorrect = userAnswer === q.correctAnswer;
    state.lastWrong[state.currentQuestion] = userAnswer;
  } else if (q.type === "short-answer") {
    const possibleAnswers = (q.correctAnswer || "").split("|");
    isCorrect = possibleAnswers.some((answer) =>
      window.checkShortAnswerSimilarity(userAnswer, answer)
    );
    state.lastWrong[state.currentQuestion] = userAnswer;
  } else if (q.type === "matching") {
    const answersColumn = document.querySelector(".matching-column:last-child");

    if (answersColumn && answersColumn.children.length > 0) {
      alert("يرجى مطابقة جميع العناصر قبل تأكيد الإجابة.");
      return;
    }

    const dropZones = document.querySelectorAll(".drop-zone");
    let correctMatches = 0;
    const userAnswers = [];
    const validPrompts = (q.prompts || []).filter((p) => p.text || p.image);

    dropZones.forEach((zone, index) => {
      if (index >= validPrompts.length) return;
      const answerItem = zone.querySelector(".answer-item");
      const originalIndex = answerItem
        ? parseInt(answerItem.dataset.originalIndex, 10)
        : null;
      userAnswers[index] = originalIndex;

      if (originalIndex === index) {
        correctMatches++;
        zone.classList.add("correct");
      } else {
        zone.classList.add("wrong");
      }
      if (answerItem) answerItem.draggable = false;
    });

    isCorrect = correctMatches === validPrompts.length;
    state.lastWrong[state.currentQuestion] = userAnswers; // Save the user's arrangement
    document.querySelector("#options .nav-btn")?.parentElement.remove(); // Remove submit button container
  } else if (q.type === "ordering") {
    const container = document.querySelector(".ordering-container");
    const orderedItems = [...container.querySelectorAll(".ordering-item")];
    const userOrderIndices = orderedItems.map((item) =>
      parseInt(item.dataset.originalIndex, 10)
    );
    const correctOrderIndices = (q.items || []).map((_, index) => index);

    isCorrect =
      JSON.stringify(userOrderIndices) === JSON.stringify(correctOrderIndices);
    state.lastWrong[state.currentQuestion] = userOrderIndices;

    container.classList.add(isCorrect ? "correct" : "wrong");
    orderedItems.forEach((item) => (item.draggable = false));
    document.querySelector("#options .nav-btn")?.parentElement.remove();

    if (!isCorrect) {
      const correctOrderDisplay = document.createElement("div");
      correctOrderDisplay.className = "correct-order-display";
      let listHTML = "<strong>الترتيب الصحيح:</strong><ol>";
      (q.items || []).forEach((item) => {
        let itemContent = "";
        if (item.image) {
          itemContent += `<img src="${item.image}" style="max-height: 40px; vertical-align: middle; margin-left: 8px; border-radius: 4px;">`;
        }
        if (item.text) {
          itemContent += `<span>${window.sanitizeHTML(item.text)}</span>`;
        }
        listHTML += `<li style="display: flex; align-items: center; margin-bottom: 5px;">${itemContent}</li>`;
      });
      listHTML += "</ol>";
      correctOrderDisplay.innerHTML = listHTML;
      container.parentElement.appendChild(correctOrderDisplay);
    }
  } else if (q.type === "connecting-lines") {
    const validPrompts = (q.prompts || []).filter((p) => p.text || p.image);
    if (connectState.connections.length < validPrompts.length) {
      alert("يرجى توصيل جميع العناصر قبل تأكيد الإجابة.");
      return;
    }
    let correctCount = 0;
    connectState.connections.forEach((conn) => {
      if (conn.promptIndex === conn.answerIndex) {
        correctCount++;
      }
    });
    isCorrect = correctCount === validPrompts.length;
    state.lastWrong[state.currentQuestion] = connectState.connections;
    document
      .querySelector('.nav-btn[onclick="window.checkAnswer(null)"]')
      ?.parentElement.remove();
    document
      .querySelectorAll(".connect-item")
      .forEach((el) => (el.style.pointerEvents = "none"));

    // Add feedback classes to items
    connectState.connections.forEach((conn) => {
      const isCorrectConnection = conn.promptIndex === conn.answerIndex;
      const fromEl = document.querySelector(
        `.connect-item[data-side="prompt"][data-index="${conn.promptIndex}"]`
      );
      const toEl = document.querySelector(
        `.connect-item[data-side="answer"][data-index="${conn.answerIndex}"]`
      );
      if (fromEl && toEl) {
        fromEl.classList.add(
          isCorrectConnection ? "connect-correct" : "connect-wrong"
        );
        toEl.classList.add(
          isCorrectConnection ? "connect-correct" : "connect-wrong"
        );
      }
    });

    window.drawConnectingLines(true);
  }

  state.answeredQuestions[state.currentQuestion] = isCorrect;
  if (isCorrect) {
    state.score++;
  }

  window.updateScoreCounter();
  window.persist();

  if (
    q.type !== "matching" &&
    q.type !== "ordering" &&
    q.type !== "connecting-lines"
  ) {
    // This re-renders the question with feedback (correct/wrong)
    window.showQuestion();
  }

  // Auto-advance after a delay
  setTimeout(() => {
    if (state.currentQuestion < state.questions.length - 1) {
      window.nextQuestion();
    } else {
      window.showResult();
    }
  }, 2000);
};

window.nextQuestion = function () {
  if (!state.questions.length) return;
  if (state.currentQuestion >= state.questions.length - 1) {
    window.showResult();
    return;
  }
  state.currentQuestion++;
  window.showQuestion();
};

window.previousQuestion = function () {
  if (!state.questions.length) return;
  if (state.currentQuestion > 0) {
    state.currentQuestion--;
    window.showQuestion();
  }
};

window.restartQuiz = function () {
  state.currentQuestion = 0;
  state.score = 0;
  state.timeLeft = state.questionTime;
  state.answeredQuestions = new Array(state.questions.length).fill(null);
  state.lastWrong = new Array(state.questions.length).fill(null);

  const quizBox = document.querySelector(".quiz-box");
  if (quizBox) quizBox.style.display = "block";

  const scoreBoard = document.getElementById("scoreBoard");
  if (scoreBoard) scoreBoard.style.display = "none";

  const teacherButtons = document.getElementById("teacherButtons");
  if (teacherButtons) teacherButtons.style.display = "flex";

  const countersBox = document.getElementById("countersBox");
  if (countersBox) countersBox.style.display = "flex";

  const progress = document.getElementById("progress");
  if (progress) progress.style.width = "0%";

  document.querySelectorAll(".option").forEach((o) => {
    o.classList.remove("correct", "wrong");
    o.removeAttribute("aria-disabled");
  });
  window.showQuestion();
};

window.togglePause = function () {
  if (!Array.isArray(state.questions) || state.questions.length === 0) return;
  const b = document.getElementById("pauseBtn");
  if (!state.isPaused) {
    state.isPaused = true;
    clearInterval(state.timerId);
    if (b) {
      b.textContent = "استئناف";
      b.style.background = "#28a745";
      b.style.color = "#fff";
    }
    return;
  }
  state.isPaused = false;
  if (b) {
    b.textContent = "إيقاف مؤقت";
    b.style.background = "#ffc107";
    b.style.color = "#000";
  }
  window.startTimer();
};

window.toggleSettingsPanel = function () {
  const p = document.getElementById("settingsPanel");
  p.style.display = p.style.display === "block" ? "none" : "block";
  window.persist();
};

window.toggleConfigPanel = function () {
  const p = document.getElementById("configPanel");
  if (p.style.display === "block") {
    p.style.display = "none";
  } else {
    p.style.display = "block";
    document.getElementById("titleInput").value = quizConfig.title;
    document.getElementById("instructionsInput").value =
      quizConfig.instructions;
    const tf = document.getElementById("teacherFooter");
    document.getElementById("footerInput").value =
      (tf && tf.textContent.trim()) ||
      document.getElementById("quizFooter").textContent;
  }
};

window.saveConfig = function () {
  const newTitle = document.getElementById("titleInput").value?.trim();
  const newInstructions = document
    .getElementById("instructionsInput")
    .value?.trim();
  const newFooter = document.getElementById("footerInput").value?.trim();
  if (newTitle) {
    quizConfig.title = newTitle;
    document.getElementById("quizTitle").innerHTML =
      window.formatHeader(newTitle);
  }
  if (newInstructions) {
    quizConfig.instructions = newInstructions;
    document.getElementById("instructions").innerHTML =
      window.formatSubheader(newInstructions);
  }
  if (newFooter) {
    document.getElementById("teacherFooter").innerHTML =
      window.sanitizeHTML(newFooter);
  }
  window.toggleConfigPanel();
  window.persist();
};

window.changeNumeralType = function () {
  const selects = Array.from(document.querySelectorAll("#numeralType"));
  const visible =
    selects.find((s) => s && s.offsetParent !== null) || selects[0];
  if (visible) state.numeralType = visible.value || state.numeralType;
  window.updateQuestionCounter();
  window.updateScoreCounter();
  window.updateTimerDisplay();
  window.applyNumeralTypeToPage();
  window.persist();
  selects.forEach((s) => {
    if (s && s.value !== state.numeralType) s.value = state.numeralType;
  });
};

window.changeQuestionTime = function () {
  const v = parseInt(document.getElementById("questionTime").value, 10);
  if (v >= 5 && v <= 180) {
    state.questionTime = v;
    state.timeLeft = v;
    window.updateTimerDisplay();
    window.persist();
  }
};

window.changeOptionsLayout = function () {
  const sel = document.getElementById("optionsLayout");
  const val = (sel && sel.value) || "2x2";
  state.optionsLayout = val === "4x1" ? "4x1" : "2x2";
  window.persist();
  window.showQuestion();
};

window.cleanEasternNumerals = function () {
  if (!Array.isArray(state.questions)) return;
  function eastToLatin(t) {
    return (t || "").toString().replace(/[٠-٩]/g, (d) => EASTERN.indexOf(d));
  }
  state.questions.forEach((q) => {
    if (q.reading?.text) q.reading.text = eastToLatin(q.reading.text);
    if (q.question?.text) q.question.text = eastToLatin(q.question.text);
    if (q.type === "multiple-choice" && Array.isArray(q.options))
      q.options.forEach((o) => {
        if (o?.text) o.text = eastToLatin(o.text);
      });
  });
  alert("تم تحويل الأرقام الشرقية في الأسئلة بنجاح!");
  window.showQuestion();
  window.persist();
};

window.loadQuestionsFromFile = function () {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        if (!Array.isArray(data)) throw new Error("Invalid format");
        localStorage.removeItem(STORAGE_KEY);
        state.questions = JSON.parse(JSON.stringify(data));
        state.currentQuestion = 0;
        state.score = 0;
        state.timeLeft = state.questionTime;
        state.shuffledMaps = [];
        state.questions.forEach(window.ensureQuestionSanity);
        state.answeredQuestions = new Array(state.questions.length).fill(null);
        state.lastWrong = new Array(state.questions.length).fill(null);
        window.init(true);
        window.persist();
      } catch (err) {
        alert("تعذر قراءة ملف الأسئلة. تأكد من صحة الصيغة.");
        console.error(err);
      }
    };
    reader.readAsText(file);
  };
  input.click();
};

window.saveQuestionsToFile = function () {
  if (!Array.isArray(state.questions) || state.questions.length === 0) {
    alert("لا توجد أسئلة للحفظ!");
    return;
  }
  const dataStr = JSON.stringify(state.questions, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "quiz_questions.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
};

// ======== Edit Mode ========
window.toggleEditMode = function () {
  const editPanel = document.getElementById("editPanel");
  const quizBox = document.querySelector(".quiz-box");
  const countersBox = document.getElementById("countersBox");
  const readingText = document.getElementById("readingText");

  if (!Array.isArray(state.questions) || state.questions.length === 0) {
    window.addNewQuestion(true); // Add a new question without switching index
  }

  if (editPanel.style.display === "block") {
    editPanel.style.display = "none";
    quizBox.style.display = "block";
    countersBox.style.display = "flex";
    const q = window.getCurrentQuestionOrCreate();
    readingText.style.display =
      q && q.reading && (q.reading.text || q.reading.image || q.reading.audio)
        ? "block"
        : "none";
    window.startTimer();
    return;
  }

  clearInterval(state.timerId);
  editPanel.style.display = "block";
  quizBox.style.display = "none";
  countersBox.style.display = "none";
  readingText.style.display = "none";

  window.populateEditForm();
  window.attachEditPanelEvents();
};

window.populateEditForm = function () {
  const q = window.getCurrentQuestionOrCreate();
  if (!q) return;

  document.getElementById("editQuestionType").value =
    q.type || "multiple-choice";

  const mcEditor = document.getElementById("multipleChoiceEditor");
  const fibEditor = document.getElementById("fillInTheBlankEditor");
  const tfEditor = document.getElementById("trueFalseEditor");
  const saEditor = document.getElementById("shortAnswerEditor");
  const matchingEditor = document.getElementById("matchingEditor");
  const orderingEditor = document.getElementById("orderingEditor");
  const connectingLinesEditor = document.getElementById(
    "connectingLinesEditor"
  );

  mcEditor.style.display = "none";
  fibEditor.style.display = "none";
  tfEditor.style.display = "none";
  saEditor.style.display = "none";
  matchingEditor.style.display = "none";
  orderingEditor.style.display = "none";
  connectingLinesEditor.style.display = "none";

  if (q.type === "fill-in-the-blank") {
    fibEditor.style.display = "block";
    document.getElementById("editCorrectAnswer").value = q.correctAnswer || "";
  } else if (q.type === "true-false") {
    tfEditor.style.display = "block";
    const radios = document.querySelectorAll('input[name="correctTFAnswer"]');
    radios.forEach((radio) => {
      radio.checked = radio.value === String(q.correctAnswer);
    });
  } else if (q.type === "short-answer") {
    saEditor.style.display = "block";
    document.getElementById("editShortAnswer").value = q.correctAnswer || "";
  } else if (q.type === "matching") {
    matchingEditor.style.display = "block";
    renderDynamicPairs(
      "matchingPairsContainer",
      q.prompts || [],
      q.answers || []
    );
  } else if (q.type === "connecting-lines") {
    connectingLinesEditor.style.display = "block";
    renderDynamicPairs(
      "connectingPairsContainer",
      q.prompts || [],
      q.answers || []
    );
  } else if (q.type === "ordering") {
    orderingEditor.style.display = "block";
    renderDynamicOrderingItems(q.items || []);
  } else {
    // multiple-choice
    mcEditor.style.display = "block";
    renderDynamicMcOptions(q.options || [], q.correct || 0);
  }

  document.getElementById("editReadingText").innerHTML = q.reading?.text || "";
  const rPrev = document.getElementById("readingImagePreview");
  rPrev.src = q.reading?.image || "";
  rPrev.style.display = q.reading?.image ? "block" : "none";
  document.getElementById("editReadingImage").value = "";

  const aPrev = document.getElementById("readingAudioPreview");
  aPrev.src = q.reading?.audio || "";
  aPrev.style.display = q.reading?.audio ? "block" : "none";
  document.getElementById("editReadingAudio").value = "";

  document.getElementById("editQuestionText").innerHTML =
    q.question?.text || "";
  const qPrev = document.getElementById("questionImagePreview");
  qPrev.src = q.question?.image || "";
  qPrev.style.display = q.question?.image ? "block" : "none";
  document.getElementById("editQuestionImage").value = "";

  document.getElementById("editFeedback").innerHTML = q.feedback || "";
};

window.handleBinaryUpload = function (
  input,
  previewId,
  setter,
  isAudio = false
) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const data = e.target.result;
    const prevEl = document.getElementById(previewId);
    if (prevEl) {
      if (isAudio) {
        prevEl.src = data;
        prevEl.style.display = "block";
        prevEl.load && prevEl.load();
      } else {
        prevEl.src = data;
        prevEl.style.display = "block";
      }
    }
    try {
      setter(data);
      window.persist();
    } catch {}
  };
  reader.readAsDataURL(file);
};

window.pasteImageFromClipboard = async function (previewId, setter) {
  try {
    if (!navigator.clipboard || !navigator.clipboard.read) {
      alert(
        "متصفحك لا يدعم لصق الصور مباشرة. يرجى تحديث المتصفح أو استخدام خيار رفع الملفات."
      );
      return;
    }
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types?.find((t) => t.startsWith("image/"));
      if (!type) continue;
      const blob = await item.getType(type);
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target.result;
        const prevEl = document.getElementById(previewId);
        if (prevEl) {
          prevEl.src = base64;
          prevEl.style.display = "block";
        }
        try {
          setter(base64);
          window.persist();
        } catch {}
      };
      reader.readAsDataURL(blob);
      return;
    }
    alert("لا توجد صورة في الحافظة.");
  } catch (err) {
    console.error(err);
    alert("حدث خطأ أثناء جلب الصورة من الحافظة. يرجى المحاولة مجددًا.");
  }
};

window.clearMedia = function (previewId, inputId, setter, isAudio = false) {
  const prev = document.getElementById(previewId);
  if (prev) {
    if (isAudio) {
      prev.removeAttribute("src");
      prev.style.display = "none";
      prev.load && prev.load();
    } else {
      prev.src = "";
      prev.style.display = "none";
    }
  }
  if (inputId) {
    const inp = document.getElementById(inputId);
    if (inp) inp.value = "";
  }
  try {
    setter(null);
    window.persist();
  } catch {}
};

window.attachEditPanelEvents = function () {
  document.getElementById("editQuestionType").onchange = (e) => {
    const q = window.getCurrentQuestionOrCreate();
    const newType = e.target.value;
    if (newType === q.type) return;

    q.type = newType;
    window.ensureQuestionSanity(q);
    window.populateEditForm();
    window.persist();
  };

  function ensureOption(q, idx) {
    if (!q.options) q.options = [];
    if (!q.options[idx]) q.options[idx] = { text: "", image: null };
  }
  function ensureMatchItem(q, type, idx) {
    if (!q[type]) q[type] = [];
    if (!q[type][idx]) q[type][idx] = { text: "", image: null };
  }
  function ensureOrderItem(q, idx) {
    if (!q.items) q.items = [];
    while (q.items.length <= idx) {
      q.items.push({ text: "", image: null });
    }
  }

  const rImg = document.getElementById("editReadingImage");
  if (rImg)
    rImg.onchange = function () {
      const q = window.getCurrentQuestionOrCreate();
      window.handleBinaryUpload(this, "readingImagePreview", (base64) => {
        q.reading.image = base64;
      });
    };
  const rImgPaste = document.getElementById("readingImagePasteBtn");
  if (rImgPaste)
    rImgPaste.onclick = () => {
      const q = window.getCurrentQuestionOrCreate();
      window.pasteImageFromClipboard("readingImagePreview", (base64) => {
        q.reading.image = base64;
      });
    };
  const rImgClear = document.getElementById("readingImageClearBtn");
  if (rImgClear)
    rImgClear.onclick = () => {
      const q = window.getCurrentQuestionOrCreate();
      window.clearMedia("readingImagePreview", "editReadingImage", () => {
        q.reading.image = null;
      });
    };

  const qImg = document.getElementById("editQuestionImage");
  if (qImg)
    qImg.onchange = function () {
      const q = window.getCurrentQuestionOrCreate();
      window.handleBinaryUpload(this, "questionImagePreview", (base64) => {
        q.question.image = base64;
      });
    };
  const qPaste = document.getElementById("questionImagePasteBtn");
  if (qPaste)
    qPaste.onclick = () => {
      const q = window.getCurrentQuestionOrCreate();
      window.pasteImageFromClipboard("questionImagePreview", (base64) => {
        q.question.image = base64;
      });
    };
  const qClear = document.getElementById("questionImageClearBtn");
  if (qClear)
    qClear.onclick = () => {
      const q = window.getCurrentQuestionOrCreate();
      window.clearMedia("questionImagePreview", "editQuestionImage", () => {
        q.question.image = null;
      });
    };

  for (let i = 1; i <= 4; i++) {
    const optImg = document.getElementById("editOptionImage" + i);
    if (optImg)
      optImg.onchange = (function (ii) {
        return function () {
          const q = window.getCurrentQuestionOrCreate();
          ensureOption(q, ii - 1);
          window.handleBinaryUpload(
            this,
            "optionImagePreview" + ii,
            (base64) => {
              q.options[ii - 1].image = base64;
            }
          );
        };
      })(i);

    const optPaste = document.getElementById("optionImagePasteBtn" + i);
    if (optPaste)
      optPaste.onclick = (function (ii) {
        return function () {
          const q = window.getCurrentQuestionOrCreate();
          ensureOption(q, ii - 1);
          window.pasteImageFromClipboard(
            "optionImagePreview" + ii,
            (base64) => {
              q.options[ii - 1].image = base64;
            }
          );
        };
      })(i);

    const optClear = document.getElementById("optionImageClearBtn" + i);
    if (optClear)
      optClear.onclick = (function (ii) {
        return function () {
          const q = window.getCurrentQuestionOrCreate();
          ensureOption(q, ii - 1);
          window.clearMedia(
            "optionImagePreview" + ii,
            "editOptionImage" + ii,
            () => {
              q.options[ii - 1].image = null;
            }
          );
        };
      })(i);

    const corr = document.getElementById("correct" + i);
    if (corr)
      corr.onchange = (function (ii) {
        return function () {
          if (!this.checked) return;
          const q = window.getCurrentQuestionOrCreate();
          q.correct = ii - 1;
          window.persist();
        };
      })(i);
  }

  for (let i = 1; i <= 4; i++) {
    // Prompts
    const pImg = document.getElementById(`editMatchPromptImage${i}`);
    if (pImg)
      pImg.onchange = function () {
        const q = window.getCurrentQuestionOrCreate();
        ensureMatchItem(q, "prompts", i - 1);
        handleBinaryUpload(
          this,
          `matchPromptImagePreview${i}`,
          (b) => (q.prompts[i - 1].image = b)
        );
      };
    const pPaste = document.getElementById(`matchPromptImagePasteBtn${i}`);
    if (pPaste)
      pPaste.onclick = () => {
        const q = window.getCurrentQuestionOrCreate();
        ensureMatchItem(q, "prompts", i - 1);
        pasteImageFromClipboard(
          `matchPromptImagePreview${i}`,
          (b) => (q.prompts[i - 1].image = b)
        );
      };
    const pClear = document.getElementById(`matchPromptImageClearBtn${i}`);
    if (pClear)
      pClear.onclick = () => {
        const q = window.getCurrentQuestionOrCreate();
        ensureMatchItem(q, "prompts", i - 1);
        clearMedia(
          `matchPromptImagePreview${i}`,
          `editMatchPromptImage${i}`,
          () => (q.prompts[i - 1].image = null)
        );
      };
    // Answers
    const aImg = document.getElementById(`editMatchAnswerImage${i}`);
    if (aImg)
      aImg.onchange = function () {
        const q = window.getCurrentQuestionOrCreate();
        ensureMatchItem(q, "answers", i - 1);
        handleBinaryUpload(
          this,
          `matchAnswerImagePreview${i}`,
          (b) => (q.answers[i - 1].image = b)
        );
      };
    const aPaste = document.getElementById(`matchAnswerImagePasteBtn${i}`);
    if (aPaste)
      aPaste.onclick = () => {
        const q = window.getCurrentQuestionOrCreate();
        ensureMatchItem(q, "answers", i - 1);
        pasteImageFromClipboard(
          `matchAnswerImagePreview${i}`,
          (b) => (q.answers[i - 1].image = b)
        );
      };
    const aClear = document.getElementById(`matchAnswerImageClearBtn${i}`);
    if (aClear)
      aClear.onclick = () => {
        const q = window.getCurrentQuestionOrCreate();
        ensureMatchItem(q, "answers", i - 1);
        clearMedia(
          `matchAnswerImagePreview${i}`,
          `editMatchAnswerImage${i}`,
          () => (q.answers[i - 1].image = null)
        );
      };
  }

  // Connecting Lines Media Handlers
  for (let i = 1; i <= 4; i++) {
    // Prompts
    const pImg = document.getElementById(`editConnectPromptImage${i}`);
    if (pImg)
      pImg.onchange = function () {
        const q = window.getCurrentQuestionOrCreate();
        ensureMatchItem(q, "prompts", i - 1);
        handleBinaryUpload(
          this,
          `connectPromptImagePreview${i}`,
          (b) => (q.prompts[i - 1].image = b)
        );
      };
    const pPaste = document.getElementById(`connectPromptImagePasteBtn${i}`);
    if (pPaste)
      pPaste.onclick = () => {
        const q = window.getCurrentQuestionOrCreate();
        ensureMatchItem(q, "prompts", i - 1);
        pasteImageFromClipboard(
          `connectPromptImagePreview${i}`,
          (b) => (q.prompts[i - 1].image = b)
        );
      };
    const pClear = document.getElementById(`connectPromptImageClearBtn${i}`);
    if (pClear)
      pClear.onclick = () => {
        const q = window.getCurrentQuestionOrCreate();
        ensureMatchItem(q, "prompts", i - 1);
        clearMedia(
          `connectPromptImagePreview${i}`,
          `editConnectPromptImage${i}`,
          () => (q.prompts[i - 1].image = null)
        );
      };
    // Answers
    const aImg = document.getElementById(`editConnectAnswerImage${i}`);
    if (aImg)
      aImg.onchange = function () {
        const q = window.getCurrentQuestionOrCreate();
        ensureMatchItem(q, "answers", i - 1);
        handleBinaryUpload(
          this,
          `connectAnswerImagePreview${i}`,
          (b) => (q.answers[i - 1].image = b)
        );
      };
    const aPaste = document.getElementById(`connectAnswerImagePasteBtn${i}`);
    if (aPaste)
      aPaste.onclick = () => {
        const q = window.getCurrentQuestionOrCreate();
        ensureMatchItem(q, "answers", i - 1);
        pasteImageFromClipboard(
          `connectAnswerImagePreview${i}`,
          (b) => (q.answers[i - 1].image = b)
        );
      };
    const aClear = document.getElementById(`connectAnswerImageClearBtn${i}`);
    if (aClear)
      aClear.onclick = () => {
        const q = window.getCurrentQuestionOrCreate();
        ensureMatchItem(q, "answers", i - 1);
        clearMedia(
          `connectAnswerImagePreview${i}`,
          `editConnectAnswerImage${i}`,
          () => (q.answers[i - 1].image = null)
        );
      };
  }

  // Ordering Items Media Handlers
  for (let i = 1; i <= 5; i++) {
    const itemImgInput = document.getElementById(`editOrderItemImage${i}`);
    if (itemImgInput)
      itemImgInput.onchange = function () {
        const q = window.getCurrentQuestionOrCreate();
        ensureOrderItem(q, i - 1);
        handleBinaryUpload(this, `orderItemImagePreview${i}`, (data) => {
          q.items[i - 1].image = data;
        });
      };

    const itemPasteBtn = document.getElementById(`orderItemImagePasteBtn${i}`);
    if (itemPasteBtn)
      itemPasteBtn.onclick = function () {
        const q = window.getCurrentQuestionOrCreate();
        ensureOrderItem(q, i - 1);
        pasteImageFromClipboard(`orderItemImagePreview${i}`, (data) => {
          q.items[i - 1].image = data;
        });
      };

    const itemClearBtn = document.getElementById(`orderItemImageClearBtn${i}`);
    if (itemClearBtn)
      itemClearBtn.onclick = function () {
        const q = window.getCurrentQuestionOrCreate();
        ensureOrderItem(q, i - 1);
        clearMedia(
          `orderItemImagePreview${i}`,
          `editOrderItemImage${i}`,
          () => {
            q.items[i - 1].image = null;
          }
        );
      };
  }

  const rAudio = document.getElementById("editReadingAudio");
  if (rAudio)
    rAudio.onchange = function () {
      const q = window.getCurrentQuestionOrCreate();
      window.handleBinaryUpload(
        this,
        "readingAudioPreview",
        (base64) => {
          q.reading.audio = base64;
        },
        true
      );
    };
  const rAudioClear = document.getElementById("readingAudioClearBtn");
  if (rAudioClear)
    rAudioClear.onclick = () => {
      const q = window.getCurrentQuestionOrCreate();
      window.clearMedia(
        "readingAudioPreview",
        "editReadingAudio",
        () => {
          q.reading.audio = null;
        },
        true
      );
    };

  setupDragAndDrop(document.getElementById("multipleChoiceOptionsContainer"));
  setupDragAndDrop(document.getElementById("matchingPairsContainer"));
  setupDragAndDrop(document.getElementById("connectingPairsContainer"));
  setupDragAndDrop(document.getElementById("orderingItemsContainer"));

  document.getElementById("addMcOptionBtn").onclick = addDynamicMcOption;
  document.getElementById("addMatchPairBtn").onclick = () =>
    addDynamicPair("matching");
  document.getElementById("addConnectPairBtn").onclick = () =>
    addDynamicPair("connecting-lines");
  document.getElementById("addOrderItemBtn").onclick = addDynamicOrderItem;

  // Setup Rich Text Editor Toolbars
  document.querySelectorAll(".rte-toolbar").forEach((toolbar) => {
    toolbar.addEventListener("click", (e) => {
      const button = e.target.closest(".rte-btn");
      if (!button || button.type !== "button") return;
      const command = button.dataset.command;
      const allowedCommands = [
        "bold",
        "italic",
        "underline",
        "removeFormat",
        "justifyRight",
        "justifyCenter",
        "justifyLeft",
      ];
      if (!allowedCommands.includes(command)) return;
      if (command === "removeFormat") {
        document.execCommand(command, false, null);
        return;
      }

      const editorId = toolbar.dataset.target;
      const editor = document.getElementById(editorId);
      if (editor) editor.focus();
      document.execCommand(command, false, null);
    });
    toolbar
      .querySelector('input[type="color"]')
      ?.addEventListener("input", (e) => {
        document.execCommand("foreColor", false, e.target.value);
      });
    toolbar
      .querySelector('select[data-command="fontSize"]')
      ?.addEventListener("change", (e) => {
        const editorId = toolbar.dataset.target;
        const editor = document.getElementById(editorId);
        if (editor) editor.focus();
        if (e.target.value) {
          document.execCommand("fontSize", false, e.target.value);
        }
      });
    toolbar
      .querySelector('select[data-command="insertSymbol"]')
      ?.addEventListener("change", (e) => {
        if (e.target.value) {
          const editorId = toolbar.dataset.target;
          const editor = document.getElementById(editorId);
          if (editor) {
            editor.focus();
            document.execCommand("insertText", false, e.target.value);
          }
          // Reset select to allow inserting the same symbol again
          e.target.value = "";
        }
      });
  });
};

let draggedElement = null;

function setupDragAndDrop(container) {
  container.addEventListener("dragstart", (e) => {
    if (e.target.classList.contains("dynamic-item-card")) {
      draggedElement = e.target;
      setTimeout(() => e.target.classList.add("dragging"), 0);
    }
  });

  container.addEventListener("dragend", (e) => {
    if (draggedElement) {
      draggedElement.classList.remove("dragging");
      draggedElement = null;
    }
  });

  container.addEventListener("dragover", (e) => {
    e.preventDefault();
    const target = e.target.closest(".dynamic-item-card");
    if (target && target !== draggedElement) {
      const rect = target.getBoundingClientRect();
      const next = e.clientY > rect.top + rect.height / 2;
      if (next) {
        container.insertBefore(draggedElement, target.nextSibling);
      } else {
        container.insertBefore(draggedElement, target);
      }
    }
  });
}

function createMediaTools(type, index, subtype, initialImage) {
  const toolsId = `${type}-${subtype}-${index}`;
  const fileInputId = `edit-${toolsId}-image`;
  const pasteBtnId = `paste-${toolsId}-image`;
  const clearBtnId = `clear-${toolsId}-image`;
  const previewId = `preview-${toolsId}-image`;

  const toolsContainer = document.createElement("div");
  toolsContainer.className = "inline-tools";
  toolsContainer.innerHTML = `
    <label for="${fileInputId}">صورة:</label>
    <input type="file" id="${fileInputId}" accept="image/*" style="display: none;" />
    <button type="button" class="tiny-btn" onclick="document.getElementById('${fileInputId}').click()">إدراج</button>
    <button type="button" class="tiny-btn paste" id="${pasteBtnId}">لصق</button>
    <button type="button" class="tiny-btn del" id="${clearBtnId}">حذف</button>
  `;

  const preview = document.createElement("img");
  preview.id = previewId;
  preview.className = "preview-img";
  if (initialImage) {
    preview.src = initialImage;
    preview.style.display = "block";
  }

  // Attach event listeners after a delay to ensure elements are in the DOM
  setTimeout(() => {
    const pasteBtn = document.getElementById(pasteBtnId);
    const fileInput = document.getElementById(fileInputId);
    const clearBtn = document.getElementById(clearBtnId);

    if (pasteBtn) {
      pasteBtn.onclick = () => {
        const q = window.getCurrentQuestionOrCreate();
        pasteImageFromClipboard(previewId, (base64) => {
          if (type === "mc") {
            if (!q.options[index]) q.options[index] = {};
            q.options[index].image = base64;
          } else if (type === "match" || type === "connect") {
            const targetArray = subtype === "prompt" ? q.prompts : q.answers;
            if (!targetArray[index]) targetArray[index] = {};
            targetArray[index].image = base64;
          } else if (type === "order") {
            if (!q.items[index]) q.items[index] = {};
            q.items[index].image = base64;
          }
        });
      };
    }

    if (fileInput) {
      fileInput.onchange = () => {
        const q = window.getCurrentQuestionOrCreate();
        handleBinaryUpload(fileInput, previewId, (base64) => {
          if (type === "mc") {
            if (!q.options[index]) q.options[index] = {};
            q.options[index].image = base64;
          } else if (type === "match" || type === "connect") {
            const targetArray = subtype === "prompt" ? q.prompts : q.answers;
            if (!targetArray[index]) targetArray[index] = {};
            targetArray[index].image = base64;
          } else if (type === "order") {
            if (!q.items[index]) q.items[index] = {};
            q.items[index].image = base64;
          }
        });
      };
    }

    if (clearBtn) {
      clearBtn.onclick = () => {
        const q = window.getCurrentQuestionOrCreate();
        clearMedia(previewId, fileInputId, () => {
          if (type === "mc") {
            if (q.options[index]) q.options[index].image = null;
          } else if (type === "match" || type === "connect") {
            const targetArray = subtype === "prompt" ? q.prompts : q.answers;
            if (targetArray[index]) targetArray[index].image = null;
          } else if (type === "order") {
            if (q.items[index]) q.items[index].image = null;
          }
        });
      };
    }
  }, 0);

  return { toolsContainer, preview };
}

function addDynamicPair(questionType) {
  const containerId =
    questionType === "matching"
      ? "matchingPairsContainer"
      : "connectingPairsContainer";
  const container = document.getElementById(containerId);
  const index = container.children.length;
  const type = questionType === "matching" ? "match" : "connect";

  const card = document.createElement("div");
  card.className = "dynamic-item-card";
  card.draggable = true;
  card.dataset.index = index;

  const dragHandle = document.createElement("div");
  dragHandle.className = "drag-handle";
  dragHandle.innerHTML = "☰";
  card.appendChild(dragHandle);

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-item-btn";
  deleteBtn.innerHTML = "&times;";
  deleteBtn.title = "حذف الزوج";
  deleteBtn.onclick = () => card.remove();
  card.appendChild(deleteBtn);

  const grid = document.createElement("div");
  grid.className = "matching-grid";
  grid.style.paddingRight = "30px";

  // Prompt
  const promptContainer = document.createElement("div");
  promptContainer.className = "matching-item-container";
  const promptInput = document.createElement("input");
  promptInput.type = "text";
  promptInput.className = "form-control";
  promptInput.placeholder = `العنصر ${index + 1}`;
  const { toolsContainer: pTools, preview: pPreview } = createMediaTools(
    type,
    index,
    "prompt",
    null
  );
  promptContainer.append(promptInput, pTools, pPreview);

  // Answer
  const answerContainer = document.createElement("div");
  answerContainer.className = "matching-item-container";
  const answerInput = document.createElement("input");
  answerInput.type = "text";
  answerInput.className = "form-control";
  answerInput.placeholder = `الإجابة ${index + 1}`;
  const { toolsContainer: aTools, preview: aPreview } = createMediaTools(
    type,
    index,
    "answer",
    null
  );
  answerContainer.append(answerInput, aTools, aPreview);

  grid.append(promptContainer, answerContainer);
  card.appendChild(grid);
  container.appendChild(card);
}

function renderDynamicPairs(containerId, prompts, answers) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  return { toolsContainer, preview };
}

function renderDynamicPairs(containerId, prompts, answers) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  const type = containerId.includes("match") ? "match" : "connect";

  const pairs = prompts.map((p, i) => ({ prompt: p, answer: answers[i] }));

  pairs.forEach((pair, index) => {
    const card = document.createElement("div");
    card.className = "dynamic-item-card";
    card.draggable = true;
    card.dataset.index = index;

    const dragHandle = document.createElement("div");
    dragHandle.className = "drag-handle";
    dragHandle.innerHTML = "☰";
    card.appendChild(dragHandle);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-item-btn";
    deleteBtn.innerHTML = "&times;";
    deleteBtn.title = "حذف الزوج";
    deleteBtn.onclick = () => card.remove();
    card.appendChild(deleteBtn);

    const grid = document.createElement("div");
    grid.className = "matching-grid";
    grid.style.paddingRight = "30px";

    // Prompt
    const promptContainer = document.createElement("div");
    promptContainer.className = "matching-item-container";
    const promptInput = document.createElement("input");
    promptInput.type = "text";
    promptInput.className = "form-control";
    promptInput.placeholder = `العنصر ${index + 1}`;
    promptInput.value = pair.prompt.text || "";
    const { toolsContainer: pTools, preview: pPreview } = createMediaTools(
      type,
      index,
      "prompt",
      pair.prompt.image
    );
    promptContainer.append(promptInput, pTools, pPreview);

    // Answer
    const answerContainer = document.createElement("div");
    answerContainer.className = "matching-item-container";
    const answerInput = document.createElement("input");
    answerInput.type = "text";
    answerInput.className = "form-control";
    answerInput.placeholder = `الإجابة ${index + 1}`;
    answerInput.value = pair.answer.text || "";
    const { toolsContainer: aTools, preview: aPreview } = createMediaTools(
      type,
      index,
      "answer",
      pair.answer.image
    );
    answerContainer.append(answerInput, aTools, aPreview);

    grid.append(promptContainer, answerContainer);
    card.appendChild(grid);
    container.appendChild(card);
  });
}

function renderDynamicOrderingItems(items) {
  const container = document.getElementById("orderingItemsContainer");
  container.innerHTML = "";

  items.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "dynamic-item-card";
    card.draggable = true;
    card.dataset.index = index;

    const dragHandle = document.createElement("div");
    dragHandle.className = "drag-handle";
    dragHandle.innerHTML = "☰";
    card.appendChild(dragHandle);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-item-btn";
    deleteBtn.innerHTML = "&times;";
    deleteBtn.title = "حذف العنصر";
    deleteBtn.onclick = () => card.remove();
    card.appendChild(deleteBtn);

    const itemContainer = document.createElement("div");
    itemContainer.className = "ordering-edit-item";
    itemContainer.style.paddingRight = "30px";

    const itemInput = document.createElement("input");
    itemInput.type = "text";
    itemInput.className = "form-control";
    itemInput.placeholder = `العنصر ${index + 1}`;
    itemInput.value = item.text || "";

    const { toolsContainer, preview } = createMediaTools(
      "order",
      index,
      "item",
      item.image
    );

    itemContainer.append(itemInput, toolsContainer, preview);
    card.appendChild(itemContainer);
    container.appendChild(card);
  });
}

function renderDynamicMcOptions(options, correctIndex) {
  const container = document.getElementById("multipleChoiceOptionsContainer");
  container.innerHTML = "";

  options.forEach((opt, index) => {
    const card = document.createElement("div");
    card.className = "dynamic-item-card";
    card.draggable = true;
    card.dataset.index = index;

    const dragHandle = document.createElement("div");
    dragHandle.className = "drag-handle";
    dragHandle.innerHTML = "☰";
    card.appendChild(dragHandle);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-item-btn";
    deleteBtn.innerHTML = "&times;";
    deleteBtn.title = "حذف الخيار";
    deleteBtn.onclick = () => {
      if (container.children.length <= 2) {
        alert("يجب أن يحتوي السؤال على خيارين على الأقل.");
        return;
      }
      card.remove();
      // After removing, we need to re-evaluate the correct index
      const remainingCards = [
        ...container.querySelectorAll(".dynamic-item-card"),
      ];
      let newCorrectIndex = -1;
      remainingCards.forEach((c, i) => {
        const radio = c.querySelector('input[type="radio"]');
        if (radio && radio.checked) {
          newCorrectIndex = i;
        }
      });
      if (newCorrectIndex === -1 && remainingCards.length > 0) {
        remainingCards[0].querySelector('input[type="radio"]').checked = true;
      }
    };
    card.appendChild(deleteBtn);

    const editorContent = document.createElement("div");
    editorContent.className = "mc-option-editor";

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "dynamicCorrectOption";
    radio.checked = index === correctIndex;
    editorContent.appendChild(radio);

    const inputContainer = document.createElement("div");
    inputContainer.style.flexGrow = "1";
    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.className = "form-control";
    textInput.placeholder = `الخيار ${index + 1}`;
    textInput.value = opt.text || "";
    const { toolsContainer, preview } = createMediaTools(
      "mc",
      index,
      "option",
      opt.image
    );
    inputContainer.append(textInput, toolsContainer, preview);
    editorContent.appendChild(inputContainer);

    card.appendChild(editorContent);
    container.appendChild(card);
  });
}

window.saveEdit = function () {
  const q = state.questions[state.currentQuestion];
  if (!q) return;

  if (!q.reading) q.reading = { text: "", image: null, audio: null };
  if (!q.question) q.question = { text: "", image: null };

  const cleanHTML = (html) =>
    (html || "").replace(/(<p><br><\/p>|\s|&nbsp;)*$/, "").trim();

  const questionType = document.getElementById("editQuestionType").value;
  if (q.type !== questionType) {
    q.type = questionType;
    window.ensureQuestionSanity(q);
  }

  q.reading.text = cleanHTML(
    document.getElementById("editReadingText").innerHTML
  );
  q.question.text = cleanHTML(
    document.getElementById("editQuestionText").innerHTML
  );
  q.feedback = cleanHTML(document.getElementById("editFeedback").innerHTML);

  if (q.type === "multiple-choice") {
    const optionCards = document.querySelectorAll(
      "#multipleChoiceOptionsContainer .dynamic-item-card"
    );
    const newOptions = [];
    let newCorrectIndex = -1;

    optionCards.forEach((card, index) => {
      const textInput = card.querySelector('input[type="text"]');
      const preview = card.querySelector(".preview-img");
      const radio = card.querySelector('input[type="radio"]');

      const text = textInput ? textInput.value.trim() : "";
      const image =
        preview && preview.style.display !== "none" ? preview.src : null;

      if (text || image) {
        newOptions.push({ text, image });
        if (radio && radio.checked) {
          newCorrectIndex = newOptions.length - 1;
        }
      }
    });

    if (newOptions.length < 2) {
      alert("يجب إدخال خيارين على الأقل (نصًا أو صورة) قبل الحفظ.");
      return;
    }

    if (newCorrectIndex === -1) {
      alert("يجب اختيار إجابة صحيحة من ضمن الخيارات المعبأة.");
      return;
    }

    q.options = newOptions;
    q.correct = newCorrectIndex;
  } else if (q.type === "fill-in-the-blank") {
    q.correctAnswer = (
      document.getElementById("editCorrectAnswer").value || ""
    ).trim();
    if (!q.correctAnswer) {
      alert("يرجى إدخال إجابة صحيحة لسؤال 'املأ الفراغ'.");
      return;
    }
  } else if (q.type === "true-false") {
    const correctRadio = document.querySelector(
      'input[name="correctTFAnswer"]:checked'
    );
    if (!correctRadio) {
      alert("يرجى اختيار 'صح' أو 'خطأ' كإجابة صحيحة.");
      return;
    }
    q.correctAnswer = correctRadio.value === "true";
  } else if (q.type === "short-answer") {
    q.correctAnswer = (
      document.getElementById("editShortAnswer").value || ""
    ).trim();
    if (!q.correctAnswer) {
      alert("يرجى إدخال الإجابة النموذجية لسؤال 'الإجابة القصيرة'.");
      return;
    }
  } else if (q.type === "matching" || q.type === "connecting-lines") {
    const prompts = [];
    const answers = [];
    const prefix = q.type === "matching" ? "Match" : "Connect";
    const containerId =
      q.type === "matching"
        ? "matchingPairsContainer"
        : "connectingPairsContainer";
    const pairCards = document.querySelectorAll(
      `#${containerId} .dynamic-item-card`
    );

    pairCards.forEach((card, i) => {
      const promptInput = card.querySelector(
        '.matching-item-container:first-child input[type="text"]'
      );
      const answerInput = card.querySelector(
        '.matching-item-container:last-child input[type="text"]'
      );
      const promptPreview = card.querySelector(
        ".matching-item-container:first-child .preview-img"
      );
      const answerPreview = card.querySelector(
        ".matching-item-container:last-child .preview-img"
      );

      const promptText = promptInput ? promptInput.value.trim() : "";
      const answerText = answerInput ? answerInput.value.trim() : "";
      const promptImage =
        promptPreview && promptPreview.style.display !== "none"
          ? promptPreview.src
          : null;
      const answerImage =
        answerPreview && answerPreview.style.display !== "none"
          ? answerPreview.src
          : null;

      if (promptText || promptImage || answerText || answerImage) {
        prompts.push({ text: promptText, image: promptImage || null });
        answers.push({ text: answerText, image: answerImage || null });
      }
    });

    if (prompts.length < 2) {
      alert("يجب إدخال زوجين على الأقل للمطابقة أو التوصيل.");
      return;
    }

    q.prompts = prompts;
    q.answers = answers;
  } else if (q.type === "ordering") {
    const items = [];
    const itemCards = document.querySelectorAll(
      "#orderingItemsContainer .dynamic-item-card"
    );

    itemCards.forEach((card) => {
      const textInput = card.querySelector('input[type="text"]');
      const preview = card.querySelector(".preview-img");
      const itemText = textInput ? textInput.value.trim() : "";
      const itemImage =
        preview && preview.style.display !== "none" ? preview.src : null;

      if (itemText || itemImage) {
        items.push({ text: itemText, image: itemImage });
      }
    });

    if (items.length < 2) {
      alert("يجب إدخال عنصرين على الأقل للترتيب (نص أو صورة).");
      return;
    }
    q.items = items;
  }

  window.persist();
  window.addNewQuestion();
};

window.cancelEdit = function () {
  document.getElementById("editPanel").style.display = "none";
  document.querySelector(".quiz-box").style.display = "block";
  document.getElementById("countersBox").style.display = "flex";
  const q = window.getCurrentQuestionOrCreate();
  const hasReading =
    q && q.reading && (q.reading.text || q.reading.image || q.reading.audio);
  document.getElementById("readingText").style.display = hasReading
    ? "block"
    : "none";
  window.startTimer();
};

window.duplicateCurrentQuestion = function () {
  const src = window.getCurrentQuestionOrCreate();
  const clone = JSON.parse(JSON.stringify(src));
  state.questions.splice(state.currentQuestion + 1, 0, clone);
  state.currentQuestion++;
  state.answeredQuestions.splice(state.currentQuestion, 0, null);
  state.lastWrong.splice(state.currentQuestion, 0, null);
  state.shuffledMaps.splice(state.currentQuestion, 0, null);
  window.persist();
  const editPanel = document.getElementById("editPanel");
  if (editPanel && editPanel.style.display === "block")
    window.populateEditForm();
  else window.showQuestion();
};

window.addNewQuestion = function (isInitial = false) {
  const newQ = { type: "multiple-choice" };
  window.ensureQuestionSanity(newQ);

  if (isInitial) {
    state.questions.push(newQ);
    state.currentQuestion = 0;
  } else {
    state.questions.splice(state.currentQuestion + 1, 0, newQ);
    state.currentQuestion++;
  }
  state.answeredQuestions.splice(state.currentQuestion, 0, null);
  state.lastWrong.splice(state.currentQuestion, 0, null);
  state.shuffledMaps.splice(state.currentQuestion, 0, null);
  window.populateEditForm();
  window.persist();
};

window.deleteCurrentQuestion = function () {
  if (!Array.isArray(state.questions) || state.questions.length <= 1) {
    alert("لا يمكن حذف السؤال الوحيد!");
    return;
  }
  if (!confirm("هل أنت متأكد من حذف هذا السؤال؟")) return;

  state.questions.splice(state.currentQuestion, 1);
  state.answeredQuestions.splice(state.currentQuestion, 1);
  state.lastWrong.splice(state.currentQuestion, 1);
  state.shuffledMaps.splice(state.currentQuestion, 1);

  if (state.currentQuestion >= state.questions.length) {
    state.currentQuestion = state.questions.length - 1;
  }

  window.persist();
  window.populateEditForm();
};

/* ===== student build ===== */
window.saveAppForOfflineUse = function () {
  try {
    const clean = (state.questions || []).map((q) => {
      const qq = JSON.parse(JSON.stringify(q || {}));
      window.ensureQuestionSanity(qq);
      return qq;
    });
    const qTime =
      typeof state.questionTime === "number" ? state.questionTime : 30;
    const title = (
      document.getElementById("quizTitle")?.innerHTML || ""
    ).trim();
    const instructions = (
      document.getElementById("instructions")?.innerHTML || ""
    ).trim();
    const numeralType = state.numeralType === "eastern" ? "eastern" : "arabic";
    const logoData = quizConfig.logo ? quizConfig.logo : "";
    const logoAlt = quizConfig.logoAlt ? quizConfig.logoAlt : "شعار";
    const baseFooterHTML = document.getElementById("quizFooter").innerHTML;
    const teacherFooterHTML = (
      document.getElementById("teacherFooter")?.innerHTML || ""
    ).trim();

    const questionsJSONString = JSON.stringify(clean).replace(
      /<\/script>/gi,
      "<\\/script>"
    );

    const certificateHTML = `
    <div class="config-panel" id="certificateForm" style="text-align: right; display: none">
      <h3>بيانات الشهادة</h3>
      <div class="form-group"> <label for="studentNameInput">اسم الطالب:</label> <input class="form-control" id="studentNameInput" type="text" placeholder="أدخل اسم الطالب" /> </div>
      <div class="form-group"> <label for="teacherNameInput">اسم المعلم:</label> <input class="form-control" id="teacherNameInput" type="text" placeholder="أدخل اسم المعلم" value="معلم المادة" /> </div>
      <div class="form-group" style="display: flex; gap: 8px; flex-wrap: wrap"> <button class="nav-btn" onclick="generateCertificate()" style="background: #28a745"> إنشاء الشهادة </button> <button class="nav-btn" onclick="closeCertificateForm()">إلغاء</button> </div>
    </div>
    <div class="certificate-container" id="certificateContainer">
      <div class="certificate-header"> <img id="certificateLogo" alt="شعار" class="certificate-logo" /> <h2 class="certificate-quiz-title" id="certificateQuizTitle"> عنوان الاختبار </h2> </div>
      <h1 class="certificate-title">شهادة إنجاز</h1>
      <div class="certificate-body">
        <div class="student-name" id="certificateStudentName">اسم الطالب</div>
        <div class="achievement-text"> تهانينا! لقد أتممت الاختبار التفاعلي بنجاح </div>
        <div class="score-text" id="certificateScoreText"> حققت نتيجة 20 من 25 </div>
        <div class="achievement-text"> نظير جهودك المتميزة وإصرارك على التعلّم، نقدم لك هذه الشهادة تقديرًا لإنجازك البارع </div>
        <div class="teacher-name" id="certificateTeacherName"> المعلم: اسم المعلم </div>
      </div>
      <div class="certificate-footer"> <p>شهادة معتمدة من نظام الاختبارات التفاعلية</p> </div>
      <div class="certificate-buttons"> <button class="certificate-btn print" onclick="printCertificate()"> 🖨️ طباعة الشهادة </button> <button class="certificate-btn" onclick="downloadCertificate()"> 📥 حفظ كصورة </button> <button class="certificate-btn close" onclick="closeCertificate()"> ✕ إغلاق </button> </div>
    </div>`;
    const certificateCSS = `
      .config-panel { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #fff; padding: 24px; border-radius: var(--border-radius-lg); box-shadow: 0 5px 20px rgba(0, 0, 0, 0.2); display: none; color: var(--color-text); z-index: 9999; width: 92%; max-width: 520px; }
      .config-panel h3 { margin-top: 0; color: var(--color-primary); }
      .form-control { width: 100%; padding: 12px; border-radius: var(--border-radius-sm); border: 1px solid #ccc; resize: vertical; font-size: 1em; }
      .form-group { margin-top: 16px; }
      .form-group label { display: block; margin-bottom: 6px; font-weight: 600; }
      .form-group .nav-btn { margin-top: 10px; }
      .restart-btn { border: none; padding: 12px 28px; border-radius: var(--border-radius-sm); cursor: pointer; font-size: 1.05em; font-weight: 600; transition: transform 0.2s ease, filter 0.2s ease; background: var(--color-primary); color: #fff; }
      .restart-btn:hover { transform: translateY(-2px); filter: brightness(95%); }
      .no-certificate-message { background: #fff3cd; color: #856404; padding: 16px; border-radius: var(--border-radius-md); margin: 24px 0; border: 1px solid #ffeaa7; }
      .certificate-container { display: none; max-width: 800px; margin: 20px auto; background: #ffffff; border: 10px solid var(--color-primary); border-radius: var(--border-radius-lg); padding: 30px; box-shadow: var(--shadow-md); position: relative; text-align: center; color: var(--color-text); }
      .certificate-header { display: flex; flex-direction: column; align-items: center; gap: 15px; margin-bottom: 10px; }
      .certificate-logo { max-width: 100px; height: auto; }
      .certificate-quiz-title { color: var(--color-dark); font-size: 1.5em; font-weight: 500; margin: 0; }
      .certificate-title { color: var(--color-primary); font-size: 2.8em; font-weight: bold; margin: 15px 0 20px 0; }
      .certificate-body { margin: 30px 0; padding: 20px; border: 2px dashed var(--color-primary); border-radius: var(--border-radius-md); background: var(--color-light); }
      .student-name { font-size: 2em; color: var(--color-primary-dark); margin: 20px 0; font-weight: bold; }
      .achievement-text { font-size: 1.3em; color: var(--color-text); margin: 15px 0; }
      .score-text { font-size: 1.4em; color: var(--color-success); font-weight: bold; }
      .teacher-name { font-size: 1.3em; color: var(--color-primary-dark); margin-top: 30px; }
      .certificate-footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ccc; color: #666; }
      .certificate-buttons { display: flex; flex-direction: column; align-items: center; gap: 15px; margin-top: 25px; }
      .certificate-btn { border: none; padding: 12px 25px; border-radius: var(--border-radius-sm); cursor: pointer; font-size: 1.1em; font-weight: 600; transition: all 0.2s ease; background: var(--color-success); color: white; }
      .certificate-btn:hover { filter: brightness(90%); transform: translateY(-2px); }
      .certificate-btn.print { background: var(--color-primary); }
      .certificate-btn.close { background: var(--color-secondary); }
      @media print { body > * { display: none !important; } .certificate-container { display: block !important; margin: 0 !important; padding: 20px !important; border: 10px solid var(--color-primary) !important; box-shadow: none !important; border-radius: 15px !important; max-width: 100% !important; width: auto !important; } .certificate-container .certificate-buttons { display: none !important; } body { background: white !important; margin: 0 !important; padding: 0 !important; } }
          `;
    const certificateJS = `
    function showCertificateOption() {
      if (!state.questions || state.questions.length === 0) return;
      const scorePercentage = (state.score / state.questions.length) * 100;
      const certificateBtn = document.getElementById("certificateBtn");
      const noCertificateMsg = document.getElementById("noCertificateMsg");
      if (scorePercentage >= 80) { if (certificateBtn) certificateBtn.style.display = "block"; if (noCertificateMsg) noCertificateMsg.style.display = "none"; }
      else { if (certificateBtn) certificateBtn.style.display = "none"; if (noCertificateMsg) noCertificateMsg.style.display = "block"; }
    };
    function openCertificateForm() { document.getElementById("certificateForm").style.display = "block"; };
    function closeCertificateForm() { document.getElementById("certificateForm").style.display = "none"; };
    function generateCertificate() {
      const studentName = document.getElementById("studentNameInput").value.trim();
      const teacherName = document.getElementById("teacherNameInput").value.trim();
      if (!studentName) { alert("يرجى إدخال اسم الطالب"); return; }
      document.getElementById("certificateStudentName").textContent = studentName;
      document.getElementById("certificateTeacherName").textContent = 'المعلم: ' + teacherName;
      const scoreText = 'حققت نتيجة ' + formatNumber(state.score) + ' من ' + formatNumber(state.questions.length) + ' (' + Math.round((state.score / state.questions.length) * 100) + '%)';
      document.getElementById("certificateScoreText").textContent = scoreText;
      const mainTitleEl = document.getElementById("quizTitle");
      const certificateTitleEl = document.getElementById("certificateQuizTitle");
      if (mainTitleEl && certificateTitleEl) { certificateTitleEl.innerHTML = mainTitleEl.innerHTML; }
      const mainLogo = document.getElementById("quizLogo");
      const certificateLogo = document.getElementById("certificateLogo");
      if (mainLogo && mainLogo.src && mainLogo.style.display !== "none") { certificateLogo.src = mainLogo.src; certificateLogo.alt = mainLogo.alt || "شعار"; certificateLogo.style.display = "block"; }
      else { certificateLogo.style.display = "none"; }
      closeCertificateForm();
      document.getElementById("certificateContainer").style.display = "block";
    };
    function closeCertificate() { document.getElementById("certificateContainer").style.display = "none"; };
    function printCertificate() { window.print(); };
    function downloadCertificate() {
      const certificate = document.getElementById("certificateContainer");
      const buttons = certificate.querySelector(".certificate-buttons");
      if (buttons) { buttons.style.display = "none"; }
      html2canvas(certificate, { scale: 2, useCORS: true, logging: false })
        .then((canvas) => {
          const link = document.createElement("a");
          const studentName = document.getElementById("certificateStudentName").textContent.trim();
          link.download = 'شهادة_إنجاز_' + studentName + '.png';
          link.href = canvas.toDataURL("image/png", 1.0);
          link.click();
        }).finally(() => { if (buttons) { buttons.style.display = "flex"; } });
    };
          `;

    const studentFunctionsToExport = [
      "formatNumber",
      "ensureQuestionSanity",
      "getCurrentQuestionOrCreate",
      "sanitizeHTML",
      "plainToHTMLStrict",
      "convertNumeralsInText",
      "formatQuizContent",
      "formatHeader",
      "formatSubheader",
      "applyNumeralTypeToPage",
      "persist",
      "restore",
      "shuffleOptionsOnce",
      "startTimer",
      "updateTimerDisplay",
      "updateQuestionCounter",
      "updateScoreCounter",
      "showQuestion",
      "canApplyChosenLayout",
      "applyLayoutSafely",
      "renderConnectingLines",
      "drawConnectingLines",
      "checkShortAnswerSimilarity",
      "checkAnswer",
      "nextQuestion",
      "previousQuestion",
      "restartQuiz",
      "togglePause",
      "showResult",
      "getDragAfterElement",
      "updateTimer",
    ];

    const functionDeclarations = studentFunctionsToExport
      .map((name) => {
        const func = window[name];
        if (typeof func !== "function") {
          console.warn(`Function to export not found: ${name}`);
          return `/* WARNING: Function ${name} not found */`;
        }
        const funcString = func.toString();
        if (
          funcString.startsWith("function(") ||
          funcString.startsWith("function (")
        ) {
          return `function ${name}${funcString.substring(
            funcString.indexOf("(")
          )}`;
        }
        return funcString;
      })
      .join("\n\n");

    const fullScript = [
      `const STORAGE_KEY = "quiz_student_progress_${Date.now()}";`,
      `const EASTERN = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];`,
      `const state = { questions: ${questionsJSONString}, currentQuestion: 0, score: 0, questionTime: ${qTime}, timeLeft: ${qTime}, timerId: null, isPaused: false, answeredQuestions: [], lastWrong: [], shuffledMaps: [], optionsLayout: "${
        state.optionsLayout === "4x1" ? "4x1" : "2x2"
      }", numeralType: "${numeralType}" };`,
      `let draggedItem = null, orderingDraggedItem = null;`,
      `let connectState = { from: null, connections: [], canvas: null, observer: null };`,
      functionDeclarations,
      certificateJS,
      `document.addEventListener("DOMContentLoaded", function() { 
            restore(); 
            if (!state.answeredQuestions || state.answeredQuestions.length !== state.questions.length) {
                state.answeredQuestions = new Array(state.questions.length).fill(null);
            }
            if (!state.lastWrong || state.lastWrong.length !== state.questions.length) {
                state.lastWrong = new Array(state.questions.length).fill(null);
            }
            if (state.questions.length > 0) {
                if (state.currentQuestion >= state.questions.length) state.currentQuestion = 0;
                showQuestion();
            } else { 
                updateQuestionCounter(); 
                updateScoreCounter(); 
                updateTimerDisplay(); 
            } 
        });`,
    ].join("\n");

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>الاختبار التفاعلي - نسخة الطالب</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/><link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;500;700&display=swap" rel="stylesheet"/>
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script>
<style>
  :root { --font-family-base: "Tajawal", "Segoe UI", "Noto Sans Arabic", Tahoma, Geneva, Verdana, sans-serif; --color-primary: #007bff; --color-primary-dark: #0056b3; --color-success: #28a745; --color-danger: #dc3545; --color-warning: #ffc107; --color-light: #f8f9fa; --color-dark: #343a40; --color-text: #212529; --color-bg: #f4f7f6; --border-radius-sm: 8px; --border-radius-md: 12px; --border-radius-lg: 16px; --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.05); --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08); }
  * { box-sizing: border-box; font-family: var(--font-family-base); }
  body { background-color: var(--color-bg); min-height: 100vh; margin: 0; padding: 20px; color: var(--color-text); }
  .container { max-width: 900px; margin: 20px auto; }
  .header { margin-bottom: 24px; padding: 16px; background: #fff; border-radius: var(--border-radius-lg); box-shadow: var(--shadow-sm); }
  .header-grid { display: grid; grid-template-columns: 140px 1fr; align-items: center; gap: 16px; text-align: unset; }
  .header-logo { display: flex; align-items: center; justify-content: center; }
  .header-logo img { max-width: 100%; height: auto; object-fit: contain; }
  .header-main h1 { margin: 0 0 8px 0; color: var(--color-primary); font-size: 1.8em; }
  .header-main p { margin: 0; font-size: 1.1em; color: #555; }
  @media (max-width: 600px) { .header-grid { grid-template-columns: 100px 1fr; gap: 12px; } .header-main h1 { font-size: 1.4em; } }
  .counters { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin: 16px 0; }
  #questionCounter, #timer, #scoreCounter { background: #ffffff; padding: 16px; border-radius: var(--border-radius-md); font-weight: 700; font-size: 1.1em; text-align: center; box-shadow: var(--shadow-sm); color: var(--color-dark); display: flex; align-items: center; justify-content: center; gap: 10px; }
  #questionCounter::before { content: "📌"; } #scoreCounter::before { content: "🏆"; } #timer::before { content: "⏳"; font-size: 1.2em; }
  .reading-text { background: #ffffff; color: #333; padding: 20px; border-radius: var(--border-radius-md); margin-bottom: 16px; font-size: 1.15em; line-height: 1.8; box-shadow: var(--shadow-sm); border: 1px solid #e0e0e0; }
  .reading-text img, .question img, .reading-text-content img, .question-text img { width: 100%; height: auto; object-fit: contain; max-height: 50vh; border-radius: var(--border-radius-md); margin: 12px 0; display: block; }
  audio { width: 100%; margin: 8px 0; }
  .quiz-box { background: #ffffff; border-radius: var(--border-radius-lg); padding: 24px; box-shadow: var(--shadow-md); color: var(--color-text); overflow: hidden; }
  .question { font-size: 1.5em; margin-bottom: 24px; font-weight: 700; line-height: 1.6; }
  .fill-in-blank-container, .short-answer-container { display: flex; flex-direction: column; gap: 12px; align-items: center; }
  .fill-in-blank-input { width: 100%; max-width: 400px; padding: 12px; border: 2px solid #ccc; border-radius: var(--border-radius-sm); font-size: 1.1em; text-align: center; }
  .fill-in-blank-input:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.25); outline: none; }
  .fill-in-blank-input.correct { background: #e6f7ec; border-color: var(--color-success); } .fill-in-blank-input.wrong { background: #fdecea; border-color: var(--color-danger); }
  .short-answer-textarea { width: 100%; max-width: 500px; min-height: 120px; padding: 12px; border: 2px solid #ccc; border-radius: var(--border-radius-sm); font-size: 1.1em; resize: vertical; }
  .short-answer-textarea:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.25); outline: none; }
  .short-answer-textarea.correct { background: #e6f7ec; border-color: var(--color-success); } .short-answer-textarea.wrong { background: #fdecea; border-color: var(--color-danger); }
  .correct-answer-display { background-color: #e9f7ef; color: #2b6447; padding: 10px 15px; border-radius: var(--border-radius-sm); font-weight: 600; margin-top: 10px; border: 1px solid #c3e6cb; width: 100%; max-width: 500px; text-align: center; }
  .options { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; } .options[data-layout="4x1"] { grid-template-columns: repeat(4, minmax(0, 1fr)); } .options-two { grid-template-columns: repeat(2, 1fr); max-width: 500px; margin: 0 auto; }
  .option { background: #fff; padding: 16px; border-radius: var(--border-radius-md); cursor: pointer; transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease; border: 2px solid #e0e0e0; min-height: 120px; display: flex; align-items: center; justify-content: center; }
  .option:hover { transform: translateY(-4px); box-shadow: var(--shadow-md); border-color: var(--color-primary); }
  .option:focus { outline: 3px solid var(--color-primary); border-color: var(--color-primary); }
  .option.correct { background: #e6f7ec; color: #1d643b; border-color: var(--color-success); font-weight: 700; }
  .option.wrong { background: #fdecea; color: #a52834; border-color: var(--color-danger); font-weight: 700; }
  .option[aria-disabled="true"] { pointer-events: none; opacity: 0.9; }
  .option-content { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%; }
  .option-content img { width: 100%; max-height: 100px; object-fit: contain; border-radius: var(--border-radius-sm); }
  .option-content span { text-align: center; font-size: 18px; font-weight: 700; color: var(--color-text); }
  .matching-container { display: flex; flex-wrap: wrap; gap: 20px; justify-content: space-between; margin-bottom: 20px; } .matching-column { flex: 1; min-width: 250px; display: flex; flex-direction: column; gap: 10px; } .matching-prompt-item { display: flex; align-items: center; gap: 10px; padding: 10px; background-color: var(--color-light); border-radius: var(--border-radius-sm); border: 1px solid #e0e0e0; } .prompt-text { flex: 1; font-weight: 600; } .drop-zone { flex: 1; min-height: 48px; border: 2px dashed #ccc; border-radius: var(--border-radius-sm); transition: background-color 0.2s; display: flex; align-items: center; justify-content: center; padding: 4px; } .drop-zone.over { background-color: #e0e0e0; } .drop-zone .answer-item { cursor: default; width: 100%; } .answer-item { padding: 12px; background-color: #fff; border: 1px solid #ddd; border-radius: var(--border-radius-sm); cursor: grab; text-align: center; user-select: none; } .answer-item .option-content img { max-height: 80px; } .answer-item:active { cursor: grabbing; } .answer-item.dragging { opacity: 0.5; } .drop-zone.correct .answer-item { border-color: var(--color-success); background-color: #e6f7ec; } .drop-zone.wrong .answer-item { border-color: var(--color-danger); background-color: #fdecea; }
  .ordering-container { display: flex; flex-direction: column; gap: 10px; max-width: 500px; margin: 0 auto 20px auto; border: 2px solid #ccc; padding: 15px; border-radius: var(--border-radius-md); } .ordering-item { padding: 15px; background-color: #fff; border: 1px solid #ddd; border-radius: var(--border-radius-sm); cursor: grab; user-select: none; transition: background-color 0.2s, box-shadow 0.2s; display: flex; align-items: center; gap: 10px; } .ordering-item::before { content: '☰'; color: #999; font-weight: bold; } .ordering-item:active { cursor: grabbing; } .ordering-item.dragging { opacity: 0.5; background-color: #e0e0e0; box-shadow: var(--shadow-md); } .ordering-container.correct { border-color: var(--color-success); } .ordering-container.wrong { border-color: var(--color-danger); } .correct-order-display { background-color: #fff3cd; color: #856404; padding: 10px 15px; border-radius: var(--border-radius-sm); margin-top: 15px; border: 1px solid #ffeeba; text-align: right; } .correct-order-display ol { padding-right: 20px; margin: 5px 0; }
  .connecting-lines-container { position: relative; display: flex; justify-content: space-between; gap: 20px; margin-bottom: 20px; } .connecting-lines-column { flex: 1; display: flex; flex-direction: column; gap: 15px; z-index: 2; } .connect-item { padding: 12px; border: 2px solid #ccc; border-radius: var(--border-radius-md); cursor: pointer; transition: border-color 0.2s, background-color 0.2s; background-color: #fff; display: flex; align-items: center; min-height: 60px; } .connect-item.selected { border-color: var(--color-primary); background-color: #e7f1ff; box-shadow: 0 0 8px rgba(0, 123, 255, 0.5); } .connect-item .option-content { flex-direction: row; justify-content: flex-start; gap: 10px; pointer-events: none; } .connect-item[data-connected="true"] { background-color: #f0f0f0; cursor: not-allowed; } .connect-item.connect-correct { background-color: #e6f7ec; border-color: var(--color-success); } .connect-item.connect-wrong { background-color: #fdecea; border-color: var(--color-danger); } #connectingLinesCanvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; }
  .controls { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; margin-top: 24px; }
  .nav-btn { border: none; padding: 12px 28px; border-radius: var(--border-radius-sm); cursor: pointer; font-size: 1.05em; font-weight: 600; transition: transform 0.2s ease, filter 0.2s ease; background: var(--color-primary); color: #fff; }
  .nav-btn:hover { transform: translateY(-2px); filter: brightness(95%); }
  .nav-btn:focus { outline: 3px solid var(--color-primary-dark); }
  .nav-btn:disabled { background: #adb5bd; cursor: not-allowed; transform: none; }
  #pauseBtn { background: var(--color-warning); color: #000; }
  .progress-bar { height: 10px; background: #e9ecef; border-radius: 5px; margin: 20px 0 10px 0; overflow: hidden; }
  .progress { height: 100%; background: var(--color-success); width: 0; transition: width 0.3s ease; border-radius: 5px; }
  .score-board { text-align: center; font-size: 1.5em; display: none; background: #fff; padding: 32px; border-radius: var(--border-radius-lg); box-shadow: var(--shadow-md); }
  .score-board h2 { margin-top: 0; }
  :root { --container-max: 900px; }
  #teacherFooter, #quizFooter { max-width: var(--container-max); margin: 20px auto; text-align: center; padding: 16px; background: #ffffff; color: var(--color-secondary); border-radius: var(--border-radius-md); box-shadow: var(--shadow-sm); font-size: 0.9em; }
  #quizFooter a { color: inherit; text-decoration: none; } #quizFooter a:hover { text-decoration: underline; color: var(--color-primary); }
  body.rtl-ar { direction: rtl; } body.rtl-ar .question, body.rtl-ar .reading-text { text-align: right; }
  body.rtl-ar .counters { direction: rtl; }
  body.rtl-ar #questionCounter::before { margin-left: 6px; margin-right: 0; }
  body.rtl-ar #scoreCounter::before { margin-left: 6px; margin-right: 0; }
  body.rtl-ar #timer::before { margin-left: 8px; margin-right: 0; }
  @media (max-width: 768px) { body { padding: 10px; } .container { margin: 10px auto; } .options { grid-template-columns: 1fr; } .option { min-height: 100px; padding: 12px; } .question { font-size: 1.3em; } .counters { grid-template-columns: 1fr; } }
${certificateCSS}
</style>
</head>
<body>
<div class="container">
 <div class="header header-grid">
  <div class="header-logo"> <img id="quizLogo" alt="${logoAlt}" src="${logoData}" style="${
      logoData ? "display:block;" : "display:none;"
    } max-width:100%; height:auto;" /> </div>
  <div class="header-main"> <h1 id="quizTitle">${title}</h1> <p id="instructions">${instructions}</p> </div>
 </div>
 <div class="counters" id="countersBox">
  <div id="questionCounter" class="counter-chip"></div>
  <div id="timer" class="counter-chip"></div>
  <div id="scoreCounter" class="counter-chip"></div>
 </div>
 <div class="reading-text" id="readingText" style="display:none"></div>
 <div class="quiz-box">
  <div class="question" id="question"></div>
  <div class="options" id="options"></div>
  <div class="controls">
    <button class="nav-btn" id="prevBtn" onclick="previousQuestion()" disabled>السابق</button>
    <button class="nav-btn" id="pauseBtn" onclick="togglePause()">إيقاف مؤقت</button>
    <button class="nav-btn" id="nextBtn" onclick="nextQuestion()">التالي</button>
  </div>
  <div class="progress-bar"><div class="progress" id="progress"></div></div>
 </div>
 <div class="score-board" id="scoreBoard" style="display:none;">
  <h2> نتيجتك النهائية: <span id="finalScore">٠</span>/<span id="totalQuestions">٠</span> </h2>
  <div class="no-certificate-message" id="noCertificateMsg" style="display: none"> <p>للحصول على شهادة الإنجاز، يجب تحقيق 80% على الأقل من الدرجة الكلية</p> <p>حاول مرة أخرى للوصول إلى هذا المستوى!</p> </div>
  <div class="certificate-buttons"> <button class="certificate-btn" id="certificateBtn" onclick="openCertificateForm()" style="display: none"> 🏆 الحصول على شهادة الإنجاز </button> <button class="restart-btn" onclick="restartQuiz()"> إعادة المحاولة </button> </div>
 </div>
</div>
${certificateHTML}
${
  teacherFooterHTML
    ? `<footer id="teacherFooter">${teacherFooterHTML}</footer>`
    : ``
}
<footer id="quizFooter">${baseFooterHTML}</footer>
<script>
  ${fullScript}
<\/script>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `quiz_student_offline_ar.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    alert("تم إنشاء نسخة الطالب بنجاح!");
  } catch (error) {
    console.error("Failed to save app for offline use:", error);
    alert(
      "حدث خطأ أثناء إنشاء نسخة الطالب. يرجى التحقق من وحدة التحكم لمزيد من التفاصيل."
    );
  }
};

window.resetProgress = function () {
  if (confirm("هل تريد تصفير تقدم الاختبار والبدء من جديد؟")) {
    state.currentQuestion = 0;
    state.score = 0;
    state.timeLeft = state.questionTime;
    state.shuffledMaps = [];
    state.answeredQuestions = new Array(state.questions.length).fill(null);
    state.lastWrong = new Array(state.questions.length).fill(null);
    window.persist();
    window.init(true);
  }
};

window.resetQuestions = function () {
  if (confirm("تحذير: سيتم حذف جميع الأسئلة الحالية! هل تريد المتابعة؟")) {
    localStorage.removeItem(STORAGE_KEY);
    state.questions = [];
    state.currentQuestion = 0;
    state.score = 0;
    state.timeLeft = 0;
    state.shuffledMaps = [];
    state.answeredQuestions = [];
    state.lastWrong = [];
    window.init(true);
  }
};

window.showResult = function () {
  clearInterval(state.timerId);
  const quizBox = document.querySelector(".quiz-box");
  if (quizBox) quizBox.style.display = "none";
  const scoreBoard = document.getElementById("scoreBoard");
  if (scoreBoard) scoreBoard.style.display = "block";
  const teacherButtons = document.getElementById("teacherButtons");
  if (teacherButtons) teacherButtons.style.display = "none";
  const countersBox = document.getElementById("countersBox");
  if (countersBox) countersBox.style.display = "none";
  const readingText = document.getElementById("readingText");
  if (readingText) readingText.style.display = "none";

  const finalScoreEl = document.getElementById("finalScore");
  if (finalScoreEl) finalScoreEl.textContent = window.formatNumber(state.score);

  const totalQuestionsEl = document.getElementById("totalQuestions");
  if (totalQuestionsEl)
    totalQuestionsEl.textContent = window.formatNumber(state.questions.length);
  if (typeof window.showCertificateOption === "function")
    window.showCertificateOption();
};

document.addEventListener("DOMContentLoaded", function () {
  window.init();

  document.getElementById("loadButton").onclick = window.loadQuestionsFromFile;
  document.getElementById("saveQuestionsButton").onclick =
    window.saveQuestionsToFile;
  document.getElementById("saveAppButton").onclick =
    window.saveAppForOfflineUse;

  // Logo upload and clear
  const logoInput = document.getElementById("logoInput");
  const logoPreview = document.getElementById("logoPreview");
  const logoClearBtn = document.getElementById("logoClearBtn");

  logoInput.addEventListener("change", function () {
    const file = this.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function (e) {
        quizConfig.logo = e.target.result;
        logoPreview.src = e.target.result;
        logoPreview.style.display = "block";
        document.getElementById("quizLogo").src = e.target.result;
        document.getElementById("quizLogo").style.display = "block";
        window.persist();
      };
      reader.readAsDataURL(file);
    }
  });

  logoClearBtn.addEventListener("click", function () {
    quizConfig.logo = null;
    logoPreview.src = "";
    logoPreview.style.display = "none";
    logoInput.value = "";
    document.getElementById("quizLogo").src = "";
    document.getElementById("quizLogo").style.display = "none";
    window.persist();
  });

  const logoAltInput = document.getElementById("logoAltInput");
  logoAltInput.addEventListener("input", function () {
    quizConfig.logoAlt = this.value;
    document.getElementById("quizLogo").alt = this.value;
    window.persist();
  });
});

function addDynamicOrderItem() {
  const container = document.getElementById("orderingItemsContainer");
  const index = container.children.length;

  const card = document.createElement("div");
  card.className = "dynamic-item-card";
  card.draggable = true;
  card.dataset.index = index;

  const dragHandle = document.createElement("div");
  dragHandle.className = "drag-handle";
  dragHandle.innerHTML = "☰";
  card.appendChild(dragHandle);

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-item-btn";
  deleteBtn.innerHTML = "&times;";
  deleteBtn.title = "حذف العنصر";
  deleteBtn.onclick = () => card.remove();
  card.appendChild(deleteBtn);

  const itemContainer = document.createElement("div");
  itemContainer.className = "ordering-edit-item";
  itemContainer.style.paddingRight = "30px";

  const itemInput = document.createElement("input");
  itemInput.type = "text";
  itemInput.className = "form-control";
  itemInput.placeholder = `العنصر ${index + 1}`;

  const { toolsContainer, preview } = createMediaTools(
    "order",
    index,
    "item",
    null
  );

  itemContainer.append(itemInput, toolsContainer, preview);
  card.appendChild(itemContainer);
  container.appendChild(card);
}

function addDynamicMcOption() {
  const container = document.getElementById("multipleChoiceOptionsContainer");
  const index = container.children.length;

  const card = document.createElement("div");
  card.className = "dynamic-item-card";
  card.draggable = true;
  card.dataset.index = index;

  const dragHandle = document.createElement("div");
  dragHandle.className = "drag-handle";
  dragHandle.innerHTML = "☰";
  card.appendChild(dragHandle);

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-item-btn";
  deleteBtn.innerHTML = "&times;";
  deleteBtn.title = "حذف الخيار";
  deleteBtn.onclick = () => {
    if (container.children.length <= 2) {
      alert("يجب أن يحتوي السؤال على خيارين على الأقل.");
      return;
    }
    card.remove();
  };
  card.appendChild(deleteBtn);

  const editorContent = document.createElement("div");
  editorContent.className = "mc-option-editor";

  const radio = document.createElement("input");
  radio.type = "radio";
  radio.name = "dynamicCorrectOption";
  if (index === 0) radio.checked = true;
  editorContent.appendChild(radio);

  const inputContainer = document.createElement("div");
  inputContainer.style.flexGrow = "1";
  const textInput = document.createElement("input");
  textInput.type = "text";
  textInput.className = "form-control";
  textInput.placeholder = `الخيار ${index + 1}`;

  const { toolsContainer, preview } = createMediaTools(
    "mc",
    index,
    "option",
    null
  );

  inputContainer.append(textInput, toolsContainer, preview);
  editorContent.appendChild(inputContainer);

  card.appendChild(editorContent);
  container.appendChild(card);
}

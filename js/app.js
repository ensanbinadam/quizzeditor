
(function() {
  'use strict';

  // === From js/state.js ===
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

  const STORAGE_KEY = "quiz_teacher_lite_no_math_ar_v6_matching";

  const quizConfig = {
    title: "الاختبار التفاعلي",
    instructions: "اختر الإجابة الصحيحة لكل سؤال",
    logo: null,
    logoAlt: "",
  };

  // === From js/utils.js ===
  const EASTERN = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

  function formatNumber(n) {
    const num = Number.isFinite(n) ? n : 0;
    try {
      return new Intl.NumberFormat(
        state.numeralType === 'eastern' ? 'ar-EG' : 'en-US'
      ).format(num);
    } catch {
      return String(num);
    }
  }

  function sanitizeHTML(html) {
    if (!window.DOMPurify) return html || '';
    return DOMPurify.sanitize(html || '', {
      ADD_TAGS: [
        'a', 'u', 'mark', 'blockquote', 'hr', 'pre', 'code', 'h1', 'h2', 'h3',
        'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'img', 'table', 'thead', 'tbody',
        'tr', 'td', 'th', 'p', 'span', 'div', 'br', 'sub', 'sup', 'strong',
        'em', 'audio', 'source',
      ],
      ALLOWED_ATTR: [
        'src', 'alt', 'style', 'class', 'rowspan', 'colspan', 'href', 'target',
        'rel', 'dir', 'width', 'height', 'controls', 'preload', 'type',
      ],
      ALLOW_DATA_ATTR: false,
      FORBID_ATTR: ['onerror', 'onclick'],
    });
  }

  function plainToHTMLStrict(src) {
    if (!src || typeof src !== 'string') return '';
    const ESC = (s) =>
      s.replace(
        /[&<>]/g,
        (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])
      );
    const lines = src.split(/\r?\n/);
    const out = [];
    for (let raw of lines) {
      let s = raw.trim();
      if (!s) {
        out.push('<p>&nbsp;</p>');
        continue;
      }
      if (/^\/\/\/+$/.test(s)) {
        out.push('<hr>');
        continue;
      }
      s = ESC(s).replace(/(?:\s*\/\/\s*)+/g, '<br>');
      const m = s.match(
        /^(\*+|[\-\u2212\u2013\u2014]|[\(\[]?[0-9٠-٩]+[\)\.\-:]|[IVXLC]+[\)\.\:])\s+(.*)$/i
      );
      if (m) s = `<span class="lead-in">${m[1]}</span> ${m[2]}`;
      out.push(`<p>${s}</p>`);
    }
    if (!out.length) out.push('<p>&nbsp;</p>');
    return out.join('');
  }

  function convertNumeralsInText(text) {
    if (!text || typeof text !== 'string') return text;
    return state.numeralType === 'eastern'
      ? text.replace(/\d/g, (d) => EASTERN[d])
      : text.replace(/[٠-٩]/g, (d) => EASTERN.indexOf(d));
  }

  function formatQuizContent(html) {
    if (!html || typeof html !== 'string') return '';
    const looksHTML = /<\/?[a-z][\s\S]*>/i.test(html);
    const rendered = looksHTML ? html : plainToHTMLStrict(html);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = rendered;
    (function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        node.nodeValue = convertNumeralsInText(node.nodeValue);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
      }
    })(tempDiv);
    return sanitizeHTML(tempDiv.innerHTML);
  }

  function formatHeader(input) {
    if (!input || typeof input !== 'string') return '';
    const looksHTML = /<\/?[a-z][\s\S]*>/i.test(input);
    if (looksHTML) return sanitizeHTML(input);
    let s = input.replace(/(?:\s*\/\/\s*)+/g, '<br>');
    return sanitizeHTML(s);
  }

  function formatSubheader(input) {
    if (!input || typeof input !== 'string') return '';
    const looksHTML = /<\/?[a-z][\s\S]*>/i.test(input);
    if (looksHTML) return sanitizeHTML(input);
    const out = input
      .split(/\r?\n/)
      .map((line) =>
        /^\/\/\/+$/.test(line.trim())
          ? '<hr>'
          : line.replace(/(?:\s*\/\/\s*)+/g, '<br>')
      )
      .join('<br>');
    return sanitizeHTML(out);
  }

  function ensureQuestionSanity(q) {
    q.type = q.type || 'multiple-choice';
    q.reading = q.reading || { text: '', image: null, audio: null };
    q.question = q.question || { text: '', image: null };

    if (q.type === 'multiple-choice') {
      q.options = q.options || [];
      for (let i = 0; i < 4; i++) {
        if (!q.options[i]) q.options[i] = { text: '', image: null };
      }
      q.correct =
        typeof q.correct === 'number' && q.correct >= 0 && q.correct < 4
          ? q.correct
          : 0;
      delete q.correctAnswer;
    } else if (
      q.type === 'fill-in-the-blank' ||
      q.type === 'short-answer'
    ) {
      q.correctAnswer = q.correctAnswer || '';
      delete q.options;
      delete q.correct;
    } else if (q.type === 'true-false') {
      q.correctAnswer =
        typeof q.correctAnswer === 'boolean' ? q.correctAnswer : true;
      delete q.options;
      delete q.correct;
    } else if (q.type === 'matching') {
      q.prompts = q.prompts || [];
      q.answers = q.answers || [];
      delete q.options;
      delete q.correct;
      delete q.correctAnswer;
    } else if (q.type === 'ordering') {
      q.items = q.items || [];
      delete q.options;
      delete q.correct;
      delete q.correctAnswer;
      delete q.prompts;
      delete q.answers;
    }
  }

  function getCurrentQuestionOrCreate() {
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
    ensureQuestionSanity(q);
    return q;
  }

  function checkShortAnswerSimilarity(userAnswer, modelAnswer) {
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
  }
  
  // === From js/certificate.js & ui.js (related to results) ===
  function showResult() {
    clearInterval(state.timerId);
    document.querySelector('.quiz-box').style.display = 'none';
    document.getElementById('scoreBoard').style.display = 'block';
    document.getElementById('teacherButtons').style.display = 'none';
    document.getElementById('readingText').style.display = 'none';
    document.getElementById('countersBox').style.display = 'none';
    document.getElementById('finalScore').textContent = formatNumber(state.score);
    document.getElementById('totalQuestions').textContent = formatNumber(state.questions.length);
    showCertificateOption();
    applyNumeralTypeToPage();
    persist();
  }

  function showCertificateOption() {
    if (state.questions.length === 0) return;
    const scorePercentage = (state.score / state.questions.length) * 100;
    const certificateBtn = document.getElementById('certificateBtn');
    const noCertificateMsg = document.getElementById('noCertificateMsg');
    if (scorePercentage >= 80) {
      if (certificateBtn) certificateBtn.style.display = 'block';
      if (noCertificateMsg) noCertificateMsg.style.display = 'none';
    } else {
      if (certificateBtn) certificateBtn.style.display = 'none';
      if (noCertificateMsg) noCertificateMsg.style.display = 'block';
    }
  }

  function openCertificateForm() {
    document.getElementById('certificateForm').style.display = 'block';
  }

  function closeCertificateForm() {
    document.getElementById('certificateForm').style.display = 'none';
  }

  function generateCertificate() {
    const studentName = document.getElementById('studentNameInput').value.trim();
    const teacherName = document.getElementById('teacherNameInput').value.trim();
    if (!studentName) {
      alert('يرجى إدخال اسم الطالب');
      return;
    }
    document.getElementById('certificateStudentName').textContent = studentName;
    document.getElementById('certificateTeacherName').textContent = `المعلم: ${teacherName}`;
    const scoreText = `حققت نتيجة ${formatNumber(
      state.score
    )} من ${formatNumber(state.questions.length)} (${Math.round(
      (state.score / state.questions.length) * 100
    )}%)`;
    document.getElementById('certificateScoreText').textContent = scoreText;
    const mainTitleEl = document.getElementById('quizTitle');
    const certificateTitleEl = document.getElementById('certificateQuizTitle');
    if (mainTitleEl && certificateTitleEl) {
      certificateTitleEl.innerHTML = mainTitleEl.innerHTML;
    }
    const mainLogo = document.getElementById('quizLogo');
    const certificateLogo = document.getElementById('certificateLogo');
    if (mainLogo && mainLogo.src && mainLogo.style.display !== 'none') {
      certificateLogo.src = mainLogo.src;
      certificateLogo.alt = mainLogo.alt || 'شعار';
      certificateLogo.style.display = 'block';
    } else {
      certificateLogo.style.display = 'none';
    }
    closeCertificateForm();
    const certificateContainer = document.getElementById('certificateContainer');
    certificateContainer.style.display = 'block';
    certificateContainer.classList.add('active');
  }

  function closeCertificate() {
    document.getElementById('certificateContainer').style.display = 'none';
  }

  function printCertificate() {
    const certificate = document.getElementById('certificateContainer');
    const originalDisplay = certificate.style.display;
    certificate.style.display = 'block';
    window.print();
    certificate.style.display = originalDisplay;
  }

  function downloadCertificate() {
    const certificate = document.getElementById('certificateContainer');
    const buttons = certificate.querySelector('.certificate-buttons');
    if (buttons) {
      buttons.style.display = 'none';
    }
    html2canvas(certificate, { scale: 2, useCORS: true, logging: false })
      .then((canvas) => {
        const link = document.createElement('a');
        const studentName = document.getElementById('certificateStudentName').textContent.trim();
        link.download = `شهادة_إنجاز_${studentName}.png`;
        link.href = canvas.toDataURL('image/png', 1.0);
        link.click();
      })
      .finally(() => {
        if (buttons) {
          buttons.style.display = 'flex';
        }
      });
  }

  // === From js/ui.js & js/events.js ===
  let draggedItem = null;
  let orderingDraggedItem = null;

  function updateTimerDisplay() {
    document.getElementById('timer').textContent = `الوقت المتبقي: ${formatNumber(state.timeLeft)} ثانية`;
  }

  function updateQuestionCounter() {
    const total = state.questions.length;
    const current = total > 0 ? state.currentQuestion + 1 : 0;
    document.getElementById('questionCounter').textContent = `السؤال ${formatNumber(current)} من ${formatNumber(total)}`;
  }

  function updateScoreCounter() {
    const total = state.questions.length;
    document.getElementById('scoreCounter').textContent = `النتيجة: ${formatNumber(state.score)} من ${formatNumber(total)}`;
  }
  
  function showQuestion() {
    clearInterval(state.timerId);
    state.timerId = null;
    state.timeLeft = state.questionTime;

    const readingTextElement = document.getElementById('readingText');
    const questionElement = document.getElementById('question');
    const optionsElement = document.getElementById('options');
    const controls = document.querySelector('.quiz-box .controls');

    if (!Array.isArray(state.questions) || state.questions.length === 0) {
        if (readingTextElement) readingTextElement.style.display = 'none';
        if (questionElement) questionElement.innerHTML = '';
        if (optionsElement) optionsElement.innerHTML = '';
        const progressEl = document.getElementById('progress');
        if (progressEl) progressEl.style.width = '0%';
        updateQuestionCounter();
        updateScoreCounter();
        updateTimerDisplay();
        const qb = document.querySelector('.quiz-box');
        const sb = document.getElementById('scoreBoard');
        const cb = document.getElementById('countersBox');
        if (qb) qb.style.display = 'block';
        if (sb) sb.style.display = 'none';
        if (cb) cb.style.display = 'flex';
        const prev = document.getElementById('prevBtn');
        const next = document.getElementById('nextBtn');
        if (prev) prev.disabled = true;
        if (next) next.disabled = true;
        const pause = document.getElementById('pauseBtn');
        if (pause) {
            pause.textContent = 'إيقاف مؤقت';
            pause.style.background = '#ffc107';
            pause.style.color = '#000';
        }
        state.isPaused = false;
        return;
    }

    if (state.currentQuestion >= state.questions.length) {
        showResult();
        return;
    }

    const q = getCurrentQuestionOrCreate();

    readingTextElement.innerHTML = '';
    if (q.reading && (q.reading.text || q.reading.image || q.reading.audio)) {
        readingTextElement.style.display = 'block';
        if (q.reading.text) {
            const d = document.createElement('div');
            d.className = 'reading-text-content';
            d.innerHTML = formatQuizContent(q.reading.text);
            readingTextElement.appendChild(d);
        }
        if (q.reading.audio) {
            const aud = document.createElement('audio');
            aud.controls = true;
            aud.preload = 'none';
            aud.src = q.reading.audio;
            aud.style.width = '100%';
            aud.style.margin = '8px 0';
            readingTextElement.appendChild(aud);
        }
        if (q.reading.image) {
            const img = document.createElement('img');
            img.src = q.reading.image;
            img.className = 'reading-text-image';
            img.loading = 'lazy';
            img.decoding = 'async';
            img.alt = 'Reading image';
            readingTextElement.appendChild(img);
        }
    } else {
        readingTextElement.style.display = 'none';
    }

    questionElement.innerHTML = '';
    const questionContent = document.createElement('div');
    questionContent.className = 'question-content';
    if (q.question?.text) {
        const d = document.createElement('div');
        d.className = 'question-text';
        d.innerHTML = formatQuizContent(q.question.text);
        questionContent.appendChild(d);
    }
    if (q.question?.image) {
        const i = document.createElement('img');
        i.src = q.question.image;
        i.className = 'question-image';
        i.loading = 'lazy';
        i.decoding = 'async';
        i.alt = 'Question image';
        questionContent.appendChild(i);
    }
    questionElement.appendChild(questionContent);

    optionsElement.innerHTML = '';
    if (controls) controls.style.display = 'flex';

    if (q.type === 'multiple-choice') {
        optionsElement.className = 'options';
        optionsElement.setAttribute('role', 'radiogroup');
        const map = shuffleOptionsOnce(state.currentQuestion);
        const valid = [];
        map.forEach((origIdx) => {
            const opt = q.options[origIdx];
            if (!opt || (!opt.text && !opt.image)) return;
            const wrap = document.createElement('div');
            wrap.className = 'option';
            wrap.setAttribute('role', 'radio');
            wrap.setAttribute('tabindex', '0');
            wrap.setAttribute('aria-checked', 'false');
            const content = document.createElement('div');
            content.className = 'option-content';
            if (opt.image) {
                const img = document.createElement('img');
                img.src = opt.image;
                img.className = 'option-image';
                img.loading = 'lazy';
                img.decoding = 'async';
                img.alt = 'Option image';
                content.appendChild(img);
            }
            if (opt.text) {
                const span = document.createElement('span');
                span.className = 'option-text';
                span.innerHTML = formatQuizContent(opt.text);
                content.appendChild(span);
            }
            wrap.appendChild(content);
            if (state.answeredQuestions[state.currentQuestion] !== null) {
                wrap.setAttribute('aria-disabled', 'true');
                if (origIdx === q.correct) wrap.classList.add('correct');
                if (state.answeredQuestions[state.currentQuestion] === false && state.lastWrong[state.currentQuestion] === origIdx) {
                    wrap.classList.add('wrong');
                }
            } else {
                wrap.onclick = () => checkAnswer(origIdx);
                wrap.onkeydown = (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        checkAnswer(origIdx);
                    }
                };
            }
            valid.push(wrap);
        });
        applyLayoutSafely(valid.length);
        valid.forEach((v) => optionsElement.appendChild(v));
    } else if (q.type === 'fill-in-the-blank') {
        optionsElement.className = '';
        optionsElement.removeAttribute('role');
        const container = document.createElement('form');
        container.className = 'fill-in-blank-container';
        container.onsubmit = (e) => {
            e.preventDefault();
            checkAnswer(input.value);
        };
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'fill-in-blank-input';
        input.placeholder = 'اكتب إجابتك هنا';
        const submitBtn = document.createElement('button');
        submitBtn.type = 'submit';
        submitBtn.textContent = 'تأكيد الإجابة';
        submitBtn.className = 'nav-btn';
        container.appendChild(input);
        container.appendChild(submitBtn);
        optionsElement.appendChild(container);
        if (state.answeredQuestions[state.currentQuestion] !== null) {
            input.value = state.lastWrong[state.currentQuestion] || '';
            input.disabled = true;
            submitBtn.style.display = 'none';
            input.classList.add(state.answeredQuestions[state.currentQuestion] ? 'correct' : 'wrong');
            if (!state.answeredQuestions[state.currentQuestion]) {
                const correctAnswerDisplay = document.createElement('div');
                correctAnswerDisplay.className = 'correct-answer-display';
                correctAnswerDisplay.textContent = `الإجابة الصحيحة: ${q.correctAnswer.split('|')[0]}`;
                container.appendChild(correctAnswerDisplay);
            }
        }
    } else if (q.type === 'true-false') {
        optionsElement.className = 'options options-two';
        optionsElement.removeAttribute('role');
        const wasAnswered = state.answeredQuestions[state.currentQuestion] !== null;
        const trueBtn = document.createElement('div');
        trueBtn.className = 'option';
        trueBtn.textContent = 'صح';
        if (!wasAnswered) {
            trueBtn.onclick = () => checkAnswer(true);
        } else {
            trueBtn.setAttribute('aria-disabled', 'true');
            if (q.correctAnswer === true) trueBtn.classList.add('correct');
            if (state.lastWrong[state.currentQuestion] === true && q.correctAnswer === false)
                trueBtn.classList.add('wrong');
        }
        const falseBtn = document.createElement('div');
        falseBtn.className = 'option';
        falseBtn.textContent = 'خطأ';
        if (!wasAnswered) {
            falseBtn.onclick = () => checkAnswer(false);
        } else {
            falseBtn.setAttribute('aria-disabled', 'true');
            if (q.correctAnswer === false) falseBtn.classList.add('correct');
            if (state.lastWrong[state.currentQuestion] === false && q.correctAnswer === true)
                falseBtn.classList.add('wrong');
        }
        optionsElement.appendChild(trueBtn);
        optionsElement.appendChild(falseBtn);
    } else if (q.type === 'short-answer') {
        optionsElement.className = '';
        const container = document.createElement('form');
        container.className = 'short-answer-container';
        container.onsubmit = (e) => {
            e.preventDefault();
            checkAnswer(textarea.value);
        };
        const textarea = document.createElement('textarea');
        textarea.className = 'short-answer-textarea';
        textarea.placeholder = 'اكتب إجابتك هنا...';
        const submitBtn = document.createElement('button');
        submitBtn.type = 'submit';
        submitBtn.textContent = 'تأكيد الإجابة';
        submitBtn.className = 'nav-btn';
        container.appendChild(textarea);
        container.appendChild(submitBtn);
        optionsElement.appendChild(container);

        if (state.answeredQuestions[state.currentQuestion] !== null) {
            textarea.value = state.lastWrong[state.currentQuestion] || '';
            textarea.disabled = true;
            submitBtn.style.display = 'none';
            textarea.classList.add(state.answeredQuestions[state.currentQuestion] ? 'correct' : 'wrong');
            if (!state.answeredQuestions[state.currentQuestion]) {
                const correctAnswerDisplay = document.createElement('div');
                correctAnswerDisplay.className = 'correct-answer-display';
                correctAnswerDisplay.textContent = `الإجابة النموذجية: ${q.correctAnswer}`;
                container.appendChild(correctAnswerDisplay);
            }
        }
    } else if (q.type === 'matching') {
        optionsElement.className = '';

        const container = document.createElement('div');
        container.className = 'matching-container';

        const promptsColumn = document.createElement('div');
        promptsColumn.className = 'matching-column';
        const answersColumn = document.createElement('div');
        answersColumn.className = 'matching-column';

        const shuffledAnswers = (q.answers || [])
            .map((answer, index) => ({
                text: answer,
                originalIndex: index,
            }))
            .sort(() => Math.random() - 0.5);

        (q.prompts || []).forEach((promptText, index) => {
            const promptItem = document.createElement('div');
            promptItem.className = 'matching-prompt-item';

            const text = document.createElement('span');
            text.className = 'prompt-text';
            text.innerHTML = formatQuizContent(promptText);
            promptItem.appendChild(text);

            const dropZone = document.createElement('div');
            dropZone.className = 'drop-zone';
            dropZone.dataset.index = index;
            promptItem.appendChild(dropZone);
            promptsColumn.appendChild(promptItem);

            if (state.answeredQuestions[state.currentQuestion] === null) {
                dropZone.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    dropZone.classList.add('over');
                });
                dropZone.addEventListener('dragleave', () =>
                    dropZone.classList.remove('over')
                );
                dropZone.addEventListener('drop', (e) => {
                    e.preventDefault();
                    dropZone.classList.remove('over');
                    if (draggedItem && (dropZone.children.length === 0 || e.target === dropZone)) {
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
            const answerItem = document.createElement('div');
            answerItem.className = 'answer-item';
            answerItem.draggable = true;
            answerItem.dataset.originalIndex = answerData.originalIndex;
            answerItem.innerHTML = formatQuizContent(answerData.text);
            answersColumn.appendChild(answerItem);

            if (state.answeredQuestions[state.currentQuestion] === null) {
                answerItem.addEventListener('dragstart', () => {
                    draggedItem = answerItem;
                    setTimeout(() => answerItem.classList.add('dragging'), 0);
                });
                answerItem.addEventListener('dragend', () =>
                    answerItem.classList.remove('dragging')
                );
            }
        });

        container.appendChild(promptsColumn);
        container.appendChild(answersColumn);
        optionsElement.appendChild(container);

        if (state.answeredQuestions[state.currentQuestion] === null) {
            const btnContainer = document.createElement('div');
            btnContainer.style.textAlign = 'center';
            const submitBtn = document.createElement('button');
            submitBtn.textContent = 'تأكيد الإجابة';
            submitBtn.className = 'nav-btn';
            submitBtn.style.marginTop = '20px';
            submitBtn.onclick = () => checkAnswer(null);
            btnContainer.appendChild(submitBtn);
            optionsElement.appendChild(btnContainer);
        } else {
            promptsColumn.querySelectorAll('.drop-zone').forEach((dz) => {
                dz.innerHTML = '';
                const promptIndex = parseInt(dz.dataset.index, 10);
                const userAnswers = state.lastWrong[state.currentQuestion];
                const userAnswerIndex = Array.isArray(userAnswers) && userAnswers[0] !== undefined ?
                    userAnswers[promptIndex] :
                    null;

                if (userAnswerIndex !== null && userAnswerIndex !== undefined) {
                    const answerText = q.answers[userAnswerIndex];
                    const answerItem = document.createElement('div');
                    answerItem.className = 'answer-item';
                    answerItem.innerHTML = formatQuizContent(answerText);
                    dz.appendChild(answerItem);
                }

                if (userAnswerIndex === promptIndex) {
                    dz.classList.add('correct');
                } else {
                    dz.classList.add('wrong');
                }
            });
            answersColumn.style.display = 'none';
        }
    } else if (q.type === 'ordering') {
        optionsElement.className = '';
        const container = document.createElement('div');
        container.className = 'ordering-container';

        const shuffledItems = (q.items || []).slice().sort(() => Math.random() - 0.5);

        shuffledItems.forEach((itemText) => {
            const itemEl = document.createElement('div');
            itemEl.className = 'ordering-item';
            itemEl.draggable = true;
            itemEl.dataset.originalText = itemText;
            itemEl.innerHTML = formatQuizContent(itemText);
            container.appendChild(itemEl);
        });

        optionsElement.appendChild(container);

        const wasAnswered = state.answeredQuestions[state.currentQuestion] !== null;

        if (!wasAnswered) {
            const items = container.querySelectorAll('.ordering-item');
            items.forEach((item) => {
                item.addEventListener('dragstart', () => {
                    orderingDraggedItem = item;
                    setTimeout(() => item.classList.add('dragging'), 0);
                });
                item.addEventListener('dragend', () => {
                    item.classList.remove('dragging');
                });
            });

            container.addEventListener('dragover', (e) => {
                e.preventDefault();
                const afterElement = getDragAfterElement(container, e.clientY);
                if (afterElement == null) {
                    container.appendChild(orderingDraggedItem);
                } else {
                    container.insertBefore(orderingDraggedItem, afterElement);
                }
            });

            const btnContainer = document.createElement('div');
            btnContainer.style.textAlign = 'center';
            const submitBtn = document.createElement('button');
            submitBtn.textContent = 'تأكيد الإجابة';
            submitBtn.className = 'nav-btn';
            submitBtn.style.marginTop = '20px';
            submitBtn.onclick = () => checkAnswer(null);
            btnContainer.appendChild(submitBtn);
            optionsElement.appendChild(btnContainer);
        } else {
            container.innerHTML = '';
            const userOrder = state.lastWrong[state.currentQuestion] || [];
            userOrder.forEach((itemText) => {
                const itemEl = document.createElement('div');
                itemEl.className = 'ordering-item';
                itemEl.draggable = false;
                itemEl.innerHTML = formatQuizContent(itemText);
                container.appendChild(itemEl);
            });

            if (state.answeredQuestions[state.currentQuestion]) {
                container.classList.add('correct');
            } else {
                container.classList.add('wrong');
                const correctOrderDisplay = document.createElement('div');
                correctOrderDisplay.className = 'correct-order-display';
                let listHTML = '<strong>الترتيب الصحيح:</strong><ol>';
                (q.items || []).forEach((item) => {
                    listHTML += `<li>${item}</li>`;
                });
                listHTML += '</ol>';
                correctOrderDisplay.innerHTML = listHTML;
                optionsElement.appendChild(correctOrderDisplay);
            }
        }
    }

    const progressEl = document.getElementById('progress');
    if (progressEl) {
        const total = Array.isArray(state.questions) ? state.questions.length : 0;
        const pct = total > 0 ? (state.currentQuestion / total) * 100 : 0;
        progressEl.style.width = pct + '%';
    }

    document.getElementById('prevBtn').disabled = state.currentQuestion === 0;
    document.getElementById('nextBtn').disabled = false;

    updateQuestionCounter();
    updateScoreCounter();
    updateTimerDisplay();
    startTimer();
    persist();
}
  
  function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.ordering-item:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  function shuffleOptionsOnce(qIndex) {
    if (state.shuffledMaps[qIndex]) return state.shuffledMaps[qIndex];
    const q = state.questions[qIndex];
    if (q.type !== 'multiple-choice') return [];
    const map = (q.options || []).map((_, i) => i);
    for (let i = map.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [map[i], map[j]] = [map[j], map[i]];
    }
    state.shuffledMaps[qIndex] = map;
    return map;
  }
  
  function applyLayoutSafely(optionCount) {
    const el = document.getElementById('options');
    if (!el) return;
    if (canApplyChosenLayout(state.optionsLayout, optionCount))
        el.dataset.layout = '4x1';
    else delete el.dataset.layout;
  }

  function canApplyChosenLayout(layout, optionCount) {
    if (layout === '4x1')
        return (optionCount === 4 && window.matchMedia('(min-width: 769px)').matches);
    return false;
  }
  
  function applyNumeralTypeToPage() {
    const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT']);
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE)
        node.nodeValue = convertNumeralsInText(node.nodeValue);
      else if (
        node.nodeType === Node.ELEMENT_NODE &&
        !SKIP.has(node.tagName)
      ) {
        for (let i = 0; i < node.childNodes.length; i++)
          walk(node.childNodes[i]);
      }
    }
    const targets = [
      document.body,
      document.getElementById('readingText'),
      document.getElementById('question'),
      document.getElementById('options'),
      document.getElementById('scoreBoard'),
      document.getElementById('quizTitle'),
      document.getElementById('instructions'),
      document.getElementById('quizFooter'),
      document.getElementById('teacherFooter'),
    ];
    targets.forEach((el) => {
      if (el) walk(el);
    });
    const fs = document.getElementById('finalScore');
    const tq = document.getElementById('totalQuestions');
    if (fs) fs.textContent = convertNumeralsInText(fs.textContent);
    if (tq) tq.textContent = convertNumeralsInText(tq.textContent);
  }

  function checkAnswer(userAnswer) {
    if (state.answeredQuestions[state.currentQuestion] !== null) return;
    const q = getCurrentQuestionOrCreate();
    let isCorrect = false;

    if (q.type === 'multiple-choice') {
        isCorrect = userAnswer === q.correct;
        state.lastWrong[state.currentQuestion] = userAnswer;
    } else if (q.type === 'fill-in-the-blank') {
        const correctAnswers = q.correctAnswer.split('|').map((a) => a.trim().toLowerCase());
        const userAnswerTrimmed = (userAnswer || '').toString().trim().toLowerCase();
        isCorrect = correctAnswers.includes(userAnswerTrimmed);
        state.lastWrong[state.currentQuestion] = userAnswer;
    } else if (q.type === 'true-false') {
        isCorrect = userAnswer === q.correctAnswer;
        state.lastWrong[state.currentQuestion] = userAnswer;
    } else if (q.type === 'short-answer') {
        isCorrect = checkShortAnswerSimilarity(userAnswer, q.correctAnswer);
        state.lastWrong[state.currentQuestion] = userAnswer;
    } else if (q.type === 'matching') {
        const dropZones = document.querySelectorAll('.drop-zone');
        const answersColumn = document.querySelector('.matching-column:last-child');
        if (dropZones.length + answersColumn.children.length !== q.prompts.length) {
            alert('يرجى مطابقة جميع العناصر قبل تأكيد الإجابة.');
            return;
        }
        let correctMatches = 0;
        const userAnswers = [];
        dropZones.forEach((zone, index) => {
            const answerItem = zone.querySelector('.answer-item');
            const originalIndex = answerItem ?
                parseInt(answerItem.dataset.originalIndex, 10) :
                null;
            userAnswers[index] = originalIndex;
            if (originalIndex === index) {
                correctMatches++;
                zone.classList.add('correct');
            } else {
                zone.classList.add('wrong');
            }
            if (answerItem) answerItem.draggable = false;
        });
        isCorrect = correctMatches === q.prompts.length;
        state.lastWrong[state.currentQuestion] = userAnswers;
        document.querySelector('#options .nav-btn')?.parentElement.remove();
    } else if (q.type === 'ordering') {
        const container = document.querySelector('.ordering-container');
        const orderedItems = [...container.querySelectorAll('.ordering-item')];
        const userOrder = orderedItems.map((item) => item.dataset.originalText);
        isCorrect = JSON.stringify(userOrder) === JSON.stringify(q.items);
        state.lastWrong[state.currentQuestion] = userOrder;
        container.classList.add(isCorrect ? 'correct' : 'wrong');
        orderedItems.forEach((item) => (item.draggable = false));
        document.querySelector('#options .nav-btn')?.parentElement.remove();
        if (!isCorrect) {
            const correctOrderDisplay = document.createElement('div');
            correctOrderDisplay.className = 'correct-order-display';
            let listHTML = '<strong>الترتيب الصحيح:</strong><ol>';
            q.items.forEach((item) => {
                listHTML += `<li>${item}</li>`;
            });
            listHTML += '</ol>';
            correctOrderDisplay.innerHTML = listHTML;
            container.parentElement.appendChild(correctOrderDisplay);
        }
    }

    state.answeredQuestions[state.currentQuestion] = isCorrect;
    if (isCorrect) {
        state.score++;
    }

    updateScoreCounter();
    persist();

    if (q.type !== 'matching' && q.type !== 'ordering') {
        showQuestion();
    }

    setTimeout(() => {
        if (state.currentQuestion < state.questions.length - 1) {
            nextQuestion();
        } else {
            showResult();
        }
    }, 1500);
  }

  function nextQuestion() {
    if (!state.questions.length) return;
    if (state.currentQuestion >= state.questions.length - 1) {
        showResult();
        return;
    }
    state.currentQuestion++;
    showQuestion();
  }

  function previousQuestion() {
    if (!state.questions.length) return;
    if (state.currentQuestion > 0) {
        state.currentQuestion--;
        showQuestion();
    }
  }

  function togglePause() {
    if (!Array.isArray(state.questions) || state.questions.length === 0) return;
    const b = document.getElementById('pauseBtn');
    if (!state.isPaused) {
        state.isPaused = true;
        clearInterval(state.timerId);
        if (b) {
            b.textContent = 'استئناف';
            b.style.background = '#28a745';
            b.style.color = '#fff';
        }
        return;
    }
    state.isPaused = false;
    if (b) {
        b.textContent = 'إيقاف مؤقت';
        b.style.background = '#ffc107';
        b.style.color = '#000';
    }
    startTimer();
  }

  function changeNumeralType() {
    const selects = Array.from(document.querySelectorAll('#numeralType'));
    const visible = selects.find((s) => s && s.offsetParent !== null) || selects[0];
    if (visible) state.numeralType = visible.value || state.numeralType;
    updateQuestionCounter();
    updateScoreCounter();
    updateTimerDisplay();
    applyNumeralTypeToPage();
    persist();
    selects.forEach((s) => {
      if (s && s.value !== state.numeralType) s.value = state.numeralType;
    });
  }

  function changeQuestionTime() {
    const v = parseInt(document.getElementById('questionTime').value, 10);
    if (v >= 5 && v <= 180) {
      state.questionTime = v;
      state.timeLeft = v;
      updateTimerDisplay();
      persist();
    }
  }

  function changeOptionsLayout() {
    const sel = document.getElementById('optionsLayout');
    const val = (sel && sel.value) || '2x2';
    state.optionsLayout = val === '4x1' ? '4x1' : '2x2';
    persist();
    showQuestion();
  }

  // === From js/editor.js ===
  function handleBinaryUpload(input, previewId, setter, isAudio = false) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = e.target.result;
        const prevEl = document.getElementById(previewId);
        if (prevEl) {
            if (isAudio) {
                prevEl.src = data;
                prevEl.style.display = 'block';
                prevEl.load && prevEl.load();
            } else {
                prevEl.src = data;
                prevEl.style.display = 'block';
            }
        }
        try {
            setter(data);
            persist();
        } catch {}
    };
    reader.readAsDataURL(file);
  }

  async function pasteImageFromClipboard(previewId, setter) {
    try {
        if (!navigator.clipboard || !navigator.clipboard.read) {
            alert('متصفحك لا يدعم لصق الصور مباشرة. يرجى تحديث المتصفح أو استخدام خيار رفع الملفات.');
            return;
        }
        const items = await navigator.clipboard.read();
        for (const item of items) {
            const type = item.types?.find((t) => t.startsWith('image/'));
            if (!type) continue;
            const blob = await item.getType(type);
            const reader = new FileReader();
            reader.onload = (e) => {
                const base64 = e.target.result;
                const prevEl = document.getElementById(previewId);
                if (prevEl) {
                    prevEl.src = base64;
                    prevEl.style.display = 'block';
                }
                try {
                    setter(base64);
                    persist();
                } catch {}
            };
            reader.readAsDataURL(blob);
            return;
        }
        alert('لا توجد صورة في الحافظة.');
    } catch (err) {
        console.error(err);
        alert('حدث خطأ أثناء جلب الصورة من الحافظة. يرجى المحاولة مجددًا.');
    }
  }

  function clearMedia(previewId, inputId, setter, isAudio = false) {
    const prev = document.getElementById(previewId);
    if (prev) {
        if (isAudio) {
            prev.removeAttribute('src');
            prev.style.display = 'none';
            prev.load && prev.load();
        } else {
            prev.src = '';
            prev.style.display = 'none';
        }
    }
    if (inputId) {
        const inp = document.getElementById(inputId);
        if (inp) inp.value = '';
    }
    try {
        setter(null);
        persist();
    } catch {}
  }
  
  function toggleEditMode() {
    const editPanel = document.getElementById('editPanel');
    const quizBox = document.querySelector('.quiz-box');
    const countersBox = document.getElementById('countersBox');
    const readingText = document.getElementById('readingText');

    if (!Array.isArray(state.questions) || state.questions.length === 0) {
        addNewQuestion(true);
    }

    if (editPanel.style.display === 'block') {
        editPanel.style.display = 'none';
        quizBox.style.display = 'block';
        countersBox.style.display = 'flex';
        const q = getCurrentQuestionOrCreate();
        readingText.style.display =
            q && q.reading && (q.reading.text || q.reading.image || q.reading.audio) ?
            'block' :
            'none';
        startTimer();
        return;
    }

    clearInterval(state.timerId);
    editPanel.style.display = 'block';
    quizBox.style.display = 'none';
    countersBox.style.display = 'none';
    readingText.style.display = 'none';

    populateEditForm();
  }

  function populateEditForm() {
    const q = getCurrentQuestionOrCreate();
    if (!q) return;

    document.getElementById('editQuestionType').value = q.type || 'multiple-choice';

    const mcEditor = document.getElementById('multipleChoiceEditor');
    const fibEditor = document.getElementById('fillInTheBlankEditor');
    const tfEditor = document.getElementById('trueFalseEditor');
    const saEditor = document.getElementById('shortAnswerEditor');
    const matchingEditor = document.getElementById('matchingEditor');
    const orderingEditor = document.getElementById('orderingEditor');

    mcEditor.style.display = 'none';
    fibEditor.style.display = 'none';
    tfEditor.style.display = 'none';
    saEditor.style.display = 'none';
    matchingEditor.style.display = 'none';
    orderingEditor.style.display = 'none';

    if (q.type === 'fill-in-the-blank') {
        fibEditor.style.display = 'block';
        document.getElementById('editCorrectAnswer').value = q.correctAnswer || '';
    } else if (q.type === 'true-false') {
        tfEditor.style.display = 'block';
        const radios = document.querySelectorAll('input[name="correctTFAnswer"]');
        radios.forEach((radio) => {
            radio.checked = radio.value === String(q.correctAnswer);
        });
    } else if (q.type === 'short-answer') {
        saEditor.style.display = 'block';
        document.getElementById('editShortAnswer').value = q.correctAnswer || '';
    } else if (q.type === 'matching') {
        matchingEditor.style.display = 'block';
        for (let i = 0; i < 4; i++) {
            document.getElementById(`editMatchPrompt${i + 1}`).value = q.prompts[i] || '';
            document.getElementById(`editMatchAnswer${i + 1}`).value = q.answers[i] || '';
        }
    } else if (q.type === 'ordering') {
        orderingEditor.style.display = 'block';
        for (let i = 0; i < 5; i++) {
            document.getElementById(`editOrderItem${i + 1}`).value = q.items[i] || '';
        }
    } else { // multiple-choice
        mcEditor.style.display = 'block';
        for (let i = 0; i < 4; i++) {
            const opt = q.options && q.options[i] ? q.options[i] : { text: '', image: null };
            document.getElementById('editOption' + (i + 1)).value = opt.text || '';
            const p = document.getElementById('optionImagePreview' + (i + 1));
            p.src = opt.image || '';
            p.style.display = opt.image ? 'block' : 'none';
            document.getElementById('correct' + (i + 1)).checked = i === (q.correct || 0);
            document.getElementById('editOptionImage' + (i + 1)).value = '';
        }
    }

    document.getElementById('editReadingText').value = q.reading?.text || '';
    const rPrev = document.getElementById('readingImagePreview');
    rPrev.src = q.reading?.image || '';
    rPrev.style.display = q.reading?.image ? 'block' : 'none';
    document.getElementById('editReadingImage').value = '';

    const aPrev = document.getElementById('readingAudioPreview');
    aPrev.src = q.reading?.audio || '';
    aPrev.style.display = q.reading?.audio ? 'block' : 'none';
    document.getElementById('editReadingAudio').value = '';

    document.getElementById('editQuestionText').value = q.question?.text || '';
    const qPrev = document.getElementById('questionImagePreview');
    qPrev.src = q.question?.image || '';
    qPrev.style.display = q.question?.image ? 'block' : 'none';
    document.getElementById('editQuestionImage').value = '';
  }

  function attachEditPanelEvents() {
    document.getElementById('editQuestionType').onchange = (e) => {
        const q = getCurrentQuestionOrCreate();
        const newType = e.target.value;
        if (newType === q.type) return;

        q.type = newType;
        ensureQuestionSanity(q);
        populateEditForm();
        persist();
    };

    function ensureOption(q, idx) {
        if (!q.options) q.options = [];
        if (!q.options[idx]) q.options[idx] = { text: '', image: null };
    }
    document.getElementById('editReadingImage').onchange = function() {
        const q = getCurrentQuestionOrCreate();
        handleBinaryUpload(this, 'readingImagePreview', (base64) => {
            q.reading.image = base64;
        });
    };
    document.getElementById('readingImagePasteBtn').onclick = () => {
        const q = getCurrentQuestionOrCreate();
        pasteImageFromClipboard('readingImagePreview', (base64) => {
            q.reading.image = base64;
        });
    };
    document.getElementById('readingImageClearBtn').onclick = () => {
        const q = getCurrentQuestionOrCreate();
        clearMedia('readingImagePreview', 'editReadingImage', () => {
            q.reading.image = null;
        });
    };
    document.getElementById('insertReadingAudioBtn').onclick = () => {
        document.getElementById('editReadingAudio').click();
    };

    document.getElementById('editQuestionImage').onchange = function() {
        const q = getCurrentQuestionOrCreate();
        handleBinaryUpload(this, 'questionImagePreview', (base64) => {
            q.question.image = base64;
        });
    };
    document.getElementById('questionImagePasteBtn').onclick = () => {
        const q = getCurrentQuestionOrCreate();
        pasteImageFromClipboard('questionImagePreview', (base64) => {
            q.question.image = base64;
        });
    };
    document.getElementById('questionImageClearBtn').onclick = () => {
        const q = getCurrentQuestionOrCreate();
        clearMedia('questionImagePreview', 'editQuestionImage', () => {
            q.question.image = null;
        });
    };

    for (let i = 1; i <= 4; i++) {
        document.getElementById('editOptionImage' + i).onchange = (function(ii) {
            return function() {
                const q = getCurrentQuestionOrCreate();
                ensureOption(q, ii - 1);
                handleBinaryUpload(this, 'optionImagePreview' + ii, (base64) => {
                    q.options[ii - 1].image = base64;
                });
            };
        })(i);

        document.getElementById('optionImagePasteBtn' + i).onclick = (function(ii) {
            return function() {
                const q = getCurrentQuestionOrCreate();
                ensureOption(q, ii - 1);
                pasteImageFromClipboard('optionImagePreview' + ii, (base64) => {
                    q.options[ii - 1].image = base64;
                });
            };
        })(i);

        document.getElementById('optionImageClearBtn' + i).onclick = (function(ii) {
            return function() {
                const q = getCurrentQuestionOrCreate();
                ensureOption(q, ii - 1);
                clearMedia('optionImagePreview' + ii, 'editOptionImage' + ii, () => {
                    q.options[ii - 1].image = null;
                });
            };
        })(i);

        document.getElementById('correct' + i).onchange = (function(ii) {
            return function() {
                if (!this.checked) return;
                const q = getCurrentQuestionOrCreate();
                q.correct = ii - 1;
                persist();
            };
        })(i);
    }

    document.getElementById('editReadingAudio').onchange = function() {
        const q = getCurrentQuestionOrCreate();
        handleBinaryUpload(this, 'readingAudioPreview', (base64) => {
            q.reading.audio = base64;
        }, true);
    };
    document.getElementById('readingAudioClearBtn').onclick = () => {
        const q = getCurrentQuestionOrCreate();
        clearMedia('readingAudioPreview', 'editReadingAudio', () => {
            q.reading.audio = null;
        }, true);
    };
  }
  
  function saveEdit() {
    const q = state.questions[state.currentQuestion];
    if (!q) return;

    if (!q.reading) q.reading = { text: '', image: null, audio: null };
    if (!q.question) q.question = { text: '', image: null };

    const questionType = document.getElementById('editQuestionType').value;
    if (q.type !== questionType) {
        q.type = questionType;
        ensureQuestionSanity(q);
    }

    q.reading.text = (document.getElementById('editReadingText').value || '').trim();
    q.question.text = (document.getElementById('editQuestionText').value || '').trim();

    if (q.type === 'multiple-choice') {
        const optTexts = [
            (document.getElementById('editOption1').value || '').trim(),
            (document.getElementById('editOption2').value || '').trim(),
            (document.getElementById('editOption3').value || '').trim(),
            (document.getElementById('editOption4').value || '').trim(),
        ];
        for (let i = 0; i < 4; i++) {
            if (!q.options[i]) q.options[i] = { text: '', image: null };
            q.options[i].text = optTexts[i];
        }
        const filledIndices = q.options.map((o, idx) => (o && (o.text?.trim() || o.image) ? idx : -1)).filter((i) => i >= 0);
        if (filledIndices.length < 2) {
            alert('يجب إدخال خيارين على الأقل (نصًا أو صورة) قبل الحفظ.');
            return;
        }
        const correctRadio = document.querySelector('input[name="correctOption"]:checked');
        const correctIndex = correctRadio ? parseInt(correctRadio.value, 10) : -1;
        if (correctIndex < 0 || !filledIndices.includes(correctIndex)) {
            alert('يجب اختيار إجابة صحيحة من ضمن الخيارات المعبأة.');
            return;
        }
        q.correct = correctIndex;
    } else if (q.type === 'fill-in-the-blank') {
        q.correctAnswer = (document.getElementById('editCorrectAnswer').value || '').trim();
        if (!q.correctAnswer) {
            alert("يرجى إدخال إجابة صحيحة لسؤال 'املأ الفراغ'.");
            return;
        }
    } else if (q.type === 'true-false') {
        const correctRadio = document.querySelector('input[name="correctTFAnswer"]:checked');
        if (!correctRadio) {
            alert("يرجى اختيار 'صح' أو 'خطأ' كإجابة صحيحة.");
            return;
        }
        q.correctAnswer = correctRadio.value === 'true';
    } else if (q.type === 'short-answer') {
        q.correctAnswer = (document.getElementById('editShortAnswer').value || '').trim();
        if (!q.correctAnswer) {
            alert("يرجى إدخال الإجابة النموذجية لسؤال 'الإجابة القصيرة'.");
            return;
        }
    } else if (q.type === 'matching') {
        const prompts = [];
        const answers = [];
        for (let i = 1; i <= 4; i++) {
            const promptText = (document.getElementById(`editMatchPrompt${i}`).value || '').trim();
            const answerText = (document.getElementById(`editMatchAnswer${i}`).value || '').trim();
            if (promptText && answerText) {
                prompts.push(promptText);
                answers.push(answerText);
            }
        }
        if (prompts.length < 2) {
            alert('يجب إدخال زوجين على الأقل للمطابقة.');
            return;
        }
        q.prompts = prompts;
        q.answers = answers;
    } else if (q.type === 'ordering') {
        const items = [];
        for (let i = 1; i <= 5; i++) {
            const itemText = (document.getElementById(`editOrderItem${i}`).value || '').trim();
            if (itemText) {
                items.push(itemText);
            }
        }
        if (items.length < 2) {
            alert('يجب إدخال عنصرين على الأقل للترتيب.');
            return;
        }
        q.items = items;
    }

    persist();
    addNewQuestion();
  }

  function cancelEdit() {
    document.getElementById('editPanel').style.display = 'none';
    document.querySelector('.quiz-box').style.display = 'block';
    document.getElementById('countersBox').style.display = 'flex';
    const q = getCurrentQuestionOrCreate();
    const hasReading = q && q.reading && (q.reading.text || q.reading.image || q.reading.audio);
    document.getElementById('readingText').style.display = hasReading ? 'block' : 'none';
    startTimer();
  }

  function duplicateCurrentQuestion() {
    const src = getCurrentQuestionOrCreate();
    const clone = JSON.parse(JSON.stringify(src));
    state.questions.splice(state.currentQuestion + 1, 0, clone);
    state.currentQuestion++;
    state.answeredQuestions.splice(state.currentQuestion, 0, null);
    state.lastWrong.splice(state.currentQuestion, 0, null);
    state.shuffledMaps.splice(state.currentQuestion, 0, null);
    persist();
    const editPanel = document.getElementById('editPanel');
    if (editPanel && editPanel.style.display === 'block') populateEditForm();
    else showQuestion();
  }

  function addNewQuestion(isInitial = false) {
    const newQ = { type: 'multiple-choice' };
    ensureQuestionSanity(newQ);

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
    populateEditForm();
    persist();
  }

  function deleteCurrentQuestion() {
    if (!Array.isArray(state.questions) || state.questions.length <= 1) {
        alert('لا يمكن حذف السؤال الوحيد!');
        return;
    }
    if (!confirm('هل أنت متأكد من حذف هذا السؤال؟')) return;

    state.questions.splice(state.currentQuestion, 1);
    state.answeredQuestions.splice(state.currentQuestion, 1);
    state.lastWrong.splice(state.currentQuestion, 1);
    state.shuffledMaps.splice(state.currentQuestion, 1);

    if (state.currentQuestion >= state.questions.length) {
        state.currentQuestion = state.questions.length - 1;
    }

    persist();
    populateEditForm();
  }

  function cleanEasternNumerals() {
    if (!Array.isArray(state.questions)) return;
    function eastToLatin(t) {
      return (t || '')
        .toString()
        .replace(/[٠-٩]/g, (d) => EASTERN.indexOf(d));
    }
    state.questions.forEach((q) => {
      if (q.reading?.text) q.reading.text = eastToLatin(q.reading.text);
      if (q.question?.text) q.question.text = eastToLatin(q.question.text);
      if (q.type === 'multiple-choice' && Array.isArray(q.options))
        q.options.forEach((o) => {
          if (o?.text) o.text = eastToLatin(o.text);
        });
    });
    alert('تم تحويل الأرقام الشرقية في الأسئلة بنجاح!');
    showQuestion();
    persist();
  }

  // === From js/teacher-tools.js ===
  function loadQuestionsFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = JSON.parse(evt.target.result);
                if (!Array.isArray(data)) throw new Error('Invalid format');
                localStorage.removeItem(STORAGE_KEY);
                state.questions = JSON.parse(JSON.stringify(data));
                state.currentQuestion = 0;
                state.score = 0;
                state.timeLeft = state.questionTime;
                state.shuffledMaps = [];
                state.questions.forEach(ensureQuestionSanity);
                state.answeredQuestions = new Array(state.questions.length).fill(null);
                state.lastWrong = new Array(state.questions.length).fill(null);
                init(true);
                persist();
            } catch (err) {
                alert('تعذر قراءة ملف الأسئلة. تأكد من صحة الصيغة.');
                console.error(err);
            }
        };
        reader.readAsText(file);
    };
    input.click();
  }

  function saveQuestionsToFile() {
    if (!Array.isArray(state.questions) || state.questions.length === 0) {
        alert('لا توجد أسئلة للحفظ!');
        return;
    }
    const dataStr = JSON.stringify(state.questions, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quiz_questions.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  function saveAppForOfflineUse() {
    try {
        const cleanQuestions = (state.questions || []).map((q) => {
            const cleanQ = JSON.parse(JSON.stringify(q || {}));
            ensureQuestionSanity(cleanQ);
            return cleanQ;
        });

        const studentState = {
            questions: cleanQuestions,
            currentQuestion: 0,
            score: 0,
            questionTime: state.questionTime || 30,
            timeLeft: state.questionTime || 30,
            timerId: null,
            isPaused: false,
            answeredQuestions: new Array(cleanQuestions.length).fill(null),
            lastWrong: new Array(cleanQuestions.length).fill(null),
            shuffledMaps: [],
            numeralType: state.numeralType,
            optionsLayout: state.optionsLayout,
        };

        const studentScript = `
        <script>
        (function() {
            'use strict';
            const state = ${JSON.stringify(studentState)};
            const EASTERN = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
            let draggedItem = null;
            let orderingDraggedItem = null;

            // --- Utility Functions ---
            function formatNumber(n) {
                const num = Number.isFinite(n) ? n : 0;
                try { return new Intl.NumberFormat(state.numeralType === 'eastern' ? 'ar-EG' : 'en-US').format(num); } catch { return String(num); }
            }
            function sanitizeHTML(html) {
                if (!window.DOMPurify) return html || '';
                return DOMPurify.sanitize(html || '', { ADD_TAGS: ['a', 'u', 'mark', 'blockquote', 'hr', 'pre', 'code', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'p', 'span', 'div', 'br', 'sub', 'sup', 'strong', 'em', 'audio', 'source'], ALLOWED_ATTR: ['src', 'alt', 'style', 'class', 'rowspan', 'colspan', 'href', 'target', 'rel', 'dir', 'width', 'height', 'controls', 'preload', 'type'], ALLOW_DATA_ATTR: false, FORBID_ATTR: ['onerror', 'onclick'] });
            }
            function plainToHTMLStrict(src) {
                if (!src || typeof src !== 'string') return '';
                const ESC = (s) => s.replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
                const lines = src.split(/\\r?\\n/);
                const out = [];
                for (let raw of lines) {
                    let s = raw.trim();
                    if (!s) { out.push('<p>&nbsp;</p>'); continue; }
                    if (/^\\/\\/\\/+$/.test(s)) { out.push('<hr>'); continue; }
                    s = ESC(s).replace(/(?:\\s*\\/\\/\\s*)+/g, '<br>');
                    const m = s.match(/^(\\*+|[\\-\\u2212\\u2013\\u2014]|[\\(\\[]?[0-9٠-٩]+[\\)\\.\\-:]|[IVXLC]+[\\)\\.\\:])\\s+(.*)$/i);
                    if (m) s = \`<span class="lead-in">\${m[1]}</span> \${m[2]}\`;
                    out.push(\`<p>\${s}</p>\`);
                }
                if (!out.length) out.push('<p>&nbsp;</p>');
                return out.join('');
            }
            function convertNumeralsInText(text) {
                if (!text || typeof text !== 'string') return text;
                return state.numeralType === 'eastern' ? text.replace(/\\d/g, (d) => EASTERN[d]) : text.replace(/[٠-٩]/g, (d) => EASTERN.indexOf(d));
            }
            function formatQuizContent(html) {
                if (!html || typeof html !== 'string') return '';
                const looksHTML = /<\\/?[a-z][\\s\\S]*>/i.test(html);
                const rendered = looksHTML ? html : plainToHTMLStrict(html);
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = rendered;
                (function walk(node) {
                    if (node.nodeType === Node.TEXT_NODE) { node.nodeValue = convertNumeralsInText(node.nodeValue); }
                    else if (node.nodeType === Node.ELEMENT_NODE) { for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]); }
                })(tempDiv);
                return sanitizeHTML(tempDiv.innerHTML);
            }
            function checkShortAnswerSimilarity(userAnswer, modelAnswer) {
                if (!userAnswer || !modelAnswer) return false;
                const normalize = (str) => str.trim().toLowerCase().replace(/[.,\\/#!$%\\^&\\*;:{}=\\-_\\\`~()؟]/g, "").replace(/\\s+/g, " ");
                const userWords = new Set(normalize(userAnswer).split(" ").filter((w) => w.length > 0));
                const modelWords = new Set(normalize(modelAnswer).split(" ").filter((w) => w.length > 0));
                if (modelWords.size === 0) return userWords.size === 0;
                let matchCount = 0;
                for (const word of userWords) { if (modelWords.has(word)) { matchCount++; } }
                const similarity = (matchCount / modelWords.size) * 100;
                return similarity >= 70;
            }

            // --- UI Update Functions ---
            function updateTimerDisplay() { document.getElementById('timer').textContent = \`الوقت المتبقي: \${formatNumber(state.timeLeft)} ثانية\`; }
            function updateQuestionCounter() { const total = state.questions.length; const current = total > 0 ? state.currentQuestion + 1 : 0; document.getElementById('questionCounter').textContent = \`السؤال \${formatNumber(current)} من \${formatNumber(total)}\`; }
            function updateScoreCounter() { const total = state.questions.length; document.getElementById('scoreCounter').textContent = \`النتيجة: \${formatNumber(state.score)} من \${formatNumber(total)}\`; }
            
            // --- Core Quiz Logic ---
            function showQuestion() {
                // This function is a combination of the teacher-side showQuestion, adapted for students.
                clearInterval(state.timerId);
                state.timerId = null;
                state.timeLeft = state.questionTime;
                
                const readingTextElement = document.getElementById('readingText');
                const questionElement = document.getElementById('question');
                const optionsElement = document.getElementById('options');
                
                if (state.currentQuestion >= state.questions.length) { showResult(); return; }
                const q = state.questions[state.currentQuestion];
                
                readingTextElement.innerHTML = '';
                if (q.reading && (q.reading.text || q.reading.image || q.reading.audio)) {
                    readingTextElement.style.display = 'block';
                    if (q.reading.text) { const d = document.createElement('div'); d.className = 'reading-text-content'; d.innerHTML = formatQuizContent(q.reading.text); readingTextElement.appendChild(d); }
                    if (q.reading.audio) { const aud = document.createElement('audio'); aud.controls = true; aud.preload = 'none'; aud.src = q.reading.audio; aud.style.width = '100%'; aud.style.margin = '8px 0'; readingTextElement.appendChild(aud); }
                    if (q.reading.image) { const img = document.createElement('img'); img.src = q.reading.image; img.className = 'reading-text-image'; img.alt = 'Reading image'; readingTextElement.appendChild(img); }
                } else { readingTextElement.style.display = 'none'; }
                
                questionElement.innerHTML = '';
                const questionContent = document.createElement('div');
                questionContent.className = 'question-content';
                if (q.question?.text) { const d = document.createElement('div'); d.className = 'question-text'; d.innerHTML = formatQuizContent(q.question.text); questionContent.appendChild(d); }
                if (q.question?.image) { const i = document.createElement('img'); i.src = q.question.image; i.className = 'question-image'; i.alt = 'Question image'; questionContent.appendChild(i); }
                questionElement.appendChild(questionContent);
                
                optionsElement.innerHTML = '';
                
                // Question Type Renderers
                if (q.type === 'multiple-choice') {
                    optionsElement.className = 'options';
                    const map = shuffleOptionsOnce(state.currentQuestion);
                    const validOptions = [];
                    map.forEach((origIdx) => {
                        const opt = q.options[origIdx];
                        if (!opt || (!opt.text && !opt.image)) return;
                        const wrap = document.createElement('div');
                        wrap.className = 'option';
                        const content = document.createElement('div');
                        content.className = 'option-content';
                        if (opt.image) { const img = document.createElement('img'); img.src = opt.image; img.alt = 'Option image'; content.appendChild(img); }
                        if (opt.text) { const span = document.createElement('span'); span.className = 'option-text'; span.innerHTML = formatQuizContent(opt.text); content.appendChild(span); }
                        wrap.appendChild(content);
                        if (state.answeredQuestions[state.currentQuestion] !== null) {
                            wrap.setAttribute('aria-disabled', 'true');
                            if (origIdx === q.correct) wrap.classList.add('correct');
                            if (state.answeredQuestions[state.currentQuestion] === false && state.lastWrong[state.currentQuestion] === origIdx) wrap.classList.add('wrong');
                        } else {
                            wrap.onclick = () => checkAnswer(origIdx);
                        }
                        validOptions.push(wrap);
                    });
                    applyLayoutSafely(validOptions.length);
                    validOptions.forEach(v => optionsElement.appendChild(v));
                } else if (q.type === 'fill-in-the-blank' || q.type === 'short-answer') {
                    optionsElement.className = '';
                    const isShort = q.type === 'short-answer';
                    const container = document.createElement('form');
                    container.className = isShort ? 'short-answer-container' : 'fill-in-blank-container';
                    container.onsubmit = (e) => { e.preventDefault(); checkAnswer(inputEl.value); };
                    const inputEl = document.createElement(isShort ? 'textarea' : 'input');
                    inputEl.className = isShort ? 'short-answer-textarea' : 'fill-in-blank-input';
                    if(!isShort) inputEl.type = 'text';
                    inputEl.placeholder = 'اكتب إجابتك هنا';
                    const submitBtn = document.createElement('button');
                    submitBtn.type = 'submit';
                    submitBtn.textContent = 'تأكيد الإجابة';
                    submitBtn.className = 'nav-btn';
                    container.appendChild(inputEl);
                    container.appendChild(submitBtn);
                    optionsElement.appendChild(container);
                    if (state.answeredQuestions[state.currentQuestion] !== null) {
                        inputEl.value = state.lastWrong[state.currentQuestion] || '';
                        inputEl.disabled = true;
                        submitBtn.style.display = 'none';
                        inputEl.classList.add(state.answeredQuestions[state.currentQuestion] ? 'correct' : 'wrong');
                        if (!state.answeredQuestions[state.currentQuestion]) {
                            const correctAnswerDisplay = document.createElement('div');
                            correctAnswerDisplay.className = 'correct-answer-display';
                            const ansText = isShort ? q.correctAnswer : q.correctAnswer.split('|')[0];
                            correctAnswerDisplay.textContent = \`\${isShort ? 'الإجابة النموذجية' : 'الإجابة الصحيحة'}: \${ansText}\`;
                            container.appendChild(correctAnswerDisplay);
                        }
                    }
                } else if (q.type === 'true-false') {
                    optionsElement.className = 'options options-two';
                    const wasAnswered = state.answeredQuestions[state.currentQuestion] !== null;
                    const trueBtn = document.createElement('div');
                    trueBtn.className = 'option';
                    trueBtn.textContent = 'صح';
                    const falseBtn = document.createElement('div');
                    falseBtn.className = 'option';
                    falseBtn.textContent = 'خطأ';
                    if (!wasAnswered) {
                        trueBtn.onclick = () => checkAnswer(true);
                        falseBtn.onclick = () => checkAnswer(false);
                    } else {
                        trueBtn.setAttribute('aria-disabled', 'true');
                        falseBtn.setAttribute('aria-disabled', 'true');
                        if (q.correctAnswer === true) trueBtn.classList.add('correct');
                        if (q.correctAnswer === false) falseBtn.classList.add('correct');
                        if (state.lastWrong[state.currentQuestion] === true && q.correctAnswer === false) trueBtn.classList.add('wrong');
                        if (state.lastWrong[state.currentQuestion] === false && q.correctAnswer === true) falseBtn.classList.add('wrong');
                    }
                    optionsElement.appendChild(trueBtn);
                    optionsElement.appendChild(falseBtn);
                } else if (q.type === 'matching') {
                    // Matching logic...
                    const container = document.createElement('div'); container.className = 'matching-container';
                    const promptsColumn = document.createElement('div'); promptsColumn.className = 'matching-column';
                    const answersColumn = document.createElement('div'); answersColumn.className = 'matching-column';
                    const shuffledAnswers = (q.answers || []).map((a, i) => ({ text: a, originalIndex: i })).sort(() => Math.random() - 0.5);
                    (q.prompts || []).forEach((promptText, index) => {
                        const promptItem = document.createElement('div'); promptItem.className = 'matching-prompt-item';
                        const text = document.createElement('span'); text.className = 'prompt-text'; text.innerHTML = formatQuizContent(promptText); promptItem.appendChild(text);
                        const dropZone = document.createElement('div'); dropZone.className = 'drop-zone'; dropZone.dataset.index = index; promptItem.appendChild(dropZone);
                        promptsColumn.appendChild(promptItem);
                        if (state.answeredQuestions[state.currentQuestion] === null) {
                            dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('over'); };
                            dropZone.ondragleave = () => dropZone.classList.remove('over');
                            dropZone.ondrop = (e) => {
                                e.preventDefault(); dropZone.classList.remove('over');
                                if (draggedItem) { if (dropZone.firstChild) answersColumn.appendChild(dropZone.firstChild); dropZone.appendChild(draggedItem); draggedItem = null; }
                            };
                        }
                    });
                    shuffledAnswers.forEach((answerData) => {
                        const answerItem = document.createElement('div'); answerItem.className = 'answer-item'; answerItem.draggable = true; answerItem.dataset.originalIndex = answerData.originalIndex; answerItem.innerHTML = formatQuizContent(answerData.text);
                        answersColumn.appendChild(answerItem);
                        if (state.answeredQuestions[state.currentQuestion] === null) {
                            answerItem.ondragstart = () => { draggedItem = answerItem; setTimeout(() => answerItem.classList.add('dragging'), 0); };
                            answerItem.ondragend = () => answerItem.classList.remove('dragging');
                        }
                    });
                    container.appendChild(promptsColumn); container.appendChild(answersColumn); optionsElement.appendChild(container);
                    if (state.answeredQuestions[state.currentQuestion] === null) {
                        const btnContainer = document.createElement('div'); btnContainer.style.textAlign = 'center';
                        const submitBtn = document.createElement('button'); submitBtn.textContent = 'تأكيد الإجابة'; submitBtn.className = 'nav-btn'; submitBtn.style.marginTop = '20px';
                        submitBtn.onclick = () => checkAnswer(null); btnContainer.appendChild(submitBtn); optionsElement.appendChild(btnContainer);
                    } else {
                        promptsColumn.querySelectorAll('.drop-zone').forEach((dz) => {
                            dz.innerHTML = '';
                            const pIndex = parseInt(dz.dataset.index, 10);
                            const uAnswers = state.lastWrong[state.currentQuestion];
                            const uAnswerIndex = Array.isArray(uAnswers) ? uAnswers[pIndex] : null;
                            if (uAnswerIndex !== null && uAnswerIndex !== undefined) { const aText = q.answers[uAnswerIndex]; const aItem = document.createElement('div'); aItem.className = 'answer-item'; aItem.innerHTML = formatQuizContent(aText); dz.appendChild(aItem); }
                            if (uAnswerIndex === pIndex) dz.classList.add('correct'); else dz.classList.add('wrong');
                        });
                        answersColumn.style.display = 'none';
                    }
                } else if (q.type === 'ordering') {
                    // Ordering logic...
                    const container = document.createElement('div'); container.className = 'ordering-container';
                    const shuffledItems = (q.items || []).slice().sort(() => Math.random() - 0.5);
                    shuffledItems.forEach((itemText) => { const itemEl = document.createElement('div'); itemEl.className = 'ordering-item'; itemEl.draggable = true; itemEl.dataset.originalText = itemText; itemEl.innerHTML = formatQuizContent(itemText); container.appendChild(itemEl); });
                    optionsElement.appendChild(container);
                    if (state.answeredQuestions[state.currentQuestion] === null) {
                        container.querySelectorAll('.ordering-item').forEach(item => {
                            item.ondragstart = () => { orderingDraggedItem = item; setTimeout(() => item.classList.add('dragging'), 0); };
                            item.ondragend = () => item.classList.remove('dragging');
                        });
                        container.ondragover = (e) => { e.preventDefault(); const afterElement = getDragAfterElement(container, e.clientY); if (afterElement == null) container.appendChild(orderingDraggedItem); else container.insertBefore(orderingDraggedItem, afterElement); };
                        const btnContainer = document.createElement('div'); btnContainer.style.textAlign = 'center';
                        const submitBtn = document.createElement('button'); submitBtn.textContent = 'تأكيد الإجابة'; submitBtn.className = 'nav-btn'; submitBtn.style.marginTop = '20px';
                        submitBtn.onclick = () => checkAnswer(null); btnContainer.appendChild(submitBtn); optionsElement.appendChild(btnContainer);
                    } else {
                        container.innerHTML = '';
                        (state.lastWrong[state.currentQuestion] || []).forEach(itemText => { const itemEl = document.createElement('div'); itemEl.className = 'ordering-item'; itemEl.draggable = false; itemEl.innerHTML = formatQuizContent(itemText); container.appendChild(itemEl); });
                        container.classList.add(state.answeredQuestions[state.currentQuestion] ? 'correct' : 'wrong');
                        if (!state.answeredQuestions[state.currentQuestion]) {
                            const correctOrderDisplay = document.createElement('div'); correctOrderDisplay.className = 'correct-order-display';
                            let listHTML = '<strong>الترتيب الصحيح:</strong><ol>';
                            q.items.forEach(item => { listHTML += \`<li>\${item}</li>\`; });
                            listHTML += '</ol>'; correctOrderDisplay.innerHTML = listHTML; optionsElement.appendChild(correctOrderDisplay);
                        }
                    }
                }

                // Final UI updates
                const progressEl = document.getElementById('progress');
                if (progressEl) { const total = state.questions.length || 1; progressEl.style.width = (state.currentQuestion / total) * 100 + '%'; }
                document.getElementById('prevBtn').disabled = state.currentQuestion === 0;
                document.getElementById('nextBtn').disabled = false;
                updateQuestionCounter(); updateScoreCounter(); updateTimerDisplay();
                startTimer();
            }
            
            function shuffleOptionsOnce(qIndex) {
                if (state.shuffledMaps[qIndex]) return state.shuffledMaps[qIndex];
                const q = state.questions[qIndex]; if (q.type !== 'multiple-choice') return [];
                const map = (q.options || []).map((_, i) => i);
                for (let i = map.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [map[i], map[j]] = [map[j], map[i]]; }
                state.shuffledMaps[qIndex] = map; return map;
            }
            function getDragAfterElement(container, y) {
                const draggableElements = [...container.querySelectorAll('.ordering-item:not(.dragging)')];
                return draggableElements.reduce((closest, child) => {
                    const box = child.getBoundingClientRect(); const offset = y - box.top - box.height / 2;
                    if (offset < 0 && offset > closest.offset) { return { offset: offset, element: child }; } else { return closest; }
                }, { offset: Number.NEGATIVE_INFINITY }).element;
            }
            function applyLayoutSafely(optionCount) {
                const el = document.getElementById('options'); if (!el) return;
                const canApply = (layout, count) => layout === '4x1' && count === 4 && window.matchMedia('(min-width: 769px)').matches;
                if (canApply(state.optionsLayout, optionCount)) el.dataset.layout = '4x1'; else delete el.dataset.layout;
            }

            // ... checkAnswer, nextQuestion, etc.
            function checkAnswer(userAnswer) {
                if (state.answeredQuestions[state.currentQuestion] !== null) return;
                const q = state.questions[state.currentQuestion];
                let isCorrect = false;
                if (q.type === 'multiple-choice') { isCorrect = userAnswer === q.correct; state.lastWrong[state.currentQuestion] = userAnswer; }
                else if (q.type === 'fill-in-the-blank') { const correctAnswers = q.correctAnswer.split('|').map(a => a.trim().toLowerCase()); isCorrect = correctAnswers.includes((userAnswer || '').toString().trim().toLowerCase()); state.lastWrong[state.currentQuestion] = userAnswer; }
                else if (q.type === 'true-false') { isCorrect = userAnswer === q.correctAnswer; state.lastWrong[state.currentQuestion] = userAnswer; }
                else if (q.type === 'short-answer') { isCorrect = checkShortAnswerSimilarity(userAnswer, q.correctAnswer); state.lastWrong[state.currentQuestion] = userAnswer; }
                else if (q.type === 'matching') {
                    const dropZones = document.querySelectorAll('.drop-zone');
                    if ([...dropZones].some(dz => dz.children.length === 0)) { alert('يرجى مطابقة جميع العناصر قبل تأكيد الإجابة.'); return; }
                    let correctMatches = 0; const userAnswers = [];
                    dropZones.forEach((zone, index) => {
                        const answerItem = zone.querySelector('.answer-item');
                        const originalIndex = answerItem ? parseInt(answerItem.dataset.originalIndex, 10) : null;
                        userAnswers[index] = originalIndex;
                        if (originalIndex === index) { correctMatches++; zone.classList.add('correct'); } else { zone.classList.add('wrong'); }
                        if (answerItem) answerItem.draggable = false;
                    });
                    isCorrect = correctMatches === q.prompts.length; state.lastWrong[state.currentQuestion] = userAnswers; document.querySelector('#options .nav-btn')?.parentElement.remove();
                } else if (q.type === 'ordering') {
                    const orderedItems = [...document.querySelectorAll('.ordering-container .ordering-item')];
                    const userOrder = orderedItems.map(item => item.dataset.originalText);
                    isCorrect = JSON.stringify(userOrder) === JSON.stringify(q.items); state.lastWrong[state.currentQuestion] = userOrder;
                    const container = document.querySelector('.ordering-container'); container.classList.add(isCorrect ? 'correct' : 'wrong');
                    orderedItems.forEach(item => item.draggable = false); document.querySelector('#options .nav-btn')?.parentElement.remove();
                    if (!isCorrect) {
                        const correctOrderDisplay = document.createElement('div'); correctOrderDisplay.className = 'correct-order-display';
                        let listHTML = '<strong>الترتيب الصحيح:</strong><ol>'; q.items.forEach(item => { listHTML += \`<li>\${item}</li>\`; }); listHTML += '</ol>';
                        correctOrderDisplay.innerHTML = listHTML; container.parentElement.appendChild(correctOrderDisplay);
                    }
                }
                state.answeredQuestions[state.currentQuestion] = isCorrect;
                if (isCorrect) state.score++;
                updateScoreCounter();
                if (q.type !== 'matching' && q.type !== 'ordering') showQuestion();
                setTimeout(() => { if (state.currentQuestion < state.questions.length - 1) { nextQuestion(); } else { showResult(); } }, 1500);
            }
            function nextQuestion() { if (state.currentQuestion >= state.questions.length - 1) { showResult(); } else { state.currentQuestion++; showQuestion(); } }
            function previousQuestion() { if (state.currentQuestion > 0) { state.currentQuestion--; showQuestion(); } }
            function togglePause() {
                const b = document.getElementById('pauseBtn');
                state.isPaused = !state.isPaused;
                if (state.isPaused) { clearInterval(state.timerId); if (b) { b.textContent = 'استئناف'; b.style.background = '#28a745'; b.style.color = '#fff'; } }
                else { if (b) { b.textContent = 'إيقاف مؤقت'; b.style.background = '#ffc107'; b.style.color = '#000'; } startTimer(); }
            }
            function startTimer() {
                clearInterval(state.timerId); if (!state.questions || state.questions.length === 0) return;
                const endAt = Date.now() + state.timeLeft * 1000;
                state.timerId = setInterval(() => {
                    if (state.isPaused) return;
                    const remain = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
                    if (remain !== state.timeLeft) { state.timeLeft = remain; updateTimerDisplay(); }
                    if (remain <= 0) { clearInterval(state.timerId); if (state.answeredQuestions[state.currentQuestion] === null) { state.answeredQuestions[state.currentQuestion] = false; } nextQuestion(); }
                }, 200);
            }
            function showResult() {
                clearInterval(state.timerId);
                document.querySelector('.quiz-box').style.display = 'none';
                document.getElementById('scoreBoard').style.display = 'block';
                document.getElementById('readingText').style.display = 'none';
                document.getElementById('countersBox').style.display = 'none';
                document.getElementById('finalScore').textContent = formatNumber(state.score);
                document.getElementById('totalQuestions').textContent = formatNumber(state.questions.length);
                showCertificateOption();
            }
            function showCertificateOption() {
                if (state.questions.length === 0) return;
                const scorePercentage = (state.score / state.questions.length) * 100;
                const certificateBtn = document.getElementById('certificateBtn');
                const noCertificateMsg = document.getElementById('noCertificateMsg');
                if (scorePercentage >= 80) { if (certificateBtn) certificateBtn.style.display = 'block'; if (noCertificateMsg) noCertificateMsg.style.display = 'none'; }
                else { if (certificateBtn) certificateBtn.style.display = 'none'; if (noCertificateMsg) noCertificateMsg.style.display = 'block'; }
            }
            function openCertificateForm() { document.getElementById('certificateForm').style.display = 'block'; }
            function closeCertificateForm() { document.getElementById('certificateForm').style.display = 'none'; }
            function generateCertificate() {
                const studentName = document.getElementById('studentNameInput').value.trim();
                const teacherName = document.getElementById('teacherNameInput').value.trim();
                if (!studentName) { alert('يرجى إدخال اسم الطالب'); return; }
                document.getElementById('certificateStudentName').textContent = studentName;
                document.getElementById('certificateTeacherName').textContent = \`المعلم: \${teacherName}\`;
                const scoreText = \`حققت نتيجة \${formatNumber(state.score)} من \${formatNumber(state.questions.length)} (\${Math.round((state.score / state.questions.length) * 100)}%)\`;
                document.getElementById('certificateScoreText').textContent = scoreText;
                document.getElementById('certificateQuizTitle').innerHTML = document.getElementById('quizTitle').innerHTML;
                const mainLogo = document.getElementById('quizLogo'); const certLogo = document.getElementById('certificateLogo');
                if (mainLogo && mainLogo.src && mainLogo.style.display !== 'none') { certLogo.src = mainLogo.src; certLogo.alt = mainLogo.alt || 'شعار'; certLogo.style.display = 'block'; } else { certLogo.style.display = 'none'; }
                closeCertificateForm(); document.getElementById('certificateContainer').style.display = 'block';
            }
            function closeCertificate() { document.getElementById('certificateContainer').style.display = 'none'; }
            function printCertificate() { window.print(); }
            function downloadCertificate() {
                const certificate = document.getElementById('certificateContainer');
                const buttons = certificate.querySelector('.certificate-buttons');
                if (buttons) buttons.style.display = 'none';
                html2canvas(certificate, { scale: 2, useCORS: true, logging: false }).then(canvas => {
                    const link = document.createElement('a');
                    const studentName = document.getElementById('certificateStudentName').textContent.trim();
                    link.download = \`شهادة_إنجاز_\${studentName}.png\`;
                    link.href = canvas.toDataURL('image/png', 1.0); link.click();
                }).finally(() => { if (buttons) buttons.style.display = 'flex'; });
            }
            function restartQuiz() {
                state.currentQuestion = 0; state.score = 0; state.timeLeft = state.questionTime;
                state.answeredQuestions = new Array(state.questions.length).fill(null);
                state.lastWrong = new Array(state.questions.length).fill(null);
                state.shuffledMaps = [];
                document.querySelector('.quiz-box').style.display = 'block';
                document.getElementById('scoreBoard').style.display = 'none';
                document.getElementById('countersBox').style.display = 'flex';
                showQuestion();
            }
            
            // --- Global Event Listeners ---
            window.addEventListener("load", function() {
                document.body.classList.add("rtl-ar");
                document.getElementById('prevBtn').onclick = previousQuestion;
                document.getElementById('nextBtn').onclick = nextQuestion;
                document.getElementById('pauseBtn').onclick = togglePause;
                document.getElementById('restartBtn').onclick = restartQuiz;
                document.getElementById('certificateBtn').onclick = openCertificateForm;
                document.getElementById('generateCertBtn').onclick = generateCertificate;
                document.getElementById('closeCertFormBtn').onclick = closeCertificateForm;
                document.getElementById('printCertBtn').onclick = printCertificate;
                document.getElementById('downloadCertBtn').onclick = downloadCertificate;
                document.getElementById('closeCertBtn').onclick = closeCertificate;

                showQuestion();
            });
        })();
        <\/script>
        `;

        const title = (document.getElementById('quizTitle')?.innerHTML || '').trim();
        const instructions = (document.getElementById('instructions')?.innerHTML || '').trim();
        const logoData = quizConfig.logo || '';
        const logoAlt = quizConfig.logoAlt || 'Logo';
        const baseFooterHTML = document.getElementById('quizFooter').innerHTML;
        const teacherFooterHTML = (document.getElementById('teacherFooter')?.innerHTML || '').trim();

        const certificateHTML = `
        <div class="config-panel" id="certificateForm" style="text-align: right; display: none;">
            <h3>بيانات الشهادة</h3>
            <div class="form-group"> <label for="studentNameInput">اسم الطالب:</label> <input class="form-control" id="studentNameInput" type="text" placeholder="أدخل اسم الطالب"> </div>
            <div class="form-group"> <label for="teacherNameInput">اسم المعلم:</label> <input class="form-control" id="teacherNameInput" type="text" placeholder="أدخل اسم المعلم" value="معلم المادة"> </div>
            <div class="form-group" style="display: flex; gap: 8px; flex-wrap: wrap;"> <button class="nav-btn" id="generateCertBtn" style="background: #28a745"> إنشاء الشهادة </button> <button class="nav-btn" id="closeCertFormBtn">إلغاء</button> </div>
        </div>
        <div class="certificate-container" id="certificateContainer" style="display: none;">
            <div class="certificate-header"> <img id="certificateLogo" alt="شعار" class="certificate-logo"> <h2 class="certificate-quiz-title" id="certificateQuizTitle"> عنوان الاختبار </h2> </div>
            <h1 class="certificate-title">شهادة إنجاز</h1>
            <div class="certificate-body">
                <div class="student-name" id="certificateStudentName">اسم الطالب</div>
                <div class="achievement-text"> تهانينا! لقد أتممت الاختبار التفاعلي بنجاح </div>
                <div class="score-text" id="certificateScoreText"></div>
                <div class="achievement-text"> نظير جهودك المتميزة وإصرارك على التعلّم، نقدم لك هذه الشهادة تقديرًا لإنجازك البارع </div>
                <div class="teacher-name" id="certificateTeacherName"></div>
            </div>
            <div class="certificate-footer"> <p>شهادة معتمدة من نظام الاختبارات التفاعلية</p> </div>
            <div class="certificate-buttons"> <button class="certificate-btn print" id="printCertBtn"> 🖨️ طباعة الشهادة </button> <button class="certificate-btn" id="downloadCertBtn"> 📥 حفظ كصورة </button> <button class="certificate-btn close" id="closeCertBtn"> ✕ إغلاق </button> </div>
        </div>`;

        // Combine all parts into the final HTML
        const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>الاختبار التفاعلي - نسخة الطالب</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/><link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;500;700&display=swap" rel="stylesheet"/>
<script src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script>
<style>${document.querySelector('link[href="css/styles.css"]').sheet ? Array.from(document.querySelector('link[href="css/styles.css"]').sheet.cssRules).map(r => r.cssText).join('') : ''}</style>
</head>
<body>
<div class="container">
 <div class="header header-grid">
  <div class="header-logo"> <img id="quizLogo" alt="${logoAlt}" src="${logoData}" style="${logoData ? "display:block;" : "display:none;"} max-width:100%; height:auto;" /> </div>
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
    <button class="nav-btn" id="prevBtn" disabled>السابق</button>
    <button class="nav-btn pause-btn" id="pauseBtn">إيقاف مؤقت</button>
    <button class="nav-btn" id="nextBtn">التالي</button>
  </div>
  <div class="progress-bar"><div class="progress" id="progress"></div></div>
 </div>
 <div class="score-board" id="scoreBoard" style="display:none;">
  <h2> نتيجتك النهائية: <span id="finalScore">٠</span>/<span id="totalQuestions">٠</span> </h2>
  <div class="no-certificate-message" id="noCertificateMsg" style="display: none"> <p>للحصول على شهادة الإنجاز، يجب تحقيق 80% على الأقل من الدرجة الكلية</p> <p>حاول مرة أخرى للوصول إلى هذا المستوى!</p> </div>
  <div class="certificate-buttons"> <button class="certificate-btn" id="certificateBtn" style="display: none"> 🏆 الحصول على شهادة الإنجاز </button> <button class="restart-btn" id="restartBtn"> إعادة المحاولة </button> </div>
 </div>
</div>
${certificateHTML}
${teacherFooterHTML ? `<footer id="teacherFooter">${teacherFooterHTML}</footer>` : ''}
<footer id="quizFooter">${baseFooterHTML}</footer>
${studentScript}
</body></html>`;

        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'quiz_student_offline_ar.html';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 200);
    } catch (e) {
        console.error(e);
        alert('حدث خطأ أثناء إنشاء نسخة الطالب.');
    }
}


  function resetQuestions() {
    if (!confirm('سيتم مسح جميع الأسئلة الحالية. هل تريد المتابعة؟')) return;
    clearInterval(state.timerId);
    state.timerId = null;
    state.isPaused = false;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY + '_config');
    state.questions = [];
    state.currentQuestion = 0;
    state.score = 0;
    state.timeLeft = 0;
    state.answeredQuestions = [];
    state.lastWrong = [];
    state.shuffledMaps = [];
    const reading = document.getElementById('readingText');
    const qEl = document.getElementById('question');
    const opts = document.getElementById('options');
    const prog = document.getElementById('progress');
    if (reading) reading.style.display = 'none';
    if (qEl) qEl.innerHTML = '';
    if (opts) opts.innerHTML = '';
    if (prog) prog.style.width = '0%';
    const prev = document.getElementById('prevBtn');
    const next = document.getElementById('nextBtn');
    const pause = document.getElementById('pauseBtn');
    if (prev) prev.disabled = true;
    if (next) next.disabled = true;
    if (pause) {
        pause.textContent = 'إيقاف مؤقت';
        pause.style.background = '#ffc107';
        pause.style.color = '#000';
    }
    updateQuestionCounter();
    updateTimerDisplay();
    updateScoreCounter();
    const editPanel = document.getElementById('editPanel');
    if (editPanel && editPanel.style.display === 'block') {
        addNewQuestion(true);
    }
  }

  function resetProgress() {
    if (!Array.isArray(state.questions) || state.questions.length === 0) {
        clearInterval(state.timerId);
        state.timerId = null;
        state.isPaused = false;
        const qb = document.querySelector('.quiz-box');
        const sb = document.getElementById('scoreBoard');
        const cb = document.getElementById('countersBox');
        if (qb) qb.style.display = 'block';
        if (sb) sb.style.display = 'none';
        if (cb) cb.style.display = 'flex';
        const reading = document.getElementById('readingText');
        const qEl = document.getElementById('question');
        const opts = document.getElementById('options');
        const prog = document.getElementById('progress');
        if (reading) reading.style.display = 'none';
        if (qEl) qEl.innerHTML = '';
        if (opts) opts.innerHTML = '';
        if (prog) prog.style.width = '0%';
        updateQuestionCounter();
        updateTimerDisplay();
        updateScoreCounter();
        const prev = document.getElementById('prevBtn');
        const next = document.getElementById('nextBtn');
        if (prev) prev.disabled = true;
        if (next) next.disabled = true;
        return;
    }

    if (!confirm('هل تريد تصفير التقدم؟')) return;
    localStorage.removeItem(STORAGE_KEY);
    state.currentQuestion = 0;
    state.score = 0;
    state.timeLeft = state.questionTime;
    state.answeredQuestions = new Array(state.questions.length).fill(null);
    state.lastWrong = new Array(state.questions.length).fill(null);
    state.shuffledMaps = [];
    showQuestion();
  }

  function toggleSettingsPanel() {
    const p = document.getElementById('settingsPanel');
    p.style.display = p.style.display === 'block' ? 'none' : 'block';
    persist();
  }

  function toggleConfigPanel() {
    const p = document.getElementById('configPanel');
    if (p.style.display === 'block') {
        p.style.display = 'none';
    } else {
        p.style.display = 'block';
        document.getElementById('titleInput').value = quizConfig.title;
        document.getElementById('instructionsInput').value = quizConfig.instructions;
        const tf = document.getElementById('teacherFooter');
        document.getElementById('footerInput').value =
            (tf && tf.innerHTML.trim()) ||
            document.getElementById('footerInput').defaultValue;
        document.getElementById('logoAltInput').value = quizConfig.logoAlt;
        const logoPreview = document.getElementById('logoPreview');
        if (logoPreview) {
            logoPreview.src = quizConfig.logo || '';
            logoPreview.style.display = quizConfig.logo ? 'block' : 'none';
        }
    }
  }

  function saveConfig() {
    const newTitle = document.getElementById('titleInput').value?.trim();
    const newInstructions = document.getElementById('instructionsInput').value?.trim();
    const newFooter = document.getElementById('footerInput').value?.trim();
    if (newTitle) {
        quizConfig.title = newTitle;
        document.getElementById('quizTitle').innerHTML = formatHeader(newTitle);
    }
    if (newInstructions) {
        quizConfig.instructions = newInstructions;
        document.getElementById('instructions').innerHTML = formatSubheader(newInstructions);
    }
    if (newFooter) {
        document.getElementById('teacherFooter').innerHTML = sanitizeHTML(newFooter);
    }

    const alt = document.getElementById('logoAltInput')?.value?.trim() || '';
    quizConfig.logoAlt = alt;
    const img = document.getElementById('quizLogo');
    if (img) img.alt = quizConfig.logoAlt || 'شعار';

    toggleConfigPanel();
    persist();
  }

  // === From js/app.js (main logic) ===
  let timerId = null;

  function persist() {
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
        
        const teacherFooterContent = document.getElementById('teacherFooter')?.innerHTML || '';
        const configPayload = {
            title: quizConfig.title,
            instructions: quizConfig.instructions,
            logo: quizConfig.logo,
            logoAlt: quizConfig.logoAlt,
            teacherFooter: teacherFooterContent,
        };
        localStorage.setItem(STORAGE_KEY + '_config', JSON.stringify(configPayload));

    } catch (err) {
        console.error('Failed to save state:', err);
    }
  }

  function restore() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const p = JSON.parse(raw);
            [
                'currentQuestion',
                'score',
                'timeLeft',
                'questionTime',
                'numeralType',
                'optionsLayout',
            ].forEach((k) => {
                if (p[k] !== undefined) state[k] = p[k];
            });
            if (Array.isArray(p.answeredQuestions))
                state.answeredQuestions = p.answeredQuestions;
            if (Array.isArray(p.lastWrong)) state.lastWrong = p.lastWrong;
            if (Array.isArray(p.shuffledMaps)) state.shuffledMaps = p.shuffledMaps;
            if (Array.isArray(p.questions) && p.questions.length)
                state.questions = p.questions.map((q) => {
                    ensureQuestionSanity(q);
                    return q;
                });
        }

        const configRaw = localStorage.getItem(STORAGE_KEY + '_config');
        if (configRaw) {
            const configData = JSON.parse(configRaw);
            quizConfig.title = configData.title || quizConfig.title;
            quizConfig.instructions = configData.instructions || quizConfig.instructions;
            quizConfig.logo = configData.logo || null;
            quizConfig.logoAlt = configData.logoAlt || '';
        }
    } catch (err) {
        console.error('Failed to restore state:', err);
    }
  }

  function startTimer() {
    clearInterval(timerId);
    if (!Array.isArray(state.questions) || state.questions.length === 0) {
        state.timeLeft = 0;
        updateTimerDisplay();
        return;
    }
    const endAt = Date.now() + state.timeLeft * 1000;
    timerId = setInterval(() => {
        if (state.isPaused) return;
        const remain = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
        if (remain !== state.timeLeft) {
            state.timeLeft = remain;
            updateTimerDisplay();
        }
        if (remain <= 0) {
            clearInterval(timerId);
            nextQuestion();
        }
    }, 200);
    state.timerId = timerId;
  }

  function init(skipRestore = false) {
    if (!skipRestore) restore();
    document.querySelectorAll('#numeralType').forEach((s) => (s.value = state.numeralType));
    document.getElementById('questionTime').value = state.questionTime;
    document.getElementById('quizTitle').innerHTML = formatHeader(quizConfig.title);
    document.getElementById('instructions').innerHTML = formatSubheader(quizConfig.instructions);

    const logoEl = document.getElementById('quizLogo');
    if (logoEl) {
        logoEl.src = quizConfig.logo || '';
        logoEl.alt = quizConfig.logoAlt || 'شعار';
        logoEl.style.display = quizConfig.logo ? 'block' : 'none';
    }

    const configRaw = localStorage.getItem(STORAGE_KEY + '_config');
    if (configRaw) {
        try {
            const configData = JSON.parse(configRaw);
            if (configData.teacherFooter) {
                document.getElementById('teacherFooter').innerHTML = sanitizeHTML(configData.teacherFooter);
            }
        } catch(e) { console.error("Failed to restore teacher footer", e); }
    }


    if (state.questions.length === 0) {
        clearInterval(timerId);
        state.isPaused = false;
        state.timeLeft = 0;
        const reading = document.getElementById('readingText');
        if (reading) reading.style.display = 'none';
        const qEl = document.getElementById('question');
        if (qEl) qEl.innerHTML = '';
        const opts = document.getElementById('options');
        if (opts) opts.innerHTML = '';
        const prog = document.getElementById('progress');
        if (prog) prog.style.width = '0%';
        updateQuestionCounter();
        updateTimerDisplay();
        updateScoreCounter();
        return;
    }

    if (!Array.isArray(state.answeredQuestions) || state.answeredQuestions.length !== state.questions.length) {
        state.answeredQuestions = new Array(state.questions.length).fill(null);
        state.lastWrong = new Array(state.questions.length).fill(null);
    }
    showQuestion();
  }

  function attachEventListeners() {
    // Main Controls
    document.getElementById('configBtn').addEventListener('click', toggleConfigPanel);
    document.getElementById('settingsBtn').addEventListener('click', toggleSettingsPanel);
    document.getElementById('editButton').addEventListener('click', toggleEditMode);
    document.getElementById('loadButton').addEventListener('click', loadQuestionsFromFile);
    document.getElementById('saveQuestionsButton').addEventListener('click', saveQuestionsToFile);
    document.getElementById('saveAppButton').addEventListener('click', saveAppForOfflineUse);
    document.getElementById('resetProgressBtn').addEventListener('click', resetProgress);
    document.getElementById('resetQuestionsBtn').addEventListener('click', resetQuestions);

    // Settings Panel
    document.getElementById('numeralType').addEventListener('change', changeNumeralType);
    document.getElementById('cleanNumeralsBtn').addEventListener('click', cleanEasternNumerals);
    document.getElementById('questionTime').addEventListener('change', changeQuestionTime);
    document.getElementById('optionsLayout').addEventListener('change', changeOptionsLayout);
    document.getElementById('saveSettingsBtn').addEventListener('click', toggleSettingsPanel);

    // Edit Panel
    document.getElementById('saveEditBtn').addEventListener('click', saveEdit);
    document.getElementById('addNewQuestionBtn').addEventListener('click', () => addNewQuestion(false));
    document.getElementById('duplicateQuestionBtn').addEventListener('click', duplicateCurrentQuestion);
    document.getElementById('deleteQuestionBtn').addEventListener('click', deleteCurrentQuestion);
    document.getElementById('cancelEditBtn').addEventListener('click', cancelEdit);
    attachEditPanelEvents();

    // Quiz Navigation
    document.getElementById('prevBtn').addEventListener('click', previousQuestion);
    document.getElementById('pauseBtn').addEventListener('click', togglePause);
    document.getElementById('nextBtn').addEventListener('click', nextQuestion);

    // Scoreboard
    document.getElementById('certificateBtn').addEventListener('click', openCertificateForm);
    document.getElementById('restartBtn').addEventListener('click', () => {
        state.currentQuestion = 0;
        state.score = 0;
        state.timeLeft = state.questionTime;
        state.answeredQuestions = new Array(state.questions.length).fill(null);
        state.lastWrong = new Array(state.questions.length).fill(null);
        document.querySelector('.quiz-box').style.display = 'block';
        document.getElementById('scoreBoard').style.display = 'none';
        document.getElementById('teacherButtons').style.display = 'flex';
        document.getElementById('countersBox').style.display = 'flex';
        const progress = document.getElementById('progress');
        if (progress) progress.style.width = '0%';
        document.querySelectorAll('.option').forEach((o) => {
            o.classList.remove('correct', 'wrong');
            o.removeAttribute('aria-disabled');
        });
        showQuestion();
    });

    // Config Panel
    document.getElementById('saveConfigBtn').addEventListener('click', saveConfig);
    document.getElementById('cancelConfigBtn').addEventListener('click', toggleConfigPanel);
    document.getElementById('logoInput').addEventListener('change', function() {
        const file = this.files && this.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = e.target.result;
            quizConfig.logo = data;
    
            const previewEl = document.getElementById('logoPreview');
            if (previewEl) {
                previewEl.src = data;
                previewEl.style.display = 'block';
            }
            
            const mainLogoEl = document.getElementById('quizLogo');
            if (mainLogoEl) {
                mainLogoEl.src = data;
                mainLogoEl.style.display = 'block';
            }
            persist(); 
        };
        reader.readAsDataURL(file);
    });
    document.getElementById('logoClearBtn').addEventListener('click', function() {
        quizConfig.logo = null;
        document.getElementById('logoInput').value = '';
    
        const previewEl = document.getElementById('logoPreview');
        if (previewEl) {
            previewEl.src = '';
            previewEl.style.display = 'none';
        }
    
        const mainLogoEl = document.getElementById('quizLogo');
        if (mainLogoEl) {
            mainLogoEl.src = '';
            mainLogoEl.style.display = 'none';
        }
        persist();
    });

    // Certificate Form & Display
    document.getElementById('generateCertBtn').addEventListener('click', generateCertificate);
    document.getElementById('closeCertFormBtn').addEventListener('click', closeCertificateForm);
    document.getElementById('printCertBtn').addEventListener('click', printCertificate);
    document.getElementById('downloadCertBtn').addEventListener('click', downloadCertificate);
    document.getElementById('closeCertBtn').addEventListener('click', closeCertificate);
  }

  window.addEventListener('load', () => {
    document.body.classList.add('rtl-ar');
    document.getElementById('certificateForm').style.display = 'none';
    document.getElementById('certificateContainer').style.display = 'none';
    document.getElementById('certificateBtn').style.display = 'none';
    document.getElementById('noCertificateMsg').style.display = 'none';

    init();
    attachEventListeners();

    const layoutSel = document.getElementById('optionsLayout');
    if (layoutSel) layoutSel.value = state.optionsLayout;
  });

})();
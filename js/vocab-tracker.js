(function () {
  const LESSON_STEPS = [
    { id: "previous_review", label: "Previous Quick Review", minutes: 5 },
    { id: "new_vocabulary", label: "New Vocabulary", minutes: 10 },
    { id: "pattern_focus", label: "Pattern / Collocation Focus", minutes: 10 },
    { id: "toeic_practice", label: "TOEIC Practice", minutes: 15 },
    { id: "error_review_scheduling", label: "Error Review + Scheduling", minutes: 5 }
  ];

  const PASS_STATUSES = new Set(["completed", "completed_with_reinforcement", "sealed"]);

  const state = {
    view: "today",
    curriculum: null,
    user: null,
    lessons: [],
    questions: [],
    vocabItems: [],
    attempts: [],
    sessions: [],
    errorLogs: [],
    reviewQueue: [],
    prefs: {},
    activeSession: null,
    runtimeQuestions: [],
    currentQuestionKey: null,
    questionStartedAt: null,
    reviewSessionId: null,
    selectedQuestionId: null,
    bankFilters: {
      stage: "",
      lesson_id: "",
      type: "",
      error_code: ""
    },
    tickId: null
  };

  function $(id) {
    return document.getElementById(id);
  }

  function html(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function pct(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "0%";
    return `${Math.round(Number(value) * 100)}%`;
  }

  function seconds(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "0.0s";
    return `${Number(value).toFixed(1)}s`;
  }

  function round(value, digits) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n.toFixed(digits ?? 1) : "0";
  }

  function average(values) {
    const clean = values.map(Number).filter(Number.isFinite);
    return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
  }

  function byId(records, key) {
    const out = {};
    records.forEach((record) => {
      out[record[key]] = record;
    });
    return out;
  }

  function statusLabel(status) {
    return {
      not_started: "未開始",
      in_progress: "進行中",
      completed: "完成",
      completed_with_reinforcement: "完成 + 補強",
      needs_retake: "需重跑",
      sealed: "已封存"
    }[status] || status || "未開始";
  }

  function masteryLabel(level) {
    return {
      blind: "Blind",
      weak: "Weak",
      unstable: "Unstable",
      stable: "Stable",
      mastered: "Mastered"
    }[level] || "Blind";
  }

  function optionText(question, answer) {
    if (!question || !answer) return "";
    return question.options?.[answer] || answer;
  }

  function setNotice(message, tone) {
    const el = $("tracker-notice");
    if (!el) return;
    el.innerHTML = message ? `<div class="tracker-alert ${tone || ""}">${html(message)}</div>` : "";
  }

  function localDateFromTimestamp(timestamp) {
    if (!timestamp) return "";
    return String(timestamp).slice(0, 10);
  }

  function isWithinLastDays(dateText, days) {
    if (!dateText) return false;
    const d = new Date(`${dateText}T00:00:00`);
    if (Number.isNaN(d.getTime())) return false;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    cutoff.setHours(0, 0, 0, 0);
    return d >= cutoff;
  }

  async function loadData() {
    const [
      curriculumRows,
      users,
      lessons,
      questions,
      vocabItems,
      attempts,
      sessions,
      errorLogs,
      reviewQueue
    ] = await Promise.all([
      window.VocabDB.getAll("curriculum"),
      window.VocabDB.getAll("users"),
      window.VocabDB.getAll("lessons"),
      window.VocabDB.getAll("questions"),
      window.VocabDB.getAll("vocab_items"),
      window.VocabDB.getAll("attempts"),
      window.VocabDB.getAll("sessions"),
      window.VocabDB.getAll("error_logs"),
      window.VocabDB.getAll("review_queue")
    ]);

    state.curriculum = curriculumRows.find((row) => row.course_id === window.VocabDB.COURSE_ID) || curriculumRows[0] || null;
    state.user = users[0] || { user_id: "Keith", display_name: "Keith", baseline_score: 570, target_score: 750 };
    state.lessons = lessons.sort((a, b) => (a.lesson_number || 0) - (b.lesson_number || 0));
    state.questions = questions;
    state.vocabItems = vocabItems.sort((a, b) => String(a.item_id).localeCompare(String(b.item_id)));
    state.attempts = attempts.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    state.sessions = sessions.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    state.errorLogs = errorLogs;
    state.reviewQueue = reviewQueue.sort((a, b) => (b.priority || 0) - (a.priority || 0) || String(a.due_date).localeCompare(String(b.due_date)));
    state.prefs = window.VocabDB.loadPrefs();
  }

  function currentLesson() {
    const lastOpened = state.prefs.last_opened_lesson;
    const active = state.lessons.find((lesson) => lesson.lesson_id === lastOpened && !PASS_STATUSES.has(lesson.status));
    if (active) return active;
    return state.lessons.find((lesson) => !PASS_STATUSES.has(lesson.status) && lesson.status !== "needs_retake")
      || state.lessons.find((lesson) => lesson.status === "needs_retake")
      || state.lessons[0];
  }

  function topCounts(records, field, limit) {
    const counts = {};
    records.forEach((record) => {
      const value = record[field];
      if (!value) return;
      counts[value] = (counts[value] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit || 5);
  }

  function answerDistribution(questions) {
    const dist = { A: 0, B: 0, C: 0, D: 0 };
    questions.forEach((question) => {
      if (dist[question.correct_answer] !== undefined) dist[question.correct_answer] += 1;
    });
    return dist;
  }

  function moduleAccuracy() {
    const groups = {};
    state.attempts.forEach((attempt) => {
      const type = attempt.question_type || "unknown";
      if (!groups[type]) groups[type] = [];
      groups[type].push(attempt.is_correct ? 1 : 0);
    });
    return Object.entries(groups)
      .map(([type, values]) => [type, average(values)])
      .sort((a, b) => a[1] - b[1]);
  }

  function renderShell() {
    const completed = state.lessons.filter((lesson) => PASS_STATUSES.has(lesson.status)).length;
    const total = state.lessons.length || 1;
    const lesson = currentLesson();
    $("top-strip").textContent = `TOEIC Vocabulary Tracker | ${completed}/${total} MVP lessons | Current: ${lesson?.lesson_id || "-"} | Local-first IndexedDB`;

    const tabs = [
      ["today", "Today"],
      ["roadmap", "Roadmap"],
      ["lesson", "Lesson"],
      ["mistakes", "Mistakes"],
      ["mastery", "Mastery"],
      ["export", "Export"],
      ["bank", "Question Bank"],
      ["settings", "Settings"]
    ];
    $("tracker-tabs").innerHTML = tabs.map(([id, label]) => (
      `<button class="tracker-tab ${state.view === id ? "active" : ""}" type="button" onclick="VocabTracker.setView('${id}')">${html(label)}</button>`
    )).join("");
  }

  function stopTicker() {
    if (state.tickId) {
      clearInterval(state.tickId);
      state.tickId = null;
    }
  }

  function startTicker() {
    if (state.tickId) return;
    state.tickId = setInterval(updateRuntimeTimers, 1000);
  }

  function lessonElapsedSeconds() {
    const session = state.activeSession;
    if (!session) return 0;
    const now = Date.now();
    const pausedNow = session.paused && session.pause_started_at_ms ? now - session.pause_started_at_ms : 0;
    return Math.max(0, Math.round((now - session.started_at_ms - (session.total_paused_ms || 0) - pausedNow) / 1000));
  }

  function updateRuntimeTimers() {
    if (!state.activeSession) return;
    const lessonTimer = $("lesson-elapsed");
    const questionTimer = $("question-elapsed");
    if (lessonTimer) {
      const elapsed = lessonElapsedSeconds();
      const mins = Math.floor(elapsed / 60);
      const secs = String(elapsed % 60).padStart(2, "0");
      lessonTimer.textContent = `${mins}:${secs}`;
    }
    if (questionTimer) {
      const value = state.activeSession.paused || !state.questionStartedAt
        ? 0
        : Math.max(0, (Date.now() - state.questionStartedAt) / 1000);
      questionTimer.textContent = seconds(value);
    }
  }

  function render() {
    renderShell();
    stopTicker();

    const view = $("tracker-view");
    if (!view) return;

    if (state.view === "today") view.innerHTML = renderToday();
    if (state.view === "roadmap") view.innerHTML = renderRoadmap();
    if (state.view === "lesson") view.innerHTML = renderLesson();
    if (state.view === "mistakes") view.innerHTML = renderMistakes();
    if (state.view === "mastery") view.innerHTML = renderMastery();
    if (state.view === "export") view.innerHTML = renderExport();
    if (state.view === "bank") view.innerHTML = renderQuestionBank();
    if (state.view === "settings") view.innerHTML = renderSettings();

    if (state.view === "lesson" && state.activeSession) {
      startTicker();
      updateRuntimeTimers();
    }
  }

  function renderToday() {
    const today = window.VocabScoring.localDate();
    const lesson = currentLesson();
    const todayAttempts = state.attempts.filter((attempt) => localDateFromTimestamp(attempt.timestamp) === today);
    const todaySessions = state.sessions.filter((session) => session.date === today);
    const wrongAttempts = todayAttempts.filter((attempt) => !attempt.is_correct);
    const topErrors = topCounts(wrongAttempts, "error_code", 3);
    const accuracy = todayAttempts.length ? average(todayAttempts.map((attempt) => attempt.is_correct ? 1 : 0)) : 0;
    const avgTime = average(todayAttempts.map((attempt) => attempt.response_time_seconds));
    const modules = moduleAccuracy().slice(0, 3);
    const completed = state.lessons.filter((item) => PASS_STATUSES.has(item.status)).length;
    const pendingQueue = state.reviewQueue.filter((item) => item.status === "pending");
    const nextAction = pendingQueue.length ? "review_due_items" : lesson?.status === "needs_retake" ? "retake_current_lesson" : "start_current_lesson";

    return `
      <section class="tracker-hero">
        <div>
          <div class="tracker-kicker">Current Stage</div>
          <h2>${html(lesson?.stage || "V0")} ${html(lesson?.stage_name || "Diagnosis")}</h2>
          <p>${html(lesson?.lesson_id || "-")} · ${html(lesson?.title || "No lesson")}</p>
        </div>
        <button class="button primary" type="button" onclick="VocabTracker.startLesson('${html(lesson?.lesson_id || "")}')">Start Lesson</button>
      </section>

      <section class="tracker-grid">
        <article class="tracker-stat"><span>Today Questions</span><strong>${todayAttempts.length}</strong><small>${todaySessions.length} sessions</small></article>
        <article class="tracker-stat"><span>Accuracy</span><strong>${pct(accuracy)}</strong><small>${wrongAttempts.length} wrong</small></article>
        <article class="tracker-stat"><span>Avg Time</span><strong>${seconds(avgTime)}</strong><small>per attempt</small></article>
        <article class="tracker-stat"><span>MVP Progress</span><strong>${completed}/${state.lessons.length}</strong><small>${Math.round((completed / (state.lessons.length || 1)) * 100)}%</small></article>
      </section>

      <section class="tracker-section-grid">
        <article class="tracker-panel">
          <h3>Next Action</h3>
          <p class="tracker-bigline">${html(nextAction)}</p>
          <div class="tracker-actions">
            <button class="button secondary" type="button" onclick="VocabTracker.setView('mistakes')">Review Mistakes</button>
            <button class="button secondary" type="button" onclick="VocabTracker.setView('export')">Export Data</button>
            <button class="button secondary" type="button" onclick="VocabTracker.setView('bank')">Question Bank</button>
          </div>
        </article>
        <article class="tracker-panel">
          <h3>Top Error Codes</h3>
          ${topErrors.length ? `<ol class="tracker-list">${topErrors.map(([code, count]) => `<li>${html(code)} <span>${count}</span></li>`).join("")}</ol>` : `<p class="muted-note">No mistakes recorded today.</p>`}
        </article>
        <article class="tracker-panel">
          <h3>Weakest Modules</h3>
          ${modules.length ? `<ol class="tracker-list">${modules.map(([type, value]) => `<li>${html(type)} <span>${pct(value)}</span></li>`).join("")}</ol>` : `<p class="muted-note">Complete a lesson to populate module accuracy.</p>`}
        </article>
      </section>

      ${renderWeeklyStageSummary()}
    `;
  }

  function renderWeeklyStageSummary() {
    const weekSessions = state.sessions.filter((session) => isWithinLastDays(session.date, 7));
    const weekAttempts = state.attempts.filter((attempt) => isWithinLastDays(localDateFromTimestamp(attempt.timestamp), 7));
    const planned = Number(state.prefs.planned_lessons_this_week || 5);
    const weeklyAccuracy = weekAttempts.length ? average(weekAttempts.map((attempt) => attempt.is_correct ? 1 : 0)) : 0;
    const weeklyAvg = average(weekAttempts.map((attempt) => attempt.response_time_seconds));
    const fixRate = calculateReviewFixRate();
    const stageRows = (state.curriculum?.stages || []).map((stage) => {
      const lessons = state.lessons.filter((lesson) => lesson.stage === stage.stage);
      const done = lessons.filter((lesson) => PASS_STATUSES.has(lesson.status)).length;
      return `<div class="stage-row"><span>${html(stage.stage)} ${html(stage.stage_name)}</span><strong>${done}/${lessons.length || stage.total_lessons}</strong></div>`;
    }).join("");

    return `
      <section class="tracker-section-grid">
        <article class="tracker-panel">
          <h3>Weekly Dashboard</h3>
          <div class="mini-metrics">
            <span>Lessons ${weekSessions.length}/${planned}</span>
            <span>Accuracy ${pct(weeklyAccuracy)}</span>
            <span>Avg ${seconds(weeklyAvg)}</span>
            <span>Fix Rate ${pct(fixRate)}</span>
          </div>
        </article>
        <article class="tracker-panel">
          <h3>Stage Dashboard</h3>
          <div class="stage-list">${stageRows}</div>
        </article>
      </section>
    `;
  }

  function calculateReviewFixRate() {
    const reviewAttempts = state.attempts.filter((attempt) => attempt.step === "previous_review" || attempt.question_type === "review_question");
    return reviewAttempts.length ? average(reviewAttempts.map((attempt) => attempt.is_correct ? 1 : 0)) : 0;
  }

  function renderRoadmap() {
    const stageCards = (state.curriculum?.stages || []).map((stage) => {
      const lessons = state.lessons.filter((lesson) => lesson.stage === stage.stage);
      const done = lessons.filter((lesson) => PASS_STATUSES.has(lesson.status)).length;
      const denom = lessons.length || stage.total_lessons || 1;
      return `
        <article class="stage-card">
          <div class="stage-card-head">
            <strong>${html(stage.stage)} ${html(stage.stage_name)}</strong>
            <span>${html(stage.status)}</span>
          </div>
          <div class="tracker-progress"><div style="width:${Math.round((done / denom) * 100)}%"></div></div>
          <small>${done}/${denom} lessons</small>
        </article>
      `;
    }).join("");

    const rows = state.lessons.map((lesson) => `
      <article class="lesson-line status-${html(lesson.status || "not_started")}">
        <div class="lesson-main">
          <span class="lesson-dot"></span>
          <div>
            <strong>${html(lesson.lesson_id)} · ${html(lesson.title)}</strong>
            <small>${html(lesson.stage_name)} · ${lesson.estimated_minutes} min · ${lesson.question_ids?.length || 0} questions + ${lesson.review_question_ids?.length || 0} review</small>
          </div>
        </div>
        <div class="lesson-tools">
          <select onchange="VocabTracker.changeLessonStatus('${html(lesson.lesson_id)}', this.value)">
            ${["not_started", "in_progress", "completed", "completed_with_reinforcement", "needs_retake", "sealed"].map((status) => `<option value="${status}" ${lesson.status === status ? "selected" : ""}>${statusLabel(status)}</option>`).join("")}
          </select>
          <button class="button small" type="button" onclick="VocabTracker.startLesson('${html(lesson.lesson_id)}')">Start</button>
        </div>
      </article>
    `).join("");

    return `
      <section class="tracker-grid stage-grid">${stageCards}</section>
      <section class="tracker-panel">
        <h3>Curriculum Roadmap</h3>
        <div class="lesson-list">${rows}</div>
      </section>
    `;
  }

  function buildRuntimeQuestions(lesson, allLessonQuestions, session) {
    const questionMap = byId(allLessonQuestions, "question_id");
    if (session?.question_ids?.length) {
      return session.question_ids.map((questionId) => ({
        question: questionMap[questionId],
        step: session.step_by_question?.[questionId] || "toeic_practice"
      })).filter((row) => row.question);
    }

    const review = (lesson.review_question_ids || []).map((id) => questionMap[id]).filter(Boolean);
    const core = (lesson.question_ids || []).map((id) => questionMap[id]).filter(Boolean);
    const used = new Set();
    const picked = [];

    function take(candidates, count, step) {
      const rows = [];
      for (const question of candidates) {
        if (!question || used.has(question.question_id) || rows.length >= count) continue;
        used.add(question.question_id);
        rows.push({ question, step });
      }
      picked.push(...rows);
      return rows;
    }

    take(review, 4, "previous_review");
    take(core, 1, "previous_review");
    take(core.filter((q) => ["meaning_choice", "scene_vocabulary", "word_family"].includes(q.type)), 5, "new_vocabulary");
    take(core.filter((q) => ["word_family", "collocation", "formal_phrase", "false_friend"].includes(q.type)), 6, "pattern_focus");
    take(core.filter((q) => ["part5_sentence_completion", "part6_context_choice", "speed_drill"].includes(q.type)), 8, "toeic_practice");
    take([...core, ...review], 99, "toeic_practice");
    return picked;
  }

  function ensureQuestionClock(questionId) {
    if (state.currentQuestionKey !== questionId) {
      state.currentQuestionKey = questionId;
      state.questionStartedAt = Date.now();
    }
  }

  function runtimeProgress() {
    const session = state.activeSession;
    if (!session) return { answered: 0, total: 0, current: null, index: 0 };
    const total = state.runtimeQuestions.length;
    const answered = Object.keys(session.answers || {}).length;
    const index = Math.min(session.current_index || 0, total);
    return { answered, total, current: state.runtimeQuestions[index], index };
  }

  function renderLesson() {
    const active = window.VocabDB.loadActiveSession();
    if (!state.activeSession && active) {
      state.activeSession = active;
    }

    if (!state.activeSession) {
      const lesson = currentLesson();
      return `
        <section class="tracker-panel">
          <h3>Lesson Start</h3>
          <p class="tracker-bigline">${html(lesson?.lesson_id || "-")} · ${html(lesson?.title || "")}</p>
          <div class="step-plan">
            ${LESSON_STEPS.map((step) => `<div><strong>${html(step.label)}</strong><span>${step.minutes} min</span></div>`).join("")}
          </div>
          <div class="tracker-actions">
            <button class="button primary" type="button" onclick="VocabTracker.startLesson('${html(lesson?.lesson_id || "")}')">Start Current Lesson</button>
            <button class="button secondary" type="button" onclick="VocabTracker.setView('roadmap')">Choose Lesson</button>
          </div>
        </section>
      `;
    }

    const session = state.activeSession;
    const progress = runtimeProgress();
    const lesson = state.lessons.find((row) => row.lesson_id === session.lesson_id);
    const allAnswered = progress.answered >= progress.total && progress.total > 0;

    if (allAnswered) {
      return `
        <section class="runtime-shell">
          ${renderRuntimeHeader(lesson, "error_review_scheduling")}
          <article class="tracker-panel finish-panel">
            <h3>Step 5: Error Review + Scheduling</h3>
            <p class="tracker-bigline">${progress.answered}/${progress.total} answers saved immediately.</p>
            <p class="muted-note">Generate the session summary, apply the mastery gate, then confirm mistake causes.</p>
            <button class="button primary" type="button" onclick="VocabTracker.finishLesson()">Finish Lesson</button>
          </article>
        </section>
      `;
    }

    const row = progress.current;
    if (!row) return `<section class="tracker-panel"><p class="muted-note">No question is available for this lesson.</p></section>`;
    const question = row.question;
    ensureQuestionClock(question.question_id);
    const selected = session.answers?.[question.question_id]?.user_answer || null;

    return `
      <section class="runtime-shell">
        ${renderRuntimeHeader(lesson, row.step)}
        <article class="question-panel">
          <div class="question-meta">
            <span>${html(question.type)}</span>
            <span>Q ${progress.index + 1} / ${progress.total}</span>
            <span>Target ${window.VocabScoring.targetTime(question.type)}s</span>
          </div>
          <p class="question-text">${html(question.question_text)}</p>
          <div class="answer-grid">
            ${["A", "B", "C", "D"].map((letter) => `
              <button class="answer-button ${selected === letter ? "selected" : ""}" type="button" ${selected || session.paused ? "disabled" : ""} onclick="VocabTracker.answerCurrent('${letter}')">
                <strong>${letter}</strong>
                <span>${html(question.options?.[letter] || "")}</span>
              </button>
            `).join("")}
          </div>
          <p class="muted-note">${selected ? "Answer locked and saved. Correctness is hidden until review." : "Choose one answer. The attempt is saved immediately."}</p>
        </article>
        <div class="runtime-actions">
          <button class="button secondary" type="button" onclick="VocabTracker.previousQuestion()" ${progress.index <= 0 ? "disabled" : ""}>Previous</button>
          <button class="button secondary" type="button" onclick="VocabTracker.nextQuestion()">Skip / Next</button>
          <button class="button secondary" type="button" onclick="VocabTracker.togglePause()">${session.paused ? "Resume" : "Pause"}</button>
          <button class="button secondary" type="button" onclick="VocabTracker.exitLesson()">Exit</button>
        </div>
      </section>
    `;
  }

  function renderRuntimeHeader(lesson, currentStepId) {
    const progress = runtimeProgress();
    const session = state.activeSession;
    const stepItems = LESSON_STEPS.map((step) => `
      <span class="step-chip ${step.id === currentStepId ? "active" : ""}">${html(step.label)}</span>
    `).join("");
    const width = Math.round((progress.answered / Math.max(progress.total, 1)) * 100);
    return `
      <article class="runtime-head">
        <div>
          <div class="tracker-kicker">${html(lesson?.lesson_id || session.lesson_id)}</div>
          <h2>${html(lesson?.title || session.lesson_title)}</h2>
        </div>
        <div class="runtime-timers">
          <span>Lesson <strong id="lesson-elapsed">0:00</strong></span>
          <span>Question <strong id="question-elapsed">0.0s</strong></span>
        </div>
      </article>
      <div class="step-strip">${stepItems}</div>
      <div class="tracker-progress runtime-progress"><div style="width:${width}%"></div></div>
      ${session.paused ? `<div class="tracker-alert warn">Lesson paused. Resume to continue recording response time.</div>` : ""}
    `;
  }

  async function prepareRuntime(lessonId, existingSession) {
    const lesson = state.lessons.find((row) => row.lesson_id === lessonId);
    if (!lesson) throw new Error(`Lesson not found: ${lessonId}`);
    const allLessonQuestions = await window.VocabDB.getQuestionsForLesson(lesson);
    const runtime = buildRuntimeQuestions(lesson, allLessonQuestions, existingSession);
    state.runtimeQuestions = runtime;
    return { lesson, runtime };
  }

  async function startLesson(lessonId) {
    if (!lessonId) return;
    const active = window.VocabDB.loadActiveSession();
    if (active && active.lesson_id === lessonId) {
      state.activeSession = active;
      await prepareRuntime(lessonId, active);
      state.view = "lesson";
      render();
      return;
    }

    const { lesson, runtime } = await prepareRuntime(lessonId, null);
    const now = new Date();
    const session = {
      session_id: window.VocabDB.createId("ses"),
      date: window.VocabScoring.localDate(now),
      user_id: state.user?.user_id || "Keith",
      course_id: window.VocabDB.COURSE_ID,
      stage: lesson.stage,
      lesson_id: lesson.lesson_id,
      lesson_title: lesson.title,
      planned_minutes: lesson.estimated_minutes || 45,
      started_at: window.VocabScoring.localIso(now),
      started_at_ms: Date.now(),
      total_paused_ms: 0,
      paused: false,
      pause_started_at_ms: null,
      current_index: 0,
      question_ids: runtime.map((row) => row.question.question_id),
      step_by_question: Object.fromEntries(runtime.map((row) => [row.question.question_id, row.step])),
      answers: {}
    };

    state.activeSession = session;
    state.currentQuestionKey = null;
    window.VocabDB.saveActiveSession(session);
    window.VocabDB.savePrefs({ last_opened_lesson: lesson.lesson_id, current_stage: lesson.stage });
    await window.VocabDB.put("lessons", { ...lesson, status: "in_progress" });
    await loadData();
    state.activeSession = session;
    await prepareRuntime(lessonId, session);
    state.view = "lesson";
    render();
  }

  async function answerCurrent(letter) {
    const session = state.activeSession;
    const progress = runtimeProgress();
    const row = progress.current;
    if (!session || !row || session.paused) return;
    const question = row.question;
    if (session.answers?.[question.question_id]) return;

    const responseTime = Math.max(0.2, (Date.now() - (state.questionStartedAt || Date.now())) / 1000);
    const previousWrongCount = state.attempts.filter((attempt) => attempt.target_item_id === question.target_item_id && !attempt.is_correct).length;
    const isCorrect = letter === question.correct_answer;
    const speedBucket = window.VocabScoring.speedBucket(isCorrect, responseTime, question.type);
    const attempt = {
      attempt_id: `${window.VocabScoring.localDate().replace(/-/g, "")}_${session.lesson_id.replace(/-/g, "_")}_Q${String(progress.index + 1).padStart(3, "0")}_${Date.now()}`,
      timestamp: window.VocabScoring.localIso(),
      user_id: session.user_id,
      course_id: session.course_id,
      stage: session.stage,
      lesson_id: session.lesson_id,
      step: row.step,
      session_id: session.session_id,
      question_id: question.question_id,
      question_type: question.type,
      correct_answer: question.correct_answer,
      user_answer: letter,
      is_correct: isCorrect,
      response_time_seconds: Number(responseTime.toFixed(2)),
      speed_bucket: speedBucket,
      error_code: isCorrect ? null : question.default_error_code,
      default_error_code: question.default_error_code,
      is_repeated_error: !isCorrect && previousWrongCount >= 1,
      review_priority: !isCorrect && previousWrongCount >= 2 ? 5 : !isCorrect ? 3 : 0,
      mode: "blind_drill",
      target_item_id: question.target_item_id,
      grammar_link_id: question.grammar_link_id || null
    };

    await window.VocabDB.put("attempts", attempt);
    await updateItemMastery(question, attempt);

    session.answers[question.question_id] = {
      attempt_id: attempt.attempt_id,
      user_answer: letter,
      is_correct: isCorrect,
      response_time_seconds: attempt.response_time_seconds
    };
    const next = nextUnansweredIndex(progress.index + 1);
    session.current_index = next >= 0 ? next : state.runtimeQuestions.length;
    window.VocabDB.saveActiveSession(session);

    state.attempts.push(attempt);
    state.currentQuestionKey = null;
    render();
  }

  async function updateItemMastery(question, attempt) {
    const today = window.VocabScoring.localDate();
    const existing = await window.VocabDB.get("vocab_items", question.target_item_id);
    const seenCount = Number(existing?.seen_count || 0) + 1;
    const correctCount = Number(existing?.correct_count || 0) + (attempt.is_correct ? 1 : 0);
    const wrongCount = Number(existing?.wrong_count || 0) + (attempt.is_correct ? 0 : 1);
    const previousAvg = Number(existing?.avg_response_time_seconds || 0);
    const avgResponse = previousAvg
      ? ((previousAvg * Number(existing.seen_count || 0)) + attempt.response_time_seconds) / seenCount
      : attempt.response_time_seconds;
    const consecutiveFastCorrect = attempt.speed_bucket === "fast_correct"
      ? Number(existing?.consecutive_fast_correct || 0) + 1
      : attempt.is_correct ? Number(existing?.consecutive_fast_correct || 0) : 0;
    const item = {
      item_id: question.target_item_id,
      item_type: existing?.item_type || question.skill || question.type,
      base_word: existing?.base_word || question.target_item_id.replace(/^item_/, "").replace(/_/g, " "),
      variants: existing?.variants || [],
      first_seen: existing?.first_seen || today,
      last_seen: today,
      seen_count: seenCount,
      correct_count: correctCount,
      wrong_count: wrongCount,
      avg_response_time_seconds: Number(avgResponse.toFixed(2)),
      last_error_code: attempt.is_correct ? existing?.last_error_code || null : attempt.error_code,
      last_question_type: question.type,
      consecutive_fast_correct: consecutiveFastCorrect,
      stable_review_sessions: existing?.stable_review_sessions || 0,
      next_review_date: attempt.is_correct ? existing?.next_review_date || null : window.VocabScoring.addDays(today, wrongCount >= 3 ? 1 : 2)
    };
    item.mastery_score = window.VocabScoring.calculateMasteryScore(item);
    item.mastery_level = consecutiveFastCorrect >= 3 && item.mastery_score >= 75 ? "stable" : window.VocabScoring.masteryLevel(item.mastery_score);
    if (item.mastery_level === "stable" && Number(item.stable_review_sessions || 0) >= 2) {
      item.mastery_level = "mastered";
      item.mastery_score = Math.max(item.mastery_score, 85);
    }
    await window.VocabDB.put("vocab_items", item);
  }

  function nextUnansweredIndex(start) {
    const session = state.activeSession;
    for (let i = start; i < state.runtimeQuestions.length; i += 1) {
      const questionId = state.runtimeQuestions[i].question.question_id;
      if (!session.answers?.[questionId]) return i;
    }
    for (let i = 0; i < start; i += 1) {
      const questionId = state.runtimeQuestions[i].question.question_id;
      if (!session.answers?.[questionId]) return i;
    }
    return -1;
  }

  function nextQuestion() {
    if (!state.activeSession) return;
    state.activeSession.current_index = Math.min(state.runtimeQuestions.length, (state.activeSession.current_index || 0) + 1);
    state.currentQuestionKey = null;
    window.VocabDB.saveActiveSession(state.activeSession);
    render();
  }

  function previousQuestion() {
    if (!state.activeSession) return;
    state.activeSession.current_index = Math.max(0, (state.activeSession.current_index || 0) - 1);
    state.currentQuestionKey = null;
    window.VocabDB.saveActiveSession(state.activeSession);
    render();
  }

  function togglePause() {
    const session = state.activeSession;
    if (!session) return;
    if (session.paused) {
      const pausedFor = Date.now() - (session.pause_started_at_ms || Date.now());
      session.total_paused_ms = Number(session.total_paused_ms || 0) + pausedFor;
      session.paused = false;
      session.pause_started_at_ms = null;
      if (state.questionStartedAt) state.questionStartedAt += pausedFor;
    } else {
      session.paused = true;
      session.pause_started_at_ms = Date.now();
    }
    window.VocabDB.saveActiveSession(session);
    render();
  }

  function exitLesson() {
    if (state.activeSession) window.VocabDB.saveActiveSession(state.activeSession);
    state.view = "today";
    render();
  }

  async function finishLesson() {
    const session = state.activeSession;
    if (!session) return;
    const attempts = await window.VocabDB.getByIndex("attempts", "session_id", session.session_id);
    const total = attempts.length;
    const correct = attempts.filter((attempt) => attempt.is_correct).length;
    const wrong = total - correct;
    const accuracy = total ? correct / total : 0;
    const avgTime = average(attempts.map((attempt) => attempt.response_time_seconds));
    const topErrors = topCounts(attempts.filter((attempt) => !attempt.is_correct), "error_code", 5).map(([code]) => code);
    const status = accuracy >= 0.8 ? "completed" : accuracy >= 0.6 ? "completed_with_reinforcement" : "needs_retake";
    const now = new Date();
    const sessionRecord = {
      session_id: session.session_id,
      date: window.VocabScoring.localDate(now),
      user_id: session.user_id,
      course_id: session.course_id,
      stage: session.stage,
      lesson_id: session.lesson_id,
      lesson_title: session.lesson_title,
      planned_minutes: session.planned_minutes,
      actual_minutes: Number((lessonElapsedSeconds() / 60).toFixed(1)),
      started_at: session.started_at,
      ended_at: window.VocabScoring.localIso(now),
      total_questions: total,
      correct_questions: correct,
      wrong_questions: wrong,
      accuracy,
      avg_response_time_seconds: Number(avgTime.toFixed(2)),
      fast_correct_count: attempts.filter((attempt) => attempt.speed_bucket === "fast_correct").length,
      slow_correct_count: attempts.filter((attempt) => attempt.speed_bucket === "slow_correct").length,
      top_error_codes: topErrors,
      mastery_status: accuracy >= 0.85 ? "stable" : accuracy >= 0.8 ? "passed" : accuracy >= 0.6 ? "unstable" : "needs_retake",
      next_action: accuracy >= 0.8 ? "unlock_next_lesson" : accuracy >= 0.6 ? "add_5_reinforcement_questions" : "retake_lesson"
    };

    await window.VocabDB.put("sessions", sessionRecord);
    const lesson = state.lessons.find((row) => row.lesson_id === session.lesson_id);
    if (lesson) await window.VocabDB.put("lessons", { ...lesson, status });

    if (status === "completed_with_reinforcement") {
      const wrongAttempts = attempts.filter((attempt) => !attempt.is_correct).slice(0, 5);
      for (const attempt of wrongAttempts) {
        await upsertReviewQueue(attempt, "reinforcement", 4);
      }
    }
    if (status === "needs_retake") {
      const wrongAttempts = attempts.filter((attempt) => !attempt.is_correct);
      for (const attempt of wrongAttempts) {
        await upsertReviewQueue(attempt, "needs_retake", 5);
      }
    }

    window.VocabDB.saveActiveSession(null);
    state.activeSession = null;
    state.currentQuestionKey = null;
    state.reviewSessionId = session.session_id;
    await loadData();
    state.view = "mistakes";
    render();
  }

  async function upsertReviewQueue(attempt, reason, priority) {
    if (!attempt.target_item_id) return;
    const today = window.VocabScoring.localDate();
    const dueDate = window.VocabScoring.addDays(today, priority >= 5 ? 1 : 2);
    const id = `review_${attempt.target_item_id}_${dueDate}`;
    const existing = await window.VocabDB.get("review_queue", id);
    const questionIds = new Set([...(existing?.question_ids || []), attempt.question_id]);
    const record = {
      review_id: id,
      item_id: attempt.target_item_id,
      question_ids: [...questionIds],
      reason,
      priority: Math.max(priority || 3, existing?.priority || 0),
      due_date: dueDate,
      status: existing?.status || "pending",
      created_at: existing?.created_at || window.VocabScoring.localIso(),
      updated_at: window.VocabScoring.localIso()
    };
    await window.VocabDB.put("review_queue", record);
  }

  function renderMistakes() {
    if (state.reviewSessionId) return renderSessionErrorReview(state.reviewSessionId);
    const pending = state.reviewQueue.filter((item) => item.status === "pending");
    const items = byId(state.vocabItems, "item_id");
    const rows = pending.map((entry) => `
      <article class="queue-card priority-${entry.priority}">
        <div>
          <strong>${html(items[entry.item_id]?.base_word || entry.item_id)}</strong>
          <p>${html(entry.reason)} · due ${html(entry.due_date)} · ${entry.question_ids?.length || 0} questions</p>
        </div>
        <div class="queue-actions">
          <span class="priority-pill">P${entry.priority}</span>
          <button class="button small" type="button" onclick="VocabTracker.markQueueDone('${html(entry.review_id)}')">Done</button>
        </div>
      </article>
    `).join("");

    return `
      <section class="tracker-panel">
        <h3>Mistake Review Queue</h3>
        ${pending.length ? `<div class="queue-list">${rows}</div>` : `<p class="muted-note">No pending review items.</p>`}
      </section>
      <section class="tracker-panel">
        <h3>Recent Wrong Attempts</h3>
        ${renderWrongAttemptList()}
      </section>
    `;
  }

  function renderWrongAttemptList() {
    const questionMap = byId(state.questions, "question_id");
    const wrong = state.attempts.filter((attempt) => !attempt.is_correct).slice(-20).reverse();
    if (!wrong.length) return `<p class="muted-note">No wrong attempts yet.</p>`;
    return wrong.map((attempt) => {
      const q = questionMap[attempt.question_id];
      return `
        <article class="wrong-line">
          <strong>${html(attempt.lesson_id)} · ${html(q?.question_text || attempt.question_id)}</strong>
          <small>Your ${html(attempt.user_answer)} (${html(optionText(q, attempt.user_answer))}) · Correct ${html(attempt.correct_answer)} (${html(optionText(q, attempt.correct_answer))}) · ${html(attempt.error_code || attempt.default_error_code)}</small>
        </article>
      `;
    }).join("");
  }

  function renderSessionErrorReview(sessionId) {
    const questionMap = byId(state.questions, "question_id");
    const attempts = state.attempts.filter((attempt) => attempt.session_id === sessionId && !attempt.is_correct);
    if (!attempts.length) {
      return `
        <section class="tracker-panel">
          <h3>Error Review + Scheduling</h3>
          <p class="tracker-bigline">No incorrect answers in this session.</p>
          <button class="button primary" type="button" onclick="VocabTracker.closeSessionReview()">Back to Dashboard</button>
        </section>
      `;
    }
    return `
      <section class="tracker-panel">
        <h3>Error Review + Scheduling</h3>
        <p class="muted-note">Confirm or change the actual cause. Confirmed errors update attempts, error logs, item mastery, and review queue.</p>
        <div class="error-review-list">
          ${attempts.map((attempt) => {
            const q = questionMap[attempt.question_id];
            return `
              <article class="error-card">
                <div class="question-meta">
                  <span>${html(attempt.lesson_id)}</span>
                  <span>${html(attempt.question_type)}</span>
                  <span>${seconds(attempt.response_time_seconds)}</span>
                </div>
                <p class="question-text small">${html(q?.question_text || attempt.question_id)}</p>
                <div class="answer-compare">
                  <span>Your ${html(attempt.user_answer)}: ${html(optionText(q, attempt.user_answer))}</span>
                  <span>Correct ${html(attempt.correct_answer)}: ${html(optionText(q, attempt.correct_answer))}</span>
                </div>
                <p class="explanation">${html(q?.explanation_zh || "")}</p>
                <label class="field-label">Error code</label>
                <select data-error-attempt="${html(attempt.attempt_id)}">
                  ${window.VocabScoring.ERROR_CODES.map((code) => `<option value="${code}" ${(attempt.error_code || attempt.default_error_code) === code ? "selected" : ""}>${code}</option>`).join("")}
                </select>
              </article>
            `;
          }).join("")}
        </div>
        <div class="tracker-actions">
          <button class="button primary" type="button" onclick="VocabTracker.confirmSessionErrors()">Save Confirmed Error Codes</button>
          <button class="button secondary" type="button" onclick="VocabTracker.closeSessionReview()">Skip</button>
        </div>
      </section>
    `;
  }

  async function confirmSessionErrors() {
    const selects = [...document.querySelectorAll("[data-error-attempt]")];
    for (const select of selects) {
      await confirmError(select.dataset.errorAttempt, select.value);
    }
    state.reviewSessionId = null;
    await loadData();
    setNotice("Error codes saved and review queue updated.", "ok");
    state.view = "today";
    render();
  }

  async function confirmError(attemptId, errorCode) {
    const attempt = await window.VocabDB.get("attempts", attemptId);
    if (!attempt) return;
    const wrongCount = state.attempts.filter((row) => row.target_item_id === attempt.target_item_id && !row.is_correct).length;
    const repeated = wrongCount >= 2;
    const priority = wrongCount >= 3 || errorCode === "REPEATED_ERROR" ? 5 : errorCode === "CARELESS" ? 2 : 3;
    const updated = {
      ...attempt,
      error_code: errorCode,
      is_repeated_error: repeated,
      review_priority: priority,
      confirmed_at: window.VocabScoring.localIso()
    };
    await window.VocabDB.put("attempts", updated);
    await window.VocabDB.put("error_logs", {
      error_log_id: `err_${attemptId}`,
      attempt_id: attemptId,
      timestamp: window.VocabScoring.localIso(),
      user_id: attempt.user_id,
      course_id: attempt.course_id,
      stage: attempt.stage,
      lesson_id: attempt.lesson_id,
      question_id: attempt.question_id,
      item_id: attempt.target_item_id,
      error_code: errorCode,
      default_error_code: attempt.default_error_code,
      is_repeated_error: repeated,
      status: "confirmed"
    });
    await upsertReviewQueue(updated, repeated ? "repeated_error" : "lesson_error", priority);
    const item = await window.VocabDB.get("vocab_items", attempt.target_item_id);
    if (item) {
      item.last_error_code = errorCode;
      item.next_review_date = window.VocabScoring.addDays(window.VocabScoring.localDate(), priority >= 5 ? 1 : 2);
      await window.VocabDB.put("vocab_items", item);
    }
  }

  function closeSessionReview() {
    state.reviewSessionId = null;
    state.view = "today";
    render();
  }

  async function markQueueDone(reviewId) {
    const entry = await window.VocabDB.get("review_queue", reviewId);
    if (!entry) return;
    await window.VocabDB.put("review_queue", { ...entry, status: "done", completed_at: window.VocabScoring.localIso() });
    await loadData();
    render();
  }

  function renderMastery() {
    const rows = state.vocabItems
      .slice()
      .sort((a, b) => (a.mastery_score || 0) - (b.mastery_score || 0))
      .map((item) => `
        <article class="mastery-row level-${html(item.mastery_level || "blind")}">
          <div>
            <strong>${html(item.base_word || item.item_id)}</strong>
            <small>${html((item.variants || []).join(", "))}</small>
          </div>
          <div class="mastery-meta">
            <span>${item.mastery_score || 0}</span>
            <small>${masteryLabel(item.mastery_level)}</small>
          </div>
          <div class="mastery-details">
            <span>Seen ${item.seen_count || 0}</span>
            <span>Correct ${item.correct_count || 0}</span>
            <span>Wrong ${item.wrong_count || 0}</span>
            <span>Avg ${seconds(item.avg_response_time_seconds)}</span>
            <span>Next ${html(item.next_review_date || "-")}</span>
          </div>
        </article>
      `).join("");
    return `
      <section class="tracker-panel">
        <h3>Item Mastery Dashboard</h3>
        <div class="mastery-list">${rows || `<p class="muted-note">No mastery records yet.</p>`}</div>
      </section>
    `;
  }

  function renderExport() {
    const files = buildExportFiles();
    return `
      <section class="tracker-panel">
        <h3>Export Dashboard</h3>
        <div class="tracker-grid export-grid">
          <article class="tracker-stat"><span>Sessions</span><strong>${state.sessions.length}</strong><small>saved</small></article>
          <article class="tracker-stat"><span>Attempts</span><strong>${state.attempts.length}</strong><small>saved</small></article>
          <article class="tracker-stat"><span>Items</span><strong>${state.vocabItems.length}</strong><small>mastery rows</small></article>
          <article class="tracker-stat"><span>Questions</span><strong>${state.questions.length}</strong><small>bank snapshot</small></article>
        </div>
        <div class="tracker-actions">
          <button class="button primary" type="button" onclick="VocabTracker.exportPackage()">Export for ChatGPT Analysis</button>
          ${Object.keys(files).map((name) => `<button class="button secondary" type="button" onclick="VocabTracker.downloadExportFile('${html(name)}')">${html(name)}</button>`).join("")}
        </div>
      </section>
      <section class="tracker-panel">
        <h3>summary.md Preview</h3>
        <pre class="export-preview">${html(files["summary.md"])}</pre>
      </section>
    `;
  }

  function buildExportFiles() {
    const date = window.VocabScoring.localDate();
    const attemptsRows = [[
      "attempt_id", "timestamp", "user_id", "course_id", "stage", "lesson_id", "step", "question_id", "question_type", "correct_answer", "user_answer", "is_correct", "response_time_seconds", "error_code", "is_repeated_error", "review_priority", "mode"
    ]];
    state.attempts.forEach((attempt) => {
      attemptsRows.push([
        attempt.attempt_id,
        attempt.timestamp,
        attempt.user_id,
        attempt.course_id,
        attempt.stage,
        attempt.lesson_id,
        attempt.step,
        attempt.question_id,
        attempt.question_type,
        attempt.correct_answer,
        attempt.user_answer,
        attempt.is_correct,
        attempt.response_time_seconds,
        attempt.error_code || "",
        attempt.is_repeated_error,
        attempt.review_priority,
        attempt.mode
      ]);
    });

    const sessionsRows = [["session_id", "date", "lesson_id", "lesson_title", "planned_minutes", "actual_minutes", "total_questions", "correct_questions", "wrong_questions", "accuracy", "avg_response_time_seconds", "top_error_codes", "mastery_status", "next_action"]];
    state.sessions.forEach((session) => {
      sessionsRows.push([
        session.session_id,
        session.date,
        session.lesson_id,
        session.lesson_title,
        session.planned_minutes,
        session.actual_minutes,
        session.total_questions,
        session.correct_questions,
        session.wrong_questions,
        session.accuracy,
        session.avg_response_time_seconds,
        (session.top_error_codes || []).join("|"),
        session.mastery_status,
        session.next_action
      ]);
    });

    const masteryRows = [["item_id", "item_type", "base_word", "variants", "first_seen", "last_seen", "seen_count", "correct_count", "wrong_count", "avg_response_time_seconds", "last_error_code", "mastery_score", "mastery_level", "next_review_date"]];
    state.vocabItems.forEach((item) => {
      masteryRows.push([
        item.item_id,
        item.item_type,
        item.base_word,
        (item.variants || []).join("|"),
        item.first_seen || "",
        item.last_seen || "",
        item.seen_count || 0,
        item.correct_count || 0,
        item.wrong_count || 0,
        item.avg_response_time_seconds || 0,
        item.last_error_code || "",
        item.mastery_score || 0,
        item.mastery_level || "blind",
        item.next_review_date || ""
      ]);
    });

    const errorSummaryRows = [["error_code", "count", "repeated_count"]];
    topCounts(state.attempts.filter((attempt) => !attempt.is_correct), "error_code", 99).forEach(([code, count]) => {
      const repeated = state.attempts.filter((attempt) => attempt.error_code === code && attempt.is_repeated_error).length;
      errorSummaryRows.push([code, count, repeated]);
    });

    const stageProgress = buildStageProgress();
    const rawEvents = [
      ...state.sessions.map((record) => ({ event_type: "session", ...record })),
      ...state.attempts.map((record) => ({ event_type: "attempt", ...record })),
      ...state.errorLogs.map((record) => ({ event_type: "error_log", ...record })),
      ...state.reviewQueue.map((record) => ({ event_type: "review_queue", ...record }))
    ].map((record) => JSON.stringify(record)).join("\n");

    return {
      "summary.md": buildSummaryMarkdown(stageProgress),
      "sessions.csv": `\ufeff${window.VocabScoring.toCsv(sessionsRows)}`,
      "attempts.csv": `\ufeff${window.VocabScoring.toCsv(attemptsRows)}`,
      "item_mastery.csv": `\ufeff${window.VocabScoring.toCsv(masteryRows)}`,
      "error_summary.csv": `\ufeff${window.VocabScoring.toCsv(errorSummaryRows)}`,
      "stage_progress.json": JSON.stringify(stageProgress, null, 2),
      "question_bank_snapshot.json": JSON.stringify({
        exported_at: window.VocabScoring.localIso(),
        question_count: state.questions.length,
        questions: state.questions
      }, null, 2),
      "raw_events.jsonl": `${rawEvents}\n`,
      [`toeic_vocab_export_${date}.json`]: JSON.stringify({
        exported_at: window.VocabScoring.localIso(),
        files: {
          summary_md: "summary.md",
          sessions_csv: "sessions.csv",
          attempts_csv: "attempts.csv",
          item_mastery_csv: "item_mastery.csv",
          error_summary_csv: "error_summary.csv",
          stage_progress_json: "stage_progress.json",
          question_bank_snapshot_json: "question_bank_snapshot.json",
          raw_events_jsonl: "raw_events.jsonl"
        },
        data: { sessions: state.sessions, attempts: state.attempts, item_mastery: state.vocabItems, errors: state.errorLogs, review_queue: state.reviewQueue, stage_progress: stageProgress }
      }, null, 2)
    };
  }

  function buildStageProgress() {
    const questionMap = byId(state.questions, "question_id");
    return (state.curriculum?.stages || []).map((stage) => {
      const lessons = state.lessons.filter((lesson) => lesson.stage === stage.stage);
      const attempts = state.attempts.filter((attempt) => attempt.stage === stage.stage);
      const masteredItems = state.vocabItems.filter((item) => item.mastery_level === "mastered").length;
      const unstableItems = state.vocabItems.filter((item) => ["blind", "weak", "unstable"].includes(item.mastery_level)).length;
      const repeatedErrors = attempts.filter((attempt) => attempt.is_repeated_error).length;
      return {
        stage: stage.stage,
        stage_name: stage.stage_name,
        lessons_available: lessons.length,
        lessons_completed: lessons.filter((lesson) => PASS_STATUSES.has(lesson.status)).length,
        stage_progress: lessons.length ? lessons.filter((lesson) => PASS_STATUSES.has(lesson.status)).length / lessons.length : 0,
        stage_accuracy: attempts.length ? average(attempts.map((attempt) => attempt.is_correct ? 1 : 0)) : 0,
        stage_avg_response_time: average(attempts.map((attempt) => attempt.response_time_seconds)),
        stage_mastered_items: masteredItems,
        stage_unstable_items: unstableItems,
        stage_repeated_errors: repeatedErrors,
        stage_seal_status: lessons.length && lessons.every((lesson) => lesson.status === "sealed") ? "sealed" : "open",
        question_types_seen: [...new Set(attempts.map((attempt) => questionMap[attempt.question_id]?.type || attempt.question_type))]
      };
    });
  }

  function buildSummaryMarkdown(stageProgress) {
    const current = currentLesson();
    const attempts = state.attempts;
    const wrong = attempts.filter((attempt) => !attempt.is_correct);
    const overallAccuracy = attempts.length ? average(attempts.map((attempt) => attempt.is_correct ? 1 : 0)) : 0;
    const avgTime = average(attempts.map((attempt) => attempt.response_time_seconds));
    const repeatedRate = wrong.length ? wrong.filter((attempt) => attempt.is_repeated_error).length / wrong.length : 0;
    const moduleRows = moduleAccuracy().map(([type, value]) => `- ${type}: ${pct(value)}`).join("\n") || "- No attempts yet";
    const topErrors = topCounts(wrong, "error_code", 5).map(([code, count], index) => `${index + 1}. ${code}: ${count}`).join("\n") || "1. None";
    const weakItems = state.vocabItems.slice().sort((a, b) => (a.mastery_score || 0) - (b.mastery_score || 0)).slice(0, 5)
      .map((item, index) => `${index + 1}. ${item.base_word || item.item_id}: ${item.mastery_score || 0} (${item.mastery_level || "blind"})`).join("\n") || "1. None";
    const stageRows = stageProgress.map((stage) => `- ${stage.stage}: ${Math.round(stage.stage_progress * 100)}% / ${stage.stage_seal_status}`).join("\n");
    return `# TOEIC Vocabulary Progress Export

User: ${state.user?.display_name || state.user?.user_id || "Keith"}
Export Date: ${window.VocabScoring.localDate()}
Current Stage: ${current?.stage || ""}
Current Lesson: ${current?.lesson_id || ""}

## Overall Progress
- Completed Lessons: ${state.lessons.filter((lesson) => PASS_STATUSES.has(lesson.status)).length}
- Total Lessons: ${state.lessons.length}
- Total Attempts: ${attempts.length}
- Overall Accuracy: ${pct(overallAccuracy)}
- Average Response Time: ${seconds(avgTime)}
- Repeated Error Rate: ${pct(repeatedRate)}

## Module Accuracy
${moduleRows}

## Top Error Codes
${topErrors}

## Top Weak Items
${weakItems}

## Stage Status
${stageRows}

## Request
Please analyze my TOEIC vocabulary progress and recommend the next lessons.
`;
  }

  async function exportPackage() {
    const date = window.VocabScoring.localDate();
    const folderName = `toeic_vocab_export_${date}`;
    const files = buildExportFiles();
    await window.VocabDB.put("exports", {
      export_id: `export_${Date.now()}`,
      created_at: window.VocabScoring.localIso(),
      folder_name: folderName,
      file_names: Object.keys(files),
      session_count: state.sessions.length,
      attempt_count: state.attempts.length
    });

    if (window.showDirectoryPicker) {
      try {
        const root = await window.showDirectoryPicker({ mode: "readwrite" });
        const dir = await root.getDirectoryHandle(folderName, { create: true });
        for (const [name, content] of Object.entries(files)) {
          const handle = await dir.getFileHandle(name, { create: true });
          const writable = await handle.createWritable();
          await writable.write(content);
          await writable.close();
        }
        setNotice(`Export package saved to ${folderName}.`, "ok");
        await loadData();
        render();
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }

    Object.entries(files).forEach(([name, content], index) => {
      setTimeout(() => {
        const mime = name.endsWith(".json") ? "application/json;charset=utf-8"
          : name.endsWith(".csv") ? "text/csv;charset=utf-8"
          : name.endsWith(".md") ? "text/markdown;charset=utf-8"
          : "application/x-ndjson;charset=utf-8";
        window.VocabScoring.downloadText(`${folderName}_${name}`, content, mime);
      }, index * 160);
    });
    setNotice("Browser does not expose folder save access here, so files were downloaded individually.", "warn");
    await loadData();
    render();
  }

  function downloadExportFile(name) {
    const files = buildExportFiles();
    if (!files[name]) return;
    window.VocabScoring.downloadText(name, files[name], "text/plain;charset=utf-8");
  }

  function filteredQuestions() {
    return state.questions.filter((question) => {
      if (state.bankFilters.stage && question.stage !== state.bankFilters.stage) return false;
      if (state.bankFilters.lesson_id && question.lesson_id !== state.bankFilters.lesson_id) return false;
      if (state.bankFilters.type && question.type !== state.bankFilters.type) return false;
      if (state.bankFilters.error_code && question.default_error_code !== state.bankFilters.error_code) return false;
      return true;
    }).sort((a, b) => String(a.question_id).localeCompare(String(b.question_id)));
  }

  function validateQuestionBank(questions) {
    const required = ["question_id", "lesson_id", "stage", "type", "question_text", "correct_answer", "explanation_zh", "target_item_id", "default_error_code", "difficulty"];
    const errors = [];
    const warnings = [];
    const ids = new Set();
    const texts = new Set();
    questions.forEach((question) => {
      required.forEach((field) => {
        if (question[field] === undefined || question[field] === null || question[field] === "") errors.push(`${question.question_id || "(unknown)"} missing ${field}`);
      });
      if (!["A", "B", "C", "D"].includes(question.correct_answer)) errors.push(`${question.question_id} correct_answer must be A/B/C/D`);
      ["A", "B", "C", "D"].forEach((letter) => {
        if (!question.options || !question.options[letter]) errors.push(`${question.question_id} missing option ${letter}`);
      });
      if (ids.has(question.question_id)) errors.push(`duplicate question_id ${question.question_id}`);
      ids.add(question.question_id);
      const normalizedText = String(question.question_text || "").trim().toLowerCase();
      if (texts.has(normalizedText)) warnings.push(`duplicate question text: ${question.question_id}`);
      if (normalizedText) texts.add(normalizedText);
      if (!question.grammar_link_id) warnings.push(`${question.question_id} has no grammar_link_id`);
      if (!Array.isArray(question.tags) || !question.tags.length) warnings.push(`${question.question_id} has no tags`);
      if (!question.estimated_time_seconds) warnings.push(`${question.question_id} has no estimated_time_seconds`);
    });
    const dist = answerDistribution(questions);
    const total = questions.length || 1;
    Object.entries(dist).forEach(([letter, count]) => {
      if (count / total > 0.4) warnings.push(`answer ${letter} is ${count}/${total}, over 40%`);
    });
    return { errors, warnings, dist };
  }

  function renderQuestionBank() {
    const questions = filteredQuestions();
    const validation = validateQuestionBank(questions);
    const stages = [...new Set(state.questions.map((question) => question.stage))].sort();
    const lessons = [...new Set(state.questions.map((question) => question.lesson_id))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const types = [...new Set(state.questions.map((question) => question.type))].sort();
    const selected = state.selectedQuestionId ? state.questions.find((question) => question.question_id === state.selectedQuestionId) : null;

    return `
      <section class="tracker-panel">
        <h3>Question Bank Manager</h3>
        <div class="bank-filters">
          ${renderSelect("stage", "Stage", stages, state.bankFilters.stage)}
          ${renderSelect("lesson_id", "Lesson", lessons, state.bankFilters.lesson_id)}
          ${renderSelect("type", "Type", types, state.bankFilters.type)}
          ${renderSelect("error_code", "Error", window.VocabScoring.ERROR_CODES, state.bankFilters.error_code)}
        </div>
        <div class="bank-summary">
          <span>Question Count: <strong>${questions.length}</strong></span>
          <span>A:${validation.dist.A} / B:${validation.dist.B} / C:${validation.dist.C} / D:${validation.dist.D}</span>
          <span>Errors: ${validation.errors.length}</span>
          <span>Warnings: ${validation.warnings.length}</span>
        </div>
        <div class="tracker-actions">
          <button class="button secondary" type="button" onclick="VocabTracker.newQuestionTemplate()">Add Question</button>
          <button class="button secondary" type="button" onclick="VocabTracker.exportQuestions()">Export JSON</button>
          <label class="button secondary file-button">Import JSON<input type="file" accept="application/json,.json" onchange="VocabTracker.importQuestions(this.files[0])"></label>
          <button class="button secondary" type="button" onclick="VocabTracker.showValidation()">Validate Bank</button>
        </div>
      </section>
      <section class="bank-layout">
        <article class="tracker-panel question-list-panel">
          <h3>Questions</h3>
          <div class="question-list">
            ${questions.slice(0, 120).map((question) => `
              <button class="question-row ${state.selectedQuestionId === question.question_id ? "active" : ""}" type="button" onclick="VocabTracker.selectQuestion('${html(question.question_id)}')">
                <strong>${html(question.question_id)}</strong>
                <small>${html(question.lesson_id)} · ${html(question.type)} · ${html(question.default_error_code)}</small>
              </button>
            `).join("")}
          </div>
        </article>
        <article class="tracker-panel editor-panel">
          <h3>Editor</h3>
          <textarea id="question-json-editor" spellcheck="false">${html(selected ? JSON.stringify(selected, null, 2) : "")}</textarea>
          <div class="tracker-actions">
            <button class="button primary" type="button" onclick="VocabTracker.saveQuestionFromEditor()">Save Question JSON</button>
            <button class="button secondary" type="button" onclick="VocabTracker.deleteSelectedQuestion()" ${selected ? "" : "disabled"}>Delete</button>
          </div>
        </article>
      </section>
    `;
  }

  function renderSelect(key, label, values, selected) {
    return `
      <label>
        <span>${html(label)}</span>
        <select onchange="VocabTracker.setBankFilter('${key}', this.value)">
          <option value="">All</option>
          ${values.map((value) => `<option value="${html(value)}" ${selected === value ? "selected" : ""}>${html(value)}</option>`).join("")}
        </select>
      </label>
    `;
  }

  function setBankFilter(key, value) {
    state.bankFilters[key] = value;
    render();
  }

  function selectQuestion(questionId) {
    state.selectedQuestionId = questionId;
    render();
  }

  function newQuestionTemplate() {
    const lesson = currentLesson();
    const template = {
      question_id: `custom_${Date.now()}`,
      lesson_id: lesson.lesson_id,
      stage: lesson.stage,
      type: "meaning_choice",
      skill: "meaning_choice",
      subskill: "custom",
      grammar_link_id: lesson.grammar_link_id || null,
      question_text: "Choose the best answer.",
      options: { A: "", B: "", C: "", D: "" },
      correct_answer: "A",
      explanation_zh: "",
      target_item_id: "item_custom",
      distractor_type: "toeic_realistic",
      difficulty: 2,
      estimated_time_seconds: 20,
      default_error_code: "VOCAB_WEAK_RECALL",
      tags: ["custom"]
    };
    state.selectedQuestionId = null;
    render();
    $("question-json-editor").value = JSON.stringify(template, null, 2);
  }

  async function saveQuestionFromEditor() {
    const raw = $("question-json-editor")?.value || "";
    let question;
    try {
      question = JSON.parse(raw);
    } catch (err) {
      setNotice(`Question JSON parse failed: ${err.message}`, "danger");
      return;
    }
    const validation = validateQuestionBank([question]);
    if (validation.errors.length) {
      setNotice(validation.errors.slice(0, 3).join(" | "), "danger");
      return;
    }
    await window.VocabDB.put("questions", question);
    state.selectedQuestionId = question.question_id;
    await loadData();
    setNotice("Question saved.", "ok");
    render();
  }

  async function deleteSelectedQuestion() {
    if (!state.selectedQuestionId) return;
    if (!window.confirm(`Delete ${state.selectedQuestionId}?`)) return;
    await window.VocabDB.remove("questions", state.selectedQuestionId);
    state.selectedQuestionId = null;
    await loadData();
    render();
  }

  async function importQuestions(file) {
    if (!file) return;
    const text = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      setNotice(`Import JSON parse failed: ${err.message}`, "danger");
      return;
    }
    const questions = Array.isArray(parsed) ? parsed : parsed.questions;
    if (!Array.isArray(questions)) {
      setNotice("Import file must be a question array or an object with questions[].", "danger");
      return;
    }
    const validation = validateQuestionBank(questions);
    if (validation.errors.length) {
      setNotice(`Import rejected: ${validation.errors.slice(0, 5).join(" | ")}`, "danger");
      return;
    }
    await window.VocabDB.putAll("questions", questions);
    await loadData();
    setNotice(`${questions.length} questions imported.`, "ok");
    render();
  }

  function exportQuestions() {
    const questions = filteredQuestions();
    window.VocabScoring.downloadText("toeic_vocab_questions_export.json", JSON.stringify(questions, null, 2), "application/json;charset=utf-8");
  }

  function showValidation() {
    const validation = validateQuestionBank(filteredQuestions());
    const lines = [
      `Errors: ${validation.errors.length}`,
      ...validation.errors.slice(0, 8),
      `Warnings: ${validation.warnings.length}`,
      ...validation.warnings.slice(0, 8)
    ];
    setNotice(lines.join(" | "), validation.errors.length ? "danger" : validation.warnings.length ? "warn" : "ok");
  }

  function renderSettings() {
    return `
      <section class="tracker-panel">
        <h3>Settings</h3>
        <div class="settings-grid">
          <label><span>User</span><input id="setting-user" value="${html(state.user?.display_name || "Keith")}"></label>
          <label><span>Baseline Score</span><input id="setting-baseline" type="number" value="${html(state.user?.baseline_score || 570)}"></label>
          <label><span>Target Score</span><input id="setting-target" type="number" value="${html(state.user?.target_score || 750)}"></label>
          <label><span>Planned Lessons / Week</span><input id="setting-weekly" type="number" min="1" max="14" value="${html(state.prefs.planned_lessons_this_week || 5)}"></label>
        </div>
        <div class="tracker-actions">
          <button class="button primary" type="button" onclick="VocabTracker.saveSettings()">Save Settings</button>
          <button class="button secondary" type="button" onclick="VocabTracker.clearActiveSession()">Clear Active Lesson Resume</button>
        </div>
      </section>
      <section class="tracker-panel">
        <h3>Local Stores</h3>
        <div class="stage-list">
          <div class="stage-row"><span>users</span><strong>1</strong></div>
          <div class="stage-row"><span>lessons</span><strong>${state.lessons.length}</strong></div>
          <div class="stage-row"><span>questions</span><strong>${state.questions.length}</strong></div>
          <div class="stage-row"><span>attempts</span><strong>${state.attempts.length}</strong></div>
          <div class="stage-row"><span>sessions</span><strong>${state.sessions.length}</strong></div>
          <div class="stage-row"><span>review_queue</span><strong>${state.reviewQueue.length}</strong></div>
        </div>
      </section>
    `;
  }

  async function saveSettings() {
    const user = {
      ...(state.user || {}),
      user_id: state.user?.user_id || "Keith",
      display_name: $("setting-user").value || "Keith",
      baseline_score: Number($("setting-baseline").value || 570),
      target_score: Number($("setting-target").value || 750)
    };
    await window.VocabDB.put("users", user);
    window.VocabDB.savePrefs({ planned_lessons_this_week: Number($("setting-weekly").value || 5) });
    await loadData();
    setNotice("Settings saved.", "ok");
    render();
  }

  async function clearActiveSession() {
    window.VocabDB.saveActiveSession(null);
    state.activeSession = null;
    state.runtimeQuestions = [];
    state.currentQuestionKey = null;
    await loadData();
    render();
  }

  async function changeLessonStatus(lessonId, status) {
    const lesson = await window.VocabDB.get("lessons", lessonId);
    if (!lesson) return;
    await window.VocabDB.put("lessons", { ...lesson, status });
    await loadData();
    render();
  }

  function setView(view) {
    state.view = view;
    if (view !== "mistakes") state.reviewSessionId = null;
    render();
  }

  async function init() {
    try {
      $("tracker-view").innerHTML = `<section class="tracker-panel"><p class="muted-note">Loading TOEIC Vocabulary Tracker...</p></section>`;
      const seed = await window.VocabDB.seedIfNeeded();
      await loadData();
      const active = window.VocabDB.loadActiveSession();
      if (active) {
        state.activeSession = active;
        await prepareRuntime(active.lesson_id, active);
      }
      render();
      if (seed.seeded) setNotice("Seeded V0 + V1-A curriculum and question bank into IndexedDB.", "ok");
    } catch (err) {
      console.error(err);
      $("tracker-view").innerHTML = `<section class="tracker-panel"><div class="tracker-alert danger">${html(err.message || err)}</div></section>`;
    }
  }

  window.VocabTracker = {
    answerCurrent,
    changeLessonStatus,
    clearActiveSession,
    closeSessionReview,
    confirmSessionErrors,
    deleteSelectedQuestion,
    downloadExportFile,
    exitLesson,
    exportPackage,
    exportQuestions,
    finishLesson,
    importQuestions,
    init,
    markQueueDone,
    newQuestionTemplate,
    nextQuestion,
    previousQuestion,
    saveQuestionFromEditor,
    saveSettings,
    selectQuestion,
    setBankFilter,
    setView,
    showValidation,
    startLesson,
    togglePause
  };
})();

(function () {
  let state = null;

  function createLocalId(prefix) {
    const random = Math.random().toString(36).slice(2, 10);
    return `${prefix}_${Date.now()}_${random}`;
  }

  function makeId(prefix) {
    return window.LearningLog?.createId ? window.LearningLog.createId(prefix) : createLocalId(prefix);
  }

  function localDateFromISO(iso) {
    const d = iso ? new Date(iso) : new Date();
    const mm = `${d.getMonth() + 1}`.padStart(2, "0");
    const dd = `${d.getDate()}`.padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  function secondsText(ms) {
    return (Number(ms || 0) / 1000).toFixed(1);
  }

  function normalizeLocalEvent(event) {
    const timestamp = event.timestamp_iso || new Date().toISOString();
    return {
      event_id: event.event_id || makeId("evt"),
      timestamp_iso: timestamp,
      date: event.date || localDateFromISO(timestamp),
      timeout: false,
      metadata: {},
      ...event
    };
  }

  function recordLearningEvent(event) {
    if (!state) return Promise.resolve(null);

    const rawEvent = {
      session_id: state.sessionId,
      attempt_id: state.attemptId,
      lesson_id: state.lesson.lesson_id,
      target_component: state.lesson.target_component,
      ...event
    };
    const prepared = window.LearningLog?.normalizeEvent
      ? window.LearningLog.normalizeEvent(rawEvent)
      : normalizeLocalEvent(rawEvent);

    state.timelineEvents.push(prepared);

    const writePromise = window.LearningLog?.writeEvent
      ? window.LearningLog.writeEvent(prepared)
      : Promise.resolve(prepared);
    const safePromise = writePromise.catch((err) => {
      console.warn("學習事件寫入失敗，作答流程會繼續。", err);
      return prepared;
    });
    state.pendingWrites.push(safePromise);
    return safePromise;
  }

  async function flushLearningWrites(extraPromises) {
    if (!state) return;
    const writes = [...state.pendingWrites, ...(extraPromises || [])];
    state.pendingWrites = [];
    await Promise.allSettled(writes);
  }

  function logQuestionViewIfNeeded() {
    if (!state || !state.started) return;
    const i = state.currentIndex;
    if (state.questionViewed[i]) return;

    state.questionViewed[i] = true;
    state.questionViewedAtIso[i] = new Date().toISOString();
    const q = currentQ();
    recordLearningEvent({
      event_type: "question_view",
      q_id: q.q_id,
      elapsed_ms: 0,
      remaining_ms: state.remaining[i] * 1000,
      weakness_tag: q.weakness_tag,
      zh_message: `你開始查看 ${state.lesson.lesson_id} / Q${i + 1}（${q.q_id}）。`
    });
  }

  function questionCount() {
    return state.questions.length;
  }

  function currentQ() {
    return state.questions[state.currentIndex];
  }

  function finishedCount() {
    return state.answers.filter((a, i) => a || state.timeouts[i]).length;
  }

  function allFinished() {
    return finishedCount() === questionCount();
  }

  function renderDots() {
    const wrap = document.getElementById("q-dots");
    wrap.innerHTML = "";
    for (let i = 0; i < questionCount(); i += 1) {
      const dot = document.createElement("div");
      dot.className = "q-dot";
      if (i === state.currentIndex) dot.classList.add("current");
      if (state.timeouts[i]) dot.classList.add("timeout");
      else if (state.answers[i]) dot.classList.add("answered");
      wrap.appendChild(dot);
    }
  }

  function renderHead() {
    document.getElementById("q-progress").textContent = `Q ${state.currentIndex + 1} / ${questionCount()}`;
    document.getElementById("progress-fill").style.width = `${(finishedCount() / questionCount()) * 100}%`;
    renderDots();
  }

  function renderStatus() {
    const status = document.getElementById("q-status");
    if (!status) return;

    const i = state.currentIndex;
    const remaining = questionCount() - finishedCount();
    if (!state.started) {
      status.textContent = "按「開始作答」後計時。";
      return;
    }
    if (state.timeouts[i]) {
      status.textContent = `本題逾時，系統已鎖定。尚餘 ${remaining} 題。`;
      return;
    }
    if (state.answers[i]) {
      status.textContent = `本題已作答並鎖定。尚餘 ${remaining} 題。`;
      return;
    }
    status.textContent = `選一個答案；尚餘 ${remaining} 題。`;
  }

  function renderTimer() {
    const left = state.remaining[state.currentIndex];
    const tNum = document.getElementById("timer-number");
    const tBar = document.getElementById("timer-left");

    if (!state.started) {
      tNum.textContent = "-";
      tBar.style.width = "100%";
      return;
    }

    tNum.textContent = `${left}`;
    tNum.classList.toggle("danger", left <= 7);

    tBar.style.width = `${(left / state.limit) * 100}%`;
    tBar.classList.toggle("danger", left <= 7);
  }

  function renderQuestion() {
    const q = currentQ();
    document.getElementById("quiz-scene").textContent = `${q.scene} | ${q.q_id}`;
    document.getElementById("quiz-stem").innerHTML = q.stem.replace("{BLANK}", '<span class="blank"></span>');
    document.getElementById("hint-text").textContent = `💡 ${q.hint || "先判斷空格詞性"}`;

    const grid = document.getElementById("option-grid");
    grid.innerHTML = "";

    const alreadyAnswered = Boolean(state.answers[state.currentIndex]);

    q.options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "option-btn";
      btn.type = "button";
      const isSelected = state.answers[state.currentIndex] === opt.label;
      if (isSelected) btn.classList.add("selected");
      btn.disabled = !state.started || state.timeouts[state.currentIndex] || alreadyAnswered;
      btn.innerHTML = `<strong>${opt.label}.</strong> ${opt.text}`;
      btn.addEventListener("click", () => chooseOption(opt.label));
      grid.appendChild(btn);
    });

    document.getElementById("prev-btn").disabled = !state.started || state.currentIndex === 0;
    document.getElementById("next-btn").disabled = !state.started || state.currentIndex === questionCount() - 1;

    const submit = document.getElementById("submit-btn");
    const remaining = questionCount() - finishedCount();
    submit.disabled = !allFinished();
    submit.textContent = allFinished() ? "交卷看報告" : `尚餘 ${remaining} 題`;
    renderTimer();
    renderHead();
    renderStatus();
    logQuestionViewIfNeeded();
  }

  function stopTick() {
    if (state.tickId) {
      clearInterval(state.tickId);
      state.tickId = null;
    }
  }

  function nextUnfinished() {
    for (let i = 0; i < questionCount(); i += 1) {
      if (!state.answers[i] && !state.timeouts[i]) return i;
    }
    return -1;
  }

  function timeoutCurrent() {
    const i = state.currentIndex;
    if (state.answers[i] || state.timeouts[i]) return;
    const q = state.questions[i];
    state.timeouts[i] = true;
    state.elapsed[i] = state.limit;
    recordLearningEvent({
      event_type: "question_timeout",
      q_id: q.q_id,
      selected_answer: "TIMEOUT",
      correct_answer: q.answer,
      is_correct: false,
      elapsed_ms: state.limit * 1000,
      remaining_ms: 0,
      timeout: true,
      weakness_tag: q.weakness_tag,
      locked: true,
      metadata: { question_index: i + 1 },
      zh_message: `你在 ${state.lesson.lesson_id} / Q${i + 1} 逾時，系統記錄為 TIMEOUT。`
    });
    stopTick();
    renderQuestion();

    setTimeout(() => {
      const next = nextUnfinished();
      if (next >= 0) {
        state.currentIndex = next;
        renderQuestion();
        maybeStartTimer();
      }
    }, 700);
  }

  function startTickForCurrent() {
    stopTick();
    state.tickId = setInterval(() => {
      const i = state.currentIndex;
      if (state.answers[i] || state.timeouts[i]) {
        stopTick();
        return;
      }

      state.remaining[i] -= 1;
      if (state.remaining[i] <= 0) {
        state.remaining[i] = 0;
        renderTimer();
        timeoutCurrent();
        return;
      }

      renderTimer();
    }, 1000);
  }

  function maybeStartTimer() {
    const i = state.currentIndex;
    if (!state.started) return;
    if (state.answers[i] || state.timeouts[i]) {
      stopTick();
      return;
    }
    startTickForCurrent();
  }

  function chooseOption(label) {
    const i = state.currentIndex;
    if (state.timeouts[i]) return;
    if (state.answers[i]) return;
    const q = state.questions[i];

    state.answers[i] = label;
    state.elapsed[i] = state.limit - state.remaining[i];
    if (state.elapsed[i] <= 0) state.elapsed[i] = 1;
    const elapsedMs = state.elapsed[i] * 1000;
    const remainingMs = Math.max(0, (state.limit - state.elapsed[i]) * 1000);
    recordLearningEvent({
      event_type: "answer_select",
      q_id: q.q_id,
      selected_answer: label,
      correct_answer: q.answer,
      is_correct: label === q.answer,
      elapsed_ms: elapsedMs,
      remaining_ms: remainingMs,
      timeout: false,
      weakness_tag: q.weakness_tag,
      locked: true,
      metadata: { question_index: i + 1 },
      zh_message: `你在 ${state.lesson.lesson_id} / Q${i + 1} 選擇 ${label}，用時 ${secondsText(elapsedMs)} 秒。`
    });

    stopTick();
    renderQuestion();
    setTimeout(() => {
      if (!state || state.currentIndex !== i) return;
      const next = nextUnfinished();
      if (next >= 0) {
        state.currentIndex = next;
        renderQuestion();
        maybeStartTimer();
      }
    }, 450);
  }

  function nav(delta) {
    stopTick();
    state.currentIndex = Math.min(questionCount() - 1, Math.max(0, state.currentIndex + delta));
    renderQuestion();
    maybeStartTimer();
  }

  function formatResult() {
    return state.questions.map((q, i) => {
      const answerToken = state.timeouts[i] ? "TIMEOUT" : state.answers[i];
      const elapsed = state.elapsed[i] || state.limit;
      return `Q${i + 1}:${answerToken}/${elapsed}s`;
    }).join(", ");
  }

  async function submitQuiz() {
    if (!allFinished()) return;
    stopTick();
    const submitButton = document.getElementById("submit-btn");
    submitButton.disabled = true;
    submitButton.textContent = "儲存紀錄中...";

    const results = state.questions.map((q, i) => {
      const selected = state.answers[i];
      const correctLabel = q.answer;
      const timeout = state.timeouts[i];
      const correct = !timeout && selected === correctLabel;
      return {
        q_id: q.q_id,
        type: q.type,
        weakness_tag: q.weakness_tag,
        stem: q.stem,
        options: q.options,
        answer: q.answer,
        selected,
        timeout,
        elapsed: state.elapsed[i] || state.limit,
        correct,
        hint: q.hint,
        solution_steps: q.solution_steps,
        wrong_thought_steps: q.wrong_thought_steps || [],
        rule_box: q.rule_box || { type: "ok", text: "" }
      };
    });

    const main = results.filter((r) => r.type === "main");
    const accuracy = main.filter((r) => r.correct).length / (main.length || 1);
    const avgTime = main.reduce((s, r) => s + r.elapsed, 0) / (main.length || 1);
    const mastery = window.Scorer.calcMastery(results, state.limit);
    const componentScores = {
      grammar: null,
      phrase: null,
      listening: null,
      reading: null
    };
    componentScores[state.lesson.target_component || "grammar"] = mastery;
    const endedAtMs = Date.now();
    const endedAtIso = new Date(endedAtMs).toISOString();
    const totalElapsedMs = state.startedAtMs ? endedAtMs - state.startedAtMs : null;
    const questionElapsedMs = state.elapsed.map((seconds) => Number(seconds || state.limit) * 1000);
    const wrongTags = [...new Set(results.filter((r) => !r.correct && r.weakness_tag).map((r) => r.weakness_tag))];
    const attemptSummary = {
      attempt_id: state.attemptId,
      session_id: state.sessionId,
      lesson_id: state.lesson.lesson_id,
      module_id: state.lesson.module_id,
      week: state.lesson.week,
      day: state.lesson.day,
      lesson_type: state.lesson.lesson_type,
      target_component: state.lesson.target_component,
      title: state.lesson.title,
      started_at_iso: state.startedAtIso,
      ended_at_iso: endedAtIso,
      total_elapsed_ms: totalElapsedMs,
      avg_time_ms: avgTime * 1000,
      accuracy,
      mastery,
      question_elapsed_ms: questionElapsedMs,
      question_results: results.map((r, i) => ({
        q_id: r.q_id,
        type: r.type,
        selected_answer: r.timeout ? "TIMEOUT" : r.selected,
        correct_answer: r.answer,
        is_correct: r.correct,
        elapsed_ms: questionElapsedMs[i],
        timeout: r.timeout,
        weakness_tag: r.weakness_tag,
        target_component: state.lesson.target_component
      })),
      wrong_tags: wrongTags,
      timeout_count: results.filter((r) => r.timeout).length,
      zh_summary: `你完成 ${state.lesson.lesson_id}，主題題正確率 ${Math.round(accuracy * 100)}%，平均作答 ${avgTime.toFixed(1)} 秒。`
    };

    recordLearningEvent({
      event_type: "quiz_submit",
      elapsed_ms: totalElapsedMs,
      remaining_ms: 0,
      metadata: {
        question_count: results.length,
        accuracy,
        avg_time_ms: avgTime * 1000,
        mastery,
        wrong_tags: wrongTags
      },
      zh_message: attemptSummary.zh_summary
    });

    window.AppCore.saveReportPayload({
      attempt_id: state.attemptId,
      session_id: state.sessionId,
      lesson_id: state.lesson.lesson_id,
      module_id: state.lesson.module_id,
      week: state.lesson.week,
      day: state.lesson.day,
      lesson_type: state.lesson.lesson_type,
      target_component: state.lesson.target_component,
      focus_tags: state.lesson.focus_tags || [],
      weakness_tags: state.lesson.weakness_tags || [],
      title: state.lesson.title,
      sequence: state.lesson.sequence,
      limit: state.limit,
      format: formatResult(),
      results,
      accuracy,
      avgTime,
      mastery,
      component_scores: componentScores,
      started_at_iso: state.startedAtIso,
      ended_at_iso: endedAtIso,
      total_elapsed_ms: totalElapsedMs,
      question_elapsed_ms: questionElapsedMs,
      wrong_tags: wrongTags,
      timeline_events: [...state.timelineEvents],
      attempt_summary: attemptSummary,
      answers: state.questions.map((_, i) => state.timeouts[i] ? "TIMEOUT" : state.answers[i]),
      elapsed: state.elapsed
    });

    window.StorageAPI.updateLessonResult({
      attempt_id: state.attemptId,
      lesson_id: state.lesson.lesson_id,
      module_id: state.lesson.module_id,
      week: state.lesson.week,
      day: state.lesson.day,
      lesson_type: state.lesson.lesson_type,
      target_component: state.lesson.target_component,
      accuracy,
      mastery,
      avg_time: avgTime,
      component_scores: componentScores,
      attempt_summary: attemptSummary,
      answers: state.questions.map((_, i) => state.timeouts[i] ? "TIMEOUT" : state.answers[i]),
      elapsed: state.elapsed
    });

    results.forEach((r) => {
      if (r.weakness_tag && !r.correct) {
        window.StorageAPI.touchWeakness(r.weakness_tag, r.weakness_tag, false, {
          lesson_id: state.lesson.lesson_id,
          q_id: r.q_id,
          timeout: r.timeout,
          selected: r.selected
        });
      }
    });

    const attemptWrite = window.LearningLog?.writeAttempt
      ? window.LearningLog.writeAttempt(attemptSummary).catch((err) => {
          console.warn("attempt summary 寫入 IndexedDB 失敗，localStorage 摘要已保留。", err);
          return attemptSummary;
        })
      : Promise.resolve(attemptSummary);
    await flushLearningWrites([attemptWrite]);

    window.location.href = `./report.html?lesson=${state.lesson.lesson_id}`;
  }

  function startQuiz() {
    state.started = true;
    state.startedAtMs = Date.now();
    state.startedAtIso = new Date(state.startedAtMs).toISOString();
    recordLearningEvent({
      event_type: "quiz_start",
      elapsed_ms: 0,
      remaining_ms: state.limit * questionCount() * 1000,
      metadata: { question_count: questionCount(), time_limit_seconds: state.limit },
      zh_message: `你開始作答 ${state.lesson.lesson_id}，共 ${questionCount()} 題，每題 ${state.limit} 秒。`
    });
    renderQuestion();
    maybeStartTimer();
  }

  async function initQuiz() {
    const lessonId = window.AppCore.query("lesson") || "wh-w1-d1";
    const { index, lesson } = await window.AppCore.loadLessonById(lessonId);

    const errors = window.AppCore.validateLesson(lesson);
    if (errors.length) {
      document.body.innerHTML = `<pre style="padding:20px;color:#b11">題庫驗證失敗\n${errors.join("\n")}</pre>`;
      return;
    }

    const progress = window.StorageAPI.loadProgress();
    window.AppCore.renderTopStrip(progress, index, lesson);

    const questions = [...lesson.questions, ...(lesson.monitor_questions || [])];
    const limit = lesson.time_limit_seconds;

    state = {
      lesson,
      questions,
      limit,
      currentIndex: 0,
      started: false,
      startedAtMs: null,
      startedAtIso: null,
      sessionId: makeId("ses"),
      attemptId: makeId("att"),
      answers: new Array(questions.length).fill(null),
      timeouts: new Array(questions.length).fill(false),
      elapsed: new Array(questions.length).fill(0),
      remaining: new Array(questions.length).fill(limit),
      questionViewed: new Array(questions.length).fill(false),
      questionViewedAtIso: new Array(questions.length).fill(null),
      timelineEvents: [],
      pendingWrites: [],
      tickId: null
    };

    document.getElementById("quiz-title").textContent = lesson.title;
    document.getElementById("prev-btn").addEventListener("click", () => nav(-1));
    document.getElementById("next-btn").addEventListener("click", () => nav(1));
    document.getElementById("submit-btn").addEventListener("click", submitQuiz);

    startQuiz();
  }

  window.addEventListener("beforeunload", () => {
    if (state) stopTick();
  });

  window.QuizEngine = { initQuiz };
})();

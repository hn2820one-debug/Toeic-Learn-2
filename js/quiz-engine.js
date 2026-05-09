(function () {
  let state = null;

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
    submit.disabled = !allFinished();
    renderTimer();
    renderHead();
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
    state.timeouts[i] = true;
    state.elapsed[i] = state.limit;
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

    state.answers[i] = label;
    state.elapsed[i] = state.limit - state.remaining[i];
    if (state.elapsed[i] <= 0) state.elapsed[i] = 1;

    stopTick();
    renderQuestion();
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

  function submitQuiz() {
    if (!allFinished()) return;

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

    window.AppCore.saveReportPayload({
      lesson_id: state.lesson.lesson_id,
      module_id: state.lesson.module_id,
      week: state.lesson.week,
      day: state.lesson.day,
      lesson_type: state.lesson.lesson_type,
      target_component: state.lesson.target_component,
      focus_tags: state.lesson.focus_tags || [],
      weakness_tags: state.lesson.weakness_tags || [],
      title: state.lesson.title,
      limit: state.limit,
      format: formatResult(),
      results,
      accuracy,
      avgTime,
      mastery,
      component_scores: componentScores,
      answers: state.questions.map((_, i) => state.timeouts[i] ? "TIMEOUT" : state.answers[i]),
      elapsed: state.elapsed
    });

    window.StorageAPI.updateLessonResult({
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

    window.location.href = `./report.html?lesson=${state.lesson.lesson_id}`;
  }

  function startQuiz() {
    state.started = true;
    document.getElementById("start-overlay").style.display = "none";
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
      answers: new Array(questions.length).fill(null),
      timeouts: new Array(questions.length).fill(false),
      elapsed: new Array(questions.length).fill(0),
      remaining: new Array(questions.length).fill(limit),
      tickId: null
    };

    document.getElementById("quiz-title").textContent = lesson.title;
    document.getElementById("start-btn").addEventListener("click", startQuiz);
    document.getElementById("prev-btn").addEventListener("click", () => nav(-1));
    document.getElementById("next-btn").addEventListener("click", () => nav(1));
    document.getElementById("submit-btn").addEventListener("click", submitQuiz);

    renderQuestion();
  }

  window.addEventListener("beforeunload", () => {
    if (state) stopTick();
  });

  window.QuizEngine = { initQuiz };
})();

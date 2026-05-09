(function () {
  const TIMER_LIMITS = {
    slow: 25,
    standard: 20,
    intensive: 15,
    weekly: 15
  };

  const COMPONENT_LABELS = {
    grammar: "Grammar Mastery",
    phrase: "Phrase Mastery",
    listening: "Listening Drill",
    reading: "Reading Speed"
  };

  async function fetchJSON(path) {
    const res = await fetch(path);
    if (!res.ok) {
      throw new Error(`Failed to load ${path}`);
    }
    return res.json();
  }

  function query(name) {
    const url = new URL(window.location.href);
    return url.searchParams.get(name);
  }

  function setTopStrip(text) {
    const el = document.getElementById("top-strip");
    if (el) el.textContent = text;
  }

  function completedLessonCount(progress) {
    const ids = new Set();
    Object.values(progress.modules || {}).forEach((module) => {
      Object.keys(module.day_results || {}).forEach((lessonId) => ids.add(lessonId));
    });
    return ids.size;
  }

  function renderTopStrip(progress, indexData, lesson) {
    const moduleId = lesson?.module_id || progress.student.current_module || indexData.student.current_module;
    const module = indexData.modules.find((m) => m.module_id === moduleId) || indexData.modules[0];
    const week = lesson?.week || progress.student.current_week || indexData.student.current_week || 1;
    const day = lesson?.day || progress.student.current_day || indexData.student.current_day || 1;
    const stage = week <= 13 ? 1 : week <= 30 ? 2 : 3;
    const total = indexData.lessons.length;
    const done = completedLessonCount(progress);
    const remaining = Math.max(0, total - done);
    setTopStrip(`Stage ${stage} / Week ${week} / Day ${day} | 已建課剩餘 ${remaining} 節 | 本週主攻：${module.title}`);
  }

  function validateQuestion(q) {
    const errors = [];
    if (!q.q_id) errors.push("缺少 q_id");
    if (!q.type) errors.push("缺少 type");
    if (!q.stem) errors.push("缺少 stem");
    if (!q.answer) errors.push("缺少 answer");
    if (!q.weakness_tag) errors.push("缺少 weakness_tag");

    if (!Array.isArray(q.options) || q.options.length !== 4) {
      errors.push("選項必須恰好 4 個");
      return errors;
    }

    const labels = q.options.map((o) => o.label);
    ["A", "B", "C", "D"].forEach((x) => {
      if (!labels.includes(x)) errors.push(`缺少選項 ${x}`);
    });

    const correct = q.options.filter((o) => o.is_correct);
    if (correct.length !== 1) errors.push("必須恰好有 1 個正確選項");
    if (correct[0] && correct[0].label !== q.answer) errors.push("answer 與 is_correct 不一致");

    const validPos = ["noun", "verb", "adj", "adv"];
    q.options.forEach((o) => {
      if (!validPos.includes(o.pos)) errors.push(`選項 ${o.label} pos 無效`);
    });

    if (!q.solution_steps || q.solution_steps.length < 2) {
      errors.push("solution_steps 至少 2 步");
    }

    return errors;
  }

  function validateDistribution(questions) {
    const total = questions.length;
    const errors = [];
    if (total < 10) return errors;

    const dist = { A: 0, B: 0, C: 0, D: 0 };
    questions.forEach((q) => {
      dist[q.answer] += 1;
    });

    Object.entries(dist).forEach(([label, count]) => {
      if (count / total > 0.4) {
        errors.push(`答案 ${label} 出現 ${count}/${total} 次，超過 40%`);
      }
    });

    const answers = questions.map((q) => q.answer);
    for (let i = 0; i < answers.length - 2; i += 1) {
      if (answers[i] === answers[i + 1] && answers[i + 1] === answers[i + 2]) {
        errors.push(`Q${i + 1}-Q${i + 3} 連三題答案相同`);
      }
    }

    return errors;
  }

  function validateLesson(lesson) {
    const all = [...(lesson.questions || []), ...(lesson.monitor_questions || [])];
    const errors = [];

    if (!lesson.lesson_id) errors.push("lesson 缺少 lesson_id");
    if (!lesson.module_id) errors.push("lesson 缺少 module_id");
    if (!lesson.lesson_type) errors.push("lesson 缺少 lesson_type");
    if (!lesson.target_component) errors.push("lesson 缺少 target_component");
    if (!Array.isArray(lesson.focus_tags)) errors.push("lesson 缺少 focus_tags");
    if (!Array.isArray(lesson.weakness_tags)) errors.push("lesson 缺少 weakness_tags");
    if (!all.length) errors.push("lesson 至少需要 1 題");

    all.forEach((q) => {
      const qErrors = validateQuestion(q);
      qErrors.forEach((e) => errors.push(`${q.q_id || "(unknown q)"}: ${e}`));
    });

    validateDistribution(all).forEach((e) => errors.push(e));

    const totalTime = (lesson.questions || []).length * lesson.time_limit_seconds;
    if (totalTime > 600) {
      errors.push(`總答題時間 ${totalTime}s 超過 10 分鐘`);
    }

    return errors;
  }

  async function loadIndex() {
    return fetchJSON("./data/index.json");
  }

  function dataPathFromIndexRow(row) {
    if (!row.file) return null;
    return `./data/${row.file.replace(/^\.\/?/, "")}`;
  }

  async function loadLessonById(lessonId) {
    const index = await loadIndex();
    const row = index.lessons.find((l) => l.lesson_id === lessonId);
    if (!row) throw new Error(`Lesson not found: ${lessonId}`);
    const path = dataPathFromIndexRow(row);
    if (!path) throw new Error(`Lesson is planned but not built yet: ${lessonId}`);
    const lessonData = await fetchJSON(path);
    const lesson = { ...row, ...lessonData };
    lesson.time_limit_seconds = lesson.time_limit_seconds || TIMER_LIMITS[lesson.quiz_type] || 20;
    lesson.lesson_type = lesson.lesson_type || row.lesson_type || "grammar";
    lesson.target_component = lesson.target_component || row.target_component || "grammar";
    lesson.focus_tags = lesson.focus_tags || row.focus_tags || [];
    lesson.weakness_tags = lesson.weakness_tags || row.weakness_tags || [];
    return { index, lesson };
  }

  function registerSW() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch(() => {});
      });
    }
  }

  function saveReportPayload(payload) {
    sessionStorage.setItem("toeic_latest_report", JSON.stringify(payload));
  }

  function loadReportPayload() {
    const raw = sessionStorage.getItem("toeic_latest_report");
    return raw ? JSON.parse(raw) : null;
  }

  window.AppCore = {
    TIMER_LIMITS,
    COMPONENT_LABELS,
    fetchJSON,
    query,
    loadIndex,
    loadLessonById,
    renderTopStrip,
    validateLesson,
    completedLessonCount,
    saveReportPayload,
    loadReportPayload,
    registerSW
  };
})();

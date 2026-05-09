(function () {
  const KEY = "toeic_progress";
  const VERSION = 3;

  const DEFAULT_STUDENT = {
    name: "Joseph",
    baseline_score: {
      total: 570,
      listening: 315,
      reading: 255
    },
    target_score: 750,
    target_split: {
      listening: 380,
      reading: 370
    },
    current_module: "weakness-hunter",
    current_week: 1,
    current_day: 1,
    total_lessons_done: 0,
    sessions_per_week: 15
  };

  function today() {
    const d = new Date();
    const mm = `${d.getMonth() + 1}`.padStart(2, "0");
    const dd = `${d.getDate()}`.padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  function createModuleProgress(status) {
    return {
      status: status || "in-progress",
      days_done: 0,
      mastery_avg: 0,
      day_results: {},
      component_mastery: {
        grammar: 0,
        phrase: 0,
        listening: 0,
        reading: 0
      }
    };
  }

  function createDefaultProgress() {
    return {
      schema_version: VERSION,
      student: { ...DEFAULT_STUDENT },
      modules: {
        "weakness-hunter": createModuleProgress("in-progress"),
        "pos-booster": createModuleProgress("planned")
      },
      weaknesses: [],
      session_history: [],
      attempts: []
    };
  }

  function completedLessonCount(progress) {
    const ids = new Set();
    Object.values(progress.modules || {}).forEach((module) => {
      Object.keys(module.day_results || {}).forEach((lessonId) => ids.add(lessonId));
    });
    return ids.size;
  }

  function migrateProgress(rawProgress) {
    const seed = createDefaultProgress();
    const progress = rawProgress && typeof rawProgress === "object" ? rawProgress : {};

    progress.schema_version = VERSION;
    progress.student = { ...seed.student, ...(progress.student || {}) };
    progress.student.baseline_score = { ...seed.student.baseline_score, ...(progress.student.baseline_score || {}) };
    progress.student.target_split = { ...seed.student.target_split, ...(progress.student.target_split || {}) };
    progress.student.current_module = "weakness-hunter";
    progress.student.sessions_per_week = progress.student.sessions_per_week || 15;

    progress.modules = progress.modules || {};
    ["weakness-hunter", "pos-booster"].forEach((moduleId) => {
      const existing = progress.modules[moduleId] || {};
      progress.modules[moduleId] = {
        ...createModuleProgress(moduleId === "weakness-hunter" ? "in-progress" : "planned"),
        ...existing,
        day_results: existing.day_results || {},
        component_mastery: {
          grammar: 0,
          phrase: 0,
          listening: 0,
          reading: 0,
          ...(existing.component_mastery || {})
        }
      };
    });

    progress.weaknesses = Array.isArray(progress.weaknesses) ? progress.weaknesses : [];
    progress.session_history = Array.isArray(progress.session_history)
      ? progress.session_history.map((entry) => ({
          attempt_id: null,
          started_at_iso: null,
          ended_at_iso: null,
          total_elapsed_ms: null,
          question_elapsed_ms: Array.isArray(entry.elapsed) ? entry.elapsed.map((seconds) => Number(seconds || 0) * 1000) : [],
          wrong_tags: [],
          ...entry
        }))
      : [];
    progress.attempts = Array.isArray(progress.attempts) ? progress.attempts.map(normalizeAttemptSummary) : [];
    progress.student.total_lessons_done = completedLessonCount(progress);
    return progress;
  }

  function normalizeAttemptSummary(summary) {
    const raw = summary && typeof summary === "object" ? summary : {};
    const questionResults = Array.isArray(raw.question_results) ? raw.question_results : [];
    const wrongTags = Array.isArray(raw.wrong_tags)
      ? raw.wrong_tags
      : [...new Set(questionResults.filter((r) => !r.is_correct && r.weakness_tag).map((r) => r.weakness_tag))];

    return {
      schema_version: 1,
      attempt_id: raw.attempt_id || null,
      session_id: raw.session_id || null,
      lesson_id: raw.lesson_id || null,
      module_id: raw.module_id || null,
      week: raw.week ?? null,
      day: raw.day ?? null,
      lesson_type: raw.lesson_type || null,
      target_component: raw.target_component || null,
      title: raw.title || null,
      started_at_iso: raw.started_at_iso || null,
      ended_at_iso: raw.ended_at_iso || null,
      total_elapsed_ms: Number.isFinite(Number(raw.total_elapsed_ms)) ? Number(raw.total_elapsed_ms) : null,
      avg_time_ms: Number.isFinite(Number(raw.avg_time_ms)) ? Number(raw.avg_time_ms) : null,
      accuracy: Number.isFinite(Number(raw.accuracy)) ? Number(raw.accuracy) : null,
      mastery: Number.isFinite(Number(raw.mastery)) ? Number(raw.mastery) : null,
      question_elapsed_ms: Array.isArray(raw.question_elapsed_ms) ? raw.question_elapsed_ms : [],
      question_results: questionResults,
      wrong_tags: wrongTags,
      timeout_count: Number.isFinite(Number(raw.timeout_count)) ? Number(raw.timeout_count) : 0,
      zh_summary: raw.zh_summary || "已完成一次練習紀錄。"
    };
  }

  function saveAttemptSummary(summary) {
    if (!summary) return loadProgress();
    const p = loadProgress();
    const normalized = normalizeAttemptSummary(summary);
    const existingIndex = p.attempts.findIndex((attempt) => attempt.attempt_id && attempt.attempt_id === normalized.attempt_id);
    if (existingIndex >= 0) {
      p.attempts[existingIndex] = normalized;
    } else {
      p.attempts.push(normalized);
    }
    saveProgress(p);
    return p;
  }

  function loadProgress() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        const seed = createDefaultProgress();
        localStorage.setItem(KEY, JSON.stringify(seed));
        return seed;
      }

      const migrated = migrateProgress(JSON.parse(raw));
      localStorage.setItem(KEY, JSON.stringify(migrated));
      return migrated;
    } catch (err) {
      const seed = createDefaultProgress();
      localStorage.setItem(KEY, JSON.stringify(seed));
      return seed;
    }
  }

  function saveProgress(progress) {
    const migrated = migrateProgress(progress);
    localStorage.setItem(KEY, JSON.stringify(migrated));
  }

  function averageComponent(moduleProgress, component) {
    const values = Object.values(moduleProgress.day_results || {})
      .filter((r) => r.target_component === component)
      .map((r) => r.mastery);
    if (!values.length) return moduleProgress.component_mastery[component] || 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function updateLessonResult(result) {
    const p = loadProgress();
    const attemptSummary = result.attempt_summary ? normalizeAttemptSummary(result.attempt_summary) : null;
    if (!p.modules[result.module_id]) {
      p.modules[result.module_id] = createModuleProgress("in-progress");
    }

    const moduleProgress = p.modules[result.module_id];
    moduleProgress.status = "in-progress";
    moduleProgress.day_results[result.lesson_id] = {
      week: result.week,
      day: result.day,
      lesson_type: result.lesson_type,
      target_component: result.target_component,
      accuracy: result.accuracy,
      mastery: result.mastery,
      avg_time: result.avg_time,
      latest_attempt_id: attemptSummary?.attempt_id || result.attempt_id || null,
      last_practiced_at_iso: attemptSummary?.ended_at_iso || null
    };

    const values = Object.values(moduleProgress.day_results);
    moduleProgress.days_done = values.length;
    moduleProgress.mastery_avg = values.reduce((sum, v) => sum + v.mastery, 0) / (values.length || 1);
    ["grammar", "phrase", "listening", "reading"].forEach((component) => {
      moduleProgress.component_mastery[component] = averageComponent(moduleProgress, component);
    });

    p.student.current_week = Math.max(p.student.current_week || 1, result.week || 1);
    p.student.current_day = Math.max(p.student.current_day || 1, (result.day || 1) + 1);
    p.student.total_lessons_done = completedLessonCount(p);

    p.session_history.push({
      attempt_id: attemptSummary?.attempt_id || result.attempt_id || null,
      lesson_id: result.lesson_id,
      week: result.week,
      day: result.day,
      lesson_type: result.lesson_type,
      target_component: result.target_component,
      date: today(),
      started_at_iso: attemptSummary?.started_at_iso || null,
      ended_at_iso: attemptSummary?.ended_at_iso || null,
      total_elapsed_ms: attemptSummary?.total_elapsed_ms || null,
      question_elapsed_ms: attemptSummary?.question_elapsed_ms || (Array.isArray(result.elapsed) ? result.elapsed.map((seconds) => Number(seconds || 0) * 1000) : []),
      wrong_tags: attemptSummary?.wrong_tags || [],
      answers: result.answers,
      elapsed: result.elapsed,
      accuracy: result.accuracy,
      mastery: result.mastery,
      component_scores: result.component_scores || {}
    });

    if (attemptSummary) {
      const existingIndex = p.attempts.findIndex((attempt) => attempt.attempt_id && attempt.attempt_id === attemptSummary.attempt_id);
      if (existingIndex >= 0) {
        p.attempts[existingIndex] = attemptSummary;
      } else {
        p.attempts.push(attemptSummary);
      }
    }

    saveProgress(p);
    return p;
  }

  function touchWeakness(tag, label, isCorrect, meta) {
    if (isCorrect) return;

    const p = loadProgress();
    const found = p.weaknesses.find((w) => w.tag === tag);
    const occurrence = {
      date: today(),
      lesson_id: meta?.lesson_id,
      q_id: meta?.q_id,
      timeout: Boolean(meta?.timeout),
      selected: meta?.selected || null
    };

    if (!found) {
      p.weaknesses.push({
        tag,
        label,
        status: "escalated",
        occurrences: [occurrence]
      });
      saveProgress(p);
      return;
    }

    found.status = "escalated";
    found.occurrences = Array.isArray(found.occurrences) ? found.occurrences : [];
    found.occurrences.push(occurrence);
    saveProgress(p);
  }

  window.StorageAPI = {
    KEY,
    loadProgress,
    saveProgress,
    updateLessonResult,
    saveAttemptSummary,
    touchWeakness,
    completedLessonCount
  };
})();

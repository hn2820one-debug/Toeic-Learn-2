const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const indexPath = path.join(root, "data", "index.json");
const swPath = path.join(root, "sw.js");
const storagePath = path.join(root, "js", "storage.js");
const learningLogPath = path.join(root, "js", "learning-log.js");
const validComponents = new Set(["grammar", "phrase", "listening", "reading"]);
const validLessonTypes = new Set(["grammar", "phrase", "listening", "review", "test"]);
const validPos = new Set(["noun", "verb", "adj", "adv"]);
const maxQuestionsByQuizType = { slow: 6, standard: 12, intensive: 20, weekly: 20 };
const posBoosterExpected = {
  "pos-d1": { day: 1, lesson_type: "grammar", target_component: "grammar", quiz_type: "slow", time_limit_seconds: 25, main: 6, monitor: 2 },
  "pos-d2": { day: 2, lesson_type: "grammar", target_component: "grammar", quiz_type: "slow", time_limit_seconds: 25, main: 6, monitor: 2 },
  "pos-d3": { day: 3, lesson_type: "grammar", target_component: "grammar", quiz_type: "slow", time_limit_seconds: 25, main: 6, monitor: 2 },
  "pos-d4": { day: 4, lesson_type: "grammar", target_component: "grammar", quiz_type: "slow", time_limit_seconds: 25, main: 6, monitor: 2 },
  "pos-d5": { day: 5, lesson_type: "grammar", target_component: "grammar", quiz_type: "standard", time_limit_seconds: 20, main: 12, monitor: 2 },
  "pos-d6": { day: 6, lesson_type: "grammar", target_component: "grammar", quiz_type: "standard", time_limit_seconds: 20, main: 12, monitor: 2 },
  "pos-d7": { day: 7, lesson_type: "grammar", target_component: "grammar", quiz_type: "standard", time_limit_seconds: 20, main: 10, monitor: 2 },
  "pos-d8": { day: 8, lesson_type: "grammar", target_component: "grammar", quiz_type: "intensive", time_limit_seconds: 15, main: 15, monitor: 3 },
  "pos-d9": { day: 9, lesson_type: "phrase", target_component: "phrase", quiz_type: "standard", time_limit_seconds: 20, main: 10, monitor: 2 },
  "pos-d10": { day: 10, lesson_type: "phrase", target_component: "phrase", quiz_type: "standard", time_limit_seconds: 20, main: 10, monitor: 2 },
  "pos-d11": { day: 11, lesson_type: "listening", target_component: "listening", quiz_type: "standard", time_limit_seconds: 20, main: 6, monitor: 2 },
  "pos-d12": { day: 12, lesson_type: "listening", target_component: "listening", quiz_type: "standard", time_limit_seconds: 20, main: 6, monitor: 2 },
  "pos-d13": { day: 13, lesson_type: "review", target_component: "grammar", quiz_type: "standard", time_limit_seconds: 20, main: 12, monitor: 3 },
  "pos-d14": { day: 14, lesson_type: "test", target_component: "grammar", quiz_type: "weekly", time_limit_seconds: 15, main: 12, monitor: 8 }
};
const errors = [];

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function requireField(object, field, label) {
  if (object[field] === undefined || object[field] === null || object[field] === "") {
    errors.push(`${label}: missing ${field}`);
  }
}

function validateQuestion(question, lessonId) {
  const label = `${lessonId}/${question.q_id || "(missing q_id)"}`;
  ["q_id", "type", "stem", "answer", "weakness_tag"].forEach((field) => requireField(question, field, label));
  if (question.stem && !question.stem.includes("{BLANK}")) {
    errors.push(`${label}: stem must include {BLANK}`);
  }

  if (!Array.isArray(question.options) || question.options.length !== 4) {
    errors.push(`${label}: options must contain exactly 4 items`);
    return;
  }

  const labels = question.options.map((option) => option.label);
  ["A", "B", "C", "D"].forEach((optionLabel) => {
    if (!labels.includes(optionLabel)) errors.push(`${label}: missing option ${optionLabel}`);
  });

  const optionTexts = question.options.map((option) => String(option.text || "").trim().toLowerCase());
  if (new Set(optionTexts).size !== optionTexts.length) {
    errors.push(`${label}: duplicate option text`);
  }

  const correct = question.options.filter((option) => option.is_correct);
  if (correct.length !== 1) {
    errors.push(`${label}: expected exactly one correct option, got ${correct.length}`);
  } else if (correct[0].label !== question.answer) {
    errors.push(`${label}: answer does not match is_correct option`);
  } else if (question.target_pos && correct[0].pos !== question.target_pos) {
    errors.push(`${label}: target_pos ${question.target_pos} does not match correct option pos ${correct[0].pos}`);
  }

  question.options.forEach((option) => {
    if (!validPos.has(option.pos)) errors.push(`${label}: option ${option.label} has invalid pos ${option.pos}`);
  });

  if (!Array.isArray(question.solution_steps) || question.solution_steps.length < 2) {
    errors.push(`${label}: solution_steps must contain at least 2 steps`);
  }
}

function validateDistribution(questions, lessonId) {
  if (questions.length < 10) return;
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  questions.forEach((question) => {
    counts[question.answer] += 1;
  });

  Object.entries(counts).forEach(([answer, count]) => {
    if (count / questions.length > 0.4) {
      errors.push(`${lessonId}: answer ${answer} appears ${count}/${questions.length}`);
    }
  });

  const answers = questions.map((question) => question.answer);
  for (let index = 0; index < answers.length - 2; index += 1) {
    if (answers[index] === answers[index + 1] && answers[index + 1] === answers[index + 2]) {
      errors.push(`${lessonId}: three consecutive ${answers[index]} answers at Q${index + 1}-Q${index + 3}`);
    }
  }

  for (let index = 0; index < answers.length - 3; index += 1) {
    const pattern = answers.slice(index, index + 4).join("");
    if (["ABAB", "BABA", "CDCD", "DCDC"].includes(pattern)) {
      errors.push(`${lessonId}: alternating answer pattern ${pattern} at Q${index + 1}-Q${index + 4}`);
    }
  }
}

function validateDistractors(question, lessonId) {
  const label = `${lessonId}/${question.q_id || "(missing q_id)"}`;
  if (question.type !== "main") return;

  const correct = question.options.find((option) => option.is_correct);
  if (!correct) return;

  const wrong = question.options.filter((option) => !option.is_correct);
  if (!wrong.some((option) => option.pos !== correct.pos)) {
    errors.push(`${label}: expected at least one distractor with a different pos`);
  }

  const wrongCounts = wrong.reduce((counts, option) => {
    counts[option.pos] = (counts[option.pos] || 0) + 1;
    return counts;
  }, {});
  Object.entries(wrongCounts).forEach(([pos, count]) => {
    if (count > 2) errors.push(`${label}: too many ${pos} distractors (${count}/3)`);
  });
}

function validateTimeLimits(lesson, lessonId) {
  const mainCount = (lesson.questions || []).length;
  const totalTime = mainCount * lesson.time_limit_seconds;
  if (totalTime > 600) errors.push(`${lessonId}: total main-question time ${totalTime}s exceeds 600s`);

  const maxQuestions = maxQuestionsByQuizType[lesson.quiz_type] || 20;
  if (mainCount > maxQuestions) {
    errors.push(`${lessonId}: ${mainCount} main questions exceeds ${lesson.quiz_type} max ${maxQuestions}`);
  }
}

function validatePosBoosterPlan(indexData, lesson, lessonId) {
  if (lesson.module_id !== "pos-booster") return;

  const expected = posBoosterExpected[lessonId];
  if (!expected) {
    errors.push(`${lessonId}: unexpected PoS Booster lesson`);
    return;
  }

  ["day", "lesson_type", "target_component", "quiz_type", "time_limit_seconds"].forEach((field) => {
    if (lesson[field] !== expected[field]) {
      errors.push(`${lessonId}: expected ${field}=${expected[field]}, got ${lesson[field]}`);
    }
  });

  const mainCount = (lesson.questions || []).length;
  const monitorCount = (lesson.monitor_questions || []).length;
  if (mainCount !== expected.main) errors.push(`${lessonId}: expected ${expected.main} main questions, got ${mainCount}`);
  if (monitorCount !== expected.monitor) errors.push(`${lessonId}: expected ${expected.monitor} monitor questions, got ${monitorCount}`);

  const questions = [...(lesson.questions || []), ...(lesson.monitor_questions || [])];
  questions.forEach((question) => {
    ["blank_index", "eye_cue", "error_trap", "rule_box", "wrong_thought_steps"].forEach((field) => {
      if (question[field] === undefined || question[field] === null) {
        errors.push(`${lessonId}/${question.q_id}: missing PoS field ${field}`);
      }
    });
  });

  const posModule = indexData.modules.find((moduleRow) => moduleRow.module_id === "pos-booster");
  const expectedDays = Object.keys(posBoosterExpected);
  if (!posModule) {
    errors.push("pos-booster module missing from index");
  } else {
    if (posModule.total_days !== expectedDays.length) {
      errors.push(`pos-booster module: expected total_days ${expectedDays.length}, got ${posModule.total_days}`);
    }
    if (JSON.stringify(posModule.days || []) !== JSON.stringify(expectedDays)) {
      errors.push("pos-booster module: days list does not match pos-d1..pos-d14");
    }
  }
}

const index = readJSON(indexPath);
const sw = fs.readFileSync(swPath, "utf8");
const storage = fs.readFileSync(storagePath, "utf8");

const sequences = index.lessons.map((lesson) => lesson.sequence).filter((sequence) => sequence !== undefined);
if (new Set(sequences).size !== sequences.length) {
  errors.push("index.json: duplicate lesson sequence values");
}
if (sequences.length && Math.max(...sequences) !== index.lessons.length) {
  errors.push(`index.json: max sequence ${Math.max(...sequences)} does not match lesson count ${index.lessons.length}`);
}

if (!fs.existsSync(learningLogPath)) {
  errors.push("missing js/learning-log.js");
} else {
  const learningLog = fs.readFileSync(learningLogPath, "utf8");
  if (!learningLog.includes('DB_NAME = "toeic_learning_db"')) {
    errors.push("learning-log.js: DB_NAME must be toeic_learning_db");
  }
  if (!learningLog.includes('EVENT_STORE = "events"') || !learningLog.includes('ATTEMPT_STORE = "attempts"')) {
    errors.push("learning-log.js: expected events and attempts stores");
  }
}

if (!storage.includes("const VERSION = 3")) {
  errors.push("storage.js: expected localStorage schema VERSION = 3");
}

["./js/learning-log.js", "./css/progress.css"].forEach((asset) => {
  if (!sw.includes(asset)) errors.push(`service worker cache missing ${asset}`);
});

index.lessons.forEach((row) => {
  const lessonId = row.lesson_id || "(missing lesson_id)";
  ["lesson_id", "module_id", "week", "day", "sequence", "lesson_type", "target_component", "file"].forEach((field) => {
    if (field !== "file") requireField(row, field, lessonId);
  });

  if (!row.file) return; // placeholder lesson not yet built — skip all further checks

  if (!validLessonTypes.has(row.lesson_type)) errors.push(`${lessonId}: invalid lesson_type ${row.lesson_type}`);
  if (!validComponents.has(row.target_component)) errors.push(`${lessonId}: invalid target_component ${row.target_component}`);

  const relativeFile = row.file.replace(/^\.\/?/, "");
  const lessonPath = path.join(root, "data", relativeFile);
  if (!fs.existsSync(lessonPath)) {
    errors.push(`${lessonId}: missing lesson file ${row.file}`);
    return;
  }

  if (!sw.includes(`./data/${relativeFile}`)) {
    errors.push(`${lessonId}: service worker cache missing ./data/${relativeFile}`);
  }

  const lesson = { ...row, ...readJSON(lessonPath) };
  if (!Array.isArray(lesson.focus_tags)) errors.push(`${lessonId}: focus_tags must be an array`);
  if (!Array.isArray(lesson.weakness_tags)) errors.push(`${lessonId}: weakness_tags must be an array`);
  const questions = [...(lesson.questions || []), ...(lesson.monitor_questions || [])];
  if (!questions.length) errors.push(`${lessonId}: no questions`);
  questions.forEach((question) => {
    validateQuestion(question, lessonId);
    if (lesson.module_id === "pos-booster") validateDistractors(question, lessonId);
  });
  validateDistribution(questions, lessonId);
  validateTimeLimits(lesson, lessonId);
  validatePosBoosterPlan(index, lesson, lessonId);
});

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Validated ${index.lessons.length} lessons.`);

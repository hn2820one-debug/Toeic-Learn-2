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

  if (!Array.isArray(question.options) || question.options.length !== 4) {
    errors.push(`${label}: options must contain exactly 4 items`);
    return;
  }

  const labels = question.options.map((option) => option.label);
  ["A", "B", "C", "D"].forEach((optionLabel) => {
    if (!labels.includes(optionLabel)) errors.push(`${label}: missing option ${optionLabel}`);
  });

  const correct = question.options.filter((option) => option.is_correct);
  if (correct.length !== 1) {
    errors.push(`${label}: expected exactly one correct option, got ${correct.length}`);
  } else if (correct[0].label !== question.answer) {
    errors.push(`${label}: answer does not match is_correct option`);
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
}

const index = readJSON(indexPath);
const sw = fs.readFileSync(swPath, "utf8");
const storage = fs.readFileSync(storagePath, "utf8");

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
    requireField(row, field, lessonId);
  });

  if (!validLessonTypes.has(row.lesson_type)) errors.push(`${lessonId}: invalid lesson_type ${row.lesson_type}`);
  if (!validComponents.has(row.target_component)) errors.push(`${lessonId}: invalid target_component ${row.target_component}`);
  if (!Array.isArray(row.focus_tags)) errors.push(`${lessonId}: focus_tags must be an array`);
  if (!Array.isArray(row.weakness_tags)) errors.push(`${lessonId}: weakness_tags must be an array`);

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
  const questions = [...(lesson.questions || []), ...(lesson.monitor_questions || [])];
  if (!questions.length) errors.push(`${lessonId}: no questions`);
  questions.forEach((question) => validateQuestion(question, lessonId));
  validateDistribution(questions, lessonId);
});

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Validated ${index.lessons.length} lessons.`);

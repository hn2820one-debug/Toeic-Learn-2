const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "..", "data", "vocab");

const answerLetters = ["A", "B", "C", "D"];

const v0Lessons = [
  ["V0-1", "V0 Baseline Vocabulary Diagnostic", "diagnostic", ["assessment", "baseline", "estimate", "target"]],
  ["V0-2", "Meaning Recall Diagnostic", "meaning_choice", ["invoice", "shipment", "venue", "refund"]],
  ["V0-3", "TOEIC Scene Vocabulary Diagnostic", "scene_vocabulary", ["conference", "reservation", "maintenance", "recruitment"]],
  ["V0-4", "Collocation Diagnostic", "collocation", ["make arrangements", "submit a report", "meet a deadline", "place an order"]],
  ["V0-5", "Formal Phrase Diagnostic", "formal_phrase", ["regarding", "in accordance with", "prior to", "on behalf of"]],
  ["V0-6", "False Friends Diagnostic", "false_friend", ["actual", "eventually", "currently", "sensible"]],
  ["V0-7", "Part 5 Speed Diagnostic", "part5_sentence_completion", ["complete", "confirm", "process", "approve"]],
  ["V0-8", "Part 6 Context Diagnostic", "part6_context_choice", ["notice", "policy", "schedule", "procedure"]],
  ["V0-9", "Mixed Interference Diagnostic", "speed_drill", ["accurate", "available", "efficient", "responsible"]],
  ["V0-10", "V0 Seal Check", "diagnostic", ["review", "priority", "weakness", "mastery"]]
];

const v1Families = [
  {
    lessonId: "V1-A-11",
    base: "accurate",
    title: "accurate word family",
    item: "item_accurate_family",
    variants: ["accuracy", "accurate", "accurately", "inaccuracy"],
    meaning: "correct and free from mistakes",
    grammar: "SVC_LINKING_VERB_ADJ"
  },
  {
    lessonId: "V1-A-12",
    base: "efficient",
    title: "efficient word family",
    item: "item_efficient_family",
    variants: ["efficiency", "efficient", "efficiently", "inefficiency"],
    meaning: "working well without wasting time or resources",
    grammar: "ADV_MODIFIES_VERB"
  },
  {
    lessonId: "V1-A-13",
    base: "responsible",
    title: "responsible word family",
    item: "item_responsible_family",
    variants: ["responsibility", "responsible", "responsibly", "irresponsible"],
    meaning: "expected to take care of a duty",
    grammar: "ADJ_AFTER_BE"
  },
  {
    lessonId: "V1-A-14",
    base: "available",
    title: "available word family",
    item: "item_available_family",
    variants: ["availability", "available", "unavailable", "availably"],
    meaning: "ready for use or free to help",
    grammar: "ADJ_AFTER_BE"
  },
  {
    lessonId: "V1-A-15",
    base: "successful",
    title: "successful word family",
    item: "item_successful_family",
    variants: ["success", "successful", "successfully", "unsuccessful"],
    meaning: "achieving the intended result",
    grammar: "ADV_MODIFIES_VERB"
  },
  {
    lessonId: "V1-A-16",
    base: "reliable",
    title: "reliable word family",
    item: "item_reliable_family",
    variants: ["reliability", "reliable", "reliably", "unreliable"],
    meaning: "able to be trusted to work well",
    grammar: "ADJ_BEFORE_NOUN"
  },
  {
    lessonId: "V1-A-17",
    base: "productive",
    title: "productive word family",
    item: "item_productive_family",
    variants: ["productivity", "productive", "productively", "unproductive"],
    meaning: "producing good results",
    grammar: "ADJ_AFTER_LINKING_VERB"
  },
  {
    lessonId: "V1-A-18",
    base: "competitive",
    title: "competitive word family",
    item: "item_competitive_family",
    variants: ["competition", "competitive", "competitively", "competitiveness"],
    meaning: "able to succeed against others",
    grammar: "ADJ_BEFORE_NOUN"
  },
  {
    lessonId: "V1-A-19",
    base: "profitable",
    title: "profitable word family",
    item: "item_profitable_family",
    variants: ["profitability", "profitable", "profitably", "profit"],
    meaning: "making or likely to make money",
    grammar: "ADJ_AFTER_LINKING_VERB"
  },
  {
    lessonId: "V1-A-20",
    base: "secure",
    title: "secure word family",
    item: "item_secure_family",
    variants: ["security", "secure", "securely", "insecure"],
    meaning: "safe and protected",
    grammar: "ADJ_AFTER_BE"
  }
];

const v0Items = [
  ["invoice", "a document requesting payment", "receipt", "agenda", "manual"],
  ["shipment", "goods sent for delivery", "discount", "venue", "policy"],
  ["venue", "a place where an event is held", "refund", "survey", "invoice"],
  ["refund", "money returned to a customer", "deadline", "shipment", "agenda"],
  ["recruitment", "the process of hiring workers", "renovation", "delivery", "invoice"],
  ["maintenance", "work done to keep equipment in good condition", "promotion", "venue", "refund"],
  ["conference", "a formal meeting for discussion", "warranty", "schedule", "budget"],
  ["reservation", "an arrangement to keep a room or seat", "estimate", "receipt", "memo"],
  ["deadline", "the latest time something must be finished", "venue", "shipment", "discount"],
  ["warranty", "a written promise to repair or replace a product", "agenda", "refund", "policy"],
  ["budget", "a plan for spending money", "invoice", "shipment", "conference"],
  ["estimate", "an approximate calculation", "maintenance", "reservation", "deadline"]
];

const v0Sentences = [
  ["Please ____ the invoice before the end of the day.", "process", ["process", "locate", "attend", "hire"], "COLLOCATION_PREP"],
  ["The manager will ____ the schedule after the meeting.", "confirm", ["confirm", "refund", "venue", "ship"], "VOCAB_WEAK_RECALL"],
  ["All visitors must ____ at the reception desk.", "register", ["register", "invoice", "estimate", "maintain"], "SCENE_VOCAB_GAP"],
  ["The technician will ____ the printer tomorrow morning.", "repair", ["repair", "reserve", "promote", "approve"], "SCENE_VOCAB_GAP"],
  ["We need to ____ a room for Friday's workshop.", "reserve", ["reserve", "refund", "maintain", "estimate"], "COLLOCATION_PREP"],
  ["The report was ____ by the finance director.", "approved", ["approved", "venue", "shipped", "current"], "FORMAL_PHRASE"],
  ["The company will ____ the new policy next month.", "implement", ["implement", "venue", "refund", "actual"], "VOCAB_UNKNOWN"],
  ["The sales team failed to ____ the quarterly target.", "meet", ["meet", "make", "do", "take"], "COLLOCATION_PREP"]
];

const formalPhrases = [
  ["____ your request, we will send the revised quote today.", "Regarding", ["Regarding", "Although", "Despite", "Unless"]],
  ["The refund will be issued ____ company policy.", "in accordance with", ["in accordance with", "instead of", "as long as", "next to"]],
  ["Please submit your ID ____ entering the testing room.", "prior to", ["prior to", "because of", "except for", "rather than"]],
  ["I am writing ____ Ms. Chen from the accounting team.", "on behalf of", ["on behalf of", "in spite of", "as opposed to", "in charge"]]
];

const falseFriends = [
  ["actual", "real or exact", "current", "possible", "formal"],
  ["eventually", "in the end", "possibly", "immediately", "frequently"],
  ["currently", "at the present time", "correctly", "finally", "formally"],
  ["sensible", "reasonable", "sensitive", "visible", "available"]
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function optionObject(options, correctIndex) {
  const out = {};
  answerLetters.forEach((letter, i) => {
    out[letter] = options[(i + correctIndex) % options.length];
  });
  const correctText = options[0];
  const correctAnswer = answerLetters.find((letter) => out[letter] === correctText);
  return { out, correctAnswer };
}

function makeQuestion(args) {
  const { options, correctShift = 0, ...rest } = args;
  const { out, correctAnswer } = optionObject(options, correctShift);
  return {
    question_id: rest.question_id,
    lesson_id: rest.lesson_id,
    stage: rest.stage,
    type: rest.type,
    skill: rest.skill || rest.type,
    subskill: rest.subskill || rest.type,
    grammar_link_id: rest.grammar_link_id || null,
    question_text: rest.question_text,
    options: out,
    correct_answer: correctAnswer,
    explanation_zh: rest.explanation_zh,
    target_item_id: rest.target_item_id,
    distractor_type: rest.distractor_type || "toeic_realistic",
    difficulty: rest.difficulty || 2,
    estimated_time_seconds: rest.estimated_time_seconds || 20,
    default_error_code: rest.default_error_code || "VOCAB_WEAK_RECALL",
    tags: rest.tags || ["toeic_vocab"]
  };
}

function buildV0Question(lesson, index, review) {
  const [lessonId] = lesson;
  const typeCycle = [
    "meaning_choice",
    "scene_vocabulary",
    "collocation",
    "formal_phrase",
    "false_friend",
    "part5_sentence_completion",
    "part6_context_choice",
    "speed_drill"
  ];
  const type = review ? "review_question" : typeCycle[index % typeCycle.length];
  const sequence = String(index + 1).padStart(3, "0");
  const prefix = review ? "rv" : "q";
  const id = `${lessonId.toLowerCase().replace(/-/g, "_")}_${prefix}_${sequence}`;
  const item = v0Items[(index + Number(lessonId.split("-")[1])) % v0Items.length];
  const sentence = v0Sentences[index % v0Sentences.length];
  const phrase = formalPhrases[index % formalPhrases.length];
  const ff = falseFriends[index % falseFriends.length];
  const shift = (index + Number(lessonId.split("-")[1])) % 4;

  if (type === "meaning_choice") {
    return makeQuestion({
      question_id: id,
      lesson_id: lessonId,
      stage: "V0",
      type,
      question_text: `In a TOEIC business context, what does "${item[0]}" most nearly mean?`,
      options: [item[1], item[2], item[3], item[4]],
      correctShift: shift,
      explanation_zh: `"${item[0]}" 在 TOEIC 商務情境中通常指「${item[1]}」。`,
      target_item_id: `item_${item[0].replace(/\s+/g, "_")}`,
      difficulty: 1 + (index % 3),
      estimated_time_seconds: 10,
      default_error_code: "VOCAB_UNKNOWN",
      tags: ["toeic_part5", "diagnostic", "meaning"]
    });
  }

  if (type === "scene_vocabulary") {
    return makeQuestion({
      question_id: id,
      lesson_id: lessonId,
      stage: "V0",
      type,
      question_text: `The office manager updated the ______ for next week's staff meeting.`,
      options: ["schedule", "refund", "warehouse", "warranty"],
      correctShift: shift,
      explanation_zh: "會議時間表要用 schedule；其他選項不符合 staff meeting 情境。",
      target_item_id: "item_schedule",
      difficulty: 2,
      estimated_time_seconds: 15,
      default_error_code: "SCENE_VOCAB_GAP",
      tags: ["toeic_scene", "office", "diagnostic"]
    });
  }

  if (type === "collocation") {
    return makeQuestion({
      question_id: id,
      lesson_id: lessonId,
      stage: "V0",
      type,
      question_text: sentence[0],
      options: sentence[2],
      correctShift: shift,
      explanation_zh: `固定搭配是 "${sentence[1]}"，句中語意需要這個動詞。`,
      target_item_id: `item_${sentence[1].replace(/\s+/g, "_")}`,
      difficulty: 2,
      estimated_time_seconds: 15,
      default_error_code: sentence[3],
      tags: ["toeic_part5", "collocation", "diagnostic"]
    });
  }

  if (type === "formal_phrase") {
    return makeQuestion({
      question_id: id,
      lesson_id: lessonId,
      stage: "V0",
      type,
      question_text: phrase[0],
      options: phrase[2],
      correctShift: shift,
      explanation_zh: `正式商務句中應使用 "${phrase[1]}"。`,
      target_item_id: `item_${phrase[1].replace(/\s+/g, "_")}`,
      difficulty: 3,
      estimated_time_seconds: 20,
      default_error_code: "FORMAL_PHRASE",
      tags: ["formal_phrase", "business_email", "diagnostic"]
    });
  }

  if (type === "false_friend") {
    return makeQuestion({
      question_id: id,
      lesson_id: lessonId,
      stage: "V0",
      type,
      question_text: `In TOEIC English, "${ff[0]}" usually means ______.`,
      options: [ff[1], ff[2], ff[3], ff[4]],
      correctShift: shift,
      explanation_zh: `"${ff[0]}" 容易受中文直覺誤導，正確意思是「${ff[1]}」。`,
      target_item_id: `item_${ff[0]}`,
      difficulty: 2,
      estimated_time_seconds: 8,
      default_error_code: "FALSE_FRIEND",
      tags: ["false_friend", "speed", "diagnostic"]
    });
  }

  if (type === "part6_context_choice") {
    return makeQuestion({
      question_id: id,
      lesson_id: lessonId,
      stage: "V0",
      type,
      question_text: "Memo: The training room will be closed on Friday. Please check the revised ______ before booking a seat.",
      options: ["schedule", "discount", "receipt", "salary"],
      correctShift: shift,
      explanation_zh: "前文講 training room 關閉，後文 booking a seat，應檢查 revised schedule。",
      target_item_id: "item_schedule",
      difficulty: 3,
      estimated_time_seconds: 45,
      default_error_code: "SCENE_VOCAB_GAP",
      tags: ["toeic_part6", "context", "diagnostic"]
    });
  }

  if (type === "review_question") {
    return makeQuestion({
      question_id: id,
      lesson_id: lessonId,
      stage: "V0",
      type,
      question_text: `Quick review: choose the best TOEIC meaning for "${item[0]}".`,
      options: [item[1], item[2], item[3], item[4]],
      correctShift: shift,
      explanation_zh: `複習題：${item[0]} = ${item[1]}。`,
      target_item_id: `item_${item[0].replace(/\s+/g, "_")}`,
      difficulty: 2,
      estimated_time_seconds: 12,
      default_error_code: "VOCAB_WEAK_RECALL",
      tags: ["review", "diagnostic"]
    });
  }

  return makeQuestion({
    question_id: id,
    lesson_id: lessonId,
    stage: "V0",
    type,
    question_text: sentence[0],
    options: sentence[2],
    correctShift: shift,
    explanation_zh: `限時反射題：此句最自然答案是 "${sentence[1]}"。`,
    target_item_id: `item_${sentence[1].replace(/\s+/g, "_")}`,
    difficulty: 2,
    estimated_time_seconds: type === "speed_drill" ? 8 : 20,
    default_error_code: type === "speed_drill" ? "TIME_PRESSURE" : "VOCAB_WEAK_RECALL",
    tags: ["toeic_part5", "speed", "diagnostic"]
  });
}

const familyTemplates = [
  ["The report seems ______ after the final review.", 1, "seems 後面描述主詞狀態，要用形容詞。", "WORD_FAMILY_POS", "adjective_after_linking_verb"],
  ["The analyst checked the figures ______ before sending them.", 2, "修飾 checked 這個動作，要用副詞。", "WORD_FAMILY_POS", "adverb_modifies_verb"],
  ["The manager questioned the ______ of the monthly data.", 0, "the + 名詞 + of 結構需要名詞。", "WORD_FAMILY_POS", "noun_after_article"],
  ["Any ______ in the invoice must be corrected immediately.", 3, "句意是發票中的錯誤，要用否定/問題名詞或形容詞。", "WORD_FAMILY_POS", "negative_family_form"],
  ["The team needs a more ______ tracking system.", 1, "名詞 tracking system 前要用形容詞修飾。", "WORD_FAMILY_POS", "adjective_before_noun"],
  ["The changes were implemented ______ across all branches.", 2, "修飾 were implemented，要用副詞。", "WORD_FAMILY_POS", "adverb_passive"],
  ["The project depends on the ______ of the supplier.", 0, "depends on the ___ of 需要抽象名詞。", "WORD_FAMILY_POS", "noun_of_phrase"],
  ["The old process was considered ______ by the audit team.", 3, "句意表示負面狀態，要選同字族中的否定形式。", "WORD_FAMILY_POS", "negative_adjective"]
];

function buildFamilyQuestion(family, index, review) {
  const template = familyTemplates[index % familyTemplates.length];
  const sequence = String(index + 1).padStart(3, "0");
  const prefix = review ? "rv" : "q";
  const id = `${family.lessonId.toLowerCase().replace(/-/g, "_")}_${prefix}_${sequence}`;
  const shift = (index + Number(family.lessonId.split("-").pop())) % 4;
  const correctVariant = family.variants[template[1]];
  const typeCycle = [
    "word_family",
    "word_family",
    "part5_sentence_completion",
    "speed_drill",
    "meaning_choice",
    "collocation",
    "review_question"
  ];
  const type = review ? "review_question" : typeCycle[index % typeCycle.length];

  if (type === "meaning_choice") {
    return makeQuestion({
      question_id: id,
      lesson_id: family.lessonId,
      stage: "V1",
      type,
      skill: "word_family",
      subskill: "meaning_discrimination",
      grammar_link_id: family.grammar,
      question_text: `Which option best describes "${family.base}" in TOEIC business English?`,
      options: [family.meaning, "used only in casual conversation", "related to travel documents", "a type of office equipment"],
      correctShift: shift,
      explanation_zh: `"${family.base}" 的核心意思是 ${family.meaning}。`,
      target_item_id: family.item,
      distractor_type: "semantic_confusion",
      difficulty: 2,
      estimated_time_seconds: 10,
      default_error_code: "VOCAB_WEAK_RECALL",
      tags: ["toeic_part5", "word_family", "meaning"]
    });
  }

  if (type === "collocation") {
    return makeQuestion({
      question_id: id,
      lesson_id: family.lessonId,
      stage: "V1",
      type,
      skill: "word_family",
      subskill: "collocation_pattern",
      grammar_link_id: family.grammar,
      question_text: `Choose the best phrase: The company wants to improve operational ______.`,
      options: family.variants,
      correctShift: shift,
      explanation_zh: "improve operational ___ 通常接抽象名詞；此處要選名詞形式。",
      target_item_id: family.item,
      distractor_type: "same_word_family",
      difficulty: 2,
      estimated_time_seconds: 15,
      default_error_code: "WORD_FAMILY_POS",
      tags: ["toeic_part5", "collocation", "word_family"]
    });
  }

  return makeQuestion({
    question_id: id,
    lesson_id: family.lessonId,
    stage: "V1",
    type,
    skill: "word_family",
    subskill: template[4],
    grammar_link_id: family.grammar,
    question_text: template[0],
    options: [correctVariant, ...family.variants.filter((variant) => variant !== correctVariant)],
    correctShift: shift,
    explanation_zh: `${template[2]} 正確答案是 ${correctVariant}。`,
    target_item_id: family.item,
    distractor_type: "same_word_family",
    difficulty: 2 + (index % 2),
    estimated_time_seconds: type === "speed_drill" ? 8 : 20,
    default_error_code: template[3],
    tags: ["toeic_part5", "word_family", family.grammar.toLowerCase()]
  });
}

function buildCurriculum(v0Questions, v1Questions) {
  const lessons = [];
  v0Lessons.forEach((row, i) => {
    const lessonQuestions = v0Questions.filter((q) => q.lesson_id === row[0] && q.type !== "review_question");
    const reviewQuestions = v0Questions.filter((q) => q.lesson_id === row[0] && q.type === "review_question");
    lessons.push({
      lesson_id: row[0],
      stage: "V0",
      stage_name: "Diagnosis",
      lesson_number: i + 1,
      title: row[1],
      estimated_minutes: 45,
      lesson_type: row[2],
      target_items: row[3],
      question_ids: lessonQuestions.map((q) => q.question_id),
      review_question_ids: reviewQuestions.map((q) => q.question_id),
      mastery_threshold: 0.8,
      seal_threshold: 0.85,
      grammar_link_id: null,
      status: "not_started"
    });
  });

  v1Families.forEach((family, i) => {
    const lessonQuestions = v1Questions.filter((q) => q.lesson_id === family.lessonId && q.type !== "review_question");
    const reviewQuestions = v1Questions.filter((q) => q.lesson_id === family.lessonId && q.type === "review_question");
    lessons.push({
      lesson_id: family.lessonId,
      stage: "V1",
      stage_name: "Word Family",
      lesson_number: i + 11,
      title: family.title,
      estimated_minutes: 45,
      lesson_type: "word_family",
      target_items: family.variants,
      question_ids: lessonQuestions.map((q) => q.question_id),
      review_question_ids: reviewQuestions.map((q) => q.question_id),
      mastery_threshold: 0.8,
      seal_threshold: 0.85,
      grammar_link_id: family.grammar,
      status: "not_started"
    });
  });

  return {
    course_id: "toeic_vocab_v1",
    course_name: "TOEIC Vocabulary Tracker",
    schema_version: 1,
    seed_version: "toeic_vocab_tracker_v1_2026_05_14",
    generated_at: "2026-05-14T00:00:00+08:00",
    default_user: {
      user_id: "Keith",
      display_name: "Keith",
      target_score: 750,
      baseline_score: 570,
      created_at: "2026-05-14T00:00:00+08:00"
    },
    stages: [
      { stage: "V0", stage_name: "Diagnosis", total_lessons: 10, status: "available" },
      { stage: "V1", stage_name: "Word Family", total_lessons: 60, status: "partial_mvp" },
      { stage: "V2", stage_name: "TOEIC Scene Vocabulary", total_lessons: 50, status: "planned" },
      { stage: "V3", stage_name: "Collocation", total_lessons: 60, status: "planned" },
      { stage: "V4", stage_name: "Formal Phrase", total_lessons: 50, status: "planned" },
      { stage: "V5", stage_name: "False Friends + Speed Reflex", total_lessons: 50, status: "planned" },
      { stage: "V6", stage_name: "Integrated Review + Seal Test", total_lessons: 40, status: "planned" }
    ],
    lessons
  };
}

function main() {
  ensureDir(OUT_DIR);

  const v0Questions = [];
  v0Lessons.forEach((lesson) => {
    for (let i = 0; i < 20; i += 1) v0Questions.push(buildV0Question(lesson, i, false));
    for (let i = 0; i < 4; i += 1) v0Questions.push(buildV0Question(lesson, i + 20, true));
  });

  const v1Questions = [];
  v1Families.forEach((family) => {
    for (let i = 0; i < 20; i += 1) v1Questions.push(buildFamilyQuestion(family, i, false));
    for (let i = 0; i < 4; i += 1) v1Questions.push(buildFamilyQuestion(family, i + 20, true));
  });

  const curriculum = buildCurriculum(v0Questions, v1Questions);
  const vocabItems = [
    ...v0Items.map((item) => ({
      item_id: `item_${item[0].replace(/\s+/g, "_")}`,
      item_type: "diagnostic_vocab",
      base_word: item[0],
      variants: [item[0]],
      mastery_score: 0,
      mastery_level: "blind"
    })),
    ...v1Families.map((family) => ({
      item_id: family.item,
      item_type: "word_family",
      base_word: family.base,
      variants: family.variants,
      mastery_score: 0,
      mastery_level: "blind"
    }))
  ];

  fs.writeFileSync(path.join(OUT_DIR, "curriculum.json"), `${JSON.stringify(curriculum, null, 2)}\n`);
  fs.writeFileSync(path.join(OUT_DIR, "questions_v0.json"), `${JSON.stringify(v0Questions, null, 2)}\n`);
  fs.writeFileSync(path.join(OUT_DIR, "questions_v1a.json"), `${JSON.stringify(v1Questions, null, 2)}\n`);
  fs.writeFileSync(path.join(OUT_DIR, "vocab_items.json"), `${JSON.stringify(vocabItems, null, 2)}\n`);
  console.log(`Generated ${curriculum.lessons.length} lessons and ${v0Questions.length + v1Questions.length} questions in ${OUT_DIR}`);
}

main();

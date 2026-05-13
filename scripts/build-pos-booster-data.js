const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data", "pos-booster");
const indexPath = path.join(root, "data", "index.json");

const labels = ["A", "B", "C", "D"];
const posName = { noun: "名詞", verb: "動詞", adj: "形容詞", adv: "副詞" };

function option(text, pos) {
  return { text, pos };
}

function makeOptions(answer, correct, distractors) {
  if (distractors.length !== 3) throw new Error("Each question needs exactly three distractors.");
  const placed = {};
  placed[answer] = { ...correct, is_correct: true };
  labels.filter((label) => label !== answer).forEach((label, index) => {
    placed[label] = { ...distractors[index], is_correct: false };
  });
  return labels.map((label) => ({ label, ...placed[label] }));
}

function stepsFor(q, correct) {
  return [
    {
      step: 1,
      text: `先看空格位置：${q.cue.description}`,
      highlight_word: q.cue.signal_word,
      highlight_pos: q.target
    },
    {
      step: 2,
      text: `再看選項詞性：${correct.text} 是${posName[correct.pos]}，符合空格需要。`,
      highlight_word: correct.text,
      highlight_pos: correct.pos
    },
    {
      step: 3,
      text: `代入句子後語法完整，鎖定 ${q.answer}。`,
      highlight_word: correct.text,
      highlight_pos: correct.pos
    }
  ];
}

function question(day, n, q) {
  const correct = option(q.correct, q.correctPos || q.target);
  const qid = q.id || (q.type === "monitor" ? `pos-d${day}-monitor-${n}` : `pos-d${day}-q${n}`);
  const cue = {
    type: q.cue.type || "position",
    signal_word: q.cue.signal_word,
    signal_pos: q.cue.signal_pos,
    description: q.cue.description
  };
  const trap = q.trap || "只看熟悉單字或中文意思，沒有先判斷空格位置。";

  return {
    q_id: qid,
    type: q.type || "main",
    scene: q.scene,
    eye_distance: q.eye || "near",
    target_pos: q.target,
    weakness_tag: q.weakness,
    stem: q.stem,
    blank_index: 0,
    options: makeOptions(q.answer, correct, q.distractors),
    answer: q.answer,
    eye_cue: cue,
    hint: q.hint || cue.description,
    solution_steps: q.steps || stepsFor({ ...q, cue }, correct),
    error_trap: trap,
    wrong_thought_steps: q.wrong || [
      trap,
      "跳過題眼，直接用語意或熟悉度作答。"
    ],
    rule_box: {
      type: q.ruleType || "ok",
      text: q.rule
    }
  };
}

function card(type, tone, title, html) {
  return { type, tone, title, html };
}

function lesson(config) {
  return {
    lesson_id: `pos-d${config.day}`,
    module_id: "pos-booster",
    week: config.week,
    day: config.day,
    lesson_type: config.lesson_type,
    target_component: config.target_component,
    title: config.title,
    type: config.lesson_type === "test" ? "quiz" : "concept+quiz",
    quiz_type: config.quiz_type,
    time_limit_seconds: config.time_limit_seconds,
    focus_tags: config.focus_tags,
    weakness_tags: config.weakness_tags,
    concept: {
      debug_rule: config.debug_rule,
      cards: config.cards
    },
    questions: config.questions.map((q, index) => question(config.day, index + 1, q)),
    monitor_questions: (config.monitor_questions || []).map((q, index) =>
      question(config.day, index + 1, { ...q, type: "monitor" })
    )
  };
}

const commonMonitors = {
  numberOfHas: {
    scene: "[監控] SVA — the number of",
    eye: "near",
    target: "verb",
    weakness: "number-of-sva",
    stem: "The number of service requests {BLANK} increased since the new portal was launched.",
    answer: "B",
    correct: "has",
    distractors: [option("have", "verb"), option("were", "verb"), option("are", "verb")],
    cue: {
      signal_word: "The number of",
      signal_pos: "subject head",
      description: "The number of + 複數名詞，主詞核心是 number，動詞用單數。"
    },
    ruleType: "warn",
    rule: "The number of + plural noun -> singular verb."
  },
  numberOfHave: {
    scene: "[監控] SVA — a number of",
    eye: "near",
    target: "verb",
    weakness: "number-of-sva",
    stem: "A number of technicians {BLANK} completed the safety refresher course.",
    answer: "C",
    correct: "have",
    distractors: [option("has", "verb"), option("is", "verb"), option("was", "verb")],
    cue: {
      signal_word: "A number of",
      signal_pos: "quantifier",
      description: "A number of + 複數名詞表示 many，動詞跟複數 technicians。"
    },
    ruleType: "warn",
    rule: "A number of + plural noun -> plural verb."
  },
  activeReviewed: {
    scene: "[監控] Active / Passive",
    eye: "middle",
    target: "verb",
    weakness: "active-passive",
    stem: "The supervisor {BLANK} the final checklist before departure.",
    answer: "C",
    correct: "reviewed",
    distractors: [option("was reviewed", "verb"), option("is reviewed", "verb"), option("has been reviewed", "verb")],
    cue: {
      signal_word: "the final checklist",
      signal_pos: "object",
      description: "空格後有受詞 checklist，主詞 supervisor 執行動作，所以要主動語態。"
    },
    ruleType: "warn",
    rule: "空格後直接接受詞時，優先檢查主動語態。"
  },
  activeApproved: {
    scene: "[監控] Active / Passive",
    eye: "middle",
    target: "verb",
    weakness: "active-passive",
    stem: "The committee {BLANK} the proposal after a brief discussion.",
    answer: "B",
    correct: "approved",
    distractors: [option("was approved", "verb"), option("is approved", "verb"), option("has been approved", "verb")],
    cue: {
      signal_word: "the proposal",
      signal_pos: "object",
      description: "空格後有受詞 proposal，committee 是動作者，不能用被動。"
    },
    ruleType: "warn",
    rule: "主詞 + 動詞 + 受詞是主動結構。"
  },
  mandativeSubmit: {
    scene: "[監控] Mandative Subjunctive",
    eye: "far",
    target: "verb",
    weakness: "mandative-trigger-verb",
    stem: "The manager recommended that the team {BLANK} the revised report by Friday.",
    answer: "C",
    correct: "submit",
    distractors: [option("submits", "verb"), option("submitted", "verb"), option("submitting", "verb")],
    cue: {
      signal_word: "recommended that",
      signal_pos: "mandative trigger",
      description: "recommend that + S + V 原形，不能用三單或過去式。"
    },
    ruleType: "warn",
    rule: "Mandative trigger + that + S + base verb."
  },
  mandativeWear: {
    scene: "[監控] Mandative Adjective",
    eye: "far",
    target: "verb",
    weakness: "mandative-trigger-adj",
    stem: "It is essential that all visitors {BLANK} identification badges inside the facility.",
    answer: "B",
    correct: "wear",
    distractors: [option("wears", "verb"), option("wore", "verb"), option("wearing", "verb")],
    cue: {
      signal_word: "essential that",
      signal_pos: "mandative adjective",
      description: "essential that + S + V 原形，all visitors 不改變公式。"
    },
    ruleType: "warn",
    rule: "essential / mandatory / necessary that + S + base verb."
  },
  multiplierQuickly: {
    scene: "[監控] Multiplier Comparison",
    eye: "middle",
    target: "adv",
    weakness: "multiplier-comparison",
    stem: "The new scanner processes invoices twice as {BLANK} as the previous model.",
    answer: "A",
    correct: "quickly",
    distractors: [option("quick", "adj"), option("quickness", "noun"), option("quicken", "verb")],
    cue: {
      signal_word: "processes",
      signal_pos: "verb",
      description: "as ___ as 中空格修飾動詞 processes，要用副詞。"
    },
    ruleType: "warn",
    rule: "倍數 + as + adj/adv + as；修飾動詞時用副詞。"
  },
  multiplierLarge: {
    scene: "[監控] Multiplier Comparison",
    eye: "middle",
    target: "adj",
    weakness: "multiplier-comparison",
    stem: "The renovated storage area is three times as {BLANK} as the old room.",
    answer: "D",
    correct: "large",
    distractors: [option("largely", "adv"), option("largeness", "noun"), option("enlarge", "verb")],
    cue: {
      signal_word: "is",
      signal_pos: "linking verb",
      description: "as ___ as 補充 storage area 的狀態，be 動詞後用形容詞。"
    },
    ruleType: "warn",
    rule: "倍數比較中，be 動詞後比較狀態或大小時用形容詞。"
  }
};

const lessons = [
  lesson({
    day: 1,
    week: 3,
    lesson_type: "grammar",
    target_component: "grammar",
    title: "名詞辨識 Part 1 — 語尾規則",
    quiz_type: "slow",
    time_limit_seconds: 25,
    focus_tags: ["part-of-speech", "noun", "suffix"],
    weakness_tags: ["det-noun", "prep-noun", "noun-suffix", "number-of-sva"],
    debug_rule: "看到 the / a / this / our / any 或介系詞後空格，先判斷名詞位，再用 -tion / -ment / -ance 等語尾確認。",
    cards: [
      card("formula", "noun", "名詞語尾", "-tion / -ment / -ance / -ence / -ity / -ness / -ship / -hood -> <span class=\"blank-word noun\">名詞</span>"),
      card("formula", "noun", "位置法", "限定詞 + <span class=\"blank-word noun\">名詞</span>；介系詞 + <span class=\"blank-word noun\">名詞</span>"),
      card("warning", "warn", "常見錯誤", "看到熟悉動詞就先選，忽略空格其實係名詞位置。")
    ],
    questions: [
      {
        scene: "Aviation / Maintenance",
        target: "noun",
        weakness: "det-noun",
        stem: "Any {BLANK} of the maintenance window must be communicated in writing.",
        answer: "C",
        correct: "modification",
        distractors: [option("modify", "verb"), option("modifies", "verb"), option("modifiable", "adj")],
        cue: { signal_word: "Any", signal_pos: "determiner", description: "any + 空格 + of，限定詞後需要名詞。" },
        rule: "限定詞 any / the / a / our 後面接名詞；-ation 是常見名詞語尾。",
        trap: "看到 modify 語意通順就選動詞，跳過 any 的名詞位信號。"
      },
      {
        scene: "Hotel / Staffing",
        target: "noun",
        weakness: "noun-suffix",
        stem: "The hotel has introduced a new training {BLANK} for seasonal employees.",
        answer: "A",
        correct: "requirement",
        distractors: [option("require", "verb"), option("required", "adj"), option("requiring", "verb")],
        cue: { signal_word: "training", signal_pos: "noun modifier", description: "a new training + 空格，整個片語需要名詞核心。" },
        rule: "-ment 是名詞語尾；a/an/the 後的名詞片語要有名詞核心。",
        trap: "見到 training 以為後面要動作，忽略 a new 已經開出名詞片語。"
      },
      {
        scene: "Manufacturing / Quality",
        target: "noun",
        weakness: "prep-noun",
        stem: "The technician completed the {BLANK} of all measurement devices before noon.",
        answer: "D",
        correct: "calibration",
        distractors: [option("calibrate", "verb"), option("calibrated", "adj"), option("calibrating", "verb")],
        cue: { signal_word: "the", signal_pos: "determiner", description: "the + 空格 + of，空格是名詞核心。" },
        rule: "the ___ of 結構中空格通常是名詞；-tion 是名詞語尾。",
        trap: "把 completed 後面想成動作延續，誤選 calibrate。"
      },
      {
        scene: "Retail / Operations",
        target: "noun",
        weakness: "noun-suffix",
        stem: "Several departments praised her {BLANK} during the store relocation.",
        answer: "B",
        correct: "leadership",
        distractors: [option("lead", "verb"), option("leading", "adj"), option("leaderly", "adv")],
        cue: { signal_word: "her", signal_pos: "possessive determiner", description: "所有格 her 後需要名詞或名詞片語。" },
        rule: "所有格 my / your / his / her / our 後要接名詞；-ship 是名詞語尾。",
        trap: "看到 lead 表示帶領而誤選動詞，沒有處理所有格後的位置。"
      },
      {
        scene: "Banking / Audit",
        target: "noun",
        weakness: "noun-suffix",
        stem: "The audit team requested additional {BLANK} before approving the transaction.",
        answer: "A",
        correct: "documentation",
        distractors: [option("document", "verb"), option("documented", "adj"), option("documenting", "verb")],
        cue: { signal_word: "additional", signal_pos: "adjective", description: "additional 修飾後方名詞，空格需要名詞。" },
        rule: "形容詞 additional 後面接名詞；-ation 是名詞語尾。",
        trap: "只看 approve transaction 的動作語意，誤以為空格也要動詞。"
      },
      {
        scene: "Healthcare / Procurement",
        target: "noun",
        weakness: "prep-noun",
        stem: "Our {BLANK} of the vendor's proposal will be finished by Friday.",
        answer: "D",
        correct: "assessment",
        distractors: [option("assess", "verb"), option("assessed", "adj"), option("assessing", "verb")],
        cue: { signal_word: "Our", signal_pos: "possessive determiner", description: "Our + 空格 + of，空格是名詞核心。" },
        rule: "our / their / its 後的核心位置需要名詞；-ment 是名詞語尾。",
        trap: "看到 will be finished 後忽略主詞位置，誤選動詞 assess。"
      }
    ],
    monitor_questions: [commonMonitors.numberOfHas, commonMonitors.numberOfHave]
  }),
  lesson({
    day: 2,
    week: 3,
    lesson_type: "grammar",
    target_component: "grammar",
    title: "動詞辨識 Part 1 — 語尾規則",
    quiz_type: "slow",
    time_limit_seconds: 25,
    focus_tags: ["part-of-speech", "verb", "suffix"],
    weakness_tags: ["verb-position", "verb-suffix", "active-passive"],
    debug_rule: "謂語位、助動詞後、to 後優先找動詞；-ize / -en / -ify / -ate 常見動詞語尾。",
    cards: [
      card("formula", "verb", "動詞語尾", "-ize / -en / -ify / -ate -> <span class=\"blank-word verb\">動詞</span>"),
      card("formula", "verb", "動詞位置", "will / can / must / to + <span class=\"blank-word verb\">V 原形</span>"),
      card("warning", "warn", "常見錯誤", "authorize 係動詞；authority 先係名詞。長單字唔等於名詞。")
    ],
    questions: [
      {
        scene: "Retail / Billing",
        target: "verb",
        weakness: "modal-base-verb",
        stem: "The new software will {BLANK} invoices automatically at the end of each day.",
        answer: "B",
        correct: "process",
        distractors: [option("processing", "noun"), option("procession", "noun"), option("processed", "adj")],
        cue: { signal_word: "will", signal_pos: "modal", description: "will 後面要接動詞原形。" },
        rule: "助動詞 will / can / must 後接 V 原形。",
        trap: "見到 invoices 以為要名詞 process，忘記 will 後必須是動詞。"
      },
      {
        scene: "Banking / Scheduling",
        target: "verb",
        weakness: "verb-suffix",
        stem: "Branch managers must {BLANK} the holiday schedule before noon.",
        answer: "D",
        correct: "finalize",
        distractors: [option("final", "adj"), option("finalization", "noun"), option("finally", "adv")],
        cue: { signal_word: "must", signal_pos: "modal", description: "must 後需要動詞原形，且後面有受詞 schedule。" },
        rule: "-ize 是常見動詞語尾；must + V 原形。",
        trap: "看到 holiday schedule 只想修飾 schedule，誤選 final。"
      },
      {
        scene: "Hospital / Records",
        target: "verb",
        weakness: "verb-suffix",
        stem: "The clinic uses barcode labels to {BLANK} patient samples quickly.",
        answer: "A",
        correct: "identify",
        distractors: [option("identification", "noun"), option("identifiable", "adj"), option("identifiably", "adv")],
        cue: { signal_word: "to", signal_pos: "infinitive marker", description: "to + 空格 + 受詞 patient samples，需要動詞原形。" },
        rule: "不定詞 to 後接 V 原形；-ify 是動詞語尾。",
        trap: "看到 identification 常見名詞就選，忽略 to 後的動詞位。"
      },
      {
        scene: "Aviation / Gate Operations",
        target: "verb",
        weakness: "verb-suffix",
        stem: "Gate agents will {BLANK} passengers when boarding begins.",
        answer: "C",
        correct: "notify",
        distractors: [option("notification", "noun"), option("notice", "noun"), option("notifiable", "adj")],
        cue: { signal_word: "will", signal_pos: "modal", description: "will 後接動詞原形，且 passengers 是受詞。" },
        rule: "notify 是動詞；notification 是名詞；notice 可作名詞但此處需要動詞。",
        trap: "把 notice 當成通知動作而誤選，沒有用 will + V 判斷。"
      },
      {
        scene: "Manufacturing / Security",
        target: "verb",
        weakness: "verb-suffix",
        stem: "Only senior engineers can {BLANK} access to the restricted testing area.",
        answer: "D",
        correct: "authorize",
        distractors: [option("authority", "noun"), option("authorization", "noun"), option("authorized", "adj")],
        cue: { signal_word: "can", signal_pos: "modal", description: "can 後接動詞原形，access 是受詞。" },
        rule: "authorize 是動詞；authority / authorization 是名詞。",
        trap: "看到 authority 熟悉就選名詞，忽略 can 後的動詞位。"
      },
      {
        scene: "Office / Compliance",
        target: "verb",
        weakness: "verb-suffix",
        stem: "Please {BLANK} whether all employee records were transferred securely.",
        answer: "A",
        correct: "verify",
        distractors: [option("verification", "noun"), option("verifiable", "adj"), option("verifiably", "adv")],
        cue: { signal_word: "Please", signal_pos: "imperative marker", description: "祈使句 Please 後接動詞原形。" },
        rule: "Please + V 原形；-ify 是動詞語尾。",
        trap: "被 verification 的名詞語尾吸引，忘記祈使句開頭要動詞。"
      }
    ],
    monitor_questions: [commonMonitors.activeReviewed, commonMonitors.activeApproved]
  }),
  lesson({
    day: 3,
    week: 3,
    lesson_type: "grammar",
    target_component: "grammar",
    title: "形容詞辨識 Part 2 — 語尾規則",
    quiz_type: "slow",
    time_limit_seconds: 25,
    focus_tags: ["part-of-speech", "adjective", "suffix"],
    weakness_tags: ["adj-before-noun", "linking-verb-adj", "mandative-trigger-verb"],
    debug_rule: "名詞前、be/seem/remain/become 後補語位要形容詞；-ful / -ous / -ive / -al / -able 常見形容詞語尾。",
    cards: [
      card("formula", "adj", "形容詞語尾", "-ful / -ous / -ive / -al / -able / -ible / -ary / -ory -> <span class=\"blank-word adj\">形容詞</span>"),
      card("formula", "adj", "形容詞位置", "<span class=\"blank-word adj\">形容詞</span> + 名詞；be / seem / remain + <span class=\"blank-word adj\">形容詞</span>"),
      card("warning", "warn", "False Friend", "economic = 經濟的；economical = 節儉的。兩者都係形容詞，但意思唔同。")
    ],
    questions: [
      {
        scene: "Training / HR",
        target: "adj",
        weakness: "adj-after-linking",
        stem: "After the update, the training program became more {BLANK} for new employees.",
        answer: "D",
        correct: "comprehensive",
        distractors: [option("comprehension", "noun"), option("comprehend", "verb"), option("comprehensively", "adv")],
        cue: { signal_word: "became", signal_pos: "linking verb", description: "became 後面補充 training program 的狀態，需要形容詞。" },
        rule: "連綴動詞 become / seem / remain 後接形容詞補語。",
        trap: "看到 -ly 以為可以修飾 became，忘記 became 是連綴動詞。"
      },
      {
        scene: "Banking / Risk",
        target: "adj",
        weakness: "adj-before-noun",
        stem: "The bank adopted a more {BLANK} approach to fraud prevention.",
        answer: "A",
        correct: "practical",
        distractors: [option("practice", "noun"), option("practically", "adv"), option("practiced", "verb")],
        cue: { signal_word: "approach", signal_pos: "noun", description: "空格後接名詞 approach，空格需要形容詞。" },
        rule: "空格後直接接名詞時，優先判斷形容詞位。",
        trap: "把 practice 當成常見名詞，忽略後面已經有名詞 approach。"
      },
      {
        scene: "Software / IT",
        target: "adj",
        weakness: "adj-after-linking",
        stem: "The new mobile app is {BLANK} with most older operating systems.",
        answer: "C",
        correct: "compatible",
        distractors: [option("compatibility", "noun"), option("compatibly", "adv"), option("compete", "verb")],
        cue: { signal_word: "is", signal_pos: "linking verb", description: "be 動詞後說明 app 的狀態，需要形容詞。" },
        rule: "be + adjective；compatible with 是 TOEIC 高頻搭配。",
        trap: "看到 with 以為前面要名詞 compatibility，忽略 be 後補語位。"
      },
      {
        scene: "Market Research / Report",
        target: "adj",
        weakness: "adj-before-noun",
        stem: "The analysts prepared a {BLANK} report on consumer spending patterns.",
        answer: "B",
        correct: "demographic",
        distractors: [option("demography", "noun"), option("demographically", "adv"), option("democratize", "verb")],
        cue: { signal_word: "report", signal_pos: "noun", description: "空格後是名詞 report，空格要形容詞。" },
        rule: "demographic report = 人口統計報告；形容詞修飾名詞。",
        trap: "把 demographic / democratic 混淆，沒有先看詞性與搭配。"
      },
      {
        scene: "Healthcare / Policy",
        target: "adj",
        weakness: "adj-after-linking",
        stem: "The vaccination policy is {BLANK} for all laboratory visitors.",
        answer: "A",
        correct: "mandatory",
        distractors: [option("mandate", "noun"), option("mandatorily", "adv"), option("mandating", "verb")],
        cue: { signal_word: "is", signal_pos: "linking verb", description: "be 動詞後描述 policy 性質，需要形容詞。" },
        rule: "be + adjective；mandatory 是形容詞。",
        trap: "見到 mandate 熟悉就選名詞，忽略 is 後補語。"
      },
      {
        scene: "Operations / Process",
        target: "adj",
        weakness: "adj-before-noun",
        stem: "Managers are looking for a more {BLANK} approval process.",
        answer: "D",
        correct: "efficient",
        distractors: [option("efficiency", "noun"), option("efficiently", "adv"), option("efficiencies", "noun")],
        cue: { signal_word: "approval process", signal_pos: "noun phrase", description: "空格後接名詞片語 approval process，要形容詞。" },
        rule: "形容詞修飾後方名詞；efficient process 是自然搭配。",
        trap: "看到 efficiency 與效率語意相近就選，忽略後面已有名詞 process。"
      }
    ],
    monitor_questions: [commonMonitors.mandativeSubmit, commonMonitors.mandativeWear]
  }),
  lesson({
    day: 4,
    week: 3,
    lesson_type: "grammar",
    target_component: "grammar",
    title: "副詞辨識 Part 2 — 語尾規則 + 位置法",
    quiz_type: "slow",
    time_limit_seconds: 25,
    focus_tags: ["part-of-speech", "adverb", "ly-exceptions"],
    weakness_tags: ["adv-verb", "adv-adj", "ly-adjective-exception", "active-passive"],
    debug_rule: "副詞修飾動詞、形容詞、副詞或整句；但 friendly / lovely / timely / likely / lonely 是常見 -ly 形容詞例外。",
    cards: [
      card("formula", "adv", "副詞位置", "動詞 + <span class=\"blank-word adv\">副詞</span>；副詞 + 形容詞；句首副詞 + 逗號"),
      card("exception", "warn", "-ly 例外", "friendly / lovely / timely / likely / lonely 多數係 <span class=\"blank-word adj\">形容詞</span>。"),
      card("warning", "warn", "常見錯誤", "見到 -ly 就直接選，但空格後如果接名詞，可能需要形容詞。")
    ],
    questions: [
      {
        scene: "Finance / Review",
        target: "adv",
        weakness: "adv-verb",
        stem: "The finance team reviewed the quarterly figures {BLANK} before the presentation.",
        answer: "A",
        correct: "carefully",
        distractors: [option("careful", "adj"), option("care", "noun"), option("carefulness", "noun")],
        cue: { signal_word: "reviewed", signal_pos: "verb", description: "空格修飾動詞 reviewed，需要副詞。" },
        rule: "副詞修飾動詞；carefully reviewed 是自然搭配。",
        trap: "見到 figures 是名詞就選 careful，忽略空格其實修飾 reviewed。"
      },
      {
        scene: "Retail / Sales",
        target: "adv",
        weakness: "adv-verb",
        stem: "Online sales increased {BLANK} after the promotional campaign.",
        answer: "C",
        correct: "significantly",
        distractors: [option("significant", "adj"), option("significance", "noun"), option("signify", "verb")],
        cue: { signal_word: "increased", signal_pos: "verb", description: "空格修飾動詞 increased，需要副詞。" },
        rule: "increase significantly 是 TOEIC 常見搭配。",
        trap: "看到 sales 是名詞就選 significant，但空格位置在動詞後。"
      },
      {
        scene: "Hotel / Customer Service",
        target: "adv",
        weakness: "adv-verb",
        stem: "The concierge responded {BLANK} to the guest's urgent request.",
        answer: "B",
        correct: "promptly",
        distractors: [option("prompt", "adj"), option("promptness", "noun"), option("prompts", "verb")],
        cue: { signal_word: "responded", signal_pos: "verb", description: "空格修飾 responded，需要副詞。" },
        rule: "respond promptly = 迅速回應。",
        trap: "選 prompt 只靠意思，沒有處理修飾動詞的位置。"
      },
      {
        scene: "Manufacturing / Equipment",
        target: "adv",
        weakness: "adv-verb",
        stem: "The automated sorting device operates {BLANK} even during peak hours.",
        answer: "D",
        correct: "efficiently",
        distractors: [option("efficient", "adj"), option("efficiency", "noun"), option("efficiencies", "noun")],
        cue: { signal_word: "operates", signal_pos: "verb", description: "空格修飾 operates，需要副詞。" },
        rule: "動詞 operate 後用副詞 efficiently 描述運作方式。",
        trap: "看到 device 是名詞，誤以為要用形容詞 efficient。"
      },
      {
        scene: "Office / Communication",
        target: "adj",
        weakness: "ly-adjective-exception",
        stem: "The receptionist gave visitors a {BLANK} reminder about the new entry policy.",
        answer: "C",
        correct: "friendly",
        correctPos: "adj",
        distractors: [option("friend", "noun"), option("befriend", "verb"), option("friendliness", "noun")],
        cue: { signal_word: "reminder", signal_pos: "noun", description: "空格後接名詞 reminder，需要形容詞；friendly 雖然 -ly 結尾但係形容詞。" },
        rule: "friendly 是 -ly 形容詞例外，可以修飾名詞。",
        trap: "見到 -ly 就誤判成副詞，忘記 friendly 是形容詞。"
      },
      {
        scene: "Shipping / Forecast",
        target: "adj",
        weakness: "ly-adjective-exception",
        stem: "It is {BLANK} that the shipment will arrive before the weekend.",
        answer: "D",
        correct: "likely",
        correctPos: "adj",
        distractors: [option("likelihood", "noun"), option("like", "verb"), option("likewise", "adv")],
        cue: { signal_word: "It is", signal_pos: "linking structure", description: "It is + 形容詞 + that 子句；likely 是形容詞。" },
        rule: "It is likely that ... 是固定句型；likely 是 -ly 形容詞例外。",
        trap: "把 likely 當副詞排除，沒有認出 It is likely that 句型。"
      }
    ],
    monitor_questions: [commonMonitors.activeReviewed, commonMonitors.activeApproved]
  }),
  lesson({
    day: 5,
    week: 3,
    lesson_type: "grammar",
    target_component: "grammar",
    title: "四詞性混合辨識 Part 1 — 位置法精解",
    quiz_type: "standard",
    time_limit_seconds: 20,
    focus_tags: ["part-of-speech", "mixed-pos", "position-first"],
    weakness_tags: ["noun-position", "verb-position", "adj-before-noun", "adv-verb", "multiplier-comparison"],
    debug_rule: "三步驟：先看空格位置，再看語尾，最後代入語意；位置法優先於語尾法。",
    cards: [
      card("step", "noun", "三步驟", "1. 看空格前後 2. 鎖定詞性 3. 用語尾和語意確認"),
      card("formula", "adj", "位置提示", "the/a/our + 名詞；空格後接名詞 -> 形容詞；修飾動詞 -> 副詞"),
      card("warning", "warn", "限時策略", "20 秒題先排除錯詞性，唔好一開始翻譯全句。")
    ],
    questions: [
      {
        scene: "Corporate / Announcement",
        target: "noun",
        weakness: "det-noun",
        stem: "After the merger, the company issued an official {BLANK} to all employees.",
        answer: "C",
        correct: "announcement",
        distractors: [option("announce", "verb"), option("announced", "adj"), option("announcing", "verb")],
        cue: { signal_word: "an official", signal_pos: "determiner + adjective", description: "an official 後需要名詞。" },
        rule: "冠詞 + 形容詞 + 名詞是基本名詞片語。",
        trap: "看到 issued 想選動詞 announce，忽略空格在受詞名詞位。"
      },
      {
        scene: "Audit / Finance",
        target: "verb",
        weakness: "modal-base-verb",
        stem: "The auditors will {BLANK} all receipts from the previous quarter.",
        answer: "A",
        correct: "verify",
        distractors: [option("verification", "noun"), option("verifiable", "adj"), option("verifiably", "adv")],
        cue: { signal_word: "will", signal_pos: "modal", description: "will 後接動詞原形。" },
        rule: "will + V 原形；verify 後可直接接受詞 receipts。",
        trap: "被 verification 名詞語尾吸引，忽略 will。"
      },
      {
        scene: "Hotel / Transport",
        target: "adj",
        weakness: "adj-before-noun",
        stem: "The hotel offers {BLANK} shuttle service to the convention center.",
        answer: "D",
        correct: "complimentary",
        distractors: [option("compliment", "noun"), option("complimented", "verb"), option("complimentarily", "adv")],
        cue: { signal_word: "shuttle service", signal_pos: "noun phrase", description: "空格後接名詞片語 shuttle service，需要形容詞。" },
        rule: "complimentary service = 免費服務；形容詞修飾名詞。",
        trap: "將 complimentary 和 compliment 混淆，只靠中文選名詞。"
      },
      {
        scene: "Logistics / Customer Service",
        target: "adv",
        weakness: "adv-verb",
        stem: "The logistics team handled the delivery delay {BLANK}.",
        answer: "B",
        correct: "professionally",
        distractors: [option("professional", "adj"), option("profession", "noun"), option("professionalism", "noun")],
        cue: { signal_word: "handled", signal_pos: "verb", description: "空格修飾 handled 的處理方式，需要副詞。" },
        rule: "動詞後描述方式時用副詞。",
        trap: "看到 team 是名詞就選 professional，忽略空格在句尾修飾動詞。"
      },
      {
        scene: "Engineering / Report",
        target: "noun",
        weakness: "noun-position",
        stem: "The report contains a detailed {BLANK} of the defect trend.",
        answer: "B",
        correct: "analysis",
        distractors: [option("analyze", "verb"), option("analytical", "adj"), option("analytically", "adv")],
        cue: { signal_word: "a detailed", signal_pos: "determiner + adjective", description: "a detailed 後需要名詞。" },
        rule: "a/an + adjective + noun；analysis 是名詞。",
        trap: "看見 defect trend 要分析而誤選動詞 analyze。"
      },
      {
        scene: "IT / Database",
        target: "verb",
        weakness: "verb-position",
        stem: "The system can {BLANK} duplicate entries before the report is generated.",
        answer: "D",
        correct: "detect",
        distractors: [option("detection", "noun"), option("detectable", "adj"), option("detectably", "adv")],
        cue: { signal_word: "can", signal_pos: "modal", description: "can 後接動詞原形。" },
        rule: "modal + base verb；detect 後可直接接受詞 entries。",
        trap: "被 detection 名詞語尾吸引，忽略 can。"
      },
      {
        scene: "Procurement / Vendor",
        target: "adj",
        weakness: "adj-before-noun",
        stem: "The department needs a more {BLANK} method for comparing supplier bids.",
        answer: "A",
        correct: "reliable",
        distractors: [option("reliability", "noun"), option("reliably", "adv"), option("rely", "verb")],
        cue: { signal_word: "method", signal_pos: "noun", description: "空格後接名詞 method，需要形容詞。" },
        rule: "形容詞 reliable 修飾 method。",
        trap: "看到 more 就以為副詞 reliably 可以，忽略後面有名詞。"
      },
      {
        scene: "Marketing / Analytics",
        target: "adv",
        weakness: "adv-verb",
        stem: "Website traffic grew {BLANK} after the product video was released.",
        answer: "C",
        correct: "steadily",
        distractors: [option("steady", "adj"), option("steadiness", "noun"), option("steadying", "verb")],
        cue: { signal_word: "grew", signal_pos: "verb", description: "空格修飾動詞 grew，需要副詞。" },
        rule: "grow steadily = 穩定成長。",
        trap: "把 steady 當狀態補語，忘記 grow 在此是一般動詞搭配副詞。"
      },
      {
        scene: "Travel / Reservation",
        target: "noun",
        weakness: "noun-position",
        stem: "This {BLANK} confirms your reservation for the airport shuttle.",
        answer: "D",
        correct: "confirmation",
        distractors: [option("confirm", "verb"), option("confirmed", "adj"), option("confirming", "verb")],
        cue: { signal_word: "This", signal_pos: "determiner", description: "This 後作主詞核心，需要名詞。" },
        rule: "This + noun 作主詞；confirmation 是名詞。",
        trap: "看到 confirms 是動詞，誤以為空格也要動詞。"
      },
      {
        scene: "Customer Account / Profile",
        target: "verb",
        weakness: "verb-position",
        stem: "Please {BLANK} your contact details before submitting the form.",
        answer: "C",
        correct: "update",
        distractors: [option("updated", "adj"), option("updating", "noun"), option("updatable", "adj")],
        cue: { signal_word: "Please", signal_pos: "imperative marker", description: "Please 後接動詞原形。" },
        rule: "祈使句 Please + V 原形。",
        trap: "將 updated 當成形容詞，忽略後面直接接受詞 details。"
      },
      {
        scene: "Software / Compatibility",
        target: "adj",
        weakness: "adj-after-linking",
        stem: "The device is {BLANK} with the company's existing software.",
        answer: "A",
        correct: "compatible",
        distractors: [option("compatibility", "noun"), option("compatibly", "adv"), option("compete", "verb")],
        cue: { signal_word: "is", signal_pos: "linking verb", description: "be 動詞後描述 device 狀態，需要形容詞。" },
        rule: "be compatible with 是固定搭配。",
        trap: "看到 with 就選 compatibility，忽略 be + adjective。"
      },
      {
        scene: "Courier / Delivery",
        target: "adv",
        weakness: "adv-verb",
        stem: "The fragile package was delivered {BLANK} despite heavy rain.",
        answer: "B",
        correct: "safely",
        distractors: [option("safe", "adj"), option("safety", "noun"), option("safeguard", "verb")],
        cue: { signal_word: "delivered", signal_pos: "verb", description: "空格修飾 delivered 的方式，需要副詞。" },
        rule: "delivered safely = 安全送達。",
        trap: "看到 package 是名詞就選 safe，忽略空格在動詞後。"
      }
    ],
    monitor_questions: [commonMonitors.multiplierQuickly, commonMonitors.multiplierLarge]
  }),
  lesson({
    day: 6,
    week: 3,
    lesson_type: "grammar",
    target_component: "grammar",
    title: "False Friends 專攻 — 15 組必考陷阱",
    quiz_type: "standard",
    time_limit_seconds: 20,
    focus_tags: ["part-of-speech", "false-friends", "word-family"],
    weakness_tags: ["false-friends", "word-family-choice", "mandative-trigger-verb"],
    debug_rule: "False Friends 先記詞性和核心意思，再放回空格位置；唔好因為字形相似就當同一個字。",
    cards: [
      card("comparison", "error", "高頻 False Friends", "facilitate/facility；economic/economical；fiscal/physical；personnel/personal；advice/advise"),
      card("formula", "noun", "處理順序", "先定詞性 -> 再分意思 -> 最後代入搭配"),
      card("warning", "warn", "常見錯誤", "同根或相似拼法唔代表同詞性，TOEIC 經常用呢點做陷阱。")
    ],
    questions: [
      {
        scene: "Corporate / Facilities",
        target: "noun",
        weakness: "facilitate-facility",
        stem: "The new storage {BLANK} will be available to all departments next month.",
        answer: "D",
        correct: "facility",
        distractors: [option("facilitate", "verb"), option("facilitated", "adj"), option("facilitating", "verb")],
        cue: { signal_word: "storage", signal_pos: "noun modifier", description: "storage + 空格作主詞核心，需要名詞。" },
        rule: "facility 是設施；facilitate 是動詞。",
        trap: "facilitate / facility 字形相似，只靠熟悉度誤選動詞。"
      },
      {
        scene: "City Government / Report",
        target: "adj",
        weakness: "economic-economical",
        stem: "The city issued an {BLANK} report on small-business hiring trends.",
        answer: "B",
        correct: "economic",
        correctPos: "adj",
        distractors: [option("economical", "adj"), option("economically", "adv"), option("economy", "noun")],
        cue: { signal_word: "report", signal_pos: "noun", description: "空格後接 report，需要形容詞；語意是經濟相關。" },
        rule: "economic = 經濟的；economical = 節儉的。",
        trap: "見到 economical 也係形容詞就選，忽略意思係節儉而非經濟。"
      },
      {
        scene: "Hotel / Shuttle",
        target: "verb",
        weakness: "notify-notice",
        stem: "The hotel will {BLANK} guests of any changes to the shuttle schedule.",
        answer: "A",
        correct: "notify",
        distractors: [option("notification", "noun"), option("notice", "noun"), option("notifiable", "adj")],
        cue: { signal_word: "will", signal_pos: "modal", description: "will 後需要動詞原形，guests 是受詞。" },
        rule: "notify guests of changes = 通知客人變更。",
        trap: "把 notice 當通知動作，但此處 will 後需要明確動詞 notify。"
      },
      {
        scene: "Finance / Policy",
        target: "adj",
        weakness: "fiscal-physical",
        stem: "The board reviewed the company's {BLANK} policy before approving the expansion.",
        answer: "C",
        correct: "fiscal",
        correctPos: "adj",
        distractors: [option("physical", "adj"), option("finance", "noun"), option("fiscally", "adv")],
        cue: { signal_word: "policy", signal_pos: "noun", description: "空格修飾 policy，需要形容詞；語意是財政政策。" },
        rule: "fiscal = 財政的；physical = 身體或實體的。",
        trap: "fiscal / physical 音近形近，未看語意就選錯。"
      },
      {
        scene: "Market Research / Data",
        target: "adj",
        weakness: "demographic-democratic",
        stem: "The campaign was adjusted after the team reviewed {BLANK} data from online surveys.",
        answer: "C",
        correct: "demographic",
        correctPos: "adj",
        distractors: [option("democratic", "adj"), option("demography", "noun"), option("demographically", "adv")],
        cue: { signal_word: "data", signal_pos: "noun", description: "空格修飾 data，需要形容詞；語意是人口統計。" },
        rule: "demographic data = 人口統計資料；democratic = 民主的。",
        trap: "看到 demo- 開頭就混淆 demographic / democratic。"
      },
      {
        scene: "HR / Records",
        target: "noun",
        weakness: "personal-personnel",
        stem: "The HR director asked for updated {BLANK} records before the audit.",
        answer: "A",
        correct: "personnel",
        correctPos: "noun",
        distractors: [option("personal", "adj"), option("personally", "adv"), option("personalize", "verb")],
        cue: { signal_word: "records", signal_pos: "compound noun", description: "personnel records 是人事紀錄；空格作名詞修飾名詞。" },
        rule: "personnel = 人員/人事部門；personal = 個人的。",
        trap: "見到 records 前面可放形容詞，就誤選 personal，意思變成私人紀錄。"
      },
      {
        scene: "Product / Compatibility",
        target: "verb",
        weakness: "complement-compliment",
        stem: "The new feature will {BLANK} the existing customer-support tools.",
        answer: "D",
        correct: "complement",
        correctPos: "verb",
        distractors: [option("compliment", "verb"), option("complementary", "adj"), option("completely", "adv")],
        cue: { signal_word: "will", signal_pos: "modal", description: "will 後接動詞；語意是補足現有工具。" },
        rule: "complement = 補足；compliment = 讚美。",
        trap: "兩字發音相近，未分意思就選 compliment。"
      },
      {
        scene: "Operations / Delay",
        target: "adj",
        weakness: "principal-principle",
        stem: "The {BLANK} reason for the shipment delay was a customs inspection.",
        answer: "B",
        correct: "principal",
        correctPos: "adj",
        distractors: [option("principle", "noun"), option("principally", "adv"), option("principalship", "noun")],
        cue: { signal_word: "reason", signal_pos: "noun", description: "空格修飾 reason，需要形容詞，意思是主要的。" },
        rule: "principal = 主要的；principle = 原則。",
        trap: "拼字相似而選 principle，但 principle 不能修飾 reason。"
      },
      {
        scene: "Retail / Pricing",
        target: "verb",
        weakness: "affect-effect",
        stem: "The temporary discount is expected to {BLANK} sales during the holiday period.",
        answer: "A",
        correct: "affect",
        correctPos: "verb",
        distractors: [option("effect", "noun"), option("effective", "adj"), option("effectively", "adv")],
        cue: { signal_word: "to", signal_pos: "infinitive marker", description: "to 後接動詞原形；sales 是受詞。" },
        rule: "affect = 影響（動詞）；effect = 效果（名詞）。",
        trap: "affect / effect 音近，未看 to + V 位置就選錯。"
      },
      {
        scene: "Consulting / Guidance",
        target: "noun",
        weakness: "advice-advise",
        stem: "The consultant gave practical {BLANK} on reducing operating costs.",
        answer: "D",
        correct: "advice",
        correctPos: "noun",
        distractors: [option("advise", "verb"), option("advisable", "adj"), option("advisedly", "adv")],
        cue: { signal_word: "gave", signal_pos: "transitive verb", description: "gave 後需要受詞名詞；advice 是不可數名詞。" },
        rule: "advice 是名詞；advise 是動詞。",
        trap: "把 advice / advise 拼字差異忽略，選咗動詞 advise。"
      },
      {
        scene: "IT / Access Control",
        target: "noun",
        weakness: "access-excess",
        stem: "Employees need secure {BLANK} to the archived customer database.",
        answer: "C",
        correct: "access",
        correctPos: "noun",
        distractors: [option("excess", "noun"), option("accessible", "adj"), option("accessibly", "adv")],
        cue: { signal_word: "secure", signal_pos: "adjective", description: "secure 後需要名詞；語意是安全存取權。" },
        rule: "access = 進入/存取；excess = 過量。",
        trap: "access / excess 音近，未看 to the database 搭配就選錯。"
      },
      {
        scene: "Strategy / Planning",
        target: "noun",
        weakness: "extend-extent",
        stem: "To some {BLANK}, the delay was caused by late vendor responses.",
        answer: "B",
        correct: "extent",
        correctPos: "noun",
        distractors: [option("extend", "verb"), option("extended", "adj"), option("extensively", "adv")],
        cue: { signal_word: "To some", signal_pos: "fixed phrase", description: "to some extent 是固定名詞片語。" },
        rule: "to some extent = 在某程度上；extent 是名詞。",
        trap: "看到 extend 熟悉就選動詞，忽略固定片語。"
      }
    ],
    monitor_questions: [commonMonitors.mandativeSubmit, commonMonitors.mandativeWear]
  }),
  lesson({
    day: 7,
    week: 3,
    lesson_type: "grammar",
    target_component: "grammar",
    title: "詞性 + 搭配動詞（Collocations）",
    quiz_type: "standard",
    time_limit_seconds: 20,
    focus_tags: ["part-of-speech", "collocation", "word-family"],
    weakness_tags: ["collocation-noun-verb", "word-family-choice", "number-of-sva"],
    debug_rule: "TOEIC 常考動詞 + 名詞搭配，要整組記；不要把名詞換成同根動詞或形容詞。",
    cards: [
      card("formula", "noun", "名詞搭配", "make a decision / conduct a survey / submit a report / reach a conclusion"),
      card("warning", "warn", "常見錯誤", "do a decision、make a survey 呢類直譯搭配要刪。"),
      card("formula", "verb", "處理方法", "先辨 collocation，再確認空格詞性。")
    ],
    questions: [
      {
        scene: "Executive / Budget",
        target: "noun",
        weakness: "collocation-noun-verb",
        stem: "The committee will make a final {BLANK} after reviewing the budget proposal.",
        answer: "B",
        correct: "decision",
        distractors: [option("decide", "verb"), option("decisive", "adj"), option("decisively", "adv")],
        cue: { signal_word: "make a final", signal_pos: "collocation", description: "make a decision 是固定搭配，空格需要名詞。" },
        rule: "make a decision，不是 do a decision。",
        trap: "見到 will make 以為後面也要動詞 decide。"
      },
      {
        scene: "Marketing / Research",
        target: "noun",
        weakness: "collocation-noun-verb",
        stem: "The marketing team conducted a customer {BLANK} before launching the campaign.",
        answer: "D",
        correct: "survey",
        correctPos: "noun",
        distractors: [option("surveys", "verb"), option("surveying", "verb"), option("surveyor", "noun")],
        cue: { signal_word: "conducted a customer", signal_pos: "collocation", description: "conduct a survey 是固定搭配，空格是名詞。" },
        rule: "conduct a survey = 進行調查。",
        trap: "把 survey 當動詞，沒有看到 conducted 已經是主動詞。"
      },
      {
        scene: "Department / Reporting",
        target: "noun",
        weakness: "collocation-noun-verb",
        stem: "All department heads must submit a monthly {BLANK} by the fifth business day.",
        answer: "A",
        correct: "report",
        correctPos: "noun",
        distractors: [option("reported", "verb"), option("reporting", "verb"), option("reportedly", "adv")],
        cue: { signal_word: "submit a monthly", signal_pos: "collocation", description: "submit a report 是固定搭配，空格需要名詞。" },
        rule: "submit a report = 提交報告。",
        trap: "看到 must submit 後誤以為空格也要動詞。"
      },
      {
        scene: "Office / Planning",
        target: "noun",
        weakness: "collocation-noun-verb",
        stem: "The project manager will hold a brief {BLANK} to discuss next week's schedule.",
        answer: "C",
        correct: "meeting",
        correctPos: "noun",
        distractors: [option("meet", "verb"), option("met", "verb"), option("meetly", "adv")],
        cue: { signal_word: "hold a brief", signal_pos: "collocation", description: "hold a meeting 是固定搭配，空格需要名詞。" },
        rule: "hold a meeting = 召開會議。",
        trap: "見到 will hold 就選 meet，忽略 a brief 後需要名詞。"
      },
      {
        scene: "Compliance / Ownership",
        target: "noun",
        weakness: "collocation-noun-verb",
        stem: "Each supervisor must take full {BLANK} for the accuracy of the weekly records.",
        answer: "A",
        correct: "responsibility",
        distractors: [option("respond", "verb"), option("responsible", "adj"), option("responsibly", "adv")],
        cue: { signal_word: "take full", signal_pos: "collocation", description: "take responsibility 是固定搭配，空格需要名詞。" },
        rule: "take responsibility for = 對...負責。",
        trap: "把 responsible 當成語意正確，但 full 後需要名詞。"
      },
      {
        scene: "Customer Service / Support",
        target: "noun",
        weakness: "collocation-noun-verb",
        stem: "The vendor agreed to provide technical {BLANK} during the installation period.",
        answer: "C",
        correct: "assistance",
        distractors: [option("assist", "verb"), option("assistant", "noun"), option("assistive", "adj")],
        cue: { signal_word: "provide technical", signal_pos: "collocation", description: "provide assistance 是固定搭配，technical 修飾名詞。" },
        rule: "provide assistance = 提供協助。",
        trap: "見到 technical 後選 assistant，但 technical assistance 才是搭配。"
      },
      {
        scene: "Strategy / Meeting",
        target: "noun",
        weakness: "collocation-noun-verb",
        stem: "After lengthy discussions, the team finally reached a {BLANK} on the proposal.",
        answer: "D",
        correct: "conclusion",
        distractors: [option("conclude", "verb"), option("conclusive", "adj"), option("conclusively", "adv")],
        cue: { signal_word: "reached a", signal_pos: "collocation", description: "reach a conclusion 是固定搭配，空格需要名詞。" },
        rule: "reach a conclusion = 得出結論。",
        trap: "看到 team finally 後想選動詞 conclude，忽略 reached a。"
      },
      {
        scene: "Service / Hotline",
        target: "noun",
        weakness: "collocation-noun-verb",
        stem: "The help desk will offer additional {BLANK} to users after the system launch.",
        answer: "B",
        correct: "support",
        correctPos: "noun",
        distractors: [option("supporting", "verb"), option("supportive", "adj"), option("supportively", "adv")],
        cue: { signal_word: "offer additional", signal_pos: "collocation", description: "offer support 是固定搭配，空格需要名詞。" },
        rule: "offer support = 提供支援。",
        trap: "見到 users 後以為要動作 supporting，忽略 offer + 名詞。"
      },
      {
        scene: "Retail / Complaint",
        target: "noun",
        weakness: "collocation-noun-verb",
        stem: "Customers may file a {BLANK} if the product arrives damaged.",
        answer: "C",
        correct: "complaint",
        distractors: [option("complain", "verb"), option("complained", "verb"), option("complainingly", "adv")],
        cue: { signal_word: "file a", signal_pos: "collocation", description: "file a complaint 是固定搭配，空格需要名詞。" },
        rule: "file a complaint = 提出投訴。",
        trap: "把 complain 當成投訴語意，忘記 file a 後接名詞。"
      },
      {
        scene: "Safety / Training",
        target: "noun",
        weakness: "collocation-noun-verb",
        stem: "The campaign is intended to raise public {BLANK} of workplace hazards.",
        answer: "A",
        correct: "awareness",
        distractors: [option("aware", "adj"), option("awaken", "verb"), option("awarely", "adv")],
        cue: { signal_word: "raise public", signal_pos: "collocation", description: "raise awareness 是固定搭配，空格需要名詞。" },
        rule: "raise awareness = 提高意識。",
        trap: "見到 public 後選 aware，忽略 public awareness 是名詞片語。"
      }
    ],
    monitor_questions: [commonMonitors.numberOfHas, commonMonitors.numberOfHave]
  }),
  lesson({
    day: 8,
    week: 4,
    lesson_type: "grammar",
    target_component: "grammar",
    title: "四詞性混合辨識 Part 2 — 強化陷阱辨識",
    quiz_type: "intensive",
    time_limit_seconds: 15,
    focus_tags: ["part-of-speech", "word-family", "intensive"],
    weakness_tags: ["word-family-choice", "mixed-pos-speed", "number-of-sva", "active-passive", "multiplier-comparison"],
    debug_rule: "同一詞根四格要按位置判斷，15 秒內先鎖定詞性，再看語尾。",
    cards: [
      card("formula", "noun", "四格表", "analysis / analyze / analytical / analytically：同一詞根四個位置唔同。"),
      card("step", "verb", "限時節奏", "3 秒看題眼，5 秒排除錯詞性，7 秒代入確認。"),
      card("warning", "warn", "常見錯誤", "見到同根熟字就選，沒有核對空格位置。")
    ],
    questions: [
      {
        scene: "Engineering / Defect Trend",
        target: "noun",
        weakness: "word-family-choice",
        stem: "The engineers submitted a detailed {BLANK} of the defect trend.",
        answer: "C",
        correct: "analysis",
        distractors: [option("analyze", "verb"), option("analytical", "adj"), option("analytically", "adv")],
        cue: { signal_word: "a detailed", signal_pos: "determiner + adjective", description: "a detailed 後需要名詞。" },
        rule: "analysis 是名詞；analyze 是動詞。",
        trap: "看到 engineers 做分析而選 analyze，忽略 a detailed。"
      },
      {
        scene: "Data / Operations",
        target: "verb",
        weakness: "word-family-choice",
        stem: "The software can {BLANK} thousands of customer comments in a few seconds.",
        answer: "A",
        correct: "analyze",
        distractors: [option("analysis", "noun"), option("analytical", "adj"), option("analytically", "adv")],
        cue: { signal_word: "can", signal_pos: "modal", description: "can 後需要動詞原形。" },
        rule: "can + V 原形；analyze 是動詞。",
        trap: "看到 analysis 最熟悉就選名詞，忽略 can。"
      },
      {
        scene: "Consulting / Report",
        target: "adj",
        weakness: "word-family-choice",
        stem: "The client requested a more {BLANK} explanation of the survey results.",
        answer: "D",
        correct: "analytical",
        distractors: [option("analysis", "noun"), option("analyze", "verb"), option("analytically", "adv")],
        cue: { signal_word: "explanation", signal_pos: "noun", description: "空格後接名詞 explanation，需要形容詞。" },
        rule: "analytical explanation = 分析性的說明。",
        trap: "看到 more 後選副詞 analytically，忽略後面有名詞。"
      },
      {
        scene: "Research / Review",
        target: "adv",
        weakness: "word-family-choice",
        stem: "The proposal was evaluated {BLANK} before funding was approved.",
        answer: "B",
        correct: "analytically",
        distractors: [option("analysis", "noun"), option("analyze", "verb"), option("analytical", "adj")],
        cue: { signal_word: "evaluated", signal_pos: "verb", description: "空格修飾 evaluated 的方式，需要副詞。" },
        rule: "副詞修飾動詞；analytically evaluated。",
        trap: "選 analytical 只靠意思，沒有處理修飾動詞的位置。"
      },
      {
        scene: "Nonprofit / Planning",
        target: "noun",
        weakness: "word-family-choice",
        stem: "The {BLANK} has opened three new training centers in Asia.",
        answer: "A",
        correct: "organization",
        distractors: [option("organize", "verb"), option("organizational", "adj"), option("organizationally", "adv")],
        cue: { signal_word: "The", signal_pos: "determiner", description: "The 後作主詞核心，需要名詞。" },
        rule: "organization 是名詞；organize 是動詞。",
        trap: "見到 has opened 後誤以為空格也要動詞。"
      },
      {
        scene: "Event / Conference",
        target: "verb",
        weakness: "word-family-choice",
        stem: "The coordinator will {BLANK} the annual conference in June.",
        answer: "C",
        correct: "organize",
        distractors: [option("organization", "noun"), option("organizational", "adj"), option("organizationally", "adv")],
        cue: { signal_word: "will", signal_pos: "modal", description: "will 後需要動詞原形。" },
        rule: "will + organize + object。",
        trap: "選 organization 因為 conference 是名詞，忽略 will。"
      },
      {
        scene: "HR / Change",
        target: "adj",
        weakness: "word-family-choice",
        stem: "The merger caused several {BLANK} changes across the company.",
        answer: "D",
        correct: "organizational",
        distractors: [option("organization", "noun"), option("organize", "verb"), option("organizationally", "adv")],
        cue: { signal_word: "changes", signal_pos: "noun", description: "空格修飾 changes，需要形容詞。" },
        rule: "organizational changes = 組織變更。",
        trap: "見到 changes 後選副詞，忽略名詞前要形容詞。"
      },
      {
        scene: "Management / Structure",
        target: "adv",
        weakness: "word-family-choice",
        stem: "The two teams are {BLANK} independent but share the same budget.",
        answer: "B",
        correct: "organizationally",
        distractors: [option("organization", "noun"), option("organize", "verb"), option("organizational", "adj")],
        cue: { signal_word: "independent", signal_pos: "adjective", description: "空格修飾形容詞 independent，需要副詞。" },
        rule: "副詞可修飾形容詞；organizationally independent。",
        trap: "選 organizational 因為 independent 是形容詞，忽略空格要修飾形容詞。"
      },
      {
        scene: "Operations / Metrics",
        target: "noun",
        weakness: "word-family-choice",
        stem: "The new routing system improved delivery {BLANK} by 18 percent.",
        answer: "C",
        correct: "efficiency",
        distractors: [option("efficient", "adj"), option("efficiently", "adv"), option("efficiencies", "noun")],
        cue: { signal_word: "delivery", signal_pos: "noun modifier", description: "delivery + 空格作受詞核心，需要名詞。" },
        rule: "efficiency 是不可數名詞，指效率。",
        trap: "選 efficiently 因為 improved 是動詞，但空格是 improved 的受詞核心。"
      },
      {
        scene: "Process / Improvement",
        target: "adj",
        weakness: "word-family-choice",
        stem: "The revised workflow is more {BLANK} than the previous one.",
        answer: "D",
        correct: "efficient",
        distractors: [option("efficiency", "noun"), option("efficiently", "adv"), option("efficiencies", "noun")],
        cue: { signal_word: "is", signal_pos: "linking verb", description: "be 動詞後比較 workflow 狀態，需要形容詞。" },
        rule: "be more efficient than ...",
        trap: "看到 more 後選 efficiently，忘記 be 後補語是形容詞。"
      },
      {
        scene: "Warehouse / Scanning",
        target: "adv",
        weakness: "word-family-choice",
        stem: "The barcode scanner reads damaged labels more {BLANK} than the older model.",
        answer: "A",
        correct: "efficiently",
        distractors: [option("efficient", "adj"), option("efficiency", "noun"), option("efficiencies", "noun")],
        cue: { signal_word: "reads", signal_pos: "verb", description: "空格修飾 reads，需要副詞。" },
        rule: "動詞 reads 後用副詞 efficiently。",
        trap: "看到 more 就未必係形容詞，比較副詞也可以。"
      },
      {
        scene: "IT / Service",
        target: "noun",
        weakness: "word-family-choice",
        stem: "The {BLANK} of the online portal will be announced after testing.",
        answer: "B",
        correct: "availability",
        distractors: [option("available", "adj"), option("availably", "adv"), option("avail", "verb")],
        cue: { signal_word: "The", signal_pos: "determiner", description: "The + 空格 + of，空格是名詞核心。" },
        rule: "availability 是名詞；available 是形容詞。",
        trap: "選 available 因為語意通順，但 the ___ of 需要名詞。"
      },
      {
        scene: "Security / Access",
        target: "noun",
        weakness: "word-family-choice",
        stem: "Written {BLANK} is required before contractors can enter the laboratory.",
        answer: "D",
        correct: "authorization",
        distractors: [option("authorize", "verb"), option("authorized", "adj"), option("authoritatively", "adv")],
        cue: { signal_word: "Written", signal_pos: "adjective", description: "Written 修飾後方名詞，空格需要名詞。" },
        rule: "written authorization = 書面授權。",
        trap: "看到 contractors can enter，以為空格要動作 authorize。"
      },
      {
        scene: "Procurement / Approval",
        target: "verb",
        weakness: "word-family-choice",
        stem: "Only the purchasing director may {BLANK} orders above $20,000.",
        answer: "C",
        correct: "authorize",
        distractors: [option("authorization", "noun"), option("authorized", "adj"), option("authority", "noun")],
        cue: { signal_word: "may", signal_pos: "modal", description: "may 後需要動詞原形，orders 是受詞。" },
        rule: "may + authorize + object。",
        trap: "看到 director 有 authority 語意，誤選名詞。"
      },
      {
        scene: "Compliance / Personnel",
        target: "adj",
        weakness: "word-family-choice",
        stem: "Only {BLANK} personnel may access the confidential database.",
        answer: "A",
        correct: "authorized",
        correctPos: "adj",
        distractors: [option("authorization", "noun"), option("authorize", "verb"), option("authority", "noun")],
        cue: { signal_word: "personnel", signal_pos: "noun", description: "空格修飾 personnel，需要形容詞。" },
        rule: "authorized personnel = 授權人員。",
        trap: "把 authorization 當成名詞修飾名詞，但此固定搭配用 authorized。"
      }
    ],
    monitor_questions: [commonMonitors.numberOfHas, commonMonitors.activeReviewed, commonMonitors.multiplierLarge]
  }),
  lesson({
    day: 9,
    week: 4,
    lesson_type: "phrase",
    target_component: "phrase",
    title: "詞性衍生片語 Part 1 — 名詞/動詞搭配",
    quiz_type: "standard",
    time_limit_seconds: 20,
    focus_tags: ["collocation", "noun-verb", "phrase"],
    weakness_tags: ["collocation-noun-verb", "word-family-choice", "mandative-trigger-verb"],
    debug_rule: "動詞 + 名詞搭配整組記，空格位置決定要名詞還是動詞。",
    cards: [
      card("formula", "noun", "高頻搭配", "take action / take responsibility / provide assistance / offer support"),
      card("formula", "verb", "動詞位", "will / must / to 後面先找搭配動詞。"),
      card("warning", "warn", "常見錯誤", "把名詞搭配拆開，用同根形容詞或副詞代替。")
    ],
    questions: [
      {
        scene: "Management / Issue",
        target: "noun",
        weakness: "collocation-noun-verb",
        stem: "Management promised to take immediate {BLANK} after the safety incident.",
        answer: "C",
        correct: "action",
        distractors: [option("act", "verb"), option("active", "adj"), option("actively", "adv")],
        cue: { signal_word: "take immediate", signal_pos: "collocation", description: "take action 是固定搭配，immediate 修飾名詞。" },
        rule: "take action = 採取行動。",
        trap: "見到 to take 後又選 act，忽略 take 已經是動詞。"
      },
      {
        scene: "Supervision / Records",
        target: "noun",
        weakness: "collocation-noun-verb",
        stem: "Supervisors must take full {BLANK} for timesheet accuracy.",
        answer: "A",
        correct: "responsibility",
        distractors: [option("respond", "verb"), option("responsible", "adj"), option("responsibly", "adv")],
        cue: { signal_word: "take full", signal_pos: "collocation", description: "take responsibility 是固定搭配，空格需要名詞。" },
        rule: "take responsibility for = 負責。",
        trap: "full 後要名詞，唔係形容詞 responsible。"
      },
      {
        scene: "IT / Help Desk",
        target: "noun",
        weakness: "collocation-noun-verb",
        stem: "The help desk will provide remote {BLANK} during the software migration.",
        answer: "D",
        correct: "assistance",
        distractors: [option("assist", "verb"), option("assistant", "noun"), option("assistive", "adj")],
        cue: { signal_word: "provide remote", signal_pos: "collocation", description: "provide assistance 是固定搭配，remote 修飾名詞。" },
        rule: "provide assistance = 提供協助。",
        trap: "assistant 是人，唔符合 remote assistance 的搭配。"
      },
      {
        scene: "Customer Service / Launch",
        target: "noun",
        weakness: "collocation-noun-verb",
        stem: "The vendor will offer technical {BLANK} for the first three months.",
        answer: "B",
        correct: "support",
        correctPos: "noun",
        distractors: [option("supporting", "verb"), option("supportive", "adj"), option("supportively", "adv")],
        cue: { signal_word: "offer technical", signal_pos: "collocation", description: "offer support 是固定搭配，technical 修飾名詞。" },
        rule: "offer technical support = 提供技術支援。",
        trap: "看到 technical 後選 supportive，忽略固定搭配。"
      },
      {
        scene: "Manufacturing / Equipment",
        target: "noun",
        weakness: "collocation-noun-verb",
        stem: "The plant manager scheduled crews to conduct preventive {BLANK} on Friday.",
        answer: "A",
        correct: "maintenance",
        distractors: [option("maintain", "verb"), option("maintained", "adj"), option("maintainably", "adv")],
        cue: { signal_word: "conduct preventive", signal_pos: "collocation", description: "conduct maintenance 是固定搭配，preventive 修飾名詞。" },
        rule: "conduct maintenance = 進行維護。",
        trap: "見到 to conduct 後又選 maintain，忽略 conduct 已是動詞。"
      },
      {
        scene: "Finance / Monthly Close",
        target: "noun",
        weakness: "collocation-noun-verb",
        stem: "Each branch must submit a complete {BLANK} by the end of the month.",
        answer: "C",
        correct: "report",
        correctPos: "noun",
        distractors: [option("reporting", "verb"), option("reported", "adj"), option("reportedly", "adv")],
        cue: { signal_word: "submit a complete", signal_pos: "collocation", description: "submit a report 是固定搭配，complete 修飾名詞。" },
        rule: "submit a complete report = 提交完整報告。",
        trap: "report 可作動詞，但 a complete 後要名詞用法。"
      },
      {
        scene: "Travel / Event",
        target: "noun",
        weakness: "collocation-noun-verb",
        stem: "The coordinator will make travel {BLANK} for all invited speakers.",
        answer: "D",
        correct: "arrangements",
        correctPos: "noun",
        distractors: [option("arrange", "verb"), option("arranged", "adj"), option("arranging", "verb")],
        cue: { signal_word: "make travel", signal_pos: "collocation", description: "make arrangements 是固定搭配，空格需要名詞。" },
        rule: "make arrangements = 作安排。",
        trap: "看到 will make 後誤選 arrange，忽略 make 已是動詞。"
      },
      {
        scene: "Legal / Contract",
        target: "noun",
        weakness: "collocation-noun-verb",
        stem: "Both companies reached an {BLANK} after two weeks of negotiation.",
        answer: "B",
        correct: "agreement",
        distractors: [option("agree", "verb"), option("agreeable", "adj"), option("agreeably", "adv")],
        cue: { signal_word: "reached an", signal_pos: "collocation", description: "reach an agreement 是固定搭配，空格需要名詞。" },
        rule: "reach an agreement = 達成協議。",
        trap: "見到 companies 做動作而選 agree，忽略 reached an。"
      },
      {
        scene: "Procurement / Approval",
        target: "noun",
        weakness: "collocation-noun-verb",
        stem: "Departments must request written {BLANK} before purchasing new software.",
        answer: "C",
        correct: "approval",
        distractors: [option("approve", "verb"), option("approved", "adj"), option("approvingly", "adv")],
        cue: { signal_word: "request written", signal_pos: "collocation", description: "request approval 是固定搭配，written 修飾名詞。" },
        rule: "written approval = 書面批准。",
        trap: "written 後唔係一定用過去分詞，呢度需要名詞 approval。"
      },
      {
        scene: "Policy / Rollout",
        target: "verb",
        weakness: "collocation-noun-verb",
        stem: "The operations team will {BLANK} changes to the workflow next quarter.",
        answer: "D",
        correct: "implement",
        distractors: [option("implementation", "noun"), option("implemented", "adj"), option("implementable", "adj")],
        cue: { signal_word: "will", signal_pos: "modal", description: "will 後接動詞原形；changes 是受詞。" },
        rule: "implement changes = 實施變更。",
        trap: "看到 changes 後選 implementation，忽略 will + V。"
      }
    ],
    monitor_questions: [commonMonitors.mandativeSubmit, commonMonitors.mandativeWear]
  }),
  lesson({
    day: 10,
    week: 4,
    lesson_type: "phrase",
    target_component: "phrase",
    title: "詞性衍生片語 Part 2 — 形容詞/副詞搭配",
    quiz_type: "standard",
    time_limit_seconds: 20,
    focus_tags: ["collocation", "adjective-adverb", "phrase"],
    weakness_tags: ["adv-adj-degree", "adv-verb", "adj-after-linking", "multiplier-comparison"],
    debug_rule: "程度副詞 highly / extremely / fully / technically 通常修飾形容詞；方式副詞修飾動詞或分詞。",
    cards: [
      card("formula", "adv", "副詞 + 形容詞", "highly effective / financially stable / technically sound / fully compliant"),
      card("formula", "adv", "副詞 + 分詞", "carefully reviewed / professionally prepared / significantly improved"),
      card("warning", "warn", "常見錯誤", "highly 後面唔直接接名詞，要接形容詞。")
    ],
    questions: [
      {
        scene: "Project / Evaluation",
        target: "adj",
        weakness: "adv-adj-degree",
        stem: "The new onboarding process proved highly {BLANK} for remote employees.",
        answer: "C",
        correct: "effective",
        distractors: [option("effect", "noun"), option("effectively", "adv"), option("effectuate", "verb")],
        cue: { signal_word: "highly", signal_pos: "degree adverb", description: "highly 修飾形容詞，空格需要形容詞。" },
        rule: "highly effective 是固定搭配。",
        trap: "見到 highly 就選 -ly 副詞 effectively，忽略 highly 後要形容詞。"
      },
      {
        scene: "Finance / Forecast",
        target: "adj",
        weakness: "adv-adj-degree",
        stem: "The company remains financially {BLANK} despite slower sales.",
        answer: "A",
        correct: "stable",
        distractors: [option("stability", "noun"), option("stably", "adv"), option("stabilize", "verb")],
        cue: { signal_word: "financially", signal_pos: "adverb", description: "financially 修飾形容詞 stable。" },
        rule: "financially stable = 財務穩健。",
        trap: "選 stability 因為語意接近，但 remains 後需要形容詞補語。"
      },
      {
        scene: "Engineering / Design",
        target: "adj",
        weakness: "adv-adj-degree",
        stem: "The revised design is technically {BLANK} and ready for production.",
        answer: "D",
        correct: "sound",
        correctPos: "adj",
        distractors: [option("soundly", "adv"), option("soundness", "noun"), option("resound", "verb")],
        cue: { signal_word: "technically", signal_pos: "adverb", description: "technically 修飾形容詞 sound。" },
        rule: "technically sound = 技術上可靠。",
        trap: "sound 可多詞性，呢度 be + adv + adjective。"
      },
      {
        scene: "Warehouse / Equipment",
        target: "adv",
        weakness: "adv-adj-degree",
        stem: "The backup generator is {BLANK} ready for emergency use.",
        answer: "B",
        correct: "operationally",
        distractors: [option("operation", "noun"), option("operational", "adj"), option("operate", "verb")],
        cue: { signal_word: "ready", signal_pos: "adjective", description: "空格修飾形容詞 ready，需要副詞。" },
        rule: "operationally ready = 運作上準備好。",
        trap: "看到 generator 是名詞就選 operational，忽略空格修飾 ready。"
      },
      {
        scene: "Legal / Supplier",
        target: "adj",
        weakness: "adv-adj-degree",
        stem: "The supplier is fully {BLANK} with the updated safety regulations.",
        answer: "A",
        correct: "compliant",
        distractors: [option("compliance", "noun"), option("comply", "verb"), option("compliantly", "adv")],
        cue: { signal_word: "fully", signal_pos: "degree adverb", description: "fully 修飾形容詞 compliant。" },
        rule: "fully compliant with = 完全符合。",
        trap: "看到 regulations 後選名詞 compliance，忽略 is fully + adjective。"
      },
      {
        scene: "Quality / Checklist",
        target: "adv",
        weakness: "adv-verb",
        stem: "The safety checklist was {BLANK} reviewed before the inspection.",
        answer: "C",
        correct: "carefully",
        distractors: [option("careful", "adj"), option("carefulness", "noun"), option("care", "noun")],
        cue: { signal_word: "reviewed", signal_pos: "participle", description: "空格修飾 reviewed，需要副詞。" },
        rule: "carefully reviewed = 仔細審查。",
        trap: "看到 was 就選形容詞 careful，忽略 reviewed 是被修飾動作。"
      },
      {
        scene: "Product / Materials",
        target: "adj",
        weakness: "adv-adj-degree",
        stem: "The new packaging material is extremely {BLANK} under high temperatures.",
        answer: "D",
        correct: "durable",
        distractors: [option("durability", "noun"), option("durably", "adv"), option("endure", "verb")],
        cue: { signal_word: "extremely", signal_pos: "degree adverb", description: "extremely 修飾形容詞 durable。" },
        rule: "extremely + adjective。",
        trap: "選 durability 因為 material 語意接近，但 is extremely 後要形容詞。"
      },
      {
        scene: "Process / Upgrade",
        target: "adj",
        weakness: "adv-adj-degree",
        stem: "The revised approval process is significantly {BLANK} than the old one.",
        answer: "B",
        correct: "faster",
        correctPos: "adj",
        distractors: [option("fast", "adj"), option("fastness", "noun"), option("fasten", "verb")],
        cue: { signal_word: "significantly", signal_pos: "degree adverb", description: "significantly 修飾比較級形容詞 faster。" },
        rule: "significantly faster than = 明顯更快。",
        trap: "見到 significantly 後忘記後面要比較級形容詞。"
      },
      {
        scene: "Startup / Product",
        target: "adj",
        weakness: "adv-adj-degree",
        stem: "The prototype is commercially {BLANK}, according to the investor review.",
        answer: "C",
        correct: "viable",
        distractors: [option("viability", "noun"), option("viably", "adv"), option("vitalize", "verb")],
        cue: { signal_word: "commercially", signal_pos: "adverb", description: "commercially 修飾形容詞 viable。" },
        rule: "commercially viable = 商業上可行。",
        trap: "選 viability 因為語意接近，但 be + adverb + adjective。"
      },
      {
        scene: "Reporting / Documentation",
        target: "adv",
        weakness: "adv-verb",
        stem: "The final report was {BLANK} prepared by the compliance team.",
        answer: "D",
        correct: "professionally",
        distractors: [option("profession", "noun"), option("professional", "adj"), option("professionalism", "noun")],
        cue: { signal_word: "prepared", signal_pos: "participle", description: "空格修飾 prepared，需要副詞。" },
        rule: "professionally prepared = 專業地準備。",
        trap: "看到 report 是名詞就選 professional，忽略空格修飾 prepared。"
      }
    ],
    monitor_questions: [commonMonitors.multiplierQuickly, commonMonitors.multiplierLarge]
  }),
  lesson({
    day: 11,
    week: 4,
    lesson_type: "listening",
    target_component: "listening",
    title: "詞性辨音 — Part 3/4 同音異義整合",
    quiz_type: "standard",
    time_limit_seconds: 20,
    focus_tags: ["listening", "word-form", "suffix-recognition"],
    weakness_tags: ["listening-word-form", "noun-suffix", "verb-suffix", "active-passive"],
    debug_rule: "先用選項語尾預判詞性；聽到 -tion / -ment 立即鎖名詞，聽到 -ify / -ize / -ate 立即鎖動詞。",
    cards: [
      card("formula", "noun", "聽前預判", "notification / operation / authorization -> 聽到 -tion 先想名詞。"),
      card("formula", "verb", "動詞辨音", "notify / operate / authorize -> 題目若要動作，優先找動詞形。"),
      card("warning", "warn", "文字腳本模擬", "目前本地 app 未接音檔，先以 Part 3/4 腳本文字訓練詞性預判。")
    ],
    questions: [
      {
        scene: "Part 3 Script / Delivery Notice",
        target: "noun",
        weakness: "listening-word-form",
        stem: "Script: \"A shipping {BLANK} will be sent once the order leaves our warehouse.\"",
        answer: "C",
        correct: "notification",
        distractors: [option("notify", "verb"), option("notified", "adj"), option("notifiably", "adv")],
        cue: { signal_word: "A shipping", signal_pos: "determiner + noun modifier", description: "A shipping 後需要名詞；聽到 -tion 鎖名詞。" },
        rule: "notification 是名詞；notify 是動詞。",
        trap: "聽到 notify 詞根就選動詞，忽略 A shipping 後需要名詞。"
      },
      {
        scene: "Part 4 Script / Equipment",
        target: "verb",
        weakness: "listening-word-form",
        stem: "Script: \"The backup machine can {BLANK} for six hours without interruption.\"",
        answer: "A",
        correct: "operate",
        distractors: [option("operation", "noun"), option("operational", "adj"), option("operationally", "adv")],
        cue: { signal_word: "can", signal_pos: "modal", description: "can 後接動詞原形；聽到 -ate 鎖動詞。" },
        rule: "operate 是動詞；operation 是名詞。",
        trap: "聽到 operation 熟悉就選名詞，忽略 can。"
      },
      {
        scene: "Part 3 Script / Budget",
        target: "adj",
        weakness: "listening-word-form",
        stem: "Script: \"The {BLANK} report will be ready before the board meeting.\"",
        answer: "D",
        correct: "financial",
        distractors: [option("finance", "noun"), option("financially", "adv"), option("financing", "noun")],
        cue: { signal_word: "report", signal_pos: "noun", description: "空格修飾 report，需要形容詞。" },
        rule: "financial report = 財務報告；financially 是副詞。",
        trap: "聽到 finance 就選名詞，忽略 report 前是形容詞位。"
      },
      {
        scene: "Part 4 Script / Security",
        target: "noun",
        weakness: "listening-word-form",
        stem: "Script: \"Written {BLANK} is required before visitors enter the restricted area.\"",
        answer: "B",
        correct: "authorization",
        distractors: [option("authorize", "verb"), option("authorized", "adj"), option("authoritatively", "adv")],
        cue: { signal_word: "Written", signal_pos: "adjective", description: "Written 後需要名詞；-tion 是名詞語尾。" },
        rule: "written authorization = 書面授權。",
        trap: "聽到 authorize 詞根就選動詞，忽略 written 後要名詞。"
      },
      {
        scene: "Part 3 Script / Appointment",
        target: "noun",
        weakness: "listening-word-form",
        stem: "Script: \"A final {BLANK} will be emailed to you by this afternoon.\"",
        answer: "A",
        correct: "confirmation",
        distractors: [option("confirm", "verb"), option("confirmed", "adj"), option("confirming", "verb")],
        cue: { signal_word: "A final", signal_pos: "determiner + adjective", description: "A final 後需要名詞。" },
        rule: "confirmation 是名詞；confirm 是動詞。",
        trap: "只聽到 confirm 詞根，未判斷 A final 後的名詞位。"
      },
      {
        scene: "Part 4 Script / Warehouse",
        target: "adv",
        weakness: "listening-word-form",
        stem: "Script: \"The loading area must be kept {BLANK} clean during business hours.\"",
        answer: "D",
        correct: "consistently",
        distractors: [option("consistency", "noun"), option("consistent", "adj"), option("consist", "verb")],
        cue: { signal_word: "clean", signal_pos: "adjective", description: "空格修飾形容詞 clean，需要副詞。" },
        rule: "副詞 consistently 修飾形容詞 clean。",
        trap: "聽到 consistent 語意接近就選形容詞，忽略修飾 clean。"
      }
    ],
    monitor_questions: [commonMonitors.activeReviewed, commonMonitors.activeApproved]
  }),
  lesson({
    day: 12,
    week: 4,
    lesson_type: "listening",
    target_component: "listening",
    title: "詞性整合 — Part 4 獨白場景",
    quiz_type: "standard",
    time_limit_seconds: 20,
    focus_tags: ["listening", "part4-script", "word-form"],
    weakness_tags: ["listening-word-form", "noun-suffix", "adj-before-noun", "mandative-trigger-verb"],
    debug_rule: "Part 4 長句先讀選項詞性，聽腳本時對應空格位置；不要被相同詞根干擾。",
    cards: [
      card("formula", "noun", "Part 4 常見名詞", "announcement / requirement / maintenance / confirmation"),
      card("formula", "adj", "Part 4 常見形容詞", "technical / operational / financial / mandatory"),
      card("warning", "warn", "目前形式", "以腳本文字模擬聽力整合，保持 App 離線可用。")
    ],
    questions: [
      {
        scene: "Part 4 Script / Workplace Policy",
        target: "noun",
        weakness: "listening-word-form",
        stem: "Script: \"This new {BLANK} applies to all contractors working after 6 p.m.\"",
        answer: "B",
        correct: "requirement",
        distractors: [option("require", "verb"), option("required", "adj"), option("requiring", "verb")],
        cue: { signal_word: "This new", signal_pos: "determiner + adjective", description: "This new 後需要名詞。" },
        rule: "requirement 是名詞；require 是動詞。",
        trap: "聽到 require 詞根就選動詞，忽略 This new。"
      },
      {
        scene: "Part 4 Script / Purchasing",
        target: "verb",
        weakness: "listening-word-form",
        stem: "Script: \"Department heads may {BLANK} purchases under five hundred dollars.\"",
        answer: "D",
        correct: "authorize",
        distractors: [option("authorization", "noun"), option("authorized", "adj"), option("authority", "noun")],
        cue: { signal_word: "may", signal_pos: "modal", description: "may 後接動詞原形。" },
        rule: "authorize purchases = 授權採購。",
        trap: "聽到 authorization 熟悉就選名詞，忽略 may。"
      },
      {
        scene: "Part 4 Script / Facility",
        target: "noun",
        weakness: "listening-word-form",
        stem: "Script: \"Routine {BLANK} will be performed on the elevators this weekend.\"",
        answer: "A",
        correct: "maintenance",
        distractors: [option("maintain", "verb"), option("maintained", "adj"), option("maintainably", "adv")],
        cue: { signal_word: "Routine", signal_pos: "adjective", description: "Routine 修飾後方名詞，空格需要名詞。" },
        rule: "routine maintenance = 例行維護。",
        trap: "聽到 maintain 詞根就選動詞，忽略 Routine。"
      },
      {
        scene: "Part 4 Script / Support",
        target: "adj",
        weakness: "listening-word-form",
        stem: "Script: \"For {BLANK} assistance, please contact the support desk on the second floor.\"",
        answer: "C",
        correct: "technical",
        distractors: [option("technology", "noun"), option("technically", "adv"), option("technician", "noun")],
        cue: { signal_word: "assistance", signal_pos: "noun", description: "空格修飾 assistance，需要形容詞。" },
        rule: "technical assistance = 技術協助。",
        trap: "聽到 technology 熟悉就選名詞，但 assistance 前需要形容詞。"
      },
      {
        scene: "Part 4 Script / Subscription",
        target: "adv",
        weakness: "listening-word-form",
        stem: "Script: \"All service contracts are renewed {BLANK} unless customers cancel in writing.\"",
        answer: "D",
        correct: "annually",
        distractors: [option("annual", "adj"), option("annuity", "noun"), option("annualize", "verb")],
        cue: { signal_word: "renewed", signal_pos: "verb", description: "空格修飾 renewed 的頻率，需要副詞。" },
        rule: "renewed annually = 每年續約。",
        trap: "看到 contracts 是名詞就選 annual，忽略空格修飾 renewed。"
      },
      {
        scene: "Part 4 Script / Registration",
        target: "noun",
        weakness: "listening-word-form",
        stem: "Script: \"You will receive a {BLANK} after completing online registration.\"",
        answer: "A",
        correct: "confirmation",
        distractors: [option("confirm", "verb"), option("confirmed", "adj"), option("confirming", "verb")],
        cue: { signal_word: "a", signal_pos: "article", description: "a 後需要名詞。" },
        rule: "receive a confirmation = 收到確認通知。",
        trap: "聽到 confirm 詞根就選動詞，忽略 a。"
      }
    ],
    monitor_questions: [commonMonitors.mandativeSubmit, commonMonitors.mandativeWear]
  }),
  lesson({
    day: 13,
    week: 4,
    lesson_type: "review",
    target_component: "grammar",
    title: "本模組全錯題整合複習",
    quiz_type: "standard",
    time_limit_seconds: 20,
    focus_tags: ["review", "part-of-speech", "false-friends", "collocation", "listening-word-form"],
    weakness_tags: ["word-family-choice", "false-friends", "collocation-noun-verb", "listening-word-form", "number-of-sva", "active-passive", "multiplier-comparison"],
    debug_rule: "錯題按四類處理：詞性混淆、False Friends、Collocation、聽力詞性；每題都回到位置法。",
    cards: [
      card("step", "noun", "錯題分類", "1. 詞性混淆 2. False Friends 3. Collocation 4. 聽力詞性"),
      card("formula", "verb", "封存門檻", "同類型錯誤率低於 20% 才封存，否則進入 Week 3 監控。"),
      card("warning", "warn", "複習策略", "唔重背題目答案，只重建判斷步驟。")
    ],
    questions: [
      {
        scene: "Review / Noun Position",
        target: "noun",
        weakness: "det-noun",
        stem: "The supervisor requested immediate {BLANK} of the damaged equipment.",
        answer: "D",
        correct: "replacement",
        distractors: [option("replace", "verb"), option("replaced", "adj"), option("replacing", "verb")],
        cue: { signal_word: "immediate", signal_pos: "adjective", description: "immediate 後需要名詞。" },
        rule: "形容詞 + 名詞；replacement 是名詞。",
        trap: "看到 equipment 需要更換而選動詞 replace。"
      },
      {
        scene: "Review / Verb Position",
        target: "verb",
        weakness: "verb-position",
        stem: "The system will {BLANK} a warning if the temperature rises too quickly.",
        answer: "C",
        correct: "generate",
        distractors: [option("generation", "noun"), option("generative", "adj"), option("generally", "adv")],
        cue: { signal_word: "will", signal_pos: "modal", description: "will 後需要動詞原形。" },
        rule: "generate a warning = 產生警示。",
        trap: "選 generation 因為 warning 是名詞，忽略 will。"
      },
      {
        scene: "Review / Adjective Position",
        target: "adj",
        weakness: "adj-before-noun",
        stem: "The airport installed a more {BLANK} security system last month.",
        answer: "A",
        correct: "advanced",
        correctPos: "adj",
        distractors: [option("advance", "verb"), option("advancement", "noun"), option("advancedly", "adv")],
        cue: { signal_word: "security system", signal_pos: "noun phrase", description: "空格修飾 security system，需要形容詞。" },
        rule: "advanced system = 先進系統。",
        trap: "看到 installed 後誤選動詞 advance。"
      },
      {
        scene: "Review / Adverb Position",
        target: "adv",
        weakness: "adv-verb",
        stem: "The accounting team corrected the billing errors {BLANK}.",
        answer: "B",
        correct: "accurately",
        distractors: [option("accurate", "adj"), option("accuracy", "noun"), option("accurateness", "noun")],
        cue: { signal_word: "corrected", signal_pos: "verb", description: "空格修飾 corrected，需要副詞。" },
        rule: "correct accurately = 準確修正。",
        trap: "看到 errors 是名詞就選 accurate。"
      },
      {
        scene: "Review / False Friends",
        target: "adj",
        weakness: "economic-economical",
        stem: "The procurement team chose a more {BLANK} packaging design to reduce material waste.",
        answer: "C",
        correct: "economical",
        correctPos: "adj",
        distractors: [option("economic", "adj"), option("economy", "noun"), option("economize", "verb")],
        cue: { signal_word: "packaging design", signal_pos: "noun phrase", description: "空格修飾 design，需要形容詞；語意是節省成本。" },
        rule: "economical = 節儉的；economic = 經濟的。",
        trap: "只知 economic 是形容詞，但語意不符合節省成本。"
      },
      {
        scene: "Review / Collocation",
        target: "noun",
        weakness: "collocation-noun-verb",
        stem: "The director asked the team to conduct a brief {BLANK} of customer preferences.",
        answer: "D",
        correct: "survey",
        correctPos: "noun",
        distractors: [option("surveys", "verb"), option("surveyed", "verb"), option("surveyor", "noun")],
        cue: { signal_word: "conduct a brief", signal_pos: "collocation", description: "conduct a survey 是固定搭配，空格需要名詞。" },
        rule: "conduct a survey = 進行調查。",
        trap: "看到 to conduct 後又選動詞 surveys。"
      },
      {
        scene: "Review / Listening Word Form",
        target: "noun",
        weakness: "listening-word-form",
        stem: "Script: \"A final {BLANK} will be issued after payment is received.\"",
        answer: "A",
        correct: "receipt",
        correctPos: "noun",
        distractors: [option("receive", "verb"), option("received", "adj"), option("recently", "adv")],
        cue: { signal_word: "A final", signal_pos: "determiner + adjective", description: "A final 後需要名詞。" },
        rule: "receipt 是收據；receive 是動詞。",
        trap: "聽到 receive 詞根就選動詞，忽略 A final。"
      },
      {
        scene: "Review / Word Family",
        target: "adv",
        weakness: "word-family-choice",
        stem: "The two systems operate {BLANK} even though they share one database.",
        answer: "B",
        correct: "independently",
        distractors: [option("independent", "adj"), option("independence", "noun"), option("depend", "verb")],
        cue: { signal_word: "operate", signal_pos: "verb", description: "空格修飾 operate，需要副詞。" },
        rule: "operate independently = 獨立運作。",
        trap: "選 independent 因為 systems 是名詞，忽略空格修飾動詞。"
      },
      {
        scene: "Review / Noun Modifier",
        target: "noun",
        weakness: "noun-noun-compound",
        stem: "All staff must complete data {BLANK} training before using the new platform.",
        answer: "C",
        correct: "privacy",
        correctPos: "noun",
        distractors: [option("private", "adj"), option("privately", "adv"), option("privatize", "verb")],
        cue: { signal_word: "training", signal_pos: "compound noun", description: "data privacy training 是複合名詞，空格用名詞修飾名詞。" },
        rule: "noun + noun compound 可用名詞作修飾語。",
        trap: "看到 training 前要修飾語就自動選形容詞 private。"
      },
      {
        scene: "Review / Degree Adverb",
        target: "adj",
        weakness: "adv-adj-degree",
        stem: "The revised policy is highly {BLANK} to contract employees.",
        answer: "D",
        correct: "relevant",
        distractors: [option("relevance", "noun"), option("relevantly", "adv"), option("relate", "verb")],
        cue: { signal_word: "highly", signal_pos: "degree adverb", description: "highly 修飾形容詞 relevant。" },
        rule: "highly relevant to = 與...高度相關。",
        trap: "看到 highly 後選 relevancy/relevantly，未看後方 to 搭配。"
      },
      {
        scene: "Review / Preposition",
        target: "noun",
        weakness: "prep-noun",
        stem: "The committee expressed support for the {BLANK} of the new policy.",
        answer: "A",
        correct: "implementation",
        distractors: [option("implement", "verb"), option("implemented", "adj"), option("implementing", "verb")],
        cue: { signal_word: "for the", signal_pos: "preposition + determiner", description: "for the + 空格 + of，需要名詞。" },
        rule: "for the implementation of = 對...實施的支持。",
        trap: "看到 policy 要被實施而選動詞 implement。"
      },
      {
        scene: "Review / Linking Verb",
        target: "adj",
        weakness: "linking-verb-adj",
        stem: "After the software patch, the interface became more {BLANK}.",
        answer: "B",
        correct: "intuitive",
        distractors: [option("intuition", "noun"), option("intuitively", "adv"), option("intuit", "verb")],
        cue: { signal_word: "became", signal_pos: "linking verb", description: "became 後補充 interface 狀態，需要形容詞。" },
        rule: "become + adjective。",
        trap: "看到 more 就選副詞 intuitively，忽略連綴動詞。"
      }
    ],
    monitor_questions: [commonMonitors.numberOfHas, commonMonitors.activeReviewed, commonMonitors.multiplierQuickly]
  }),
  lesson({
    day: 14,
    week: 4,
    lesson_type: "test",
    target_component: "grammar",
    title: "詞性打底最終週測",
    quiz_type: "weekly",
    time_limit_seconds: 15,
    focus_tags: ["weekly-test", "part-of-speech", "false-friends", "mandative-monitor", "multiplier-monitor"],
    weakness_tags: ["part-of-speech-test", "false-friends", "mandative-trigger-verb", "multiplier-comparison"],
    debug_rule: "正式限時：先位置，後語尾，再語意；監控題獨立計算，不混入詞性掌握度。",
    cards: [
      card("formula", "noun", "測驗範圍", "詞性 × 10 + False Friends × 2 + Mandative × 4 + 倍數比較 × 4"),
      card("warning", "warn", "測驗模式", "每題 15 秒，提示只保留通用解題方向。"),
      card("step", "verb", "交卷後", "報告會分開顯示主題題正確率與監控題正確率。")
    ],
    questions: [
      {
        scene: "Final Test / Training",
        target: "adj",
        weakness: "part-of-speech-test",
        stem: "After the additional modules were added, the training program became quite {BLANK}.",
        answer: "C",
        correct: "comprehensive",
        distractors: [option("comprehension", "noun"), option("comprehensively", "adv"), option("comprehend", "verb")],
        cue: { signal_word: "became", signal_pos: "linking verb", description: "became 後需要形容詞補語。" },
        hint: "正式測驗：先看位置，再看語尾。",
        rule: "連綴動詞後用形容詞補語。",
        trap: "看到 quite 後選副詞 comprehensively，忽略 became。"
      },
      {
        scene: "Final Test / Executive",
        target: "noun",
        weakness: "part-of-speech-test",
        stem: "The CEO gave her {BLANK} to proceed with the acquisition before the deadline.",
        answer: "A",
        correct: "approval",
        distractors: [option("approve", "verb"), option("approved", "adj"), option("approvingly", "adv")],
        cue: { signal_word: "her", signal_pos: "possessive determiner", description: "her 後需要名詞作 gave 的受詞。" },
        hint: "正式測驗：先看位置，再看語尾。",
        rule: "give approval = 批准。",
        trap: "看到 proceed with 以為要動詞 approve，忽略 her。"
      },
      {
        scene: "Final Test / Fund",
        target: "adj",
        weakness: "adv-adj-degree",
        stem: "The fund's performance this year was considered highly {BLANK} by analysts.",
        answer: "D",
        correct: "favorable",
        distractors: [option("favor", "noun"), option("favorably", "adv"), option("favoring", "verb")],
        cue: { signal_word: "highly", signal_pos: "degree adverb", description: "highly 修飾形容詞 favorable。" },
        hint: "正式測驗：先看位置，再看語尾。",
        rule: "highly favorable = 十分有利。",
        trap: "見到 highly 就誤選 -ly 副詞 favorably。"
      },
      {
        scene: "Final Test / Logistics",
        target: "adv",
        weakness: "adv-verb",
        stem: "The logistics team responded {BLANK} to the customer's urgent delivery request.",
        answer: "B",
        correct: "promptly",
        distractors: [option("prompt", "adj"), option("promptness", "noun"), option("prompting", "verb")],
        cue: { signal_word: "responded", signal_pos: "verb", description: "空格修飾 responded，需要副詞。" },
        hint: "正式測驗：先看位置，再看語尾。",
        rule: "respond promptly = 迅速回應。",
        trap: "只靠 prompt 語意，忘記修飾動詞要副詞。"
      },
      {
        scene: "Final Test / Energy",
        target: "noun",
        weakness: "prep-noun",
        stem: "The company invested heavily in the {BLANK} of solar energy infrastructure.",
        answer: "B",
        correct: "utilization",
        distractors: [option("utilize", "verb"), option("utilized", "adj"), option("utilitarian", "adj")],
        cue: { signal_word: "in the", signal_pos: "preposition + determiner", description: "in the + 空格 + of，需要名詞。" },
        hint: "正式測驗：先看位置，再看語尾。",
        rule: "the utilization of = ...的使用。",
        trap: "看到 energy infrastructure 被使用而選動詞 utilize。"
      },
      {
        scene: "Final Test / Warehouse",
        target: "noun",
        weakness: "noun-noun-compound",
        stem: "The new {BLANK} management system reduced stockout incidents by 40 percent.",
        answer: "D",
        correct: "inventory",
        correctPos: "noun",
        distractors: [option("inventoried", "verb"), option("inventive", "adj"), option("invent", "verb")],
        cue: { signal_word: "management system", signal_pos: "compound noun", description: "inventory management system 是複合名詞。" },
        hint: "正式測驗：先看位置，再看語尾。",
        rule: "inventory management = 庫存管理。",
        trap: "誤以為名詞前一定用形容詞，選 inventive。"
      },
      {
        scene: "Final Test / Strategy",
        target: "noun",
        weakness: "collocation-noun-verb",
        stem: "After lengthy discussions, the team finally reached a {BLANK} on the marketing strategy.",
        answer: "D",
        correct: "conclusion",
        distractors: [option("conclude", "verb"), option("conclusive", "adj"), option("conclusively", "adv")],
        cue: { signal_word: "reached a", signal_pos: "collocation", description: "reach a conclusion 是固定搭配。" },
        hint: "正式測驗：先看位置，再看語尾。",
        rule: "reach a conclusion = 得出結論。",
        trap: "看到 team finally 後選 conclude，忽略 reached a。"
      },
      {
        scene: "Final Test / Purchasing",
        target: "adj",
        weakness: "economic-economical",
        stem: "The purchasing team proposed several {BLANK} measures to reduce operating costs.",
        answer: "C",
        correct: "economical",
        correctPos: "adj",
        distractors: [option("economy", "noun"), option("economic", "adj"), option("economize", "verb")],
        cue: { signal_word: "measures", signal_pos: "noun", description: "空格修飾 measures，需要形容詞；語意是節省成本。" },
        hint: "正式測驗：先看位置，再看語尾。",
        rule: "economical = 節儉的；economic = 經濟的。",
        trap: "兩者都可作形容詞，但語意不同。"
      },
      {
        scene: "Final Test / Registration",
        target: "noun",
        weakness: "part-of-speech-test",
        stem: "A registration {BLANK} will be emailed after payment is completed.",
        answer: "A",
        correct: "confirmation",
        distractors: [option("confirm", "verb"), option("confirmed", "adj"), option("confirming", "verb")],
        cue: { signal_word: "A registration", signal_pos: "determiner + noun modifier", description: "A registration 後需要名詞核心。" },
        hint: "正式測驗：先看位置，再看語尾。",
        rule: "registration confirmation = 報名確認。",
        trap: "看到 will be emailed 後誤以為空格要動詞。"
      },
      {
        scene: "Final Test / IT",
        target: "verb",
        weakness: "part-of-speech-test",
        stem: "The new dashboard can {BLANK} unusual spending patterns automatically.",
        answer: "C",
        correct: "identify",
        distractors: [option("identification", "noun"), option("identifiable", "adj"), option("identifiably", "adv")],
        cue: { signal_word: "can", signal_pos: "modal", description: "can 後需要動詞原形。" },
        hint: "正式測驗：先看位置，再看語尾。",
        rule: "can identify patterns = 可識別模式。",
        trap: "被 identification 名詞吸引，忽略 can。"
      },
      {
        scene: "Final Test / HR",
        target: "noun",
        weakness: "personal-personnel",
        stem: "Updated {BLANK} files must be stored in a secure database.",
        answer: "B",
        correct: "personnel",
        correctPos: "noun",
        distractors: [option("personal", "adj"), option("personally", "adv"), option("personalize", "verb")],
        cue: { signal_word: "files", signal_pos: "compound noun", description: "personnel files 是人事檔案。" },
        hint: "正式測驗：先看位置，再看語尾。",
        rule: "personnel = 人事/員工；personal = 個人的。",
        trap: "personal files 會變成私人檔案，語意不符。"
      },
      {
        scene: "Final Test / Quality",
        target: "adv",
        weakness: "part-of-speech-test",
        stem: "The quality team inspected the returned products {BLANK}.",
        answer: "D",
        correct: "thoroughly",
        distractors: [option("thorough", "adj"), option("thoroughness", "noun"), option("thoroughfare", "noun")],
        cue: { signal_word: "inspected", signal_pos: "verb", description: "空格修飾 inspected，需要副詞。" },
        hint: "正式測驗：先看位置，再看語尾。",
        rule: "inspect thoroughly = 徹底檢查。",
        trap: "看到 products 是名詞就選 thorough。"
      }
    ],
    monitor_questions: [
      {
        ...commonMonitors.mandativeSubmit,
        answer: "B",
        correct: "submit",
        distractors: [option("submits", "verb"), option("submitted", "verb"), option("submitting", "verb")]
      },
      {
        ...commonMonitors.multiplierQuickly,
        answer: "A",
        correct: "quickly",
        distractors: [option("quick", "adj"), option("quickness", "noun"), option("quicken", "verb")]
      },
      {
        ...commonMonitors.mandativeWear,
        answer: "C",
        correct: "wear",
        distractors: [option("wears", "verb"), option("wore", "verb"), option("wearing", "verb")]
      },
      {
        ...commonMonitors.multiplierLarge,
        answer: "D",
        correct: "large",
        distractors: [option("largely", "adv"), option("largeness", "noun"), option("enlarge", "verb")]
      },
      {
        scene: "[監控] Mandative Subjunctive",
        eye: "far",
        target: "verb",
        weakness: "mandative-trigger-verb",
        stem: "The director insisted that all contractors {BLANK} safety certificates before site entry.",
        answer: "A",
        correct: "present",
        distractors: [option("presents", "verb"), option("presented", "verb"), option("presenting", "verb")],
        cue: { signal_word: "insisted that", signal_pos: "mandative trigger", description: "insist that + S + V 原形。" },
        ruleType: "warn",
        rule: "Mandative trigger + that + S + base verb."
      },
      {
        scene: "[監控] Multiplier Comparison",
        eye: "middle",
        target: "adj",
        weakness: "multiplier-comparison",
        stem: "Sales this quarter were three times as {BLANK} as those in the same period last year.",
        answer: "B",
        correct: "high",
        distractors: [option("highly", "adv"), option("height", "noun"), option("heighten", "verb")],
        cue: { signal_word: "were", signal_pos: "linking verb", description: "as ___ as 比較 sales 高低，be 動詞後用形容詞。" },
        ruleType: "warn",
        rule: "three times as + adjective + as."
      },
      {
        scene: "[監控] Mandative Adjective",
        eye: "far",
        target: "verb",
        weakness: "mandative-trigger-adj",
        stem: "It is necessary that the finance team {BLANK} the figures before publication.",
        answer: "C",
        correct: "verify",
        distractors: [option("verifies", "verb"), option("verified", "verb"), option("verifying", "verb")],
        cue: { signal_word: "necessary that", signal_pos: "mandative adjective", description: "necessary that + S + V 原形。" },
        ruleType: "warn",
        rule: "necessary that + S + base verb."
      },
      {
        scene: "[監控] Multiplier Comparison",
        eye: "middle",
        target: "adv",
        weakness: "multiplier-comparison",
        stem: "The updated system responds twice as {BLANK} as the old platform.",
        answer: "A",
        correct: "quickly",
        distractors: [option("quick", "adj"), option("quickness", "noun"), option("quicken", "verb")],
        cue: { signal_word: "responds", signal_pos: "verb", description: "空格修飾 responds，需要副詞。" },
        ruleType: "warn",
        rule: "twice as + adverb + as when modifying a verb."
      }
    ]
  })
];

fs.mkdirSync(dataDir, { recursive: true });
lessons.forEach((entry) => {
  fs.writeFileSync(
    path.join(dataDir, `${entry.lesson_id}.json`),
    `${JSON.stringify(entry, null, 2)}\n`,
    "utf8"
  );
});

const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const days = lessons.map((entry) => entry.lesson_id);
const posModule = index.modules.find((entry) => entry.module_id === "pos-booster");
if (!posModule) throw new Error("Missing pos-booster module in data/index.json");
Object.assign(posModule, {
  title: "詞性打底 Part of Speech Booster",
  description: "14 天完整版，涵蓋名詞/動詞/形容詞/副詞語尾、位置法、False Friends、Collocations、Listening 整合與最終週測，讓詞性辨識成為秒辨反射。",
  total_days: 14,
  target_accuracy: 85,
  insert_after_week: 2,
  days
});

const lessonMeta = new Map(lessons.map((entry) => [
  entry.lesson_id,
  {
    lesson_id: entry.lesson_id,
    module_id: entry.module_id,
    week: entry.week,
    day: entry.day,
    lesson_type: entry.lesson_type,
    target_component: entry.target_component,
    title: entry.title,
    description: {
      "pos-d1": "-tion/-ment/-ance/-ence/-ity/-ness/-ship/-hood -> 名詞；限定詞與介系詞後名詞位",
      "pos-d2": "-ize/-en/-ify/-ate -> 動詞；will/can/must/to 後動詞位",
      "pos-d3": "-ful/-ous/-ive/-al/-able/-ible/-ary/-ory -> 形容詞；名詞前與連綴動詞後",
      "pos-d4": "-ly 副詞與 friendly/lovely/timely/likely/lonely 形容詞例外",
      "pos-d5": "位置法混合：名詞/動詞/形容詞/副詞各 3 題，倍數比較監控",
      "pos-d6": "15 組 False Friends：facilitate/facility、economic/economical、fiscal/physical 等",
      "pos-d7": "高頻動詞 + 名詞搭配：make a decision / conduct a survey / submit a report",
      "pos-d8": "同根四格限時強化：analysis/analyze/analytical/analytically 等",
      "pos-d9": "名詞/動詞搭配：take action / provide assistance / implement changes",
      "pos-d10": "形容詞/副詞搭配：highly effective / financially stable / carefully reviewed",
      "pos-d11": "文字腳本模擬 Part 3/4：聽前預判詞性與語尾",
      "pos-d12": "文字腳本模擬 Part 4：announcement / requirement / authorization / confirmation",
      "pos-d13": "全模組錯題整合：詞性混淆 / False Friends / Collocation / 聽力詞性",
      "pos-d14": "最終週測：詞性 × 10 + False Friends × 2 + Mandative × 4 + 倍數 × 4"
    }[entry.lesson_id],
    quiz_type: entry.quiz_type,
    time_limit_seconds: entry.time_limit_seconds,
    file: `./pos-booster/${entry.lesson_id}.json`
  }
]));

index.lessons = index.lessons.map((row) => {
  if (!lessonMeta.has(row.lesson_id)) return row;
  return { ...row, ...lessonMeta.get(row.lesson_id), sequence: row.sequence };
});

fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");

console.log(`Wrote ${lessons.length} PoS Booster lessons and updated data/index.json.`);

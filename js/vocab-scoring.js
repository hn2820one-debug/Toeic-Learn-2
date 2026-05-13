(function () {
  const ERROR_CODES = [
    "VOCAB_UNKNOWN",
    "VOCAB_WEAK_RECALL",
    "WORD_FAMILY_POS",
    "COLLOCATION_PREP",
    "PHRASE_MEANING",
    "FORMAL_PHRASE",
    "FALSE_FRIEND",
    "SCENE_VOCAB_GAP",
    "TIME_PRESSURE",
    "CARELESS",
    "REPEATED_ERROR"
  ];

  const TARGET_TIMES = {
    meaning_choice: 10,
    word_family: 20,
    collocation: 15,
    formal_phrase: 20,
    false_friend: 8,
    scene_vocabulary: 15,
    part5_sentence_completion: 20,
    part6_context_choice: 45,
    speed_drill: 8,
    review_question: 15
  };

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function localDate(value) {
    const d = value ? new Date(value) : new Date();
    if (Number.isNaN(d.getTime())) return "";
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  function localIso(date) {
    const d = date || new Date();
    const tz = -d.getTimezoneOffset();
    const sign = tz >= 0 ? "+" : "-";
    const abs = Math.abs(tz);
    const hh = String(Math.floor(abs / 60)).padStart(2, "0");
    const mm = String(abs % 60).padStart(2, "0");
    const yyyy = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    const s = String(d.getSeconds()).padStart(2, "0");
    return `${yyyy}-${mo}-${day}T${h}:${m}:${s}${sign}${hh}:${mm}`;
  }

  function addDays(dateText, days) {
    const d = dateText ? new Date(`${dateText}T00:00:00`) : new Date();
    d.setDate(d.getDate() + days);
    return localDate(d);
  }

  function targetTime(type) {
    return TARGET_TIMES[type] || 20;
  }

  function speedBucket(isCorrect, responseTimeSeconds, type) {
    const fast = Number(responseTimeSeconds || 0) <= targetTime(type);
    if (isCorrect && fast) return "fast_correct";
    if (isCorrect) return "slow_correct";
    if (fast) return "fast_wrong";
    return "slow_wrong";
  }

  function masteryLevel(score) {
    if (score >= 85) return "mastered";
    if (score >= 75) return "stable";
    if (score >= 60) return "unstable";
    if (score >= 40) return "weak";
    return "blind";
  }

  function daysSince(dateText) {
    if (!dateText) return 999;
    const then = new Date(`${dateText}T00:00:00`);
    if (Number.isNaN(then.getTime())) return 999;
    const now = new Date(`${localDate()}T00:00:00`);
    return Math.floor((now.getTime() - then.getTime()) / 86400000);
  }

  function calculateMasteryScore(item) {
    const seen = Number(item.seen_count || 0);
    if (!seen) return 0;

    const correct = Number(item.correct_count || 0);
    const wrong = Number(item.wrong_count || 0);
    const accuracy = correct / seen;
    const accuracyScore = accuracy * 50;

    const target = targetTime(item.last_question_type || item.item_type);
    const avg = Number(item.avg_response_time_seconds || target * 2);
    const speedScore = clamp(target / Math.max(avg, 0.5), 0, 1) * 25;

    const consecutive = Number(item.consecutive_fast_correct || 0);
    const repeatedPenalty = wrong >= 3 ? 0.55 : wrong >= 2 ? 0.75 : 1;
    const stabilityScore = clamp(consecutive / 3, 0, 1) * 15 * repeatedPenalty;

    const gap = daysSince(item.last_seen);
    const recencyScore = gap <= 3 ? 10 : gap <= 7 ? 8 : gap <= 14 ? 5 : gap <= 30 ? 2 : 0;

    return Math.round(clamp(accuracyScore + speedScore + stabilityScore + recencyScore, 0, 100));
  }

  function csvEscape(value) {
    const text = value === undefined || value === null ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  }

  function toCsv(rows) {
    return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
  }

  function downloadText(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  window.VocabScoring = {
    ERROR_CODES,
    TARGET_TIMES,
    addDays,
    calculateMasteryScore,
    downloadText,
    localDate,
    localIso,
    masteryLevel,
    speedBucket,
    targetTime,
    toCsv
  };
})();

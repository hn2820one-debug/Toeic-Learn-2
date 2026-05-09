(function () {
  const DB_NAME = "toeic_learning_db";
  const DB_VERSION = 1;
  const EVENT_STORE = "events";
  const ATTEMPT_STORE = "attempts";
  const LOG_SCHEMA_VERSION = 1;

  let dbPromise = null;
  let warnedUnavailable = false;

  function hasIndexedDB() {
    return typeof window !== "undefined" && "indexedDB" in window;
  }

  function warnUnavailable(error) {
    if (warnedUnavailable) return;
    warnedUnavailable = true;
    console.warn("IndexedDB 無法使用，學習紀錄會保留在既有進度摘要中，不會阻止作答。", error || "");
  }

  function createId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return `${prefix}_${window.crypto.randomUUID()}`;
    }
    const random = Math.random().toString(36).slice(2, 10);
    return `${prefix}_${Date.now()}_${random}`;
  }

  function localDateFromISO(iso) {
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) return "";
    const mm = `${d.getMonth() + 1}`.padStart(2, "0");
    const dd = `${d.getDate()}`.padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  function numberOrNull(value) {
    if (value === undefined || value === null || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function openDB() {
    if (!hasIndexedDB()) {
      warnUnavailable();
      return Promise.resolve(null);
    }

    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(EVENT_STORE)) {
          const events = db.createObjectStore(EVENT_STORE, { keyPath: "event_id" });
          events.createIndex("timestamp_iso", "timestamp_iso", { unique: false });
          events.createIndex("event_type", "event_type", { unique: false });
          events.createIndex("session_id", "session_id", { unique: false });
          events.createIndex("attempt_id", "attempt_id", { unique: false });
          events.createIndex("lesson_id", "lesson_id", { unique: false });
          events.createIndex("q_id", "q_id", { unique: false });
          events.createIndex("weakness_tag", "weakness_tag", { unique: false });
          events.createIndex("target_component", "target_component", { unique: false });
          events.createIndex("date", "date", { unique: false });
        }

        if (!db.objectStoreNames.contains(ATTEMPT_STORE)) {
          const attempts = db.createObjectStore(ATTEMPT_STORE, { keyPath: "attempt_id" });
          attempts.createIndex("session_id", "session_id", { unique: false });
          attempts.createIndex("lesson_id", "lesson_id", { unique: false });
          attempts.createIndex("started_at_iso", "started_at_iso", { unique: false });
          attempts.createIndex("ended_at_iso", "ended_at_iso", { unique: false });
          attempts.createIndex("date", "date", { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        warnUnavailable(request.error);
        resolve(null);
      };
      request.onblocked = () => {
        console.warn("學習紀錄資料庫升級被其他分頁暫時鎖定，請關閉舊分頁後再重試。");
      };
    });

    return dbPromise;
  }

  function normalizeEvent(event) {
    const timestamp = event?.timestamp_iso || new Date().toISOString();
    return {
      event_id: event?.event_id || createId("evt"),
      timestamp_iso: timestamp,
      date: event?.date || localDateFromISO(timestamp),
      event_type: event?.event_type || "unknown",
      zh_message: event?.zh_message || "已記錄一筆學習事件。",
      session_id: event?.session_id || null,
      attempt_id: event?.attempt_id || null,
      lesson_id: event?.lesson_id || null,
      q_id: event?.q_id || null,
      selected_answer: event?.selected_answer ?? null,
      correct_answer: event?.correct_answer ?? null,
      is_correct: event?.is_correct ?? null,
      elapsed_ms: numberOrNull(event?.elapsed_ms),
      remaining_ms: numberOrNull(event?.remaining_ms),
      timeout: Boolean(event?.timeout),
      weakness_tag: event?.weakness_tag || null,
      target_component: event?.target_component || null,
      locked: event?.locked ?? null,
      metadata: event?.metadata || {}
    };
  }

  function normalizeAttempt(attempt) {
    const endedAt = attempt?.ended_at_iso || new Date().toISOString();
    const questionResults = Array.isArray(attempt?.question_results) ? attempt.question_results : [];
    const wrongTags = Array.isArray(attempt?.wrong_tags)
      ? attempt.wrong_tags
      : [...new Set(questionResults.filter((r) => !r.is_correct && r.weakness_tag).map((r) => r.weakness_tag))];

    return {
      schema_version: LOG_SCHEMA_VERSION,
      attempt_id: attempt?.attempt_id || createId("att"),
      session_id: attempt?.session_id || null,
      lesson_id: attempt?.lesson_id || null,
      module_id: attempt?.module_id || null,
      week: attempt?.week ?? null,
      day: attempt?.day ?? null,
      lesson_type: attempt?.lesson_type || null,
      target_component: attempt?.target_component || null,
      title: attempt?.title || null,
      started_at_iso: attempt?.started_at_iso || null,
      ended_at_iso: endedAt,
      date: attempt?.date || localDateFromISO(endedAt),
      total_elapsed_ms: numberOrNull(attempt?.total_elapsed_ms),
      avg_time_ms: numberOrNull(attempt?.avg_time_ms),
      accuracy: numberOrNull(attempt?.accuracy),
      mastery: numberOrNull(attempt?.mastery),
      question_elapsed_ms: Array.isArray(attempt?.question_elapsed_ms) ? attempt.question_elapsed_ms : [],
      question_results: questionResults,
      wrong_tags: wrongTags,
      timeout_count: numberOrNull(attempt?.timeout_count) || 0,
      zh_summary: attempt?.zh_summary || "已完成一次練習紀錄。"
    };
  }

  function putRecord(storeName, record) {
    return openDB().then((db) => {
      if (!db) return record;

      return new Promise((resolve) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).put(record);
        tx.oncomplete = () => resolve(record);
        tx.onerror = () => {
          console.warn("學習紀錄寫入失敗，已保留既有進度摘要。", tx.error);
          resolve(record);
        };
      });
    });
  }

  function getAllRecords(storeName) {
    return openDB().then((db) => {
      if (!db) return [];

      return new Promise((resolve) => {
        const tx = db.transaction(storeName, "readonly");
        const request = tx.objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => {
          console.warn("學習紀錄讀取失敗。", request.error);
          resolve([]);
        };
      });
    });
  }

  function matchesFilters(record, filters) {
    if (!filters) return true;
    if (filters.date && record.date !== filters.date && localDateFromISO(record.timestamp_iso || record.ended_at_iso) !== filters.date) return false;
    if (filters.lesson_id && record.lesson_id !== filters.lesson_id) return false;
    if (filters.weakness_tag && record.weakness_tag !== filters.weakness_tag) return false;
    if (filters.attempt_id && record.attempt_id !== filters.attempt_id) return false;
    if (filters.event_type && record.event_type !== filters.event_type) return false;
    if (filters.from_iso && (record.timestamp_iso || record.ended_at_iso) < filters.from_iso) return false;
    if (filters.to_iso && (record.timestamp_iso || record.ended_at_iso) > filters.to_iso) return false;
    return true;
  }

  function sortByTimeAsc(a, b) {
    return String(a.timestamp_iso || a.started_at_iso || a.ended_at_iso).localeCompare(String(b.timestamp_iso || b.started_at_iso || b.ended_at_iso));
  }

  function sortByEndDesc(a, b) {
    return String(b.ended_at_iso || b.started_at_iso).localeCompare(String(a.ended_at_iso || a.started_at_iso));
  }

  function writeEvent(event) {
    return putRecord(EVENT_STORE, normalizeEvent(event));
  }

  function writeAttempt(attempt) {
    return putRecord(ATTEMPT_STORE, normalizeAttempt(attempt));
  }

  async function getEvents(filters) {
    const records = await getAllRecords(EVENT_STORE);
    return records.filter((record) => matchesFilters(record, filters)).sort(sortByTimeAsc);
  }

  async function getAttempts(filters) {
    const records = await getAllRecords(ATTEMPT_STORE);
    return records.filter((record) => matchesFilters(record, filters)).sort(sortByEndDesc);
  }

  async function getAttempt(attemptId) {
    if (!attemptId) return null;
    const attempts = await getAttempts({ attempt_id: attemptId });
    return attempts[0] || null;
  }

  function getEventsByAttempt(attemptId) {
    return getEvents({ attempt_id: attemptId });
  }

  async function getRecentSummary(date) {
    const targetDate = date || localDateFromISO(new Date().toISOString());
    const [events, attempts] = await Promise.all([
      getEvents({ date: targetDate }),
      getAttempts({ date: targetDate })
    ]);
    const answerEvents = events.filter((event) => event.event_type === "answer_select" || event.event_type === "question_timeout");
    const elapsedValues = answerEvents.map((event) => event.elapsed_ms).filter((value) => Number.isFinite(value));
    const wrongEvent = answerEvents.slice().reverse().find((event) => event.timeout || event.is_correct === false);
    const latestAttempt = attempts[0] || null;
    const latestWeakness = wrongEvent?.weakness_tag || latestAttempt?.wrong_tags?.[0] || null;

    return {
      date: targetDate,
      question_count: answerEvents.length,
      avg_elapsed_ms: elapsedValues.length
        ? elapsedValues.reduce((sum, value) => sum + value, 0) / elapsedValues.length
        : null,
      latest_weakness_tag: latestWeakness,
      latest_attempt: latestAttempt,
      event_count: events.length
    };
  }

  function csvEscape(value) {
    const text = value === undefined || value === null ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  }

  function secondsText(ms) {
    if (ms === null || ms === undefined || ms === "") return "";
    if (!Number.isFinite(Number(ms))) return "";
    return (Number(ms) / 1000).toFixed(1);
  }

  async function exportEventsJSON() {
    const [events, attempts] = await Promise.all([getEvents(), getAttempts()]);
    return JSON.stringify({
      schema_version: LOG_SCHEMA_VERSION,
      database: DB_NAME,
      exported_at_iso: new Date().toISOString(),
      zh_description: "TOEIC 學習事件完整紀錄；程式欄位為英文，zh_message 為繁體中文說明。",
      events,
      attempts
    }, null, 2);
  }

  async function exportAnswersCSV() {
    const attempts = await getAttempts();
    const rows = [[
      "課程",
      "Attempt ID",
      "題號",
      "所選答案",
      "正確答案",
      "正誤",
      "耗時(秒)",
      "弱點標籤",
      "中文說明"
    ]];

    if (attempts.length) {
      attempts.slice().reverse().forEach((attempt) => {
        (attempt.question_results || []).forEach((result, index) => {
          const selected = result.timeout ? "TIMEOUT" : result.selected_answer;
          const status = result.timeout ? "逾時" : result.is_correct ? "正確" : "錯誤";
          rows.push([
            attempt.lesson_id,
            attempt.attempt_id,
            result.q_id || `Q${index + 1}`,
            selected,
            result.correct_answer,
            status,
            secondsText(result.elapsed_ms),
            result.weakness_tag,
            `課程 ${attempt.lesson_id} 題號 ${result.q_id || `Q${index + 1}`}，所選答案 ${selected || ""}，正確答案 ${result.correct_answer || ""}，結果 ${status}。`
          ]);
        });
      });
    } else {
      const events = await getEvents();
      events
        .filter((event) => event.event_type === "answer_select" || event.event_type === "question_timeout")
        .forEach((event) => {
          rows.push([
            event.lesson_id,
            event.attempt_id,
            event.q_id,
            event.timeout ? "TIMEOUT" : event.selected_answer,
            event.correct_answer,
            event.timeout ? "逾時" : event.is_correct ? "正確" : "錯誤",
            secondsText(event.elapsed_ms),
            event.weakness_tag,
            event.zh_message
          ]);
        });
    }

    return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
  }

  function downloadText(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function filenameStamp() {
    return localDateFromISO(new Date().toISOString()).replace(/-/g, "");
  }

  async function downloadEventsJSON() {
    const text = await exportEventsJSON();
    downloadText(`toeic-learning-log-${filenameStamp()}.json`, text, "application/json;charset=utf-8");
  }

  async function downloadAnswersCSV() {
    const text = await exportAnswersCSV();
    downloadText(`toeic-answer-log-${filenameStamp()}.csv`, `\ufeff${text}`, "text/csv;charset=utf-8");
  }

  window.LearningLog = {
    DB_NAME,
    DB_VERSION,
    LOG_SCHEMA_VERSION,
    createId,
    normalizeEvent,
    normalizeAttempt,
    writeEvent,
    writeAttempt,
    getEvents,
    getAttempts,
    getAttempt,
    getEventsByAttempt,
    getRecentSummary,
    exportEventsJSON,
    exportAnswersCSV,
    downloadEventsJSON,
    downloadAnswersCSV,
    isSupported: hasIndexedDB
  };
})();

(function () {
  const DB_NAME = "toeic_vocab_tracker_db";
  const DB_VERSION = 1;
  const COURSE_ID = "toeic_vocab_v1";
  const SEED_VERSION = "toeic_vocab_tracker_v1_2026_05_14";
  const PREF_KEY = "toeic_vocab_tracker_preferences";
  const ACTIVE_SESSION_KEY = "toeic_vocab_active_session";

  const STORES = {
    users: { keyPath: "user_id" },
    settings: { keyPath: "key" },
    curriculum: { keyPath: "course_id" },
    lessons: { keyPath: "lesson_id", indexes: ["stage", "status", "lesson_type"] },
    questions: { keyPath: "question_id", indexes: ["lesson_id", "stage", "type", "default_error_code", "target_item_id"] },
    vocab_items: { keyPath: "item_id", indexes: ["item_type", "mastery_level", "next_review_date"] },
    attempts: { keyPath: "attempt_id", indexes: ["session_id", "lesson_id", "question_id", "stage", "timestamp", "error_code", "target_item_id"] },
    sessions: { keyPath: "session_id", indexes: ["date", "lesson_id", "stage", "mastery_status"] },
    error_logs: { keyPath: "error_log_id", indexes: ["item_id", "error_code", "lesson_id", "status"] },
    review_queue: { keyPath: "review_id", indexes: ["item_id", "due_date", "status", "priority"] },
    exports: { keyPath: "export_id", indexes: ["created_at"] }
  };

  let dbPromise = null;

  function hasIndexedDB() {
    return typeof window !== "undefined" && "indexedDB" in window;
  }

  function requestPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function txPromise(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  function createIndexes(store, indexes) {
    (indexes || []).forEach((indexName) => {
      if (!store.indexNames.contains(indexName)) {
        store.createIndex(indexName, indexName, { unique: false });
      }
    });
  }

  function openDB() {
    if (!hasIndexedDB()) {
      return Promise.reject(new Error("IndexedDB is not available in this browser."));
    }

    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        Object.entries(STORES).forEach(([storeName, config]) => {
          const store = db.objectStoreNames.contains(storeName)
            ? request.transaction.objectStore(storeName)
            : db.createObjectStore(storeName, { keyPath: config.keyPath });
          createIndexes(store, config.indexes);
        });
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => console.warn("TOEIC vocab tracker database upgrade is blocked by another tab.");
    });

    return dbPromise;
  }

  async function withStore(storeName, mode, fn) {
    const db = await openDB();
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = await fn(store);
    await txPromise(tx);
    return result;
  }

  async function withStores(storeNames, mode, fn) {
    const db = await openDB();
    const tx = db.transaction(storeNames, mode);
    const stores = {};
    storeNames.forEach((name) => {
      stores[name] = tx.objectStore(name);
    });
    const result = await fn(stores);
    await txPromise(tx);
    return result;
  }

  function get(storeName, key) {
    return withStore(storeName, "readonly", (store) => requestPromise(store.get(key)));
  }

  function getAll(storeName) {
    return withStore(storeName, "readonly", (store) => requestPromise(store.getAll()));
  }

  function put(storeName, value) {
    return withStore(storeName, "readwrite", (store) => {
      store.put(value);
      return value;
    });
  }

  function remove(storeName, key) {
    return withStore(storeName, "readwrite", (store) => {
      store.delete(key);
      return key;
    });
  }

  async function putAll(storeName, records) {
    if (!records.length) return [];
    return withStore(storeName, "readwrite", (store) => {
      records.forEach((record) => store.put(record));
      return records;
    });
  }

  async function getByIndex(storeName, indexName, value) {
    return withStore(storeName, "readonly", (store) => {
      const index = store.index(indexName);
      return requestPromise(index.getAll(value));
    });
  }

  async function fetchJSON(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Failed to load ${path}`);
    return response.json();
  }

  function loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
    } catch (_err) {
      return {};
    }
  }

  function savePrefs(prefs) {
    localStorage.setItem(PREF_KEY, JSON.stringify({ ...loadPrefs(), ...prefs }));
  }

  function loadActiveSession() {
    try {
      return JSON.parse(localStorage.getItem(ACTIVE_SESSION_KEY) || "null");
    } catch (_err) {
      return null;
    }
  }

  function saveActiveSession(session) {
    if (!session) {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
      return;
    }
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
  }

  async function count(storeName) {
    return withStore(storeName, "readonly", (store) => requestPromise(store.count()));
  }

  async function seedIfNeeded() {
    await openDB();
    const current = await get("settings", "seed_version");
    if (current?.value === SEED_VERSION) return { seeded: false, seed_version: SEED_VERSION };

    const [curriculum, questionsV0, questionsV1a, vocabItems] = await Promise.all([
      fetchJSON("./data/vocab/curriculum.json"),
      fetchJSON("./data/vocab/questions_v0.json"),
      fetchJSON("./data/vocab/questions_v1a.json"),
      fetchJSON("./data/vocab/vocab_items.json")
    ]);

    const [existingUsers, existingLessons, existingQuestions, existingItems] = await Promise.all([
      getAll("users"),
      getAll("lessons"),
      getAll("questions"),
      getAll("vocab_items")
    ]);
    const userMap = Object.fromEntries(existingUsers.map((user) => [user.user_id, user]));
    const lessonMap = Object.fromEntries(existingLessons.map((lesson) => [lesson.lesson_id, lesson]));
    const questionMap = Object.fromEntries(existingQuestions.map((question) => [question.question_id, question]));
    const itemMap = Object.fromEntries(existingItems.map((item) => [item.item_id, item]));

    const lessons = curriculum.lessons.map((lesson) => {
      const existing = lessonMap[lesson.lesson_id];
      return existing ? { ...lesson, ...existing, question_ids: lesson.question_ids, review_question_ids: lesson.review_question_ids } : lesson;
    });
    const questions = [...questionsV0, ...questionsV1a].map((question) => {
      const existing = questionMap[question.question_id];
      return existing ? { ...question, ...existing } : question;
    });
    const items = vocabItems.map((item) => {
      const existing = itemMap[item.item_id];
      return existing ? { ...item, ...existing } : {
        first_seen: null,
        last_seen: null,
        seen_count: 0,
        correct_count: 0,
        wrong_count: 0,
        avg_response_time_seconds: 0,
        last_error_code: null,
        consecutive_fast_correct: 0,
        stable_review_sessions: 0,
        next_review_date: null,
        ...item
      };
    });

    await withStores(["users", "settings", "curriculum", "lessons", "questions", "vocab_items"], "readwrite", (stores) => {
      if (!userMap[curriculum.default_user.user_id]) stores.users.put(curriculum.default_user);

      stores.curriculum.put({
        course_id: curriculum.course_id,
        course_name: curriculum.course_name,
        schema_version: curriculum.schema_version,
        seed_version: curriculum.seed_version,
        generated_at: curriculum.generated_at,
        stages: curriculum.stages
      });

      lessons.forEach((lesson) => stores.lessons.put(lesson));
      questions.forEach((question) => stores.questions.put(question));
      items.forEach((item) => stores.vocab_items.put(item));

      stores.settings.put({ key: "seed_version", value: SEED_VERSION, updated_at: window.VocabScoring.localIso() });
      stores.settings.put({ key: "course_id", value: COURSE_ID, updated_at: window.VocabScoring.localIso() });
    });

    return { seeded: true, seed_version: SEED_VERSION };
  }

  async function getQuestionsForLesson(lesson) {
    const ids = [...(lesson.review_question_ids || []), ...(lesson.question_ids || [])];
    if (!ids.length) return [];
    const questions = await Promise.all(ids.map((id) => get("questions", id)));
    const byId = {};
    questions.filter(Boolean).forEach((q) => { byId[q.question_id] = q; });
    return ids.map((id) => byId[id]).filter(Boolean);
  }

  function createId(prefix) {
    if (window.crypto?.randomUUID) return `${prefix}_${window.crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  window.VocabDB = {
    ACTIVE_SESSION_KEY,
    COURSE_ID,
    DB_NAME,
    DB_VERSION,
    PREF_KEY,
    SEED_VERSION,
    count,
    createId,
    fetchJSON,
    get,
    getAll,
    getByIndex,
    getQuestionsForLesson,
    loadActiveSession,
    loadPrefs,
    openDB,
    put,
    putAll,
    remove,
    saveActiveSession,
    savePrefs,
    seedIfNeeded
  };
})();

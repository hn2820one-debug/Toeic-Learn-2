# TOEIC Learning App — 完整程式計劃書
**版本：** 1.0  
**適用對象：** Joseph（FSE，目標 TOEIC 570 → 750）  
**核心目標：** 將 Claude 輔助學習系統複製為可離線使用的本地 Web App

---

## 1. 系統概覽

### 1.1 產品定位
一個專為 TOEIC Part 5 設計的個人化學習應用程式，完整複製 Claude 教學系統的：
- 詞性顏色編碼系統
- 計時答題介面（開始按鈕 + 倒數計時）
- 做題思路步驟拆解
- 彩色診斷報告（全題詳解）
- 跨節次弱點追蹤

### 1.2 技術選型
| 層次 | 技術 | 原因 |
|------|------|------|
| 前端框架 | 純 HTML / CSS / JS（單檔案） | 無需安裝，手機瀏覽器直接開啟 |
| 資料存儲 | localStorage | 離線保存作答記錄、掌握度 |
| 題庫格式 | JSON（內嵌於 JS） | 無需後端，易於擴充 |
| 樣式系統 | CSS Variables | 主題一致性，與 Claude widget 對齊 |
| 離線支援 | Service Worker（可選）| PWA 安裝至手機桌面 |

### 1.3 檔案結構
```
toeic-app/
├── index.html          # 主入口（課程選單）
├── lesson.html         # 教學節次頁面
├── quiz.html           # 答題介面
├── report.html         # 診斷報告頁面
├── progress.html       # 進度總覽
├── css/
│   ├── base.css        # 全域變數、字型、reset
│   ├── lesson.css      # 教學卡片樣式
│   ├── quiz.css        # 答題介面樣式
│   └── report.css      # 報告樣式
├── js/
│   ├── app.js          # 路由、狀態管理
│   ├── quiz-engine.js  # 計時器、答題邏輯
│   ├── scorer.js       # 評分、掌握度計算
│   ├── report.js       # 診斷報告生成
│   └── storage.js      # localStorage 封裝
└── data/
    ├── pos-booster/    # 詞性打底模組題庫
    ├── week1/          # Mandative Subjunctive
    ├── week2/          # 倍數比較
    └── index.json      # 課程目錄
```

---

## 2. 顏色設計系統（POS Colour System）

### 2.1 CSS 變數定義
```css
:root {
  /* 詞性顏色 — 核心系統 */
  --pos-noun-bg:     #D6F0E0;
  --pos-noun-text:   #0A6640;
  --pos-noun-border: #0A6640;

  --pos-verb-bg:     #D6E8FA;
  --pos-verb-text:   #0C447C;
  --pos-verb-border: #0C447C;

  --pos-adj-bg:      #EDE0F7;
  --pos-adj-text:    #6B2D8B;
  --pos-adj-border:  #6B2D8B;

  --pos-adv-bg:      #F5E6D0;
  --pos-adv-text:    #8B4000;
  --pos-adv-border:  #8B4000;

  --pos-error-bg:    #FCEBEB;
  --pos-error-text:  #A32D2D;
  --pos-error-border:#A32D2D;

  /* 訊號標籤（句子中高亮題眼） */
  --signal-noun:  var(--pos-noun-bg);
  --signal-verb:  var(--pos-verb-bg);
  --signal-adj:   var(--pos-adj-bg);
  --signal-adv:   var(--pos-adv-bg);

  /* 結果顏色 */
  --result-correct-bg:  #D6F0E0;
  --result-correct:     #0A6640;
  --result-wrong-bg:    #FCEBEB;
  --result-wrong:       #A32D2D;
  --result-timeout-bg:  #FAEEDA;
  --result-timeout:     #633806;

  /* 介面顏色 */
  --bg-primary:    #FFFFFF;
  --bg-secondary:  #F5F5F5;
  --text-primary:  #1A1A1A;
  --text-secondary:#6B6B6B;
  --text-tertiary: #9B9B9B;
  --border:        #E0E0E0;
  --border-light:  #F0F0F0;
  --accent:        #1D9E75;
  --accent-light:  #E1F5EE;
}
```

### 2.2 詞性 Pill 元件
```css
.pos-pill {
  display: inline-block;
  font-size: 11px;
  padding: 2px 9px;
  border-radius: 20px;
  font-weight: 500;
  border: 0.5px solid;
}
.pos-pill.noun { background: var(--pos-noun-bg); color: var(--pos-noun-text); border-color: var(--pos-noun-border); }
.pos-pill.verb { background: var(--pos-verb-bg); color: var(--pos-verb-text); border-color: var(--pos-verb-border); }
.pos-pill.adj  { background: var(--pos-adj-bg);  color: var(--pos-adj-text);  border-color: var(--pos-adj-border); }
.pos-pill.adv  { background: var(--pos-adv-bg);  color: var(--pos-adv-text);  border-color: var(--pos-adv-border); }
.pos-pill.error{ background: var(--pos-error-bg);color: var(--pos-error-text);border-color: var(--pos-error-border); }
```

### 2.3 答案填空 Highlight
```css
/* 題幹中的正確答案高亮 */
.blank-word {
  display: inline-block;
  padding: 1px 10px;
  border-radius: 4px;
  margin: 0 3px;
  font-weight: 600;
  border-bottom-width: 2px;
  border-bottom-style: solid;
}
.blank-word.noun { background: var(--pos-noun-bg); color: var(--pos-noun-text); border-bottom-color: var(--pos-noun-border); }
.blank-word.verb { background: var(--pos-verb-bg); color: var(--pos-verb-text); border-bottom-color: var(--pos-verb-border); }
.blank-word.adj  { background: var(--pos-adj-bg);  color: var(--pos-adj-text);  border-bottom-color: var(--pos-adj-border); }
.blank-word.adv  { background: var(--pos-adv-bg);  color: var(--pos-adv-text);  border-bottom-color: var(--pos-adv-border); }
.blank-word.error{ background: var(--pos-error-bg);color: var(--pos-error-text);border-bottom-color: var(--pos-error-border); text-decoration: line-through; }

/* 題幹中的信號標籤（題眼高亮） */
.signal-tag {
  display: inline-block;
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 20px;
  font-weight: 700;
  border-width: 1.5px;
  border-style: solid;
  margin: 0 2px;
  vertical-align: middle;
}
```

---

## 3. 題庫資料結構（JSON Schema）

### 3.1 模組（Module）
```json
{
  "module_id": "pos-booster",
  "title": "詞性打底模組 Part of Speech Booster",
  "description": "14天完整版，攻克名詞/動詞/形容詞/副詞四詞性辨識、False Friends、Collocations 與 Listening 詞性整合",
  "total_days": 14,
  "target_accuracy": 85,
  "days": [
    "pos-d1", "pos-d2", "pos-d3", "pos-d4", "pos-d5", "pos-d6", "pos-d7",
    "pos-d8", "pos-d9", "pos-d10", "pos-d11", "pos-d12", "pos-d13", "pos-d14"
  ]
}
```

### 3.2 節次（Day/Lesson）
```json
{
  "lesson_id": "pos-d1",
  "module_id": "pos-booster",
  "day": 1,
  "title": "名詞 vs 動詞辨識",
  "type": "concept+quiz",
  "time_limit_seconds": 25,
  "concept": { ... },
  "questions": [ ... ],
  "monitor_questions": [ ... ]
}
```

### 3.3 題目（Question）
```json
{
  "q_id": "pos-d1-q1",
  "type": "main",
  "scene": "Aviation / Contracts",
  "eye_distance": "near",
  "target_pos": "noun",
  "stem": "Paragraph 3 states that any {BLANK} of the maintenance window must be communicated in writing.",
  "blank_index": 0,
  "options": [
    { "label": "A", "text": "modify",       "pos": "verb",  "is_correct": false },
    { "label": "B", "text": "modifies",     "pos": "verb",  "is_correct": false },
    { "label": "C", "text": "modification", "pos": "noun",  "is_correct": true  },
    { "label": "D", "text": "modifying",    "pos": "verb",  "is_correct": false }
  ],
  "answer": "C",
  "eye_cue": {
    "type": "near-left",
    "signal_word": "any",
    "signal_pos": "determiner",
    "description": "限定詞 any + ______ → 名詞位"
  },
  "solution_steps": [
    {
      "step": 1,
      "text": "看選項語尾：-ify（動詞）/ -ifies（動詞三單現）/ -ification（名詞）/ -ifying（動名詞）→ 這題考名詞 vs 動詞",
      "highlight_pos": null
    },
    {
      "step": 2,
      "text": "空格前：any → 限定詞，後面接名詞",
      "highlight_word": "any",
      "highlight_pos": "noun"
    },
    {
      "step": 3,
      "text": "語尾確認：-ation = 名詞語尾 → 鎖定 C",
      "highlight_word": "modification",
      "highlight_pos": "noun"
    },
    {
      "step": 4,
      "text": "刪除其他：modify / modifies / modifying 全是動詞形態，不能接在限定詞後",
      "highlight_pos": "error"
    }
  ],
  "hint": "位置信號：any + ______ → 限定詞後面接什麼詞性？",
  "rule_box": {
    "type": "ok",
    "text": "限定詞（a / an / the / this / our / any / some）+ ______ → 後面填名詞。語尾 -tion 永遠是名詞。"
  },
  "error_trap": "看到 modify 語意通順就選了，跳過了位置判斷",
  "wrong_thought_steps": [
    "看到「修改窗口」語意通順 → 選了 modify（動詞）",
    "跳過了 any 這個近距題眼信號 → 語意先行，位置忽略"
  ]
}
```

### 3.4 監控題（Monitor Question）
```json
{
  "q_id": "pos-d1-monitor-1",
  "type": "monitor",
  "weakness_tag": "number-of-sva",
  "scene": "[監控] SVA — number of",
  "stem": "The number of maintenance requests {BLANK} dropped since the new system was installed.",
  "options": [
    { "label": "A", "text": "have", "pos": "verb", "is_correct": false },
    { "label": "B", "text": "has",  "pos": "verb", "is_correct": true  },
    { "label": "C", "text": "were", "pos": "verb", "is_correct": false },
    { "label": "D", "text": "are",  "pos": "verb", "is_correct": false }
  ],
  "answer": "B",
  "solution_steps": [ ... ],
  "rule_box": {
    "type": "warn",
    "text": "The number of + 複數名詞 → 動詞跟 number（單數）→ has / is / was"
  }
}
```

---

## 4. 答題介面規格（Quiz Engine）

### 4.1 介面元素
| 元素 | 規格 |
|------|------|
| 進度列 | 頂部，顯示「Q X / Y」+ 綠色填充 bar |
| 題號點 | 圓形，答題前灰色，答題後綠色，超時橙色，當前題有綠色框線 |
| 計時 bar | 題目上方 4px 高，綠色倒數，剩 ≤ 7 秒變紅色 |
| 計時數字 | 右上角，待開始顯示「—」，開始後顯示剩餘秒數 |
| 題目元資料 | 場景 + 題號（不顯示詞性標籤） |
| 題幹 | 15px，行高 1.9，空格用底線表示 |
| 選項 | 2×2 Grid，每格 padding 10px 14px |
| 思路提示 | 題目下方斜體灰字（💡 開頭） |
| 導航按鈕 | Prev / Next，開始前 disabled |
| 提交按鈕 | 全部作答後由灰色變綠色，按下觸發報告 |

### 4.2 開始按鈕規格
```
- 頁面載入後：題目可見，選項可見但 disabled
- 覆蓋層（Overlay）：白色半透明，中央顯示「開始作答」按鈕
- 按下「開始作答」後：
  1. 移除覆蓋層
  2. 啟動第一題計時器
  3. 啟用選項點擊
  4. 啟用 Prev / Next 導航
  5. 顯示 Submit 按鈕（灰色）
```

### 4.3 計時器邏輯
```javascript
// 每題獨立計時，切換題目時暫停並記憶剩餘時間
// 已作答的題目切換回去：顯示當時剩餘時間，不繼續倒數
// 超時：選項全部 disabled，標記 TIMEOUT，0.7 秒後自動跳下一題
// 時間限制：依節次類型
//   - 慢速精解節：25 秒/題
//   - 標準練習節：20 秒/題
//   - 限時強化節：15 秒/題
//   - 週測：15 秒/題

const TIMER_LIMITS = {
  'slow':     25,
  'standard': 20,
  'intensive': 15,
  'weekly':   15
};
```

### 4.4 作答狀態機
```
未開始 → [按開始] → 作答中
作答中 → [選選項] → 已作答（可修改）
作答中 → [計時歸零] → 超時（不可修改）
已作答 → [選其他選項] → 已作答（更新答案，更新 elapsed time）
所有題目（已作答或超時）→ Submit 按鈕啟用
[按 Submit] → 生成報告
```

### 4.5 Submit 後自動送出格式
```
// 格式：Q1:A/8s, Q2:TIMEOUT/20s, Q3:B/12s...
// elapsed 是從開始計時到作答的秒數
// TIMEOUT 時 elapsed = 題目時間上限

const formatResult = (answers, timeouts, elapsed, limit) =>
  answers.map((a, i) =>
    `Q${i+1}:${timeouts[i] ? 'TIMEOUT' : a}/${elapsed[i] || limit}s`
  ).join(', ');
```

---

## 5. 診斷報告規格（Report Engine）

### 5.1 報告結構
```
1. 統計摘要（Metrics Bar）
   - Overall 正確率
   - 主題題正確率（不含監控題）
   - 監控題正確率（獨立計算）
   - 平均作答時間

2. 分類 Bar Chart
   - 依題眼距離（近距 / 中距 / 遠距）
   - 依詞性（名詞 / 動詞 / 形容詞 / 副詞）
   - 依弱點標籤（number-of / active-passive / linking-verb...）

3. 題號地圖（Question Map）
   - 圓形小點，綠色=正確，紅色=錯誤，橙色=超時

4. 亮點（Good Box）
   - 列出答對且速度快（≤ 1/2 時間上限）的題目
   - 說明哪個反射已建立

5. 全題彩色詳解（All Questions）
   - 題幹（正確答案用顏色 + 底線高亮，錯誤選擇用刪除線）
   - 四個選項（正確=綠框，錯選=紅框刪除線，其他=灰色）+ 詞性 Pill
   - 正確做題思路（步驟列，綠色序號）
   - 錯誤思路（答錯時才顯示，紅色序號）
   - Rule Box（綠色=規則確認，橙色=警告）
   - 速度備注

6. 掌握度評分（1–10）
   - 主題題正確率 × 0.7 + 速度分數 × 0.3
   - 速度分數：平均用時 ≤ 50% 時間上限 → 10分，≤ 70% → 8分，≤ 90% → 6分，> 90% → 4分

7. 下節建議
   - 正確率 ≥ 85%：進入下一節
   - 正確率 70–84%：可進入下一節，下節加入本節監控題
   - 正確率 < 70%：建議補課節
```

### 5.2 選項顯示規則
```
答對題目：
  - 正確選項：綠框 + 詞性 Pill + ✓
  - 其他選項：灰色 + 詞性 Pill

答錯題目：
  - 正確選項：綠框 + 詞性 Pill + ✓
  - 錯選選項：紅框 + 刪除線 + 詞性 Pill + ← 你選了這個
  - 其他選項：灰色 + 詞性 Pill

超時題目：
  - 正確選項：綠框 + 詞性 Pill + ✓
  - 其他選項：灰色 + 詞性 Pill
  - 標注：TIMEOUT
```

### 5.3 掌握度計算
```javascript
function calcMastery(results, limit) {
  const mainQs = results.filter(r => r.type === 'main');
  const accuracy = mainQs.filter(r => r.correct).length / mainQs.length;

  const avgTime = mainQs.reduce((s, r) => s + r.elapsed, 0) / mainQs.length;
  const timeRatio = avgTime / limit;
  const speedScore = timeRatio <= 0.5 ? 10
                   : timeRatio <= 0.7 ? 8
                   : timeRatio <= 0.9 ? 6 : 4;

  const mastery = Math.round(accuracy * 10 * 0.7 + speedScore * 0.3);
  return Math.min(10, Math.max(1, mastery));
}
```

---

## 6. 進度追蹤系統（localStorage Schema）

### 6.1 儲存結構
```javascript
// Key: 'toeic_progress'
{
  "student": {
    "name": "Joseph",
    "target_score": 750,
    "current_module": "pos-booster",
    "current_day": 4,
    "total_lessons_done": 23
  },
  "modules": {
    "week1": {
      "status": "completed",
      "mastery": 9.5,
      "completed_date": "2025-01-01"
    },
    "week2": {
      "status": "paused",
      "days_done": 5,
      "mastery_avg": 6.2
    },
    "pos-booster": {
      "status": "in-progress",
      "days_done": 4,
      "day_results": {
        "pos-d1": { "accuracy": 0.67, "mastery": 6, "avg_time": 13 },
        "pos-d2": { "accuracy": 0.83, "mastery": 8, "avg_time": 8.7 },
        "pos-d3": { "accuracy": 0.50, "mastery": 5, "avg_time": 13.5 },
        "pos-d4": { "accuracy": 0.67, "mastery": 7, "avg_time": 9.2 }
      }
    }
  },
  "weaknesses": [
    {
      "tag": "linking-verb",
      "label": "連綴動詞後接形容詞",
      "status": "sealed",
      "sealed_date": "pos-d4",
      "occurrences": ["pos-d2-q3", "pos-d3-q5"]
    },
    {
      "tag": "number-of-sva",
      "label": "the/a number of 主動詞一致",
      "status": "monitoring",
      "occurrences": ["w1-d6-q24", "w2-d4-q4", "w2-d4-q9", "w2-d5-q4", "w2-d5-q9", "pos-d1-monitor-1"]
    },
    {
      "tag": "active-passive",
      "label": "主詞後有受詞誤選被動",
      "status": "monitoring",
      "occurrences": ["w1-d6-q24", "w1-d7-q19"]
    }
  ],
  "session_history": [
    {
      "lesson_id": "pos-d4",
      "date": "2025-05-10",
      "answers": ["TIMEOUT", "C", "B", "C", "D", "A"],
      "elapsed": [25, 8, 10, 8, 2, 2],
      "accuracy": 0.67,
      "mastery": 7
    }
  ]
}
```

### 6.2 弱點狀態機
```
monitoring → [連續 3 節全對] → sealed
monitoring → [本節再犯]      → escalated（升級優先度）
escalated  → [連續 2 節全對] → monitoring
sealed     → [重新出現]      → monitoring
```

---

## 7. 教學卡片規格（Concept Cards）

### 7.1 卡片類型
| 類型 | 用途 | 樣式 |
|------|------|------|
| Formula Box | 正確規則公式 | 綠色左邊框 |
| Warning Box | 陷阱警告 | 橙色左邊框 |
| Error Box | 錯誤示範 | 紅色左邊框，文字有刪除線 |
| Comparison Grid | 正確 vs 錯誤對比 | 2 欄，左綠右紅 |
| Signal Table | 位置信號速查表 | 表格，4 行對應 4 詞性 |
| Exception Box | 例外清單 | 黃色背景，橙色標題 |
| Step Flow | 步驟流程 | 綠色序號圓形 + 文字 |

### 7.2 Formula Box
```html
<div class="formula-box noun">
  <!-- 根據詞性換顏色：noun / verb / adj / adv -->
  [公式內容，支援 HTML，可內嵌 pos-pill 和 blank-word]
</div>
```

```css
.formula-box {
  padding: 0.625rem 0.875rem;
  font-size: 13px;
  line-height: 1.8;
  border-left: 3px solid;
  border-radius: 0;
  margin-bottom: 0.625rem;
}
.formula-box.noun { background: var(--pos-noun-bg); border-color: var(--pos-noun-border); color: #0A3320; }
.formula-box.verb { background: var(--pos-verb-bg); border-color: var(--pos-verb-border); color: #082B52; }
.formula-box.adj  { background: var(--pos-adj-bg);  border-color: var(--pos-adj-border);  color: #3B0F5B; }
.formula-box.adv  { background: var(--pos-adv-bg);  border-color: var(--pos-adv-border);  color: #3D1A00; }
.formula-box.warn { background: #FAEEDA; border-color: #BA7517; color: #412402; }
.formula-box.error{ background: var(--pos-error-bg); border-color: var(--pos-error-border); color: #791F1F; }
```

---

## 8. 驗證規則（Validation Rules）

### 8.1 題庫驗證
```javascript
function validateQuestion(q) {
  const errors = [];

  // 必填欄位
  if (!q.q_id)    errors.push('缺少 q_id');
  if (!q.stem)    errors.push('缺少題幹 stem');
  if (!q.answer)  errors.push('缺少答案 answer');

  // 選項驗證
  if (!q.options || q.options.length !== 4)
    errors.push('選項必須恰好 4 個');

  const labels = q.options.map(o => o.label);
  if (!['A','B','C','D'].every(l => labels.includes(l)))
    errors.push('選項標籤必須是 A B C D');

  const correctOpts = q.options.filter(o => o.is_correct);
  if (correctOpts.length !== 1)
    errors.push('必須恰好有 1 個正確選項');

  if (correctOpts[0]?.label !== q.answer)
    errors.push('answer 與 is_correct 不一致');

  // 答案分佈驗證（整節）— 見 8.2

  // 詞性標記驗證
  const validPos = ['noun','verb','adj','adv'];
  q.options.forEach(o => {
    if (!validPos.includes(o.pos))
      errors.push(`選項 ${o.label} 的 pos 無效：${o.pos}`);
  });

  // 步驟驗證
  if (!q.solution_steps || q.solution_steps.length < 2)
    errors.push('solution_steps 至少需要 2 步');

  return errors;
}
```

### 8.2 答案分佈驗證（整節）
```javascript
function validateAnswerDistribution(questions) {
  const dist = { A: 0, B: 0, C: 0, D: 0 };
  questions.forEach(q => dist[q.answer]++);

  const total = questions.length;
  const errors = [];

  // 規則：每個選項出現次數不超過總題數的 40%
  Object.entries(dist).forEach(([label, count]) => {
    if (count / total > 0.4)
      errors.push(`答案 ${label} 出現 ${count}/${total} 次，超過 40% 上限`);
  });

  // 規則：不能出現連續 3 題以上相同答案
  const answers = questions.map(q => q.answer);
  for (let i = 0; i < answers.length - 2; i++) {
    if (answers[i] === answers[i+1] && answers[i+1] === answers[i+2])
      errors.push(`Q${i+1}–Q${i+3} 連續三題答案相同（${answers[i]}）`);
  }

  // 規則：不能出現 A/B/A/B 或 C/D/C/D 交替規律
  const isAlternating = answers.every((a, i) =>
    i < 2 || a !== answers[i-2] || answers[i-1] !== answers[i-3]
  );
  // （簡化版，實際可用更嚴格的規律檢測）

  return errors;
}
```

### 8.3 干擾選項品質驗證
```javascript
function validateDistractors(q) {
  const errors = [];
  const wrongOpts = q.options.filter(o => !o.is_correct);

  // 規則：干擾選項必須包含與正確答案同詞根但不同詞性的選項
  const correctPos = q.options.find(o => o.is_correct).pos;
  const hasRelatedDistractor = wrongOpts.some(o => o.pos !== correctPos);
  if (!hasRelatedDistractor)
    errors.push('缺少與正確答案不同詞性的干擾選項');

  // 規則：不能有兩個完全相同詞性的干擾選項（太容易排除）
  const wrongPos = wrongOpts.map(o => o.pos);
  const uniqueWrongPos = new Set(wrongPos);
  // 允許最多 2 個相同詞性干擾（如動詞原形 + 動詞過去式）

  return errors;
}
```

### 8.4 時間合理性驗證
```javascript
function validateTimeLimits(lesson) {
  const errors = [];
  const qCount = lesson.questions.length;

  // 規則：每節題目數 × 時間上限 不超過 10 分鐘
  const totalTime = qCount * lesson.time_limit_seconds;
  if (totalTime > 600)
    errors.push(`總答題時間 ${totalTime}s 超過 10 分鐘上限`);

  // 規則：慢速精解節最多 6 題，標準節最多 12 題，強化節最多 20 題
  const maxQ = { slow: 6, standard: 12, intensive: 20, weekly: 20 };
  if (qCount > (maxQ[lesson.quiz_type] || 20))
    errors.push(`題目數 ${qCount} 超過 ${lesson.quiz_type} 節次上限`);

  return errors;
}
```

---

## 9. 介面導航流程

### 9.1 頁面流程
```
index.html（課程選單）
  ├── 顯示當前進度條（Stage / Week / Day）
  ├── 顯示本節主攻主題
  ├── 顯示殘留弱點監控狀態
  └── [開始本節] → lesson.html

lesson.html（教學卡片）
  ├── 顯示 Debug Rule
  ├── 顯示核心公式 / 規則 / 例句
  ├── [完成教學，開始練習] → quiz.html
  └── [跳過教學] → quiz.html（警告提示）

quiz.html（答題介面）
  ├── 覆蓋層（開始按鈕）
  ├── [按開始] → 啟動計時器
  ├── 作答中...
  ├── [全部作答後 Submit] → report.html
  └── [中途離開] → 儲存進度，返回 index.html

report.html（診斷報告）
  ├── 統計摘要
  ├── 全題彩色詳解
  ├── 掌握度評分
  ├── [下一節] → index.html（更新進度）
  └── [重做本節] → quiz.html（清空本節記錄）

progress.html（總覽）
  ├── Stage 1 時間軸
  ├── 各模組掌握度
  ├── 弱點追蹤清單
  └── 歷史作答記錄
```

### 9.2 進度條顯示規格
```
位置：所有頁面頂部
格式：Stage X / Week Y / Day Z  |  剩餘 NNN 節  |  本週主攻：[模組名]
樣式：小字，灰色，單行
```

---

## 10. 離線支援（PWA）

### 10.1 Service Worker 快取策略
```javascript
// sw.js
const CACHE_NAME = 'toeic-app-v1';
const STATIC_ASSETS = [
  '/', '/index.html', '/lesson.html',
  '/quiz.html', '/report.html', '/progress.html',
  '/css/base.css', '/css/lesson.css', '/css/quiz.css', '/css/report.css',
  '/js/app.js', '/js/quiz-engine.js', '/js/scorer.js',
  '/js/report.js', '/js/storage.js',
  '/data/index.json'
];

// 安裝時快取所有靜態資源
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
  );
});

// 請求時優先使用快取（離線優先策略）
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request)
      .then(cached => cached || fetch(e.request))
  );
});
```

### 10.2 PWA Manifest
```json
{
  "name": "TOEIC 570→750 學習系統",
  "short_name": "TOEIC App",
  "start_url": "/index.html",
  "display": "standalone",
  "background_color": "#FFFFFF",
  "theme_color": "#1D9E75",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

---

## 11. 實作優先順序

### Phase 1（MVP，可離線使用）
1. CSS 變數系統 + 詞性顏色元件
2. Quiz Engine（計時器 + 開始按鈕 + 選項互動）
3. 靜態報告（預設詳解，非個人化）
4. localStorage 基本進度儲存
5. PoS Booster Day 1–14 題庫（JSON）

### Phase 2（完整學習體驗）
6. 教學卡片系統（Concept Cards）
7. 動態報告（根據作答生成詳解）
8. 弱點追蹤系統
9. 進度總覽頁面
10. PWA 安裝支援

### Phase 3（進階功能）
11. 題庫管理介面（新增 / 編輯題目）
12. 驗證工具（執行 Section 8 所有規則）
13. 匯出報告（PDF）
14. 多裝置同步（可選，需後端）

---

## 12. 開發備注

### 12.1 禁止事項（來自 Claude 教學設計規則）
- ❌ 答題期間不顯示正確/錯誤（Submit 後才顯示）
- ❌ 題目不顯示詞性標籤（如「形容詞題」）
- ❌ 答案不能出現規律交替（A/B/A/B）
- ❌ 監控題正確率不計入主題掌握度
- ❌ 教學內容不能跳過直接做題

### 12.2 必須實作的功能
- ✅ 開始按鈕覆蓋層（計時器不自動啟動）
- ✅ 超時自動跳題（0.7 秒延遲）
- ✅ 已作答題目可修改答案（計時器不重置）
- ✅ Submit 按鈕只在全部作答後啟用
- ✅ 全題彩色詳解（答對題也要出現）
- ✅ 正確思路步驟 + 錯誤思路（答錯時）

### 12.3 題庫情境規則
- 測試節使用非熟悉行業情境（酒店 / 銀行 / 航空 / 醫院 / 零售）
- 教學節可使用 FSE / 半導體情境
- 監控題場景標注「[監控]」前綴

---

*文件版本：1.0 | 生成日期：2025-05-10*  
*基於 Claude TOEIC 570→750 教學系統 Stage 1 Week 1–2 + PoS Booster Day 1–4 的實際教學記錄*

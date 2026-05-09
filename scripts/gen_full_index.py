# gen_full_index.py
# Generates data/index.json with all 807 lessons (800 main + 7 PoS Booster)
import json, zipfile, xml.etree.ElementTree as ET, re, sys, os

sys.stdout.reconfigure(encoding='utf-8')
os.chdir(r'c:/Users/Keith/toeic-app')
BDIR = 'Background'

def parse_sheet(fpath, sheet):
    with zipfile.ZipFile(fpath) as z:
        raw = z.read(f'xl/worksheets/{sheet}.xml').decode('utf-8')
    raw = re.sub(r'xmlns[^=]*="[^"]*"', '', raw)
    root = ET.fromstring(raw)
    rows = []
    for row in root.findall('.//row'):
        cells = []
        for c in row.findall('c'):
            if c.get('t') == 'inlineStr':
                t = c.find('.//t')
                cells.append((t.text or '') if t is not None else '')
            else:
                v = c.find('v')
                cells.append((v.text or '') if v is not None else '')
        rows.append(cells)
    return rows

CAT = {
    'Grammar': 'grammar', 'Phrase': 'phrase', 'Listening': 'listening',
    'Review': 'review', 'Test': 'test', 'Reading': 'reading', 'Flex': 'review'
}

STAGE_MODULE = {
    'Stage 1':     'weakness-hunter',
    'Stage 2':     'stage2',
    'Stage 3':     'stage3',
    'Buffer 彈性週': 'buffer',
}

EMOJI_RE = re.compile(
    r'^[\U0001F000-\U0001FFFF\u2600-\u26FF\u2700-\u27BF'
    r'\u2B00-\u2BFF\u25A0-\u25FF\u23E9-\u23FF\u2B50\u26A0]+\s*'
)

def clean(s):
    return EMOJI_RE.sub('', s or '').strip()

FILES = {
    'wh-w1-d1': './weakness-hunter/wh-w1-d1.json',
    'wh-w1-d2': './weakness-hunter/wh-w1-d2.json',
    'wh-w1-d3': './weakness-hunter/wh-w1-d3.json',
    **{f'pos-d{i}': f'./pos-booster/pos-d{i}.json' for i in range(1, 8)}
}

# Parse source spreadsheets
m_rows = parse_sheet(f'{BDIR}/TOEIC_570_to_750_V2_REVISED.xlsx', 'sheet2')
p_rows = parse_sheet(f'{BDIR}/TOEIC_PoS_Booster_7_14Days.xlsx', 'sheet2')

all800 = m_rows[1:]      # 800 lessons (skip header at index 0)
pos7   = p_rows[2:9]     # 7 lessons  (skip 2 header rows)

def mkl(lid, mid, wk, day, seq, cat_raw, topic, sub, act):
    lt  = CAT.get(cat_raw, 'grammar')
    tc  = 'grammar' if lt in ('grammar', 'review', 'test') else lt
    title = clean(topic) or f'{mid} Day {day}'
    desc  = (sub or '').strip()
    has_concept = '觀念' in (act or '')
    tl = 25 if has_concept else 20
    qt = ('slow'    if has_concept else
          'weekly'  if any(x in title for x in ['週測', '模考', '期末', 'Mock']) else
          'standard')
    return {
        'lesson_id':          lid,
        'module_id':          mid,
        'week':               wk,
        'day':                day,
        'sequence':           seq,
        'lesson_type':        lt,
        'target_component':   tc,
        'title':              title,
        'description':        desc,
        'quiz_type':          qt,
        'time_limit_seconds': tl,
        'file':               FILES.get(lid)
    }

lessons = []
seq = 1
pos_inserted = False   # insert PoS Booster after W2

for row in all800:
    try:
        wk  = int(float(row[1]))
        day = int(float(row[3]))
    except Exception:
        continue
    stage = str(row[2] or '')
    cat   = row[4] if len(row) > 4 else ''
    topic = row[5] if len(row) > 5 else ''
    sub   = row[6] if len(row) > 6 else ''
    act   = row[7] if len(row) > 7 else ''
    mid   = STAGE_MODULE.get(stage, 'weakness-hunter')

    # Insert PoS Booster between W2 and W3 (once)
    if not pos_inserted and wk == 3 and mid == 'weakness-hunter':
        for i, prow in enumerate(pos7):
            pday  = i + 1
            pcat  = prow[2] if len(prow) > 2 else 'Grammar'
            ptop  = prow[3] if len(prow) > 3 else ''
            psub  = prow[4] if len(prow) > 4 else ''
            pact  = prow[6] if len(prow) > 6 else ''
            plid  = f'pos-d{pday}'
            lessons.append(mkl(plid, 'pos-booster', 3, pday, seq, pcat, ptop, psub, pact))
            seq += 1
        pos_inserted = True

    # Special IDs for Stage-1 W1 D1-3 (have actual data files)
    if mid == 'weakness-hunter' and wk == 1 and day <= 3:
        lid = f'wh-w{wk}-d{day}'
    else:
        lid = f'w{wk}-d{day}'

    lessons.append(mkl(lid, mid, wk, day, seq, cat, topic, sub, act))
    seq += 1

# ── Week titles (extracted from xlsx first-topic per week) ──────────────────
WEEK_TITLES = {
    1:  'Mandative Subjunctive 急救週',
    2:  '倍數比較 Multiplier Comparisons',
    3:  'Gerunds 動名詞 Part 1 — 觸發動詞',
    4:  'Gerunds 動名詞 Part 2 — 介系詞陷阱',
    5:  'Subject-Verb Agreement 複雜型 Part 1',
    6:  'Subject-Verb Agreement 複雜型 Part 2',
    7:  'SVC / SVOO / SVOC + Causative Verbs',
    8:  'Noun Clauses 名詞子句',
    9:  'Perfect Timeline Part 1 — 現在 & 過去完成',
    10: 'Perfect Timeline Part 2 — 未來完成',
    11: 'Participles + 不可數名詞',
    12: 'Modal Perfects + Mixed Conditionals',
    13: 'Stage 1 總複習 & 診斷模考',
    14: 'Part 7 單篇閱讀 速度訓練',
    15: 'Part 7 單篇閱讀 精準度',
    16: 'Part 7 雙篇閱讀 基礎',
    17: 'Part 7 雙篇閱讀 進階',
    18: 'Part 7 三篇閱讀 基礎',
    19: 'Part 7 三篇閱讀 進階',
    20: 'Part 5 進階 — Mandative 實戰化',
    21: 'Part 5 進階 — 倒裝與強調句',
    22: 'Part 6 段落填空 — 時態邏輯',
    23: 'Part 6 段落填空 — 連接詞',
    24: 'Part 3 對話理解 — 職場對話',
    25: 'Part 3 對話理解 — 進階',
    26: 'Part 4 獨白 — 廣播通告',
    27: 'Part 4 獨白 — 演講報告',
    28: 'Mock 1 — Listening',
    29: 'Mock 1 深度分析',
    30: 'Mock 2 — Listening',
    31: 'Mock 3',
    32: 'Mock 3 錯題獵殺 + Part 5 進階',
    33: 'Mock 4',
    34: 'Mock 4 獵殺 + Listening 強化',
    35: 'Mock 5',
    36: 'Mock 5 獵殺 + 綜合複習',
    37: 'Mock 6',
    38: 'Mock 6 獵殺 + 跨題型反射',
    39: 'Mock 7',
    40: 'Mock 7 獵殺 + Part 5 難題庫',
    41: 'Mock 8',
    42: 'Mock 8 獵殺 + Phrase 深記',
    43: 'Mock 9',
    44: 'Mock 9 獵殺 + False Friends',
    45: 'Mock 10',
    46: 'Mock 10 獵殺 + 難題挑戰',
    47: 'Mock 11',
    48: 'Mock 11 獵殺 + 弱點清掃',
    49: 'Mock 12',
    50: 'Mock 12 獵殺 + 穩定輸出',
    51: 'Mock 13',
    52: 'Final Mock 14',
    53: 'Buffer 彈性補課週',
}

MILESTONES = {
    1:  'Mandative 0% → 80%+，預估 +5–10 分',
    2:  '倍數比較全對，預估 +5 分',
    4:  'Gerunds ≥ 75%，預估 +10–15 分',
    6:  'SVA 複雜型 ≥ 80%，預估 +15–20 分',
    8:  'SVC/SVOC ≥ 75%，預估 +15–20 分',
    10: 'Perfect 時態 ≥ 75%，預估 +10–15 分',
    12: 'Conditionals ≥ 80%，預估 +10 分',
    13: '首次模考 570 → 610–640',
    21: 'Stage 2 中期：目標 690',
    30: 'Stage 2 結訓',
    52: '最終衝刺：目標 750',
}

STAGE_OF_WEEK = {}
for row in all800:
    try:
        wk = int(float(row[1]))
    except Exception:
        continue
    if wk not in STAGE_OF_WEEK:
        STAGE_OF_WEEK[wk] = str(row[2] or '')

index_data = {
    "student": {
        "name": "Joseph",
        "baseline_score": {"total": 570, "listening": 315, "reading": 255},
        "target_score": 750,
        "target_split": {"listening": 380, "reading": 370},
        "current_module": "weakness-hunter",
        "current_week": 1,
        "current_day": 1,
        "sessions_per_week": 15
    },
    "score_milestones": [
        {"label": "Stage 1 結訓",  "week": 13, "target_total": 640,
         "target_listening": 340, "target_reading": 300},
        {"label": "Stage 2 中期",  "week": 21, "target_total": 690,
         "target_listening": 360, "target_reading": 330},
        {"label": "Stage 2 結訓",  "week": 30, "target_total": 710,
         "target_listening": 370, "target_reading": 340},
        {"label": "Target 750",    "week": 52, "target_total": 750,
         "target_listening": 380, "target_reading": 370}
    ],
    "component_targets": {
        "grammar":   {"label": "Grammar Mastery", "baseline": "文法標靶測試 46.9%", "target": 85},
        "phrase":    {"label": "Phrase Mastery",  "baseline": "88/411 mastered",    "target": 70},
        "listening": {"label": "Listening Drill", "baseline": "L315",               "target": 380},
        "reading":   {"label": "Reading Speed",   "baseline": "R255",               "target": 370}
    },
    "modules": [
        {
            "module_id":          "weakness-hunter",
            "title":              "Stage 1 弱點獵殺主線 (W1–W13)",
            "description":        "以實測 570（L315/R255）為基準，13 週系統化攻克 Part 5/6 高 CP 文法與高頻語塊。",
            "total_weeks":        13,
            "sessions_per_week":  15,
            "target_accuracy":    85,
            "primary_components": ["grammar", "phrase", "listening", "reading"]
        },
        {
            "module_id":         "pos-booster",
            "title":             "詞性打底 Part of Speech Booster",
            "description":       "插入 W2 結束後的 7 天精簡模組，讓詞性辨識成為秒辨反射，解鎖 Part 5 最高頻題型。",
            "total_days":        7,
            "target_accuracy":   85,
            "insert_after_week": 2
        },
        {
            "module_id":          "stage2",
            "title":              "Stage 2 速度與準確度 (W14–W30)",
            "description":        "閱讀速度 + 聽力篇章強化，Part 5/6/7 限時訓練 + Part 3/4 全覆蓋，目標 710 分。",
            "total_weeks":        17,
            "sessions_per_week":  15,
            "target_accuracy":    82,
            "primary_components": ["reading", "listening", "grammar", "phrase"]
        },
        {
            "module_id":          "stage3",
            "title":              "Stage 3 實戰衝刺 (W31–W52)",
            "description":        "12 次全真模考循環 + 弱點獵殺，衝刺 750 目標分數。",
            "total_weeks":        22,
            "sessions_per_week":  15,
            "target_accuracy":    85,
            "primary_components": ["reading", "listening", "grammar", "phrase"]
        },
        {
            "module_id":          "buffer",
            "title":              "Buffer 彈性補課週 (W53)",
            "description":        "彈性補課、心理建設與考前最終調整，20 節預留。",
            "total_weeks":        1,
            "sessions_per_week":  20,
            "target_accuracy":    80,
            "primary_components": ["grammar", "listening"]
        }
    ],
    "weekly_plan": [
        {
            "week":          w,
            "title":         WEEK_TITLES.get(w, f'Week {w}'),
            "session_count": 15 if w < 53 else 20,
            "milestone":     MILESTONES.get(w, ''),
            "stage":         STAGE_OF_WEEK.get(w, '')
        }
        for w in range(1, 54)
    ],
    "lessons": lessons
}

out = 'data/index.json'
with open(out, 'w', encoding='utf-8') as f:
    json.dump(index_data, f, ensure_ascii=False, indent=2)

print(f'Written {out}')
print(f'  Total lessons : {len(lessons)}  (last seq={seq - 1})')
by_mod = {}
for l in lessons:
    by_mod.setdefault(l['module_id'], []).append(l)
for mid, ls in by_mod.items():
    print(f'  {mid:<20}: {len(ls):3d} lessons  (seq {ls[0]["sequence"]}-{ls[-1]["sequence"]})')
print()
print('Sample lessons:')
samples = [lessons[0], lessons[14], lessons[30], lessons[37], lessons[202], lessons[457], lessons[-1]]
for l in samples:
    print(f'  [{l["sequence"]:3d}] {l["lesson_id"]:<15}  {l["title"][:55]}')
    if l['description']:
        print(f'         desc: {l["description"][:60]}')

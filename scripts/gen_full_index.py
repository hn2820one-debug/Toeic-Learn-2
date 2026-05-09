# gen_full_index.py
# Generates data/index.json with all 202 Stage-1 lessons from xlsx source files
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
    'Review': 'review', 'Test': 'test', 'Reading': 'reading'
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

stage1 = m_rows[1:196]   # 195 lessons (skip header at index 0)
pos7   = p_rows[2:9]     # 7 lessons  (skip 2 header rows)

def mkl(lid, mid, wk, day, seq, cat_raw, topic, sub, act):
    lt  = CAT.get(cat_raw, 'grammar')
    tc  = 'grammar' if lt in ('grammar', 'review', 'test') else lt
    title = clean(topic) or f'{mid} Day {day}'
    desc  = (sub or '').strip()
    has_concept = '觀念' in (act or '')
    tl = 25 if has_concept else 20
    qt = ('slow'    if has_concept else
          'weekly'  if any(x in title for x in ['週測', '模考', '期末']) else
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

# ── W1 + W2 (Stage1 rows 0-29) ─────────────────────────────────────────────
for row in stage1[:30]:
    try:
        wk, day = int(float(row[1])), int(float(row[3]))
    except Exception:
        continue
    cat   = row[4] if len(row) > 4 else ''
    topic = row[5] if len(row) > 5 else ''
    sub   = row[6] if len(row) > 6 else ''
    act   = row[7] if len(row) > 7 else ''
    lid   = f'wh-w{wk}-d{day}' if wk == 1 and day <= 3 else f'w{wk}-d{day}'
    lessons.append(mkl(lid, 'weakness-hunter', wk, day, seq, cat, topic, sub, act))
    seq += 1

# ── PoS Booster (7 days, between W2 and W3) ────────────────────────────────
for i, row in enumerate(pos7):
    day   = i + 1
    cat   = row[2] if len(row) > 2 else 'Grammar'
    topic = row[3] if len(row) > 3 else ''
    sub   = row[4] if len(row) > 4 else ''
    act   = row[6] if len(row) > 6 else ''
    lid   = f'pos-d{day}'
    lessons.append(mkl(lid, 'pos-booster', 3, day, seq, cat, topic, sub, act))
    seq += 1

# ── W3 ~ W13 (Stage1 rows 30-194) ──────────────────────────────────────────
for row in stage1[30:]:
    try:
        wk, day = int(float(row[1])), int(float(row[3]))
    except Exception:
        continue
    cat   = row[4] if len(row) > 4 else ''
    topic = row[5] if len(row) > 5 else ''
    sub   = row[6] if len(row) > 6 else ''
    act   = row[7] if len(row) > 7 else ''
    lid   = f'w{wk}-d{day}'
    lessons.append(mkl(lid, 'weakness-hunter', wk, day, seq, cat, topic, sub, act))
    seq += 1

WEEK_TITLES = {
    1:  'Mandative Subjunctive 急救週',
    2:  '倍數比較 Multiplier Comparisons',
    3:  'Gerunds 動名詞 Part 1 — 觸發動詞',
    4:  'Gerunds 動名詞 Part 2 — 介系詞陷阱',
    5:  'SVA 複雜型 Part 1 — each / either / neither',
    6:  'SVA 複雜型 Part 2 — 不可數名詞',
    7:  'SVC / SVOO / SVOC + Causative Verbs',
    8:  'Noun Clauses 名詞子句',
    9:  'Perfect Timeline Part 1 — 現在 & 過去完成',
    10: 'Perfect Timeline Part 2 — 未來完成',
    11: 'Participles + 不可數名詞',
    12: 'Modal Perfects + Mixed Conditionals',
    13: 'Stage 1 總複習 & 診斷模考',
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
}

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
        {"label": "Target",        "week": 26, "target_total": 750,
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
            "module_id":       "pos-booster",
            "title":           "詞性打底 Part of Speech Booster",
            "description":     "插入 W2 結束後的 7 天精簡模組，讓詞性辨識成為秒辨反射，解鎖 Part 5 最高頻題型。",
            "total_days":      7,
            "target_accuracy": 85,
            "insert_after_week": 2
        }
    ],
    "weekly_plan": [
        {
            "week":          w,
            "title":         WEEK_TITLES[w],
            "session_count": 15,
            "milestone":     MILESTONES.get(w, '')
        }
        for w in range(1, 14)
    ],
    "lessons": lessons
}

out = 'data/index.json'
with open(out, 'w', encoding='utf-8') as f:
    json.dump(index_data, f, ensure_ascii=False, indent=2)

print(f'Written {out}')
print(f'  Total lessons : {len(lessons)}  (last seq={seq - 1})')
wh = [l for l in lessons if l['module_id'] == 'weakness-hunter']
ps = [l for l in lessons if l['module_id'] == 'pos-booster']
print(f'  weakness-hunter: {len(wh)} lessons  (W1-W13, 195 total)')
print(f'  pos-booster    : {len(ps)} lessons  (seq {ps[0]["sequence"]}-{ps[-1]["sequence"]})')
print()
print('Sample lessons:')
for l in [lessons[0], lessons[14], lessons[30], lessons[31], lessons[37], lessons[-1]]:
    print(f'  [{l["sequence"]:3d}] {l["lesson_id"]:<15}  {l["title"][:55]}')
    if l['description']:
        print(f'         desc: {l["description"][:60]}')

# Toeic-Learn-2

Static TOEIC learning app calibrated to the latest real score baseline:

- Baseline: TOEIC 570, Listening 315, Reading 255
- Target: TOEIC 750, Listening 380, Reading 370
- Current runnable modules:
  - Week 1 weakness-hunter Mandative Subjunctive lessons
  - Week 3 seven-day Part of Speech Booster

## Run Locally

```powershell
python -m http.server 8787 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:8787/
```

## Validate Lesson Data

```powershell
node scripts/validate-data.js
```

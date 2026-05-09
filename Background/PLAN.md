# TOEIC Learn 2 Review and Implementation Plan

## Current Baseline
- Real test baseline: TOEIC 570, Listening 315, Reading 255.
- Target: TOEIC 750, target split L380 / R370.
- Core diagnosis from `Background/`: grammar accuracy is 46.9%, phrase mastery is 88/411, and the old 650-745 / 715-775 projections should be treated as potential ceiling, not current level.
- The app is a static PWA: HTML/CSS/JS, JSON-driven lessons, localStorage progress, service worker offline cache.

## Implemented Scope
- Recalibrated the app around the 570 baseline and 750 target.
- Added a 6-week weakness-hunter roadmap with component targets for Grammar, Phrase, Listening, and Reading.
- Built the missing 7-day Part of Speech Booster so Week 3 can be studied normally:
  - Day 1: noun vs verb
  - Day 2: adjective vs adverb
  - Day 3: noun phrases and modifier position
  - Day 4: mixed PoS judgment
  - Day 5: word-family collocations
  - Day 6: review and false friends
  - Day 7: weekly test with Mandative and multiplier monitoring
- Fixed core runtime issues:
  - Small quizzes no longer fail answer-distribution validation.
  - Answered questions lock immediately.
  - Repeating a lesson no longer inflates completed lesson count.
  - Weaknesses are created only from wrong or timeout answers.
  - Report and progress pages now show component dashboards.
- Improved daily-use UX:
  - Homepage now exposes one primary next-session action.
  - Lesson page uses simple `回課程 / 開始練習` controls.
  - Quiz controls use Chinese labels and show locked/remaining-question status.
  - Report page moves to the next lesson when possible.

## Review Findings
- Data quality is now the main bottleneck, not the app shell. The shell can support more lessons, but each new lesson needs controlled tags, answer distribution, and review explanations.
- The current lesson engine supports grammar/phrase/review/test well enough. Listening is represented in the roadmap but not yet implemented as real audio/script drills.
- Background evidence strongly supports this priority order: Mandative Subjunctive, multiplier comparison, Gerunds/V-ing, complex SVA, uncountable nouns, then Part 7 speed and phrase coverage.
- PWA support is acceptable for local/static use. Cache is explicit; every new JSON lesson must be added to `sw.js`.
- Security risk is low because data is local and trusted, but many render paths use `innerHTML`. Keep lesson HTML controlled or migrate to DOM builders before accepting external content.
- UX is now simpler for the current static app, but future lesson growth will need filtering/search by week and component to avoid homepage overload.

## Next Plan
1. Complete Week 1 weakness-hunter content.
   - Add Mandative Day 4-8, phrase Day 9-11, listening-script Day 12-13, review Day 14, weekly test Day 15.
   - Acceptance: Week 1 has 15 runnable lessons and Mandative weekly test target is >=80%.

2. Build Week 2 multiplier comparison.
   - Add 8 grammar lessons for `twice/half/three times as...as`, `as...as`, and wrong-order traps.
   - Add finance/notice phrase lessons and Part 2 drill placeholders.
   - Acceptance: multiplier subtest target is >=90%.

3. Add a validation script.
   - Status: implemented as `scripts/validate-data.js`.
   - Keep extending it when new lesson types are added.
   - Acceptance: one command validates every JSON lesson before commit.

4. Add real listening support.
   - Decide between text-script drills first or audio-file drills.
   - Minimum viable version: timed script reveal, answer prediction, distractor tagging, and report metrics under `Listening Drill`.

5. Reduce `innerHTML` surface.
   - Keep concept-card rich HTML as trusted content.
   - Move question/options/progress/history rendering toward DOM construction or escaping helpers.

6. Add lesson filtering when Week 1 and Week 2 are complete.
   - Add week tabs and component filters.
   - Acceptance: user sees only the next useful set by default, while completed lessons remain accessible for review.

## GitHub Upload Notes
- Repository target: `https://github.com/hn2820one-debug/Toeic-Learn-2.git`.
- Local repo should include the static app, JSON lesson data, and background analysis files.
- If push fails, the likely blocker is local GitHub authentication rather than project state.

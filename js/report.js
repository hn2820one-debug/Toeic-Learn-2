(function () {
  function ratio(n) {
    return `${Math.round(n * 100)}%`;
  }

  function mapStatus(r) {
    if (r.timeout) return "timeout";
    return r.correct ? "correct" : "wrong";
  }

  function renderMetrics(payload) {
    const all = payload.results;
    const main = all.filter((r) => r.type === "main");
    const monitor = all.filter((r) => r.type === "monitor");

    const overall = all.filter((r) => r.correct).length / all.length;
    const mainAcc = main.filter((r) => r.correct).length / (main.length || 1);
    const monitorAcc = monitor.filter((r) => r.correct).length / (monitor.length || 1);
    const avg = main.reduce((s, r) => s + r.elapsed, 0) / (main.length || 1);

    document.getElementById("metrics").innerHTML = `
      <div class="metric"><div class="label">Overall</div><div class="value">${ratio(overall)}</div></div>
      <div class="metric"><div class="label">主題題正確率</div><div class="value">${ratio(mainAcc)}</div></div>
      <div class="metric"><div class="label">監控題正確率</div><div class="value">${ratio(monitorAcc)}</div></div>
      <div class="metric"><div class="label">平均作答時間</div><div class="value">${avg.toFixed(1)}s</div></div>
    `;

    return { overall, mainAcc, monitorAcc, avg };
  }

  function renderComponentDashboard(payload, progress) {
    const wrap = document.getElementById("component-dashboard");
    if (!wrap) return;

    const labels = window.AppCore.COMPONENT_LABELS;
    const moduleProgress = progress.modules[payload.module_id] || {};
    const stored = moduleProgress.component_mastery || {};
    const latest = payload.component_scores || {};
    const target = payload.target_component || "grammar";

    wrap.innerHTML = ["grammar", "phrase", "listening", "reading"].map((component) => {
      const value = latest[component] ?? stored[component] ?? 0;
      const active = component === target ? " active" : "";
      const display = value ? `${Number(value).toFixed(1)} / 10` : "待建立";
      return `
        <div class="component-card${active}">
          <div class="label">${labels[component]}</div>
          <div class="value">${display}</div>
          <div class="hint">${component === target ? "本節更新" : "累積監控"}</div>
        </div>
      `;
    }).join("");
  }

  function renderMap(payload) {
    const wrap = document.getElementById("question-map");
    wrap.innerHTML = "";
    payload.results.forEach((r, idx) => {
      const n = document.createElement("div");
      n.className = `question-node ${mapStatus(r)}`;
      n.textContent = `${idx + 1}`;
      wrap.appendChild(n);
    });
  }

  function renderGoodBox(payload) {
    const good = payload.results.filter((r) => r.correct && r.elapsed <= payload.limit / 2);
    const box = document.getElementById("good-box");

    if (!good.length) {
      box.innerHTML = "<h3>亮點</h3><p>本節尚未出現高速正確題，下一節先追求穩定度。</p>";
      return;
    }

    box.innerHTML = `<h3>亮點</h3><ul>${good.map((r) => `<li>${r.q_id}: 反射建立，${r.elapsed}s 完成定位。</li>`).join("")}</ul>`;
  }

  function decorateStem(stem, correctOption, selectedOption, timeout) {
    const correctClass = correctOption.pos;
    let rendered = stem.replace("{BLANK}", `<span class="blank-word ${correctClass}">${correctOption.text}</span>`);

    if (!timeout && selectedOption && selectedOption.label !== correctOption.label) {
      rendered += ` <span class="blank-word error">${selectedOption.text}</span>`;
    }

    return rendered;
  }

  function renderOptions(r) {
    return r.options.map((o) => {
      const isCorrect = o.label === r.answer;
      const isSelectedWrong = !r.timeout && r.selected === o.label && o.label !== r.answer;
      let cls = "neutral";
      let suffix = `<span class="pos-pill ${o.pos}">${o.pos}</span>`;

      if (isCorrect) {
        cls = "correct";
        suffix += " ✓";
      } else if (isSelectedWrong) {
        cls = "selected-wrong";
        suffix += " ← 你選了這個";
      }

      return `<div class="option-line ${cls}"><span>${o.label}. ${o.text}</span><span>${suffix}</span></div>`;
    }).join("");
  }

  function renderSteps(title, list, isWrong) {
    if (!list || !list.length) return "";
    return `
      <h5>${title}</h5>
      <ul class="steps ${isWrong ? "wrong" : ""}">
        ${list.map((s, idx) => `<li><span class="step-no">${idx + 1}</span><span>${typeof s === "string" ? s : s.text}</span></li>`).join("")}
      </ul>
    `;
  }

  function renderAllQuestions(payload) {
    const wrap = document.getElementById("all-questions");
    wrap.innerHTML = payload.results.map((r, idx) => {
      const correct = r.options.find((o) => o.label === r.answer);
      const selected = r.options.find((o) => o.label === r.selected);
      const speedNote = r.timeout ? "TIMEOUT" : `${r.elapsed}s`;

      return `
        <article class="q-report">
          <h4>Q${idx + 1} ${r.timeout ? "- TIMEOUT" : r.correct ? "- Correct" : "- Wrong"}</h4>
          <p class="q-stem">${decorateStem(r.stem, correct, selected, r.timeout)}</p>
          <div>${renderOptions(r)}</div>
          ${renderSteps("正確做題思路", r.solution_steps, false)}
          ${!r.correct && !r.timeout ? renderSteps("錯誤思路回放", r.wrong_thought_steps, true) : ""}
          <div class="rule-box ${r.rule_box.type === "warn" ? "warn" : "ok"}">${r.rule_box.text}</div>
          <p>速度備註：${speedNote}</p>
        </article>
      `;
    }).join("");
  }

  async function initReport() {
    const payload = window.AppCore.loadReportPayload();
    if (!payload) {
      document.body.innerHTML = "<p style='padding:20px'>找不到報告資料，請先完成一節測驗。</p>";
      return;
    }

    const index = await window.AppCore.loadIndex();
    const lesson = { day: payload.day };
    const progress = window.StorageAPI.loadProgress();
    window.AppCore.renderTopStrip(progress, index, lesson);

    document.getElementById("report-title").textContent = `${payload.title} 診斷報告`;
    document.getElementById("result-line").textContent = payload.format;

    const metrics = renderMetrics(payload);
    renderComponentDashboard(payload, progress);
    renderMap(payload);
    renderGoodBox(payload);
    renderAllQuestions(payload);

    const mastery = window.Scorer.calcMastery(payload.results, payload.limit);
    const suggestion = window.Scorer.suggestionByAccuracy(metrics.mainAcc);
    document.getElementById("mastery-value").textContent = `${mastery} / 10`;
    document.getElementById("next-suggestion").textContent = suggestion;

    document.getElementById("next-btn").addEventListener("click", () => {
      window.location.href = "./index.html";
    });

    document.getElementById("redo-btn").addEventListener("click", () => {
      window.location.href = `./quiz.html?lesson=${payload.lesson_id}`;
    });
  }

  window.ReportEngine = { initReport };
})();

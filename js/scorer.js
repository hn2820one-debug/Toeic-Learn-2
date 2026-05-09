(function () {
  function calcMastery(results, limit) {
    const mainQs = results.filter((r) => r.type === "main");
    if (!mainQs.length) return 1;

    const accuracy = mainQs.filter((r) => r.correct).length / mainQs.length;
    const avgTime = mainQs.reduce((s, r) => s + r.elapsed, 0) / mainQs.length;
    const timeRatio = avgTime / limit;

    const speedScore = timeRatio <= 0.5 ? 10 : timeRatio <= 0.7 ? 8 : timeRatio <= 0.9 ? 6 : 4;
    const mastery = Math.round(accuracy * 10 * 0.7 + speedScore * 0.3);
    return Math.min(10, Math.max(1, mastery));
  }

  function suggestionByAccuracy(accuracy) {
    if (accuracy >= 0.85) return "正確率達標，建議進入下一節。";
    if (accuracy >= 0.7) return "可進入下一節，建議加入本節監控題。";
    return "建議先重做本節或安排補課節。";
  }

  window.Scorer = {
    calcMastery,
    suggestionByAccuracy
  };
})();

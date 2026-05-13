# Toeic-Learn-2

Static TOEIC learning app calibrated to the latest real score baseline:

- Baseline: TOEIC 570, Listening 315, Reading 255
- Target: TOEIC 750, Listening 380, Reading 370
- Current runnable modules:
  - Week 1 weakness-hunter Mandative Subjunctive lessons
  - 14-day Part of Speech Booster inserted after Week 2

## 最簡單的開啟方式（推薦）

直接雙擊 `launcher.pyw`，會出現一個視窗：
- 按「▶ 啟動伺服器」→ 伺服器啟動
- 按「🏠 首頁」→ 自動開啟瀏覽器
- 按「■ 關閉伺服器」→ 關閉
- 關閉視窗時伺服器自動停止

---

## Run Locally（手動方式）

```powershell
python -m http.server 8787 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:8787/
```

## 強制關閉 Server 並重新啟動

**方法一：在同一個 PowerShell 視窗**
1. 按 `Ctrl + C` 停止目前的 server
2. 再次輸入以下指令重新啟動：
   ```powershell
   python -m http.server 8787 --bind 127.0.0.1
   ```

**方法二：如果找不到原本的視窗（強制終止）**
1. 開啟新的 PowerShell 視窗
2. 輸入以下指令強制關閉佔用 8787 port 的程式：
   ```powershell
   netstat -ano | findstr :8787
   ```
3. 找到最右邊欄位的 PID 數字（例如 `12345`），然後輸入：
   ```powershell
   taskkill /PID 12345 /F
   ```
4. 重新啟動 server：
   ```powershell
   python -m http.server 8787 --bind 127.0.0.1
   ```

**重新開啟後，請在瀏覽器按 `Ctrl + Shift + R` 強制刷新頁面（清除緩存）。**

> **重要提示：** 本應用使用 Service Worker 快取。如果更新後 UI 沒有變化，
> 只重啟 Server 是不夠的。正確做法：
> 1. 打開瀏覽器的 DevTools（按 `F12`）
> 2. 點擊「Application」分頁 → 「Service Workers」
> 3. 點擊「Unregister」取消註冊
> 4. 再按 `Ctrl + Shift + R` 強制刷新

## Validate Lesson Data

```powershell
node scripts/validate-data.js
```

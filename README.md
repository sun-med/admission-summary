# Admission Summary Generator

ED & OPD records → structured admission note · NEJM Case Record style · EHR-ready plain text

---

## 部署步驟（一次性設定，之後完全自動）

### 1. 建立 GitHub 帳號
如果還沒有，前往 [github.com](https://github.com) 免費註冊。

### 2. 建立新的 Repository
1. 登入後點右上角 **+** → **New repository**
2. Repository name：輸入 `admission-summary`（必須和 `vite.config.js` 中的 `REPO_NAME` 一致）
3. 選 **Public**（GitHub Pages 免費方案只支援 Public repo）
4. **不要**勾選 Initialize this repository
5. 點 **Create repository**

### 3. 上傳所有檔案
在新建的 Repository 頁面，點 **uploading an existing file**，把**整個資料夾的所有檔案**拖進去（包含隱藏的 `.github` 資料夾），然後點 **Commit changes**。

> ⚠️ 注意：`.github/workflows/deploy.yml` 這個路徑必須正確存在，否則自動部署不會觸發。

### 4. 開啟 GitHub Pages
1. 進入 Repository → **Settings** → 左側選單 **Pages**
2. **Source** 選 **GitHub Actions**
3. 存檔

### 5. 等待部署完成
回到 Repository 主頁，點上方 **Actions** 標籤，你會看到一個正在執行的 workflow（橘色圓圈）。約 2-3 分鐘後變成綠色勾勾即完成。

### 6. 開啟你的網頁
網址格式為：
```
https://你的GitHub帳號名稱.github.io/admission-summary/
```

例如帳號是 `gino-chen`，網址就是：
```
https://gino-chen.github.io/admission-summary/
```

---

## 之後如何更新工具

1. 在 GitHub 上直接編輯 `src/App.jsx`（點鉛筆圖示）
2. 或用 git push 更新
3. GitHub Actions 會自動重新 build 並部署，約 2-3 分鐘後生效

---

## Repository 名稱不是 `admission-summary` 怎麼辦？

修改 `vite.config.js` 第 5 行：
```js
const REPO_NAME = '你的實際repo名稱'
```

---

## 本地開發（可選）

需要先安裝 [Node.js](https://nodejs.org)（選 LTS 版本）

```bash
npm install     # 安裝依賴（只需一次）
npm run dev     # 啟動本地開發伺服器，開啟 http://localhost:5173
npm run build   # 手動 build（通常不需要，GitHub Actions 會自動做）
```

---

## 資料安全說明

- PDF 文字萃取在**你的瀏覽器本地**進行，PDF 檔案本身不會上傳到任何伺服器
- 僅有萃取後的純文字會送至 Anthropic API 進行分析
- 使用前請確認已去識別化（移除病人姓名、病歷號等個人資料）

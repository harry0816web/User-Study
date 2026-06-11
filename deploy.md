# Deployment Notes

這個專案現在改成：

- 前端部署：`Vercel`
- API：`Vercel Functions`
- 資料儲存：`Azure Table Storage`
- 匯出方式：`Azure Storage Explorer`

這是我認為對你現在這個研究最簡單、最穩，也最方便維護的組合。

## 為什麼改用 Vercel

對你這份問卷來說，Vercel 比 Azure Static Web Apps 更省事：

- 靜態頁面上線很快
- `/api` serverless function 結構簡單
- 環境變數設定直覺
- 每次 push 到 GitHub 就能自動部署

同時你又可以保留 Azure 的優點：

- 資料存在 Azure
- 可以用 `Azure Storage Explorer` 匯出
- 不需要自己維護資料庫伺服器

## 目前專案結構

我已經先把 Vercel 需要的骨架放好了：

- [index.html](/Users/harryp/Desktop/Projects/UserStudy/index.html)
- [proposal.html](/Users/harryp/Desktop/Projects/UserStudy/proposal.html)
- [api/submitSurvey.js](/Users/harryp/Desktop/Projects/UserStudy/api/submitSurvey.js)
- [package.json](/Users/harryp/Desktop/Projects/UserStudy/package.json)
- [vercel.json](/Users/harryp/Desktop/Projects/UserStudy/vercel.json)
- [.env.example](/Users/harryp/Desktop/Projects/UserStudy/.env.example)
- [.gitignore](/Users/harryp/Desktop/Projects/UserStudy/.gitignore)

用途：

- `index.html`: 正式首頁
- `proposal.html`: 轉址到 `index.html`
- `api/submitSurvey.js`: Vercel Function，接收問卷並寫入 Azure Table Storage
- `package.json`: 給 Vercel 安裝 `@azure/data-tables`
- `.env.example`: 你在 Vercel 要填的環境變數

## 最簡單可行架構

```text
受試者瀏覽器
  -> Vercel (index.html / 問卷前端)
  -> Vercel Function (/api/submitSurvey)
  -> Azure Table Storage (surveyresponses)
  -> Azure Storage Explorer 匯出 CSV
```

## 你要在 Azure 上設定什麼

這次 Azure 只負責「存資料」和「匯出資料」。

你需要在 Azure 建立：

1. `Storage Account`
2. `Table Storage` 裡的一個 table

### 1. 建立 Storage Account

在 Azure Portal：

1. 建立 `Storage account`
2. 選好：
   - `Subscription`
   - `Resource Group`
   - `Region`
   - `Storage account name`
3. 建立完成後，進到這個 Storage Account

### 2. 建立 Table

在 Storage Account 左側：

1. 找 `Data storage`
2. 點 `Tables`
3. 新增一個 table，名稱用：

```text
surveyresponses
```

### 3. 取得 Connection String

在 Storage Account 左側：

1. 找 `Security + networking`
2. 點 `Access keys`
3. 複製一組 `Connection string`

這個值等等會放進 Vercel 環境變數。

## 你要在 Vercel 上設定什麼

### 1. 把專案推到 GitHub

Vercel 最順的流程就是直接接 GitHub repo。

### 2. 在 Vercel 建立 Project

1. 登入 Vercel
2. `Add New Project`
3. 選你的 GitHub repository
4. 匯入這個專案

這個專案目前是純 HTML + `api/submitSurvey.js`，所以通常不需要額外 build 設定。

### 3. 在 Vercel 設定環境變數

在 Vercel Project Settings -> Environment Variables，新增：

```text
AZURE_TABLES_CONNECTION_STRING=<你的 Storage Account connection string>
AZURE_TABLE_NAME=surveyresponses
AZURE_TABLE_PARTITION_KEY=study-v1
```

這三個值會被：

- [api/submitSurvey.js](/Users/harryp/Desktop/Projects/UserStudy/api/submitSurvey.js)

使用。

### 4. 重新部署

環境變數加完後要重新部署一次，因為：

- Vercel 的環境變數變更不會自動套用到舊 deployment

官方文件：

- [Deployments](https://vercel.com/docs/deployments)
- [Environment Variables](https://vercel.com/docs/environment-variables)
- [Vercel Functions](https://vercel.com/docs/functions)
- [Node.js Runtime](https://vercel.com/docs/functions/runtimes/node-js)

## 前端怎麼送資料

目前前端已經會在完成問卷時嘗試送出：

```text
/api/submitSurvey
```

送出的內容大致是：

```json
{
  "version": "proposal-v1",
  "studyTitle": "Bring Music The Horizon: Music-Driven VR World Generation",
  "consent": true,
  "createdAt": "...",
  "startedAt": "...",
  "completedAt": "...",
  "videoOrder": ["D", "A", "F", "C", "B", "E"],
  "responses": {},
  "posttest": {}
}
```

API 會把它寫成一筆 Table Storage entity，主要欄位是：

- `partitionKey`
- `rowKey`
- `submittedAt`
- `videoOrderJson`
- `responsesJson`
- `posttestJson`

這樣做的好處是：

- 最快
- schema 很彈性
- 問卷小改時不用重建資料表

## 你之後怎麼匯出資料

這次你指定要用：

### 方法 1：Azure Storage Explorer

這也是我最推薦的做法。

步驟：

1. 安裝 `Azure Storage Explorer`
2. 登入你的 Azure 帳號
3. 找到你的 `Storage Account`
4. 展開 `Tables`
5. 點進 `surveyresponses`
6. 確認有收到資料
7. 匯出成 `CSV`

你會看到幾個重要欄位：

- `submittedAt`
- `videoOrderJson`
- `responsesJson`
- `posttestJson`

之後分析時只要再把 JSON 欄位展開就可以。

## 最短部署順序

我建議你照這個順序做：

1. 把專案 push 到 GitHub
2. 在 Azure 建立 `Storage Account`
3. 在 Azure 建立 `surveyresponses` table
4. 複製 Storage Account 的 `Connection string`
5. 在 Vercel 建立 project
6. 在 Vercel 加上：
   - `AZURE_TABLES_CONNECTION_STRING`
   - `AZURE_TABLE_NAME`
   - `AZURE_TABLE_PARTITION_KEY`
7. 重新部署
8. 實際填一次問卷
9. 用 Azure Storage Explorer 打開 `surveyresponses`
10. 確認資料有進去後再正式收案

## 本機測試

如果你要先本機看前端：

```bash
python3 -m http.server 8080
```

然後打開：

```text
http://localhost:8080/index.html
```

如果你要本機測試 Vercel Functions，比較建議直接用 Vercel CLI。

## 補充

如果之後你想做得更正式，下一步可以考慮：

- 在前端加送出成功頁
- 加管理員匯出 script，把 JSON 欄位攤平成 CSV
- 加簡單的 anti-spam 機制
- 加版本號，區分不同實驗批次

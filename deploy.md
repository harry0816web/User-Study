# Deployment Notes

這份研究問卷目前是前端單頁 `proposal.html`。現在不再記錄 `Subject ID` 與 `Batch`，所以正式收案時最重要的是把每次作答內容、影片亂序結果、時間戳記穩定存下來，並且之後能簡單匯出做分析。

## 最簡單可行方案

如果你的目標是：

- 最快部署到 Azure
- 可以真的收資料
- 之後可以下載整理
- 不想一開始就維護太多後端

我最推薦的組合是：

- 前端：`Azure Static Web Apps`
- 收資料 API：`Azure Functions`
- 儲存：`Azure Table Storage`

這是我認為對你現在這個研究最簡單、也最夠用的 Azure-only 方案。

原因：

- `Static Web Apps` 很適合部署這種靜態問卷頁
- `Azure Functions` 很適合只做一個 `submit` API
- `Table Storage` 比資料庫輕量，夠便宜，也很適合一筆一筆問卷回覆
- 之後可以用 `Azure Storage Explorer` 或程式匯出成 `CSV / JSON`

## 這次我已經先幫你建立的檔案

我已經先在專案中放好 Azure 部署骨架：

- [index.html](/Users/harryp/Desktop/Projects/UserStudy/index.html)
- [proposal.html](/Users/harryp/Desktop/Projects/UserStudy/proposal.html)
- [api/host.json](/Users/harryp/Desktop/Projects/UserStudy/api/host.json)
- [api/package.json](/Users/harryp/Desktop/Projects/UserStudy/api/package.json)
- [api/submitSurvey/index.js](/Users/harryp/Desktop/Projects/UserStudy/api/submitSurvey/index.js)
- [api/submitSurvey/function.json](/Users/harryp/Desktop/Projects/UserStudy/api/submitSurvey/function.json)
- [api/local.settings.sample.json](/Users/harryp/Desktop/Projects/UserStudy/api/local.settings.sample.json)

這些檔案的用途是：

- `index.html`: Azure 入口頁，會導向 `proposal.html`
- `proposal.html`: 問卷前端
- `api/submitSurvey`: 接收前端送出的問卷 JSON，寫進 Azure Table Storage
- `local.settings.sample.json`: 本機測試或 Azure 設定對照用

## 資料怎麼收

我建議每次送出時，前端送一筆 JSON 到 Azure Function，例如：

```json
{
  "submittedAt": "2026-06-11T10:00:00.000Z",
  "videoOrder": ["D", "A", "F", "C", "B", "E"],
  "responses": {
    "A": { "rhythmCut": 6, "rhythmMotion": 5 },
    "B": { "rhythmCut": 3, "rhythmMotion": 4 }
  },
  "posttest": {
    "confidence": 5,
    "difficulty": 4
  }
}
```

Azure Function 收到後，把它整理成一筆 Table Storage entity。

最簡單做法：

- `PartitionKey`: `study-v1`
- `RowKey`: 用 `timestamp + random id`
- 其他欄位：
  - `submittedAt`
  - `videoOrderJson`
  - `responsesJson`
  - `posttestJson`

也就是說，你不需要一開始就把每一題拆成很多欄，先把主要資料以 JSON 字串存進去就夠了。這樣最快，也最不容易因問卷題目小改就得重做 schema。

## 你在 Azure 上要建立什麼

最少只需要這三個東西：

1. `Azure Static Web App`
2. `Storage Account`
3. `Table Storage` 裡的一個 table

如果你用 Static Web Apps 的 managed API 模式，`api/` 會跟著一起部署，不需要你另外手動建一個獨立的 Function App。

## 你在 Azure Portal 上要設定什麼

### 1. 建立 Storage Account

你要準備：

- `Subscription`
- `Resource Group`
- `Storage account name`
- `Region`

建立完成後，去這個 Storage Account 做兩件事：

1. 取得 `Connection string`
2. 建立 table，例如 `surveyresponses`

### 2. 在 Storage Account 建立 Table

進入 Storage Account 後：

1. 左側找 `Data storage`
2. 選 `Tables`
3. 新增一個 table，名稱建議：

```text
surveyresponses
```

### 3. 建立 Static Web App

在 Azure Portal：

1. 建立 `Static Web App`
2. 選 GitHub 作為部署來源
3. 指到這個專案的 repo 與 branch
4. Build preset 選 `Custom`
5. 填下面這組：

```text
App location: /
Api location: api
Output location:
```

`Output location` 可以留空，因為現在不是 React/Vite 這種 build 出來的網站。

### 4. 在 Static Web App 加環境變數

建立完成後，進入 Static Web App，在設定裡加入 application settings。

至少加這三個：

```text
AZURE_TABLES_CONNECTION_STRING=<你的 Storage Account connection string>
AZURE_TABLE_NAME=surveyresponses
AZURE_TABLE_PARTITION_KEY=study-v1
```

這三個值對應到目前的 API 程式：

- [api/submitSurvey/index.js](/Users/harryp/Desktop/Projects/UserStudy/api/submitSurvey/index.js)

### 5. 確認 API 路徑

部署成功後，你的網站前端會呼叫：

```text
/api/submitSurvey
```

所以你部署完後要測兩件事：

1. 首頁能開
2. 送出問卷時 API 有回應

## 資料怎麼匯出

最簡單的匯出方式有兩種。

### 方法 1：Azure Storage Explorer

這是最簡單、最不需要寫程式的方法。

1. 安裝 `Azure Storage Explorer`
2. 連到你的 Storage Account
3. 找到 `Tables`
4. 開啟你的問卷回覆 table
5. 直接匯出資料

這很適合：

- 先看有沒有收到資料
- 先下載一批回覆
- 內部 pilot 階段快速檢查

### 你實際在 Azure Storage Explorer 裡要做什麼

1. 安裝並打開 `Azure Storage Explorer`
2. 登入你的 Azure 帳號
3. 找到剛剛那個 `Storage Account`
4. 展開 `Tables`
5. 點進 `surveyresponses`
6. 確認資料有進來
7. 匯出成 `CSV`

你匯出後會看到幾個重點欄位：

- `submittedAt`
- `videoOrderJson`
- `responsesJson`
- `posttestJson`

之後你只要把 JSON 欄位再展開，就能做分析。

### 方法 2：寫一支匯出 script

如果你之後要做正式分析，我會建議再補一支小 script：

- 從 Table Storage 拉資料
- 把 `videoOrderJson / responsesJson / posttestJson` 展開
- 輸出成 `CSV`

這樣你最後匯入 `Python / R / Excel / Google Sheets` 都會比較方便。

## 結論

我會優先建議架在 Azure，而不是用你自己的電腦開 Nginx 對外發佈。

原因很直接：

- 研究收案需要穩定連線，你的個人電腦不一定會長時間開機。
- 家用或校內網路常有浮動 IP、NAT、防火牆與埠限制。
- 問卷如果要給外部受試者，HTTPS 幾乎是基本要求，Azure 處理起來比較乾淨。
- 之後如果要接資料儲存、記錄 log、或限制存取來源，Azure 比本機更好延伸。

只有在下面情況，我才會建議先用本機 Nginx：

- 這週只是實驗室內部 pilot
- 受試者都在同一個空間
- 你只需要暫時開放幾小時
- 你不想現在就碰雲端設定

## 方案比較

### 方案 A：Azure 靜態網站或 App Service

適合：

- 要給實驗室外部或多位受試者使用
- 需要穩定網址
- 需要 HTTPS
- 之後可能要接 Azure Database、Supabase、Firebase 或自建 API

優點：

- 穩定
- 有公開網址
- HTTPS 容易處理
- 方便多人同時填寫
- 比較適合 IRB/正式收案流程

缺點：

- 前期要做一次部署設定
- 如果之後加後端，會多一點雲端管理成本

我建議的 Azure 路線：

1. 如果短期只是靜態頁面，用 Azure Static Web Apps 或 Azure Storage Static Website。
2. 如果你很快就要接 API，直接用 Azure App Service。
3. 如果你想把資料也放 Azure，同步考慮 Azure Functions + Table Storage / Cosmos DB / PostgreSQL。

### 方案 B：本機電腦 + Nginx 對外發佈

適合：

- 內部測試
- demo 給老師看
- 短時間少量受試者
- 網路環境可控

優點：

- 最快
- 成本低
- 改完檔案就能立刻更新

缺點：

- 你電腦一睡眠或斷網，網站就沒了
- 對外連線設定麻煩
- HTTPS 比較麻煩
- 不適合正式收案
- 如果資料只存在前端或本機，很容易漏資料

## 我對你這個專案的實際建議

我建議分兩階段。

### 第一階段：先做內部 pilot

用本機直接開靜態伺服器或 Nginx 即可，讓實驗室內部先跑題目、確認流程、修文案、檢查 YouTube 360 播放是否順。

這階段重點不是部署漂亮，而是確認：

- 題目有沒有歧義
- 2D / 360 條件配置是否合理
- YouTube 內嵌是否穩定
- 受試者是否真的會操作 360 視角
- 需要收哪些欄位

### 第二階段：正式收案前搬到 Azure

當題目、流程、影片條件都固定後，再上 Azure。

這樣做的好處是：

- 不會太早把時間花在雲端細節
- 研究流程一旦穩定，再部署正式版比較不容易反覆改
- 正式收案網址、HTTPS、資料保存都會比較安心

## 如果現在就要選一個

如果你問我「正式上線應該選哪個」，答案是：

Azure。

如果你問我「今天晚上想先給實驗室 3 到 5 個人試跑」，答案是：

本機靜態伺服器或本機 Nginx。

## 最低風險的技術路線

我建議你最後採這個組合：

- 前端：`Azure Static Web Apps`
- API：`Azure Functions`
- 資料儲存：`Azure Table Storage`

原因是你們這個研究真正重要的是資料不要漏、受試者能穩定打開、以及之後分析欄位一致。

## 如果先用本機測試

最簡單可以直接在專案資料夾執行：

```bash
python3 -m http.server 8080
```

然後開：

```text
http://localhost:8080/proposal.html
```

如果同網段其他人要連，可以用你電腦的區網 IP：

```text
http://YOUR_LOCAL_IP:8080/proposal.html
```

這適合 pilot，不適合正式對外。

## Azure 部署實作

以你目前這個專案來說，最簡單的 Azure 做法有兩條：

1. `Azure Storage Static Website`
適合現在這種純靜態單頁，最快上線。
2. `Azure Static Web Apps`
適合之後要持續更新、接 GitHub、自動部署，或之後加 Azure Functions API。

如果你要我只推薦一條給現在的你，我會建議：

直接用 `Azure Static Web Apps + Azure Functions + Table Storage`。

因為你現在已經不只是在想「把頁面掛上去」，而是要能真正收問卷資料與之後匯出。

### 方案 1：Azure Storage Static Website

這是目前最省事的部署方式，因為你的網站現在只有 `proposal.html`。

#### 你要先做的事

1. 把首頁檔名從 `proposal.html` 改成 `index.html`
2. 確認所有資源都是相對路徑或同資料夾
3. 如果之後還是保留 `Poster.pdf`，也一起上傳

我建議你的目錄最後長這樣：

```text
UserStudy/
  index.html
  Poster.pdf
  deploy.md
```

#### 在 Azure Portal 的步驟

1. 登入 Azure Portal。
2. 建立一個 `Storage account`。
3. 在該 Storage account 左側找到 `Data management` -> `Static website`。
4. 把 Static website 設成 `Enabled`。
5. `Index document name` 填 `index.html`。
6. `Error document path` 可先填 `index.html`。
7. 儲存後，Azure 會建立一個特殊容器，通常是 `$web`，並提供一個網站 URL。
8. 打開 `$web` 容器，把 `index.html` 與其他靜態檔案上傳進去。
9. 用 Azure 給你的網址測試頁面是否能正常打開。

#### 上傳後要檢查的事

- `https://.../` 能打開首頁
- YouTube 內嵌可以正常播放
- `Poster.pdf` 連結沒有壞掉
- 手機上也能正常開

#### 這條路的限制

- 很適合純靜態頁面
- 不適合直接做複雜後端
- 如果你之後要收資料，通常要再接別的 API 或資料庫

### 方案 2：Azure Static Web Apps

如果你之後會常改頁面，或想把部署綁 GitHub，自動在每次 push 後更新網站，這條會更舒服。

#### 適合你的情境

- 頁面之後會持續改
- 你想用 GitHub 管版本
- 你之後可能要加 Azure Functions API
- 你不想每次手動上傳檔案

#### 你要先準備

1. 把專案放進 GitHub repository
2. 把首頁整理成 `index.html`
3. 如果目前沒有 build step，就直接把網站根目錄當成 app location

#### 在 Azure Portal 的步驟

1. Azure Portal 建立 `Static Web App`
2. 選你的 Subscription 與 Resource Group
3. 在部署來源選 GitHub
4. 授權 Azure 存取你的 GitHub
5. 選到這個 repository 與 branch
6. Build Presets 若沒有對應框架，可選 `Custom`
7. `App location` 填 `/`
8. `Api location` 先留空
9. `Output location` 留空
10. 建立完成後，Azure 會自動在 GitHub 建立 workflow
11. 等 workflow 跑完，Azure 會給你正式網址

#### 這條路的優點

- 之後改檔 push 到 GitHub 就會自動更新
- 日後要加 API 比較順
- 適合正式維護

#### 這條路要注意

- 它比較偏向 repo-based deployment
- 所以你最好先把這個專案整理成 Git repo 的正式樣子

### 我建議你現在的最短路徑

如果你今天就想先把這份問卷掛上 Azure，而且希望它能真的收資料，我建議照這樣做：

1. 把目前專案推到 GitHub
2. 在 Azure 建立 `Storage Account`
3. 在 Storage Account 建立 `surveyresponses` table
4. 在 Azure 建立 `Static Web App`
5. 設定：
   `App location=/`
   `Api location=api`
6. 在 Static Web App 加上：
   `AZURE_TABLES_CONNECTION_STRING`
   `AZURE_TABLE_NAME`
   `AZURE_TABLE_PARTITION_KEY`
7. 重新部署
8. 填一次問卷測試
9. 用 Azure Storage Explorer 打開 `surveyresponses`
10. 確認有資料後再正式收案

## 最簡單的 Azure 收資料架構

我建議你最後做成這樣：

```text
受試者瀏覽器
  -> Azure Static Web Apps (前端問卷)
  -> Azure Functions /api/submit
  -> Azure Table Storage
```

這是最簡單又夠正式的做法。

### 實作步驟

1. 建立一個 `Storage Account`
2. 在裡面建立一個 `Table`，例如 `surveyresponses`
3. 建立一個 `Azure Static Web App`
4. 在同一個專案裡放前端頁面與 Functions
5. 建立一支 HTTP-trigger Function，例如 `submitSurvey`
6. Function 收到 JSON 後寫進 `surveyresponses`
7. 前端送出成功後顯示感謝頁或完成訊息

### Function 要做什麼

最簡單的邏輯只有三步：

1. 驗證 request body 至少有 `responses` 與 `posttest`
2. 產生 `RowKey`
3. 寫入 Table Storage

### 匯出怎麼做

最簡單就是：

1. 打開 `Azure Storage Explorer`
2. 連到你的 Storage Account
3. 找到 `surveyresponses`
4. 匯出

如果之後你要做正式分析，再補一支：

- `export_responses.js`
- 或 `export_responses.py`

把 Table Storage 內容攤平成 CSV。

### 如果你之後要正式收資料

到正式收案時，我不建議只靠目前這份前端下載 JSON。比較安全的路線還是：

1. 前端放 Azure
2. 用一個 API 收資料
3. 資料存到雲端儲存

對你這個專案，我最推薦還是：

`Azure Static Web Apps + Azure Functions + Azure Table Storage`

這是最簡單、最一致，也最容易之後匯出的 Azure 方案。

### 我建議你照著做的實際順序

1. 先把 `proposal.html` 整理成 `index.html`
2. 建立 Static Web App
3. 建立 submit Function
4. 建立 Table Storage
5. 跑一次真實送出測試
6. 確認 Table 裡真的有資料
7. 再開始正式收案

## 官方文件

我查的是 Azure 官方文件，下面這幾篇最直接：

- [Azure Storage static website hosting](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blob-static-website)
- [Host a static website on Blob storage](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-blob-static-website-host)
- [Azure Static Web Apps overview](https://learn.microsoft.com/en-us/azure/static-web-apps/)
- [Build your first static web app](https://learn.microsoft.com/en-us/azure/static-web-apps/get-started-portal)
- [Configure Azure Static Web Apps](https://learn.microsoft.com/en-us/azure/static-web-apps/configuration)
- [Add an API to Azure Static Web Apps](https://learn.microsoft.com/en-us/azure/static-web-apps/add-api)

## 下一步建議

如果你要我直接往下做，我建議下一步是：

1. 先把 `proposal.html` 真的升級成正式收資料版本
2. 幫你加一個最小後端或雲端資料儲存
3. 再補一份 Azure 部署用的實作檔案

如果你要，我下一步可以直接幫你把目前這份問卷改成「可部署版本」，例如：

- 加入真正的 submit API
- 改成可放 Azure Static Web Apps 的結構
- 或直接幫你做一版最小 Node/Express 後端

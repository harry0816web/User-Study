# User-Study

## Scripts

### Export responses

`export-responses.js` 會從 Azure Table Storage 讀取問卷資料，並輸出到 `exports/`。

```bash
npm run export:responses
```

它會讀取：

- `.env.local`
- `.env`

需要的環境變數：

- `AZURE_TABLES_CONNECTION_STRING`
- `AZURE_TABLE_NAME`
- `AZURE_TABLE_PARTITION_KEY`

### Clear test responses

`clear-responses.js` 會用和 `export-responses.js` 一樣的方式連到 Azure Table Storage，刪除符合條件的資料列。

預設是 dry run，只會先列出哪些資料會被刪除，不會真的刪。

```bash
npm run clear:responses
```

如果確認要刪除，請把 script 參數放在 `--` 後面：

```bash
npm run clear:responses -- --confirm
```

常用篩選方式：

```bash
npm run clear:responses -- --partition-key=study-v1 --confirm
npm run clear:responses -- --version=proposal-v1 --confirm
npm run clear:responses -- --study-title="Bring Music The Horizon: Music-Driven VR World Generation" --confirm
```

也可以用時間條件縮小範圍：

```bash
npm run clear:responses -- --submitted-before=2026-06-12T00:00:00Z --confirm
npm run clear:responses -- --submitted-after=2026-06-11T15:00:00Z --confirm
```

如果要忽略預設的 partition key 安全限制，改查整張 table：

```bash
npm run clear:responses -- --all
npm run clear:responses -- --all --confirm
```

注意：

- 不要用 `npm run --confirm clear:responses`，這樣 `--confirm` 不會傳進 Node script。
- 如果沒有帶任何 filter，script 會預設使用 `AZURE_TABLE_PARTITION_KEY`；如果沒設，則會 fallback 到 `study-v1`。

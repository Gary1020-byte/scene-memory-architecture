# 03 · 可執行工具

| 檔案 | 說明 |
|---|---|
| [`scene-memory.mjs`](scene-memory.mjs) | 校驗工具：`list` / `init` / `stamp` / `交接` / `check` |
| [`add-scene.mjs`](add-scene.mjs) | 建完整場景：骨架 ＋ 六件套 ＋ 身份索引登記 |
| [`switch-session.mjs`](switch-session.mjs) | 換會話：`計畫`（前置檢查）／`檢查`（三處同步自檢） |
| [`session-archive.mjs`](session-archive.mjs) | 會話檔案層：`抽出` / `索引` / `檢查` / `列出` |
| [`handover-rules.json`](handover-rules.json) | **規則單一來源**：紅線、小節清單、指紋長度、邊界標記名 |
| [`negative-acceptance.sh`](negative-acceptance.sh) | 自我驗收：證明「該失敗時會失敗」 |
| [`check-links.mjs`](check-links.mjs) | 連結檢查：驗證所有 markdown 內部連結都指向存在的檔案 |
| [`USAGE.md`](USAGE.md) | 詳細用法、退出碼對照、常見錯誤與修法、工具的限制 |

---

## 五秒上手

```bash
cd 03-executable-tools

# 看demo-workbench長什麼樣
node scene-memory.mjs list --root ../04-templates/demo-workbench

# 跑一次自我驗收（會故意弄壞再還原）
bash negative-acceptance.sh

# 檢查所有 markdown 連結是否有效
node check-links.mjs

# 換會話：前置檢查（能不能換）＋ 換完自檢（三處有沒有同步）
node switch-session.mjs 計畫 --root ../04-templates/demo-workbench --scene demo-scene
node switch-session.mjs 檢查 --root ../04-templates/demo-workbench --scene demo-scene

# 會話檔案層：聊天全文的歸處
node session-archive.mjs 檢查 --root ../04-templates/demo-workbench
```

---

## 這個板塊的設計主張

> **「該失敗時會失敗」是一個可以證明的東西，不是一句口號。**

所以這裡不放「教學文件」，放的是：

1. **一支真的能擋下問題的工具**（退出碼正確、訊息具體）
2. **一份真的會把它弄壞的驗收腳本**（10 條反例，全過）
3. **一份規則單一來源**（改紅線只改一個地方）

> 一個永遠回 0 的檢查器，比沒有檢查器更危險——
> 它讓人以為有防護，其實沒有。

---

## 三條不變量

| 不變量 | 意思 |
|---|---|
| **工具不寫正文** | 場景記憶的正文永遠是人寫的。工具只做骨架、補缺、蓋章、檢查 |
| **交接不覆寫** | 只「缺才補」。覆寫 §₀ 會洗掉進度，比沒交接更糟 |
| **規則不硬編碼** | 紅線等規則讀 `handover-rules.json`，工具與腳本共用一份 |

---

⬅️ **回**：[文件地圖](../README.md) ｜ **相關**：[二-交接與校驗](../02-implementation/2-handover-and-validation.md)

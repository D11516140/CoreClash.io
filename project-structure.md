# 🎮 CoreClash.io 專案架構與開發維護筆記

## 📌 一、 專案維護與開發守則 (Development Rules)

1. **雙層記憶維護模式 (Two-Layer Memory Structure)**
   - **目錄檔案樹**：僅保留檔案路徑與一行的 `(🟢 核心機制短標記)`，保持乾淨簡潔。
   - **底層詳細日誌**：具體的數值公式、戰鬥演算法、快取機制與 UI 邏輯統一歸類在「三、 模組實作與戰術細節紀錄」。

2. **筆記本體更新與維護守則 (Document Maintenance Rules)**
   - **主題覆寫制（嚴禁流水帳追加）**：「三、模組實作與戰術細節紀錄」採主題分類管理。當舊機制被重構或修改時，**直接覆寫原條目內容**，嚴禁在文件底部無限次追加重複的歷史修補紀錄，確保文件篇幅精簡有界。
   - **雙向同步更新**：每當修改或新增程式碼檔案時，必須同時更新「二、目錄結構」的短標記與「三、模組實作」的詳細邏輯。

3. **嚴格禁止無根據推測 (Zero Guessing Policy)**
   - 僅記錄已實際編寫、重構或明確確定邏輯的檔案與功能。未經討論或未載入的檔案不隨意捏造功能說明。

4. **DOM 與繪圖效能守則 (Performance & Rendering Rules)**
   - **Canvas 矩形與 DOM 節點快取 (`cachedCanvasRect` / `uiElements`)**：快取 `canvas.getBoundingClientRect()` 於 `resize`/`scroll` 事件，禁止高頻 `mousemove` 觸發 DOM 重新排版 (Forced Reflow)；全域快取 HUD DOM 節點，消除重複 `getElementById` 開銷。
   - **事件佇列與 DOM 比對 (`e.repeat` / HTML Diffing)**：過濾 OS 鍵盤長按自動重複封包防止事件佇列塞車；HUD 與排行榜變更需進行字串與狀態 Key 比對（`lastLbHTMLCache`, `lastUIStateCache`），無變動跳過 DOM 重刷。

5. **獨立遊戲規格大廳守則 (Main Menu & UI System)**
   - **三卡片模式門面與動態 Toast**：大廳採用獨立遊戲規格，頂部反饋與版本號、置中主 Title、三卡片模式（PVP/沙盒/新手教學）、左下個人檔案（暱稱+5色選色器）與右下設定/離開。
   - **按鈕視覺動態反饋**：所有 UI 按鈕加入點擊時縮放與霓虹光暈反饋 (`:active`)，尚未開放功能觸發全域 Cyber Toast 浮窗提醒。

---

## 📁 二、 目錄結構與模組快取標記

CoreClash.io/
├── public/                    # 前端靜態資源與繪圖邏輯
│   ├── css/
│   │   └── style.css          # UI 賽博風格樣式 (🟢 獨立大廳大卡片佈局、230px二階沙盒選單、:active 視覺按鈕反饋)
│   ├── js/
│   │   ├── sandboxManager.js  # 單機沙盒戰鬥引擎 (🟢 無敵模式鎖血、基地即時重置、敵單位/塔預覽放置、Dummy 虛擬點隔離)
│   │   ├── render.js          # Canvas 繪圖核心 (🟢 particles/floatingTexts全域宣告、敵方單位/塔預覽模式、0.8s受擊閃紅)
│   │   └── ui.js              # 介面與彈窗模組 (🟢 全域玩家解析器 getCurrentPlayer、二階選單頁面切換、Cyber Toast 浮窗)
│   ├── game.js                # 前端通訊與主控台 (🟢 放置敵單位/塔模式控制、排查 Dummy 人物防卡死、連續建造與鏡頭跟隨)
│   └── index.html             # 主頁面 DOM 結構 (🟢 置中 LOGO、三卡片大廳、二階沙盒開發者面板 DOM)
├── server/                    # 伺服器端核心模組
│   ├── config.js              # 常數配置 (🟢 初級/重裝兵負重 1/2、怪物半徑、動態懸賞與分數權重)
│   ├── combatManager.js       # 戰鬥與 AI 核心 (🟢 0.8s 冷卻傷害算式、怪物卡位切換仇恨、全域實體推擠)
│   └── allianceManager.js     # 聯盟機制 (🟢 創立/加入/招募模式/特邀與挖腳邏輯)
├── server.js                  # 伺服器入口 (🟢 延遲改名 pendingName 機制、賣出/修復殘值安全結算、防 NaN 保護)
└── project-structure.md       # 專案架構與開發維護筆記

---

## ⚙️ 三、 模組實作與戰術細節紀錄

### 1. 獨立遊戲規格主畫面大廳與身份管理 (Main Menu & Player Identity)
* **主視覺與置中 LOGO**：
  * 大廳極簡化排版，頂部左側 [💬 反饋]、右側 [v0.4.0 Alpha] 版本號，正中央放上巨大的 Neon 風格 LOGO 與副標題。
* **三卡片模式選擇 (`.mode-cards-container`)**：
  * `⚔️ PVP 戰場`：點擊發送暱稱與代表色加入對局。
  * `🧪 沙盒訓練場`：純前端 (Client-Side) 獨立運行單機戰鬥引擎，不佔用伺服器資源。
  * `📖 新手教學`：規劃採取純前端獨立模擬引導。
* **指揮官個人檔案與延遲改名機制 (Delayed Nickname Update)**：
  * 左下角常駐身份卡片，含暱稱輸入框與 5 色選擇器（藍/綠/黃/粉/紅），選擇與暱稱自動快取至 `localStorage`。
  * **下回合生效邏輯**：玩家在大廳改名僅更新伺服器端 `pendingName`。若當前戰局中尚有存活實體/基地，`name` 將保持鎖定；僅在 **建基地 (`placeCore`)** 或 **重新開始 (`restartGame`)** 時才同步將 `pendingName` 更新至 `name`。
* **系統動作 (Settings & Exit)**：
  * 右下角提供 `[ ⚙️ 設定 ]` 與 `[ 🚪 離開 ]` 按鈕，點擊離開跳出確認 Modal 後安全斷開。

### 2. 沙盒開發者面板與測試調試機制 (Sandbox Dev Tools)
* **二階分頁控制 (Tier-1 & Tier-2 Tabs)**：
  * 選單頂部提供 `[強化]`、`[生怪]`、`[敵方]`、`[重置]` 四大頁面，保持 230px 精準佈局。
* **強化頁面 (Buff Tab)**：
  * 提供 `+10,000G`、`+1 等級`、`等級封頂 (Lv.99)` 及 `🛡️ 無敵模式 (鎖血)`。無敵模式開啟後，玩家指揮官與基地核心受到的任何傷害均直接無效。
* **生怪與敵方佈署 (Spawning & Enemy Placement)**：
  * `👾 紫晶怪` / `👹 突襲菁英怪`：自動於領地邊緣生成進攻單位。
  * `🗼 敵基礎塔` / `💥 敵重砲塔`：啟用 `ENEMY_TOWER_*` 預覽建造模式，滑鼠跟隨紅框與射程圈，點擊左鍵即放置敵方防禦塔。
  * `🗡️ 敵方步兵` / `🛡️ 敵重裝兵`：啟用 `ENEMY_SOLDIER_*` 預覽放置模式，滑鼠跟隨紅色定位圈，放置後單位預設進入 **駐守 (HOLD)** 模式。
* **重置頁面 (Reset Tab)**：
  * 提供 `💚 恢復血量`、`💚 清除敵方`、`💥 清除防禦塔`、`💥 重置基地`（即時銷毀基地且無重生冷卻）、`✨ 重置經驗`與`🪙 重置金幣`。
* **Dummy 虛擬人物隔離與防卡死機制**：
  * 將敵方 AI (`enemy_ai`) 標記 `isDummy: true` 與 `isOnline: false`。
  * 繪圖引擎與 `findEntityAtPos` / `findEntityById` 會主動忽略 Dummy 實體，防止在地圖原點 (0,0) 渲染黃色指揮官圓點，並徹底排除點擊選取導致畫面凍結的 Bug。

### 3. DOM 與效能優化 (Performance Caching & Event Loop)
* **Canvas 矩形快取 (`cachedCanvasRect`)**：
  * 將 `canvas.getBoundingClientRect()` 快取於全域，僅在 `resize` 與 `scroll` 時重新計算。
* **OS 按鈕自動重複過濾 (`e.repeat`)**：
  * `keydown` 事件過濾重複按鍵，防止長按 WASD 時塞爆事件佇列。
* **DOM 節點與 HTML 狀態雙重快取 (`uiElements` / `lastLbHTMLCache`)**：
  * 排行榜 HTML 比對，HUD 與選單按鈕比對 Key 值，降低 90% 以上 DOM 覆寫。

### 4. 戰鬥系統與打擊反饋 (Combat Cooldown & Visual FX)
* **0.8 秒冷卻傷害算式**：小兵與怪物戰鬥攻擊週期設為 `0.8s`。
* **受擊紅光 (Hit Flash)**：單位受傷時 10 幀內渲染 55% 透明度外發光紅光。
* **傷害數值飄字 (Damage Numbers)**：一般單位與防禦塔受擊彈出紅色數字 (`-XX`)；紫晶怪物彈出紫色數字。

### 5. 怪物 AI 與物理碰撞 (Monster AI & Physics)
* **全域實體碰撞推擠**：怪物 (8px/10px) 與小兵、中立單位混合進行全域圓形推擠，不再重疊擠在同一點。
* **卡位自動切換仇恨 (Pathfinding Aggro)**：怪物移動前檢測障礙物 ($< \text{半徑和} + 5\text{px}$)，切換仇恨優先清空障礙。

### 6. 負重與移動速度 (Weight & Movement Mechanics)
* **軍隊負重系統**：初級步兵 (1) / 中級裝甲兵 (2) 累計負重，滿 70 負重移速降至保底 40%。
* **4 段 UI 移速顏色標記**：$>80\%$ 綠 / $51\sim80\%$ 黃 / $21\sim50\%$ 紅 / $\le 20\%$ 暗紅。

### 7. 建築與互動機制 (Placement & Interaction)
* **防禦塔連續建造模式 (Continuous Placement)**：放置防禦塔 (`BASIC` / `ADVANCED`) 後不會強制退出預覽狀態，金幣足夠時支援點擊左鍵連續快蓋。
* **階層式選單取消 (Hierarchical Submenu Cancel)**：於建造預覽狀態下按下 `右鍵` / `~` / `Esc` 時，優先退回層級至「防禦塔選單」；於選單狀態下取消時才退回最外層主控制列。
* **精準 placement 失敗提示**：動態即時顯示失敗原因（金幣不足 / 超出地圖 / 超出領地 350px / 位置被佔據）。
* **點擊圖層優先順序 (`findEntityAtPos`)**：`1. 部隊小兵` $\rightarrow$ `2. 指揮官 (排除 Dummy)` $\rightarrow$ `3. 怪物` $\rightarrow$ `4. 防禦塔 (矩形)` $\rightarrow$ `5. 基地核心`。

### 8. 聯盟機制與 HUD 面板 (Alliance & Multi-Member Preview)
* **聯盟 HUD 小面板前 3 名成員動態預覽**：聯盟卡片即時依積分排序並顯示前 3 名成員，清晰標記 `👑 盟主` 與 `🛡️ 成員` 階級圖示、玩家暱稱及分數，解決多成員無法列出問題。

### 9. 戰術選單與建築殘值 (Buildings & Economy)
* **殘值安全計算**：防禦塔與小兵賣出價格根據殘餘血量比例計算：$\text{退款} = \lfloor \text{最大退款} \times (\text{當前 HP} / \text{最大 HP}) \rfloor$。

---

## 📡 四、 伺服器通訊協定與資料結構 (Socket & State Schema)

### 1. 核心 `gameState` 物件結構
* `tickCount`: 伺服器 60FPS 累計 Tick 數。
* `players`: `{ [playerId]: { id, name, pendingName, gold, hp, maxHp, x, y, speedRatio, armyState, allianceId, isInvincible, isDummy, core: {...}, army: [...] } }`
* `towers`: `[ { id, ownerId, type, x, y, hp, maxHp, range, atk, cooldownSec } ]`
* `monsters`: `[ { id, targetPlayerId, x, y, hp, maxHp, atk, speed, isRaid } ]`
* `neutralSoldiers`: `[ { id, x, y, hp, maxHp, atk, speed, type } ]`
* `lasers`: `[ { x1, y1, x2, y2, color } ]`
* `events`: `[ { type: 'EXPLOSION' | 'FLOAT_TEXT', x, y, color, text } ]`

### 2. 關鍵 Socket / 沙盒指令對照表
| 動作名稱 | 觸發來源 | 帶入參數 (Payload) | 說明 |
| :--- | :--- | :--- | :--- |
| `joinGame` | 前端 $\rightarrow$ 伺服器 | `{ persistentId, nickname, color }` | 登入並帶入 `pendingName` 預備暱稱 |
| `playerInput` | 前端 $\rightarrow$ 伺服器 | `{ w, a, s, d }` | 60FPS 傳送移動鍵盤狀態 |
| `placeCore` | 前端 $\rightarrow$ 伺服器/沙盒 | `{ x, y }` | 放置初始基地核心 |
| `buyTower` | 前端 $\rightarrow$ 伺服器/沙盒 | `{ x, y, type }` | 建造防禦塔 (`BASIC` / `ADVANCED`) |
| `placeEnemyTower` | 前端 $\rightarrow$ 沙盒 | `{ x, y, type }` | 沙盒預覽放置敵方防禦塔 |
| `placeEnemySoldier` | 前端 $\rightarrow$ 沙盒 | `{ x, y, type }` | 沙盒預覽放置敵方單位 (預設 `HOLD`) |
| `repairTower` | 前端 $\rightarrow$ 伺服器/沙盒 | `towerId` | 修復防禦塔 |
| `sellTower` | 前端 $\rightarrow$ 伺服器/沙盒 | `towerId` | 依殘值賣出防禦塔 |
| `buySoldier` | 前端 $\rightarrow$ 伺服器/沙盒 | `soldierType` | 徵召單位 (`BASIC` / `HEAVY`) |
| `healSoldier` | 前端 $\rightarrow$ 伺服器/沙盒 | `soldierId` | 包紮治療單位 |
| `sellSoldier` | 前端 $\rightarrow$ 伺服器/沙盒 | `soldierId` | 賣出單位 |
| `abandonSoldier` | 前端 $\rightarrow$ 伺服器/沙盒 | `soldierId` | 野放單位為中立狀態 |
| `toggleArmyState` | 前端 $\rightarrow$ 伺服器/沙盒 | 無 | 切換軍隊戰術 (`GUARD` / `FREE` / `HOLD`) |
| `teleportCore` | 前端 $\rightarrow$ 伺服器/沙盒 | 無 | 指揮官傳送回基地核心 |
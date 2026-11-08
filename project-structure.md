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

5. **戰鬥與物理計算守則 (Combat & Physics Rules)**
   - **冷卻制傷害**：單位與怪物的戰鬥統一採用冷卻時間（如 0.8s 週期），避免每 Tick 產生微小連續傷害，以維護伺服器運算效能並提供明確打擊感。
   - **點擊判定圖層順序 (`findEntityAtPos`)**：嚴格維持 `小兵 > 指揮官 > 怪物 > 防禦塔 > 基地核心`，防禦塔僅採矩形範圍碰撞，防止搶走小兵/玩家點擊。

---

## 📁 二、 目錄結構與模組快取標記

CoreClash.io/
├── public/                    # 前端靜態資源與繪圖邏輯
│   ├── css/
│   │   └── style.css          # UI 賽博風格樣式與動態 modal 佈局
│   ├── js/
│   │   ├── game.js            # 前端通訊與主控台 (🟢 DOM矩形快取、e.repeat防爆、rAF純繪圖迴圈、圖層順序)
│   │   ├── render.js          # Canvas 繪圖核心 (🟢 0.8s 受擊紅光閃爍、傷害飄字、預建築精準提示)
│   │   └── ui.js              # 介面與彈窗模组 (🟢 UI/HUD 雙重狀態快取、DOM 節點快取、4段移速變色)
│   └── index.html             # 主頁面 DOM 結構與 Modal 容器
├── server/                    # 伺服器端核心邏輯
│   ├── config.js              # 常數配置 (🟢 初級/重裝兵負重 1/2、怪物半徑、動態懸賞與分數權重)
│   ├── combatManager.js       # 戰鬥與 AI 核心 (🟢 0.8s 冷卻傷害算式、怪物卡位切換仇恨、實體推擠與中立招募)
│   ├── allianceManager.js     # 聯盟機制 (🟢 創立/加入/招募模式/特邀與挖腳邏輯)
│   └── server.js              # 伺服器入口 (🟢 Socket 事件處理、賣出/修復殘值安全結算、防 NaN 保護)
└── project-structure.md       # 專案架構與開發維護筆記

---

## ⚙️ 三、 模組實作與戰術細節紀錄

### 1. DOM 與效能優化 (Performance Caching & Event Loop)
* **Canvas 矩形快取 (`cachedCanvasRect`)**：
  * 將 `canvas.getBoundingClientRect()` 快取於全域，僅在 `resize` 與 `scroll` 時重新計算。高頻 `mousemove` 零 DOM 讀取開銷，徹底避免 Forced Reflow。
* **OS 按鈕自動重複過濾 (`e.repeat`)**：
  * `keydown` 事件中加入 `if (e.repeat) return;`，丟棄作業系統發出的重複按鍵封包，防止長按 WASD 時塞爆事件佇列導致 `keyup` 延遲發射（解決走直線煞不住車的問題）。
* **渲染迴圈與 DOM 繪圖解耦 (`renderLoop`)**：
  * 採用 `requestAnimationFrame` 專職處理 Canvas 畫圖與滑鼠世界座標即時對齊；`updateHUD` DOM 數據寫入僅交由 `socket.on('gameState')` 觸發，實施完全解耦。
* **DOM 節點與 HTML 狀態雙重快取 (`uiElements` / `lastLbHTMLCache`)**：
  * 全域快取 UI 節點（`uiElements`）；排行榜僅在 DOM 生成字串改變時覆寫；HUD 與選單按鈕比對 Key 值（`lastUIStateCache`, `lastHudDataCache`），避免每一幀重複刷 DOM。

### 2. 戰鬥系統與打擊反饋 (Combat Cooldown & Visual FX)
* **0.8 秒冷卻傷害算式**：
  * 小兵與怪物戰鬥攻擊週期設為 `0.8s`，單次傷害補償放大為 $1.6 \times \text{ATK}$，保持等效 DPS 相同。
* **受擊紅光 (Hit Flash)**：
  * 單位受傷時更新 `lastHitTick`，`render.js` 於 10 幀內渲染 55% 透明度外發光紅光。
* **傷害數值飄字 (Damage Numbers)**：
  * 一般單位與防禦塔受擊彈出紅色數字 (`-XX`)；紫晶怪物受擊彈出紫色數字。

### 3. 怪物 AI 與物理碰撞 (Monster AI & Physics)
* **實體碰撞半徑**：
  * 普通怪 `RADIUS: 8`，突襲精英怪 `RADIUS: 10`，併入全局圓形推擠與地圖邊界約束。
* **卡位自動切換仇恨 (Pathfinding Aggro)**：
  * 怪物移動前檢測前方障礙物，若距離防禦塔/指揮官/小兵 $< (\text{半徑和} + 5\text{px})$，立即切換仇恨優先擊碎眼前障礙。

### 4. 負重與移動速度 (Weight & Movement Mechanics)
* **軍隊負重系統**：
  * 初級步兵負重 = `1`，中級裝甲兵負重 = `2`。
  * 總負重上限為 `70`。移速依負重比例衰減，最低保底為 `40%` 速度。
* **4 段 UI 移速顏色標記**：
  * $> 80\%$: 綠色 (`#00ff66`)
  * $51\% \sim 80\%$: 黃色 (`#ffb700`)
  * $21\% \sim 50\%$: 紅色 (`#ff0055`)
  * $\le 20\%$: 暗紅色 (`#800000`)[cite: 4, 10]

### 5. 建築與互動機制 (Placement & Interaction)
* **精準 placement 失敗提示**：
  * 預建築模式動態即時顯示失敗原因：「💰 金幣不足」、「🚫 超出地圖邊界」、「📡 超出基地核心領地範圍 (350px)」、「⚠️ 該位置已被佔據」[cite: 4, 10]。
* **點擊圖層優先順序 (`findEntityAtPos`)**：
  * `1. 部隊小兵` $\rightarrow$ `2. 指揮官` $\rightarrow$ `3. 怪物` $\rightarrow$ `4. 防禦塔 (精準矩形)` $\rightarrow$ `5. 基地核心`[cite: 4, 10]。

### 6. 戰術選單與建築殘值 (Buildings & Economy)
* **殘值安全計算**：
  * 防禦塔與小兵賣出價格根據殘餘血量比例計算：$\text{退款} = \lfloor \text{最大退款} \times (\text{當前 HP} / \text{最大 HP}) \rfloor$[cite: 4, 10]。
  * 修復 / 治療費用根據缺損血量動態比例扣除金幣[cite: 4, 10]。

---

## 📡 四、 伺服器通訊協定與資料結構 (Socket & State Schema)

### 1. 核心 `gameState` 物件結構
* `tickCount`: 伺服器 60FPS 累計 Tick 數[cite: 4, 10]。
* `players`: `{ [playerId]: { id, name, gold, hp, maxHp, x, y, speedRatio, armyState, allianceId, core: {...}, army: [...] } }`[cite: 4, 10]
* `towers`: `[ { id, ownerId, type, x, y, hp, maxHp, range, atk, cooldownSec } ]`[cite: 4, 10]
* `monsters`: `[ { id, targetPlayerId, x, y, hp, maxHp, atk, speed, isRaid } ]`[cite: 4, 10]
* `neutralSoldiers`: `[ { id, x, y, hp, maxHp, atk, speed, type } ]`[cite: 4, 10]
* `lasers`: `[ { x1, y1, x2, y2, color } ]`[cite: 4, 10]
* `events`: `[ { type: 'EXPLOSION' | 'FLOAT_TEXT', x, y, color, text } ]`[cite: 4, 10]

### 2. 關鍵 Socket 指令對照表
| Socket 事件名稱 | 觸發來源 | 帶入參數 (Payload) | 說明 |
| :--- | :--- | :--- | :--- |
| `joinGame` | 前端 $\rightarrow$ 伺服器 | `{ persistentId, nickname }` | 登入/重新連線遊戲 |
| `playerInput` | 前端 $\rightarrow$ 伺服器 | `{ w, a, s, d }` | 60FPS 傳送移動鍵盤狀態 |
| `placeCore` | 前端 $\rightarrow$ 伺服器 | `{ x, y }` | 放置初始基地核心 |
| `buyTower` | 前端 $\rightarrow$ 伺服器 | `{ x, y, type }` | 建造防禦塔 (`BASIC` / `ADVANCED`) |
| `repairTower` | 前端 $\rightarrow$ 伺服器 | `towerId` | 修復防禦塔 |
| `sellTower` | 前端 $\rightarrow$ 伺服器 | `towerId` | 依殘值賣出防禦塔 |
| `buySoldier` | 前端 $\rightarrow$ 伺服器 | `soldierType` | 徵召單位 (`BASIC` / `HEAVY`) |
| `healSoldier` | 前端 $\rightarrow$ 伺服器 | `soldierId` | 包紮治療單位 |
| `sellSoldier` | 前端 $\rightarrow$ 伺服器 | `soldierId` | 賣出單位 |
| `abandonSoldier` | 前端 $\rightarrow$ 伺服器 | `soldierId` | 野放單位為中立狀態 |
| `toggleArmyState` | 前端 $\rightarrow$ 伺服器 | 無 | 切換軍隊戰術 (`GUARD` / `FREE` / `HOLD`) |
| `teleportCore` | 前端 $\rightarrow$ 伺服器 | 無 | 指揮官傳送回基地核心 |
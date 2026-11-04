CoreClash.io/
├── node_modules/              # Node.js 依賴套件包
├── public/                    # 前端靜態資源與繪圖邏輯
│   ├── css/
│   │   └── style.css          # UI 樣式表
│   ├── js/
│   │   ├── ui.js              # 介面與彈窗模組 (HUD 速度狀態列與 4 段血量/速度警戒色)
│   │   └── render.js          # Canvas 繪圖核心 (動態殘值退款 Tooltip、步長截斷平滑渲染)
│   ├── game.js                # 前端網絡與主控台
│   └── index.html             # 主頁面 HTML 結構
├── server/                    # 伺服器邏輯模組
│   ├── config.js              # 常數配置 (負重減速上限 70、殘值退款基數、AI 視線與追擊參數)
│   ├── allianceManager.js     # 聯盟機制 (創建、招募、挖角與權限控管)
│   └── combatManager.js       # 戰鬥與 AI 核心 (動態陣形門檻、追擊脫戰、鎖步跟隨與離身加速算式)
├── .gitignore                 # Git 忽略設定
├── package.json               # 專案套件設定
├── project-structure.md       # 專案架構與開發筆記 (🟢 最新)
└── server.js                  # 伺服器入口 (Socket 事件監聽、殘值安全結算與防 NaN 保護)
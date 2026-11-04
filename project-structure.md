CoreClash.io/
├── node_modules/              # Node.js 依賴套件包
├── public/                    # 前端靜態資源與繪圖邏輯 (🟢 HUD 移動速度與 4 段變色，≤20% 暗紅警戒色)
│   ├── css/
│   │   └── style.css          # UI 樣式表
│   ├── js/
│   │   ├── ui.js              # 介面與彈窗控制模組 (updateHUD 新增移動速度與 >80%綠 / 51-80%黃 / 21-50%紅 / <=20%暗紅 變色)
│   │   └── render.js          # 畫面渲染與繪圖核心模組
│   ├── game.js                # 前端主控制台
│   └── index.html             # 主頁面 HTML 結構 (HUD 新增 ⚡ 移動速度 顯示欄位)
├── server/                    # 伺服器 logic 模組 (🟢 部隊負重減速與賣殘值扣減)
│   ├── config.js              # 常數配置 (新增 70 負重減速參數與 SOLDIER 負重屬性)
│   ├── allianceManager.js     # 聯盟邏輯核心
│   └── combatManager.js       # 戰鬥與 AI 邏輯核心 (實作 70 負重達 40% 最低速度保底、護衛部隊鎖步無延遲跟隨)
├── .gitignore                 # Git 忽略設定
├── package.json               # 專案套件設定
├── project-structure.md       # 專案詳細結構說明檔案 (🟢 最新)
└── server.js                  # 伺服器入口 (賣塔 / 賣兵實作損壞殘值退款與 (HP%) 飄字特效)
CoreClash.io/
├── node_modules/              # Node.js 依賴套件包
├── public/                    # 前端靜態資源與繪圖邏輯 ( 離線灰字標註與 5 位頂格排行榜動態釘選)
│   ├── css/
│   │   └── style.css          # UI 樣式表 (新增 .lb-row.offline 離線灰字樣式)🟢
│   ├── js/
│   │   ├── ui.js              # 介面與彈窗控制模組🟢
│   │   │   ├── 排行榜頁籤切換: switchLbTab() (支援個人/聯盟榜 Top 4 + 第 5 位動態釘選自己/自己聯盟)
│   │   │   ├── 自訂對話框: showCustomConfirm(), closeCustomConfirm()
│   │   │   ├── 聯盟 UI 互動: createAllianceFromUI(), leaveAllianceFromUI(), respondInviteFromUI(), respondAllianceApp()
│   │   │   ├── Modal 控制: openSettingsModal(), openMembersModal(), closeMembersModal()
│   │   │   ├── UI 清理與高亮修復: updateUI() (新增 Class 全量重置防殘留機制)
│   │   │   └── 數據與排行榜更新: updateHUD() (離線玩家名稱自動灰字標註)
│   │   └── render.js          # 畫面渲染與繪圖核心模組
│   │       ├── 座標轉換: worldToScreen(), screenToWorld()
│   │       ├── 繪圖輔助: getHpBarAlpha(), createExplosion(), addFloatingText()
│   │       ├── 特效與領地: drawClampedGroundAura(), drawTooltipScreen()
│   │       └── 實體與畫布主繪畫: drawGameScene()
│   ├── game.js                # 前端主控制台 (returnToLobby 離場調度與 Socket 派發)🟢
│   └── index.html             # 主頁面 HTML 結構🟢
├── server/                    # 伺服器 logic 模組 ( 20 秒週期積分計算與時間經驗離線凍結)
│   ├── config.js              # 常數配置 (SCORE_WEIGHTS 權重與 DYNAMIC_BOUNTIES 參數)🟢
│   ├── allianceManager.js     # 聯盟邏輯核心🟢
│   └── combatManager.js       # 戰鬥與 AI 邏輯核心 (離線玩家 survivalTime 經驗凍結、20 秒全量 Tick 積分計算)🟢
├── .gitignore                 # Git 忽略設定
├── package.json               # 專案套件設定
├── project-structure.md       # 專案詳細結構說明檔案 ( 最新)🟢
└── server.js                  # 伺服器入口🟢
# Red Rock 攀岩地图

个人用的离线地图：Red Rock Canyon 第一、第二停车点周围九个岩壁的开车路线、进山路线（二维/三维）和线路清单。

- `site/` 是发布的网页，推到 main 后自动测试并发布。
- `build.py` 从 `data-src/`（OpenStreetMap 摘录、Mountain Project 页面整理）生成 `site/data.js`。哪些线算“首选/同级/热身”在 `classify()` 里定，`tests/check.mjs` 守着这条规则。
- `data-src/scrape.py` 重新抓取线路资料。

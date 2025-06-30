const WebSocket = require("ws");
const ngrok = require("ngrok");
const express = require("express");
const cors = require("cors");

const WS_PORT = 8888;
const API_PORT = 3001;

const app = express();
app.use(cors());

// ===== 狀態追蹤 =====
let ngrokUrl = "";
let hasControlConnected = false;
let hasDisplayConnected = false;

function printStatus() {
  console.clear();
  console.log(
    "============================================================================"
  );
  console.log(`🌐 ws 啟動在 ws://localhost:${WS_PORT}`);
  console.log(`🚀 Express API 啟動在 http://localhost:${API_PORT}`);
  console.log(`🌐 ngrok 外部位址：${ngrokUrl.replace("http", "ws")}`);
  console.log(`控制端: ${hasControlConnected ? "已連線" : "未連線"}`);
  console.log(`顯示端: ${hasDisplayConnected ? "已連線" : "未連線"}`);
}

// 建立 WebSocket Server
const wss = new WebSocket.Server({ port: WS_PORT });

wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress;
  ws.role = "display"; // ✅ 預設所有連線都是顯示端
  hasDisplayConnected = true;

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);

      // 只要這個 ws 傳送過資料，就標記為控制端
      if (ws.role !== "control") {
        ws.role = "control";
        hasControlConnected = true;

        // 檢查顯示端是否還存在
        const hasAnyDisplay = Array.from(wss.clients).some(
          (c) => c.readyState === WebSocket.OPEN && c !== ws
        );
        hasDisplayConnected = hasAnyDisplay;
        printStatus();
      }

      // ✅ 控制端廣播給其他（display）用戶
      if (ws.role === "control") {
        wss.clients.forEach((client) => {
          if (
            client !== ws &&
            client.readyState === WebSocket.OPEN &&
            client.role === "display"
          ) {
            client.send(JSON.stringify(data));
          }
        });
      }
    } catch (err) {
      console.error("❌ JSON 解析錯誤：", err.message);
    }
  });

  ws.on("close", () => {
    // 如果控制端斷線
    if (ws.role === "control") {
      hasControlConnected = false;
    }

    // 檢查是否還有顯示端
    const stillHasDisplay = Array.from(wss.clients).some(
      (c) => c.readyState === WebSocket.OPEN && c.role === "display"
    );
    hasDisplayConnected = stillHasDisplay;

    printStatus();
  });
});

// 提供 ngrok URL
app.get("/ngrok-url", (req, res) => {
  if (ngrokUrl) {
    res.json({
      "ngrok-url": ngrokUrl.replace("http", "ws"),
      "local-url": `ws://localhost:${WS_PORT}`,
    });
  } else {
    res.status(503).json({ url: "ngrok 尚未啟動" });
  }
});

// 啟動 Express API
app.listen(API_PORT);

// 啟動 ngrok
(async () => {
  try {
    ngrokUrl = await ngrok.connect({
      addr: WS_PORT,
      proto: "http",
    });
    printStatus();
  } catch (err) {
    console.error("❌ 無法啟動 ngrok：", err.message);
  }
})();

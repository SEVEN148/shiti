# 后端部署说明

GitHub Pages 只能托管静态网页，不能运行 `server.js`，所以视频链接提取、后端 OCR、接口请求这类功能需要部署到支持 Node.js 的平台。

## 推荐平台

优先用 Render 或 Railway。这个项目已经包含 `server.js` 和 `render.yaml`，最简单的是 Render。

## Render 部署步骤

1. 打开 https://render.com/ 并登录。
2. 选择 New Web Service。
3. 连接 GitHub 仓库 `SEVEN148/shiti`。
4. Build Command 填 `npm install`。
5. Start Command 填 `npm start`。
6. 部署完成后，使用 Render 给出的 `https://...onrender.com` 地址访问应用。

## 功能边界

- 当前后端可以根据公开视频链接抓取页面标题、简介和公开文字。
- 如果平台不公开字幕，后端无法直接听懂视频声音。
- 要稳定识别数学题、图片题或视频语音，需要继续接入视觉/语音识别服务，例如 OpenAI Vision、云 OCR 或 ASR 服务。
- GitHub 仍然用来存代码；真正能运行后端的网站要访问 Render/Railway/Vercel 等平台给出的地址。

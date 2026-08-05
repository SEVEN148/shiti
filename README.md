# shiti

拾题学习助手是一个面向中学生的网页应用，包含拍照识题、错题库、随机组卷、专注计时、学习规划、作文素材和英语词汇复习等模块。

## 在线访问

发布后访问：

https://seven148.github.io/shiti/

## 本地运行

```bash
npm install
npm start
```

然后打开 `http://127.0.0.1:4173/`。

## 说明

- 本项目为纯前端学习工具，学习数据保存在浏览器本地。
- OCR 英语识别使用本地 `ocr-data/eng.traineddata.gz` 和浏览器端 Tesseract.js。
- 随机组卷导出依赖 html2canvas。

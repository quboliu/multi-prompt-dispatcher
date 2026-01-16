# 🚀 快速开始测试 Phase 2

## 30秒快速测试

### 步骤 1: 重新加载扩展（10秒）
1. 打开 `chrome://extensions/`
2. 找到 "Multi-LLM Prompt Dispatcher"
3. 点击「🔄 重新加载」

### 步骤 2: 打开 ChatGPT（5秒）
1. 访问 `https://chat.openai.com`（确保已登录）
2. 等待页面完全加载

### 步骤 3: 运行诊断脚本（5秒）
1. 按 `F12` 打开控制台
2. 打开项目中的 `diagnostic.js` 文件
3. 复制全部内容，粘贴到控制台并回车
4. 查看诊断结果

**预期：** 看到一堆 ✅ 绿色对勾

### 步骤 4: 打开 Dashboard（5秒）
1. 按 `Ctrl + Shift + D`
2. 应该看到一个带有 ChatGPT 卡片的页面

### 步骤 5: 发送测试 Prompt（5秒）
1. 切回 ChatGPT 标签页
2. 输入："Hi, 请回复一个简单的问候"
3. 发送

### 步骤 6: 观察 Dashboard 魔法 ✨
1. 切换到 Dashboard 标签页
2. 你应该看到：
   - 卡片顶部显示「生成中...」
   - 顶部有紫色动画进度条
   - **文字实时跳动出现**（这就是影子镜像！）
   - 生成完成后状态变为「已完成」

---

## 🎉 如果看到实时文字跳动 = 成功！

恭喜！Phase 2 的核心技术已经工作了！

---

## 🐛 如果没有更新？

### 快速排查：

1. **刷新 Dashboard**（按 F5）
2. **检查控制台** 是否有红色错误
3. **重新运行诊断脚本** 看是否有 ❌

### 最常见的问题：

**问题：Dashboard 显示"暂无输出"**
- 原因：监听未自动启动
- 解决：在 ChatGPT 控制台执行：
  ```javascript
  chrome.runtime.sendMessage({type: 'START_OBSERVING'});
  ```
  然后重新发送 Prompt

---

## 📖 详细测试指南

查看 `TESTING.md` 了解完整测试流程和诊断方法。

---

## 🎯 测试重点

Phase 2 验证版本的核心是验证：
1. ✅ **实时捕获** - MutationObserver 能监听 DOM 变化
2. ✅ **数据传递** - Content → Background → Dashboard 通信链路
3. ✅ **流式渲染** - Dashboard 能实时显示跳动的文字

如果这三点都OK，就可以扩展到其他平台了！

---

**开始测试吧！** 🚀

# Phase 2 - ChatGPT 监听功能测试指南

## 📋 测试准备

### 1. 重新加载扩展

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 找到 "Multi-LLM Prompt Dispatcher"
4. 点击「重新加载」按钮 🔄
5. 确认扩展图标正常显示

### 2. 打开开发者工具（重要！）

为了观察日志和调试，建议打开以下开发者工具：

**A. Background Service Worker 控制台**
- 在 `chrome://extensions/` 页面
- 找到插件，点击「service worker」链接
- 应该看到：`[Background] Service worker initialized`

**B. ChatGPT 页面控制台**
- 打开 `https://chat.openai.com` 或 `https://chatgpt.com`
- 按 `F12` 打开开发者工具
- 切换到 Console 标签
- 应该看到：`[MultiLLM] Loaded ChatGPT adapter`

**C. Dashboard 页面控制台**
- 打开 Dashboard 后按 `F12`
- 查看控制台日志

---

## 🧪 测试流程

### 测试一：基础页面加载

**步骤：**
1. 访问 `https://chat.openai.com`（确保已登录）
2. 按 `F12` 打开控制台
3. 查看日志

**预期结果：**
```
[MultiLLM] Loaded ChatGPT adapter
[MultiLLM] Started observing ChatGPT responses  (如果自动启动了监听)
```

**如果没有看到日志：**
- 检查扩展是否正确加载
- 刷新页面 (F5)
- 检查 manifest.json 的 content_scripts 配置

---

### 测试二：打开 Dashboard

**步骤：**
1. 确保 ChatGPT 标签页已打开
2. 按 `Ctrl + Shift + D`（Windows/Linux）或 `Cmd + Shift + D`（Mac）
3. 应该打开一个新标签页显示 Dashboard

**预期结果：**
- Dashboard 页面正常显示
- 控制栏显示布局选择器、Prompt 输入按钮等
- Grid 区域显示至少一个 ChatGPT 卡片
- 卡片显示：
  - 💚 ChatGPT
  - 状态：等待中...
  - 内容：暂无输出

**如果 Dashboard 没有显示卡片：**
1. 点击右上角的刷新按钮 🔄
2. 检查 Dashboard 控制台是否有错误
3. 检查 ChatGPT 标签页是否真的打开

---

### 测试三：手动启动监听

在 ChatGPT 标签页的控制台中，手动启动监听：

**步骤：**
1. 切换到 ChatGPT 标签页
2. 打开控制台（F12）
3. 执行以下命令：

```javascript
// 检查适配器是否加载
console.log('Adapter:', window.currentAdapter);

// 检查是否支持监听
console.log('Has startObserving:', typeof window.currentAdapter.startObserving);

// 手动测试提取功能
console.log('Latest response:', window.currentAdapter.extractLatestResponse());
```

**预期结果：**
```javascript
Adapter: ChatGPTAdapter {name: "chatgpt", displayName: "ChatGPT", icon: "💚", ...}
Has startObserving: function
Latest response: null  (如果还没有对话)
```

---

### 测试四：发送 Prompt 并监听响应

**步骤：**

1. **在 ChatGPT 页面手动发送一个简单问题**
   - 例如："请用一句话介绍什么是 AI？"
   
2. **观察 ChatGPT 控制台**
   预期日志（如果监听已启动）：
   ```
   [ChatGPT Adapter] Started observing responses
   ```

3. **当 ChatGPT 开始生成回答时，观察控制台**
   应该不断看到 MutationObserver 触发

4. **切换到 Dashboard 标签页**
   - ChatGPT 卡片应该显示：
     - 状态：生成中...（带动画进度条）
     - 内容：实时更新的文字
   
5. **等待生成完成**
   - 状态变为：已完成
   - 内容显示完整回答
   - 动画进度条消失

---

### 测试五：多轮对话监听

**步骤：**

1. 在 ChatGPT 页面继续追问（例如："能举个例子吗？"）
2. 观察 Dashboard 中的卡片内容是否更新为最新回答

**预期结果：**
- Dashboard 自动显示最新一条助手回答
- 旧的回答被覆盖（这是预期行为，Phase 2 验证版只显示最新回答）

---

### 测试六：统一发送功能

**步骤：**

1. 在 Dashboard 中点击「✏️ 输入 Prompt」按钮
2. 在弹出的输入框中输入：
   ```
   请用三个词描述量子计算
   ```
3. 点击「发送到所有选中模型」
4. 观察 ChatGPT 标签页是否自动收到并发送了这个 Prompt

**预期结果：**
- ChatGPT 页面的输入框自动填充了 Prompt
- 自动点击了发送按钮
- ChatGPT 开始生成回答
- Dashboard 中的卡片实时更新

---

### 测试七：布局切换

**步骤：**

1. 在 Dashboard 顶部的布局选择器中切换不同选项：
   - 1 × 2
   - 2 × 2
   - 1 × 3
   - 3 × 1

**预期结果：**
- Grid 布局实时变化
- 卡片重新排列
- 内容保持不变

---

### 测试八：点击卡片跳转

**步骤：**

1. 在 Dashboard 中点击 ChatGPT 卡片的任意位置
2. 观察是否跳转到对应的 ChatGPT 标签页
3. 该标签页应该变为激活状态

---

### 测试九：全屏模式

**步骤：**

1. 在 Dashboard 中点击右上角的全屏按钮 ⛶
2. 页面进入全屏模式
3. 再次点击退出全屏

**预期结果：**
- 进入/退出全屏流畅
- 内容正常显示

---

## 🐛 常见问题诊断

### 问题 1：Dashboard 显示"暂无输出"且不更新

**可能原因：**
- 监听未启动
- 消息传递失败

**诊断步骤：**

1. **检查 Content Script 监听状态**
   在 ChatGPT 控制台执行：
   ```javascript
   // 检查是否正在监听
   console.log('Observing:', window.currentAdapter);
   ```

2. **手动启动监听**
   在 ChatGPT 控制台执行：
   ```javascript
   chrome.runtime.sendMessage({type: 'START_OBSERVING'}, (response) => {
     console.log('Start observing result:', response);
   });
   ```

3. **测试消息广播**
   在 Background Service Worker 控制台执行：
   ```javascript
   chrome.tabs.query({}, (tabs) => {
     console.log('All tabs:', tabs.map(t => ({id: t.id, url: t.url})));
   });
   ```

---

### 问题 2：内容不同步

**解决方案：**
1. 刷新 Dashboard (F5)
2. 点击 Dashboard 的刷新按钮 🔄
3. 重新加载 ChatGPT 页面

---

### 问题 3：DOM 选择器失效

ChatGPT 的 UI 可能已更新，导致选择器失效。

**诊断：**
在 ChatGPT 控制台执行：
```javascript
const adapter = window.currentAdapter;

// 检查各个选择器
console.log('Response container:', adapter.getResponseContainer());
console.log('Input element:', adapter.getInputElement());
console.log('Send button:', adapter.getSendButton());

// 检查消息结构
const messages = document.querySelectorAll('[data-message-author-role]');
console.log('Message groups:', messages);
console.log('Roles:', Array.from(messages).map(m => m.getAttribute('data-message-author-role')));
```

**如果返回 null：**
- 打开 ChatGPT 页面的 Elements 标签
- 手动检查消息容器的 DOM 结构
- 更新 `chatgpt.js` 中的选择器

---

## ✅ 测试检查清单

- [ ] 扩展成功加载
- [ ] ChatGPT 适配器初始化正常
- [ ] Dashboard 可以通过快捷键打开
- [ ] Dashboard 正确显示 ChatGPT 卡片
- [ ] 发送 Prompt 后，Dashboard 实时显示流式输出
- [ ] 生成状态正确显示（生成中/已完成）
- [ ] 多轮对话能持续监听
- [ ] 统一发送功能正常
- [ ] 布局切换流畅
- [ ] 点击卡片能跳转到原标签页
- [ ] 全屏模式正常

---

## 📸 预期效果截图描述

### Dashboard 空状态
- 深色背景
- 中央显示火箭图标 🚀
- 提示文字："欢迎来到指挥中心"

### Dashboard 有卡片（等待中）
- ChatGPT 卡片：
  - 顶部：💚 ChatGPT | 等待中...
  - 内容："暂无输出"

### Dashboard 有卡片（生成中）
- ChatGPT 卡片：
  - 顶部：💚 ChatGPT | 生成中...
  - 卡片顶部有紫色动画进度条
  - 内容：实时更新的文字（逐字出现）

### Dashboard 有卡片（已完成）
- ChatGPT 卡片：
  - 顶部：💚 ChatGPT | 已完成
  - 内容：完整的回答文本

---

## 🎯 测试成功标准

如果以上所有测试通过，说明：
1. ✅ Phase 2 的核心技术（影子镜像）已成功实现
2. ✅ ChatGPT 监听功能完全可用
3. ✅ 可以进行下一步：扩展到 Claude 和 Gemini

---

祝测试顺利！如有问题，请记录：
- 错误日志（控制台）
- 预期行为 vs 实际行为
- 操作步骤

# Chrome Extension 实时流式数据同步问题解决全记录

## 📋 问题描述

在开发 Multi-LLM Prompt Dispatcher 扩展的 Phase 2（Shadow Dashboard）时，我们需要实现一个关键功能：**在 Dashboard 页面实时显示 ChatGPT 页面的流式响应**。

### 核心需求
- 用户在 ChatGPT 页面发送消息
- Dashboard 页面实时显示 ChatGPT 的流式输出
- 用户可以**只看 Dashboard**，无需切换回 ChatGPT 页面

### 遇到的问题
当用户盯着 Dashboard 页面时，ChatGPT 页面在后台，**Dashboard 无法实时接收更新**。只有当用户切换到 ChatGPT 页面再切回 Dashboard 时，内容才会一次性出现。

---

## 🔬 尝试历程与原因分析

### 尝试 1：使用 MutationObserver 监听 DOM 变化

#### 方案
在 ChatGPT 页面使用 `MutationObserver` 监听对话容器的 DOM 变化，当检测到变化时通过消息传递发送到 Dashboard。

```javascript
const observer = new MutationObserver((mutations) => {
    const response = extractLatestResponse();
    sendUpdate(response);
});
observer.observe(container, { childList: true, subtree: true, characterData: true });
```

#### 结果
**失败** - 盯着 Dashboard 时不更新，切换页面后才更新。

#### 原因分析
Chrome 对**后台标签页的 DOM 渲染进行了优化**：
1. 当标签页不可见时，浏览器会暂停或降低该页面的渲染优先级
2. DOM 更新被延迟执行，只有当用户切回该标签页时才会批量更新
3. `MutationObserver` 依赖于 DOM 变化，DOM 不更新就不会触发回调
4. 这是浏览器的**性能优化机制**，无法绑过

---

### 尝试 2：使用 requestAnimationFrame 优化更新

#### 方案
使用 `requestAnimationFrame` 来调度更新，希望利用浏览器的渲染周期来流畅更新。

```javascript
const observer = new MutationObserver((mutations) => {
    if (pendingUpdate) return;
    pendingUpdate = true;
    requestAnimationFrame(() => {
        pendingUpdate = false;
        sendUpdate(extractLatestResponse());
    });
});
```

#### 结果
**失败** - 问题更严重了，完全不更新。

#### 原因分析
`requestAnimationFrame` 在后台标签页中**完全不会执行**！
1. `requestAnimationFrame` 设计用于动画，与屏幕刷新率同步
2. 当标签页不可见时，浏览器认为没有必要执行动画
3. 所以 `requestAnimationFrame` 回调被无限期暂停
4. 只有当标签页重新可见时，积压的回调才会执行

**教训**：`requestAnimationFrame` 不适合后台任务。

---

### 尝试 3：使用 setTimeout(0) 替代

#### 方案
将 `requestAnimationFrame` 替换为 `setTimeout(0)`，理论上 `setTimeout` 在后台也能执行。

```javascript
const observer = new MutationObserver((mutations) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
        sendUpdate(extractLatestResponse());
    }, 0);
});
```

#### 结果
**失败** - 仍然需要切换页面才更新。

#### 原因分析
虽然 `setTimeout(0)` 理论上可以在后台执行，但问题的根源不在这里：
1. **根本问题是 DOM 没有更新**
2. `MutationObserver` 依赖 DOM 变化
3. 后台标签页的 DOM 渲染被暂停
4. 所以 `MutationObserver` 根本没有机会触发
5. `setTimeout` 能执行没用，因为它根本没被调用

**关键洞察**：问题不在于回调如何调度，而在于**回调根本没有被触发**。

---

### 尝试 4：Dashboard 主动轮询

#### 方案
让 Dashboard 每 100ms 主动向 ChatGPT 页面请求最新数据，而不是被动等待推送。

```javascript
setInterval(async () => {
    const response = await chrome.runtime.sendMessage({
        type: 'GET_LATEST_RESPONSE_FROM_TAB',
        tabId: chatgptTabId
    });
    if (response.success) {
        updateUI(response.data);
    }
}, 100);
```

#### 结果
**失败** - 轮询请求确实在发送，但获取的数据仍然是旧的。

#### 原因分析
轮询请求需要发送到后台标签页的 Content Script 执行，然后返回数据：
```
Dashboard → Background → ChatGPT Content Script → 执行 extractLatestResponse() → 返回
```

问题在于：
1. 后台标签页的 **JavaScript 执行也被限制**
2. 虽然消息能发送，但 Content Script 中的 `extractLatestResponse()` 读取的是**未更新的 DOM**
3. 返回的仍然是旧数据

---

### 尝试 5：Background 缓存 + Dashboard 轮询

#### 方案
当 ChatGPT 发送 `RESPONSE_UPDATE` 时，Background 将数据缓存起来。Dashboard 轮询时直接从 Background 的缓存读取，不需要再访问后台标签页。

```javascript
// Background
const responseCache = new Map();

case 'RESPONSE_UPDATE':
    responseCache.set(tabId, message.data);
    break;

case 'GET_LATEST_RESPONSE_FROM_TAB':
    sendResponse(responseCache.get(tabId));
    break;
```

#### 结果
**失败** - 缓存里没有数据，因为 `RESPONSE_UPDATE` 根本没有被发送。

#### 原因分析
这个方案假设 `RESPONSE_UPDATE` 能正常发送。但问题是：
1. `RESPONSE_UPDATE` 依赖于 `MutationObserver` 触发
2. `MutationObserver` 依赖于 DOM 更新
3. 后台标签页的 DOM 更新被暂停
4. 所以整个链条从源头就断了

---

### 尝试 6：使用 chrome.scripting.executeScript

#### 方案
使用 Chrome 的 `scripting` API 直接在目标页面执行脚本获取数据。

```javascript
const results = await chrome.scripting.executeScript({
    target: { tabId: chatgptTabId },
    func: () => {
        return window.currentAdapter.extractLatestResponse();
    }
});
```

#### 结果
**部分失败** - 返回 null。

#### 原因分析
`chrome.scripting.executeScript` 默认在 **ISOLATED 世界**执行：
1. Chrome Extension 有两个 JavaScript 执行环境：MAIN 和 ISOLATED
2. `window.currentAdapter` 是在 MAIN 世界注册的
3. ISOLATED 世界无法访问 MAIN 世界的变量
4. 需要添加 `world: 'MAIN'` 参数

修复后仍然失败的原因：
1. 即使能访问 `currentAdapter`
2. `extractLatestResponse()` 读取的还是**未更新的 DOM**
3. 根本问题没有解决

---

### 尝试 7（最终成功）：网络层拦截

#### 方案
**绕过 DOM，直接从网络层获取数据**。

ChatGPT 的流式响应是通过 HTTP/SSE 从服务器发送到浏览器的。数据在**到达 DOM 之前**就已经存在于网络层。我们可以拦截 `fetch` API，在数据到达时立即提取。

```javascript
// 保存原始 fetch
const originalFetch = window.fetch;

// 包装 fetch
window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    
    if (isConversationAPI(url)) {
        // 克隆响应（因为 body 只能读取一次）
        const clonedResponse = response.clone();
        // 处理流式响应
        processSSEStream(clonedResponse);
    }
    
    // 返回原始响应给 ChatGPT
    return response;
};
```

#### 结果
**成功！** 

#### 成功原因
1. **网络请求不受后台标签页限制**：即使页面在后台，网络请求仍然正常进行
2. **数据直接从网络层获取**：不依赖 DOM 渲染
3. **使用 `response.clone()`**：不影响 ChatGPT 原有功能
4. **SSE 流式处理**：保持了流式更新的实时性

#### 补充说明：Fetch vs WebSocket

在调试过程中，我们同时实现了 Fetch 拦截和 WebSocket 拦截。**最终起作用的是 Fetch 拦截**。

**ChatGPT 的实际实现**：
- **对话流式响应**：使用 `fetch` + SSE（Server-Sent Events）
  - 端点：`/backend-api/f/conversation`
  - 格式：`event: delta\ndata: {"v": "文本内容"}`
- **WebSocket**：仅用于其他功能（通知、状态同步等）
  - 端点：`wss://ws.chatgpt.com/ws/user/...`
  - 日志显示 `WebSocket message type: unknown`（非对话内容）

**证据**（来自成功日志）：
```
[MultiLLM Network] 🔥 Processing conversation stream for: https://chatgpt.com/backend-api/f/conversation
[MultiLLM Network] Raw chunk: event: delta
data: {"v": " Let's dive into **Go (Golang)**"}
[MultiLLM Network] 📝 Content updated: 22 chars
```

这证明了对话内容是通过 **HTTP Fetch + SSE** 传输的，而不是 WebSocket。

---

## 📊 问题根源总结

### 浏览器的后台标签页优化

Chrome（及其他现代浏览器）对后台标签页有多层优化：

| 机制 | 后台行为 | 影响 |
|------|----------|------|
| DOM 渲染 | **暂停** | MutationObserver 不触发 |
| requestAnimationFrame | **暂停** | 动画回调不执行 |
| setTimeout/setInterval | **节流到 1 秒** | 高频定时器变慢 |
| CSS 动画 | **暂停** | 视觉效果停止 |
| 网络请求 | **正常** ✅ | 唯一不受影响的 |

### 关键洞察

```
数据流动路径：

服务器 → 网络层 → JavaScript → DOM 渲染 → 用户可见
           ↑          ↓            ↓
        正常工作    可能延迟     完全暂停（后台时）
```

**正确的拦截点是网络层**，而不是 DOM。

---

## 🛠️ 最终解决方案架构

```
┌─────────────────────────────────────────────────────────────┐
│                    ChatGPT 页面（后台）                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 服务器发送 SSE 流                                        │
│       ↓                                                     │
│  2. fetch() 被我们的拦截器包装                               │
│       ↓                                                     │
│  3. 拦截器解析 SSE 数据                                      │
│       ├── response.clone() → 我们处理 → 发送到 Bridge        │
│       └── response（原始）→ ChatGPT 正常使用                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    postMessage（页面内）
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Bridge（ISOLATED 世界）                   │
│                                                             │
│  接收来自 MAIN 世界的消息，转发到 Background                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    chrome.runtime.sendMessage
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Background Service Worker                 │
│                                                             │
│  接收更新，广播到所有 Dashboard 页面                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    chrome.tabs.sendMessage
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Dashboard 页面（前台）                     │
│                                                             │
│  接收更新，实时渲染内容                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔑 关键技术点

### 1. Fetch 拦截
```javascript
const originalFetch = window.fetch;
window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    // ...处理逻辑
    return response;
};
```

### 2. Response 克隆
```javascript
// Response 的 body 只能读取一次
// 使用 clone() 创建副本，原始响应不受影响
const clonedResponse = response.clone();
```

### 3. SSE 流解析
```javascript
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value, { stream: true });
    // 解析 data: {...} 格式
}
```

### 4. ChatGPT 的数据格式
```javascript
// ChatGPT 使用增量更新格式
event: delta
data: {"v": " 新增的文本内容"}

// 需要累加内容
fullContent += json.v;
```

### 5. 在 MAIN 世界执行
```json
// manifest.json
{
    "content_scripts": [{
        "js": ["network-interceptor.js"],
        "run_at": "document_start",  // 必须在页面脚本之前
        "world": "MAIN"              // 在主世界执行才能拦截 fetch
    }]
}
```

---

## 📝 经验教训

### 1. 理解浏览器的优化机制
浏览器会对后台标签页进行多种优化。在开发需要后台运行的功能时，必须了解哪些 API 受影响。

### 2. 选择正确的数据获取层次
```
应用层（DOM）→ 容易使用，但受后台限制
网络层（fetch）→ 需要更多处理，但不受限制
```

### 3. 调试方法
- 添加详细的 console.log 追踪数据流
- 检查每个环节的日志确定问题点
- 打印原始数据格式以正确解析

### 4. 不要假设
- 不要假设后台标签页的行为与前台一致
- 不要假设所有 API 在后台都能正常工作
- 实际测试是验证的唯一方法

---

## ✅ 最终效果

- ✅ ChatGPT 在后台时仍能实时获取数据
- ✅ Dashboard 流畅的流式更新
- ✅ 不影响 ChatGPT 的原有功能
- ✅ 无需用户切换页面

---

## 📚 参考资料

1. [Chrome Background Tab Throttling](https://developer.chrome.com/blog/page-lifecycle-api/)
2. [Server-Sent Events (SSE)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
3. [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
4. [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)

---

*文档创建时间：2026-01-16*
*项目：Multi-LLM Prompt Dispatcher - Phase 2 Shadow Dashboard*

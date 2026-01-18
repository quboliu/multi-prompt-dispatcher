# 模型适配器架构概览 (Model Adapter Architecture)

MultiPromptDispatcher 的核心设计通过适配器模式实现对不同 LLM 平台（如 ChatGPT, Claude, Gemini 等）的统一调度。本文档介绍了其架构设计、组件职责及工作原理。

## 架构组成

系统由三个主要层次组成：

### 1. 基础接口层 (`BaseAdapter`)
定义了所有平台适配器必须满足的契约。它提供了一套标准的方法名（如 `setPrompt`, `sendPrompt`, `isGenerating` 等），使核心逻辑无需关注具体的平台差异。

- **`detect()`**: 识别当前页面所属平台。
- **`isReady()`**: 确认页面是否处于可交互状态（如未在生成回答中）。
- **`getInputElement()` / `getSendButton()`**: DOM 元素探测。
- **`setPrompt(text)`**: 模拟输入逻辑，处理 React/Vite 等框架的同步问题。

### 2. 模型适配层 (`adapters/*.js`)
针对具体平台的具体实现。每个文件（如 `chatgpt.js`, `deepseek.js`）都继承自 `BaseAdapter`。
- **多样化选择器**: 针对经常变化的 DOM 采用多套选择器策略。
- **交互策略**: 处理 Enter 发送与按钮点击的兼容性，模拟真实用户事件。

### 3. 网络拦截层 (`network-interceptor.js`)
这是系统的“大脑”。它不依赖 DOM，而是直接在浏览器底层拦截 API 请求（Fetch/XHR）。
- **实时响应**: 通过流式数据（SSE）或 XHR readyState 获取比 DOM 渲染更快的回答。
- **防回滚保护**: 包含复杂的逻辑，防止由于网络抖动或前端乱序解析导致的显示回滚。

## 工作流程

1. **探测与启动**: Content Script 加载后，调用 `detect()` 识别平台并初始化对应的适配器。
2. **命令执行**: Dashboard 或 Popup 发送消息到 Content Script，适配器执行 `sendPrompt`：
   - 寻找输入框。
   - 使用 `document.execCommand` 或原生 Setter 设置文本。
   - 触发 Input/Change 事件同步 React 状态。
   - 轮询寻找并触发发送按钮。
3. **响应捕获**: 
   - **主路径**: `network-interceptor.js` 拦截 API 返回的原始数据。
   - **备份路径**: 适配器通过 `MutationObserver` 监听 DOM 变化作为兜底。
4. **状态反馈**: 捕获的内容通过 `postMessage` 回传给 Dashboard 实时渲染。

## 核心挑战与应对

- **React 状态同步**: 现代前端框架常屏蔽直接的 `value` 修改。适配器通过模拟 `InputEvent` 和直接调用原生 Setter 轨道来强制触发框架的 state 更新。
- **DOM 波动**: 采用“策略化选择器”和“位置感应技术”（如：探测输入框右下角最近的 SVG 按钮）来增强鲁棒性。
- **流式解析**: 针对 Google Gemini 等复杂的响应格式（嵌套数组/混合 JSON），拦截器采用递归提取和格式对齐技术。

## 未来抽象与演进方向

基于对以上 8 个平台的深入分析，建议在下一阶段进行以下抽象改进：

### 1. 通用交互中间层 (Interaction Middleware)
目前各个适配器都在重复编写 `execCommand` 和事件派发逻辑。
- **目标**: 在 `BaseAdapter` 中抽象出 `syncValueWithFramework(element, value)` 方法。
- **实现**: 该方法可以自动判断当前框架（通过检测 `_valueTracker` 或 Tiptap 特征），并选择最适合的同步策略（execCommand 还是原生 Setter）。

### 2. 几何感知引擎 (Geometric Sensing Engine)
针对 CSS Module 和混淆类名导致的按钮定位失败。
- **目标**: 实现一套标准的“视觉锚点定位”工具。
- **实现**: 输入框（Input）作为锚点，自动计算其东南象限的候选交互元素。结合图标路径（SVG Path）的指纹匹配，甚至可以实现无类名依赖的精准点击。

### 3. 可扩展解析引擎 (Interception Engine v2)
目前拦截器的解析逻辑分散在巨大的 `PLATFORM_CONFIGS` 对象中。
- **目标**: 将解析逻辑解耦为“策略链”。
- **实现**: 定义 `JSONPathStrategy`, `SSESuffixStrategy`, `ArrayRecursionStrategy` 等标准解析元单元，平台适配只需申明这些单元的组合。

### 4. 自动化回归测试 (Autonomous Verification)
AI 网页更新极快。
- **建议**: 建立一个自动化监控脚本，定期在后台静默运行各适配器的 `getStatus()` 方法。一旦某个平台的 `hasInput` 或 `hasSendButton` 在连续 3 次探测中为 false，立即通过监控系统告警，以便在用户发现前完成热修复。

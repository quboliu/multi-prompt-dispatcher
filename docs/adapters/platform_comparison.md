# LLM 平台前端技术栈对比与技术架构评比报告

本文档对 MultiPromptDispatcher 适配的 8 大 LLM 平台进行了横向对比，并从技术设计、工程质量及扩展性角度进行了综合评比排名。

## 1. 平台技术栈横向对比

| 平台 | 前端框架 | 编辑器/输入组件 | 网络协议 | DOM 稳定性 | 特色技术 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Claude** | React / Next.js | ProseMirror | SSE / Custom | 极高 (语义化强) | 严格的 Fieldset 隔离 |
| **ChatGPT** | React / Next.js | ProseMirror/Textarea | SSE | 高 (规范先行) | 流式数据增量合并算法 |
| **DeepSeek** | React | Textarea (受控) | OpenAI Style SSE | 中 (CSS Modules) | 高性能 React 状态流 |
| **Doubao** | React | Semi Design | Standard SSE | 高 (组件库标准) | 字节 Semi Design 规范 |
| **Qwen** | React | Ant Design | Custom JSON | 极高 (ID 稳定) | 阿里云 Omni UI 体系 |
| **AI Studio** | Angular | Material Input | Google Cloud API | 高 (Material) | Angular 脏检查同步 |
| **Grok** | Next.js | Tiptap (ProseMirror) | RPC / JSON | 极低 (随机化) | 激进的 UI 试验 |
| **Gemini** | Angular (Legacy) | Quill | BatchExecute | 中 (嵌套深) | 复杂的 XHR 递归数组 |

---

## 2. 技术架构综合评比排名

我们基于以下维度进行评比：**工程设计的鲁棒性、API 的现代性、以及对第三方集成的友好度。**

### 🏆 第一名：Claude (Anthropic) - 【建筑大师】
*   **评语**: Claude 的前端架构体现了极高的工程美学。
*   **理由**: 它不只是在做一个网页，而是在构建一个语义化的交互协议。其 DOM 结构中包含大量的 ARIA 标签和语义化选择器，即使 UI 视觉发生变化，底层的逻辑锚点依然稳固。其对 ProseMirror 的配置也是最为严谨的，展现了顶级的产品工程。

### 🥈 第二名：ChatGPT (OpenAI) - 【行业标准】
*   **评语**: 定义了现代 LLM 交互的所有范式。
*   **理由**: OpenAI 的 SSE (Server-Sent Events) 实现是目前业界事实上的标准，所有国产模型几乎都在效仿。其架构简洁、高效，对弱网环境的处理（如断点重连和增量更新）非常成熟且稳定。

### 🥉 第三名：Doubao (字节跳动) - 【组件艺术】
*   **评语**: 国产模型中 UI 工程化的巅峰。
*   **理由**: 借力于字节跳动成熟的 Semi Design 体系，豆包的 DOM 极其规整，组件状态逻辑清晰。在所有国产模型中，豆包的适配器最为“优雅”，极少需要 Hack 代码，充分体现了组件库驱动设计的优势。

### 4. DeepSeek - 【性能先锋】
- **优势**: 响应速度极快，API 极其精简。
- **劣势**: 使用了混淆程度较高的 CSS Modules，虽然对开发者不友好，但从应用保护角度看是成功的。

### 5. AI Studio (Google) - 【工具范式】
- **优势**: 典型的工程化工具界面，接口标准，非常适合开发环境。
- **劣势**: 相对独立，没有融入完整的 Web 模型生态。

### 6. Qwen (阿里云) - 【企业级稳健】
- **优势**: 延续了阿里系软件的稳健，基于 Ant Design 的结构让自动化脚本写起来非常舒服（选择器极少变动）。

### 7. Grok (xAI) - 【激进试验场】
- **优势**: 技术栈非常现代（Next.js 最前沿版本）。
- **劣势**: 过度追求变化，类名随机化严重。作为一个架构，它缺乏长期稳定性，更像是一个快速迭代的内容消费产品。

### 8. Gemini (Google) - 【沉重的基座】
- **优势**: 背后有强大的 Google 基础设施支撑。
- **劣势**: 架构设计上略显臃肿。其 `batchexecute` 协议带有强烈的 Google 早期系统痕迹（多维嵌套数组），导致解析成本极高且极易出错。在“轻量化”和“现代性”上，Google 似乎在被后起之秀（OpenAI/Anthropic）牵着鼻子走。

---

## 3. 总结建议
从技术和架构来看，**Claude 和 ChatGPT 依然代表了全球最高水平**，前者胜在**严谨性与语义化**，后者胜在**性能与规范制定**。在国产模型中，**豆包**凭借字节跳动深厚的前端基建实力脱颖而出，代表了国内最顶尖的组件化实践。

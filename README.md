<p align="center">
  <img src="extension/icons/icon128.png" width="96" height="96" alt="Multi-LLM Prompt Dispatcher icon">
</p>

<h1 align="center">Multi-LLM Prompt Dispatcher</h1>

<p align="center">
  Send one prompt to multiple AI web applications from a Chromium extension.
</p>

<p align="center">
  <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="extension/manifest.json"><img src="https://img.shields.io/badge/manifest-v3-2f6fed.svg" alt="Manifest V3"></a>
  <img src="https://img.shields.io/badge/browser-Chromium-4285f4.svg" alt="Chromium browser">
</p>

Multi-LLM Prompt Dispatcher is a Manifest V3 browser extension for dispatching the same prompt to multiple AI web applications. It works through the official web interfaces of each provider, so you can compare responses without repeatedly copying the same prompt into every tab.

The extension does not require provider API keys. It scans supported AI tabs, sends prompts through platform-specific adapters, and provides a command center for monitoring active model responses.

## Preview

The screenshots below show representative local extension states with sample model tabs.

### Popup Dispatcher

![Popup dispatcher with selected model targets](docs/screenshots/popup.png)

### Command Center

![Command center showing multiple model response cards](docs/screenshots/dashboard.png)

### Settings

![Settings page for dashboard detection and prompt history](docs/screenshots/settings.png)

## Highlights

| Capability | Description |
| --- | --- |
| Parallel prompt dispatch | Send one prompt to selected AI tabs at the same time. |
| Platform adapters | Keep provider-specific DOM and interaction logic isolated. |
| Command center | Monitor multiple model responses from a dedicated dashboard. |
| Side panel support | Pin the dispatcher as a Chromium side panel for repeated use. |
| Prompt history | Store sent prompts locally and export history as JSON. |
| Window-scoped scanning | Limit detected targets to the current browser window when needed. |

## Supported Platforms

| Platform | Hosts | Adapter status |
| --- | --- | --- |
| ChatGPT | `chat.openai.com`, `chatgpt.com` | Implemented |
| Claude | `claude.ai` | Implemented |
| Gemini | `gemini.google.com` | Implemented |
| Google AI Studio | `aistudio.google.com` | Implemented |
| Grok | `grok.x.ai`, `grok.com` | Implemented |
| DeepSeek | `chat.deepseek.com` | Implemented |
| Qwen and Tongyi | `chat.qwen.ai`, `tongyi.aliyun.com`, `qianwen.aliyun.com` | Implemented |
| Doubao | `doubao.com`, `www.doubao.com` | Implemented |

The manifest also reserves host permissions for Zhipu, MiniMax/Hailuo, and Kimi. Those platforms should be treated as reserved targets until dedicated adapters are implemented and verified.

## Installation

This repository is currently distributed as an unpacked Chromium extension.

1. Clone the repository:

   ```bash
   git clone https://github.com/quboliu/multi-prompt-dispatcher.git
   ```

2. Open the Chromium extension manager:

   ```text
   chrome://extensions/
   ```

3. Enable Developer mode.
4. Select Load unpacked.
5. Choose the `extension/` directory from this repository.
6. Pin the extension from the browser toolbar if you want quick access.

No build step is required for local use.

## Usage

1. Open the AI web applications you want to use and sign in to each provider.
2. Open the extension popup.
3. Select the target model tabs.
4. Enter a prompt.
5. Send the prompt to the selected tabs.
6. Open the command center when you want a larger monitoring view.

Each provider keeps its own native conversation context. The extension synchronizes the send action, not the chat history across providers.

## Settings

| Setting | Purpose |
| --- | --- |
| Reuse existing dashboard tab | Reopen an existing dashboard tab instead of creating duplicates. |
| Current Window Only | Detect AI tabs only in the current browser window. |
| Enable history tracking | Store sent prompts in extension storage. |
| Maximum history entries | Limit the number of retained prompt history items. |

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+Shift+M` | Open the extension action popup. |
| `Alt+Shift+D` | Open the command center. |

## Architecture

```text
extension/
  manifest.json
  background/
    background.js
  content/
    adapters/
      base.js
      chatgpt.js
      claude.js
      gemini.js
      aistudio.js
      grok.js
      deepseek.js
      qwen.js
      doubao.js
    bridge.js
    content.js
    network-interceptor.js
  popup/
    popup.html
    popup.css
    popup.js
  dashboard/
    dashboard.html
    dashboard.css
    dashboard.js
  settings/
    settings.html
    settings.css
    settings.js
  icons/
```

Core flow:

1. The background service worker scans tabs and coordinates extension messages.
2. The popup or command center sends a dispatch request.
3. A content script selects the matching platform adapter for each target tab.
4. The adapter fills the provider's web input and triggers the native send action.
5. The network interceptor and DOM fallback report response updates back to the extension UI.

## Development

There is no package manager or build pipeline in this repository. Edit files under `extension/`, then reload the unpacked extension from `chrome://extensions/`.

Useful scripts:

```bash
node scripts/diagnostic.js
node scripts/ai_studio_inspect.js
```

Adapter changes should be verified manually against the relevant provider website because provider UI updates can break DOM selectors without any repository change.

## Documentation

- [Testing guide](docs/TESTING.md)
- [Phase 2 guide](docs/PHASE2_GUIDE.md)
- [Adapter architecture](docs/adapters/README.md)
- [Platform comparison](docs/adapters/platform_comparison.md)
- [Risk assessment](docs/RISK_ASSESSMENT.md)

## Privacy

- Provider API tokens are not required.
- Prompt dispatching is performed through the active browser tabs.
- Settings and prompt history are stored with Chrome extension storage.
- Conversation content stays in provider web pages unless response monitoring is enabled in the command center.

## Troubleshooting

| Problem | Suggested action |
| --- | --- |
| No AI tabs are detected | Refresh the provider page and confirm the URL matches a supported host. |
| A target tab is not ready | Reload that tab from the popup and wait for the page to finish loading. |
| Prompt dispatch fails | Check whether the provider is generating, signed out, or has changed its input UI. |
| Response monitoring is incomplete | Use the provider page directly as the source of truth; monitoring depends on provider transport behavior. |

## Known Limitations

- Provider UI changes can break DOM-based adapters.
- The user must already be signed in to each provider website.
- Some providers may block automation-like interactions or change input behavior.
- Response monitoring support varies by provider and response transport.
- This repository is not packaged for the Chrome Web Store.

## Disclaimer

This project is not affiliated with OpenAI, Anthropic, Google, xAI, DeepSeek, Alibaba, ByteDance, or any other listed provider. Use it responsibly and follow each provider's terms of service.

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.

# DeepSeek DOM Selector Debugging Guide

## Current Issue

The adapter loads successfully but returns "页面未就绪，可能正在生成回答" when trying to send prompts.

This means `isReady()` is returning `false`, which happens when:
1. Input element not found
2. Send button not found  
3. DeepSeek is currently generating a response

## Debug Steps

### Step 1: Reload Extension

1. Go to `chrome://extensions/`
2. Find "Multi-LLM Prompt Dispatcher"
3. Click **Reload** (🔄)

### Step 2: Refresh DeepSeek Page

1. Go to `https://chat.deepseek.com/`
2. Hard refresh: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)

### Step 3: Check Console Logs

1. Open DevTools Console (F12 → Console)
2. Look for these debug messages:

```
[DeepSeek Adapter] isReady check: { hasInput: ?, hasSendButton: ?, isGenerating: ? }
[DeepSeek Adapter] Searching for input element...
[DeepSeek Adapter] Searching for send button...
```

### Step 4: Identify the Problem

**If you see:**
```
[DeepSeek Adapter] ❌ No input element found. Available textareas: X contenteditable divs: Y
```
→ Input field selectors need updating

**If you see:**
```
[DeepSeek Adapter] ❌ No send button found. Available buttons: X enabled buttons: Y
```
→ Send button selectors need updating

### Step 5: Inspect Actual DOM Elements

#### For Input Field:

1. In DeepSeek page, click on the input field
2. Right-click → **Inspect**
3. In DevTools Elements panel, note:
   - Tag name (textarea, div, etc.)
   - `placeholder` attribute value
   - `class` attribute value
   - `contenteditable` attribute
   - Any unique attributes

#### For Send Button:

1. Right-click the send button → **Inspect**
2. Note:
   - Tag name (should be `button`)
   - `aria-label` attribute
   - `class` attribute
   - `type` attribute
   - Any SVG icons inside

### Step 6: Run Manual Test in Console

Open DevTools Console and run:

```javascript
// Test input detection
window.currentAdapter.getInputElement()

// Test send button detection
window.currentAdapter.getSendButton()

// Test ready state
window.currentAdapter.getStatus()
```

**Expected output for `getStatus()`:**
```javascript
{
  name: "deepseek",
  displayName: "DeepSeek",
  icon: "🔵",
  detected: true,
  ready: true,        // ← Should be true
  hasInput: true,     // ← Should be true
  hasSendButton: true // ← Should be true
}
```

## Reporting Results

Please share:

1. **Console logs** from Step 3
2. **DOM inspection results** from Step 5:
   - Input field HTML (copy the element's outerHTML)
   - Send button HTML (copy the element's outerHTML)
3. **Manual test results** from Step 6

With this information, I can update the selectors in `deepseek.js` to match DeepSeek's actual UI structure.

## Quick Fix Template

If you can identify the correct selectors, you can update them directly:

**File**: [`deepseek.js`](file:///home/muxunting/JieziSpace/IncubatorLab/MultiPromptDispatcher/extension/content/adapters/deepseek.js)

**Input selectors** (around line 45):
```javascript
const selectors = [
    'YOUR_ACTUAL_SELECTOR_HERE',  // Add at the top
    'textarea[placeholder*="消息"]',
    // ...
];
```

**Send button selectors** (around line 77):
```javascript
const selectors = [
    'YOUR_ACTUAL_SELECTOR_HERE',  // Add at the top
    'button[aria-label*="发送"]',
    // ...
];
```

After updating, reload the extension and test again.

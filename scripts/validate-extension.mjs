import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionDir = path.join(root, 'extension');
const manifestPath = path.join(extensionDir, 'manifest.json');

function fail(message) {
  console.error(`[validate-extension] ${message}`);
  process.exitCode = 1;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`failed to parse ${path.relative(root, filePath)}: ${error.message}`);
    return {};
  }
}

function assertFile(relativeToExtension) {
  const filePath = path.join(extensionDir, relativeToExtension);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    fail(`missing file referenced by manifest: ${relativeToExtension}`);
  }
}

function assertVersion(version) {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
    fail(`manifest version must use x.y.z format, got ${JSON.stringify(version)}`);
  }
}

function validateManifest() {
  const manifest = readJson(manifestPath);

  if (manifest.manifest_version !== 3) {
    fail(`manifest_version must be 3, got ${manifest.manifest_version}`);
  }

  if (manifest.name !== 'Multi-LLM Prompt Dispatcher') {
    fail(`unexpected extension name: ${manifest.name}`);
  }

  assertVersion(manifest.version);

  for (const iconPath of Object.values(manifest.icons || {})) {
    assertFile(iconPath);
  }

  for (const iconPath of Object.values(manifest.action?.default_icon || {})) {
    assertFile(iconPath);
  }

  if (manifest.action?.default_popup) {
    assertFile(manifest.action.default_popup);
  }

  if (manifest.options_page) {
    assertFile(manifest.options_page);
  }

  if (manifest.side_panel?.default_path) {
    assertFile(manifest.side_panel.default_path);
  }

  if (manifest.background?.service_worker) {
    assertFile(manifest.background.service_worker);
  }

  for (const script of manifest.content_scripts || []) {
    for (const jsPath of script.js || []) {
      assertFile(jsPath);
    }
  }

  const requiredHosts = [
    'https://chatgpt.com/*',
    'https://claude.ai/*',
    'https://gemini.google.com/*',
    'https://aistudio.google.com/*',
    'https://grok.com/*',
    'https://chat.deepseek.com/*',
    'https://chat.qwen.ai/*',
    'https://www.doubao.com/*',
  ];

  const hosts = new Set(manifest.host_permissions || []);
  for (const host of requiredHosts) {
    if (!hosts.has(host)) {
      fail(`missing expected host permission: ${host}`);
    }
  }

  return manifest;
}

const manifest = validateManifest();

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(`[validate-extension] manifest ok: ${manifest.name} ${manifest.version}`);

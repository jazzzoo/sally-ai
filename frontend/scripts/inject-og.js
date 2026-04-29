import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = resolve(__dirname, '../dist/index.html');

const OG_TAGS = `
    <!-- Primary Meta Tags -->
    <meta name="title" content="Nitor8 — AI Customer Interview Tool">
    <meta name="description" content="AI-powered customer development interviews for startup founders. Generate questions, conduct interviews, and get insights automatically.">
    <!-- Open Graph -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://nitor8.vercel.app">
    <meta property="og:title" content="Nitor8 — AI Customer Interview Tool">
    <meta property="og:description" content="AI-powered customer development interviews for startup founders. Generate questions, conduct interviews, and get insights automatically.">
    <meta property="og:image" content="https://nitor8.vercel.app/og-image.png">
    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="https://nitor8.vercel.app">
    <meta property="twitter:title" content="Nitor8 — AI Customer Interview Tool">
    <meta property="twitter:description" content="AI-powered customer development interviews for startup founders. Generate questions, conduct interviews, and get insights automatically.">
    <meta property="twitter:image" content="https://nitor8.vercel.app/og-image.png">`;

let html = readFileSync(distPath, 'utf-8');
const titleClose = '</title>';
if (!html.includes('og:type')) {
  html = html.replace(titleClose, titleClose + OG_TAGS);
  writeFileSync(distPath, html, 'utf-8');
  console.log('OG tags injected into dist/index.html');
} else {
  console.log('OG tags already present, skipping.');
}

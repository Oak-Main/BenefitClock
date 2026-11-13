import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(ROOT, path), 'utf8');
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
const source = read('src/pages/privacy.html');
const pages = [['source', source]];
const builtPrivacyPath = process.env.PRIVACY_HTML_PATH;
if (builtPrivacyPath) {
  pages.push(['built page', readFileSync(resolve(ROOT, builtPrivacyPath), 'utf8')]);
}
const entities = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&mdash;': '—', '&rsquo;': '’' };
function text(html) {
  const tokens = html.matchAll(/<!--[\s\S]*?--!?>|<(head|script|style|template)\b[^>]*>[\s\S]*?<\/\1(?=[\s/>])[^>]*>|<[^>]+>|([^<]+)/gi);
  return Array.from(tokens, token => token[2] ?? '').join('')
    .replace(/&(?:amp|lt|gt|nbsp|mdash|rsquo);/g, value => entities[value])
    .replace(/\s+/g, ' ').trim();
}

const htmlFiles = [join(ROOT, 'src/layout.html'), ...walk(join(ROOT, 'src/pages')), ...walk(join(ROOT, 'src/partials'))]
  .filter(path => path.endsWith('.html'));
const htmlSources = htmlFiles.map(path => ({ path, html: readFileSync(path, 'utf8') }));
const browserScripts = walk(join(ROOT, 'src/assets/js'))
  .filter(path => /\.[cm]?js$/.test(path))
  .map(path => ({ path, code: readFileSync(path, 'utf8') }));

if (builtPrivacyPath) {
  // The builder can emit markup from page metadata and partials.
  const output = walk(dirname(resolve(ROOT, builtPrivacyPath)));
  for (const path of output) {
    if (path.endsWith('.html')) htmlSources.push({ path, html: readFileSync(path, 'utf8') });
    if (/\.[cm]?js$/.test(path)) browserScripts.push({ path, code: readFileSync(path, 'utf8') });
  }
}

const scriptUrls = new Set();
const siteOrigin = 'https://benefitdial.com';

for (const { path, html } of htmlSources) {
  for (const [, attributes, code] of html.matchAll(/<!--[\s\S]*?--!?>|<script(?=[\s/>])((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script(?=[\s/>])[^>]*>/gi)) {
    if (attributes === undefined) continue;
    const attrs = new Map();
    for (const [, name, doubleQuoted, singleQuoted, unquoted] of attributes.matchAll(/([^\s=\/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/g)) {
      const key = name.toLowerCase();
      if (!attrs.has(key)) attrs.set(key, doubleQuoted ?? singleQuoted ?? unquoted ?? '');
    }
    const src = attrs.get('src');
    if (src) {
      const url = new URL(src, siteOrigin);
      if (url.origin !== siteOrigin || url.protocol !== 'https:') scriptUrls.add(url.href);
      continue;
    }
    const type = (attrs.get('type') ?? '').trim().toLowerCase();
    if (!type || type === 'module' || /^(?:application|text)\/(?:x-)?(?:java|ecma)script$/.test(type)) {
      browserScripts.push({ path, code });
    }
  }
}

// This is an inventory/review gate, not a proof about third-party script behavior.
// Unknown key expressions deliberately fail so new storage receives a disclosure review.
function storageKeys() {
  const keys = new Set();
  for (const { path, code } of browserScripts) {
    const declarations = code.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(['"])([^'"]+)\2/g);
    const constants = new Map(Array.from(declarations, match => [match[1], match[3]]));
    for (const section of code.split(/\/\*[\s\S]*?\*\/|^[\t ]*\/\/[^\n]*/gm)) {
      assert.doesNotMatch(section, /\b(?:sessionStorage|indexedDB|cookieStore)\b|\bdocument\s*(?:\.\s*cookie\b|\[\s*['"]cookie['"]\s*\])/,
        `New storage API in ${path}: review privacy and add behavioral coverage`);
      for (const reference of section.matchAll(/\blocalStorage\b(?:['"`]\s*\])?/g)) {
        const access = section.slice(reference.index + reference[0].length);
        const method = access.match(/^\s*(?:\.\s*(?:getItem|setItem|removeItem)|\[\s*(['"])(?:getItem|setItem|removeItem)\1\s*\])\s*\(/);
        assert.ok(method, `Review unfamiliar localStorage access in ${path}`);
        const argument = access.slice(method[0].length).match(/^\s*(?:(['"])([^'"]+)\1|([A-Za-z_$][\w$]*))\s*(?=[,)])/);
        assert.ok(argument, `Review unfamiliar localStorage key in ${path}`);
        const key = argument[2] ?? constants.get(argument[3]);
        assert.ok(key, `Unresolved storage key ${argument[3]} in ${path}`);
        keys.add(key);
      }
    }
  }
  return [...keys].sort();
}

for (const [label, html] of pages) {
  const plain = text(html);
  test(`privacy avoids blanket cookie-free and anonymous-count claims (${label})`, () => {
    assert.doesNotMatch(plain, /sets no cookies of its own|sets one first-party cookie|page counts only|we don't run analytics|our only measurement is the page-count/i);
    assert.match(plain, /Google Analytics 4/);
    assert.match(plain, /first-party analytics cookies/);
    assert.match(plain, /_ga_<container-id>/);
    assert.match(plain, /When GA4 measurement runs/);
    assert.match(plain, /Loading the script does not, by itself/);
    assert.match(plain, /Cloudflare Web Analytics/);
  });

  test(`privacy names every current interface storage key (${label})`, () => {
    const keys = storageKeys();
    assert.deepEqual(keys, ['bc-textsize', 'benefitdial-oehub-checks']);
    assert.match(plain, /localStorage/);
    for (const key of keys) assert.ok(plain.includes(key), `Missing disclosure for ${key}`);
    assert.doesNotMatch(plain, /There is one thing we do save|Close the tab and they're gone/);
    assert.match(plain, /Clearing cookies alone may leave localStorage intact/);
  });

  test(`privacy distinguishes present advertising from future providers (${label})`, () => {
    assert.match(plain, /No advertising network is currently active/);
    assert.match(plain, /placeholders/);
    assert.match(plain, /Before enabling it, we will update this policy/);
    assert.doesNotMatch(plain, /We are paid when ads are shown|the ads you see are|some are affiliate links/);
  });

  test(`privacy visible FAQ and structured data agree (${label})`, () => {
    const visible = [...html.matchAll(/<details class="faq">([\s\S]*?)<\/details>/g)].map(match => ({
      question: text(match[1].match(/<summary>([\s\S]*?)<\/summary>/)[1]),
      answer: text(match[1].match(/<div class="faq__body">([\s\S]*?)<\/div>/)[1]),
    }));
    const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
    const faq = schemas.find(schema => schema['@type'] === 'FAQPage');
    assert.ok(faq, 'Missing FAQPage JSON-LD');
    assert.ok(visible.length > 0, 'Missing visible FAQs');
    assert.deepEqual(faq.mainEntity.map(item => ({question:item.name, answer:item.acceptedAnswer.text})), visible);
  });

  test(`privacy has an explicit revision date and honest consent wording (${label})`, () => {
    assert.match(html, /Last updated: <time datetime="\d{4}-\d{2}-\d{2}">[A-Z][a-z]+ \d{1,2}, \d{4}<\/time>/);
    assert.doesNotMatch(source, /Last updated:.*BUILD_YEAR/);
    assert.match(plain, /no analytics consent banner or on-site analytics toggle/);
    assert.match(plain, /does not use this signal to switch analytics on or off/);
  });
}

test('new external scripts, consent code or monetization tags require a privacy review', () => {
  for (const { path, html } of htmlSources) {
    const sections = html.split(/<!--[\s\S]*?--!?>/g);
    // Check each non-comment section directly. Joining them could create new markup.
    for (const section of sections) {
      assert.doesNotMatch(section, /adsbygoogle|rel="[^"]*\bsponsored\b|href="[^"]*(?:amazon\.[a-z.]+\/[^\"]*[?&]tag=|\/go\/)/i,
        `Monetization changed in ${path}; review privacy before changing this gate`);
      assert.doesNotMatch(section, /gtag\(\s*['"]consent['"]/, `Consent implementation changed in ${path}; review the disclosure`);
    }
  }
  assert.deepEqual([...scriptUrls].sort(), ['https://www.googletagmanager.com/gtag/js?id=G-FQNWJB3T8W']);
  for (const { path, code } of browserScripts) {
    assert.doesNotMatch(code, /gtag\(\s*['"]consent['"]|navigator\.(?:doNotTrack|globalPrivacyControl)/,
      `Privacy controls changed in ${path}; review the disclosure`);
  }
});

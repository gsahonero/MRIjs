/**
 * Unit & Integration Tests for MRIjs Notebooks Bilingual Translation Engine
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('===============================================');
console.log('   MRIjs Bilingual Translation Engine Tests   ');
console.log('===============================================');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✓ PASS: ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ✗ FAIL: ${name}`);
        console.error(`    ${err.message}`);
        failed++;
    }
}

const transJsonPath = path.join(__dirname, 'notebooks', 'translations.json');
const transJsPath = path.join(__dirname, 'notebooks', 'translations.js');
const indexPath = path.join(__dirname, 'notebooks', 'index.html');
const slidesPath = path.join(__dirname, 'notebooks', 'slides.html');
const notebooksJsPath = path.join(__dirname, 'notebooks', 'notebooks.js');

let translationsJson;
let translationsJs;
let indexHtml;
let slidesHtml;
let notebooksJs;

test('translations.json loads and parses valid JSON', () => {
    const raw = fs.readFileSync(transJsonPath, 'utf8');
    translationsJson = JSON.parse(raw);
    assert.ok(translationsJson.en, 'Missing "en" dictionary');
    assert.ok(translationsJson.es, 'Missing "es" dictionary');
});

test('translations.js exports bundle identical to translations.json', () => {
    translationsJs = require(transJsPath);
    assert.deepStrictEqual(translationsJs.en, translationsJson.en);
    assert.deepStrictEqual(translationsJs.es, translationsJson.es);
});

test('Exact key parity between English and Spanish', () => {
    const enKeys = Object.keys(translationsJson.en).sort();
    const esKeys = Object.keys(translationsJson.es).sort();
    assert.strictEqual(enKeys.length, esKeys.length, `Key count mismatch: EN has ${enKeys.length}, ES has ${esKeys.length}`);
    
    const missingInEs = enKeys.filter(k => !(k in translationsJson.es));
    const missingInEn = esKeys.filter(k => !(k in translationsJson.en));
    assert.deepStrictEqual(missingInEs, [], 'Keys present in EN but missing in ES');
    assert.deepStrictEqual(missingInEn, [], 'Keys present in ES but missing in EN');
});

test('No empty translations in either English or Spanish', () => {
    for (const [key, val] of Object.entries(translationsJson.en)) {
        assert.ok(typeof val === 'string' && val.trim().length > 0, `Empty EN translation for key "${key}"`);
    }
    for (const [key, val] of Object.entries(translationsJson.es)) {
        assert.ok(typeof val === 'string' && val.trim().length > 0, `Empty ES translation for key "${key}"`);
    }
});

test('All data-i18n attributes in index.html exist in translations.json', () => {
    indexHtml = fs.readFileSync(indexPath, 'utf8');
    const regex = /data-i18n="([^"]+)"/g;
    let match;
    const foundKeys = new Set();
    while ((match = regex.exec(indexHtml)) !== null) {
        foundKeys.add(match[1]);
    }

    assert.ok(foundKeys.size > 20, `Found too few data-i18n tags: ${foundKeys.size}`);
    const missing = [];
    foundKeys.forEach(k => {
        if (!(k in translationsJson.en)) missing.push(k);
    });
    assert.deepStrictEqual(missing, [], 'Missing data-i18n keys in dictionary');
});

test('All data-i18n-html attributes in index.html exist in translations.json', () => {
    const regex = /data-i18n-html="([^"]+)"/g;
    let match;
    const foundKeys = new Set();
    while ((match = regex.exec(indexHtml)) !== null) {
        foundKeys.add(match[1]);
    }

    assert.ok(foundKeys.size >= 12, `Found too few data-i18n-html tags: ${foundKeys.size}`);
    const missing = [];
    foundKeys.forEach(k => {
        if (!(k in translationsJson.en)) missing.push(k);
    });
    assert.deepStrictEqual(missing, [], 'Missing data-i18n-html keys in dictionary');
});

test('All data-i18n-exp attributes in index.html exist in translations.json', () => {
    const regex = /data-i18n-exp="([^"]+)"/g;
    let match;
    const foundKeys = new Set();
    while ((match = regex.exec(indexHtml)) !== null) {
        foundKeys.add(match[1]);
    }

    assert.strictEqual(foundKeys.size, 12, `Expected 12 checkpoint explanations (4 modules x 3 options), found ${foundKeys.size}`);
    const missing = [];
    foundKeys.forEach(k => {
        if (!(k in translationsJson.en)) missing.push(k);
    });
    assert.deepStrictEqual(missing, [], 'Missing data-i18n-exp keys in dictionary');
});

test('All data-i18n and data-i18n-html in slides.html exist in translations.json', () => {
    slidesHtml = fs.readFileSync(slidesPath, 'utf8');
    const regexText = /data-i18n="([^"]+)"/g;
    const regexHtml = /data-i18n-html="([^"]+)"/g;
    let match;
    const missing = [];

    while ((match = regexText.exec(slidesHtml)) !== null) {
        if (!(match[1] in translationsJson.en)) missing.push(match[1]);
    }
    while ((match = regexHtml.exec(slidesHtml)) !== null) {
        if (!(match[1] in translationsJson.en)) missing.push(match[1]);
    }
    assert.deepStrictEqual(missing, [], 'Missing slide translation keys in dictionary');
});

test('Both index.html and slides.html include lang-switcher UI and translations.js', () => {
    assert.ok(indexHtml.includes('class="lang-switcher"'), 'index.html missing lang-switcher');
    assert.ok(indexHtml.includes('translations.js'), 'index.html missing translations.js');
    assert.ok(slidesHtml.includes('class="lang-switcher"'), 'slides.html missing lang-switcher');
    assert.ok(slidesHtml.includes('translations.js'), 'slides.html missing translations.js');
});

test('notebooks.js defines setLanguage and initLanguage', () => {
    notebooksJs = fs.readFileSync(notebooksJsPath, 'utf8');
    assert.ok(notebooksJs.includes('function setLanguage(lang)'), 'notebooks.js missing setLanguage()');
    assert.ok(notebooksJs.includes('function initLanguage()'), 'notebooks.js missing initLanguage()');
    assert.ok(notebooksJs.includes("currentLang === 'es'"), 'notebooks.js missing dynamic language branch');
});

console.log('\n===============================================');
console.log(`Test Run Completed:`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log('===============================================');

if (failed > 0) process.exit(1);

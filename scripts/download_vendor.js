/**
 * Offline & Air-Gapped Vendor Downloader for MRIjs
 * Downloads all required CDN libraries (Three.js, Chart.js, KaTeX, Reveal.js, Lucide)
 * into a local `vendor/` directory for offline clinical or classroom deployment.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const VENDOR_DIR = path.join(__dirname, '..', 'vendor');

const ASSETS = [
    // Chart.js
    { url: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js', dest: 'chart.min.js' },
    // Lucide Icons
    { url: 'https://unpkg.com/lucide@latest/dist/umd/lucide.js', dest: 'lucide.min.js' },
    // KaTeX
    { url: 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css', dest: 'katex.min.css' },
    { url: 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js', dest: 'katex.min.js' },
    { url: 'https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js', dest: 'auto-render.min.js' },
    // Reveal.js
    { url: 'https://cdn.jsdelivr.net/npm/reveal.js@4.5.0/dist/reveal.css', dest: 'reveal.css' },
    { url: 'https://cdn.jsdelivr.net/npm/reveal.js@4.5.0/dist/theme/black.css', dest: 'reveal-black.css' },
    { url: 'https://cdn.jsdelivr.net/npm/reveal.js@4.5.0/dist/reveal.js', dest: 'reveal.js' },
    // Three.js
    { url: 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', dest: 'three.min.js' },
    { url: 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js', dest: 'OrbitControls.js' }
];

function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        function get(targetUrl) {
            https.get(targetUrl, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    let redirectUrl = res.headers.location;
                    if (!redirectUrl.startsWith('http')) {
                        const parsed = new URL(targetUrl);
                        redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
                    }
                    return get(redirectUrl);
                }
                if (res.statusCode !== 200) {
                    return reject(new Error(`Failed to download ${targetUrl} (Status: ${res.statusCode})`));
                }
                const file = fs.createWriteStream(destPath);
                res.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            }).on('error', (err) => {
                reject(err);
            });
        }
        get(url);
    });
}

async function main() {
    console.log('===============================================');
    console.log('   MRIjs Offline Vendor Downloader');
    console.log('===============================================\n');

    if (!fs.existsSync(VENDOR_DIR)) {
        fs.mkdirSync(VENDOR_DIR, { recursive: true });
        console.log(`Created directory: ${VENDOR_DIR}\n`);
    }

    let successCount = 0;
    for (const asset of ASSETS) {
        const destPath = path.join(VENDOR_DIR, asset.dest);
        process.stdout.write(`Downloading ${asset.dest.padEnd(20)} ... `);
        try {
            await downloadFile(asset.url, destPath);
            const sizeKb = (fs.statSync(destPath).size / 1024).toFixed(1);
            console.log(`[OK] (${sizeKb} KB)`);
            successCount++;
        } catch (e) {
            console.log(`[FAILED] (${e.message})`);
        }
    }

    console.log('\n===============================================');
    console.log(`Download Complete: ${successCount} / ${ASSETS.length} assets ready in vendor/`);
    console.log('===============================================\n');
}

main();

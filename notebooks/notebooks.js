/**
 * MRIjs Live Science Document & Interactive Presentation Engine
 * Supports two complete interactive modalities:
 *   1. Full Live Computational Paper (Distill-style reactive document)
 *   2. Interactive Presentation Slides (Reveal.js)
 */

// Gyromagnetic ratios in MHz/T (gamma / 2pi)
const NUCLEI_GAMMA = {
    '1H':  42.576,
    '19F': 40.052,
    '31P': 17.235,
    '23Na': 11.262,
    '13C': 10.708
};

// Global State
let currentModality = 'paper'; // 'paper' or 'slides'
let currentLang = (typeof localStorage !== 'undefined' && localStorage.getItem('mrijs_lang')) || 'en';
let revealDeck = null;

// Animation Frame Handles
let animLabRotPaper = null;
let animLabRotSlide = null;
let animGrePaper = null;
let animGreSlide = null;
let animNutationPaper = null;
let animNutationSlide = null;
let animKspaceTrajPaper = null;
let animKspaceTrajSlide = null;

// Chart Instances
let chartMod1Paper = null, chartMod1Slide = null;
let chartMod2Paper = null, chartMod2Slide = null;
let chartMod3Paper = null, chartMod3Slide = null;
let chartMod4Paper = null, chartMod4Slide = null;

// Physics States
let stateM1 = { b0: 1.5, nucleus: '1H', df: 2.0, labTheta: 0, rotTheta: 0, running: true };
let stateM2 = { gx: 20.0, timeMs: 5.0, count: 11 };
let stateM3 = { flip: 90.0, durMs: 2.0, gz: 20.0, type: 'sinc', nutProgress: 1.0 };
let stateM4 = { phantom: 'brain', filter: 'all', radius: 8, accel: 2, N: 32 };

// -------------------------------------------------------------
// DOM Ready Entry Point
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    initModalitySwitch();
    initLanguage();
    initKaTeX();
    initSharedInteractions();
    initCheckpoints();
    initScrollSpy();

    // Check URL parameters, hash, or standalone slides page
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'slides' || window.location.hash.startsWith('#/') || (document.querySelector('.reveal') && !document.getElementById('viewPaper'))) {
        setModality('slides');
    } else {
        setModality('paper');
    }

    if (window.lucide) {
        lucide.createIcons();
    }
});

// -------------------------------------------------------------
// Modality Switcher (Live Paper <-> Reveal.js Slides)
// -------------------------------------------------------------
function initModalitySwitch() {
    const btnPaper = document.getElementById('btnModePaper');
    const btnSlides = document.getElementById('btnModeSlides');

    if (btnPaper) {
        btnPaper.addEventListener('click', () => setModality('paper'));
    }
    if (btnSlides) {
        btnSlides.addEventListener('click', () => setModality('slides'));
    }
}

function setModality(mode) {
    currentModality = mode;
    const viewPaper = document.getElementById('viewPaper');
    const viewSlides = document.getElementById('viewSlides');
    const btnPaper = document.getElementById('btnModePaper');
    const btnSlides = document.getElementById('btnModeSlides');

    if (mode === 'slides') {
        if (viewPaper) viewPaper.style.display = 'none';
        if (viewSlides) viewSlides.style.display = 'block';
        if (btnPaper) btnPaper.classList.remove('active');
        if (btnSlides) btnSlides.classList.add('active');

        // Initialize Reveal if not already done
        if (!revealDeck && window.Reveal) {
            initReveal();
        } else if (revealDeck) {
            revealDeck.layout();
        }

        // Trigger slide redraws
        setTimeout(() => {
            updateAllVisuals('slide');
        }, 100);

    } else {
        if (viewPaper) viewPaper.style.display = 'block';
        if (viewSlides) viewSlides.style.display = 'none';
        if (btnPaper) btnPaper.classList.add('active');
        if (btnSlides) btnSlides.classList.remove('active');

        // Trigger paper redraws
        setTimeout(() => {
            updateAllVisuals('paper');
        }, 50);
    }
}

function initReveal() {
    if (!window.Reveal) return;

    revealDeck = new Reveal(document.querySelector('.reveal'), {
        hash: true,
        embedded: true,
        controls: true,
        progress: true,
        center: true,
        slideNumber: 'c/t',
        transition: 'slide',
        overview: true,
        keyboard: true,
        touch: true
    });

    revealDeck.initialize().then(() => {
        initKaTeX();
        updateAllVisuals('slide');
        if (window.lucide) lucide.createIcons();
    });

    revealDeck.on('slidechanged', () => {
        updateAllVisuals('slide');
        if (window.lucide) lucide.createIcons();
    });
}

// -------------------------------------------------------------
// Bilingual Translation Engine (English & Spanish)
// -------------------------------------------------------------
function setLanguage(lang) {
    if (lang !== 'en' && lang !== 'es') lang = 'en';
    currentLang = lang;
    try {
        localStorage.setItem('mrijs_lang', lang);
    } catch (e) {
        // Fallback for restricted storage environments
    }

    if (document.documentElement) {
        document.documentElement.setAttribute('lang', lang);
    }

    // Toggle active state on all language switcher buttons across paper and slides
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
    });

    // Retrieve active dictionary from window.TRANSLATIONS or TRANSLATIONS_BUNDLE
    const dict = (typeof window !== 'undefined' && window.TRANSLATIONS && window.TRANSLATIONS[lang]) ? 
                 window.TRANSLATIONS[lang] : 
                 (typeof TRANSLATIONS_BUNDLE !== 'undefined' && TRANSLATIONS_BUNDLE[lang] ? TRANSLATIONS_BUNDLE[lang] : null);

    if (dict) {
        // Apply textContent translations
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (dict[key] !== undefined) {
                el.textContent = dict[key];
            }
        });

        // Apply innerHTML translations (preserves inline math delimiters and reactive spans)
        document.querySelectorAll('[data-i18n-html]').forEach(el => {
            const key = el.getAttribute('data-i18n-html');
            if (dict[key] !== undefined) {
                el.innerHTML = dict[key];
            }
        });

        // Apply checkpoint explanations
        document.querySelectorAll('[data-i18n-exp]').forEach(btn => {
            const key = btn.getAttribute('data-i18n-exp');
            if (dict[key] !== undefined) {
                btn.setAttribute('data-explanation', dict[key]);
            }
        });
    }

    // Re-render KaTeX math delimiters in updated text
    initKaTeX();

    // Re-initialize Lucide icons
    if (typeof window !== 'undefined' && window.lucide) {
        lucide.createIcons();
    }

    // Re-synchronize reactive values and interactive visuals for current language
    updateAllVisuals('both');
}

function initLanguage() {
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const lang = btn.getAttribute('data-lang');
            if (lang) setLanguage(lang);
        });
    });
    setLanguage(currentLang);
}

// Global exposure
if (typeof window !== 'undefined') {
    window.setLanguage = setLanguage;
    window.initLanguage = initLanguage;
}


function initKaTeX() {
    if (window.renderMathInElement) {
        renderMathInElement(document.body, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false},
                {left: '\\(', right: '\\)', display: false},
                {left: '\\[', right: '\\]', display: true}
            ],
            throwOnError: false
        });
    }
}

// -------------------------------------------------------------
// Shared Interaction Controllers & Reactive Value Binding
// -------------------------------------------------------------
function initSharedInteractions() {
    // Stop propagation on all range sliders to prevent Reveal from swiping
    document.querySelectorAll('input[type="range"], select, button').forEach(el => {
        el.addEventListener('mousedown', e => e.stopPropagation());
        el.addEventListener('pointerdown', e => e.stopPropagation());
        el.addEventListener('touchstart', e => e.stopPropagation());
    });

    initM1Controls();
    initM2Controls();
    initM3Controls();
    initM4Controls();

    // Start dual-frame animation loops
    startDualFrameAnimLoop();
    startCartesianTrajAnimLoop();
}

// Flash reactive value helper
function flashReactive(elId, val) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = val;
    el.classList.add('glow');
    setTimeout(() => el.classList.remove('glow'), 300);
}

// =============================================================
// MODULE 1: B0 & Precession Frequency
// =============================================================
function initM1Controls() {
    // Both Paper and Slide sliders
    const b0Inputs = [document.getElementById('m1_b0Slider'), document.getElementById('s_m1_b0Slider')];
    const nucSelects = [document.getElementById('m1_nucleusSelect'), document.getElementById('s_m1_nucleusSelect')];
    const dfInputs = [document.getElementById('m1_dfSlider'), document.getElementById('s_m1_dfSlider')];

    b0Inputs.forEach(input => {
        if (!input) return;
        input.addEventListener('input', (e) => {
            stateM1.b0 = parseFloat(e.target.value);
            syncM1Inputs();
            updateModule1();
        });
    });

    nucSelects.forEach(sel => {
        if (!sel) return;
        sel.addEventListener('change', (e) => {
            stateM1.nucleus = e.target.value;
            syncM1Inputs();
            updateModule1();
        });
    });

    dfInputs.forEach(input => {
        if (!input) return;
        input.addEventListener('input', (e) => {
            stateM1.df = parseFloat(e.target.value);
            syncM1Inputs();
        });
    });

    // Preset buttons
    document.querySelectorAll('.m1-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            stateM1.b0 = parseFloat(btn.getAttribute('data-b0'));
            syncM1Inputs();
            updateModule1();
        });
    });

    // Play/Pause toggles
    const playBtns = [document.getElementById('m1_playBtn'), document.getElementById('s_m1_playBtn')];
    playBtns.forEach(btn => {
        if (!btn) return;
        btn.addEventListener('click', () => {
            stateM1.running = !stateM1.running;
            const label = stateM1.running ? 'Pause' : 'Play';
            const icon = stateM1.running ? 'pause' : 'play';
            playBtns.forEach(b => {
                if (b) {
                    b.innerHTML = `<i data-lucide="${icon}" style="width:14px;height:14px;"></i> ${label}`;
                }
            });
            if (window.lucide) lucide.createIcons();
        });
    });

    // Run Code buttons
    const runBtns = [document.getElementById('m1_runCodeBtn'), document.getElementById('s_m1_runCodeBtn')];
    runBtns.forEach(btn => {
        if (btn) btn.addEventListener('click', runModule1Simulation);
    });

    updateModule1();
}

function syncM1Inputs() {
    ['m1_b0Slider', 's_m1_b0Slider'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = stateM1.b0;
    });
    ['m1_b0Val', 's_m1_b0Val'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = stateM1.b0.toFixed(2) + ' T';
    });
    ['m1_nucleusSelect', 's_m1_nucleusSelect'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = stateM1.nucleus;
    });
    ['m1_dfSlider', 's_m1_dfSlider'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = stateM1.df;
    });
    ['m1_dfVal', 's_m1_dfVal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = stateM1.df.toFixed(1) + ' Hz';
    });
}

function updateModule1() {
    const gamma = NUCLEI_GAMMA[stateM1.nucleus] || 42.576;
    const f0 = gamma * stateM1.b0; // MHz
    const periodNs = 1000.0 / f0; // ns
    const waterFatHz = 3.5 * f0; // Hz
    const boltzPpm = (3.2 * stateM1.b0).toFixed(1);

    // Update readouts on Paper & Slide
    ['m1_resFreq', 's_m1_resFreq'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = f0.toFixed(3) + ' MHz'; });
    ['m1_resPeriod', 's_m1_resPeriod'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = periodNs.toFixed(2) + ' ns'; });
    ['m1_resShift', 's_m1_resShift'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = waterFatHz.toFixed(1) + ' Hz'; });
    ['m1_resBoltz', 's_m1_resBoltz'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = boltzPpm + ' ppm'; });

    // Reactive prose text updates (Live Paper)
    flashReactive('r_b0', stateM1.b0.toFixed(2));
    flashReactive('r_f0', f0.toFixed(3));
    flashReactive('r_period', periodNs.toFixed(2));
    flashReactive('r_shift', waterFatHz.toFixed(1));
}

function startDualFrameAnimLoop() {
    let lastTime = performance.now();

    function render(time) {
        const dt = (time - lastTime) / 1000.0;
        lastTime = time;

        if (stateM1.running) {
            const gamma = NUCLEI_GAMMA[stateM1.nucleus] || 42.576;
            const f0 = gamma * stateM1.b0; // Larmor frequency in MHz
            // Visual lab frame rate scales proportionally with f0:
            // Standard 1.5 T 1H (63.864 MHz) -> 1.5 Hz visual rate
            // Scales dynamically from ~0.1 Hz (ultra-low field) to ~7.5 Hz (high field)
            const visualLabFreqHz = Math.min(7.5, Math.max(0.1, (f0 / 63.864) * 1.5));
            stateM1.labTheta += (2 * Math.PI * visualLabFreqHz) * dt;
            stateM1.rotTheta += (2 * Math.PI * (stateM1.df * 0.2)) * dt;
        }

        // Render Paper Canvas if visible
        const cPaper = document.getElementById('m1_frameCanvas');
        if (cPaper && (currentModality === 'paper' || cPaper.offsetParent !== null)) {
            drawDualFramesCanvas(cPaper, stateM1.labTheta, stateM1.rotTheta, stateM1.df);
        }

        // Render Slide Canvas if visible
        const cSlide = document.getElementById('s_m1_frameCanvas');
        if (cSlide && (currentModality === 'slides' || cSlide.offsetParent !== null)) {
            drawDualFramesCanvas(cSlide, stateM1.labTheta, stateM1.rotTheta, stateM1.df);
        }

        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
}

function drawDualFramesCanvas(canvas, labTheta, rotTheta, df) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const halfW = width / 2;
    const r = Math.min(halfW, height) * 0.35;

    const gamma = NUCLEI_GAMMA[stateM1.nucleus] || 42.576;
    const f0 = gamma * stateM1.b0;
    const visualLabFreqHz = Math.min(7.5, Math.max(0.1, (f0 / 63.864) * 1.5));

    // Left: Laboratory Frame
    const labTitle = currentLang === 'es' ? 'Marco del Laboratorio' : 'Laboratory Frame';
    const labSub = currentLang === 'es' 
        ? `Precesión: f₀ = ${f0.toFixed(2)} MHz (animación: ${visualLabFreqHz.toFixed(1)} Hz)`
        : `Precession: f₀ = ${f0.toFixed(2)} MHz (scaled: ${visualLabFreqHz.toFixed(1)} Hz)`;
    drawFrameView(ctx, halfW * 0.5, height * 0.5, r, labTitle, labSub, labTheta, '#3b82f6', true);

    // Divider
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(halfW, 20); ctx.lineTo(halfW, height - 20);
    ctx.stroke();

    // Right: Rotating Frame
    const rotTitle = currentLang === 'es' ? 'Marco Rotatorio (a ω₀)' : 'Rotating Frame (at ω₀)';
    const rotSub = currentLang === 'es' ? `Deriva Fuera de Resonancia: Δω = ${df.toFixed(1)} Hz` : `Off-Resonance Drift: Δω = ${df.toFixed(1)} Hz`;
    drawFrameView(ctx, halfW * 1.5, height * 0.5, r, rotTitle, rotSub, rotTheta, '#10b981', false);
}

function drawFrameView(ctx, cx, cy, r, title, subtitle, angle, color, isLab) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(cx - r * 1.2, cy); ctx.lineTo(cx + r * 1.2, cy);
    ctx.moveTo(cx, cy - r * 1.2); ctx.lineTo(cx, cy + r * 1.2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = '11px Space Grotesk, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.textAlign = 'center';
    ctx.fillText(isLab ? '+x' : "+x'", cx + r * 1.3, cy + 4);
    ctx.fillText(isLab ? '+y' : "+y'", cx, cy - r * 1.25);

    const vx = cx + r * Math.cos(angle);
    const vy = cy - r * Math.sin(angle);

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy); ctx.lineTo(vx, vy);
    ctx.stroke();

    const headLen = 10;
    const arrowAngle = Math.atan2(cy - vy, vx - cx);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(vx, vy);
    ctx.lineTo(vx - headLen * Math.cos(arrowAngle - Math.PI / 6), vy + headLen * Math.sin(arrowAngle - Math.PI / 6));
    ctx.lineTo(vx - headLen * Math.cos(arrowAngle + Math.PI / 6), vy + headLen * Math.sin(arrowAngle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.font = '600 13px Outfit, sans-serif';
    ctx.fillStyle = '#f3f4f6';
    ctx.textAlign = 'center';
    ctx.fillText(title, cx, 26);

    ctx.font = '11px Outfit, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(subtitle, cx, cy + r * 1.35);
}

function runModule1Simulation() {
    ['m1_codeOutput', 's_m1_codeOutput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('show');
    });

    const isochromats = [
        { id: 'water', x: 0, T1: 800, T2: 200, PD: 1.0, w: 0 },
        { id: 'fat',   x: 0, T1: 300, T2: 120, PD: 1.0, w: 40 }
    ];

    const sim = new BlochSimulator(isochromats, 80, 0.2, 'rotating', 'FID', { flipAngle: 90 });
    const results = sim.run();

    // Render Paper chart & Slide chart
    renderMod1Chart(results, 'm1_simChart', chartMod1Paper, c => chartMod1Paper = c);
    renderMod1Chart(results, 's_m1_simChart', chartMod1Slide, c => chartMod1Slide = c);
}

function renderMod1Chart(results, canvasId, existingChart, setChart) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const labels = results.signals.map(s => s.t.toFixed(1));
    const mxyData = results.signals.map(s => s.Mxy);

    if (existingChart) existingChart.destroy();

    const newChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: currentLang === 'es' ? 'Señal Transversal Mxy (Batido de Interferencia, Δf = 40 Hz)' : 'Transverse Signal Mxy (Interference Beat, Δf = 40 Hz)',
                data: mxyData,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 2,
                fill: true,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                x: {
                    title: { display: true, text: 'Time (ms)', color: '#9ca3af', font: { size: 10 } },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af', font: { size: 9 }, maxTicksLimit: 8 }
                },
                y: {
                    title: { display: true, text: '|Mxy|', color: '#9ca3af', font: { size: 10 } },
                    min: 0, max: 1.05,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af', font: { size: 9 } }
                }
            },
            plugins: {
                legend: { labels: { color: '#f3f4f6', font: { family: 'Outfit', size: 10 } } }
            }
        }
    });

    setChart(newChart);
}

// =============================================================
// MODULE 2: Magnetic Gradients & Spatial Encoding
// =============================================================
function initM2Controls() {
    const gxInputs = [document.getElementById('m2_gxSlider'), document.getElementById('s_m2_gxSlider')];
    const timeInputs = [document.getElementById('m2_timeSlider'), document.getElementById('s_m2_timeSlider')];

    gxInputs.forEach(input => {
        if (!input) return;
        input.addEventListener('input', (e) => {
            stateM2.gx = parseFloat(e.target.value);
            syncM2Inputs();
            updateModule2();
        });
    });

    timeInputs.forEach(input => {
        if (!input) return;
        input.addEventListener('input', (e) => {
            stateM2.timeMs = parseFloat(e.target.value);
            syncM2Inputs();
            updateModule2();
        });
    });

    const runBtns = [document.getElementById('m2_runCodeBtn'), document.getElementById('s_m2_runCodeBtn')];
    runBtns.forEach(btn => {
        if (btn) btn.addEventListener('click', runModule2Simulation);
    });

    updateModule2();
}

function syncM2Inputs() {
    ['m2_gxSlider', 's_m2_gxSlider'].forEach(id => { const el = document.getElementById(id); if (el) el.value = stateM2.gx; });
    ['m2_gxVal', 's_m2_gxVal'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = stateM2.gx.toFixed(0) + ' mT/m'; });
    ['m2_timeSlider', 's_m2_timeSlider'].forEach(id => { const el = document.getElementById(id); if (el) el.value = stateM2.timeMs; });
    ['m2_timeVal', 's_m2_timeVal'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = stateM2.timeMs.toFixed(1) + ' ms'; });
}

function updateModule2() {
    const maxFreqOffsetKHz = Math.abs(42.576 * stateM2.gx * 1.0); // kHz at x = 1
    const phaseFactor = (stateM2.gx * 0.15) * (stateM2.timeMs * 0.4);

    let sumMx = 0, sumMy = 0;
    const xs = [], phases = [];
    for (let i = 0; i < stateM2.count; i++) {
        const x = -1.0 + (2.0 * i) / (stateM2.count - 1);
        xs.push(x);
        const phi = phaseFactor * x;
        phases.push(phi);
        sumMx += Math.cos(phi);
        sumMy += Math.sin(phi);
    }
    const netMxy = Math.sqrt(sumMx * sumMx + sumMy * sumMy) / stateM2.count;

    ['m2_resMaxOffset', 's_m2_resMaxOffset'].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = '±' + maxFreqOffsetKHz.toFixed(1) + ' kHz';
    });
    ['m2_resNetSignal', 's_m2_resNetSignal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = (netMxy * 100).toFixed(1) + '%';
            el.style.color = netMxy > 0.5 ? '#34d399' : (netMxy > 0.2 ? '#fbbf24' : '#f87171');
        }
    });

    // Reactive prose text updates
    flashReactive('r_gx', stateM2.gx.toFixed(0));
    flashReactive('r_time', stateM2.timeMs.toFixed(1));
    flashReactive('r_maxOffset', '±' + maxFreqOffsetKHz.toFixed(1));
    flashReactive('r_netSignal', (netMxy * 100).toFixed(1) + '%');

    // Draw Canvases
    const cPaper = document.getElementById('m2_gradientCanvas');
    if (cPaper) drawGradientIsochromatArray(cPaper, xs, phases, stateM2.gx);

    const cSlide = document.getElementById('s_m2_gradientCanvas');
    if (cSlide) drawGradientIsochromatArray(cSlide, xs, phases, stateM2.gx);
}

function drawGradientIsochromatArray(canvas, xs, phases, gx) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Linear Magnetic Field Profile Bz(x)
    const topH = height * 0.42;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, topH / 2); ctx.lineTo(width - 30, topH / 2);
    ctx.stroke();

    const slopeY = (gx / 50.0) * (topH * 0.35);
    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(30, (topH / 2) + slopeY);
    ctx.lineTo(width - 30, (topH / 2) - slopeY);
    ctx.stroke();

    ctx.font = '11px Space Grotesk, sans-serif';
    ctx.fillStyle = '#ec4899';
    ctx.textAlign = 'left';
    ctx.fillText(currentLang === 'es' ? `Campo Lineal: B(x) = B₀ + Gₓ·x (Pendiente: ${gx.toFixed(0)} mT/m)` : `Linear Field: B(x) = B₀ + Gₓ·x (Slope: ${gx.toFixed(0)} mT/m)`, 30, 20);

    // Isochromat Vector Dials
    const botY = height * 0.72;
    const dialR = 17;
    const count = xs.length;

    for (let i = 0; i < count; i++) {
        const cx = 35 + ((width - 70) * i) / (count - 1);
        const phi = phases[i];

        ctx.beginPath();
        ctx.arc(cx, botY, dialR, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();

        const vx = cx + dialR * Math.cos(phi);
        const vy = botY - dialR * Math.sin(phi);

        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, botY); ctx.lineTo(vx, vy);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(vx, vy, 2.5, 0, 2 * Math.PI);
        ctx.fillStyle = '#60a5fa';
        ctx.fill();

        ctx.font = '10px Space Grotesk, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.textAlign = 'center';
        ctx.fillText(xs[i].toFixed(1), cx, botY + dialR + 13);
    }
}

function runModule2Simulation() {
    ['m2_codeOutput', 's_m2_codeOutput'].forEach(id => {
        const el = document.getElementById(id); if (el) el.classList.add('show');
    });

    const spins = [];
    const count = 7;
    for (let i = 0; i < count; i++) {
        const x = -1.0 + (2.0 * i) / (count - 1);
        spins.push({ id: `spin_${i}`, x: x, T1: 800, T2: 300, PD: 1.0, w: 0 });
    }

    const sim = new BlochSimulator(spins, 80, 0.2, 'rotating', 'GRE', { flipAngle: 90, TE: 40, TR: 100 });
    const results = sim.run();

    renderMod2Chart(results, 'm2_simChart', chartMod2Paper, c => chartMod2Paper = c);
    renderMod2Chart(results, 's_m2_simChart', chartMod2Slide, c => chartMod2Slide = c);
}

function renderMod2Chart(results, canvasId, existingChart, setChart) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const labels = results.signals.map(s => s.t.toFixed(1));
    const mxyData = results.signals.map(s => s.Mxy);
    const gradData = results.sequenceGrad.map(g => g / (2 * Math.PI * 30.0));

    if (existingChart) existingChart.destroy();

    const newChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: currentLang === 'es' ? 'Señal Transversal Neta Mxy (Pico de Eco en TE = 40 ms)' : 'Net Transverse Signal Mxy (Echo Peak at TE = 40 ms)',
                    data: mxyData,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    borderWidth: 2,
                    fill: true,
                    yAxisID: 'y'
                },
                {
                    label: currentLang === 'es' ? 'Gradiente de Lectura Gx' : 'Readout Gradient Gx',
                    data: gradData,
                    borderColor: '#ec4899',
                    borderWidth: 1.5,
                    borderDash: [4, 4],
                    pointRadius: 0,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                x: {
                    title: { display: true, text: 'Time (ms)', color: '#9ca3af', font: { size: 10 } },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af', font: { size: 9 }, maxTicksLimit: 8 }
                },
                y: {
                    title: { display: true, text: 'Signal |Mxy|', color: '#10b981', font: { size: 10 } },
                    min: 0, max: 1.05,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#10b981', font: { size: 9 } }
                },
                y1: {
                    position: 'right',
                    title: { display: true, text: 'Gx', color: '#ec4899', font: { size: 10 } },
                    min: -1.5, max: 1.5,
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#ec4899', font: { size: 9 } }
                }
            },
            plugins: {
                legend: { labels: { color: '#f3f4f6', font: { family: 'Outfit', size: 10 } } }
            }
        }
    });

    setChart(newChart);
}

// =============================================================
// MODULE 3: RF Pulses & The B1 Field
// =============================================================
function initM3Controls() {
    const flipInputs = [document.getElementById('m3_flipSlider'), document.getElementById('s_m3_flipSlider')];
    const durInputs = [document.getElementById('m3_durSlider'), document.getElementById('s_m3_durSlider')];
    const gzInputs = [document.getElementById('m3_gzSlider'), document.getElementById('s_m3_gzSlider')];

    flipInputs.forEach(input => {
        if (!input) return;
        input.addEventListener('input', (e) => {
            stateM3.flip = parseFloat(e.target.value);
            syncM3Inputs();
            updateModule3();
        });
    });

    durInputs.forEach(input => {
        if (!input) return;
        input.addEventListener('input', (e) => {
            stateM3.durMs = parseFloat(e.target.value);
            syncM3Inputs();
            updateModule3();
        });
    });

    gzInputs.forEach(input => {
        if (!input) return;
        input.addEventListener('input', (e) => {
            stateM3.gz = parseFloat(e.target.value);
            syncM3Inputs();
            updateModule3();
        });
    });

    // Pulse type buttons
    document.querySelectorAll('.m3-pulse-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.m3-pulse-btn').forEach(b => b.classList.remove('active'));
            const p = btn.getAttribute('data-pulse');
            document.querySelectorAll(`.m3-pulse-btn[data-pulse="${p}"]`).forEach(b => b.classList.add('active'));
            stateM3.type = p;
            updateModule3();
        });
    });

    // Nutation anim buttons
    const tipBtns = [document.getElementById('m3_animateTipBtn'), document.getElementById('s_m3_animateTipBtn')];
    tipBtns.forEach(btn => {
        if (btn) btn.addEventListener('click', triggerNutationAnimation);
    });

    // Run Code buttons
    const runBtns = [document.getElementById('m3_runCodeBtn'), document.getElementById('s_m3_runCodeBtn')];
    runBtns.forEach(btn => {
        if (btn) btn.addEventListener('click', runModule3Simulation);
    });

    updateModule3();
}

function syncM3Inputs() {
    ['m3_flipSlider', 's_m3_flipSlider'].forEach(id => { const el = document.getElementById(id); if (el) el.value = stateM3.flip; });
    ['m3_flipVal', 's_m3_flipVal'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = stateM3.flip.toFixed(0) + '°'; });
    ['m3_durSlider', 's_m3_durSlider'].forEach(id => { const el = document.getElementById(id); if (el) el.value = stateM3.durMs; });
    ['m3_durVal', 's_m3_durVal'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = stateM3.durMs.toFixed(1) + ' ms'; });
    ['m3_gzSlider', 's_m3_gzSlider'].forEach(id => { const el = document.getElementById(id); if (el) el.value = stateM3.gz; });
    ['m3_gzVal', 's_m3_gzVal'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = stateM3.gz.toFixed(0) + ' mT/m'; });
}

function updateModule3() {
    const rad = (stateM3.flip * Math.PI) / 180.0;
    const finalMxy = Math.sin(rad);
    const finalMz = Math.cos(rad);

    const gammaRadMicroT = 0.2675; // rad / (ms * uT)
    const b1MicroT = rad / (gammaRadMicroT * stateM3.durMs);

    let bwHz = 1000.0 / stateM3.durMs;
    if (stateM3.type === 'sinc') bwHz *= 2.5;
    if (stateM3.type === 'gauss') bwHz *= 1.5;

    const gammaHzPerMmPerMTm = 42.576;
    const sliceThickMm = bwHz / (gammaHzPerMmPerMTm * stateM3.gz);

    ['m3_resB1', 's_m3_resB1'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = b1MicroT.toFixed(1) + ' µT'; });
    ['m3_resBw', 's_m3_resBw'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = bwHz.toFixed(0) + ' Hz'; });
    ['m3_resThick', 's_m3_resThick'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = sliceThickMm.toFixed(2) + ' mm'; });
    ['m3_resComponents', 's_m3_resComponents'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = `Mxy = ${finalMxy.toFixed(2)}, Mz = ${finalMz.toFixed(2)}`; });

    // Reactive prose text updates
    flashReactive('r_flip', stateM3.flip.toFixed(0));
    flashReactive('r_dur', stateM3.durMs.toFixed(1));
    flashReactive('r_b1', b1MicroT.toFixed(1));
    flashReactive('r_thick', sliceThickMm.toFixed(2));

    // Draw Canvases
    drawM3Canvases();
}

function triggerNutationAnimation() {
    stateM3.nutProgress = 0.0;
    const startTime = performance.now();
    const duration = 1200;

    function step(time) {
        const elapsed = time - startTime;
        stateM3.nutProgress = Math.min(1.0, elapsed / duration);
        drawM3Canvases();
        if (stateM3.nutProgress < 1.0) {
            requestAnimationFrame(step);
        }
    }
    requestAnimationFrame(step);
}

function drawM3Canvases() {
    const cSpherePaper = document.getElementById('m3_sphereCanvas');
    const cProfPaper = document.getElementById('m3_profileCanvas');
    if (cSpherePaper) drawBlochNutationSphere(cSpherePaper, stateM3.flip, stateM3.nutProgress);
    if (cProfPaper) drawPulseFourierProfile(cProfPaper, stateM3.type);

    const cSphereSlide = document.getElementById('s_m3_sphereCanvas');
    const cProfSlide = document.getElementById('s_m3_profileCanvas');
    if (cSphereSlide) drawBlochNutationSphere(cSphereSlide, stateM3.flip, stateM3.nutProgress);
    if (cProfSlide) drawPulseFourierProfile(cProfSlide, stateM3.type);
}

function drawBlochNutationSphere(canvas, flipAngle, progress) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2 + 10;
    const R = Math.min(width, height) * 0.35;

    // Sphere outline
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Equator ellipse
    ctx.beginPath();
    ctx.ellipse(cx, cy, R, R * 0.35, 0, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Axes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy + R * 1.25); ctx.lineTo(cx, cy - R * 1.25);
    ctx.moveTo(cx - R * 0.8, cy + R * 0.4); ctx.lineTo(cx + R * 0.8, cy - R * 0.4);
    ctx.moveTo(cx - R * 1.25, cy); ctx.lineTo(cx + R * 1.25, cy);
    ctx.stroke();

    ctx.font = '10px Space Grotesk, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.textAlign = 'center';
    ctx.fillText('+z (B₀)', cx, cy - R * 1.3);
    ctx.fillText("+x' (B₁)", cx + R * 0.85, cy - R * 0.4);
    ctx.fillText("+y'", cx + R * 1.32, cy + 4);

    const currentRad = ((flipAngle * Math.PI) / 180.0) * progress;

    // Trajectory arc
    ctx.strokeStyle = 'rgba(236, 72, 153, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const steps = 30;
    for (let i = 0; i <= steps; i++) {
        const th = (currentRad * i) / steps;
        const px = cx + (R * Math.sin(th));
        const py = cy - (R * Math.cos(th));
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Magnetization Vector
    const tipX = cx + (R * Math.sin(currentRad));
    const tipY = cy - (R * Math.cos(currentRad));

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy); ctx.lineTo(tipX, tipY);
    ctx.stroke();

    const arrowAngle = Math.atan2(cy - tipY, tipX - cx);
    const headLen = 10;
    ctx.fillStyle = '#60a5fa';
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - headLen * Math.cos(arrowAngle - Math.PI / 6), tipY + headLen * Math.sin(arrowAngle - Math.PI / 6));
    ctx.lineTo(tipX - headLen * Math.cos(arrowAngle + Math.PI / 6), tipY + headLen * Math.sin(arrowAngle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
}

function drawPulseFourierProfile(canvas, pulseType) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const halfW = width / 2;
    const midY = height * 0.6;

    // Time domain envelope
    ctx.font = '10px Space Grotesk, sans-serif';
    ctx.fillStyle = '#ec4899';
    ctx.textAlign = 'left';
    ctx.fillText(currentLang === 'es' ? `Envolvente B₁(t) [${pulseType.toUpperCase()}]` : `Envelope B₁(t) [${pulseType.toUpperCase()}]`, 15, 20);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath(); ctx.moveTo(15, midY); ctx.lineTo(halfW - 15, midY); ctx.stroke();

    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const nPoints = 80;
    for (let i = 0; i <= nPoints; i++) {
        const tau = -1.0 + (2.0 * i) / nPoints;
        let env = 0;
        if (pulseType === 'rect') env = Math.abs(tau) <= 0.8 ? 1.0 : 0.0;
        else if (pulseType === 'sinc') { const arg = tau * Math.PI * 3.0; env = arg === 0 ? 1.0 : Math.sin(arg) / arg; }
        else if (pulseType === 'gauss') env = Math.exp(-tau * tau * 6.0);

        const px = 15 + ((halfW - 30) * i) / nPoints;
        const py = midY - env * (height * 0.35);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Divider
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath(); ctx.moveTo(halfW, 15); ctx.lineTo(halfW, height - 15); ctx.stroke();

    // Frequency excitation profile
    ctx.fillStyle = '#10b981';
    ctx.fillText(currentLang === 'es' ? `Perfil de Corte |Mxy(f)|` : `Slice Profile |Mxy(f)|`, halfW + 15, 20);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath(); ctx.moveTo(halfW + 15, midY); ctx.lineTo(width - 15, midY); ctx.stroke();

    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= nPoints; i++) {
        const f = -2.0 + (4.0 * i) / nPoints;
        let prof = 0;
        if (pulseType === 'rect') { const arg = f * Math.PI * 1.5; prof = arg === 0 ? 1.0 : Math.abs(Math.sin(arg) / arg); }
        else if (pulseType === 'sinc') prof = Math.abs(f) <= 1.0 ? 0.95 : 0.03 * Math.exp(-Math.abs(f));
        else if (pulseType === 'gauss') prof = Math.exp(-f * f * 2.0);

        const px = halfW + 15 + ((halfW - 30) * i) / nPoints;
        const py = midY - prof * (height * 0.35);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
}

function runModule3Simulation() {
    ['m3_codeOutput', 's_m3_codeOutput'].forEach(id => {
        const el = document.getElementById(id); if (el) el.classList.add('show');
    });

    const singleSpin = [{ id: 'spin_rf', x: 0, T1: 600, T2: 120, PD: 1.0, w: 0 }];
    const sim = new BlochSimulator(singleSpin, 60, 0.1, 'rotating', 'FID', { flipAngle: stateM3.flip });
    const results = sim.run();

    renderMod3Chart(results, 'm3_simChart', chartMod3Paper, c => chartMod3Paper = c);
    renderMod3Chart(results, 's_m3_simChart', chartMod3Slide, c => chartMod3Slide = c);
}

function renderMod3Chart(results, canvasId, existingChart, setChart) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const labels = results.signals.map(s => s.t.toFixed(1));
    const mxyData = results.signals.map(s => s.Mxy);
    const mzData = results.signals.map(s => s.Mz);

    if (existingChart) existingChart.destroy();

    const newChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: currentLang === 'es' ? `Mxy (Inclinación ${stateM3.flip.toFixed(0)}°)` : `Mxy (Flip ${stateM3.flip.toFixed(0)}°)`,
                    data: mxyData,
                    borderColor: '#3b82f6',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 0
                },
                {
                    label: currentLang === 'es' ? `Mz (Inclinación ${stateM3.flip.toFixed(0)}°)` : `Mz (Flip ${stateM3.flip.toFixed(0)}°)`,
                    data: mzData,
                    borderColor: '#f59e0b',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                x: {
                    title: { display: true, text: 'Time (ms)', color: '#9ca3af', font: { size: 10 } },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af', font: { size: 9 }, maxTicksLimit: 8 }
                },
                y: {
                    title: { display: true, text: 'Magnetization', color: '#9ca3af', font: { size: 10 } },
                    min: -1.1, max: 1.1,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af', font: { size: 9 } }
                }
            },
            plugins: {
                legend: { labels: { color: '#f3f4f6', font: { family: 'Outfit', size: 10 } } }
            }
        }
    });

    setChart(newChart);
}

// =============================================================
// MODULE 4: k-Space & Image Formation
// =============================================================
function initM4Controls() {
    // Phantom buttons
    document.querySelectorAll('.m4-phantom-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const p = btn.getAttribute('data-phantom');
            document.querySelectorAll('.m4-phantom-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll(`.m4-phantom-btn[data-phantom="${p}"]`).forEach(b => b.classList.add('active'));
            stateM4.phantom = p;
            updateModule4();
        });
    });

    // Filter buttons
    document.querySelectorAll('.m4-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const f = btn.getAttribute('data-filter');
            document.querySelectorAll('.m4-filter-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll(`.m4-filter-btn[data-filter="${f}"]`).forEach(b => b.classList.add('active'));
            stateM4.filter = f;

            ['m4_radiusGroup', 's_m4_radiusGroup'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = (f === 'lowpass' || f === 'highpass') ? 'flex' : 'none';
            });
            ['m4_accelGroup', 's_m4_accelGroup'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = (f === 'undersample') ? 'flex' : 'none';
            });

            updateModule4();
        });
    });

    const radiusInputs = [document.getElementById('m4_radiusSlider'), document.getElementById('s_m4_radiusSlider')];
    radiusInputs.forEach(input => {
        if (!input) return;
        input.addEventListener('input', (e) => {
            stateM4.radius = parseInt(e.target.value, 10);
            ['m4_radiusVal', 's_m4_radiusVal'].forEach(id => {
                const el = document.getElementById(id); if (el) el.textContent = stateM4.radius + ' px';
            });
            updateModule4();
        });
    });

    const accelInputs = [document.getElementById('m4_accelSlider'), document.getElementById('s_m4_accelSlider')];
    accelInputs.forEach(input => {
        if (!input) return;
        input.addEventListener('input', (e) => {
            stateM4.accel = parseInt(e.target.value, 10);
            ['m4_accelVal', 's_m4_accelVal'].forEach(id => {
                const el = document.getElementById(id); if (el) el.textContent = stateM4.accel + 'x';
            });
            updateModule4();
        });
    });

    const runBtns = [document.getElementById('m4_runCodeBtn'), document.getElementById('s_m4_runCodeBtn')];
    runBtns.forEach(btn => {
        if (btn) btn.addEventListener('click', runModule4Simulation);
    });

    updateModule4();
}

function updateModule4() {
    const N = stateM4.N;
    const rawPhantom = generatePhantomMatrix(stateM4.phantom, N);
    const kspace = forward2D_DFT_Matrix(rawPhantom);
    const { reconstructed, filteredKspace } = inverse2D_DFT_Matrix(kspace, stateM4.filter, stateM4.radius, stateM4.accel);

    // Compute central energy fraction
    let totalEnergy = 0, centerEnergy = 0;
    const center = N / 2;
    for (let ky = 0; ky < N; ky++) {
        for (let kx = 0; kx < N; kx++) {
            const s = kspace[ky][kx];
            const magSq = s.real * s.real + s.imag * s.imag;
            totalEnergy += magSq;
            if (Math.hypot(kx - center, ky - center) <= 6) centerEnergy += magSq;
        }
    }
    const energyPct = totalEnergy > 0 ? (centerEnergy / totalEnergy * 100).toFixed(1) + '%' : '0%';

    let filterDesc = currentLang === 'es' ? 'Espacio k Completo (100% datos)' : 'Full k-Space (100% data)';
    if (stateM4.filter === 'lowpass') filterDesc = currentLang === 'es' ? `Paso Bajo (Radio ${stateM4.radius} px: bordes difusos, preserva contraste)` : `Low-Pass (Radius ${stateM4.radius} px: blur, preserves contrast)`;
    if (stateM4.filter === 'highpass') filterDesc = currentLang === 'es' ? `Paso Alto (Radio ${stateM4.radius} px: solo bordes, sin contraste)` : `High-Pass (Radius ${stateM4.radius} px: edges only, no contrast)`;
    if (stateM4.filter === 'undersample') filterDesc = currentLang === 'es' ? `Submuestreado ${stateM4.accel}x (Fantasmas de aliasing por repliegue)` : `Undersampled ${stateM4.accel}x (Aliasing foldover ghosts)`;

    ['m4_resFilterDesc', 's_m4_resFilterDesc'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = filterDesc; });
    ['m4_resEnergy', 's_m4_resEnergy'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = energyPct; });

    // Reactive prose text updates
    flashReactive('r_filter', filterDesc);
    flashReactive('r_energy', energyPct);

    // Render Canvases on Paper & Slide
    const cKPaper = document.getElementById('m4_kspaceCanvas');
    const cRPaper = document.getElementById('m4_reconCanvas');
    if (cKPaper) renderKspaceCanvas(cKPaper, filteredKspace, N);
    if (cRPaper) renderReconstructedCanvas(cRPaper, reconstructed, N);

    const cKSlide = document.getElementById('s_m4_kspaceCanvas');
    const cRSlide = document.getElementById('s_m4_reconCanvas');
    if (cKSlide) renderKspaceCanvas(cKSlide, filteredKspace, N);
    if (cRSlide) renderReconstructedCanvas(cRSlide, reconstructed, N);
}

function startCartesianTrajAnimLoop() {
    let currentLine = 0;
    const totalLines = 16;
    let scanProgress = 0.0;

    function render() {
        const cPaper = document.getElementById('m4_trajCanvas');
        const cSlide = document.getElementById('s_m4_trajCanvas');

        if (cPaper && (currentModality === 'paper' || cPaper.offsetParent !== null)) {
            drawCartesianTraj(cPaper, currentLine, totalLines, scanProgress);
        }
        if (cSlide && (currentModality === 'slides' || cSlide.offsetParent !== null)) {
            drawCartesianTraj(cSlide, currentLine, totalLines, scanProgress);
        }

        scanProgress += 0.035;
        if (scanProgress >= 1.0) {
            scanProgress = 0.0;
            currentLine = (currentLine + 1) % totalLines;
        }

        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
}

function drawCartesianTraj(canvas, currentLine, totalLines, scanProgress) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let i = 20; i < width; i += 25) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke(); }
    for (let j = 20; j < height; j += 25) { ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(width, j); ctx.stroke(); }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(15, cy); ctx.lineTo(width - 15, cy);
    ctx.moveTo(cx, 15); ctx.lineTo(cx, height - 15);
    ctx.stroke();

    ctx.font = '10px Space Grotesk, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillText(currentLang === 'es' ? '+kx (Lectura)' : '+kx (Readout)', width - 65, cy - 6);
    ctx.fillText(currentLang === 'es' ? '+ky (Codif. de Fase)' : '+ky (Phase Encode)', cx + 6, 25);

    ctx.strokeStyle = 'rgba(59, 130, 246, 0.25)';
    ctx.lineWidth = 1.5;
    const pad = 30;
    const lineSpacing = (height - 2 * pad) / (totalLines - 1);

    for (let l = 0; l < currentLine; l++) {
        const lineY = pad + l * lineSpacing;
        ctx.beginPath(); ctx.moveTo(pad, lineY); ctx.lineTo(width - pad, lineY); ctx.stroke();
    }

    const activeY = pad + currentLine * lineSpacing;
    const currentX = pad + (width - 2 * pad) * scanProgress;

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(pad, activeY); ctx.lineTo(currentX, activeY); ctx.stroke();

    ctx.beginPath();
    ctx.arc(currentX, activeY, 4, 0, 2 * Math.PI);
    ctx.fillStyle = '#60a5fa';
    ctx.fill();
}

function runModule4Simulation() {
    ['m4_codeOutput', 's_m4_codeOutput'].forEach(id => {
        const el = document.getElementById(id); if (el) el.classList.add('show');
    });

    const spins = [
        { id: 'obj1', x: -0.6, T1: 1000, T2: 500, PD: 1.0, w: 0 },
        { id: 'obj2', x:  0.0, T1: 1000, T2: 500, PD: 0.5, w: 0 },
        { id: 'obj3', x:  0.5, T1: 1000, T2: 500, PD: 0.8, w: 0 }
    ];

    const sim = new BlochSimulator(spins, 60, 0.2, 'rotating', 'GRE', { flipAngle: 90, TE: 30, TR: 100 });
    const results = sim.run();

    renderMod4Chart(results, 'm4_simChart', chartMod4Paper, c => chartMod4Paper = c);
    renderMod4Chart(results, 's_m4_simChart', chartMod4Slide, c => chartMod4Slide = c);
}

function renderMod4Chart(results, canvasId, existingChart, setChart) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const N = results.signals.length;
    const timeDomainSignal = results.signals.map(s => s.Mxy);

    const spatialProfile = [];
    const spatialLabels = [];
    for (let k = 0; k < N; k++) {
        let real = 0, imag = 0;
        const kShifted = k - N / 2;
        for (let n = 0; n < N; n++) {
            const angle = -2 * Math.PI * (kShifted * n) / N;
            real += timeDomainSignal[n] * Math.cos(angle);
            imag += timeDomainSignal[n] * Math.sin(angle);
        }
        spatialProfile.push(Math.sqrt(real * real + imag * imag));
        spatialLabels.push(((kShifted / (N / 2)) * 1.0).toFixed(2));
    }

    if (existingChart) existingChart.destroy();

    const newChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: spatialLabels,
            datasets: [{
                label: currentLang === 'es' ? 'Perfil 1D Reconstruido |ρ(x)| vía FFT 1D' : 'Reconstructed 1D Profile |ρ(x)| via 1D FFT',
                data: spatialProfile,
                borderColor: '#a78bfa',
                backgroundColor: 'rgba(167, 139, 250, 0.15)',
                borderWidth: 2,
                fill: true,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                x: {
                    title: { display: true, text: 'Position (x)', color: '#9ca3af', font: { size: 10 } },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af', font: { size: 9 }, maxTicksLimit: 8 }
                },
                y: {
                    title: { display: true, text: '|ρ(x)|', color: '#a78bfa', font: { size: 10 } },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#a78bfa', font: { size: 9 } }
                }
            },
            plugins: {
                legend: { labels: { color: '#f3f4f6', font: { family: 'Outfit', size: 10 } } }
            }
        }
    });

    setChart(newChart);
}

// -------------------------------------------------------------
// Helper: Update All Visuals across Modalities
// -------------------------------------------------------------
function updateAllVisuals(target) {
    updateModule1();
    updateModule2();
    updateModule3();
    updateModule4();
}

// 2D Fourier Engine Functions
function generatePhantomMatrix(type, N) {
    const mat = [];
    const center = N / 2;
    for (let y = 0; y < N; y++) {
        mat[y] = [];
        for (let x = 0; x < N; x++) {
            const dx = x - center;
            const dy = y - center;
            let val = 0.0;
            if (type === 'brain') {
                const rOuter = (dx * dx) / (12 * 12) + (dy * dy) / (14 * 14);
                if (rOuter <= 1.0) {
                    val = 0.3;
                    const rV1 = ((dx - 2.5) * (dx - 2.5)) / (2 * 2) + ((dy + 1) * (dy + 1)) / (4 * 4);
                    const rV2 = ((dx + 2.5) * (dx + 2.5)) / (2 * 2) + ((dy + 1) * (dy + 1)) / (4 * 4);
                    if (rV1 <= 1.0 || rV2 <= 1.0) val = 0.85;
                    if (rOuter > 0.85) val = 0.6;
                    const rWM = (dx * dx) / (7 * 7) + ((dy - 2) * (dy - 2)) / (7 * 7);
                    if (rWM <= 1.0 && rV1 > 1.0 && rV2 > 1.0) val = 0.45;
                }
            } else if (type === 'geometric') {
                const rDisk = dx * dx + dy * dy;
                if (rDisk <= 10 * 10) val = 0.4;
                if (dx >= -8 && dx <= -2 && dy >= -8 && dy <= -2) val = 0.9;
                if (dx >= 2 && dx <= 8 && dy >= 2 && dy <= 8) val = 0.7;
            } else if (type === 'mrijs') {
                if (Math.abs(dx) <= 10 && Math.abs(dy) <= 10) {
                    const ix = x - (center - 8);
                    const iy = y - (center - 8);
                    if (ix >= 0 && ix <= 16 && iy >= 0 && iy <= 16) {
                        if (ix <= 3 || ix >= 13 || (iy >= 3 && iy <= 6 && Math.abs(ix - 8) <= 3)) val = 0.85;
                    }
                }
            }
            mat[y][x] = val;
        }
    }
    return mat;
}

function forward2D_DFT_Matrix(img) {
    const N = img.length;
    const kspace = [];
    for (let ky = 0; ky < N; ky++) {
        kspace[ky] = [];
        for (let kx = 0; kx < N; kx++) {
            let real = 0, imag = 0;
            const kxShifted = kx - N / 2;
            const kyShifted = ky - N / 2;
            for (let y = 0; y < N; y++) {
                for (let x = 0; x < N; x++) {
                    const val = img[y][x];
                    if (val > 0) {
                        const angle = -2 * Math.PI * ((kxShifted * x) / N + (kyShifted * y) / N);
                        real += val * Math.cos(angle);
                        imag += val * Math.sin(angle);
                    }
                }
            }
            kspace[ky][kx] = { real, imag };
        }
    }
    return kspace;
}

function inverse2D_DFT_Matrix(kspace, filterType, radius, accel) {
    const N = kspace.length;
    const center = N / 2;
    const reconstructed = [];
    const filteredKspace = [];

    for (let ky = 0; ky < N; ky++) {
        filteredKspace[ky] = [];
        for (let kx = 0; kx < N; kx++) {
            const dx = kx - center;
            const dy = ky - center;
            const dist = Math.sqrt(dx * dx + dy * dy);
            let keep = true;
            if (filterType === 'lowpass') keep = dist <= radius;
            else if (filterType === 'highpass') keep = dist > radius;
            else if (filterType === 'undersample') keep = (ky % accel) === 0;

            filteredKspace[ky][kx] = keep ? kspace[ky][kx] : { real: 0, imag: 0 };
        }
    }

    for (let y = 0; y < N; y++) {
        reconstructed[y] = [];
        for (let x = 0; x < N; x++) {
            let real = 0, imag = 0;
            for (let ky = 0; ky < N; ky++) {
                const kyShifted = ky - center;
                for (let kx = 0; kx < N; kx++) {
                    const kxShifted = kx - center;
                    const s = filteredKspace[ky][kx];
                    if (s.real !== 0 || s.imag !== 0) {
                        const angle = 2 * Math.PI * ((kxShifted * x) / N + (kyShifted * y) / N);
                        real += s.real * Math.cos(angle) - s.imag * Math.sin(angle);
                        imag += s.real * Math.sin(angle) + s.imag * Math.cos(angle);
                    }
                }
            }
            reconstructed[y][x] = Math.sqrt(real * real + imag * imag) / (N * N);
        }
    }

    return { reconstructed, filteredKspace };
}

function renderKspaceCanvas(canvas, kspace, N) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    let maxLog = 0;
    const logMags = [];
    for (let ky = 0; ky < N; ky++) {
        logMags[ky] = [];
        for (let kx = 0; kx < N; kx++) {
            const s = kspace[ky][kx];
            const mag = Math.sqrt(s.real * s.real + s.imag * s.imag);
            const val = Math.log(1.0 + mag * 50.0);
            logMags[ky][kx] = val;
            if (val > maxLog) maxLog = val;
        }
    }

    const cellW = width / N;
    const cellH = height / N;

    for (let ky = 0; ky < N; ky++) {
        for (let kx = 0; kx < N; kx++) {
            const norm = maxLog > 0 ? logMags[ky][kx] / maxLog : 0;
            const r = Math.round(norm * 255);
            const g = Math.round(Math.pow(norm, 1.6) * 220);
            const b = Math.round(Math.pow(norm, 0.6) * 255);
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.fillRect(kx * cellW, ky * cellH, cellW + 0.5, cellH + 0.5);
        }
    }
}

function renderReconstructedCanvas(canvas, img, N) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    let maxVal = 0;
    for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
            if (img[y][x] > maxVal) maxVal = img[y][x];
        }
    }

    const cellW = width / N;
    const cellH = height / N;

    for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
            const norm = maxVal > 0 ? img[y][x] / maxVal : 0;
            const gray = Math.round(norm * 255);
            ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
            ctx.fillRect(x * cellW, y * cellH, cellW + 0.5, cellH + 0.5);
        }
    }
}

// Copy Code Helper
window.copyCode = function(preId, btn) {
    const pre = document.getElementById(preId);
    if (!pre) return;
    navigator.clipboard.writeText(pre.innerText).then(() => {
        const orig = btn.innerHTML;
        btn.innerHTML = `<i data-lucide="check" style="width:12px;height:12px;"></i> ${currentLang === 'es' ? '¡Copiado!' : 'Copied!'}`;
        if (window.lucide) lucide.createIcons();
        setTimeout(() => {
            btn.innerHTML = orig;
            if (window.lucide) lucide.createIcons();
        }, 2000);
    });
};

// -------------------------------------------------------------
// Reset to Baseline Parameters
// -------------------------------------------------------------
window.resetModule = function(modNum) {
    if (modNum === 1) {
        stateM1.b0 = 1.5;
        stateM1.nucleus = '1H';
        stateM1.df = 2.0;
        stateM1.running = true;
        syncM1Inputs();
        updateModule1();
    } else if (modNum === 2) {
        stateM2.gx = 20.0;
        stateM2.timeMs = 5.0;
        syncM2Inputs();
        updateModule2();
    } else if (modNum === 3) {
        stateM3.flip = 90.0;
        stateM3.durMs = 2.0;
        stateM3.gz = 20.0;
        stateM3.type = 'sinc';
        stateM3.nutProgress = 1.0;
        document.querySelectorAll('.m3-pulse-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.m3-pulse-btn[data-pulse="sinc"]').forEach(b => b.classList.add('active'));
        syncM3Inputs();
        updateModule3();
    } else if (modNum === 4) {
        stateM4.phantom = 'brain';
        stateM4.filter = 'all';
        stateM4.radius = 8;
        stateM4.accel = 2;
        document.querySelectorAll('.m4-phantom-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.m4-phantom-btn[data-phantom="brain"]').forEach(b => b.classList.add('active'));
        document.querySelectorAll('.m4-filter-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.m4-filter-btn[data-filter="all"]').forEach(b => b.classList.add('active'));
        ['m4_radiusGroup', 's_m4_radiusGroup', 'm4_accelGroup', 's_m4_accelGroup'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        updateModule4();
    }
};

// -------------------------------------------------------------
// Active Learning Pedagogical Checkpoints Controller
// -------------------------------------------------------------
function initCheckpoints() {
    document.querySelectorAll('.checkpoint-card').forEach(card => {
        const buttons = card.querySelectorAll('.checkpoint-opt-btn');
        const feedback = card.querySelector('.checkpoint-feedback');

        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const isCorrect = btn.getAttribute('data-correct') === 'true';
                
                // Clear previous states on this card
                buttons.forEach(b => {
                    b.classList.remove('correct', 'incorrect');
                });

                if (isCorrect) {
                    btn.classList.add('correct');
                    if (feedback) {
                        feedback.className = 'checkpoint-feedback show correct';
                        const okLbl = currentLang === 'es' ? 'Respuesta correcta.' : 'Correct analysis.';
                        feedback.innerHTML = `<strong><i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> ${okLbl}</strong> ` + btn.getAttribute('data-explanation');
                    }
                } else {
                    btn.classList.add('incorrect');
                    if (feedback) {
                        feedback.className = 'checkpoint-feedback show incorrect';
                        const noLbl = currentLang === 'es' ? 'Respuesta incorrecta.' : 'Incorrect.';
                        feedback.innerHTML = `<strong><i data-lucide="alert-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> ${noLbl}</strong> ` + btn.getAttribute('data-explanation');
                    }
                }
                if (window.lucide) lucide.createIcons();
            });
        });
    });
}

// -------------------------------------------------------------
// Floating Paper Outline Scroll-Spy
// -------------------------------------------------------------
function initScrollSpy() {
    const secIds = ['sec1', 'sec2', 'sec3', 'sec4', 'sec5'];
    const sections = secIds.map(id => document.getElementById(id)).filter(Boolean);
    const outlineLinks = document.querySelectorAll('.outline-link');
    if (!sections.length || !outlineLinks.length) return;

    // Smooth active state updating via IntersectionObserver
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const targetId = entry.target.id;
                outlineLinks.forEach(link => {
                    if (link.getAttribute('data-target') === targetId) {
                        link.classList.add('active');
                    } else {
                        link.classList.remove('active');
                    }
                });
            }
        });
    }, {
        root: null,
        rootMargin: '-10% 0px -65% 0px',
        threshold: 0
    });

    sections.forEach(sec => observer.observe(sec));
}

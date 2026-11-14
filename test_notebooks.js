// Numerical and physics test suite for MRIjs Interactive Learning Notebooks
const BlochSimulator = require('./bloch.js');

const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ${colors.green}✓ PASS:${colors.reset} ${message}`);
        testsPassed++;
    } else {
        console.log(`  ${colors.red}✗ FAIL:${colors.reset} ${colors.bold}${message}${colors.reset}`);
        testsFailed++;
    }
}

console.log(`${colors.bold}${colors.cyan}===============================================`);
console.log("   MRIjs Interactive Notebooks Physics Tests");
console.log(`===============================================${colors.reset}\n`);

// ----------------------------------------------------
// Notebook 1: B0 & Larmor Precession Physics
// ----------------------------------------------------
console.log(`${colors.bold}Notebook 1 Tests: B0 & Larmor Equation${colors.reset}`);
try {
    const gammaH = 42.576e6; // Hz/Tesla for 1H
    const b0_1p5 = 1.5;
    const b0_3p0 = 3.0;
    const b0_7p0 = 7.0;

    const f1p5 = gammaH * b0_1p5;
    const f3p0 = gammaH * b0_3p0;
    const f7p0 = gammaH * b0_7p0;

    assert(Math.abs(f1p5 - 63.864e6) < 1e3, `1.5T 1H Larmor frequency is 63.864 MHz (got ${(f1p5/1e6).toFixed(3)} MHz)`);
    assert(Math.abs(f3p0 - 127.728e6) < 1e3, `3.0T 1H Larmor frequency is 127.728 MHz (got ${(f3p0/1e6).toFixed(3)} MHz)`);
    assert(Math.abs(f7p0 - 298.032e6) < 1e3, `7.0T 1H Larmor frequency is 298.032 MHz (got ${(f7p0/1e6).toFixed(3)} MHz)`);

    // Chemical shift water-fat: delta = 3.5 ppm
    const deltaPpm = 3.5e-6;
    const deltaF_1p5 = deltaPpm * f1p5;
    const deltaF_3p0 = deltaPpm * f3p0;
    assert(Math.abs(deltaF_1p5 - 223.524) < 0.1, `Water-fat shift at 1.5T is ~223.5 Hz (got ${deltaF_1p5.toFixed(2)} Hz)`);
    assert(Math.abs(deltaF_3p0 - 447.048) < 0.1, `Water-fat shift at 3.0T is ~447.0 Hz (got ${deltaF_3p0.toFixed(2)} Hz)`);

    // Bloch simulation of chemical shift interference / beat pattern
    // Two isochromats (water w = 0, fat/shifted w = 40 Hz) post 90 flip
    const spins = [
        { id: 'water', x: 0, T1: 1000, T2: 500, PD: 1.0, w: 0 },
        { id: 'shifted', x: 0, T1: 1000, T2: 500, PD: 1.0, w: 40 }
    ];
    // With delta_f = 40 Hz, beat period is T = 1/40 = 25 ms.
    // Constructive peaks at ~25ms, ~50ms, ~75ms; destructive minima at ~14ms, ~39ms, ~64ms.
    const sim = new BlochSimulator(spins, 100, 0.2, 'rotating', 'FID', { flipAngle: 90 });
    const res = sim.run();

    const stepMin = Math.round(14.0 / 0.2);
    const mxyMin = res.signals[stepMin].Mxy;

    const stepPeak = Math.round(25.0 / 0.2);
    const mxyPeak = res.signals[stepPeak].Mxy;

    assert(mxyMin < 0.3, `Chemical shift destructive interference at ~14ms produces signal dip (actual: ${mxyMin.toFixed(3)})`);
    assert(mxyPeak > 0.85, `Chemical shift constructive beat peak at ~25ms (T = 1/df) restores signal (actual: ${mxyPeak.toFixed(3)})`);
} catch (e) {
    console.error(`  ${colors.red}Error in Notebook 1 tests:${colors.reset} ${e.stack}`);
    testsFailed++;
}
console.log();

// ----------------------------------------------------
// Notebook 2: Gradients & Spatial Encoding
// ----------------------------------------------------
console.log(`${colors.bold}Notebook 2 Tests: Gradients & Spatial Encoding${colors.reset}`);
try {
    // 5 isochromats across x = -1, -0.5, 0, 0.5, 1
    const xs = [-1.0, -0.5, 0.0, 0.5, 1.0];
    const spinsGrad = xs.map((x, idx) => ({
        id: `spin_${idx}`,
        x: x,
        T1: 1000,
        T2: 500,
        PD: 1.0,
        w: 0
    }));

    // Simulating Gradient Echo with TE = 40 ms
    const simGre = new BlochSimulator(spinsGrad, 80, 0.2, 'rotating', 'GRE', { flipAngle: 90, TE: 40, TR: 100 });
    const resGre = simGre.run();

    // Mid-dephasing around 15ms: spins are spread, Mxy should be low
    const stepDephase = Math.round(15.0 / 0.2);
    const mxyDephased = resGre.signals[stepDephase].Mxy;
    assert(mxyDephased < 0.35, `Gradient dephases spatial isochromats during dephasing lobe (Mxy: ${mxyDephased.toFixed(3)})`);

    // At TE = 40ms, gradient rephases spins, Mxy peaks
    const stepEcho = Math.round(40.0 / 0.2);
    const mxyEcho = resGre.signals[stepEcho].Mxy;
    assert(mxyEcho > 0.8, `Gradient echo rephases spatial isochromats at TE=40ms (Mxy: ${mxyEcho.toFixed(3)})`);
    assert(mxyEcho > mxyDephased * 2, `Echo amplitude is significantly higher than dephased signal`);
} catch (e) {
    console.error(`  ${colors.red}Error in Notebook 2 tests:${colors.reset} ${e.stack}`);
    testsFailed++;
}
console.log();

// ----------------------------------------------------
// Notebook 3: RF Pulses & B1 Nutation
// ----------------------------------------------------
console.log(`${colors.bold}Notebook 3 Tests: RF Pulses & B1 Field${colors.reset}`);
try {
    const singleSpin = [{ id: 'rf_test', x: 0, T1: 1000, T2: 500, PD: 1.0, w: 0 }];

    // Test 30 deg pulse
    const sim30 = new BlochSimulator(singleSpin, 10, 0.1, 'rotating', 'FID', { flipAngle: 30 });
    const res30 = sim30.run();
    const stepPostRf = Math.round(2.0 / 0.1); // RF duration is 2ms
    const mxy30 = res30.signals[stepPostRf].Mxy;
    const mz30 = res30.signals[stepPostRf].Mz;
    const expectedMxy30 = Math.sin(30 * Math.PI / 180);
    const expectedMz30 = Math.cos(30 * Math.PI / 180);
    assert(Math.abs(mxy30 - expectedMxy30) < 0.02, `30° RF pulse gives Mxy = sin(30°) = 0.50 (got ${mxy30.toFixed(3)})`);
    assert(Math.abs(mz30 - expectedMz30) < 0.02, `30° RF pulse gives Mz = cos(30°) = 0.866 (got ${mz30.toFixed(3)})`);

    // Test 180 deg pulse (Inversion)
    const sim180 = new BlochSimulator(singleSpin, 10, 0.1, 'rotating', 'FID', { flipAngle: 180 });
    const res180 = sim180.run();
    const mz180 = res180.signals[stepPostRf].Mz;
    assert(Math.abs(mz180 - (-1.0)) < 0.05, `180° RF pulse inverts magnetization to Mz ≈ -1.0 (got ${mz180.toFixed(3)})`);
} catch (e) {
    console.error(`  ${colors.red}Error in Notebook 3 tests:${colors.reset} ${e.stack}`);
    testsFailed++;
}
console.log();

// ----------------------------------------------------
// Notebook 4: k-Space & 2D Image Reconstruction
// ----------------------------------------------------
console.log(`${colors.bold}Notebook 4 Tests: 2D Fourier Transform & k-Space Reconstruction${colors.reset}`);
try {
    // 2D DFT / IDFT functions for testing
    function forward2D_DFT(image) {
        const N = image.length;
        const kspace = [];
        for (let ky = 0; ky < N; ky++) {
            kspace[ky] = [];
            for (let kx = 0; kx < N; kx++) {
                let real = 0;
                let imag = 0;
                for (let y = 0; y < N; y++) {
                    for (let x = 0; x < N; x++) {
                        const val = image[y][x];
                        const angle = -2 * Math.PI * ((kx * x) / N + (ky * y) / N);
                        real += val * Math.cos(angle);
                        imag += val * Math.sin(angle);
                    }
                }
                kspace[ky][kx] = { real, imag };
            }
        }
        return kspace;
    }

    function inverse2D_DFT(kspace) {
        const N = kspace.length;
        const image = [];
        for (let y = 0; y < N; y++) {
            image[y] = [];
            for (let x = 0; x < N; x++) {
                let real = 0;
                let imag = 0;
                for (let ky = 0; ky < N; ky++) {
                    for (let kx = 0; kx < N; kx++) {
                        const s = kspace[ky][kx];
                        const angle = 2 * Math.PI * ((kx * x) / N + (ky * y) / N);
                        real += s.real * Math.cos(angle) - s.imag * Math.sin(angle);
                        imag += s.real * Math.sin(angle) + s.imag * Math.cos(angle);
                    }
                }
                image[y][x] = Math.sqrt(real * real + imag * imag) / (N * N);
            }
        }
        return image;
    }

    // Create 8x8 test pattern (box phantom)
    const N = 8;
    const testImg = [];
    for (let y = 0; y < N; y++) {
        testImg[y] = [];
        for (let x = 0; x < N; x++) {
            testImg[y][x] = (x >= 2 && x <= 5 && y >= 2 && y <= 5) ? 1.0 : 0.0;
        }
    }

    const kspace = forward2D_DFT(testImg);
    const reconstructed = inverse2D_DFT(kspace);

    let maxDiff = 0;
    for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
            const diff = Math.abs(testImg[y][x] - reconstructed[y][x]);
            if (diff > maxDiff) maxDiff = diff;
        }
    }

    assert(maxDiff < 1e-9, `2D DFT followed by 2D IDFT reconstructs image with numerical precision (max error: ${maxDiff.toExponential(2)})`);

    // Verify that center of k-space contains the DC total intensity
    const totalMass = testImg.flat().reduce((a, b) => a + b, 0);
    const dcValue = Math.sqrt(kspace[0][0].real * kspace[0][0].real + kspace[0][0].imag * kspace[0][0].imag);
    assert(Math.abs(dcValue - totalMass) < 1e-9, `k-Space DC component matches total image intensity (${totalMass})`);

} catch (e) {
    console.error(`  ${colors.red}Error in Notebook 4 tests:${colors.reset} ${e.stack}`);
    testsFailed++;
}
console.log();

// Summary
console.log(`${colors.bold}${colors.cyan}===============================================`);
console.log("Test Run Completed:");
console.log(`  Passed: ${colors.green}${testsPassed}${colors.reset}`);
console.log(`  Failed: ${testsFailed > 0 ? colors.red : colors.green}${testsFailed}${colors.reset}`);
console.log(`===============================================${colors.reset}\n`);

if (testsFailed > 0) process.exit(1);

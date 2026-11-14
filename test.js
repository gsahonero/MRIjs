// Standalone test suite to verify physical correctness of the Bloch equations solver
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
console.log("   MRI Bloch Simulator Physics Engine Tests");
console.log(`===============================================${colors.reset}\n`);

// ----------------------------------------------------
// Test 1: FID (Excitation and T2 decay)
// ----------------------------------------------------
console.log(`${colors.bold}Test Case 1: Free Induction Decay (FID)${colors.reset}`);
try {
    const singleSpin = [{ id: 'spin_fid', x: 0, T1: 1000, T2: 100, PD: 1.0, w: 0 }];
    const simTimeMs = 200;
    const dtMs = 0.2;
    
    const simulator = new BlochSimulator(singleSpin, simTimeMs, dtMs, 'rotating', 'FID', { flipAngle: 90 });
    const results = simulator.run();
    
    // Check initial state
    assert(results.signals[0].Mxy === 0 && results.signals[0].Mz === 1.0, 
        "Initial state at t=0 has zero transverse and full longitudinal magnetization");

    // Check state right after RF pulse (ends at 2ms)
    const stepRfEnd = Math.round(2.0 / dtMs);
    const mxyPostRf = results.signals[stepRfEnd].Mxy;
    const mzPostRf = results.signals[stepRfEnd].Mz;
    
    assert(mxyPostRf > 0.97, `Transverse magnetization is excited to >97% post-90° pulse (actual: ${(mxyPostRf*100).toFixed(1)}%)`);
    assert(mzPostRf < 0.02, `Longitudinal magnetization is tipped close to zero post-90° pulse (actual: ${mzPostRf.toFixed(4)})`);

    // Check decay at 102ms (100ms of decay after excitation)
    // Expected value = mxyPostRf * e^(-100/100) = mxyPostRf * 0.3679
    const stepDecay = Math.round(102.0 / dtMs);
    const mxyDecayed = results.signals[stepDecay].Mxy;
    const expectedDecay = mxyPostRf * Math.exp(-1.0);
    
    assert(Math.abs(mxyDecayed - expectedDecay) < 0.01, 
        `Transverse magnetization decay follows T2 relaxation curve at t=102ms (actual: ${mxyDecayed.toFixed(4)}, expected: ${expectedDecay.toFixed(4)})`);

    // Check longitudinal recovery at 102ms
    // Expected value = mzPostRf * e^(-100/1000) + 1.0 * (1 - e^(-100/1000))
    // e^(-0.1) = 0.9048. Expected Mz = mzPostRf * 0.9048 + 0.0952
    const mzRecovered = results.signals[stepDecay].Mz;
    const expectedRecovery = mzPostRf * Math.exp(-0.1) + 1.0 * (1.0 - Math.exp(-0.1));
    
    assert(Math.abs(mzRecovered - expectedRecovery) < 0.01, 
        `Longitudinal magnetization recovery follows T1 relaxation curve at t=102ms (actual: ${mzRecovered.toFixed(4)}, expected: ${expectedRecovery.toFixed(4)})`);

} catch (e) {
    console.error(`  ${colors.red}Error in Test case 1:${colors.reset} ${e.stack}`);
    testsFailed++;
}
console.log();

// ----------------------------------------------------
// Test 2: Gradient Echo (GRE) (Dephasing & Rephasing)
// ----------------------------------------------------
console.log(`${colors.bold}Test Case 2: Gradient Echo (GRE)${colors.reset}`);
try {
    // Place two spins symmetrically along X axis
    const spins = [
        { id: 'spin_gre_1', x: -1.0, T1: 1000, T2: 200, PD: 1.0, w: 0 },
        { id: 'spin_gre_2', x: 1.0, T1: 1000, T2: 200, PD: 1.0, w: 0 }
    ];
    const TE = 40;
    const TR = 100;
    const dtMs = 0.2;
    
    // We run simulator for 80 ms, echo expected at TE = 40 ms
    const simulator = new BlochSimulator(spins, 80, dtMs, 'rotating', 'GRE', { TE, TR, flipAngle: 90 });
    const results = simulator.run();

    // Check initial dephasing under negative gradient
    const stepDephased = Math.round(11.0 / dtMs); // 11 ms (9 ms of dephasing since RF pulse end)
    const mxyDephased = results.signals[stepDephased].Mxy;
    
    assert(mxyDephased < 0.20, `Spins dephase under gradient field at 11ms (Mxy: ${mxyDephased.toFixed(4)})`);

    // Check echo peak at TE = 40 ms
    const stepEcho = Math.round(40.0 / dtMs);
    const mxyEcho = results.signals[stepEcho].Mxy;
    
    // Check points surrounding the echo to prove it's a local maximum (peak)
    const stepBefore = Math.round(37.0 / dtMs);
    const stepAfter = Math.round(43.0 / dtMs);
    const mxyBefore = results.signals[stepBefore].Mxy;
    const mxyAfter = results.signals[stepAfter].Mxy;
    
    assert(mxyEcho > mxyDephased, `Signal at TE is higher than dephased signal (Echo: ${mxyEcho.toFixed(4)} > Dephased: ${mxyDephased.toFixed(4)})`);
    assert(mxyEcho > mxyBefore && mxyEcho > mxyAfter, 
        `Echo is a local maximum at TE = 40ms (Before: ${mxyBefore.toFixed(4)}, Echo: ${mxyEcho.toFixed(4)}, After: ${mxyAfter.toFixed(4)})`);

} catch (e) {
    console.error(`  ${colors.red}Error in Test case 2:${colors.reset} ${e.stack}`);
    testsFailed++;
}
console.log();

// ----------------------------------------------------
// Test 3: Spin Echo (SE) (Refocusing of off-resonance)
// ----------------------------------------------------
console.log(`${colors.bold}Test Case 3: Spin Echo (SE)${colors.reset}`);
try {
    // Two spins at center, but with opposite off-resonances (+3 Hz and -3 Hz)
    const spins = [
        { id: 'spin_se_1', x: 0, T1: 1000, T2: 200, PD: 1.0, w: -25.0 },
        { id: 'spin_se_2', x: 0, T1: 1000, T2: 200, PD: 1.0, w: 25.0 }
    ];
    const TE = 60;
    const TR = 150;
    const dtMs = 0.2;
    
    const simulator = new BlochSimulator(spins, 100, dtMs, 'rotating', 'SE', { TE, TR });
    const results = simulator.run();

    // Check dephasing before refocusing pulse (at 12 ms, which is 10 ms of dephasing since RF pulse end)
    const stepDephased = Math.round(12.0 / dtMs);
    const mxyDephased = results.signals[stepDephased].Mxy;
    
    assert(mxyDephased < 0.25, `Spins dephase due to off-resonance at 12ms (Mxy: ${mxyDephased.toFixed(4)})`);

    // Check echo peak at TE = 60 ms
    const stepEcho = Math.round(60.0 / dtMs);
    const mxyEcho = results.signals[stepEcho].Mxy;
    
    const stepBefore = Math.round(57.0 / dtMs);
    const stepAfter = Math.round(63.0 / dtMs);
    const mxyBefore = results.signals[stepBefore].Mxy;
    const mxyAfter = results.signals[stepAfter].Mxy;

    assert(mxyEcho > mxyDephased, `Signal at TE is higher than dephased signal (Echo: ${mxyEcho.toFixed(4)} > Dephased: ${mxyDephased.toFixed(4)})`);
    assert(mxyEcho > mxyBefore && mxyEcho > mxyAfter, 
        `Echo is a local maximum at TE = 60ms (Before: ${mxyBefore.toFixed(4)}, Echo: ${mxyEcho.toFixed(4)}, After: ${mxyAfter.toFixed(4)})`);
    
    // Check that echo amplitude matches pure T2 decay: e^(-(TE-2)/T2) = e^(-58/200) = 0.7483
    const expectedT2Decay = Math.exp(-58.0 / 200.0);
    assert(Math.abs(mxyEcho - expectedT2Decay) < 0.02, 
        `Refocused Spin Echo amplitude matches analytical T2 decay value (Echo: ${mxyEcho.toFixed(4)}, expected: ${expectedT2Decay.toFixed(4)})`);

} catch (e) {
    console.error(`  ${colors.red}Error in Test case 3:${colors.reset} ${e.stack}`);
    testsFailed++;
}
console.log();

// ----------------------------------------------------
// Test 4: Pulseq Import, Shape Decompression & Simulation
// ----------------------------------------------------
console.log(`${colors.bold}Test Case 4: Pulseq (.seq) Import, Shape Decompression & Simulation${colors.reset}`);
try {
    const { PulseqParser, PulseqSequence, decompressPulseqShape, compressPulseqShape } = require('./pulseq.js');

    // 4.1 Test Shape Run-Length Derivative Compression & Decompression
    const rawWaveform = new Array(100).fill(0.0);
    for (let i = 20; i < 80; i++) rawWaveform[i] = 1.0;
    const compressed = compressPulseqShape(rawWaveform);
    const decompressed = decompressPulseqShape(compressed, rawWaveform.length);
    
    let shapeMatch = compressed.length < rawWaveform.length;
    for (let i = 0; i < rawWaveform.length; i++) {
        if (Math.abs(rawWaveform[i] - decompressed[i]) > 1e-5) shapeMatch = false;
    }
    assert(shapeMatch, `Pulseq derivative run-length shape decompression reconstructs exact waveform (100 samples -> ${compressed.length} compressed)`);

    // 4.2 Test Pulseq FID Import & Bloch Simulation
    const fidText = PulseqSequence.createSampleFid(90, 200);
    const fidSeq = PulseqParser.parse(fidText);
    assert(fidSeq.blocks.length === 2 && fidSeq.rfEvents.length === 1, `Pulseq FID parser extracts blocks and RF event correctly`);

    const singleSpin = [{ id: 'p_fid', x: 0, T1: 1000, T2: 100, PD: 1.0, w: 0 }];
    const simFid = new BlochSimulator(singleSpin, 200, 0.2, 'rotating', 'PULSEQ', { pulseqSequence: fidSeq });
    const resFid = simFid.run();

    const stepRfEnd = Math.round(2.0 / 0.2);
    const mxyPostRf = resFid.signals[stepRfEnd].Mxy;
    const mzPostRf = resFid.signals[stepRfEnd].Mz;

    assert(mxyPostRf > 0.97, `Pulseq FID excitation tips transverse magnetization to >97% (actual: ${(mxyPostRf*100).toFixed(1)}%)`);
    assert(mzPostRf < 0.02, `Pulseq FID excitation flips Mz close to zero (actual: ${mzPostRf.toFixed(4)})`);

    // 4.3 Test Pulseq GRE Gradient Echo formation
    const greText = PulseqSequence.createSampleGRE(90, 40, 100);
    const greSeq = PulseqParser.parse(greText);
    const greSpins = [
        { id: 'p_gre_1', x: -1.0, T1: 1000, T2: 200, PD: 1.0, w: 0 },
        { id: 'p_gre_2', x: 1.0, T1: 1000, T2: 200, PD: 1.0, w: 0 }
    ];
    const simGre = new BlochSimulator(greSpins, 80, 0.2, 'rotating', 'PULSEQ', { pulseqSequence: greSeq });
    const resGre = simGre.run();

    const stepDephased = Math.round(11.0 / 0.2);
    const stepEcho = Math.round(40.0 / 0.2);
    const mxyDephased = resGre.signals[stepDephased].Mxy;
    const mxyEcho = resGre.signals[stepEcho].Mxy;

    assert(mxyDephased < 0.20, `Pulseq GRE dephases spins under dephasing gradient lobe (Mxy: ${mxyDephased.toFixed(4)})`);
    assert(mxyEcho > mxyDephased && mxyEcho > 0.80, `Pulseq GRE rephases spins to form an echo at TE=40ms (Echo: ${mxyEcho.toFixed(4)})`);

    // 4.4 Test Pulseq Spin Echo (SE) Refocusing
    const seText = PulseqSequence.createSampleSE(60, 150);
    const seSeq = PulseqParser.parse(seText);
    const seSpins = [
        { id: 'p_se_1', x: 0, T1: 1000, T2: 200, PD: 1.0, w: -25.0 },
        { id: 'p_se_2', x: 0, T1: 1000, T2: 200, PD: 1.0, w: 25.0 }
    ];
    const simSe = new BlochSimulator(seSpins, 100, 0.2, 'rotating', 'PULSEQ', { pulseqSequence: seSeq });
    const resSe = simSe.run();

    const stepEchoSe = Math.round(60.0 / 0.2);
    const mxyEchoSe = resSe.signals[stepEchoSe].Mxy;
    const stepBeforeSe = Math.round(57.0 / 0.2);
    const stepAfterSe = Math.round(63.0 / 0.2);

    assert(mxyEchoSe > resSe.signals[stepBeforeSe].Mxy && mxyEchoSe > resSe.signals[stepAfterSe].Mxy,
        `Pulseq SE 180° refocusing pulse generates echo peak at TE=60ms (Echo: ${mxyEchoSe.toFixed(4)})`);

} catch (e) {
    console.error(`  ${colors.red}Error in Test case 4:${colors.reset} ${e.stack}`);
    testsFailed++;
}

console.log(`\n${colors.bold}===============================================`);
console.log(`Test Run Completed:`);
console.log(`  Passed: ${colors.green}${testsPassed}${colors.reset}`);
console.log(`  Failed: ${testsFailed > 0 ? colors.red : colors.green}${testsFailed}${colors.reset}`);
console.log(`===============================================${colors.reset}`);

if (testsFailed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}

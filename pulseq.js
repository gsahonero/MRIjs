/**
 * Pulseq File Format Parser and Sequence Execution Engine for MRIjs
 *
 * Implements the open Pulseq specification (v1.2.x - v1.5.x) for vendor-neutral
 * MRI sequence definitions. Decodes compressed gradient/RF waveform shapes using
 * run-length derivative decompression, reconstructs sequence timelines, and provides
 * continuous-time Bloch state evaluation (RF B1, gradients, and ADC sampling).
 *
 * References:
 * - Layton et al., "Pulseq: A rapid and hardware-independent pulse sequence prototyping framework", MRM 2017.
 * - Pulseq File Format Specification (pulseq.github.io)
 */

(function (global) {
    'use strict';

    /**
     * Decompress a shape stored using Pulseq run-length compression on the derivative.
     * Reconstructs the original waveform samples by expanding repeat markers and
     * computing the cumulative sum (integration) of the decoded derivative stream.
     *
     * @param {Array<number>|Float64Array} shapeData - Compressed shape data array
     * @param {number} numSamples - Expected number of uncompressed samples
     * @param {boolean} [forceDecompression=false] - Force decompression even if lengths match
     * @returns {Float64Array} - Decompressed normalized waveform samples
     */
    function decompressPulseqShape(shapeData, numSamples, forceDecompression = false) {
        if (!shapeData || shapeData.length === 0) {
            return new Float64Array(numSamples || 0);
        }

        const dataPackLen = shapeData.length;

        // If data is already uncompressed
        if (!forceDecompression && numSamples === dataPackLen) {
            return new Float64Array(shapeData);
        }

        const w = new Float64Array(numSamples);
        let countPack = 0;
        let countUnpack = 0;

        // Iterate through data looking for equal adjacent elements (repeat markers)
        for (let i = 0; i < dataPackLen - 1; i++) {
            if (shapeData[i] === shapeData[i + 1]) {
                const nextPack = i;
                const currUnpackSamples = nextPack - countPack;

                if (currUnpackSamples < 0) {
                    continue; // skip duplicate markers
                } else if (currUnpackSamples > 0) {
                    // Copy literal unpacked segment
                    for (let k = 0; k < currUnpackSamples; k++) {
                        if (countUnpack + k < numSamples) {
                            w[countUnpack + k] = shapeData[countPack + k];
                        }
                    }
                    countPack += currUnpackSamples;
                    countUnpack += currUnpackSamples;
                }

                // Packed repeated section: [val, val, repeatCount-2]
                const rep = Math.round(shapeData[countPack + 2]) + 2;
                const val = shapeData[countPack];

                for (let k = 0; k < rep; k++) {
                    if (countUnpack + k < numSamples) {
                        w[countUnpack + k] = val;
                    }
                }
                countPack += 3;
                countUnpack += rep;
            }
        }

        // Copy remaining literal samples
        while (countPack < dataPackLen && countUnpack < numSamples) {
            w[countUnpack++] = shapeData[countPack++];
        }

        // Cumulative sum to reconstruct the waveform from its derivative
        let acc = 0.0;
        for (let i = 0; i < numSamples; i++) {
            acc += w[i];
            w[i] = acc;
        }

        return w;
    }

    /**
     * Helper to compress a waveform using Pulseq derivative run-length encoding.
     * Useful for creating sample sequences or round-trip testing.
     *
     * @param {Array<number>} w - Uncompressed waveform samples
     * @returns {Array<number>} - Run-length encoded derivative array
     */
    function compressPulseqShape(w) {
        if (!w || w.length <= 4) return Array.from(w || []);
        
        const diff = [w[0]];
        for (let i = 1; i < w.length; i++) {
            diff.push(w[i] - w[i - 1]);
        }

        const v = [];
        let i = 0;
        while (i < diff.length) {
            let j = i;
            while (j < diff.length && Math.abs(diff[j] - diff[i]) < 1e-7) {
                j++;
            }
            const count = j - i;
            const val = Math.abs(diff[i]) < 1e-12 ? 0 : diff[i];

            if (count === 1) {
                v.push(val);
            } else if (count === 2) {
                v.push(val, val);
            } else {
                v.push(val, val, count - 2);
            }
            i = j;
        }

        return v.length < w.length ? v : Array.from(w);
    }

    /**
     * Pulseq Sequence Parser
     */
    class PulseqParser {
        /**
         * Parse a Pulseq .seq text string into a structured PulseqSequence object.
         *
         * @param {string} seqText - Raw contents of a .seq file
         * @returns {PulseqSequence} - Parsed sequence model
         */
        static parse(seqText) {
            if (!seqText || typeof seqText !== 'string') {
                throw new Error('Invalid input: sequence content must be a non-empty string.');
            }

            const lines = seqText.split(/\r?\n/);
            let currentSection = null;

            const version = { major: 1, minor: 4, revision: 0 };
            const definitions = {};
            const rawBlocks = [];
            const rfLibrary = new Map();
            const gradLibrary = new Map();
            const adcLibrary = new Map();
            const delayLibrary = new Map();
            const shapeLibrary = new Map();

            let lineIdx = 0;
            while (lineIdx < lines.length) {
                let line = lines[lineIdx].trim();
                lineIdx++;

                // Strip comments
                const commentIdx = line.indexOf('#');
                if (commentIdx !== -1) {
                    line = line.substring(0, commentIdx).trim();
                }

                if (!line) continue;

                // Check for section headers [SECTION_NAME]
                if (line.startsWith('[') && line.endsWith(']')) {
                    currentSection = line.toUpperCase();
                    continue;
                }

                switch (currentSection) {
                    case '[VERSION]': {
                        const parts = line.split(/\s+/);
                        if (parts[0] === 'major') version.major = parseInt(parts[1], 10);
                        if (parts[0] === 'minor') version.minor = parseInt(parts[1], 10);
                        if (parts[0] === 'revision') version.revision = parseInt(parts[1], 10);
                        break;
                    }

                    case '[DEFINITIONS]': {
                        const firstSpace = line.indexOf(' ');
                        const firstTab = line.indexOf('\t');
                        let splitPos = -1;
                        if (firstSpace !== -1 && firstTab !== -1) splitPos = Math.min(firstSpace, firstTab);
                        else splitPos = Math.max(firstSpace, firstTab);

                        if (splitPos !== -1) {
                            const key = line.substring(0, splitPos).trim();
                            const valStr = line.substring(splitPos).trim();
                            const numVal = parseFloat(valStr);
                            definitions[key] = isNaN(numVal) ? valStr : numVal;
                        }
                        break;
                    }

                    case '[BLOCKS]': {
                        const tokens = line.split(/\s+/).map(Number);
                        if (tokens.length >= 7 && !isNaN(tokens[0])) {
                            rawBlocks.push({
                                id: tokens[0],
                                durationToken: tokens[1],
                                rfId: tokens[2],
                                gxId: tokens[3],
                                gyId: tokens[4],
                                gzId: tokens[5],
                                adcId: tokens[6],
                                extId: tokens[7] || 0
                            });
                        }
                        break;
                    }

                    case '[RF]': {
                        const tokens = line.split(/\s+/);
                        if (tokens.length >= 6 && !isNaN(Number(tokens[0]))) {
                            const id = parseInt(tokens[0], 10);
                            const amplitude = parseFloat(tokens[1]); // Hz
                            const magId = parseInt(tokens[2], 10);
                            const phaseId = parseInt(tokens[3], 10);

                            let timeShapeId = 0;
                            let delayUs = 0;
                            let freqHz = 0;
                            let phaseRad = 0;
                            let use = 'u';

                            if (version.major > 1 || (version.major === 1 && version.minor >= 5)) {
                                // v1.5 format: id amp mag_id phase_id time_shape_id center delay freqPPM phasePPM freq phase use
                                timeShapeId = parseInt(tokens[4], 10) || 0;
                                delayUs = parseFloat(tokens[6]) || 0;
                                freqHz = parseFloat(tokens[9]) || 0;
                                phaseRad = parseFloat(tokens[10]) || 0;
                                use = tokens[11] || 'e';
                            } else if (version.major === 1 && version.minor >= 4) {
                                // v1.4 format: id amp mag_id phase_id time_shape_id delay freq phase
                                timeShapeId = parseInt(tokens[4], 10) || 0;
                                delayUs = parseFloat(tokens[5]) || 0;
                                freqHz = parseFloat(tokens[6]) || 0;
                                phaseRad = parseFloat(tokens[7]) || 0;
                            } else {
                                // v1.2 / v1.3 format: id amp mag_id phase_id delay freq phase
                                delayUs = parseFloat(tokens[4]) || 0;
                                freqHz = parseFloat(tokens[5]) || 0;
                                phaseRad = parseFloat(tokens[6]) || 0;
                            }

                            rfLibrary.set(id, {
                                id,
                                amplitude,
                                magId,
                                phaseId,
                                timeShapeId,
                                delay: delayUs * 1e-6, // convert us to seconds
                                freq: freqHz,
                                phase: phaseRad,
                                use
                            });
                        }
                        break;
                    }

                    case '[TRAP]': {
                        const tokens = line.split(/\s+/).map(Number);
                        if (tokens.length >= 6 && !isNaN(tokens[0])) {
                            const id = tokens[0];
                            gradLibrary.set(id, {
                                type: 'trap',
                                id,
                                amplitude: tokens[1],      // Hz/m
                                riseTime: tokens[2] * 1e-6, // us -> s
                                flatTime: tokens[3] * 1e-6, // us -> s
                                fallTime: tokens[4] * 1e-6, // us -> s
                                delay: tokens[5] * 1e-6     // us -> s
                            });
                        }
                        break;
                    }

                    case '[GRADIENTS]': {
                        const tokens = line.split(/\s+/).map(Number);
                        if (tokens.length >= 4 && !isNaN(tokens[0])) {
                            const id = tokens[0];
                            gradLibrary.set(id, {
                                type: 'grad',
                                id,
                                amplitude: tokens[1],      // Hz/m
                                shapeId: tokens[2],
                                delay: tokens[tokens.length - 1] * 1e-6 // us -> s
                            });
                        }
                        break;
                    }

                    case '[ADC]': {
                        const tokens = line.split(/\s+/).map(Number);
                        if (tokens.length >= 6 && !isNaN(tokens[0])) {
                            const id = tokens[0];
                            adcLibrary.set(id, {
                                id,
                                numSamples: tokens[1],
                                dwell: tokens[2] * 1e-9,  // ns -> s
                                delay: tokens[3] * 1e-6,  // us -> s
                                freq: tokens[4],         // Hz
                                phase: tokens[5]         // rad
                            });
                        }
                        break;
                    }

                    case '[DELAYS]': {
                        const tokens = line.split(/\s+/).map(Number);
                        if (tokens.length >= 2 && !isNaN(tokens[0])) {
                            delayLibrary.set(tokens[0], tokens[1] * 1e-6); // us -> s
                        }
                        break;
                    }

                    case '[SHAPES]': {
                        if (line.startsWith('shape_id')) {
                            const shapeId = parseInt(line.split(/\s+/)[1], 10);
                            let numSamples = 0;

                            // Find num_samples line
                            while (lineIdx < lines.length) {
                                let sLine = lines[lineIdx].trim();
                                lineIdx++;
                                if (!sLine || sLine.startsWith('#')) continue;
                                if (sLine.startsWith('num_samples')) {
                                    numSamples = parseInt(sLine.split(/\s+/)[1], 10);
                                    break;
                                }
                            }

                            // Collect shape samples until empty or next shape/section
                            const shapeRawData = [];
                            while (lineIdx < lines.length) {
                                let sLine = lines[lineIdx].trim();
                                if (!sLine || sLine.startsWith('#')) {
                                    lineIdx++;
                                    continue;
                                }
                                if (sLine.startsWith('shape_id') || sLine.startsWith('[')) {
                                    break; // next shape or section starts
                                }
                                lineIdx++;

                                const sTokens = sLine.split(/\s+/);
                                for (let s = 0; s < sTokens.length; s++) {
                                    const val = parseFloat(sTokens[s]);
                                    if (!isNaN(val)) shapeRawData.push(val);
                                }
                            }

                            // Decompress shape samples
                            const decompressedSamples = decompressPulseqShape(shapeRawData, numSamples);
                            shapeLibrary.set(shapeId, {
                                id: shapeId,
                                numSamples,
                                samples: decompressedSamples
                            });
                        }
                        break;
                    }
                }
            }

            return new PulseqSequence({
                version,
                definitions,
                rawBlocks,
                rfLibrary,
                gradLibrary,
                adcLibrary,
                delayLibrary,
                shapeLibrary
            });
        }
    }

    /**
     * Pulseq Sequence Instance
     * Encapsulates blocks, timing, events, and dynamic state evaluation.
     */
    class PulseqSequence {
        constructor(parsedData) {
            this.version = parsedData.version || { major: 1, minor: 4, revision: 0 };
            this.definitions = parsedData.definitions || {};
            this.rfLibrary = parsedData.rfLibrary || new Map();
            this.gradLibrary = parsedData.gradLibrary || new Map();
            this.adcLibrary = parsedData.adcLibrary || new Map();
            this.delayLibrary = parsedData.delayLibrary || new Map();
            this.shapeLibrary = parsedData.shapeLibrary || new Map();

            // Default raster times (seconds)
            this.blockDurationRaster = parseFloat(this.definitions.BlockDurationRaster) || 10e-6; // 10 us
            this.gradRasterTime = parseFloat(this.definitions.GradientRasterTime) || 10e-6;      // 10 us
            this.rfRasterTime = parseFloat(this.definitions.RadiofrequencyRasterTime) || 1e-6;   // 1 us
            this.adcRasterTime = parseFloat(this.definitions.AdcRasterTime) || 100e-9;           // 100 ns

            this.name = this.definitions.Name || 'Unnamed Pulseq Sequence';
            this.fov = this.definitions.FOV || [0.2, 0.2, 0.005];

            // Reconstruct timeline of blocks
            this.blocks = [];
            this.totalDuration = 0.0;
            this.rfEvents = [];
            this.gradEvents = [];
            this.adcEvents = [];

            this._buildTimeline(parsedData.rawBlocks || []);
        }

        _buildTimeline(rawBlocks) {
            let currentTime = 0.0;
            const isV14OrAbove = this.version.major > 1 || (this.version.major === 1 && this.version.minor >= 4);

            for (let i = 0; i < rawBlocks.length; i++) {
                const rb = rawBlocks[i];
                let duration = 0.0;

                if (isV14OrAbove) {
                    duration = rb.durationToken * this.blockDurationRaster;
                } else {
                    // Older versions used delay ID in column 2
                    duration = this.delayLibrary.get(rb.durationToken) || 0.0;
                }

                const block = {
                    id: rb.id,
                    startTime: currentTime,
                    duration: duration,
                    endTime: currentTime + duration,
                    rf: rb.rfId > 0 ? this.rfLibrary.get(rb.rfId) : null,
                    gx: rb.gxId > 0 ? this.gradLibrary.get(rb.gxId) : null,
                    gy: rb.gyId > 0 ? this.gradLibrary.get(rb.gyId) : null,
                    gz: rb.gzId > 0 ? this.gradLibrary.get(rb.gzId) : null,
                    adc: rb.adcId > 0 ? this.adcLibrary.get(rb.adcId) : null
                };

                // Track RF event with absolute timing
                if (block.rf) {
                    const magShape = this.shapeLibrary.get(block.rf.magId);
                    const timeShape = block.rf.timeShapeId > 0 ? this.shapeLibrary.get(block.rf.timeShapeId) : null;
                    let rfDuration = 0.0;

                    if (timeShape && timeShape.samples && timeShape.samples.length > 0) {
                        const lastSample = timeShape.samples[timeShape.samples.length - 1];
                        // If time shape samples are in microseconds (e.g. 300 for 300us)
                        rfDuration = lastSample > 1.0 ? lastSample * 1e-6 : lastSample * this.rfRasterTime;
                    } else if (magShape && magShape.numSamples > 2) {
                        rfDuration = magShape.numSamples * this.rfRasterTime;
                    } else {
                        // Block pulse: spans the block duration minus initial delay
                        rfDuration = Math.max(0, block.duration - block.rf.delay);
                    }

                    this.rfEvents.push({
                        ...block.rf,
                        blockId: block.id,
                        blockStartTime: block.startTime,
                        absStartTime: block.startTime + block.rf.delay,
                        absEndTime: block.startTime + block.rf.delay + rfDuration,
                        duration: rfDuration,
                        magSamples: magShape ? magShape.samples : new Float64Array([1.0, 1.0]),
                        phaseSamples: this.shapeLibrary.get(block.rf.phaseId)?.samples || null,
                        timeSamples: timeShape ? timeShape.samples : null
                    });
                }

                // Track Gradient events with absolute timing
                ['gx', 'gy', 'gz'].forEach(channel => {
                    const grad = block[channel];
                    if (grad) {
                        let gDur = 0.0;
                        if (grad.type === 'trap') {
                            gDur = grad.riseTime + grad.flatTime + grad.fallTime;
                        } else if (grad.type === 'grad') {
                            const shp = this.shapeLibrary.get(grad.shapeId);
                            gDur = (shp ? shp.numSamples : 0) * this.gradRasterTime;
                        }

                        this.gradEvents.push({
                            ...grad,
                            channel,
                            blockId: block.id,
                            absStartTime: block.startTime + grad.delay,
                            absEndTime: block.startTime + grad.delay + gDur,
                            duration: gDur,
                            shapeSamples: grad.shapeId ? this.shapeLibrary.get(grad.shapeId)?.samples : null
                        });
                    }
                });

                // Track ADC readouts with absolute timing
                if (block.adc) {
                    const adcDur = block.adc.numSamples * block.adc.dwell;
                    this.adcEvents.push({
                        ...block.adc,
                        blockId: block.id,
                        absStartTime: block.startTime + block.adc.delay,
                        absEndTime: block.startTime + block.adc.delay + adcDur,
                        duration: adcDur
                    });
                }

                this.blocks.push(block);
                currentTime += duration;
            }

            this.totalDuration = currentTime;
        }

        /**
         * Find block at time t using binary search.
         */
        findBlockAt(t) {
            if (this.blocks.length === 0 || t < 0) return null;
            if (t >= this.totalDuration) return null;

            let low = 0;
            let high = this.blocks.length - 1;

            while (low <= high) {
                const mid = (low + high) >> 1;
                const b = this.blocks[mid];
                if (t >= b.startTime && t < b.endTime) {
                    return b;
                } else if (t < b.startTime) {
                    high = mid - 1;
                } else {
                    low = mid + 1;
                }
            }
            return null;
        }

        /**
         * Computes the continuous RF rotation rate (omegaX, omegaY in rad/s),
         * gradient field strength (Gx, Gy, Gz in Hz/m), and ADC activity at time t.
         *
         * @param {number} t - Time in seconds
         * @returns {Object} - { omegaX, omegaY, G, Gx, Gy, Gz, isAdc, rfMag }
         */
        getStateAt(t) {
            let omegaX = 0.0;
            let omegaY = 0.0;
            let Gx = 0.0;
            let Gy = 0.0;
            let Gz = 0.0;
            let isAdc = false;
            let rfMag = 0.0;

            const block = this.findBlockAt(t);
            if (!block) {
                return { omegaX, omegaY, G: 0.0, Gx, Gy, Gz, isAdc, rfMag };
            }

            // 1. Evaluate RF event if present in current block
            if (block.rf) {
                const rfStart = block.startTime + block.rf.delay;
                const magShape = this.shapeLibrary.get(block.rf.magId);
                const timeShape = block.rf.timeShapeId > 0 ? this.shapeLibrary.get(block.rf.timeShapeId) : null;
                let rfDur = 0.0;

                if (timeShape && timeShape.samples && timeShape.samples.length > 0) {
                    const lastSample = timeShape.samples[timeShape.samples.length - 1];
                    rfDur = lastSample > 1.0 ? lastSample * 1e-6 : lastSample * this.rfRasterTime;
                } else if (magShape && magShape.numSamples > 2) {
                    rfDur = magShape.numSamples * this.rfRasterTime;
                } else {
                    rfDur = Math.max(0, block.duration - block.rf.delay);
                }

                if (t >= rfStart && t < rfStart + rfDur) {
                    const tau = t - rfStart;
                    let normMag = 1.0;

                    if (magShape && magShape.samples && magShape.samples.length > 2) {
                        const sampleIdx = Math.min(
                            magShape.samples.length - 1,
                            Math.floor(tau / (rfDur / magShape.samples.length))
                        );
                        normMag = magShape.samples[sampleIdx];
                    } else if (magShape && magShape.samples && magShape.samples.length > 0) {
                        normMag = magShape.samples[0];
                    }

                    // RF amplitude in Hz
                    const b1Hz = block.rf.amplitude * normMag;
                    rfMag = Math.abs(b1Hz);

                    // Phase calculation: base phase + frequency rotation + phase shape
                    let phase = block.rf.phase + 2.0 * Math.PI * block.rf.freq * tau;
                    if (block.rf.phaseId > 0) {
                        const phaseShape = this.shapeLibrary.get(block.rf.phaseId);
                        if (phaseShape && phaseShape.samples && phaseShape.samples.length > 0) {
                            const pIdx = Math.min(
                                phaseShape.samples.length - 1,
                                Math.floor(tau / this.rfRasterTime)
                            );
                            phase += phaseShape.samples[pIdx];
                        }
                    }

                    // Convert B1 from Hz to angular velocity in rad/s: omega1 = 2 * pi * B1
                    const omega1 = 2.0 * Math.PI * b1Hz;
                    omegaX = omega1 * Math.cos(phase);
                    omegaY = omega1 * Math.sin(phase);
                }
            }

            // 2. Evaluate Gradients (Gx, Gy, Gz)
            const evalGrad = (grad) => {
                if (!grad) return 0.0;
                const gStart = block.startTime + grad.delay;

                if (grad.type === 'trap') {
                    const tRel = t - gStart;
                    if (tRel < 0) return 0.0;

                    if (tRel < grad.riseTime) {
                        return grad.riseTime > 0 ? grad.amplitude * (tRel / grad.riseTime) : grad.amplitude;
                    } else if (tRel < grad.riseTime + grad.flatTime) {
                        return grad.amplitude;
                    } else if (tRel < grad.riseTime + grad.flatTime + grad.fallTime) {
                        const fallRel = tRel - grad.riseTime - grad.flatTime;
                        return grad.fallTime > 0 ? grad.amplitude * (1.0 - fallRel / grad.fallTime) : 0.0;
                    }
                    return 0.0;
                } else if (grad.type === 'grad') {
                    const shape = this.shapeLibrary.get(grad.shapeId);
                    if (!shape || !shape.samples) return 0.0;
                    const dur = shape.numSamples * this.gradRasterTime;
                    const tRel = t - gStart;
                    if (tRel >= 0 && tRel < dur) {
                        const sampleIdx = Math.min(
                            shape.samples.length - 1,
                            Math.floor(tRel / this.gradRasterTime)
                        );
                        return grad.amplitude * shape.samples[sampleIdx];
                    }
                    return 0.0;
                }
                return 0.0;
            };

            Gx = evalGrad(block.gx);
            Gy = evalGrad(block.gy);
            Gz = evalGrad(block.gz);

            // 3. Evaluate ADC Readout window
            if (block.adc) {
                const adcStart = block.startTime + block.adc.delay;
                const adcDur = block.adc.numSamples * block.adc.dwell;
                if (t >= adcStart && t < adcStart + adcDur) {
                    isAdc = true;
                }
            }

            // In MRIjs 1D coordinate model, isochromats are distributed along X.
            // Convert gradient Gx (Hz/m) to visual angular precession rate (rad/s per unit distance).
            // A typical sequence edge gradient is mapped so 30 Hz at x = 1.
            // 2 * pi * Gx gives rad/s/m.
            const G = 2.0 * Math.PI * Gx;

            return {
                omegaX,
                omegaY,
                G,
                Gx,
                Gy,
                Gz,
                isAdc,
                rfMag
            };
        }

        /**
         * Returns human-readable sequence summary for display.
         */
        getSummary() {
            return {
                name: this.name,
                version: `${this.version.major}.${this.version.minor}.${this.version.revision}`,
                totalDurationMs: this.totalDuration * 1000.0,
                numBlocks: this.blocks.length,
                numRfPulses: this.rfEvents.length,
                numGradients: this.gradEvents.length,
                numAdcReadouts: this.adcEvents.length,
                fov: Array.isArray(this.fov) ? this.fov.join(' x ') : String(this.fov)
            };
        }

        // ============================================================
        // Built-in Standard Pulseq Sequence Generators
        // ============================================================

        /**
         * Generates a valid Pulseq (.seq) string for a Free Induction Decay (FID) sequence.
         */
        static createSampleFid(flipAngleDeg = 90, durationMs = 200) {
            const rfDurationMs = 2.0; // 2 ms RF pulse
            const rfDurationS = rfDurationMs / 1000.0;
            const b1Hz = (flipAngleDeg / 360.0) / rfDurationS; // e.g. 125 Hz for 90 deg, 2 ms

            const rfDurRaster = Math.round(rfDurationMs / 0.01); // 10 us raster units
            const waitDurMs = Math.max(1, durationMs - rfDurationMs);
            const waitDurRaster = Math.round(waitDurMs / 0.01);

            const numSamples = 512;
            const dwellNs = Math.round((waitDurMs * 1e6) / numSamples);

            return `# Pulseq sequence file
# Generated by MRIjs Pulseq Engine

[VERSION]
major 1
minor 4
revision 0

[DEFINITIONS]
BlockDurationRaster 1e-05
GradientRasterTime 1e-05
RadiofrequencyRasterTime 1e-06
AdcRasterTime 1e-07
Name Free_Induction_Decay_FID
TotalDuration ${(durationMs / 1000.0).toFixed(4)}

[BLOCKS]
1 ${rfDurRaster} 1 0 0 0 0 0
2 ${waitDurRaster} 0 0 0 0 1 0

[RF]
1 ${b1Hz.toFixed(3)} 1 2 0 0 0 0

[ADC]
1 ${numSamples} ${dwellNs} 0 0 0

[SHAPES]

shape_id 1
num_samples 2
1
1

shape_id 2
num_samples 2
0
0
`;
        }

        /**
         * Generates a valid Pulseq (.seq) string for a Gradient Echo (GRE) sequence with dephasing and rephasing lobes.
         */
        static createSampleGRE(flipAngleDeg = 90, TE = 40, TR = 100) {
            const rfDurationMs = 2.0; // 2 ms
            const rfDurS = rfDurationMs / 1000.0;
            const b1Hz = (flipAngleDeg / 360.0) / rfDurS;

            const rfDurRaster = Math.round(rfDurationMs / 0.01);
            // Dephasing gradient duration: (TE - rfDuration) / 2
            const dephaseDurMs = (TE - rfDurationMs) / 2.0;
            const dephaseDurRaster = Math.round(dephaseDurMs / 0.01);
            // Readout rephasing gradient duration: TE - rfDurationMs
            const readoutDurMs = TE - rfDurationMs;
            const readoutDurRaster = Math.round(readoutDurMs / 0.01);
            // Remaining TR delay
            const remainMs = Math.max(1.0, TR - rfDurationMs - dephaseDurMs - readoutDurMs);
            const remainRaster = Math.round(remainMs / 0.01);

            const dephaseUs = Math.round(dephaseDurMs * 1000);
            const readoutUs = Math.round(readoutDurMs * 1000);

            const numSamples = 256;
            const dwellNs = Math.round((readoutDurMs * 1e6) / numSamples);

            return `# Pulseq sequence file
# Generated by MRIjs Pulseq Engine

[VERSION]
major 1
minor 4
revision 0

[DEFINITIONS]
BlockDurationRaster 1e-05
GradientRasterTime 1e-05
RadiofrequencyRasterTime 1e-06
AdcRasterTime 1e-07
Name Gradient_Echo_GRE
TotalDuration ${(TR / 1000.0).toFixed(4)}

[BLOCKS]
1 ${rfDurRaster} 1 0 0 0 0 0
2 ${dephaseDurRaster} 0 1 0 0 0 0
3 ${readoutDurRaster} 0 2 0 0 1 0
4 ${remainRaster} 0 0 0 0 0 0

[RF]
1 ${b1Hz.toFixed(3)} 1 2 0 0 0 0

[TRAP]
1 -30 0 ${dephaseUs} 0 0
2 30 0 ${readoutUs} 0 0

[ADC]
1 ${numSamples} ${dwellNs} 0 0 0

[SHAPES]

shape_id 1
num_samples 2
1
1

shape_id 2
num_samples 2
0
0
`;
        }

        /**
         * Generates a valid Pulseq (.seq) string for a Spin Echo (SE) sequence (90° excitation and 180° refocusing).
         */
        static createSampleSE(TE = 60, TR = 150) {
            const rfDurationMs = 2.0; // 2 ms
            const rfDurS = rfDurationMs / 1000.0;
            const b1_90 = (90.0 / 360.0) / rfDurS;  // 90 deg pulse
            const b1_180 = (180.0 / 360.0) / rfDurS; // 180 deg pulse

            const rfDurRaster = Math.round(rfDurationMs / 0.01);
            // Delay from 90 end to 180 start: TE/2 - rfDuration
            const delay1Ms = TE / 2.0 - rfDurationMs;
            const delay1Raster = Math.round(delay1Ms / 0.01);
            // Delay from 180 end to echo peak: TE/2 - rfDuration
            const delay2Ms = TE / 2.0 - rfDurationMs;
            const delay2Raster = Math.round(delay2Ms / 0.01);
            // Remaining TR delay
            const remainMs = Math.max(1.0, TR - 2 * rfDurationMs - delay1Ms - delay2Ms);
            const remainRaster = Math.round(remainMs / 0.01);

            const numSamples = 256;
            const dwellNs = Math.round((delay2Ms * 1e6) / numSamples);

            return `# Pulseq sequence file
# Generated by MRIjs Pulseq Engine

[VERSION]
major 1
minor 4
revision 0

[DEFINITIONS]
BlockDurationRaster 1e-05
GradientRasterTime 1e-05
RadiofrequencyRasterTime 1e-06
AdcRasterTime 1e-07
Name Spin_Echo_SE
TotalDuration ${(TR / 1000.0).toFixed(4)}

[BLOCKS]
1 ${rfDurRaster} 1 0 0 0 0 0
2 ${delay1Raster} 0 0 0 0 0 0
3 ${rfDurRaster} 2 0 0 0 0 0
4 ${delay2Raster} 0 0 0 0 1 0
5 ${remainRaster} 0 0 0 0 0 0

[RF]
1 ${b1_90.toFixed(3)} 1 2 0 0 0 0
2 ${b1_180.toFixed(3)} 1 2 0 0 0 1.570796

[ADC]
1 ${numSamples} ${dwellNs} 0 0 0

[SHAPES]

shape_id 1
num_samples 2
1
1

shape_id 2
num_samples 2
0
0
`;
        }

        /**
         * Generates a valid Pulseq (.seq) string with an apodized Sinc RF pulse shape.
         */
        static createSampleSinc(flipAngleDeg = 90, durationMs = 150) {
            const rfDurationMs = 3.0; // 3 ms sinc pulse
            const rfDurS = rfDurationMs / 1000.0;
            const numSamples = 100;
            const sincSamples = [];

            // Generate Hann-apodized sinc shape
            let sincSum = 0;
            for (let i = 0; i < numSamples; i++) {
                const t = (i / (numSamples - 1) - 0.5) * 8.0; // 4 zero crossings on each side
                const sinc = t === 0 ? 1.0 : Math.sin(Math.PI * t) / (Math.PI * t);
                const hann = 0.5 * (1.0 + Math.cos(2.0 * Math.PI * (i / (numSamples - 1) - 0.5)));
                const val = Math.max(0, sinc * hann); // magnitude
                sincSamples.push(val);
                sincSum += val;
            }

            // Normalize peak to 1
            const maxVal = Math.max(...sincSamples);
            const normSamples = sincSamples.map(v => v / maxVal);

            // B1 peak amplitude in Hz: flipAngleRad = 2 * pi * B1 * integral(shape) dt
            const dtSample = rfDurS / numSamples;
            const shapeIntegral = normSamples.reduce((a, b) => a + b, 0) * dtSample;
            const flipAngleRad = (flipAngleDeg * Math.PI) / 180.0;
            const b1PeakHz = flipAngleRad / (2.0 * Math.PI * shapeIntegral);

            const rfDurRaster = Math.round(rfDurationMs / 0.01);
            const waitDurMs = Math.max(1, durationMs - rfDurationMs);
            const waitDurRaster = Math.round(waitDurMs / 0.01);

            const adcNumSamples = 512;
            const dwellNs = Math.round((waitDurMs * 1e6) / adcNumSamples);

            const shapeLines = normSamples.map(v => v.toFixed(6)).join('\n');

            return `# Pulseq sequence file
# Generated by MRIjs Pulseq Engine

[VERSION]
major 1
minor 4
revision 0

[DEFINITIONS]
BlockDurationRaster 1e-05
GradientRasterTime 1e-05
RadiofrequencyRasterTime 3e-05
AdcRasterTime 1e-07
Name Selective_Sinc_Pulse
TotalDuration ${(durationMs / 1000.0).toFixed(4)}

[BLOCKS]
1 ${rfDurRaster} 1 0 0 0 0 0
2 ${waitDurRaster} 0 0 0 0 1 0

[RF]
1 ${b1PeakHz.toFixed(3)} 1 2 0 0 0 0

[ADC]
1 ${adcNumSamples} ${dwellNs} 0 0 0

[SHAPES]

shape_id 1
num_samples ${numSamples}
${shapeLines}

shape_id 2
num_samples 2
0
0
`;
        }
    }

    // Export to global environment
    const PulseqExport = {
        decompressPulseqShape,
        compressPulseqShape,
        PulseqParser,
        PulseqSequence
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = PulseqExport;
    } else {
        global.Pulseq = PulseqExport;
    }

})(typeof window !== 'undefined' ? window : this);

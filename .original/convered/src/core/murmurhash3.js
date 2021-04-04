define(['../shared/util.js'], function (a) {
    'use strict';
    const SEED = 3285377520;
    const MASK_HIGH = 4294901760;
    const MASK_LOW = 65535;
    class MurmurHash3_64 {
        constructor(seed) {
            this.h1 = seed ? seed & 4294967295 : SEED;
            this.h2 = seed ? seed & 4294967295 : SEED;
        }
        update(input) {
            let data, length;
            if (a.isString(input)) {
                data = new Uint8Array(input.length * 2);
                length = 0;
                for (let i = 0, ii = input.length; i < ii; i++) {
                    const code = input.charCodeAt(i);
                    if (code <= 255) {
                        data[length++] = code;
                    } else {
                        data[length++] = code >>> 8;
                        data[length++] = code & 255;
                    }
                }
            } else if (a.isArrayBuffer(input)) {
                data = input.slice();
                length = data.byteLength;
            } else {
                throw new Error('Wrong data format in MurmurHash3_64_update. ' + 'Input must be a string or array.');
            }
            const blockCounts = length >> 2;
            const tailLength = length - blockCounts * 4;
            const dataUint32 = new Uint32Array(data.buffer, 0, blockCounts);
            let k1 = 0, k2 = 0;
            let h1 = this.h1, h2 = this.h2;
            const C1 = 3432918353, C2 = 461845907;
            const C1_LOW = C1 & MASK_LOW, C2_LOW = C2 & MASK_LOW;
            for (let i = 0; i < blockCounts; i++) {
                if (i & 1) {
                    k1 = dataUint32[i];
                    k1 = k1 * C1 & MASK_HIGH | k1 * C1_LOW & MASK_LOW;
                    k1 = k1 << 15 | k1 >>> 17;
                    k1 = k1 * C2 & MASK_HIGH | k1 * C2_LOW & MASK_LOW;
                    h1 ^= k1;
                    h1 = h1 << 13 | h1 >>> 19;
                    h1 = h1 * 5 + 3864292196;
                } else {
                    k2 = dataUint32[i];
                    k2 = k2 * C1 & MASK_HIGH | k2 * C1_LOW & MASK_LOW;
                    k2 = k2 << 15 | k2 >>> 17;
                    k2 = k2 * C2 & MASK_HIGH | k2 * C2_LOW & MASK_LOW;
                    h2 ^= k2;
                    h2 = h2 << 13 | h2 >>> 19;
                    h2 = h2 * 5 + 3864292196;
                }
            }
            k1 = 0;
            switch (tailLength) {
            case 3:
                k1 ^= data[blockCounts * 4 + 2] << 16;
            case 2:
                k1 ^= data[blockCounts * 4 + 1] << 8;
            case 1:
                k1 ^= data[blockCounts * 4];
                k1 = k1 * C1 & MASK_HIGH | k1 * C1_LOW & MASK_LOW;
                k1 = k1 << 15 | k1 >>> 17;
                k1 = k1 * C2 & MASK_HIGH | k1 * C2_LOW & MASK_LOW;
                if (blockCounts & 1) {
                    h1 ^= k1;
                } else {
                    h2 ^= k1;
                }
            }
            this.h1 = h1;
            this.h2 = h2;
        }
        hexdigest() {
            let h1 = this.h1, h2 = this.h2;
            h1 ^= h2 >>> 1;
            h1 = h1 * 3981806797 & MASK_HIGH | h1 * 36045 & MASK_LOW;
            h2 = h2 * 4283543511 & MASK_HIGH | ((h2 << 16 | h1 >>> 16) * 2950163797 & MASK_HIGH) >>> 16;
            h1 ^= h2 >>> 1;
            h1 = h1 * 444984403 & MASK_HIGH | h1 * 60499 & MASK_LOW;
            h2 = h2 * 3301882366 & MASK_HIGH | ((h2 << 16 | h1 >>> 16) * 3120437893 & MASK_HIGH) >>> 16;
            h1 ^= h2 >>> 1;
            const hex1 = (h1 >>> 0).toString(16), hex2 = (h2 >>> 0).toString(16);
            return hex1.padStart(8, '0') + hex2.padStart(8, '0');
        }
    }
    return { MurmurHash3_64 };
});
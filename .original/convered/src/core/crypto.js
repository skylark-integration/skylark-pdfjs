define([
    '../shared/util.js',
    './primitives.js',
    './stream.js'
], function (a, b, c) {
    'use strict';
    var ARCFourCipher = function ARCFourCipherClosure() {
        function ARCFourCipher(key) {
            this.a = 0;
            this.b = 0;
            var s = new Uint8Array(256);
            var i, j = 0, tmp, keyLength = key.length;
            for (i = 0; i < 256; ++i) {
                s[i] = i;
            }
            for (i = 0; i < 256; ++i) {
                tmp = s[i];
                j = j + tmp + key[i % keyLength] & 255;
                s[i] = s[j];
                s[j] = tmp;
            }
            this.s = s;
        }
        ARCFourCipher.prototype = {
            encryptBlock: function ARCFourCipher_encryptBlock(data) {
                var i, n = data.length, tmp, tmp2;
                var a = this.a, b = this.b, s = this.s;
                var output = new Uint8Array(n);
                for (i = 0; i < n; ++i) {
                    a = a + 1 & 255;
                    tmp = s[a];
                    b = b + tmp & 255;
                    tmp2 = s[b];
                    s[a] = tmp2;
                    s[b] = tmp;
                    output[i] = data[i] ^ s[tmp + tmp2 & 255];
                }
                this.a = a;
                this.b = b;
                return output;
            }
        };
        ARCFourCipher.prototype.decryptBlock = ARCFourCipher.prototype.encryptBlock;
        ARCFourCipher.prototype.encrypt = ARCFourCipher.prototype.encryptBlock;
        return ARCFourCipher;
    }();
    var calculateMD5 = function calculateMD5Closure() {
        var r = new Uint8Array([
            7,
            12,
            17,
            22,
            7,
            12,
            17,
            22,
            7,
            12,
            17,
            22,
            7,
            12,
            17,
            22,
            5,
            9,
            14,
            20,
            5,
            9,
            14,
            20,
            5,
            9,
            14,
            20,
            5,
            9,
            14,
            20,
            4,
            11,
            16,
            23,
            4,
            11,
            16,
            23,
            4,
            11,
            16,
            23,
            4,
            11,
            16,
            23,
            6,
            10,
            15,
            21,
            6,
            10,
            15,
            21,
            6,
            10,
            15,
            21,
            6,
            10,
            15,
            21
        ]);
        var k = new Int32Array([
            -680876936,
            -389564586,
            606105819,
            -1044525330,
            -176418897,
            1200080426,
            -1473231341,
            -45705983,
            1770035416,
            -1958414417,
            -42063,
            -1990404162,
            1804603682,
            -40341101,
            -1502002290,
            1236535329,
            -165796510,
            -1069501632,
            643717713,
            -373897302,
            -701558691,
            38016083,
            -660478335,
            -405537848,
            568446438,
            -1019803690,
            -187363961,
            1163531501,
            -1444681467,
            -51403784,
            1735328473,
            -1926607734,
            -378558,
            -2022574463,
            1839030562,
            -35309556,
            -1530992060,
            1272893353,
            -155497632,
            -1094730640,
            681279174,
            -358537222,
            -722521979,
            76029189,
            -640364487,
            -421815835,
            530742520,
            -995338651,
            -198630844,
            1126891415,
            -1416354905,
            -57434055,
            1700485571,
            -1894986606,
            -1051523,
            -2054922799,
            1873313359,
            -30611744,
            -1560198380,
            1309151649,
            -145523070,
            -1120210379,
            718787259,
            -343485551
        ]);
        function hash(data, offset, length) {
            var h0 = 1732584193, h1 = -271733879, h2 = -1732584194, h3 = 271733878;
            var paddedLength = length + 72 & ~63;
            var padded = new Uint8Array(paddedLength);
            var i, j, n;
            for (i = 0; i < length; ++i) {
                padded[i] = data[offset++];
            }
            padded[i++] = 128;
            n = paddedLength - 8;
            while (i < n) {
                padded[i++] = 0;
            }
            padded[i++] = length << 3 & 255;
            padded[i++] = length >> 5 & 255;
            padded[i++] = length >> 13 & 255;
            padded[i++] = length >> 21 & 255;
            padded[i++] = length >>> 29 & 255;
            padded[i++] = 0;
            padded[i++] = 0;
            padded[i++] = 0;
            var w = new Int32Array(16);
            for (i = 0; i < paddedLength;) {
                for (j = 0; j < 16; ++j, i += 4) {
                    w[j] = padded[i] | padded[i + 1] << 8 | padded[i + 2] << 16 | padded[i + 3] << 24;
                }
                var a = h0, b = h1, c = h2, d = h3, f, g;
                for (j = 0; j < 64; ++j) {
                    if (j < 16) {
                        f = b & c | ~b & d;
                        g = j;
                    } else if (j < 32) {
                        f = d & b | ~d & c;
                        g = 5 * j + 1 & 15;
                    } else if (j < 48) {
                        f = b ^ c ^ d;
                        g = 3 * j + 5 & 15;
                    } else {
                        f = c ^ (b | ~d);
                        g = 7 * j & 15;
                    }
                    var tmp = d, rotateArg = a + f + k[j] + w[g] | 0, rotate = r[j];
                    d = c;
                    c = b;
                    b = b + (rotateArg << rotate | rotateArg >>> 32 - rotate) | 0;
                    a = tmp;
                }
                h0 = h0 + a | 0;
                h1 = h1 + b | 0;
                h2 = h2 + c | 0;
                h3 = h3 + d | 0;
            }
            return new Uint8Array([
                h0 & 255,
                h0 >> 8 & 255,
                h0 >> 16 & 255,
                h0 >>> 24 & 255,
                h1 & 255,
                h1 >> 8 & 255,
                h1 >> 16 & 255,
                h1 >>> 24 & 255,
                h2 & 255,
                h2 >> 8 & 255,
                h2 >> 16 & 255,
                h2 >>> 24 & 255,
                h3 & 255,
                h3 >> 8 & 255,
                h3 >> 16 & 255,
                h3 >>> 24 & 255
            ]);
        }
        return hash;
    }();
    var Word64 = function Word64Closure() {
        function Word64(highInteger, lowInteger) {
            this.high = highInteger | 0;
            this.low = lowInteger | 0;
        }
        Word64.prototype = {
            and: function Word64_and(word) {
                this.high &= word.high;
                this.low &= word.low;
            },
            xor: function Word64_xor(word) {
                this.high ^= word.high;
                this.low ^= word.low;
            },
            or: function Word64_or(word) {
                this.high |= word.high;
                this.low |= word.low;
            },
            shiftRight: function Word64_shiftRight(places) {
                if (places >= 32) {
                    this.low = this.high >>> places - 32 | 0;
                    this.high = 0;
                } else {
                    this.low = this.low >>> places | this.high << 32 - places;
                    this.high = this.high >>> places | 0;
                }
            },
            shiftLeft: function Word64_shiftLeft(places) {
                if (places >= 32) {
                    this.high = this.low << places - 32;
                    this.low = 0;
                } else {
                    this.high = this.high << places | this.low >>> 32 - places;
                    this.low = this.low << places;
                }
            },
            rotateRight: function Word64_rotateRight(places) {
                var low, high;
                if (places & 32) {
                    high = this.low;
                    low = this.high;
                } else {
                    low = this.low;
                    high = this.high;
                }
                places &= 31;
                this.low = low >>> places | high << 32 - places;
                this.high = high >>> places | low << 32 - places;
            },
            not: function Word64_not() {
                this.high = ~this.high;
                this.low = ~this.low;
            },
            add: function Word64_add(word) {
                var lowAdd = (this.low >>> 0) + (word.low >>> 0);
                var highAdd = (this.high >>> 0) + (word.high >>> 0);
                if (lowAdd > 4294967295) {
                    highAdd += 1;
                }
                this.low = lowAdd | 0;
                this.high = highAdd | 0;
            },
            copyTo: function Word64_copyTo(bytes, offset) {
                bytes[offset] = this.high >>> 24 & 255;
                bytes[offset + 1] = this.high >> 16 & 255;
                bytes[offset + 2] = this.high >> 8 & 255;
                bytes[offset + 3] = this.high & 255;
                bytes[offset + 4] = this.low >>> 24 & 255;
                bytes[offset + 5] = this.low >> 16 & 255;
                bytes[offset + 6] = this.low >> 8 & 255;
                bytes[offset + 7] = this.low & 255;
            },
            assign: function Word64_assign(word) {
                this.high = word.high;
                this.low = word.low;
            }
        };
        return Word64;
    }();
    var calculateSHA256 = function calculateSHA256Closure() {
        function rotr(x, n) {
            return x >>> n | x << 32 - n;
        }
        function ch(x, y, z) {
            return x & y ^ ~x & z;
        }
        function maj(x, y, z) {
            return x & y ^ x & z ^ y & z;
        }
        function sigma(x) {
            return rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22);
        }
        function sigmaPrime(x) {
            return rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25);
        }
        function littleSigma(x) {
            return rotr(x, 7) ^ rotr(x, 18) ^ x >>> 3;
        }
        function littleSigmaPrime(x) {
            return rotr(x, 17) ^ rotr(x, 19) ^ x >>> 10;
        }
        var k = [
            1116352408,
            1899447441,
            3049323471,
            3921009573,
            961987163,
            1508970993,
            2453635748,
            2870763221,
            3624381080,
            310598401,
            607225278,
            1426881987,
            1925078388,
            2162078206,
            2614888103,
            3248222580,
            3835390401,
            4022224774,
            264347078,
            604807628,
            770255983,
            1249150122,
            1555081692,
            1996064986,
            2554220882,
            2821834349,
            2952996808,
            3210313671,
            3336571891,
            3584528711,
            113926993,
            338241895,
            666307205,
            773529912,
            1294757372,
            1396182291,
            1695183700,
            1986661051,
            2177026350,
            2456956037,
            2730485921,
            2820302411,
            3259730800,
            3345764771,
            3516065817,
            3600352804,
            4094571909,
            275423344,
            430227734,
            506948616,
            659060556,
            883997877,
            958139571,
            1322822218,
            1537002063,
            1747873779,
            1955562222,
            2024104815,
            2227730452,
            2361852424,
            2428436474,
            2756734187,
            3204031479,
            3329325298
        ];
        function hash(data, offset, length) {
            var h0 = 1779033703, h1 = 3144134277, h2 = 1013904242, h3 = 2773480762, h4 = 1359893119, h5 = 2600822924, h6 = 528734635, h7 = 1541459225;
            var paddedLength = Math.ceil((length + 9) / 64) * 64;
            var padded = new Uint8Array(paddedLength);
            var i, j, n;
            for (i = 0; i < length; ++i) {
                padded[i] = data[offset++];
            }
            padded[i++] = 128;
            n = paddedLength - 8;
            while (i < n) {
                padded[i++] = 0;
            }
            padded[i++] = 0;
            padded[i++] = 0;
            padded[i++] = 0;
            padded[i++] = length >>> 29 & 255;
            padded[i++] = length >> 21 & 255;
            padded[i++] = length >> 13 & 255;
            padded[i++] = length >> 5 & 255;
            padded[i++] = length << 3 & 255;
            var w = new Uint32Array(64);
            for (i = 0; i < paddedLength;) {
                for (j = 0; j < 16; ++j) {
                    w[j] = padded[i] << 24 | padded[i + 1] << 16 | padded[i + 2] << 8 | padded[i + 3];
                    i += 4;
                }
                for (j = 16; j < 64; ++j) {
                    w[j] = littleSigmaPrime(w[j - 2]) + w[j - 7] + littleSigma(w[j - 15]) + w[j - 16] | 0;
                }
                var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7, t1, t2;
                for (j = 0; j < 64; ++j) {
                    t1 = h + sigmaPrime(e) + ch(e, f, g) + k[j] + w[j];
                    t2 = sigma(a) + maj(a, b, c);
                    h = g;
                    g = f;
                    f = e;
                    e = d + t1 | 0;
                    d = c;
                    c = b;
                    b = a;
                    a = t1 + t2 | 0;
                }
                h0 = h0 + a | 0;
                h1 = h1 + b | 0;
                h2 = h2 + c | 0;
                h3 = h3 + d | 0;
                h4 = h4 + e | 0;
                h5 = h5 + f | 0;
                h6 = h6 + g | 0;
                h7 = h7 + h | 0;
            }
            return new Uint8Array([
                h0 >> 24 & 255,
                h0 >> 16 & 255,
                h0 >> 8 & 255,
                h0 & 255,
                h1 >> 24 & 255,
                h1 >> 16 & 255,
                h1 >> 8 & 255,
                h1 & 255,
                h2 >> 24 & 255,
                h2 >> 16 & 255,
                h2 >> 8 & 255,
                h2 & 255,
                h3 >> 24 & 255,
                h3 >> 16 & 255,
                h3 >> 8 & 255,
                h3 & 255,
                h4 >> 24 & 255,
                h4 >> 16 & 255,
                h4 >> 8 & 255,
                h4 & 255,
                h5 >> 24 & 255,
                h5 >> 16 & 255,
                h5 >> 8 & 255,
                h5 & 255,
                h6 >> 24 & 255,
                h6 >> 16 & 255,
                h6 >> 8 & 255,
                h6 & 255,
                h7 >> 24 & 255,
                h7 >> 16 & 255,
                h7 >> 8 & 255,
                h7 & 255
            ]);
        }
        return hash;
    }();
    var calculateSHA512 = function calculateSHA512Closure() {
        function ch(result, x, y, z, tmp) {
            result.assign(x);
            result.and(y);
            tmp.assign(x);
            tmp.not();
            tmp.and(z);
            result.xor(tmp);
        }
        function maj(result, x, y, z, tmp) {
            result.assign(x);
            result.and(y);
            tmp.assign(x);
            tmp.and(z);
            result.xor(tmp);
            tmp.assign(y);
            tmp.and(z);
            result.xor(tmp);
        }
        function sigma(result, x, tmp) {
            result.assign(x);
            result.rotateRight(28);
            tmp.assign(x);
            tmp.rotateRight(34);
            result.xor(tmp);
            tmp.assign(x);
            tmp.rotateRight(39);
            result.xor(tmp);
        }
        function sigmaPrime(result, x, tmp) {
            result.assign(x);
            result.rotateRight(14);
            tmp.assign(x);
            tmp.rotateRight(18);
            result.xor(tmp);
            tmp.assign(x);
            tmp.rotateRight(41);
            result.xor(tmp);
        }
        function littleSigma(result, x, tmp) {
            result.assign(x);
            result.rotateRight(1);
            tmp.assign(x);
            tmp.rotateRight(8);
            result.xor(tmp);
            tmp.assign(x);
            tmp.shiftRight(7);
            result.xor(tmp);
        }
        function littleSigmaPrime(result, x, tmp) {
            result.assign(x);
            result.rotateRight(19);
            tmp.assign(x);
            tmp.rotateRight(61);
            result.xor(tmp);
            tmp.assign(x);
            tmp.shiftRight(6);
            result.xor(tmp);
        }
        var k = [
            new Word64(1116352408, 3609767458),
            new Word64(1899447441, 602891725),
            new Word64(3049323471, 3964484399),
            new Word64(3921009573, 2173295548),
            new Word64(961987163, 4081628472),
            new Word64(1508970993, 3053834265),
            new Word64(2453635748, 2937671579),
            new Word64(2870763221, 3664609560),
            new Word64(3624381080, 2734883394),
            new Word64(310598401, 1164996542),
            new Word64(607225278, 1323610764),
            new Word64(1426881987, 3590304994),
            new Word64(1925078388, 4068182383),
            new Word64(2162078206, 991336113),
            new Word64(2614888103, 633803317),
            new Word64(3248222580, 3479774868),
            new Word64(3835390401, 2666613458),
            new Word64(4022224774, 944711139),
            new Word64(264347078, 2341262773),
            new Word64(604807628, 2007800933),
            new Word64(770255983, 1495990901),
            new Word64(1249150122, 1856431235),
            new Word64(1555081692, 3175218132),
            new Word64(1996064986, 2198950837),
            new Word64(2554220882, 3999719339),
            new Word64(2821834349, 766784016),
            new Word64(2952996808, 2566594879),
            new Word64(3210313671, 3203337956),
            new Word64(3336571891, 1034457026),
            new Word64(3584528711, 2466948901),
            new Word64(113926993, 3758326383),
            new Word64(338241895, 168717936),
            new Word64(666307205, 1188179964),
            new Word64(773529912, 1546045734),
            new Word64(1294757372, 1522805485),
            new Word64(1396182291, 2643833823),
            new Word64(1695183700, 2343527390),
            new Word64(1986661051, 1014477480),
            new Word64(2177026350, 1206759142),
            new Word64(2456956037, 344077627),
            new Word64(2730485921, 1290863460),
            new Word64(2820302411, 3158454273),
            new Word64(3259730800, 3505952657),
            new Word64(3345764771, 106217008),
            new Word64(3516065817, 3606008344),
            new Word64(3600352804, 1432725776),
            new Word64(4094571909, 1467031594),
            new Word64(275423344, 851169720),
            new Word64(430227734, 3100823752),
            new Word64(506948616, 1363258195),
            new Word64(659060556, 3750685593),
            new Word64(883997877, 3785050280),
            new Word64(958139571, 3318307427),
            new Word64(1322822218, 3812723403),
            new Word64(1537002063, 2003034995),
            new Word64(1747873779, 3602036899),
            new Word64(1955562222, 1575990012),
            new Word64(2024104815, 1125592928),
            new Word64(2227730452, 2716904306),
            new Word64(2361852424, 442776044),
            new Word64(2428436474, 593698344),
            new Word64(2756734187, 3733110249),
            new Word64(3204031479, 2999351573),
            new Word64(3329325298, 3815920427),
            new Word64(3391569614, 3928383900),
            new Word64(3515267271, 566280711),
            new Word64(3940187606, 3454069534),
            new Word64(4118630271, 4000239992),
            new Word64(116418474, 1914138554),
            new Word64(174292421, 2731055270),
            new Word64(289380356, 3203993006),
            new Word64(460393269, 320620315),
            new Word64(685471733, 587496836),
            new Word64(852142971, 1086792851),
            new Word64(1017036298, 365543100),
            new Word64(1126000580, 2618297676),
            new Word64(1288033470, 3409855158),
            new Word64(1501505948, 4234509866),
            new Word64(1607167915, 987167468),
            new Word64(1816402316, 1246189591)
        ];
        function hash(data, offset, length, mode384) {
            mode384 = !!mode384;
            var h0, h1, h2, h3, h4, h5, h6, h7;
            if (!mode384) {
                h0 = new Word64(1779033703, 4089235720);
                h1 = new Word64(3144134277, 2227873595);
                h2 = new Word64(1013904242, 4271175723);
                h3 = new Word64(2773480762, 1595750129);
                h4 = new Word64(1359893119, 2917565137);
                h5 = new Word64(2600822924, 725511199);
                h6 = new Word64(528734635, 4215389547);
                h7 = new Word64(1541459225, 327033209);
            } else {
                h0 = new Word64(3418070365, 3238371032);
                h1 = new Word64(1654270250, 914150663);
                h2 = new Word64(2438529370, 812702999);
                h3 = new Word64(355462360, 4144912697);
                h4 = new Word64(1731405415, 4290775857);
                h5 = new Word64(2394180231, 1750603025);
                h6 = new Word64(3675008525, 1694076839);
                h7 = new Word64(1203062813, 3204075428);
            }
            var paddedLength = Math.ceil((length + 17) / 128) * 128;
            var padded = new Uint8Array(paddedLength);
            var i, j, n;
            for (i = 0; i < length; ++i) {
                padded[i] = data[offset++];
            }
            padded[i++] = 128;
            n = paddedLength - 16;
            while (i < n) {
                padded[i++] = 0;
            }
            padded[i++] = 0;
            padded[i++] = 0;
            padded[i++] = 0;
            padded[i++] = 0;
            padded[i++] = 0;
            padded[i++] = 0;
            padded[i++] = 0;
            padded[i++] = 0;
            padded[i++] = 0;
            padded[i++] = 0;
            padded[i++] = 0;
            padded[i++] = length >>> 29 & 255;
            padded[i++] = length >> 21 & 255;
            padded[i++] = length >> 13 & 255;
            padded[i++] = length >> 5 & 255;
            padded[i++] = length << 3 & 255;
            var w = new Array(80);
            for (i = 0; i < 80; i++) {
                w[i] = new Word64(0, 0);
            }
            var a = new Word64(0, 0), b = new Word64(0, 0), c = new Word64(0, 0);
            var d = new Word64(0, 0), e = new Word64(0, 0), f = new Word64(0, 0);
            var g = new Word64(0, 0), h = new Word64(0, 0);
            var t1 = new Word64(0, 0), t2 = new Word64(0, 0);
            var tmp1 = new Word64(0, 0), tmp2 = new Word64(0, 0), tmp3;
            for (i = 0; i < paddedLength;) {
                for (j = 0; j < 16; ++j) {
                    w[j].high = padded[i] << 24 | padded[i + 1] << 16 | padded[i + 2] << 8 | padded[i + 3];
                    w[j].low = padded[i + 4] << 24 | padded[i + 5] << 16 | padded[i + 6] << 8 | padded[i + 7];
                    i += 8;
                }
                for (j = 16; j < 80; ++j) {
                    tmp3 = w[j];
                    littleSigmaPrime(tmp3, w[j - 2], tmp2);
                    tmp3.add(w[j - 7]);
                    littleSigma(tmp1, w[j - 15], tmp2);
                    tmp3.add(tmp1);
                    tmp3.add(w[j - 16]);
                }
                a.assign(h0);
                b.assign(h1);
                c.assign(h2);
                d.assign(h3);
                e.assign(h4);
                f.assign(h5);
                g.assign(h6);
                h.assign(h7);
                for (j = 0; j < 80; ++j) {
                    t1.assign(h);
                    sigmaPrime(tmp1, e, tmp2);
                    t1.add(tmp1);
                    ch(tmp1, e, f, g, tmp2);
                    t1.add(tmp1);
                    t1.add(k[j]);
                    t1.add(w[j]);
                    sigma(t2, a, tmp2);
                    maj(tmp1, a, b, c, tmp2);
                    t2.add(tmp1);
                    tmp3 = h;
                    h = g;
                    g = f;
                    f = e;
                    d.add(t1);
                    e = d;
                    d = c;
                    c = b;
                    b = a;
                    tmp3.assign(t1);
                    tmp3.add(t2);
                    a = tmp3;
                }
                h0.add(a);
                h1.add(b);
                h2.add(c);
                h3.add(d);
                h4.add(e);
                h5.add(f);
                h6.add(g);
                h7.add(h);
            }
            var result;
            if (!mode384) {
                result = new Uint8Array(64);
                h0.copyTo(result, 0);
                h1.copyTo(result, 8);
                h2.copyTo(result, 16);
                h3.copyTo(result, 24);
                h4.copyTo(result, 32);
                h5.copyTo(result, 40);
                h6.copyTo(result, 48);
                h7.copyTo(result, 56);
            } else {
                result = new Uint8Array(48);
                h0.copyTo(result, 0);
                h1.copyTo(result, 8);
                h2.copyTo(result, 16);
                h3.copyTo(result, 24);
                h4.copyTo(result, 32);
                h5.copyTo(result, 40);
            }
            return result;
        }
        return hash;
    }();
    var calculateSHA384 = function calculateSHA384Closure() {
        function hash(data, offset, length) {
            return calculateSHA512(data, offset, length, true);
        }
        return hash;
    }();
    var NullCipher = function NullCipherClosure() {
        function NullCipher() {
        }
        NullCipher.prototype = {
            decryptBlock: function NullCipher_decryptBlock(data) {
                return data;
            },
            encrypt: function NullCipher_encrypt(data) {
                return data;
            }
        };
        return NullCipher;
    }();
    class AESBaseCipher {
        constructor() {
            if (this.constructor === AESBaseCipher) {
                a.unreachable('Cannot initialize AESBaseCipher.');
            }
            this._s = new Uint8Array([
                99,
                124,
                119,
                123,
                242,
                107,
                111,
                197,
                48,
                1,
                103,
                43,
                254,
                215,
                171,
                118,
                202,
                130,
                201,
                125,
                250,
                89,
                71,
                240,
                173,
                212,
                162,
                175,
                156,
                164,
                114,
                192,
                183,
                253,
                147,
                38,
                54,
                63,
                247,
                204,
                52,
                165,
                229,
                241,
                113,
                216,
                49,
                21,
                4,
                199,
                35,
                195,
                24,
                150,
                5,
                154,
                7,
                18,
                128,
                226,
                235,
                39,
                178,
                117,
                9,
                131,
                44,
                26,
                27,
                110,
                90,
                160,
                82,
                59,
                214,
                179,
                41,
                227,
                47,
                132,
                83,
                209,
                0,
                237,
                32,
                252,
                177,
                91,
                106,
                203,
                190,
                57,
                74,
                76,
                88,
                207,
                208,
                239,
                170,
                251,
                67,
                77,
                51,
                133,
                69,
                249,
                2,
                127,
                80,
                60,
                159,
                168,
                81,
                163,
                64,
                143,
                146,
                157,
                56,
                245,
                188,
                182,
                218,
                33,
                16,
                255,
                243,
                210,
                205,
                12,
                19,
                236,
                95,
                151,
                68,
                23,
                196,
                167,
                126,
                61,
                100,
                93,
                25,
                115,
                96,
                129,
                79,
                220,
                34,
                42,
                144,
                136,
                70,
                238,
                184,
                20,
                222,
                94,
                11,
                219,
                224,
                50,
                58,
                10,
                73,
                6,
                36,
                92,
                194,
                211,
                172,
                98,
                145,
                149,
                228,
                121,
                231,
                200,
                55,
                109,
                141,
                213,
                78,
                169,
                108,
                86,
                244,
                234,
                101,
                122,
                174,
                8,
                186,
                120,
                37,
                46,
                28,
                166,
                180,
                198,
                232,
                221,
                116,
                31,
                75,
                189,
                139,
                138,
                112,
                62,
                181,
                102,
                72,
                3,
                246,
                14,
                97,
                53,
                87,
                185,
                134,
                193,
                29,
                158,
                225,
                248,
                152,
                17,
                105,
                217,
                142,
                148,
                155,
                30,
                135,
                233,
                206,
                85,
                40,
                223,
                140,
                161,
                137,
                13,
                191,
                230,
                66,
                104,
                65,
                153,
                45,
                15,
                176,
                84,
                187,
                22
            ]);
            this._inv_s = new Uint8Array([
                82,
                9,
                106,
                213,
                48,
                54,
                165,
                56,
                191,
                64,
                163,
                158,
                129,
                243,
                215,
                251,
                124,
                227,
                57,
                130,
                155,
                47,
                255,
                135,
                52,
                142,
                67,
                68,
                196,
                222,
                233,
                203,
                84,
                123,
                148,
                50,
                166,
                194,
                35,
                61,
                238,
                76,
                149,
                11,
                66,
                250,
                195,
                78,
                8,
                46,
                161,
                102,
                40,
                217,
                36,
                178,
                118,
                91,
                162,
                73,
                109,
                139,
                209,
                37,
                114,
                248,
                246,
                100,
                134,
                104,
                152,
                22,
                212,
                164,
                92,
                204,
                93,
                101,
                182,
                146,
                108,
                112,
                72,
                80,
                253,
                237,
                185,
                218,
                94,
                21,
                70,
                87,
                167,
                141,
                157,
                132,
                144,
                216,
                171,
                0,
                140,
                188,
                211,
                10,
                247,
                228,
                88,
                5,
                184,
                179,
                69,
                6,
                208,
                44,
                30,
                143,
                202,
                63,
                15,
                2,
                193,
                175,
                189,
                3,
                1,
                19,
                138,
                107,
                58,
                145,
                17,
                65,
                79,
                103,
                220,
                234,
                151,
                242,
                207,
                206,
                240,
                180,
                230,
                115,
                150,
                172,
                116,
                34,
                231,
                173,
                53,
                133,
                226,
                249,
                55,
                232,
                28,
                117,
                223,
                110,
                71,
                241,
                26,
                113,
                29,
                41,
                197,
                137,
                111,
                183,
                98,
                14,
                170,
                24,
                190,
                27,
                252,
                86,
                62,
                75,
                198,
                210,
                121,
                32,
                154,
                219,
                192,
                254,
                120,
                205,
                90,
                244,
                31,
                221,
                168,
                51,
                136,
                7,
                199,
                49,
                177,
                18,
                16,
                89,
                39,
                128,
                236,
                95,
                96,
                81,
                127,
                169,
                25,
                181,
                74,
                13,
                45,
                229,
                122,
                159,
                147,
                201,
                156,
                239,
                160,
                224,
                59,
                77,
                174,
                42,
                245,
                176,
                200,
                235,
                187,
                60,
                131,
                83,
                153,
                97,
                23,
                43,
                4,
                126,
                186,
                119,
                214,
                38,
                225,
                105,
                20,
                99,
                85,
                33,
                12,
                125
            ]);
            this._mix = new Uint32Array([
                0,
                235474187,
                470948374,
                303765277,
                941896748,
                908933415,
                607530554,
                708780849,
                1883793496,
                2118214995,
                1817866830,
                1649639237,
                1215061108,
                1181045119,
                1417561698,
                1517767529,
                3767586992,
                4003061179,
                4236429990,
                4069246893,
                3635733660,
                3602770327,
                3299278474,
                3400528769,
                2430122216,
                2664543715,
                2362090238,
                2193862645,
                2835123396,
                2801107407,
                3035535058,
                3135740889,
                3678124923,
                3576870512,
                3341394285,
                3374361702,
                3810496343,
                3977675356,
                4279080257,
                4043610186,
                2876494627,
                2776292904,
                3076639029,
                3110650942,
                2472011535,
                2640243204,
                2403728665,
                2169303058,
                1001089995,
                899835584,
                666464733,
                699432150,
                59727847,
                226906860,
                530400753,
                294930682,
                1273168787,
                1172967064,
                1475418501,
                1509430414,
                1942435775,
                2110667444,
                1876241833,
                1641816226,
                2910219766,
                2743034109,
                2976151520,
                3211623147,
                2505202138,
                2606453969,
                2302690252,
                2269728455,
                3711829422,
                3543599269,
                3240894392,
                3475313331,
                3843699074,
                3943906441,
                4178062228,
                4144047775,
                1306967366,
                1139781709,
                1374988112,
                1610459739,
                1975683434,
                2076935265,
                1775276924,
                1742315127,
                1034867998,
                866637845,
                566021896,
                800440835,
                92987698,
                193195065,
                429456164,
                395441711,
                1984812685,
                2017778566,
                1784663195,
                1683407248,
                1315562145,
                1080094634,
                1383856311,
                1551037884,
                101039829,
                135050206,
                437757123,
                337553864,
                1042385657,
                807962610,
                573804783,
                742039012,
                2531067453,
                2564033334,
                2328828971,
                2227573024,
                2935566865,
                2700099354,
                3001755655,
                3168937228,
                3868552805,
                3902563182,
                4203181171,
                4102977912,
                3736164937,
                3501741890,
                3265478751,
                3433712980,
                1106041591,
                1340463100,
                1576976609,
                1408749034,
                2043211483,
                2009195472,
                1708848333,
                1809054150,
                832877231,
                1068351396,
                766945465,
                599762354,
                159417987,
                126454664,
                361929877,
                463180190,
                2709260871,
                2943682380,
                3178106961,
                3009879386,
                2572697195,
                2538681184,
                2236228733,
                2336434550,
                3509871135,
                3745345300,
                3441850377,
                3274667266,
                3910161971,
                3877198648,
                4110568485,
                4211818798,
                2597806476,
                2497604743,
                2261089178,
                2295101073,
                2733856160,
                2902087851,
                3202437046,
                2968011453,
                3936291284,
                3835036895,
                4136440770,
                4169408201,
                3535486456,
                3702665459,
                3467192302,
                3231722213,
                2051518780,
                1951317047,
                1716890410,
                1750902305,
                1113818384,
                1282050075,
                1584504582,
                1350078989,
                168810852,
                67556463,
                371049330,
                404016761,
                841739592,
                1008918595,
                775550814,
                540080725,
                3969562369,
                3801332234,
                4035489047,
                4269907996,
                3569255213,
                3669462566,
                3366754619,
                3332740144,
                2631065433,
                2463879762,
                2160117071,
                2395588676,
                2767645557,
                2868897406,
                3102011747,
                3069049960,
                202008497,
                33778362,
                270040487,
                504459436,
                875451293,
                975658646,
                675039627,
                641025152,
                2084704233,
                1917518562,
                1615861247,
                1851332852,
                1147550661,
                1248802510,
                1484005843,
                1451044056,
                933301370,
                967311729,
                733156972,
                632953703,
                260388950,
                25965917,
                328671808,
                496906059,
                1206477858,
                1239443753,
                1543208500,
                1441952575,
                2144161806,
                1908694277,
                1675577880,
                1842759443,
                3610369226,
                3644379585,
                3408119516,
                3307916247,
                4011190502,
                3776767469,
                4077384432,
                4245618683,
                2809771154,
                2842737049,
                3144396420,
                3043140495,
                2673705150,
                2438237621,
                2203032232,
                2370213795
            ]);
            this._mixCol = new Uint8Array(256);
            for (let i = 0; i < 256; i++) {
                if (i < 128) {
                    this._mixCol[i] = i << 1;
                } else {
                    this._mixCol[i] = i << 1 ^ 27;
                }
            }
            this.buffer = new Uint8Array(16);
            this.bufferPosition = 0;
        }
        _expandKey(cipherKey) {
            a.unreachable('Cannot call `_expandKey` on the base class');
        }
        _decrypt(input, key) {
            let t, u, v;
            const state = new Uint8Array(16);
            state.set(input);
            for (let j = 0, k = this._keySize; j < 16; ++j, ++k) {
                state[j] ^= key[k];
            }
            for (let i = this._cyclesOfRepetition - 1; i >= 1; --i) {
                t = state[13];
                state[13] = state[9];
                state[9] = state[5];
                state[5] = state[1];
                state[1] = t;
                t = state[14];
                u = state[10];
                state[14] = state[6];
                state[10] = state[2];
                state[6] = t;
                state[2] = u;
                t = state[15];
                u = state[11];
                v = state[7];
                state[15] = state[3];
                state[11] = t;
                state[7] = u;
                state[3] = v;
                for (let j = 0; j < 16; ++j) {
                    state[j] = this._inv_s[state[j]];
                }
                for (let j = 0, k = i * 16; j < 16; ++j, ++k) {
                    state[j] ^= key[k];
                }
                for (let j = 0; j < 16; j += 4) {
                    const s0 = this._mix[state[j]];
                    const s1 = this._mix[state[j + 1]];
                    const s2 = this._mix[state[j + 2]];
                    const s3 = this._mix[state[j + 3]];
                    t = s0 ^ s1 >>> 8 ^ s1 << 24 ^ s2 >>> 16 ^ s2 << 16 ^ s3 >>> 24 ^ s3 << 8;
                    state[j] = t >>> 24 & 255;
                    state[j + 1] = t >> 16 & 255;
                    state[j + 2] = t >> 8 & 255;
                    state[j + 3] = t & 255;
                }
            }
            t = state[13];
            state[13] = state[9];
            state[9] = state[5];
            state[5] = state[1];
            state[1] = t;
            t = state[14];
            u = state[10];
            state[14] = state[6];
            state[10] = state[2];
            state[6] = t;
            state[2] = u;
            t = state[15];
            u = state[11];
            v = state[7];
            state[15] = state[3];
            state[11] = t;
            state[7] = u;
            state[3] = v;
            for (let j = 0; j < 16; ++j) {
                state[j] = this._inv_s[state[j]];
                state[j] ^= key[j];
            }
            return state;
        }
        _encrypt(input, key) {
            const s = this._s;
            let t, u, v;
            const state = new Uint8Array(16);
            state.set(input);
            for (let j = 0; j < 16; ++j) {
                state[j] ^= key[j];
            }
            for (let i = 1; i < this._cyclesOfRepetition; i++) {
                for (let j = 0; j < 16; ++j) {
                    state[j] = s[state[j]];
                }
                v = state[1];
                state[1] = state[5];
                state[5] = state[9];
                state[9] = state[13];
                state[13] = v;
                v = state[2];
                u = state[6];
                state[2] = state[10];
                state[6] = state[14];
                state[10] = v;
                state[14] = u;
                v = state[3];
                u = state[7];
                t = state[11];
                state[3] = state[15];
                state[7] = v;
                state[11] = u;
                state[15] = t;
                for (let j = 0; j < 16; j += 4) {
                    const s0 = state[j + 0];
                    const s1 = state[j + 1];
                    const s2 = state[j + 2];
                    const s3 = state[j + 3];
                    t = s0 ^ s1 ^ s2 ^ s3;
                    state[j + 0] ^= t ^ this._mixCol[s0 ^ s1];
                    state[j + 1] ^= t ^ this._mixCol[s1 ^ s2];
                    state[j + 2] ^= t ^ this._mixCol[s2 ^ s3];
                    state[j + 3] ^= t ^ this._mixCol[s3 ^ s0];
                }
                for (let j = 0, k = i * 16; j < 16; ++j, ++k) {
                    state[j] ^= key[k];
                }
            }
            for (let j = 0; j < 16; ++j) {
                state[j] = s[state[j]];
            }
            v = state[1];
            state[1] = state[5];
            state[5] = state[9];
            state[9] = state[13];
            state[13] = v;
            v = state[2];
            u = state[6];
            state[2] = state[10];
            state[6] = state[14];
            state[10] = v;
            state[14] = u;
            v = state[3];
            u = state[7];
            t = state[11];
            state[3] = state[15];
            state[7] = v;
            state[11] = u;
            state[15] = t;
            for (let j = 0, k = this._keySize; j < 16; ++j, ++k) {
                state[j] ^= key[k];
            }
            return state;
        }
        _decryptBlock2(data, finalize) {
            const sourceLength = data.length;
            let buffer = this.buffer, bufferLength = this.bufferPosition;
            const result = [];
            let iv = this.iv;
            for (let i = 0; i < sourceLength; ++i) {
                buffer[bufferLength] = data[i];
                ++bufferLength;
                if (bufferLength < 16) {
                    continue;
                }
                const plain = this._decrypt(buffer, this._key);
                for (let j = 0; j < 16; ++j) {
                    plain[j] ^= iv[j];
                }
                iv = buffer;
                result.push(plain);
                buffer = new Uint8Array(16);
                bufferLength = 0;
            }
            this.buffer = buffer;
            this.bufferLength = bufferLength;
            this.iv = iv;
            if (result.length === 0) {
                return new Uint8Array(0);
            }
            let outputLength = 16 * result.length;
            if (finalize) {
                const lastBlock = result[result.length - 1];
                let psLen = lastBlock[15];
                if (psLen <= 16) {
                    for (let i = 15, ii = 16 - psLen; i >= ii; --i) {
                        if (lastBlock[i] !== psLen) {
                            psLen = 0;
                            break;
                        }
                    }
                    outputLength -= psLen;
                    result[result.length - 1] = lastBlock.subarray(0, 16 - psLen);
                }
            }
            const output = new Uint8Array(outputLength);
            for (let i = 0, j = 0, ii = result.length; i < ii; ++i, j += 16) {
                output.set(result[i], j);
            }
            return output;
        }
        decryptBlock(data, finalize, iv = null) {
            const sourceLength = data.length;
            const buffer = this.buffer;
            let bufferLength = this.bufferPosition;
            if (iv) {
                this.iv = iv;
            } else {
                for (let i = 0; bufferLength < 16 && i < sourceLength; ++i, ++bufferLength) {
                    buffer[bufferLength] = data[i];
                }
                if (bufferLength < 16) {
                    this.bufferLength = bufferLength;
                    return new Uint8Array(0);
                }
                this.iv = buffer;
                data = data.subarray(16);
            }
            this.buffer = new Uint8Array(16);
            this.bufferLength = 0;
            this.decryptBlock = this._decryptBlock2;
            return this.decryptBlock(data, finalize);
        }
        encrypt(data, iv) {
            const sourceLength = data.length;
            let buffer = this.buffer, bufferLength = this.bufferPosition;
            const result = [];
            if (!iv) {
                iv = new Uint8Array(16);
            }
            for (let i = 0; i < sourceLength; ++i) {
                buffer[bufferLength] = data[i];
                ++bufferLength;
                if (bufferLength < 16) {
                    continue;
                }
                for (let j = 0; j < 16; ++j) {
                    buffer[j] ^= iv[j];
                }
                const cipher = this._encrypt(buffer, this._key);
                iv = cipher;
                result.push(cipher);
                buffer = new Uint8Array(16);
                bufferLength = 0;
            }
            this.buffer = buffer;
            this.bufferLength = bufferLength;
            this.iv = iv;
            if (result.length === 0) {
                return new Uint8Array(0);
            }
            const outputLength = 16 * result.length;
            const output = new Uint8Array(outputLength);
            for (let i = 0, j = 0, ii = result.length; i < ii; ++i, j += 16) {
                output.set(result[i], j);
            }
            return output;
        }
    }
    class AES128Cipher extends AESBaseCipher {
        constructor(key) {
            super();
            this._cyclesOfRepetition = 10;
            this._keySize = 160;
            this._rcon = new Uint8Array([
                141,
                1,
                2,
                4,
                8,
                16,
                32,
                64,
                128,
                27,
                54,
                108,
                216,
                171,
                77,
                154,
                47,
                94,
                188,
                99,
                198,
                151,
                53,
                106,
                212,
                179,
                125,
                250,
                239,
                197,
                145,
                57,
                114,
                228,
                211,
                189,
                97,
                194,
                159,
                37,
                74,
                148,
                51,
                102,
                204,
                131,
                29,
                58,
                116,
                232,
                203,
                141,
                1,
                2,
                4,
                8,
                16,
                32,
                64,
                128,
                27,
                54,
                108,
                216,
                171,
                77,
                154,
                47,
                94,
                188,
                99,
                198,
                151,
                53,
                106,
                212,
                179,
                125,
                250,
                239,
                197,
                145,
                57,
                114,
                228,
                211,
                189,
                97,
                194,
                159,
                37,
                74,
                148,
                51,
                102,
                204,
                131,
                29,
                58,
                116,
                232,
                203,
                141,
                1,
                2,
                4,
                8,
                16,
                32,
                64,
                128,
                27,
                54,
                108,
                216,
                171,
                77,
                154,
                47,
                94,
                188,
                99,
                198,
                151,
                53,
                106,
                212,
                179,
                125,
                250,
                239,
                197,
                145,
                57,
                114,
                228,
                211,
                189,
                97,
                194,
                159,
                37,
                74,
                148,
                51,
                102,
                204,
                131,
                29,
                58,
                116,
                232,
                203,
                141,
                1,
                2,
                4,
                8,
                16,
                32,
                64,
                128,
                27,
                54,
                108,
                216,
                171,
                77,
                154,
                47,
                94,
                188,
                99,
                198,
                151,
                53,
                106,
                212,
                179,
                125,
                250,
                239,
                197,
                145,
                57,
                114,
                228,
                211,
                189,
                97,
                194,
                159,
                37,
                74,
                148,
                51,
                102,
                204,
                131,
                29,
                58,
                116,
                232,
                203,
                141,
                1,
                2,
                4,
                8,
                16,
                32,
                64,
                128,
                27,
                54,
                108,
                216,
                171,
                77,
                154,
                47,
                94,
                188,
                99,
                198,
                151,
                53,
                106,
                212,
                179,
                125,
                250,
                239,
                197,
                145,
                57,
                114,
                228,
                211,
                189,
                97,
                194,
                159,
                37,
                74,
                148,
                51,
                102,
                204,
                131,
                29,
                58,
                116,
                232,
                203,
                141
            ]);
            this._key = this._expandKey(key);
        }
        _expandKey(cipherKey) {
            const b = 176;
            const s = this._s;
            const rcon = this._rcon;
            const result = new Uint8Array(b);
            result.set(cipherKey);
            for (let j = 16, i = 1; j < b; ++i) {
                let t1 = result[j - 3];
                let t2 = result[j - 2];
                let t3 = result[j - 1];
                let t4 = result[j - 4];
                t1 = s[t1];
                t2 = s[t2];
                t3 = s[t3];
                t4 = s[t4];
                t1 = t1 ^ rcon[i];
                for (let n = 0; n < 4; ++n) {
                    result[j] = t1 ^= result[j - 16];
                    j++;
                    result[j] = t2 ^= result[j - 16];
                    j++;
                    result[j] = t3 ^= result[j - 16];
                    j++;
                    result[j] = t4 ^= result[j - 16];
                    j++;
                }
            }
            return result;
        }
    }
    class AES256Cipher extends AESBaseCipher {
        constructor(key) {
            super();
            this._cyclesOfRepetition = 14;
            this._keySize = 224;
            this._key = this._expandKey(key);
        }
        _expandKey(cipherKey) {
            const b = 240;
            const s = this._s;
            const result = new Uint8Array(b);
            result.set(cipherKey);
            let r = 1;
            let t1, t2, t3, t4;
            for (let j = 32, i = 1; j < b; ++i) {
                if (j % 32 === 16) {
                    t1 = s[t1];
                    t2 = s[t2];
                    t3 = s[t3];
                    t4 = s[t4];
                } else if (j % 32 === 0) {
                    t1 = result[j - 3];
                    t2 = result[j - 2];
                    t3 = result[j - 1];
                    t4 = result[j - 4];
                    t1 = s[t1];
                    t2 = s[t2];
                    t3 = s[t3];
                    t4 = s[t4];
                    t1 = t1 ^ r;
                    if ((r <<= 1) >= 256) {
                        r = (r ^ 27) & 255;
                    }
                }
                for (let n = 0; n < 4; ++n) {
                    result[j] = t1 ^= result[j - 32];
                    j++;
                    result[j] = t2 ^= result[j - 32];
                    j++;
                    result[j] = t3 ^= result[j - 32];
                    j++;
                    result[j] = t4 ^= result[j - 32];
                    j++;
                }
            }
            return result;
        }
    }
    var PDF17 = function PDF17Closure() {
        function compareByteArrays(array1, array2) {
            if (array1.length !== array2.length) {
                return false;
            }
            for (var i = 0; i < array1.length; i++) {
                if (array1[i] !== array2[i]) {
                    return false;
                }
            }
            return true;
        }
        function PDF17() {
        }
        PDF17.prototype = {
            checkOwnerPassword: function PDF17_checkOwnerPassword(password, ownerValidationSalt, userBytes, ownerPassword) {
                var hashData = new Uint8Array(password.length + 56);
                hashData.set(password, 0);
                hashData.set(ownerValidationSalt, password.length);
                hashData.set(userBytes, password.length + ownerValidationSalt.length);
                var result = calculateSHA256(hashData, 0, hashData.length);
                return compareByteArrays(result, ownerPassword);
            },
            checkUserPassword: function PDF17_checkUserPassword(password, userValidationSalt, userPassword) {
                var hashData = new Uint8Array(password.length + 8);
                hashData.set(password, 0);
                hashData.set(userValidationSalt, password.length);
                var result = calculateSHA256(hashData, 0, hashData.length);
                return compareByteArrays(result, userPassword);
            },
            getOwnerKey: function PDF17_getOwnerKey(password, ownerKeySalt, userBytes, ownerEncryption) {
                var hashData = new Uint8Array(password.length + 56);
                hashData.set(password, 0);
                hashData.set(ownerKeySalt, password.length);
                hashData.set(userBytes, password.length + ownerKeySalt.length);
                var key = calculateSHA256(hashData, 0, hashData.length);
                var cipher = new AES256Cipher(key);
                return cipher.decryptBlock(ownerEncryption, false, new Uint8Array(16));
            },
            getUserKey: function PDF17_getUserKey(password, userKeySalt, userEncryption) {
                var hashData = new Uint8Array(password.length + 8);
                hashData.set(password, 0);
                hashData.set(userKeySalt, password.length);
                var key = calculateSHA256(hashData, 0, hashData.length);
                var cipher = new AES256Cipher(key);
                return cipher.decryptBlock(userEncryption, false, new Uint8Array(16));
            }
        };
        return PDF17;
    }();
    var PDF20 = function PDF20Closure() {
        function concatArrays(array1, array2) {
            var t = new Uint8Array(array1.length + array2.length);
            t.set(array1, 0);
            t.set(array2, array1.length);
            return t;
        }
        function calculatePDF20Hash(password, input, userBytes) {
            var k = calculateSHA256(input, 0, input.length).subarray(0, 32);
            var e = [0];
            var i = 0;
            while (i < 64 || e[e.length - 1] > i - 32) {
                var arrayLength = password.length + k.length + userBytes.length;
                var k1 = new Uint8Array(arrayLength * 64);
                var array = concatArrays(password, k);
                array = concatArrays(array, userBytes);
                for (var j = 0, pos = 0; j < 64; j++, pos += arrayLength) {
                    k1.set(array, pos);
                }
                var cipher = new AES128Cipher(k.subarray(0, 16));
                e = cipher.encrypt(k1, k.subarray(16, 32));
                var remainder = 0;
                for (var z = 0; z < 16; z++) {
                    remainder *= 256 % 3;
                    remainder %= 3;
                    remainder += (e[z] >>> 0) % 3;
                    remainder %= 3;
                }
                if (remainder === 0) {
                    k = calculateSHA256(e, 0, e.length);
                } else if (remainder === 1) {
                    k = calculateSHA384(e, 0, e.length);
                } else if (remainder === 2) {
                    k = calculateSHA512(e, 0, e.length);
                }
                i++;
            }
            return k.subarray(0, 32);
        }
        function PDF20() {
        }
        function compareByteArrays(array1, array2) {
            if (array1.length !== array2.length) {
                return false;
            }
            for (var i = 0; i < array1.length; i++) {
                if (array1[i] !== array2[i]) {
                    return false;
                }
            }
            return true;
        }
        PDF20.prototype = {
            hash: function PDF20_hash(password, concatBytes, userBytes) {
                return calculatePDF20Hash(password, concatBytes, userBytes);
            },
            checkOwnerPassword: function PDF20_checkOwnerPassword(password, ownerValidationSalt, userBytes, ownerPassword) {
                var hashData = new Uint8Array(password.length + 56);
                hashData.set(password, 0);
                hashData.set(ownerValidationSalt, password.length);
                hashData.set(userBytes, password.length + ownerValidationSalt.length);
                var result = calculatePDF20Hash(password, hashData, userBytes);
                return compareByteArrays(result, ownerPassword);
            },
            checkUserPassword: function PDF20_checkUserPassword(password, userValidationSalt, userPassword) {
                var hashData = new Uint8Array(password.length + 8);
                hashData.set(password, 0);
                hashData.set(userValidationSalt, password.length);
                var result = calculatePDF20Hash(password, hashData, []);
                return compareByteArrays(result, userPassword);
            },
            getOwnerKey: function PDF20_getOwnerKey(password, ownerKeySalt, userBytes, ownerEncryption) {
                var hashData = new Uint8Array(password.length + 56);
                hashData.set(password, 0);
                hashData.set(ownerKeySalt, password.length);
                hashData.set(userBytes, password.length + ownerKeySalt.length);
                var key = calculatePDF20Hash(password, hashData, userBytes);
                var cipher = new AES256Cipher(key);
                return cipher.decryptBlock(ownerEncryption, false, new Uint8Array(16));
            },
            getUserKey: function PDF20_getUserKey(password, userKeySalt, userEncryption) {
                var hashData = new Uint8Array(password.length + 8);
                hashData.set(password, 0);
                hashData.set(userKeySalt, password.length);
                var key = calculatePDF20Hash(password, hashData, []);
                var cipher = new AES256Cipher(key);
                return cipher.decryptBlock(userEncryption, false, new Uint8Array(16));
            }
        };
        return PDF20;
    }();
    var CipherTransform = function CipherTransformClosure() {
        function CipherTransform(stringCipherConstructor, streamCipherConstructor) {
            this.StringCipherConstructor = stringCipherConstructor;
            this.StreamCipherConstructor = streamCipherConstructor;
        }
        CipherTransform.prototype = {
            createStream: function CipherTransform_createStream(stream, length) {
                var cipher = new this.StreamCipherConstructor();
                return new c.DecryptStream(stream, length, function cipherTransformDecryptStream(data, finalize) {
                    return cipher.decryptBlock(data, finalize);
                });
            },
            decryptString: function CipherTransform_decryptString(s) {
                var cipher = new this.StringCipherConstructor();
                var data = a.stringToBytes(s);
                data = cipher.decryptBlock(data, true);
                return a.bytesToString(data);
            },
            encryptString: function CipherTransform_encryptString(s) {
                const cipher = new this.StringCipherConstructor();
                if (cipher instanceof AESBaseCipher) {
                    const strLen = s.length;
                    const pad = 16 - strLen % 16;
                    if (pad !== 16) {
                        s = s.padEnd(16 * Math.ceil(strLen / 16), String.fromCharCode(pad));
                    }
                    const iv = new Uint8Array(16);
                    if (typeof crypto !== 'undefined') {
                        crypto.getRandomValues(iv);
                    } else {
                        for (let i = 0; i < 16; i++) {
                            iv[i] = Math.floor(256 * Math.random());
                        }
                    }
                    let data = a.stringToBytes(s);
                    data = cipher.encrypt(data, iv);
                    const buf = new Uint8Array(16 + data.length);
                    buf.set(iv);
                    buf.set(data, 16);
                    return a.bytesToString(buf);
                }
                let data = a.stringToBytes(s);
                data = cipher.encrypt(data);
                return a.bytesToString(data);
            }
        };
        return CipherTransform;
    }();
    var CipherTransformFactory = function CipherTransformFactoryClosure() {
        var defaultPasswordBytes = new Uint8Array([
            40,
            191,
            78,
            94,
            78,
            117,
            138,
            65,
            100,
            0,
            78,
            86,
            255,
            250,
            1,
            8,
            46,
            46,
            0,
            182,
            208,
            104,
            62,
            128,
            47,
            12,
            169,
            254,
            100,
            83,
            105,
            122
        ]);
        function createEncryptionKey20(revision, password, ownerPassword, ownerValidationSalt, ownerKeySalt, uBytes, userPassword, userValidationSalt, userKeySalt, ownerEncryption, userEncryption, perms) {
            if (password) {
                var passwordLength = Math.min(127, password.length);
                password = password.subarray(0, passwordLength);
            } else {
                password = [];
            }
            var pdfAlgorithm;
            if (revision === 6) {
                pdfAlgorithm = new PDF20();
            } else {
                pdfAlgorithm = new PDF17();
            }
            if (pdfAlgorithm.checkUserPassword(password, userValidationSalt, userPassword)) {
                return pdfAlgorithm.getUserKey(password, userKeySalt, userEncryption);
            } else if (password.length && pdfAlgorithm.checkOwnerPassword(password, ownerValidationSalt, uBytes, ownerPassword)) {
                return pdfAlgorithm.getOwnerKey(password, ownerKeySalt, uBytes, ownerEncryption);
            }
            return null;
        }
        function prepareKeyData(fileId, password, ownerPassword, userPassword, flags, revision, keyLength, encryptMetadata) {
            var hashDataSize = 40 + ownerPassword.length + fileId.length;
            var hashData = new Uint8Array(hashDataSize), i = 0, j, n;
            if (password) {
                n = Math.min(32, password.length);
                for (; i < n; ++i) {
                    hashData[i] = password[i];
                }
            }
            j = 0;
            while (i < 32) {
                hashData[i++] = defaultPasswordBytes[j++];
            }
            for (j = 0, n = ownerPassword.length; j < n; ++j) {
                hashData[i++] = ownerPassword[j];
            }
            hashData[i++] = flags & 255;
            hashData[i++] = flags >> 8 & 255;
            hashData[i++] = flags >> 16 & 255;
            hashData[i++] = flags >>> 24 & 255;
            for (j = 0, n = fileId.length; j < n; ++j) {
                hashData[i++] = fileId[j];
            }
            if (revision >= 4 && !encryptMetadata) {
                hashData[i++] = 255;
                hashData[i++] = 255;
                hashData[i++] = 255;
                hashData[i++] = 255;
            }
            var hash = calculateMD5(hashData, 0, i);
            var keyLengthInBytes = keyLength >> 3;
            if (revision >= 3) {
                for (j = 0; j < 50; ++j) {
                    hash = calculateMD5(hash, 0, keyLengthInBytes);
                }
            }
            var encryptionKey = hash.subarray(0, keyLengthInBytes);
            var cipher, checkData;
            if (revision >= 3) {
                for (i = 0; i < 32; ++i) {
                    hashData[i] = defaultPasswordBytes[i];
                }
                for (j = 0, n = fileId.length; j < n; ++j) {
                    hashData[i++] = fileId[j];
                }
                cipher = new ARCFourCipher(encryptionKey);
                checkData = cipher.encryptBlock(calculateMD5(hashData, 0, i));
                n = encryptionKey.length;
                var derivedKey = new Uint8Array(n), k;
                for (j = 1; j <= 19; ++j) {
                    for (k = 0; k < n; ++k) {
                        derivedKey[k] = encryptionKey[k] ^ j;
                    }
                    cipher = new ARCFourCipher(derivedKey);
                    checkData = cipher.encryptBlock(checkData);
                }
                for (j = 0, n = checkData.length; j < n; ++j) {
                    if (userPassword[j] !== checkData[j]) {
                        return null;
                    }
                }
            } else {
                cipher = new ARCFourCipher(encryptionKey);
                checkData = cipher.encryptBlock(defaultPasswordBytes);
                for (j = 0, n = checkData.length; j < n; ++j) {
                    if (userPassword[j] !== checkData[j]) {
                        return null;
                    }
                }
            }
            return encryptionKey;
        }
        function decodeUserPassword(password, ownerPassword, revision, keyLength) {
            var hashData = new Uint8Array(32), i = 0, j, n;
            n = Math.min(32, password.length);
            for (; i < n; ++i) {
                hashData[i] = password[i];
            }
            j = 0;
            while (i < 32) {
                hashData[i++] = defaultPasswordBytes[j++];
            }
            var hash = calculateMD5(hashData, 0, i);
            var keyLengthInBytes = keyLength >> 3;
            if (revision >= 3) {
                for (j = 0; j < 50; ++j) {
                    hash = calculateMD5(hash, 0, hash.length);
                }
            }
            var cipher, userPassword;
            if (revision >= 3) {
                userPassword = ownerPassword;
                var derivedKey = new Uint8Array(keyLengthInBytes), k;
                for (j = 19; j >= 0; j--) {
                    for (k = 0; k < keyLengthInBytes; ++k) {
                        derivedKey[k] = hash[k] ^ j;
                    }
                    cipher = new ARCFourCipher(derivedKey);
                    userPassword = cipher.encryptBlock(userPassword);
                }
            } else {
                cipher = new ARCFourCipher(hash.subarray(0, keyLengthInBytes));
                userPassword = cipher.encryptBlock(ownerPassword);
            }
            return userPassword;
        }
        var identityName = b.Name.get('Identity');
        function CipherTransformFactory(dict, fileId, password) {
            var filter = dict.get('Filter');
            if (!b.isName(filter, 'Standard')) {
                throw new a.FormatError('unknown encryption method');
            }
            this.dict = dict;
            var algorithm = dict.get('V');
            if (!Number.isInteger(algorithm) || algorithm !== 1 && algorithm !== 2 && algorithm !== 4 && algorithm !== 5) {
                throw new a.FormatError('unsupported encryption algorithm');
            }
            this.algorithm = algorithm;
            var keyLength = dict.get('Length');
            if (!keyLength) {
                if (algorithm <= 3) {
                    keyLength = 40;
                } else {
                    var cfDict = dict.get('CF');
                    var streamCryptoName = dict.get('StmF');
                    if (b.isDict(cfDict) && b.isName(streamCryptoName)) {
                        cfDict.suppressEncryption = true;
                        var handlerDict = cfDict.get(streamCryptoName.name);
                        keyLength = handlerDict && handlerDict.get('Length') || 128;
                        if (keyLength < 40) {
                            keyLength <<= 3;
                        }
                    }
                }
            }
            if (!Number.isInteger(keyLength) || keyLength < 40 || keyLength % 8 !== 0) {
                throw new a.FormatError('invalid key length');
            }
            var ownerPassword = a.stringToBytes(dict.get('O')).subarray(0, 32);
            var userPassword = a.stringToBytes(dict.get('U')).subarray(0, 32);
            var flags = dict.get('P');
            var revision = dict.get('R');
            var encryptMetadata = (algorithm === 4 || algorithm === 5) && dict.get('EncryptMetadata') !== false;
            this.encryptMetadata = encryptMetadata;
            var fileIdBytes = a.stringToBytes(fileId);
            var passwordBytes;
            if (password) {
                if (revision === 6) {
                    try {
                        password = a.utf8StringToString(password);
                    } catch (ex) {
                        a.warn('CipherTransformFactory: ' + 'Unable to convert UTF8 encoded password.');
                    }
                }
                passwordBytes = a.stringToBytes(password);
            }
            var encryptionKey;
            if (algorithm !== 5) {
                encryptionKey = prepareKeyData(fileIdBytes, passwordBytes, ownerPassword, userPassword, flags, revision, keyLength, encryptMetadata);
            } else {
                var ownerValidationSalt = a.stringToBytes(dict.get('O')).subarray(32, 40);
                var ownerKeySalt = a.stringToBytes(dict.get('O')).subarray(40, 48);
                var uBytes = a.stringToBytes(dict.get('U')).subarray(0, 48);
                var userValidationSalt = a.stringToBytes(dict.get('U')).subarray(32, 40);
                var userKeySalt = a.stringToBytes(dict.get('U')).subarray(40, 48);
                var ownerEncryption = a.stringToBytes(dict.get('OE'));
                var userEncryption = a.stringToBytes(dict.get('UE'));
                var perms = a.stringToBytes(dict.get('Perms'));
                encryptionKey = createEncryptionKey20(revision, passwordBytes, ownerPassword, ownerValidationSalt, ownerKeySalt, uBytes, userPassword, userValidationSalt, userKeySalt, ownerEncryption, userEncryption, perms);
            }
            if (!encryptionKey && !password) {
                throw new a.PasswordException('No password given', a.PasswordResponses.NEED_PASSWORD);
            } else if (!encryptionKey && password) {
                var decodedPassword = decodeUserPassword(passwordBytes, ownerPassword, revision, keyLength);
                encryptionKey = prepareKeyData(fileIdBytes, decodedPassword, ownerPassword, userPassword, flags, revision, keyLength, encryptMetadata);
            }
            if (!encryptionKey) {
                throw new a.PasswordException('Incorrect Password', a.PasswordResponses.INCORRECT_PASSWORD);
            }
            this.encryptionKey = encryptionKey;
            if (algorithm >= 4) {
                var cf = dict.get('CF');
                if (b.isDict(cf)) {
                    cf.suppressEncryption = true;
                }
                this.cf = cf;
                this.stmf = dict.get('StmF') || identityName;
                this.strf = dict.get('StrF') || identityName;
                this.eff = dict.get('EFF') || this.stmf;
            }
        }
        function buildObjectKey(num, gen, encryptionKey, isAes) {
            var key = new Uint8Array(encryptionKey.length + 9), i, n;
            for (i = 0, n = encryptionKey.length; i < n; ++i) {
                key[i] = encryptionKey[i];
            }
            key[i++] = num & 255;
            key[i++] = num >> 8 & 255;
            key[i++] = num >> 16 & 255;
            key[i++] = gen & 255;
            key[i++] = gen >> 8 & 255;
            if (isAes) {
                key[i++] = 115;
                key[i++] = 65;
                key[i++] = 108;
                key[i++] = 84;
            }
            var hash = calculateMD5(key, 0, i);
            return hash.subarray(0, Math.min(encryptionKey.length + 5, 16));
        }
        function buildCipherConstructor(cf, name, num, gen, key) {
            if (!b.isName(name)) {
                throw new a.FormatError('Invalid crypt filter name.');
            }
            var cryptFilter = cf.get(name.name);
            var cfm;
            if (cryptFilter !== null && cryptFilter !== undefined) {
                cfm = cryptFilter.get('CFM');
            }
            if (!cfm || cfm.name === 'None') {
                return function cipherTransformFactoryBuildCipherConstructorNone() {
                    return new NullCipher();
                };
            }
            if (cfm.name === 'V2') {
                return function cipherTransformFactoryBuildCipherConstructorV2() {
                    return new ARCFourCipher(buildObjectKey(num, gen, key, false));
                };
            }
            if (cfm.name === 'AESV2') {
                return function cipherTransformFactoryBuildCipherConstructorAESV2() {
                    return new AES128Cipher(buildObjectKey(num, gen, key, true));
                };
            }
            if (cfm.name === 'AESV3') {
                return function cipherTransformFactoryBuildCipherConstructorAESV3() {
                    return new AES256Cipher(key);
                };
            }
            throw new a.FormatError('Unknown crypto method');
        }
        CipherTransformFactory.prototype = {
            createCipherTransform: function CipherTransformFactory_createCipherTransform(num, gen) {
                if (this.algorithm === 4 || this.algorithm === 5) {
                    return new CipherTransform(buildCipherConstructor(this.cf, this.stmf, num, gen, this.encryptionKey), buildCipherConstructor(this.cf, this.strf, num, gen, this.encryptionKey));
                }
                var key = buildObjectKey(num, gen, this.encryptionKey, false);
                var cipherConstructor = function buildCipherCipherConstructor() {
                    return new ARCFourCipher(key);
                };
                return new CipherTransform(cipherConstructor, cipherConstructor);
            }
        };
        return CipherTransformFactory;
    }();
    return {
        AES128Cipher,
        AES256Cipher,
        ARCFourCipher,
        calculateMD5,
        calculateSHA256,
        calculateSHA384,
        calculateSHA512,
        CipherTransformFactory,
        PDF17,
        PDF20
    };
});
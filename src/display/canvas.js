define([
    '../shared/util.js',
    './pattern_helper.js'
], function (a, b) {
    'use strict';
    const MIN_FONT_SIZE = 16;
    const MAX_FONT_SIZE = 100;
    const MAX_GROUP_SIZE = 4096;
    const COMPILE_TYPE3_GLYPHS = true;
    const MAX_SIZE_TO_COMPILE = 1000;
    const FULL_CHUNK_HEIGHT = 16;
    function addContextCurrentTransform(ctx) {
        if (!ctx.mozCurrentTransform) {
            ctx._originalSave = ctx.save;
            ctx._originalRestore = ctx.restore;
            ctx._originalRotate = ctx.rotate;
            ctx._originalScale = ctx.scale;
            ctx._originalTranslate = ctx.translate;
            ctx._originalTransform = ctx.transform;
            ctx._originalSetTransform = ctx.setTransform;
            ctx._transformMatrix = ctx._transformMatrix || [
                1,
                0,
                0,
                1,
                0,
                0
            ];
            ctx._transformStack = [];
            Object.defineProperty(ctx, 'mozCurrentTransform', {
                get: function getCurrentTransform() {
                    return this._transformMatrix;
                }
            });
            Object.defineProperty(ctx, 'mozCurrentTransformInverse', {
                get: function getCurrentTransformInverse() {
                    const m = this._transformMatrix;
                    const a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5];
                    const ad_bc = a * d - b * c;
                    const bc_ad = b * c - a * d;
                    return [
                        d / ad_bc,
                        b / bc_ad,
                        c / bc_ad,
                        a / ad_bc,
                        (d * e - c * f) / bc_ad,
                        (b * e - a * f) / ad_bc
                    ];
                }
            });
            ctx.save = function ctxSave() {
                const old = this._transformMatrix;
                this._transformStack.push(old);
                this._transformMatrix = old.slice(0, 6);
                this._originalSave();
            };
            ctx.restore = function ctxRestore() {
                const prev = this._transformStack.pop();
                if (prev) {
                    this._transformMatrix = prev;
                    this._originalRestore();
                }
            };
            ctx.translate = function ctxTranslate(x, y) {
                const m = this._transformMatrix;
                m[4] = m[0] * x + m[2] * y + m[4];
                m[5] = m[1] * x + m[3] * y + m[5];
                this._originalTranslate(x, y);
            };
            ctx.scale = function ctxScale(x, y) {
                const m = this._transformMatrix;
                m[0] = m[0] * x;
                m[1] = m[1] * x;
                m[2] = m[2] * y;
                m[3] = m[3] * y;
                this._originalScale(x, y);
            };
            ctx.transform = function ctxTransform(a, b, c, d, e, f) {
                const m = this._transformMatrix;
                this._transformMatrix = [
                    m[0] * a + m[2] * b,
                    m[1] * a + m[3] * b,
                    m[0] * c + m[2] * d,
                    m[1] * c + m[3] * d,
                    m[0] * e + m[2] * f + m[4],
                    m[1] * e + m[3] * f + m[5]
                ];
                ctx._originalTransform(a, b, c, d, e, f);
            };
            ctx.setTransform = function ctxSetTransform(a, b, c, d, e, f) {
                this._transformMatrix = [
                    a,
                    b,
                    c,
                    d,
                    e,
                    f
                ];
                ctx._originalSetTransform(a, b, c, d, e, f);
            };
            ctx.rotate = function ctxRotate(angle) {
                const cosValue = Math.cos(angle);
                const sinValue = Math.sin(angle);
                const m = this._transformMatrix;
                this._transformMatrix = [
                    m[0] * cosValue + m[2] * sinValue,
                    m[1] * cosValue + m[3] * sinValue,
                    m[0] * -sinValue + m[2] * cosValue,
                    m[1] * -sinValue + m[3] * cosValue,
                    m[4],
                    m[5]
                ];
                this._originalRotate(angle);
            };
        }
    }
    const CachedCanvases = function CachedCanvasesClosure() {
        function CachedCanvases(canvasFactory) {
            this.canvasFactory = canvasFactory;
            this.cache = Object.create(null);
        }
        CachedCanvases.prototype = {
            getCanvas: function CachedCanvases_getCanvas(id, width, height, trackTransform) {
                let canvasEntry;
                if (this.cache[id] !== undefined) {
                    canvasEntry = this.cache[id];
                    this.canvasFactory.reset(canvasEntry, width, height);
                    canvasEntry.context.setTransform(1, 0, 0, 1, 0, 0);
                } else {
                    canvasEntry = this.canvasFactory.create(width, height);
                    this.cache[id] = canvasEntry;
                }
                if (trackTransform) {
                    addContextCurrentTransform(canvasEntry.context);
                }
                return canvasEntry;
            },
            clear() {
                for (const id in this.cache) {
                    const canvasEntry = this.cache[id];
                    this.canvasFactory.destroy(canvasEntry);
                    delete this.cache[id];
                }
            }
        };
        return CachedCanvases;
    }();
    function compileType3Glyph(imgData) {
        const POINT_TO_PROCESS_LIMIT = 1000;
        const width = imgData.width, height = imgData.height, width1 = width + 1;
        let i, ii, j, j0;
        const points = new Uint8Array(width1 * (height + 1));
        const POINT_TYPES = new Uint8Array([
            0,
            2,
            4,
            0,
            1,
            0,
            5,
            4,
            8,
            10,
            0,
            8,
            0,
            2,
            1,
            0
        ]);
        const lineSize = width + 7 & ~7, data0 = imgData.data;
        const data = new Uint8Array(lineSize * height);
        let pos = 0;
        for (i = 0, ii = data0.length; i < ii; i++) {
            const elem = data0[i];
            let mask = 128;
            while (mask > 0) {
                data[pos++] = elem & mask ? 0 : 255;
                mask >>= 1;
            }
        }
        let count = 0;
        pos = 0;
        if (data[pos] !== 0) {
            points[0] = 1;
            ++count;
        }
        for (j = 1; j < width; j++) {
            if (data[pos] !== data[pos + 1]) {
                points[j] = data[pos] ? 2 : 1;
                ++count;
            }
            pos++;
        }
        if (data[pos] !== 0) {
            points[j] = 2;
            ++count;
        }
        for (i = 1; i < height; i++) {
            pos = i * lineSize;
            j0 = i * width1;
            if (data[pos - lineSize] !== data[pos]) {
                points[j0] = data[pos] ? 1 : 8;
                ++count;
            }
            let sum = (data[pos] ? 4 : 0) + (data[pos - lineSize] ? 8 : 0);
            for (j = 1; j < width; j++) {
                sum = (sum >> 2) + (data[pos + 1] ? 4 : 0) + (data[pos - lineSize + 1] ? 8 : 0);
                if (POINT_TYPES[sum]) {
                    points[j0 + j] = POINT_TYPES[sum];
                    ++count;
                }
                pos++;
            }
            if (data[pos - lineSize] !== data[pos]) {
                points[j0 + j] = data[pos] ? 2 : 4;
                ++count;
            }
            if (count > POINT_TO_PROCESS_LIMIT) {
                return null;
            }
        }
        pos = lineSize * (height - 1);
        j0 = i * width1;
        if (data[pos] !== 0) {
            points[j0] = 8;
            ++count;
        }
        for (j = 1; j < width; j++) {
            if (data[pos] !== data[pos + 1]) {
                points[j0 + j] = data[pos] ? 4 : 8;
                ++count;
            }
            pos++;
        }
        if (data[pos] !== 0) {
            points[j0 + j] = 4;
            ++count;
        }
        if (count > POINT_TO_PROCESS_LIMIT) {
            return null;
        }
        const steps = new Int32Array([
            0,
            width1,
            -1,
            0,
            -width1,
            0,
            0,
            0,
            1
        ]);
        const outlines = [];
        for (i = 0; count && i <= height; i++) {
            let p = i * width1;
            const end = p + width;
            while (p < end && !points[p]) {
                p++;
            }
            if (p === end) {
                continue;
            }
            const coords = [
                p % width1,
                i
            ];
            const p0 = p;
            let type = points[p];
            do {
                const step = steps[type];
                do {
                    p += step;
                } while (!points[p]);
                const pp = points[p];
                if (pp !== 5 && pp !== 10) {
                    type = pp;
                    points[p] = 0;
                } else {
                    type = pp & 51 * type >> 4;
                    points[p] &= type >> 2 | type << 2;
                }
                coords.push(p % width1);
                coords.push(p / width1 | 0);
                if (!points[p]) {
                    --count;
                }
            } while (p0 !== p);
            outlines.push(coords);
            --i;
        }
        const drawOutline = function (c) {
            c.save();
            c.scale(1 / width, -1 / height);
            c.translate(0, -height);
            c.beginPath();
            for (let k = 0, kk = outlines.length; k < kk; k++) {
                const o = outlines[k];
                c.moveTo(o[0], o[1]);
                for (let l = 2, ll = o.length; l < ll; l += 2) {
                    c.lineTo(o[l], o[l + 1]);
                }
            }
            c.fill();
            c.beginPath();
            c.restore();
        };
        return drawOutline;
    }
    const CanvasExtraState = function CanvasExtraStateClosure() {
        function CanvasExtraState() {
            this.alphaIsShape = false;
            this.fontSize = 0;
            this.fontSizeScale = 1;
            this.textMatrix = a.IDENTITY_MATRIX;
            this.textMatrixScale = 1;
            this.fontMatrix = a.FONT_IDENTITY_MATRIX;
            this.leading = 0;
            this.x = 0;
            this.y = 0;
            this.lineX = 0;
            this.lineY = 0;
            this.charSpacing = 0;
            this.wordSpacing = 0;
            this.textHScale = 1;
            this.textRenderingMode = a.TextRenderingMode.FILL;
            this.textRise = 0;
            this.fillColor = '#000000';
            this.strokeColor = '#000000';
            this.patternFill = false;
            this.fillAlpha = 1;
            this.strokeAlpha = 1;
            this.lineWidth = 1;
            this.activeSMask = null;
            this.resumeSMaskCtx = null;
            this.transferMaps = null;
        }
        CanvasExtraState.prototype = {
            clone: function CanvasExtraState_clone() {
                return Object.create(this);
            },
            setCurrentPoint: function CanvasExtraState_setCurrentPoint(x, y) {
                this.x = x;
                this.y = y;
            }
        };
        return CanvasExtraState;
    }();
    const CanvasGraphics = function CanvasGraphicsClosure() {
        const EXECUTION_TIME = 15;
        const EXECUTION_STEPS = 10;
        function CanvasGraphics(canvasCtx, commonObjs, objs, canvasFactory, webGLContext, imageLayer, optionalContentConfig) {
            this.ctx = canvasCtx;
            this.current = new CanvasExtraState();
            this.stateStack = [];
            this.pendingClip = null;
            this.pendingEOFill = false;
            this.res = null;
            this.xobjs = null;
            this.commonObjs = commonObjs;
            this.objs = objs;
            this.canvasFactory = canvasFactory;
            this.webGLContext = webGLContext;
            this.imageLayer = imageLayer;
            this.groupStack = [];
            this.processingType3 = null;
            this.baseTransform = null;
            this.baseTransformStack = [];
            this.groupLevel = 0;
            this.smaskStack = [];
            this.smaskCounter = 0;
            this.tempSMask = null;
            this.contentVisible = true;
            this.markedContentStack = [];
            this.optionalContentConfig = optionalContentConfig;
            this.cachedCanvases = new CachedCanvases(this.canvasFactory);
            if (canvasCtx) {
                addContextCurrentTransform(canvasCtx);
            }
            this._cachedGetSinglePixelWidth = null;
        }
        function putBinaryImageData(ctx, imgData, transferMaps = null) {
            if (typeof ImageData !== 'undefined' && imgData instanceof ImageData) {
                ctx.putImageData(imgData, 0, 0);
                return;
            }
            const height = imgData.height, width = imgData.width;
            const partialChunkHeight = height % FULL_CHUNK_HEIGHT;
            const fullChunks = (height - partialChunkHeight) / FULL_CHUNK_HEIGHT;
            const totalChunks = partialChunkHeight === 0 ? fullChunks : fullChunks + 1;
            const chunkImgData = ctx.createImageData(width, FULL_CHUNK_HEIGHT);
            let srcPos = 0, destPos;
            const src = imgData.data;
            const dest = chunkImgData.data;
            let i, j, thisChunkHeight, elemsInThisChunk;
            let transferMapRed, transferMapGreen, transferMapBlue, transferMapGray;
            if (transferMaps) {
                switch (transferMaps.length) {
                case 1:
                    transferMapRed = transferMaps[0];
                    transferMapGreen = transferMaps[0];
                    transferMapBlue = transferMaps[0];
                    transferMapGray = transferMaps[0];
                    break;
                case 4:
                    transferMapRed = transferMaps[0];
                    transferMapGreen = transferMaps[1];
                    transferMapBlue = transferMaps[2];
                    transferMapGray = transferMaps[3];
                    break;
                }
            }
            if (imgData.kind === a.ImageKind.GRAYSCALE_1BPP) {
                const srcLength = src.byteLength;
                const dest32 = new Uint32Array(dest.buffer, 0, dest.byteLength >> 2);
                const dest32DataLength = dest32.length;
                const fullSrcDiff = width + 7 >> 3;
                let white = 4294967295;
                let black = a.IsLittleEndianCached.value ? 4278190080 : 255;
                if (transferMapGray) {
                    if (transferMapGray[0] === 255 && transferMapGray[255] === 0) {
                        [white, black] = [
                            black,
                            white
                        ];
                    }
                }
                for (i = 0; i < totalChunks; i++) {
                    thisChunkHeight = i < fullChunks ? FULL_CHUNK_HEIGHT : partialChunkHeight;
                    destPos = 0;
                    for (j = 0; j < thisChunkHeight; j++) {
                        const srcDiff = srcLength - srcPos;
                        let k = 0;
                        const kEnd = srcDiff > fullSrcDiff ? width : srcDiff * 8 - 7;
                        const kEndUnrolled = kEnd & ~7;
                        let mask = 0;
                        let srcByte = 0;
                        for (; k < kEndUnrolled; k += 8) {
                            srcByte = src[srcPos++];
                            dest32[destPos++] = srcByte & 128 ? white : black;
                            dest32[destPos++] = srcByte & 64 ? white : black;
                            dest32[destPos++] = srcByte & 32 ? white : black;
                            dest32[destPos++] = srcByte & 16 ? white : black;
                            dest32[destPos++] = srcByte & 8 ? white : black;
                            dest32[destPos++] = srcByte & 4 ? white : black;
                            dest32[destPos++] = srcByte & 2 ? white : black;
                            dest32[destPos++] = srcByte & 1 ? white : black;
                        }
                        for (; k < kEnd; k++) {
                            if (mask === 0) {
                                srcByte = src[srcPos++];
                                mask = 128;
                            }
                            dest32[destPos++] = srcByte & mask ? white : black;
                            mask >>= 1;
                        }
                    }
                    while (destPos < dest32DataLength) {
                        dest32[destPos++] = 0;
                    }
                    ctx.putImageData(chunkImgData, 0, i * FULL_CHUNK_HEIGHT);
                }
            } else if (imgData.kind === a.ImageKind.RGBA_32BPP) {
                const hasTransferMaps = !!(transferMapRed || transferMapGreen || transferMapBlue);
                j = 0;
                elemsInThisChunk = width * FULL_CHUNK_HEIGHT * 4;
                for (i = 0; i < fullChunks; i++) {
                    dest.set(src.subarray(srcPos, srcPos + elemsInThisChunk));
                    srcPos += elemsInThisChunk;
                    if (hasTransferMaps) {
                        for (let k = 0; k < elemsInThisChunk; k += 4) {
                            if (transferMapRed) {
                                dest[k + 0] = transferMapRed[dest[k + 0]];
                            }
                            if (transferMapGreen) {
                                dest[k + 1] = transferMapGreen[dest[k + 1]];
                            }
                            if (transferMapBlue) {
                                dest[k + 2] = transferMapBlue[dest[k + 2]];
                            }
                        }
                    }
                    ctx.putImageData(chunkImgData, 0, j);
                    j += FULL_CHUNK_HEIGHT;
                }
                if (i < totalChunks) {
                    elemsInThisChunk = width * partialChunkHeight * 4;
                    dest.set(src.subarray(srcPos, srcPos + elemsInThisChunk));
                    if (hasTransferMaps) {
                        for (let k = 0; k < elemsInThisChunk; k += 4) {
                            if (transferMapRed) {
                                dest[k + 0] = transferMapRed[dest[k + 0]];
                            }
                            if (transferMapGreen) {
                                dest[k + 1] = transferMapGreen[dest[k + 1]];
                            }
                            if (transferMapBlue) {
                                dest[k + 2] = transferMapBlue[dest[k + 2]];
                            }
                        }
                    }
                    ctx.putImageData(chunkImgData, 0, j);
                }
            } else if (imgData.kind === a.ImageKind.RGB_24BPP) {
                const hasTransferMaps = !!(transferMapRed || transferMapGreen || transferMapBlue);
                thisChunkHeight = FULL_CHUNK_HEIGHT;
                elemsInThisChunk = width * thisChunkHeight;
                for (i = 0; i < totalChunks; i++) {
                    if (i >= fullChunks) {
                        thisChunkHeight = partialChunkHeight;
                        elemsInThisChunk = width * thisChunkHeight;
                    }
                    destPos = 0;
                    for (j = elemsInThisChunk; j--;) {
                        dest[destPos++] = src[srcPos++];
                        dest[destPos++] = src[srcPos++];
                        dest[destPos++] = src[srcPos++];
                        dest[destPos++] = 255;
                    }
                    if (hasTransferMaps) {
                        for (let k = 0; k < destPos; k += 4) {
                            if (transferMapRed) {
                                dest[k + 0] = transferMapRed[dest[k + 0]];
                            }
                            if (transferMapGreen) {
                                dest[k + 1] = transferMapGreen[dest[k + 1]];
                            }
                            if (transferMapBlue) {
                                dest[k + 2] = transferMapBlue[dest[k + 2]];
                            }
                        }
                    }
                    ctx.putImageData(chunkImgData, 0, i * FULL_CHUNK_HEIGHT);
                }
            } else {
                throw new Error(`bad image kind: ${ imgData.kind }`);
            }
        }
        function putBinaryImageMask(ctx, imgData) {
            const height = imgData.height, width = imgData.width;
            const partialChunkHeight = height % FULL_CHUNK_HEIGHT;
            const fullChunks = (height - partialChunkHeight) / FULL_CHUNK_HEIGHT;
            const totalChunks = partialChunkHeight === 0 ? fullChunks : fullChunks + 1;
            const chunkImgData = ctx.createImageData(width, FULL_CHUNK_HEIGHT);
            let srcPos = 0;
            const src = imgData.data;
            const dest = chunkImgData.data;
            for (let i = 0; i < totalChunks; i++) {
                const thisChunkHeight = i < fullChunks ? FULL_CHUNK_HEIGHT : partialChunkHeight;
                let destPos = 3;
                for (let j = 0; j < thisChunkHeight; j++) {
                    let elem, mask = 0;
                    for (let k = 0; k < width; k++) {
                        if (!mask) {
                            elem = src[srcPos++];
                            mask = 128;
                        }
                        dest[destPos] = elem & mask ? 0 : 255;
                        destPos += 4;
                        mask >>= 1;
                    }
                }
                ctx.putImageData(chunkImgData, 0, i * FULL_CHUNK_HEIGHT);
            }
        }
        function copyCtxState(sourceCtx, destCtx) {
            const properties = [
                'strokeStyle',
                'fillStyle',
                'fillRule',
                'globalAlpha',
                'lineWidth',
                'lineCap',
                'lineJoin',
                'miterLimit',
                'globalCompositeOperation',
                'font'
            ];
            for (let i = 0, ii = properties.length; i < ii; i++) {
                const property = properties[i];
                if (sourceCtx[property] !== undefined) {
                    destCtx[property] = sourceCtx[property];
                }
            }
            if (sourceCtx.setLineDash !== undefined) {
                destCtx.setLineDash(sourceCtx.getLineDash());
                destCtx.lineDashOffset = sourceCtx.lineDashOffset;
            }
        }
        function resetCtxToDefault(ctx) {
            ctx.strokeStyle = '#000000';
            ctx.fillStyle = '#000000';
            ctx.fillRule = 'nonzero';
            ctx.globalAlpha = 1;
            ctx.lineWidth = 1;
            ctx.lineCap = 'butt';
            ctx.lineJoin = 'miter';
            ctx.miterLimit = 10;
            ctx.globalCompositeOperation = 'source-over';
            ctx.font = '10px sans-serif';
            if (ctx.setLineDash !== undefined) {
                ctx.setLineDash([]);
                ctx.lineDashOffset = 0;
            }
        }
        function composeSMaskBackdrop(bytes, r0, g0, b0) {
            const length = bytes.length;
            for (let i = 3; i < length; i += 4) {
                const alpha = bytes[i];
                if (alpha === 0) {
                    bytes[i - 3] = r0;
                    bytes[i - 2] = g0;
                    bytes[i - 1] = b0;
                } else if (alpha < 255) {
                    const alpha_ = 255 - alpha;
                    bytes[i - 3] = bytes[i - 3] * alpha + r0 * alpha_ >> 8;
                    bytes[i - 2] = bytes[i - 2] * alpha + g0 * alpha_ >> 8;
                    bytes[i - 1] = bytes[i - 1] * alpha + b0 * alpha_ >> 8;
                }
            }
        }
        function composeSMaskAlpha(maskData, layerData, transferMap) {
            const length = maskData.length;
            const scale = 1 / 255;
            for (let i = 3; i < length; i += 4) {
                const alpha = transferMap ? transferMap[maskData[i]] : maskData[i];
                layerData[i] = layerData[i] * alpha * scale | 0;
            }
        }
        function composeSMaskLuminosity(maskData, layerData, transferMap) {
            const length = maskData.length;
            for (let i = 3; i < length; i += 4) {
                const y = maskData[i - 3] * 77 + maskData[i - 2] * 152 + maskData[i - 1] * 28;
                layerData[i] = transferMap ? layerData[i] * transferMap[y >> 8] >> 8 : layerData[i] * y >> 16;
            }
        }
        function genericComposeSMask(maskCtx, layerCtx, width, height, subtype, backdrop, transferMap) {
            const hasBackdrop = !!backdrop;
            const r0 = hasBackdrop ? backdrop[0] : 0;
            const g0 = hasBackdrop ? backdrop[1] : 0;
            const b0 = hasBackdrop ? backdrop[2] : 0;
            let composeFn;
            if (subtype === 'Luminosity') {
                composeFn = composeSMaskLuminosity;
            } else {
                composeFn = composeSMaskAlpha;
            }
            const PIXELS_TO_PROCESS = 1048576;
            const chunkSize = Math.min(height, Math.ceil(PIXELS_TO_PROCESS / width));
            for (let row = 0; row < height; row += chunkSize) {
                const chunkHeight = Math.min(chunkSize, height - row);
                const maskData = maskCtx.getImageData(0, row, width, chunkHeight);
                const layerData = layerCtx.getImageData(0, row, width, chunkHeight);
                if (hasBackdrop) {
                    composeSMaskBackdrop(maskData.data, r0, g0, b0);
                }
                composeFn(maskData.data, layerData.data, transferMap);
                maskCtx.putImageData(layerData, 0, row);
            }
        }
        function composeSMask(ctx, smask, layerCtx, webGLContext) {
            const mask = smask.canvas;
            const maskCtx = smask.context;
            ctx.setTransform(smask.scaleX, 0, 0, smask.scaleY, smask.offsetX, smask.offsetY);
            const backdrop = smask.backdrop || null;
            if (!smask.transferMap && webGLContext.isEnabled) {
                const composed = webGLContext.composeSMask({
                    layer: layerCtx.canvas,
                    mask,
                    properties: {
                        subtype: smask.subtype,
                        backdrop
                    }
                });
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.drawImage(composed, smask.offsetX, smask.offsetY);
                return;
            }
            genericComposeSMask(maskCtx, layerCtx, mask.width, mask.height, smask.subtype, backdrop, smask.transferMap);
            ctx.drawImage(mask, 0, 0);
        }
        const LINE_CAP_STYLES = [
            'butt',
            'round',
            'square'
        ];
        const LINE_JOIN_STYLES = [
            'miter',
            'round',
            'bevel'
        ];
        const NORMAL_CLIP = {};
        const EO_CLIP = {};
        CanvasGraphics.prototype = {
            beginDrawing({transform, viewport, transparency = false, background = null}) {
                const width = this.ctx.canvas.width;
                const height = this.ctx.canvas.height;
                this.ctx.save();
                this.ctx.fillStyle = background || 'rgb(255, 255, 255)';
                this.ctx.fillRect(0, 0, width, height);
                this.ctx.restore();
                if (transparency) {
                    const transparentCanvas = this.cachedCanvases.getCanvas('transparent', width, height, true);
                    this.compositeCtx = this.ctx;
                    this.transparentCanvas = transparentCanvas.canvas;
                    this.ctx = transparentCanvas.context;
                    this.ctx.save();
                    this.ctx.transform.apply(this.ctx, this.compositeCtx.mozCurrentTransform);
                }
                this.ctx.save();
                resetCtxToDefault(this.ctx);
                if (transform) {
                    this.ctx.transform.apply(this.ctx, transform);
                }
                this.ctx.transform.apply(this.ctx, viewport.transform);
                this.baseTransform = this.ctx.mozCurrentTransform.slice();
                this._combinedScaleFactor = Math.hypot(this.baseTransform[0], this.baseTransform[2]);
                if (this.imageLayer) {
                    this.imageLayer.beginLayout();
                }
            },
            executeOperatorList: function CanvasGraphics_executeOperatorList(operatorList, executionStartIdx, continueCallback, stepper) {
                const argsArray = operatorList.argsArray;
                const fnArray = operatorList.fnArray;
                let i = executionStartIdx || 0;
                const argsArrayLen = argsArray.length;
                if (argsArrayLen === i) {
                    return i;
                }
                const chunkOperations = argsArrayLen - i > EXECUTION_STEPS && typeof continueCallback === 'function';
                const endTime = chunkOperations ? Date.now() + EXECUTION_TIME : 0;
                let steps = 0;
                const commonObjs = this.commonObjs;
                const objs = this.objs;
                let fnId;
                while (true) {
                    if (stepper !== undefined && i === stepper.nextBreakPoint) {
                        stepper.breakIt(i, continueCallback);
                        return i;
                    }
                    fnId = fnArray[i];
                    if (fnId !== a.OPS.dependency) {
                        this[fnId].apply(this, argsArray[i]);
                    } else {
                        for (const depObjId of argsArray[i]) {
                            const objsPool = depObjId.startsWith('g_') ? commonObjs : objs;
                            if (!objsPool.has(depObjId)) {
                                objsPool.get(depObjId, continueCallback);
                                return i;
                            }
                        }
                    }
                    i++;
                    if (i === argsArrayLen) {
                        return i;
                    }
                    if (chunkOperations && ++steps > EXECUTION_STEPS) {
                        if (Date.now() > endTime) {
                            continueCallback();
                            return i;
                        }
                        steps = 0;
                    }
                }
            },
            endDrawing: function CanvasGraphics_endDrawing() {
                while (this.stateStack.length || this.current.activeSMask !== null) {
                    this.restore();
                }
                this.ctx.restore();
                if (this.transparentCanvas) {
                    this.ctx = this.compositeCtx;
                    this.ctx.save();
                    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
                    this.ctx.drawImage(this.transparentCanvas, 0, 0);
                    this.ctx.restore();
                    this.transparentCanvas = null;
                }
                this.cachedCanvases.clear();
                this.webGLContext.clear();
                if (this.imageLayer) {
                    this.imageLayer.endLayout();
                }
            },
            setLineWidth: function CanvasGraphics_setLineWidth(width) {
                this.current.lineWidth = width;
                this.ctx.lineWidth = width;
            },
            setLineCap: function CanvasGraphics_setLineCap(style) {
                this.ctx.lineCap = LINE_CAP_STYLES[style];
            },
            setLineJoin: function CanvasGraphics_setLineJoin(style) {
                this.ctx.lineJoin = LINE_JOIN_STYLES[style];
            },
            setMiterLimit: function CanvasGraphics_setMiterLimit(limit) {
                this.ctx.miterLimit = limit;
            },
            setDash: function CanvasGraphics_setDash(dashArray, dashPhase) {
                const ctx = this.ctx;
                if (ctx.setLineDash !== undefined) {
                    ctx.setLineDash(dashArray);
                    ctx.lineDashOffset = dashPhase;
                }
            },
            setRenderingIntent(intent) {
            },
            setFlatness(flatness) {
            },
            setGState: function CanvasGraphics_setGState(states) {
                for (let i = 0, ii = states.length; i < ii; i++) {
                    const state = states[i];
                    const key = state[0];
                    const value = state[1];
                    switch (key) {
                    case 'LW':
                        this.setLineWidth(value);
                        break;
                    case 'LC':
                        this.setLineCap(value);
                        break;
                    case 'LJ':
                        this.setLineJoin(value);
                        break;
                    case 'ML':
                        this.setMiterLimit(value);
                        break;
                    case 'D':
                        this.setDash(value[0], value[1]);
                        break;
                    case 'RI':
                        this.setRenderingIntent(value);
                        break;
                    case 'FL':
                        this.setFlatness(value);
                        break;
                    case 'Font':
                        this.setFont(value[0], value[1]);
                        break;
                    case 'CA':
                        this.current.strokeAlpha = state[1];
                        break;
                    case 'ca':
                        this.current.fillAlpha = state[1];
                        this.ctx.globalAlpha = state[1];
                        break;
                    case 'BM':
                        this.ctx.globalCompositeOperation = value;
                        break;
                    case 'SMask':
                        if (this.current.activeSMask) {
                            if (this.stateStack.length > 0 && this.stateStack[this.stateStack.length - 1].activeSMask === this.current.activeSMask) {
                                this.suspendSMaskGroup();
                            } else {
                                this.endSMaskGroup();
                            }
                        }
                        this.current.activeSMask = value ? this.tempSMask : null;
                        if (this.current.activeSMask) {
                            this.beginSMaskGroup();
                        }
                        this.tempSMask = null;
                        break;
                    case 'TR':
                        this.current.transferMaps = value;
                    }
                }
            },
            beginSMaskGroup: function CanvasGraphics_beginSMaskGroup() {
                const activeSMask = this.current.activeSMask;
                const drawnWidth = activeSMask.canvas.width;
                const drawnHeight = activeSMask.canvas.height;
                const cacheId = 'smaskGroupAt' + this.groupLevel;
                const scratchCanvas = this.cachedCanvases.getCanvas(cacheId, drawnWidth, drawnHeight, true);
                const currentCtx = this.ctx;
                const currentTransform = currentCtx.mozCurrentTransform;
                this.ctx.save();
                const groupCtx = scratchCanvas.context;
                groupCtx.scale(1 / activeSMask.scaleX, 1 / activeSMask.scaleY);
                groupCtx.translate(-activeSMask.offsetX, -activeSMask.offsetY);
                groupCtx.transform.apply(groupCtx, currentTransform);
                activeSMask.startTransformInverse = groupCtx.mozCurrentTransformInverse;
                copyCtxState(currentCtx, groupCtx);
                this.ctx = groupCtx;
                this.setGState([
                    [
                        'BM',
                        'source-over'
                    ],
                    [
                        'ca',
                        1
                    ],
                    [
                        'CA',
                        1
                    ]
                ]);
                this.groupStack.push(currentCtx);
                this.groupLevel++;
            },
            suspendSMaskGroup: function CanvasGraphics_endSMaskGroup() {
                const groupCtx = this.ctx;
                this.groupLevel--;
                this.ctx = this.groupStack.pop();
                composeSMask(this.ctx, this.current.activeSMask, groupCtx, this.webGLContext);
                this.ctx.restore();
                this.ctx.save();
                copyCtxState(groupCtx, this.ctx);
                this.current.resumeSMaskCtx = groupCtx;
                const deltaTransform = a.Util.transform(this.current.activeSMask.startTransformInverse, groupCtx.mozCurrentTransform);
                this.ctx.transform.apply(this.ctx, deltaTransform);
                groupCtx.save();
                groupCtx.setTransform(1, 0, 0, 1, 0, 0);
                groupCtx.clearRect(0, 0, groupCtx.canvas.width, groupCtx.canvas.height);
                groupCtx.restore();
            },
            resumeSMaskGroup: function CanvasGraphics_resumeSMaskGroup() {
                const groupCtx = this.current.resumeSMaskCtx;
                const currentCtx = this.ctx;
                this.ctx = groupCtx;
                this.groupStack.push(currentCtx);
                this.groupLevel++;
            },
            endSMaskGroup: function CanvasGraphics_endSMaskGroup() {
                const groupCtx = this.ctx;
                this.groupLevel--;
                this.ctx = this.groupStack.pop();
                composeSMask(this.ctx, this.current.activeSMask, groupCtx, this.webGLContext);
                this.ctx.restore();
                copyCtxState(groupCtx, this.ctx);
                const deltaTransform = a.Util.transform(this.current.activeSMask.startTransformInverse, groupCtx.mozCurrentTransform);
                this.ctx.transform.apply(this.ctx, deltaTransform);
            },
            save: function CanvasGraphics_save() {
                this.ctx.save();
                const old = this.current;
                this.stateStack.push(old);
                this.current = old.clone();
                this.current.resumeSMaskCtx = null;
            },
            restore: function CanvasGraphics_restore() {
                if (this.current.resumeSMaskCtx) {
                    this.resumeSMaskGroup();
                }
                if (this.current.activeSMask !== null && (this.stateStack.length === 0 || this.stateStack[this.stateStack.length - 1].activeSMask !== this.current.activeSMask)) {
                    this.endSMaskGroup();
                }
                if (this.stateStack.length !== 0) {
                    this.current = this.stateStack.pop();
                    this.ctx.restore();
                    this.pendingClip = null;
                    this._cachedGetSinglePixelWidth = null;
                } else {
                    this.current.activeSMask = null;
                }
            },
            transform: function CanvasGraphics_transform(a, b, c, d, e, f) {
                this.ctx.transform(a, b, c, d, e, f);
                this._cachedGetSinglePixelWidth = null;
            },
            constructPath: function CanvasGraphics_constructPath(ops, args) {
                const ctx = this.ctx;
                const current = this.current;
                let x = current.x, y = current.y;
                for (let i = 0, j = 0, ii = ops.length; i < ii; i++) {
                    switch (ops[i] | 0) {
                    case a.OPS.rectangle:
                        x = args[j++];
                        y = args[j++];
                        const width = args[j++];
                        const height = args[j++];
                        const xw = x + width;
                        const yh = y + height;
                        ctx.moveTo(x, y);
                        if (width === 0 || height === 0) {
                            ctx.lineTo(xw, yh);
                        } else {
                            ctx.lineTo(xw, y);
                            ctx.lineTo(xw, yh);
                            ctx.lineTo(x, yh);
                        }
                        ctx.closePath();
                        break;
                    case a.OPS.moveTo:
                        x = args[j++];
                        y = args[j++];
                        ctx.moveTo(x, y);
                        break;
                    case a.OPS.lineTo:
                        x = args[j++];
                        y = args[j++];
                        ctx.lineTo(x, y);
                        break;
                    case a.OPS.curveTo:
                        x = args[j + 4];
                        y = args[j + 5];
                        ctx.bezierCurveTo(args[j], args[j + 1], args[j + 2], args[j + 3], x, y);
                        j += 6;
                        break;
                    case a.OPS.curveTo2:
                        ctx.bezierCurveTo(x, y, args[j], args[j + 1], args[j + 2], args[j + 3]);
                        x = args[j + 2];
                        y = args[j + 3];
                        j += 4;
                        break;
                    case a.OPS.curveTo3:
                        x = args[j + 2];
                        y = args[j + 3];
                        ctx.bezierCurveTo(args[j], args[j + 1], x, y, x, y);
                        j += 4;
                        break;
                    case a.OPS.closePath:
                        ctx.closePath();
                        break;
                    }
                }
                current.setCurrentPoint(x, y);
            },
            closePath: function CanvasGraphics_closePath() {
                this.ctx.closePath();
            },
            stroke: function CanvasGraphics_stroke(consumePath) {
                consumePath = typeof consumePath !== 'undefined' ? consumePath : true;
                const ctx = this.ctx;
                const strokeColor = this.current.strokeColor;
                ctx.globalAlpha = this.current.strokeAlpha;
                if (this.contentVisible) {
                    if (typeof strokeColor === 'object' && strokeColor && strokeColor.getPattern) {
                        ctx.save();
                        const transform = ctx.mozCurrentTransform;
                        const scale = a.Util.singularValueDecompose2dScale(transform)[0];
                        ctx.strokeStyle = strokeColor.getPattern(ctx, this);
                        const lineWidth = this.getSinglePixelWidth();
                        const scaledLineWidth = this.current.lineWidth * scale;
                        if (lineWidth < 0 && -lineWidth >= scaledLineWidth) {
                            ctx.resetTransform();
                            ctx.lineWidth = Math.round(this._combinedScaleFactor);
                        } else {
                            ctx.lineWidth = Math.max(lineWidth, scaledLineWidth);
                        }
                        ctx.stroke();
                        ctx.restore();
                    } else {
                        const lineWidth = this.getSinglePixelWidth();
                        if (lineWidth < 0 && -lineWidth >= this.current.lineWidth) {
                            ctx.save();
                            ctx.resetTransform();
                            ctx.lineWidth = Math.round(this._combinedScaleFactor);
                            ctx.stroke();
                            ctx.restore();
                        } else {
                            ctx.lineWidth = Math.max(lineWidth, this.current.lineWidth);
                            ctx.stroke();
                        }
                    }
                }
                if (consumePath) {
                    this.consumePath();
                }
                ctx.globalAlpha = this.current.fillAlpha;
            },
            closeStroke: function CanvasGraphics_closeStroke() {
                this.closePath();
                this.stroke();
            },
            fill: function CanvasGraphics_fill(consumePath) {
                consumePath = typeof consumePath !== 'undefined' ? consumePath : true;
                const ctx = this.ctx;
                const fillColor = this.current.fillColor;
                const isPatternFill = this.current.patternFill;
                let needRestore = false;
                if (isPatternFill) {
                    ctx.save();
                    if (this.baseTransform) {
                        ctx.setTransform.apply(ctx, this.baseTransform);
                    }
                    ctx.fillStyle = fillColor.getPattern(ctx, this);
                    needRestore = true;
                }
                if (this.contentVisible) {
                    if (this.pendingEOFill) {
                        ctx.fill('evenodd');
                        this.pendingEOFill = false;
                    } else {
                        ctx.fill();
                    }
                }
                if (needRestore) {
                    ctx.restore();
                }
                if (consumePath) {
                    this.consumePath();
                }
            },
            eoFill: function CanvasGraphics_eoFill() {
                this.pendingEOFill = true;
                this.fill();
            },
            fillStroke: function CanvasGraphics_fillStroke() {
                this.fill(false);
                this.stroke(false);
                this.consumePath();
            },
            eoFillStroke: function CanvasGraphics_eoFillStroke() {
                this.pendingEOFill = true;
                this.fillStroke();
            },
            closeFillStroke: function CanvasGraphics_closeFillStroke() {
                this.closePath();
                this.fillStroke();
            },
            closeEOFillStroke: function CanvasGraphics_closeEOFillStroke() {
                this.pendingEOFill = true;
                this.closePath();
                this.fillStroke();
            },
            endPath: function CanvasGraphics_endPath() {
                this.consumePath();
            },
            clip: function CanvasGraphics_clip() {
                this.pendingClip = NORMAL_CLIP;
            },
            eoClip: function CanvasGraphics_eoClip() {
                this.pendingClip = EO_CLIP;
            },
            beginText: function CanvasGraphics_beginText() {
                this.current.textMatrix = a.IDENTITY_MATRIX;
                this.current.textMatrixScale = 1;
                this.current.x = this.current.lineX = 0;
                this.current.y = this.current.lineY = 0;
            },
            endText: function CanvasGraphics_endText() {
                const paths = this.pendingTextPaths;
                const ctx = this.ctx;
                if (paths === undefined) {
                    ctx.beginPath();
                    return;
                }
                ctx.save();
                ctx.beginPath();
                for (let i = 0; i < paths.length; i++) {
                    const path = paths[i];
                    ctx.setTransform.apply(ctx, path.transform);
                    ctx.translate(path.x, path.y);
                    path.addToPath(ctx, path.fontSize);
                }
                ctx.restore();
                ctx.clip();
                ctx.beginPath();
                delete this.pendingTextPaths;
            },
            setCharSpacing: function CanvasGraphics_setCharSpacing(spacing) {
                this.current.charSpacing = spacing;
            },
            setWordSpacing: function CanvasGraphics_setWordSpacing(spacing) {
                this.current.wordSpacing = spacing;
            },
            setHScale: function CanvasGraphics_setHScale(scale) {
                this.current.textHScale = scale / 100;
            },
            setLeading: function CanvasGraphics_setLeading(leading) {
                this.current.leading = -leading;
            },
            setFont: function CanvasGraphics_setFont(fontRefName, size) {
                const fontObj = this.commonObjs.get(fontRefName);
                const current = this.current;
                if (!fontObj) {
                    throw new Error(`Can't find font for ${ fontRefName }`);
                }
                current.fontMatrix = fontObj.fontMatrix || a.FONT_IDENTITY_MATRIX;
                if (current.fontMatrix[0] === 0 || current.fontMatrix[3] === 0) {
                    a.warn('Invalid font matrix for font ' + fontRefName);
                }
                if (size < 0) {
                    size = -size;
                    current.fontDirection = -1;
                } else {
                    current.fontDirection = 1;
                }
                this.current.font = fontObj;
                this.current.fontSize = size;
                if (fontObj.isType3Font) {
                    return;
                }
                const name = fontObj.loadedName || 'sans-serif';
                let bold = 'normal';
                if (fontObj.black) {
                    bold = '900';
                } else if (fontObj.bold) {
                    bold = 'bold';
                }
                const italic = fontObj.italic ? 'italic' : 'normal';
                const typeface = `"${ name }", ${ fontObj.fallbackName }`;
                let browserFontSize = size;
                if (size < MIN_FONT_SIZE) {
                    browserFontSize = MIN_FONT_SIZE;
                } else if (size > MAX_FONT_SIZE) {
                    browserFontSize = MAX_FONT_SIZE;
                }
                this.current.fontSizeScale = size / browserFontSize;
                this.ctx.font = `${ italic } ${ bold } ${ browserFontSize }px ${ typeface }`;
            },
            setTextRenderingMode: function CanvasGraphics_setTextRenderingMode(mode) {
                this.current.textRenderingMode = mode;
            },
            setTextRise: function CanvasGraphics_setTextRise(rise) {
                this.current.textRise = rise;
            },
            moveText: function CanvasGraphics_moveText(x, y) {
                this.current.x = this.current.lineX += x;
                this.current.y = this.current.lineY += y;
            },
            setLeadingMoveText: function CanvasGraphics_setLeadingMoveText(x, y) {
                this.setLeading(-y);
                this.moveText(x, y);
            },
            setTextMatrix: function CanvasGraphics_setTextMatrix(a, b, c, d, e, f) {
                this.current.textMatrix = [
                    a,
                    b,
                    c,
                    d,
                    e,
                    f
                ];
                this.current.textMatrixScale = Math.sqrt(a * a + b * b);
                this.current.x = this.current.lineX = 0;
                this.current.y = this.current.lineY = 0;
            },
            nextLine: function CanvasGraphics_nextLine() {
                this.moveText(0, this.current.leading);
            },
            paintChar(character, x, y, patternTransform, resetLineWidthToOne) {
                const ctx = this.ctx;
                const current = this.current;
                const font = current.font;
                const textRenderingMode = current.textRenderingMode;
                const fontSize = current.fontSize / current.fontSizeScale;
                const fillStrokeMode = textRenderingMode & a.TextRenderingMode.FILL_STROKE_MASK;
                const isAddToPathSet = !!(textRenderingMode & a.TextRenderingMode.ADD_TO_PATH_FLAG);
                const patternFill = current.patternFill && !font.missingFile;
                let addToPath;
                if (font.disableFontFace || isAddToPathSet || patternFill) {
                    addToPath = font.getPathGenerator(this.commonObjs, character);
                }
                if (font.disableFontFace || patternFill) {
                    ctx.save();
                    ctx.translate(x, y);
                    ctx.beginPath();
                    addToPath(ctx, fontSize);
                    if (patternTransform) {
                        ctx.setTransform.apply(ctx, patternTransform);
                    }
                    if (fillStrokeMode === a.TextRenderingMode.FILL || fillStrokeMode === a.TextRenderingMode.FILL_STROKE) {
                        ctx.fill();
                    }
                    if (fillStrokeMode === a.TextRenderingMode.STROKE || fillStrokeMode === a.TextRenderingMode.FILL_STROKE) {
                        if (resetLineWidthToOne) {
                            ctx.resetTransform();
                            ctx.lineWidth = Math.round(this._combinedScaleFactor);
                        }
                        ctx.stroke();
                    }
                    ctx.restore();
                } else {
                    if (fillStrokeMode === a.TextRenderingMode.FILL || fillStrokeMode === a.TextRenderingMode.FILL_STROKE) {
                        ctx.fillText(character, x, y);
                    }
                    if (fillStrokeMode === a.TextRenderingMode.STROKE || fillStrokeMode === a.TextRenderingMode.FILL_STROKE) {
                        if (resetLineWidthToOne) {
                            ctx.save();
                            ctx.moveTo(x, y);
                            ctx.resetTransform();
                            ctx.lineWidth = Math.round(this._combinedScaleFactor);
                            ctx.strokeText(character, 0, 0);
                            ctx.restore();
                        } else {
                            ctx.strokeText(character, x, y);
                        }
                    }
                }
                if (isAddToPathSet) {
                    const paths = this.pendingTextPaths || (this.pendingTextPaths = []);
                    paths.push({
                        transform: ctx.mozCurrentTransform,
                        x,
                        y,
                        fontSize,
                        addToPath
                    });
                }
            },
            get isFontSubpixelAAEnabled() {
                const {context: ctx} = this.cachedCanvases.getCanvas('isFontSubpixelAAEnabled', 10, 10);
                ctx.scale(1.5, 1);
                ctx.fillText('I', 0, 10);
                const data = ctx.getImageData(0, 0, 10, 10).data;
                let enabled = false;
                for (let i = 3; i < data.length; i += 4) {
                    if (data[i] > 0 && data[i] < 255) {
                        enabled = true;
                        break;
                    }
                }
                return a.shadow(this, 'isFontSubpixelAAEnabled', enabled);
            },
            showText: function CanvasGraphics_showText(glyphs) {
                const current = this.current;
                const font = current.font;
                if (font.isType3Font) {
                    return this.showType3Text(glyphs);
                }
                const fontSize = current.fontSize;
                if (fontSize === 0) {
                    return undefined;
                }
                const ctx = this.ctx;
                const fontSizeScale = current.fontSizeScale;
                const charSpacing = current.charSpacing;
                const wordSpacing = current.wordSpacing;
                const fontDirection = current.fontDirection;
                const textHScale = current.textHScale * fontDirection;
                const glyphsLength = glyphs.length;
                const vertical = font.vertical;
                const spacingDir = vertical ? 1 : -1;
                const defaultVMetrics = font.defaultVMetrics;
                const widthAdvanceScale = fontSize * current.fontMatrix[0];
                const simpleFillText = current.textRenderingMode === a.TextRenderingMode.FILL && !font.disableFontFace && !current.patternFill;
                ctx.save();
                let patternTransform;
                if (current.patternFill) {
                    ctx.save();
                    const pattern = current.fillColor.getPattern(ctx, this);
                    patternTransform = ctx.mozCurrentTransform;
                    ctx.restore();
                    ctx.fillStyle = pattern;
                }
                ctx.transform.apply(ctx, current.textMatrix);
                ctx.translate(current.x, current.y + current.textRise);
                if (fontDirection > 0) {
                    ctx.scale(textHScale, -1);
                } else {
                    ctx.scale(textHScale, 1);
                }
                let lineWidth = current.lineWidth;
                let resetLineWidthToOne = false;
                const scale = current.textMatrixScale;
                if (scale === 0 || lineWidth === 0) {
                    const fillStrokeMode = current.textRenderingMode & a.TextRenderingMode.FILL_STROKE_MASK;
                    if (fillStrokeMode === a.TextRenderingMode.STROKE || fillStrokeMode === a.TextRenderingMode.FILL_STROKE) {
                        this._cachedGetSinglePixelWidth = null;
                        lineWidth = this.getSinglePixelWidth();
                        resetLineWidthToOne = lineWidth < 0;
                    }
                } else {
                    lineWidth /= scale;
                }
                if (fontSizeScale !== 1) {
                    ctx.scale(fontSizeScale, fontSizeScale);
                    lineWidth /= fontSizeScale;
                }
                ctx.lineWidth = lineWidth;
                let x = 0, i;
                for (i = 0; i < glyphsLength; ++i) {
                    const glyph = glyphs[i];
                    if (a.isNum(glyph)) {
                        x += spacingDir * glyph * fontSize / 1000;
                        continue;
                    }
                    let restoreNeeded = false;
                    const spacing = (glyph.isSpace ? wordSpacing : 0) + charSpacing;
                    const character = glyph.fontChar;
                    const accent = glyph.accent;
                    let scaledX, scaledY;
                    let width = glyph.width;
                    if (vertical) {
                        const vmetric = glyph.vmetric || defaultVMetrics;
                        const vx = -(glyph.vmetric ? vmetric[1] : width * 0.5) * widthAdvanceScale;
                        const vy = vmetric[2] * widthAdvanceScale;
                        width = vmetric ? -vmetric[0] : width;
                        scaledX = vx / fontSizeScale;
                        scaledY = (x + vy) / fontSizeScale;
                    } else {
                        scaledX = x / fontSizeScale;
                        scaledY = 0;
                    }
                    if (font.remeasure && width > 0) {
                        const measuredWidth = ctx.measureText(character).width * 1000 / fontSize * fontSizeScale;
                        if (width < measuredWidth && this.isFontSubpixelAAEnabled) {
                            const characterScaleX = width / measuredWidth;
                            restoreNeeded = true;
                            ctx.save();
                            ctx.scale(characterScaleX, 1);
                            scaledX /= characterScaleX;
                        } else if (width !== measuredWidth) {
                            scaledX += (width - measuredWidth) / 2000 * fontSize / fontSizeScale;
                        }
                    }
                    if (this.contentVisible && (glyph.isInFont || font.missingFile)) {
                        if (simpleFillText && !accent) {
                            ctx.fillText(character, scaledX, scaledY);
                        } else {
                            this.paintChar(character, scaledX, scaledY, patternTransform, resetLineWidthToOne);
                            if (accent) {
                                const scaledAccentX = scaledX + fontSize * accent.offset.x / fontSizeScale;
                                const scaledAccentY = scaledY - fontSize * accent.offset.y / fontSizeScale;
                                this.paintChar(accent.fontChar, scaledAccentX, scaledAccentY, patternTransform, resetLineWidthToOne);
                            }
                        }
                    }
                    let charWidth;
                    if (vertical) {
                        charWidth = width * widthAdvanceScale - spacing * fontDirection;
                    } else {
                        charWidth = width * widthAdvanceScale + spacing * fontDirection;
                    }
                    x += charWidth;
                    if (restoreNeeded) {
                        ctx.restore();
                    }
                }
                if (vertical) {
                    current.y -= x;
                } else {
                    current.x += x * textHScale;
                }
                ctx.restore();
            },
            showType3Text: function CanvasGraphics_showType3Text(glyphs) {
                const ctx = this.ctx;
                const current = this.current;
                const font = current.font;
                const fontSize = current.fontSize;
                const fontDirection = current.fontDirection;
                const spacingDir = font.vertical ? 1 : -1;
                const charSpacing = current.charSpacing;
                const wordSpacing = current.wordSpacing;
                const textHScale = current.textHScale * fontDirection;
                const fontMatrix = current.fontMatrix || a.FONT_IDENTITY_MATRIX;
                const glyphsLength = glyphs.length;
                const isTextInvisible = current.textRenderingMode === a.TextRenderingMode.INVISIBLE;
                let i, glyph, width, spacingLength;
                if (isTextInvisible || fontSize === 0) {
                    return;
                }
                this._cachedGetSinglePixelWidth = null;
                ctx.save();
                ctx.transform.apply(ctx, current.textMatrix);
                ctx.translate(current.x, current.y);
                ctx.scale(textHScale, fontDirection);
                for (i = 0; i < glyphsLength; ++i) {
                    glyph = glyphs[i];
                    if (a.isNum(glyph)) {
                        spacingLength = spacingDir * glyph * fontSize / 1000;
                        this.ctx.translate(spacingLength, 0);
                        current.x += spacingLength * textHScale;
                        continue;
                    }
                    const spacing = (glyph.isSpace ? wordSpacing : 0) + charSpacing;
                    const operatorList = font.charProcOperatorList[glyph.operatorListId];
                    if (!operatorList) {
                        a.warn(`Type3 character "${ glyph.operatorListId }" is not available.`);
                        continue;
                    }
                    if (this.contentVisible) {
                        this.processingType3 = glyph;
                        this.save();
                        ctx.scale(fontSize, fontSize);
                        ctx.transform.apply(ctx, fontMatrix);
                        this.executeOperatorList(operatorList);
                        this.restore();
                    }
                    const transformed = a.Util.applyTransform([
                        glyph.width,
                        0
                    ], fontMatrix);
                    width = transformed[0] * fontSize + spacing;
                    ctx.translate(width, 0);
                    current.x += width * textHScale;
                }
                ctx.restore();
                this.processingType3 = null;
            },
            setCharWidth: function CanvasGraphics_setCharWidth(xWidth, yWidth) {
            },
            setCharWidthAndBounds: function CanvasGraphics_setCharWidthAndBounds(xWidth, yWidth, llx, lly, urx, ury) {
                this.ctx.rect(llx, lly, urx - llx, ury - lly);
                this.clip();
                this.endPath();
            },
            getColorN_Pattern: function CanvasGraphics_getColorN_Pattern(IR) {
                let pattern;
                if (IR[0] === 'TilingPattern') {
                    const color = IR[1];
                    const baseTransform = this.baseTransform || this.ctx.mozCurrentTransform.slice();
                    const canvasGraphicsFactory = {
                        createCanvasGraphics: ctx => {
                            return new CanvasGraphics(ctx, this.commonObjs, this.objs, this.canvasFactory, this.webGLContext);
                        }
                    };
                    pattern = new b.TilingPattern(IR, color, this.ctx, canvasGraphicsFactory, baseTransform);
                } else {
                    pattern = b.getShadingPatternFromIR(IR);
                }
                return pattern;
            },
            setStrokeColorN: function CanvasGraphics_setStrokeColorN() {
                this.current.strokeColor = this.getColorN_Pattern(arguments);
            },
            setFillColorN: function CanvasGraphics_setFillColorN() {
                this.current.fillColor = this.getColorN_Pattern(arguments);
                this.current.patternFill = true;
            },
            setStrokeRGBColor: function CanvasGraphics_setStrokeRGBColor(r, g, b) {
                const color = a.Util.makeHexColor(r, g, b);
                this.ctx.strokeStyle = color;
                this.current.strokeColor = color;
            },
            setFillRGBColor: function CanvasGraphics_setFillRGBColor(r, g, b) {
                const color = a.Util.makeHexColor(r, g, b);
                this.ctx.fillStyle = color;
                this.current.fillColor = color;
                this.current.patternFill = false;
            },
            shadingFill: function CanvasGraphics_shadingFill(patternIR) {
                if (!this.contentVisible) {
                    return;
                }
                const ctx = this.ctx;
                this.save();
                const pattern = b.getShadingPatternFromIR(patternIR);
                ctx.fillStyle = pattern.getPattern(ctx, this, true);
                const inv = ctx.mozCurrentTransformInverse;
                if (inv) {
                    const canvas = ctx.canvas;
                    const width = canvas.width;
                    const height = canvas.height;
                    const bl = a.Util.applyTransform([
                        0,
                        0
                    ], inv);
                    const br = a.Util.applyTransform([
                        0,
                        height
                    ], inv);
                    const ul = a.Util.applyTransform([
                        width,
                        0
                    ], inv);
                    const ur = a.Util.applyTransform([
                        width,
                        height
                    ], inv);
                    const x0 = Math.min(bl[0], br[0], ul[0], ur[0]);
                    const y0 = Math.min(bl[1], br[1], ul[1], ur[1]);
                    const x1 = Math.max(bl[0], br[0], ul[0], ur[0]);
                    const y1 = Math.max(bl[1], br[1], ul[1], ur[1]);
                    this.ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
                } else {
                    this.ctx.fillRect(-10000000000, -10000000000, 20000000000, 20000000000);
                }
                this.restore();
            },
            beginInlineImage: function CanvasGraphics_beginInlineImage() {
                a.unreachable('Should not call beginInlineImage');
            },
            beginImageData: function CanvasGraphics_beginImageData() {
                a.unreachable('Should not call beginImageData');
            },
            paintFormXObjectBegin: function CanvasGraphics_paintFormXObjectBegin(matrix, bbox) {
                if (!this.contentVisible) {
                    return;
                }
                this.save();
                this.baseTransformStack.push(this.baseTransform);
                if (Array.isArray(matrix) && matrix.length === 6) {
                    this.transform.apply(this, matrix);
                }
                this.baseTransform = this.ctx.mozCurrentTransform;
                if (bbox) {
                    const width = bbox[2] - bbox[0];
                    const height = bbox[3] - bbox[1];
                    this.ctx.rect(bbox[0], bbox[1], width, height);
                    this.clip();
                    this.endPath();
                }
            },
            paintFormXObjectEnd: function CanvasGraphics_paintFormXObjectEnd() {
                if (!this.contentVisible) {
                    return;
                }
                this.restore();
                this.baseTransform = this.baseTransformStack.pop();
            },
            beginGroup: function CanvasGraphics_beginGroup(group) {
                if (!this.contentVisible) {
                    return;
                }
                this.save();
                const currentCtx = this.ctx;
                if (!group.isolated) {
                    a.info('TODO: Support non-isolated groups.');
                }
                if (group.knockout) {
                    a.warn('Knockout groups not supported.');
                }
                const currentTransform = currentCtx.mozCurrentTransform;
                if (group.matrix) {
                    currentCtx.transform.apply(currentCtx, group.matrix);
                }
                if (!group.bbox) {
                    throw new Error('Bounding box is required.');
                }
                let bounds = a.Util.getAxialAlignedBoundingBox(group.bbox, currentCtx.mozCurrentTransform);
                const canvasBounds = [
                    0,
                    0,
                    currentCtx.canvas.width,
                    currentCtx.canvas.height
                ];
                bounds = a.Util.intersect(bounds, canvasBounds) || [
                    0,
                    0,
                    0,
                    0
                ];
                const offsetX = Math.floor(bounds[0]);
                const offsetY = Math.floor(bounds[1]);
                let drawnWidth = Math.max(Math.ceil(bounds[2]) - offsetX, 1);
                let drawnHeight = Math.max(Math.ceil(bounds[3]) - offsetY, 1);
                let scaleX = 1, scaleY = 1;
                if (drawnWidth > MAX_GROUP_SIZE) {
                    scaleX = drawnWidth / MAX_GROUP_SIZE;
                    drawnWidth = MAX_GROUP_SIZE;
                }
                if (drawnHeight > MAX_GROUP_SIZE) {
                    scaleY = drawnHeight / MAX_GROUP_SIZE;
                    drawnHeight = MAX_GROUP_SIZE;
                }
                let cacheId = 'groupAt' + this.groupLevel;
                if (group.smask) {
                    cacheId += '_smask_' + this.smaskCounter++ % 2;
                }
                const scratchCanvas = this.cachedCanvases.getCanvas(cacheId, drawnWidth, drawnHeight, true);
                const groupCtx = scratchCanvas.context;
                groupCtx.scale(1 / scaleX, 1 / scaleY);
                groupCtx.translate(-offsetX, -offsetY);
                groupCtx.transform.apply(groupCtx, currentTransform);
                if (group.smask) {
                    this.smaskStack.push({
                        canvas: scratchCanvas.canvas,
                        context: groupCtx,
                        offsetX,
                        offsetY,
                        scaleX,
                        scaleY,
                        subtype: group.smask.subtype,
                        backdrop: group.smask.backdrop,
                        transferMap: group.smask.transferMap || null,
                        startTransformInverse: null
                    });
                } else {
                    currentCtx.setTransform(1, 0, 0, 1, 0, 0);
                    currentCtx.translate(offsetX, offsetY);
                    currentCtx.scale(scaleX, scaleY);
                }
                copyCtxState(currentCtx, groupCtx);
                this.ctx = groupCtx;
                this.setGState([
                    [
                        'BM',
                        'source-over'
                    ],
                    [
                        'ca',
                        1
                    ],
                    [
                        'CA',
                        1
                    ]
                ]);
                this.groupStack.push(currentCtx);
                this.groupLevel++;
                this.current.activeSMask = null;
            },
            endGroup: function CanvasGraphics_endGroup(group) {
                if (!this.contentVisible) {
                    return;
                }
                this.groupLevel--;
                const groupCtx = this.ctx;
                this.ctx = this.groupStack.pop();
                if (this.ctx.imageSmoothingEnabled !== undefined) {
                    this.ctx.imageSmoothingEnabled = false;
                } else {
                    this.ctx.mozImageSmoothingEnabled = false;
                }
                if (group.smask) {
                    this.tempSMask = this.smaskStack.pop();
                } else {
                    this.ctx.drawImage(groupCtx.canvas, 0, 0);
                }
                this.restore();
            },
            beginAnnotations: function CanvasGraphics_beginAnnotations() {
                this.save();
                if (this.baseTransform) {
                    this.ctx.setTransform.apply(this.ctx, this.baseTransform);
                }
            },
            endAnnotations: function CanvasGraphics_endAnnotations() {
                this.restore();
            },
            beginAnnotation: function CanvasGraphics_beginAnnotation(rect, transform, matrix) {
                this.save();
                resetCtxToDefault(this.ctx);
                this.current = new CanvasExtraState();
                if (Array.isArray(rect) && rect.length === 4) {
                    const width = rect[2] - rect[0];
                    const height = rect[3] - rect[1];
                    this.ctx.rect(rect[0], rect[1], width, height);
                    this.clip();
                    this.endPath();
                }
                this.transform.apply(this, transform);
                this.transform.apply(this, matrix);
            },
            endAnnotation: function CanvasGraphics_endAnnotation() {
                this.restore();
            },
            paintImageMaskXObject: function CanvasGraphics_paintImageMaskXObject(img) {
                if (!this.contentVisible) {
                    return;
                }
                const ctx = this.ctx;
                const width = img.width, height = img.height;
                const fillColor = this.current.fillColor;
                const isPatternFill = this.current.patternFill;
                const glyph = this.processingType3;
                if (COMPILE_TYPE3_GLYPHS && glyph && glyph.compiled === undefined) {
                    if (width <= MAX_SIZE_TO_COMPILE && height <= MAX_SIZE_TO_COMPILE) {
                        glyph.compiled = compileType3Glyph({
                            data: img.data,
                            width,
                            height
                        });
                    } else {
                        glyph.compiled = null;
                    }
                }
                if (glyph && glyph.compiled) {
                    glyph.compiled(ctx);
                    return;
                }
                const maskCanvas = this.cachedCanvases.getCanvas('maskCanvas', width, height);
                const maskCtx = maskCanvas.context;
                maskCtx.save();
                putBinaryImageMask(maskCtx, img);
                maskCtx.globalCompositeOperation = 'source-in';
                maskCtx.fillStyle = isPatternFill ? fillColor.getPattern(maskCtx, this) : fillColor;
                maskCtx.fillRect(0, 0, width, height);
                maskCtx.restore();
                this.paintInlineImageXObject(maskCanvas.canvas);
            },
            paintImageMaskXObjectRepeat(imgData, scaleX, skewX = 0, skewY = 0, scaleY, positions) {
                if (!this.contentVisible) {
                    return;
                }
                const width = imgData.width;
                const height = imgData.height;
                const fillColor = this.current.fillColor;
                const isPatternFill = this.current.patternFill;
                const maskCanvas = this.cachedCanvases.getCanvas('maskCanvas', width, height);
                const maskCtx = maskCanvas.context;
                maskCtx.save();
                putBinaryImageMask(maskCtx, imgData);
                maskCtx.globalCompositeOperation = 'source-in';
                maskCtx.fillStyle = isPatternFill ? fillColor.getPattern(maskCtx, this) : fillColor;
                maskCtx.fillRect(0, 0, width, height);
                maskCtx.restore();
                const ctx = this.ctx;
                for (let i = 0, ii = positions.length; i < ii; i += 2) {
                    ctx.save();
                    ctx.transform(scaleX, skewX, skewY, scaleY, positions[i], positions[i + 1]);
                    ctx.scale(1, -1);
                    ctx.drawImage(maskCanvas.canvas, 0, 0, width, height, 0, -1, 1, 1);
                    ctx.restore();
                }
            },
            paintImageMaskXObjectGroup: function CanvasGraphics_paintImageMaskXObjectGroup(images) {
                if (!this.contentVisible) {
                    return;
                }
                const ctx = this.ctx;
                const fillColor = this.current.fillColor;
                const isPatternFill = this.current.patternFill;
                for (let i = 0, ii = images.length; i < ii; i++) {
                    const image = images[i];
                    const width = image.width, height = image.height;
                    const maskCanvas = this.cachedCanvases.getCanvas('maskCanvas', width, height);
                    const maskCtx = maskCanvas.context;
                    maskCtx.save();
                    putBinaryImageMask(maskCtx, image);
                    maskCtx.globalCompositeOperation = 'source-in';
                    maskCtx.fillStyle = isPatternFill ? fillColor.getPattern(maskCtx, this) : fillColor;
                    maskCtx.fillRect(0, 0, width, height);
                    maskCtx.restore();
                    ctx.save();
                    ctx.transform.apply(ctx, image.transform);
                    ctx.scale(1, -1);
                    ctx.drawImage(maskCanvas.canvas, 0, 0, width, height, 0, -1, 1, 1);
                    ctx.restore();
                }
            },
            paintImageXObject: function CanvasGraphics_paintImageXObject(objId) {
                if (!this.contentVisible) {
                    return;
                }
                const imgData = objId.startsWith('g_') ? this.commonObjs.get(objId) : this.objs.get(objId);
                if (!imgData) {
                    a.warn("Dependent image isn't ready yet");
                    return;
                }
                this.paintInlineImageXObject(imgData);
            },
            paintImageXObjectRepeat: function CanvasGraphics_paintImageXObjectRepeat(objId, scaleX, scaleY, positions) {
                if (!this.contentVisible) {
                    return;
                }
                const imgData = objId.startsWith('g_') ? this.commonObjs.get(objId) : this.objs.get(objId);
                if (!imgData) {
                    a.warn("Dependent image isn't ready yet");
                    return;
                }
                const width = imgData.width;
                const height = imgData.height;
                const map = [];
                for (let i = 0, ii = positions.length; i < ii; i += 2) {
                    map.push({
                        transform: [
                            scaleX,
                            0,
                            0,
                            scaleY,
                            positions[i],
                            positions[i + 1]
                        ],
                        x: 0,
                        y: 0,
                        w: width,
                        h: height
                    });
                }
                this.paintInlineImageXObjectGroup(imgData, map);
            },
            paintInlineImageXObject: function CanvasGraphics_paintInlineImageXObject(imgData) {
                if (!this.contentVisible) {
                    return;
                }
                const width = imgData.width;
                const height = imgData.height;
                const ctx = this.ctx;
                this.save();
                ctx.scale(1 / width, -1 / height);
                const currentTransform = ctx.mozCurrentTransformInverse;
                const a = currentTransform[0], b = currentTransform[1];
                let widthScale = Math.max(Math.sqrt(a * a + b * b), 1);
                const c = currentTransform[2], d = currentTransform[3];
                let heightScale = Math.max(Math.sqrt(c * c + d * d), 1);
                let imgToPaint, tmpCanvas, tmpCtx;
                if (typeof HTMLElement === 'function' && imgData instanceof HTMLElement || !imgData.data) {
                    imgToPaint = imgData;
                } else {
                    tmpCanvas = this.cachedCanvases.getCanvas('inlineImage', width, height);
                    tmpCtx = tmpCanvas.context;
                    putBinaryImageData(tmpCtx, imgData, this.current.transferMaps);
                    imgToPaint = tmpCanvas.canvas;
                }
                let paintWidth = width, paintHeight = height;
                let tmpCanvasId = 'prescale1';
                while (widthScale > 2 && paintWidth > 1 || heightScale > 2 && paintHeight > 1) {
                    let newWidth = paintWidth, newHeight = paintHeight;
                    if (widthScale > 2 && paintWidth > 1) {
                        newWidth = Math.ceil(paintWidth / 2);
                        widthScale /= paintWidth / newWidth;
                    }
                    if (heightScale > 2 && paintHeight > 1) {
                        newHeight = Math.ceil(paintHeight / 2);
                        heightScale /= paintHeight / newHeight;
                    }
                    tmpCanvas = this.cachedCanvases.getCanvas(tmpCanvasId, newWidth, newHeight);
                    tmpCtx = tmpCanvas.context;
                    tmpCtx.clearRect(0, 0, newWidth, newHeight);
                    tmpCtx.drawImage(imgToPaint, 0, 0, paintWidth, paintHeight, 0, 0, newWidth, newHeight);
                    imgToPaint = tmpCanvas.canvas;
                    paintWidth = newWidth;
                    paintHeight = newHeight;
                    tmpCanvasId = tmpCanvasId === 'prescale1' ? 'prescale2' : 'prescale1';
                }
                ctx.drawImage(imgToPaint, 0, 0, paintWidth, paintHeight, 0, -height, width, height);
                if (this.imageLayer) {
                    const position = this.getCanvasPosition(0, -height);
                    this.imageLayer.appendImage({
                        imgData,
                        left: position[0],
                        top: position[1],
                        width: width / currentTransform[0],
                        height: height / currentTransform[3]
                    });
                }
                this.restore();
            },
            paintInlineImageXObjectGroup: function CanvasGraphics_paintInlineImageXObjectGroup(imgData, map) {
                if (!this.contentVisible) {
                    return;
                }
                const ctx = this.ctx;
                const w = imgData.width;
                const h = imgData.height;
                const tmpCanvas = this.cachedCanvases.getCanvas('inlineImage', w, h);
                const tmpCtx = tmpCanvas.context;
                putBinaryImageData(tmpCtx, imgData, this.current.transferMaps);
                for (let i = 0, ii = map.length; i < ii; i++) {
                    const entry = map[i];
                    ctx.save();
                    ctx.transform.apply(ctx, entry.transform);
                    ctx.scale(1, -1);
                    ctx.drawImage(tmpCanvas.canvas, entry.x, entry.y, entry.w, entry.h, 0, -1, 1, 1);
                    if (this.imageLayer) {
                        const position = this.getCanvasPosition(entry.x, entry.y);
                        this.imageLayer.appendImage({
                            imgData,
                            left: position[0],
                            top: position[1],
                            width: w,
                            height: h
                        });
                    }
                    ctx.restore();
                }
            },
            paintSolidColorImageMask: function CanvasGraphics_paintSolidColorImageMask() {
                if (!this.contentVisible) {
                    return;
                }
                this.ctx.fillRect(0, 0, 1, 1);
            },
            markPoint: function CanvasGraphics_markPoint(tag) {
            },
            markPointProps: function CanvasGraphics_markPointProps(tag, properties) {
            },
            beginMarkedContent: function CanvasGraphics_beginMarkedContent(tag) {
                this.markedContentStack.push({ visible: true });
            },
            beginMarkedContentProps: function CanvasGraphics_beginMarkedContentProps(tag, properties) {
                if (tag === 'OC') {
                    this.markedContentStack.push({ visible: this.optionalContentConfig.isVisible(properties) });
                } else {
                    this.markedContentStack.push({ visible: true });
                }
                this.contentVisible = this.isContentVisible();
            },
            endMarkedContent: function CanvasGraphics_endMarkedContent() {
                this.markedContentStack.pop();
                this.contentVisible = this.isContentVisible();
            },
            beginCompat: function CanvasGraphics_beginCompat() {
            },
            endCompat: function CanvasGraphics_endCompat() {
            },
            consumePath: function CanvasGraphics_consumePath() {
                const ctx = this.ctx;
                if (this.pendingClip) {
                    if (this.pendingClip === EO_CLIP) {
                        ctx.clip('evenodd');
                    } else {
                        ctx.clip();
                    }
                    this.pendingClip = null;
                }
                ctx.beginPath();
            },
            getSinglePixelWidth() {
                if (this._cachedGetSinglePixelWidth === null) {
                    const m = this.ctx.mozCurrentTransform;
                    const absDet = Math.abs(m[0] * m[3] - m[2] * m[1]);
                    const sqNorm1 = m[0] ** 2 + m[2] ** 2;
                    const sqNorm2 = m[1] ** 2 + m[3] ** 2;
                    const pixelHeight = Math.sqrt(Math.max(sqNorm1, sqNorm2)) / absDet;
                    if (sqNorm1 !== sqNorm2 && this._combinedScaleFactor * pixelHeight > 1) {
                        this._cachedGetSinglePixelWidth = -(this._combinedScaleFactor * pixelHeight);
                    } else if (absDet > Number.EPSILON) {
                        this._cachedGetSinglePixelWidth = pixelHeight * 1.0000001;
                    } else {
                        this._cachedGetSinglePixelWidth = 1;
                    }
                }
                return this._cachedGetSinglePixelWidth;
            },
            getCanvasPosition: function CanvasGraphics_getCanvasPosition(x, y) {
                const transform = this.ctx.mozCurrentTransform;
                return [
                    transform[0] * x + transform[2] * y + transform[4],
                    transform[1] * x + transform[3] * y + transform[5]
                ];
            },
            isContentVisible: function CanvasGraphics_isContentVisible() {
                for (let i = this.markedContentStack.length - 1; i >= 0; i--) {
                    if (!this.markedContentStack[i].visible) {
                        return false;
                    }
                }
                return true;
            }
        };
        for (const op in a.OPS) {
            CanvasGraphics.prototype[a.OPS[op]] = CanvasGraphics.prototype[op];
        }
        return CanvasGraphics;
    }();
    return { CanvasGraphics };
});
define([
    '../shared/util.js',
    './primitives.js',
    './colorspace.js',
    './stream.js',
    './jpeg_stream.js',
    './jpx.js'
], function (a, b, c, d, e, f) {
    'use strict';
    function decodeAndClamp(value, addend, coefficient, max) {
        value = addend + value * coefficient;
        if (value < 0) {
            value = 0;
        } else if (value > max) {
            value = max;
        }
        return value;
    }
    function resizeImageMask(src, bpc, w1, h1, w2, h2) {
        var length = w2 * h2;
        let dest;
        if (bpc <= 8) {
            dest = new Uint8Array(length);
        } else if (bpc <= 16) {
            dest = new Uint16Array(length);
        } else {
            dest = new Uint32Array(length);
        }
        var xRatio = w1 / w2;
        var yRatio = h1 / h2;
        var i, j, py, newIndex = 0, oldIndex;
        var xScaled = new Uint16Array(w2);
        var w1Scanline = w1;
        for (i = 0; i < w2; i++) {
            xScaled[i] = Math.floor(i * xRatio);
        }
        for (i = 0; i < h2; i++) {
            py = Math.floor(i * yRatio) * w1Scanline;
            for (j = 0; j < w2; j++) {
                oldIndex = py + xScaled[j];
                dest[newIndex++] = src[oldIndex];
            }
        }
        return dest;
    }
    class PDFImage {
        constructor({xref, res, image, isInline = false, smask = null, mask = null, isMask = false, pdfFunctionFactory, localColorSpaceCache}) {
            this.image = image;
            var dict = image.dict;
            const filter = dict.get('Filter');
            if (b.isName(filter)) {
                switch (filter.name) {
                case 'JPXDecode':
                    var jpxImage = new f.JpxImage();
                    jpxImage.parseImageProperties(image.stream);
                    image.stream.reset();
                    image.width = jpxImage.width;
                    image.height = jpxImage.height;
                    image.bitsPerComponent = jpxImage.bitsPerComponent;
                    image.numComps = jpxImage.componentsCount;
                    break;
                case 'JBIG2Decode':
                    image.bitsPerComponent = 1;
                    image.numComps = 1;
                    break;
                }
            }
            let width = dict.get('Width', 'W');
            let height = dict.get('Height', 'H');
            if (Number.isInteger(image.width) && image.width > 0 && Number.isInteger(image.height) && image.height > 0 && (image.width !== width || image.height !== height)) {
                a.warn('PDFImage - using the Width/Height of the image data, ' + 'rather than the image dictionary.');
                width = image.width;
                height = image.height;
            }
            if (width < 1 || height < 1) {
                throw new a.FormatError(`Invalid image width: ${ width } or height: ${ height }`);
            }
            this.width = width;
            this.height = height;
            this.interpolate = dict.get('Interpolate', 'I') || false;
            this.imageMask = dict.get('ImageMask', 'IM') || false;
            this.matte = dict.get('Matte') || false;
            var bitsPerComponent = image.bitsPerComponent;
            if (!bitsPerComponent) {
                bitsPerComponent = dict.get('BitsPerComponent', 'BPC');
                if (!bitsPerComponent) {
                    if (this.imageMask) {
                        bitsPerComponent = 1;
                    } else {
                        throw new a.FormatError(`Bits per component missing in image: ${ this.imageMask }`);
                    }
                }
            }
            this.bpc = bitsPerComponent;
            if (!this.imageMask) {
                let colorSpace = dict.getRaw('ColorSpace') || dict.getRaw('CS');
                if (!colorSpace) {
                    a.info('JPX images (which do not require color spaces)');
                    switch (image.numComps) {
                    case 1:
                        colorSpace = b.Name.get('DeviceGray');
                        break;
                    case 3:
                        colorSpace = b.Name.get('DeviceRGB');
                        break;
                    case 4:
                        colorSpace = b.Name.get('DeviceCMYK');
                        break;
                    default:
                        throw new Error(`JPX images with ${ image.numComps } ` + 'color components not supported.');
                    }
                }
                this.colorSpace = c.ColorSpace.parse({
                    cs: colorSpace,
                    xref,
                    resources: isInline ? res : null,
                    pdfFunctionFactory,
                    localColorSpaceCache
                });
                this.numComps = this.colorSpace.numComps;
            }
            this.decode = dict.getArray('Decode', 'D');
            this.needsDecode = false;
            if (this.decode && (this.colorSpace && !this.colorSpace.isDefaultDecode(this.decode, bitsPerComponent) || isMask && !c.ColorSpace.isDefaultDecode(this.decode, 1))) {
                this.needsDecode = true;
                var max = (1 << bitsPerComponent) - 1;
                this.decodeCoefficients = [];
                this.decodeAddends = [];
                const isIndexed = this.colorSpace && this.colorSpace.name === 'Indexed';
                for (var i = 0, j = 0; i < this.decode.length; i += 2, ++j) {
                    var dmin = this.decode[i];
                    var dmax = this.decode[i + 1];
                    this.decodeCoefficients[j] = isIndexed ? (dmax - dmin) / max : dmax - dmin;
                    this.decodeAddends[j] = isIndexed ? dmin : max * dmin;
                }
            }
            if (smask) {
                this.smask = new PDFImage({
                    xref,
                    res,
                    image: smask,
                    isInline,
                    pdfFunctionFactory,
                    localColorSpaceCache
                });
            } else if (mask) {
                if (b.isStream(mask)) {
                    var maskDict = mask.dict, imageMask = maskDict.get('ImageMask', 'IM');
                    if (!imageMask) {
                        a.warn('Ignoring /Mask in image without /ImageMask.');
                    } else {
                        this.mask = new PDFImage({
                            xref,
                            res,
                            image: mask,
                            isInline,
                            isMask: true,
                            pdfFunctionFactory,
                            localColorSpaceCache
                        });
                    }
                } else {
                    this.mask = mask;
                }
            }
        }
        static async buildImage({xref, res, image, isInline = false, pdfFunctionFactory, localColorSpaceCache}) {
            const imageData = image;
            let smaskData = null;
            let maskData = null;
            const smask = image.dict.get('SMask');
            const mask = image.dict.get('Mask');
            if (smask) {
                smaskData = smask;
            } else if (mask) {
                if (b.isStream(mask) || Array.isArray(mask)) {
                    maskData = mask;
                } else {
                    a.warn('Unsupported mask format.');
                }
            }
            return new PDFImage({
                xref,
                res,
                image: imageData,
                isInline,
                smask: smaskData,
                mask: maskData,
                pdfFunctionFactory,
                localColorSpaceCache
            });
        }
        static createMask({imgArray, width, height, imageIsFromDecodeStream, inverseDecode}) {
            if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('!PRODUCTION || TESTING')) {
                a.assert(imgArray instanceof Uint8ClampedArray, 'PDFImage.createMask: Unsupported "imgArray" type.');
            }
            var computedLength = (width + 7 >> 3) * height;
            var actualLength = imgArray.byteLength;
            var haveFullData = computedLength === actualLength;
            var data, i;
            if (imageIsFromDecodeStream && (!inverseDecode || haveFullData)) {
                data = imgArray;
            } else if (!inverseDecode) {
                data = new Uint8ClampedArray(actualLength);
                data.set(imgArray);
            } else {
                data = new Uint8ClampedArray(computedLength);
                data.set(imgArray);
                for (i = actualLength; i < computedLength; i++) {
                    data[i] = 255;
                }
            }
            if (inverseDecode) {
                for (i = 0; i < actualLength; i++) {
                    data[i] ^= 255;
                }
            }
            return {
                data,
                width,
                height
            };
        }
        get drawWidth() {
            return Math.max(this.width, this.smask && this.smask.width || 0, this.mask && this.mask.width || 0);
        }
        get drawHeight() {
            return Math.max(this.height, this.smask && this.smask.height || 0, this.mask && this.mask.height || 0);
        }
        decodeBuffer(buffer) {
            var bpc = this.bpc;
            var numComps = this.numComps;
            var decodeAddends = this.decodeAddends;
            var decodeCoefficients = this.decodeCoefficients;
            var max = (1 << bpc) - 1;
            var i, ii;
            if (bpc === 1) {
                for (i = 0, ii = buffer.length; i < ii; i++) {
                    buffer[i] = +!buffer[i];
                }
                return;
            }
            var index = 0;
            for (i = 0, ii = this.width * this.height; i < ii; i++) {
                for (var j = 0; j < numComps; j++) {
                    buffer[index] = decodeAndClamp(buffer[index], decodeAddends[j], decodeCoefficients[j], max);
                    index++;
                }
            }
        }
        getComponents(buffer) {
            var bpc = this.bpc;
            if (bpc === 8) {
                return buffer;
            }
            var width = this.width;
            var height = this.height;
            var numComps = this.numComps;
            var length = width * height * numComps;
            var bufferPos = 0;
            let output;
            if (bpc <= 8) {
                output = new Uint8Array(length);
            } else if (bpc <= 16) {
                output = new Uint16Array(length);
            } else {
                output = new Uint32Array(length);
            }
            var rowComps = width * numComps;
            var max = (1 << bpc) - 1;
            var i = 0, ii, buf;
            if (bpc === 1) {
                var mask, loop1End, loop2End;
                for (var j = 0; j < height; j++) {
                    loop1End = i + (rowComps & ~7);
                    loop2End = i + rowComps;
                    while (i < loop1End) {
                        buf = buffer[bufferPos++];
                        output[i] = buf >> 7 & 1;
                        output[i + 1] = buf >> 6 & 1;
                        output[i + 2] = buf >> 5 & 1;
                        output[i + 3] = buf >> 4 & 1;
                        output[i + 4] = buf >> 3 & 1;
                        output[i + 5] = buf >> 2 & 1;
                        output[i + 6] = buf >> 1 & 1;
                        output[i + 7] = buf & 1;
                        i += 8;
                    }
                    if (i < loop2End) {
                        buf = buffer[bufferPos++];
                        mask = 128;
                        while (i < loop2End) {
                            output[i++] = +!!(buf & mask);
                            mask >>= 1;
                        }
                    }
                }
            } else {
                var bits = 0;
                buf = 0;
                for (i = 0, ii = length; i < ii; ++i) {
                    if (i % rowComps === 0) {
                        buf = 0;
                        bits = 0;
                    }
                    while (bits < bpc) {
                        buf = buf << 8 | buffer[bufferPos++];
                        bits += 8;
                    }
                    var remainingBits = bits - bpc;
                    let value = buf >> remainingBits;
                    if (value < 0) {
                        value = 0;
                    } else if (value > max) {
                        value = max;
                    }
                    output[i] = value;
                    buf = buf & (1 << remainingBits) - 1;
                    bits = remainingBits;
                }
            }
            return output;
        }
        fillOpacity(rgbaBuf, width, height, actualHeight, image) {
            if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('!PRODUCTION || TESTING')) {
                a.assert(rgbaBuf instanceof Uint8ClampedArray, 'PDFImage.fillOpacity: Unsupported "rgbaBuf" type.');
            }
            var smask = this.smask;
            var mask = this.mask;
            var alphaBuf, sw, sh, i, ii, j;
            if (smask) {
                sw = smask.width;
                sh = smask.height;
                alphaBuf = new Uint8ClampedArray(sw * sh);
                smask.fillGrayBuffer(alphaBuf);
                if (sw !== width || sh !== height) {
                    alphaBuf = resizeImageMask(alphaBuf, smask.bpc, sw, sh, width, height);
                }
            } else if (mask) {
                if (mask instanceof PDFImage) {
                    sw = mask.width;
                    sh = mask.height;
                    alphaBuf = new Uint8ClampedArray(sw * sh);
                    mask.numComps = 1;
                    mask.fillGrayBuffer(alphaBuf);
                    for (i = 0, ii = sw * sh; i < ii; ++i) {
                        alphaBuf[i] = 255 - alphaBuf[i];
                    }
                    if (sw !== width || sh !== height) {
                        alphaBuf = resizeImageMask(alphaBuf, mask.bpc, sw, sh, width, height);
                    }
                } else if (Array.isArray(mask)) {
                    alphaBuf = new Uint8ClampedArray(width * height);
                    var numComps = this.numComps;
                    for (i = 0, ii = width * height; i < ii; ++i) {
                        var opacity = 0;
                        var imageOffset = i * numComps;
                        for (j = 0; j < numComps; ++j) {
                            var color = image[imageOffset + j];
                            var maskOffset = j * 2;
                            if (color < mask[maskOffset] || color > mask[maskOffset + 1]) {
                                opacity = 255;
                                break;
                            }
                        }
                        alphaBuf[i] = opacity;
                    }
                } else {
                    throw new a.FormatError('Unknown mask format.');
                }
            }
            if (alphaBuf) {
                for (i = 0, j = 3, ii = width * actualHeight; i < ii; ++i, j += 4) {
                    rgbaBuf[j] = alphaBuf[i];
                }
            } else {
                for (i = 0, j = 3, ii = width * actualHeight; i < ii; ++i, j += 4) {
                    rgbaBuf[j] = 255;
                }
            }
        }
        undoPreblend(buffer, width, height) {
            if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('!PRODUCTION || TESTING')) {
                a.assert(buffer instanceof Uint8ClampedArray, 'PDFImage.undoPreblend: Unsupported "buffer" type.');
            }
            var matte = this.smask && this.smask.matte;
            if (!matte) {
                return;
            }
            var matteRgb = this.colorSpace.getRgb(matte, 0);
            var matteR = matteRgb[0];
            var matteG = matteRgb[1];
            var matteB = matteRgb[2];
            var length = width * height * 4;
            for (var i = 0; i < length; i += 4) {
                var alpha = buffer[i + 3];
                if (alpha === 0) {
                    buffer[i] = 255;
                    buffer[i + 1] = 255;
                    buffer[i + 2] = 255;
                    continue;
                }
                var k = 255 / alpha;
                buffer[i] = (buffer[i] - matteR) * k + matteR;
                buffer[i + 1] = (buffer[i + 1] - matteG) * k + matteG;
                buffer[i + 2] = (buffer[i + 2] - matteB) * k + matteB;
            }
        }
        createImageData(forceRGBA = false) {
            var drawWidth = this.drawWidth;
            var drawHeight = this.drawHeight;
            var imgData = {
                width: drawWidth,
                height: drawHeight,
                kind: 0,
                data: null
            };
            var numComps = this.numComps;
            var originalWidth = this.width;
            var originalHeight = this.height;
            var bpc = this.bpc;
            var rowBytes = originalWidth * numComps * bpc + 7 >> 3;
            var imgArray;
            if (!forceRGBA) {
                var kind;
                if (this.colorSpace.name === 'DeviceGray' && bpc === 1) {
                    kind = a.ImageKind.GRAYSCALE_1BPP;
                } else if (this.colorSpace.name === 'DeviceRGB' && bpc === 8 && !this.needsDecode) {
                    kind = a.ImageKind.RGB_24BPP;
                }
                if (kind && !this.smask && !this.mask && drawWidth === originalWidth && drawHeight === originalHeight) {
                    imgData.kind = kind;
                    imgArray = this.getImageBytes(originalHeight * rowBytes);
                    if (this.image instanceof d.DecodeStream) {
                        imgData.data = imgArray;
                    } else {
                        var newArray = new Uint8ClampedArray(imgArray.length);
                        newArray.set(imgArray);
                        imgData.data = newArray;
                    }
                    if (this.needsDecode) {
                        a.assert(kind === a.ImageKind.GRAYSCALE_1BPP, 'PDFImage.createImageData: The image must be grayscale.');
                        var buffer = imgData.data;
                        for (var i = 0, ii = buffer.length; i < ii; i++) {
                            buffer[i] ^= 255;
                        }
                    }
                    return imgData;
                }
                if (this.image instanceof e.JpegStream && !this.smask && !this.mask) {
                    let imageLength = originalHeight * rowBytes;
                    switch (this.colorSpace.name) {
                    case 'DeviceGray':
                        imageLength *= 3;
                    case 'DeviceRGB':
                    case 'DeviceCMYK':
                        imgData.kind = a.ImageKind.RGB_24BPP;
                        imgData.data = this.getImageBytes(imageLength, drawWidth, drawHeight, true);
                        return imgData;
                    }
                }
            }
            imgArray = this.getImageBytes(originalHeight * rowBytes);
            var actualHeight = 0 | imgArray.length / rowBytes * drawHeight / originalHeight;
            var comps = this.getComponents(imgArray);
            var alpha01, maybeUndoPreblend;
            if (!forceRGBA && !this.smask && !this.mask) {
                imgData.kind = a.ImageKind.RGB_24BPP;
                imgData.data = new Uint8ClampedArray(drawWidth * drawHeight * 3);
                alpha01 = 0;
                maybeUndoPreblend = false;
            } else {
                imgData.kind = a.ImageKind.RGBA_32BPP;
                imgData.data = new Uint8ClampedArray(drawWidth * drawHeight * 4);
                alpha01 = 1;
                maybeUndoPreblend = true;
                this.fillOpacity(imgData.data, drawWidth, drawHeight, actualHeight, comps);
            }
            if (this.needsDecode) {
                this.decodeBuffer(comps);
            }
            this.colorSpace.fillRgb(imgData.data, originalWidth, originalHeight, drawWidth, drawHeight, actualHeight, bpc, comps, alpha01);
            if (maybeUndoPreblend) {
                this.undoPreblend(imgData.data, drawWidth, actualHeight);
            }
            return imgData;
        }
        fillGrayBuffer(buffer) {
            if (typeof PDFJSDev === 'undefined' || PDFJSDev.test('!PRODUCTION || TESTING')) {
                a.assert(buffer instanceof Uint8ClampedArray, 'PDFImage.fillGrayBuffer: Unsupported "buffer" type.');
            }
            var numComps = this.numComps;
            if (numComps !== 1) {
                throw new a.FormatError(`Reading gray scale from a color image: ${ numComps }`);
            }
            var width = this.width;
            var height = this.height;
            var bpc = this.bpc;
            var rowBytes = width * numComps * bpc + 7 >> 3;
            var imgArray = this.getImageBytes(height * rowBytes);
            var comps = this.getComponents(imgArray);
            var i, length;
            if (bpc === 1) {
                length = width * height;
                if (this.needsDecode) {
                    for (i = 0; i < length; ++i) {
                        buffer[i] = comps[i] - 1 & 255;
                    }
                } else {
                    for (i = 0; i < length; ++i) {
                        buffer[i] = -comps[i] & 255;
                    }
                }
                return;
            }
            if (this.needsDecode) {
                this.decodeBuffer(comps);
            }
            length = width * height;
            var scale = 255 / ((1 << bpc) - 1);
            for (i = 0; i < length; ++i) {
                buffer[i] = scale * comps[i];
            }
        }
        getImageBytes(length, drawWidth, drawHeight, forceRGB = false) {
            this.image.reset();
            this.image.drawWidth = drawWidth || this.width;
            this.image.drawHeight = drawHeight || this.height;
            this.image.forceRGB = !!forceRGB;
            return this.image.getBytes(length, true);
        }
    }
    return { PDFImage };
});
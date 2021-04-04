define(['../shared/util.js'], function (a) {
    'use strict';
    class BaseFontLoader {
        constructor({docId, onUnsupportedFeature, ownerDocument = globalThis.document}) {
            if (this.constructor === BaseFontLoader) {
                a.unreachable('Cannot initialize BaseFontLoader.');
            }
            this.docId = docId;
            this._onUnsupportedFeature = onUnsupportedFeature;
            this._document = ownerDocument;
            this.nativeFontFaces = [];
            this.styleElement = null;
        }
        addNativeFontFace(nativeFontFace) {
            this.nativeFontFaces.push(nativeFontFace);
            this._document.fonts.add(nativeFontFace);
        }
        insertRule(rule) {
            let styleElement = this.styleElement;
            if (!styleElement) {
                styleElement = this.styleElement = this._document.createElement('style');
                styleElement.id = `PDFJS_FONT_STYLE_TAG_${ this.docId }`;
                this._document.documentElement.getElementsByTagName('head')[0].appendChild(styleElement);
            }
            const styleSheet = styleElement.sheet;
            styleSheet.insertRule(rule, styleSheet.cssRules.length);
        }
        clear() {
            this.nativeFontFaces.forEach(nativeFontFace => {
                this._document.fonts.delete(nativeFontFace);
            });
            this.nativeFontFaces.length = 0;
            if (this.styleElement) {
                this.styleElement.remove();
                this.styleElement = null;
            }
        }
        async bind(font) {
            if (font.attached || font.missingFile) {
                return;
            }
            font.attached = true;
            if (this.isFontLoadingAPISupported) {
                const nativeFontFace = font.createNativeFontFace();
                if (nativeFontFace) {
                    this.addNativeFontFace(nativeFontFace);
                    try {
                        await nativeFontFace.loaded;
                    } catch (ex) {
                        this._onUnsupportedFeature({ featureId: a.UNSUPPORTED_FEATURES.errorFontLoadNative });
                        a.warn(`Failed to load font '${ nativeFontFace.family }': '${ ex }'.`);
                        font.disableFontFace = true;
                        throw ex;
                    }
                }
                return;
            }
            const rule = font.createFontFaceRule();
            if (rule) {
                this.insertRule(rule);
                if (this.isSyncFontLoadingSupported) {
                    return;
                }
                await new Promise(resolve => {
                    const request = this._queueLoadingCallback(resolve);
                    this._prepareFontLoadEvent([rule], [font], request);
                });
            }
        }
        _queueLoadingCallback(callback) {
            a.unreachable('Abstract method `_queueLoadingCallback`.');
        }
        get isFontLoadingAPISupported() {
            return a.shadow(this, 'isFontLoadingAPISupported', !!this._document && this._document.fonts);
        }
        get isSyncFontLoadingSupported() {
            a.unreachable('Abstract method `isSyncFontLoadingSupported`.');
        }
        get _loadTestFont() {
            a.unreachable('Abstract method `_loadTestFont`.');
        }
        _prepareFontLoadEvent(rules, fontsToLoad, request) {
            a.unreachable('Abstract method `_prepareFontLoadEvent`.');
        }
    }
    let FontLoader;
    if (typeof PDFJSDev !== 'undefined' && PDFJSDev.test('MOZCENTRAL')) {
        FontLoader = class MozcentralFontLoader extends BaseFontLoader {
            get isSyncFontLoadingSupported() {
                return a.shadow(this, 'isSyncFontLoadingSupported', true);
            }
        };
    } else {
        FontLoader = class GenericFontLoader extends BaseFontLoader {
            constructor(params) {
                super(params);
                this.loadingContext = {
                    requests: [],
                    nextRequestId: 0
                };
                this.loadTestFontId = 0;
            }
            get isSyncFontLoadingSupported() {
                let supported = false;
                if (typeof PDFJSDev === 'undefined' || !PDFJSDev.test('CHROME')) {
                    if (typeof navigator === 'undefined') {
                        supported = true;
                    } else {
                        const m = /Mozilla\/5.0.*?rv:(\d+).*? Gecko/.exec(navigator.userAgent);
                        if (m && m[1] >= 14) {
                            supported = true;
                        }
                    }
                }
                return a.shadow(this, 'isSyncFontLoadingSupported', supported);
            }
            _queueLoadingCallback(callback) {
                function completeRequest() {
                    a.assert(!request.done, 'completeRequest() cannot be called twice.');
                    request.done = true;
                    while (context.requests.length > 0 && context.requests[0].done) {
                        const otherRequest = context.requests.shift();
                        setTimeout(otherRequest.callback, 0);
                    }
                }
                const context = this.loadingContext;
                const request = {
                    id: `pdfjs-font-loading-${ context.nextRequestId++ }`,
                    done: false,
                    complete: completeRequest,
                    callback
                };
                context.requests.push(request);
                return request;
            }
            get _loadTestFont() {
                const getLoadTestFont = function () {
                    return atob('T1RUTwALAIAAAwAwQ0ZGIDHtZg4AAAOYAAAAgUZGVE1lkzZwAAAEHAAAABxHREVGABQA' + 'FQAABDgAAAAeT1MvMlYNYwkAAAEgAAAAYGNtYXABDQLUAAACNAAAAUJoZWFk/xVFDQAA' + 'ALwAAAA2aGhlYQdkA+oAAAD0AAAAJGhtdHgD6AAAAAAEWAAAAAZtYXhwAAJQAAAAARgA' + 'AAAGbmFtZVjmdH4AAAGAAAAAsXBvc3T/hgAzAAADeAAAACAAAQAAAAEAALZRFsRfDzz1' + 'AAsD6AAAAADOBOTLAAAAAM4KHDwAAAAAA+gDIQAAAAgAAgAAAAAAAAABAAADIQAAAFoD' + '6AAAAAAD6AABAAAAAAAAAAAAAAAAAAAAAQAAUAAAAgAAAAQD6AH0AAUAAAKKArwAAACM' + 'AooCvAAAAeAAMQECAAACAAYJAAAAAAAAAAAAAQAAAAAAAAAAAAAAAFBmRWQAwAAuAC4D' + 'IP84AFoDIQAAAAAAAQAAAAAAAAAAACAAIAABAAAADgCuAAEAAAAAAAAAAQAAAAEAAAAA' + 'AAEAAQAAAAEAAAAAAAIAAQAAAAEAAAAAAAMAAQAAAAEAAAAAAAQAAQAAAAEAAAAAAAUA' + 'AQAAAAEAAAAAAAYAAQAAAAMAAQQJAAAAAgABAAMAAQQJAAEAAgABAAMAAQQJAAIAAgAB' + 'AAMAAQQJAAMAAgABAAMAAQQJAAQAAgABAAMAAQQJAAUAAgABAAMAAQQJAAYAAgABWABY' + 'AAAAAAAAAwAAAAMAAAAcAAEAAAAAADwAAwABAAAAHAAEACAAAAAEAAQAAQAAAC7//wAA' + 'AC7////TAAEAAAAAAAABBgAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' + 'AAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' + 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' + 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' + 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' + 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAD/gwAyAAAAAQAAAAAAAAAAAAAAAAAA' + 'AAABAAQEAAEBAQJYAAEBASH4DwD4GwHEAvgcA/gXBIwMAYuL+nz5tQXkD5j3CBLnEQAC' + 'AQEBIVhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYAAABAQAADwACAQEEE/t3' + 'Dov6fAH6fAT+fPp8+nwHDosMCvm1Cvm1DAz6fBQAAAAAAAABAAAAAMmJbzEAAAAAzgTj' + 'FQAAAADOBOQpAAEAAAAAAAAADAAUAAQAAAABAAAAAgABAAAAAAAAAAAD6AAAAAAAAA==');
                };
                return a.shadow(this, '_loadTestFont', getLoadTestFont());
            }
            _prepareFontLoadEvent(rules, fonts, request) {
                function int32(data, offset) {
                    return data.charCodeAt(offset) << 24 | data.charCodeAt(offset + 1) << 16 | data.charCodeAt(offset + 2) << 8 | data.charCodeAt(offset + 3) & 255;
                }
                function spliceString(s, offset, remove, insert) {
                    const chunk1 = s.substring(0, offset);
                    const chunk2 = s.substring(offset + remove);
                    return chunk1 + insert + chunk2;
                }
                let i, ii;
                const canvas = this._document.createElement('canvas');
                canvas.width = 1;
                canvas.height = 1;
                const ctx = canvas.getContext('2d');
                let called = 0;
                function isFontReady(name, callback) {
                    called++;
                    if (called > 30) {
                        a.warn('Load test font never loaded.');
                        callback();
                        return;
                    }
                    ctx.font = '30px ' + name;
                    ctx.fillText('.', 0, 20);
                    const imageData = ctx.getImageData(0, 0, 1, 1);
                    if (imageData.data[3] > 0) {
                        callback();
                        return;
                    }
                    setTimeout(isFontReady.bind(null, name, callback));
                }
                const loadTestFontId = `lt${ Date.now() }${ this.loadTestFontId++ }`;
                let data = this._loadTestFont;
                const COMMENT_OFFSET = 976;
                data = spliceString(data, COMMENT_OFFSET, loadTestFontId.length, loadTestFontId);
                const CFF_CHECKSUM_OFFSET = 16;
                const XXXX_VALUE = 1482184792;
                let checksum = int32(data, CFF_CHECKSUM_OFFSET);
                for (i = 0, ii = loadTestFontId.length - 3; i < ii; i += 4) {
                    checksum = checksum - XXXX_VALUE + int32(loadTestFontId, i) | 0;
                }
                if (i < loadTestFontId.length) {
                    checksum = checksum - XXXX_VALUE + int32(loadTestFontId + 'XXX', i) | 0;
                }
                data = spliceString(data, CFF_CHECKSUM_OFFSET, 4, a.string32(checksum));
                const url = `url(data:font/opentype;base64,${ btoa(data) });`;
                const rule = `@font-face {font-family:"${ loadTestFontId }";src:${ url }}`;
                this.insertRule(rule);
                const names = [];
                for (i = 0, ii = fonts.length; i < ii; i++) {
                    names.push(fonts[i].loadedName);
                }
                names.push(loadTestFontId);
                const div = this._document.createElement('div');
                div.style.visibility = 'hidden';
                div.style.width = div.style.height = '10px';
                div.style.position = 'absolute';
                div.style.top = div.style.left = '0px';
                for (i = 0, ii = names.length; i < ii; ++i) {
                    const span = this._document.createElement('span');
                    span.textContent = 'Hi';
                    span.style.fontFamily = names[i];
                    div.appendChild(span);
                }
                this._document.body.appendChild(div);
                isFontReady(loadTestFontId, () => {
                    this._document.body.removeChild(div);
                    request.complete();
                });
            }
        };
    }
    class FontFaceObject {
        constructor(translatedData, {isEvalSupported = true, disableFontFace = false, ignoreErrors = false, onUnsupportedFeature = null, fontRegistry = null}) {
            this.compiledGlyphs = Object.create(null);
            for (const i in translatedData) {
                this[i] = translatedData[i];
            }
            this.isEvalSupported = isEvalSupported !== false;
            this.disableFontFace = disableFontFace === true;
            this.ignoreErrors = ignoreErrors === true;
            this._onUnsupportedFeature = onUnsupportedFeature;
            this.fontRegistry = fontRegistry;
        }
        createNativeFontFace() {
            if (!this.data || this.disableFontFace) {
                return null;
            }
            const nativeFontFace = new FontFace(this.loadedName, this.data, {});
            if (this.fontRegistry) {
                this.fontRegistry.registerFont(this);
            }
            return nativeFontFace;
        }
        createFontFaceRule() {
            if (!this.data || this.disableFontFace) {
                return null;
            }
            const data = a.bytesToString(new Uint8Array(this.data));
            const url = `url(data:${ this.mimetype };base64,${ btoa(data) });`;
            const rule = `@font-face {font-family:"${ this.loadedName }";src:${ url }}`;
            if (this.fontRegistry) {
                this.fontRegistry.registerFont(this, url);
            }
            return rule;
        }
        getPathGenerator(objs, character) {
            if (this.compiledGlyphs[character] !== undefined) {
                return this.compiledGlyphs[character];
            }
            let cmds, current;
            try {
                cmds = objs.get(this.loadedName + '_path_' + character);
            } catch (ex) {
                if (!this.ignoreErrors) {
                    throw ex;
                }
                if (this._onUnsupportedFeature) {
                    this._onUnsupportedFeature({ featureId: a.UNSUPPORTED_FEATURES.errorFontGetPath });
                }
                a.warn(`getPathGenerator - ignoring character: "${ ex }".`);
                return this.compiledGlyphs[character] = function (c, size) {
                };
            }
            if (this.isEvalSupported && a.IsEvalSupportedCached.value) {
                let args, js = '';
                for (let i = 0, ii = cmds.length; i < ii; i++) {
                    current = cmds[i];
                    if (current.args !== undefined) {
                        args = current.args.join(',');
                    } else {
                        args = '';
                    }
                    js += 'c.' + current.cmd + '(' + args + ');\n';
                }
                return this.compiledGlyphs[character] = new Function('c', 'size', js);
            }
            return this.compiledGlyphs[character] = function (c, size) {
                for (let i = 0, ii = cmds.length; i < ii; i++) {
                    current = cmds[i];
                    if (current.cmd === 'scale') {
                        current.args = [
                            size,
                            -size
                        ];
                    }
                    c[current.cmd].apply(c, current.args);
                }
            };
        }
    }
    return {
        FontFaceObject,
        FontLoader
    };
});
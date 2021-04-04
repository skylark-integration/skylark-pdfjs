define([
    './primitives.js',
    '../shared/util.js',
    './colorspace.js',
    './core_utils.js',
    './evaluator.js',
    './stream.js'
], function (a, b, c, d, e, f) {
    'use strict';
    class DefaultAppearanceEvaluator extends e.EvaluatorPreprocessor {
        constructor(str) {
            super(new f.StringStream(str));
        }
        parse() {
            const operation = {
                fn: 0,
                args: []
            };
            const result = {
                fontSize: 0,
                fontName: a.Name.get(''),
                fontColor: new Uint8ClampedArray([
                    0,
                    0,
                    0
                ])
            };
            try {
                while (true) {
                    operation.args.length = 0;
                    if (!this.read(operation)) {
                        break;
                    }
                    if (this.savedStatesDepth !== 0) {
                        continue;
                    }
                    const {fn, args} = operation;
                    switch (fn | 0) {
                    case b.OPS.setFont:
                        const [fontName, fontSize] = args;
                        if (a.isName(fontName)) {
                            result.fontName = fontName;
                        }
                        if (typeof fontSize === 'number' && fontSize > 0) {
                            result.fontSize = fontSize;
                        }
                        break;
                    case b.OPS.setFillRGBColor:
                        c.ColorSpace.singletons.rgb.getRgbItem(args, 0, result.fontColor, 0);
                        break;
                    case b.OPS.setFillGray:
                        c.ColorSpace.singletons.gray.getRgbItem(args, 0, result.fontColor, 0);
                        break;
                    case b.OPS.setFillColorSpace:
                        c.ColorSpace.singletons.cmyk.getRgbItem(args, 0, result.fontColor, 0);
                        break;
                    }
                }
            } catch (reason) {
                b.warn(`parseDefaultAppearance - ignoring errors: "${ reason }".`);
            }
            return result;
        }
    }
    function parseDefaultAppearance(str) {
        return new DefaultAppearanceEvaluator(str).parse();
    }
    function createDefaultAppearance({fontSize, fontName, fontColor}) {
        let colorCmd;
        if (fontColor.every(c => c === 0)) {
            colorCmd = '0 g';
        } else {
            colorCmd = Array.from(fontColor).map(c => (c / 255).toFixed(2)).join(' ') + ' rg';
        }
        return `/${ d.escapePDFName(fontName.name) } ${ fontSize } Tf ${ colorCmd }`;
    }
    return {
        createDefaultAppearance,
        parseDefaultAppearance
    };
});
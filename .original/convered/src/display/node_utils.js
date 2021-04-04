define([
    './display_utils.js',
    '../shared/is_node.js',
    '../shared/util.js'
], function (a, b, c) {
    'use strict';
    let NodeCanvasFactory = class {
        constructor() {
            c.unreachable('Not implemented: NodeCanvasFactory');
        }
    };
    let NodeCMapReaderFactory = class {
        constructor() {
            c.unreachable('Not implemented: NodeCMapReaderFactory');
        }
    };
    if ((typeof PDFJSDev === 'undefined' || PDFJSDev.test('GENERIC')) && b.isNodeJS) {
        NodeCanvasFactory = class extends a.BaseCanvasFactory {
            create(width, height) {
                if (width <= 0 || height <= 0) {
                    throw new Error('Invalid canvas size');
                }
                const Canvas = __non_webpack_require__('canvas');
                const canvas = Canvas.createCanvas(width, height);
                return {
                    canvas,
                    context: canvas.getContext('2d')
                };
            }
        };
        NodeCMapReaderFactory = class extends a.BaseCMapReaderFactory {
            _fetchData(url, compressionType) {
                return new Promise((resolve, reject) => {
                    const fs = __non_webpack_require__('fs');
                    fs.readFile(url, (error, data) => {
                        if (error || !data) {
                            reject(new Error(error));
                            return;
                        }
                        resolve({
                            cMapData: new Uint8Array(data),
                            compressionType
                        });
                    });
                });
            }
        };
    }
    return {
        NodeCanvasFactory,
        NodeCMapReaderFactory
    };
});
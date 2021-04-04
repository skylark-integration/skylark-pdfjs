define([
    './constants.js',
    './field.js',
    './aform.js',
    './app.js',
    './color.js',
    './console.js',
    './doc.js',
    './proxy.js',
    './util.js'
], function (a, b, c, d, e, f, g, h, i) {
    'use strict';
    function initSandbox(params) {
        delete globalThis.pdfjsScripting;
        const externalCall = globalThis.callExternalFunction;
        delete globalThis.callExternalFunction;
        const globalEval = code => globalThis.eval(code);
        const send = data => externalCall('send', [data]);
        const proxyHandler = new h.ProxyHandler();
        const {data} = params;
        const doc = new g.Doc({
            send,
            globalEval,
            ...data.docInfo
        });
        const _document = {
            obj: doc,
            wrapped: new Proxy(doc, proxyHandler)
        };
        const app = new d.App({
            send,
            globalEval,
            externalCall,
            _document,
            calculationOrder: data.calculationOrder,
            proxyHandler,
            ...data.appInfo
        });
        const util = new i.Util({ externalCall });
        if (data.objects) {
            for (const [name, objs] of Object.entries(data.objects)) {
                const obj = objs[0];
                obj.send = send;
                obj.globalEval = globalEval;
                obj.doc = _document.wrapped;
                let field;
                if (obj.type === 'radiobutton') {
                    const otherButtons = objs.slice(1);
                    field = new b.RadioButtonField(otherButtons, obj);
                } else if (obj.type === 'checkbox') {
                    const otherButtons = objs.slice(1);
                    field = new b.CheckboxField(otherButtons, obj);
                } else {
                    field = new b.Field(obj);
                }
                const wrapped = new Proxy(field, proxyHandler);
                doc._addField(name, wrapped);
                const _object = {
                    obj: field,
                    wrapped
                };
                for (const object of objs) {
                    app._objects[object.id] = _object;
                }
            }
        }
        const color = new e.Color();
        globalThis.event = null;
        globalThis.global = Object.create(null);
        globalThis.app = new Proxy(app, proxyHandler);
        globalThis.color = new Proxy(color, proxyHandler);
        globalThis.console = new Proxy(new f.Console({ send }), proxyHandler);
        globalThis.util = new Proxy(util, proxyHandler);
        globalThis.border = a.Border;
        globalThis.cursor = a.Cursor;
        globalThis.display = a.Display;
        globalThis.font = a.Font;
        globalThis.highlight = a.Highlight;
        globalThis.position = a.Position;
        globalThis.scaleHow = a.ScaleHow;
        globalThis.scaleWhen = a.ScaleWhen;
        globalThis.style = a.Style;
        globalThis.trans = a.Trans;
        globalThis.zoomtype = a.ZoomType;
        const aform = new c.AForm(doc, app, util, color);
        for (const name of Object.getOwnPropertyNames(c.AForm.prototype)) {
            if (name !== 'constructor' && !name.startsWith('_')) {
                globalThis[name] = aform[name].bind(aform);
            }
        }
        for (const [name, value] of Object.entries(a.GlobalConstants)) {
            Object.defineProperty(globalThis, name, {
                value,
                writable: false
            });
        }
        Object.defineProperties(globalThis, {
            ColorConvert: {
                value: color.convert.bind(color),
                writable: true
            },
            ColorEqual: {
                value: color.equal.bind(color),
                writable: true
            }
        });
        const properties = Object.create(null);
        for (const name of Object.getOwnPropertyNames(g.Doc.prototype)) {
            if (name === 'constructor' || name.startsWith('_')) {
                continue;
            }
            const descriptor = Object.getOwnPropertyDescriptor(g.Doc.prototype, name);
            if (descriptor.get) {
                properties[name] = {
                    get: descriptor.get.bind(doc),
                    set: descriptor.set.bind(doc)
                };
            } else {
                properties[name] = { value: g.Doc.prototype[name].bind(doc) };
            }
        }
        Object.defineProperties(globalThis, properties);
        const functions = {
            dispatchEvent: app._dispatchEvent.bind(app),
            timeoutCb: app._evalCallback.bind(app)
        };
        return (name, args) => {
            try {
                functions[name](args);
            } catch (error) {
                const value = `${ error.toString() }\n${ error.stack }`;
                send({
                    command: 'error',
                    value
                });
            }
        };
    }
    return { initSandbox };
});
define(function () {
    'use strict';
    class ProxyHandler {
        get(obj, prop) {
            if (prop in obj._expandos) {
                const val = obj._expandos[prop];
                if (typeof val === 'function') {
                    return val.bind(obj);
                }
                return val;
            }
            if (typeof prop === 'string' && !prop.startsWith('_') && prop in obj) {
                const val = obj[prop];
                if (typeof val === 'function') {
                    return val.bind(obj);
                }
                return val;
            }
            return undefined;
        }
        set(obj, prop, value) {
            if (typeof prop === 'string' && !prop.startsWith('_') && prop in obj) {
                const old = obj[prop];
                obj[prop] = value;
                if (obj._send && obj._id !== null && typeof old !== 'function') {
                    const data = { id: obj._id };
                    data[prop] = obj[prop];
                    obj._send(data);
                }
            } else {
                obj._expandos[prop] = value;
            }
            return true;
        }
        has(obj, prop) {
            return prop in obj._expandos || typeof prop === 'string' && !prop.startsWith('_') && prop in obj;
        }
        getPrototypeOf(obj) {
            return null;
        }
        setPrototypeOf(obj, proto) {
            return false;
        }
        isExtensible(obj) {
            return true;
        }
        preventExtensions(obj) {
            return false;
        }
        getOwnPropertyDescriptor(obj, prop) {
            if (prop in obj._expandos) {
                return {
                    configurable: true,
                    enumerable: true,
                    value: obj._expandos[prop]
                };
            }
            if (typeof prop === 'string' && !prop.startsWith('_') && prop in obj) {
                return {
                    configurable: true,
                    enumerable: true,
                    value: obj[prop]
                };
            }
            return undefined;
        }
        defineProperty(obj, key, descriptor) {
            Object.defineProperty(obj._expandos, key, descriptor);
            return true;
        }
        deleteProperty(obj, prop) {
            if (prop in obj._expandos) {
                delete obj._expandos[prop];
            }
        }
        ownKeys(obj) {
            const fromExpandos = Reflect.ownKeys(obj._expandos);
            const fromObj = Reflect.ownKeys(obj).filter(k => !k.startsWith('_'));
            return fromExpandos.concat(fromObj);
        }
    }
    return { ProxyHandler };
});
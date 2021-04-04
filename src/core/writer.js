define([
    '../shared/util.js',
    './primitives.js',
    './core_utils.js',
    '../shared/xml_parser.js',
    './crypto.js'
], function (a, b, c, d, e) {
    'use strict';
    function writeDict(dict, buffer, transform) {
        buffer.push('<<');
        for (const key of dict.getKeys()) {
            buffer.push(` /${ c.escapePDFName(key) } `);
            writeValue(dict.getRaw(key), buffer, transform);
        }
        buffer.push('>>');
    }
    function writeStream(stream, buffer, transform) {
        writeDict(stream.dict, buffer, transform);
        buffer.push(' stream\n');
        let string = a.bytesToString(stream.getBytes());
        if (transform !== null) {
            string = transform.encryptString(string);
        }
        buffer.push(string);
        buffer.push('\nendstream\n');
    }
    function writeArray(array, buffer, transform) {
        buffer.push('[');
        let first = true;
        for (const val of array) {
            if (!first) {
                buffer.push(' ');
            } else {
                first = false;
            }
            writeValue(val, buffer, transform);
        }
        buffer.push(']');
    }
    function numberToString(value) {
        if (Number.isInteger(value)) {
            return value.toString();
        }
        const roundedValue = Math.round(value * 100);
        if (roundedValue % 100 === 0) {
            return (roundedValue / 100).toString();
        }
        if (roundedValue % 10 === 0) {
            return value.toFixed(1);
        }
        return value.toFixed(2);
    }
    function writeValue(value, buffer, transform) {
        if (b.isName(value)) {
            buffer.push(`/${ c.escapePDFName(value.name) }`);
        } else if (b.isRef(value)) {
            buffer.push(`${ value.num } ${ value.gen } R`);
        } else if (Array.isArray(value)) {
            writeArray(value, buffer, transform);
        } else if (typeof value === 'string') {
            if (transform !== null) {
                value = transform.encryptString(value);
            }
            buffer.push(`(${ a.escapeString(value) })`);
        } else if (typeof value === 'number') {
            buffer.push(numberToString(value));
        } else if (b.isDict(value)) {
            writeDict(value, buffer, transform);
        } else if (b.isStream(value)) {
            writeStream(value, buffer, transform);
        }
    }
    function writeInt(number, size, offset, buffer) {
        for (let i = size + offset - 1; i > offset - 1; i--) {
            buffer[i] = number & 255;
            number >>= 8;
        }
        return offset + size;
    }
    function writeString(string, offset, buffer) {
        for (let i = 0, len = string.length; i < len; i++) {
            buffer[offset + i] = string.charCodeAt(i) & 255;
        }
    }
    function computeMD5(filesize, xrefInfo) {
        const time = Math.floor(Date.now() / 1000);
        const filename = xrefInfo.filename || '';
        const md5Buffer = [
            time.toString(),
            filename,
            filesize.toString()
        ];
        let md5BufferLen = md5Buffer.reduce((a, str) => a + str.length, 0);
        for (const value of Object.values(xrefInfo.info)) {
            md5Buffer.push(value);
            md5BufferLen += value.length;
        }
        const array = new Uint8Array(md5BufferLen);
        let offset = 0;
        for (const str of md5Buffer) {
            writeString(str, offset, array);
            offset += str.length;
        }
        return a.bytesToString(e.calculateMD5(array));
    }
    function updateXFA(datasetsRef, newRefs, xref) {
        if (datasetsRef === null || xref === null) {
            return;
        }
        const datasets = xref.fetchIfRef(datasetsRef);
        const str = a.bytesToString(datasets.getBytes());
        const xml = new d.SimpleXMLParser({ hasAttributes: true }).parseFromString(str);
        for (const {xfa} of newRefs) {
            if (!xfa) {
                continue;
            }
            const {path, value} = xfa;
            if (!path) {
                continue;
            }
            const node = xml.documentElement.searchNode(c.parseXFAPath(path), 0);
            if (node) {
                node.childNodes = [new d.SimpleDOMNode('#text', value)];
            } else {
                a.warn(`Node not found for path: ${ path }`);
            }
        }
        const buffer = [];
        xml.documentElement.dump(buffer);
        let updatedXml = buffer.join('');
        const encrypt = xref.encrypt;
        if (encrypt) {
            const transform = encrypt.createCipherTransform(datasetsRef.num, datasetsRef.gen);
            updatedXml = transform.encryptString(updatedXml);
        }
        const data = `${ datasetsRef.num } ${ datasetsRef.gen } obj\n` + `<< /Type /EmbeddedFile /Length ${ updatedXml.length }>>\nstream\n` + updatedXml + '\nendstream\nendobj\n';
        newRefs.push({
            ref: datasetsRef,
            data
        });
    }
    function incrementalUpdate({originalData, xrefInfo, newRefs, xref = null, datasetsRef = null}) {
        updateXFA(datasetsRef, newRefs, xref);
        const newXref = new b.Dict(null);
        const refForXrefTable = xrefInfo.newRef;
        let buffer, baseOffset;
        const lastByte = originalData[originalData.length - 1];
        if (lastByte === 10 || lastByte === 13) {
            buffer = [];
            baseOffset = originalData.length;
        } else {
            buffer = ['\n'];
            baseOffset = originalData.length + 1;
        }
        newXref.set('Size', refForXrefTable.num + 1);
        newXref.set('Prev', xrefInfo.startXRef);
        newXref.set('Type', b.Name.get('XRef'));
        if (xrefInfo.rootRef !== null) {
            newXref.set('Root', xrefInfo.rootRef);
        }
        if (xrefInfo.infoRef !== null) {
            newXref.set('Info', xrefInfo.infoRef);
        }
        if (xrefInfo.encrypt !== null) {
            newXref.set('Encrypt', xrefInfo.encrypt);
        }
        newRefs.push({
            ref: refForXrefTable,
            data: ''
        });
        newRefs = newRefs.sort((a, b) => {
            return a.ref.num - b.ref.num;
        });
        const xrefTableData = [[
                0,
                1,
                65535
            ]];
        const indexes = [
            0,
            1
        ];
        let maxOffset = 0;
        for (const {ref, data} of newRefs) {
            maxOffset = Math.max(maxOffset, baseOffset);
            xrefTableData.push([
                1,
                baseOffset,
                Math.min(ref.gen, 65535)
            ]);
            baseOffset += data.length;
            indexes.push(ref.num);
            indexes.push(1);
            buffer.push(data);
        }
        newXref.set('Index', indexes);
        if (xrefInfo.fileIds.length !== 0) {
            const md5 = computeMD5(baseOffset, xrefInfo);
            newXref.set('ID', [
                xrefInfo.fileIds[0],
                md5
            ]);
        }
        const offsetSize = Math.ceil(Math.log2(maxOffset) / 8);
        const sizes = [
            1,
            offsetSize,
            2
        ];
        const structSize = sizes[0] + sizes[1] + sizes[2];
        const tableLength = structSize * xrefTableData.length;
        newXref.set('W', sizes);
        newXref.set('Length', tableLength);
        buffer.push(`${ refForXrefTable.num } ${ refForXrefTable.gen } obj\n`);
        writeDict(newXref, buffer, null);
        buffer.push(' stream\n');
        const bufferLen = buffer.reduce((a, str) => a + str.length, 0);
        const footer = `\nendstream\nendobj\nstartxref\n${ baseOffset }\n%%EOF\n`;
        const array = new Uint8Array(originalData.length + bufferLen + tableLength + footer.length);
        array.set(originalData);
        let offset = originalData.length;
        for (const str of buffer) {
            writeString(str, offset, array);
            offset += str.length;
        }
        for (const [type, objOffset, gen] of xrefTableData) {
            offset = writeInt(type, sizes[0], offset, array);
            offset = writeInt(objOffset, sizes[1], offset, array);
            offset = writeInt(gen, sizes[2], offset, array);
        }
        writeString(footer, offset, array);
        return array;
    }
    return {
        incrementalUpdate,
        writeDict
    };
});
define(['./constants.js'], function (a) {
    'use strict';
    class AForm {
        constructor(document, app, util, color) {
            this._document = document;
            this._app = app;
            this._util = util;
            this._color = color;
            this._dateFormats = [
                'm/d',
                'm/d/yy',
                'mm/dd/yy',
                'mm/yy',
                'd-mmm',
                'd-mmm-yy',
                'dd-mmm-yy',
                'yy-mm-dd',
                'mmm-yy',
                'mmmm-yy',
                'mmm d, yyyy',
                'mmmm d, yyyy',
                'm/d/yy h:MM tt',
                'm/d/yy HH:MM'
            ];
            this._timeFormats = [
                'HH:MM',
                'h:MM tt',
                'HH:MM:ss',
                'h:MM:ss tt'
            ];
            this._emailRegex = new RegExp("^[a-zA-Z0-9.!#$%&'*+\\/=?^_`{|}~-]+" + '@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?' + '(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$');
        }
        _mkTargetName(event) {
            return event.target ? `[ ${ event.target.name } ]` : '';
        }
        _parseDate(cFormat, cDate) {
            const ddate = Date.parse(cDate);
            if (isNaN(ddate)) {
                try {
                    return this._util.scand(cFormat, cDate);
                } catch (error) {
                    return null;
                }
            } else {
                return new Date(ddate);
            }
        }
        AFMergeChange(event = globalThis.event) {
            if (event.willCommit) {
                return event.value.toString();
            }
            return this._app._eventDispatcher.mergeChange(event);
        }
        AFParseDateEx(cString, cOrder) {
            return this._parseDate(cOrder, cString);
        }
        AFExtractNums(str) {
            if (typeof str === 'number') {
                return [str];
            }
            if (!str || typeof str !== 'string') {
                return null;
            }
            const first = str.charAt(0);
            if (first === '.' || first === ',') {
                str = `0${ str }`;
            }
            const numbers = str.match(/([0-9]+)/g);
            if (numbers.length === 0) {
                return null;
            }
            return numbers;
        }
        AFMakeNumber(str) {
            if (typeof str === 'number') {
                return str;
            }
            if (typeof str !== 'string') {
                return null;
            }
            str = str.trim().replace(',', '.');
            const number = parseFloat(str);
            if (isNaN(number) || !isFinite(number)) {
                return null;
            }
            return number;
        }
        AFMakeArrayFromList(string) {
            if (typeof string === 'string') {
                return string.split(/, ?/g);
            }
            return string;
        }
        AFNumber_Format(nDec, sepStyle, negStyle, currStyle, strCurrency, bCurrencyPrepend) {
            const event = globalThis.event;
            if (!event.value) {
                return;
            }
            let value = this.AFMakeNumber(event.value);
            if (value === null) {
                event.value = '';
                return;
            }
            const sign = Math.sign(value);
            const buf = [];
            let hasParen = false;
            if (sign === -1 && bCurrencyPrepend && negStyle === 0) {
                buf.push('-');
            }
            if ((negStyle === 2 || negStyle === 3) && sign === -1) {
                buf.push('(');
                hasParen = true;
            }
            if (bCurrencyPrepend) {
                buf.push(strCurrency);
            }
            sepStyle = Math.min(Math.max(0, Math.floor(sepStyle)), 4);
            buf.push('%,');
            buf.push(sepStyle);
            buf.push('.');
            buf.push(nDec.toString());
            buf.push('f');
            if (!bCurrencyPrepend) {
                buf.push(strCurrency);
            }
            if (hasParen) {
                buf.push(')');
            }
            if (negStyle === 1 || negStyle === 3) {
                event.target.textColor = sign === 1 ? this._color.black : this._color.red;
            }
            if ((negStyle !== 0 || bCurrencyPrepend) && sign === -1) {
                value = -value;
            }
            const formatStr = buf.join('');
            event.value = this._util.printf(formatStr, value);
        }
        AFNumber_Keystroke(nDec, sepStyle, negStyle, currStyle, strCurrency, bCurrencyPrepend) {
            const event = globalThis.event;
            let value = this.AFMergeChange(event);
            if (!value) {
                return;
            }
            value = value.trim();
            let pattern;
            if (sepStyle > 1) {
                pattern = event.willCommit ? /^[+-]?([0-9]+(,[0-9]*)?|,[0-9]+)$/ : /^[+-]?[0-9]*,?[0-9]*$/;
            } else {
                pattern = event.willCommit ? /^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)$/ : /^[+-]?[0-9]*\.?[0-9]*$/;
            }
            if (!pattern.test(value)) {
                if (event.willCommit) {
                    const err = `${ a.GlobalConstants.IDS_INVALID_VALUE } ${ this._mkTargetName(event) }`;
                    this._app.alert(err);
                }
                event.rc = false;
            }
            if (event.willCommit && sepStyle > 1) {
                event.value = parseFloat(value.replace(',', '.'));
            }
        }
        AFPercent_Format(nDec, sepStyle, percentPrepend = false) {
            if (typeof nDec !== 'number') {
                return;
            }
            if (typeof sepStyle !== 'number') {
                return;
            }
            if (nDec < 0) {
                throw new Error('Invalid nDec value in AFPercent_Format');
            }
            const event = globalThis.event;
            if (nDec > 512) {
                event.value = '%';
                return;
            }
            nDec = Math.floor(nDec);
            sepStyle = Math.min(Math.max(0, Math.floor(sepStyle)), 4);
            let value = this.AFMakeNumber(event.value);
            if (value === null) {
                event.value = '%';
                return;
            }
            const formatStr = `%,${ sepStyle }.${ nDec }f`;
            value = this._util.printf(formatStr, value * 100);
            if (percentPrepend) {
                event.value = `%${ value }`;
            } else {
                event.value = `${ value }%`;
            }
        }
        AFPercent_Keystroke(nDec, sepStyle) {
            this.AFNumber_Keystroke(nDec, sepStyle, 0, 0, '', true);
        }
        AFDate_FormatEx(cFormat) {
            const event = globalThis.event;
            const value = event.value;
            if (!value) {
                return;
            }
            const date = this._parseDate(cFormat, value);
            if (date !== null) {
                event.value = this._util.printd(cFormat, date);
            }
        }
        AFDate_Format(pdf) {
            if (pdf >= 0 && pdf < this._dateFormats.length) {
                this.AFDate_FormatEx(this._dateFormats[pdf]);
            }
        }
        AFDate_KeystrokeEx(cFormat) {
            const event = globalThis.event;
            if (!event.willCommit) {
                return;
            }
            const value = this.AFMergeChange(event);
            if (!value) {
                return;
            }
            if (this._parseDate(cFormat, value) === null) {
                const invalid = a.GlobalConstants.IDS_INVALID_DATE;
                const invalid2 = a.GlobalConstants.IDS_INVALID_DATE2;
                const err = `${ invalid } ${ this._mkTargetName(event) }${ invalid2 }${ cFormat }`;
                this._app.alert(err);
                event.rc = false;
            }
        }
        AFDate_Keystroke(pdf) {
            if (pdf >= 0 && pdf < this._dateFormats.length) {
                this.AFDate_KeystrokeEx(this._dateFormats[pdf]);
            }
        }
        AFRange_Validate(bGreaterThan, nGreaterThan, bLessThan, nLessThan) {
            const event = globalThis.event;
            if (!event.value) {
                return;
            }
            const value = this.AFMakeNumber(event.value);
            if (value === null) {
                return;
            }
            bGreaterThan = !!bGreaterThan;
            bLessThan = !!bLessThan;
            if (bGreaterThan) {
                nGreaterThan = this.AFMakeNumber(nGreaterThan);
                if (nGreaterThan === null) {
                    return;
                }
            }
            if (bLessThan) {
                nLessThan = this.AFMakeNumber(nLessThan);
                if (nLessThan === null) {
                    return;
                }
            }
            let err = '';
            if (bGreaterThan && bLessThan) {
                if (value < nGreaterThan || value > nLessThan) {
                    err = this._util.printf(a.GlobalConstants.IDS_GT_AND_LT, nGreaterThan, nLessThan);
                }
            } else if (bGreaterThan) {
                if (value < nGreaterThan) {
                    err = this._util.printf(a.GlobalConstants.IDS_GREATER_THAN, nGreaterThan);
                }
            } else if (value > nLessThan) {
                err = this._util.printf(a.GlobalConstants.IDS_LESS_THAN, nLessThan);
            }
            if (err) {
                this._app.alert(err);
                event.rc = false;
            }
        }
        AFSimple(cFunction, nValue1, nValue2) {
            const value1 = this.AFMakeNumber(nValue1);
            if (value1 === null) {
                throw new Error('Invalid nValue1 in AFSimple');
            }
            const value2 = this.AFMakeNumber(nValue2);
            if (value2 === null) {
                throw new Error('Invalid nValue2 in AFSimple');
            }
            switch (cFunction) {
            case 'AVG':
                return (value1 + value2) / 2;
            case 'SUM':
                return value1 + value2;
            case 'PRD':
                return value1 * value2;
            case 'MIN':
                return Math.min(value1, value2);
            case 'MAX':
                return Math.max(value1, value2);
            }
            throw new Error('Invalid cFunction in AFSimple');
        }
        AFSimple_Calculate(cFunction, cFields) {
            const actions = {
                AVG: args => args.reduce((acc, value) => acc + value, 0) / args.length,
                SUM: args => args.reduce((acc, value) => acc + value, 0),
                PRD: args => args.reduce((acc, value) => acc * value, 1),
                MIN: args => args.reduce((acc, value) => Math.min(acc, value), Number.MAX_VALUE),
                MAX: args => args.reduce((acc, value) => Math.max(acc, value), Number.MIN_VALUE)
            };
            if (!(cFunction in actions)) {
                throw new TypeError('Invalid function in AFSimple_Calculate');
            }
            const event = globalThis.event;
            const values = [];
            for (const cField of cFields) {
                const field = this._document.getField(cField);
                const number = this.AFMakeNumber(field.value);
                if (number !== null) {
                    values.push(number);
                }
            }
            if (values.length === 0) {
                event.value = cFunction === 'PRD' ? 1 : 0;
                return;
            }
            const res = actions[cFunction](values);
            event.value = Math.round(1000000 * res) / 1000000;
        }
        AFSpecial_Format(psf) {
            const event = globalThis.event;
            if (!event.value) {
                return;
            }
            psf = this.AFMakeNumber(psf);
            if (psf === null) {
                throw new Error('Invalid psf in AFSpecial_Format');
            }
            let formatStr = '';
            switch (psf) {
            case 0:
                formatStr = '99999';
                break;
            case 1:
                formatStr = '99999-9999';
                break;
            case 2:
                if (this._util.printx('9999999999', event.value).length >= 10) {
                    formatStr = '(999) 999-9999';
                } else {
                    formatStr = '999-9999';
                }
                break;
            case 3:
                formatStr = '999-99-9999';
                break;
            default:
                throw new Error('Invalid psf in AFSpecial_Format');
            }
            event.value = this._util.printx(formatStr, event.value);
        }
        AFSpecial_KeystrokeEx(cMask) {
            if (!cMask) {
                return;
            }
            const event = globalThis.event;
            const value = this.AFMergeChange(event);
            const checkers = new Map([
                [
                    '9',
                    char => char >= '0' && char <= '9'
                ],
                [
                    'A',
                    char => 'a' <= char && char <= 'z' || 'A' <= char && char <= 'Z'
                ],
                [
                    'O',
                    char => 'a' <= char && char <= 'z' || 'A' <= char && char <= 'Z' || '0' <= char && char <= '9'
                ],
                [
                    'X',
                    char => true
                ]
            ]);
            function _checkValidity(_value, _cMask) {
                for (let i = 0, ii = value.length; i < ii; i++) {
                    const mask = _cMask.charAt(i);
                    const char = _value.charAt(i);
                    const checker = checkers.get(mask);
                    if (checker) {
                        if (!checker(char)) {
                            return false;
                        }
                    } else if (mask !== char) {
                        return false;
                    }
                }
                return true;
            }
            if (!value) {
                return;
            }
            const err = `${ a.GlobalConstants.IDS_INVALID_VALUE } = "${ cMask }"`;
            if (value.length > cMask.length) {
                this._app.alert(err);
                event.rc = false;
                return;
            }
            if (event.willCommit) {
                if (value.length < cMask.length) {
                    this._app.alert(err);
                    event.rc = false;
                    return;
                }
                if (!_checkValidity(value, cMask)) {
                    this._app.alert(err);
                    event.rc = false;
                    return;
                }
                event.value += cMask.subString(value.length);
                return;
            }
            if (value.length < cMask.length) {
                cMask = cMask.substring(0, value.length);
            }
            if (!_checkValidity(value, cMask)) {
                this._app.alert(err);
                event.rc = false;
            }
        }
        AFSpecial_Keystroke(psf) {
            const event = globalThis.event;
            if (!event.value) {
                return;
            }
            psf = this.AFMakeNumber(psf);
            if (psf === null) {
                throw new Error('Invalid psf in AFSpecial_Keystroke');
            }
            let formatStr;
            switch (psf) {
            case 0:
                formatStr = '99999';
                break;
            case 1:
                formatStr = '99999-9999';
                break;
            case 2:
                const finalLen = event.value.length + event.change.length + event.selStart - event.selEnd;
                if (finalLen >= 8) {
                    formatStr = '(999) 999-9999';
                } else {
                    formatStr = '999-9999';
                }
                break;
            case 3:
                formatStr = '999-99-9999';
                break;
            default:
                throw new Error('Invalid psf in AFSpecial_Keystroke');
            }
            this.AFSpecial_KeystrokeEx(formatStr);
        }
        AFTime_FormatEx(cFormat) {
            this.AFDate_FormatEx(cFormat);
        }
        AFTime_Format(pdf) {
            if (pdf >= 0 && pdf < this._timeFormats.length) {
                this.AFDate_FormatEx(this._timeFormats[pdf]);
            }
        }
        AFTime_KeystrokeEx(cFormat) {
            this.AFDate_KeystrokeEx(cFormat);
        }
        AFTime_Keystroke(pdf) {
            if (pdf >= 0 && pdf < this._timeFormats.length) {
                this.AFDate_KeystrokeEx(this._timeFormats[pdf]);
            }
        }
        eMailValidate(str) {
            return this._emailRegex.test(str);
        }
    }
    return { AForm };
});
define(function () {
    'use strict';
    function makeColorComp(n) {
        return Math.floor(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, '0');
    }
    class ColorConverters {
        static CMYK_G([c, y, m, k]) {
            return [
                'G',
                1 - Math.min(1, 0.3 * c + 0.59 * m + 0.11 * y + k)
            ];
        }
        static G_CMYK([g]) {
            return [
                'CMYK',
                0,
                0,
                0,
                1 - g
            ];
        }
        static G_RGB([g]) {
            return [
                'RGB',
                g,
                g,
                g
            ];
        }
        static G_HTML([g]) {
            const G = makeColorComp(g);
            return `#${ G }${ G }${ G }`;
        }
        static RGB_G([r, g, b]) {
            return [
                'G',
                0.3 * r + 0.59 * g + 0.11 * b
            ];
        }
        static RGB_HTML([r, g, b]) {
            const R = makeColorComp(r);
            const G = makeColorComp(g);
            const B = makeColorComp(b);
            return `#${ R }${ G }${ B }`;
        }
        static T_HTML() {
            return '#00000000';
        }
        static CMYK_RGB([c, y, m, k]) {
            return [
                'RGB',
                1 - Math.min(1, c + k),
                1 - Math.min(1, m + k),
                1 - Math.min(1, y + k)
            ];
        }
        static CMYK_HTML(components) {
            return this.RGB_HTML(this.CMYK_RGB(components));
        }
        static RGB_CMYK([r, g, b]) {
            const c = 1 - r;
            const m = 1 - g;
            const y = 1 - b;
            const k = Math.min(c, m, y);
            return [
                'CMYK',
                c,
                m,
                y,
                k
            ];
        }
    }
    return { ColorConverters };
});
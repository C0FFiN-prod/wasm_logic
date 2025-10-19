// Конвертирует Hex (#RRGGBB) в [R, G, B] (0-255)
export function hexToRgb(hex: string): [number, number, number] {
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return [r, g, b];
}

export function rgbToHex(r: number, g: number, b: number): string {
    return "#"+r.toString(16)+g.toString(16)+b.toString(16);
}

export function luminance(r: number, g: number, b: number): number {
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function lightness(r: number, g: number, b: number) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return (max + min) / 510;
}
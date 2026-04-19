import type { Point, Rect, vec4 } from "../consts";
import { clamp } from "./utils";

export function segmentIntersectsRect(p1: Point, p2: Point, rect: Rect): boolean {
    const edges = getRectEdges(rect);

    for (const edge of edges) {
        if (segmentsIntersect(p1, p2, edge.p1, edge.p2)) {
            return true;
        }
    }

    return false;
}

export function segment90SIntersectsRect(p1: Point, p2: Point, rect: Rect): boolean {
    const pm = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

    return isNumberInBound(p1.y, rect.y0, rect.y1)
        || isNumberInBound(pm.x, rect.x0, rect.x1)
        || isNumberInBound(p2.y, rect.y0, rect.y1)
        ;
}

export function segment90LIntersectsRect(p1: Point, p2: Point, rect: Rect): boolean {
    return isNumberInBound(p1.y, rect.y0, rect.y1)
        || isNumberInBound(p2.x, rect.x0, rect.x1)
        ;
}

export function isNumberInBound(n: number, lower: number, upper: number) {
    return lower < n && n < upper;
}

export function segmentAsideRect(p1: Point, p2: Point, rect: Rect) {
    return (
        p1.x < rect.x0 && p2.x < rect.x0 ||
        p1.x > rect.x1 && p2.x > rect.x1 ||
        p1.y < rect.y0 && p2.y < rect.y0 ||
        p1.y > rect.y1 && p2.y > rect.y1
    );
}

/**
 * Проверяет, находится ли точка внутри прямоугольника
 */
export function pointInRect(p: Point, rect: Rect): boolean {
    return p.x >= rect.x0 && p.x <= rect.x1 &&
        p.y >= rect.y0 && p.y <= rect.y1;
}

/**
 * Возвращает четыре стороны прямоугольника
 */
export function getRectEdges(rect: Rect): Array<{ p1: Point, p2: Point }> {
    return [
        { p1: { x: rect.x0, y: rect.y0 }, p2: { x: rect.x1, y: rect.y0 } }, // нижняя
        { p1: { x: rect.x1, y: rect.y0 }, p2: { x: rect.x1, y: rect.y1 } }, // правая
        { p1: { x: rect.x1, y: rect.y1 }, p2: { x: rect.x0, y: rect.y1 } }, // верхняя
        { p1: { x: rect.x0, y: rect.y1 }, p2: { x: rect.x0, y: rect.y0 } }  // левая
    ];
}

/**
 * Проверяет пересечение двух отрезков
 */
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
    const orientation = (p: Point, q: Point, r: Point) => {
        return (q.y - p.y) * (r.x - q.x) > (q.x - p.x) * (r.y - q.y);
        // if (Math.abs(val) < 1e-10) return 0; // коллинеарны
        // return val > 0 ? 1 : 2;
    };

    const o1 = orientation(a, b, c);
    const o2 = orientation(a, b, d);
    const o3 = orientation(c, d, a);
    const o4 = orientation(c, d, b);

    // Общий случай
    return o1 !== o2 && o3 !== o4;
    // if (o1 !== o2 && o3 !== o4) return true;
    // if (o1 === o2 || o3 === o4) return false;

    // // Специальные случаи коллинеарности
    // if (o1 === 0 && onSegment(a, c, b)) return true;
    // if (o2 === 0 && onSegment(a, d, b)) return true;
    // if (o3 === 0 && onSegment(c, a, d)) return true;
    // if (o4 === 0 && onSegment(c, b, d)) return true;

    // return false;
}

/**
 * Проверяет, лежит ли точка q на отрезке pr
 */
export function onSegment(p: Point, q: Point, r: Point): boolean {
    return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) &&
        q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
}

/**
 * Проверяет, лежит ли точка p на отрезке a-b
 */
export function pointOnSegment(p: Point, a: Point, b: Point): boolean {
    const cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
    if (Math.abs(cross) > 1e-10) return false;

    const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
    if (dot < 0) return false;

    const squaredLength = (b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y);
    if (dot > squaredLength) return false;

    return true;
}
/**
 * @param rect [left, right, top, bottom]
 */
export function clipSegmentToRect(
    x0: number, y0: number, x1: number, y1: number,
    rect: vec4, result: vec4
) {

    const dx = x1 - x0;
    const dy = y1 - y0;

    if (dx === 0) {
        result[0] = x0;
        result[1] = clamp(y0, rect[2], rect[3]);
        result[2] = x0;
        result[3] = clamp(y1, rect[2], rect[3]);
        return;
    }

    if (dy === 0) {
        result[0] = clamp(x0, rect[1], rect[0]);
        result[1] = y0;
        result[2] = clamp(x1, rect[1], rect[0]);
        result[3] = y0;
        return;
    }

    let t0 = 0; // входная точка параметра
    let t1 = 1; // выходная точка параметра


    // Вспомогательная функция для обработки одной границы
    const clipEdge = (p: number, q: number): boolean => {
        if (p === 0) return q >= 0; // Параллельно границе
        const r = q / p;
        if (p < 0) {
            if (r > t1) return false;
            if (r > t0) t0 = r;
        } else {
            if (r < t0) return false;
            if (r < t1) t1 = r;
        }
        return true;
    };

    // Проверяем 4 границы: left, right, top, bottom
    clipEdge(-dx, x0 - rect[0]);
    clipEdge(dx, rect[1] - x0);
    clipEdge(-dy, y0 - rect[2]);
    clipEdge(dy, rect[3] - y0);

    // Если дошли сюда — отрезок частично или полностью внутри
    result[0] = x0 + t0 * dx;
    result[1] = y0 + t0 * dy;
    result[2] = x0 + t1 * dx;
    result[3] = y0 + t1 * dy;
}

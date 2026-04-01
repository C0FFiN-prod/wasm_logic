// interface Point {
//     x: number;
//     y: number;
// }

import type { Point, Rect } from "../consts";

/**
 * Проверяет, пересекает ли отрезок прямоугольник
 * Учитывает все случаи:
 * - Отрезок полностью внутри прямоугольника
 * - Отрезок пересекает границы
 * - Отрезок проходит через прямоугольник, но концы снаружи
 */
export function segmentIntersectsRect(p1: Point, p2: Point, rect: Rect): boolean {
    // Случай 1: Один из концов внутри прямоугольника
    if (pointInRect(p1, rect) || pointInRect(p2, rect)) {
        return true;
    }
    
    // Случай 2: Отрезок пересекает хотя бы одну сторону прямоугольника
    const edges = getRectEdges(rect);
    
    for (const edge of edges) {
        if (segmentsIntersect(p1, p2, edge.p1, edge.p2)) {
            return true;
        }
    }
    
    // Случай 3: Прямоугольник полностью внутри отрезка (редкий случай)
    // Проверяем, лежит ли центр прямоугольника на отрезке
    const center = {
        x: (rect.x0 + rect.x1) / 2,
        y: (rect.y0 + rect.y1) / 2
    };
    
    if (pointOnSegment(center, p1, p2)) {
        return true;
    }
    
    return false;
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
export function getRectEdges(rect: Rect): Array<{p1: Point, p2: Point}> {
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
        const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
        if (Math.abs(val) < 1e-10) return 0; // коллинеарны
        return val > 0 ? 1 : 2;
    };
    
    const o1 = orientation(a, b, c);
    const o2 = orientation(a, b, d);
    const o3 = orientation(c, d, a);
    const o4 = orientation(c, d, b);
    
    // Общий случай
    if (o1 !== o2 && o3 !== o4) return true;
    
    // Специальные случаи коллинеарности
    if (o1 === 0 && onSegment(a, c, b)) return true;
    if (o2 === 0 && onSegment(a, d, b)) return true;
    if (o3 === 0 && onSegment(c, a, d)) return true;
    if (o4 === 0 && onSegment(c, b, d)) return true;
    
    return false;
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
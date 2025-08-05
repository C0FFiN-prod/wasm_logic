// m3.ts
type Vector2 = [number, number];
type Matrix3 = Float32Array | number[];

let MatType: new (length: number) => Matrix3 = Float32Array;

/**
 * Sets the type this library creates for a Mat3
 * @param Ctor the constructor for the type. Either `Float32Array` or `Array`
 * @return previous constructor for Mat3
 */
export function setDefaultType(Ctor: new (length: number) => Matrix3): new (length: number) => Matrix3 {
    const OldType = MatType;
    MatType = Ctor;
    return OldType;
}

/**
 * Multiplies two 3x3 matrices
 * @param a First matrix
 * @param b Second matrix
 * @param dst Optional matrix to store result
 * @return Resulting matrix
 */
export function multiply(a: Matrix3, b: Matrix3, dst?: Matrix3): Matrix3 {
    dst = dst || new MatType(9);

    const a00 = a[0 * 3 + 0];
    const a01 = a[0 * 3 + 1];
    const a02 = a[0 * 3 + 2];
    const a10 = a[1 * 3 + 0];
    const a11 = a[1 * 3 + 1];
    const a12 = a[1 * 3 + 2];
    const a20 = a[2 * 3 + 0];
    const a21 = a[2 * 3 + 1];
    const a22 = a[2 * 3 + 2];

    const b00 = b[0 * 3 + 0];
    const b01 = b[0 * 3 + 1];
    const b02 = b[0 * 3 + 2];
    const b10 = b[1 * 3 + 0];
    const b11 = b[1 * 3 + 1];
    const b12 = b[1 * 3 + 2];
    const b20 = b[2 * 3 + 0];
    const b21 = b[2 * 3 + 1];
    const b22 = b[2 * 3 + 2];

    dst[0] = b00 * a00 + b01 * a10 + b02 * a20;
    dst[1] = b00 * a01 + b01 * a11 + b02 * a21;
    dst[2] = b00 * a02 + b01 * a12 + b02 * a22;
    dst[3] = b10 * a00 + b11 * a10 + b12 * a20;
    dst[4] = b10 * a01 + b11 * a11 + b12 * a21;
    dst[5] = b10 * a02 + b11 * a12 + b12 * a22;
    dst[6] = b20 * a00 + b21 * a10 + b22 * a20;
    dst[7] = b20 * a01 + b21 * a11 + b22 * a21;
    dst[8] = b20 * a02 + b21 * a12 + b22 * a22;

    return dst;
}

/**
 * Creates a 3x3 identity matrix
 * @param dst Optional matrix to store result
 * @return Identity matrix
 */
export function identity(dst?: Matrix3): Matrix3 {
    dst = dst || new MatType(9);
    dst[0] = 1;
    dst[1] = 0;
    dst[2] = 0;
    dst[3] = 0;
    dst[4] = 1;
    dst[5] = 0;
    dst[6] = 0;
    dst[7] = 0;
    dst[8] = 1;
    return dst;
}

/**
 * Creates a 2D projection matrix
 * @param width Width in pixels
 * @param height Height in pixels
 * @param dst Optional matrix to store result
 * @return Projection matrix
 */
export function projection(width: number, height: number, dst?: Matrix3): Matrix3 {
    dst = dst || new MatType(9);
    dst[0] = 2 / width;
    dst[1] = 0;
    dst[2] = 0;
    dst[3] = 0;
    dst[4] = -2 / height;
    dst[5] = 0;
    dst[6] = -1;
    dst[7] = 1;
    dst[8] = 1;
    return dst;
}

/**
 * Multiplies by a 2D projection matrix
 */
export function project(m: Matrix3, width: number, height: number, dst?: Matrix3): Matrix3 {
    return multiply(m, projection(width, height), dst);
}

/**
 * Creates a 2D translation matrix
 */
export function translation(tx: number, ty: number, dst?: Matrix3): Matrix3 {
    dst = dst || new MatType(9);
    dst[0] = 1;
    dst[1] = 0;
    dst[2] = 0;
    dst[3] = 0;
    dst[4] = 1;
    dst[5] = 0;
    dst[6] = tx;
    dst[7] = ty;
    dst[8] = 1;
    return dst;
}

/**
 * Multiplies by a 2D translation matrix
 */
export function translate(m: Matrix3, tx: number, ty: number, dst?: Matrix3): Matrix3 {
    return multiply(m, translation(tx, ty), dst);
}

/**
 * Creates a 2D rotation matrix
 */
export function rotation(angleInRadians: number, dst?: Matrix3): Matrix3 {
    const c = Math.cos(angleInRadians);
    const s = Math.sin(angleInRadians);

    dst = dst || new MatType(9);
    dst[0] = c;
    dst[1] = -s;
    dst[2] = 0;
    dst[3] = s;
    dst[4] = c;
    dst[5] = 0;
    dst[6] = 0;
    dst[7] = 0;
    dst[8] = 1;
    return dst;
}

/**
 * Multiplies by a 2D rotation matrix
 */
export function rotate(m: Matrix3, angleInRadians: number, dst?: Matrix3): Matrix3 {
    return multiply(m, rotation(angleInRadians), dst);
}

/**
 * Creates a 2D scaling matrix
 */
export function scaling(sx: number, sy: number, dst?: Matrix3): Matrix3 {
    dst = dst || new MatType(9);
    dst[0] = sx;
    dst[1] = 0;
    dst[2] = 0;
    dst[3] = 0;
    dst[4] = sy;
    dst[5] = 0;
    dst[6] = 0;
    dst[7] = 0;
    dst[8] = 1;
    return dst;
}

/**
 * Multiplies by a 2D scaling matrix
 */
export function scale(m: Matrix3, sx: number, sy: number, dst?: Matrix3): Matrix3 {
    return multiply(m, scaling(sx, sy), dst);
}

/**
 * Dot product of two 2D vectors
 */
export function dot(x1: number, y1: number, x2: number, y2: number): number {
    return x1 * x2 + y1 * y2;
}

/**
 * Distance between two points
 */
export function distance(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x1 - x2;
    const dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Normalizes a 2D vector
 */
export function normalize(x: number, y: number): Vector2 {
    const l = distance(0, 0, x, y);
    return l > 0.00001 ? [x / l, y / l] : [0, 0];
}

/**
 * Reflects an incident vector off a normal vector
 */
export function reflect(ix: number, iy: number, nx: number, ny: number): Vector2 {
    const d = dot(nx, ny, ix, iy);
    return [
        ix - 2 * d * nx,
        iy - 2 * d * ny
    ];
}

/**
 * Converts radians to degrees
 */
export function radToDeg(r: number): number {
    return r * 180 / Math.PI;
}

/**
 * Converts degrees to radians
 */
export function degToRad(d: number): number {
    return d * Math.PI / 180;
}

/**
 * Transforms a 2D point by a 3x3 matrix
 */
export function transformPoint(m: Matrix3, v: Vector2): Vector2 {
    const v0 = v[0];
    const v1 = v[1];
    const d = v0 * m[0 * 3 + 2] + v1 * m[1 * 3 + 2] + m[2 * 3 + 2];
    return [
        (v0 * m[0 * 3 + 0] + v1 * m[1 * 3 + 0] + m[2 * 3 + 0]) / d,
        (v0 * m[0 * 3 + 1] + v1 * m[1 * 3 + 1] + m[2 * 3 + 1]) / d
    ];
}

/**
 * Computes the inverse of a 3x3 matrix
 */
export function inverse(m: Matrix3, dst?: Matrix3): Matrix3 {
    dst = dst || new MatType(9);

    const m00 = m[0 * 3 + 0];
    const m01 = m[0 * 3 + 1];
    const m02 = m[0 * 3 + 2];
    const m10 = m[1 * 3 + 0];
    const m11 = m[1 * 3 + 1];
    const m12 = m[1 * 3 + 2];
    const m20 = m[2 * 3 + 0];
    const m21 = m[2 * 3 + 1];
    const m22 = m[2 * 3 + 2];

    const b01 = m22 * m11 - m12 * m21;
    const b11 = -m22 * m10 + m12 * m20;
    const b21 = m21 * m10 - m11 * m20;

    const det = m00 * b01 + m01 * b11 + m02 * b21;
    const invDet = 1.0 / det;

    dst[0] = b01 * invDet;
    dst[1] = (-m22 * m01 + m02 * m21) * invDet;
    dst[2] = (m12 * m01 - m02 * m11) * invDet;
    dst[3] = b11 * invDet;
    dst[4] = (m22 * m00 - m02 * m20) * invDet;
    dst[5] = (-m12 * m00 + m02 * m10) * invDet;
    dst[6] = b21 * invDet;
    dst[7] = (-m21 * m00 + m01 * m20) * invDet;
    dst[8] = (m11 * m00 - m01 * m10) * invDet;

    return dst;
}

export default {
    setDefaultType,
    multiply,
    identity,
    projection,
    project,
    translation,
    translate,
    rotation,
    rotate,
    scaling,
    scale,
    dot,
    distance,
    normalize,
    reflect,
    radToDeg,
    degToRad,
    transformPoint,
    inverse
};
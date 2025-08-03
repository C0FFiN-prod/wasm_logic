import {
    camera, canvas, gridSize,
    worldToTranslatedScreen, worldToScreen,
    isSelecting, selectionEnd, selectionStart,
    selectedElements, selectedSources, selectedTargets,
    selectedTool, circuit,
    type Point
} from "./main";

let gl: WebGLRenderingContext;

export function initContext() {
    let t = canvas.getContext('webgl');
    if (!t) {
        throw "WebGL context could not be loaded";
    }
    gl = t;
}

/**
 * Умножает две матрицы 3x3, представленные как Float32Array (вытянутые в строку)
 * @param a Первая матрица (Float32Array из 9 элементов)
 * @param b Вторая матрица (Float32Array из 9 элементов)
 * @returns Результат умножения (Float32Array из 9 элементов)
 */
function multiplyMatrix3(a: Float32Array, b: Float32Array): Float32Array {
    const out = new Float32Array(9);
    for (let row = 0; row < 3; ++row) {
        for (let col = 0; col < 3; ++col) {
            out[row * 3 + col] =
                a[row * 3 + 0] * b[0 * 3 + col] +
                a[row * 3 + 1] * b[1 * 3 + col] +
                a[row * 3 + 2] * b[2 * 3 + col];
        }
    }
    return out;
}


function makeViewMatrix(cx: number, cy: number): Float32Array {
    return new Float32Array([
        1, 0, 0,
        0, 1, 0,
        -cx, -cy, 1
    ]);
}

function makeOrthoProjection(vw: number, vh: number): Float32Array {
    return new Float32Array([
        2 / vw, 0, 0,
        0, -2 / vh, 0,
        -1, 1, 1
    ]);
}

function makeModelMatrix(x: number, y: number, sx: number, sy: number): Float32Array {
    return new Float32Array([
        sx, 0, 0,
        0, sy, 0,
        x, y, 1
    ]);
}



function make2DMatrix(
    translateX: number,
    translateY: number,
    scaleX: number,
    scaleY: number
): Float32Array {
    return new Float32Array([
        scaleX, 0, 0,
        0, scaleY, 0,
        translateX, translateY, 1
    ]);
}



export function draw() {
    gl.viewport(0, 0, canvas.width, canvas.height);

    const aspect = canvas.width / canvas.height;
    const scale = 0.5; // в пределах [-1, 1]
    const sx = scale;
    const sy = scale * aspect;

    const matrix = make2DMatrix(0.0, 0.0, sx, sy); // по центру




    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

    const program = gl.createProgram()!;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        return;
    }
    gl.useProgram(program);
    const view = makeViewMatrix(camera.x, camera.y);
    const proj = makeOrthoProjection(canvas.width/camera.zoom, canvas.height/camera.zoom);
    const model = makeModelMatrix(10, 10, 100, 100); // для объекта

    const viewProj = multiplyMatrix3(proj, view);
    const finalMatrix = multiplyMatrix3(viewProj, model);

    const uMatrixLoc = gl.getUniformLocation(program, "u_matrix");
    gl.uniformMatrix3fv(uMatrixLoc, false, finalMatrix);

    const buffer_vertices = gl.createBuffer();
    const buffer_colors = gl.createBuffer();

    // a_position
    const aPosition = gl.getAttribLocation(program, "a_position");
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer_vertices);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    // a_color
    const aColors = gl.getAttribLocation(program, "a_color");
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer_colors);
    gl.enableVertexAttribArray(aColors);
    gl.vertexAttribPointer(aColors, 3, gl.FLOAT, false, 0, 0);


    gl.drawArrays(gl.TRIANGLES, 0, 3);

}



const vertices = new Float32Array([
    -0.5, -0.5,   // вершина 1
    0.5, -0.5,   // вершина 2
    0.0, 0.866    // вершина 3
]);

const colors = new Float32Array([
    1.0, 0.0, 0.0,  // красный
    0.0, 1.0, 0.0,  // зелёный
    0.0, 0.0, 1.0   // синий
]);



const vertexShaderSource = `
attribute vec2 a_position;
attribute vec3 a_color;

uniform mat3 u_matrix;

varying vec3 v_color;

void main() {
  vec3 pos = u_matrix * vec3(a_position, 1);
  gl_Position = vec4(pos.xy, 0.0, 1.0);
  v_color = a_color;
}


`;
const fragmentShaderSource = `
    precision mediump float;
    varying vec3 v_color;

    void main() {
    gl_FragColor = vec4(v_color, 1.0);
    }
`;
function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
}



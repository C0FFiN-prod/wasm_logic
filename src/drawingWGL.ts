import {
    camera, canvas, gridSize,
    worldToTranslatedScreen, worldToScreen,
    isSelecting, selectionEnd, selectionStart,
    selectedElements, selectedSources, selectedTargets,
    selectedTool, circuit,
    type Point
} from "./main";
import m3 from './m3';

let gl: WebGLRenderingContext;
let program: WebGLProgram | null;
let positionAttributeLocation: GLint;
let colorAttributeLocation: GLint;
let colorUniformLocation: WebGLUniformLocation | null;
let matrixLocation: WebGLUniformLocation | null;
let resolutionLocation: WebGLUniformLocation | null;
let positionBuffer: WebGLBuffer;
let colorBuffer: WebGLBuffer;

function createProgram(gl: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader) {
    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    var success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (success) {
        return program;
    }

    console.log(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
}


export function initContext() {
    let t = canvas.getContext('webgl');
    if (!t) {
        throw "WebGL context could not be loaded";
    }
    gl = t;
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    if (!(program = createProgram(gl, vertexShader, fragmentShader)))
        throw "Program wasn't created";
    gl.useProgram(program);

    // look up where the vertex data needs to go.
    positionAttributeLocation = gl.getAttribLocation(program, "a_position");
    colorAttributeLocation = gl.getAttribLocation(program, "a_color");

    // lookup uniforms
    matrixLocation = gl.getUniformLocation(program, "u_matrix");
    resolutionLocation = gl.getUniformLocation(program, "u_resolution");

    // Create a buffer to put three 2d clip space points in
    positionBuffer = gl.createBuffer();
    colorBuffer = gl.createBuffer();
    requestAnimationFrame(draw);
}



function resize() {
    var realToCSSPixels = window.devicePixelRatio;

    // Берём заданный браузером размер canvas в CSS-пикселях и вычисляем нужный
    // нам размер, чтобы буфер отрисовки совпадал с ним в действительных пикселях
    var displayWidth = Math.floor((gl.canvas as HTMLCanvasElement).clientWidth * realToCSSPixels);
    var displayHeight = Math.floor((gl.canvas as HTMLCanvasElement).clientHeight * realToCSSPixels);

    //  проверяем, отличается ли размер canvas
    if (gl.canvas.width !== displayWidth ||
        gl.canvas.height !== displayHeight) {

        // подгоняем размер буфера отрисовки под размер HTML-элемента
        gl.canvas.width = displayWidth;
        gl.canvas.height = displayHeight;
    }
}
type vec3 = [number, number, number];
export function draw() {
    if (!program) {
        return;
    }

    // // Compute the matrix
    let matrix = m3.projection(canvas.clientWidth, canvas.clientHeight);
    matrix = m3.translate(matrix, -camera.x * camera.zoom, -camera.y * camera.zoom);
    matrix = m3.scale(matrix, camera.zoom, camera.zoom);
    gl.uniformMatrix3fv(matrixLocation, false, matrix);


    gl.uniform2f(resolutionLocation, gl.canvas.width, gl.canvas.height);


    colorUniformLocation = gl.getUniformLocation(program, "u_color");


    resize();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // a_position
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    const linesCount = drawGrid();
    gl.drawArrays(gl.LINES, 0, linesCount);


    const colorOn:vec3 = [0.066, 0.332, 0.797];
    const colorOff:vec3 = [0.2, 0.2, 0.2];
    for (const el of circuit.elements) {
        gl.uniform4f(colorUniformLocation, ...(el.value ? colorOn : colorOff), 1);
        let { x, y } = worldToTranslatedScreen(el.x, el.y);
        setRectangle(x, y, gridSize, gridSize);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

    }






}

function drawGrid() {
    gl.uniform4f(colorUniformLocation, 0,0,0, 1);
    gl.lineWidth(1 / camera.zoom);

    const left = camera.x;
    const top = camera.y;
    const right = camera.x + canvas.width / camera.zoom;
    const bottom = camera.y + canvas.height / camera.zoom;

    const startX = Math.floor(left / gridSize) * gridSize;
    const startY = Math.floor(top / gridSize) * gridSize;
    const lines = new Float32Array(
        Math.ceil((right - startX) / gridSize) * 4 +
        Math.ceil((bottom - startY) / gridSize) * 4);
    let i = 0;
    for (let x = startX; x <= right; x += gridSize, ++i) {
        lines[i * 4 + 0] = x;
        lines[i * 4 + 1] = top;
        lines[i * 4 + 2] = x;
        lines[i * 4 + 3] = bottom;
    }

    for (let y = startY; y <= bottom; y += gridSize, ++i) {
        lines[i * 4 + 0] = left;
        lines[i * 4 + 1] = y;
        lines[i * 4 + 2] = right;
        lines[i * 4 + 3] = y;
    }
    gl.bufferData(gl.ARRAY_BUFFER, lines, gl.STATIC_DRAW);
    return lines.length;
}


function setRectangle(x: number, y: number, width: number, height: number) {
    var x1 = x;
    var x2 = x + width;
    var y1 = y;
    var y2 = y + height;

    // ПРИМ.: gl.bufferData(gl.ARRAY_BUFFER, ...) воздействует
    // на буфер, который привязан к точке привязке `ARRAY_BUFFER`,
    // но таким образом у нас будет один буфер. Если бы нам понадобилось
    // несколько буферов, нам бы потребовалось привязать их сначала к `ARRAY_BUFFER`.

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        x1, y1,
        x2, y1,
        x1, y2,
        x1, y2,
        x2, y1,
        x2, y2]), gl.STATIC_DRAW);
}


const vertices = new Float32Array([
    10, 20,
    80, 20,
    10, 30,
    10, 30,
    80, 20,
    80, 30,
]);

const colors = new Float32Array([
    1.0, 0.0, 0.0,  // red
    1.0, 1.0, 0.0,   // yellow
    0.0, 1.0, 0.0,  // green
    0.0, 1.0, 1.0,   // cyan
    0.0, 0.0, 1.0,   // blue
    1.0, 0.0, 1.0,   // magenta
]);



const vertexShaderSource = `
attribute vec2 a_position;

uniform mat3 u_matrix;
// uniform vec2 u_resolution;

void main() {
// Multiply the position by the matrix.
  gl_Position = vec4((u_matrix * vec3(a_position, 1)).xy, 0, 1);
}


`;
const fragmentShaderSource = `
    precision mediump float;
    uniform vec4 u_color;

    void main() {
        gl_FragColor = u_color;
    }
`;
function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
}



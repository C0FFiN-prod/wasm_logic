import {
    camera, canvas, gridSize,
    worldToTranslatedScreen, screenToWorld, worldToScreen,
    isSelecting, selectionEnd, selectionStart,
    selectedElements, selectedSources, selectedTargets,
    selectedTool, circuit,
    type Point
} from "./main";
import m3 from './m3';
import type { LogicElement } from "./logic";


const colors: {
    grid: vec3,
    on: vec3,
    off: vec3,
    wires: vec3,
    tempWires: vec3,
    border: vec3,
    selection: vec3,
    source: vec3,
    target: vec3,
} = {
    grid: [0, 0, 0],
    on: [0.066, 0.332, 0.797],
    off: [0.2, 0.2, 0.2],
    wires: [0.531, 0.531, 0.531],
    tempWires: [1, 0.664, 0],
    border: [0.332, 0.332, 0.332],
    selection: [0.066, 0.598, 1],
    source: [0, 1, 0],
    target: [1, 0, 0],
}

type Program = {
    program: WebGLProgram | null,
    attributeLocations: {
        position: GLint,
        instancePos?: GLint,
    },
    uniformLocations: {
        color?: WebGLUniformLocation | null,
        matrix?: WebGLUniformLocation | null,
    }
};
let gl: WebGL2RenderingContext;
let program: Program;

const programs: {
    elements?: Program,
    translated?: Program,
    icons?: Program,
    selectionRect?: Program,
} = {};
const buffers: {
    position?: WebGLBuffer;
    color?: WebGLBuffer;
    instance?: WebGLBuffer;
} = {};

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
    let t = canvas.getContext('webgl2');
    if (!t) {
        throw "WebGL context could not be loaded";
    }
    gl = t;

    const elementVertexShader = createShader(gl, gl.VERTEX_SHADER, elementVertexShaderSource);
    const translatedVertexShader = createShader(gl, gl.VERTEX_SHADER, translatedVertexShaderSource);
    const plainVertexShader = createShader(gl, gl.VERTEX_SHADER, plainVertexShaderSource);
    const plainFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, plainFragmentShaderSource);
    let program: WebGLProgram | null;

    if (!(program = createProgram(gl, elementVertexShader, plainFragmentShader)))
        throw "Elements program wasn't created";

    programs.elements = {
        program: program,
        attributeLocations: {
            position: gl.getAttribLocation(program, "a_position"),
            instancePos: gl.getAttribLocation(program, "a_instancePos"),
        },
        uniformLocations: {
            color: gl.getUniformLocation(program, "u_color"),
            matrix: gl.getUniformLocation(program, "u_matrix"),
        },
    };

    if (!(program = createProgram(gl, translatedVertexShader, plainFragmentShader)))
        throw "Translated program wasn't created";

    programs.translated = {
        program: program,
        attributeLocations: {
            position: gl.getAttribLocation(program, "a_position"),
        },
        uniformLocations: {
            color: gl.getUniformLocation(program, "u_color"),
            matrix: gl.getUniformLocation(program, "u_matrix"),
        },
    };

    buffers.position = gl.createBuffer();
    buffers.color = gl.createBuffer();
    buffers.instance = gl.createBuffer();
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
    if (!programs.translated) return;
    program = programs.translated;
    gl.useProgram(program.program);
    // // Compute the matrix
    let matrix = m3.projection(canvas.clientWidth, canvas.clientHeight);
    matrix = m3.translate(matrix, -camera.x * camera.zoom, -camera.y * camera.zoom);
    matrix = m3.scale(matrix, camera.zoom, camera.zoom);
    gl.uniformMatrix3fv(program.uniformLocations.matrix || null, false, matrix);

    resize();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // a_position
    gl.enableVertexAttribArray(program.attributeLocations.position);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position || null);
    gl.vertexAttribPointer(program.attributeLocations.position, 2, gl.FLOAT, false, 0, 0);
    drawGrid();
    if (selectedTool === 'connect')
        drawWires();



    if (!programs.elements) return;
    program = programs.elements;
    gl.useProgram(program.program);
    gl.uniformMatrix3fv(program.uniformLocations.matrix || null, false, matrix);
    let elementsOn = new Array<LogicElement>();
    let elementsOff = new Array<LogicElement>();
    const h = gridSize * camera.zoom;
    const cameraWorld = screenToWorld(camera.x, camera.y);
    const vh = canvas.height / h + 1;
    const vw = canvas.width / h + 1;
    circuit.elements.forEach(el => {
        if (el.value)
            elementsOn.push(el);
        else
            elementsOff.push(el);

    });
    if (!program.attributeLocations.instancePos) return;
    gl.enableVertexAttribArray(program.attributeLocations.position);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position || null);
    gl.vertexAttribPointer(program.attributeLocations.position, 2, gl.FLOAT, false, 0, 0);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        0, 0,
        0, gridSize,
        gridSize, 0,
        gridSize, gridSize,
    ]), gl.STATIC_DRAW);

    gl.enableVertexAttribArray(program.attributeLocations.instancePos);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.instance || null);
    gl.vertexAttribPointer(program.attributeLocations.instancePos, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(program.attributeLocations.instancePos, 1);

    if (elementsOn)
        drawElements(elementsOn, elementsOn.length, colors.on);
    if (elementsOff)
        drawElements(elementsOff, elementsOff.length, colors.off);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position || null);
    gl.vertexAttribPointer(program.attributeLocations.position, 2, gl.FLOAT, false, 0, 0);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        0, 0,
        0, gridSize,
        gridSize, gridSize,
        gridSize, 0,
    ]), gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.instance || null);
    gl.vertexAttribPointer(program.attributeLocations.instancePos, 2, gl.FLOAT, false, 0, 0);


    drawBorders(circuit.elements, circuit.elements.length, colors.border);
    if (selectedTool === 'connect') {
        if (selectedSources)
            drawBorders(selectedSources, selectedSources.size, colors.source);
        if (selectedTargets)
            drawBorders(selectedTargets, selectedTargets.size, colors.target);
    } else {
        if (selectedElements)
            drawBorders(selectedElements, selectedElements.size, colors.selection);
    }


}

function drawGrid() {
    if (!program.uniformLocations) return;
    gl.uniform4f(program.uniformLocations.color || null, ...(colors.grid), 1);
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
    gl.drawArrays(gl.LINES, 0, lines.length/2);
}


function drawBorders(iterable: Iterable<LogicElement>, count: number, color: vec3) {
    if (!program.uniformLocations) return;
    gl.uniform4f(program.uniformLocations.color || null, ...(color), 1);
    gl.lineWidth(2 / camera.zoom);
    let instancesPos = getPositionsArray(iterable, count);
    gl.bufferData(gl.ARRAY_BUFFER, instancesPos, gl.STATIC_DRAW);
    gl.drawArraysInstanced(gl.LINE_LOOP, 0, 4, count);

}

function drawElements(iterable: Iterable<LogicElement>, count: number, color: vec3) {
    if (!program.uniformLocations) return;
    gl.uniform4f(program.uniformLocations.color || null, ...(color), 1);
    let instancesPos = getPositionsArray(iterable, count);
    gl.bufferData(gl.ARRAY_BUFFER, instancesPos, gl.STATIC_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
}

function drawWires() {
    if (!program.uniformLocations) return;
    gl.uniform4f(program.uniformLocations.color || null, ...(colors.wires), 1);
    gl.lineWidth(1 / camera.zoom);
    let lines = new Float32Array(circuit.wires.size * 4);
    let i = 0;
    for (const [_, wire] of circuit.wires) {
        let start = worldToTranslatedScreen(wire.from.x, wire.from.y);
        let end = worldToTranslatedScreen(wire.to.x, wire.to.y);
        lines[i * 4 + 0] = start.x + gridSize;
        lines[i * 4 + 1] = start.y + gridSize * .5;
        lines[i * 4 + 2] = end.x;
        lines[i * 4 + 3] = end.y + gridSize * .5;
        ++i;
    }
    gl.bufferData(gl.ARRAY_BUFFER, lines, gl.STATIC_DRAW);
    gl.drawArrays(gl.LINES, 0, lines.length/2);

    if (selectedSources.size > 0 && selectedTargets.size > 0) {
        gl.uniform4f(program.uniformLocations.color || null, ...(colors.tempWires), 1);
        lines = new Float32Array(selectedSources.size * selectedTargets.size * 4);
        i = 0;
        for (const source of selectedSources) {
            for (const target of selectedTargets) {
                let start = worldToTranslatedScreen(source.x, source.y);
                let end = worldToTranslatedScreen(target.x, target.y);
                lines[i * 4 + 0] = start.x + gridSize;
                lines[i * 4 + 1] = start.y + gridSize * .5;
                lines[i * 4 + 2] = end.x;
                lines[i * 4 + 3] = end.y + gridSize * .5;
                ++i;
            }
        }
        gl.bufferData(gl.ARRAY_BUFFER, lines, gl.STATIC_DRAW);
        gl.drawArrays(gl.LINES, 0, lines.length/2);
    }
}

const elementVertexShaderSource = `
    attribute vec2 a_position;
    attribute vec2 a_instancePos;

    uniform mat3 u_matrix;

    void main() {
        gl_Position = vec4((u_matrix * vec3(a_position + a_instancePos, 1)).xy, 0, 1);
    }
`;
const translatedVertexShaderSource = `
    attribute vec2 a_position;

    uniform mat3 u_matrix;

    void main() {
        gl_Position = vec4((u_matrix * vec3(a_position, 1)).xy, 0, 1);
    }
`;
const plainVertexShaderSource = `
    attribute vec2 a_position;

    void main() {
        gl_Position = vec4(a_position, 0, 1);
    }
`;
const plainFragmentShaderSource = `
    precision mediump float;
    uniform vec4 u_color;

    void main() {
        gl_FragColor = u_color;
    }
`;
function getPositionsArray(arr: Iterable<LogicElement>, n: number) {
    let instancesPos = new Float32Array(n * 2);
    let i = 0;
    for (const el of arr) {
        const { x, y } = worldToTranslatedScreen(el.x, el.y);
        instancesPos[i * 2 + 0] = x;
        instancesPos[i * 2 + 1] = y;
        ++i;
    }
    return instancesPos;
}

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
}





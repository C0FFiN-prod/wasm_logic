import {
    camera, canvas, gridSize,
    worldToTranslatedScreen, screenToWorld, worldToScreen,
    isSelecting, selectionEnd, selectionStart,
    selectedElements, selectedSources, selectedTargets,
    selectedTool, ShowWiresMode, showWiresMode, circuit,
    type Point,
    elementUnderCursor
} from "./main";
import m3 from './m3';
import type { LogicElement, LogicGate } from "./logic";
import { gateModeToType, gateTypeToMode, pathMap } from "./consts";


const colors: Record<string, vec4> = {
    grid: [0, 0, 0, 1],
    on: [0.066, 0.332, 0.797, 1],
    off: [0.2, 0.2, 0.2, 1],
    wires: [0.531, 0.531, 0.531, 1],
    tempWires: [1, 0.664, 0, 1],
    border: [0.332, 0.332, 0.332, 1],
    selection: [0.066, 0.598, 1, 1],
    source: [0, 1, 0, 1],
    target: [1, 0, 0, 1],
}

type Program = {
    program: WebGLProgram | null,
    attributes: Record<string, GLint>,
    uniforms: Record<string, WebGLUniformLocation | null>
};
let gl: WebGL2RenderingContext;
let program: Program;
let texture: WebGLTexture;

const programs: {
    elements?: Program,
    translated?: Program,
    icons?: Program,
    plain?: Program,
} = {};
const buffers: {
    position?: WebGLBuffer;
    color?: WebGLBuffer;
    instance?: WebGLBuffer;
    texcoord?: WebGLBuffer;
} = {};
const vaos: Record<string, WebGLVertexArrayObject> = {};
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
    // iconCanvas.style = "position: absolute; bottom: 0; left:0;";
    // document.querySelector('body')?.appendChild(iconCanvas);

    let t = canvas.getContext('webgl2');
    if (!t) {
        throw "WebGL context could not be loaded";
    }
    gl = t;

    const elementVertexShader = createShader(gl, gl.VERTEX_SHADER, elementVertexShaderSource);
    const translatedVertexShader = createShader(gl, gl.VERTEX_SHADER, translatedVertexShaderSource);
    const iconVertexShader = createShader(gl, gl.VERTEX_SHADER, iconVertexShaderSource);
    const plainVertexShader = createShader(gl, gl.VERTEX_SHADER, plainVertexShaderSource);
    const iconFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, iconFragmentShaderSource);
    const plainFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, plainFragmentShaderSource);
    let program: WebGLProgram | null;

    if (!(program = createProgram(gl, elementVertexShader, plainFragmentShader)))
        throw "Elements program wasn't created";

    programs.elements = {
        program: program,
        attributes: {
            position: gl.getAttribLocation(program, "a_position"),
            instancePos: gl.getAttribLocation(program, "a_instancePos"),
        },
        uniforms: {
            color: gl.getUniformLocation(program, "u_color"),
            matrix: gl.getUniformLocation(program, "u_matrix"),
        },
    };

    if (!(program = createProgram(gl, translatedVertexShader, plainFragmentShader)))
        throw "Translated program wasn't created";

    programs.translated = {
        program: program,
        attributes: {
            position: gl.getAttribLocation(program, "a_position"),
        },
        uniforms: {
            color: gl.getUniformLocation(program, "u_color"),
            matrix: gl.getUniformLocation(program, "u_matrix"),
        },
    };
    if (!(program = createProgram(gl, iconVertexShader, iconFragmentShader)))
        throw "Icon program wasn't created";

    programs.icons = {
        program: program,
        attributes: {
            position: gl.getAttribLocation(program, "a_position"),
            instancePos: gl.getAttribLocation(program, "a_instancePos"),
            texcoord: gl.getAttribLocation(program, "a_texcoord"),
        },
        uniforms: {
            iconSize: gl.getUniformLocation(program, "u_iconSize"),
            textureSize: gl.getUniformLocation(program, "u_textureSize"),
            textureStep: gl.getUniformLocation(program, "u_textureStep"),
            matrix: gl.getUniformLocation(program, "u_matrix"),
            texture: gl.getUniformLocation(program, "u_texture"),
        }
    };
    if (!(program = createProgram(gl, plainVertexShader, plainFragmentShader)))
        throw "Plain program wasn't created";

    programs.plain = {
        program: program,
        attributes: {
            position: gl.getAttribLocation(program, "a_position"),
        },
        uniforms: {
            color: gl.getUniformLocation(program, "u_color"),
            matrix: gl.getUniformLocation(program, "u_matrix"),

        },
    };

    buffers.position = gl.createBuffer();
    buffers.color = gl.createBuffer();
    buffers.instance = gl.createBuffer();
    buffers.texcoord = gl.createBuffer();

    vaos.elements = initElements();
    vaos.icons = initIcons();
    vaos.pos2only = initPos2Only();

    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    updateIcons();
    requestAnimationFrame(draw);
}

function initPos2Only() {
    const vao = gl.createVertexArray();
    const program = programs.elements;
    if (!program) throw "Could not init pos2only VAO";
    gl.bindVertexArray(vao);

    // position
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position || null);
    gl.vertexAttribPointer(program.attributes.position, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(program.attributes.position);

    gl.bindVertexArray(null);
    return vao;
}
function initElements() {
    const vao = gl.createVertexArray();
    const program = programs.elements;
    if (!program) throw "Could not init elements VAO";
    gl.bindVertexArray(vao);

    // position
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position || null);
    gl.vertexAttribPointer(program.attributes.position, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(program.attributes.position);

    // instance data
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.instance || null);
    gl.vertexAttribPointer(program.attributes.instancePos, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(program.attributes.instancePos);
    gl.vertexAttribDivisor(program.attributes.instancePos, 1);

    gl.bindVertexArray(null);
    return vao;
}

function initIcons() {
    const vao = gl.createVertexArray();
    const program = programs.icons;
    if (!program) throw "Could not init icons VAO";
    gl.bindVertexArray(vao);
    // texcoord
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.texcoord || null);
    gl.vertexAttribPointer(program.attributes.texcoord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(program.attributes.texcoord);

    // position
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position || null);
    gl.vertexAttribPointer(program.attributes.position, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(program.attributes.position);

    // instance data
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.instance || null);
    gl.vertexAttribPointer(program.attributes.instancePos, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(program.attributes.instancePos);
    gl.vertexAttribDivisor(program.attributes.instancePos, 1);

    gl.bindVertexArray(null);
    return vao;
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
type vec4 = [number, number, number, number];
export function draw() {
    let matrix = m3.projection(canvas.clientWidth, canvas.clientHeight);
    const matrixProjection = matrix;
    matrix = m3.translate(matrix, -camera.x * camera.zoom, -camera.y * camera.zoom);
    matrix = m3.scale(matrix, camera.zoom, camera.zoom);
    const h = gridSize * camera.zoom;

    if (camera.zoom !== prevZoom) {
        updateIcons();
        prevZoom = camera.zoom;

    }

    resize();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (!programs.translated) return;
    program = programs.translated;
    gl.useProgram(program.program);
    gl.bindVertexArray(vaos.pos2only);

    gl.uniformMatrix3fv(program.uniforms.matrix, false, matrix);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position || null);
    drawGrid();
    if (showWiresMode !== ShowWiresMode.None) drawWires();

    if (!programs.elements) return;
    program = programs.elements;
    gl.useProgram(program.program);
    gl.uniformMatrix3fv(program.uniforms.matrix, false, matrix);
    let elementsOn = new Array<LogicElement>();
    let elementsOff = new Array<LogicElement>();

    const cameraWorldX = camera.x / gridSize - 1;
    const cameraWorldY = camera.y / gridSize - 1;
    const { x: wx, y: wy } = screenToWorld(canvas.clientWidth, canvas.clientHeight);

    circuit.elements.forEach(el => {
        if (
            cameraWorldX <= el.x &&
            el.x <= wx &&
            cameraWorldY <= el.y &&
            el.y <= wy
        ) {
            if (el.value)
                elementsOn.push(el);
            else
                elementsOff.push(el);
        }
    });

    gl.bindVertexArray(vaos.elements);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position || null);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        0, 0,
        0, gridSize,
        gridSize, gridSize,
        gridSize, 0,
        0, 0
    ]), gl.STATIC_DRAW);


    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.instance || null);

    if (elementsOn)
        drawElements(elementsOn, elementsOn.length, colors.on);
    if (elementsOff)
        drawElements(elementsOff, elementsOff.length, colors.off);

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

    if (!programs.icons) return;
    program = programs.icons;
    gl.useProgram(program.program);
    gl.bindVertexArray(vaos.icons);

    gl.uniformMatrix3fv(program.uniforms.matrix, false, matrix);
    gl.uniform1f(program.uniforms.iconSize, h);
    gl.uniform2f(program.uniforms.textureSize, iconCanvas.width, iconCanvas.height);
    gl.uniform2f(program.uniforms.textureStep, h / iconCanvas.width, h / iconCanvas.height);

    drawIcons();

    if (isSelecting) {
        if (!programs.plain) return;
        program = programs.plain;
        gl.useProgram(program.program);
        gl.bindVertexArray(vaos.pos2only);

        gl.uniform4fv(program.uniforms.color, colors.selection);
        gl.uniformMatrix3fv(program.uniforms.matrix, false, matrixProjection);

        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position || null);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            selectionStart.x, selectionStart.y,
            selectionStart.x, selectionEnd.y,
            selectionEnd.x, selectionEnd.y,
            selectionEnd.x, selectionStart.y,
        ]), gl.STATIC_DRAW);

        gl.drawArrays(gl.LINE_LOOP, 0, 4);
    }
    gl.bindVertexArray(null);

}

function drawIcons() {
    if (!programs.icons) return;
    const count = circuit.elements.length +
        (elementUnderCursor ? (elementUnderCursor.inputs.size + elementUnderCursor.outputs.size + 1) : 0);
    let data = new Float32Array(count * 4);
    let i = 0;
    for (const el of circuit.elements) {
        const { x, y } = worldToTranslatedScreen(el.x, el.y);
        let type = el.type === 'GATE' ? gateModeToType.get((el as LogicGate).gateType) || 'AND' : el.type

        data[i * 4 + 0] = x;
        data[i * 4 + 1] = y;
        data[i * 4 + 2] = el.value ? 1 : 0;
        data[i * 4 + 3] = iconMap.get(type.toLowerCase()) || 0;
        ++i;
    }
    if (elementUnderCursor) {
        for (const el of elementUnderCursor.inputs) {
            if (el === elementUnderCursor) continue;
            const { x, y } = worldToTranslatedScreen(el.x, el.y);
            data[i * 4 + 0] = x;
            data[i * 4 + 1] = y;
            data[i * 4 + 2] = 0;
            data[i * 4 + 3] = iconMap.get('connections') || 0;
            ++i;
        }
        for (const el of elementUnderCursor.outputs) {
            if (el === elementUnderCursor) continue;
            const { x, y } = worldToTranslatedScreen(el.x, el.y);
            data[i * 4 + 0] = x;
            data[i * 4 + 1] = y;
            data[i * 4 + 2] = 1;
            data[i * 4 + 3] = iconMap.get('connections') || 0;
            ++i;
        }
        const { x, y } = worldToTranslatedScreen(elementUnderCursor.x, elementUnderCursor.y);
        data[i * 4 + 0] = x;
        data[i * 4 + 1] = y;
        data[i * 4 + 2] = elementUnderCursor.inputs.has(elementUnderCursor) ? 1 : 0;
        data[i * 4 + 3] = iconMap.get('gate') || 0;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.texcoord || null);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(
            [
                0, 0,
                0, 1,
                1, 0,
                1, 1,
            ]),
        gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position || null);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([
            0, 0,
            0, gridSize,
            gridSize, 0,
            gridSize, gridSize,
        ]),
        gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.instance || null);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, iconCanvas);

    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);


}

function drawGrid() {
    gl.uniform4fv(program.uniforms.color, colors.grid);
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
    gl.drawArrays(gl.LINES, 0, lines.length / 2);
}


function drawBorders(iterable: Iterable<LogicElement>, count: number, color: vec4) {
    gl.uniform4fv(program.uniforms.color, color);
    gl.lineWidth(2 / camera.zoom);
    let instancesPos = getPositionsArray(iterable, count);
    gl.bufferData(gl.ARRAY_BUFFER, instancesPos, gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(gl.LINE_LOOP, 0, 4, count);

}

function drawElements(iterable: Iterable<LogicElement>, count: number, color: vec4) {
    gl.uniform4fv(program.uniforms.color, color);
    let instancesPos = getPositionsArray(iterable, count);
    gl.bufferData(gl.ARRAY_BUFFER, instancesPos, gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 5, count);
}

function drawWires() {
    gl.uniform4fv(program.uniforms.color, colors.wires);
    gl.lineWidth(1 / camera.zoom);
    if (showWiresMode === ShowWiresMode.Always ||
        showWiresMode === ShowWiresMode.Connect && selectedTool === 'connect') {
        let lines = new Float32Array(circuit.wires.size * 4);
        let i = 0;
        for (const [_, wire] of circuit.wires) {
            let start = worldToTranslatedScreen(wire.src.x, wire.src.y);
            let end = worldToTranslatedScreen(wire.dst.x, wire.dst.y);
            lines[i * 4 + 0] = start.x + gridSize;
            lines[i * 4 + 1] = start.y + gridSize * .5;
            lines[i * 4 + 2] = end.x;
            lines[i * 4 + 3] = end.y + gridSize * .5;
            ++i;
        }
        gl.bufferData(gl.ARRAY_BUFFER, lines, gl.DYNAMIC_DRAW);
        gl.drawArrays(gl.LINES, 0, lines.length / 2);
    }


    if (
        (
            showWiresMode === ShowWiresMode.Always ||
            (showWiresMode === ShowWiresMode.Connect ||
                showWiresMode === ShowWiresMode.Temporary) && selectedTool === 'connect'
        ) &&
        selectedSources.size > 0 && selectedTargets.size > 0
    ) {
        gl.uniform4fv(program.uniforms.color, colors.tempWires);
        let lines = new Float32Array(selectedSources.size * selectedTargets.size * 4);
        let i = 0;
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
        gl.drawArrays(gl.LINES, 0, lines.length / 2);
    }
}

const elementVertexShaderSource = `#version 300 es
    #pragma vscode_glsllint_stage : vert
    
    in vec2 a_position;
    in vec2 a_instancePos;

    uniform mat3 u_matrix;

    void main() {
        gl_Position = vec4((u_matrix * vec3(a_position + a_instancePos, 1)).xy, 0, 1);
    }
`;
const translatedVertexShaderSource = `#version 300 es
    #pragma vscode_glsllint_stage : vert

    in vec2 a_position;

    uniform mat3 u_matrix;

    void main() {
        gl_Position = vec4((u_matrix * vec3(a_position, 1)).xy, 0, 1);
    }
`;
const iconVertexShaderSource = `#version 300 es
    #pragma vscode_glsllint_stage : vert

    in vec2 a_position;
    in vec4 a_instancePos;
    in vec2 a_texcoord;

    uniform vec2 u_textureStep;
    uniform mat3 u_matrix;

    out vec2 v_texCoord;    
    void main() {
        gl_Position = vec4((u_matrix * vec3(a_position + a_instancePos.xy, 1)).xy, 0, 1);
        // gl_Position = vec4((u_matrix * vec3(a_position, 1)).xy, 0, 1);
        // gl_Position =  vec4(a_position, 0, 1);

        v_texCoord = vec2(
        (a_texcoord.x + a_instancePos.z) * u_textureStep.x,
        (a_texcoord.y + a_instancePos.w) * u_textureStep.y
        );
    }
`;

const iconFragmentShaderSource = `#version 300 es
    #pragma vscode_glsllint_stage : frag

    precision mediump float;

    in vec2 v_texCoord;

    uniform sampler2D u_texture;
    
    out vec4 fragColor;

    void main() {
        fragColor = texture(u_texture, v_texCoord);
    }
`;

const plainVertexShaderSource = `#version 300 es
    #pragma vscode_glsllint_stage : vert

    in vec2 a_position;

    uniform mat3 u_matrix;

    void main() {
        gl_Position =  vec4((u_matrix * vec3(a_position, 1)).xy, 0, 1);
    }
`;
const plainFragmentShaderSource = `#version 300 es
    #pragma vscode_glsllint_stage : frag

    precision mediump float;

    uniform vec4 u_color;

    out vec4 fragColor;
    
    void main() {
        fragColor = u_color;
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



let prevZoom = 1;
const iconCanvas = document.createElement('canvas');
const iconCtx = iconCanvas.getContext('2d');
const iconMap = new Map<string, number>();
function updateIcons() {
    if (!iconCtx) return;

    const zoom = camera.zoom;
    const cell = gridSize;
    const h = cell * zoom;
    const count = pathMap.size;

    iconCanvas.width = h * 2;
    iconCanvas.height = h * (count + 2); // +1 строка под текст

    iconCtx.setTransform(1, 0, 0, 1, 0, 0);
    iconCtx.clearRect(0, 0, iconCanvas.width, iconCanvas.height);
    iconCtx.scale(zoom / 2, zoom / 2);

    const baseX = cell / 2 - 1;
    const baseY = cell / 2 - 1;
    const stepY = cell * 2;

    iconCtx.translate(baseX, baseY);

    let y = 0;
    iconCtx.lineWidth = 2;
    for (const [key, path] of pathMap) {
        iconCtx.strokeStyle = '#eee';
        iconCtx.stroke(path);

        iconCtx.translate(cell * 2, 0);
        iconCtx.strokeStyle = '#19f';
        if (key === 'output' || key === 'button' || key === 'switch') {
            iconCtx.beginPath();
            iconCtx.arc(cell * 0.5 + 1, cell * 0.5 + 1, cell / 2, 0, Math.PI * 2);
            iconCtx.fillStyle = key === 'output' ? '#aa0' : '#0c0';
            iconCtx.fill();
        }
        iconCtx.stroke(path);
        iconCtx.translate(-cell * 2, 0);

        iconMap.set(key, y++);
        iconCtx.translate(0, stepY);
    }
    iconCtx.translate(-baseX, -baseY);
    // Текстовая строка
    iconMap.set('connections', y++);
    const textBoxCenterY = cell; // центр ячейки (высота cell*2, смещены на cell)
    const textFontSize = cell * 0.9;

    iconCtx.font = `${textFontSize}px sans-serif`;
    iconCtx.textAlign = 'center';
    iconCtx.textBaseline = 'middle';

    // Левая ячейка: IN
    iconCtx.fillStyle = '#0F0';
    iconCtx.fillText('IN', cell, textBoxCenterY);

    // Правая ячейка: OUT
    iconCtx.fillStyle = '#F00';
    iconCtx.fillText('OUT', cell * 3, textBoxCenterY);

    iconCtx.translate(0, stepY);
    iconMap.set('gate', y++);

    iconCtx.fillStyle = '#0FF';
    iconCtx.fillText('X', cell, textBoxCenterY);

    iconCtx.fillStyle = '#FF0';
    iconCtx.fillText('SW', cell * 3, textBoxCenterY);

}


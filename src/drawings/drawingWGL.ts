import {
    camera,
    isSelecting, selectionEnd, selectionStart,
    selectedElements,
    selectedTool, showWiresMode, circuit,
    elementUnderCursor,
    selectionColor,
    ghostElements,
    customOverlays,
    settings,
} from "../main";
import m3 from '../utils/m3';
import { type LogicGate } from "../logic";
import { borderPalette, chunkSize, colors, ConnectMode, gateModeToType, gridSize, overlayColorIndexes, ShowWiresMode, ToolMode, WireDrawings, type Point, type vec3 } from "../consts";
import { hexToRgb, luminance, lightness, screenToWorld, worldToTranslatedScreen } from "../utils/utils";
import { connectTool } from "../utils/connectionTool";
import { wireDrawingAlg, overlayIconMap } from ".";



type Program = {
    program: WebGLProgram | null,
    attributes: Record<string, GLint>,
    uniforms: Record<string, WebGLUniformLocation | null>
};
let gl: WebGL2RenderingContext;
let program: Program;
let texture: WebGLTexture;
let textures: Record<string, WebGLTexture>;

const programs: Record<string, Program> = {};
const buffers: Record<string, WebGLBuffer> = {};
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

let canvas: HTMLCanvasElement;
export function initContext(_canvas: HTMLCanvasElement) {
    canvas = _canvas;

    let t = canvas.getContext('webgl2');
    if (!t) {
        throw "WebGL context could not be loaded";
    }
    gl = t;

    const elementVertexShader = createShader(gl, gl.VERTEX_SHADER, elementVertexShaderSource);

    const translatedVertexShader = createShader(gl, gl.VERTEX_SHADER, translatedVertexShaderSource);
    // const iconVertexShader = createShader(gl, gl.VERTEX_SHADER, iconVertexShaderSource);
    const plainVertexShader = createShader(gl, gl.VERTEX_SHADER, plainVertexShaderSource);
    // const iconFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, iconFragmentShaderSource);
    const plainFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, plainFragmentShaderSource);

    const allInOneVertexShader = createShader(gl, gl.VERTEX_SHADER, allInOneVertexShaderSource);
    const allInOneFragmentShader = createShader(gl, gl.FRAGMENT_SHADER, allInOneFragmentShaderSource);
    let program: WebGLProgram | null;

    if (!(program = createProgram(gl, allInOneVertexShader, allInOneFragmentShader)))
        throw "AllInOne program wasn't created";

    programs.allInOne = {
        program: program,
        attributes: {
            mesh: gl.getAttribLocation(program, "a_mesh"),
            texcoord: gl.getAttribLocation(program, "a_texcoord"),
            instancePos: gl.getAttribLocation(program, "a_instancePos"),
            instanceAttribs: gl.getAttribLocation(program, "a_instanceAttribs"),
            fillColorIdx: gl.getAttribLocation(program, "a_fillColorIdx"),
        },
        uniforms: {
            matrix: gl.getUniformLocation(program, "u_matrix"),
            textureStep: gl.getUniformLocation(program, "u_textureStep"),
            borderThickness: gl.getUniformLocation(program, "u_borderThickness"),
            colorPalette: gl.getUniformLocation(program, "u_colorPalette"),
            icons: gl.getUniformLocation(program, "u_icons"),
            overlays: gl.getUniformLocation(program, "u_overlays"),
            gridSize: gl.getUniformLocation(program, "u_gridSize"),
            screenPxRange: gl.getUniformLocation(program, "screenPxRange"),
            drawIcons: gl.getUniformLocation(program, "u_drawIcon"),
        },
    };

    if (!(program = createProgram(gl, elementVertexShader, plainFragmentShader)))
        throw "Elements program wasn't created";

    programs.elements = {
        program: program,
        attributes: {
            mesh: gl.getAttribLocation(program, "a_mesh"),
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

    buffers.elementMesh = gl.createBuffer();
    buffers.position = gl.createBuffer();
    buffers.color = gl.createBuffer();
    buffers.instance = gl.createBuffer();
    buffers.instanceAttribs = gl.createBuffer();
    buffers.instanceFillColorIdx = gl.createBuffer();
    buffers.texcoord = gl.createBuffer();
    textures = {
        colorPalette: gl.createTexture(),
        icons: gl.createTexture(),
        overlays: gl.createTexture(),
    }
    // textures.colorPalette = gl.createTexture();
    texture = gl.createTexture();
    vaos.allInOne = initAllInOne();
    vaos.pos2only = initPos2Only();

    // gl.enable(gl.BLEND);
    // gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

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

function initAllInOne() {
    const vao = gl.createVertexArray();
    const program = programs.allInOne;
    if (!program) throw "Could not init allInOne VAO";
    gl.useProgram(program.program);
    gl.bindVertexArray(vao);
    // texcoord
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.elementMesh);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(
            [
                0, 0,
                0, gridSize,
                gridSize, 0,
                gridSize, gridSize,
            ]),
        gl.STATIC_DRAW);
    gl.vertexAttribPointer(program.attributes.mesh, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(program.attributes.mesh);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.texcoord);
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
    gl.vertexAttribPointer(program.attributes.texcoord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(program.attributes.texcoord);

    // gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    // активируем и биндим текстуру 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, textures.icons);
    gl.uniform1i(program.uniforms.icons, 0);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // активируем и биндим текстуру 1
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textures.colorPalette);
    gl.uniform1i(program.uniforms.colorPalette, 1);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // активируем и биндим текстуру 2
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, textures.overlays);
    gl.uniform1i(program.uniforms.overlays, 2);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // mesh
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.instanceAttribs);
    gl.vertexAttribIPointer(program.attributes.instanceAttribs, 1, gl.UNSIGNED_INT, 0, 0);
    gl.enableVertexAttribArray(program.attributes.instanceAttribs);
    gl.vertexAttribDivisor(program.attributes.instanceAttribs, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.instanceFillColorIdx);
    gl.vertexAttribIPointer(program.attributes.fillColorIdx, 1, gl.UNSIGNED_INT, 0, 0);
    gl.enableVertexAttribArray(program.attributes.fillColorIdx);
    gl.vertexAttribDivisor(program.attributes.fillColorIdx, 1);

    // instance data
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.instance);
    gl.vertexAttribPointer(program.attributes.instancePos, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(program.attributes.instancePos);
    gl.vertexAttribDivisor(program.attributes.instancePos, 1);

    gl.bindVertexArray(null);
    return vao;
}
let frameCnt = 0;
export function draw() {
    if (++frameCnt === 10000) {
        colorMap.clear();
        colorData = [...borderPalette];
        frameCnt = 0;
    }
    let matrix = m3.projection(canvas.clientWidth, canvas.clientHeight);
    const matrixProjection = matrix;
    matrix = m3.translate(matrix, Math.round(-camera.x), Math.round(-camera.y));
    matrix = m3.scale(matrix, camera.zoom, camera.zoom);
    const h = gridSize * camera.zoom;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(...colors.background);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (!programs.translated) return;
    program = programs.translated;
    gl.useProgram(program.program);
    gl.bindVertexArray(vaos.pos2only);

    gl.uniformMatrix3fv(program.uniforms.matrix, false, matrix);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position || null);
    drawGrid();
    if (showWiresMode !== ShowWiresMode.None) drawWires();

    if (!programs.allInOne) return;
    program = programs.allInOne;
    gl.useProgram(program.program);
    gl.bindVertexArray(vaos.allInOne);

    gl.uniform1f(program.uniforms.borderThickness, 1);
    gl.uniformMatrix3fv(program.uniforms.matrix, false, matrix);
    gl.uniform1f(program.uniforms.drawIcons, settings.drawIcons ? 1 : 0);
    gl.uniform2f(program.uniforms.gridSize, h, h);
    gl.uniform1f(program.uniforms.screenPxRange, Math.max(gridSize * camera.zoom / 24 * 1, 1));
    isColorMapUpdated = false;
    const paked = packElements();

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.instance);
    gl.bufferData(gl.ARRAY_BUFFER, paked.positions, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.instanceAttribs);
    gl.bufferData(gl.ARRAY_BUFFER, paked.attributes, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.instanceFillColorIdx);
    gl.bufferData(gl.ARRAY_BUFFER, paked.colorIndices, gl.DYNAMIC_DRAW);

    if (isColorMapUpdated) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, textures.colorPalette);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, paked.colorTexture.length / 3, 0, gl.RGB, gl.UNSIGNED_BYTE, paked.colorTexture);
    }

    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, paked.positions.length / 2);

    if (isSelecting) {
        if (!programs.plain) return;
        program = programs.plain;
        gl.useProgram(program.program);
        gl.bindVertexArray(vaos.pos2only);

        gl.uniform4fv(program.uniforms.color, selectionColor);
        gl.uniformMatrix3fv(program.uniforms.matrix, false, matrixProjection);

        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position || null);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            selectionStart.x, selectionStart.y,
            selectionStart.x, selectionEnd.y,
            selectionEnd.x, selectionEnd.y,
            selectionEnd.x, selectionStart.y,
        ]), gl.DYNAMIC_DRAW);

        gl.drawArrays(gl.LINE_LOOP, 0, 4);
    }
    gl.bindVertexArray(null);

}
function checkVertexAttributes(gl: WebGL2RenderingContext, program: WebGLProgram) {
    const attributes = ['a_mesh', 'a_instancePos', 'a_instanceAttribs', 'a_fillColorIdx'];

    attributes.forEach(attrName => {
        const location = gl.getAttribLocation(program, attrName);
        if (location === -1) {
            console.warn(`Attribute ${attrName} not found or optimized out`);
            return;
        }

        const enabled = gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_ENABLED);
        const size = gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_SIZE);
        const type = gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_TYPE);
        const stride = gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_STRIDE);
        const divisor = gl.getVertexAttrib(location, gl.VERTEX_ATTRIB_ARRAY_DIVISOR);

        console.log(`Attribute ${attrName} (location ${location}):`);
        console.log(`  Enabled: ${enabled}, Size: ${size}, Type: ${type}`);
        console.log(`  Stride: ${stride}, Divisor: ${divisor}`);
    });
}
function validateProgram(gl: WebGL2RenderingContext, program: WebGLProgram) {
    gl.validateProgram(program);
    if (!gl.getProgramParameter(program, gl.VALIDATE_STATUS)) {
        console.error('Program validation failed:', gl.getProgramInfoLog(program));
        return false;
    }

    // Check active attributes
    const numAttributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < numAttributes; i++) {
        const info = gl.getActiveAttrib(program, i);
        if (info) {
            const location = gl.getAttribLocation(program, info.name);
            console.log(`Attribute ${i}: ${info.name}, type: ${info.type}, size: ${info.size}, location: ${location}`);
        }
    }

    return true;
}

function glCheckError(gl: WebGL2RenderingContext, location: string = '') {
    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
        const errorNames: Record<number, string> = {
            [gl.INVALID_ENUM]: 'INVALID_ENUM',
            [gl.INVALID_VALUE]: 'INVALID_VALUE',
            [gl.INVALID_OPERATION]: 'INVALID_OPERATION',
            [gl.INVALID_FRAMEBUFFER_OPERATION]: 'INVALID_FRAMEBUFFER_OPERATION',
            [gl.OUT_OF_MEMORY]: 'OUT_OF_MEMORY'
        };
        console.error(`WebGL Error at ${location}: ${errorNames[error] || error}`);
        return error;
    }
    return gl.NO_ERROR;
}
const colorMap = new Map<string, vec3>();
let colorData: number[] = [...borderPalette];
let isColorMapUpdated = true;

function packElements(): {
    positions: Float32Array;
    attributes: Uint32Array;
    colorIndices: Uint32Array;
    colorTexture: Uint8Array;
} {
    const h = camera.zoom * gridSize;
    const cameraWorldX = camera.x / h - 1;
    const cameraWorldY = camera.y / h - 1;
    const { x: wx, y: wy } = screenToWorld(camera, canvas.width, canvas.height);

    const x0 = Math.floor(cameraWorldX / chunkSize);
    const y0 = Math.floor(cameraWorldY / chunkSize);
    const x1 = Math.floor(wx / chunkSize);
    const y1 = Math.floor(wy / chunkSize);
    const visibleChunks = [];
    let visibleCount = ghostElements.size;
    for (let x = x0; x <= x1; ++x) {
        for (let y = y0; y <= y1; ++y) {
            const chunk = circuit.getChunk({ x, y }, false);
            if (chunk && chunk.size > 0) {
                visibleCount += chunk.size;
                visibleChunks.push(chunk);
            }
        }
    }

    const positions = new Float32Array(visibleCount * 2);
    const attributes = new Uint32Array(visibleCount);
    const colorIndices = new Uint32Array(visibleCount);

    let nextColorIndex = colorData.length / 3;
    let i = 0;

    for (const el of ghostElements) {
        const { x, y } = worldToTranslatedScreen(camera, el.x, el.y);
        positions[i * 2] = x;
        positions[i * 2 + 1] = y;
        let isLuminant: number;
        let isBright: number;
        ({ isLuminant, isBright, nextColorIndex } = addElementToColorMap(el, nextColorIndex));
        const border = el.borderColor;
        const iconIndex = iconMap.get(el.icon)!;
        const iconOverlayIndex = overlayIconMap.get(el.overlay)!;
        const iconOverlayColor = el.overlayColor;
        attributes[i] =
            (iconOverlayColor & 0xF) << 20 |
            (iconOverlayIndex & 0xF) << 16 |
            (iconIndex & 0xF) << 8 |
            (isLuminant & 0b1) << 5 |
            (isBright & 0b1) << 4 |
            (el.value ? 1 : 0) << 3 |
            (border & 0b111);
        colorIndices[i] = colorMap.get(el.color)![0];
        ++i;
    }

    for (const chunk of visibleChunks) {
        for (const el of chunk) {
            const { x, y } = worldToTranslatedScreen(camera, el.x, el.y);
            positions[i * 2] = x;
            positions[i * 2 + 1] = y;
            let isLuminant: number;
            let isBright: number;
            ({ isLuminant, isBright, nextColorIndex } = addElementToColorMap(el, nextColorIndex));

            // Упаковка атрибутов в 32 бит
            let border = 0;
            if (connectTool.sources[2].has(el) || selectedElements.has(el))
                border = selectedTool === ToolMode.Cursor ? 1 : 5;
            else if (connectTool.sources[1].has(el) && connectTool.sources[0].has(el))
                border = 4;
            else if (connectTool.sources[0].has(el))
                border = 2;
            else if (connectTool.sources[1].has(el))
                border = 3;
            let type = (el.type === 'GATE' ? gateModeToType.get((el as LogicGate).gateType) || 'AND' : el.type).toLowerCase()
            let iconIndex = (iconMap.get(type) || 0) + Number(hasActiveIcon.has(type) && el.value);

            let iconOverlayIndex = 0;
            let iconOverlayColor = 0;
            if (customOverlays.has(el)) {
                const { icon, color } = customOverlays.get(el)!;
                iconOverlayIndex = overlayIconMap.get(icon)!;
                iconOverlayColor = color;
            } else if (elementUnderCursor) {
                if (elementUnderCursor.inputs.has(el) && elementUnderCursor === el) {
                    iconOverlayIndex = overlayIconMap.get('sw')!;
                } else if (elementUnderCursor == el) {
                    iconOverlayIndex = overlayIconMap.get('x')!;
                } else if (elementUnderCursor.inputs.has(el) && elementUnderCursor.outputs.has(el)) {
                    iconOverlayIndex = overlayIconMap.get('vv')!;
                } else if (elementUnderCursor.inputs.has(el)) {
                    iconOverlayIndex = overlayIconMap.get('in')!;
                } else if (elementUnderCursor.outputs.has(el)) {
                    iconOverlayIndex = overlayIconMap.get('out')!;
                }
                iconOverlayColor = overlayColorIndexes[iconOverlayIndex] || 0;
            }
            attributes[i] =
                (iconOverlayColor & 0xF) << 20 |
                (iconOverlayIndex & 0xF) << 16 |
                (iconIndex & 0xF) << 8 |
                (isLuminant & 0b1) << 5 |
                (isBright & 0b1) << 4 |
                (el.value ? 1 : 0) << 3 |
                (border & 0b111);
            colorIndices[i] = colorMap.get(el.color)![0];
            ++i;
        }
    }


    return {
        positions,
        attributes,
        colorIndices,
        colorTexture: new Uint8Array(colorData)
    };
}

function addElementToColorMap(el: { color: string }, nextColorIndex: number) {
    let isBright, isLuminant, color;
    if (color = colorMap.get(el.color)) {
        isLuminant = color[1];
        isBright = color[2];
    } else {
        const [r, g, b] = hexToRgb(el.color);
        const colorLuminance = luminance(r, g, b);
        const colorLightness = lightness(r, g, b);
        isLuminant = colorLuminance >= 127 ? 0 : 1;
        isBright = colorLightness >= 127 ? 0 : 1;
        colorData.push(
            Math.floor(r * 0.5 + 63.75),
            Math.floor(g * 0.5 + 63.75),
            Math.floor(b * 0.5 + 63.75)
        );
        // Оригинальный цвет (R, G, B, A=255)
        colorData.push(r, g, b);
        colorMap.set(el.color, [nextColorIndex, isLuminant, isBright]);
        nextColorIndex += 2;
        isColorMapUpdated = true;
    }
    return { isLuminant, isBright, nextColorIndex };
}

function drawGrid() {
    gl.uniform4fv(program.uniforms.color, colors.grid);
    gl.lineWidth(1 / camera.zoom);

    const left = camera.x / camera.zoom;
    const top = camera.y / camera.zoom;
    const right = (camera.x + canvas.width) / camera.zoom;
    const bottom = (camera.y + canvas.height) / camera.zoom;

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
    gl.bufferData(gl.ARRAY_BUFFER, lines, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.LINES, 0, lines.length / 2);
}

function drawWires() {
    gl.uniform4fv(program.uniforms.color, colors.wires);
    gl.lineWidth(1 / camera.zoom);
    if (showWiresMode === ShowWiresMode.Always ||
        showWiresMode === ShowWiresMode.Connect && selectedTool === ToolMode.Connect) {
        const lines: number[] = [];

        for (const [_, wire] of circuit.wires) {
            const start = worldToTranslatedScreen(camera, wire.src.x, wire.src.y);
            const end = worldToTranslatedScreen(camera, wire.dst.x, wire.dst.y);
            lines.push(...wireDrawingAlg(start, end));
        }
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.DYNAMIC_DRAW);
        gl.drawArrays(gl.LINES, 0, lines.length / 2);
    }

    if (
        showWiresMode === ShowWiresMode.Always ||
        (showWiresMode === ShowWiresMode.Connect ||
            showWiresMode === ShowWiresMode.Temporary) && selectedTool === ToolMode.Connect
    ) {
        gl.uniform4fv(program.uniforms.color, colors.tempWires);

        const lines: number[] = [];
        if (connectTool.mode === ConnectMode.NtoN) {
            if (connectTool.sources[0].size === 0 || connectTool.sources[1].size === 0) return;

            for (const source of connectTool.sources[0]) {
                for (const target of connectTool.sources[1]) {
                    const start = worldToTranslatedScreen(camera, source.x, source.y);
                    const end = worldToTranslatedScreen(camera, target.x, target.y);
                    lines.push(...wireDrawingAlg(start, end));
                }
            }
        } else if (connectTool.mode === ConnectMode.Sequence) {
            if (connectTool.sources[0].size === 0) return;
            let prevEl: Point | null = null;
            for (const el of connectTool.sources[0]) {
                if (prevEl !== null) {
                    const start = worldToTranslatedScreen(camera, prevEl.x, prevEl.y);
                    const end = worldToTranslatedScreen(camera, el.x, el.y);
                    lines.push(...wireDrawingAlg(start, end));
                }
                prevEl = el;
            }
        } else if (connectTool.mode === ConnectMode.Parallel) {
            if (connectTool.sources[0].size === 0 || connectTool.sources[1].size === 0) return;
            const sources = connectTool.sources[0].values();
            const targets = connectTool.sources[1].values();
            let source, target;
            while (
                (source = sources.next().value) !== undefined &&
                (target = targets.next().value) !== undefined
            ) {
                const start = worldToTranslatedScreen(camera, source.x, source.y);
                const end = worldToTranslatedScreen(camera, target.x, target.y);
                lines.push(...wireDrawingAlg(start, end));
            }
        } else if (connectTool.mode === ConnectMode.Decoder) {
            if (connectTool.sources[0].size === 0 || connectTool.sources[1].size === 0 || connectTool.sources[2].size === 0) return;
            const positives = (connectTool.sources[0]).values();
            const negatives = (connectTool.sources[1]).values();
            const targets = (connectTool.sources[2]);
            let positive: Point | undefined;
            let negative: Point | undefined;
            let k = 1;
            while (
                (positive = positives.next().value) !== undefined &&
                (negative = negatives.next().value) !== undefined
            ) {
                let j = k, flag = false, source = negative;
                for (const target of targets) {
                    const start = worldToTranslatedScreen(camera, source.x, source.y);
                    const end = worldToTranslatedScreen(camera, target.x, target.y);
                    lines.push(...wireDrawingAlg(start, end));
                    if (--j === 0) {
                        flag = !flag;
                        source = flag ? positive : negative;
                        j = k;
                    }
                }
                k <<= 1;
            }
        } else return;
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lines), gl.DYNAMIC_DRAW);
        gl.drawArrays(gl.LINES, 0, lines.length / 2);
    }
}

const allInOneVertexShaderSource = `#version 300 es
#pragma vscode_glsllint_stage : vert
precision mediump float;
in vec2 a_mesh;            
in vec2 a_instancePos;     
in uint a_instanceAttribs; // 32bit: [0..0][8 - iconIndex][2 - iconBlendMode][Lu>=0.5][Li>=0.5][el.value][3 - borderInd]
in uint a_fillColorIdx; 
in vec2 a_texcoord;

uniform mat3 u_matrix;
uniform vec2 u_gridSize;

uniform sampler2D u_colorPalette;

out vec2 v_localPos;

out vec3 v_iconUV;
out vec3 v_overlayUV;
flat out vec3 v_fillColor;
flat out vec3 v_borderColor;
flat out vec3 v_overlayColor;
flat out lowp float v_isLuminant;
flat out lowp float v_isActive;
flat out lowp float v_drawOverlay;
void main() {
    v_localPos = a_texcoord * u_gridSize;
    
    uint packed = uint(a_instanceAttribs);
    uint iconOverlayColorIndex = (packed >> 20) & 0xFu;
    uint iconOverlayIndex = (packed >> 16) & 0xFu;
    uint iconIndex = (packed >> 8) & 0xFu;
    v_isLuminant = float((packed >> 5) & 0x1u) - .5;
    lowp uint isBright = (packed >> 4) & 0x1u;
    lowp uint isActive = (packed >> 3) & 0x1u;
    lowp uint borderColorIdx = (packed) & 0x7u;

    v_isActive = float(isActive);
    v_borderColor = texelFetch(u_colorPalette, ivec2(0, borderColorIdx), 0).rgb;
    v_fillColor = texelFetch(u_colorPalette, ivec2(0, a_fillColorIdx + (isActive ^ isBright)), 0).rgb;
    v_overlayColor = texelFetch(u_colorPalette, ivec2(0, iconOverlayColorIndex), 0).rgb;
    v_drawOverlay = step(0.5, float(iconOverlayIndex));
    v_iconUV = vec3(a_texcoord, iconIndex);
    v_overlayUV = vec3(a_texcoord, iconOverlayIndex-1u);

    gl_Position = vec4((u_matrix * vec3(a_instancePos + a_mesh, 1)).xy, 0, 1);
}

`;

const allInOneFragmentShaderSource = `#version 300 es
#pragma vscode_glsllint_stage : frag

precision mediump float;

in vec2 v_localPos;

in vec3 v_iconUV;
in vec3 v_overlayUV;
flat in vec3 v_fillColor;
flat in vec3 v_borderColor;
flat in vec3 v_overlayColor;
flat in lowp float v_drawOverlay;
flat in lowp float v_isLuminant;
flat in lowp float v_isActive;
uniform mediump sampler2DArray u_icons;
uniform mediump sampler2DArray u_overlays;
uniform float u_borderThickness;
uniform vec2 u_gridSize;
uniform float screenPxRange;
uniform float u_drawIcon;

out vec4 fragColor;

float median(float r, float g, float b) {
    return max(min(r, g), min(max(r, g), b));
}

vec4 add(vec4 x, vec4 y) { return (x+y)/(x.a+y.a);}

void main() {
    vec2 distFromEdges = min(v_localPos, u_gridSize - v_localPos);
    float minDistFromEdge = min(distFromEdges.x, distFromEdges.y);

    float smoothingRange = 0.5;
    float borderFactor = 1.0 - smoothstep(
        u_borderThickness - smoothingRange,
        u_borderThickness + smoothingRange,
        minDistFromEdge
    );

    
    vec3 icon;
    if (u_drawIcon > 0.) {    
        vec4 msd = texture(u_icons, v_iconUV);
        float sd = median(msd.r, msd.g, msd.b);
        float screenPxDistance = screenPxRange*(sd - 0.5);
        float opacity = smoothstep(0., 1., screenPxDistance + 0.5);
        float light = smoothstep(1. - 0.6 - 0.4, 1. - 0.6 + 0.4, msd.a);

        float iconColor = opacity * v_isLuminant;
        icon = iconColor + v_fillColor + v_isActive * v_isLuminant * light;
    } else {
        icon = v_fillColor + v_isActive * v_isLuminant;
    }
        
    if (v_drawOverlay > 0.) {
        vec4 msdOverlay = texture(u_overlays, v_overlayUV);
        float sdOverlay = median(msdOverlay.r, msdOverlay.g, msdOverlay.b);
        float screenPxDistanceOverlay = screenPxRange*(sdOverlay - 0.5);
        float opacityOverlay = smoothstep(0., 1., screenPxDistanceOverlay + 0.5);
        float shadow = smoothstep(1. - 0.6 - 0.4, 1. - 0.6 + 0.4, msdOverlay.a);

        vec3 overlay = add(vec4(0,0,0,1) * shadow, vec4(icon,1)).rgb;
        icon = mix(overlay, v_overlayColor, opacityOverlay);
    }
    fragColor = vec4(mix(icon, v_borderColor, borderFactor),1);
}
`;

const elementVertexShaderSource = `#version 300 es
    #pragma vscode_glsllint_stage : vert
    
    in vec2 a_mesh;
    in vec2 a_instancePos;

    uniform mat3 u_matrix;

    void main() {
        gl_Position = vec4((u_matrix * vec3(a_mesh + a_instancePos, 1)).xy, 0, 1);
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

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
}

const iconMap = new Map<string, number>(Object.entries({
    // elements
    and: 0,
    or: 1,
    xor: 2,
    nand: 3,
    nor: 4,
    xnor: 5,
    t_flop: 6,
    timer: 7,
    button: 8,
    switch: 10,
    output: 12,
}));

const hasActiveIcon: Set<string> = new Set([
    'button',
    'switch',
    'output',
])
async function updateIcons() {

    const loadImage = (image: HTMLImageElement, src: string) => new Promise(resolve => {
        image.addEventListener('load', () => resolve(image));
        image.src = src;
    });

    const textureImgIcons = new Image();
    const textureImgOverlay = new Image();
    await loadImage(textureImgIcons, './icons/texture_icons.png');
    await loadImage(textureImgOverlay, './icons/texture_overlays.png');

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, textures.icons);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, textureImgIcons.width, textureImgIcons.width, textureImgIcons.height / textureImgIcons.width, 0, gl.RGBA, gl.UNSIGNED_BYTE, textureImgIcons);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, textures.overlays);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, textureImgOverlay.width, textureImgOverlay.width, textureImgOverlay.height / textureImgOverlay.width, 0, gl.RGBA, gl.UNSIGNED_BYTE, textureImgOverlay);
    draw();
}

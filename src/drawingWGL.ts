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
import { Pair, type LogicElement, type LogicGate } from "./logic";
import { gateModeToType, gateTypeToMode, iconCount, pathMap, textColors, texts, typeToActiveIconIndex } from "./consts";


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
const borderPalette = [
    84, 84, 84, 255, //border
    16, 152, 255, 255, //selection
    0, 255, 0, 255, //source
    255, 0, 0, 255, //target
    255, 255, 0, 255, //self-wired
]
type Program = {
    program: WebGLProgram | null,
    attributes: Record<string, GLint>,
    uniforms: Record<string, WebGLUniformLocation | null>
};
let gl: WebGL2RenderingContext;
let program: Program;
let texture: WebGLTexture;
let textureColorPalette: WebGLTexture;

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
            texture: gl.getUniformLocation(program, "u_texture"),
            gridSize: gl.getUniformLocation(program, "u_gridSize"),
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
    textureColorPalette = gl.createTexture();
    texture = gl.createTexture();
    vaos.allInOne = initAllInOne();
    vaos.pos2only = initPos2Only();

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

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

    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    // активируем и биндим текстуру 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
    gl.uniform1i(program.uniforms.texture, 0);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // активируем и биндим текстуру 1
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textureColorPalette);
    gl.uniform1i(program.uniforms.colorPalette, 1);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

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
function initIcons() {
    const vao = gl.createVertexArray();
    const program = programs.icons;
    if (!program) throw "Could not init icons VAO";
    gl.bindVertexArray(vao);
    // texcoord
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
    gl.vertexAttribPointer(program.attributes.texcoord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(program.attributes.texcoord);

    // mesh
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.elementMesh || null);
    gl.vertexAttribPointer(program.attributes.mesh, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(program.attributes.mesh);

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
    matrix = m3.translate(matrix, Math.round(-camera.x), Math.round(-camera.y));
    matrix = m3.scale(matrix, camera.zoom, camera.zoom);
    const h = gridSize * camera.zoom;

    if (camera.zoom !== prevZoom) {
        updateIcons();
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

    if (!programs.allInOne) return;
    program = programs.allInOne;
    gl.useProgram(program.program);
    gl.bindVertexArray(vaos.allInOne);

    gl.uniform1f(program.uniforms.borderThickness, 1);
    gl.uniformMatrix3fv(program.uniforms.matrix, false, matrix);
    gl.uniform2f(program.uniforms.gridSize, h, h);
    // gl.uniform2f(program.uniforms.textureStep, h / iconCanvas.width, h / iconCanvas.height);

    const paked = packElements(circuit.elements);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.instance);
    gl.bufferData(gl.ARRAY_BUFFER, paked.positions, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.instanceAttribs);
    gl.bufferData(gl.ARRAY_BUFFER, paked.attributes, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.instanceFillColorIdx);
    gl.bufferData(gl.ARRAY_BUFFER, paked.colorIndices, gl.DYNAMIC_DRAW);
    if (prevZoom !== camera.zoom) {
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        // gl.pixelStorei(gl.UNPACK_ROW_LENGTH, iconCanvas.width);
        // gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, iconCanvas.width);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
        gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, iconCanvas.width, iconCanvas.width, iconCount, 0, gl.RGBA, gl.UNSIGNED_BYTE, iconCanvas);

    }
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textureColorPalette);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, paked.colorTexture.length / 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, paked.colorTexture);

    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, paked.positions.length / 2);

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
    prevZoom = camera.zoom;

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
function packElements(elements: Set<LogicElement>): {
    positions: Float32Array;
    attributes: Uint32Array;
    colorIndices: Uint32Array;
    colorTexture: Uint8Array;
    colorMap: Map<string, vec3>;
} {
    const colorMap = new Map<string, vec3>();
    const colorData: number[] = [
        ...borderPalette
    ];


    const h = camera.zoom * gridSize;
    const cameraWorldX = camera.x / h - 1;
    const cameraWorldY = camera.y / h - 1;
    const { x: wx, y: wy } = screenToWorld(canvas.width, canvas.height);
    const visibleElements: LogicElement[] = [];
    for (const el of elements) {
        if (cameraWorldX <= el.x && el.x <= wx && cameraWorldY <= el.y && el.y <= wy) {
            visibleElements.push(el);
        }
    }
    const visibleCount = visibleElements.length;
    const positions = new Float32Array(visibleCount * 2);
    const attributes = new Uint32Array(visibleCount);
    const colorIndices = new Uint32Array(visibleCount);

    let nextColorIndex = 5;
    let i = 0;
    for (const el of visibleElements) {
        const { x, y } = worldToTranslatedScreen(el.x, el.y);
        positions[i * 2] = x;
        positions[i * 2 + 1] = y;
        let isBright, isLuminant, color;
        if (color = colorMap.get(el.color)) {
            isLuminant = color[1];
            isBright = color[2];
        } else {
            const [r, g, b] = hexToRgb(el.color);
            const colorLuminance = luminance(r, g, b);
            const colorLightness = lightness(r, g, b);
            isLuminant = colorLuminance >= 0.5 ? 0 : 1;
            isBright = colorLightness >= 0.5 ? 0 : 1;

            if (!colorMap.has(el.color)) {
                colorData.push(
                    Math.floor(r * 0.5 + 63.75),
                    Math.floor(g * 0.5 + 63.75),
                    Math.floor(b * 0.5 + 63.75),
                    255
                );
                // Оригинальный цвет (R, G, B, A=255)
                colorData.push(r, g, b, 255);
                colorMap.set(el.color, [nextColorIndex, isLuminant, isBright]);
                nextColorIndex += 2;
            }
        }

        // Упаковка атрибутов в 16 бит
        let border = 0;
        if (selectedElements.has(el))
            border = 1;
        else if (selectedTargets.has(el) && selectedSources.has(el))
            border = 4;
        else if (selectedSources.has(el))
            border = 2;
        else if (selectedTargets.has(el))
            border = 3;
        let type = (el.type === 'GATE' ? gateModeToType.get((el as LogicGate).gateType) || 'AND' : el.type).toLowerCase()
        let iconIndex = el.value ? typeToActiveIconIndex.get(type) || iconMap.get(type) || 0 : (iconMap.get(type) || 0)
        let iconBlendMode = 0;
        let iconOverlayIndex = 0;
        if (elementUnderCursor) {
            if (elementUnderCursor.inputs.has(el) && elementUnderCursor === el) {
                iconOverlayIndex = iconMap.get('sw')!;
                iconBlendMode = 1;
            } else if (elementUnderCursor == el) {
                iconOverlayIndex = iconMap.get('x')!;
                iconBlendMode = 1;
            } else if (elementUnderCursor.inputs.has(el)) {
                iconOverlayIndex = iconMap.get('in')!;
                iconBlendMode = 1;
            } else if (elementUnderCursor.outputs.has(el)) {
                iconOverlayIndex = iconMap.get('out')!;
                iconBlendMode = 1;
            }
        }

        attributes[i] =
            (iconOverlayIndex & 0xFF) << 16 |
            (iconIndex & 0xFF) << 8 |
            (iconBlendMode & 0b11) << 6 |
            (isLuminant << 5) |
            (isBright << 4) |
            (el.value ? 1 : 0) << 3 |
            (border & 0b111);


        colorIndices[i] = colorMap.get(el.color)![0];
        ++i;
    }

    return {
        positions,
        attributes,
        colorIndices,
        colorTexture: new Uint8Array(colorData),
        colorMap
    };
}

function drawIcons() {
    if (!programs.icons) return;
    const count = circuit.elements.size +
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



    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.instance || null);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, iconCanvas);

    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);


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
    gl.bufferData(gl.ARRAY_BUFFER, lines, gl.STATIC_DRAW);
    gl.drawArrays(gl.LINES, 0, lines.length / 2);
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

const allInOneVertexShaderSource = `#version 300 es
#pragma vscode_glsllint_stage : vert
precision mediump float;
in vec2 a_mesh;            
in vec2 a_instancePos;     
in uint a_instanceAttribs; // 32bit: [0..0][8 - iconIndex][2 - iconBlendMode][Lu>=0.5][Li>=0.5][el.value][3 - borderInd]
in uint a_fillColorIdx; 
in vec2 a_texcoord;

uniform mat3 u_matrix;
uniform vec2 u_textureStep;
uniform vec2 u_gridSize;

uniform sampler2D u_colorPalette;

out vec2 v_localPos;

out vec3 v_iconUV;
out vec3 v_iconOverlayUV;
flat out vec4 v_fillColor;
flat out vec4 v_borderColor;
flat out lowp uint v_isLuminant;
// flat out lowp uint v_iconBlendMode;
void main() {
    v_localPos = a_texcoord * u_gridSize;
    
    uint packed = uint(a_instanceAttribs);
    uint iconOverlayIndex = (packed >> 16) & 0xFFu;
    uint iconIndex = (packed >> 8) & 0xFFu;
    // v_iconBlendMode = (packed >> 6) & 0x4u;
    v_isLuminant = (packed >> 5) & 0x1u;
    lowp uint isBright = (packed >> 4) & 0x1u;
    lowp uint isActive = (packed >> 3) & 0x1u;
    lowp uint borderColorIdx = (packed) & 0x7u;

    v_borderColor = texelFetch(u_colorPalette, ivec2(0, borderColorIdx), 0);
    v_fillColor = texelFetch(u_colorPalette, ivec2(0, a_fillColorIdx + (isActive ^ isBright)), 0);

    v_iconUV = vec3(a_texcoord, iconIndex);
    v_iconOverlayUV = vec3(a_texcoord, iconOverlayIndex);

    gl_Position = vec4((u_matrix * vec3(a_instancePos + a_mesh, 1)).xy, 0, 1);
}

`;

const allInOneFragmentShaderSource = `#version 300 es
#pragma vscode_glsllint_stage : frag

precision mediump float;

in vec2 v_localPos;

in vec3 v_iconUV;
in vec3 v_iconOverlayUV;
flat in vec4 v_fillColor;
flat in vec4 v_borderColor;

flat in lowp uint v_isLuminant;
flat in lowp uint v_iconBlendMode;
uniform mediump sampler2DArray u_texture;
uniform float u_borderThickness;
uniform vec2 u_gridSize;

out vec4 fragColor;

void main() {
    vec2 distFromEdges = min(v_localPos, u_gridSize - v_localPos);
    float minDistFromEdge = min(distFromEdges.x, distFromEdges.y);

    float smoothingRange = 0.5;
    float borderFactor = 1.0 - smoothstep(
        u_borderThickness - smoothingRange,
        u_borderThickness + smoothingRange,
        minDistFromEdge
    );
    vec4 color = mix(v_fillColor, v_borderColor, borderFactor);
    vec4 icon = texture(u_texture, v_iconUV);
    
    fragColor = vec4(icon.rgb * (v_isLuminant == 0u ? -1. : 1.) * 0.5 * icon.a + color.rgb, 1);
    if (v_iconOverlayUV.z != 0.) {
        vec4 iconOverlay = texture(u_texture, v_iconOverlayUV);
        fragColor = mix(fragColor, iconOverlay, iconOverlay.a);
    } 

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



let prevZoom = 0;
const iconCanvas = document.createElement('canvas');
const iconCtx = iconCanvas.getContext('2d');
const iconMap = new Map<string, number>();
function updateIcons() {
    if (!iconCtx) return;



    const cell = gridSize;
    const h = Math.floor(cell * camera.zoom);
    const zoom = h / cell;
    iconCanvas.width = h;
    iconCanvas.height = h * iconCount; // +1 строка под текст

    iconCtx.setTransform(1, 0, 0, 1, 0, 0);
    iconCtx.clearRect(0, 0, iconCanvas.width, iconCanvas.height);
    iconCtx.scale(zoom / 2, zoom / 2);

    const baseX = cell / 2 - 1;
    const baseY = cell / 2 - 1;
    const stepY = cell * 2;

    iconCtx.translate(baseX, baseY);
    let activeIndex;
    let y = 0;
    iconCtx.lineWidth = 2;
    for (const [key, path] of pathMap) {
        iconCtx.strokeStyle = '#fff';
        iconCtx.stroke(path);

        if (activeIndex = typeToActiveIconIndex.get(key)) {
            const shift = (activeIndex - y) * stepY;
            iconCtx.translate(0, shift);
            if (key === 'output' || key === 'button' || key === 'switch') {
                iconCtx.beginPath();
                iconCtx.arc(cell * 0.5 + 1, cell * 0.5 + 1, cell / 2, 0, Math.PI * 2);
                iconCtx.fillStyle = key === 'output' ? '#888' : '#aaa';
                iconCtx.fill();
                iconCtx.stroke(path);
            }
            iconCtx.translate(0, -shift);
        }

        iconMap.set(key, y++);
        iconCtx.translate(0, stepY);
    }
    y += typeToActiveIconIndex.size;
    iconCtx.translate(-baseX, -baseY + typeToActiveIconIndex.size * stepY);

    const textBoxCenterY = cell; // центр ячейки (высота cell*2, смещены на cell)
    const textFontSize = cell * 0.9;

    iconCtx.font = `${textFontSize}px sans-serif`;
    iconCtx.textAlign = 'center';
    iconCtx.textBaseline = 'middle';
    iconCtx.shadowColor = "black";   // цвет тени
    iconCtx.shadowBlur = 4;          // размытие
    iconCtx.shadowOffsetX = 0;       // смещение по X
    iconCtx.shadowOffsetY = 0;  // смещение по Y
    for (let i = 0; i < texts.length; ++i) {
        iconMap.set(texts[i].toLocaleLowerCase(), y++);


        iconCtx.fillStyle = textColors[i];
        iconCtx.fillText(texts[i], cell, i * stepY + textBoxCenterY);
    }

    console.log(iconCanvas.width, iconCanvas.height, iconCount, iconCanvas.height / iconCount, iconCanvas.width * iconCanvas.width * iconCount, iconCanvas.width * iconCanvas.height);
}

// Конвертирует Hex (#RRGGBB) в [R, G, B] (0-255)
function hexToRgb(hex: string): [number, number, number] {
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return [r, g, b];
}

function luminance(r: number, g: number, b: number): number {
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function lightness(r: number, g: number, b: number) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return (max + min) / 510;
}
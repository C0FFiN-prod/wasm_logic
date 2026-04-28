import { colors, colorsThemed, type Point } from "../consts";
import { BitArray } from "../dataStructs";
import type { Circuit, LogicElement } from "../logic";
import { clamp, getColorForCluster, swap } from "../utils/utils";

export class TimingDiagram {
    circuit;
    markedElements: { el: LogicElement, history: BitArray, index: number }[];
    visibleElements: Set<LogicElement>;
    maxCycles: number;
    rowHeight: number;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    rowsListEl: HTMLElement;
    visibleRowCount: number;
    scrollIndex: number;
    paddingTop: number;
    _rafId: null | number;
    _dirty: boolean;
    fm: HTMLElement;
    isRecording = true;
    private dragData: { el: LogicElement; index: number; item: HTMLElement, prevY: number } | null = null;

    constructor(circuit: Circuit) {
        this.circuit = circuit;
        this.markedElements = []; // LogicElement -> BitArray
        this.visibleElements = new Set();
        this.maxCycles = 100;
        this.visibleRowCount = 5;
        this.scrollIndex = 0;
        this.rowHeight = 35;
        this.paddingTop = 20;
        this._rafId = null;
        this._dirty = false;

        this.fm = document.getElementById('fm-timing-diagram')!;
        this.canvas = document.getElementById('timing-canvas')! as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
        this.rowsListEl = document.getElementById('timing-list')!;

        this._bindUI();
        this._initResizeObserver();
        this._draw();
    }

    markElement(el: LogicElement) {
        if (!el || !el.name) return;
        if (this.markedElements.some(p => p.el === el)) return;
        const history = new BitArray(this.maxCycles);
        history.length = this.maxCycles;
        this.markedElements.push({ el, history, index: this.markedElements.length });
        this.visibleElements.add(el);
        this._updateList();
        this._scheduleDraw();
    }

    unmarkElement(el: LogicElement) {
        this.removeMarked(el);
        this.visibleElements.delete(el);
        this._updateList();
        this._scheduleDraw();
    }

    resetMarks() {
        this.markedElements = [];
        this.visibleElements.clear();
        this._updateList();
        this._scheduleDraw();
    }

    clearRecords() {
        this.isRecording = false;
        for (const { history } of this.markedElements.values()) {
            history.clear();
            history.length = this.maxCycles;
        }
        this._scheduleDraw();
        this.isRecording = true;
    }

    recordStep() {
        if (!this.isRecording) return;
        for (const { el, history } of this.markedElements) {
            if (history.length >= this.maxCycles) history.shift(el.value);
            else history.push(el.value);
        }
        this._scheduleDraw();
    }

    _scheduleDraw() {
        if (!this._rafId) {
            this._rafId = requestAnimationFrame(() => {
                this._rafId = null;
                this._draw();
            });
        }
    }
    _draw() {
        const dpr = window.devicePixelRatio || 1;
        const width = this.canvas.clientWidth || 600;
        const height = this.canvas.clientHeight;

        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;

        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.ctx.clearRect(0, 0, width, height);

        const visibleArr = this.markedElements.filter(p => this.visibleElements.has(p.el));
        const totalRows = visibleArr.length;
        const pxPerCycle = width / this.maxCycles;
        this.ctx.textAlign = 'start';
        const startRow = this.scrollIndex;
        const endRow = Math.min(startRow + this.visibleRowCount, totalRows);

        const root = document.documentElement;
        const styles = getComputedStyle(root);
        const textColor = styles.getPropertyValue('--text').trim();
        const separatorColor = `rgb(
            ${Math.round(colors.wires[0] * 255)},
            ${Math.round(colors.wires[1] * 255)},
            ${Math.round(colors.wires[2] * 255)}
        )`;

        this.ctx.fillStyle = `rgb(
            ${Math.round(colors.background[0] * 255)},
            ${Math.round(colors.background[1] * 255)},
            ${Math.round(colors.background[2] * 255)}
        )`;
        this.ctx.fillRect(0, 0, width, height);
        this.ctx.strokeStyle = `rgb(
            ${Math.round(colors.grid[0] * 255)},
            ${Math.round(colors.grid[1] * 255)},
            ${Math.round(colors.grid[2] * 255)}
        )`;
        this.ctx.lineWidth = 2;
        this.ctx.fillStyle = '#6b7280';
        this.ctx.font = '10px system-ui, sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.setLineDash([5, 5]);

        const step = Math.max(1, Math.floor(this.maxCycles / 10));
        for (let t = 0; t <= this.maxCycles; t += step) {
            const x = t * pxPerCycle;
            this.ctx.beginPath(); this.ctx.moveTo(x, 0); this.ctx.lineTo(x, height); this.ctx.stroke();
            this.ctx.fillText(t.toString(), x + 3, 12);
        }

        this.ctx.setLineDash([]);
        for (let i = startRow; i < endRow; i++) {
            const { el, history, index } = visibleArr[i];
            if (!history) continue;

            const y = (i - startRow) * this.rowHeight + this.paddingTop;
            const len = Math.min(history.length || 0, this.maxCycles);
            this.ctx.fillStyle = textColor;
            this.ctx.font = 'bold 10px system-ui, sans-serif';
            this.ctx.fillText(el.name, 1, y + 12);
            this.ctx.strokeStyle = getColorForCluster(index);
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.lineJoin = 'miter';

            let prevVal = -1;
            const iterator = history.values();
            for (let j = 0; j < len; j++) {
                const val = iterator.next().value!;
                const x = j * pxPerCycle;
                const yHigh = y + 17;
                const yLow = y + this.rowHeight - 5;

                if (prevVal === -1) {
                    this.ctx.moveTo(x, val ? yHigh : yLow);
                } else if (prevVal !== val) {
                    this.ctx.lineTo(x, prevVal ? yHigh : yLow);
                    this.ctx.lineTo(x, val ? yHigh : yLow);
                }
                this.ctx.lineTo(x + pxPerCycle, val ? yHigh : yLow);
                prevVal = val;
            }
            this.ctx.stroke();
            this.ctx.strokeStyle = separatorColor;
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(width, y);
            this.ctx.stroke();
        }
        if (totalRows > this.visibleRowCount) {
            this._drawScrollbar(width, height, totalRows);
        }
    }

    _drawScrollbar(width: number, height: number, totalRows: number) {
        const trackH = height - this.paddingTop;
        const thumbH = Math.max(10, (this.visibleRowCount / totalRows) * trackH);
        const maxScroll = totalRows - this.visibleRowCount;
        const scrollFraction = maxScroll > 0 ? this.scrollIndex / maxScroll : 0;
        const thumbY = this.paddingTop + scrollFraction * (trackH - thumbH);

        this.ctx.fillStyle = '#d1d5db';
        this.ctx.fillRect(width - 8, this.paddingTop, 6, trackH);
        this.ctx.fillStyle = '#9ca3af';
        this.ctx.fillRect(width - 8, thumbY, 6, thumbH);
    }

    _clampScroll() {
        const height = this.canvas.clientHeight;
        this.visibleRowCount = Math.round((height - this.paddingTop) / this.rowHeight);
        const max = Math.max(0, this.visibleElements.size - this.visibleRowCount);
        this.scrollIndex = Math.min(this.scrollIndex, max);
    }

    _handleScroll(delta: number) {
        const max = Math.max(0, this.visibleElements.size - this.visibleRowCount);
        if (max <= 0) return;

        this.scrollIndex = Math.max(0, Math.min(max, this.scrollIndex + delta));
        this._scheduleDraw();
    }

    _initResizeObserver() {
        new ResizeObserver(() => { this._clampScroll(); this._scheduleDraw() }).observe(this.canvas);
    }

    _updateList() {
        this.rowsListEl.innerHTML = '';
        for (const [i, { el }] of this.markedElements.entries()) {
            const item = document.createElement('div');
            item.className = 'timing-toggle';
            item.dataset.index = i.toString();
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = this.visibleElements.has(el);
            cb.addEventListener('change', (e) => {
                e.stopPropagation();
                if (cb.checked) this.visibleElements.add(el);
                else this.visibleElements.delete(el);
                this._clampScroll();
                this._scheduleDraw();
            });

            const handle = document.createElement('b');
            handle.className = 'drag-handle';
            handle.textContent = '⋮⋮';
            handle.title = 'Перетащить';
            const name = document.createElement('span');
            name.className = 'element-name';
            name.textContent = el.name;
            name.title = el.name;

            item.append(handle, cb, name);
            handle.addEventListener('mousedown', () => this._onDragStart(el, item));
            window.addEventListener('mouseup', () => this._onDragEnd(item));
            window.addEventListener('mousemove', (e) => this._onDragOver(e));

            this.rowsListEl.append(item);
        }
    }

    _bindUI() {

        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this._handleScroll(Math.sign(e.deltaY));
        }, { passive: false });
        this.canvas.addEventListener('mousedown', (e) => {
            if (this.visibleElements.size <= this.visibleRowCount) return;
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const w = rect.width;
            if (x >= w - 15) {
                const y = e.clientY - rect.top - this.paddingTop;
                const trackH = (this.visibleRowCount * this.rowHeight);
                const maxScroll = this.visibleElements.size - this.visibleRowCount;
                const newIdx = Math.round((y / trackH) * maxScroll);
                this._handleScroll(newIdx - this.scrollIndex);
            }
        });
        const maxCyclesInput = document.getElementById('max-cycles') as HTMLInputElement;
        maxCyclesInput.addEventListener('input', (e) => {
            this.maxCycles = clamp(parseInt((e.target as HTMLInputElement)!.value) || 100, 10, 10000);
            (e.target as HTMLInputElement)!.value = this.maxCycles.toString();
            this.clearRecords();
        });
        document.getElementById('clear-timing')?.addEventListener('click', () => {
            this.clearRecords();
        });
        document.getElementById('reset-marks')?.addEventListener('click', () => this.resetMarks());

        const resizer = this.fm.querySelector('.resizer')! as HTMLElement;
        const leftPanel = resizer.previousElementSibling! as HTMLElement;
        const container = this.fm.querySelector('.floating-menu-container') as HTMLElement;

        let isDragging = false;
        let startX = 0;
        let startWidth = 0;
        let containerWidth: number, containerHeight: number;
        const MIN_WIDTH = 50;
        const MAX_PERCENT = 0.5;

        const fixContainerSize = () => {
            containerWidth = container.getBoundingClientRect().width;
            containerHeight = container.getBoundingClientRect().height;
            container.style.width = `${containerWidth}px`;
            container.style.height = `${containerHeight}px`;
        }

        fixContainerSize();

        const onResize = (e: MouseEvent) => {
            if (!isDragging) return;

            const maxWidth = containerWidth * MAX_PERCENT;

            const newWidth = Math.min(startWidth + (e.clientX - startX), maxWidth);
            const hide = newWidth < MIN_WIDTH;
            resizer.classList.toggle('active', hide);
            leftPanel.classList.toggle('hidden', hide);
            leftPanel.style.width = `${newWidth}px`;
        };

        const onStop = () => {
            if (!isDragging) return;
            isDragging = false;
            resizer.classList.remove('dragging');
            document.removeEventListener('mousemove', onResize);
            document.removeEventListener('mouseup', onStop);
        };

        const onStart = (e: MouseEvent) => {
            e.preventDefault();
            isDragging = true;
            startX = e.clientX;
            startWidth = leftPanel.clientWidth;
            fixContainerSize();
            resizer.classList.add('dragging');

            document.addEventListener('mousemove', onResize);
            document.addEventListener('mouseup', onStop);
        };

        resizer.addEventListener('mousedown', onStart);
    }

    private removeMarked(el: LogicElement) {
        const idx = this.markedElements.findIndex(p => p.el == el);
        if (idx === -1) return;
        this.markedElements.splice(idx, 1);
    }

    private _onDragStart(el: LogicElement, item: HTMLElement) {
        const rect = item.getBoundingClientRect();
        const dY = rect.height / 2
        const midY = rect.top + dY;
        const index = this.markedElements.findIndex(p => p.el === el);
        this.dragData = { el, index, item, prevY: midY };
        item.classList.add('dragging');
    }

    private _onDragEnd(item: HTMLElement) {
        item.classList.remove('dragging');
        this.dragData = null;
    }

    private _onDragOver(e: MouseEvent) {
        e.preventDefault();
        if (!this.dragData) return;

        const rect = this.dragData.item.getBoundingClientRect();
        const dY = rect.height / 2
        if (Math.abs(this.dragData.prevY - e.clientY) < dY) return;
        const midY = rect.top + dY;
        const dir = Math.sign(-midY + e.clientY);
        this.dragData.prevY = midY + rect.height * dir;
        const swapIndex = clamp(this.dragData.index + dir, 0, this.markedElements.length - 1);

        if (swapIndex === this.dragData.index) return;
        swap(this.markedElements, swapIndex, this.dragData.index);

        const listEl = this.dragData.item.parentElement!;
        if (swapIndex < this.dragData.index) {
            listEl?.insertBefore(this.dragData.item, this.dragData.item.previousSibling);
        } else if (this.dragData.item.nextSibling) {
            listEl?.insertBefore(this.dragData.item.nextSibling, this.dragData.item);
        }
        this.dragData.index = swapIndex;

        this._scheduleDraw();
    }
}
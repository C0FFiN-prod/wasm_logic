import { BitArray } from "../dataStructs";
import type { Circuit, LogicElement } from "../logic";
import { clamp } from "../utils/utils";

export class TimingDiagram {
    circuit;
    markedElements: Map<LogicElement, BitArray>;
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
    constructor(circuit: Circuit) {
        this.circuit = circuit;
        this.markedElements = new Map(); // LogicElement -> BitArray
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

    // === Управление метками ===
    markElement(el: LogicElement) {
        if (!el || !el.name) return;
        if (this.markedElements.has(el)) return;

        // Создаём BitArray для элемента (адаптируйте под ваш конструктор)
        const history = new BitArray(this.maxCycles);
        history.length = this.maxCycles;
        this.markedElements.set(el, history);
        this.visibleElements.add(el);
        this._updateList();
        this._scheduleDraw();
    }

    unmarkElement(el: LogicElement) {
        this.markedElements.delete(el);
        this.visibleElements.delete(el);
        this._updateList();
        this._scheduleDraw(); // перерисовка после удаления
    }

    resetMarks() {
        this.markedElements.clear();
        this.visibleElements.clear();
        this._updateList();
        this._scheduleDraw();
    }

    // === Запись данных (вызывать в Circuit.step()) ===
    recordStep() {
        for (const [el, history] of this.markedElements) {
            // history.resize(this.maxCycles);
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

    // === Отрисовка ===
    _draw() {
        const dpr = window.devicePixelRatio || 1;
        const width = this.canvas.clientWidth || 600;
        const height = this.canvas.clientHeight;
        
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;

        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.ctx.clearRect(0, 0, width, height);

        const visibleArr = [...this.visibleElements];
        const totalRows = visibleArr.length;
        const pxPerCycle = width / this.maxCycles;


        this.ctx.textAlign = 'start';

        // 2. Отрисовка видимых строк
        const startRow = this.scrollIndex;
        const endRow = Math.min(startRow + this.visibleRowCount, totalRows);

        for (let i = startRow; i < endRow; i++) {
            const el = visibleArr[i];
            const history = this.markedElements.get(el);
            if (!history) continue;

            const y = (i - startRow) * this.rowHeight + this.paddingTop;
            const len = Math.min(history.length || 0, this.maxCycles);

            // Фон
            this.ctx.fillStyle = (i % 2 === 0) ? '#f9fafb' : '#ffffff';
            this.ctx.fillRect(0, y, width, this.rowHeight);

            // Имя
            this.ctx.fillStyle = '#374151';
            this.ctx.font = 'bold 10px system-ui, sans-serif';
            this.ctx.fillText(el.name, 1, y + 12);

            // Сигнал
            this.ctx.strokeStyle = '#2563eb';
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

            // Разделитель
            this.ctx.strokeStyle = '#e5e7eb';
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.moveTo(0, y + this.rowHeight);
            this.ctx.lineTo(width, y + this.rowHeight);
            this.ctx.stroke();
        }
        // 1. Сетка и метки времени
        this.ctx.strokeStyle = '#e5e7eb';
        this.ctx.lineWidth = 1;
        this.ctx.fillStyle = '#6b7280';
        this.ctx.font = '10px system-ui, sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.setLineDash([5, 5]);

        const step = Math.max(1, Math.floor(this.maxCycles / 10));
        for (let t = 0; t <= this.maxCycles; t += step) {
            const x = t * pxPerCycle;
            this.ctx.beginPath(); this.ctx.moveTo(x, 0); this.ctx.lineTo(x, height); this.ctx.stroke();
            this.ctx.fillText(t.toString(), x + 1, 12);
        }
        // 3. Скроллбар (если строк больше, чем окно)
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

    // === Управление прокруткой ===
    _clampScroll() {
        const height = this.canvas.clientHeight;
        this.visibleRowCount = Math.ceil((height - this.paddingTop) / this.rowHeight); 
        const max = Math.max(0, this.visibleElements.size - this.visibleRowCount);
        this.scrollIndex = Math.min(this.scrollIndex, max);
        this._scheduleDraw();
    }

    _handleScroll(delta: number) {
        const max = Math.max(0, this.visibleElements.size - this.visibleRowCount);
        if (max <= 0) return;

        this.scrollIndex = Math.max(0, Math.min(max, this.scrollIndex + delta));
        this._scheduleDraw();
    }

    // === Инициализация и события ===
    _initResizeObserver() {
        new ResizeObserver(() => { this._clampScroll(); this._scheduleDraw()}).observe(this.canvas);
    }

    // === UI и события ===
    _updateList() {
        this.rowsListEl.innerHTML = '';
        for (const el of this.markedElements.keys()) {
            const wrap = document.createElement('label');
            wrap.className = 'timing-toggle';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = this.visibleElements.has(el);
            cb.addEventListener('change', () => {
                if (cb.checked) this.visibleElements.add(el);
                else this.visibleElements.delete(el);
                this._clampScroll();
            });
            const span = document.createElement('span');
            span.textContent = el.name; // text-overflow: ellipsis обрежет лишнее

            wrap.append(cb, span);
            this.rowsListEl.append(wrap);
        }
    }

    _bindUI() {

        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this._handleScroll(Math.sign(e.deltaY));
        }, { passive: false });

        // Клик по скроллбару для быстрого перехода
        this.canvas.addEventListener('mousedown', (e) => {
            if (this.visibleElements.size <= this.visibleRowCount) return;
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const w = rect.width;
            if (x >= w - 15) { // зона скроллбара
                const y = e.clientY - rect.top - this.paddingTop;
                const trackH = (this.visibleRowCount * this.rowHeight);
                const maxScroll = this.visibleElements.size - this.visibleRowCount;
                const newIdx = Math.round((y / trackH) * maxScroll);
                this._handleScroll(newIdx - this.scrollIndex);
            }
        });

        // Число тактов
        const maxCyclesInput = document.getElementById('max-cycles') as HTMLInputElement;
        maxCyclesInput.addEventListener('input', (e) => {
            this.maxCycles = clamp(parseInt((e.target as HTMLInputElement)!.value) || 100, 10, 10000);
            (e.target as HTMLInputElement)!.value = this.maxCycles.toString();
            for (const history of this.markedElements.values()) {
                history.clear();
                history.length = this.maxCycles;
            }
            this._draw();
        });

        // Очистка истории
        document.getElementById('clear-timing')?.addEventListener('click', () => {
            for (const history of this.markedElements.values()) {
                history.clear();
            }
            this._draw();
        });

        // Сброс меток
        document.getElementById('reset-marks')?.addEventListener('click', () => this.resetMarks());

        const resizer = this.fm.querySelector('.resizer')! as HTMLElement;
        const leftPanel = resizer.previousElementSibling! as HTMLElement;
        const container = this.fm.querySelector('.floating-menu-container') as HTMLElement;

        let isDragging = false;
        let startX = 0;
        let startWidth = 0;
        let containerWidth = container.clientWidth;
        let containerHeight = container.clientHeight;
        const containerComputedStyle = window.getComputedStyle(container);
        const padding = parseInt(containerComputedStyle.paddingLeft) + parseInt(containerComputedStyle.paddingRight);
        const MIN_WIDTH = 80;
        const MAX_PERCENT = 0.5; // 50% от контейнера

        const onResize = (e: MouseEvent) => {
            if (!isDragging) return;
            
            const maxWidth = containerWidth * MAX_PERCENT;

            let newWidth = startWidth + (e.clientX - startX);
            newWidth = Math.max(MIN_WIDTH, Math.min(newWidth, maxWidth));

            leftPanel.style.width = `${newWidth}px`;
            // Canvas автоматически растянется через flex: 1
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
            startWidth = leftPanel.offsetWidth;
            containerWidth = container.getBoundingClientRect().width - padding;
            containerHeight = container.getBoundingClientRect().height - padding;
            container.style.width = `${containerWidth}px`;
            container.style.height = `${containerHeight}px`;
            resizer.classList.add('dragging');

            document.addEventListener('mousemove', onResize);
            document.addEventListener('mouseup', onStop);
        };

        resizer.addEventListener('mousedown', onStart);
    }
}
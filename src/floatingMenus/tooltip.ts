import { gateModeToType, gridSize, type Camera, type LocaleNames } from "../consts";
import { LRU } from "../dataStructs";
import { drawingTimer } from "../drawings";
import type { HistoryManager } from "../history";
import { Button, Circuit, LogicElement, LogicGate, OutputElement, Switch, Timer } from "../logic";
import { isDragging, isHandMoving, isSelecting } from "../main";
import type { I18n, I18nLocale, I18nLocales } from "../utils/i18n";
import { floorPoint, screenToWorld, elementExists, getElementAt } from "../utils/utils";
import type { TimingDiagram } from "./timingDiagram";


// tooltip.ts
export class ElementTooltip {
    private static MAX_CACHE_SIZE = 256;
    private el: HTMLElement;
    private typeEl: HTMLElement;
    private nameInput: HTMLInputElement;
    private extraEl: HTMLElement;
    private markCheckbox: HTMLInputElement;

    private state = {
        cachedElement: null as LogicElement | null,
        currentTooltipElement: null as LogicElement | null,
        showTimer: null as number | null,
        hideTimer: null as number | null,
        isHovered: false,
        isVisible: false,
        lastPos: { x: -1000, y: -1000 }
    };

    private lru = new LRU<string>();
    private cache = new Map<string, LogicElement>();

    private i18n;
    private circuit;
    private camera;
    private historyManager;
    private timingDiagram;

    constructor(
        i18n: I18n<I18nLocale, LocaleNames, I18nLocales<LocaleNames, I18nLocale>>,
        circuit: Circuit,
        camera: Camera,
        historyManager: HistoryManager,
        timingDiagram: TimingDiagram
    ) {
        this.i18n = i18n;
        this.circuit = circuit;
        this.camera = camera;
        this.historyManager = historyManager;
        this.timingDiagram = timingDiagram;
        this.el = document.getElementById('element-tooltip')!;
        this.markCheckbox = this.el.querySelector('input[name="tooltip-mark-timing"]')!;
        this.typeEl = this.el.querySelector('.tooltip-type')!;
        this.nameInput = this.el.querySelector('.tooltip-name-input')!;
        this.extraEl = this.el.querySelector('.tooltip-extra')!;

        this.bindEvents();
    }

    private bindEvents() {
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('mouseleave', () => this.hide());
        window.addEventListener('keydown', (e) => {
            if (!this.state.isVisible) return;
            if (this.state.cachedElement === null) return;
            if (e.target === this.nameInput) return;
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ')
                window.setTimeout(() => this.updateContent(this.state.cachedElement!), 5);
        });

        this.el.addEventListener('mouseenter', () => { this.state.isHovered = true; });
        this.el.addEventListener('mouseleave', () => {
            this.state.isHovered = false;
            if (!this.state.cachedElement) this.hide();
            this.nameInput.blur();
        });
        this.nameInput.addEventListener('keydown', (e) => {
            if (e.code === 'Enter') this.nameInput.blur();
        });

        this.nameInput.addEventListener('input', () => {
            if (this.state.cachedElement) {
                this.historyManager.recordChangeElementName(this.state.cachedElement, this.nameInput.value);
                this.state.cachedElement.name = this.nameInput.value;
                this.timingDiagram._updateList();
                this.timingDiagram._draw();
            }
        });
        this.markCheckbox.addEventListener('change', (e) => {
            if (!this.state.cachedElement) return;
            console.log(this.state.cachedElement)
            if ((e.target as HTMLInputElement)!.checked) {
                this.timingDiagram.markElement(this.state.cachedElement);
            } else {
                this.timingDiagram.unmarkElement(this.state.cachedElement);
            }

        });
    }

    private onMouseMove(e: MouseEvent) {
        if (this.state.isHovered || e.target !== drawingTimer.currentCanvas()) return;
        if (isDragging || isSelecting || isHandMoving) {
            this.hide();
            return
        }
        clearTimeout(this.state.showTimer!);

        const wp = floorPoint(screenToWorld(this.camera, e.clientX, e.clientY));
        const key = `${wp.x}|${wp.y}`

        let element = this.state.currentTooltipElement ?? this.cache.get(key) ?? null;
        if (!element || this.state.lastPos.x !== wp.x || this.state.lastPos.y !== wp.y || !elementExists(this.circuit, element)) {
            element = getElementAt(this.circuit, this.camera, wp, false);
            if (element) {
                this.state.lastPos = wp;
                this.cache.set(key, element);
                this.lru.access(key);
                if (this.cache.size > ElementTooltip.MAX_CACHE_SIZE)
                    this.cache.delete(this.lru.popOldest()!);
            }
            this.state.currentTooltipElement = null;
        }

        if (element) {
            if (this.state.hideTimer !== null) clearTimeout(this.state.hideTimer);
            if (this.state.showTimer !== null) clearTimeout(this.state.showTimer);
            this.state.showTimer = window.setTimeout(() => {
                this.show(element, e.clientX, e.clientY);
            }, 50);
        } else {
            clearTimeout(this.state.hideTimer!);
            this.state.hideTimer = window.setTimeout(() => {
                if (!this.state.isHovered) this.hide();
            }, 150);
        }
    }

    private show(element: LogicElement, x: number, y: number) {
        if (this.state.isVisible && this.state.currentTooltipElement === element) return;
        this.markCheckbox.checked = this.timingDiagram.markedElements.has(element);
        this.state.currentTooltipElement = element;
        this.state.cachedElement = element;
        this.updateContent(element);
        this.updatePosition(x, y);
        this.el.classList.add('visible');
        this.state.isVisible = true;
    }

    private hide() {
        if (this.state.showTimer !== null) clearTimeout(this.state.showTimer);
        this.state.currentTooltipElement = null;
        this.state.cachedElement = null;
        this.el.classList.remove('visible');
        this.state.isVisible = false;
    }

    private updateContent(el: LogicElement) {
        let typeName;
        let extraText = '';

        if (el instanceof Switch) {
            typeName = this.i18n.getValue('elements', 'switch');
        } else if (el instanceof Button) {
            typeName = this.i18n.getValue('elements', 'button');
        } else if (el instanceof LogicGate) {
            typeName = this.i18n.getValue('elements', 'gate');
            extraText = `${this.i18n.getValue('element-tooltip', 'gate-type')} ${gateModeToType.get(el.gateType) ?? 'N/A'}`;
        } else if (el instanceof Timer) {
            typeName = this.i18n.getValue('elements', 'timer');
            extraText = `${this.i18n.getValue('element-tooltip', 'timer-delay')} ${el.delay ?? 0}`;
        } else if (el instanceof OutputElement) {
            typeName = this.i18n.getValue('elements', 'output');
        } else {
            typeName = this.i18n.getValue('elements', 'element');
        }
        
        this.typeEl.textContent = typeName;
        this.nameInput.value = el.name || el.id.toString() || '';
        this.extraEl.textContent = extraText;
    }

    private updatePosition(x: number, y: number) {
        const offset = 16;
        let left = x + offset;
        let top = y + offset;

        const rect = this.el.getBoundingClientRect();
        if (left + rect.width > window.innerWidth) left = x - rect.width - offset;
        if (top + rect.height > window.innerHeight) top = y - rect.height - offset;

        this.el.style.left = `${left}px`;
        this.el.style.top = `${top}px`;
    }
}
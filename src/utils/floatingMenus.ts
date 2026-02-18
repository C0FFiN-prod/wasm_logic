import { clamp } from './utils.ts';    

const lsKey = 'floating-menus';

type FloatingMenu = { x: number, y: number, isHidden: boolean, isContainerHidden?: boolean};

export let floatingMenus: NodeListOf<HTMLElement>;
export function saveFMsToLS() {
    let obj: Record<string, FloatingMenu> = {};
    for (const floatingMenu of floatingMenus) {
        if (floatingMenu.id) {
            const { header, check, hideBtn, container } = getFMParts(floatingMenu);
            const getStyleFM = window.getComputedStyle(floatingMenu);
            const x = parseInt(getStyleFM.left);
            const y = parseInt(getStyleFM.top);
            obj[floatingMenu.id] = {
                x, y,
                isHidden: floatingMenu?.classList.contains('hidden'),
                isContainerHidden: container?.classList.contains('hidden')
            }
        }
    }
    const text = JSON.stringify(obj);
    localStorage.setItem(lsKey, text);
}

function getFromLS() {
    return JSON.parse(localStorage.getItem(lsKey) || '{}');
}

function getFMParts(floatingMenu: HTMLElement) {
    const header = floatingMenu.querySelector(".floating-menu-header") as HTMLElement;
    const check = header.querySelector("input[type='checkbox']") as HTMLInputElement;
    const hideBtn = header.querySelector("button.hide") as HTMLButtonElement;
    const container = floatingMenu.querySelector(".floating-menu-container") as HTMLElement;
    return {
        header,
        check,
        hideBtn,
        container
    }
}

export function initFMs() {
    floatingMenus = document.querySelectorAll(".floating-menu") as NodeListOf<HTMLElement>;
    const savedFMs = getFromLS();
    let mouse = { x: 0, y: 0 };
    for (const floatingMenu of floatingMenus) {
        const { header, check, hideBtn, container } = getFMParts(floatingMenu);
        const getStyleFM = window.getComputedStyle(floatingMenu);
        const getStyleFMH = window.getComputedStyle(header);
        const {
            x = parseInt(getStyleFM.left),
            y = parseInt(getStyleFM.top),
            isHidden = floatingMenu.classList.contains("hidden"),
            isContainerHidden = container?.classList.contains('hidden')
        }: FloatingMenu = savedFMs[floatingMenu.id];

        floatingMenu.style.left = `${x}px`;
        floatingMenu.style.top = `${y}px`;
        floatingMenu.style.width = getStyleFM.width;

        if (check) {
            check.checked = isContainerHidden;
            container.classList.toggle('hidden', isContainerHidden);
        }
        floatingMenu.classList.toggle('hidden', isHidden);

        header?.addEventListener('mousedown', (e) => {
            // floatingMenu.toggleAttribute("dragging", true);
            e.preventDefault();
            mouse.x = e.clientX;
            mouse.y = e.clientY;
            const onMouseMove = (e: MouseEvent) => {
                e.preventDefault();
                if (20 > e.clientX || e.clientX > window.innerWidth - 20 ||
                    20 > e.clientY || e.clientY > window.innerHeight - 20) {
                    onMouseUp();
                }
                const x = clamp(floatingMenu.offsetLeft - (mouse.x - e.clientX), 20, window.innerWidth - parseInt(getStyleFMH.width) - 55);
                const y = clamp(floatingMenu.offsetTop - (mouse.y - e.clientY), 20, window.innerHeight - parseInt(getStyleFMH.height) - 55);
                floatingMenu.style.left = `${x}px`;
                floatingMenu.style.top = `${y}px`;
                mouse.x = e.clientX;
                mouse.y = e.clientY;
            };
            const onMouseUp = () => {
                document.removeEventListener('mouseup', onMouseUp);
                document.removeEventListener('mousemove', onMouseMove);
            };
            document.addEventListener('mouseup', onMouseUp);
            document.addEventListener('mousemove', onMouseMove);
        });

        check?.addEventListener("change", () => {
            container?.classList.toggle("hidden", check.checked);
        });
        hideBtn?.addEventListener("click", () => {
            floatingMenu.classList.toggle("hidden", true);
        });
    }
}

export function clampFMCoords(floatingMenu: HTMLElement) {
    const getStyleFM = window.getComputedStyle(floatingMenu);
    const x = clamp(parseInt(getStyleFM.left), 20, window.innerWidth - parseInt(getStyleFM.width) - 55);
    const y = clamp(parseInt(getStyleFM.top), 20, window.innerHeight - parseInt(getStyleFM.height) - 55);
    floatingMenu.style.left = `${x}px`;
    floatingMenu.style.top = `${y}px`;
}

export function resizeFMs() {
    const floatingMenus = document.querySelectorAll(".floating-menu") as NodeListOf<HTMLElement>;
    for (const floatingMenu of floatingMenus) {
        floatingMenu.style.width = "";
        const getStyleFM = window.getComputedStyle(floatingMenu);
        floatingMenu.style.width = getStyleFM.width;
    }
}


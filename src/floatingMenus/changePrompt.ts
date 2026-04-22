import { moveAroundCursor } from "./floatingMenus";

const PromptTypes = ['delay', 'gate'] as const;
type PromptTypes = (typeof PromptTypes)[number];
type ChangeType = { block: HTMLElement, current: HTMLElement, new: HTMLInputElement };
type Prompt = { fm: HTMLElement, hide: HTMLButtonElement, title: HTMLElement, submit: HTMLButtonElement, prompts: Record<PromptTypes, ChangeType> };
let HTMLPrompt: Prompt;
export function isHidden() { return HTMLPrompt.fm.classList.contains('hidden'); }
export function init() {
  const promptFM = document.getElementById('fm-change-prompt') as HTMLElement;
  HTMLPrompt = {
    fm: promptFM,
    hide: promptFM.querySelector('button.hide') as HTMLButtonElement,
    title: document.getElementById('change-prompt-title') as HTMLElement,
    submit: document.getElementById('change-prompt-submit') as HTMLButtonElement,
    prompts: {
      gate: {
        block: document.getElementById('change-gate-mode') as HTMLElement,
        current: document.getElementById('change-gate-current') as HTMLElement,
        new: document.getElementById('change-gate-select') as HTMLInputElement,
      },
      delay: {
        block: document.getElementById('change-delay') as HTMLElement,
        current: document.getElementById('change-delay-current') as HTMLElement,
        new: document.getElementById('change-delay-new') as HTMLInputElement
      }
    }
  };
}

function restore() {
  if (!HTMLPrompt.fm.parentElement) document.body.appendChild(HTMLPrompt.fm);
  if (!HTMLPrompt.hide.parentElement) HTMLPrompt.fm.querySelector('.floating-menu-header')?.appendChild(HTMLPrompt.hide);
  if (!HTMLPrompt.submit.parentElement) HTMLPrompt.fm.querySelector('.floating-menu-container')?.appendChild(HTMLPrompt.submit);
}

export function show(e: MouseEvent, type: PromptTypes, currentValue: string, onSubmit: (value: string) => void) {
  restore();
  HTMLPrompt.submit.onclick = null;

  PromptTypes.forEach(pt => HTMLPrompt.prompts[pt].block.classList.toggle('hidden', type !== pt));

  HTMLPrompt.prompts[type].current.innerText = currentValue;
  HTMLPrompt.prompts[type].new.value = currentValue.toLowerCase();

  HTMLPrompt.submit.onclick = () => { cancel(); onSubmit(HTMLPrompt.prompts[type].new.value.trim()) };//() => submit(type, el, oldValues);
  HTMLPrompt.hide.onclick = cancel;

  HTMLPrompt.fm.classList.toggle('hidden', false);
  moveAroundCursor({ x: e.offsetX, y: e.offsetY }, HTMLPrompt.fm);
}

export function cancel() {
  HTMLPrompt.submit.onclick = null;
  HTMLPrompt.fm.classList.toggle('hidden', true);
}
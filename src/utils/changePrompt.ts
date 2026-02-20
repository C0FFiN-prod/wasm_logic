import { gateModeToType, gateTypeToMode } from "../consts";
import { drawingTimer } from "../drawings";
import { LogicElement, Timer, LogicGate } from "../logic";
import { circuit, selectedElements } from "../main";

const PromptTypes = ['delay' , 'gate'] as const;
type PromptTypes = (typeof PromptTypes)[number];
type ChangeType = {block: HTMLElement, current: HTMLElement, new: HTMLInputElement};
type Prompt = {fm: HTMLElement, hide: HTMLButtonElement, title: HTMLElement, submit: HTMLButtonElement, prompts: Record<PromptTypes, ChangeType>};
let HTMLPrompt: Prompt;
export function isHidden() {return HTMLPrompt.fm.classList.contains('hidden');}
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
export function show(type: PromptTypes, el: LogicElement){
  restore();
  HTMLPrompt.submit.onclick = null;
  let currentValue: string, newValue: string;
  switch(type){
    case 'delay':
      if (!(el instanceof Timer)) return;
      const delay = el.delay.toString();
      currentValue = newValue = delay;
      break;
    case 'gate':
      if (!(el instanceof LogicGate)) return;
      const gateType = gateModeToType.get(el.gateType)!;
      currentValue = gateType;
      newValue = gateType.toLowerCase();
      break;
    default: return;
  }
  PromptTypes.forEach(pt => HTMLPrompt.prompts[pt].block.classList.toggle('hidden', type !== pt));

  HTMLPrompt.prompts[type].current.innerText = currentValue;
  HTMLPrompt.prompts[type].new.value = newValue;

  HTMLPrompt.submit.onclick = () => submit(type, el);
  HTMLPrompt.hide.onclick = cancel;

  HTMLPrompt.fm.classList.toggle('hidden', false);
}

function submit(type: PromptTypes, el: LogicElement) {
  cancel();
  switch(type){
    case 'delay':
      if (!(el instanceof Timer)) return;
        const delay = HTMLPrompt.prompts[type].new.value.trim();
        const newDelay = Math.round(Number(delay));
        if (delay !== null && delay !== '' && !Number.isNaN(newDelay) && (0 <= newDelay && newDelay <= 1024)) {
          el.setDelay(newDelay);
          for (const elI of selectedElements) {
            if (elI instanceof Timer)
              elI.setDelay(newDelay);
          }
        }
      break;
    case 'gate':
      if (!(el instanceof LogicGate)) return;
      const mode = HTMLPrompt.prompts[type].new.value.trim().toUpperCase();
      if (gateTypeToMode.has(mode)) {
        const newMode = gateTypeToMode.get(mode)!;
        if (mode === 'T_FLOP') circuit.addWire(el, el);
        else circuit.removeWire(el, el);
        el.gateType = newMode;
        for (const elI of selectedElements) {
          if (elI instanceof LogicGate) {
            if (mode === 'T_FLOP') circuit.addWire(elI, elI);
            else circuit.removeWire(elI, elI);
            elI.gateType = newMode;
          }
        }
        drawingTimer.step();
      }
      break;
      default: return;
  }
}

export function cancel(){
  HTMLPrompt.submit.onclick = null;
  HTMLPrompt.fm.classList.toggle('hidden', true);
}
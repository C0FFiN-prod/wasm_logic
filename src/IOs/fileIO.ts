import type { CircuitIO } from "../IOs/circuitIO";
import { ToolMode, type LocaleNames } from "../consts";
import { drawingTimer } from "../drawings";
import { selectedTool } from "../main";
import type { I18n, I18nLocale, I18nLocales } from "../utils/i18n";

export class FileIO {
    currentFileHandle: FileSystemFileHandle | null = null;
    currentFileName = '';
    // Проверка поддержки FSAPI
    hasFSAPI = "showSaveFilePicker" in window && "showOpenFilePicker" in window;
    filenameDisplay: HTMLSpanElement;
    circuitIO: CircuitIO;
    i18n;
    constructor(i18n: I18n<I18nLocale, LocaleNames, I18nLocales<LocaleNames, I18nLocale>>, circuitIO: CircuitIO, filenameDisplaySpan: HTMLSpanElement) {
        this.i18n = i18n;
        this.filenameDisplay = filenameDisplaySpan;
        this.circuitIO = circuitIO;
        // Клик по имени — превращаем в input для редактирования
        this.filenameDisplay.addEventListener("click", () => {
            const input = document.createElement("input");
            input.type = "text";
            input.id = "filename-input";
            input.value = this.currentFileName || this.unnamed;

            this.filenameDisplay.replaceWith(input);
            input.focus();
            input.select();
            let finished = false;

            const finishEdit = () => {
                if (finished) return;
                finished = true;
                this.currentFileName = input.value.trim();
                input.replaceWith(this.filenameDisplay);
                this.updateFilenameDisplay();
            };

            input.addEventListener("blur", finishEdit);
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    finishEdit();
                } else if (e.key === "Escape") {
                    finished = true;
                    input.replaceWith(this.filenameDisplay);
                }
            });
        });
    }
    get unnamed() {
        return this.i18n.getValue("dynamic", "no-file") || "Unnamed";
    }
    clearFileHandle() {
        this.currentFileHandle = null;
        this.currentFileName = '';
        this.updateFilenameDisplay();
    }
    updateFilenameDisplay(text?: string) {
        this.filenameDisplay.textContent = text || (this.currentFileName || this.unnamed);
    }
    // ======= Сохранение =======
    saveAs = async (): Promise<void> => {
        if (this.hasFSAPI) {
            // --- FSAPI способ ---
            const options = {
                suggestedName: this.currentFileName.endsWith(".json")
                    ? this.currentFileName
                    : this.currentFileName + ".json",
                types: [
                    {
                        description: "Logic Simulator Scheme",
                        accept: { "application/json": [".json"] }
                    }
                ]
            };
            this.currentFileHandle = await (window as any).showSaveFilePicker(options);
            this.currentFileName = this.currentFileHandle?.name.replace(/\.json$/i, "") || this.currentFileName;
            this.updateFilenameDisplay();
            await this.writeToCurrentFile();
        } else {
            // --- Fallback через Blob ---
            const dataStr = this.circuitIO.serializeCircuit();
            const blob = new Blob([dataStr], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = (this.currentFileName || this.unnamed) + ".json";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
        }
    }
    save = async (): Promise<void> => {
        if (this.hasFSAPI) {
            if (!this.currentFileHandle) {
                await this.saveAs();
                return;
            }
            try {
                if (this.currentFileName + '.json' !== this.currentFileHandle.name)
                    await (this.currentFileHandle as any).move(this.currentFileName + '.json');
                await this.writeToCurrentFile();
            } catch (error) {
                console.error("Error moving file:", error);
                await this.saveAs();
            }
            return;
        } else {
            // В старых браузерах всегда будет Save As
            await this.saveAs();
        }
    }

    writeToCurrentFile = async (): Promise<void> => {
        if (!this.currentFileHandle) {
            await this.saveAs();
            return;
        }
        const writable = await this.currentFileHandle.createWritable();
        await writable.write(this.circuitIO.serializeCircuit());
        await writable.close();
    }

    // ======= Загрузка =======
    load = async (add: boolean): Promise<void> => {
        if (this.hasFSAPI) {
            const [fileHandle] = await (window as any).showOpenFilePicker({
                types: [
                    {
                        description: "Logic Simulator Scheme",
                        accept: { "application/json": [".json"] }
                    }
                ]
            });
            if (!add) {
                this.currentFileHandle = fileHandle;
                this.currentFileName = fileHandle.name?.replace(/\.json$/i, "") || this.unnamed;
                this.updateFilenameDisplay();
            }
            const file = await fileHandle.getFile();
            const contents = await file.text();
            if (!add) this.circuitIO.clearCircuit();
            this.circuitIO.deserializeCircuit(contents);
            drawingTimer.step();
        } else {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".json";
            input.onchange = async () => {
                const file = (input.files as FileList)[0];
                if (!file) return;
                if (!add) {
                    this.currentFileName = file.name.replace(/\.json$/i, "");
                    this.updateFilenameDisplay();
                }
                const text = await file.text();
                if (!add) this.circuitIO.clearCircuit();
                this.circuitIO.deserializeCircuit(text);
                drawingTimer.step();
            };
            input.click();
        }
    }

}

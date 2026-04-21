import type { CircuitIO } from "../IOs/circuitIO";
import { ToolMode, type LocaleNames } from "../consts";
import { drawingTimer } from "../drawings";
import { HistoryManager } from "../history";
import { selectionSets, selectedTool } from "../main";
import type { I18n, I18nLocale, I18nLocales } from "../utils/i18n";

export class FileIO {
    private currentFileHandle: FileSystemFileHandle | null = null;
    currentFileName = '';
    // Проверка поддержки FSAPI
    private hasFSAPI = "showSaveFilePicker" in window && "showOpenFilePicker" in window;
    private filenameInput: HTMLInputElement;
    private circuitIO: CircuitIO;
    private i18n;
    private historyManager: HistoryManager;
    private fileFM: HTMLElement;
    constructor(i18n: I18n<I18nLocale, LocaleNames, I18nLocales<LocaleNames, I18nLocale>>, circuitIO: CircuitIO, historyManager: HistoryManager) {
        this.i18n = i18n;
        this.circuitIO = circuitIO;
        this.historyManager = historyManager;
        this.fileFM = document.getElementById('fm-file')!;
        this.filenameInput = document.getElementById('filename-input')! as HTMLInputElement;

        const finishEdit = () => {
            this.currentFileName = this.filenameInput.value.trim();
        };
        this.filenameInput.addEventListener("blur", finishEdit);
        this.filenameInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                finishEdit();
                this.filenameInput.blur();
            } else if (e.key === "Escape") {
                this.filenameInput.value = this.currentFileName;
                this.filenameInput.blur();
            }
        });
    }
    get unnamed() {
        return this.i18n.getValue("dynamic", "no-file") || "Unnamed";
    }
    clearFileHandle() {
        this.currentFileHandle = null;
        this.currentFileName = '';
        this.updateFilenameDisplay();
        this.historyManager.clear();
    }
    updateFilenameDisplay(text?: string) {
        this.filenameInput.value = text || (this.currentFileName || this.unnamed);
    }
    // ======= Сохранение =======
    saveAs = async (): Promise<void> => {
        if (this.hasFSAPI) {
            // --- FSAPI способ ---
            this.currentFileHandle = await (window as any).showSaveFilePicker({
                id: 'losi-file-picker',
                suggestedName: this.currentFileName.endsWith(".json")
                    ? this.currentFileName
                    : this.currentFileName + ".json",
                types: [
                    {
                        description: "Logic Simulator Scheme",
                        accept: { "application/json": [".json"] }
                    }
                ]
            });
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
                id: 'losi-file-picker',
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
            this.processLoadedFile(file, add);
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
                this.processLoadedFile(file, add);
            };
            input.click();
        }
    }
    private async processLoadedFile(file: File, add: boolean) {
        const contents = await file.text();
        if (!add) this.circuitIO.clearCircuit();
        try {
            const newElements = Array.from(this.circuitIO.deserializeCircuit(contents));
            if (!add) {
                this.historyManager.clear();
            } else {
                this.historyManager.pushSelectionsState(['selection']);
                selectionSets['selection'] = new Set(newElements);
                this.historyManager.recordAddSchemeFromFile(newElements);
                this.historyManager.recordSelectionsChange(['selection']);
            }
        } catch (e) {
            if (!add) {
                this.clearFileHandle();
            }
        }
        drawingTimer.step();
    }
}

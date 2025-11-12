import type { CircuitIO } from "./circuitIO";
import { draw } from "./drawingWGL";

export class FileIO {
    currentFileHandle: FileSystemFileHandle | null = null;
    currentFileName = "Unnamed";
    // Проверка поддержки FSAPI
    hasFSAPI = "showSaveFilePicker" in window && "showOpenFilePicker" in window;
    filenameDisplay: HTMLSpanElement;
    circuitIO: CircuitIO;
    constructor(circuitIO: CircuitIO, filenameDisplaySpan: HTMLSpanElement) {
        this.filenameDisplay = filenameDisplaySpan;
        this.circuitIO = circuitIO;
        // Клик по имени — превращаем в input для редактирования
        this.filenameDisplay.addEventListener("click", () => {
            const input = document.createElement("input");
            input.type = "text";
            input.id = "filename-input";
            input.value = this.currentFileName;

            this.filenameDisplay.replaceWith(input);
            input.focus();
            input.select();
            let finished = false;

            const finishEdit = () => {
                if (finished) return;
                finished = true;
                this.currentFileName = input.value.trim() || "Unnamed";
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

    clearFileHandle() {
        this.currentFileHandle = null;
        this.currentFileName = "Unnamed";
        this.updateFilenameDisplay();
    }
    updateFilenameDisplay() {
        this.filenameDisplay.textContent = this.currentFileName;
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
            a.download = (this.currentFileName || "scheme") + ".json";
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

    writeToCurrentFile = async(): Promise<void> => {
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
                this.currentFileName = fileHandle.name?.replace(/\.json$/i, "") || "Unnamed";
                this.updateFilenameDisplay();
            }
            const file = await fileHandle.getFile();
            const contents = await file.text();
            if (!add) this.circuitIO.clearCircuit();
            this.circuitIO.deserializeCircuit(contents);
            requestAnimationFrame(draw);
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
                requestAnimationFrame(draw);
            };
            input.click();
        }
    }

}

# LoSi: A Web-Based Digital Logic Circuit Simulator

`LoSi` is an interactive web application designed for simulating digital logic circuits directly in your browser. Built with modern web technologies, it provides a user-friendly interface for designing, testing, and understanding digital logic. The simulator leverages WebAssembly (Wasm) for potentially enhanced performance in complex simulations, offering a robust platform for both educational and hobbyist use.

## Features

### Core Logic Elements

The simulator provides a comprehensive set of fundamental digital logic components:

*   **Logic Gates**: AND, OR, XOR, NAND, NOR, XNOR
*   **Sequential Logic**: T-Flip-Flop (T-Flop)
*   **Timing Elements**: Timer (delays signals by a specified number of simulation ticks)
*   **Input Components**: Button (momentary signal), Switch (toggleable signal)
*   **Output Components**: Output (indicator lamp)

### LogEq Language Compiler

`LoSi` includes a powerful custom language, LogEq, for defining complex logic circuits programmatically. The integrated compiler features:

*   **Lexical Analysis**: Tokenization of LogEq source code.
*   **Syntax Analysis (AST)**: Construction of an Abstract Syntax Tree from tokens.
*   **Circuit Building**: Transformation of the AST into a functional circuit on the workspace.
*   **Flattening Option**: Optimize circuits by variable substitution and negation expansion, or build them exactly as written.
*   **Debugging Output**: Detailed compilation logs including AST and circuit layer representations.

### Interactive Simulation

Control and observe your circuits with a dynamic simulation engine:

*   **Start/Stop**: Begin and pause the simulation.
*   **Step**: Execute the simulation one tick at a time.
*   **Frequency Control**: Adjust the simulation speed in Hertz.

### Advanced Connection Modes

Beyond simple point-to-point wiring, `LoSi` offers sophisticated connection tools for efficient circuit design:

*   **N to N**: Connect multiple sources to multiple targets simultaneously.
*   **Sequence**: Create chained connections between elements in a sequence.
*   **Parallel**: Establish parallel connections between buses of elements.
*   **Decoder**: Automatically generate decoder logic from binary inputs to unary outputs.

### File Operations

Manage your circuit designs with intuitive file handling:

*   **Save**: Export your current circuit as a JSON file.
*   **Load**: Import a saved circuit, replacing the current workspace.
*   **Add**: Import a saved circuit and merge it with the current workspace.
*   **Clear**: Reset the workspace, removing all elements and connections.

### User Interface & Experience

The application is designed for ease of use and customization:

*   **Floating Menus**: Draggable, collapsible, and persistent menus for tools, palette, settings, and more.
*   **Drag-and-Drop**: Easily add components from the palette or move existing elements.
*   **Undo/Redo**: Comprehensive history management for all editor actions.
*   **Zoom & Pan**: Navigate large circuits with mouse wheel zoom and pan controls.
*   **Element Interaction**: Right-click to interact with elements (e.g., press buttons, toggle switches, change gate types, adjust timer delays).
*   **Tooltips**: Hover over elements for quick information and inline editing options.
*   **Settings**: Customize language, theme (System, Light, Dark), drawing mode (Canvas, WebGL), grid style, and FPS.
*   **Localization**: Support for multiple languages (currently English, Russian and Polish).

### Timing Diagram

Visualize signal changes over time with the integrated timing diagram:

*   **Record Signals**: Monitor the state of selected elements over simulation ticks.
*   **Clear Records**: Reset the timing diagram history.
*   **Interactive Display**: View waveforms, cycle gridlines, and element labels.

## Screenshots and GIFs
Basic circuit creation and simulation
<img src="/assets/images/basic.gif" width=600 alt="Basic circuit creation and simulation">

LogEq editor with a sample code and the resulting circuit
<img src="/assets/images/logeq.png" width=600 alt="LogEq editor with a sample code and the resulting circuit">

Advanced connection modes: Decoder
<img src="/assets/images/decoder.gif" width=600 alt="Advanced connection modes: Decoder">

Timing Diagram for counter in action
<img src="/assets/images/timing-diagram.gif" width=600 alt="Timing Diagram for counter in action">

Themes \
<img src="/assets/images/light.png" width=300 alt="Light theme"><img src="/assets/images/dark.png" width=300 alt="Dark theme">

## Getting Started

To run `LoSi` locally, follow these steps:

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/C0FFiN-prod/wasm_logic.git
    cd wasm_logic
    ```
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Run in development mode**:
    ```bash
    npm run dev
    ```
    This will start a development server, usually accessible at `http://localhost:5173/`.

4.  **Build for production**:
    ```bash
    npm run build
    ```
    This will compile the project into the `dist` directory.

5.  **Preview the production build**:
    ```bash
    npm run preview
    ```

## Future Development Perspectives

The following enhancements are planned or under consideration to further improve `LoSi`:

*   **WebWorker Simulation**: Offloading the simulation engine to a WebWorker to prevent UI freezes and improve responsiveness for very large or complex circuits.
*   **WASM Rewrite**: Reimplementing critical performance-sensitive parts of the simulation logic in WebAssembly for significant speed improvements.
*   **Subcircuits and Libraries**: Introduction of subcircuit functionality, allowing users to encapsulate complex logic into reusable modules and build libraries of custom components.
*   **Project-Based Scheme Management**: Enable opening folders containing multiple circuit schemes as a project, facilitating quick switching, editing, and inter-scheme element insertion.
*   **LogEq Enhancements**: Extend the LogEq language to support buses and arrays, enabling more compact and powerful descriptions of multi-bit logic.

## Contributing

Contributions are welcome! Please feel free to open issues or submit pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.


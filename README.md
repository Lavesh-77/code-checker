# Linecheck

Linecheck is a locally run code comparison and practice tool for the programs in `PPS_LabManual_II.pdf`. It organizes the manual into Practice and Lab programs, lets you add your own solution, and compares the two as source text and by running selected test inputs.

## Features

- Loads and extracts the programs from the bundled PDF when the app starts.
- Lists the manual's 25 programs in order, with Practice programs before Lab programs.
- Shows reference code for the selected exercise.
- Accepts pasted code or uploaded `.c`, `.cpp`, and `.py` files.
- Displays a side-by-side, line-by-line source diff.
- Offers PDF example inputs when they can be extracted, plus one custom standard-input test per run.
- Runs the reference and your code with the same input, then reports exact output matches separately from matching numeric values.
- Provides a heuristic source-structure similarity hint. This is not a semantic analyzer or proof of equivalence.
- Keeps the web server bound to `127.0.0.1`; uploaded code is sent only to the local Python server on your computer.

## Requirements

The current runner is designed for Linux and requires:

- Python 3
- Poppler's `pdftotext` command
- GCC and G++

On Ubuntu/Debian, install the system tools with:

```sh
sudo apt update
sudo apt install python3 poppler-utils build-essential
```

## Start the app

From the project folder, run:

```sh
python3 server.py
```

Keep the terminal open and visit <http://127.0.0.1:8000>. Stop the server with `Ctrl+C`.

## Use it

1. Select a Practice or Lab program from the list.
2. Paste your solution or upload a `.c`, `.cpp`, or `.py` file. Choose the language if you pasted the code; uploading a file selects it automatically.
3. Select one or more PDF examples, if available, and/or enter custom standard input.
4. Confirm the execution warning and click **Run comparison**.
5. Review the test outputs and the side-by-side source diff.

An exact match means stdout, stderr, and a successful exit status match for that test. A numeric-values match means the extracted numeric values match after `Enter …:` prompts are removed, even if the surrounding text differs. Neither result proves that two programs are equivalent for all inputs.

## Safety and limitations

**Uploaded code is compiled and run directly on your computer with your account permissions.** The runner applies basic time, memory, and output limits, but it is not an operating-system sandbox: code may still access files, network services, and other resources available to your account. Only run code you trust. Do not expose this server to the public internet.

Other current limitations:

- Test comparison covers only the selected inputs; it does not prove general behavioral equivalence.
- The source-structure similarity score is a heuristic that ignores names, spacing, comments, include order, and quoted strings. It may be misleading.
- Input is provided through standard input. Programs that read external files (for example, Lab 9b) need file-fixture support and are not fully supported by the tester yet.
- The PDF extractor and compatibility shims target the bundled Turbo C-style manual. Other compiler-specific code may need changes.
- Static hosting such as GitHub Pages cannot run the Python API, PDF extraction, or compilers used by this version.

## Project files

- `server.py` — localhost web server, PDF extraction, and local test runner.
- `index.html`, `styles.css`, `app.js` — browser interface and source comparison.
- `PPS_LabManual_II.pdf` — bundled reference manual.
- `docs/PROJECT_SPEC.md` — project requirements and scope.

## Future improvements

- Run submitted programs inside a strongly isolated container instead of directly on the host.
- Support temporary test fixture files for exercises that read or write files.
- Improve PDF extraction and sample-input recovery for more document formats and unusual layouts.
- Add test suites with multiple custom cases, saved locally in the browser.
- Compare non-numeric results more intelligently while keeping exact output comparison available.
- Add clearer diagnostics for compiler errors, timeouts, and failed tests.
- Improve keyboard navigation, accessibility, and small-screen diff navigation.
- Add report export and a simple way to share a selected test result.

## Contributing

Issues and improvements are welcome. Before running a submitted program, remember that it executes with your local account permissions.

# Project Specification: Local Program Code Checker

## Problem and goal

Create a clean, locally running website that loads the project's `PPS_LabManual_II.pdf`, organizes its reference programs into Practice and Lab sections, and lets the user compare their own code with a selected program from the manual.

## MVP requirements

- Run locally; do not host or deploy the website.
- Read the bundled `PPS_LabManual_II.pdf` locally and extract the code under each Practice/Lab program heading.
- List Practice entries first, then Lab entries, preserving the order and labels in the manual (for example, Practice 4a and Lab 1a).
- On selecting a program, let the user paste code or upload their own `.c`, `.py`, or `.cpp` file.
- Display the selected reference and user's code side by side, highlighting changed lines.
- Add a cautious local structure-similarity note that ignores superficial changes such as names, whitespace, comments, include order, and printed strings; do not present it as proof of equivalent behavior.
- Allow the user to run both programs on the same selected PDF example inputs and optional custom stdin input, then compare exit status and output; report exact output and numeric-output matches separately.
- Show a direct-execution warning and require an explicit confirmation before running code.
- Apply basic local execution limits for runtime, memory, and output size; make clear that direct execution is not a security sandbox.
- Keep the interface clean and easy to use.
- Use the files locally; do not send them to a hosted service.

## Out of scope

- Executing or compiling uploaded code.
- Testing program behavior or correctness.
- Explaining whether differences are bugs.
- Hosted deployment.

## Assumptions

- The comparison is a textual diff, not a semantic or language-aware comparison.
- PDF extraction is performed on the local machine; no hosted parser is used.
- The manual's source code is the reference; testing provides evidence only for selected inputs and cannot prove general equivalence.
- The user explicitly chose direct execution instead of requiring Docker. Submitted code runs locally with the user's account permissions, so the warning must be prominent.

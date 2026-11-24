#!/usr/bin/env python3
"""Serve the local code checker and extract its bundled PDF reference programs."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import os
import re
import resource
import signal
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
PDF_PATH = ROOT / "PPS_LabManual_II.pdf"
HEADING = re.compile(r"^\s*(Practice|Lab)\s+([\w]+)\s+-\s*(.+?)\s*$", re.IGNORECASE)


def extract_programs():
    if not PDF_PATH.is_file():
        raise RuntimeError(f"Could not find {PDF_PATH.name} next to server.py.")
    try:
        result = subprocess.run(
            ["pdftotext", "-layout", "-nopgbrk", str(PDF_PATH), "-"],
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("PDF text extraction needs Poppler's pdftotext command.") from exc
    except subprocess.CalledProcessError as exc:
        raise RuntimeError("Could not extract text from PPS_LabManual_II.pdf.") from exc

    lines = result.stdout.replace("\f", "\n").splitlines()
    sections = []
    current = None
    for line in lines:
        match = HEADING.match(line)
        if match:
            if current:
                sections.append(current)
            category, number, title = match.groups()
            current = {
                "category": category.title(),
                "number": number,
                "title": title.strip(),
                "section": f"{category.title()} {number}",
                "lines": [],
            }
        elif current:
            current["lines"].append(line)
    if current:
        sections.append(current)

    programs = []
    for section in sections:
        lines = section.pop("lines")
        start = next((i for i, line in enumerate(lines) if line.lstrip().startswith("#include")), None)
        if start is None:
            continue
        code_lines = []
        expected_lines = []
        reading_expected = False
        for line in lines[start:]:
            if re.match(r"^\s*Expected Output\b", line):
                reading_expected = True
                break
            if re.match(r"^\s*(Aim:|Note:|Steps in Turbo C\+\+:)", line):
                break
            code_lines.append(line.rstrip())
        while code_lines and not code_lines[-1].strip():
            code_lines.pop()
        # pdftotext retains the page's left margin; remove the shared margin
        # while preserving indentation within the extracted source.
        indents = [len(line) - len(line.lstrip()) for line in code_lines if line.strip()]
        margin = min(indents, default=0)
        code = "\n".join(line[margin:] if line.strip() else "" for line in code_lines)
        # Keep expected-output examples so the browser can offer corresponding
        # sample inputs when they can be recovered from the printed prompts.
        section_lines = lines[start + len(code_lines):]
        expected_lines = section_lines
        samples = extract_samples(code, expected_lines)
        if section["category"] == "Lab" and section["number"].lower() == "7" and samples:
            # The PDF places matrix elements below the "Enter matrix" prompts,
            # rather than on prompt lines, so the generic prompt parser misses them.
            samples = ["2 2\n1 2\n3 4\n2 2\n5 6\n7 8"]
        section.update({
            "id": f"{section['category'].lower()}-{section['number'].lower()}",
            "code": code,
            "samples": samples,
        })
        programs.append(section)

    if not programs:
        raise RuntimeError("No program source code was found in the PDF.")
    return programs


def extract_samples(code, expected_lines):
    prompts = []
    for match in re.finditer(r'\bprintf\s*\(\s*"((?:\\.|[^"\\])*)"', code):
        prompt = match.group(1).replace(r"\n", " ").replace(r"\t", " ")
        if prompt.strip().lower().startswith("enter"):
            prompts.append(prompt)
    if not prompts:
        return []

    cases = []
    current = []
    in_expected_output = False
    for line in expected_lines:
        if re.match(r"^\s*Expected Output\b", line):
            if current:
                cases.append(current)
                current = []
            in_expected_output = True
            continue
        if not in_expected_output:
            continue
        for prompt in prompts:
            pattern = re.escape(prompt).replace(r"%d", r"-?\d+").replace(r"%f", r"-?\d+(?:\.\d+)?")
            match = re.search(pattern, line, re.IGNORECASE)
            if match:
                value = line[match.end():].strip()
                if value:
                    current.append(value)
                break
    if current:
        cases.append(current)
    # A sample with no recoverable interactive input is not runnable as stdin.
    return ["\n".join(case) for case in cases if case]


def _runtime_limits():
    resource.setrlimit(resource.RLIMIT_CPU, (3, 3))
    resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_FSIZE, (512 * 1024, 512 * 1024))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_NOFILE, (32, 32))


def _prepare_program(directory, label, source, language):
    extension = {"c": ".c", "cpp": ".cpp", "python": ".py"}[language]
    path = Path(directory) / f"{label}{extension}"
    if language in {"c", "cpp"}:
        source = re.sub(r"\bvoid\s+main\s*\(", "int main(", source)
    path.write_text(source, encoding="utf-8")
    if language == "python":
        return [sys.executable, "-I", str(path)]

    shim = """#include <stdio.h>
#include <string.h>
static inline void clrscr(void) {}
static inline int getch(void) { return 0; }
static inline char *linecheck_gets(char *s, size_t n) { if (!fgets(s, (int)n, stdin)) return NULL; s[strcspn(s, "\\n")] = '\\0'; return s; }
static inline char *linecheck_strrev(char *s) { size_t i, n = strlen(s); for (i = 0; i < n / 2; i++) { char c = s[i]; s[i] = s[n - 1 - i]; s[n - 1 - i] = c; } return s; }
#define gets(s) linecheck_gets((s), sizeof(s))
#define strrev(s) linecheck_strrev(s)
"""
    (Path(directory) / "conio.h").write_text(shim, encoding="utf-8")
    compiler = "gcc" if language == "c" else "g++"
    executable = Path(directory) / f"{label}-program"
    command = [compiler, "-w", "-I", directory, str(path), "-o", str(executable)]
    if language == "c":
        command.append("-lm")
    try:
        compiled = subprocess.run(command, capture_output=True, text=True, timeout=12, cwd=directory)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"{label}: compilation timed out.") from exc
    if compiled.returncode != 0:
        raise RuntimeError(f"{label}: compilation failed.\n{compiled.stderr[-4000:]}")
    return [str(executable)]


def _run_case(command, input_text, directory, prefix):
    stdout_path = Path(directory) / f"{prefix}.stdout"
    stderr_path = Path(directory) / f"{prefix}.stderr"
    timed_out = False
    process = None
    with stdout_path.open("wb") as stdout_file, stderr_path.open("wb") as stderr_file:
        try:
            process = subprocess.Popen(
                command,
                stdin=subprocess.PIPE,
                stdout=stdout_file,
                stderr=stderr_file,
                cwd=directory,
                preexec_fn=_runtime_limits,
                start_new_session=True,
                env={"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "LANG": "C.UTF-8"},
            )
            process.communicate(input=input_text.encode("utf-8"), timeout=4)
            exit_code = process.returncode
        except subprocess.TimeoutExpired:
            timed_out = True
            exit_code = None
            if process is not None:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait()
        except OSError as error:
            return {"stdout": "", "stderr": str(error), "exitCode": None, "timedOut": False}
    stdout = stdout_path.read_bytes()[:256 * 1024].decode("utf-8", errors="replace")
    stderr = stderr_path.read_bytes()[:256 * 1024].decode("utf-8", errors="replace")
    return {"stdout": stdout, "stderr": stderr, "exitCode": exit_code, "timedOut": timed_out}


def compare_programs(payload):
    reference = payload.get("reference", "")
    attempt = payload.get("code", "")
    language = payload.get("language")
    tests = payload.get("tests", [])
    if not isinstance(reference, str) or not isinstance(attempt, str) or len(reference) > 100_000 or len(attempt) > 100_000:
        raise RuntimeError("Code must be text and no larger than 100 KB per program.")
    if language not in {"c", "cpp", "python"}:
        raise RuntimeError("Choose C, C++, or Python for your code.")
    if not isinstance(tests, list) or not tests or len(tests) > 20:
        raise RuntimeError("Choose at least one test input (up to 20 per comparison).")
    if any(not isinstance(test, dict) or not isinstance(test.get("input", ""), str) or len(test.get("input", "")) > 20_000 for test in tests):
        raise RuntimeError("Each test input must be text smaller than 20 KB.")

    with tempfile.TemporaryDirectory(prefix="linecheck-") as temp_dir:
        reference_command = _prepare_program(temp_dir, "reference", reference, "c")
        attempt_command = _prepare_program(temp_dir, "attempt", attempt, language)
        results = []
        for index, test in enumerate(tests):
            expected = _run_case(reference_command, test.get("input", ""), temp_dir, f"ref-{index}")
            actual = _run_case(attempt_command, test.get("input", ""), temp_dir, f"attempt-{index}")
            expected["sameOutput"] = (
                expected["stdout"] == actual["stdout"]
                and expected["stderr"] == actual["stderr"]
                and expected["exitCode"] == actual["exitCode"] == 0
                and not expected["timedOut"]
                and not actual["timedOut"]
            )
            numeric_pattern = r"(?<![\w.])-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?"
            ref_output = re.sub(r"\bEnter\b[^:\n]*:\s*", "", expected["stdout"], flags=re.IGNORECASE)
            own_output = re.sub(r"\bEnter\b[^:\n]*:\s*", "", actual["stdout"], flags=re.IGNORECASE)
            ref_numbers = re.findall(numeric_pattern, ref_output)
            own_numbers = re.findall(numeric_pattern, own_output)
            expected["sameNumericValues"] = (
                bool(ref_numbers and own_numbers)
                and len(ref_numbers) == len(own_numbers)
                and all(float(a) == float(b) for a, b in zip(ref_numbers, own_numbers))
                and expected["exitCode"] == actual["exitCode"] == 0
                and not expected["timedOut"]
                and not actual["timedOut"]
            )
            results.append({"name": test.get("name", f"Test {index + 1}"), "input": test.get("input", ""), "reference": expected, "yourCode": actual})
        return results


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path == "/api/programs":
            try:
                payload = json.dumps(extract_programs()).encode("utf-8")
            except RuntimeError as error:
                payload = json.dumps({"error": str(error)}).encode("utf-8")
                self.send_response(500)
            else:
                self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)
            return
        if self.path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self):
        if self.path != "/api/compare":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 250_000:
                raise RuntimeError("Comparison request is empty or too large.")
            payload = json.loads(self.rfile.read(length))
            result = {"tests": compare_programs(payload)}
            status = 200
        except (ValueError, json.JSONDecodeError) as error:
            result = {"error": f"Invalid request: {error}"}
            status = 400
        except RuntimeError as error:
            result = {"error": str(error)}
            status = 400
        except Exception as error:
            result = {"error": f"Could not run comparison: {error}"}
            status = 500
        body = json.dumps(result).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    try:
        programs = extract_programs()
    except RuntimeError as error:
        sys.exit(str(error))
    print(f"Loaded {len(programs)} programs from {PDF_PATH.name}")
    print(f"Open http://127.0.0.1:{port} in your browser")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()

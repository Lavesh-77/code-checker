const allowedExtensions = new Set(['c', 'py', 'cpp']);
let programs = [];
let selectedProgram = null;

const programList = document.getElementById('program-list');
const workCard = document.getElementById('work-card');
const emptyState = document.getElementById('empty-state');
const results = document.getElementById('results');
const yourCode = document.getElementById('your-code');
const errorMessage = document.getElementById('error-message');

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = !message;
}

function renderProgramList() {
  programList.replaceChildren();
  for (const category of ['Practice', 'Lab']) {
    const groupPrograms = programs.filter(program => program.category === category);
    if (!groupPrograms.length) continue;
    const group = document.createElement('section');
    group.className = 'program-group';
    const heading = document.createElement('h2');
    heading.textContent = category === 'Practice' ? 'Practice programs' : 'Lab programs';
    const items = document.createElement('div');
    items.className = 'program-group-items';
    for (const program of groupPrograms) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'program-button';
      button.dataset.programId = program.id;
      const number = document.createElement('span');
      number.className = 'program-number';
      number.textContent = program.section;
      const title = document.createElement('span');
      title.className = 'program-name';
      title.textContent = program.title;
      button.append(number, title);
      button.addEventListener('click', () => selectProgram(program));
      items.append(button);
    }
    group.append(heading, items);
    programList.append(group);
  }
  document.getElementById('program-count').textContent = `${programs.length} programs`;
}

function selectProgram(program) {
  selectedProgram = program;
  document.querySelectorAll('.program-button').forEach(button => {
    button.classList.toggle('active', button.dataset.programId === program.id);
    button.setAttribute('aria-current', button.dataset.programId === program.id ? 'true' : 'false');
  });
  document.getElementById('program-label').textContent = program.section.toUpperCase();
  document.getElementById('program-title').textContent = program.title;
  document.getElementById('reference-code').textContent = program.code;
  document.getElementById('reference-preview').hidden = true;
  document.getElementById('upload-name').textContent = 'Paste code or choose a file · .c, .py, .cpp';
  document.getElementById('code-upload').value = '';
  yourCode.value = '';
  document.getElementById('custom-input').value = '';
  document.getElementById('run-consent').checked = false;
  const sampleTests = document.getElementById('sample-tests');
  sampleTests.replaceChildren();
  program.samples.forEach((input, index) => {
    const label = document.createElement('label');
    label.className = 'sample-test';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.dataset.testInput = input;
    checkbox.dataset.testName = `PDF example ${index + 1}`;
    const text = document.createElement('span');
    text.textContent = `PDF example ${index + 1}`;
    label.append(checkbox, text);
    sampleTests.append(label);
  });
  if (!program.samples.length) {
    const note = document.createElement('span');
    note.className = 'test-heading-note';
    note.textContent = 'No interactive sample input found in the PDF; add your own below.';
    sampleTests.append(note);
  }
  workCard.hidden = false;
  emptyState.hidden = true;
  results.hidden = true;
  document.getElementById('test-results').replaceChildren();
  showError('');
  workCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

document.getElementById('show-reference').addEventListener('click', () => {
  document.getElementById('reference-preview').hidden = false;
});
document.getElementById('hide-reference').addEventListener('click', () => {
  document.getElementById('reference-preview').hidden = true;
});

document.getElementById('code-upload').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  if (!allowedExtensions.has(file.name.split('.').pop().toLowerCase())) {
    showError('Please upload a .c, .py, or .cpp file.');
    event.target.value = '';
    return;
  }
  try {
    yourCode.value = await file.text();
    const ext = file.name.split('.').pop().toLowerCase();
    document.getElementById('language-select').value = ext === 'py' ? 'python' : ext === 'cpp' ? 'cpp' : 'c';
    document.getElementById('upload-name').textContent = `Loaded ${file.name} · you can edit the code above`;
    showError('');
    results.hidden = true;
  } catch {
    showError(`Could not read ${file.name}. Please try another file.`);
  }
});
yourCode.addEventListener('input', () => { results.hidden = true; });

function makeDiff(leftText, rightText) {
  const left = leftText.replace(/\r\n/g, '\n').split('\n');
  const right = rightText.replace(/\r\n/g, '\n').split('\n');
  const rows = left.length + 1;
  const cols = right.length + 1;
  if (rows * cols > 2_000_000) {
    return Array.from({ length: Math.max(left.length, right.length) }, (_, i) => {
      const a = left[i]; const b = right[i];
      if (a === b) return { left: a, right: b, type: 'same' };
      return { left: a, right: b, leftType: a === undefined ? 'empty-change' : 'removed', rightType: b === undefined ? 'empty-change' : 'added' };
    });
  }
  const dp = Array.from({ length: rows }, () => new Uint32Array(cols));
  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
      dp[i][j] = left[i] === right[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0; let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { ops.push({ kind: 'same', value: left[i++] }); j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push({ kind: 'removed', value: left[i++] });
    else ops.push({ kind: 'added', value: right[j++] });
  }
  while (i < left.length) ops.push({ kind: 'removed', value: left[i++] });
  while (j < right.length) ops.push({ kind: 'added', value: right[j++] });

  const aligned = [];
  for (let k = 0; k < ops.length;) {
    if (ops[k].kind === 'same') {
      aligned.push({ left: ops[k].value, right: ops[k].value, type: 'same' });
      k++;
      continue;
    }
    const removed = []; const added = [];
    while (k < ops.length && ops[k].kind !== 'same') {
      if (ops[k].kind === 'removed') removed.push(ops[k].value);
      else added.push(ops[k].value);
      k++;
    }
    for (let n = 0; n < Math.max(removed.length, added.length); n++) {
      aligned.push({
        left: removed[n], right: added[n],
        leftType: removed[n] === undefined ? 'empty-change' : 'removed',
        rightType: added[n] === undefined ? 'empty-change' : 'added',
      });
    }
  }
  return aligned;
}

function addLine(container, content, lineNumber, type) {
  const row = document.createElement('div');
  row.className = `code-line ${type || ''}`;
  const number = document.createElement('span');
  number.className = 'number';
  number.textContent = lineNumber === null ? '' : String(lineNumber);
  const text = document.createElement('span');
  text.className = 'content';
  text.textContent = content === undefined ? '' : content;
  row.append(number, text);
  container.append(row);
}

function structuralTokens(source) {
  const lexer = /\s+|#include[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\d+(?:\.\d+)?|[A-Za-z_$][\w$]*|\+\+|--|\+=|-=|\*=|\/=|==|!=|<=|>=|&&|\|\||->|./gy;
  const tokens = [];
  for (const match of source.matchAll(lexer)) {
    const token = match[0];
    if (/^\s+$/.test(token) || token.startsWith('#include') || token.startsWith('//') || token.startsWith('/*')) continue;
    if (token.startsWith('"') || token.startsWith("'")) tokens.push('STRING');
    else if (/^[A-Za-z_$]/.test(token)) tokens.push('IDENTIFIER');
    else if (token === '+=') tokens.push('=', '+');
    else if (token === '-=') tokens.push('=', '-');
    else if (token === '*=') tokens.push('=', '*');
    else if (token === '/=') tokens.push('=', '/');
    else tokens.push(token);
  }
  return tokens;
}

function structureSimilarity(leftSource, rightSource) {
  const left = structuralTokens(leftSource);
  const right = structuralTokens(rightSource);
  if (left.length * right.length > 1_000_000) return null;
  let next = new Uint32Array(right.length + 1);
  let current = new Uint32Array(right.length + 1);
  for (let i = left.length - 1; i >= 0; i--) {
    current.fill(0);
    for (let j = right.length - 1; j >= 0; j--) {
      current[j] = left[i] === right[j] ? next[j + 1] + 1 : Math.max(next[j], current[j + 1]);
    }
    [next, current] = [current, next];
  }
  const denominator = left.length + right.length;
  return denominator ? (2 * next[0]) / denominator : 1;
}

function printMessages(source) {
  return Array.from(source.matchAll(/\bprintf\s*\(\s*("(?:\\.|[^"\\])*")/g), match => match[1]);
}

function renderSmartSummary(reference, attempt) {
  const summary = document.getElementById('smart-summary');
  const similarity = structureSimilarity(reference, attempt);
  const messagesDiffer = JSON.stringify(printMessages(reference)) !== JSON.stringify(printMessages(attempt));
  summary.classList.toggle('caution', similarity === null || similarity < 0.72);
  if (similarity !== null && similarity >= 0.72) {
    const percent = Math.round(similarity * 100);
    summary.textContent = `The code structure looks highly similar (${percent}%) after ignoring names, spacing, comments, include order, and printed text. The core approach may be the same${messagesDiffer ? '; printed prompts or results differ.' : '.'} This is a heuristic, not a guarantee that the programs behave identically.`;
  } else if (similarity === null) {
    summary.textContent = 'This code is large for the local structure check. Review the highlighted line differences; no claim about equivalent behavior can be made.';
  } else {
    summary.textContent = `The code structure differs noticeably (${Math.round(similarity * 100)}% similarity after ignoring names, spacing, comments, include order, and printed text). Review the highlighted changes; this comparison cannot determine correctness.`;
  }
}

document.getElementById('check-button').addEventListener('click', () => {
  if (!selectedProgram) return;
  if (!yourCode.value.trim()) {
    showError('Paste or upload your code before checking.');
    yourCode.focus();
    return;
  }
  if (!document.getElementById('run-consent').checked) {
    showError('Please confirm you understand that this runs code directly on your computer.');
    return;
  }
  const tests = Array.from(document.querySelectorAll('#sample-tests input:checked'), checkbox => ({ name: checkbox.dataset.testName, input: checkbox.dataset.testInput }));
  const customInput = document.getElementById('custom-input').value;
  if (customInput.trim()) tests.push({ name: 'Your custom input', input: customInput });
  if (!tests.length) {
    showError('Select a PDF example or enter a custom test input.');
    return;
  }
  if (tests.length > 20) {
    showError('Please run no more than 20 tests at a time.');
    return;
  }
  showError('');
  const checkButton = document.getElementById('check-button');
  checkButton.disabled = true;
  checkButton.textContent = 'Running tests…';
  runBehaviorTests(tests).finally(() => {
    checkButton.disabled = false;
    checkButton.innerHTML = 'Run comparison <span>→</span>';
  });

  const leftPane = document.getElementById('reference-lines');
  const rightPane = document.getElementById('your-lines');
  leftPane.replaceChildren();
  rightPane.replaceChildren();
  let leftNumber = 0; let rightNumber = 0; let removed = 0; let added = 0;
  const diff = makeDiff(selectedProgram.code, yourCode.value);
  renderSmartSummary(selectedProgram.code, yourCode.value);
  for (const line of diff) {
    if (Object.hasOwn(line, 'left')) {
      leftNumber++;
      addLine(leftPane, line.left, leftNumber, line.type || line.leftType);
      if (line.type === 'removed' || line.leftType === 'removed') removed++;
    } else addLine(leftPane, undefined, null, 'empty-change');
    if (Object.hasOwn(line, 'right')) {
      rightNumber++;
      addLine(rightPane, line.right, rightNumber, line.type || line.rightType);
      if (line.type === 'added' || line.rightType === 'added') added++;
    } else addLine(rightPane, undefined, null, 'empty-change');
  }
  document.getElementById('diff-summary').textContent = removed === 0 && added === 0
    ? 'Your code matches the reference exactly.'
    : `${removed} reference line${removed === 1 ? '' : 's'} changed or removed · ${added} line${added === 1 ? '' : 's'} added or changed`;
  results.hidden = false;
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

async function runBehaviorTests(tests) {
  const testResults = document.getElementById('test-results');
  testResults.replaceChildren();
  try {
    const response = await fetch('/api/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reference: selectedProgram.code,
        code: yourCode.value,
        language: document.getElementById('language-select').value,
        tests,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The comparison could not be run.');
    const matches = data.tests.filter(test => test.reference.sameOutput).length;
    const numericMatches = data.tests.filter(test => test.reference.sameNumericValues).length;
    for (const test of data.tests) {
      const card = document.createElement('article');
      card.className = 'test-result';
      const heading = document.createElement('div');
      heading.className = 'test-result-heading';
      const title = document.createElement('span');
      title.textContent = test.name;
      const status = document.createElement('span');
      status.className = `test-status ${test.reference.sameOutput || test.reference.sameNumericValues ? 'match' : ''}`;
      status.textContent = test.reference.sameOutput ? 'Output matches' : test.reference.sameNumericValues ? 'Numeric values match · text differs' : 'Output differs';
      heading.append(title, status);
      const outputs = document.createElement('div');
      outputs.className = 'test-outputs';
      outputs.append(makeOutputPane('Manual reference', test.reference), makeOutputPane('Your program', test.yourCode));
      const meta = document.createElement('div');
      meta.className = 'test-meta';
      meta.textContent = `Input: ${test.input || '(empty)'} · Exit codes: ${test.reference.exitCode ?? 'timeout'} / ${test.yourCode.exitCode ?? 'timeout'}`;
      card.append(heading, outputs, meta);
      testResults.append(card);
    }
    const aggregate = document.createElement('p');
    aggregate.className = `behavior-summary ${matches === data.tests.length ? 'match' : ''}`;
    aggregate.textContent = `${matches} of ${data.tests.length} tests matched exactly; ${numericMatches} also produced the same numeric values despite any text differences. Test results are evidence only, not proof of equivalence for every input.`;
    testResults.prepend(aggregate);
  } catch (error) {
    showError(error.message);
  }
}

function makeOutputPane(label, result) {
  const pane = document.createElement('div');
  pane.className = 'test-output';
  const title = document.createElement('h3');
  title.textContent = label;
  const output = document.createElement('pre');
  output.textContent = result.stdout || '(no output)';
  pane.append(title, output);
  if (result.stderr) {
    const error = document.createElement('pre');
    error.className = 'stderr-output';
    error.textContent = result.stderr;
    pane.append(error);
  }
  if (result.timedOut) {
    const timedOut = document.createElement('div');
    timedOut.className = 'test-meta';
    timedOut.textContent = 'Stopped after the 4-second time limit.';
    pane.append(timedOut);
  }
  return pane;
}

fetch('/api/programs')
  .then(response => response.json().then(data => {
    if (!response.ok) throw new Error(data.error || 'Could not load the PDF manual.');
    return data;
  }))
  .then(data => {
    programs = data;
    renderProgramList();
  })
  .catch(error => {
    document.getElementById('program-count').textContent = 'Unavailable';
    programList.textContent = error.message;
  });

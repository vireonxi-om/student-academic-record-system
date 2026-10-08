# Student Academic Record and Performance Management System using C

**GM University — C Programming with Practice (UE26CS1103) — Project-Based Learning (PBL)**

A menu-driven C program that stores student academic records, calculates total / average /
percentage and pass-fail results, searches records, and produces simple performance analysis.
It combines loops, arrays, strings, two-dimensional arrays, structures and user-defined functions
(Units 1–6 of the course).

> **Before you submit:** replace the placeholders for team names, roll numbers, faculty and
> signatures in `docs/contribution.md` and in the report (`docs/report/PBL_Project_Report.docx`,
> yellow-highlighted fields), then export the report to PDF again. Nothing in this project
> invents team members for you.

---

## 1. Build and run

You need a C compiler (the project is tested with GCC 13, `-std=c11`) and, for the tests, `make` and a POSIX shell.

```sh
# Linux / macOS / WSL / Git Bash
make                 # builds ./student_pbl
./student_pbl
```

Without `make`:

```sh
gcc -std=c11 -Wall -Wextra -Wpedantic main.c student.c analysis.c input.c storage.c -o student_pbl
./student_pbl
```

Windows with GCC (MinGW): run `build.bat`, then `student_pbl.exe`.

### macOS (MacBook with Apple silicon)

**Quick start:** install Apple Command Line Tools (`xcode-select --install`) and
the LTS version of Node.js using the macOS installer from https://nodejs.org/en/download.
Then run `sh Start-Mac.command` in this project folder for the browser interface,
or `sh Start-Console-Mac.command` for the terminal program (no Node.js needed).
Both launchers always rebuild with Apple's clang for your Mac's own architecture.
The checked-in `student_pbl` and `gui/student_bridge` files are Linux executables;
do not open those directly on a Mac. Open the launchers instead.

If you downloaded the GitHub ZIP, extract it first. You can run the launchers with
`sh` even if Finder does not allow double-clicking a downloaded script.

The program is standard C11 and plain JavaScript, so it runs natively on Apple silicon. Note: the build
products inside a folder copied from Linux are Linux programs; the Makefile detects the platform change and
rebuilds, but `make clean` first is a good habit.

```sh
xcode-select --install            # once: installs the compiler (clang, used as "gcc") and make
cd student-pbl
make clean && make                # builds ./student_pbl natively
./student_pbl
make test                         # optional: unit + integration tests

brew install node                 # only for the optional web GUI (or install from nodejs.org)
sh gui/start.sh                   # builds the bridge, starts the server, opens your browser
```

Good to know on a Mac:
* `gcc` on macOS is Apple's clang. The flags used here (`-std=c11 -Wall -Wextra -Wpedantic`) are accepted by both,
  but if you say "tested with GCC" in your report or viva, say which compiler you really used (run `gcc --version`).
* The folder name may end in a space (`manju project `). Quote the path in Terminal, or rename the folder.
* The browser test (`make gui-e2e`) needs Google Chrome and Node.js 22 or newer; it skips itself otherwise.
* This project was built and tested on Ubuntu with GCC 13. Run `make test` once on the Mac to confirm.

Compile **every** source file (`main.c student.c analysis.c input.c storage.c`).

Command-line options: `--echo` (echo each input line — used for reproducible transcripts when
input is piped from a file) and `--help`.

```sh
./student_pbl --echo < tests/demo-session.in     # replay the demonstration session
```

## 2. Features

| # | Menu option | Requirement it demonstrates |
|---|---|---|
| 1 | Add student | Data entry and validation (ID rules, duplicate check, marks 0–100, capacity 100) |
| 2 | Display all student records | Formatted table: total, average, percentage, Pass/Fail |
| 3 | Search by identifier | Linear search with `strcmp`; clear "not found" message |
| 4 | Search by name | Exact, case-sensitive; **every** match is shown (names need not be unique) |
| 5 | Subject-wise marks table | Two-dimensional student-by-subject table with class averages |
| 6 | Highest and lowest performance | Overall and per-subject maximum/minimum; ties are all listed |
| 7 | Frequency analysis | Mark bands 0–39 / 40–59 / 60–79 / 80–100 for every subject |
| 8 | Pass/fail summary | Counts, pass percentage, and the subjects each failed student missed |
| 9 | *Update a student's marks* | Enhancement — results recalculate automatically |
| 10 | *Ranking by total marks* | Enhancement — sorts an index array, stored data is never rearranged |
| 11 | *Partial name search* | Enhancement — case-insensitive "contains" search |
| 12 | *Save records to a file* | Enhancement — plain-text persistence |
| 13 | *Load records from a file* | Enhancement — all-or-nothing, fully validated |
| 14 | *Export academic summary to CSV* | Enhancement — correct quoting of commas and quotes |
| 0 | Exit | |

Options 1–8 are the required functionality; 9–14 are optional enhancements for the *Innovation /
Enhancements* part of the rubric.

### Academic rules (proposal defaults — confirm with your faculty)

* 5 subjects, whole-number marks 0–100, up to 100 students.
* **Pass only when every subject mark is at least 40.** A student with `100 100 100 100 39`
  has 87.80 % but still **fails** (the program names the subject that caused it).
* `total = sum of marks`, `average = total / 5`, `percentage = total × 100 / 500` (floating-point).
* To use different values, change the constants at the top of `student.h` and the subject names in
  `student.c`, then update `docs/proposal.md`, the tests and the report together.

## 3. Project layout

```
student-pbl/
  main.c  student.h  student.c  analysis.c  input.c  storage.c   the program
  Makefile  build.bat                                            build scripts
  tests/
    unit_tests.c           139 unit checks (calculations, validation, search, storage)
    run_tests.sh           runs the scripted integration tests
    cases/                 45 integration test cases (input, expected text, description)
    test-cases.md          GENERATED: every case with expected vs actual output and status
    transcripts/           GENERATED: full transcript of every case
    demo-session.in        keystrokes of the demonstration session
    sample-output.txt      GENERATED: output of the demonstration session
  gui/                     optional web GUI (see gui/README.md)
  docs/
    proposal.md            problem, objectives, rules, tools, roles
    algorithm.md           algorithms, flowcharts, data model
    figures/               flowchart sources (.dot) and images (.png)
    contribution.md        individual contribution statement template + log
    demo-script.md         step-by-step demonstration plan
    viva-prep.md           viva questions with answers
    report/                PBL_Project_Report.docx (editable) and .pdf (10 pages, limit is 12)
```

| File | Responsibility |
|---|---|
| `main.c` | menu, option dispatch, exit / end-of-input handling |
| `student.h` | constants, `Student` and `Records` types, all prototypes |
| `student.c` | add student, display, search, marks table, update marks |
| `analysis.c` | total/average/percentage, `is_pass`, bands, extremes, frequency, summary, ranking |
| `input.c` | safe, bounded input: `fgets` + `strtol`, never `scanf` |
| `storage.c` | save/load text file, CSV export |

## 4. Design in brief

* **Data model.** One `Records` structure holds `Student students[100]` (an array of structures with
  `id` and `name`), the two-dimensional `int marks[100][5]` table, and `count`. Row *i* of both
  arrays describes the same student. Marks are stored once; total, average, percentage and
  result are recalculated whenever needed, so they can never be stale.
* **Safe input.** Lines are read with `fgets`; over-long lines are detected and the remainder is
  discarded; numbers are converted with `strtol` and `42abc`, `4.5`, blanks, overflow and
  out-of-range values are rejected; end-of-file cancels the current operation cleanly.
* **Atomic changes.** A new record is built in temporary variables and copied into the table (and
  counted) only when every field is valid. Update-marks edits a temporary copy. Loading parses into a
  scratch table and replaces memory only if the whole file is valid.

## 5. Testing

```sh
make test        # 139 unit checks + 45 integration test cases
make sanitize    # the same tests under AddressSanitizer + UndefinedBehaviorSanitizer
make evidence    # regenerate tests/test-cases.md, tests/transcripts/, tests/sample-output.txt
```

Integration cases cover **normal**, **boundary** (marks 0/100, all-40, 39, empty data, one record,
ties, the 100th and 101st record, band edges 39/40, 59/60, 79/80) and **invalid** input (−1, 101, `abc`,
`42abc`, huge numbers, duplicate ID, blank/overlong text, bad menu choices, end of input mid-entry).
Expected values come from a hand-calculated dataset (`docs/proposal.md`), not from the program.

## 6. Optional web GUI

[`gui/`](gui/README.md) adds a browser interface (HTML, CSS and JavaScript) that is driven by the same C code
through a small bridge program (overview with a class-average hero, report-card drawers, a command palette,
keyboard shortcuts, light and dark themes, mobile layout, printable report cards). It is an extra for the *Innovation / Enhancements* mark and is **not** needed
for the assigned command-line project.

```sh
sh gui/start.sh      # needs gcc, make and Node.js 18+; opens http://127.0.0.1:8765
make gui-test        # 14 back-end tests          make gui-e2e   # 33 browser checks (needs Chrome)
```

## 7. Known limitations

* Records live in memory; they disappear on exit unless saved with option 12.
* Fixed capacity (100 students) and fixed subject count (5).
* Name/ID comparison is by bytes: matching is case-sensitive (partial search, option 11, is not),
  and non-ASCII names are stored but table columns are aligned by byte count.
* CSV export does not neutralise cells that start with `=`, `+`, `-` or `@`, so a spreadsheet would treat a
  name such as `=1+1` as a formula (only relevant when exporting untrusted names).
* No login, GUI or database — they are not part of the assigned project.

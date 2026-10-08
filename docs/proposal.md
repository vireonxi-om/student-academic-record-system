# Project Proposal

**Title:** Student Academic Record and Performance Management System using C
**Institution / course:** GM University — C Programming with Practice (UE26CS1103)
**Duration:** 14 weeks  **Maximum marks:** 40  **Team size:** at most 4 students

| Team member | Roll number | Role |
|---|---|---|
| *(fill in)* | *(fill in)* | *(see section 8)* |
| *(fill in)* | *(fill in)* | |
| *(fill in)* | *(fill in)* | |
| *(fill in)* | *(fill in)* | |

Faculty: *(fill in)*  Submission week: Week 14

---

## 1. Problem statement

Design and develop a menu-driven C program that maintains student academic records and performs
useful computations and searches. The system must integrate iterative programming, arrays,
strings, two-dimensional arrays, structures and user-defined functions.

## 2. Objectives

| Course unit | Objective | Where it appears in the project |
|---|---|---|
| Units 1–2 | Apply problem-solving and programming fundamentals | Data types, expressions, input/output, algorithm design, compilation with warnings enabled |
| Unit 3 | Decisions and user-defined functions | Menu `switch`, validation, pass/fail rule, every operation is a function |
| Unit 4 | Iterative algorithms and number processing | Totals, counting, maximum/minimum, frequency bands, insertion sort for ranking |
| Unit 5 | Arrays and strings | Name and ID character arrays, `strcmp` search, band counters, text validation |
| Unit 6 | Two-dimensional arrays and structures | `marks[100][5]` table and the `Student` / `Records` structures |

## 3. Functional requirements and how each is met

| Requirement | Planned feature | Evidence |
|---|---|---|
| Student data entry and validation | Menu option 1; bounded text and integer helpers | TC01, TC20–TC28 |
| Formatted display | Option 2 table; detailed record view | TC02 |
| Total, average, percentage | `calculate_total/average/percentage` | TC01, TC02, unit tests |
| Pass/fail decision | `is_pass`: every subject ≥ 40 | TC13, TC14 |
| Search by identifier or name | Options 3 and 4 (both supported) | TC03–TC05 |
| Maximum/minimum and frequency | Options 6 and 7 | TC07, TC08, TC16–TC19 |
| Subject-wise marks | Two-dimensional `marks` table, option 5 | TC06 |
| Structures | `Student`, `Records` | Viva, `student.h` |
| Reusable functions | 58 functions in 5 modules, declared in `student.h` | Source code |
| Testing | Normal, boundary and invalid cases | `tests/test-cases.md` |

## 4. Design choices and academic rules

The assignment does not fix these values. They are **proposed design choices** — replace them with
faculty-specified rules if provided, and update code, tests and report together.

| Choice | Value |
|---|---|
| Maximum records | 100 students |
| Subjects | 5 (Maths, Physics, Chemistry, English, Computing — placeholder names) |
| Student identifier | Unique text, 1–19 characters, no spaces (letters, digits and symbols allowed; leading zeroes kept). Case-sensitive. |
| Name | 1–79 characters, spaces allowed, leading/trailing spaces trimmed. Duplicates allowed. |
| Marks | Whole numbers 0–100 per subject |
| Subject pass mark | 40 |
| Overall result | **Pass only when every subject mark is at least 40** |
| Frequency bands | 0–39 (below pass), 40–59, 60–79, 80–100, per subject; plus pass/fail counts |
| Search | Exact ID; exact (case-sensitive) name returning all matches |
| Storage | In memory; optional text-file save/load and CSV export |

### Formulas

For S subjects with marks m[0..S-1] and maximum M per subject:

```
total       = sum of all subject marks
average     = total / S                       (floating-point division)
percentage  = total * 100 / (S * M)           (floating-point division)
pass        = every subject mark >= 40
```

## 5. Hand-calculated test dataset

These values were worked out by hand **before** the program existed; the tests compare the program's
output with them.

| ID | Name | Marks | Total | Average | Percentage | Result |
|---|---|---|---:|---:|---:|---|
| S001 | Asha Rao | 80, 70, 60, 90, 50 | 350 | 70.00 | 70.00 % | Pass |
| S002 | Ravi Das | 40, 40, 40, 40, 40 | 200 | 40.00 | 40.00 % | Pass |
| S003 | Mina Sen | 100, 100, 100, 100, 39 | 439 | 87.80 | 87.80 % | Fail |
| S004 | Omar Ali | 0, 0, 0, 0, 0 | 0 | 0.00 | 0.00 % | Fail |
| S005 | Asha Rao | 100, 100, 100, 100, 100 | 500 | 100.00 | 100.00 % | Pass |

Working: S001 = 80+70+60+90+50 = 350, 350/5 = 70, 350×100/500 = 70. S003 = 100×4+39 = 439,
439/5 = 87.8, 439×100/500 = 87.8, fails because 39 < 40. S002 passes on the boundary because
40 ≥ 40.

Derived expectations: highest overall S005, lowest S004; 3 pass, 2 fail, pass percentage
3/5 = 60.00 %; searching the name "Asha Rao" returns two records.
Maths band counts (0–39, 40–59, 60–79, 80–100): marks 80, 40, 100, 0, 100 → **1, 1, 0, 3**.
Class averages: Maths 64.00, Physics 62.00, Chemistry 60.00, English 66.00, Computing 229/5 = 45.80.

## 6. Tools

GCC (tested with 13.3, `-std=c11 -Wall -Wextra -Wpedantic`), GNU Make, a text editor, a terminal,
Graphviz (flowcharts), shell scripts for automated tests.

## 7. Expected output

A working executable `student_pbl` with the 14-option menu, commented source code, a test suite with
captured outputs, a report of at most 12 A4 pages, and an individual contribution statement.

## 8. Team roles (suggested four-member split; combine roles for smaller teams)

| Responsibility | Main work | Shared |
|---|---|---|
| Input and program flow | `input.c`, `main.c`, validation, menu | Integration, testing |
| Records and searching | `student.c`: entry, structures, display, searches | Data-model consistency |
| Calculations and analysis | `analysis.c`: totals, rules, extremes, frequency | Hand-check expected results |
| Testing and documentation | `tests/`, report assembly, marks table, enhancements | Build checks, demo preparation |

Every member must contribute technically, take part in documentation and be able to explain the
whole system in the viva.

## 9. Timeline (14 weeks)

| Weeks | Activity | Concrete target |
|---|---|---|
| 1–2 | Problem understanding, team formation | Read requirements, form team, define scope and roles |
| 3–4 | Proposal and requirement analysis | This document submitted; rules and data fields fixed |
| 5–6 | Algorithm, flowchart, data-structure design | `docs/algorithm.md`, `student.h` with prototypes |
| 7–10 | Program development and module integration | Input, records, calculations, search, analysis |
| 11–12 | Testing, debugging, refinement | Test matrix executed, defects fixed, evidence captured |
| 13 | Final implementation and documentation | Report, comments, contribution statement |
| 14 | Demonstration, viva, submission | Rehearse, demonstrate, submit within Week 14 |

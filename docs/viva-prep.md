# Viva Preparation

Every member should be able to answer all of these about the **whole** program, not only their own
part. Answers refer to this project's code; the file names tell you where to look.

## The design

**Why a structure *and* a two-dimensional array?**
A structure (`Student`) groups the *different-typed* identity data of one person (`id`, `name`). The marks
are a regular table of the *same* type (int) with a natural row/column shape — student by subject — so a
two-dimensional array is the right tool and makes subject-wise analysis (a column) as easy as
student-wise analysis (a row). Both live inside the `Records` structure (`student.h`).

**How are a student's identity and marks linked?**
By the row index. `students[i]` and `marks[i]` always describe the same person, and rows `0 .. count-1`
are in use. Anything that adds, updates or loads a student writes both parts of row *i* together.

**Why aren't total, average, percentage and result stored?**
Storing derived values lets them go stale (for example after *Update marks*). They are recalculated by
`calculate_total/average/percentage` and `is_pass` whenever they are displayed, so there is a single
source of truth: the marks table.

## The rules and calculations

**What is the difference between average and percentage?**
Average = total ÷ number of subjects (marks per subject). Percentage = total ÷ maximum possible total × 100
(share of the maximum). With five subjects out of 100 they have the same *value* (350 → 70.00 and 70.00 %),
but they mean different things, and percentage must use the sum of the maximums if the subjects ever
had different maximums.

**Why is floating-point division needed?**
`439 / 5` with integers is 87 (the fraction is thrown away). `(double) 439 / 5` is 87.8. We also compute
`total * 100.0 / 500` so exact cases give exact results (70.0, not 70.00000000000001).

**What are the pass rules and where are they enforced?**
A student passes only if **every** subject is at least 40 (`PASS_MARK`). It is enforced in one place:
`is_pass()` in `analysis.c`, which loops over the five marks and stops at the first one below 40.
Example: `100 100 100 100 39` is 87.80 % but **Fail**.

## Input and robustness

**How do you reject invalid marks and duplicate identifiers?**
Marks: `read_int_in_range` (`input.c`) reads a whole line with `fgets`, converts it with `strtol`, and rejects
empty text, letters, trailing characters (`42abc`, `4.5`), overflow (`errno == ERANGE`) and values outside 0–100;
then it asks again. Duplicates: `add_student` calls `find_student_by_id` before accepting the ID; if it exists
the operation is cancelled and the existing record is untouched.

**Why not `scanf`?**
`scanf("%d")` leaves bad text in the input buffer (endless loops), can't tell `42abc` from `42`, and
`scanf("%s")` is unbounded. `fgets` + `strtol` reads a bounded line and gives full control.

**What happens with no students, or a full table?**
Every report starts with `has_records()` and prints "No student records available yet"; nothing divides by
the count or reads row 0 of an empty table. At 100 students, `add_student` prints "Capacity reached" and
returns without changing anything (tests TC15, TC18).

**What happens if the input ends in the middle of adding a student?**
The new record is built in temporary variables and copied into the table, and `count` increased, only at the
very end. If the input ends earlier, the function returns `INPUT_EOF`, nothing was stored, and the program
exits cleanly (test TC27, unit test `test_add_student`).

## Searching and analysis

**How does linear search work?**
Compare the wanted ID with `students[0].id`, `students[1].id`, … using `strcmp` until one matches
(return its row) or the end is reached (return `NOT_FOUND`). Name search does the same but never stops
early, because names are not unique.

**How do you initialise and compute the minimum and maximum?**
Start from the **first real record** (`max = min = total of row 0`), not from 0 or a guess, then compare rows
`1 .. count-1`. That is why the empty case must be handled first. Ties: after finding the extreme value, a
second loop lists every student that has it.

**How do the frequency counts work?**
`counts[subject][band]` is a two-dimensional counter array, first set to zero. For every student and
subject, `mark_band(mark)` returns exactly one band (0–39, 40–59, 60–79, 80–100) and that counter is
incremented. Each subject's counts therefore add up to the number of students (a built-in check, shown in
the *Total* column).

## Code organisation

**Which functions are reusable, and what are their inputs/results?**
Examples: `calculate_total(const int row[5]) → int`; `is_pass(const int row[5]) → bool`;
`find_student_by_id(const Records *db, const char *id) → int row or NOT_FOUND`;
`read_int_in_range(prompt, min, max, &value) → INPUT_OK / INPUT_EOF`. Read-only functions take `const`
data; functions that change data take a non-const `Records *`. Prototypes are in `student.h`, so every call
is checked against its declaration.

**Why is `main` so short?**
Each menu option is one function call; `main` only displays the menu, reads a valid choice and dispatches
with `switch`. That is what "reusable functions for major operations" looks like in practice.

## Testing and honesty

**What normal, boundary and invalid cases did you test?**
See `tests/test-cases.md`: normal (the five-student dataset), boundary (marks 0/100, all 40, one 39,
no records, one record, ties, the 100th/101st record, band edges), invalid (−1, 101, `abc`, `42abc`, huge numbers,
duplicate ID, blank and over-long text, bad menu choices, end of input). Expected values were calculated by
hand first. There are also 139 unit checks and the tests run clean under AddressSanitizer/UBSan.

**What did you personally implement and document?**
Be specific: file, functions, test IDs, report sections. Use your contribution log (`docs/contribution.md`).

**What limitations remain, and what would you add next?**
Records are lost on exit unless saved (option 12); fixed capacity (100) and subject count (5); case-sensitive
exact search; no authentication. Next: dynamic memory (`malloc`) for unlimited students, per-subject
maximums, grade bands, a database or binary file format.

## Quick-fire checks you should be able to do on the spot

1. Hand-calculate S003's total, average, percentage and result (439, 87.80, 87.80 %, Fail).
2. Say which band marks 39, 40, 59, 60, 79 and 80 fall into (0–39, 40–59, 40–59, 60–79, 60–79, 80–100).
3. Explain what `students[3]` and `marks[3][2]` refer to (fourth student; that student's third subject).
4. Explain why `(*count)++` or `db->count++` happens last in `add_student`.
5. Explain what `fgets` returns at end of input (NULL) and what the program does then.

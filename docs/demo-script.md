# Demonstration Script (about 10 minutes)

Replay the whole script with `./student_pbl --echo < tests/demo-session.in` (output saved in
`tests/sample-output.txt`) — but do the demonstration **live**, typing the values below.
Rehearse on the machine you will present on and compile there first.

| # | Step | What to type / show | What to say |
|---|---|---|---|
| 1 | Introduce | — | Assigned title, the rules: 5 subjects, marks 0–100, pass = every subject ≥ 40, capacity 100 |
| 2 | Compile and launch | `make` then `./student_pbl` (show no warnings) | Compiled with `-Wall -Wextra -Wpedantic` |
| 3 | Empty data is safe | `2`, then `8` | "No student records available yet" — no crash, no division by zero |
| 4 | Add representative students | `1` → S001 / Asha Rao / 80 70 60 90 50; S002 / Ravi Das / 40 ×5; S003 / Mina Sen / 100 100 100 100 **105**, then 39; S004 / Omar Ali / 0 ×5; S005 / Asha Rao / 100 ×5 | The 105 is rejected and re-asked; marks 0 and 100 are accepted |
| 5 | Invalid input and duplicate | `1` → `S001` again; also try `abc` and `42abc` as a mark | Duplicate rejected, existing record preserved, `42abc` is **not** read as 42 |
| 6 | Display records | `2`, then `5` | Table with total / average / percentage; the 2-D marks table with class averages |
| 7 | Explain one calculation | S001: 80+70+60+90+50 = 350; 350/5 = 70.00; 350×100/500 = 70.00 % | Why floating-point division is needed (S003: 439/5 = 87.8) |
| 8 | Search | `3` → S003 (found); `3` → S999 (missing); `4` → Asha Rao (two records) | Linear search with `strcmp`; names are not unique so all matches are shown |
| 9 | Highest / lowest and frequency | `6`, then `7` | Highest S005, lowest S004; Maths bands 1, 1, 0, 3; each row totals 5 |
| 10 | Pass/fail | `8` | 3 pass, 2 fail, 60.00 %. **S003 has 87.80 % but fails** because Computing is 39 |
| 11 | Enhancements | `9` → S003, subject 5, new mark 40 → S003 now passes (`8` again: 4 pass, 80.00 %); `10` ranking; `11` → `ASHA`; `12` save; `14` CSV | Results recalculate because only marks are stored |
| 12 | Team and exit | `0` | Each member states what they implemented; limitations (in-memory unless saved, fixed capacity) |

## Things to be ready to show in the source

* `student.h`: the `Student` and `Records` structures and the 2-D `marks` array.
* `input.c`: `read_int_in_range` (`fgets` + `strtol`).
* `analysis.c`: `is_pass` (decision + loop), `show_extremes` (initialise from the first record), `compute_band_counts`.
* `student.c`: `add_student` (temporary record, committed last) and `find_student_by_id`.
* `tests/test-cases.md`: normal, boundary and invalid evidence.

## If something goes wrong

* Output looks wrong after you changed a constant → rebuild with `make clean && make`.
* Need a clean state → restart the program (records live in memory).
* Compiler missing on the demo machine → bring the pre-built `student_pbl` **and** the source with build instructions.

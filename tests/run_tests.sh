#!/bin/sh
# tests/run_tests.sh - scripted integration tests for student_pbl
#
# Usage (from the project folder, after "make"):
#   sh tests/run_tests.sh
#   sh tests/run_tests.sh --markdown tests/test-cases.md --transcripts tests/transcripts
#
# Every test case lives in tests/cases/ as a small set of files:
#   TCnn.meta    4 lines: category / purpose / input summary / expected summary
#   TCnn.in      the exact text typed into the program (stdin), OR
#   TCnn.gen     a shell script that prints the stdin text (for long inputs)
#   TCnn.expect  one check per line, matched as plain text against the output:
#                  text          the output must contain this text
#                  !text         the output must NOT contain this text
#                  @N|text       exactly N output lines must contain this text
#                  #...          comment
#   TCnn.post    (optional) shell script run after the program; its output is
#                appended to the transcript (used to inspect files written)
# The program is run as:  student_pbl --echo < input   (so the typed input is
# echoed and the transcript reads like a real session). A test also fails if
# the exit code is not 0 or anything is written to stderr.
#
# The expected values in the .expect files come from the hand-calculated
# dataset in docs/proposal.md, not from the program's own output.

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(dirname "$HERE")
BIN="$ROOT/student_pbl"
CASES="$HERE/cases"
WORK="$HERE/work"
export CASES

MD=""
TR=""
while [ $# -gt 0 ]; do
    case "$1" in
        --markdown)    MD="$2"; shift 2 ;;
        --transcripts) TR="$2"; shift 2 ;;
        *) echo "Unknown option: $1" >&2; exit 2 ;;
    esac
done

if [ ! -x "$BIN" ]; then
    echo "student_pbl not found. Run 'make' first." >&2
    exit 2
fi

rm -rf "$WORK"
mkdir -p "$WORK"
if [ -n "$TR" ]; then
    rm -rf "$TR"
    mkdir -p "$TR"
fi

# Escape a text cell for a markdown table.
cell() {
    printf '%s' "$1" | sed 's/|/\\|/g'
}

if [ -n "$MD" ]; then
    {
        echo "# Test Cases and Results"
        echo
        echo "This file is **generated** by \`tests/run_tests.sh\` (\`make evidence\`) on $(date '+%Y-%m-%d %H:%M') using $(gcc --version 2>/dev/null | head -n 1)."
        echo "Do not edit the table by hand: every *Actual result* cell quotes lines that the program really printed during this run,"
        echo "and the *Status* is decided automatically by comparing them with the expected text."
        echo
        echo "## How the tests work"
        echo
        echo "* **Integration tests (this table).** Each case feeds a fixed script of keystrokes to \`student_pbl --echo\` and checks the transcript."
        echo "  A case also fails if the exit code is not 0 or anything is written to stderr. The full transcript of every case is in \`tests/transcripts/\`."
        echo "* **Unit tests.** \`tests/unit_tests.c\` (\`make unit\`) checks the calculation, validation, search, storage and entry functions directly."
        echo "* **Expected values** come from the hand-calculated dataset in \`docs/proposal.md\` (S001-S005), not from the program's output."
        echo "* **Categories:** Normal, Boundary and Invalid cases as required by the project brief. Cases for the optional enhancements are named *Enhancement*."
        echo
        echo "## Consistency checks covered"
        echo
        echo "* Every occupied marks row belongs to the matching student (TC02, TC06, TC23, TC40)."
        echo "* The record count never exceeds 100 (TC18) and a rejected or cancelled entry never changes it (TC23 and the unit tests; TC27 covers cancellation by end of input)."
        echo "* Frequency counts in every row add up to the number of students (TC08, TC19)."
        echo "* Pass count + fail count equals the number of students (TC09, TC10, TC35)."
        echo "* Searching never modifies stored data (TC03-TC05, TC39; unit tests)."
        echo
        echo "## Results"
        echo
        echo "| ID | Category | Purpose | Input | Expected result | Actual result (from this run) | Status |"
        echo "|---|---|---|---|---|---|---|"
    } > "$MD"
fi

total=0
failed=0

for meta in "$CASES"/*.meta; do
    id=$(basename "$meta" .meta)
    dir="$WORK/$id"
    mkdir -p "$dir"
    category=$(sed -n 1p "$meta")
    purpose=$(sed -n 2p "$meta")
    input_summary=$(sed -n 3p "$meta")
    expected_summary=$(sed -n 4p "$meta")

    # Build the stdin text.
    if [ -f "$CASES/$id.gen" ]; then
        (cd "$dir" && sh "$CASES/$id.gen" > input.txt)
    else
        cp "$CASES/$id.in" "$dir/input.txt"
    fi

    # Run the program inside the case's own folder (so saved files stay there).
    (cd "$dir" && "$BIN" --echo < input.txt > output.txt 2> stderr.txt; echo $? > exit.txt)
    if [ -f "$CASES/$id.post" ]; then
        (cd "$dir" && { echo; echo "--- files written by the program ---"; sh "$CASES/$id.post"; } >> output.txt)
    fi

    status="PASS"
    reasons=""
    actual=""

    if [ "$(cat "$dir/exit.txt")" != "0" ]; then
        status="FAIL"
        reasons="$reasons exit code $(cat "$dir/exit.txt");"
    fi
    if [ -s "$dir/stderr.txt" ]; then
        status="FAIL"
        reasons="$reasons output on stderr;"
    fi

    while IFS= read -r line || [ -n "$line" ]; do
        case "$line" in
            ''|'#'*) continue ;;
            '!'*)
                pat=${line#!}
                if grep -F -q -- "$pat" "$dir/output.txt"; then
                    status="FAIL"
                    reasons="$reasons unexpected text [$pat];"
                else
                    actual="$actual(correctly absent) $pat<br>"
                fi
                ;;
            '@'*)
                rest=${line#@}
                want=${rest%%|*}
                pat=${rest#*|}
                have=$(grep -F -c -- "$pat" "$dir/output.txt")
                if [ "$have" -eq "$want" ]; then
                    actual="$actual$have x $pat<br>"
                else
                    status="FAIL"
                    reasons="$reasons expected $want line(s) with [$pat] but found $have;"
                fi
                ;;
            *)
                found=$(grep -F -m 1 -- "$line" "$dir/output.txt")
                if [ -n "$found" ]; then
                    actual="$actual$found<br>"
                else
                    status="FAIL"
                    reasons="$reasons missing text [$line];"
                fi
                ;;
        esac
    done < "$CASES/$id.expect"

    total=$((total + 1))
    if [ "$status" = "PASS" ]; then
        printf 'PASS  %s  %s\n' "$id" "$purpose"
    else
        failed=$((failed + 1))
        printf 'FAIL  %s  %s\n        reason:%s\n        see %s\n' "$id" "$purpose" "$reasons" "$dir/output.txt"
    fi

    if [ -n "$MD" ]; then
        actual_cell=$(cell "$actual" | sed 's/<br>$//')
        [ "$status" = "FAIL" ] && actual_cell="$actual_cell<br>**problem:**$(cell "$reasons")"
        printf '| %s | %s | %s | %s | %s | %s | **%s** |\n' "$id" "$category" \
            "$(cell "$purpose")" "$(cell "$input_summary")" "$(cell "$expected_summary")" \
            "$actual_cell" "$status" >> "$MD"
    fi
    if [ -n "$TR" ]; then
        {
            echo "# Transcript of test $id ($category)"
            echo "# Purpose : $purpose"
            echo "# Input   : $input_summary"
            echo "# Expected: $expected_summary"
            echo "# Result  : $status"
            echo
            cat "$dir/output.txt"
        } > "$TR/$id.txt"
    fi
done

echo
echo "Integration tests: $total run, $((total - failed)) passed, $failed failed."
if [ -n "$MD" ]; then
    {
        echo
        echo "**Summary:** $total test cases run, $((total - failed)) passed, $failed failed."
    } >> "$MD"
fi
[ "$failed" -eq 0 ]

/*
 * student.c
 * Student records: validated entry, formatted display, searching and
 * mark updates.
 *
 * Data model reminder: db->students[i] (identity) and db->marks[i]
 * (one row of the two-dimensional marks table) always describe the same
 * person. Totals, averages, percentages and results are never stored; they
 * are recalculated from the marks whenever they are displayed.
 */
#include <ctype.h>
#include <stdio.h>
#include <string.h>

#include "student.h"

/* Placeholder subject names. Change them freely, but keep exactly
 * SUBJECT_COUNT entries (tests/unit_tests.c checks that none is missing). */
const char *const SUBJECT_NAMES[SUBJECT_COUNT] = {
    "Maths", "Physics", "Chemistry", "English", "Computing"
};

/* Longest name shown in a table cell; longer names end with "...". */
#define NAME_COLUMN_MAX 20

/* ================================================================== */
/* Small helpers                                                       */
/* ================================================================== */

/* Start with an empty database (count 0, all marks 0). */
void init_records(Records *db)
{
    memset(db, 0, sizeof *db);
}

/* True when at least one student exists; otherwise prints a clear message. */
bool has_records(const Records *db)
{
    if (db->count == 0) {
        printf("\nNo student records available yet. Use option 1 to add students.\n");
        return false;
    }
    return true;
}

/* Identifier rule: 1..19 characters, no spaces or control characters. */
bool is_valid_id(const char *id)
{
    size_t len = strlen(id);
    size_t i;

    if (len == 0 || len >= ID_LENGTH) {
        return false;
    }
    for (i = 0; i < len; i++) {
        if (isspace((unsigned char)id[i]) || iscntrl((unsigned char)id[i])) {
            return false;
        }
    }
    return true;
}

/* Name rule: 1..79 characters, spaces allowed inside, no control
 * characters, and no leading/trailing space. */
bool is_valid_name(const char *name)
{
    size_t len = strlen(name);
    size_t i;

    if (len == 0 || len >= NAME_LENGTH) {
        return false;
    }
    if (isspace((unsigned char)name[0]) || isspace((unsigned char)name[len - 1])) {
        return false;
    }
    for (i = 0; i < len; i++) {
        if (iscntrl((unsigned char)name[i])) {
            return false;
        }
    }
    return true;
}

/*
 * Linear search by identifier: compare the requested ID with each stored ID
 * using strcmp. Returns the row index, or NOT_FOUND. The match is
 * case-sensitive ("s001" is not "S001").
 */
int find_student_by_id(const Records *db, const char *id)
{
    int i;

    for (i = 0; i < db->count; i++) {
        if (strcmp(db->students[i].id, id) == 0) {
            return i;
        }
    }
    return NOT_FOUND;
}

/* Section heading used by every report. */
void print_heading(const char *title)
{
    printf("\n=== %s ===\n", title);
}

/* Width of the ID column: the longest stored ID, at least the header "ID". */
int id_column_width(const Records *db)
{
    int width = 2;
    int i;

    for (i = 0; i < db->count; i++) {
        int len = (int)strlen(db->students[i].id);

        if (len > width) {
            width = len;
        }
    }
    return width;
}

/* Width of the Name column: longest stored name, between 8 and cap. */
int name_column_width(const Records *db, int cap)
{
    int width = 8;
    int i;

    for (i = 0; i < db->count; i++) {
        int len = (int)strlen(db->students[i].name);

        if (len > width) {
            width = len;
        }
    }
    return (width > cap) ? cap : width;
}

/* Copy name into cell; if it is longer than width, end it with "...". */
void format_name_cell(char *cell, size_t size, const char *name, int width)
{
    if ((int)strlen(name) <= width) {
        snprintf(cell, size, "%s", name);
    } else {
        snprintf(cell, size, "%.*s...", width - 3, name);
    }
}

/* Print a line of one repeated character. */
static void print_rule(char ch, int width)
{
    int i;

    for (i = 0; i < width; i++) {
        putchar(ch);
    }
    putchar('\n');
}

/* Widest subject name (at least 6 so that "100.00" fits a column). */
static int subject_column_width(void)
{
    int width = 6;
    int s;

    for (s = 0; s < SUBJECT_COUNT; s++) {
        int len = (int)strlen(SUBJECT_NAMES[s]);

        if (len > width) {
            width = len;
        }
    }
    return width;
}

/* Case-insensitive "contains" test used by the partial name search. */
static bool contains_ignore_case(const char *text, const char *part)
{
    size_t text_len = strlen(text);
    size_t part_len = strlen(part);
    size_t start;

    if (part_len == 0) {
        return true;
    }
    for (start = 0; start + part_len <= text_len; start++) {
        size_t k = 0;

        while (k < part_len &&
               tolower((unsigned char)text[start + k]) ==
               tolower((unsigned char)part[k])) {
            k++;
        }
        if (k == part_len) {
            return true;
        }
    }
    return false;
}

/* ================================================================== */
/* Display                                                             */
/* ================================================================== */

/* Detailed view of one student (row index) with every calculated value. */
void display_student(const Records *db, int index)
{
    const int *row = db->marks[index];
    int total = calculate_total(row);
    int s;

    printf("  ID         : %s\n", db->students[index].id);
    printf("  Name       : %s\n", db->students[index].name);
    printf("  Marks      :\n");
    for (s = 0; s < SUBJECT_COUNT; s++) {
        printf("    %-10s: %3d%s\n", SUBJECT_NAMES[s], row[s],
               row[s] < PASS_MARK ? "   <- below pass mark" : "");
    }
    printf("  Total      : %d / %d\n", total, SUBJECT_COUNT * MAX_MARK);
    printf("  Average    : %.2f\n", calculate_average(total));
    printf("  Percentage : %.2f%%\n", calculate_percentage(total));
    printf("  Result     : %s\n", is_pass(row) ? "Pass" : "Fail");
    if (!is_pass(row)) {
        printf("  Reason     : at least one subject is below the pass mark of %d\n",
               PASS_MARK);
    }
}

/*
 * Compact table for the rows listed in rows[0..n-1]. Used for the full
 * listing and for partial-name search results. Column widths adapt to the
 * data so the columns always line up.
 */
static void print_student_table(const Records *db, const int rows[], int n)
{
    int id_w = 2;
    int name_w = 8;
    int total_w;
    int i;
    int s;
    char cell[NAME_LENGTH];

    for (i = 0; i < n; i++) {
        int id_len = (int)strlen(db->students[rows[i]].id);
        int name_len = (int)strlen(db->students[rows[i]].name);

        if (id_len > id_w) {
            id_w = id_len;
        }
        if (name_len > name_w) {
            name_w = name_len;
        }
    }
    if (name_w > NAME_COLUMN_MAX) {
        name_w = NAME_COLUMN_MAX;
    }

    printf("%-*s  %-*s", id_w, "ID", name_w, "Name");
    for (s = 0; s < SUBJECT_COUNT; s++) {
        printf("  %4.4s", SUBJECT_NAMES[s]);          /* short column titles */
    }
    printf("  %5s  %7s  %7s  %s\n", "Total", "Average", "Percent", "Result");

    total_w = id_w + 2 + name_w + SUBJECT_COUNT * 6 + 2 + 5 + 2 + 7 + 2 + 7 + 2 + 6;
    print_rule('-', total_w);

    for (i = 0; i < n; i++) {
        int row = rows[i];
        int total = calculate_total(db->marks[row]);

        format_name_cell(cell, sizeof cell, db->students[row].name, name_w);
        printf("%-*s  %-*s", id_w, db->students[row].id, name_w, cell);
        for (s = 0; s < SUBJECT_COUNT; s++) {
            printf("  %4d", db->marks[row][s]);
        }
        printf("  %5d  %7.2f  %6.2f%%  %s\n", total, calculate_average(total),
               calculate_percentage(total),
               is_pass(db->marks[row]) ? "Pass" : "Fail");
    }
}

/* Menu option 2: every record as a formatted table. */
void display_all_students(const Records *db)
{
    int rows[MAX_STUDENTS];
    int i;

    if (!has_records(db)) {
        return;
    }
    for (i = 0; i < db->count; i++) {
        rows[i] = i;
    }
    print_heading("All Student Records");
    print_student_table(db, rows, db->count);
    printf("\n%d student record(s) shown. Pass rule: every subject >= %d.\n",
           db->count, PASS_MARK);
}

/* Menu option 5: the two-dimensional student-by-subject marks table. */
void display_marks_table(const Records *db)
{
    int id_w;
    int name_w;
    int sub_w;
    int i;
    int s;
    char cell[NAME_LENGTH];

    if (!has_records(db)) {
        return;
    }
    id_w = id_column_width(db);
    name_w = name_column_width(db, NAME_COLUMN_MAX);
    sub_w = subject_column_width();

    print_heading("Subject-wise Marks Table");
    printf("%-*s  %-*s", id_w, "ID", name_w, "Name");
    for (s = 0; s < SUBJECT_COUNT; s++) {
        printf("  %*s", sub_w, SUBJECT_NAMES[s]);
    }
    printf("\n");
    print_rule('-', id_w + 2 + name_w + SUBJECT_COUNT * (sub_w + 2));

    for (i = 0; i < db->count; i++) {
        format_name_cell(cell, sizeof cell, db->students[i].name, name_w);
        printf("%-*s  %-*s", id_w, db->students[i].id, name_w, cell);
        for (s = 0; s < SUBJECT_COUNT; s++) {
            printf("  %*d", sub_w, db->marks[i][s]);
        }
        printf("\n");
    }

    print_rule('-', id_w + 2 + name_w + SUBJECT_COUNT * (sub_w + 2));
    printf("%-*s", id_w + 2 + name_w, "Class average");
    for (s = 0; s < SUBJECT_COUNT; s++) {
        int sum = 0;

        for (i = 0; i < db->count; i++) {
            sum += db->marks[i][s];                   /* column-wise accumulation */
        }
        printf("  %*.2f", sub_w, (double)sum / db->count);
    }
    printf("\n");
}

/* ================================================================== */
/* Entry                                                               */
/* ================================================================== */

/*
 * Menu option 1: add one student.
 * The new identity and marks are collected in temporary variables and are
 * copied into the table, and the count increased, only after EVERY field is
 * valid. Cancelling (end of input) or rejecting a duplicate therefore never
 * leaves a half-written record behind.
 */
InputStatus add_student(Records *db)
{
    Student fresh;
    int fresh_marks[SUBJECT_COUNT];
    char prompt[64];
    int s;

    if (db->count >= MAX_STUDENTS) {
        printf("\nCapacity reached: the table already holds %d students. Nothing was added.\n",
               MAX_STUDENTS);
        return INPUT_OK;
    }

    print_heading("Add Student");

    /* Identifier: valid text, then must not already exist. */
    for (;;) {
        if (read_nonempty_text("Enter student ID (max 19 characters, no spaces): ",
                               fresh.id, sizeof fresh.id) == INPUT_EOF) {
            printf("\nInput ended. The record was not added.\n");
            return INPUT_EOF;
        }
        if (is_valid_id(fresh.id)) {
            break;
        }
        printf("  Error: an ID cannot contain spaces or control characters.\n");
    }
    if (find_student_by_id(db, fresh.id) != NOT_FOUND) {
        printf("  Error: ID \"%s\" already exists. The record was not added.\n", fresh.id);
        return INPUT_OK;
    }

    /* Name: any text up to 79 characters, spaces allowed. */
    for (;;) {
        if (read_nonempty_text("Enter student name (max 79 characters): ",
                               fresh.name, sizeof fresh.name) == INPUT_EOF) {
            printf("\nInput ended. The record was not added.\n");
            return INPUT_EOF;
        }
        if (is_valid_name(fresh.name)) {
            break;
        }
        printf("  Error: the name is not valid.\n");
    }

    /* One mark per subject, each from 0 to MAX_MARK. */
    for (s = 0; s < SUBJECT_COUNT; s++) {
        snprintf(prompt, sizeof prompt, "Enter marks for %s (0-%d): ",
                 SUBJECT_NAMES[s], MAX_MARK);
        if (read_int_in_range(prompt, 0, MAX_MARK, &fresh_marks[s]) == INPUT_EOF) {
            printf("\nInput ended. The record was not added.\n");
            return INPUT_EOF;
        }
    }

    /* Everything is valid: commit the whole record, then count it once. */
    db->students[db->count] = fresh;
    for (s = 0; s < SUBJECT_COUNT; s++) {
        db->marks[db->count][s] = fresh_marks[s];
    }
    db->count++;

    printf("\nStudent added successfully (%d of %d records used).\n", db->count,
           MAX_STUDENTS);
    display_student(db, db->count - 1);
    return INPUT_OK;
}

/* ================================================================== */
/* Search                                                              */
/* ================================================================== */

/* Menu option 3: find one student by exact (case-sensitive) identifier. */
InputStatus search_by_id(const Records *db)
{
    char id[ID_LENGTH];
    int index;

    if (!has_records(db)) {
        return INPUT_OK;
    }
    if (read_nonempty_text("Enter student ID to search: ", id, sizeof id) == INPUT_EOF) {
        printf("\nInput ended.\n");
        return INPUT_EOF;
    }

    index = find_student_by_id(db, id);
    print_heading("ID Search Result");
    if (index == NOT_FOUND) {
        printf("No student found with ID \"%s\".\n", id);
    } else {
        display_student(db, index);
    }
    return INPUT_OK;
}

/*
 * Menu option 4: list EVERY student whose name matches exactly. Names are
 * not unique, so the whole table is traversed. Matching is case-sensitive.
 */
InputStatus search_by_name(const Records *db)
{
    char name[NAME_LENGTH];
    int i;
    int matches = 0;

    if (!has_records(db)) {
        return INPUT_OK;
    }
    if (read_nonempty_text("Enter exact student name (case-sensitive): ", name,
                           sizeof name) == INPUT_EOF) {
        printf("\nInput ended.\n");
        return INPUT_EOF;
    }

    print_heading("Name Search Results");
    for (i = 0; i < db->count; i++) {
        if (strcmp(db->students[i].name, name) == 0) {
            matches++;
            printf("Match %d:\n", matches);
            display_student(db, i);
            printf("\n");
        }
    }
    if (matches == 0) {
        printf("No student found with the name \"%s\".\n", name);
    } else {
        printf("Found %d record(s) named \"%s\".\n", matches, name);
    }
    return INPUT_OK;
}

/* Menu option 11 (enhancement): case-insensitive "contains" name search. */
InputStatus search_by_partial_name(const Records *db)
{
    char part[NAME_LENGTH];
    int rows[MAX_STUDENTS];
    int matches = 0;
    int i;

    if (!has_records(db)) {
        return INPUT_OK;
    }
    if (read_nonempty_text("Enter part of a name (not case-sensitive): ", part,
                           sizeof part) == INPUT_EOF) {
        printf("\nInput ended.\n");
        return INPUT_EOF;
    }

    for (i = 0; i < db->count; i++) {
        if (contains_ignore_case(db->students[i].name, part)) {
            rows[matches++] = i;
        }
    }

    print_heading("Partial Name Search Results");
    if (matches == 0) {
        printf("No student name contains \"%s\".\n", part);
    } else {
        print_student_table(db, rows, matches);
        printf("\nFound %d record(s) whose name contains \"%s\".\n", matches, part);
    }
    return INPUT_OK;
}

/* ================================================================== */
/* Update (enhancement)                                                */
/* ================================================================== */

/*
 * Menu option 9 (enhancement): change one or more marks of a student.
 * Edits are made on a temporary copy and written back only when the user
 * finishes, so cancelling leaves the stored marks untouched. Because
 * totals and results are not stored, they are recalculated automatically
 * the next time they are displayed.
 */
InputStatus update_marks(Records *db)
{
    char id[ID_LENGTH];
    char prompt[64];
    int index;
    int edited[SUBJECT_COUNT];
    int old_total;
    bool old_pass;
    int s;

    if (!has_records(db)) {
        return INPUT_OK;
    }
    if (read_nonempty_text("Enter ID of the student to update: ", id, sizeof id) == INPUT_EOF) {
        printf("\nInput ended. No changes were made.\n");
        return INPUT_EOF;
    }
    index = find_student_by_id(db, id);
    if (index == NOT_FOUND) {
        printf("No student found with ID \"%s\". Nothing was changed.\n", id);
        return INPUT_OK;
    }

    print_heading("Update Marks");
    printf("Current record:\n");
    display_student(db, index);
    old_total = calculate_total(db->marks[index]);
    old_pass = is_pass(db->marks[index]);

    for (s = 0; s < SUBJECT_COUNT; s++) {
        edited[s] = db->marks[index][s];
    }

    for (;;) {
        int choice;
        int mark;

        printf("\nSubjects: ");
        for (s = 0; s < SUBJECT_COUNT; s++) {
            printf("%d=%s(%d)%s", s + 1, SUBJECT_NAMES[s], edited[s],
                   s + 1 < SUBJECT_COUNT ? ", " : "\n");
        }
        snprintf(prompt, sizeof prompt, "Subject number to change (1-%d, 0 = save and finish): ",
                 SUBJECT_COUNT);
        if (read_int_in_range(prompt, 0, SUBJECT_COUNT, &choice) == INPUT_EOF) {
            printf("\nInput ended. No changes were saved.\n");
            return INPUT_EOF;
        }
        if (choice == 0) {
            break;
        }
        snprintf(prompt, sizeof prompt, "New marks for %s (0-%d): ",
                 SUBJECT_NAMES[choice - 1], MAX_MARK);
        if (read_int_in_range(prompt, 0, MAX_MARK, &mark) == INPUT_EOF) {
            printf("\nInput ended. No changes were saved.\n");
            return INPUT_EOF;
        }
        edited[choice - 1] = mark;
    }

    for (s = 0; s < SUBJECT_COUNT; s++) {
        db->marks[index][s] = edited[s];
    }
    printf("\nMarks saved. Total %d -> %d, result %s -> %s.\n", old_total,
           calculate_total(db->marks[index]), old_pass ? "Pass" : "Fail",
           is_pass(db->marks[index]) ? "Pass" : "Fail");
    printf("Updated record:\n");
    display_student(db, index);
    return INPUT_OK;
}

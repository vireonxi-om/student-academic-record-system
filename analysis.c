/*
 * analysis.c
 * Calculations, pass/fail decisions, maximum/minimum, frequency analysis
 * and ranking.
 *
 * The functions in the first half only calculate (no printing), which keeps
 * them easy to test against hand-calculated values. The show_* functions
 * in the second half call them and print readable reports.
 */
#include <stdio.h>
#include <string.h>

#include "student.h"

/* Lower edge of each frequency band. Band 0 is "below the pass mark".
 * The upper edge of band b is BAND_LOWER[b + 1] - 1 (MAX_MARK for the last). */
static const int BAND_LOWER[BAND_COUNT] = { 0, PASS_MARK, 60, 80 };

/* ================================================================== */
/* Calculations (no input/output)                                      */
/* ================================================================== */

/* total = sum of all subject marks (iteration with accumulation). */
int calculate_total(const int row[SUBJECT_COUNT])
{
    int total = 0;
    int s;

    for (s = 0; s < SUBJECT_COUNT; s++) {
        total += row[s];
    }
    return total;
}

/* average = total / S. Floating-point division, so 439 / 5 = 87.8, not 87. */
double calculate_average(int total)
{
    return (double)total / SUBJECT_COUNT;
}

/*
 * percentage = total / maximum possible total * 100.
 * Written as total * 100.0 / maximum so that exact cases such as 350/500
 * give exactly 70.0 instead of 70.00000000000001.
 */
double calculate_percentage(int total)
{
    return (double)total * 100.0 / (double)(SUBJECT_COUNT * MAX_MARK);
}

/* Academic rule: pass only when EVERY subject mark is at least PASS_MARK. */
bool is_pass(const int row[SUBJECT_COUNT])
{
    int s;

    for (s = 0; s < SUBJECT_COUNT; s++) {
        if (row[s] < PASS_MARK) {
            return false;
        }
    }
    return true;
}

/* Classify a mark into exactly one band (0 = below pass, BAND_COUNT-1 = top). */
int mark_band(int mark)
{
    int band;

    for (band = BAND_COUNT - 1; band > 0; band--) {
        if (mark >= BAND_LOWER[band]) {
            return band;
        }
    }
    return 0;
}

/* Text label of a band, for example "40-59". */
void band_label(int band, char *buffer, size_t size)
{
    int high = (band + 1 < BAND_COUNT) ? BAND_LOWER[band + 1] - 1 : MAX_MARK;

    snprintf(buffer, size, "%d-%d", BAND_LOWER[band], high);
}

/* counts[s][b] = number of students whose mark in subject s is in band b. */
void compute_band_counts(const Records *db, int counts[SUBJECT_COUNT][BAND_COUNT])
{
    int s;
    int b;
    int i;

    for (s = 0; s < SUBJECT_COUNT; s++) {
        for (b = 0; b < BAND_COUNT; b++) {
            counts[s][b] = 0;                      /* initialise every counter */
        }
    }
    for (i = 0; i < db->count; i++) {
        for (s = 0; s < SUBJECT_COUNT; s++) {
            counts[s][mark_band(db->marks[i][s])]++;
        }
    }
}

/* Count how many students pass and how many fail. */
void count_pass_fail(const Records *db, int *pass_count, int *fail_count)
{
    int i;

    *pass_count = 0;
    *fail_count = 0;
    for (i = 0; i < db->count; i++) {
        if (is_pass(db->marks[i])) {
            (*pass_count)++;
        } else {
            (*fail_count)++;
        }
    }
}

/*
 * Highest and lowest overall total. Both start from the FIRST real record
 * (not from 0), so callers must check that db->count > 0 first.
 */
void find_total_extremes(const Records *db, int *max_total, int *min_total)
{
    int i;

    *max_total = calculate_total(db->marks[0]);
    *min_total = *max_total;
    for (i = 1; i < db->count; i++) {
        int total = calculate_total(db->marks[i]);

        if (total > *max_total) {
            *max_total = total;
        }
        if (total < *min_total) {
            *min_total = total;
        }
    }
}

/* Highest and lowest mark in one subject. Requires db->count > 0. */
void find_subject_extremes(const Records *db, int subject,
                           int *max_mark, int *min_mark)
{
    int i;

    *max_mark = db->marks[0][subject];
    *min_mark = *max_mark;
    for (i = 1; i < db->count; i++) {
        int mark = db->marks[i][subject];

        if (mark > *max_mark) {
            *max_mark = mark;
        }
        if (mark < *min_mark) {
            *min_mark = mark;
        }
    }
}

/* ================================================================== */
/* Reports (print results)                                             */
/* ================================================================== */

/* Print every student whose overall total equals the given total (ties). */
static void print_total_holders(const Records *db, const char *label, int total)
{
    int i;
    int holders = 0;
    int id_w = id_column_width(db);

    for (i = 0; i < db->count; i++) {
        if (calculate_total(db->marks[i]) == total) {
            holders++;
        }
    }
    printf("  %s total: %d / %d (%.2f%%)", label, total,
           SUBJECT_COUNT * MAX_MARK, calculate_percentage(total));
    if (holders > 1) {
        printf("  - %d students tied", holders);
    }
    printf("\n");
    for (i = 0; i < db->count; i++) {
        if (calculate_total(db->marks[i]) == total) {
            printf("      %-*s  %s\n", id_w, db->students[i].id,
                   db->students[i].name);
        }
    }
}

/* Print the IDs of every student holding the given mark in a subject. */
static void print_subject_holders(const Records *db, int subject, int mark)
{
    int i;
    bool first = true;

    for (i = 0; i < db->count; i++) {
        if (db->marks[i][subject] == mark) {
            printf("%s%s", first ? "" : ", ", db->students[i].id);
            first = false;
        }
    }
    printf("\n");
}

/* Menu option 6: overall and subject-wise highest and lowest performance. */
void show_extremes(const Records *db)
{
    int max_total;
    int min_total;
    int s;

    if (!has_records(db)) {
        return;
    }
    print_heading("Highest and Lowest Performance");

    find_total_extremes(db, &max_total, &min_total);
    printf("Overall performance (by total marks):\n");
    print_total_holders(db, "Highest", max_total);
    print_total_holders(db, "Lowest ", min_total);

    printf("\nSubject-wise extremes (student IDs shown; ties are all listed):\n");
    for (s = 0; s < SUBJECT_COUNT; s++) {
        int max_mark;
        int min_mark;

        find_subject_extremes(db, s, &max_mark, &min_mark);
        printf("  %-10s highest %3d : ", SUBJECT_NAMES[s], max_mark);
        print_subject_holders(db, s, max_mark);
        printf("  %-10s lowest  %3d : ", "", min_mark);
        print_subject_holders(db, s, min_mark);
    }
}

/* Menu option 7: how many marks fall in each band, for every subject. */
void show_frequency(const Records *db)
{
    int counts[SUBJECT_COUNT][BAND_COUNT];
    char label[16];
    int s;
    int b;

    if (!has_records(db)) {
        return;
    }
    print_heading("Frequency Analysis (marks per band)");
    compute_band_counts(db, counts);

    printf("%-12s", "Subject");
    for (b = 0; b < BAND_COUNT; b++) {
        band_label(b, label, sizeof label);
        printf("%9s", label);
    }
    printf("%9s\n", "Total");

    for (s = 0; s < SUBJECT_COUNT; s++) {
        int row_total = 0;

        printf("%-12s", SUBJECT_NAMES[s]);
        for (b = 0; b < BAND_COUNT; b++) {
            printf("%9d", counts[s][b]);
            row_total += counts[s][b];
        }
        printf("%9d\n", row_total);          /* always equals the student count */
    }
    printf("\nBand 0-%d is below the pass mark of %d. Every mark is counted in exactly one band.\n",
           PASS_MARK - 1, PASS_MARK);
}

/* Menu option 8: pass/fail counts, pass percentage and the failed students. */
void show_result_summary(const Records *db)
{
    int pass_count;
    int fail_count;
    int i;
    int s;
    int id_w;
    int name_w;
    char name_cell[NAME_LENGTH];

    if (!has_records(db)) {
        return;
    }
    id_w = id_column_width(db);
    name_w = name_column_width(db, 20);
    print_heading("Pass / Fail Summary");
    count_pass_fail(db, &pass_count, &fail_count);

    printf("Pass rule       : every subject mark must be at least %d\n", PASS_MARK);
    printf("Total students  : %d\n", db->count);
    printf("Passed          : %d\n", pass_count);
    printf("Failed          : %d\n", fail_count);
    printf("Pass percentage : %.2f%%\n", (double)pass_count * 100.0 / db->count);

    if (fail_count == 0) {
        printf("\nNo student has failed.\n");
        return;
    }
    printf("\nFailed students (with the subjects below %d):\n", PASS_MARK);
    for (i = 0; i < db->count; i++) {
        bool first = true;

        if (is_pass(db->marks[i])) {
            continue;
        }
        format_name_cell(name_cell, sizeof name_cell, db->students[i].name, name_w);
        printf("  %-*s  %-*s  %6.2f%%  below pass mark in: ", id_w,
               db->students[i].id, name_w, name_cell,
               calculate_percentage(calculate_total(db->marks[i])));
        for (s = 0; s < SUBJECT_COUNT; s++) {
            if (db->marks[i][s] < PASS_MARK) {
                printf("%s%s (%d)", first ? "" : ", ", SUBJECT_NAMES[s],
                       db->marks[i][s]);
                first = false;
            }
        }
        printf("\n");
    }
}

/*
 * Menu option 10 (enhancement): rank students by total marks, highest first.
 * The stored records are never rearranged. Instead an array of row indices
 * is sorted (insertion sort, which is stable so ties keep their entry order)
 * and the report is printed in that index order. Equal totals share a rank
 * (1, 2, 2, 4 ...).
 */
void show_ranking(const Records *db)
{
    int order[MAX_STUDENTS];
    int i;
    int rank = 0;
    int previous_total = -1;
    int id_w;
    int name_w;
    char name_cell[NAME_LENGTH];

    if (!has_records(db)) {
        return;
    }
    id_w = id_column_width(db);
    name_w = name_column_width(db, 20);
    for (i = 0; i < db->count; i++) {
        order[i] = i;
    }
    for (i = 1; i < db->count; i++) {                 /* insertion sort */
        int key = order[i];
        int key_total = calculate_total(db->marks[key]);
        int j = i - 1;

        while (j >= 0 && calculate_total(db->marks[order[j]]) < key_total) {
            order[j + 1] = order[j];
            j--;
        }
        order[j + 1] = key;
    }

    print_heading("Student Ranking (by total marks)");
    printf("%4s  %-*s  %-*s  %5s  %7s  %s\n", "Rank", id_w, "ID", name_w,
           "Name", "Total", "Percent", "Result");
    for (i = 0; i < db->count; i++) {
        int row = order[i];
        int total = calculate_total(db->marks[row]);

        if (total != previous_total) {
            rank = i + 1;                             /* new rank at a new total */
            previous_total = total;
        }
        format_name_cell(name_cell, sizeof name_cell, db->students[row].name, name_w);
        printf("%4d  %-*s  %-*s  %5d  %6.2f%%  %s\n", rank, id_w,
               db->students[row].id, name_w, name_cell, total,
               calculate_percentage(total),
               is_pass(db->marks[row]) ? "Pass" : "Fail");
    }
}

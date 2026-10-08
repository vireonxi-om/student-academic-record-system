/*
 * tests/unit_tests.c
 * Unit tests for the calculation, validation, search and storage logic.
 *
 * Build and run from the project folder with:   make unit
 *
 * The expected values come from the hand-calculated dataset in
 * docs/proposal.md (S001..S005), not from the program's own output.
 * Test results are printed to stderr; anything the code under test prints
 * is captured in a temporary file so it can be checked.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../student.h"

#ifdef _WIN32
#define NULL_DEVICE "NUL"
#else
#define NULL_DEVICE "/dev/null"
#endif

#define INPUT_FILE  "unit_input.tmp"
#define OUTPUT_FILE "unit_output.tmp"
#define SAVE_FILE   "unit_save.tmp"
#define CSV_FILE    "unit_csv.tmp"

static int checks = 0;
static int failures = 0;

#define CHECK(condition, description)                                      \
    do {                                                                   \
        checks++;                                                          \
        if (!(condition)) {                                                \
            failures++;                                                    \
            fprintf(stderr, "  FAIL: %s  (line %d)\n", description, __LINE__); \
        }                                                                  \
    } while (0)

static bool close_to(double a, double b)
{
    double diff = a - b;

    return diff > -0.005 && diff < 0.005;
}

/* ---------------------------------------------------------------- */
/* Helpers                                                           */
/* ---------------------------------------------------------------- */

/* Put one student into the next free row (bypasses the keyboard). */
static void put_student(Records *db, const char *id, const char *name,
                        int m0, int m1, int m2, int m3, int m4)
{
    int row = db->count;

    snprintf(db->students[row].id, ID_LENGTH, "%s", id);
    snprintf(db->students[row].name, NAME_LENGTH, "%s", name);
    db->marks[row][0] = m0;
    db->marks[row][1] = m1;
    db->marks[row][2] = m2;
    db->marks[row][3] = m3;
    db->marks[row][4] = m4;
    db->count++;
}

/* The five-student dataset from the guide. */
static void fill_guide_dataset(Records *db)
{
    init_records(db);
    put_student(db, "S001", "Asha Rao", 80, 70, 60, 90, 50);
    put_student(db, "S002", "Ravi Das", 40, 40, 40, 40, 40);
    put_student(db, "S003", "Mina Sen", 100, 100, 100, 100, 39);
    put_student(db, "S004", "Omar Ali", 0, 0, 0, 0, 0);
    put_student(db, "S005", "Asha Rao", 100, 100, 100, 100, 100);
}

/* Make the next keyboard reads come from text, and capture all output. */
static void feed_input(const char *text)
{
    FILE *fp = fopen(INPUT_FILE, "w");

    if (fp == NULL) {
        fprintf(stderr, "cannot create %s\n", INPUT_FILE);
        exit(2);
    }
    fputs(text, fp);
    fclose(fp);
    if (freopen(INPUT_FILE, "r", stdin) == NULL ||
        freopen(OUTPUT_FILE, "w", stdout) == NULL) {
        fprintf(stderr, "cannot redirect input/output\n");
        exit(2);
    }
}

/* Return everything printed since feed_input (buffer is static). */
static const char *captured_output(void)
{
    static char buffer[65536];
    FILE *fp;
    size_t n;

    fflush(stdout);
    fp = fopen(OUTPUT_FILE, "r");
    if (fp == NULL) {
        buffer[0] = '\0';
        return buffer;
    }
    n = fread(buffer, 1, sizeof buffer - 1, fp);
    buffer[n] = '\0';
    fclose(fp);
    return buffer;
}

static void write_file(const char *path, const char *text)
{
    FILE *fp = fopen(path, "w");

    if (fp == NULL) {
        fprintf(stderr, "cannot create %s\n", path);
        exit(2);
    }
    fputs(text, fp);
    fclose(fp);
}

static bool same_records(const Records *a, const Records *b)
{
    int i;
    int s;

    if (a->count != b->count) {
        return false;
    }
    for (i = 0; i < a->count; i++) {
        if (strcmp(a->students[i].id, b->students[i].id) != 0 ||
            strcmp(a->students[i].name, b->students[i].name) != 0) {
            return false;
        }
        for (s = 0; s < SUBJECT_COUNT; s++) {
            if (a->marks[i][s] != b->marks[i][s]) {
                return false;
            }
        }
    }
    return true;
}

/* ---------------------------------------------------------------- */
/* Tests                                                             */
/* ---------------------------------------------------------------- */

static void test_configuration(void)
{
    int s;

    for (s = 0; s < SUBJECT_COUNT; s++) {
        CHECK(SUBJECT_NAMES[s] != NULL && SUBJECT_NAMES[s][0] != '\0',
              "every subject has a name");
    }
}

static void test_calculations(void)
{
    Records db;
    int total;

    fill_guide_dataset(&db);

    total = calculate_total(db.marks[0]);
    CHECK(total == 350, "S001 total is 350");
    CHECK(close_to(calculate_average(total), 70.00), "S001 average is 70.00");
    CHECK(close_to(calculate_percentage(total), 70.00), "S001 percentage is 70.00");
    CHECK(is_pass(db.marks[0]), "S001 passes");

    total = calculate_total(db.marks[1]);
    CHECK(total == 200, "S002 total is 200");
    CHECK(close_to(calculate_average(total), 40.00), "S002 average is 40.00");
    CHECK(is_pass(db.marks[1]), "S002 (all 40) passes: boundary");

    total = calculate_total(db.marks[2]);
    CHECK(total == 439, "S003 total is 439");
    CHECK(close_to(calculate_average(total), 87.80), "S003 average is 87.80 (float division)");
    CHECK(close_to(calculate_percentage(total), 87.80), "S003 percentage is 87.80");
    CHECK(!is_pass(db.marks[2]), "S003 fails despite 87.80% (one mark is 39)");

    total = calculate_total(db.marks[3]);
    CHECK(total == 0 && close_to(calculate_percentage(total), 0.0), "S004 total and percentage are 0");
    CHECK(!is_pass(db.marks[3]), "S004 fails");

    total = calculate_total(db.marks[4]);
    CHECK(total == 500 && close_to(calculate_percentage(total), 100.0), "S005 is 500 / 100.00%");
    CHECK(is_pass(db.marks[4]), "S005 passes");

    CHECK(calculate_percentage(350) == 70.0, "percentage 350/500 is exactly 70.0");
}

static void test_bands(void)
{
    char label[16];

    CHECK(mark_band(0) == 0, "mark 0 is in band 0");
    CHECK(mark_band(39) == 0, "mark 39 is in band 0");
    CHECK(mark_band(40) == 1, "mark 40 is in band 1");
    CHECK(mark_band(59) == 1, "mark 59 is in band 1");
    CHECK(mark_band(60) == 2, "mark 60 is in band 2");
    CHECK(mark_band(79) == 2, "mark 79 is in band 2");
    CHECK(mark_band(80) == 3, "mark 80 is in band 3");
    CHECK(mark_band(100) == 3, "mark 100 is in band 3");

    band_label(0, label, sizeof label);
    CHECK(strcmp(label, "0-39") == 0, "band 0 label");
    band_label(1, label, sizeof label);
    CHECK(strcmp(label, "40-59") == 0, "band 1 label");
    band_label(2, label, sizeof label);
    CHECK(strcmp(label, "60-79") == 0, "band 2 label");
    band_label(3, label, sizeof label);
    CHECK(strcmp(label, "80-100") == 0, "band 3 label");
}

static void test_parsing(void)
{
    int value = -999;

    CHECK(parse_int_in_range("0", 0, 100, &value) == PARSE_OK && value == 0, "0 accepted");
    CHECK(parse_int_in_range("100", 0, 100, &value) == PARSE_OK && value == 100, "100 accepted");
    CHECK(parse_int_in_range("+7", 0, 100, &value) == PARSE_OK && value == 7, "+7 accepted");
    CHECK(parse_int_in_range("-1", 0, 100, &value) == PARSE_OUT_OF_RANGE, "-1 out of range");
    CHECK(parse_int_in_range("101", 0, 100, &value) == PARSE_OUT_OF_RANGE, "101 out of range");
    CHECK(parse_int_in_range("abc", 0, 100, &value) == PARSE_NOT_NUMBER, "abc rejected");
    CHECK(parse_int_in_range("42abc", 0, 100, &value) == PARSE_NOT_NUMBER, "42abc rejected");
    CHECK(parse_int_in_range("4.5", 0, 100, &value) == PARSE_NOT_NUMBER, "4.5 rejected");
    CHECK(parse_int_in_range("", 0, 100, &value) == PARSE_NOT_NUMBER, "empty rejected");
    CHECK(parse_int_in_range(" 5", 0, 100, &value) == PARSE_NOT_NUMBER, "leading space rejected");
    CHECK(parse_int_in_range("99999999999999999999", 0, 100, &value) == PARSE_OUT_OF_RANGE,
          "huge number rejected as out of range");
    CHECK(parse_int_in_range("-99999999999999999999", 0, 100, &value) == PARSE_OUT_OF_RANGE,
          "huge negative number rejected as out of range");
    CHECK(value == 100 || value == 7 || value == 0, "value untouched by failed parses");
}

static void test_validators(void)
{
    char long_id[ID_LENGTH + 5];
    char long_name[NAME_LENGTH + 5];

    memset(long_id, 'A', sizeof long_id - 1);
    long_id[sizeof long_id - 1] = '\0';
    memset(long_name, 'N', sizeof long_name - 1);
    long_name[sizeof long_name - 1] = '\0';

    CHECK(is_valid_id("S001"), "ID S001 valid");
    CHECK(is_valid_id("007"), "ID with leading zeroes valid");
    CHECK(is_valid_id("2024/CS/001"), "ID with slashes valid");
    CHECK(!is_valid_id(""), "empty ID invalid");
    CHECK(!is_valid_id("S 1"), "ID with a space invalid");
    CHECK(!is_valid_id(long_id), "overlong ID invalid");
    long_id[ID_LENGTH - 1] = '\0';
    CHECK(is_valid_id(long_id), "19-character ID valid (boundary)");
    long_id[ID_LENGTH - 2] = '\0';
    CHECK(is_valid_id(long_id), "18-character ID valid");

    CHECK(is_valid_name("Asha Rao"), "name with a space valid");
    CHECK(is_valid_name("Rao, Asha \"A\""), "name with comma and quotes valid");
    CHECK(!is_valid_name(""), "empty name invalid");
    CHECK(!is_valid_name(" Asha"), "name with leading space invalid");
    CHECK(!is_valid_name("Asha "), "name with trailing space invalid");
    CHECK(!is_valid_name("Asha\tRao"), "name with a tab invalid");
    CHECK(!is_valid_name(long_name), "overlong name invalid");
    long_name[NAME_LENGTH - 1] = '\0';
    CHECK(is_valid_name(long_name), "79-character name valid (boundary)");
}

static void test_search(void)
{
    Records db;
    Records empty;

    fill_guide_dataset(&db);
    init_records(&empty);

    CHECK(find_student_by_id(&db, "S001") == 0, "search finds the first row");
    CHECK(find_student_by_id(&db, "S005") == 4, "search finds the last row");
    CHECK(find_student_by_id(&db, "S003") == 2, "search finds a middle row");
    CHECK(find_student_by_id(&db, "S999") == NOT_FOUND, "search reports a missing ID");
    CHECK(find_student_by_id(&db, "s001") == NOT_FOUND, "ID search is case-sensitive");
    CHECK(find_student_by_id(&empty, "S001") == NOT_FOUND, "search on empty data finds nothing");
}

static void test_analysis(void)
{
    Records db;
    Records one;
    Records tie;
    int counts[SUBJECT_COUNT][BAND_COUNT];
    int pass_count;
    int fail_count;
    int max_total;
    int min_total;
    int max_mark;
    int min_mark;
    int s;
    int b;

    fill_guide_dataset(&db);

    compute_band_counts(&db, counts);
    CHECK(counts[0][0] == 1 && counts[0][1] == 1 && counts[0][2] == 0 && counts[0][3] == 3,
          "Maths band counts are 1,1,0,3");
    for (s = 0; s < SUBJECT_COUNT; s++) {
        int sum = 0;

        for (b = 0; b < BAND_COUNT; b++) {
            sum += counts[s][b];
        }
        CHECK(sum == db.count, "band counts add up to the student count");
    }

    count_pass_fail(&db, &pass_count, &fail_count);
    CHECK(pass_count == 3 && fail_count == 2, "3 pass and 2 fail");
    CHECK(pass_count + fail_count == db.count, "pass + fail equals the student count");

    find_total_extremes(&db, &max_total, &min_total);
    CHECK(max_total == 500 && min_total == 0, "highest total 500, lowest total 0");
    find_subject_extremes(&db, 4, &max_mark, &min_mark);
    CHECK(max_mark == 100 && min_mark == 0, "Computing highest 100, lowest 0");
    find_subject_extremes(&db, 1, &max_mark, &min_mark);
    CHECK(max_mark == 100 && min_mark == 0, "Physics highest 100, lowest 0");

    init_records(&one);
    put_student(&one, "ONLY", "Solo Student", 55, 66, 77, 88, 99);
    find_total_extremes(&one, &max_total, &min_total);
    CHECK(max_total == min_total && max_total == 385, "one record is both highest and lowest");

    init_records(&tie);
    put_student(&tie, "T1", "Tie One", 90, 90, 90, 90, 90);
    put_student(&tie, "T2", "Tie Two", 90, 90, 90, 90, 90);
    put_student(&tie, "T3", "Tie Low", 50, 50, 50, 50, 50);
    find_total_extremes(&tie, &max_total, &min_total);
    CHECK(max_total == 450 && min_total == 250, "tied highest total is found");

    /* Reports on empty data must be safe and say so. */
    init_records(&one);
    feed_input("");
    show_extremes(&one);
    show_frequency(&one);
    show_result_summary(&one);
    show_ranking(&one);
    display_all_students(&one);
    display_marks_table(&one);
    CHECK(strstr(captured_output(), "No student records available") != NULL,
          "reports on empty data print a clear message");
}

static void test_reports(void)
{
    Records db;
    const char *out;

    fill_guide_dataset(&db);

    feed_input("");
    show_ranking(&db);
    out = captured_output();
    CHECK(strstr(out, "S005") != NULL && strstr(out, "S004") != NULL, "ranking lists every student");
    CHECK(strstr(out, "   1  S005") != NULL, "S005 is ranked 1");
    CHECK(strstr(out, "   5  S004") != NULL, "S004 is ranked 5");

    feed_input("");
    show_result_summary(&db);
    out = captured_output();
    CHECK(strstr(out, "Pass percentage : 60.00%") != NULL, "pass percentage is 60.00%");
    CHECK(strstr(out, "Computing (39)") != NULL, "failed subject is named");
}

static void test_ranking_ties_and_order(void)
{
    Records db;
    const char *out;

    init_records(&db);
    put_student(&db, "A", "Low", 10, 10, 10, 10, 10);
    put_student(&db, "B", "High", 90, 90, 90, 90, 90);
    put_student(&db, "C", "Tie1", 70, 70, 70, 70, 70);
    put_student(&db, "D", "Tie2", 70, 70, 70, 70, 70);

    feed_input("");
    show_ranking(&db);
    out = captured_output();
    CHECK(strstr(out, "   1  B") != NULL, "highest is rank 1");
    CHECK(strstr(out, "   2  C") != NULL && strstr(out, "   2  D") != NULL, "tied students share rank 2");
    CHECK(strstr(out, "   4  A") != NULL, "rank after a tie skips (1,2,2,4)");
    CHECK(db.students[0].id[0] == 'A' && db.marks[0][0] == 10, "ranking does not rearrange stored data");
}

static void test_add_student(void)
{
    Records db;
    InputStatus status;
    const char *out;
    int i;

    /* Normal entry, including an invalid mark that is re-asked. */
    init_records(&db);
    feed_input("S001\nAsha Rao\n80\n70\n150\n60\n90\n50\n");
    status = add_student(&db);
    CHECK(status == INPUT_OK && db.count == 1, "valid record is added");
    CHECK(strcmp(db.students[0].id, "S001") == 0 && strcmp(db.students[0].name, "Asha Rao") == 0,
          "identity stored correctly");
    CHECK(db.marks[0][0] == 80 && db.marks[0][1] == 70 && db.marks[0][2] == 60 &&
          db.marks[0][3] == 90 && db.marks[0][4] == 50, "marks stored in the same row");
    CHECK(strstr(captured_output(), "out of range") != NULL, "invalid mark 150 was rejected");

    /* Duplicate identifier: rejected, existing record kept, count unchanged. */
    feed_input("S001\n");
    status = add_student(&db);
    out = captured_output();
    CHECK(status == INPUT_OK && db.count == 1, "duplicate ID leaves the count unchanged");
    CHECK(strstr(out, "already exists") != NULL, "duplicate ID is reported");
    CHECK(strcmp(db.students[0].name, "Asha Rao") == 0 && db.marks[0][0] == 80,
          "existing record is preserved after a duplicate attempt");

    /* End of input half-way through: nothing is added or counted. */
    feed_input("S002\nRavi Das\n40\n40\n");
    status = add_student(&db);
    CHECK(status == INPUT_EOF, "end of input is reported");
    CHECK(db.count == 1, "no partial record is counted after end of input");

    /* End of input right at the start. */
    feed_input("");
    status = add_student(&db);
    CHECK(status == INPUT_EOF && db.count == 1, "empty input cancels cleanly");

    /* Capacity: fill to 100, then a 101st attempt must be refused. */
    init_records(&db);
    for (i = 0; i < MAX_STUDENTS; i++) {
        char id[ID_LENGTH];

        snprintf(id, sizeof id, "C%03d", i + 1);
        put_student(&db, id, "Capacity Test", 50, 50, 50, 50, 50);
    }
    CHECK(db.count == MAX_STUDENTS, "table filled to capacity (100th record accepted)");
    feed_input("EXTRA\nOne Too Many\n50\n50\n50\n50\n50\n");
    status = add_student(&db);
    CHECK(status == INPUT_OK && db.count == MAX_STUDENTS, "101st record rejected, count unchanged");
    CHECK(strstr(captured_output(), "Capacity reached") != NULL, "capacity message shown");
    CHECK(find_student_by_id(&db, "EXTRA") == NOT_FOUND, "rejected record was not stored");
}

static void test_update_marks(void)
{
    Records db;
    InputStatus status;

    fill_guide_dataset(&db);

    /* S003: raise Computing from 39 to 40 -> now passes. */
    feed_input("S003\n5\n40\n0\n");
    status = update_marks(&db);
    CHECK(status == INPUT_OK, "update finishes normally");
    CHECK(db.marks[2][4] == 40, "mark was updated");
    CHECK(is_pass(db.marks[2]), "result recalculated: S003 now passes");
    CHECK(calculate_total(db.marks[2]) == 440, "total recalculated after the update");

    /* Cancel by end of input: stored marks unchanged. */
    feed_input("S004\n1\n99\n");
    status = update_marks(&db);
    CHECK(status == INPUT_EOF, "end of input during update is reported");
    CHECK(db.marks[3][0] == 0, "cancelled update changes nothing");

    /* Unknown ID. */
    feed_input("NOPE\n");
    status = update_marks(&db);
    CHECK(status == INPUT_OK && strstr(captured_output(), "No student found") != NULL,
          "update of a missing ID is reported");
}

static void test_name_search_output(void)
{
    Records db;
    const char *out;

    fill_guide_dataset(&db);

    feed_input("Asha Rao\n");
    search_by_name(&db);
    out = captured_output();
    CHECK(strstr(out, "Found 2 record(s)") != NULL, "exact name search returns both Asha Rao records");
    CHECK(strstr(out, "S001") != NULL && strstr(out, "S005") != NULL, "both IDs are shown");

    feed_input("asha rao\n");
    search_by_name(&db);
    CHECK(strstr(captured_output(), "No student found") != NULL, "exact name search is case-sensitive");

    feed_input("ASHA\n");
    search_by_partial_name(&db);
    CHECK(strstr(captured_output(), "Found 2 record(s)") != NULL,
          "partial search is case-insensitive and finds both");

    feed_input("zzz\n");
    search_by_partial_name(&db);
    CHECK(strstr(captured_output(), "No student name contains") != NULL, "partial search reports no match");

    feed_input("S004\n");
    search_by_id(&db);
    out = captured_output();
    CHECK(strstr(out, "Omar Ali") != NULL, "ID search finds S004");
    CHECK(db.count == 5 && db.marks[3][0] == 0, "a search does not modify stored data");
}

static void test_storage(void)
{
    Records db;
    Records loaded;
    Records untouched;
    char big[(MAX_STUDENTS + 3) * 40];
    int i;

    fill_guide_dataset(&db);
    put_student(&db, "S006", "Rao, Asha \"A\"", 10, 20, 30, 40, 50);

    /* Round trip. */
    feed_input("");
    CHECK(save_records(&db, SAVE_FILE) == 0, "save succeeds");
    init_records(&loaded);
    CHECK(load_records(&loaded, SAVE_FILE) == 0, "load succeeds");
    CHECK(same_records(&db, &loaded), "loaded data equals saved data (round trip)");

    /* A name with a comma and quotes survives the round trip and is quoted in CSV. */
    CHECK(strcmp(loaded.students[5].name, "Rao, Asha \"A\"") == 0, "special characters survive save/load");
    CHECK(export_csv(&db, CSV_FILE) == 0, "CSV export succeeds");
    {
        char text[8192];
        FILE *fp = fopen(CSV_FILE, "r");
        size_t n = fp != NULL ? fread(text, 1, sizeof text - 1, fp) : 0;

        text[n] = '\0';
        if (fp != NULL) {
            fclose(fp);
        }
        CHECK(strstr(text, "ID,Name,Maths,Physics,Chemistry,English,Computing,Total,Average,Percentage,Result") != NULL,
              "CSV has the header row");
        CHECK(strstr(text, "S001,Asha Rao,80,70,60,90,50,350,70.00,70.00,Pass") != NULL, "CSV row for S001");
        CHECK(strstr(text, "S003,Mina Sen,100,100,100,100,39,439,87.80,87.80,Fail") != NULL, "CSV row for S003");
        CHECK(strstr(text, "\"Rao, Asha \"\"A\"\"\"") != NULL, "comma and quotes are quoted/escaped in CSV");
    }

    /* Corrupt files must be rejected without touching the data in memory. */
    untouched = db;

    write_file(SAVE_FILE, "not a save file\n");
    CHECK(load_records(&db, SAVE_FILE) == -1 && same_records(&db, &untouched), "wrong header rejected");

    write_file(SAVE_FILE, "STUDENT-PBL-DATA v1 subjects=5 max_mark=100\nS001\tAsha\t80\t70\t60\t90\n");
    CHECK(load_records(&db, SAVE_FILE) == -1 && same_records(&db, &untouched), "missing field rejected");

    write_file(SAVE_FILE, "STUDENT-PBL-DATA v1 subjects=5 max_mark=100\nS001\tAsha\t80\t70\t60\t90\t50\t1\n");
    CHECK(load_records(&db, SAVE_FILE) == -1 && same_records(&db, &untouched), "extra field rejected");

    write_file(SAVE_FILE, "STUDENT-PBL-DATA v1 subjects=5 max_mark=100\nS001\tAsha\t80\t70\t60\t90\t101\n");
    CHECK(load_records(&db, SAVE_FILE) == -1 && same_records(&db, &untouched), "mark 101 rejected");

    write_file(SAVE_FILE, "STUDENT-PBL-DATA v1 subjects=5 max_mark=100\nS001\tAsha\t80\t70\t60\t90\tx\n");
    CHECK(load_records(&db, SAVE_FILE) == -1 && same_records(&db, &untouched), "non-numeric mark rejected");

    write_file(SAVE_FILE, "STUDENT-PBL-DATA v1 subjects=5 max_mark=100\n"
                          "S001\tAsha\t80\t70\t60\t90\t50\nS001\tAsha\t80\t70\t60\t90\t50\n");
    CHECK(load_records(&db, SAVE_FILE) == -1 && same_records(&db, &untouched), "duplicate ID rejected");

    write_file(SAVE_FILE, "");
    CHECK(load_records(&db, SAVE_FILE) == -1 && same_records(&db, &untouched), "empty file rejected");

    CHECK(load_records(&db, "unit_no_such_file.tmp") == -1 && same_records(&db, &untouched),
          "missing file rejected");

    /* More records than the capacity. */
    strcpy(big, "STUDENT-PBL-DATA v1 subjects=5 max_mark=100\n");
    for (i = 0; i < MAX_STUDENTS + 1; i++) {
        char row[64];

        snprintf(row, sizeof row, "X%03d\tName\t50\t50\t50\t50\t50\n", i);
        strcat(big, row);
    }
    write_file(SAVE_FILE, big);
    CHECK(load_records(&db, SAVE_FILE) == -1 && same_records(&db, &untouched),
          "file with more than 100 records rejected");

    /* A valid file with CRLF line endings and a blank line still loads. */
    write_file(SAVE_FILE, "STUDENT-PBL-DATA v1 subjects=5 max_mark=100\r\n\r\n"
                          "S001\tAsha Rao\t80\t70\t60\t90\t50\r\n");
    init_records(&loaded);
    CHECK(load_records(&loaded, SAVE_FILE) == 0 && loaded.count == 1, "CRLF file with a blank line loads");

    /* Saving an empty database gives a loadable file with zero records. */
    init_records(&untouched);
    CHECK(save_records(&untouched, SAVE_FILE) == 0 && load_records(&loaded, SAVE_FILE) == 0 &&
          loaded.count == 0, "empty database saves and loads");
}

/* ---------------------------------------------------------------- */

int main(void)
{
    test_configuration();
    test_calculations();
    test_bands();
    test_parsing();
    test_validators();
    test_search();
    test_analysis();
    test_reports();
    test_ranking_ties_and_order();
    test_add_student();
    test_update_marks();
    test_name_search_output();
    test_storage();

    remove(INPUT_FILE);
    remove(OUTPUT_FILE);
    remove(SAVE_FILE);
    remove(CSV_FILE);

    fprintf(stderr, "Unit tests: %d checks, %d failed.\n", checks, failures);
    return failures == 0 ? 0 : 1;
}

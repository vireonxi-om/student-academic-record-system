/*
 * student.h
 * Student Academic Record and Performance Management System using C
 * GM University - C Programming with Practice (UE26CS1103)
 *
 * Shared constants, data types and function prototypes for every module:
 *   main.c      menu and overall program flow
 *   student.c   data entry, display and search
 *   analysis.c  calculations, extremes, frequency analysis, ranking
 *   input.c     validated, bounded input helpers
 *   storage.c   optional enhancement: save/load and CSV export
 */
#ifndef STUDENT_H
#define STUDENT_H

#include <stdbool.h>
#include <stddef.h>

/* ------------------------------------------------------------------ */
/* Design constants (documented in docs/proposal.md, section 4).       */
/* If you change one, update the proposal, tests and report together.  */
/* ------------------------------------------------------------------ */
#define MAX_STUDENTS    100   /* capacity of the in-memory record table       */
#define SUBJECT_COUNT   5     /* number of subjects stored for each student   */
#define ID_LENGTH       20    /* 19 visible characters + terminating '\0'     */
#define NAME_LENGTH     80    /* 79 visible characters + terminating '\0'     */
#define MAX_MARK        100   /* maximum marks in one subject                 */
#define PASS_MARK       40    /* a student passes only if EVERY mark >= this  */
#define BAND_COUNT      4     /* number of frequency bands per subject        */
#define LINE_SIZE       256   /* working buffer for one line of keyboard input */
#define NOT_FOUND       (-1)  /* result of a search that finds nothing        */

/* Subject names. Exactly SUBJECT_COUNT entries; defined in student.c. */
extern const char *const SUBJECT_NAMES[SUBJECT_COUNT];

/* ------------------------------------------------------------------ */
/* Data model                                                          */
/* ------------------------------------------------------------------ */

/* Identity data of one student (a structure of two character arrays). */
typedef struct {
    char id[ID_LENGTH];
    char name[NAME_LENGTH];
} Student;

/*
 * The whole in-memory database.
 *   students[i] and marks[i] always describe the SAME person (row i).
 *   Occupied rows are 0 .. count-1.
 * marks is the two-dimensional student-by-subject table. It is the only
 * place marks are stored; totals and results are recalculated on demand.
 */
typedef struct {
    Student students[MAX_STUDENTS];
    int marks[MAX_STUDENTS][SUBJECT_COUNT];
    int count;
} Records;

/* Outcome of reading one line of input. */
typedef enum {
    INPUT_OK = 0,      /* a usable line was read                          */
    INPUT_EOF,         /* end of input (Ctrl+D / Ctrl+Z / end of a file)   */
    INPUT_TOO_LONG     /* line did not fit the buffer (internal use)       */
} InputStatus;

/* Outcome of converting text to an integer. */
typedef enum {
    PARSE_OK = 0,
    PARSE_NOT_NUMBER,    /* empty, letters, trailing junk such as "42abc"  */
    PARSE_OUT_OF_RANGE   /* a number, but outside [min, max] or overflow   */
} ParseResult;

/* ------------------------------------------------------------------ */
/* input.c - validated input helpers                                   */
/* ------------------------------------------------------------------ */
void        set_echo_input(bool on);
ParseResult parse_int_in_range(const char *text, int min, int max, int *value);
InputStatus read_int_in_range(const char *prompt, int min, int max, int *value);
InputStatus read_nonempty_text(const char *prompt, char *out, size_t out_size);
InputStatus read_text_or_default(const char *prompt, const char *fallback,
                                 char *out, size_t out_size);
InputStatus read_yes_no(const char *prompt, bool *answer);

/* ------------------------------------------------------------------ */
/* student.c - records, display and search                             */
/* ------------------------------------------------------------------ */
void        init_records(Records *db);
bool        has_records(const Records *db);
bool        is_valid_id(const char *id);
bool        is_valid_name(const char *name);
int         find_student_by_id(const Records *db, const char *id);
void        print_heading(const char *title);
int         id_column_width(const Records *db);
int         name_column_width(const Records *db, int cap);
void        format_name_cell(char *cell, size_t size, const char *name, int width);
InputStatus add_student(Records *db);
void        display_student(const Records *db, int index);
void        display_all_students(const Records *db);
InputStatus search_by_id(const Records *db);
InputStatus search_by_name(const Records *db);
InputStatus search_by_partial_name(const Records *db);
void        display_marks_table(const Records *db);
InputStatus update_marks(Records *db);

/* ------------------------------------------------------------------ */
/* analysis.c - calculations and analysis                              */
/* ------------------------------------------------------------------ */
int    calculate_total(const int row[SUBJECT_COUNT]);
double calculate_average(int total);
double calculate_percentage(int total);
bool   is_pass(const int row[SUBJECT_COUNT]);
int    mark_band(int mark);
void   band_label(int band, char *buffer, size_t size);
void   compute_band_counts(const Records *db, int counts[SUBJECT_COUNT][BAND_COUNT]);
void   count_pass_fail(const Records *db, int *pass_count, int *fail_count);
void   find_total_extremes(const Records *db, int *max_total, int *min_total);
void   find_subject_extremes(const Records *db, int subject,
                             int *max_mark, int *min_mark);
void   show_extremes(const Records *db);
void   show_frequency(const Records *db);
void   show_result_summary(const Records *db);
void   show_ranking(const Records *db);

/* ------------------------------------------------------------------ */
/* storage.c - optional enhancement: persistence and CSV export        */
/* ------------------------------------------------------------------ */
int         save_records(const Records *db, const char *path);
int         load_records(Records *db, const char *path);
int         export_csv(const Records *db, const char *path);
InputStatus menu_save_records(const Records *db);
InputStatus menu_load_records(Records *db);
InputStatus menu_export_csv(const Records *db);

#endif /* STUDENT_H */

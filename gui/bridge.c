/*
 * gui/bridge.c
 * Line-protocol bridge between the web GUI (gui/server.js) and the C code.
 *
 * This program is OPTIONAL and does not change the command-line system. It
 * links the same modules (student.c, analysis.c, input.c, storage.c) and
 * calls the same functions, so every total, average, percentage, result,
 * band count, ranking, load and save in the GUI is calculated by the
 * project's own C code.
 *
 * Protocol: one command per line on stdin, fields separated by a TAB.
 * Exactly one line of JSON is written to stdout in reply:
 *     {"ok":true, ...}              success
 *     {"ok":false,"error":"..."}    failure (optionally with "field")
 *
 * Commands (see gui/README.md for the full list):
 *   INFO | LIST | CLEAR | MARKS | EXTREMES | FREQUENCY | SUMMARY | RANKING
 *   ADD id name m1..m5 | UPDATE id m1..m5
 *   SEARCH_ID id | SEARCH_NAME name | SEARCH_PARTIAL text
 *   SAVE path | LOAD path | EXPORT path
 *
 * Build:  make gui     (needs a POSIX system: Linux, macOS, WSL)
 */
#define _POSIX_C_SOURCE 200809L

#include <ctype.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include "../student.h"

#define MAX_FIELDS 16
#define COMMAND_LINE_SIZE 1024

/* ================================================================== */
/* A growable text buffer for building one JSON reply                  */
/* ================================================================== */
typedef struct {
    char *text;
    size_t length;
    size_t capacity;
} Buffer;

static void buffer_init(Buffer *b)
{
    b->capacity = 1024;
    b->length = 0;
    b->text = malloc(b->capacity);
    if (b->text == NULL) {
        fprintf(stderr, "bridge: out of memory\n");
        exit(1);
    }
    b->text[0] = '\0';
}

static void buffer_free(Buffer *b)
{
    free(b->text);
    b->text = NULL;
}

/* Append printf-style text, growing the buffer as needed. */
static void buffer_printf(Buffer *b, const char *format, ...)
{
    va_list args;
    int needed;

    for (;;) {
        va_start(args, format);
        needed = vsnprintf(b->text + b->length, b->capacity - b->length, format, args);
        va_end(args);
        if (needed >= 0 && (size_t)needed < b->capacity - b->length) {
            b->length += (size_t)needed;
            return;
        }
        b->capacity *= 2;
        b->text = realloc(b->text, b->capacity);
        if (b->text == NULL) {
            fprintf(stderr, "bridge: out of memory\n");
            exit(1);
        }
    }
}

/* Append a JSON string literal, escaping quotes, backslashes and control characters. */
static void buffer_json_string(Buffer *b, const char *s)
{
    const unsigned char *p;

    buffer_printf(b, "\"");
    for (p = (const unsigned char *)s; *p != '\0'; p++) {
        switch (*p) {
        case '"':  buffer_printf(b, "\\\""); break;
        case '\\': buffer_printf(b, "\\\\"); break;
        case '\n': buffer_printf(b, "\\n");  break;
        case '\r': buffer_printf(b, "\\r");  break;
        case '\t': buffer_printf(b, "\\t");  break;
        default:
            if (*p < 0x20) {
                buffer_printf(b, "\\u%04x", *p);
            } else {
                buffer_printf(b, "%c", *p);
            }
        }
    }
    buffer_printf(b, "\"");
}

/* ================================================================== */
/* Replies                                                             */
/* ================================================================== */

/* Write the finished reply as one line and release the buffer. */
static void send_reply(Buffer *b)
{
    fputs(b->text, stdout);
    fputc('\n', stdout);
    fflush(stdout);
    buffer_free(b);
}

static void reply_error(const char *field, const char *format, ...)
{
    Buffer b;
    char message[512];
    va_list args;

    va_start(args, format);
    vsnprintf(message, sizeof message, format, args);
    va_end(args);

    buffer_init(&b);
    buffer_printf(&b, "{\"ok\":false,\"error\":");
    buffer_json_string(&b, message);
    if (field != NULL) {
        buffer_printf(&b, ",\"field\":");
        buffer_json_string(&b, field);
    }
    buffer_printf(&b, "}");
    send_reply(&b);
}

/* Several field problems reported together, so a form can mark them all at once. */
typedef struct {
    char field[16];
    char message[200];
} FieldError;

typedef struct {
    FieldError items[2 + SUBJECT_COUNT];
    int count;
} ErrorList;

static void add_error(ErrorList *list, const char *field, const char *format, ...)
{
    va_list args;
    FieldError *e;

    if (list->count >= (int)(sizeof list->items / sizeof list->items[0])) {
        return;
    }
    e = &list->items[list->count++];
    snprintf(e->field, sizeof e->field, "%s", field);
    va_start(args, format);
    vsnprintf(e->message, sizeof e->message, format, args);
    va_end(args);
}

/* "error"/"field" describe the first problem (simple clients); "errors" lists all of them. */
static void reply_errors(const ErrorList *list)
{
    Buffer b;
    int i;

    buffer_init(&b);
    buffer_printf(&b, "{\"ok\":false,\"error\":");
    buffer_json_string(&b, list->items[0].message);
    buffer_printf(&b, ",\"field\":");
    buffer_json_string(&b, list->items[0].field);
    buffer_printf(&b, ",\"errors\":[");
    for (i = 0; i < list->count; i++) {
        buffer_printf(&b, "%s{\"field\":", i > 0 ? "," : "");
        buffer_json_string(&b, list->items[i].field);
        buffer_printf(&b, ",\"message\":");
        buffer_json_string(&b, list->items[i].message);
        buffer_printf(&b, "}");
    }
    buffer_printf(&b, "]}");
    send_reply(&b);
}

/* One student as a JSON object with every calculated value. */
static void json_student(Buffer *b, const Records *db, int row)
{
    const int *marks = db->marks[row];
    int total = calculate_total(marks);
    bool first = true;
    int s;

    buffer_printf(b, "{\"id\":");
    buffer_json_string(b, db->students[row].id);
    buffer_printf(b, ",\"name\":");
    buffer_json_string(b, db->students[row].name);
    buffer_printf(b, ",\"marks\":[");
    for (s = 0; s < SUBJECT_COUNT; s++) {
        buffer_printf(b, "%s%d", s > 0 ? "," : "", marks[s]);
    }
    buffer_printf(b, "],\"total\":%d,\"maxTotal\":%d,\"average\":%.2f,\"percentage\":%.2f,"
                  "\"pass\":%s,\"failedSubjects\":[", total, SUBJECT_COUNT * MAX_MARK,
                  calculate_average(total), calculate_percentage(total),
                  is_pass(marks) ? "true" : "false");
    for (s = 0; s < SUBJECT_COUNT; s++) {
        if (marks[s] < PASS_MARK) {
            buffer_printf(b, "%s%d", first ? "" : ",", s);
            first = false;
        }
    }
    buffer_printf(b, "]}");
}

static void json_student_list(Buffer *b, const Records *db, const int rows[], int n)
{
    int i;

    buffer_printf(b, "[");
    for (i = 0; i < n; i++) {
        buffer_printf(b, "%s", i > 0 ? "," : "");
        json_student(b, db, rows[i]);
    }
    buffer_printf(b, "]");
}

/* ================================================================== */
/* Helpers                                                             */
/* ================================================================== */

/* Case-insensitive "contains" test (same rule as the CLI partial search). */
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
               tolower((unsigned char)text[start + k]) == tolower((unsigned char)part[k])) {
            k++;
        }
        if (k == part_len) {
            return true;
        }
    }
    return false;
}

/*
 * Run a library function that prints its messages with printf, but keep
 * those messages out of the protocol stream: stdout is pointed at a
 * temporary file for the duration and the text is returned in message.
 */
static void capture_begin(int *saved_fd, FILE **temp)
{
    fflush(stdout);
    *saved_fd = dup(STDOUT_FILENO);
    *temp = tmpfile();
    if (*saved_fd >= 0 && *temp != NULL) {
        dup2(fileno(*temp), STDOUT_FILENO);
    }
}

static void capture_end(int saved_fd, FILE *temp, char *message, size_t size)
{
    size_t n = 0;
    size_t i;

    fflush(stdout);
    if (saved_fd >= 0) {
        dup2(saved_fd, STDOUT_FILENO);
        close(saved_fd);
    }
    if (temp != NULL) {
        rewind(temp);
        n = fread(message, 1, size - 1, temp);
        fclose(temp);
    }
    message[n] = '\0';
    while (n > 0 && (message[n - 1] == '\n' || message[n - 1] == ' ')) {
        message[--n] = '\0';
    }
    for (i = 0; i < n; i++) {                       /* one tidy paragraph */
        if (message[i] == '\n') {
            message[i] = ' ';
        }
    }
}

/* Check the five mark fields; every problem is added to errors. */
static void check_marks(char *const fields[], int first, int marks[SUBJECT_COUNT], ErrorList *errors)
{
    int s;

    for (s = 0; s < SUBJECT_COUNT; s++) {
        char field_name[16];

        snprintf(field_name, sizeof field_name, "mark%d", s);
        switch (parse_int_in_range(fields[first + s], 0, MAX_MARK, &marks[s])) {
        case PARSE_OK:
            break;
        case PARSE_OUT_OF_RANGE:
            add_error(errors, field_name, "%s marks must be between 0 and %d.", SUBJECT_NAMES[s], MAX_MARK);
            break;
        default:
            add_error(errors, field_name, "%s marks must be a whole number.", SUBJECT_NAMES[s]);
            break;
        }
    }
}

/* ================================================================== */
/* Commands                                                            */
/* ================================================================== */

static void cmd_info(void)
{
    Buffer b;
    char label[16];
    int i;

    buffer_init(&b);
    buffer_printf(&b, "{\"ok\":true,\"subjects\":[");
    for (i = 0; i < SUBJECT_COUNT; i++) {
        buffer_printf(&b, "%s", i > 0 ? "," : "");
        buffer_json_string(&b, SUBJECT_NAMES[i]);
    }
    buffer_printf(&b, "],\"bands\":[");
    for (i = 0; i < BAND_COUNT; i++) {
        band_label(i, label, sizeof label);
        buffer_printf(&b, "%s", i > 0 ? "," : "");
        buffer_json_string(&b, label);
    }
    buffer_printf(&b, "],\"maxMark\":%d,\"passMark\":%d,\"capacity\":%d,"
                  "\"idMaxLength\":%d,\"nameMaxLength\":%d}",
                  MAX_MARK, PASS_MARK, MAX_STUDENTS, ID_LENGTH - 1, NAME_LENGTH - 1);
    send_reply(&b);
}

static void cmd_list(const Records *db)
{
    Buffer b;
    int rows[MAX_STUDENTS];
    int i;

    for (i = 0; i < db->count; i++) {
        rows[i] = i;
    }
    buffer_init(&b);
    buffer_printf(&b, "{\"ok\":true,\"count\":%d,\"students\":", db->count);
    json_student_list(&b, db, rows, db->count);
    buffer_printf(&b, "}");
    send_reply(&b);
}

static void cmd_add(Records *db, char *const fields[], int field_count)
{
    int marks[SUBJECT_COUNT];
    ErrorList errors;
    Buffer b;
    size_t len;
    int s;

    errors.count = 0;
    if (field_count != 2 + 1 + SUBJECT_COUNT) {
        reply_error(NULL, "ADD needs an ID, a name and %d marks.", SUBJECT_COUNT);
        return;
    }
    if (db->count >= MAX_STUDENTS) {
        reply_error(NULL, "The register is full (%d students). Nothing was added.", MAX_STUDENTS);
        return;
    }

    len = strlen(fields[1]);
    if (len == 0) {
        add_error(&errors, "id", "Enter a student ID.");
    } else if (len >= ID_LENGTH) {
        add_error(&errors, "id", "An ID can have at most %d characters.", ID_LENGTH - 1);
    } else if (!is_valid_id(fields[1])) {
        add_error(&errors, "id", "An ID cannot contain spaces or control characters.");
    } else if (find_student_by_id(db, fields[1]) != NOT_FOUND) {
        add_error(&errors, "id", "ID %s already exists. Each student needs a unique ID.", fields[1]);
    }

    len = strlen(fields[2]);
    if (len == 0) {
        add_error(&errors, "name", "Enter the student's name.");
    } else if (len >= NAME_LENGTH) {
        add_error(&errors, "name", "A name can have at most %d characters.", NAME_LENGTH - 1);
    } else if (!is_valid_name(fields[2])) {
        add_error(&errors, "name", "The name cannot start or end with a space or contain control characters.");
    }
    check_marks(fields, 3, marks, &errors);

    if (errors.count > 0) {
        reply_errors(&errors);
        return;
    }

    /* Everything is valid: write the whole row, then count it once. */
    snprintf(db->students[db->count].id, ID_LENGTH, "%s", fields[1]);
    snprintf(db->students[db->count].name, NAME_LENGTH, "%s", fields[2]);
    for (s = 0; s < SUBJECT_COUNT; s++) {
        db->marks[db->count][s] = marks[s];
    }
    db->count++;

    buffer_init(&b);
    buffer_printf(&b, "{\"ok\":true,\"student\":");
    json_student(&b, db, db->count - 1);
    buffer_printf(&b, "}");
    send_reply(&b);
}

static void cmd_update(Records *db, char *const fields[], int field_count)
{
    int marks[SUBJECT_COUNT];
    ErrorList errors;
    int row;
    int old_total;
    bool old_pass;
    Buffer b;
    int s;

    if (field_count != 2 + SUBJECT_COUNT) {
        reply_error(NULL, "UPDATE needs an ID and %d marks.", SUBJECT_COUNT);
        return;
    }
    row = find_student_by_id(db, fields[1]);
    if (row == NOT_FOUND) {
        reply_error("id", "No student found with ID %s.", fields[1]);
        return;
    }
    errors.count = 0;
    check_marks(fields, 2, marks, &errors);
    if (errors.count > 0) {
        reply_errors(&errors);
        return;
    }
    old_total = calculate_total(db->marks[row]);
    old_pass = is_pass(db->marks[row]);
    for (s = 0; s < SUBJECT_COUNT; s++) {
        db->marks[row][s] = marks[s];
    }

    buffer_init(&b);
    buffer_printf(&b, "{\"ok\":true,\"before\":{\"total\":%d,\"pass\":%s},\"student\":",
                  old_total, old_pass ? "true" : "false");
    json_student(&b, db, row);
    buffer_printf(&b, "}");
    send_reply(&b);
}

static void cmd_search_id(const Records *db, const char *id)
{
    Buffer b;
    int row = find_student_by_id(db, id);

    buffer_init(&b);
    if (row == NOT_FOUND) {
        buffer_printf(&b, "{\"ok\":true,\"found\":false,\"students\":[]}");
    } else {
        int rows[1];

        rows[0] = row;
        buffer_printf(&b, "{\"ok\":true,\"found\":true,\"students\":");
        json_student_list(&b, db, rows, 1);
        buffer_printf(&b, "}");
    }
    send_reply(&b);
}

/* exact == true: strcmp name search; false: case-insensitive "contains". */
static void cmd_search_name(const Records *db, const char *text, bool exact)
{
    Buffer b;
    int rows[MAX_STUDENTS];
    int matches = 0;
    int i;

    for (i = 0; i < db->count; i++) {
        bool hit = exact ? strcmp(db->students[i].name, text) == 0
                         : contains_ignore_case(db->students[i].name, text);

        if (hit) {
            rows[matches++] = i;
        }
    }
    buffer_init(&b);
    buffer_printf(&b, "{\"ok\":true,\"found\":%s,\"students\":", matches > 0 ? "true" : "false");
    json_student_list(&b, db, rows, matches);
    buffer_printf(&b, "}");
    send_reply(&b);
}

static void cmd_marks(const Records *db)
{
    Buffer b;
    int i;
    int s;

    buffer_init(&b);
    buffer_printf(&b, "{\"ok\":true,\"count\":%d,\"students\":[", db->count);
    for (i = 0; i < db->count; i++) {
        buffer_printf(&b, "%s{\"id\":", i > 0 ? "," : "");
        buffer_json_string(&b, db->students[i].id);
        buffer_printf(&b, ",\"name\":");
        buffer_json_string(&b, db->students[i].name);
        buffer_printf(&b, ",\"marks\":[");
        for (s = 0; s < SUBJECT_COUNT; s++) {
            buffer_printf(&b, "%s%d", s > 0 ? "," : "", db->marks[i][s]);
        }
        buffer_printf(&b, "]}");
    }
    buffer_printf(&b, "],\"classAverage\":[");
    for (s = 0; s < SUBJECT_COUNT; s++) {
        int sum = 0;

        for (i = 0; i < db->count; i++) {
            sum += db->marks[i][s];
        }
        if (db->count > 0) {
            buffer_printf(&b, "%s%.2f", s > 0 ? "," : "", (double)sum / db->count);
        } else {
            buffer_printf(&b, "%snull", s > 0 ? "," : "");
        }
    }
    buffer_printf(&b, "]}");
    send_reply(&b);
}

/* {"total":T,"percentage":P,"students":[{id,name},...]} for one extreme. */
static void json_total_holders(Buffer *b, const Records *db, int total)
{
    bool first = true;
    int i;

    buffer_printf(b, "{\"total\":%d,\"percentage\":%.2f,\"students\":[", total,
                  calculate_percentage(total));
    for (i = 0; i < db->count; i++) {
        if (calculate_total(db->marks[i]) == total) {
            buffer_printf(b, "%s{\"id\":", first ? "" : ",");
            buffer_json_string(b, db->students[i].id);
            buffer_printf(b, ",\"name\":");
            buffer_json_string(b, db->students[i].name);
            buffer_printf(b, "}");
            first = false;
        }
    }
    buffer_printf(b, "]}");
}

static void json_subject_holders(Buffer *b, const Records *db, int subject, int mark)
{
    bool first = true;
    int i;

    buffer_printf(b, "{\"mark\":%d,\"students\":[", mark);
    for (i = 0; i < db->count; i++) {
        if (db->marks[i][subject] == mark) {
            buffer_printf(b, "%s{\"id\":", first ? "" : ",");
            buffer_json_string(b, db->students[i].id);
            buffer_printf(b, ",\"name\":");
            buffer_json_string(b, db->students[i].name);
            buffer_printf(b, "}");
            first = false;
        }
    }
    buffer_printf(b, "]}");
}

static void cmd_extremes(const Records *db)
{
    Buffer b;
    int max_total;
    int min_total;
    int s;

    buffer_init(&b);
    if (db->count == 0) {
        buffer_printf(&b, "{\"ok\":true,\"empty\":true}");
        send_reply(&b);
        return;
    }
    find_total_extremes(db, &max_total, &min_total);
    buffer_printf(&b, "{\"ok\":true,\"empty\":false,\"highest\":");
    json_total_holders(&b, db, max_total);
    buffer_printf(&b, ",\"lowest\":");
    json_total_holders(&b, db, min_total);
    buffer_printf(&b, ",\"subjects\":[");
    for (s = 0; s < SUBJECT_COUNT; s++) {
        int max_mark;
        int min_mark;

        find_subject_extremes(db, s, &max_mark, &min_mark);
        buffer_printf(&b, "%s{\"name\":", s > 0 ? "," : "");
        buffer_json_string(&b, SUBJECT_NAMES[s]);
        buffer_printf(&b, ",\"highest\":");
        json_subject_holders(&b, db, s, max_mark);
        buffer_printf(&b, ",\"lowest\":");
        json_subject_holders(&b, db, s, min_mark);
        buffer_printf(&b, "}");
    }
    buffer_printf(&b, "]}");
    send_reply(&b);
}

static void cmd_frequency(const Records *db)
{
    int counts[SUBJECT_COUNT][BAND_COUNT];
    Buffer b;
    int s;
    int k;

    compute_band_counts(db, counts);
    buffer_init(&b);
    buffer_printf(&b, "{\"ok\":true,\"count\":%d,\"subjects\":[", db->count);
    for (s = 0; s < SUBJECT_COUNT; s++) {
        buffer_printf(&b, "%s{\"name\":", s > 0 ? "," : "");
        buffer_json_string(&b, SUBJECT_NAMES[s]);
        buffer_printf(&b, ",\"counts\":[");
        for (k = 0; k < BAND_COUNT; k++) {
            buffer_printf(&b, "%s%d", k > 0 ? "," : "", counts[s][k]);
        }
        buffer_printf(&b, "]}");
    }
    buffer_printf(&b, "]}");
    send_reply(&b);
}

static void cmd_summary(const Records *db)
{
    Buffer b;
    int pass_count;
    int fail_count;
    bool first = true;
    int i;
    int s;

    count_pass_fail(db, &pass_count, &fail_count);
    buffer_init(&b);
    buffer_printf(&b, "{\"ok\":true,\"count\":%d,\"passed\":%d,\"failed\":%d,\"passPercentage\":",
                  db->count, pass_count, fail_count);
    if (db->count > 0) {
        buffer_printf(&b, "%.2f", (double)pass_count * 100.0 / db->count);
    } else {
        buffer_printf(&b, "null");
    }
    buffer_printf(&b, ",\"averagePercentage\":");
    if (db->count > 0) {
        double sum = 0.0;

        for (i = 0; i < db->count; i++) {
            sum += calculate_percentage(calculate_total(db->marks[i]));
        }
        buffer_printf(&b, "%.2f", sum / db->count);
    } else {
        buffer_printf(&b, "null");
    }
    buffer_printf(&b, ",\"failedStudents\":[");
    for (i = 0; i < db->count; i++) {
        bool first_subject = true;

        if (is_pass(db->marks[i])) {
            continue;
        }
        buffer_printf(&b, "%s{\"id\":", first ? "" : ",");
        buffer_json_string(&b, db->students[i].id);
        buffer_printf(&b, ",\"name\":");
        buffer_json_string(&b, db->students[i].name);
        buffer_printf(&b, ",\"percentage\":%.2f,\"belowPass\":[",
                      calculate_percentage(calculate_total(db->marks[i])));
        for (s = 0; s < SUBJECT_COUNT; s++) {
            if (db->marks[i][s] < PASS_MARK) {
                buffer_printf(&b, "%s{\"subject\":", first_subject ? "" : ",");
                buffer_json_string(&b, SUBJECT_NAMES[s]);
                buffer_printf(&b, ",\"mark\":%d}", db->marks[i][s]);
                first_subject = false;
            }
        }
        buffer_printf(&b, "]}");
        first = false;
    }
    buffer_printf(&b, "]}");
    send_reply(&b);
}

/* Same ranking rule as the CLI: stable insertion sort of row indices by total, ties share a rank. */
static void cmd_ranking(const Records *db)
{
    Buffer b;
    int order[MAX_STUDENTS];
    int i;
    int rank = 0;
    int previous_total = -1;

    for (i = 0; i < db->count; i++) {
        order[i] = i;
    }
    for (i = 1; i < db->count; i++) {
        int key = order[i];
        int key_total = calculate_total(db->marks[key]);
        int j = i - 1;

        while (j >= 0 && calculate_total(db->marks[order[j]]) < key_total) {
            order[j + 1] = order[j];
            j--;
        }
        order[j + 1] = key;
    }

    buffer_init(&b);
    buffer_printf(&b, "{\"ok\":true,\"count\":%d,\"ranking\":[", db->count);
    for (i = 0; i < db->count; i++) {
        int total = calculate_total(db->marks[order[i]]);

        if (total != previous_total) {
            rank = i + 1;
            previous_total = total;
        }
        buffer_printf(&b, "%s{\"rank\":%d,\"student\":", i > 0 ? "," : "", rank);
        json_student(&b, db, order[i]);
        buffer_printf(&b, "}");
    }
    buffer_printf(&b, "]}");
    send_reply(&b);
}

/* SAVE / LOAD / EXPORT: run the library function and report its messages. */
static void cmd_file(Records *db, const char *verb, const char *path)
{
    char message[1024];
    int saved_fd;
    FILE *temp;
    int status;
    Buffer b;

    capture_begin(&saved_fd, &temp);
    if (strcmp(verb, "SAVE") == 0) {
        status = save_records(db, path);
    } else if (strcmp(verb, "LOAD") == 0) {
        status = load_records(db, path);
    } else {
        status = export_csv(db, path);
    }
    capture_end(saved_fd, temp, message, sizeof message);

    if (status != 0) {
        reply_error(NULL, "%s", message[0] != '\0' ? message : "The file operation failed.");
        return;
    }
    buffer_init(&b);
    buffer_printf(&b, "{\"ok\":true,\"count\":%d}", db->count);
    send_reply(&b);
}

/* ================================================================== */
/* Main loop                                                           */
/* ================================================================== */

int main(void)
{
    static Records db;
    char line[COMMAND_LINE_SIZE];

    init_records(&db);

    while (fgets(line, sizeof line, stdin) != NULL) {
        char *fields[MAX_FIELDS];
        int field_count = 0;
        char *p = line;
        size_t len = strlen(line);
        const char *cmd;

        if (len > 0 && line[len - 1] != '\n' && !feof(stdin)) {
            int c;                                /* over-long command: discard the rest */

            while ((c = getchar()) != '\n' && c != EOF) {
                /* skip */
            }
            reply_error(NULL, "Command too long.");
            continue;
        }
        while (len > 0 && (line[len - 1] == '\n' || line[len - 1] == '\r')) {
            line[--len] = '\0';
        }

        for (;;) {                                /* split at TABs */
            char *tab = strchr(p, '\t');

            if (field_count == MAX_FIELDS) {
                break;
            }
            fields[field_count++] = p;
            if (tab == NULL) {
                break;
            }
            *tab = '\0';
            p = tab + 1;
        }
        cmd = fields[0];

        if (strcmp(cmd, "INFO") == 0) {
            cmd_info();
        } else if (strcmp(cmd, "LIST") == 0) {
            cmd_list(&db);
        } else if (strcmp(cmd, "CLEAR") == 0) {
            Buffer b;

            init_records(&db);
            buffer_init(&b);
            buffer_printf(&b, "{\"ok\":true,\"count\":0}");
            send_reply(&b);
        } else if (strcmp(cmd, "ADD") == 0) {
            cmd_add(&db, fields, field_count);
        } else if (strcmp(cmd, "UPDATE") == 0) {
            cmd_update(&db, fields, field_count);
        } else if (strcmp(cmd, "SEARCH_ID") == 0 && field_count == 2) {
            cmd_search_id(&db, fields[1]);
        } else if (strcmp(cmd, "SEARCH_NAME") == 0 && field_count == 2) {
            cmd_search_name(&db, fields[1], true);
        } else if (strcmp(cmd, "SEARCH_PARTIAL") == 0 && field_count == 2) {
            cmd_search_name(&db, fields[1], false);
        } else if (strcmp(cmd, "MARKS") == 0) {
            cmd_marks(&db);
        } else if (strcmp(cmd, "EXTREMES") == 0) {
            cmd_extremes(&db);
        } else if (strcmp(cmd, "FREQUENCY") == 0) {
            cmd_frequency(&db);
        } else if (strcmp(cmd, "SUMMARY") == 0) {
            cmd_summary(&db);
        } else if (strcmp(cmd, "RANKING") == 0) {
            cmd_ranking(&db);
        } else if ((strcmp(cmd, "SAVE") == 0 || strcmp(cmd, "LOAD") == 0 ||
                    strcmp(cmd, "EXPORT") == 0) && field_count == 2) {
            cmd_file(&db, cmd, fields[1]);
        } else {
            reply_error(NULL, "Unknown or incomplete command.");
        }
    }
    return 0;
}

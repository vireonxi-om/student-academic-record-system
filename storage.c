/*
 * storage.c
 * Optional enhancement: save/load records to a text file and export a CSV
 * academic summary.
 *
 * Save file format (plain text, one record per line, fields separated by a
 * TAB character; names cannot contain control characters, so a TAB never
 * appears inside a field):
 *
 *   STUDENT-PBL-DATA v1 subjects=5 max_mark=100
 *   S001<TAB>Asha Rao<TAB>80<TAB>70<TAB>60<TAB>90<TAB>50
 *
 * Loading is all-or-nothing: the file is parsed into a temporary table and
 * every field is validated (ID rules, name rules, marks 0..MAX_MARK,
 * duplicate IDs, capacity). The records already in memory are replaced only
 * if the whole file is valid.
 */
#include <errno.h>
#include <stdio.h>
#include <string.h>

#include "student.h"

#define FILE_MAGIC     "STUDENT-PBL-DATA v1"
#define DEFAULT_SAVE   "students.dat"
#define DEFAULT_CSV    "students.csv"
#define FIELDS_PER_ROW (2 + SUBJECT_COUNT)

/* The exact first line of a valid save file for the current constants. */
static void make_header(char *buffer, size_t size)
{
    snprintf(buffer, size, "%s subjects=%d max_mark=%d", FILE_MAGIC,
             SUBJECT_COUNT, MAX_MARK);
}

/* Save every record to path. Returns 0 on success, -1 on failure. */
int save_records(const Records *db, const char *path)
{
    FILE *fp = fopen(path, "w");
    char header[96];
    int i;
    int s;

    if (fp == NULL) {
        printf("Error: cannot open \"%s\" for writing: %s\n", path, strerror(errno));
        return -1;
    }
    make_header(header, sizeof header);
    fprintf(fp, "%s\n", header);
    for (i = 0; i < db->count; i++) {
        fprintf(fp, "%s\t%s", db->students[i].id, db->students[i].name);
        for (s = 0; s < SUBJECT_COUNT; s++) {
            fprintf(fp, "\t%d", db->marks[i][s]);
        }
        fprintf(fp, "\n");
    }
    if (ferror(fp) || fclose(fp) != 0) {
        printf("Error: writing to \"%s\" failed.\n", path);
        return -1;
    }
    return 0;
}

/* Remove a trailing "\n" or "\r\n". */
static void strip_line_end(char *line)
{
    size_t len = strlen(line);

    while (len > 0 && (line[len - 1] == '\n' || line[len - 1] == '\r')) {
        line[--len] = '\0';
    }
}

/*
 * Validate one record line and append it to tmp. Prints the reason and
 * returns false if anything is wrong. The line is modified (split in place).
 */
static bool parse_record_line(char *line, int line_no, Records *tmp)
{
    char *fields[FIELDS_PER_ROW];
    int found = 0;
    char *p = line;
    Student fresh;
    int marks[SUBJECT_COUNT];
    int s;

    for (;;) {                                       /* split at every TAB */
        char *tab = strchr(p, '\t');

        if (found == FIELDS_PER_ROW) {
            printf("  Line %d: too many fields (expected %d).\n", line_no, FIELDS_PER_ROW);
            return false;
        }
        fields[found++] = p;
        if (tab == NULL) {
            break;
        }
        *tab = '\0';
        p = tab + 1;
    }
    if (found != FIELDS_PER_ROW) {
        printf("  Line %d: expected %d fields but found %d.\n", line_no,
               FIELDS_PER_ROW, found);
        return false;
    }
    if (!is_valid_id(fields[0])) {
        printf("  Line %d: invalid student ID.\n", line_no);
        return false;
    }
    if (!is_valid_name(fields[1])) {
        printf("  Line %d: invalid student name.\n", line_no);
        return false;
    }
    for (s = 0; s < SUBJECT_COUNT; s++) {
        if (parse_int_in_range(fields[2 + s], 0, MAX_MARK, &marks[s]) != PARSE_OK) {
            printf("  Line %d: marks for %s must be a whole number from 0 to %d.\n",
                   line_no, SUBJECT_NAMES[s], MAX_MARK);
            return false;
        }
    }
    if (find_student_by_id(tmp, fields[0]) != NOT_FOUND) {
        printf("  Line %d: duplicate student ID \"%s\".\n", line_no, fields[0]);
        return false;
    }
    if (tmp->count >= MAX_STUDENTS) {
        printf("  Line %d: the file holds more than %d students.\n", line_no, MAX_STUDENTS);
        return false;
    }

    snprintf(fresh.id, sizeof fresh.id, "%s", fields[0]);
    snprintf(fresh.name, sizeof fresh.name, "%s", fields[1]);
    tmp->students[tmp->count] = fresh;
    for (s = 0; s < SUBJECT_COUNT; s++) {
        tmp->marks[tmp->count][s] = marks[s];
    }
    tmp->count++;
    return true;
}

/*
 * Read every line of fp into tmp (a scratch table). Returns true only when
 * the header and every record are valid; otherwise prints the reason.
 */
static bool read_file_into(FILE *fp, Records *tmp)
{
    char header[96];
    char line[LINE_SIZE];
    int line_no = 0;
    bool header_seen = false;

    make_header(header, sizeof header);
    while (fgets(line, sizeof line, fp) != NULL) {
        line_no++;
        if (strchr(line, '\n') == NULL && !feof(fp)) {
            printf("  Line %d: line is too long.\n", line_no);
            return false;
        }
        strip_line_end(line);
        if (line[0] == '\0') {
            continue;                                /* ignore blank lines */
        }
        if (!header_seen) {
            if (strcmp(line, header) != 0) {
                printf("  Line %d: not a valid save file for this program\n"
                       "          (expected the header \"%s\").\n", line_no, header);
                return false;
            }
            header_seen = true;
        } else if (!parse_record_line(line, line_no, tmp)) {
            return false;
        }
    }
    if (ferror(fp)) {
        printf("  Reading the file failed.\n");
        return false;
    }
    if (!header_seen) {
        printf("  The file is empty or has no header line.\n");
        return false;
    }
    return true;
}

/*
 * Load records from path into db. Returns 0 on success; on any problem it
 * prints the reason, returns -1 and leaves db exactly as it was.
 */
int load_records(Records *db, const char *path)
{
    FILE *fp = fopen(path, "r");
    Records tmp;
    bool valid;

    if (fp == NULL) {
        printf("Error: cannot open \"%s\": %s\n", path, strerror(errno));
        return -1;
    }
    init_records(&tmp);
    valid = read_file_into(fp, &tmp);
    fclose(fp);

    if (!valid) {
        printf("Load cancelled. The records in memory were not changed.\n");
        return -1;
    }
    *db = tmp;                                       /* commit all at once */
    return 0;
}

/* Write one CSV field, quoting it when it contains a comma, a double quote
 * or a line break; embedded double quotes are doubled (RFC 4180). */
static void write_csv_field(FILE *fp, const char *text)
{
    bool quote = false;
    const char *p;

    for (p = text; *p != '\0'; p++) {
        if (*p == ',' || *p == '"' || *p == '\n' || *p == '\r') {
            quote = true;
        }
    }
    if (!quote) {
        fputs(text, fp);
        return;
    }
    fputc('"', fp);
    for (p = text; *p != '\0'; p++) {
        if (*p == '"') {
            fputc('"', fp);
        }
        fputc(*p, fp);
    }
    fputc('"', fp);
}

/* Export an academic summary (one row per student) as CSV. */
int export_csv(const Records *db, const char *path)
{
    FILE *fp = fopen(path, "w");
    int i;
    int s;

    if (fp == NULL) {
        printf("Error: cannot open \"%s\" for writing: %s\n", path, strerror(errno));
        return -1;
    }
    fputs("ID,Name", fp);
    for (s = 0; s < SUBJECT_COUNT; s++) {
        fputc(',', fp);
        write_csv_field(fp, SUBJECT_NAMES[s]);
    }
    fputs(",Total,Average,Percentage,Result\n", fp);

    for (i = 0; i < db->count; i++) {
        int total = calculate_total(db->marks[i]);

        write_csv_field(fp, db->students[i].id);
        fputc(',', fp);
        write_csv_field(fp, db->students[i].name);
        for (s = 0; s < SUBJECT_COUNT; s++) {
            fprintf(fp, ",%d", db->marks[i][s]);
        }
        fprintf(fp, ",%d,%.2f,%.2f,%s\n", total, calculate_average(total),
                calculate_percentage(total), is_pass(db->marks[i]) ? "Pass" : "Fail");
    }
    if (ferror(fp) || fclose(fp) != 0) {
        printf("Error: writing to \"%s\" failed.\n", path);
        return -1;
    }
    return 0;
}

/* Menu option 12: ask for a file name and save. */
InputStatus menu_save_records(const Records *db)
{
    char path[LINE_SIZE];

    print_heading("Save Records");
    if (read_text_or_default("File name [" DEFAULT_SAVE "]: ", DEFAULT_SAVE, path,
                             sizeof path) == INPUT_EOF) {
        printf("\nInput ended. Nothing was saved.\n");
        return INPUT_EOF;
    }
    if (save_records(db, path) == 0) {
        printf("Saved %d record(s) to \"%s\".\n", db->count, path);
    }
    return INPUT_OK;
}

/* Menu option 13: ask for a file name and load (after confirmation). */
InputStatus menu_load_records(Records *db)
{
    char path[LINE_SIZE];
    bool proceed = true;

    print_heading("Load Records");
    if (read_text_or_default("File name [" DEFAULT_SAVE "]: ", DEFAULT_SAVE, path,
                             sizeof path) == INPUT_EOF) {
        printf("\nInput ended. Nothing was loaded.\n");
        return INPUT_EOF;
    }
    if (db->count > 0) {
        printf("Loading replaces the %d record(s) currently in memory.\n", db->count);
        if (read_yes_no("Continue? (y/n): ", &proceed) == INPUT_EOF) {
            printf("\nInput ended. Nothing was loaded.\n");
            return INPUT_EOF;
        }
    }
    if (!proceed) {
        printf("Load cancelled. The records in memory were not changed.\n");
        return INPUT_OK;
    }
    if (load_records(db, path) == 0) {
        printf("Loaded %d record(s) from \"%s\".\n", db->count, path);
    }
    return INPUT_OK;
}

/* Menu option 14: ask for a file name and export the CSV summary. */
InputStatus menu_export_csv(const Records *db)
{
    char path[LINE_SIZE];

    if (!has_records(db)) {
        return INPUT_OK;
    }
    print_heading("Export CSV Summary");
    if (read_text_or_default("File name [" DEFAULT_CSV "]: ", DEFAULT_CSV, path,
                             sizeof path) == INPUT_EOF) {
        printf("\nInput ended. Nothing was exported.\n");
        return INPUT_EOF;
    }
    if (export_csv(db, path) == 0) {
        printf("Exported %d record(s) to \"%s\".\n", db->count, path);
    }
    return INPUT_OK;
}

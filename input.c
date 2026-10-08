/*
 * input.c
 * Validated, bounded input helpers.
 *
 * Every keyboard read in the program goes through this file, so all input
 * follows one policy:
 *   1. Read a whole line (never an unbounded string, never scanf).
 *   2. Detect lines that are too long for the buffer and discard the rest of
 *      the line so it cannot leak into the next prompt.
 *   3. Trim leading/trailing white space.
 *   4. Convert numbers with strtol and reject empty text, letters, trailing
 *      characters ("42abc"), overflow and out-of-range values.
 *   5. Re-ask with a useful message until the input is valid, or stop
 *      cleanly if the input ends (end-of-file).
 */
#include <ctype.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "student.h"

/* When true, every line read is echoed so piped test runs show the input
 * that was typed. Enabled by the --echo command-line option. */
static bool echo_input = false;

void set_echo_input(bool on)
{
    echo_input = on;
}

/* Remove leading and trailing white space (including '\r' from CRLF). */
static void trim_in_place(char *text)
{
    size_t len = strlen(text);
    size_t start = 0;

    while (len > 0 && isspace((unsigned char)text[len - 1])) {
        len--;
    }
    text[len] = '\0';

    while (text[start] != '\0' && isspace((unsigned char)text[start])) {
        start++;
    }
    if (start > 0) {
        memmove(text, text + start, len - start + 1);
    }
}

/*
 * Read one line from the keyboard into buffer (capacity size).
 * Returns INPUT_OK       - buffer holds the trimmed line,
 *         INPUT_TOO_LONG - the line was longer than the buffer; the rest of
 *                          it has been discarded and buffer holds its start,
 *         INPUT_EOF      - no more input.
 */
static InputStatus read_line(char *buffer, size_t size)
{
    size_t len;
    InputStatus status = INPUT_OK;

    fflush(stdout);                       /* show the prompt before waiting */
    if (fgets(buffer, (int)size, stdin) == NULL) {
        buffer[0] = '\0';
        return INPUT_EOF;                 /* end of input or read error */
    }

    len = strlen(buffer);
    if (len > 0 && buffer[len - 1] == '\n') {
        buffer[len - 1] = '\0';           /* complete line */
    } else if (!feof(stdin)) {
        int c;                            /* no newline and not at the end:   */
        status = INPUT_TOO_LONG;          /* the line was longer than buffer  */
        while ((c = getchar()) != '\n' && c != EOF) {
            /* discard the remainder of the over-long line */
        }
    }                                     /* else: last line without newline */

    trim_in_place(buffer);
    if (echo_input) {
        printf("%s\n", buffer);
    }
    return status;
}

/*
 * Convert text to an int in [min, max] without accepting partial matches.
 * errno is cleared first because strtol never clears it (see C library docs).
 */
ParseResult parse_int_in_range(const char *text, int min, int max, int *value)
{
    char *end;
    long parsed;

    if (text == NULL || text[0] == '\0' || isspace((unsigned char)text[0])) {
        return PARSE_NOT_NUMBER;
    }

    errno = 0;
    parsed = strtol(text, &end, 10);

    if (end == text || *end != '\0') {
        return PARSE_NOT_NUMBER;          /* nothing converted, or "42abc" */
    }
    if (errno == ERANGE || parsed < min || parsed > max) {
        return PARSE_OUT_OF_RANGE;        /* overflow or outside the range */
    }
    *value = (int)parsed;
    return PARSE_OK;
}

/* Ask until the user enters a whole number from min to max inclusive. */
InputStatus read_int_in_range(const char *prompt, int min, int max, int *value)
{
    char line[LINE_SIZE];

    for (;;) {
        InputStatus status;
        int parsed = 0;

        printf("%s", prompt);
        status = read_line(line, sizeof line);
        if (status == INPUT_EOF) {
            return INPUT_EOF;
        }
        if (status == INPUT_TOO_LONG) {
            printf("  Error: input is too long. Enter a whole number from %d to %d.\n",
                   min, max);
            continue;
        }
        if (line[0] == '\0') {
            printf("  Error: input cannot be blank. Enter a whole number from %d to %d.\n",
                   min, max);
            continue;
        }

        switch (parse_int_in_range(line, min, max, &parsed)) {
        case PARSE_OK:
            *value = parsed;
            return INPUT_OK;
        case PARSE_OUT_OF_RANGE:
            printf("  Error: %s is out of range. Enter a whole number from %d to %d.\n",
                   line, min, max);
            break;
        default:
            printf("  Error: \"%s\" is not a valid whole number. Enter a whole number from %d to %d.\n",
                   line, min, max);
            break;
        }
    }
}

/*
 * Ask until the user enters non-blank text that fits in out (capacity
 * out_size, including the terminating '\0'). Text may contain spaces.
 */
InputStatus read_nonempty_text(const char *prompt, char *out, size_t out_size)
{
    char line[LINE_SIZE];

    for (;;) {
        InputStatus status;
        size_t len;
        size_t i;
        bool has_control = false;

        printf("%s", prompt);
        status = read_line(line, sizeof line);
        if (status == INPUT_EOF) {
            return INPUT_EOF;
        }
        if (status == INPUT_TOO_LONG) {
            printf("  Error: input is too long (maximum %lu characters).\n",
                   (unsigned long)(out_size - 1));
            continue;
        }

        len = strlen(line);
        if (len == 0) {
            printf("  Error: input cannot be blank.\n");
            continue;
        }
        if (len >= out_size) {
            printf("  Error: input is too long (maximum %lu characters, you typed %lu).\n",
                   (unsigned long)(out_size - 1), (unsigned long)len);
            continue;
        }
        for (i = 0; i < len; i++) {
            if (iscntrl((unsigned char)line[i])) {
                has_control = true;
            }
        }
        if (has_control) {
            printf("  Error: input contains control characters.\n");
            continue;
        }

        memcpy(out, line, len + 1);
        return INPUT_OK;
    }
}

/* Like read_nonempty_text, but a blank line selects the fallback text. */
InputStatus read_text_or_default(const char *prompt, const char *fallback,
                                 char *out, size_t out_size)
{
    char line[LINE_SIZE];

    for (;;) {
        InputStatus status;

        printf("%s", prompt);
        status = read_line(line, sizeof line);
        if (status == INPUT_EOF) {
            return INPUT_EOF;
        }
        if (status == INPUT_TOO_LONG || strlen(line) >= out_size) {
            printf("  Error: input is too long (maximum %lu characters).\n",
                   (unsigned long)(out_size - 1));
            continue;
        }
        if (line[0] == '\0') {
            snprintf(out, out_size, "%s", fallback);
        } else {
            memcpy(out, line, strlen(line) + 1);
        }
        return INPUT_OK;
    }
}

/* Ask a yes/no question. Accepts y, yes, n, no in any letter case. */
InputStatus read_yes_no(const char *prompt, bool *answer)
{
    char line[LINE_SIZE];

    for (;;) {
        InputStatus status;
        size_t i;

        printf("%s", prompt);
        status = read_line(line, sizeof line);
        if (status == INPUT_EOF) {
            return INPUT_EOF;
        }
        for (i = 0; line[i] != '\0'; i++) {
            line[i] = (char)tolower((unsigned char)line[i]);
        }
        if (status == INPUT_OK && (strcmp(line, "y") == 0 || strcmp(line, "yes") == 0)) {
            *answer = true;
            return INPUT_OK;
        }
        if (status == INPUT_OK && (strcmp(line, "n") == 0 || strcmp(line, "no") == 0)) {
            *answer = false;
            return INPUT_OK;
        }
        printf("  Error: please answer y or n.\n");
    }
}

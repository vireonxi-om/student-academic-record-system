/*
 * main.c
 * Student Academic Record and Performance Management System using C
 * GM University - C Programming with Practice (UE26CS1103)
 *
 * Menu-driven program. Options 1-8 are the required features; options 9-14
 * are optional enhancements (update marks, ranking, partial name search,
 * save/load and CSV export).
 *
 * Command-line options:
 *   --echo   echo every line read, so piped input shows up in the output
 *            (used by the automated tests to produce readable transcripts)
 *   --help   print usage and exit
 *
 * Program flow:
 *   initialise empty records -> repeat { show menu, read a valid choice,
 *   run the chosen operation } until Exit is chosen or the input ends.
 */
#include <stdio.h>
#include <string.h>

#include "student.h"

#define MENU_MAX 14   /* highest menu number */

static void print_banner(void)
{
    printf("==============================================================\n");
    printf("  Student Academic Record and Performance Management System\n");
    printf("  GM University | C Programming with Practice (UE26CS1103)\n");
    printf("==============================================================\n");
}

static void print_menu(const Records *db)
{
    printf("\n------------------------- MAIN MENU --------------------------\n");
    printf("  Records stored: %d / %d\n", db->count, MAX_STUDENTS);
    printf("   1. Add student\n");
    printf("   2. Display all student records\n");
    printf("   3. Search by identifier\n");
    printf("   4. Search by name\n");
    printf("   5. Display subject-wise marks table\n");
    printf("   6. Display highest and lowest performance\n");
    printf("   7. Display frequency analysis\n");
    printf("   8. Display pass/fail summary\n");
    printf("  --- Optional enhancements ---\n");
    printf("   9. Update a student's marks\n");
    printf("  10. Display ranking (by total marks)\n");
    printf("  11. Search by partial name (not case-sensitive)\n");
    printf("  12. Save records to a file\n");
    printf("  13. Load records from a file\n");
    printf("  14. Export academic summary to CSV\n");
    printf("   0. Exit\n");
    printf("--------------------------------------------------------------\n");
}

static void print_usage(const char *program)
{
    printf("Usage: %s [--echo] [--help]\n", program);
    printf("  --echo  echo each input line (useful when input is piped from a file)\n");
    printf("  --help  show this message\n");
}

int main(int argc, char *argv[])
{
    Records db;
    int i;

    for (i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--echo") == 0) {
            set_echo_input(true);
        } else if (strcmp(argv[i], "--help") == 0 || strcmp(argv[i], "-h") == 0) {
            print_usage(argv[0]);
            return 0;
        } else {
            fprintf(stderr, "Unknown option: %s\n", argv[i]);
            print_usage(argv[0]);
            return 2;
        }
    }

    init_records(&db);
    print_banner();

    for (;;) {
        int choice = 0;
        InputStatus status = INPUT_OK;

        print_menu(&db);
        if (read_int_in_range("Enter your choice (0-14): ", 0, MENU_MAX, &choice) == INPUT_EOF) {
            printf("\nInput ended. Exiting the program.\n");
            return 0;
        }

        switch (choice) {
        case 1:  status = add_student(&db);             break;
        case 2:  display_all_students(&db);             break;
        case 3:  status = search_by_id(&db);            break;
        case 4:  status = search_by_name(&db);          break;
        case 5:  display_marks_table(&db);              break;
        case 6:  show_extremes(&db);                    break;
        case 7:  show_frequency(&db);                   break;
        case 8:  show_result_summary(&db);              break;
        case 9:  status = update_marks(&db);            break;
        case 10: show_ranking(&db);                     break;
        case 11: status = search_by_partial_name(&db);  break;
        case 12: status = menu_save_records(&db);       break;
        case 13: status = menu_load_records(&db);       break;
        case 14: status = menu_export_csv(&db);         break;
        case 0:
            printf("\nThank you for using the system. Records held in memory are lost on exit\n"
                   "unless you saved them (option 12). Goodbye.\n");
            return 0;
        default:
            printf("Unsupported choice.\n");            /* not reachable: range checked */
            break;
        }

        if (status == INPUT_EOF) {                      /* input ended mid-operation */
            printf("Exiting the program.\n");
            return 0;
        }
    }
}

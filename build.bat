@echo off
rem Build script for Windows with GCC (MinGW) on the PATH.
rem Compiles every source file of the project into student_pbl.exe.
gcc -std=c11 -Wall -Wextra -Wpedantic main.c student.c analysis.c input.c storage.c -o student_pbl.exe
if errorlevel 1 (
    echo Build failed.
    exit /b 1
)
echo Build succeeded. Run student_pbl.exe

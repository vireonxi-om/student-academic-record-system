#!/bin/sh
cd "$(dirname "$0")" || exit 1
if [ "$(uname -s)" != Darwin ]; then
    echo 'This launcher is for macOS.'
    exit 1
fi
if ! xcrun --find clang >/dev/null 2>&1; then
    echo 'Install Apple Command Line Tools, then run this launcher again.'
    xcode-select --install
    exit 1
fi
make -B CC=clang all || exit 1
./student_pbl
printf '\nPress Return to close this window.'
read -r answer

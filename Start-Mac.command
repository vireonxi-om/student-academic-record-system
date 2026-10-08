#!/bin/sh
# Double-click in Finder, or run: sh Start-Mac.command
cd "$(dirname "$0")" || exit 1
finish() {
    result=$?
    if [ "$result" -ne 0 ]; then
        printf '\nPress Return to close this window.'
        read -r answer
    fi
}
trap finish EXIT
if [ "$(uname -s)" != Darwin ]; then
    echo 'This launcher is for macOS. On Linux, run: sh gui/start.sh'
    exit 1
fi
if ! xcrun --find clang >/dev/null 2>&1 || ! command -v make >/dev/null 2>&1; then
    echo 'Install Apple Command Line Tools in the window that opens.'
    echo 'When installation finishes, run this launcher again.'
    xcode-select --install
    exit 1
fi
if ! command -v node >/dev/null 2>&1; then
    echo 'Install the LTS version of Node.js with the macOS installer.'
    echo 'Then close this Terminal window and run this launcher again.'
    open 'https://nodejs.org/en/download'
    exit 1
fi
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)'; then
    echo 'Node.js 18 or newer is required. Install the current LTS version.'
    open 'https://nodejs.org/en/download'
    exit 1
fi
# Force a native build even if the downloaded Linux executable has newer timestamps.
make -B CC=clang all gui || exit 1
sh gui/start.sh

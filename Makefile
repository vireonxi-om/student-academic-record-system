# Makefile for the Student Academic Record and Performance Management System
# GM University - C Programming with Practice (UE26CS1103)
#
#   make            build ./student_pbl
#   make unit       build and run the C unit tests
#   make test       run the unit tests and the scripted integration tests
#   make sample     replay tests/demo-session.in into tests/sample-output.txt
#   make evidence   regenerate tests/test-cases.md, tests/transcripts/ and
#                   tests/sample-output.txt from a fresh run of every test
#   make sanitize   rebuild with AddressSanitizer + UndefinedBehaviorSanitizer
#                   and run all tests under them
#   make gui        build the optional web-GUI bridge (gui/student_bridge)
#   make gui-run    build it and start the web GUI at http://127.0.0.1:8765
#   make gui-test   run the GUI back-end tests (needs Node.js 18 or newer)
#   make gui-e2e    drive the real GUI in headless Chrome/Chromium (skips if none is installed)
#   make clean      remove build products and test scratch files

.DEFAULT_GOAL := all

CC      ?= gcc
CFLAGS  ?= -std=c11 -Wall -Wextra -Wpedantic -O2
SRC     := main.c student.c analysis.c input.c storage.c
LIBSRC  := student.c analysis.c input.c storage.c

.PHONY: all unit test sanitize sample evidence clean gui gui-test gui-e2e gui-run FORCE

# A program built on another platform (for example Linux) cannot run here. Every build depends on
# a small stamp file that is rewritten only when the platform (uname -sm) changes, which forces a
# fresh native build after the folder is copied to another computer.
PLATFORM := $(shell uname -sm)
.platform: FORCE
	@[ "$$(cat .platform 2>/dev/null)" = "$(PLATFORM)" ] || echo "$(PLATFORM)" > .platform
FORCE:

all: student_pbl

student_pbl: $(SRC) student.h .platform
	$(CC) $(CFLAGS) $(SRC) -o $@

unit_tests: tests/unit_tests.c $(LIBSRC) student.h .platform
	$(CC) $(CFLAGS) -I. tests/unit_tests.c $(LIBSRC) -o $@

unit: unit_tests
	./unit_tests

test: student_pbl unit
	sh tests/run_tests.sh

sample: student_pbl
	mkdir -p tests/work && cd tests/work && ../../student_pbl --echo < ../demo-session.in > ../sample-output.txt

evidence: student_pbl
	sh tests/run_tests.sh --markdown tests/test-cases.md --transcripts tests/transcripts
	$(MAKE) sample

gui/student_bridge: gui/bridge.c $(LIBSRC) student.h .platform
	$(CC) $(CFLAGS) -I. gui/bridge.c $(LIBSRC) -o $@

gui: gui/student_bridge

gui-run: gui
	node gui/server.js

gui-test: gui
	node --test gui/test/api.test.js

gui-e2e: gui
	node gui/test/e2e/e2e.js

sanitize:
	$(MAKE) clean
	$(MAKE) CFLAGS="-std=c11 -Wall -Wextra -Wpedantic -g -O1 -fsanitize=address,undefined -fno-omit-frame-pointer" test

clean:
	rm -f student_pbl unit_tests unit_input.tmp gui/student_bridge .platform
	rm -rf tests/work

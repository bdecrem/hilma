cmake_minimum_required(VERSION 3.5)
project(Sudoku C)

# Retro68 provides add_application() via its toolchain file.
add_application(Sudoku
    sudoku.c
)

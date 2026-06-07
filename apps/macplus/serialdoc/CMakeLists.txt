cmake_minimum_required(VERSION 3.5)
project(SerialDoc C)

# Retro68 provides add_application() via its toolchain file.
add_application(SerialDoc
    serialdoc.c
)

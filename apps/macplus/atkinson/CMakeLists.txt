cmake_minimum_required(VERSION 3.5)
project(Atkinson C)

# Retro68 provides add_application() via its toolchain file.
add_application(Atkinson
    atkinson.c
    atkinson.r
)

# Offline test build for Mini vMac (no serial): enable with -DATK_TEST=ON or
# `./build.sh test`. New Image develops the embedded test image; do NOT ship.
option(ATK_TEST "Offline Mini vMac test build (no serial)" OFF)
if(ATK_TEST)
    target_compile_definitions(Atkinson PRIVATE ATK_TEST)
endif()

set_target_properties(Atkinson PROPERTIES COMPILE_OPTIONS -ffunction-sections)
if(CMAKE_SYSTEM_NAME MATCHES Retro68)
    set_target_properties(Atkinson PROPERTIES
        LINK_FLAGS "-Wl,-gc-sections -Wl,--mac-strip-macsbug")
else()
    set_target_properties(Atkinson PROPERTIES LINK_FLAGS "-Wl,-gc-sections")
endif()

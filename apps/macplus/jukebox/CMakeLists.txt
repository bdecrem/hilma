cmake_minimum_required(VERSION 3.5)
project(Jukebox C)

# Retro68 provides add_application() via its toolchain file.
add_application(Jukebox
    jukebox.c
    jukebox.r
)

# Offline test build for Mini vMac (no serial): enable with -DJUKE_TEST=ON or
# `./build.sh test`. Commands load the embedded test page; do NOT ship.
option(JUKE_TEST "Offline Mini vMac test build (no serial)" OFF)
if(JUKE_TEST)
    target_compile_definitions(Jukebox PRIVATE JUKE_TEST)
endif()

set_target_properties(Jukebox PROPERTIES COMPILE_OPTIONS -ffunction-sections)
if(CMAKE_SYSTEM_NAME MATCHES Retro68)
    set_target_properties(Jukebox PROPERTIES
        LINK_FLAGS "-Wl,-gc-sections -Wl,--mac-strip-macsbug")
else()
    set_target_properties(Jukebox PROPERTIES LINK_FLAGS "-Wl,-gc-sections")
endif()

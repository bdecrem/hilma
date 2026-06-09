cmake_minimum_required(VERSION 3.5)
project(Surf C)

# Retro68 provides add_application() via its toolchain file.
add_application(Surf
    surf.c
    surf.r
)

# Offline test build for Mini vMac (no serial): enable with -DSURF_TEST=ON or
# `./build.sh test`. Commands load the embedded test page; do NOT ship.
option(SURF_TEST "Offline Mini vMac test build (no serial)" OFF)
if(SURF_TEST)
    target_compile_definitions(Surf PRIVATE SURF_TEST)
endif()

set_target_properties(Surf PROPERTIES COMPILE_OPTIONS -ffunction-sections)
if(CMAKE_SYSTEM_NAME MATCHES Retro68)
    set_target_properties(Surf PROPERTIES
        LINK_FLAGS "-Wl,-gc-sections -Wl,--mac-strip-macsbug")
else()
    set_target_properties(Surf PROPERTIES LINK_FLAGS "-Wl,-gc-sections")
endif()

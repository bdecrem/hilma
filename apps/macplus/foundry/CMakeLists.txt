cmake_minimum_required(VERSION 3.5)
project(Foundry C)

# Retro68 provides add_application() via its toolchain file.
add_application(Foundry
    foundry.c
    foundry.r
)

# Offline test build for Mini vMac (no serial): enable with -DFOUNDRY_TEST=ON or
# `./build.sh test`. Commands load the embedded test page; do NOT ship.
option(FOUNDRY_TEST "Offline Mini vMac test build (no serial)" OFF)
if(FOUNDRY_TEST)
    target_compile_definitions(Foundry PRIVATE FOUNDRY_TEST)
endif()

set_target_properties(Foundry PROPERTIES COMPILE_OPTIONS -ffunction-sections)
if(CMAKE_SYSTEM_NAME MATCHES Retro68)
    set_target_properties(Foundry PROPERTIES
        LINK_FLAGS "-Wl,-gc-sections -Wl,--mac-strip-macsbug")
else()
    set_target_properties(Foundry PROPERTIES LINK_FLAGS "-Wl,-gc-sections")
endif()

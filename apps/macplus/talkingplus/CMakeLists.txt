cmake_minimum_required(VERSION 3.5)
project(TalkingPlus C)

# Retro68 provides add_application() via its toolchain file.
add_application(TalkingPlus
    talkingplus.c
    talkingplus.r
)

# Offline test build for Mini vMac (no serial): enable with -DTKM_TEST=ON or
# `./build.sh test`. Commands load the embedded test page; do NOT ship.
option(TKM_TEST "Offline Mini vMac test build (no serial)" OFF)
if(TKM_TEST)
    target_compile_definitions(TalkingPlus PRIVATE TKM_TEST)
endif()

set_target_properties(TalkingPlus PROPERTIES COMPILE_OPTIONS -ffunction-sections)
if(CMAKE_SYSTEM_NAME MATCHES Retro68)
    set_target_properties(TalkingPlus PROPERTIES
        LINK_FLAGS "-Wl,-gc-sections -Wl,--mac-strip-macsbug")
else()
    set_target_properties(TalkingPlus PROPERTIES LINK_FLAGS "-Wl,-gc-sections")
endif()

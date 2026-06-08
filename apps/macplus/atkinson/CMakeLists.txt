cmake_minimum_required(VERSION 3.5)
project(Atkinson C)

# Retro68 provides add_application() via its toolchain file.
add_application(Atkinson
    atkinson.c
)

set_target_properties(Atkinson PROPERTIES COMPILE_OPTIONS -ffunction-sections)
if(CMAKE_SYSTEM_NAME MATCHES Retro68)
    set_target_properties(Atkinson PROPERTIES
        LINK_FLAGS "-Wl,-gc-sections -Wl,--mac-strip-macsbug")
else()
    set_target_properties(Atkinson PROPERTIES LINK_FLAGS "-Wl,-gc-sections")
endif()

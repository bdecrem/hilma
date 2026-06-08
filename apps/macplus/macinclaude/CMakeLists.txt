cmake_minimum_required(VERSION 3.5)
project(Macinclaude C)

# Retro68 provides add_application() via its toolchain file.
add_application(Macinclaude
    macinclaude.c
    macinclaude.r
)

# Keep the app small: drop unused code and macsbug names.
set_target_properties(Macinclaude PROPERTIES COMPILE_OPTIONS -ffunction-sections)
if(CMAKE_SYSTEM_NAME MATCHES Retro68)
    set_target_properties(Macinclaude PROPERTIES
        LINK_FLAGS "-Wl,-gc-sections -Wl,--mac-strip-macsbug")
else()
    set_target_properties(Macinclaude PROPERTIES LINK_FLAGS "-Wl,-gc-sections")
endif()

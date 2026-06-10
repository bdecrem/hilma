cmake_minimum_required(VERSION 3.5)
project(MacinclaudeIMessage C)

# Retro68 provides add_application() via its toolchain file.
add_application(IMessage
    imessage.c
    imessage.r
)

# The MUX transport (.WIFI seam) is shared verbatim from ../wifi:
#   mux_rx.inc (parser) + muxclient.inc (sender). im_rx.inc is local.
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/../wifi)

# Offline test build for Mini vMac (no serial): enable with -DIM_TEST=ON or
# `./build.sh test`. Starts "connected" and renders the embedded sample thread.
option(IM_TEST "Offline Mini vMac test build (no serial)" OFF)
if(IM_TEST)
    target_compile_definitions(IMessage PRIVATE IM_TEST)
endif()

set_target_properties(IMessage PROPERTIES COMPILE_OPTIONS -ffunction-sections)
if(CMAKE_SYSTEM_NAME MATCHES Retro68)
    set_target_properties(IMessage PROPERTIES
        LINK_FLAGS "-Wl,-gc-sections -Wl,--mac-strip-macsbug")
else()
    set_target_properties(IMessage PROPERTIES LINK_FLAGS "-Wl,-gc-sections")
endif()

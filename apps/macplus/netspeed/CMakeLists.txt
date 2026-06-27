cmake_minimum_required(VERSION 3.5)
project(NetSpeed C)

# Retro68 provides add_application() via its toolchain file.
# The TCP transport lives in ../net (shared with the other WiFi-era apps).
add_application(NetSpeed
    netspeed.c
    ${CMAKE_CURRENT_SOURCE_DIR}/../net/nettcp.c
)

target_include_directories(NetSpeed PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../net)
